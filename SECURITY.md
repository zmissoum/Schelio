# Security Policy

## Scope

Schelio is a Chrome extension that interacts with Salesforce orgs using the user's existing session. Security is taken seriously.

## Architecture & Data Flow

1. The extension reads the Salesforce session cookie (`sid`) from the browser
2. API calls are made **directly** from the browser to the user's Salesforce instance
3. **No data is sent to any third-party server** — ever
4. Session tokens are passed via URL parameters to the app tab and held in memory only
5. Layout data is stored in `localStorage` (browser-local, per-origin)

## What We Don't Do

- No external API calls outside of salesforce.com domains
- No analytics, telemetry, or tracking
- No server-side component
- No data persistence beyond localStorage layout saves
- No transmission of org data, metadata, or credentials to external services

## Supported Versions

| Version | Supported |
|---------|-----------|
| 2.x     | ✅ Active |
| 1.x     | ❌ EOL    |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public issue.**

Instead, email: **[YOUR_EMAIL]**

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix release**: Within 2 weeks for critical issues

### Disclosure

We follow coordinated disclosure. We'll work with you on a timeline and credit you (unless you prefer anonymity) when the fix is released.

## Best Practices for Users

- **Never share your Session ID** publicly or in issues
- **Use sandbox/developer orgs** for testing and exploration
- **Review permissions**: The extension only requests `activeTab` and `cookies` — nothing more
- **Keep Chrome updated** for the latest security patches
- **Remove the extension** from production browsers if not actively using it
