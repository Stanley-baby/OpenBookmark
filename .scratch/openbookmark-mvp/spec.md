# OpenBookmark MVP

Status: ready-for-agent

Published: 2026-07-21  
Tracker: local-markdown

## Problem Statement

People who depend on browser bookmarks want the polished organization workflow of Raindrop.io without paying for essential data-protection features or placing their primary data in a proprietary cloud account. They need a browser extension that works offline, keeps the local database authoritative, supports reliable migration and recovery, and remains inspectable and self-hostable as open-source software.

The current alternatives do not satisfy the complete combination: a fast Save Popup, a capable Manager, user-owned local data, reversible import/export, encrypted automatic backups, and an independently maintained visual experience. Users also need confidence that the extension will not monitor browsing activity merely because it has broad browser permissions.

## Solution

Build OpenBookmark, an AGPL-3.0, local-first Manifest V3 extension for Chrome and Edge. It will provide a high-fidelity light-theme Save Popup and Manager inspired by the observable Raindrop.io workflow, while using independent branding, assets, and code.

The MVP will save and organize bookmarks entirely in IndexedDB, support collections, tags, notes, favorite and unread states, search, sorting, card/list views, bulk operations, Trash, browser/Raindrop import, HTML/JSON export, and versioned WebDAV backups. Backups will be encrypted locally by default, retained as 30 versions, and restored only after validation and explicit confirmation. No account or server will be required for ordinary use.

## User Stories

