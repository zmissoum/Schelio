<p align="center">
  <img src="assets/banner.svg" alt="Schelio" width="100%" />
</p>

<h1 align="center">Schelio</h1>

<p align="center">
  <strong>The Salesforce Schema Builder you always wanted.</strong><br>
  A modern, interactive ERD viewer — right in your browser.
</p>

<p align="center">
  <a href="#installation">Install</a> •
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#export-options">Exports</a> •
  <a href="#keyboard-shortcuts">Shortcuts</a> •
  <a href="#contributing">Contributing</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/manifest-v3-blue?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License" />
  <img src="https://img.shields.io/badge/salesforce-API%20v59.0-00A1E0?style=flat-square&logo=salesforce" alt="Salesforce API" />
  <img src="https://img.shields.io/badge/dependencies-zero-orange?style=flat-square" alt="Zero dependencies" />
</p>

---

## Why Schelio?

Salesforce's built-in Schema Builder is slow, cluttered, and hasn't changed in years. Schelio is a Chrome extension that gives you a **fast, beautiful, interactive ERD** built on top of the Salesforce REST API — without copying Salesforce Inspector or any existing extension.

<details>
<summary><strong>Screenshots</strong> (click to expand)</summary>

| ERD Canvas | PDF Spec Export |
|---|---|
| *Interactive dark-themed ERD with drag & drop* | *Professional technical spec with cover page* |

| Field Search | Mermaid Export |
|---|---|
| *Cross-object field search with highlighting* | *Copy-paste ready Mermaid ERD code* |

</details>

## Features

### Core ERD
- **Interactive SVG canvas** — Zoom (scroll), pan (drag), and move cards freely
- **Smart field display** — Fields sorted by importance (Id → References → alphabetical), typed icons
- **Relationship lines** — Curved bezier paths with arrows, color-coded by type (Lookup vs Master-Detail)
- **Auto-layout** — Intelligent grid positioning based on relationship density
- **Undo / Redo** — `Ctrl+Z` / `Ctrl+Y` for all canvas operations
- **Context menu** — Right-click any card for quick actions (details, remove, copy API name, export)
- **Detail panel** — Double-click any card for full metadata (see below)

### Detail Panel (8 tabs)

| Tab | Content |
|-----|---------|
| **Overview** | Fields, relationships, metadata with copy buttons on API names |
| **Record Types** | Active/inactive RTs with IDs and defaults |
| **Picklists** | Values by Record Type + **dependent picklist visualization** with interactive filtering |
| **Layouts** | Page Layouts, Lightning Record Pages, RT-to-Layout mapping |
| **Profiles** | CRUD permissions + Field-Level Security per profile |
| **Permission Sets** | CRUD permissions per Permission Set |
| **Rules** | Validation Rules with **formulas**, error messages, and status |
| **Automation** | Record-triggered Flows and Apex Triggers with events |
| **Health** | Schema health score (/100), limit bars, and warnings |

### Cross-Object Field Search
- Search by field label, API name, or type across **all loaded objects**
- Results highlight matching text and link directly to the object
- Switch between Objects and Fields tabs with `Ctrl+F`

### Save & Load Layouts
- Persist your diagram arrangement per org (selection, positions, zoom)
- Stored locally in your browser — nothing leaves your machine
- Restore with one click when you come back

### Export Options

| Format | Description |
|--------|-------------|
| **PNG** | High-resolution screenshot of your current ERD |
| **SVG** | Vector export, perfect for embedding in docs |
| **Mermaid** | Full ERD in Mermaid syntax, ready for GitHub/Notion/Confluence |
| **PlantUML** | Full ERD in PlantUML syntax |
| **CSV** | Field inventory spreadsheet across all selected objects |
| **PDF Spec** | Complete technical data model spec document (see below) |

### PDF Technical Specification

The standout feature: generate a **print-ready technical specification** including:

- Cover page with org name, stats, and generation date
- Table of contents
- Per-object pages with metadata grid, relationships table, and full field dictionary
- Cross-object relationship map
- Embedded Mermaid ERD code
- Ready to save as PDF via browser print dialog

Perfect for feeding into a spec, handing off to a new team, or documenting an org.

### Dark / Light Theme
Toggle between dark (blueprint) and light themes — persisted in your browser.

## Installation

### From source (developer mode)

```bash
# 1. Clone the repository
git clone https://github.com/zmissoum/Schelio.git

# 2. Open Chrome extensions page
#    Navigate to chrome://extensions/

# 3. Enable Developer Mode (toggle in top-right corner)

# 4. Click "Load unpacked" and select the project folder
```

### From Chrome Web Store

> Coming soon — contributions welcome to help get there!

## Usage

### Quick Start

