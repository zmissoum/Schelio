/* ============================================================
   Schelio — product video recorder
   Boots the real extension UI against the mocked org in
   demo/fixture.js, drives it with Playwright (visible cursor,
   captions), records 1920×1080, then assembles MP4s with ffmpeg
   (title card + demo + outro, silent AAC track for LinkedIn).

   node demo/record.js [outDir] [videoId…]
   ============================================================ */
'use strict';
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const fixture = require('./fixture');

const ROOT = path.join(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'demo', 'out'));
const ONLY = process.argv.slice(3);
const W = 1920, H = 1080, FPS = 30;
const VW = 1280, VH = 720; // viewport; recorded at W×H → 1.5× zoom so the UI reads well in a feed
const ORG_URL = 'https://demo.my.salesforce.com';
const GITHUB = 'github.com/zmissoum/Schelio';
fs.mkdirSync(OUT, { recursive: true });
const TMP = path.join(OUT, '.tmp'); fs.mkdirSync(TMP, { recursive: true });

// ── Static server for the extension files ──────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});

// ── In-page helpers (cursor, captions, PDF overlay, fonts) ──
const INIT = `
window.chrome = window.chrome || { runtime: { getURL: p => p } };
document.addEventListener('DOMContentLoaded', () => {
  const st = document.createElement('style'); st.textContent = \`
    :root{--font-mono:'DejaVu Sans Mono',monospace;--font-sans:'Inter',system-ui,sans-serif}
    body{font-family:var(--font-sans)} ::-webkit-scrollbar{width:0;height:0}
    #__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:26px;transition:transform .02s linear;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
    #__rip{position:fixed;left:0;top:0;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #38BDF8;opacity:0;transform:scale(.3)}
    #__rip.go{animation:__r .45s ease-out} @keyframes __r{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(1.3)}}
    #__cap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%) translateY(20px);z-index:2147483640;pointer-events:none;max-width:860px;padding:12px 22px 12px 18px;border-radius:14px;background:rgba(6,13,27,.92);border:1px solid rgba(56,189,248,.35);border-left:6px solid #38BDF8;color:#F1F5F9;font-family:'Inter',system-ui,sans-serif;font-size:21px;font-weight:600;letter-spacing:-.2px;line-height:1.3;box-shadow:0 14px 40px rgba(0,0,0,.5);opacity:0;transition:opacity .25s,transform .25s}
    #__cap.on{opacity:1;transform:translateX(-50%) translateY(0)}
    #__cap small{display:block;font-size:14px;font-weight:400;color:#94A3B8;margin-top:4px}
    #__pdfov{position:fixed;inset:40px 90px;z-index:2147483630;background:#fff;border-radius:14px;box-shadow:0 30px 90px rgba(0,0,0,.6);overflow:hidden;border:1px solid #D8DDE6}
    #__pdfov iframe{width:100%;height:100%;border:0}
    .toast{bottom:120px}
  \`; document.head.appendChild(st);
  const cur = document.createElement('div'); cur.id = '__cur';
  cur.innerHTML = '<svg viewBox="0 0 26 26"><path d="M4 2 L4 20 L9 15.5 L12.5 23 L16 21.5 L12.5 14 L19 14 Z" fill="#fff" stroke="#0B1121" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const rip = document.createElement('div'); rip.id = '__rip'; const cap = document.createElement('div'); cap.id = '__cap';
  document.body.append(cur, rip, cap);
  document.addEventListener('mousemove', e => { cur.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
  document.addEventListener('mousedown', e => { rip.style.transform = ''; rip.style.left = e.clientX + 'px'; rip.style.top = e.clientY + 'px'; rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go'); }, true);
  window.__cap = (t, s) => { if (!t) { cap.classList.remove('on'); return; } cap.innerHTML = t + (s ? '<small>' + s + '</small>' : ''); cap.classList.add('on'); };
  window.open = function () { const ov = document.createElement('div'); ov.id = '__pdfov'; const ifr = document.createElement('iframe'); ov.appendChild(ifr); document.body.appendChild(ov); let buf = '';
    return { document: { write: s => { buf += s; }, close: () => { ifr.srcdoc = buf.replace(/@import url\\([^)]*\\);?/g, '').replace(/<div class="no-print">[\\s\\S]*?<\\/div>/, ''); } }, close: () => ov.remove(), focus(){} }; };
  window.__closePdf = () => { const o = document.getElementById('__pdfov'); if (o) o.remove(); };
});`;

