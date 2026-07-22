# OpenBookmark MVP privacy checklist

- No telemetry, analytics SDK, crash reporter, or third-party endpoint is packaged.
- No content scripts run passively. Page reads happen only from Save Popup metadata extraction or selected Manager metadata refresh.
- WebDAV requests go only to the user-configured backup target.
- OpenBookmark JSON export and WebDAV backups exclude thumbnail cache bytes and device-local credentials.
- WebDAV credentials and recovery password stay in extension local storage and are never rendered outside password fields.
- Broad host permission is disclosed in Manager backup settings and `README.md`.
- Repeat the local fixture measurement with `npm run perf:fixtures`; investigate if search/filter on 100,000 deterministic bookmarks exceeds the 200ms target on the reference browser/device.