1. Navigate to any Salesforce org in Chrome
2. Click the **Schelio** icon in your toolbar
3. The popup auto-detects your session
4. Click **Open Schema Builder+**
5. Select objects from the sidebar → they appear on the canvas
6. Drag to arrange, double-click for details, export when ready

### Manual Connection

If auto-detection doesn't work (e.g. enhanced security, SSO):

1. Click **Manual connection** in the popup
2. Enter your **Instance URL** — e.g. `https://myorg.my.salesforce.com`
3. Get your **Session ID**:
   - Open Developer Console → Debug → Execute Anonymous
   - Run: `System.debug(UserInfo.getSessionId());`
   - Copy the ID from the debug log
4. Paste and click **Connect & Open**

### Tips

- **Load related objects together** — relationships only show between selected objects
- **Use Auto Layout** after selecting many objects to get a clean starting arrangement
- **Save your layout** before closing — it persists per org
- **Field Search** (`Ctrl+F`) is great for finding where a field lives across your data model

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl` + `=` | Zoom in |
| `Ctrl` + `-` | Zoom out |
| `Ctrl` + `0` | Fit all objects in view |
| `Ctrl` + `S` | Save current layout |
| `Ctrl` + `F` | Open field search |
| `Ctrl` + `Z` | Undo |
| `Ctrl` + `Y` | Redo |
| `Escape` | Close panels/modals |
| `Scroll wheel` | Zoom in/out at cursor |
| `Click + drag` (canvas) | Pan the view |
| `Click + drag` (card) | Move a card |
| `Double-click` (card) | Open detail panel |
| `Right-click` (card) | Context menu |
| `Shift + click` (sidebar) | Multi-select objects |

## Architecture

```
schelio/
├── manifest.json          # Chrome Extension Manifest V3
├── background.js          # Service worker (cookie access, tab management)
├── content.js             # Content script (session extraction from SF pages)
├── popup.html / popup.js  # Extension popup (connection UI)
├── app.html               # Main ERD viewer (opens in new tab)
├── app.css                # Dark blueprint theme
├── app.js                 # Core application (ERD engine, API, exports)
├── icons/                 # Extension icons (16, 48, 128px)
├── assets/                # Screenshots and banner for README
├── .github/               # Issue templates, PR template
├── CONTRIBUTING.md
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

### Technical Choices

- **Manifest V3** — Future-proof Chrome extension standard
- **Vanilla JS** — Zero dependencies, instant load, no build step
- **SVG rendering** — Crisp at any zoom level, exportable, lightweight
- **Salesforce REST API v59.0** — Standard describe endpoints, no custom Apex needed
- **No external calls** — Everything stays between your browser and your Salesforce org

## API & Permissions

Schelio requires the following Chrome permissions:

| Permission | Why |
|-----------|-----|
| `activeTab` | Detect when you're on a Salesforce page |
| `cookies` | Read the Salesforce session cookie (`sid`) for API auth |
| Host permissions (`*.salesforce.com`, `*.force.com`) | Make API calls to your org |

**What we DON'T do:**
- No data is sent to any third-party server
- No analytics or tracking
- No data storage outside your local browser
- Session tokens are never persisted

## Browser Compatibility

| Browser | Status |
|---------|--------|
| Chrome 110+ | ✅ Fully supported |
| Edge (Chromium) | ✅ Fully supported |
| Brave | ✅ Works (load as unpacked) |
| Firefox | ❌ Not yet (Manifest V3 differences) |
| Safari | ❌ Not supported |

## Roadmap

- [x] PlantUML export
- [x] Dark/light theme toggle
- [x] Validation Rules with formulas
- [x] Flows & Triggers visualization
- [x] Schema health score & limit warnings
- [x] Permission Sets support
- [x] Undo/Redo on canvas
- [x] Dependent picklist visualization
- [x] CSV field inventory export
- [ ] Firefox support (Manifest V3 compat)
- [ ] Force-directed graph layout (physics-based)
- [ ] Field-level dependency tracking (which flows/triggers use a field)
- [ ] Org-to-org schema comparison
- [ ] Chrome Web Store publication
- [ ] i18n (French, Spanish, German)

See the [open issues](https://github.com/zmissoum/Schelio/issues) for a full list of proposed features and known bugs.

## Contributing

Contributions are what make open source great. Whether it's a bug fix, a new feature, or improved docs — **all contributions are welcome**.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines.

## License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

## Acknowledgments

- Inspired by the Salesforce community's frustration with the native Schema Builder
- ERD rendering approach inspired by [dbdiagram.io](https://dbdiagram.io)
- Mermaid syntax from the [Mermaid.js](https://mermaid.js.org/) project
- Dark theme inspired by blueprint/architectural drawing aesthetics

---

<p align="center">
  Built with care. Not affiliated with Salesforce®.<br>
  <sub>Salesforce and the Salesforce logo are trademarks of Salesforce, Inc.</sub>
</p>