// ── Driver helpers ──────────────────────────────────────
function helpers(page) {
  const wait = ms => page.waitForTimeout(ms);
  const box = async sel => { const el = page.locator(sel).first(); await el.waitFor({ state: 'visible', timeout: 8000 }); await el.scrollIntoViewIfNeeded(); return el.boundingBox(); };
  const moveTo = async (x, y, steps = 26) => { await page.mouse.move(x, y, { steps }); };
  const click = async (sel, o = {}) => { const b = await box(sel); const x = b.x + b.width * (o.fx ?? 0.5), y = b.y + b.height * (o.fy ?? 0.5); await moveTo(x, y); await wait(o.hold ?? 180); await page.mouse.click(x, y, o.dbl ? { clickCount: 2 } : {}); await wait(o.after ?? 350); };
  const dbl = (sel, o = {}) => click(sel, Object.assign({ dbl: true }, o));
  const type = async (sel, text, delay = 48) => { await click(sel, { after: 120 }); await page.keyboard.type(text, { delay }); await wait(200); };
  // hover (no click: a native <select> popup would swallow the next Escape), set the value, blur
  const select = async (sel, value) => { const b = await box(sel); await moveTo(b.x + b.width / 2, b.y + b.height / 2); await wait(180); await page.selectOption(sel, value); await page.locator(sel).first().evaluate(el => el.blur()); await wait(350); };
  const cap = async (t, s, ms) => { await page.evaluate(([t, s]) => window.__cap(t, s), [t, s]); if (ms) await wait(ms); };
  const capOff = () => page.evaluate(() => window.__cap(''));
  const drag = async (sel, dx, dy) => { const b = await box(sel); const x = b.x + b.width / 2, y = b.y + 24; await moveTo(x, y); await page.mouse.down(); await moveTo(x + dx, y + dy, 40); await page.mouse.up(); await wait(300); };
  const scroll = async (sel, dy, times = 3) => { const b = await box(sel); await moveTo(b.x + b.width / 2, b.y + b.height / 2); for (let i = 0; i < times; i++) { await page.mouse.wheel(0, dy); await wait(260); } };
  const pick = async (...apis) => { for (const a of apis) { await click('#objectList .obj-item[data-api="' + a + '"]', { after: 260 }); } };
  const layout = async () => { await click('#btnAutoLayout', { after: 500 }); };
  const esc = async () => { await page.keyboard.press('Escape'); await wait(200); await page.evaluate(() => { document.querySelectorAll('.modal-overlay.visible').forEach(m => m.classList.remove('visible')); if (window.Schelio) window.Schelio.runHooks('escape'); }); await wait(250); };
  const park = async () => { await moveTo(VW - 90, VH - 110); };
  return { wait, box, moveTo, click, dbl, type, select, cap, capOff, drag, scroll, pick, layout, esc, park };
}

