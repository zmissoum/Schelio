# Changelog

All notable changes to Schelio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
