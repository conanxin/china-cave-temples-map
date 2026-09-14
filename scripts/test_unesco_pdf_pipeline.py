import hashlib
import http.server
import json
import os
import socketserver
import tempfile
import threading
import unittest
from pathlib import Path

import fitz

try:
    from unesco_pdf_pipeline import download_file, inspect_pdf, locate_pages, extract_pages, render_contact_sheets, probe_remote_pdf, extract_remote_pages, parse_page_spec, load_extraction_target
except ModuleNotFoundError:
    from scripts.unesco_pdf_pipeline import download_file, inspect_pdf, locate_pages, extract_pages, render_contact_sheets, probe_remote_pdf, extract_remote_pages, parse_page_spec, load_extraction_target


class RangeHandler(http.server.BaseHTTPRequestHandler):
    payload = b''
    range_requests = []
    full_requests = 0

    def do_HEAD(self):
        data = self.payload
        self.send_response(200)
        self.send_header('Content-Type', 'application/pdf')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()

    def do_GET(self):
        data = self.payload
        range_header = self.headers.get('Range')
        if range_header and range_header.startswith('bytes='):
            spec = range_header.split('=', 1)[1]
            start_text, end_text = spec.split('-', 1)
            start = int(start_text)
            end = int(end_text) if end_text else len(data) - 1
            end = min(end, len(data) - 1)
            self.__class__.range_requests.append((start, end))
            self.send_response(206)
            self.send_header('Content-Range', f'bytes {start}-{end}/{len(data)}')
            chunk = data[start:end + 1]
        else:
            self.__class__.full_requests += 1
            self.send_response(200)
            chunk = data
        self.send_header('Content-Type', 'application/pdf')
        self.send_header('Content-Length', str(len(chunk)))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        self.wfile.write(chunk)
    def log_message(self, *args):
        pass


def build_pdf(path: Path):
    doc = fitz.open()
    for text in [
        'Cover — Silk Roads maps',
        'Kizil Cave-Temple Complex 1442-025 property and buffer zone',
        'Bingling Cave-Temple Complex 1442-027',
        'Maijishan Cave-Temple Complex 1442-028 and Bin County Cave Temple 1442-029',
    ]:
        page = doc.new_page(width=600, height=800)
        page.insert_text((72, 100), text, fontsize=14)
    doc.save(path)
    doc.close()