// ── Scenes ──────────────────────────────────────────────
async function scenePresentation(page, h) {
  await h.cap('Schelio', 'The Salesforce Schema Builder, reimagined — free, open source, runs in your browser', 2200);
  await h.cap('Pick objects. Relationships draw themselves.', null);
  await h.pick('Account', 'Contact', 'Opportunity', 'Case', 'Invoice__c', 'Invoice_Line__c', 'Product2', 'OpportunityLineItem');
  await h.layout(); await h.wait(900);
  await h.cap('Drag, zoom, auto-layout. Lookup = blue, Master-Detail = indigo.', null);
  await h.drag('.erd-node[data-api="Case"]', 160, 90); await h.wait(400);
  await h.click('#btnZoomOut', { after: 250 }); await h.click('#btnZoomIn', { after: 400 });
  await h.cap('Double-click an object: everything about it in one panel.', null);
  await h.dbl('.erd-node[data-api="Invoice__c"]', { fy: 0.15, after: 900 });
  await h.click('.detail-tab[data-dtab="recordtypes"]', { after: 1100 });
  await h.click('.detail-tab[data-dtab="picklists"]', { after: 700 }); await h.click('#dtabPicklists .pl-accordion:nth-child(2) .pl-accordion-header', { after: 1300 });
  await h.click('.detail-tab[data-dtab="layouts"]', { after: 1200 });
  await h.click('.detail-tab[data-dtab="profiles"]', { after: 700 }); await h.click('#dtabProfiles .profile-accordion:nth-child(3) .profile-accordion-header', { after: 1400 });
  await h.cap('Architect Score — 15 rules grade every object A–F.', null);
  await h.click('.detail-tab[data-dtab="score"]', { after: 2200 });
  await h.click('#detailClose', { after: 300 });
  await h.click('#btnArchitectReview', { after: 2600 }); await h.esc();
  await h.cap('Design Mode — draft objects and fields on the canvas…', null);
  await h.click('#btnDesignMode', { after: 500 });
  await h.click('#btnDesignAddObject', { after: 400 }); await h.type('#dmObjLabel', 'Purchase Order'); await h.click('#dmObjSave', { after: 600 });
  await h.click('.erd-node[data-api="draft:Purchase_Order__c"] .card-action', { after: 400 }); await h.type('#dmFieldLabel', 'Account'); await h.select('#dmFieldType', 'MasterDetail'); await h.select('#dmFieldRefTo', 'Account'); await h.click('#dmFieldSave', { after: 700 });
  await h.cap('…then export a deployable SFDX package.', 'object-meta.xml · field-meta.xml · package.xml', null);
  await h.click('#btnPreviewSfdx', { after: 1800 }); await h.esc(); await h.click('#btnDesignMode', { after: 400 });
  await h.cap('Cross-CRM Mapping — overlay a Dynamics 365 schema and map it.', null);
  await h.click('.sidebar-tab[data-tab="mapping"]', { after: 400 }); await h.click('#btnMappingSample', { after: 700 }); await h.click('#btnMappingAuto', { after: 800 }); await h.click('#btnFitAll', { after: 1800 });
  await h.cap('Path Finder — the shortest path between two objects, with the SOQL.', null);
  await h.click('#btnPathFinder', { after: 500 }); await h.select('#pfFrom', 'Case'); await h.select('#pfTo', 'Product2'); await h.wait(2200); await h.esc();
  await h.cap('Export: PDF technical spec, Mermaid, PNG, SVG.', null);
  await h.click('#btnExportPdf', { after: 1500 }); await h.scroll('#__pdfov', 900, 4); await page.evaluate(() => window.__closePdf()); await h.wait(300);
  await h.click('.sidebar-tab[data-tab="objects"]', { after: 200 }); await h.click('#btnFitAll', { after: 300 });
  await h.cap('Free · Open source · Nothing installed in your org', GITHUB, 2600);
}

async function sceneDesign(page, h) {
  await h.cap('Design Mode → SFDX', 'Draft on the canvas, deploy with the sf CLI', 1800);
  await h.pick('Account', 'Contact', 'Product2'); await h.layout(); await h.wait(500);
  await h.cap('Turn Design Mode on.', null); await h.click('#btnDesignMode', { after: 900 });
  await h.cap('Draft a new object…', null);
  await h.click('#btnDesignAddObject', { after: 400 }); await h.type('#dmObjLabel', 'Purchase Order'); await h.select('#dmObjSharing', 'Private'); await h.type('#dmObjDesc', 'Order placed by a customer, synced from the ERP.'); await h.click('#dmObjSave', { after: 900 });
  await h.cap('…and its fields: currency, picklist, master-detail.', null);
  const addF = async (label, type, extra) => { await h.click('.erd-node[data-api="draft:Purchase_Order__c"] .card-action', { after: 350 }); await h.type('#dmFieldLabel', label); await h.select('#dmFieldType', type); if (extra) await extra(); await h.click('#dmFieldSave', { after: 600 }); };
  await addF('Total Amount', 'Currency');
  await addF('Status', 'Picklist', async () => { await h.type('#dmFieldPicklist', 'Draft\nApproved\nShipped', 30); });
  await addF('Account', 'MasterDetail', async () => { await h.select('#dmFieldRefTo', 'Account'); });
  await h.cap('Draft fields on existing objects too.', null);
  await h.click('.erd-node[data-api="Account"] .card-action', { after: 350 }); await h.type('#dmFieldLabel', 'Credit Risk Score'); await h.select('#dmFieldType', 'Number'); await h.type('#dmFieldDesc', 'Computed credit risk, 0–100.'); await h.click('#dmFieldSave', { after: 800 });
  await h.click('#btnFitAll', { after: 600 });
  await h.cap('Preview the metadata XML — exactly what sf project retrieve produces.', null);
  await h.click('#btnPreviewSfdx', { after: 800 }); await h.scroll('#designPreviewBody', 500, 4); await h.wait(600); await h.esc();
  await h.cap('Export SFDX: object-meta.xml, field-meta.xml, package.xml, sfdx-project.json.', null);
  const dl = page.waitForEvent('download'); await h.click('#btnExportSfdx', { after: 300 }); await dl; await h.wait(1600);
  await h.cap('sf project deploy start --manifest manifest/package.xml', 'Workshop in the morning. Deploy in the afternoon.', 2800);
}

