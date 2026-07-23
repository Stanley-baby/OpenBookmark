# Logged-in reference UI observation

**Observed:** 2026-07-23, desktop light mode, signed-in account.
**Purpose:** clean-room visual and interaction reference for OpenBookmark. This document records behavior and layout observations only. Do not copy source code, assets, names, or account/cloud features from the reference product.

## Screens inspected

1. The logged-in all-bookmarks manager at desktop width.
2. The installed extension's `action` page, which uses the same manager shell and changes the primary action label to “Save”.
3. Search filters, account menu, sort menu, view menu, row hover actions, and a row context menu.
4. The detail editor shown immediately after an action-page save.

## Manager shell

The page is a dense three-zone desktop product UI:

- **Left rail:** a fixed, light-gray navigation area. It starts with an account trigger and a compact create-collection button, then three system locations (all, unfiled, trash), followed by a hierarchical collection tree. Each collection row can show a disclosure chevron, folder icon, label, and count. Nested rows are indented in small, regular steps. A compact upgrade callout occupies the rail bottom.
- **Content area:** a white canvas. A search field sits in the top-left of the content toolbar; secondary action, split add/save button, and compact icon controls sit on the right. The scope toolbar below contains a select-all checkbox, current location title, sort trigger, view trigger, and more/export trigger.
- **Bookmark list:** rows are compact and separated by thin horizontal rules. A row contains a small thumbnail, title, optional short description or note lines, blue tags, then muted collection/domain/date metadata. The title is visually dominant; metadata never competes with it.
- **Detail editor:** selecting or creating an item can split the content area. The list stays visible on the left while a white editor panel occupies the right. The panel is not a centered modal.

At the observed viewport, the rail is approximately 230px wide. Controls use 28–36px heights, thin neutral borders, dark-gray text, a bright blue primary action, and very little rounding. The density and hierarchy—not large card padding—are the key visual characteristics.

## Observed interactions

### Collections and navigation

- System locations change the current scope without leaving the manager shell.
- Clicking a parent collection disclosure control expands or collapses its children; clicking the collection name opens that collection.
- Counts remain right-aligned, including for nested nodes.
- The account menu exposes settings, extension/app links, help, changelog, and sign-out. OpenBookmark should not replicate account, upgrade, or sign-out entries.

### Search and filters

- Search is a prominent input with a dedicated filter trigger.
- Opening filters shows suggested query facets such as tags, notes, highlights, item type, created date, title/description, URL, and “without tags”, each with a result count.
- The same panel presents recently used queries and explains that a leading `-` excludes a condition.
- This is query composition rather than a separate filter form.

### Sorting and views

- The sort menu exposes date ascending/descending, title A–Z/Z–A, and site A–Z/Z–A.
- The view menu exposes list, cards, title-only, and a board-style view.
- The view menu also controls which row fields are displayed (cover, title, note, description, highlights, tags, metadata) and whether covers are left- or right-aligned.
- These controls are per-view presentation preferences, not bookmark data edits.

### Bookmark rows

- Hovering a row reveals compact inline actions for preview, edit, delete, and selection. They remain visually secondary until hover.
- Right-click opens a contextual menu with: open in new tab, copy link, ask, preview, web archive, select, favorite, refresh preview, edit, and delete.
- Tags and collection metadata act as navigable filters.

### Save and edit behavior

- In the extension action page, the primary **Save** control is an immediate submit action; it does not first open a blank form.
- After saving, the new item appears at the top of the current list and the manager opens its right-side editor.
- The editor shows icon/cover, title, description, notes (Markdown help), collection selector, tag combobox, URL, favorite and reminder-like controls, saved timestamp, delete action, plus modes for edit, ask, and web archive.
- OpenBookmark should keep only local bookmark fields and omit the remote/AI/archive features.

## OpenBookmark implementation guidance

The current CSS-only manager restyle cannot reach this reference because the manager's information architecture differs. Rebuild the manager structure before further visual polishing:

1. Replace the generic navigation with a fixed collection tree and system locations.
2. Make search and scope controls a persistent two-row content header.
3. Render compact list rows as the default manager view; keep cards as an alternate view.
4. Reveal row actions on hover and supply a non-destructive context menu.
5. Move backup, import, and WebDAV management into a separate settings surface rather than mixing them with the primary bookmark workspace.
6. Use a split detail editor for create/edit states instead of presenting every field in the main list surface.

Keep OpenBookmark's own name, iconography, local-first data model, no-login policy, and no-upgrade marketing. The reference supplies interaction density and layout hierarchy, not product identity or online-service behavior.

## Collection note

During observation, the reference extension's immediate Save action created one temporary bookmark for its own extension URL in the signed-in account's unfiled collection. It was left untouched so this observation session does not perform a deletion. If removal is desired, delete that item manually or explicitly authorize a recoverable deletion.
