/* ============================================================
   Schelio — Architect Score module
   Rule engine that reviews an object's data model the way a
   Data Architect would, scores it 0–100 and grades it A–F.

   Rules are declared in RULES; each returns zero or more findings
   { id, severity:'error'|'warn'|'info', message, fields?:[...] }.
   Synchronous rules run on the describe result instantly; async
   rules enrich the score once FieldDefinition descriptions and
   record counts come back.
   ============================================================ */
(function () {
  'use strict';
  const S = window.Schelio; if (!S) return;
  const $ = s => document.querySelector(s);

  const WEIGHT = { error: 10, warn: 4, info: 1 };
  const SYSTEM_FIELDS = new Set(['Id','IsDeleted','Name','CreatedDate','CreatedById','LastModifiedDate','LastModifiedById','SystemModstamp','LastActivityDate','LastViewedDate','LastReferencedDate','OwnerId','MasterRecordId','RecordTypeId','CurrencyIsoCode','ConnectionReceivedId','ConnectionSentId']);
  const scores = {};      // api -> { score, grade, findings, pending }
  const descCache = {};   // api -> { fieldApi: description }
  const countCache = {};  // api -> recordCount
  const objDescCache = {}; // api -> description|null

  const isCustomField = f => f.custom || /__c$/i.test(f.name);
  const userFields = meta => meta.fields.filter(f => !f.deprecatedAndHidden && !SYSTEM_FIELDS.has(f.name));

  // ── Rules ──────────────────────────────────────────────
  const RULES = [
    { id:'field-limit', title:'Custom field count vs. platform limit', sync:true, run(meta){
        const n = meta.fields.filter(isCustomField).length;
        if (n >= 450) return [{ severity:'error', message:n+' custom fields — within 10% of the 500-field limit (Enterprise). Plan an archive/cleanup.' }];
        if (n >= 300) return [{ severity:'warn', message:n+' custom fields — object is getting heavy; review page layouts and unused fields.' }];
        return [];
    }},
    { id:'picklist-size', title:'Oversized picklists', sync:true, run(meta){
        const out=[]; meta.fields.filter(f=>f.type==='picklist'||f.type==='multipicklist').forEach(f=>{
          const n=(f.picklistValues||[]).filter(v=>v.active).length;
          if (n>=200) out.push({ severity:'error', message:f.label+' has '+n+' active values — should be a lookup to a reference object.', fields:[f.name] });
          else if (n>=60) out.push({ severity:'warn', message:f.label+' has '+n+' active values — consider a Global Value Set or a lookup.', fields:[f.name] });
        }); return out;
    }},
    { id:'md-candidate', title:'Required lookups that behave like master-detail', sync:true, run(meta){
        const hasMd = meta.fields.some(f=>f.type==='reference'&&f.cascadeDelete);
        return meta.fields.filter(f=>f.type==='reference'&&!f.nillable&&!f.cascadeDelete&&isCustomField(f)&&!hasMd)
          .map(f=>({ severity:'warn', message:f.label+' is a required lookup — if the child cannot exist without the parent, a Master-Detail gives you roll-ups and cascade delete.', fields:[f.name] }));
    }},
    { id:'polymorphic', title:'Polymorphic lookups', sync:true, run(meta){
        return meta.fields.filter(f=>f.type==='reference'&&isCustomField(f)&&(f.referenceTo||[]).length>1)
          .map(f=>({ severity:'info', message:f.label+' references '+f.referenceTo.length+' objects — polymorphic lookups complicate reports and SOQL.', fields:[f.name] }));
    }},
    { id:'inactive-rt', title:'Inactive record types', sync:true, run(meta){
        const n=(meta.recordTypeInfos||[]).filter(r=>!r.master&&!r.active).length;
        return n?[{ severity:'warn', message:n+' inactive record type'+(n>1?'s':'')+' still defined — delete them or document why they stay.' }]:[];
    }},
    { id:'dup-labels', title:'Duplicate field labels', sync:true, run(meta){
        const seen={}; const out=[];
        userFields(meta).forEach(f=>{ const k=f.label.trim().toLowerCase(); (seen[k]=seen[k]||[]).push(f.name); });
        Object.entries(seen).filter(([,v])=>v.length>1).forEach(([k,v])=>out.push({ severity:'warn', message:'Label "'+k+'" is used by '+v.length+' fields ('+v.join(', ')+') — users cannot tell them apart in reports.', fields:v }));
        return out;
    }},
    { id:'extid-unique', title:'External IDs that are not unique', sync:true, run(meta){
        return meta.fields.filter(f=>f.externalId&&!f.unique).map(f=>({ severity:'warn', message:f.label+' is an External ID but not Unique — upserts can silently hit duplicates.', fields:[f.name] }));
    }},
    { id:'no-extid', title:'No external ID on a custom object', sync:true, run(meta){
        if (!meta.custom) return [];
        return meta.fields.some(f=>f.externalId)?[]:[{ severity:'info', message:'No External ID field — integrations and data loads will key on Salesforce IDs only.' }];
    }},
    { id:'text-default-255', title:'Text fields left at the 255 default', sync:true, run(meta){
        const t=meta.fields.filter(f=>f.type==='string'&&isCustomField(f)); if (t.length<5) return [];
        const n=t.filter(f=>f.length===255).length; const pct=Math.round(100*n/t.length);
        return pct>=70?[{ severity:'info', message:pct+'% of custom text fields use the 255 default length — sizing suggests fields were created without data analysis.' }]:[];
    }},
    { id:'help-text', title:'Missing help text', sync:true, run(meta){
        const t=userFields(meta).filter(isCustomField); if (!t.length) return [];
        const n=t.filter(f=>!f.inlineHelpText).length; const pct=Math.round(100*n/t.length);
        return pct>=80?[{ severity:'info', message:pct+'% of custom fields have no help text.' }]:[];
    }},
    { id:'naming', title:'API naming conventions', sync:true, run(meta){
        const bad=userFields(meta).filter(isCustomField).filter(f=>/^[a-z]/.test(f.name)||/\d{2,}/.test(f.name.replace(/__c$/,''))||/__[^c]/.test(f.name.replace(/__c$/,'')));
        return bad.length?[{ severity:'info', message:bad.length+' field'+(bad.length>1?'s':'')+' with unusual API names (lowercase start, digits, double underscores): '+bad.slice(0,5).map(f=>f.name).join(', ')+(bad.length>5?'…':''), fields:bad.map(f=>f.name) }]:[];
    }},
    { id:'formula-depth', title:'Formula fields', sync:true, run(meta){
        const n=meta.fields.filter(f=>f.calculated).length;
        return n>=40?[{ severity:'warn', message:n+' formula fields — heavy formula use slows record pages and reports; consider flows or roll-ups for derived data.' }]:[];
    }},
    { id:'descriptions', title:'Field descriptions', sync:false, async run(meta){
        const t=userFields(meta).filter(isCustomField); if (!t.length) return [];
        const d=await fetchDescriptions(meta.name); if (!d) return [];
        const missing=t.filter(f=>!d[f.name]); const pct=Math.round(100*missing.length/t.length);
        if (pct>=60) return [{ severity:'error', message:pct+'% of custom fields have no description ('+missing.length+'/'+t.length+'). Undocumented data models are the first thing an audit flags.', fields:missing.map(f=>f.name) }];
        if (pct>=25) return [{ severity:'warn', message:pct+'% of custom fields have no description ('+missing.length+'/'+t.length+').', fields:missing.map(f=>f.name) }];
        if (pct>0) return [{ severity:'info', message:missing.length+' custom field'+(missing.length>1?'s':'')+' without description.', fields:missing.map(f=>f.name) }];
        return [];
    }},
    { id:'object-description', title:'Object description', sync:false, async run(meta){
        if (!meta.custom) return [];
        const d=await fetchObjectDescription(meta.name);
        return d===''?[{ severity:'warn', message:'Custom object has no description.' }]:[];
    }},
    { id:'orphan', title:'Orphan / empty custom object', sync:false, async run(meta){
        if (!meta.custom) return [];
        const refs=meta.fields.filter(f=>f.type==='reference'&&isCustomField(f)).length;
        const children=(meta.childRelationships||[]).filter(c=>/__c$/.test(c.childSObject)||c.field&&/__c$/.test(c.field)).length;
        const count=await fetchRecordCount(meta.name);
        const out=[];
        if (count===0 && refs===0 && children===0) out.push({ severity:'error', message:'No records, no custom relationships in or out — this object looks abandoned.' });
        else if (count===0) out.push({ severity:'warn', message:'Object has 0 records.' });
        else if (refs===0 && children===0) out.push({ severity:'info', message:'Object is isolated (no custom relationships), '+count.toLocaleString()+' records.' });
        return out;
    }}
  ];

  // ── Data fetchers ──────────────────────────────────────
  async function fetchDescriptions(api){
    if (descCache[api]) return descCache[api];
    try {
      const recs = await S.sfRestQueryAll("SELECT QualifiedApiName, Description FROM FieldDefinition WHERE EntityDefinitionId = '"+S.escSoql(api)+"'");
      const m={}; recs.forEach(x=>{ m[x.QualifiedApiName]=x.Description||''; }); descCache[api]=m; return m;
    } catch(e){ console.warn('[lint] FieldDefinition query failed', e); return null; }
  }
  async function fetchObjectDescription(api){
    if (objDescCache[api]!==undefined) return objDescCache[api];
    try {
      const r = await S.sfToolingQuery("SELECT Description FROM CustomObject WHERE DeveloperName = '"+S.escSoql(api.replace(/__c$/,''))+"'");
      const d = (r.records&&r.records[0]&&r.records[0].Description)||''; objDescCache[api]=d; return d;
    } catch(e){ objDescCache[api]=null; return null; }
  }
  async function fetchRecordCount(api){
    if (countCache[api]!==undefined) return countCache[api];
    try {
      const r = await S.sfApi('/services/data/'+S.SF_API_VERSION+'/limits/recordCount?sObjects='+encodeURIComponent(api));
      const c = (r.sObjects&&r.sObjects[0]&&r.sObjects[0].count); countCache[api]=typeof c==='number'?c:null; return countCache[api];
    } catch(e){ countCache[api]=null; return null; }
  }

  // ── Scoring ────────────────────────────────────────────
  function grade(score){ return score>=90?'A':score>=75?'B':score>=60?'C':score>=40?'D':'F'; }
  function gradeColor(g){ return {A:'#34D399',B:'#38BDF8',C:'#FBBF24',D:'#FB923C',F:'#FB7185'}[g]; }
  function compute(findings){ let s=100; findings.forEach(f=>{ s-=WEIGHT[f.severity]||0; }); return Math.max(0,s); }

  function scoreSync(api){
    const meta=S.objectMeta[api]; if(!meta) return null;
    const findings=[]; RULES.filter(r=>r.sync).forEach(r=>{ try{ r.run(meta).forEach(f=>findings.push(Object.assign({rule:r.id,title:r.title},f))); }catch(e){ console.warn('[lint]',r.id,e); } });
    const score=compute(findings); scores[api]={ score, grade:grade(score), findings, pending:true };
    return scores[api];
  }
  async function scoreFull(api){
    const meta=S.objectMeta[api]; if(!meta) return null;
    const base=scoreSync(api);
    const asyncFindings=[];
    await Promise.all(RULES.filter(r=>!r.sync).map(async r=>{ try{ (await r.run(meta)).forEach(f=>asyncFindings.push(Object.assign({rule:r.id,title:r.title},f))); }catch(e){ console.warn('[lint]',r.id,e); } }));
    const findings=base.findings.concat(asyncFindings); const score=compute(findings);
    scores[api]={ score, grade:grade(score), findings, pending:false, recordCount:countCache[api] };
    S.renderERD();
    return scores[api];
  }

  // ── Card badge ─────────────────────────────────────────
  S.on('cardBadges', api => {
    const s = scores[api] || scoreSync(api); if (!s) return null;
    return { text:s.grade+' '+s.score, fill:gradeColor(s.grade)+'33', color:gradeColor(s.grade), title:'Architect Score '+s.score+'/100'+(s.pending?' (preliminary)':'') };
  });

  // ── Detail tab ─────────────────────────────────────────
  S.on('detailTabs', (api, meta) => {
    const panel=$('#dtabScore'); if(!panel) return;
    const render = s => {
      const bySev={error:[],warn:[],info:[]}; s.findings.forEach(f=>bySev[f.severity].push(f));
      let h='<div class="score-hero"><div class="score-ring" style="--c:'+gradeColor(s.grade)+';--p:'+s.score+'"><span class="score-grade">'+s.grade+'</span><span class="score-num">'+s.score+'/100</span></div>';
      h+='<div class="score-summary"><div class="score-title">Architect Score</div><div class="score-sub">'+(s.pending?'Preliminary — checking descriptions & record counts…':(s.findings.length?s.findings.length+' finding'+(s.findings.length>1?'s':''):'No findings — clean data model'))+'</div>';
      h+='<div class="score-chips"><span class="score-chip err">'+bySev.error.length+' error</span><span class="score-chip warn">'+bySev.warn.length+' warn</span><span class="score-chip info">'+bySev.info.length+' info</span></div>';
      if (s.recordCount!=null) h+='<div class="score-sub mono">'+s.recordCount.toLocaleString()+' records</div>';
      h+='</div></div>';
      ['error','warn','info'].forEach(sev=>{ if(!bySev[sev].length) return;
        h+='<div class="detail-section"><div class="detail-section-title">'+(sev==='error'?'Errors':sev==='warn'?'Warnings':'Info')+' ('+bySev[sev].length+')</div>';
        bySev[sev].forEach(f=>{ h+='<div class="finding '+sev+'"><div class="finding-rule">'+S.escHtml(f.title)+'</div><div class="finding-msg">'+S.escHtml(f.message)+'</div>'+(f.fields&&f.fields.length?'<div class="finding-fields">'+f.fields.slice(0,12).map(x=>'<span>'+S.escHtml(x)+'</span>').join('')+(f.fields.length>12?'<span>+'+(f.fields.length-12)+'</span>':'')+'</div>':'')+'</div>'; });
        h+='</div>';
      });
      h+='<div class="score-rules"><div class="detail-section-title">Rules applied ('+RULES.length+')</div>'+RULES.map(r=>'<span class="score-rule-tag'+(s.findings.some(f=>f.rule===r.id)?' hit':'')+'">'+S.escHtml(r.title)+'</span>').join('')+'</div>';
      h+='<div class="score-actions"><button class="modal-btn modal-btn-secondary" id="btnScoreCsv">Export findings CSV</button></div>';
      panel.innerHTML=h;
      const b=$('#btnScoreCsv'); if(b) b.addEventListener('click',()=>exportFindingsCsv(api,s));
    };
    render(scoreSync(api));
    scoreFull(api).then(s => { if (S.activeDetailObject === api) render(s); });
  });

  function exportFindingsCsv(api,s){
    const rows=[['Object','Severity','Rule','Message','Fields']].concat(s.findings.map(f=>[api,f.severity,f.title,f.message,(f.fields||[]).join(' ')]));
    S.download('schelio-score-'+api+'.csv', rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n'), 'text/csv');
  }

  // ── Org-wide review (all selected objects) ─────────────
  async function reviewAll(){
    const apis=[...S.selectedObjects]; if(!apis.length){ S.showToast('Select objects first','⚠️'); return; }
    S.showToast('Scoring '+apis.length+' objects…','🔎');
    for (const api of apis) { await scoreFull(api); }
    const rows=apis.map(a=>({api:a, s:scores[a]})).sort((a,b)=>a.s.score-b.s.score);
    const avg=Math.round(rows.reduce((n,r)=>n+r.s.score,0)/rows.length);
    let h='<div class="score-hero compact"><div class="score-ring" style="--c:'+gradeColor(grade(avg))+';--p:'+avg+'"><span class="score-grade">'+grade(avg)+'</span><span class="score-num">'+avg+'</span></div><div class="score-summary"><div class="score-title">Org-wide average</div><div class="score-sub">'+rows.length+' objects reviewed · lowest first</div></div></div>';
    h+='<table class="fls-table"><thead><tr><th>Object</th><th>Grade</th><th>Score</th><th>Err</th><th>Warn</th><th>Info</th><th>Records</th></tr></thead><tbody>';
    rows.forEach(({api,s})=>{ const c=sev=>s.findings.filter(f=>f.severity===sev).length; h+='<tr class="score-row" data-api="'+S.escHtml(api)+'"><td>'+S.escHtml(api)+'</td><td><span class="score-pill" style="background:'+gradeColor(s.grade)+'33;color:'+gradeColor(s.grade)+'">'+s.grade+'</span></td><td>'+s.score+'</td><td>'+c('error')+'</td><td>'+c('warn')+'</td><td>'+c('info')+'</td><td>'+(s.recordCount!=null?s.recordCount.toLocaleString():'—')+'</td></tr>'; });
    h+='</tbody></table>';
    $('#scoreReviewBody').innerHTML=h;
    document.querySelectorAll('.score-row').forEach(r=>r.addEventListener('click',()=>{ S.closeModal('#scoreReviewModal'); S.showDetail(r.dataset.api); setTimeout(()=>{ const t=document.querySelector('.detail-tab[data-dtab="score"]'); if(t) t.click(); },50); }));
    $('#btnScoreReviewCsv').onclick=()=>{ const all=[['Object','Score','Grade','Severity','Rule','Message','Fields']]; rows.forEach(({api,s})=>s.findings.forEach(f=>all.push([api,s.score,s.grade,f.severity,f.title,f.message,(f.fields||[]).join(' ')]))); S.download('schelio-architect-review.csv', all.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n'),'text/csv'); };
    S.openModal('#scoreReviewModal');
  }

  function wire(){ const b=$('#btnArchitectReview'); if(b) b.addEventListener('click',reviewAll); }
  S.lint = { RULES, scores, scoreSync, scoreFull, grade, gradeColor };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
