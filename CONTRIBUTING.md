# Contributing to Schelio

First off, thank you for considering contributing! Every contribution helps make this tool better for the Salesforce community.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Style Guide](#style-guide)
- [Commit Messages](#commit-messages)
- [Pull Requests](#pull-requests)

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold it.

## How Can I Contribute?

### Reporting Bugs

Before submitting a bug report, please check [existing issues](https://github.com/YOUR_USERNAME/schelio/issues) to avoid duplicates.

When filing a bug, include:
- Chrome version and OS
- Salesforce edition (Developer, Enterprise, etc.)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Console errors (right-click → Inspect → Console tab)

### Suggesting Features

Feature requests are welcome! Please open an issue with:
- A clear description of the feature
- The problem it solves
- Mockups or examples if possible
- Whether you'd be willing to implement it

### Your First Contribution

Look for issues tagged with:
- `good first issue` — Simple, well-scoped tasks
- `help wanted` — We'd love community input
- `documentation` — Improve docs, fix typos

## Getting Started

### Prerequisites

- Google Chrome (v110+) or any Chromium-based browser
- A Salesforce org (Developer Edition works fine — [sign up free](https://developer.salesforce.com/signup))
- Basic knowledge of JavaScript, HTML, CSS
- A text editor (VS Code recommended)

### Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/schelio.git
cd schelio

# Load in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" → select this folder
# 4. The extension icon appears in your toolbar
```

There's **no build step** — the project is vanilla JS. Edit a file, reload the extension, and see changes immediately.

### Reloading After Changes

- **Popup changes** (`popup.html`, `popup.js`): Close and reopen the popup
- **Content script** (`content.js`): Refresh the Salesforce tab
- **App changes** (`app.html`, `app.css`, `app.js`): Refresh the Schema+ tab
- **Manifest changes**: Click the reload button on `chrome://extensions/`

## Development Workflow

1. **Fork** the repository
2. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/my-awesome-feature
   ```
3. **Make your changes** with clear, atomic commits
4. **Test** manually in Chrome with a real Salesforce org
5. **Push** to your fork and open a **Pull Request**

### Project Structure

```
├── manifest.json      # Extension config — edit carefully
├── background.js      # Service worker — cookie/tab logic
├── content.js         # Runs on SF pages — session extraction
├── popup.html/js      # Extension popup UI
├── app.html           # Main ERD viewer page
├── app.css            # All styles (dark theme)
├── app.js             # Core logic (API, rendering, exports)
└── icons/             # Extension icons
```

### Key Areas for Contribution

| Area | Files | Description |
|------|-------|-------------|
| ERD rendering | `app.js` (renderNodes, renderRelationships) | SVG card layout, bezier curves |
| Salesforce API | `app.js` (sfApi, fetchObjectDescribe) | REST API calls, metadata parsing |
| Exports | `app.js` (exportPng, exportSvg, generateMermaid, exportPdfSpec) | All export formats |
| UI/UX | `app.css`, `app.html` | Styles, layout, responsiveness |
| Session handling | `content.js`, `popup.js`, `background.js` | Auth flow, cookie management |
| New features | All files | See roadmap in README |

## Style Guide

### JavaScript

- **Vanilla JS only** — no frameworks, no build tools, no npm dependencies
- Use `const` and `let`, never `var`
- Use arrow functions for callbacks
- Use template literals for HTML generation
- Prefix DOM queries with `$` helper: `const el = $('#myElement')`
- Keep functions short and focused
- Add comments for non-obvious logic

```javascript
// Good
const fields = meta.fields
  .filter(f => !f.deprecatedAndHidden)
  .sort((a, b) => a.label.localeCompare(b.label));

// Avoid
var fields = [];
for (var i = 0; i < meta.fields.length; i++) {
  if (!meta.fields[i].deprecatedAndHidden) fields.push(meta.fields[i]);
}
```

### CSS

- Use CSS custom properties (variables) defined in `:root`
- Follow the existing naming convention (BEM-ish)
- Keep the dark theme consistent — use `var(--bg-*)`, `var(--text-*)`, `var(--accent-*)`
- No external CSS frameworks

### HTML

- Semantic HTML where possible
- IDs for JS-targeted elements, classes for styling
- SVG for all ERD rendering (not Canvas)

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

<optional body>
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code formatting (no logic change) |
| `refactor` | Code restructuring (no feature/fix) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `chore` | Tooling, configs, deps |

### Examples

```
feat(export): add PlantUML export format
fix(erd): relationship lines not updating on card drag
docs(readme): add Firefox compatibility notes
style(css): align card header padding
refactor(api): extract session handling into separate module
```

## Pull Requests

### Before Submitting

- [ ] Your code follows the style guide above
- [ ] You've tested with a real Salesforce org
- [ ] You've tested with both Standard and Custom objects
- [ ] No console errors or warnings
- [ ] The extension loads without issues on `chrome://extensions/`
- [ ] You've updated the README if needed

### PR Description

Use the PR template. At minimum, include:
- **What** this PR does
- **Why** it's needed
- **How** to test it
- **Screenshots** for UI changes

### Review Process

1. A maintainer will review your PR
2. They may request changes — this is normal and constructive
3. Once approved, a maintainer will merge it
4. Your contribution will be credited in the changelog

## Questions?

Open a [Discussion](https://github.com/YOUR_USERNAME/schelio/discussions) or reach out in an issue. We're happy to help!

---

Thank you for helping make Schelio better for everyone.
