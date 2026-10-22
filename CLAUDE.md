# Schelio

Chrome extension (Manifest V3) — interactive ERD viewer for Salesforce.

## Architecture

- **Vanilla JS**, zero dependencies, no build step
- Single-page app: `app.html` + `app.js` (~2200 lines) + `app.css` (~2300 lines)
- Feature modules, one file each, loaded after `app.js`: `design.js` (Design Mode → SFDX), `lint.js` (Architect Score), `mapping.js` (cross-CRM mapping overlay), `pathfinder.js` (Relationship Path Finder)
- Extension: `manifest.json`, `background.js`, `content.js`, `popup.html/js`
- `demo/` — mocked org (`fixture.js`) + Playwright/ffmpeg recorder for product videos; `test/` — jsdom smoke test
- Salesforce REST API + Tooling API (version in `SF_API_VERSION` constant)

## Key patterns

- `sfApi(path)` — all Salesforce API calls go through this (includes AbortController timeout)
- `sfToolingQuery(soql)` — SOQL queries via Tooling API (always use `escSoql()` for parameters)
- `escHtml(s)` — sanitize strings before innerHTML
- `escSoql(s)` — escape single quotes in SOQL
- `escCsv(s)` — escape values for CSV export
- Detail panel has 9 tabs, each rendered by a `render*Tab()` function (the Score tab is rendered by `lint.js` through the `detailTabs` hook)
- Async tab data is guarded by `activeDetailObject` to prevent race conditions
- Caches: `objectMeta`, `picklistCache`, `layoutCache`, `flexiPageCache`, `profileCache`, `permSetCache`, `validationRuleCache`, `automationCache`, `sharingModelCache`
- Impact analysis: `analyzeFieldUsage()` regex-matches a field API name in VR formulas, `calculatedFormula`, and trigger `Body` (fetched in `fetchAutomation`)
- Layout sharing: `shareLayout()`/`importLayout()` use a base64 `SCHELIO1.` code — never include the session token in shared payloads

## Conventions

- All new SOQL queries must use `escSoql()` for user/API-sourced values
- **Every** org-metadata string inserted via innerHTML must go through `escHtml()` (attribute-safe: escapes quotes too) — including labels, picklist values, profile names, and the PDF Spec template
- Queries that can exceed 2000 rows must use `sfQueryAll`/`sfRestQueryAll`/`sfToolingQueryAll` (follows `nextRecordsUrl`), never raw `sfApi(query)`
- The session token must NEVER appear in a URL, export, or shared payload — connection is handed over via `chrome.storage.session` (see `init()`/`background.js`)
- API version must use `SF_API_VERSION` constant, never hardcoded
- Copy buttons use document-level event delegation (no per-element listeners)
- Undo stack: call `pushUndo()` before any state-changing operation — snapshots include positions AND selection
- Fetch failures that would make analysis look falsely complete must set an explicit failure flag (see `triggersFailed`, `vrFetchFailed`) and be surfaced as "could not check"
- Theme: CSS variables in `:root` overridden by `body.light-theme` — module CSS must use the variables; add `body.light-theme` overrides for any hardcoded dark surface

## Module API (`window.Schelio`)

`app.js` exposes `window.Schelio` at the end of its IIFE: live state getters (`objectMeta`, `selectedObjects`, `nodePositions`, `relationships`, `activeDetailObject`…), the API helpers (`sfApi`, `sfToolingQuery`, `sfToolingQueryAll`, `sfRestQueryAll`, `escSoql`), rendering helpers (`renderERD`, `connectorPath`, `nextFreePosition`, `svgEl`, `showToast`, `escHtml`, `pushUndo`…) and `on(hookName, fn)`.

Hooks called by the core (each callback's return value is collected):
- `extraFields(api)` → array of describe-shaped fields to append to a card (rendered dashed/amber)
- `cardBadges(api)` → `{text, fill, color, title}` badges for the card header
- `decorateNode(api, g, meta)` — mutate a rendered card `<g>`
- `renderExtraNodes()` / `renderExtraRelationships()` — draw module-owned cards/lines (keys in `nodePositions` use a prefix: `draft:`, `target:`)
- `detailTabs(api, meta)` — fill a module tab in the detail panel; guard async renders with `Schelio.activeDetailObject === api`
- `sidebarTab(name)`, `escape()`

Module rules: same conventions as the core (`escHtml` on every org string, `escSoql` + paginated queries, `SF_API_VERSION`, never the token); call `pushUndo()` before changing `nodePositions`; persist per org through `Schelio.storage`; register DOM wiring on `DOMContentLoaded` (modules load after `app.js`); never write to the org — Design Mode only generates a package the user deploys with the `sf` CLI.

## Testing

- `npm test` — syntax check + `test/smoke.js`: boots `app.html` in jsdom against `demo/fixture.js` (a mocked 12-object org) and exercises the core ERD and every module. Add a case there when you add a feature.
- `npm run videos` — records the product videos with Playwright + ffmpeg against the same fixture (real Chromium; a good second check for UI changes).
- Then load the extension in Chrome developer mode and connect to a Salesforce org — the fixture does not cover org-specific permissions.
