# Contributing

Thanks for helping improve the China Cave Temples Map research GIS.

## Principles

- Do not promote approximate coordinates to `verified` without traceable evidence.
- Keep legal protection boundaries, research extents, and UNESCO Property/Buffer evidence distinct.
- Preserve fit/check separation in georeferencing workflows.
- New uncertainty claims should include provenance when available.
- Do not commit AMap keys, security codes, tokens, credentials, or private source files.

## Development

```bash
npm install
npm test
npm run build
```

Python regression tests used by the research pipeline:

```bash
python -m unittest scripts/test_unesco_pdf_pipeline.py
PYTHONPATH=scripts python -m unittest scripts/test_apply_reviewed_extent_patch.py
```

## Pull requests

Please describe:

1. what research/data problem the change addresses;
2. whether factual site data changes;
3. which evidence/source supports those changes;
4. which tests were run.