1. As a new user, I want to install OpenBookmark in Chrome, so that I can start managing bookmarks without creating an account.
2. As an Edge user, I want to install the same extension build, so that browser choice does not change the core experience.
3. As a privacy-conscious user, I want all bookmark management to work offline, so that losing network access does not block my data.
4. As a privacy-conscious user, I want my local database to be the authoritative copy, so that a third-party service cannot lock me out.
5. As a user, I want to open a compact Save Popup from the toolbar, so that saving the current page is fast.
6. As a keyboard-oriented user, I want a configurable save shortcut, so that I can save without reaching for the mouse.
7. As a user, I want a right-click save entry, so that I can start the save workflow from the page context.
8. As a user, I want the Save Popup to read the current page URL, so that I do not need to copy it manually.
9. As a user, I want the Save Popup to suggest the current page title, so that saved bookmarks are recognizable.
10. As a user, I want the Save Popup to suggest the page description, so that I can remember why the page matters.
11. As a user, I want the Save Popup to suggest a suitable cover, so that card view is visually useful.
12. As a user, I want to edit all suggested metadata before saving, so that incorrect page metadata does not pollute my library.
13. As a user, I want to add a Note while saving, so that I can preserve my own context.
14. As a user, I want to choose a Collection while saving, so that the Bookmark is organized immediately.
15. As a user, I want to add multiple Tags while saving, so that I can find the Bookmark across Collection boundaries.
16. As a user, I want to mark a Bookmark as Favorite, so that important items are easy to surface.
17. As a user, I want to mark a Bookmark as Unread, so that I can distinguish material I still plan to read.
18. As a user, I want repeated saving of the same normalized URL to open the existing Bookmark, so that accidental duplicates are not created.
19. As a user, I want URLs with different query strings to remain distinct, so that genuinely different resources are not merged.
20. As a user, I want my saved Bookmark to appear immediately in the Manager, so that I know the Save succeeded.
21. As a user, I want saved data to survive browser restarts, so that the extension is dependable.
22. As a user, I want to create nested Collections, so that I can model a hierarchy that fits my work.
23. As a user, I want to rename a Collection, so that its meaning can evolve.
24. As a user, I want to move a Collection within the hierarchy, so that reorganization does not require rebuilding it.
25. As a user, I want to delete a Collection safely, so that I understand what happens to its Bookmarks.
26. As a user, I want to add and remove Tags from an existing Bookmark, so that classification remains current.
27. As a user, I want to filter Bookmarks by Tag, so that I can view related items across Collections.
28. As a user, I want to edit a Bookmark's URL, title, description, cover source, Note, Collection, Tags and states, so that saved data remains accurate.
29. As a user, I want to search across key Bookmark fields, so that I can find an item without remembering its Collection.
30. As a user, I want to sort Bookmarks by supported fields, so that I can browse them in the order useful to me.
31. As a user, I want a card view, so that cover images help me recognize Bookmarks visually.
32. As a user, I want a list view, so that I can scan a dense library efficiently.
33. As a user, I want the selected view and sort order to persist, so that the Manager stays configured to my preference.
34. As a user, I want to select multiple Bookmarks, so that repetitive organization takes fewer actions.
35. As a user, I want to move selected Bookmarks to another Collection, so that I can reorganize in bulk.
36. As a user, I want to delete selected Bookmarks in one action, so that cleanup is efficient.
37. As a user, I want to refresh Metadata for selected Bookmarks only when I request it, so that pages are not read in the background.
38. As a user, I want deleted Bookmarks to enter Trash, so that an accidental deletion is reversible.
39. As a user, I want Trash items retained for 30 days, so that I have a predictable recovery window.
40. As a user, I want to restore an item from Trash, so that mistakes do not become data loss.
41. As a user, I want to permanently delete individual Trash items, so that sensitive or unwanted data can be removed immediately.
42. As a user, I want to empty Trash manually, so that I control final deletion.
43. As a migrating user, I want to import browser bookmark HTML, so that I can adopt OpenBookmark without starting over.
44. As a Raindrop.io user, I want to import its exported data, so that I can leave the paid service while preserving organization.
45. As a user, I want import progress and a clear result, so that large migrations do not appear frozen.
46. As a user, I want to export browser-compatible HTML, so that I can move basic bookmarks to any browser.
47. As a user, I want to export complete versioned JSON, so that all OpenBookmark domain data remains portable.
48. As a user, I want an export to import back without losing key fields, so that export is a real exit path.
49. As a user with a large library, I want Metadata thumbnails cached locally, so that card view remains responsive.
50. As a user with limited storage, I want the Thumbnail Cache capped at 500MB, so that images cannot grow without bound.
51. As a user, I want regenerated thumbnails excluded from Backups, so that backups remain compact.
52. As a self-hosting user, I want to configure a WebDAV Backup Target, so that backups live in storage I control.
53. As a user, I want OpenBookmark to test WebDAV settings before enabling automatic Backup, so that configuration errors are found early.
54. As a security-conscious user, I want each Backup Version encrypted before upload by default, so that the Backup Target cannot read my bookmarks.
55. As a user, I want to keep the recovery password myself, so that the project cannot access or reset my encrypted data.
56. As a user who prefers transparent files, I want to explicitly disable backup encryption, so that I can receive readable JSON.
57. As a user, I want a Backup scheduled 10 minutes after changes, so that recent work is protected without uploading on every edit.
58. As a user, I want automatic Backup limited to once per hour, so that my WebDAV service is not spammed.
59. As a user, I want missed Backup work checked at extension startup, so that browser suspension does not silently disable protection.
60. As a user, I want to trigger a manual Backup, so that I can create a recovery point before risky operations.
61. As a user, I want the latest 30 Backup Versions retained, so that I have useful history without unlimited storage growth.
62. As a user, I want failed uploads to leave earlier Backup Versions untouched, so that a failed Backup cannot destroy recovery data.
63. As a user, I want to preview a Backup Version's date, version and item counts before Restore, so that I understand what I selected.
64. As a user, I want Restore validation to happen in temporary storage, so that malformed data cannot damage my current library.
65. As a user, I want the current database backed up before Restore, so that I can recover from choosing the wrong version.
66. As a user, I want Restore to replace the database only after confirmation, so that the operation is explicit and predictable.
67. As a user, I want Restore to replace rather than silently merge, so that duplicate and conflict behavior is understandable.
68. As a user, I want an incorrect recovery password or modified ciphertext rejected, so that corrupted data is never treated as valid.
69. As a privacy-conscious user, I want the extension to explain its all-sites permission, so that I can make an informed installation decision.
70. As a privacy-conscious user, I want page content read only during explicit Save or Metadata refresh actions, so that browsing is not monitored.
71. As a privacy-conscious user, I want zero telemetry by default, so that usage and crashes are not uploaded.
72. As a user seeking support, I want to copy local diagnostic information deliberately, so that I control what leaves my device.
73. As a Chinese-language user, I want a complete Chinese interface, so that I can use the extension comfortably.
74. As an English-language user, I want a complete English interface, so that the project is broadly usable.
75. As a user, I want the default language to follow my browser, so that initial setup is effortless.
76. As a keyboard user, I want visible focus states and complete core keyboard operation, so that the extension is accessible.
77. As a user with assistive technology, I want semantic labels and sensible navigation order, so that controls are understandable.
78. As a user, I want the light theme to match the approved visual reference closely, so that the experience feels polished and familiar.
79. As a user with 100,000 Bookmarks, I want common search, filter and Collection-opening actions to target 200ms, so that the library remains usable.
80. As a user running a large import, export, Backup or Restore, I want visible progress and a responsive interface, so that long operations remain trustworthy.
81. As an open-source contributor, I want reproducible build instructions, so that I can inspect and build the extension myself.
82. As an early adopter, I want a side-loadable ZIP before store publication, so that the MVP can be validated without waiting for review.
83. As a maintainer, I want independent branding and assets, so that the project can be distributed without impersonating Raindrop.io.
84. As a maintainer, I want the implementation licensed under AGPL-3.0, so that hosted modified versions must share corresponding source.