async function sceneScore(page, h) {
  await h.cap('Architect Score', 'Your data model, graded A–F', 1800);
  await h.cap('Every card gets a grade as soon as it loads.', null);
  await h.pick('Account', 'Opportunity', 'Case', 'Invoice__c', 'Project__c', 'Subscription__c'); await h.layout(); await h.wait(1600);
  await h.cap('Subscription__c: 0 records, duplicate labels, a 212-value picklist…', null);
  await h.dbl('.erd-node[data-api="Subscription__c"]', { fy: 0.15, after: 600 }); await h.click('.detail-tab[data-dtab="score"]', { after: 2000 }); await h.scroll('#detailBody', 400, 3); await h.wait(800);
  await h.cap('Account: a third of custom fields undocumented, external ID not unique.', null);
  await h.click('#detailClose', { after: 200 }); await h.dbl('.erd-node[data-api="Account"]', { fy: 0.15, after: 500 }); await h.click('.detail-tab[data-dtab="score"]', { after: 2400 });
  await h.click('#detailClose', { after: 300 });
  await h.cap('Org-wide review: lowest first, findings to CSV for the backlog.', null);
  await h.click('#btnArchitectReview', { after: 2600 });
  const dl = page.waitForEvent('download'); await h.click('#btnScoreReviewCsv', { after: 300 }); await dl; await h.wait(900); await h.esc();
  await h.cap('15 rules. Field limits, picklists, master-detail, descriptions, orphans, naming…', GITHUB, 2600);
}

async function sceneMapping(page, h) {
  await h.cap('Cross-CRM Mapping', 'Salesforce ⇄ Dynamics 365, visual', 1800);
  await h.pick('Account', 'Contact', 'Opportunity', 'Case'); await h.layout(); await h.wait(400);
  await h.cap('Load a target schema — a Dynamics 365 sample ships with Schelio.', null);
  await h.click('.sidebar-tab[data-tab="mapping"]', { after: 500 }); await h.click('#btnMappingSample', { after: 1200 });
  await h.cap('Auto-map objects and fields by name.', null);
  await h.click('#btnMappingAuto', { after: 900 }); await h.click('#btnFitAll', { after: 1800 });
  await h.cap('Fix the rest in a two-column view…', null);
  await h.click('#mappingTargetList .mapping-map-btn[data-map="account"]', { after: 400 }); await h.click('#mappingPickGo', { after: 900 });
  await h.scroll('#mappingModalBody', 300, 2); await h.wait(300);
  await h.select('#mappingModalBody select[data-src="Website"]', 'websiteurl'); await h.select('#mappingModalBody select[data-src="Phone"]', 'telephone1');
  await h.click('#mappingOnlyUnmapped', { after: 900 }); await h.click('#mappingModal .modal-btn-primary', { after: 500 });
  await h.cap('…and export the mapping as CSV or JSON for the migration spec.', null);
  const dl = page.waitForEvent('download'); await h.click('#btnMappingCsv', { after: 300 }); await dl; await h.wait(1200);
  await h.click('#btnFitAll', { after: 300 });
  await h.cap('Works org-to-org too: export your org as a target schema.', GITHUB, 2600);
}

async function scenePath(page, h) {
  await h.cap('Relationship Path Finder', '"How do I get from Case to Product2?"', 1800);
  await h.pick('Case', 'Contact', 'Account', 'Opportunity', 'OpportunityLineItem', 'Product2', 'Invoice__c', 'Invoice_Line__c'); await h.layout(); await h.wait(500);
  await h.cap('Ctrl+P — pick two objects.', null);
  await page.keyboard.press('Control+p'); await h.wait(500); await h.select('#pfFrom', 'Case'); await h.select('#pfTo', 'Product2'); await h.wait(500);
  await h.cap('Shortest path first, with the SOQL that walks it.', null); await h.wait(2000); await h.scroll('#pathfinderModal .modal-body', 300, 2); await h.wait(800);
  await h.click('#pfResults .pf-copy', { after: 800 });
  await h.cap('Highlight it on the canvas.', null);
  await h.click('#pfResults .pf-highlight', { after: 2200 }); await h.esc();
  await h.cap('Parent chains in dot-notation, child subqueries, chained steps when the direction flips.', null);
  await h.click('#btnPathFinder', { after: 400 }); await h.select('#pfFrom', 'Invoice_Line__c'); await h.select('#pfTo', 'Account'); await h.wait(2200); await h.esc();
  await h.cap('Free · Open source', GITHUB, 2400);
}

