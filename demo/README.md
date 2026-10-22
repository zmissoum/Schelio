# Product videos

`demo/record.js` boots the real extension UI against a mocked org (`demo/fixture.js`, 12 objects, record types, picklists per RT, layouts, profiles, FLS, descriptions, record counts), drives it with Playwright (visible cursor, captions) and assembles 1920×1080 MP4s with ffmpeg: title card + demo + outro, silent AAC track for LinkedIn.

```bash
npm install                         # jsdom (tests)
npx playwright install chromium     # once
node demo/record.js out/            # all six videos
node demo/record.js out/ design score   # only the ids matching
```

| Video | Scene |
|---|---|
| `schelio-video-00-presentation.mp4` | Full tour (~90 s) |
| `schelio-video-01-design-mode.mp4` | Design Mode → SFDX |
| `schelio-video-02-architect-score.mp4` | Architect Score |
| `schelio-video-03-mapping.mp4` | Cross-CRM Mapping |
| `schelio-video-04-path-finder.mp4` | Relationship Path Finder |
| `schelio-video-05-metadata-pdf.mp4` | Metadata explorer & PDF spec |

Captions and the GitHub URL live at the top of `record.js` (`GITHUB`). The fixture is also a convenient way to run the app with no org: serve the repo folder and open `app.html?instanceUrl=https://demo.my.salesforce.com&sessionId=demo` with the fixture routed in (see `record.js`).