class PdfPipelineTests(unittest.TestCase):
    def test_resumable_download_verifies_size_and_sha256(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / 'source.pdf'
            build_pdf(source)
            payload = source.read_bytes()
            RangeHandler.payload = payload
            with socketserver.TCPServer(('127.0.0.1', 0), RangeHandler) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                out = root / 'downloaded.pdf'
                part = out.with_suffix(out.suffix + '.part')
                part.write_bytes(payload[:211])
                result = download_file(
                    f'http://127.0.0.1:{server.server_address[1]}/file.pdf',
                    out,
                    expected_size=len(payload),
                    timeout=5,
                )
                server.shutdown()
            self.assertEqual(out.read_bytes(), payload)
            self.assertFalse(part.exists())
            self.assertEqual(result['bytes'], len(payload))
            self.assertEqual(result['sha256'], hashlib.sha256(payload).hexdigest())
            self.assertTrue(result['resumed'])

    def test_inspect_locate_and_extract_target_pages(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pdf = root / 'atlas.pdf'
            build_pdf(pdf)
            info = inspect_pdf(pdf)
            self.assertEqual(info['pages'], 4)
            self.assertEqual(info['bytes'], pdf.stat().st_size)
            self.assertEqual(len(info['sha256']), 64)

            matches = locate_pages(pdf, {
                '1442-025': ['Kizil Cave-Temple Complex', '1442-025'],
                '1442-027': ['Bingling Cave-Temple Complex', '1442-027'],
                '1442-028': ['Maijishan Cave-Temple Complex', '1442-028'],
                '1442-029': ['Bin County Cave Temple', '1442-029'],
            })
            self.assertEqual(matches['1442-025']['pages'], [2])
            self.assertEqual(matches['1442-027']['pages'], [3])
            self.assertEqual(matches['1442-028']['pages'], [4])
            self.assertEqual(matches['1442-029']['pages'], [4])

            out_dir = root / 'pages'
            outputs = extract_pages(pdf, [2, 4], out_dir, render_png=True)
            self.assertEqual([x['page'] for x in outputs], [2, 4])
            for item in outputs:
                self.assertTrue(Path(item['pdf']).exists())
                self.assertTrue(Path(item['png']).exists())
                with fitz.open(item['pdf']) as one:
                    self.assertEqual(one.page_count, 1)




    def test_manifest_target_loader_returns_inclusive_page_window(self):
        with tempfile.TemporaryDirectory() as td:
            manifest = Path(td) / 'targets.json'
            manifest.write_text(json.dumps({
                'remoteUrl': 'https://example.test/large.pdf',
                'expectedSizeBytes': 12345,
                'targets': [
                    {'id': 'target-a', 'siteId': 5, 'officialReference': '1442-028', 'kind': 'map-page-hint', 'startPage': 4178, 'endPage': 4180},
                ],
            }), encoding='utf-8')
            result = load_extraction_target(manifest, 'target-a')
            self.assertEqual(result['pages'], [4178, 4179, 4180])
            self.assertEqual(result['remoteUrl'], 'https://example.test/large.pdf')
            self.assertEqual(result['expectedSizeBytes'], 12345)

    def test_page_spec_accepts_ranges_and_deduplicates(self):
        self.assertEqual(parse_page_spec('4178-4180,4180,4200,4202-4203'), [4178, 4179, 4180, 4200, 4202, 4203])
        with self.assertRaises(ValueError):
            parse_page_spec('5-3')
        with self.assertRaises(ValueError):
            parse_page_spec('0')

    def test_probe_and_remote_page_extraction_use_http_ranges(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            source = root / 'source.pdf'
            build_pdf(source)
            payload = source.read_bytes()
            RangeHandler.payload = payload
            RangeHandler.range_requests = []
            RangeHandler.full_requests = 0
            with socketserver.TCPServer(('127.0.0.1', 0), RangeHandler) as server:
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                url = f'http://127.0.0.1:{server.server_address[1]}/file.pdf'
                probe = probe_remote_pdf(url, timeout=5)
                self.assertEqual(probe['bytes'], len(payload))
                self.assertTrue(probe['acceptRanges'])
                self.assertEqual(probe['contentType'], 'application/pdf')

                outputs = extract_remote_pages(
                    url, [2, 4], root / 'remote-pages', expected_size=len(payload),
                    timeout=5, block_size=256, render_png=False,
                )
                server.shutdown()

            self.assertEqual([item['page'] for item in outputs['pages']], [2, 4])
            self.assertGreater(outputs['remote']['requestCount'], 0)
            self.assertGreater(outputs['remote']['bytesFetched'], 0)
            self.assertEqual(RangeHandler.full_requests, 0)
            self.assertGreater(len(RangeHandler.range_requests), 0)
            for item in outputs['pages']:
                with fitz.open(item['pdf']) as one:
                    self.assertEqual(one.page_count, 1)

    def test_contact_sheet_fallback_renders_page_numbers_for_visual_location(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pdf = root / 'atlas.pdf'
            build_pdf(pdf)
            outputs = render_contact_sheets(pdf, root / 'contact', pages_per_sheet=3, columns=2, dpi=36)
            self.assertEqual(len(outputs), 2)
            for item in outputs:
                sheet = Path(item['png'])
                self.assertTrue(sheet.exists())
                self.assertGreater(sheet.stat().st_size, 100)
            self.assertEqual(outputs[0]['pages'], [1, 2, 3])
            self.assertEqual(outputs[1]['pages'], [4])


if __name__ == '__main__':
    unittest.main()