async function sceneMetadata(page, h) {
  await h.cap('Metadata explorer & PDF spec', 'One panel instead of thirty Setup clicks', 1800);
  await h.pick('Account', 'Contact', 'Opportunity', 'Invoice__c'); await h.layout(); await h.wait(400);
  await h.cap('Record Types — active, inactive, default.', null);
  await h.dbl('.erd-node[data-api="Account"]', { fy: 0.15, after: 600 }); await h.click('.detail-tab[data-dtab="recordtypes"]', { after: 1800 });
  await h.cap('Picklist values, grouped by Record Type.', null);
  await h.click('.detail-tab[data-dtab="picklists"]', { after: 500 }); await h.click('#dtabPicklists .pl-accordion:nth-child(4) .pl-accordion-header', { after: 1900 });
  await h.cap('Page layouts, Lightning record pages, RT → layout mapping.', null);
  await h.click('.detail-tab[data-dtab="layouts"]', { after: 1800 });
  await h.cap('Profiles: CRUD, field-level security, layout assignments.', null);
  await h.click('.detail-tab[data-dtab="profiles"]', { after: 500 }); await h.click('#dtabProfiles .profile-accordion:nth-child(3) .profile-accordion-header', { after: 900 }); await h.click('#dtabProfiles .profile-accordion:nth-child(3) .fls-filter-btn[data-fls-filter="restricted"]', { after: 1500 });
  await h.click('#detailClose', { after: 300 });
  await h.cap('PDF Spec: cover, table of contents, field dictionaries, relationship map.', null);
  await h.click('#btnExportPdf', { after: 1200 }); await h.scroll('#__pdfov', 1000, 7); await h.wait(600); await page.evaluate(() => window.__closePdf());
  await h.cap('Mermaid, PNG, SVG too.', null); await h.click('#btnExportMermaid', { after: 1500 }); await h.esc();
  await h.cap('Free · Open source', GITHUB, 2200);
}

const VIDEOS = [
  { id: '00-presentation', title: 'Schelio', sub: 'The Salesforce Schema Builder, reimagined', scene: scenePresentation },
  { id: '01-design-mode', title: 'Design Mode → SFDX', sub: 'Draft on the canvas. Deploy with sf.', scene: sceneDesign },
  { id: '02-architect-score', title: 'Architect Score', sub: 'Your Salesforce data model, graded A–F', scene: sceneScore },
  { id: '03-mapping', title: 'Cross-CRM Mapping', sub: 'Salesforce ⇄ Dynamics 365, visual', scene: sceneMapping },
  { id: '04-path-finder', title: 'Relationship Path Finder', sub: 'Shortest path + the SOQL to walk it', scene: scenePath },
  { id: '05-metadata-pdf', title: 'Metadata Explorer & PDF Spec', sub: 'Record types, picklists, layouts, profiles, FLS', scene: sceneMetadata },
];