## Implementation Decisions

- **Product surfaces:** The MVP has exactly two primary surfaces: the Save Popup and the Manager. It does not include an independently hosted web application.
- **Platform:** Use a shared Manifest V3 build for Chrome and Edge. Package with WXT, implement UI in React and TypeScript, and use browser-native APIs where possible.
- **Local-first ownership:** IndexedDB is the authoritative data store. The extension remains fully useful without an account, sync server or Backup Target.
- **Domain model:** A Bookmark owns its URL, conservative normalized URL, title, description, cover reference, Note, Collection reference, Tags, Favorite and Unread states, timestamps and optional deletion timestamp. A Collection owns its title, optional parent, order and timestamps. Settings own interface preferences, cache limits and Backup configuration.
- **Identity:** Generate stable local identifiers using browser cryptographic randomness. Imported identifiers must not be trusted as globally unique without validation.
- **Duplicate behavior:** Normalize scheme, host, default port and empty path conservatively while preserving path, query string and fragment. A matching normalized URL opens the existing Bookmark; query-string differences never merge automatically.
- **Deletion:** Use soft deletion with a deletion timestamp. Trash purging permanently removes items after 30 days or an explicit user action; deletion records remain representable for future Sync work.
- **Persistence layer:** Dexie provides the minimum IndexedDB schema, migrations and transactions. UI code accesses data through one repository boundary rather than calling IndexedDB directly from components.
- **Search:** Begin with a normalized derived search field covering title, URL, Note and Tags. Benchmark the straightforward local scan against 100,000 fixtures before adding another indexing dependency.
- **Metadata parser:** Independently reimplement the observed priority order: Twitter Card and Open Graph, normal meta fields, matching JSON-LD, then document title. Collect at most nine visible image candidates, ignore SVG and hidden/header/footer/aside images, and enforce the observed title and description limits.
- **Save workflow:** Toolbar, right-click and shortcut entry points all feed the same Save use case. Saving commits one IndexedDB transaction, then causes the Manager query to update.
- **UI baseline:** Start with a 420px-wide Save Popup, 300px minimum height, 40px root sizing system, 14px body text, 4px base radius, system UI fonts and the recorded light-theme colors. Use independent icons and assets.
- **Manager layout:** Implement nested Collection navigation, a content area, card/list switches, search/filter/sort controls, bulk selection and a Trash surface. Compact and masonry views are not implemented.
- **Thumbnail Cache:** Store regenerable image blobs separately from domain data. Enforce a 500MB least-recently-used ceiling. Backups and complete JSON export exclude automatic cache blobs but retain cover references and user-defined cover data.
- **Import/export:** Browser HTML and Raindrop export adapters convert external records into the canonical domain model. Complete JSON uses a versioned schema and must validate before import. Export and import report progress.
- **Backup boundary:** Backup is a one-way snapshot operation. It never reads the newest WebDAV file and merges it into daily local changes; that behavior belongs to future Sync.
- **WebDAV contract:** The Backup module verifies connectivity and write access, uploads a complete versioned payload, lists available versions for retention and Restore, downloads a selected version, and removes versions older than the latest 30 only after a successful upload.
- **Encryption:** Use Web Crypto authenticated encryption. The encrypted envelope carries its format version and all non-secret derivation/decryption parameters. The recovery password is never uploaded; incorrect passwords and modified ciphertext must fail closed. A locally retained non-exportable derived key may support scheduled Backup without storing the plaintext password.
- **Backup scheduling:** Record pending data changes, schedule work 10 minutes after the most recent change, enforce a one-hour minimum between automatic uploads, check missed work on startup and expose manual Backup.
- **Restore:** Download into temporary storage, validate schema and integrity, show a difference summary, automatically protect the current database, and replace only after explicit confirmation. Do not implement automatic merge.
- **Credentials:** WebDAV connection details and locally required automatic-Backup secrets are device-local settings. The accepted threat model does not encrypt the local database; the interface must not imply otherwise.
- **Permissions:** Request all-site read access as previously decided, but do not install continuously active page-monitoring behavior. Only explicit Save and Metadata refresh actions may read page content.
- **Privacy:** Include no analytics or crash-reporting SDK. Diagnostics remain local until the user explicitly copies them.
- **Internationalization:** Ship Chinese and English from the first version, defaulting to browser language. No user-visible string is embedded directly in feature components.
- **Visual reference:** Use the supplied CRX only for observable layout, behavior and numeric visual measurements. Do not copy its code, trademark, name, icons, illustrations or bundled assets.
- **License:** Publish the complete project under AGPL-3.0.
- **Release:** Deliver source, reproducible build instructions and a side-loadable ZIP first. Submit to Chrome Web Store and Edge Add-ons only after real-data validation.
- **No speculative architecture:** Do not build provider abstractions for Google Drive, OneDrive or a future Sync server in the MVP. Add those modules when their phases begin.

