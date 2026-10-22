// Headless smoke test for Schelio v4 — loads app.html in jsdom with a mocked Salesforce API,
// exercises core + the four new modules and asserts on DOM/state.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'app.html'), 'utf8')
  .replace(/<link[^>]+googleapis[^>]*>/g, '')
  .replace(/<script src="[^"]+"><\/script>/g, '');

// ── Fixture org: shared with demo/record.js ───────────────
const fixture = require(path.join(ROOT, 'demo', 'fixture.js'));
const ORG = fixture.ORG;
const sobjects = Object.values(ORG).map(o => ({ name: o.name, label: o.label, custom: o.custom, queryable: true }));
const calls = [];
function mockFetch(url) {
  calls.push(url);
  const res = fixture.respond(url);
  if (!res) return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found', json: () => Promise.resolve({}) });
  return Promise.resolve({ ok: res.status < 400, status: res.status, statusText: res.status < 400 ? 'OK' : 'Error', json: () => Promise.resolve(res.body) });
}

// ── Boot ──────────────────────────────────────────────────
const dom = new JSDOM(html, { url: 'http://localhost/app.html?instanceUrl=https%3A%2F%2Ftest.my.salesforce.com&sessionId=SID', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.fetch = mockFetch;
w.chrome = { runtime: { getURL: p => p } };
w.confirm = () => true;
w.SVGElement.prototype.getBBox = () => ({ x: 0, y: 0, width: 100, height: 20 });
w.Element.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, width: 1400, height: 900, right: 1400, bottom: 900 }; };
w.navigator.clipboard = { writeText: () => Promise.resolve() };
w.CSS = { escape: s => s.replace(/"/g, '\\"') };
w.TextEncoder = TextEncoder; w.Blob = Blob;
{ const m=new Map(); Object.defineProperty(w,'localStorage',{value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()}}); }
const errors = [];
w.addEventListener('error', e => errors.push(e.message));
w.console.error = (...a) => errors.push(a.map(String).join(' '));
for (const f of ['app.js', 'design.js', 'lint.js', 'mapping.js', 'pathfinder.js']) w.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = s => w.document.querySelector(s);
const $$ = s => [...w.document.querySelectorAll(s)];
let pass = 0, fail = 0;
const t = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); } };