// ── Title / outro cards ─────────────────────────────────
const LOGO = '<svg width="64" height="64" viewBox="0 0 300 300"><text x="90" y="235" font-family="Inter,system-ui" font-weight="800" font-size="230" fill="#fff">S</text><circle cx="225" cy="50" r="22" fill="#1B96FF"/></svg>';
const card = (title, sub, outro) => `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:${W}px;height:${H}px;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 30% 70%,rgba(27,150,255,.18),transparent 55%),radial-gradient(circle at 75% 25%,rgba(0,180,230,.12),transparent 50%),linear-gradient(160deg,#021B3A,#032D60 45%,#0A4A8A);font-family:Inter,system-ui,sans-serif;color:#fff;overflow:hidden}
.dots{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:26px 26px}
.w{position:relative;text-align:center;max-width:1400px;padding:0 60px}.brand{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:${outro?40:30}px}.brand span{font-size:44px;font-weight:800;letter-spacing:-1.5px}
h1{font-size:${outro?64:96}px;font-weight:800;letter-spacing:-3px;line-height:1.05;margin:0 0 22px}p{font-size:${outro?34:40}px;color:#AFC6E6;margin:0;font-weight:400}
.tags{display:flex;gap:12px;justify-content:center;margin-top:46px}.t{font-family:'DejaVu Sans Mono',monospace;font-size:19px;padding:10px 18px;border-radius:8px;border:1px solid}
.gh{margin-top:40px;font-family:'DejaVu Sans Mono',monospace;font-size:30px;color:#38BDF8}.bar{position:absolute;left:0;right:0;bottom:0;height:8px;background:#1B96FF;opacity:.5}
</style></head><body><div class="dots"></div><div class="w"><div class="brand">${LOGO}<span>Schelio</span></div><h1>${title}</h1><p>${sub}</p>
${outro?'<div class="gh">'+GITHUB+'</div>':'<div class="tags"><span class="t" style="color:#80B4FF;border-color:#80B4FF55;background:#80B4FF18">Interactive ERD</span><span class="t" style="color:#34D399;border-color:#34D39955;background:#34D39918">Architect Score</span><span class="t" style="color:#FBBF24;border-color:#FBBF2455;background:#FBBF2418">Design → SFDX</span><span class="t" style="color:#FF6B2B;border-color:#FF6B2B55;background:#FF6B2B18">Cross-CRM Mapping</span><span class="t" style="color:#A78BFA;border-color:#A78BFA55;background:#A78BFA18">Path Finder</span></div>'}
</div><div class="bar"></div></body></html>`;

function ff(args) { execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' }); }

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true });

  // cards
  const cardPage = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  const shot = async (html, file) => { await cardPage.setContent(html); await cardPage.waitForTimeout(150); await cardPage.screenshot({ path: file }); };
  const outroPng = path.join(TMP, 'outro.png'); await shot(card('Free. Open source. Nothing installed in your org.', 'MIT licensed · contributions welcome', true), outroPng);

  for (const v of VIDEOS) {
    if (ONLY.length && !ONLY.some(o => v.id.includes(o))) continue;
    console.log('▶ recording', v.id);
    const titlePng = path.join(TMP, v.id + '-title.png'); await shot(card(v.title, v.sub, false), titlePng);
    const vdir = path.join(TMP, v.id); fs.rmSync(vdir, { recursive: true, force: true });
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, recordVideo: { dir: vdir, size: { width: W, height: H } }, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.route(ORG_URL + '/**', r => { const req = r.request(); const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }; if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors }); const res = fixture.respond(req.url()); if (!res) return r.fulfill({ status: 404, headers: cors, body: '[]' }); r.fulfill({ status: res.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: JSON.stringify(res.body) }); });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(base + '/app.html?instanceUrl=' + encodeURIComponent(ORG_URL) + '&sessionId=demo', { waitUntil: 'load' });
    await page.waitForSelector('#loadingOverlay.hidden', { timeout: 15000 }); await page.waitForTimeout(400);
    const h = helpers(page); await h.park();
    try { await v.scene(page, h); } catch (e) { console.error('  scene failed:', e.message); }
    await h.capOff(); await page.waitForTimeout(600);
    const video = page.video(); await page.close(); await ctx.close();
    const webm = await video.path();
    if (errs.length) console.warn('  page errors:', errs.join(' | '));

    // assemble: title (2.4s) + demo + outro (2.6s), 30fps h264, silent aac
    const t = path.join(TMP, v.id + '-t.mp4'), d = path.join(TMP, v.id + '-d.mp4'), o = path.join(TMP, v.id + '-o.mp4'), list = path.join(TMP, v.id + '.txt');
    const vf = `scale=${W}:${H}:flags=lanczos,format=yuv420p,fps=${FPS}`;
    ff(['-loop', '1', '-i', titlePng, '-t', '2.4', '-vf', vf + ',fade=t=out:st=2.0:d=0.4', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', t]);
    ff(['-ss', '0.25', '-i', webm, '-vf', vf + ',fade=t=in:st=0:d=0.35', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-an', d]);
    ff(['-loop', '1', '-i', outroPng, '-t', '2.6', '-vf', vf + ',fade=t=in:st=0:d=0.4', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', o]);
    fs.writeFileSync(list, [t, d, o].map(p => "file '" + p.replace(/'/g, "'\\''") + "'").join('\n'));
    const out = path.join(OUT, 'schelio-video-' + v.id + '.mp4');
    ff(['-f', 'concat', '-safe', '0', '-i', list, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out]);
    const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
    console.log('  ✓', path.basename(out), Math.round(parseFloat(dur)) + 's', Math.round(fs.statSync(out).size / 1024) + ' KB');
  }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
