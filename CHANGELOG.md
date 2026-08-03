# Changelog

All notable changes to Schelio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-08-03

### Security
- **Session token no longer travels in the app URL** — the connection is handed over via `chrome.storage.session`; a legacy URL fallback strips the token immediately with `history.replaceState` (keeps it out of browser history, session restore, and other extensions' reach)
- `escHtml()` is now attribute-safe (escapes `"` and `'` in addition to `&<>`)
- Full escaping pass on every render function (object list, field search, record types, picklists, layouts, profiles) and on the entire PDF Spec template; the PDF window's `opener` reference is severed
- Cross-org token guard: the popup refuses a `sid` cookie whose domain doesn't match the active tab's org
- Imported layout codes are validated (object name charset, finite positions) before reaching authenticated API URLs

### Fixed
- **Dependent picklist mappings could be wrong** when the controlling field has inactive values — `validFor` bitmaps are now decoded against the unfiltered describe order
- **SOQL pagination** — all metadata queries now follow `nextRecordsUrl` (FLS on large orgs was silently truncated at 2000 rows)
- Impact analysis is honest about failures: "could not check" instead of a false "✅ not used" when a query fails; removed the misleading `FullName` formula fallback; added cross-object limitation notice
- Shift-click range selection in the sidebar (anchor no longer reset by re-render)
- Undo/redo now restores the selection too (import + Ctrl+Z no longer desyncs canvas and sidebar)
- PNG/SVG exports embed the stylesheet — exported files are no longer unstyled
- Keyboard shortcuts no longer fire while typing in a text field
- Overview field filter no longer hides the Relationships section
- Field-usage modal no longer hangs when switching objects mid-analysis
- Validation rule formulas load in parallel (was N+1 serial)

### Added
- Impact analysis (🔎 where is this field used), formula field display (ƒx), canvas search, layout share/import codes, multi-object dependency CSV export, Org-Wide Defaults, Approval Processes, CMT/Custom Settings badges + Config filter, polymorphic relationship indicators

## [2.0.0] - 2026-04-02

### Added
- **Cross-object field search** — Search fields by label, API name, or type across all loaded objects with highlighting
- **Mermaid ERD export** — Generate Mermaid syntax with entities, attributes, PK/FK markers, and relationships
- **Save/Load layouts** — Persist diagram arrangements per org in localStorage (selection, positions, zoom, pan)
- **PDF Technical Specification export** — Full spec document with cover page, TOC, per-object field dictionaries, relationship map, and Mermaid code
- Sidebar tabs (Objects / Fields) for better navigation
- Toast notifications for user feedback
- Modal dialog for Mermaid code preview and copy
- Keyboard shortcut `Ctrl+F` for field search
- Keyboard shortcut `Ctrl+S` for layout save
- Layout save/load buttons in sidebar footer

### Changed
- Sidebar redesigned with tab-based navigation
- Toolbar expanded with Mermaid and PDF export buttons
- Improved CSS with new styles for modals, toasts, and field search results

## [1.0.0] - 2026-04-02

### Added
- Initial release
- Interactive SVG-based ERD canvas with pan and zoom
- Salesforce REST API integration (v59.0) for object metadata
- Auto-detection of Salesforce session from browser cookies
- Manual connection mode with Instance URL + Session ID
- Object browser with search, Standard/Custom filter
- Draggable object cards with field display (icons, types, labels)
- Relationship visualization with curved bezier lines
- Color-coded relationships (Lookup = blue, Master-Detail = indigo)
- Detail panel with full field list and metadata
- Auto-layout algorithm based on relationship density
- Fit-all viewport adjustment
- Toggle relationship visibility
- PNG export (2x resolution)
- SVG export
- Dark blueprint theme with custom fonts (DM Sans, JetBrains Mono)
- Keyboard shortcuts (zoom, fit, escape)
- Extension popup with auto-detect and manual connection modes
- Chrome Manifest V3 compliance