(async () => {
  await sleep(700);
  const S = w.Schelio;
  console.log('\n[core]');
  t('API exposed', !!S && typeof S.on === 'function');
  t('object list rendered', $$('#objectList .obj-item').length === sobjects.length, $$('#objectList .obj-item').length);
  t('loading overlay hidden', $('#loadingOverlay').classList.contains('hidden'));

  for (const o of ['Account', 'Contact', 'Opportunity', 'Invoice__c']) await S.toggleObject(o);
  await sleep(50);
  t('4 cards on canvas', $$('#erdNodes .erd-node').length === 4, $$('#erdNodes .erd-node').length);
  const pairs = $$('#erdRelationships .rel-line').map(l => l.dataset.pairs || '').join('|');
  t('relationships drawn (Contact/Opp/Invoice → Account, grouped per pair)', $$('#erdRelationships .rel-line').length >= 3 && /Contact>Account>AccountId/.test(pairs) && /Opportunity>Account>AccountId/.test(pairs) && /Invoice__c>Account>Account__c/.test(pairs), pairs);
  t('master-detail styled', $$('#erdRelationships .rel-line.master-detail').length === 1);

  console.log('\n[lint — Architect Score]');
  await S.toggleObject('Subscription__c'); await sleep(30);
  const sc = S.lint.scoreSync('Subscription__c');
  t('sync score computed', sc && typeof sc.score === 'number', JSON.stringify(sc));
  t('oversized picklist (212 values) = error', sc.findings.some(f => f.rule === 'picklist-size' && f.severity === 'error'));
  t('duplicate labels on Subscription__c', sc.findings.some(f => f.rule === 'dup-labels'));
  t('naming rule fired (plan_name__c, field_01__c…)', sc.findings.some(f => f.rule === 'naming'));
  const scA = S.lint.scoreSync('Account');
  t('duplicate labels detected on Account', scA.findings.some(f => f.rule === 'dup-labels'));
  t('external id not unique detected', scA.findings.some(f => f.rule === 'extid-unique'));
  t('inactive RT detected', scA.findings.some(f => f.rule === 'inactive-rt'));
  t('grade badge on card', $$('#erdNodes .erd-node[data-api="Subscription__c"] text').some(x => /^[A-F] \d+$/.test(x.textContent)));
  const full = await S.lint.scoreFull('Subscription__c');
  t('async orphan rule fired (0 records, lookup only → warn)', full.findings.some(f => f.rule === 'orphan' && f.severity === 'warn'), JSON.stringify(full.findings.map(f => f.rule + ':' + f.severity)));
  t('object-description rule fired (empty description)', full.findings.some(f => f.rule === 'object-description'));
  t('descriptions rule: 100% undocumented → error', full.findings.some(f => f.rule === 'descriptions' && f.severity === 'error'));
  t('score bounded 0..100 and graded D/F', full.score >= 0 && full.score <= 100 && /[DF]/.test(full.grade), full.score + ' ' + full.grade);
  const good = await S.lint.scoreFull('Invoice__c');
  t('healthy object (Invoice__c) grades A/B', /[AB]/.test(good.grade), good.score + ' ' + good.grade + ' ' + JSON.stringify(good.findings.map(f => f.rule)));
  await S.toggleObject('Subscription__c'); await sleep(30);
  await S.showDetail('Account'); await sleep(300);
  t('Score tab rendered with ring', !!$('#dtabScore .score-ring'));
  t('descriptions rule on Account surfaced in tab', $('#dtabScore').innerHTML.includes('no description'));
  $('#btnArchitectReview').click(); await sleep(400);
  t('org-wide review modal lists 4 objects', $$('#scoreReviewBody .score-row').length === 4, $$('#scoreReviewBody .score-row').length);
  $('#scoreReviewModal').classList.remove('visible');

  console.log('\n[design mode → SFDX]');
  $('#btnDesignMode').click(); await sleep(20);
  t('design bar visible', $('#designBar').classList.contains('visible'));
  t('existing cards get + field action', $$('#erdNodes .card-action').length >= 4);
  $('#btnDesignAddObject').click(); $('#dmObjLabel').value = 'Purchase Order'; $('#dmObjLabel').dispatchEvent(new w.Event('input'));
  t('api name auto-derived', $('#dmObjApi').value === 'Purchase_Order__c', $('#dmObjApi').value);
  $('#dmObjSharing').value = 'Private'; $('#dmObjSave').click(); await sleep(20);
  t('draft card rendered', !!$('#erdNodes .erd-node[data-api="draft:Purchase_Order__c"]'));
  S.design.openFieldModal('Purchase_Order__c', null); $('#dmFieldLabel').value = 'Total Amount'; $('#dmFieldLabel').dispatchEvent(new w.Event('input')); $('#dmFieldType').value = 'Currency'; $('#dmFieldType').dispatchEvent(new w.Event('change')); $('#dmFieldSave').click();
  S.design.openFieldModal('Purchase_Order__c', null); $('#dmFieldLabel').value = 'Account'; $('#dmFieldLabel').dispatchEvent(new w.Event('input')); $('#dmFieldType').value = 'MasterDetail'; $('#dmFieldType').dispatchEvent(new w.Event('change')); $('#dmFieldRefTo').value = 'Account'; $('#dmFieldSave').click();
  S.design.openFieldModal('Purchase_Order__c', null); $('#dmFieldLabel').value = 'Status'; $('#dmFieldLabel').dispatchEvent(new w.Event('input')); $('#dmFieldType').value = 'Picklist'; $('#dmFieldType').dispatchEvent(new w.Event('change')); $('#dmFieldPicklist').value = 'Draft\nApproved'; $('#dmFieldSave').click();
  S.design.openFieldModal('Account', null); $('#dmFieldLabel').value = 'Credit Risk Score'; $('#dmFieldLabel').dispatchEvent(new w.Event('input')); $('#dmFieldType').value = 'Number'; $('#dmFieldType').dispatchEvent(new w.Event('change')); $('#dmFieldSave').click();
  await sleep(20);
  const d = S.design.drafts;
  t('3 fields on draft object', d.objects.Purchase_Order__c.fields.length === 3, d.objects.Purchase_Order__c.fields.length);
  t('draft field on existing Account', (d.fields.Account || []).length === 1);
  t('draft field appears on Account card', $$('#erdNodes .erd-node[data-api="Account"] .field-draft').length === 1);
  t('draft MD relationship line drawn', $$('#erdRelationships .rel-draft').length === 1, $$('#erdRelationships .rel-draft').length);
  const pkg = S.design.buildSfdx();
  const names = Object.keys(pkg.files);
  t('object-meta.xml generated', names.includes('force-app/main/default/objects/Purchase_Order__c/Purchase_Order__c.object-meta.xml'));
  t('field-meta.xml generated for MD', names.includes('force-app/main/default/objects/Purchase_Order__c/fields/Account__c.field-meta.xml'));
  t('field on existing object generated', names.includes('force-app/main/default/objects/Account/fields/Credit_Risk_Score__c.field-meta.xml'));
  const md = pkg.files['force-app/main/default/objects/Purchase_Order__c/fields/Account__c.field-meta.xml'];
  t('MD xml has relationshipOrder + referenceTo', md.includes('<relationshipOrder>0</relationshipOrder>') && md.includes('<referenceTo>Account</referenceTo>') && md.includes('<type>MasterDetail</type>'));
  const pl = pkg.files['force-app/main/default/objects/Purchase_Order__c/fields/Status__c.field-meta.xml'];
  t('picklist xml has valueSet with 2 values', (pl.match(/<value>/g) || []).length === 2);
  t('package.xml lists 1 object + 4 fields', pkg.objMembers.length === 1 && pkg.fieldMembers.length === 4 && pkg.files['manifest/package.xml'].includes('<name>CustomField</name>'));
  const zip = S.design.makeZip(pkg.files);
  t('zip blob produced', zip && zip.size > 1000, zip && zip.size);
  // validate zip structure with python's zipfile
  const buf = Buffer.from(await zip.arrayBuffer()); fs.writeFileSync(path.join(require('os').tmpdir(), 'schelio-smoke.zip'), buf);
  t('persisted to localStorage', !!w.localStorage.getItem('schelio_drafts_https___test_my_salesforce_com'));
  $('#btnDesignMode').click();

  console.log('\n[mapping overlay]');
  $$('.sidebar-tab').find(x => x.dataset.tab === 'mapping').click(); await sleep(20);
  t('mapping tab panel active', $('#tabMapping').classList.contains('active'));
  $('#btnMappingSample').click(); await sleep(200);
  t('D365 sample loaded (12 tables)', $$('#mappingTargetList .obj-item').length === 12, $$('#mappingTargetList .obj-item').length);
  $('#btnMappingAuto').click(); await sleep(50);
  const mp = S.mapping.mapping;
  t('Account → account auto-mapped', mp.objects.Account && mp.objects.Account.target === 'account', JSON.stringify(Object.fromEntries(Object.entries(mp.objects).map(([k, v]) => [k, v.target]))));
  t('Contact → contact auto-mapped', mp.objects.Contact && mp.objects.Contact.target === 'contact');
  t('Opportunity → opportunity auto-mapped', mp.objects.Opportunity && mp.objects.Opportunity.target === 'opportunity');
  t('Industry → industrycode field auto-mapped', mp.objects.Account.fields.Industry === 'industrycode', JSON.stringify(mp.objects.Account.fields));
  t('target cards rendered', $$('#erdNodes .erd-node-target').length >= 3, $$('#erdNodes .erd-node-target').length);
  t('mapping lines drawn', $$('#erdRelationships .rel-mapping').length >= 3, $$('#erdRelationships .rel-mapping').length);
  S.mapping.openMappingModal('Account', 'account'); await sleep(20);
  t('field mapping modal lists Account fields', $$('#mappingModalBody .mapping-row').length === ORG.Account.fields.length);
  const sel = $('#mappingModalBody select[data-src="Name"]'); sel.value = 'name'; sel.dispatchEvent(new w.Event('change'));
  t('manual field mapping saved', mp.objects.Account.fields.Name === 'name');
  $('#mappingModal').classList.remove('visible');
  let dl = null; S.download = (n, c) => { dl = { n, c }; };
  $('#btnMappingCsv').click();
  t('CSV export has header + rows', dl && dl.n.endsWith('.csv') && dl.c.split('\n').length > 3 && dl.c.includes('"Account","Name","string","account","name"'), dl && dl.c.split('\n').slice(0, 3).join(' | '));
  $('#btnMappingExportSchema').click();
  t('schema export JSON has 4 objects', dl && dl.n.endsWith('.json') && JSON.parse(dl.c).objects.length === 4);

  console.log('\n[path finder]');
  await S.toggleObject('OpportunityLineItem'); await S.toggleObject('Product2'); await sleep(30);
  const adj = S.pathfinder.buildGraph(false);
  const paths = S.pathfinder.findPaths(adj, 'Contact', 'Product2');
  t('path Contact → Product2 found', paths.length > 0);
  t('shortest is 4 hops (Contact▲Account▼Opportunity▼OLI▲Product2)', paths[0] && paths[0].length === 4 && paths[0].map(e => e.dir).join('') === 'upddownup'.replace('ddown', 'downdown'), paths[0] && paths[0].map(e => e.dir + ':' + e.rel).join(' '));
  const q = S.pathfinder.soqlFor('Contact', paths[0]);
  t('mixed path → multi-step SOQL with note', q.length === 4 && /cannot express/.test(q[0].note), q.length);
  const up = S.pathfinder.findPaths(adj, 'Invoice__c', 'User');
  t('no path to User without system lookups', up.length === 0);
  const up2 = S.pathfinder.findPaths(S.pathfinder.buildGraph(true), 'Invoice__c', 'User');
  t('Invoice__c → User direct via OwnerId with system lookups', up2.length > 0 && up2[0].length === 1 && up2[0][0].rel === 'Owner');
  await S.toggleObject('Invoice_Line__c'); await sleep(30);
  const chain = S.pathfinder.findPaths(S.pathfinder.buildGraph(false), 'Invoice_Line__c', 'Account');
  t('Invoice_Line__c → Account is a 2-hop parent chain', chain.length > 0 && chain[0].length === 2 && chain[0].every(e => e.dir === 'up'));
  t('up-only path → single query dot notation', S.pathfinder.soqlFor('Invoice_Line__c', chain[0])[0].soql.includes('Invoice__r.Account__r.Id'), S.pathfinder.soqlFor('Invoice_Line__c', chain[0])[0].soql);
  const down = S.pathfinder.findPaths(adj, 'Account', 'Opportunity');
  t('Account → Opportunity single child subquery', down.length > 0 && S.pathfinder.soqlFor('Account', down[0])[0].soql.includes('(SELECT Id, Name FROM Opportunities)'), down[0] && S.pathfinder.soqlFor('Account', down[0])[0].soql);
  $('#btnPathFinder').click(); await sleep(20);
  $('#pfFrom').value = 'Contact'; $('#pfTo').value = 'Product2'; $('#pfTo').dispatchEvent(new w.Event('change')); await sleep(20);
  t('modal renders path chain', $$('#pfResults .pf-path').length >= 1 && $$('#pfResults .pf-node').length >= 5);
  $('#pfResults .pf-highlight').click(); await sleep(100);
  t('highlight dims non-path nodes', $$('#erdNodes .erd-node.pf-dim').length > 0 && $$('#erdNodes .erd-node.pf-on').length === 5, $$('#erdNodes .erd-node.pf-on').length);
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); await sleep(20);
  t('Escape clears highlight', $$('#erdNodes .erd-node.pf-dim').length === 0);

  console.log('\n[errors]');
  t('no runtime errors', errors.length === 0, errors.join(' || '));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE CRASH', e); process.exit(2); });
