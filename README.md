 HEAD
# astronomy-automation-studio
Astronomy Automation Studio is a lightweight web-page app for automating astronomy data pipelines. It supports JWST NIRCam, ESO VLT stellar parameters, and ALMA moment maps, with features for job submission, status tracking, and artifact downloads. Built with HTML, CSS, and JavaScript, it's responsive and accessible.

# Astronomy Automation Studio

Production-ready, framework-free automation surface for observatory-scale astronomy pipelines. Ships with three demo apps, job orchestration UI, AI Ops assistant prompts, and mock data for offline evaluation.

## Quick start

1. Clone or download this repository.
2. From the project root, start a static server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000/` in your browser.

The site auto-detects `Demo Mode` from `CONFIG.DEMO_MODE`. Keep it enabled to exercise the UI with bundled mock JSON responses.

## Configuration

All runtime configuration lives at the top of `app.js`:

```js
const CONFIG = {
  API_BASE_URL: "https://REPLACE_ME.api",
  DEMO_MODE: true,
  POLL_INTERVAL_MS: 2000,
  MAX_POLL_MINUTES: 20,
  ACCENT: "#7C83FF"
};
```

- Update `API_BASE_URL` to point at your automation backend.
- Set `DEMO_MODE` to `false` to use live APIs.
- `POLL_INTERVAL_MS` controls job status polling cadence; `MAX_POLL_MINUTES` bounds total polling duration.

## Automation API contract

All apps use the shared job system with submit + poll flow.

### Submit job

```
POST {API_BASE_URL}/jobs/{pipeline}
Content-Type: application/json

{ "parameters": { ... } }
```

| Pipeline | Endpoint | Payload fields |
|----------|----------|----------------|
| JWST NIRCam composite + photometry | `/jobs/jwst-nircam` | `objectRa`, `filters`, `cutout`, `colorMap`, `aperture` |
| ESO VLT spectra → stellar parameters | `/jobs/eso-vlt-params` | `targetId`, `wavelength`, `options` |
| ALMA cube → moment maps | `/jobs/alma-moments` | `cubeId`, `mask`, `moments`, `spectral` |

### Poll job status

```
GET {API_BASE_URL}/jobs/{jobId}
```

Response schema:

```json
{
  "jobId": "abc123",
  "status": "Queued|Running|Succeeded|Failed",
  "startedAt": "2025-01-01T00:00:00Z",
  "updatedAt": "2025-01-01T00:02:15Z",
  "logs": "ansi or plain text…",
  "artifacts": [
    { "name": "preview.png", "url": "https://…", "size": 123456, "type": "image/png" }
  ],
  "public": false,
  "report": { "summary": "…", "metrics": { "snr": 12.3 } }
}
```

The UI persists recently completed jobs in `localStorage` under `aas_recent_jobs` and publishes any job with `public: true` into the Selected Results gallery.

## Demo data

Mock responses live in `mock-data/` and mirror the live API contract. Each pipeline includes:

- `*-running.json`, `*-success.json`, `*-failed.json`
- Downloadable artifact stubs (`preview.png`, `catalog.csv`, etc.)
- A manifest JSON capturing provenance fields

Toggling `Demo Mode` in the header switches between mock fetches and live endpoints without reloading the page.

## Accessibility & performance

- Semantic HTML structure with ARIA-compliant tabs, form labels, and skip link
- WCAG AA contrast, focus outlines, prefers-color-scheme support
- No framework dependencies; deferred JavaScript and CSS variables for theming
- Inline SVG icon sprite, lazy assets, and responsive layout

## License

Released under the MIT License. See `LICENSE`.
 99abf14 (my first astronomy automation vibe coded)
