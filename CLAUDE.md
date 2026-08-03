# Schelio

Chrome extension (Manifest V3) — interactive ERD viewer for Salesforce.

## Architecture

- **Vanilla JS**, zero dependencies, no build step
- Single-page app: `app.html` + `app.js` (~1200 lines) + `app.css` (~1700 lines)
- Extension: `manifest.json`, `background.js`, `content.js`, `popup.html/js`
- Salesforce REST API + Tooling API (version in `SF_API_VERSION` constant)

## Key patterns

- `sfApi(path)` — all Salesforce API calls go through this (includes AbortController timeout)
- `sfToolingQuery(soql)` — SOQL queries via Tooling API (always use `escSoql()` for parameters)
- `escHtml(s)` — sanitize strings before innerHTML
- `escSoql(s)` — escape single quotes in SOQL
- `escCsv(s)` — escape values for CSV export
- Detail panel has 8 tabs, each rendered by a `render*Tab()` function
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
- Theme: CSS variables in `:root` overridden by `body.light-theme`

## Testing

No automated tests. Test by loading the extension in Chrome developer mode and connecting to a Salesforce org.