## Testing Decisions

- **Primary seam:** Test the built extension as a black box in Chromium. Load the real Manifest V3 package, serve controlled fixture pages, interact with the Save Popup and Manager, restart the browser context to verify persistence, and use a local WebDAV test service for Backup and Restore. This is the highest practical seam and should carry most acceptance coverage.
- **Good-test rule:** Assert user-observable results—visible fields, persisted Bookmarks, exported data, Backup objects and restored state. Do not assert React component structure, Dexie call order or internal action names.
- **Save workflow:** Cover toolbar/shortcut/right-click entry, Metadata fallbacks, user edits, duplicate detection, query-string distinction, failed page parsing and immediate Manager visibility.
- **Management workflow:** Cover nested Collections, Tags, Note edits, Favorite/Unread states, search, sort, card/list persistence, bulk move/delete, Trash restore, manual purge and 30-day expiration.
- **Migration workflow:** Import representative browser HTML and Raindrop samples, reject malformed inputs safely, report progress, export HTML/JSON and verify JSON round-trip field equality.
- **Backup workflow:** Cover connection verification, encrypted and unencrypted upload, debounce and hourly limits, startup catch-up, manual Backup, 30-version retention, failed upload safety, wrong password, modified ciphertext and successful Restore replacement.
- **Restore safety:** Verify temporary validation and difference preview occur before mutation, the current database is protected first, cancellation leaves current data unchanged and Restore never merges implicitly.
- **Privacy:** Verify no page-content reads occur from passive navigation alone and no telemetry requests are emitted. Verify page access occurs only after explicit Save or Metadata refresh actions.
- **Performance:** Generate 100,000 Bookmarks and measure search, filter and Collection opening against the 200ms target on the agreed reference machine. Measure long operations for responsiveness rather than imposing the 200ms target on them.
- **Accessibility:** Exercise the full core workflow with keyboard input, verify focus visibility and order, and run automated semantic checks for names, roles and contrast.
- **Visual regression:** Capture Save Popup and Manager states at fixed viewports and compare them with approved light-theme references. Static CRX measurements seed the baseline; logged-in screenshots are required for final pixel-level acceptance.
- **Narrow deterministic checks:** Add small direct tests only where browser-level failures would be hard to diagnose: URL normalization, Metadata parser fixtures, import adapters, versioned JSON validation, encrypted envelope round-trip and retention selection.
- **Prior art:** This is a greenfield project with no existing test infrastructure or comparable tests. Do not claim prior art; establish the extension-level seam first and keep auxiliary seams minimal.

## Out of Scope

- Dark and sunset themes
- Firefox and Safari support
- A separately hosted Manager website
- Full-page permanent copies or offline web archives
- Team collaboration, shared Collections and public pages
- Broken-link detection
- A standalone duplicate-cleanup tool
- Full-text indexing of page bodies, EPUBs or PDFs
- AI-generated Tags, classification or Collection suggestions
- Google Drive and OneDrive Backup Targets
- A self-hosted Sync server
- Multi-device Sync and conflict resolution
- Local database encryption
- Side panel
- Address-bar `rd` search
- Page highlights and annotations
- Save-all-tabs workflow
- Independent right-click save modes for links, images and videos beyond the agreed generic save entry
- Saved-page toolbar badge
- Reminders
- Compact and masonry views
- Telemetry and analytics

## Further Notes

- The supplied CRX is version 6.7.8 and was analyzed statically. It proves the original extension's entry points, permissions, parsing behavior and design measurements, but the current environment could not run its logged-in UI.
- Final pixel-level acceptance is blocked on logged-in light-theme screenshots or a browser environment that can install and run the CRX. This does not block the local data model, Metadata parser, core Save workflow or Manager skeleton.
- The original extension requests all-site access optionally, while OpenBookmark currently plans to request it by default. This deliberate difference is recorded in the permission ADR and must be reassessed before store submission.
- `OpenBookmark` is a working name. Perform name and trademark screening before public store publication.
- Implementation should begin with one vertical slice: load the extension, Save a fixture page into IndexedDB, display it in the Manager and prove it survives restart. Expand only after that seam is green.
