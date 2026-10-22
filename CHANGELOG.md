# Changelog

All notable changes to Schelio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-10-22

### Added
- **Design Mode → SFDX** (`design.js`) — draft objects and fields (15 field types incl. Lookup / Master-Detail / Picklist) on the canvas, on new or existing objects; dashed amber rendering; XML preview; export of a deployable SFDX package (`object-meta.xml`, `field-meta.xml`, `manifest/package.xml`, `sfdx-project.json`, README) through a built-in zero-dependency ZIP writer; drafts persisted per org. Nothing is written to the org
- **Architect Score** (`lint.js`) — 15 data-model rules (field limit, picklist size, master-detail candidates, polymorphic lookups, inactive record types, duplicate labels, external-ID uniqueness, text-length defaults, help text, naming, formula density, field & object descriptions via `FieldDefinition` / Tooling `CustomObject`, orphan objects via `limits/recordCount`); 0–100 score and A–F grade on every card; **Score** detail tab; org-wide review modal with CSV export
- **Cross-CRM Mapping Overlay** (`mapping.js`) — import a target schema JSON, target tables as orange cards, object and field mapping modal with filter, auto-map by name similarity (Dice coefficient on bigrams), mapping lines on the canvas, CSV / JSON export, export of the current org as a target schema; Dynamics 365 Sales & Service sample (`assets/targets/d365-sales.json`, 12 tables)
- **Relationship Path Finder** (`pathfinder.js`) — BFS over all loaded relationships in both directions, shortest paths first, SOQL generation (parent chains, child subqueries, multi-step when direction changes), highlight on canvas, `Ctrl+P`
- Module hook API on `window.Schelio` (`on`, `runHooks`, state getters, `connectorPath`, `storage`) — new features are single files that plug into `app.js`; documented in `CLAUDE.md`
- Mapping tab in the sidebar; Path / Score / Design buttons in the toolbar; Design bar; `glowBlue` SVG filter
- `demo/` — mocked 12-object org (record types, picklists per RT, layouts, profiles, FLS, permission sets, validation rules, flows, triggers, descriptions, record counts) and a Playwright + ffmpeg recorder producing the six product videos (`npm run videos`)
- `test/smoke.js` — jsdom smoke test over the core and every module against the shared fixture (`npm test`, 62 assertions)

### Changed
- Card header badges are generic (Record Type count + module badges such as the grade); card title truncates to the remaining width
- Relationship lines carry `data-pairs` so modules can address them; `fitAll` and the empty state account for draft and target cards
- `Escape` closes every `.modal-overlay` and clears the path highlight; sidebar tabs resolve their panel by name; `[data-close-modal]` buttons close modals generically
- Detail panel scrolls back to the top when a new object is opened
- Light theme overrides for the module surfaces


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
