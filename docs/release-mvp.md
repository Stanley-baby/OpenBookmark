# OpenBookmark MVP release

## Build from a clean checkout

```bash
npm ci
npm run typecheck
npm test
npm run perf:fixtures
npm run package:release
```

Artifacts are written to `dist/`:

- `openbookmark-chrome-mv3.zip`
- `openbookmark-edge-mv3.zip`
- `SHA256SUMS.txt`
- `CHANGELOG.md` records the MVP release notes.

## Sideload smoke test

1. Chrome: open `chrome://extensions`, enable Developer mode, load `.output/chrome-mv3`.
2. Edge: open `edge://extensions`, enable Developer mode, load `.output/edge-mv3`.
3. Verify Save Popup can save/edit a page.
4. Verify Manager search, filters, views, collections, tags, bulk actions and Trash.
5. Import/export browser HTML, restore OpenBookmark JSON, import source JSON.
6. Configure WebDAV, run encrypted backup, list versions, restore one version after preview.
7. Confirm no unexpected network requests beyond explicit metadata refresh and configured WebDAV backup.

## Known MVP limits

- No browser-store submission in this ticket.
- No sync, Firefox, Safari, dark theme, hosted service, telemetry, AI tagging, or full-page archives.
