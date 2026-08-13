# AGENTS.md

## Cursor Cloud specific instructions

This repository is a single self-contained static web page: `index.html` (HTML + inline CSS + inline vanilla JavaScript). It is a demo "Kaivalyadhama Hostel Wi-Fi" captive portal with a client-side flow: plan/duration selection → required ID document upload → payment gateway → processing → success screen with generated Wi-Fi credentials.

Key facts for future agents:

- No dependencies, no package manager, no build step, no automated tests, and no lint config. There is nothing to install; the update script is intentionally a no-op.
- All application logic lives entirely client-side inside `index.html` (see the `<script>` block near the bottom). There is no backend or API.
- Run it in dev mode by serving the repo root as static files and opening `index.html`, e.g. `python3 -m http.server 8000` from the repo root, then browse to `http://localhost:8000/index.html`. Any static file server works; Python 3 is available in the environment.
- Do not open `index.html` via a `file://` path when testing clipboard/copy behavior — the "COPY credentials" buttons use `navigator.clipboard`, which is more reliable over `http://localhost`.
- The document upload accepts PDF/JPG/PNG up to 5 MB and is required before the "Proceed to Pay" step; the success flow generates a random username (`kdhm...`)/password purely in JavaScript (no real payment or persistence).
