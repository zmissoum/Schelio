/* ============================================================
   Schelio — Mapping Overlay module
   Load a TARGET schema (Dynamics 365, another Salesforce org,
   any system) as a JSON file, show its tables next to the ERD,
   map objects and fields, auto-suggest by name, export the
   mapping as CSV/JSON.

   Target schema JSON format (see assets/targets/*.json):
   {
     "system": "Dynamics 365",
     "objects": [
       { "name": "account", "label": "Account",
         "fields": [ { "name": "name", "label": "Account Name", "type": "string", "required": true } ] }
     ]
   }
   ============================================================ */
(function () {
  'use strict';
  const S = window.Schelio; if (!S) return;
  const $ = s => document.querySelector(s);

  let target = null;        // parsed target schema
  let shown = new Set();    // target object names rendered on canvas
  let mapping = { system:'', objects:{} }; // objects: { sourceApi: { target:'account', fields:{ sourceField: targetField } } }
  let modalSource = null;

  const KEY_TARGET='mapping_target', KEY_MAP='mapping';
  const COLORS = { header:'#3F1F0B', accent:'#FF6B2B' };

  function load(){ target=S.storage.get(KEY_TARGET,null); mapping=S.storage.get(KEY_MAP,{system:'',objects:{}}); shown=new Set(S.storage.get('mapping_shown',[])); }
  function save(){ S.storage.set(KEY_TARGET,target); S.storage.set(KEY_MAP,mapping); S.storage.set('mapping_shown',[...shown]); }

  // ── Name normalisation / similarity ────────────────────
  const norm = s => String(s||'').toLowerCase().replace(/__c$/,'').replace(/_+|\s+|-+/g,'').replace(/id$/,'');
  function similarity(a,b){ a=norm(a); b=norm(b); if(!a||!b) return 0; if(a===b) return 1; if(a.includes(b)||b.includes(a)) return 0.8; // Dice coefficient on bigrams
    const bg=s=>{const m=new Map();for(let i=0;i<s.length-1;i++){const k=s.slice(i,i+2);m.set(k,(m.get(k)||0)+1);}return m;};
    const A=bg(a),B=bg(b); let inter=0; A.forEach((n,k)=>{ if(B.has(k)) inter+=Math.min(n,B.get(k)); }); return (2*inter)/((a.length-1)+(b.length-1)); }
  function bestMatch(name,label,candidates,used){ let best=null,score=0; candidates.forEach(c=>{ if(used&&used.has(c.name)) return; const s=Math.max(similarity(name,c.name),similarity(label,c.label),similarity(name,c.label),similarity(label,c.name)); if(s>score){score=s;best=c;} }); return score>=0.6?{match:best,score}:null; }

  // ── Target card rendering ──────────────────────────────
  S.on('renderExtraNodes', () => {
    if (!target) return;
    target.objects.filter(o=>shown.has(o.name)).forEach(o => {
      const key='target:'+o.name;
      if(!S.nodePositions[key]) S.nodePositions[key]=S.nextFreePosition();
      const pos=S.nodePositions[key];
      const mappedTo=Object.entries(mapping.objects).filter(([,m])=>m.target===o.name).map(([src])=>src);
      const fields=(o.fields||[]).slice(0,S.MAX_FIELDS_SHOWN);
      const cardH=S.CARD_HEADER_H+Math.max(1,fields.length)*S.FIELD_ROW_H+S.CARD_PADDING*2+((o.fields||[]).length>S.MAX_FIELDS_SHOWN?20:0);
      const g=S.svgEl('g',{class:'erd-node erd-node-target','data-api':key,transform:'translate('+pos.x+','+pos.y+')'});
      g.appendChild(S.svgEl('rect',{class:'card-bg card-bg-target',width:S.CARD_WIDTH,height:cardH,filter:'url(#cardShadow)'}));
      g.appendChild(S.svgEl('rect',{class:'card-header-bg',width:S.CARD_WIDTH,height:S.CARD_HEADER_H,fill:COLORS.header,'clip-path':'inset(0 0 0 0 round 8px 8px 0 0)'}));
      g.appendChild(S.svgEl('rect',{x:0,y:S.CARD_HEADER_H-2,width:S.CARD_WIDTH,height:2,fill:COLORS.accent,opacity:0.8}));
      const tag=(target.system||'TARGET').toUpperCase().slice(0,10); const tw=tag.length*7+10;
      g.appendChild(S.svgEl('rect',{x:S.CARD_WIDTH-8-tw,y:6,width:tw,height:16,rx:4,fill:'rgba(255,107,43,0.2)'}));
      let t=S.svgEl('text',{x:S.CARD_WIDTH-8-tw/2,y:18,'text-anchor':'middle','font-size':'9','font-weight':'600','font-family':"'JetBrains Mono',monospace",fill:COLORS.accent}); t.textContent=tag; g.appendChild(t);
      t=S.svgEl('text',{class:'card-title',x:14,y:22}); t.textContent=S.truncate(o.label||o.name,18); g.appendChild(t);
      t=S.svgEl('text',{class:'card-api-name',x:14,y:38}); t.textContent=o.name+(mappedTo.length?'  ⇄ '+mappedTo.join(', '):''); g.appendChild(t);
      if(!fields.length){const e=S.svgEl('text',{x:S.CARD_WIDTH/2,y:S.CARD_HEADER_H+S.CARD_PADDING+15,'text-anchor':'middle','font-size':'10',fill:'#64748B','font-family':"'JetBrains Mono',monospace"});e.textContent='no fields';g.appendChild(e);}
      const mappedFields=new Set(mappedTo.flatMap(src=>Object.values(mapping.objects[src].fields||{})));
      fields.forEach((f,i)=>{
        const fy=S.CARD_HEADER_H+S.CARD_PADDING+i*S.FIELD_ROW_H; const isMapped=mappedFields.has(f.name);
        g.appendChild(S.svgEl('rect',{x:2,y:fy,width:S.CARD_WIDTH-4,height:S.FIELD_ROW_H,fill:isMapped?'rgba(255,107,43,0.08)':'transparent',rx:3}));
        let el=S.svgEl('text',{class:'field-icon',x:12,y:fy+15}); el.textContent=isMapped?'⇄':'◽'; g.appendChild(el);
        el=S.svgEl('text',{class:'field-name',x:28,y:fy+15}); el.textContent=S.truncate(f.label||f.name,20); g.appendChild(el);
        el=S.svgEl('text',{class:'field-type',x:S.CARD_WIDTH-12,y:fy+15,'text-anchor':'end'}); el.textContent=f.type||''; g.appendChild(el);
      });
      if((o.fields||[]).length>S.MAX_FIELDS_SHOWN){const my=S.CARD_HEADER_H+S.CARD_PADDING+fields.length*S.FIELD_ROW_H+6;const el=S.svgEl('text',{x:S.CARD_WIDTH/2,y:my+8,'text-anchor':'middle','font-size':'10',fill:'#64748B','font-family':"'JetBrains Mono',monospace"});el.textContent='+ '+(o.fields.length-S.MAX_FIELDS_SHOWN)+' more';g.appendChild(el);}
      g.dataset.height=cardH; g.addEventListener('mousedown',S.onNodeMouseDown);
      g.addEventListener('dblclick',()=>{ const src=mappedTo[0]||[...S.selectedObjects][0]; if(src) openMappingModal(src, o.name); else S.showToast('Select a Salesforce object first','⚠️'); });
      S.erdNodes.appendChild(g);
    });
  });

  function ensurePositions(){ if(!target) return; target.objects.forEach(o=>{ if(shown.has(o.name)&&!S.nodePositions['target:'+o.name]) S.nodePositions['target:'+o.name]=S.nextFreePosition(); }); }

  // Mapping lines: source object → target object, labelled with mapped field count
  // (relationships render before nodes, so positions are assigned here too)
  S.on('renderExtraRelationships', () => {
    if(!target) return; ensurePositions();
    Object.entries(mapping.objects).forEach(([src,m])=>{
      if(!m.target||!shown.has(m.target)) return;
      const srcKey=S.nodePositions[src]?src:(S.nodePositions['draft:'+src]?'draft:'+src:null); if(!srcKey) return;
      const c=S.connectorPath(srcKey,'target:'+m.target); if(!c) return;
      const n=Object.keys(m.fields||{}).length;
      S.erdRels.appendChild(S.svgEl('path',{class:'rel-line rel-mapping',d:c.d}));
      const l=S.svgEl('text',{class:'rel-label rel-label-mapping',x:c.mx,y:c.my-6,'text-anchor':'middle'}); l.textContent='⇄ '+n+' field'+(n!==1?'s':''); S.erdRels.appendChild(l);
    });
  });

  // ── Sidebar tab ────────────────────────────────────────
  function renderSidebar(){
    const panel=$('#mappingTargetList'); const status=$('#mappingStatus'); if(!panel) return;
    if(!target){ status.innerHTML='<div class="mapping-empty">No target schema loaded.<br>Import a JSON file or load the Dynamics 365 sample.</div>'; panel.innerHTML=''; $('#mappingActions').style.display='none'; return; }
    $('#mappingActions').style.display='';
    const nMapped=Object.values(mapping.objects).filter(m=>m.target).length;
    const nFields=Object.values(mapping.objects).reduce((n,m)=>n+Object.keys(m.fields||{}).length,0);
    status.innerHTML='<div class="mapping-stat"><b>'+S.escHtml(target.system||'Target')+'</b> · '+target.objects.length+' tables</div><div class="mapping-stat">'+nMapped+' object'+(nMapped!==1?'s':'')+' mapped · '+nFields+' field'+(nFields!==1?'s':'')+'</div>';
    const q=($('#mappingSearch').value||'').toLowerCase();
    panel.innerHTML=target.objects.filter(o=>!q||o.name.toLowerCase().includes(q)||(o.label||'').toLowerCase().includes(q)).map(o=>{
      const srcs=Object.entries(mapping.objects).filter(([,m])=>m.target===o.name).map(([s])=>s);
      return '<div class="obj-item'+(shown.has(o.name)?' selected':'')+'" data-target="'+S.escHtml(o.name)+'"><div class="obj-check"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="obj-info"><div class="obj-label">'+S.escHtml(o.label||o.name)+'</div><div class="obj-api">'+S.escHtml(o.name)+' · '+(o.fields||[]).length+' fields'+(srcs.length?' · ⇄ '+S.escHtml(srcs.join(', ')):'')+'</div></div><button class="mapping-map-btn" data-map="'+S.escHtml(o.name)+'" title="Map a Salesforce object to this table">⇄</button></div>';
    }).join('');
    panel.querySelectorAll('.obj-item').forEach(el=>el.addEventListener('click',e=>{ if(e.target.closest('.mapping-map-btn')) return; const n=el.dataset.target; S.pushUndo(); if(shown.has(n)){shown.delete(n); delete S.nodePositions['target:'+n];} else shown.add(n); save(); renderSidebar(); S.renderERD(); S.updateEmptyState(); }));
    panel.querySelectorAll('.mapping-map-btn').forEach(b=>b.addEventListener('click',()=>pickSourceFor(b.dataset.map)));
  }

  function pickSourceFor(targetName){
    const srcs=[...S.selectedObjects]; const drafts=S.design?Object.keys(S.design.drafts.objects):[];
    const all=srcs.concat(drafts); if(!all.length){ S.showToast('Add Salesforce objects to the canvas first','⚠️'); return; }
    const sel=$('#mappingPickSource'); sel.innerHTML=all.map(a=>'<option value="'+S.escHtml(a)+'">'+S.escHtml(a)+(drafts.includes(a)?' (draft)':'')+'</option>').join('');
    const existing=Object.entries(mapping.objects).find(([,m])=>m.target===targetName); if(existing) sel.value=existing[0];
    $('#mappingPickTarget').textContent=targetName; $('#mappingPickGo').onclick=()=>{ S.closeModal('#mappingPickModal'); openMappingModal(sel.value,targetName); };
    S.openModal('#mappingPickModal');
  }

  // ── Field mapping modal ────────────────────────────────
  function sourceFields(src){
    const meta=S.objectMeta[src]; if(meta) return meta.fields.filter(f=>!f.deprecatedAndHidden).map(f=>({name:f.name,label:f.label,type:f.type,required:!f.nillable})).sort((a,b)=>a.label.localeCompare(b.label));
    const d=S.design&&S.design.drafts.objects[src]; if(d) return d.fields.map(f=>({name:f.api,label:f.label,type:f.type.toLowerCase(),required:!!f.required}));
    return [];
  }
  function openMappingModal(src,targetName){
    const tObj=target.objects.find(o=>o.name===targetName); if(!tObj) return;
    modalSource=src;
    if(!mapping.objects[src]) mapping.objects[src]={target:targetName,fields:{}};
    mapping.objects[src].target=targetName;
    const m=mapping.objects[src];
    $('#mappingModalTitle').innerHTML=S.escHtml(src)+' <span class="mapping-arrow">⇄</span> '+S.escHtml(tObj.label||tObj.name)+' <span class="mapping-sys">'+S.escHtml(target.system||'')+'</span>';
    const sf=sourceFields(src); const tf=(tObj.fields||[]).slice().sort((a,b)=>(a.label||a.name).localeCompare(b.label||b.name));
    const opts='<option value="">— not mapped —</option>'+tf.map(f=>'<option value="'+S.escHtml(f.name)+'">'+S.escHtml(f.label||f.name)+' ('+S.escHtml(f.name)+(f.type?' · '+S.escHtml(f.type):'')+')</option>').join('');
    $('#mappingModalBody').innerHTML='<div class="mapping-toolbar"><input type="text" id="mappingFieldFilter" placeholder="Filter source fields…"><label class="mapping-check"><input type="checkbox" id="mappingOnlyUnmapped"> unmapped only</label><span class="mapping-count" id="mappingCount"></span></div>'
      +'<table class="mapping-table"><thead><tr><th>Salesforce field</th><th>Type</th><th></th><th>'+S.escHtml(target.system||'Target')+' field</th></tr></thead><tbody>'
      +sf.map(f=>'<tr class="mapping-row" data-src="'+S.escHtml(f.name)+'" data-label="'+S.escHtml(f.label.toLowerCase())+'"><td><div class="mapping-src">'+S.escHtml(f.label)+(f.required?' <span class="req">*</span>':'')+'</div><div class="mapping-src-api">'+S.escHtml(f.name)+'</div></td><td class="mono">'+S.escHtml(f.type)+'</td><td class="mapping-arrow-cell">→</td><td><select data-src="'+S.escHtml(f.name)+'">'+opts+'</select></td></tr>').join('')
      +'</tbody></table>';
    $('#mappingModalBody').querySelectorAll('select').forEach(sel=>{ sel.value=m.fields[sel.dataset.src]||''; sel.addEventListener('change',()=>{ if(sel.value) m.fields[sel.dataset.src]=sel.value; else delete m.fields[sel.dataset.src]; save(); updateCount(); S.renderERD(); renderSidebar(); }); });
    const filter=()=>{ const q=$('#mappingFieldFilter').value.toLowerCase(); const only=$('#mappingOnlyUnmapped').checked; $('#mappingModalBody').querySelectorAll('.mapping-row').forEach(r=>{ const sel=r.querySelector('select'); const show=(!q||r.dataset.src.toLowerCase().includes(q)||r.dataset.label.includes(q))&&(!only||!sel.value); r.style.display=show?'':'none'; }); };
    const updateCount=()=>{ $('#mappingCount').textContent=Object.keys(m.fields).length+'/'+sf.length+' mapped'; };
    $('#mappingFieldFilter').addEventListener('input',filter); $('#mappingOnlyUnmapped').addEventListener('change',filter); updateCount();
    $('#mappingAutoMap').onclick=()=>{ const used=new Set(Object.values(m.fields)); let n=0; sf.forEach(f=>{ if(m.fields[f.name]) return; const r=bestMatch(f.name,f.label,tf,used); if(r){ m.fields[f.name]=r.match.name; used.add(r.match.name); n++; } }); $('#mappingModalBody').querySelectorAll('select').forEach(sel=>{ sel.value=m.fields[sel.dataset.src]||''; }); save(); updateCount(); S.renderERD(); renderSidebar(); S.showToast('Auto-mapped '+n+' field'+(n!==1?'s':''),'⇄'); };
    $('#mappingClearObj').onclick=()=>{ if(!confirm('Clear all field mappings for '+src+'?')) return; m.fields={}; $('#mappingModalBody').querySelectorAll('select').forEach(sel=>sel.value=''); save(); updateCount(); S.renderERD(); renderSidebar(); };
    $('#mappingUnlink').onclick=()=>{ if(!confirm('Remove the mapping between '+src+' and '+targetName+'?')) return; delete mapping.objects[src]; save(); S.closeModal('#mappingModal'); S.renderERD(); renderSidebar(); };
    if(!shown.has(targetName)){ shown.add(targetName); save(); }
    S.renderERD(); renderSidebar(); S.openModal('#mappingModal');
  }

  function autoMapObjects(){
    if(!target) return; const srcs=[...S.selectedObjects]; if(!srcs.length){ S.showToast('Add Salesforce objects to the canvas first','⚠️'); return; }
    const used=new Set(Object.values(mapping.objects).map(m=>m.target)); let n=0;
    srcs.forEach(src=>{ if(mapping.objects[src]&&mapping.objects[src].target) return; const meta=S.objectMeta[src]; const r=bestMatch(src,meta?meta.label:src,target.objects,used); if(r){ mapping.objects[src]={target:r.match.name,fields:{}}; used.add(r.match.name); shown.add(r.match.name); n++; } });
    // then auto-map fields for each newly mapped object
    Object.entries(mapping.objects).forEach(([src,m])=>{ if(Object.keys(m.fields).length) return; const tObj=target.objects.find(o=>o.name===m.target); if(!tObj) return; const sf=sourceFields(src); const usedF=new Set(); sf.forEach(f=>{ const r=bestMatch(f.name,f.label,tObj.fields||[],usedF); if(r){ m.fields[f.name]=r.match.name; usedF.add(r.match.name); } }); });
    save(); S.renderERD(); renderSidebar(); S.updateEmptyState(); S.showToast('Auto-mapped '+n+' object'+(n!==1?'s':'')+' by name','⇄');
  }

  // ── Import / Export ────────────────────────────────────
  function importFile(file){
    const r=new FileReader(); r.onload=()=>{ try{ const j=JSON.parse(r.result); setTarget(j); }catch(e){ S.showToast('Invalid JSON: '+e.message,'⚠️'); } }; r.readAsText(file);
  }
  function setTarget(j){
    if(!j||!Array.isArray(j.objects)) { S.showToast('Expected { system, objects:[…] }','⚠️'); return; }
    j.objects=j.objects.map(o=>({ name:String(o.name||o.logicalName||o.api||''), label:o.label||o.displayName||o.name, fields:(o.fields||o.attributes||[]).map(f=>({ name:String(f.name||f.logicalName||f.api||''), label:f.label||f.displayName||f.name, type:f.type||f.attributeType||'', required:!!f.required })) })).filter(o=>o.name);
    target=j; mapping.system=j.system||''; shown=new Set(); Object.keys(S.nodePositions).filter(k=>k.startsWith('target:')).forEach(k=>delete S.nodePositions[k]);
    save(); renderSidebar(); S.renderERD(); S.showToast('Loaded '+j.objects.length+' tables from '+(j.system||'target'),'📥');
  }
  function exportCurrentSchema(){
    const apis=[...S.selectedObjects]; if(!apis.length){ S.showToast('Select objects first','⚠️'); return; }
    const j={ system:'Salesforce '+S.instanceUrl.replace(/^https:\/\//,'').split('.')[0], exportedAt:new Date().toISOString(), objects:apis.map(a=>{ const m=S.objectMeta[a]; return { name:a, label:m?m.label:a, fields:(m?m.fields:[]).filter(f=>!f.deprecatedAndHidden).map(f=>({ name:f.name, label:f.label, type:f.type, required:!f.nillable, referenceTo:f.referenceTo&&f.referenceTo.length?f.referenceTo:undefined })) }; }) };
    S.download('schelio-schema-'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify(j,null,2), 'application/json');
  }
  function exportMapping(fmt){
    const rows=[]; Object.entries(mapping.objects).forEach(([src,m])=>{ if(!m.target) return; const tObj=target.objects.find(o=>o.name===m.target)||{fields:[]}; const sf=sourceFields(src);
      const entries=Object.entries(m.fields); if(!entries.length) rows.push({sourceObject:src,sourceField:'',sourceType:'',targetObject:m.target,targetField:'',targetType:'',rule:''});
      entries.forEach(([sfName,tfName])=>{ const s=sf.find(f=>f.name===sfName)||{}; const t=(tObj.fields||[]).find(f=>f.name===tfName)||{}; rows.push({sourceObject:src,sourceField:sfName,sourceType:s.type||'',targetObject:m.target,targetField:tfName,targetType:t.type||'',rule:''}); });
    });
    if(!rows.length){ S.showToast('Nothing mapped yet','⚠️'); return; }
    if(fmt==='json') S.download('schelio-mapping.json', JSON.stringify({ source:'Salesforce', target:target.system||'', generatedAt:new Date().toISOString(), mappings:rows },null,2),'application/json');
    else { const head=['Source Object','Source Field','Source Type','Target Object','Target Field','Target Type','Transformation Rule']; S.download('schelio-mapping.csv', [head].concat(rows.map(r=>[r.sourceObject,r.sourceField,r.sourceType,r.targetObject,r.targetField,r.targetType,r.rule])).map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n'),'text/csv'); }
  }

  function wire(){
    load();
    $('#mappingImportFile').addEventListener('change',e=>{ if(e.target.files[0]) importFile(e.target.files[0]); e.target.value=''; });
    $('#btnMappingImport').addEventListener('click',()=>$('#mappingImportFile').click());
    $('#btnMappingSample').addEventListener('click',()=>fetch(chrome.runtime?chrome.runtime.getURL('assets/targets/d365-sales.json'):'assets/targets/d365-sales.json').then(r=>r.json()).then(setTarget).catch(e=>S.showToast('Sample not found: '+e.message,'⚠️')));
    $('#btnMappingExportSchema').addEventListener('click',exportCurrentSchema);
    $('#btnMappingAuto').addEventListener('click',autoMapObjects);
    $('#btnMappingCsv').addEventListener('click',()=>exportMapping('csv'));
    $('#btnMappingJson').addEventListener('click',()=>exportMapping('json'));
    $('#btnMappingClearTarget').addEventListener('click',()=>{ if(!confirm('Remove the target schema and all mappings for this org?')) return; target=null; mapping={system:'',objects:{}}; shown=new Set(); Object.keys(S.nodePositions).filter(k=>k.startsWith('target:')).forEach(k=>delete S.nodePositions[k]); save(); renderSidebar(); S.renderERD(); S.updateEmptyState(); });
    $('#mappingSearch').addEventListener('input',renderSidebar);
    S.on('sidebarTab',t=>{ if(t==='mapping') renderSidebar(); });
    document.addEventListener('schelio:objects-ready',()=>{ renderSidebar(); S.renderERD(); });
    renderSidebar();
  }
  S.mapping = { get target(){return target;}, get mapping(){return mapping;}, openMappingModal, setTarget };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
