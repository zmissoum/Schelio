/* ============================================================
   Schelio — Relationship Path Finder module
   "How do I get from Case to Product2?"
   BFS over the relationship graph built from every object
   described so far (not only the ones on the canvas), returns
   the shortest paths, and writes the SOQL that walks them.
   ============================================================ */
(function () {
  'use strict';
  const S = window.Schelio; if (!S) return;
  const $ = s => document.querySelector(s);

  const SYSTEM_LOOKUPS = new Set(['OwnerId','CreatedById','LastModifiedById','MasterRecordId','RecordTypeId']);
  const MAX_DEPTH = 5, MAX_PATHS = 6;

  // Build adjacency from loaded describes.
  // edge = { from, to, dir:'up'|'down', field, rel }  (rel = relationshipName used in SOQL)
  function buildGraph(includeSystem){
    const adj = {};
    const add = e => { (adj[e.from] = adj[e.from] || []).push(e); };
    Object.values(S.objectMeta).forEach(meta => {
      meta.fields.forEach(f => {
        if (f.type !== 'reference' || !f.referenceTo || !f.relationshipName) return;
        if (!includeSystem && SYSTEM_LOOKUPS.has(f.name)) return;
        f.referenceTo.forEach(to => {
          add({ from: meta.name, to, dir: 'up', field: f.name, rel: f.relationshipName, md: !!f.cascadeDelete });
          // reverse edge (parent → child) is only usable when the child relationship name is known
          const cr = (S.objectMeta[to] && S.objectMeta[to].childRelationships || []).find(c => c.childSObject === meta.name && c.field === f.name);
          if (cr && cr.relationshipName) add({ from: to, to: meta.name, dir: 'down', field: f.name, rel: cr.relationshipName, md: !!cr.cascadeDelete });
        });
      });
      (meta.childRelationships || []).forEach(c => {
        if (!c.relationshipName) return;
        if (!includeSystem && SYSTEM_LOOKUPS.has(c.field)) return;
        if (!(adj[meta.name] || []).some(e => e.dir === 'down' && e.to === c.childSObject && e.field === c.field))
          add({ from: meta.name, to: c.childSObject, dir: 'down', field: c.field, rel: c.relationshipName, md: !!c.cascadeDelete });
      });
    });
    return adj;
  }

  // All shortest paths (plus, if few, the next length) — BFS over edges with simple-path check
  function findPaths(adj, from, to){
    if (from === to) return [];
    const results = []; let shortest = Infinity;
    const queue = [{ node: from, path: [], visited: new Set([from]) }];
    while (queue.length) {
      const { node, path, visited } = queue.shift();
      if (path.length >= Math.min(MAX_DEPTH, shortest + 1)) continue;
      (adj[node] || []).forEach(e => {
        if (visited.has(e.to)) return;
        const np = path.concat([e]);
        if (e.to === to) { if (np.length < shortest) shortest = np.length; if (np.length <= shortest + 1 && results.length < MAX_PATHS) results.push(np); return; }
        if (np.length < Math.min(MAX_DEPTH, shortest + 1)) { const v = new Set(visited); v.add(e.to); queue.push({ node: e.to, path: np, visited: v }); }
      });
    }
    return results.sort((a,b)=>a.length-b.length || score(a)-score(b));
  }
  const score = p => p.reduce((n,e)=>n+(e.dir==='down'?2:1)+(SYSTEM_LOOKUPS.has(e.field)?3:0),0);

  // ── SOQL generation ────────────────────────────────────
  // up-chain:   SELECT Account.Owner.Name FROM Case
  // one down:   SELECT Id, (SELECT Id FROM Contacts) FROM Account
  // mixed:      split into the longest expressible pieces
  function soqlFor(from, path){
    const ups = [], out = [];
    let i = 0;
    // leading upward chain
    while (i < path.length && path[i].dir === 'up') { ups.push(path[i]); i++; }
    const last = path[path.length-1];
    if (ups.length === path.length) {
      const chain = ups.map(e=>e.rel).join('.');
      return [{ title:'Single query (parent chain)', soql:'SELECT Id, '+chain+'.Id, '+chain+'.Name\nFROM '+from+'\nWHERE '+chain+'.Id != null', note: ups.length>5?'SOQL allows at most 5 levels of parent-to-child traversal.':'' }];
    }
    if (ups.length === 0 && path.length === 1 && path[0].dir === 'down') {
      return [{ title:'Single query (child subquery)', soql:'SELECT Id, Name,\n  (SELECT Id, Name FROM '+path[0].rel+')\nFROM '+from }];
    }
    // generic: walk, emitting a query per segment
    let cursor = from; let segStart = 0;
    while (segStart < path.length) {
      let j = segStart; const upChain = [];
      while (j < path.length && path[j].dir === 'up') { upChain.push(path[j]); j++; }
      if (upChain.length) {
        const chain = upChain.map(e=>e.rel).join('.');
        out.push({ title:'Step '+(out.length+1)+' — up from '+cursor, soql:'SELECT Id, '+chain+'.Id\nFROM '+cursor+'\nWHERE '+chain+'.Id != null' });
        cursor = upChain[upChain.length-1].to; segStart = j; continue;
      }
      const d = path[segStart];
      out.push({ title:'Step '+(out.length+1)+' — down from '+cursor, soql:'SELECT Id,\n  (SELECT Id FROM '+d.rel+')\nFROM '+cursor+(out.length?'\nWHERE Id IN :idsFromPreviousStep':'') });
      cursor = d.to; segStart++;
    }
    out[0].note = 'This path changes direction, so SOQL cannot express it in one query — chain the steps (or use a flow / Apex).';
    return out;
  }

  // ── UI ─────────────────────────────────────────────────
  function fillSelects(){
    const loaded = Object.keys(S.objectMeta).sort();
    const targets = new Set(loaded);
    Object.values(S.objectMeta).forEach(m => { m.fields.forEach(f => (f.referenceTo||[]).forEach(t=>targets.add(t))); (m.childRelationships||[]).forEach(c=>targets.add(c.childSObject)); });
    const opt = arr => arr.map(n=>'<option value="'+S.escHtml(n)+'">'+S.escHtml(n)+(S.objectMeta[n]?'':' (not loaded)')+'</option>').join('');
    const f=$('#pfFrom'), t=$('#pfTo'); const pf=f.value, pt=t.value;
    f.innerHTML = opt(loaded); t.innerHTML = opt([...targets].sort());
    if (pf) f.value = pf; if (pt) t.value = pt;
    $('#pfLoadedCount').textContent = loaded.length+' object'+(loaded.length!==1?'s':'')+' loaded';
  }

  function run(){
    const from=$('#pfFrom').value, to=$('#pfTo').value; const includeSystem=$('#pfSystem').checked;
    if(!from||!to){ return; }
    const adj=buildGraph(includeSystem); const paths=findPaths(adj, from, to);
    const body=$('#pfResults');
    if(!paths.length){ body.innerHTML='<div class="empty-tab-msg">No path found between <b>'+S.escHtml(from)+'</b> and <b>'+S.escHtml(to)+'</b> within '+MAX_DEPTH+' hops using the '+Object.keys(S.objectMeta).length+' loaded objects.<br><br>Load the intermediate objects (select them in the sidebar) or allow system lookups.</div>'; return; }
    body.innerHTML = paths.map((p,idx)=>{
      const hops = p.map((e,i)=>'<span class="pf-node">'+S.escHtml(i===0?e.from:'')+'</span>'+(i===0?'':'')+'<span class="pf-edge '+e.dir+'" title="'+S.escHtml(e.field)+'">'+(e.dir==='up'?'▲':'▼')+' '+S.escHtml(e.rel)+(e.md?' <i>MD</i>':'')+'</span><span class="pf-node">'+S.escHtml(e.to)+'</span>').join('');
      const queries = soqlFor(from,p);
      return '<div class="pf-path'+(idx===0?' best':'')+'"><div class="pf-path-head"><span class="pf-rank">'+(idx===0?'Shortest':'Alternative '+idx)+'</span><span class="pf-hops">'+p.length+' hop'+(p.length>1?'s':'')+'</span><button class="pf-highlight" data-idx="'+idx+'">Highlight on canvas</button></div><div class="pf-chain">'+hops+'</div>'
        + queries.map(q=>'<div class="pf-query"><div class="pf-query-title">'+S.escHtml(q.title)+'<button class="pf-copy" data-soql="'+S.escHtml(q.soql)+'">copy</button></div><pre>'+S.escHtml(q.soql)+'</pre>'+(q.note?'<div class="pf-note">'+S.escHtml(q.note)+'</div>':'')+'</div>').join('')
        + '</div>';
    }).join('');
    body.querySelectorAll('.pf-copy').forEach(b=>b.addEventListener('click',()=>{ navigator.clipboard.writeText(b.dataset.soql).then(()=>S.showToast('SOQL copied','📋')); }));
    body.querySelectorAll('.pf-highlight').forEach(b=>b.addEventListener('click',()=>highlight(paths[parseInt(b.dataset.idx)])));
  }

  let highlighted = null;
  async function highlight(path){
    const nodes = [path[0].from].concat(path.map(e=>e.to));
    // add missing objects to the canvas
    const missing = nodes.filter(n=>!S.selectedObjects.has(n));
    for (const n of missing) { if (S.objectMeta[n] || S.allObjects.some(o=>o.name===n)) await S.toggleObject(n); }
    highlighted = path; S.closeModal('#pathfinderModal'); S.renderERD(); S.fitAll();
    S.showToast('Path highlighted — press Esc to clear','⤳');
  }
  S.on('decorateNode', (api,g)=>{ if(!highlighted) return; const nodes=[highlighted[0].from].concat(highlighted.map(e=>e.to)); g.classList.toggle('pf-dim', !nodes.includes(api)); g.classList.toggle('pf-on', nodes.includes(api)); });
  // Core lines are grouped per object pair and carry data-pairs="from>to>field|…"
  S.on('renderExtraRelationships', ()=>{ if(!highlighted) return; S.erdRels.querySelectorAll('.rel-line').forEach(l=>{ const pairs=(l.dataset.pairs||'').split('|'); const on=highlighted.some(e=>pairs.includes(e.from+'>'+e.to+'>'+e.field)||(e.dir==='down'&&pairs.includes(e.to+'>'+e.from+'>'+e.field))); l.classList.toggle('pf-dim',!on); l.classList.toggle('pf-on',on); }); });
  S.on('escape', ()=>{ if(highlighted){ highlighted=null; S.renderERD(); } });

  function wire(){
    $('#btnPathFinder').addEventListener('click',()=>{ fillSelects(); S.openModal('#pathfinderModal'); run(); });
    $('#pfFrom').addEventListener('change',run); $('#pfTo').addEventListener('change',run); $('#pfSystem').addEventListener('change',run);
    $('#pfSwap').addEventListener('click',()=>{ const f=$('#pfFrom'),t=$('#pfTo'); const v=f.value; if(t.querySelector('option[value="'+CSS.escape(v)+'"]')&&f.querySelector('option[value="'+CSS.escape(t.value)+'"]')){ f.value=t.value; t.value=v; run(); } });
    document.addEventListener('keydown',e=>{ if(e.ctrlKey&&e.key==='p'){ e.preventDefault(); $('#btnPathFinder').click(); } });
  }
  S.pathfinder = { buildGraph, findPaths, soqlFor };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
