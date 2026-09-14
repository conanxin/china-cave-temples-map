#!/usr/bin/env python3
"""Resumable UNESCO PDF fetch + deterministic page discovery/extraction.

Designed for the 40.6 MB UNESCO Document 132728 atlas, but generic enough for
other official PDFs. Download and extraction never infer map geometry.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import urllib.request
from pathlib import Path
from typing import Iterable

import fitz  # PyMuPDF
from PIL import Image, ImageDraw
from pypdf import PdfReader, PdfWriter


def sha256_file(path: str | Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with open(path, 'rb') as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def download_file(
    url: str,
    output: str | Path,
    *,
    expected_size: int | None = None,
    timeout: float = 30.0,
    user_agent: str = 'china-cave-temples-map/0.13',
) -> dict:
    """Download with a .part file and HTTP Range resume when supported."""
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    part = output.with_suffix(output.suffix + '.part')
    existing = part.stat().st_size if part.exists() else 0

    headers = {'User-Agent': user_agent}
    if existing:
        headers['Range'] = f'bytes={existing}-'
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        status = getattr(response, 'status', response.getcode())
        content_type = (response.headers.get('Content-Type') or '').lower()
        resumed = bool(existing and status == 206)
        if existing and not resumed:
            existing = 0
            mode = 'wb'
        else:
            mode = 'ab' if resumed else 'wb'
        with open(part, mode) as out:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)

    final_size = part.stat().st_size
    if expected_size is not None and final_size != expected_size:
        raise ValueError(f'download size mismatch: expected {expected_size}, got {final_size}')
    # UNESCO endpoint is a PDF; allow generic octet-stream but reject obvious HTML.
    if content_type.startswith('text/html'):
        raise ValueError(f'unexpected content type: {content_type}')
    os.replace(part, output)
    return {
        'url': url,
        'path': str(output),
        'bytes': output.stat().st_size,
        'sha256': sha256_file(output),
        'resumed': resumed,
        'contentType': content_type,
    }





def load_extraction_target(manifest_path: str | Path, target_id: str) -> dict:
    manifest = json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    target = next((item for item in manifest.get('targets', []) if item.get('id') == target_id), None)
    if target is None:
        raise ValueError(f'target not found in manifest: {target_id}')
    start = int(target['startPage'])
    end = int(target['endPage'])
    if start < 1 or end < start:
        raise ValueError(f'invalid page window for {target_id}: {start}-{end}')
    return {
        **target,
        'remoteUrl': manifest['remoteUrl'],
        'expectedSizeBytes': manifest.get('expectedSizeBytes'),
        'pages': list(range(start, end + 1)),
    }

def parse_page_spec(spec: str) -> list[int]:
    """Parse comma-separated page numbers and inclusive ranges, e.g. 3,7-9."""
    pages: set[int] = set()
    for raw in spec.split(','):
        token = raw.strip()
        if not token:
            continue
        if '-' in token:
            left, right = token.split('-', 1)
            start = int(left)
            end = int(right)
            if start < 1 or end < 1:
                raise ValueError('page numbers must be >= 1')
            if end < start:
                raise ValueError(f'descending page range: {token}')
            pages.update(range(start, end + 1))
        else:
            value = int(token)
            if value < 1:
                raise ValueError('page numbers must be >= 1')
            pages.add(value)
    if not pages:
        raise ValueError('page specification is empty')
    return sorted(pages)

def probe_remote_pdf(
    url: str,
    *,
    timeout: float = 30.0,
    user_agent: str = 'china-cave-temples-map/0.14',
) -> dict:
    """Probe a remote PDF without downloading the full object.

    Uses HEAD for metadata and a 1 KiB Range request to verify byte-range
    behavior and inspect the PDF header for the Linearized hint.
    """
    headers = {'User-Agent': user_agent}
    content_length: int | None = None
    content_type = ''
    accept_ranges = False
    head_error: str | None = None
    try:
        request = urllib.request.Request(url, headers=headers, method='HEAD')
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw_length = response.headers.get('Content-Length')
            if raw_length:
                content_length = int(raw_length)
            content_type = (response.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
            accept_ranges = 'bytes' in (response.headers.get('Accept-Ranges') or '').lower()
    except Exception as exc:  # some servers reject HEAD but accept Range GET
        head_error = f'{type(exc).__name__}: {exc}'

    range_headers = {**headers, 'Range': 'bytes=0-1023'}
    request = urllib.request.Request(url, headers=range_headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        status = getattr(response, 'status', response.getcode())
        sample = response.read(1024)
        range_type = (response.headers.get('Content-Type') or '').split(';', 1)[0].strip().lower()
        if range_type:
            content_type = range_type
        content_range = response.headers.get('Content-Range') or ''
        if status == 206 and content_range:
            accept_ranges = True
            match = re.search(r'/([0-9]+)$', content_range)
            if match:
                content_length = int(match.group(1))
        elif content_length is None:
            raw_length = response.headers.get('Content-Length')
            if raw_length:
                content_length = int(raw_length)

    if content_length is None:
        raise ValueError('remote PDF size could not be determined')
    if sample.startswith(b'<') or content_type.startswith('text/html'):
        raise ValueError(f'remote object is not a PDF: content-type={content_type!r}')
    return {
        'url': url,
        'bytes': content_length,
        'contentType': content_type,
        'acceptRanges': accept_ranges,
        'linearized': b'/Linearized' in sample,
        'headError': head_error,
    }


class HTTPRangeReader(io.RawIOBase):
    """Seekable read-only file object backed by cached HTTP Range requests."""

    def __init__(
        self,
        url: str,
        size: int,
        *,
        block_size: int = 1024 * 1024,
        timeout: float = 30.0,
        user_agent: str = 'china-cave-temples-map/0.14',
        max_fetch_bytes: int = 256 * 1024 * 1024,
    ) -> None:
        super().__init__()
        if size <= 0:
            raise ValueError('size must be positive')
        if block_size <= 0:
            raise ValueError('block_size must be positive')
        self.url = url
        self.size = size
        self.block_size = block_size
        self.timeout = timeout
        self.user_agent = user_agent
        self.max_fetch_bytes = max_fetch_bytes
        self.position = 0
        self.cache: dict[int, bytes] = {}
        self.bytes_fetched = 0
        self.request_count = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def writable(self) -> bool:
        return False

    def tell(self) -> int:
        return self.position

    def seek(self, offset: int, whence: int = io.SEEK_SET) -> int:
        if whence == io.SEEK_SET:
            new_position = offset
        elif whence == io.SEEK_CUR:
            new_position = self.position + offset
        elif whence == io.SEEK_END:
            new_position = self.size + offset
        else:
            raise ValueError(f'unsupported whence: {whence}')
        if new_position < 0:
            raise ValueError('negative seek position')
        self.position = min(new_position, self.size)
        return self.position

    def _fetch_block(self, block_index: int) -> bytes:
        cached = self.cache.get(block_index)
        if cached is not None:
            return cached
        start = block_index * self.block_size
        if start >= self.size:
            return b''
        end = min(start + self.block_size, self.size) - 1
        headers = {
            'User-Agent': self.user_agent,
            'Range': f'bytes={start}-{end}',
        }
        request = urllib.request.Request(self.url, headers=headers)
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            status = getattr(response, 'status', response.getcode())
            if status != 206:
                raise ValueError(f'remote server ignored Range request {start}-{end}: HTTP {status}')
            content_range = response.headers.get('Content-Range') or ''
            if not content_range.startswith(f'bytes {start}-'):
                raise ValueError(f'unexpected Content-Range: {content_range!r}')
            data = response.read()
        expected = end - start + 1
        if len(data) != expected:
            raise ValueError(f'Range response size mismatch for {start}-{end}: got {len(data)}')
        if self.bytes_fetched + len(data) > self.max_fetch_bytes:
            raise ValueError(
                f'remote range fetch budget exceeded: next={len(data)} bytes, '
                f'fetched={self.bytes_fetched}, budget={self.max_fetch_bytes}'
            )
        self.bytes_fetched += len(data)
        self.request_count += 1
        self.cache[block_index] = data
        return data

    def read(self, size: int = -1) -> bytes:
        if self.position >= self.size:
            return b''
        if size is None or size < 0:
            size = self.size - self.position
        if size == 0:
            return b''
        end_position = min(self.position + size, self.size)
        chunks: list[bytes] = []
        while self.position < end_position:
            block_index = self.position // self.block_size
            block = self._fetch_block(block_index)
            block_start = block_index * self.block_size
            offset = self.position - block_start
            take = min(end_position - self.position, len(block) - offset)
            if take <= 0:
                break
            chunks.append(block[offset:offset + take])
            self.position += take
        return b''.join(chunks)

    def readinto(self, buffer) -> int:
        data = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)


def extract_remote_pages(
    url: str,
    page_numbers: Iterable[int],
    output_dir: str | Path,
    *,
    expected_size: int | None = None,
    timeout: float = 30.0,
    block_size: int = 1024 * 1024,
    max_fetch_bytes: int = 256 * 1024 * 1024,
    render_png: bool = True,
    dpi: int = 180,
) -> dict:
    """Extract selected pages from a remote range-capable PDF without full download."""
    probe = probe_remote_pdf(url, timeout=timeout)
    if expected_size is not None and probe['bytes'] != expected_size:
        raise ValueError(f'remote size mismatch: expected {expected_size}, got {probe["bytes"]}')
    if not probe['acceptRanges']:
        raise ValueError('remote server does not advertise or honor HTTP byte ranges')

    reader = HTTPRangeReader(
        url, probe['bytes'], block_size=block_size, timeout=timeout, max_fetch_bytes=max_fetch_bytes
    )
    pdf = PdfReader(reader, strict=False)
    page_count = len(pdf.pages)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[dict] = []
    for page_no in sorted(set(int(value) for value in page_numbers)):
        if page_no < 1 or page_no > page_count:
            raise ValueError(f'page {page_no} outside 1..{page_count}')
        page_pdf = output_dir / f'page-{page_no:04d}.pdf'
        writer = PdfWriter()
        writer.add_page(pdf.pages[page_no - 1])
        with open(page_pdf, 'wb') as fh:
            writer.write(fh)
        item = {
            'page': page_no,
            'pdf': str(page_pdf),
            'pdfSha256': sha256_file(page_pdf),
        }
        if render_png:
            with fitz.open(page_pdf) as one:
                pix = one[0].get_pixmap(dpi=dpi, alpha=False)
                png = page_pdf.with_suffix('.png')
                pix.save(png)
            item['png'] = str(png)
            item['pngSha256'] = sha256_file(png)
        outputs.append(item)

    return {
        'url': url,
        'pageCount': page_count,
        'pages': outputs,
        'remote': {
            **probe,
            'requestCount': reader.request_count,
            'bytesFetched': reader.bytes_fetched,
            'fetchedFraction': reader.bytes_fetched / probe['bytes'],
            'blockSize': block_size,
            'maxFetchBytes': max_fetch_bytes,
        },
    }

def inspect_pdf(path: str | Path) -> dict:
    path = Path(path)
    with fitz.open(path) as doc:
        pages = doc.page_count
        metadata = dict(doc.metadata or {})
    return {
        'path': str(path),
        'bytes': path.stat().st_size,
        'sha256': sha256_file(path),
        'pages': pages,
        'metadata': metadata,
    }


def _norm(text: str) -> str:
    return re.sub(r'\s+', ' ', text).strip().casefold()


def locate_pages(path: str | Path, targets: dict[str, list[str]]) -> dict[str, dict]:
    """Locate 1-based pages where every target has at least one phrase match.

    A page is included when *any* supplied phrase for a target occurs. The matched
    phrases are retained so a human can judge whether the hit is a map title,
    legend, index entry, or unrelated text.
    """
    result = {key: {'pages': [], 'matches': {}} for key in targets}
    with fitz.open(path) as doc:
        for index, page in enumerate(doc):
            text = _norm(page.get_text('text'))
            if not text:
                continue
            page_no = index + 1
            for key, phrases in targets.items():
                matched = [phrase for phrase in phrases if _norm(phrase) in text]
                if matched:
                    result[key]['pages'].append(page_no)
                    result[key]['matches'][str(page_no)] = matched
    return result


def extract_pages(
    path: str | Path,
    page_numbers: Iterable[int],
    output_dir: str | Path,
    *,
    render_png: bool = True,
    dpi: int = 180,
) -> list[dict]:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[dict] = []
    unique_pages = sorted(set(int(p) for p in page_numbers))
    with fitz.open(path) as source:
        for page_no in unique_pages:
            if page_no < 1 or page_no > source.page_count:
                raise ValueError(f'page {page_no} outside 1..{source.page_count}')
            base = output_dir / f'page-{page_no:04d}'
            page_pdf = base.with_suffix('.pdf')
            one = fitz.open()
            one.insert_pdf(source, from_page=page_no - 1, to_page=page_no - 1)
            one.save(page_pdf)
            one.close()
            item = {
                'page': page_no,
                'pdf': str(page_pdf),
                'pdfSha256': sha256_file(page_pdf),
            }
            if render_png:
                page = source.load_page(page_no - 1)
                pix = page.get_pixmap(dpi=dpi, alpha=False)
                png = base.with_suffix('.png')
                pix.save(png)
                item['png'] = str(png)
                item['pngSha256'] = sha256_file(png)
            outputs.append(item)
    return outputs


def render_contact_sheets(
    path: str | Path,
    output_dir: str | Path,
    *,
    pages_per_sheet: int = 20,
    columns: int = 4,
    dpi: int = 60,
    cell_width: int = 300,
) -> list[dict]:
    """Render low-resolution numbered contact sheets for image-only map atlases.

    This is the fallback when text search cannot locate target map titles. It does
    not perform OCR or infer target pages; a human can review the numbered sheets
    and then pass selected pages to ``extract``.
    """
    if pages_per_sheet < 1 or columns < 1:
        raise ValueError('pages_per_sheet and columns must be >= 1')
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[dict] = []
    with fitz.open(path) as doc:
        all_pages = list(range(1, doc.page_count + 1))
        for sheet_index in range(0, len(all_pages), pages_per_sheet):
            page_numbers = all_pages[sheet_index:sheet_index + pages_per_sheet]
            thumbs: list[tuple[int, Image.Image]] = []
            for page_no in page_numbers:
                page = doc.load_page(page_no - 1)
                pix = page.get_pixmap(dpi=dpi, alpha=False)
                image = Image.frombytes('RGB', [pix.width, pix.height], pix.samples)
                ratio = cell_width / image.width
                image = image.resize((cell_width, max(1, round(image.height * ratio))))
                thumbs.append((page_no, image))
            label_height = 28
            rows = (len(thumbs) + columns - 1) // columns
            cell_height = max((img.height for _, img in thumbs), default=1) + label_height
            sheet = Image.new('RGB', (columns * cell_width, rows * cell_height), 'white')
            draw = ImageDraw.Draw(sheet)
            for idx, (page_no, image) in enumerate(thumbs):
                col = idx % columns
                row = idx // columns
                x = col * cell_width
                y = row * cell_height
                draw.text((x + 8, y + 6), f'PDF p.{page_no}', fill='black')
                sheet.paste(image, (x, y + label_height))
            out = output_dir / f'contact-{sheet_index // pages_per_sheet + 1:02d}.png'
            sheet.save(out)
            outputs.append({
                'sheet': sheet_index // pages_per_sheet + 1,
                'pages': page_numbers,
                'png': str(out),
                'sha256': sha256_file(out),
            })
    return outputs


DEFAULT_TARGETS = {
    '1442-025': ['1442-025', 'Kizil Cave-Temple Complex'],
    '1442-027': ['1442-027', 'Bingling Cave-Temple Complex'],
    '1442-028': ['1442-028', 'Maijishan Cave-Temple Complex'],
    '1442-029': ['1442-029', 'Bin County Cave Temple'],
}


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)

    fetch = sub.add_parser('fetch')
    fetch.add_argument('url')
    fetch.add_argument('output')
    fetch.add_argument('--expected-size', type=int)
    fetch.add_argument('--timeout', type=float, default=30.0)

    probe = sub.add_parser('probe-remote')
    probe.add_argument('url')
    probe.add_argument('--timeout', type=float, default=30.0)

    target = sub.add_parser('extract-target')
    target.add_argument('manifest')
    target.add_argument('target_id')
    target.add_argument('output_dir')
    target.add_argument('--timeout', type=float, default=30.0)
    target.add_argument('--block-size', type=int, default=1024 * 1024)
    target.add_argument('--max-fetch-bytes', type=int, default=256 * 1024 * 1024)
    target.add_argument('--dpi', type=int, default=180)

    remote = sub.add_parser('extract-remote')
    remote.add_argument('url')
    remote.add_argument('pages', help='comma-separated 1-based pages')
    remote.add_argument('output_dir')
    remote.add_argument('--expected-size', type=int)
    remote.add_argument('--timeout', type=float, default=30.0)
    remote.add_argument('--block-size', type=int, default=1024 * 1024)
    remote.add_argument('--max-fetch-bytes', type=int, default=256 * 1024 * 1024)
    remote.add_argument('--dpi', type=int, default=180)

    inspect = sub.add_parser('inspect')
    inspect.add_argument('pdf')

    locate = sub.add_parser('locate')
    locate.add_argument('pdf')
    locate.add_argument('--output-json')

    contact = sub.add_parser('contact')
    contact.add_argument('pdf')
    contact.add_argument('output_dir')
    contact.add_argument('--pages-per-sheet', type=int, default=20)
    contact.add_argument('--columns', type=int, default=4)
    contact.add_argument('--dpi', type=int, default=60)

    extract = sub.add_parser('extract')
    extract.add_argument('pdf')
    extract.add_argument('pages', help='comma-separated 1-based pages')
    extract.add_argument('output_dir')
    extract.add_argument('--dpi', type=int, default=180)

    args = parser.parse_args()
    if args.command == 'fetch':
        result = download_file(args.url, args.output, expected_size=args.expected_size, timeout=args.timeout)
    elif args.command == 'probe-remote':
        result = probe_remote_pdf(args.url, timeout=args.timeout)
    elif args.command == 'extract-target':
        target = load_extraction_target(args.manifest, args.target_id)
        result = extract_remote_pages(
            target['remoteUrl'], target['pages'], args.output_dir, expected_size=target.get('expectedSizeBytes'),
            timeout=args.timeout, block_size=args.block_size, max_fetch_bytes=args.max_fetch_bytes, dpi=args.dpi,
        )
        result['target'] = {key: target[key] for key in ('id', 'siteId', 'officialReference', 'kind', 'startPage', 'endPage')}
    elif args.command == 'extract-remote':
        pages = parse_page_spec(args.pages)
        result = extract_remote_pages(
            args.url, pages, args.output_dir, expected_size=args.expected_size, timeout=args.timeout,
            block_size=args.block_size, max_fetch_bytes=args.max_fetch_bytes, dpi=args.dpi,
        )
    elif args.command == 'inspect':
        result = inspect_pdf(args.pdf)
    elif args.command == 'locate':
        result = locate_pages(args.pdf, DEFAULT_TARGETS)
        if args.output_json:
            Path(args.output_json).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif args.command == 'contact':
        result = render_contact_sheets(
            args.pdf,
            args.output_dir,
            pages_per_sheet=args.pages_per_sheet,
            columns=args.columns,
            dpi=args.dpi,
        )
    else:
        pages = parse_page_spec(args.pages)
        result = extract_pages(args.pdf, pages, args.output_dir, dpi=args.dpi)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
