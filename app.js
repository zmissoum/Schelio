/* ============================================================
   Schelio — Main Application v2.0.0
   Features: ERD, Field Search, Mermaid, Save/Load, PDF Spec,
             Record Types, Picklist Values by RT, Layouts,
             Lightning Record Pages
   ============================================================ */
(function () {
  'use strict';

  const CARD_WIDTH = 240, CARD_HEADER_H = 48, FIELD_ROW_H = 22, MAX_FIELDS_SHOWN = 12, CARD_PADDING = 8;
  const SF_API_VERSION = 'v59.0';
  const API_TIMEOUT_MS = 30000;
  const COLORS = { standard: { header: '#1E3A5F', accent: '#818CF8' }, custom: { header: '#1A3D2E', accent: '#34D399' } };
  const FIELD_ICONS = { id:'🔑',string:'📝',textarea:'📄',boolean:'☑️',int:'🔢',double:'🔢',currency:'💰',percent:'📊',date:'📅',datetime:'📅',email:'📧',phone:'📞',url:'🔗',picklist:'📋',multipicklist:'📋',reference:'🔗',lookup:'🔗',masterrecord:'🔗',address:'📍',default:'◽' };

  let instanceUrl='', sessionId='', allObjects=[], selectedObjects=new Set(), objectMeta={}, nodePositions={}, relationships=[];
  let zoom=1, panX=0, panY=0, isPanning=false, panStart={x:0,y:0}, dragNode=null, dragOffset={x:0,y:0}, showRelations=true, activeFilter='all';
  let undoStack=[], redoStack=[], contextTarget=null, isDarkTheme=true;

  // Extended metadata caches
  let activeDetailObject = null;  // guard against async race conditions in detail panel
  let picklistCache = {};        // objectApi -> { rtId -> { fieldApi -> [values] } }
  let layoutCache = {};          // objectApi -> [layouts]
  let flexiPageCache = {};       // objectApi -> [flexiPages]
  let profileCache = {};         // objectApi -> { objectPerms: [], fieldPerms: [] }
  let layoutAssignCache = {};    // objectApi -> [{ profile, recordType, layout }]
  let validationRuleCache = {};  // objectApi -> [rules]
  let automationCache = {};      // objectApi -> { flows, triggers }
  let permSetCache = {};         // objectApi -> { objectPerms, fieldPerms }

  const $ = s => document.querySelector(s);
  function escHtml(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  function escSoql(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
  const loadingOverlay=$('#loadingOverlay'), loadingStatus=$('#loadingStatus'), loadingBar=$('#loadingBar');
  const objectList=$('#objectList'), objectCount=$('#objectCount'), searchInput=$('#searchInput');
  const fieldSearchInput=$('#fieldSearchInput'), fieldResults=$('#fieldResults'), fieldSearchHint=$('#fieldSearchHint');
  const erdCanvas=$('#erdCanvas'), erdNodes=$('#erdNodes'), erdRels=$('#erdRelationships');
  const emptyState=$('#emptyState'), detailPanel=$('#detailPanel'), detailTitle=$('#detailTitle'), detailBody=$('#detailBody');
  const zoomLabel=$('#zoomLabel'), toast=$('#toast'), toastMsg=$('#toastMsg'), toastIcon=$('#toastIcon');
  const detailLoading=$('#detailLoading');

  // ═══ INIT ═══
  async function init() {
    const params = new URLSearchParams(window.location.search);
    instanceUrl = params.get('instanceUrl')||''; sessionId = params.get('sessionId')||'';
    if (!instanceUrl||!sessionId) { showLoadingError('Missing connection parameters.'); return; }
    // Normalize to my.salesforce.com for REST API compatibility
    instanceUrl = instanceUrl.replace(/\.lightning\.force\.com$/, '.my.salesforce.com')
                             .replace(/\.my\.salesforce-setup\.com$/, '.my.salesforce.com')
                             .replace(/\.salesforce-setup\.com$/, '.salesforce.com');
    setupEventListeners();
    try {
      setLoadingProgress(10,'Connecting…'); await testConnection();
      setLoadingProgress(30,'Fetching objects…'); await fetchObjectList();
      setLoadingProgress(90,'Ready!');
      setTimeout(() => { loadingOverlay.classList.add('hidden'); }, 400);
    } catch(err) { showLoadingError('Connection failed: '+err.message); }
  }

  function setLoadingProgress(p,t) { loadingBar.style.width=p+'%'; if(t) loadingStatus.textContent=t; }
  function showLoadingError(m) { loadingStatus.textContent=m; loadingStatus.style.color='#FB7185'; }
  function showToast(m,icon='✓') { toastMsg.textContent=m; toastIcon.textContent=icon; toast.classList.add('visible'); setTimeout(()=>toast.classList.remove('visible'),2500); }

  // ═══ SALESFORCE API ═══
  async function sfApi(path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(instanceUrl+path, { headers:{'Authorization':'Bearer '+sessionId,'Content-Type':'application/json'}, signal: controller.signal });
      if(!res.ok) throw new Error('API '+res.status+' '+res.statusText);
      return res.json();
    } catch(e) {
      if (e.name === 'AbortError') throw new Error('Request timed out after '+API_TIMEOUT_MS/1000+'s');
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function sfToolingQuery(soql) {
    return sfApi('/services/data/'+SF_API_VERSION+'/tooling/query/?q='+encodeURIComponent(soql));
  }

  async function testConnection() { await sfApi('/services/data/'+SF_API_VERSION+'/'); }

  async function fetchObjectList() {
    const data = await sfApi('/services/data/'+SF_API_VERSION+'/sobjects/');
    allObjects = data.sobjects.filter(o=>o.queryable&&!o.name.endsWith('__History')&&!o.name.endsWith('__Feed')&&!o.name.endsWith('__Share')&&!o.name.endsWith('__Tag')&&!o.name.endsWith('ChangeEvent')&&!o.label.includes('__MISSING LABEL__')).sort((a,b)=>a.label.localeCompare(b.label));
    renderObjectList(); objectCount.textContent=allObjects.length+' objects';
  }

  async function fetchObjectDescribe(n) {
    if(objectMeta[n]) return objectMeta[n];
    const d=await sfApi('/services/data/'+SF_API_VERSION+'/sobjects/'+n+'/describe/');
    objectMeta[n]=d; return d;
  }

  // ═══ NEW: Fetch Picklist Values by Record Type (UI API) ═══
  async function fetchPicklistsByRT(objectApi) {
    if (picklistCache[objectApi]) return picklistCache[objectApi];
    const meta = objectMeta[objectApi];
    if (!meta) return {};

    const result = {};
    const rtInfos = meta.recordTypeInfos || [];

    for (const rt of rtInfos) {
      if (!rt.active) continue;
      try {
        const data = await sfApi('/services/data/'+SF_API_VERSION+'/ui-api/object-info/'+objectApi+'/picklist-values/'+rt.recordTypeId);
        const fields = {};
        if (data.picklistFieldValues) {
          Object.entries(data.picklistFieldValues).forEach(([fieldApi, info]) => {
            fields[fieldApi] = (info.values || []).map(v => ({
              label: v.label,
              value: v.value,
              isDefault: v.attributes && v.attributes.defaultValue || false
            }));
          });
        }
        result[rt.recordTypeId] = { name: rt.name, developerName: rt.developerName, fields };
      } catch(e) {
        console.warn('Picklist fetch failed for RT', rt.name, e);
      }
    }

    picklistCache[objectApi] = result;
    return result;
  }

  // ═══ NEW: Fetch Page Layouts (Tooling API) ═══
  async function fetchLayouts(objectApi) {
    if (layoutCache[objectApi]) return layoutCache[objectApi];
    try {
      const data = await sfToolingQuery(
        "SELECT Id, Name, EntityDefinition.QualifiedApiName, TableEnumOrId FROM Layout WHERE TableEnumOrId = '"+escSoql(objectApi)+"'"
      );
      layoutCache[objectApi] = data.records || [];
    } catch(e) {
      // Fallback: try describe layouts
      try {
        const data = await sfApi('/services/data/'+SF_API_VERSION+'/sobjects/'+objectApi+'/describe/layouts/');
        layoutCache[objectApi] = (data.layouts || []).map(l => ({ Id: l.id, Name: l.name }));
      } catch(e2) {
        layoutCache[objectApi] = [];
      }
    }
    return layoutCache[objectApi];
  }

  // ═══ NEW: Fetch Lightning Record Pages / FlexiPages (Tooling API) ═══
  async function fetchFlexiPages(objectApi) {
    if (flexiPageCache[objectApi]) return flexiPageCache[objectApi];
    try {
      const data = await sfToolingQuery(
        "SELECT Id, DeveloperName, MasterLabel, Type, EntityDefinitionId, Description "+
        "FROM FlexiPage WHERE EntityDefinitionId = '"+escSoql(objectApi)+"' OR SobjectType = '"+escSoql(objectApi)+"'"
      );
      flexiPageCache[objectApi] = data.records || [];
    } catch(e) {
      console.warn('FlexiPage fetch failed for', objectApi, e);
      flexiPageCache[objectApi] = [];
    }
    return flexiPageCache[objectApi];
  }

  // ═══ NEW: Fetch Profile Object + Field Permissions ═══
  async function fetchProfilePermissions(objectApi) {
    if (profileCache[objectApi]) return profileCache[objectApi];
    const result = { objectPerms: [], fieldPerms: [], profiles: {} };

    try {
      // Object-level CRUD permissions per profile
      const objData = await sfApi(
        '/services/data/'+SF_API_VERSION+'/query/?q='+encodeURIComponent(
          "SELECT Id, ParentId, Parent.Profile.Name, Parent.Label, SobjectType, "+
          "PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, "+
          "PermissionsViewAllRecords, PermissionsModifyAllRecords "+
          "FROM ObjectPermissions WHERE SobjectType = '"+escSoql(objectApi)+"' "+
          "AND Parent.IsOwnedByProfile = true ORDER BY Parent.Profile.Name"
        )
      );
      result.objectPerms = objData.records || [];
    } catch(e) {
      console.warn('ObjectPermissions query failed', e);
    }

    try {
      // Field-level security per profile
      const flsData = await sfApi(
        '/services/data/'+SF_API_VERSION+'/query/?q='+encodeURIComponent(
          "SELECT Id, ParentId, Parent.Profile.Name, Parent.Label, SobjectType, Field, "+
          "PermissionsRead, PermissionsEdit "+
          "FROM FieldPermissions WHERE SobjectType = '"+escSoql(objectApi)+"' "+
          "AND Parent.IsOwnedByProfile = true ORDER BY Parent.Profile.Name, Field"
        )
      );
      result.fieldPerms = flsData.records || [];
    } catch(e) {
      console.warn('FieldPermissions query failed', e);
    }

    // Group by profile name
    const profiles = {};
    result.objectPerms.forEach(op => {
      const pName = op.Parent?.Profile?.Name || op.Parent?.Label || 'Unknown';
      if (!profiles[pName]) profiles[pName] = { crud: null, fls: [], rts: [], layouts: [] };
      profiles[pName].crud = {
        read: op.PermissionsRead,
        create: op.PermissionsCreate,
        edit: op.PermissionsEdit,
        delete: op.PermissionsDelete,
        viewAll: op.PermissionsViewAllRecords,
        modifyAll: op.PermissionsModifyAllRecords
      };
    });

    result.fieldPerms.forEach(fp => {
      const pName = fp.Parent?.Profile?.Name || fp.Parent?.Label || 'Unknown';
      if (!profiles[pName]) profiles[pName] = { crud: null, fls: [], rts: [], layouts: [] };
      const fieldApi = (fp.Field || '').replace(objectApi+'.', '');
      profiles[pName].fls.push({
        field: fieldApi,
        read: fp.PermissionsRead,
        edit: fp.PermissionsEdit
      });
    });

    result.profiles = profiles;
    profileCache[objectApi] = result;
    return result;
  }

  // ═══ NEW: Fetch Layout Assignments per Profile ═══
  async function fetchLayoutAssignments(objectApi) {
    if (layoutAssignCache[objectApi]) return layoutAssignCache[objectApi];
    try {
      const data = await sfToolingQuery(
        "SELECT Id, Layout.Name, ProfileId, Profile.Name, RecordTypeId, RecordType.Name "+
        "FROM ProfileLayout WHERE TableEnumOrId = '"+escSoql(objectApi)+"' ORDER BY Profile.Name"
      );
      const records = data.records || [];
      // Merge into profileCache
      const profData = profileCache[objectApi];
      if (profData) {
        records.forEach(r => {
          const pName = r.Profile?.Name || 'Unknown';
          if (!profData.profiles[pName]) profData.profiles[pName] = { crud: null, fls: [], rts: [], layouts: [] };
          profData.profiles[pName].layouts.push({
            layoutName: r.Layout?.Name || 'Default',
            recordTypeName: r.RecordType?.Name || 'Master',
            recordTypeId: r.RecordTypeId
          });
        });
      }
      layoutAssignCache[objectApi] = records;
      return records;
    } catch(e) {
      console.warn('ProfileLayout query failed', e);
      layoutAssignCache[objectApi] = [];
      return [];
    }
  }

  // ═══ OBJECT LIST ═══
  function renderObjectList() {
    const s=searchInput.value.toLowerCase();
    const filtered=allObjects.filter(o=>{
      const m=o.label.toLowerCase().includes(s)||o.name.toLowerCase().includes(s);
      if(activeFilter==='custom') return m&&o.custom; if(activeFilter==='standard') return m&&!o.custom; return m;
    });
    objectList.innerHTML=filtered.map(o=>{
      const sel=selectedObjects.has(o.name)?' selected':'';
      const badge=o.custom?'<span class="obj-badge custom">Custom</span>':'<span class="obj-badge standard">Std</span>';
      return '<div class="obj-item'+sel+'" data-api="'+o.name+'"><div class="obj-check"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="obj-info"><div class="obj-label">'+o.label+'</div><div class="obj-api">'+o.name+'</div></div>'+badge+'</div>';
    }).join('');
    const items=objectList.querySelectorAll('.obj-item');
    let lastClickedIdx=-1;
    items.forEach((el,idx)=>el.addEventListener('click',async(e)=>{
      if(e.shiftKey&&lastClickedIdx>=0){
        const start=Math.min(lastClickedIdx,idx),end=Math.max(lastClickedIdx,idx);
        for(let i=start;i<=end;i++){const api=items[i].dataset.api;if(!selectedObjects.has(api))await toggleObject(api);}
      } else { await toggleObject(el.dataset.api); }
      lastClickedIdx=idx;
    }));
  }

  async function toggleObject(api) {
    if(selectedObjects.has(api)){selectedObjects.delete(api);delete nodePositions[api];}
    else{selectedObjects.add(api);try{await fetchObjectDescribe(api);}catch(e){console.warn('Failed to describe '+api,e);}assignPosition(api);}
    renderObjectList();buildRelationships();renderERD();updateEmptyState();
  }
  function assignPosition(api){const c=Object.keys(nodePositions).length;const cols=Math.ceil(Math.sqrt(c+1));nodePositions[api]={x:60+(c%cols)*(CARD_WIDTH+80),y:60+Math.floor(c/cols)*350};}
  function updateEmptyState(){emptyState.classList.toggle('hidden',selectedObjects.size>0);}

  // ═══ FIELD SEARCH ═══
  function searchFields(query) {
    query=query.trim();
    if(!query||query.length<2){fieldResults.innerHTML='';fieldSearchHint.style.display='block';return;}
    fieldSearchHint.style.display='none';
    const q=query.toLowerCase(), results=[];
    Object.entries(objectMeta).forEach(([objName,meta])=>{
      meta.fields.forEach(field=>{
        if(field.label.toLowerCase().includes(q)||field.name.toLowerCase().includes(q)||field.type.toLowerCase().includes(q))
          results.push({objName,objLabel:meta.label,field});
      });
    });
    results.sort((a,b)=>{const ae=a.field.name.toLowerCase()===q;const be=b.field.name.toLowerCase()===q;if(ae&&!be)return-1;if(!ae&&be)return 1;return a.objLabel.localeCompare(b.objLabel);});
    fieldResults.innerHTML=results.slice(0,50).map(r=>{
      const icon=FIELD_ICONS[r.field.type]||FIELD_ICONS.default;
      return '<div class="field-result-item" data-obj="'+r.objName+'"><div class="field-result-obj">'+r.objLabel+'</div><div class="field-result-name">'+icon+' '+hl(r.field.label,q)+'</div><div class="field-result-meta">'+hl(r.field.name,q)+' · '+r.field.type+(r.field.referenceTo?' → '+r.field.referenceTo.join(', '):'')+'</div></div>';
    }).join('');
    if(!results.length) fieldResults.innerHTML='<div class="empty-tab-msg">No fields found. Load more objects first.</div>';
    fieldResults.querySelectorAll('.field-result-item').forEach(el=>el.addEventListener('click',()=>{
      const obj=el.dataset.obj; if(!selectedObjects.has(obj)) toggleObject(obj); showDetail(obj);
    }));
  }
  function hl(text,q){const i=text.toLowerCase().indexOf(q);if(i===-1)return text;return text.slice(0,i)+'<span class="field-result-highlight">'+text.slice(i,i+q.length)+'</span>'+text.slice(i+q.length);}

  // ═══ SAVE / LOAD ═══
  function saveLayout() {
    const layout={instanceUrl,selectedObjects:[...selectedObjects],nodePositions:{...nodePositions},zoom,panX,panY,timestamp:new Date().toISOString()};
    try{localStorage.setItem('schelio_layout_'+instanceUrl.replace(/[^a-zA-Z0-9]/g,'_'),JSON.stringify(layout));showToast('Layout saved!','💾');}
    catch(e){showToast('Save failed','⚠️');}
  }
  async function loadLayout() {
    const saved=localStorage.getItem('schelio_layout_'+instanceUrl.replace(/[^a-zA-Z0-9]/g,'_'));
    if(!saved){showToast('No saved layout','⚠️');return;}
    try{
      const L=JSON.parse(saved); showToast('Loading…','⏳');
      selectedObjects=new Set(L.selectedObjects); nodePositions=L.nodePositions||{}; zoom=L.zoom||1; panX=L.panX||0; panY=L.panY||0;
      for(const o of L.selectedObjects){try{await fetchObjectDescribe(o);}catch(e){console.warn('Failed to describe '+o,e);}}
      renderObjectList();buildRelationships();renderERD();updateEmptyState();applyTransform();
      showToast('Restored '+L.selectedObjects.length+' objects','✓');
    }catch(e){showToast('Load failed','⚠️');}
  }

  // ═══ MERMAID ═══
  function generateMermaid() {
    let m='erDiagram\n';
    selectedObjects.forEach(api=>{
      const meta=objectMeta[api];if(!meta)return;
      const safe=api.replace(/__c$/,'_c').replace(/[^a-zA-Z0-9_]/g,'_');
      m+='    '+safe+' {\n';
      meta.fields.filter(f=>!f.deprecatedAndHidden).sort((a,b)=>{if(a.name==='Id')return-1;if(b.name==='Id')return 1;return a.label.localeCompare(b.label);}).forEach(f=>{
        const t={id:'string',string:'string',textarea:'text',boolean:'boolean',int:'int',double:'double',currency:'decimal',percent:'decimal',date:'date',datetime:'datetime',email:'string',phone:'string',url:'string',picklist:'enum',multipicklist:'enum',reference:'string',address:'string'}[f.type]||'string';
        const pk=f.name==='Id'?'PK':(f.type==='reference'?'FK':'');
        m+='        '+t+' '+f.name.replace(/[^a-zA-Z0-9_]/g,'_')+(pk?' '+pk:'')+'\n';
      });
      m+='    }\n';
    });
    m+='\n';
    relationships.forEach(r=>{
      const fr=r.from.replace(/__c$/,'_c').replace(/[^a-zA-Z0-9_]/g,'_');
      const to=r.to.replace(/__c$/,'_c').replace(/[^a-zA-Z0-9_]/g,'_');
      m+='    '+to+(r.type==='master-detail'?' ||--o{ ':' }o--|| ')+fr+' : "'+r.field+'"\n';
    });
    return m;
  }
  function showMermaidModal(){$('#mermaidCode').textContent=generateMermaid();$('#mermaidModal').classList.add('visible');}
  function copyMermaid(){navigator.clipboard.writeText($('#mermaidCode').textContent).then(()=>showToast('Copied!','📋')).catch(()=>{const t=document.createElement('textarea');t.value=$('#mermaidCode').textContent;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);showToast('Copied!','📋');});}

  // ═══ DETAIL PANEL — SHOW WITH TABS ═══
  async function showDetail(apiName) {
    const meta = objectMeta[apiName];
    if (!meta) return;
    activeDetailObject = apiName;
    detailTitle.textContent = meta.label;
    detailPanel.classList.add('visible');

    // Reset tabs to Overview
    document.querySelectorAll('.detail-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.detail-tab-panel').forEach(p=>p.classList.remove('active'));
    document.querySelector('.detail-tab[data-dtab="overview"]').classList.add('active');
    $('#dtabOverview').classList.add('active');

    // ── TAB 1: Overview (sync) ──
    renderOverviewTab(meta);

    // ── TAB 2: Record Types (sync from describe) ──
    renderRecordTypesTab(meta);

    // ── TAB 3: Picklists (async) ──
    $('#dtabPicklists').innerHTML = '<div class="detail-loading"><div class="detail-spinner"></div><span>Loading picklist values…</span></div>';

    // ── TAB 4: Layouts (async) ──
    $('#dtabLayouts').innerHTML = '<div class="detail-loading"><div class="detail-spinner"></div><span>Loading layouts & pages…</span></div>';

    // ── TAB 5: Profiles (async) ──
    $('#dtabProfiles').innerHTML = '<div class="detail-loading"><div class="detail-spinner"></div><span>Loading profile permissions…</span></div>';

    // ── TAB 6: Validation Rules (async) ──
    $('#dtabValidations').innerHTML = '<div class="detail-loading"><div class="detail-spinner"></div><span>Loading validation rules…</span></div>';

    // ── TAB 7: Automation (async) ──
    $('#dtabAutomation').innerHTML = '<div class="detail-loading"><div class="detail-spinner"></div><span>Loading automation…</span></div>';

    // ── TAB 8: Health (sync) ──
    renderHealthTab(meta);

    // Fetch async data in background
    // Guard: skip rendering if user switched to another object while loading
    fetchPicklistsByRT(apiName).then(data => {
      if (activeDetailObject === apiName) renderPicklistsTab(meta, data);
    }).catch(e => {
      if (activeDetailObject === apiName) $('#dtabPicklists').innerHTML = '<div class="empty-tab-msg">Could not load picklist values.<br>'+escHtml(e.message)+'</div>';
    });

    Promise.all([fetchLayouts(apiName), fetchFlexiPages(apiName)]).then(([layouts, pages]) => {
      if (activeDetailObject === apiName) renderLayoutsTab(meta, layouts, pages);
    }).catch(e => {
      if (activeDetailObject === apiName) $('#dtabLayouts').innerHTML = '<div class="empty-tab-msg">Could not load layouts.<br>'+escHtml(e.message)+'</div>';
    });

    fetchProfilePermissions(apiName).then(profData => {
      return fetchLayoutAssignments(apiName).then(() => profData);
    }).then(profData => {
      if (activeDetailObject === apiName) {
        renderProfilesTab(meta, profData);
        renderPermSetsInProfilesTab(apiName, $('#dtabProfiles'));
      }
    }).catch(e => {
      if (activeDetailObject === apiName) $('#dtabProfiles').innerHTML = '<div class="empty-tab-msg">Could not load profile permissions.<br>'+escHtml(e.message)+'</div>';
    });

    fetchValidationRules(apiName).then(rules => {
      if (activeDetailObject === apiName) renderValidationsTab(meta, rules);
    }).catch(e => {
      if (activeDetailObject === apiName) $('#dtabValidations').innerHTML = '<div class="empty-tab-msg">Could not load validation rules.<br>'+escHtml(e.message)+'</div>';
    });

    fetchAutomation(apiName).then(data => {
      if (activeDetailObject === apiName) renderAutomationTab(meta, data);
    }).catch(e => {
      if (activeDetailObject === apiName) $('#dtabAutomation').innerHTML = '<div class="empty-tab-msg">Could not load automation.<br>'+escHtml(e.message)+'</div>';
    });
  }

  function renderOverviewTab(meta) {
    const fields = meta.fields.filter(f=>!f.deprecatedAndHidden).sort((a,b)=>a.label.localeCompare(b.label));
    const rels = meta.fields.filter(f=>f.type==='reference');
    let h = '<div class="detail-section"><div class="detail-section-title">Overview</div>';
    h += '<div class="detail-stat"><span class="detail-stat-label">API Name</span><span class="detail-stat-value">'+escHtml(meta.name)+' '+copyBtn(meta.name)+'</span></div>';
    h += '<div class="detail-stat"><span class="detail-stat-label">Key Prefix</span><span class="detail-stat-value">'+(meta.keyPrefix||'—')+' '+(meta.keyPrefix?copyBtn(meta.keyPrefix):'')+'</span></div>';
    h += sr('Label',meta.label)+sr('Fields',meta.fields.length)+sr('Custom',meta.custom?'Yes':'No');
    h += sr('Record Types',(meta.recordTypeInfos||[]).filter(r=>r.active).length)+'</div>';

    h += '<div class="detail-section"><div class="detail-section-title">Fields ('+fields.length+')</div>';
    fields.forEach(f=>{h+='<div class="detail-field-row"><div class="detail-field-icon">'+(FIELD_ICONS[f.type]||FIELD_ICONS.default)+'</div><div class="detail-field-name">'+escHtml(f.label)+(f.nillable?'':' *')+'</div><div class="detail-field-api">'+escHtml(f.name)+' '+copyBtn(f.name)+'</div><div class="detail-field-type">'+f.type+'</div></div>';});
    h += '</div>';

    if(rels.length){
      h+='<div class="detail-section"><div class="detail-section-title">Relationships ('+rels.length+')</div>';
      rels.forEach(f=>{h+='<div class="detail-field-row"><div class="detail-field-icon">🔗</div><div class="detail-field-name">'+f.name+'</div><div class="detail-field-type">'+(f.referenceTo||[]).join(', ')+'</div></div>';});
      h+='</div>';
    }
    $('#dtabOverview').innerHTML = h;
  }

  function renderRecordTypesTab(meta) {
    const rts = meta.recordTypeInfos || [];
    if (!rts.length || (rts.length === 1 && rts[0].master)) {
      $('#dtabRecordtypes').innerHTML = '<div class="empty-tab-msg">No custom Record Types on this object.<br>Only the Master Record Type exists.</div>';
      return;
    }

    let h = '<div class="detail-section"><div class="detail-section-title">Record Types ('+rts.filter(r=>!r.master).length+')</div>';

    // Sort: active first, then by name
    const sorted = [...rts].sort((a,b) => {
      if (a.master) return 1; if (b.master) return -1;
      if (a.active && !b.active) return -1; if (!a.active && b.active) return 1;
      return a.name.localeCompare(b.name);
    });

    sorted.forEach(rt => {
      let badges = '';
      if (rt.master) badges += '<span class="rt-badge master">Master</span> ';
      else if (rt.active) badges += '<span class="rt-badge active">Active</span> ';
      else badges += '<span class="rt-badge inactive">Inactive</span> ';
      if (rt.defaultRecordTypeMapping) badges += '<span class="rt-badge default">Default</span> ';

      h += '<div class="rt-card">';
      h += '<div class="rt-card-header"><div><div class="rt-card-name">'+rt.name+'</div><div class="rt-card-api">'+rt.developerName+'</div></div><div>'+badges+'</div></div>';
      h += '<div class="rt-meta"><span>ID: '+rt.recordTypeId+'</span></div>';
      h += '</div>';
    });

    h += '</div>';
    $('#dtabRecordtypes').innerHTML = h;
  }

  // ═══ PICKLIST DEPENDENCIES ═══
  function buildPicklistDependencies(meta) {
    const deps = { controlling: {}, dependent: {} };
    meta.fields.forEach(f => {
      if (f.controllerName && (f.type === 'picklist' || f.type === 'multipicklist')) {
        if (!deps.controlling[f.controllerName]) deps.controlling[f.controllerName] = [];
        deps.controlling[f.controllerName].push(f.name);
        deps.dependent[f.name] = f.controllerName;
      }
    });
    return deps;
  }

  function decodeValidFor(encoded) {
    const decoded = atob(encoded);
    const indices = new Set();
    for (let byteIdx = 0; byteIdx < decoded.length; byteIdx++) {
      const byte = decoded.charCodeAt(byteIdx);
      for (let bit = 0; bit < 8; bit++) {
        if ((byte >> (7 - bit)) & 1) indices.add(byteIdx * 8 + bit);
      }
    }
    return indices;
  }

  function buildDependencyMatrix(meta, controllerName, dependentName) {
    const controllerField = meta.fields.find(f => f.name === controllerName);
    const dependentField = meta.fields.find(f => f.name === dependentName);
    if (!controllerField || !dependentField) return {};

    const controllerValues = (controllerField.picklistValues || []).filter(v => v.active);
    const dependentValues = (dependentField.picklistValues || []).filter(v => v.active);
    const matrix = {};

    controllerValues.forEach((cv, idx) => { matrix[cv.value] = []; });
    dependentValues.forEach(dv => {
      if (dv.validFor) {
        const validIndices = decodeValidFor(dv.validFor);
        validIndices.forEach(idx => {
          if (idx < controllerValues.length) {
            const cv = controllerValues[idx].value;
            if (matrix[cv]) matrix[cv].push({ label: dv.label, value: dv.value });
          }
        });
      }
    });
    return matrix;
  }

  function buildDepChains(deps) {
    const chains = [];
    const roots = Object.keys(deps.controlling).filter(c => !deps.dependent[c]);
    roots.forEach(root => {
      const chain = [root];
      const visited = new Set([root]);
      let current = root;
      while (deps.controlling[current] && deps.controlling[current].length) {
        current = deps.controlling[current][0];
        if (visited.has(current)) break; // prevent circular dependency loop
        visited.add(current);
        chain.push(current);
      }
      if (chain.length > 1) chains.push(chain);
    });
    return chains;
  }

  function renderPicklistsTab(meta, picklistData) {
    const picklistFields = meta.fields.filter(f => f.type === 'picklist' || f.type === 'multipicklist').sort((a,b) => a.label.localeCompare(b.label));

    if (!picklistFields.length) {
      $('#dtabPicklists').innerHTML = '<div class="empty-tab-msg">No picklist fields on this object.</div>';
      return;
    }

    const deps = buildPicklistDependencies(meta);
    const chains = buildDepChains(deps);
    const rtEntries = Object.entries(picklistData);

    let h = '';

    // ── Dependency tree (if any) ──
    if (chains.length) {
      h += '<div class="pl-dep-tree"><div class="detail-section-title">Picklist Dependencies</div>';
      chains.forEach(chain => {
        h += '<div class="pl-dep-chain">';
        chain.forEach((fieldApi, i) => {
          const f = meta.fields.find(ff => ff.name === fieldApi);
          const label = f ? f.label : fieldApi;
          const isPicklist = f && (f.type === 'picklist' || f.type === 'multipicklist');
          h += '<span class="pl-dep-node'+(isPicklist ? '' : ' pl-dep-node-checkbox')+'" title="'+fieldApi+'">'+label+'</span>';
          if (i < chain.length - 1) h += '<span class="pl-dep-arrow">→</span>';
        });
        h += '</div>';
      });
      h += '</div>';
    }

    h += '<div class="detail-section"><div class="detail-section-title">Picklist Fields ('+picklistFields.length+')</div>';

    // Pre-build dependency matrices for interactive filtering
    const matrices = {};
    Object.entries(deps.dependent).forEach(([depField, ctrlField]) => {
      matrices[depField] = buildDependencyMatrix(meta, ctrlField, depField);
    });

    picklistFields.forEach(field => {
      const totalValues = new Set();
      rtEntries.forEach(([rtId, rt]) => {
        if (rt.fields[field.name]) rt.fields[field.name].forEach(v => totalValues.add(v.value));
      });

      const isControlling = !!deps.controlling[field.name];
      const isDep = !!deps.dependent[field.name];

      h += '<div class="pl-accordion'+(isControlling?' pl-controlling':'')+(isDep?' pl-dependent':'')+'" data-pl="'+field.name+'">';
      h += '<div class="pl-accordion-header">';
      h += '<span class="pl-accordion-arrow">▶</span>';
      h += '<span class="pl-accordion-title">'+(FIELD_ICONS[field.type]||'📋')+' '+field.label+'</span>';

      // Dependency badges
      if (isControlling) {
        const depLabels = deps.controlling[field.name].map(d => { const f = meta.fields.find(ff=>ff.name===d); return f?f.label:d; });
        h += '<span class="pl-dep-badge pl-dep-badge-ctrl" title="Controls: '+depLabels.join(', ')+'">Controls '+depLabels.join(', ')+'</span>';
      }
      if (isDep) {
        const ctrlField = meta.fields.find(f => f.name === deps.dependent[field.name]);
        const ctrlLabel = ctrlField ? ctrlField.label : deps.dependent[field.name];
        h += '<span class="pl-dep-badge pl-dep-badge-dep" title="Depends on: '+ctrlLabel+'">Depends on '+ctrlLabel+'</span>';
      }

      h += '<span class="pl-accordion-count">'+totalValues.size+' values</span>';
      h += '</div>';
      h += '<div class="pl-accordion-body">';

      // If this is a dependent field, show interactive dependency matrix
      if (isDep && matrices[field.name]) {
        const matrix = matrices[field.name];
        const ctrlField = meta.fields.find(f => f.name === deps.dependent[field.name]);
        const ctrlLabel = ctrlField ? ctrlField.label : deps.dependent[field.name];
        const ctrlValues = Object.keys(matrix);

        h += '<div class="pl-dep-matrix" data-dep-field="'+field.name+'">';
        h += '<div class="pl-dep-matrix-label">Select a '+ctrlLabel+' value to filter:</div>';
        h += '<div class="pl-dep-ctrl-values">';
        h += '<span class="pl-dep-ctrl-val active-filter" data-ctrl-val="__all__">All</span>';
        ctrlValues.forEach(cv => {
          const count = matrix[cv].length;
          h += '<span class="pl-dep-ctrl-val" data-ctrl-val="'+cv+'" title="'+count+' dependent values">'+cv+'</span>';
        });
        h += '</div>';
        h += '<div class="pl-dep-values" data-dep-target="'+field.name+'">';
        // Show all values initially
        const allDepValues = new Map();
        Object.entries(matrix).forEach(([cv, dvs]) => {
          dvs.forEach(dv => { if (!allDepValues.has(dv.value)) allDepValues.set(dv.value, { label: dv.label, controllers: [] }); allDepValues.get(dv.value).controllers.push(cv); });
        });
        allDepValues.forEach((info, val) => {
          h += '<span class="pl-value pl-dep-val" data-dep-val="'+val+'" data-controllers="'+info.controllers.join('||')+'" title="'+val+' (available for: '+info.controllers.join(', ')+')">'+info.label+'</span>';
        });
        if (!allDepValues.size) h += '<span style="color:var(--text-faint);font-size:11px">No dependency data available</span>';
        h += '</div></div>';
      } else if (rtEntries.length <= 1) {
        const values = rtEntries[0] ? (rtEntries[0][1].fields[field.name] || []) : [];
        h += '<div class="pl-value-list">';
        values.forEach(v => {
          let cls = 'pl-value';
          if (v.isDefault) cls += ' default-val';
          if (isControlling) cls += ' pl-ctrl-clickable';
          h += '<span class="'+cls+'" title="'+v.value+'">'+v.label+'</span>';
        });
        if (!values.length) h += '<span style="color:var(--text-faint);font-size:11px">No values</span>';
        h += '</div>';
      } else {
        rtEntries.forEach(([rtId, rt]) => {
          const values = rt.fields[field.name] || [];
          h += '<div class="pl-rt-group">';
          h += '<div class="pl-rt-label">'+rt.name+' ('+values.length+')</div>';
          h += '<div class="pl-value-list">';
          values.forEach(v => {
            let cls = 'pl-value';
            if (v.isDefault) cls += ' default-val';
            if (isControlling) cls += ' pl-ctrl-clickable';
            h += '<span class="'+cls+'" title="'+v.value+'">'+v.label+'</span>';
          });
          if (!values.length) h += '<span style="color:var(--text-faint);font-size:11px">No values for this RT</span>';
          h += '</div></div>';
        });
      }

      h += '</div></div>';
    });

    h += '</div>';
    $('#dtabPicklists').innerHTML = h;

    // Accordion click handlers
    document.querySelectorAll('.pl-accordion-header').forEach(hdr => {
      hdr.addEventListener('click', () => hdr.parentElement.classList.toggle('open'));
    });

    // Dependency filter click handlers
    document.querySelectorAll('.pl-dep-ctrl-val').forEach(btn => {
      btn.addEventListener('click', () => {
        const matrix = btn.closest('.pl-dep-matrix');
        const depField = matrix.dataset.depField;
        const ctrlVal = btn.dataset.ctrlVal;

        // Toggle active state
        matrix.querySelectorAll('.pl-dep-ctrl-val').forEach(b => b.classList.remove('active-filter'));
        btn.classList.add('active-filter');

        // Filter dependent values
        const valContainer = matrix.querySelector('.pl-dep-values');
        valContainer.querySelectorAll('.pl-dep-val').forEach(v => {
          if (ctrlVal === '__all__') {
            v.classList.remove('filtered-out');
          } else {
            const controllers = v.dataset.controllers.split('||');
            v.classList.toggle('filtered-out', !controllers.includes(ctrlVal));
          }
        });
      });
    });
  }

  function renderLayoutsTab(meta, layouts, flexiPages) {
    let h = '';

    // ── Page Layouts ──
    h += '<div class="layout-section-title">Page Layouts ('+layouts.length+')</div>';
    if (layouts.length) {
      layouts.forEach(l => {
        h += '<div class="layout-card"><div class="layout-card-header">';
        h += '<span class="layout-card-icon">📐</span>';
        h += '<div class="layout-card-info"><div class="layout-card-name">'+(l.Name||l.name||'Unnamed')+'</div>';
        h += '<div class="layout-card-type">ID: '+(l.Id||l.id||'—')+'</div></div>';
        h += '</div></div>';
      });
    } else {
      h += '<div class="empty-tab-msg">No page layouts found.</div>';
    }

    // ── Lightning Record Pages ──
    h += '<div class="layout-section-title">Lightning Record Pages ('+flexiPages.length+')</div>';
    if (flexiPages.length) {
      flexiPages.forEach(fp => {
        const typeLabel = fp.Type === 'RecordPage' ? '⚡ Record Page' : fp.Type === 'AppPage' ? '📱 App Page' : fp.Type || 'Page';
        h += '<div class="layout-card"><div class="layout-card-header">';
        h += '<span class="layout-card-icon">⚡</span>';
        h += '<div class="layout-card-info"><div class="layout-card-name">'+(fp.MasterLabel||fp.DeveloperName)+'</div>';
        h += '<div class="layout-card-type">'+typeLabel+' · '+fp.DeveloperName+'</div></div>';
        h += '</div>';
        if (fp.Description) {
          h += '<div class="layout-card-body"><div class="layout-assignment"><span>'+fp.Description+'</span></div></div>';
        }
        h += '</div>';
      });
    } else {
      h += '<div class="empty-tab-msg">No Lightning Record Pages found for this object.</div>';
    }

    // ── Layout Assignments (from describe) ──
    const rts = meta.recordTypeInfos || [];
    if (rts.length > 1) {
      h += '<div class="layout-section-title">Record Type → Layout Mapping</div>';
      h += '<div class="layout-card"><div class="layout-card-body">';
      rts.filter(rt=>!rt.master).forEach(rt => {
        // Find matching layout name if possible
        const layoutMatch = layouts.find(l => (l.Name||l.name||'').includes(rt.name));
        h += '<div class="layout-assignment">';
        h += '<span class="layout-assignment-label">'+rt.name+'</span>';
        h += '<span>→ '+(layoutMatch ? (layoutMatch.Name||layoutMatch.name) : 'Default Layout')+'</span>';
        h += '</div>';
      });
      h += '</div></div>';
    }

    $('#dtabLayouts').innerHTML = h;
  }

  // ═══ NEW: RENDER PROFILES TAB ═══
  function renderProfilesTab(meta, profData) {
    const profiles = profData.profiles || {};
    const profileNames = Object.keys(profiles).sort();

    if (!profileNames.length) {
      $('#dtabProfiles').innerHTML = '<div class="empty-tab-msg">No profile permissions found for this object.<br>This may require additional API permissions.</div>';
      return;
    }

    const allFields = meta.fields.filter(f => !f.deprecatedAndHidden).sort((a,b) => a.label.localeCompare(b.label));

    let h = '<div class="detail-section"><div class="detail-section-title">Profiles with access ('+profileNames.length+')</div>';

    profileNames.forEach(pName => {
      const p = profiles[pName];

      h += '<div class="profile-accordion" data-profile="'+pName+'">';
      h += '<div class="profile-accordion-header">';
      h += '<span class="profile-accordion-arrow">▶</span>';
      h += '<span class="profile-accordion-name">👤 '+pName+'</span>';
      // Quick CRUD summary
      if (p.crud) {
        const crudCount = [p.crud.read,p.crud.create,p.crud.edit,p.crud.delete].filter(Boolean).length;
        h += '<span class="pl-accordion-count">'+crudCount+'/4 CRUD</span>';
      }
      h += '</div>';
      h += '<div class="profile-accordion-body">';

      // ── CRUD permissions ──
      if (p.crud) {
        h += '<div class="profile-sub-title">Object Permissions (CRUD)</div>';
        h += '<div class="crud-row">';
        const cruds = [
          ['Read', p.crud.read], ['Create', p.crud.create], ['Edit', p.crud.edit],
          ['Delete', p.crud.delete], ['View All', p.crud.viewAll], ['Modify All', p.crud.modifyAll]
        ];
        cruds.forEach(([label, val]) => {
          h += '<span class="crud-badge '+(val?'on':'off')+'">'+(val?'✓':'✕')+' '+label+'</span>';
        });
        h += '</div>';
      }

      // ── Layout assignments ──
      if (p.layouts && p.layouts.length) {
        h += '<div class="profile-sub-title">Layout Assignments</div>';
        p.layouts.forEach(la => {
          h += '<div class="profile-layout-row">';
          h += '<span class="profile-layout-rt">'+la.recordTypeName+'</span>';
          h += '<span style="color:var(--text-faint)">→</span>';
          h += '<span class="profile-layout-name">'+la.layoutName+'</span>';
          h += '</div>';
        });
      }

      // ── Field-Level Security ──
      if (p.fls && p.fls.length) {
        h += '<div class="profile-sub-title">Field-Level Security ('+p.fls.length+' fields)</div>';

        // Filter buttons
        h += '<div class="fls-filter">';
        h += '<button class="fls-filter-btn active" data-fls-filter="all" data-profile="'+pName+'">All</button>';
        h += '<button class="fls-filter-btn" data-fls-filter="restricted" data-profile="'+pName+'">Restricted</button>';
        h += '<button class="fls-filter-btn" data-fls-filter="readonly" data-profile="'+pName+'">Read Only</button>';
        h += '</div>';

        h += '<table class="fls-table" data-fls-profile="'+pName+'">';
        h += '<thead><tr><th>Field</th><th>Label</th><th style="text-align:center">Read</th><th style="text-align:center">Edit</th></tr></thead>';
        h += '<tbody>';

        // Match FLS entries with field metadata for labels
        const flsSorted = [...p.fls].sort((a,b) => a.field.localeCompare(b.field));
        flsSorted.forEach(fls => {
          const fieldMeta = allFields.find(f => f.name === fls.field);
          const label = fieldMeta ? fieldMeta.label : fls.field;
          const restricted = !fls.read || !fls.edit;
          const readonly = fls.read && !fls.edit;
          h += '<tr data-fls-restricted="'+(restricted?'1':'0')+'" data-fls-readonly="'+(readonly?'1':'0')+'">';
          h += '<td>'+fls.field+'</td>';
          h += '<td style="color:var(--text-secondary);font-family:var(--font-sans)">'+label+'</td>';
          h += '<td style="text-align:center"><span class="fls-icon '+(fls.read?'yes':'no')+'">'+(fls.read?'✓':'✕')+'</span></td>';
          h += '<td style="text-align:center"><span class="fls-icon '+(fls.edit?'yes':'no')+'">'+(fls.edit?'✓':'✕')+'</span></td>';
          h += '</tr>';
        });

        h += '</tbody></table>';
      }

      h += '</div></div>';
    });

    h += '</div>';
    $('#dtabProfiles').innerHTML = h;

    // Accordion handlers
    document.querySelectorAll('.profile-accordion-header').forEach(hdr => {
      hdr.addEventListener('click', () => hdr.parentElement.classList.toggle('open'));
    });

    // FLS filter handlers
    document.querySelectorAll('.fls-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pName = btn.dataset.profile;
        const filter = btn.dataset.flsFilter;
        // Toggle active state within this filter group
        btn.parentElement.querySelectorAll('.fls-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Filter rows
        const table = document.querySelector('.fls-table[data-fls-profile="'+pName+'"]');
        if (!table) return;
        table.querySelectorAll('tbody tr').forEach(row => {
          if (filter === 'all') { row.style.display = ''; }
          else if (filter === 'restricted') { row.style.display = row.dataset.flsRestricted === '1' ? '' : 'none'; }
          else if (filter === 'readonly') { row.style.display = row.dataset.flsReadonly === '1' ? '' : 'none'; }
        });
      });
    });
  }

  function sr(l,v){return '<div class="detail-stat"><span class="detail-stat-label">'+l+'</span><span class="detail-stat-value">'+escHtml(String(v))+'</span></div>';}
  function copyBtn(text){return '<button class="copy-btn" data-copy="'+escHtml(text)+'" title="Copy">📋</button>';}
  function copyToClipboard(text){navigator.clipboard.writeText(text).then(()=>showToast('Copied!','📋')).catch(()=>showToast('Copy failed','⚠️'));}

  // ═══ PDF SPEC (updated with RT + picklists) ═══
  function exportPdfSpec() {
    const selected=[...selectedObjects];
    if(!selected.length){showToast('Select objects first','⚠️');return;}
    const now=new Date();
    const dateStr=now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
    const orgName=escHtml(instanceUrl.replace('https://','').replace('.my.salesforce.com','').replace('.lightning.force.com',''));
    const totalFields=selected.reduce((s,a)=>s+(objectMeta[a]?.fields?.length||0),0);

    let objectSections='';
    selected.forEach((apiName,idx)=>{
      const meta=objectMeta[apiName];if(!meta)return;
      const fields=meta.fields.filter(f=>!f.deprecatedAndHidden).sort((a,b)=>a.label.localeCompare(b.label));
      const refFields=fields.filter(f=>f.type==='reference');
      const requiredFields=fields.filter(f=>!f.nillable&&f.name!=='Id');
      const customFields=fields.filter(f=>f.custom);
      const rts=(meta.recordTypeInfos||[]).filter(r=>!r.master&&r.active);

      objectSections+=`<div class="spec-object ${idx>0?'page-break':''}"><h2><span class="obj-num">${idx+1}</span>${meta.label}<span class="obj-type-badge ${meta.custom?'custom':'standard'}">${meta.custom?'Custom':'Standard'}</span></h2>
      <div class="spec-meta-grid"><div class="meta-item"><span class="meta-label">API Name</span><span class="meta-value mono">${meta.name}</span></div><div class="meta-item"><span class="meta-label">Key Prefix</span><span class="meta-value mono">${meta.keyPrefix||'—'}</span></div><div class="meta-item"><span class="meta-label">Total Fields</span><span class="meta-value">${fields.length}</span></div><div class="meta-item"><span class="meta-label">Custom Fields</span><span class="meta-value">${customFields.length}</span></div><div class="meta-item"><span class="meta-label">Required</span><span class="meta-value">${requiredFields.length}</span></div><div class="meta-item"><span class="meta-label">Relationships</span><span class="meta-value">${refFields.length}</span></div><div class="meta-item"><span class="meta-label">Record Types</span><span class="meta-value">${rts.length}</span></div><div class="meta-item"><span class="meta-label">Searchable</span><span class="meta-value">${meta.searchable?'Yes':'No'}</span></div></div>`;

      // Record Types table
      if(rts.length){
        objectSections+=`<h3>Record Types</h3><table><thead><tr><th>Name</th><th>Developer Name</th><th>ID</th><th>Default</th></tr></thead><tbody>`;
        rts.forEach(rt=>{objectSections+=`<tr><td>${rt.name}</td><td class="mono">${rt.developerName}</td><td class="mono">${rt.recordTypeId}</td><td class="center">${rt.defaultRecordTypeMapping?'●':''}</td></tr>`;});
        objectSections+=`</tbody></table>`;
      }

      // Picklist values in PDF
      const plData = picklistCache[apiName];
      const plFields = fields.filter(f=>f.type==='picklist'||f.type==='multipicklist');
      if (plData && plFields.length) {
        objectSections += '<h3>Picklist Values</h3>';
        plFields.forEach(f => {
          objectSections += '<p style="font-weight:600;margin:8px 0 4px">'+f.label+' <span class="mono" style="font-weight:400;color:#94A3B8">('+f.name+')</span></p>';
          const rtEntries = Object.entries(plData);
          if (rtEntries.length <= 1) {
            const values = rtEntries[0] ? (rtEntries[0][1].fields[f.name]||[]) : [];
            objectSections += '<p class="mono" style="font-size:9px;color:#475569">'+values.map(v=>v.label).join(' · ')+'</p>';
          } else {
            objectSections += '<table><thead><tr><th>Record Type</th><th>Values</th></tr></thead><tbody>';
            rtEntries.forEach(([rtId,rt])=>{
              const vals = rt.fields[f.name]||[];
              objectSections += '<tr><td>'+rt.name+'</td><td class="mono" style="font-size:9px">'+vals.map(v=>v.label).join(' · ')+'</td></tr>';
            });
            objectSections += '</tbody></table>';
          }
        });
      }

      if(refFields.length){
        objectSections+=`<h3>Relationships</h3><table><thead><tr><th>Field</th><th>API Name</th><th>References</th><th>Type</th></tr></thead><tbody>`;
        refFields.forEach(f=>{const t=f.cascadeDelete?'Master-Detail':'Lookup';objectSections+=`<tr><td>${f.label}</td><td class="mono">${f.name}</td><td class="mono">${(f.referenceTo||[]).join(', ')}</td><td><span class="rel-badge ${t==='Master-Detail'?'md':'lk'}">${t}</span></td></tr>`;});
        objectSections+=`</tbody></table>`;
      }
      objectSections+=`<h3>Field Dictionary</h3><table><thead><tr><th>#</th><th>Label</th><th>API Name</th><th>Type</th><th>Length</th><th>Req</th><th>Custom</th></tr></thead><tbody>`;
      fields.forEach((f,i)=>{objectSections+=`<tr class="${f.type==='reference'?'row-ref':''}"><td class="center">${i+1}</td><td>${f.label}</td><td class="mono">${f.name}</td><td class="mono">${f.type}${f.type==='reference'?' → '+(f.referenceTo||[]).join(', '):''}</td><td class="center">${f.length||f.precision||'—'}</td><td class="center">${f.nillable?'':'●'}</td><td class="center">${f.custom?'●':''}</td></tr>`;});
      objectSections+=`</tbody></table></div>`;
    });

    let erdSummary='';
    if(relationships.length){
      erdSummary=`<div class="spec-object page-break"><h2><span class="obj-num">☆</span>Relationship Map</h2><table><thead><tr><th>From</th><th>Field</th><th>To</th><th>Type</th></tr></thead><tbody>`;
      relationships.forEach(r=>{erdSummary+=`<tr><td class="mono">${r.from}</td><td class="mono">${r.field}</td><td class="mono">${r.to}</td><td><span class="rel-badge ${r.type==='master-detail'?'md':'lk'}">${r.type}</span></td></tr>`;});
      erdSummary+=`</tbody></table><h3>Mermaid ERD Code</h3><pre class="mermaid-block">${generateMermaid()}</pre></div>`;
    }

    const html=`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Technical Spec — ${orgName}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=DM+Sans:opsz@9..40;wght@400;500;600;700&display=swap');
@page{margin:20mm 18mm;size:A4}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',system-ui,sans-serif;font-size:11px;color:#1E293B;line-height:1.5;background:#fff}.mono{font-family:'JetBrains Mono',monospace;font-size:10px}
.cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:60px 40px;background:linear-gradient(160deg,#0B1121,#162032);color:#E2E8F0;page-break-after:always}
.cover h1{font-size:32px;font-weight:700;margin-bottom:12px}.cover .subtitle{font-size:16px;color:#94A3B8;margin-bottom:40px}.cover .meta-line{font-family:'JetBrains Mono',monospace;font-size:12px;color:#64748B;margin:4px 0}
.toc{page-break-after:always;padding:40px}.toc h2{font-size:20px;margin-bottom:20px;color:#0F172A;border-bottom:2px solid #38BDF8;padding-bottom:8px}
.toc-item{display:flex;align-items:baseline;gap:8px;padding:8px 0;border-bottom:1px solid #F1F5F9}.toc-num{font-family:'JetBrains Mono',monospace;font-size:11px;color:#38BDF8;font-weight:600;min-width:28px}.toc-label{flex:1;font-size:13px;color:#334155}.toc-api{font-family:'JetBrains Mono',monospace;font-size:10px;color:#94A3B8}
.spec-object{padding:30px 40px}.page-break{page-break-before:always}h2{font-size:18px;color:#0F172A;display:flex;align-items:center;gap:10px;margin-bottom:16px;border-bottom:2px solid #E2E8F0;padding-bottom:10px}h3{font-size:13px;color:#334155;margin:20px 0 10px;text-transform:uppercase;letter-spacing:1px}
.obj-num{font-family:'JetBrains Mono',monospace;background:#38BDF8;color:#0B1121;width:28px;height:28px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}
.obj-type-badge{font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;margin-left:auto}.obj-type-badge.standard{background:#EEF2FF;color:#6366F1}.obj-type-badge.custom{background:#ECFDF5;color:#059669}
.spec-meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}.meta-item{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:8px 10px}.meta-label{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin-bottom:3px}.meta-value{font-size:13px;font-weight:600;color:#1E293B}
table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:12px}thead th{background:#F1F5F9;color:#475569;font-weight:600;text-transform:uppercase;letter-spacing:.5px;font-size:9px;padding:8px 10px;text-align:left;border-bottom:2px solid #E2E8F0}tbody td{padding:6px 10px;border-bottom:1px solid #F1F5F9;color:#334155}tbody tr:hover{background:#FAFBFF}tbody tr.row-ref{background:#F0F9FF}.center{text-align:center}
.rel-badge{font-size:9px;font-weight:600;padding:2px 6px;border-radius:3px}.rel-badge.lk{background:#DBEAFE;color:#2563EB}.rel-badge.md{background:#EDE9FE;color:#7C3AED}
.mermaid-block{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;font-family:'JetBrains Mono',monospace;font-size:10px;color:#475569;white-space:pre-wrap;line-height:1.5}
.spec-footer{padding:20px 40px;text-align:center;font-size:10px;color:#94A3B8;border-top:1px solid #E2E8F0;margin-top:40px}
.no-print{position:fixed;top:16px;right:16px;z-index:100}
@media print{.no-print{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:12px 24px;background:linear-gradient(135deg,#38BDF8,#818CF8);color:#0B1121;border:none;border-radius:8px;font-weight:700;font-size:14px;cursor:pointer;font-family:'DM Sans',sans-serif">⬇ Save as PDF</button></div>
<div class="cover"><h1>Technical Data Model<br>Specification</h1><div class="subtitle">Salesforce Org Schema Documentation</div>
<div class="meta-line">Org: ${orgName}</div><div class="meta-line">Objects: ${selected.length} · Fields: ${totalFields} · Relationships: ${relationships.length}</div><div class="meta-line">Generated: ${dateStr}</div>
<div class="meta-line" style="margin-top:20px;color:#475569">Generated by Schelio</div></div>
<div class="toc"><h2>Table of Contents</h2>${selected.map((api,i)=>{const m=objectMeta[api];return '<div class="toc-item"><span class="toc-num">'+(i+1)+'</span><span class="toc-label">'+(m?.label||api)+'</span><span class="toc-api">'+api+'</span></div>';}).join('')}${relationships.length?'<div class="toc-item"><span class="toc-num">☆</span><span class="toc-label">Relationship Map</span><span class="toc-api">Cross-object relationships & Mermaid ERD</span></div>':''}</div>
${objectSections}${erdSummary}
<div class="spec-footer">Generated by Schelio · ${dateStr} · ${instanceUrl}</div></body></html>`;

    const w=window.open('','_blank');w.document.write(html);w.document.close();
    showToast('PDF spec opened — use Save as PDF','📄');
  }

  // ═══ RELATIONSHIPS ═══
  function buildRelationships() {
    relationships=[];const sel=[...selectedObjects];
    sel.forEach(api=>{const m=objectMeta[api];if(!m)return;m.fields.forEach(f=>{if(f.type==='reference'&&f.referenceTo)f.referenceTo.forEach(ref=>{if(sel.includes(ref))relationships.push({from:api,to:ref,field:f.name,label:f.relationshipName||f.name,type:f.cascadeDelete?'master-detail':'lookup'});});});});
  }

  // ═══ ERD RENDERING ═══
  function renderERD(){renderRelationships2();renderNodes();applyTransform();}

  function renderNodes(){
    erdNodes.innerHTML='';
    selectedObjects.forEach(api=>{
      const meta=objectMeta[api];if(!meta)return;const pos=nodePositions[api];if(!pos)return;
      const isCustom=meta.custom,color=isCustom?COLORS.custom:COLORS.standard;
      const fields=meta.fields.filter(f=>!f.deprecatedAndHidden).sort((a,b)=>{if(a.name==='Id')return-1;if(b.name==='Id')return 1;if(a.type==='reference'&&b.type!=='reference')return-1;if(a.type!=='reference'&&b.type==='reference')return 1;return a.label.localeCompare(b.label);}).slice(0,MAX_FIELDS_SHOWN);
      const cardH=CARD_HEADER_H+fields.length*FIELD_ROW_H+CARD_PADDING*2+(meta.fields.length>MAX_FIELDS_SHOWN?20:0);
      const g=svgEl('g',{class:'erd-node','data-api':api,transform:'translate('+pos.x+','+pos.y+')'});
      g.appendChild(svgEl('rect',{class:'card-bg',width:CARD_WIDTH,height:cardH,filter:'url(#cardShadow)'}));
      g.appendChild(svgEl('rect',{class:'card-header-bg',width:CARD_WIDTH,height:CARD_HEADER_H,fill:color.header,'clip-path':'inset(0 0 0 0 round 8px 8px 0 0)'}));
      g.appendChild(svgEl('rect',{x:0,y:CARD_HEADER_H-2,width:CARD_WIDTH,height:2,fill:color.accent,opacity:0.6}));
      // RT count badge on card
      const rtCount = (meta.recordTypeInfos||[]).filter(r=>!r.master&&r.active).length;
      if (rtCount > 0) {
        g.appendChild(svgEl('rect',{x:CARD_WIDTH-40,y:6,width:32,height:16,rx:4,fill:'rgba(255,255,255,0.15)'}));
        const rtLabel=svgEl('text',{x:CARD_WIDTH-24,y:18,'text-anchor':'middle','font-size':'9','font-family':"'JetBrains Mono',monospace",fill:'rgba(255,255,255,0.7)'});
        rtLabel.textContent=rtCount+' RT';g.appendChild(rtLabel);
      }
      let t=svgEl('text',{class:'card-title',x:14,y:22});t.textContent=truncate(meta.label,rtCount>0?22:26);g.appendChild(t);
      t=svgEl('text',{class:'card-api-name',x:14,y:38});t.textContent=meta.name;g.appendChild(t);
      fields.forEach((field,i)=>{
        const fy=CARD_HEADER_H+CARD_PADDING+i*FIELD_ROW_H;
        g.appendChild(svgEl('rect',{x:2,y:fy,width:CARD_WIDTH-4,height:FIELD_ROW_H,fill:'transparent',rx:3}));
        let el=svgEl('text',{class:'field-icon',x:12,y:fy+15});el.textContent=FIELD_ICONS[field.type]||FIELD_ICONS.default;g.appendChild(el);
        el=svgEl('text',{class:'field-name',x:28,y:fy+15});el.textContent=truncate(field.label,20);g.appendChild(el);
        el=svgEl('text',{class:'field-type',x:CARD_WIDTH-12,y:fy+15,'text-anchor':'end'});el.textContent=field.type;g.appendChild(el);
      });
      if(meta.fields.length>MAX_FIELDS_SHOWN){const my=CARD_HEADER_H+CARD_PADDING+fields.length*FIELD_ROW_H+6;const el=svgEl('text',{x:CARD_WIDTH/2,y:my+8,'text-anchor':'middle','font-size':'10',fill:'#64748B','font-family':"'JetBrains Mono',monospace"});el.textContent='+ '+(meta.fields.length-MAX_FIELDS_SHOWN)+' more';g.appendChild(el);}
      // Tooltip
      const tip=svgEl('title',{});tip.textContent=meta.label+' — Double-click for details, right-click for menu';g.appendChild(tip);
      g.dataset.height=cardH;g.style.cursor='pointer';g.addEventListener('mousedown',onNodeMouseDown);g.addEventListener('dblclick',()=>showDetail(api));erdNodes.appendChild(g);
    });
  }

  function renderRelationships2(){
    erdRels.innerHTML='';if(!showRelations)return;
    relationships.forEach(rel=>{
      const fp=nodePositions[rel.from],tp=nodePositions[rel.to];if(!fp||!tp)return;
      const fn=erdNodes.querySelector('[data-api="'+rel.from+'"]'),tn=erdNodes.querySelector('[data-api="'+rel.to+'"]');
      const fH=fn?parseInt(fn.dataset.height)||200:200,tH=tn?parseInt(tn.dataset.height)||200:200;
      const fcx=fp.x+CARD_WIDTH/2,fcy=fp.y+fH/2,tcx=tp.x+CARD_WIDTH/2,tcy=tp.y+tH/2;
      let x1,y1,x2,y2;const dx=tcx-fcx,dy=tcy-fcy;
      if(Math.abs(dx)>Math.abs(dy)){if(dx>0){x1=fp.x+CARD_WIDTH;y1=fcy;x2=tp.x;y2=tcy;}else{x1=fp.x;y1=fcy;x2=tp.x+CARD_WIDTH;y2=tcy;}}
      else{if(dy>0){x1=fcx;y1=fp.y+fH;x2=tcx;y2=tp.y;}else{x1=fcx;y1=fp.y;x2=tcx;y2=tp.y+tH;}}
      const mx=(x1+x2)/2,my=(y1+y2)/2;let cx1,cy1,cx2,cy2;
      if(Math.abs(dx)>Math.abs(dy)){cx1=mx;cy1=y1;cx2=mx;cy2=y2;}else{cx1=x1;cy1=my;cx2=x2;cy2=my;}
      erdRels.appendChild(svgEl('path',{class:'rel-line '+rel.type,d:'M '+x1+' '+y1+' C '+cx1+' '+cy1+', '+cx2+' '+cy2+', '+x2+' '+y2,'marker-end':rel.type==='master-detail'?'url(#arrowMD)':'url(#arrowLookup)'}));
      const l=svgEl('text',{class:'rel-label',x:mx,y:my-6,'text-anchor':'middle'});l.textContent=rel.field;erdRels.appendChild(l);
    });
  }

  // ═══ SVG HELPERS ═══
  function svgEl(tag,attrs={}){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));return el;}
  function truncate(s,m){return s.length>m?s.slice(0,m-1)+'…':s;}

  // ═══ PAN & ZOOM ═══
  function applyTransform(){const t='translate('+panX+','+panY+') scale('+zoom+')';erdNodes.setAttribute('transform',t);erdRels.setAttribute('transform',t);zoomLabel.textContent=Math.round(zoom*100)+'%';}
  function setZoom(nz,cx,cy){const oz=zoom;zoom=Math.max(0.1,Math.min(3,nz));if(cx!==undefined){panX=cx-(cx-panX)*(zoom/oz);panY=cy-(cy-panY)*(zoom/oz);}applyTransform();}
  function onNodeMouseDown(e){if(e.button!==0)return;e.stopPropagation();const n=e.currentTarget,a=n.dataset.api,p=nodePositions[a];if(!p)return;pushUndo();const pt=svgPoint(e);dragNode=a;dragOffset.x=pt.x-p.x;dragOffset.y=pt.y-p.y;erdCanvas.style.cursor='grabbing';}
  function onCanvasMouseMove(e){if(dragNode){const pt=svgPoint(e);nodePositions[dragNode]={x:pt.x-dragOffset.x,y:pt.y-dragOffset.y};renderERD();}else if(isPanning){panX+=e.clientX-panStart.x;panY+=e.clientY-panStart.y;panStart.x=e.clientX;panStart.y=e.clientY;applyTransform();}}
  function onCanvasMouseUp(){dragNode=null;isPanning=false;erdCanvas.style.cursor='grab';}
  function svgPoint(e){const r=erdCanvas.getBoundingClientRect();return{x:(e.clientX-r.left-panX)/zoom,y:(e.clientY-r.top-panY)/zoom};}
  function autoLayout(){const items=[...selectedObjects];if(!items.length)return;pushUndo();const cols=Math.ceil(Math.sqrt(items.length));const rc={};items.forEach(n=>{rc[n]=0;});relationships.forEach(r=>{rc[r.from]=(rc[r.from]||0)+1;rc[r.to]=(rc[r.to]||0)+1;});items.sort((a,b)=>(rc[b]||0)-(rc[a]||0));items.forEach((a,i)=>{nodePositions[a]={x:60+(i%cols)*(CARD_WIDTH+100),y:60+Math.floor(i/cols)*380};});fitAll();renderERD();}
  function fitAll(){if(!selectedObjects.size)return;let mx=Infinity,my=Infinity,Mx=-Infinity,My=-Infinity;selectedObjects.forEach(a=>{const p=nodePositions[a];if(!p)return;mx=Math.min(mx,p.x);my=Math.min(my,p.y);Mx=Math.max(Mx,p.x+CARD_WIDTH);My=Math.max(My,p.y+300);});const r=erdCanvas.getBoundingClientRect();const cw=Mx-mx+100,ch=My-my+100;zoom=Math.max(0.2,Math.min(r.width/cw,r.height/ch,1.5));panX=(r.width-cw*zoom)/2-mx*zoom+50;panY=(r.height-ch*zoom)/2-my*zoom+50;applyTransform();}

  function exportPng(){const b=new Blob([erdCanvas.outerHTML],{type:'image/svg+xml'});const u=URL.createObjectURL(b);const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=erdCanvas.clientWidth*2;c.height=erdCanvas.clientHeight*2;const ctx=c.getContext('2d');ctx.fillStyle='#060D1B';ctx.fillRect(0,0,c.width,c.height);ctx.scale(2,2);ctx.drawImage(img,0,0);URL.revokeObjectURL(u);c.toBlob(bl=>{const a=document.createElement('a');a.href=URL.createObjectURL(bl);a.download='schelio-erd.png';a.click();});};img.src=u;}
  function exportSvg(){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([erdCanvas.outerHTML],{type:'image/svg+xml'}));a.href=url;a.download='schelio-erd.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  // ═══ CSV EXPORT ═══
  function escCsv(s){return '"'+String(s).replace(/"/g,'""')+'"';}
  function exportCsv() {
    const selected=[...selectedObjects];
    if(!selected.length){showToast('Select objects first','⚠️');return;}
    let csv='Object,Field Label,Field API Name,Type,Length,Required,Custom,Reference To\n';
    selected.forEach(api=>{
      const meta=objectMeta[api];if(!meta)return;
      meta.fields.filter(f=>!f.deprecatedAndHidden).sort((a,b)=>a.label.localeCompare(b.label)).forEach(f=>{
        const ref=(f.referenceTo||[]).join('; ');
        csv+=escCsv(meta.label)+','+escCsv(f.label)+','+escCsv(f.name)+','+escCsv(f.type)+','+(f.length||f.precision||'')+','+(f.nillable?'':'Yes')+','+(f.custom?'Yes':'')+','+(ref?escCsv(ref):'')+'\n';
      });
    });
    const a=document.createElement('a');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.href=url;a.download='schelio-fields.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    showToast('CSV exported!','📊');
  }

  // ═══ PLANTUML EXPORT ═══
  function generatePlantUml() {
    let uml='@startuml\n!theme plain\nskinparam linetype ortho\n\n';
    selectedObjects.forEach(api=>{
      const meta=objectMeta[api];if(!meta)return;
      const safe=api.replace(/[^a-zA-Z0-9_]/g,'_');
      uml+='entity "'+meta.label.replace(/"/g,'\\"')+'" as '+safe+' {\n';
      const fields=meta.fields.filter(f=>!f.deprecatedAndHidden).sort((a,b)=>{if(a.name==='Id')return-1;if(b.name==='Id')return 1;return a.label.localeCompare(b.label);});
      const pkFields=fields.filter(f=>f.name==='Id');
      const fkFields=fields.filter(f=>f.type==='reference');
      const otherFields=fields.filter(f=>f.name!=='Id'&&f.type!=='reference');
      pkFields.forEach(f=>{uml+='  * '+f.name+' : '+f.type+' <<PK>>\n';});
      uml+='  --\n';
      fkFields.forEach(f=>{uml+='  * '+f.name+' : '+f.type+' <<FK>>\n';});
      if(fkFields.length&&otherFields.length) uml+='  --\n';
      otherFields.slice(0,20).forEach(f=>{uml+='  '+f.name+' : '+f.type+(f.nillable?'':' {required}')+'\n';});
      if(otherFields.length>20) uml+='  .. +'+(otherFields.length-20)+' more ..\n';
      uml+='}\n\n';
    });
    relationships.forEach(r=>{
      const fr=r.from.replace(/[^a-zA-Z0-9_]/g,'_');
      const to=r.to.replace(/[^a-zA-Z0-9_]/g,'_');
      uml+=to+(r.type==='master-detail'?' ||--o{ ':' }o--|| ')+fr+' : "'+r.field+'"\n';
    });
    uml+='\n@enduml';
    return uml;
  }
  function showPlantUmlModal(){$('#plantumlCode').textContent=generatePlantUml();$('#plantumlModal').classList.add('visible');}
  function copyPlantUml(){navigator.clipboard.writeText($('#plantumlCode').textContent).then(()=>showToast('Copied!','📋')).catch(()=>showToast('Copy failed','⚠️'));}

  // ═══ VALIDATION RULES (Tooling API) ═══
  async function fetchValidationRules(objectApi) {
    if(validationRuleCache[objectApi]) return validationRuleCache[objectApi];
    try {
      const data=await sfToolingQuery(
        "SELECT Id, ValidationName, Active, Description, ErrorDisplayField, ErrorMessage "+
        "FROM ValidationRule WHERE EntityDefinition.QualifiedApiName = '"+escSoql(objectApi)+"' ORDER BY ValidationName"
      );
      const records=data.records||[];
      // Fetch formula (Metadata) for each VR via individual Tooling API call
      for(const vr of records){
        try {
          const detail=await sfApi('/services/data/'+SF_API_VERSION+'/tooling/sobjects/ValidationRule/'+vr.Id);
          vr.Formula=detail.Metadata?.errorConditionFormula||detail.FullName||null;
        } catch(e){ vr.Formula=null; }
      }
      validationRuleCache[objectApi]=records;
    } catch(e) {
      console.warn('ValidationRule query failed',e);
      validationRuleCache[objectApi]=[];
    }
    return validationRuleCache[objectApi];
  }

  function renderValidationsTab(meta, rules) {
    if(!rules.length){
      $('#dtabValidations').innerHTML='<div class="empty-tab-msg">No validation rules found for this object.</div>';
      return;
    }
    const active=rules.filter(r=>r.Active), inactive=rules.filter(r=>!r.Active);
    let h='<div class="detail-section"><div class="detail-section-title">Validation Rules ('+rules.length+')</div>';
    h+='<div class="health-stat-row"><span class="health-stat good">'+active.length+' active</span><span class="health-stat neutral">'+inactive.length+' inactive</span></div>';
    rules.forEach(r=>{
      h+='<div class="vr-card'+(r.Active?'':' vr-inactive')+'">';
      h+='<div class="vr-header"><span class="vr-name">'+escHtml(r.ValidationName)+' '+copyBtn(r.ValidationName)+'</span>';
      h+='<span class="rt-badge '+(r.Active?'active':'inactive')+'">'+(r.Active?'Active':'Inactive')+'</span></div>';
      if(r.Description) h+='<div class="vr-desc">'+escHtml(r.Description)+'</div>';
      if(r.Formula) h+='<div class="vr-formula"><span class="vr-formula-label">Formula</span><pre class="vr-formula-code">'+escHtml(r.Formula)+'</pre></div>';
      if(r.ErrorMessage) h+='<div class="vr-error">Error: '+escHtml(r.ErrorMessage)+'</div>';
      if(r.ErrorDisplayField) h+='<div class="vr-field">Field: '+escHtml(r.ErrorDisplayField)+'</div>';
      h+='</div>';
    });
    h+='</div>';
    $('#dtabValidations').innerHTML=h;
    // copy-btn handled by document-level delegation
  }

  // ═══ FLOWS & TRIGGERS (Tooling API) ═══
  async function fetchAutomation(objectApi) {
    if(automationCache[objectApi]) return automationCache[objectApi];
    const result={flows:[],triggers:[]};
    try {
      const flowData=await sfToolingQuery(
        "SELECT Id, Definition.DeveloperName, MasterLabel, ProcessType, TriggerType, Status, "+
        "TriggerObjectOrEvent.QualifiedApiName, RecordTriggerType, Description "+
        "FROM Flow WHERE TriggerObjectOrEvent.QualifiedApiName = '"+escSoql(objectApi)+"' "+
        "AND Status = 'Active' ORDER BY MasterLabel"
      );
      result.flows=flowData.records||[];
    } catch(e) {
      // Fallback: try FlowDefinition (older orgs)
      try {
        const flowData2=await sfToolingQuery(
          "SELECT Id, DeveloperName, MasterLabel, ProcessType, TriggerType "+
          "FROM FlowDefinition WHERE TriggerObjectOrEventLabel = '"+escSoql(objectApi)+"'"
        );
        result.flows=flowData2.records||[];
      } catch(e2) { console.warn('Flow query failed',e,e2); }
    }
    try {
      const trigData=await sfToolingQuery(
        "SELECT Id, Name, TableEnumOrId, UsageBeforeInsert, UsageAfterInsert, UsageBeforeUpdate, "+
        "UsageAfterUpdate, UsageBeforeDelete, UsageAfterDelete, UsageAfterUndelete, Status "+
        "FROM ApexTrigger WHERE TableEnumOrId = '"+escSoql(objectApi)+"'"
      );
      result.triggers=trigData.records||[];
    } catch(e) { console.warn('ApexTrigger query failed',e); }
    automationCache[objectApi]=result;
    return result;
  }

  function renderAutomationTab(meta, data) {
    let h='';
    // Flows
    h+='<div class="detail-section"><div class="detail-section-title">Flows ('+data.flows.length+')</div>';
    if(data.flows.length){
      data.flows.forEach(f=>{
        const devName=f.Definition?.DeveloperName||f.DeveloperName||'';
        const triggerType=f.RecordTriggerType||f.TriggerType||'—';
        h+='<div class="layout-card"><div class="layout-card-header">';
        h+='<span class="layout-card-icon">⚡</span>';
        h+='<div class="layout-card-info"><div class="layout-card-name">'+escHtml(f.MasterLabel||devName)+' '+copyBtn(devName)+'</div>';
        h+='<div class="layout-card-type">'+(f.ProcessType||'Flow')+' · '+triggerType+(f.Status?' · '+f.Status:'')+'</div></div>';
        if(f.Status) h+='<span class="rt-badge '+(f.Status==='Active'?'active':'inactive')+'">'+escHtml(f.Status)+'</span>';
        h+='</div>';
        if(f.Description) h+='<div class="layout-card-body"><div class="layout-assignment"><span>'+escHtml(f.Description)+'</span></div></div>';
        h+='</div>';
      });
    } else { h+='<div class="empty-tab-msg">No record-triggered flows found.</div>'; }
    h+='</div>';
    // Triggers
    h+='<div class="detail-section"><div class="detail-section-title">Apex Triggers ('+data.triggers.length+')</div>';
    if(data.triggers.length){
      data.triggers.forEach(t=>{
        const events=[];
        if(t.UsageBeforeInsert) events.push('Before Insert');
        if(t.UsageAfterInsert) events.push('After Insert');
        if(t.UsageBeforeUpdate) events.push('Before Update');
        if(t.UsageAfterUpdate) events.push('After Update');
        if(t.UsageBeforeDelete) events.push('Before Delete');
        if(t.UsageAfterDelete) events.push('After Delete');
        if(t.UsageAfterUndelete) events.push('After Undelete');
        h+='<div class="layout-card"><div class="layout-card-header">';
        h+='<span class="layout-card-icon">🔧</span>';
        h+='<div class="layout-card-info"><div class="layout-card-name">'+escHtml(t.Name)+' '+copyBtn(t.Name)+'</div>';
        h+='<div class="layout-card-type">'+events.join(' · ')+'</div></div>';
        h+='<span class="rt-badge '+(t.Status==='Active'?'active':'inactive')+'">'+escHtml(t.Status||'Active')+'</span>';
        h+='</div></div>';
      });
    } else { h+='<div class="empty-tab-msg">No Apex triggers found.</div>'; }
    h+='</div>';
    $('#dtabAutomation').innerHTML=h;
    // copy-btn handled by document-level delegation
  }

  // ═══ SCHEMA HEALTH SCORE ═══
  function renderHealthTab(meta) {
    const fields=meta.fields.filter(f=>!f.deprecatedAndHidden);
    const customFields=fields.filter(f=>f.custom);
    const refs=fields.filter(f=>f.type==='reference');
    const picklists=fields.filter(f=>f.type==='picklist'||f.type==='multipicklist');
    const rts=(meta.recordTypeInfos||[]).filter(r=>!r.master&&r.active);

    const MAX_FIELDS=800, MAX_CUSTOM=500, MAX_RELS=40;
    const fieldPct=Math.round(fields.length/MAX_FIELDS*100);
    const customPct=Math.round(customFields.length/MAX_CUSTOM*100);
    const relPct=Math.round(refs.length/MAX_RELS*100);

    // Score: 100 - penalties
    let score=100;
    if(fieldPct>80) score-=20; else if(fieldPct>60) score-=10;
    if(customPct>80) score-=15; else if(customPct>60) score-=8;
    if(relPct>80) score-=15; else if(relPct>60) score-=8;
    if(rts.length>10) score-=10; else if(rts.length>5) score-=5;
    const requiredNoDefault=fields.filter(f=>!f.nillable&&!f.defaultValue&&f.name!=='Id');
    if(requiredNoDefault.length>20) score-=10;
    score=Math.max(0,Math.min(100,score));

    const scoreClass=score>=80?'good':score>=50?'warn':'bad';
    let h='<div class="detail-section"><div class="detail-section-title">Schema Health</div>';
    h+='<div class="health-score '+scoreClass+'"><span class="health-score-num">'+score+'</span><span class="health-score-label">/100</span></div>';

    // Limits bars
    h+='<div class="health-limits">';
    h+=healthBar('Total Fields',fields.length,MAX_FIELDS);
    h+=healthBar('Custom Fields',customFields.length,MAX_CUSTOM);
    h+=healthBar('Relationships',refs.length,MAX_RELS);
    h+='</div>';

    // Warnings
    const warnings=[];
    if(fieldPct>80) warnings.push('Field count is above 80% of limit ('+fields.length+'/'+MAX_FIELDS+')');
    if(customPct>80) warnings.push('Custom field count is above 80% of limit ('+customFields.length+'/'+MAX_CUSTOM+')');
    if(relPct>80) warnings.push('Relationship count is above 80% of limit ('+refs.length+'/'+MAX_RELS+')');
    if(rts.length>10) warnings.push('High number of Record Types ('+rts.length+') — consider consolidating');
    if(requiredNoDefault.length>20) warnings.push(requiredNoDefault.length+' required fields without defaults — may impact data loading');
    const depFields=fields.filter(f=>f.deprecatedAndHidden);
    if(depFields.length) warnings.push(depFields.length+' deprecated/hidden fields found');

    if(warnings.length){
      h+='<div class="health-warnings"><div class="detail-section-title">Warnings</div>';
      warnings.forEach(w=>{h+='<div class="health-warning">⚠️ '+w+'</div>';});
      h+='</div>';
    }

    // Stats summary
    h+='<div class="health-stats">';
    h+='<div class="health-stat-row"><span class="health-stat neutral">📋 '+picklists.length+' picklists</span>';
    h+='<span class="health-stat neutral">🔗 '+refs.length+' relationships</span>';
    h+='<span class="health-stat neutral">📝 '+customFields.length+' custom</span></div>';
    h+='</div></div>';

    $('#dtabHealth').innerHTML=h;
  }
  function healthBar(label,val,max){
    const pct=Math.round(val/max*100);
    const cls=pct>80?'bad':pct>60?'warn':'good';
    return '<div class="health-bar-row"><span class="health-bar-label">'+label+'</span><div class="health-bar"><div class="health-bar-fill '+cls+'" style="width:'+Math.min(pct,100)+'%"></div></div><span class="health-bar-val">'+val+'/'+max+'</span></div>';
  }

  // ═══ PERMISSION SETS ═══
  async function fetchPermSetPermissions(objectApi) {
    if(permSetCache[objectApi]) return permSetCache[objectApi];
    const result={objectPerms:[],fieldPerms:[],permSets:{}};
    try {
      const objData=await sfApi(
        '/services/data/'+SF_API_VERSION+'/query/?q='+encodeURIComponent(
          "SELECT Id, ParentId, Parent.Label, Parent.IsOwnedByProfile, SobjectType, "+
          "PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete, "+
          "PermissionsViewAllRecords, PermissionsModifyAllRecords "+
          "FROM ObjectPermissions WHERE SobjectType = '"+escSoql(objectApi)+"' "+
          "AND Parent.IsOwnedByProfile = false ORDER BY Parent.Label"
        )
      );
      result.objectPerms=objData.records||[];
    } catch(e){ console.warn('PermSet ObjectPermissions query failed',e); }
    const permSets={};
    result.objectPerms.forEach(op=>{
      const psName=op.Parent?.Label||'Unknown';
      if(!permSets[psName]) permSets[psName]={crud:null};
      permSets[psName].crud={
        read:op.PermissionsRead,create:op.PermissionsCreate,edit:op.PermissionsEdit,
        delete:op.PermissionsDelete,viewAll:op.PermissionsViewAllRecords,modifyAll:op.PermissionsModifyAllRecords
      };
    });
    result.permSets=permSets;
    permSetCache[objectApi]=result;
    return result;
  }

  function renderPermSetsInProfilesTab(objectApi, container) {
    fetchPermSetPermissions(objectApi).then(data=>{
      if(activeDetailObject!==objectApi) return;
      const ps=data.permSets;const names=Object.keys(ps).sort();
      if(!names.length) return;
      let h='<div class="detail-section" style="margin-top:16px"><div class="detail-section-title">Permission Sets ('+names.length+')</div>';
      names.forEach(name=>{
        const p=ps[name];
        h+='<div class="profile-accordion" data-profile="ps-'+escHtml(name)+'">';
        h+='<div class="profile-accordion-header">';
        h+='<span class="profile-accordion-arrow">▶</span>';
        h+='<span class="profile-accordion-name">🛡️ '+escHtml(name)+'</span>';
        if(p.crud){const c=[p.crud.read,p.crud.create,p.crud.edit,p.crud.delete].filter(Boolean).length;h+='<span class="pl-accordion-count">'+c+'/4 CRUD</span>';}
        h+='</div><div class="profile-accordion-body">';
        if(p.crud){
          h+='<div class="profile-sub-title">Object Permissions (CRUD)</div><div class="crud-row">';
          [['Read',p.crud.read],['Create',p.crud.create],['Edit',p.crud.edit],['Delete',p.crud.delete],['View All',p.crud.viewAll],['Modify All',p.crud.modifyAll]].forEach(([l,v])=>{
            h+='<span class="crud-badge '+(v?'on':'off')+'">'+(v?'✓':'✕')+' '+l+'</span>';
          });
          h+='</div>';
        }
        h+='</div></div>';
      });
      h+='</div>';
      container.insertAdjacentHTML('beforeend',h);
      container.querySelectorAll('.profile-accordion-header').forEach(hdr=>{
        if(!hdr._bound){hdr._bound=true;hdr.addEventListener('click',()=>hdr.parentElement.classList.toggle('open'));}
      });
    }).catch(e=>console.warn('PermSet render failed',e));
  }

  // ═══ UNDO / REDO ═══
  function pushUndo(){undoStack.push(JSON.stringify(nodePositions));redoStack=[];if(undoStack.length>50)undoStack.shift();}
  function undo(){if(!undoStack.length)return;redoStack.push(JSON.stringify(nodePositions));nodePositions=JSON.parse(undoStack.pop());renderERD();}
  function redo(){if(!redoStack.length)return;undoStack.push(JSON.stringify(nodePositions));nodePositions=JSON.parse(redoStack.pop());renderERD();}

  // ═══ CONTEXT MENU ═══
  function showContextMenu(x,y,api){
    contextTarget=api;
    const menu=$('#contextMenu');
    menu.style.left=x+'px';menu.style.top=y+'px';
    menu.classList.add('visible');
  }
  function hideContextMenu(){$('#contextMenu').classList.remove('visible');contextTarget=null;}
  function handleContextAction(action){
    if(!contextTarget)return;
    const api=contextTarget;
    hideContextMenu();
    if(action==='details') showDetail(api);
    else if(action==='remove') toggleObject(api);
    else if(action==='copy-api') copyToClipboard(api);
    else if(action==='export-single'){
      const meta=objectMeta[api];if(!meta)return;
      let m='erDiagram\n    '+api.replace(/__c$/,'_c')+' {\n';
      meta.fields.filter(f=>!f.deprecatedAndHidden).forEach(f=>{m+='        string '+f.name+'\n';});
      m+='    }\n';
      navigator.clipboard.writeText(m).then(()=>showToast('Copied Mermaid for '+meta.label,'📋'));
    }
  }

  // ═══ THEME TOGGLE ═══
  function toggleTheme(){
    isDarkTheme=!isDarkTheme;
    document.body.classList.toggle('light-theme',!isDarkTheme);
    try{localStorage.setItem('schelio_theme',isDarkTheme?'dark':'light');}catch(e){}
    showToast(isDarkTheme?'Dark theme':'Light theme','🎨');
  }
  function loadTheme(){
    try{const t=localStorage.getItem('schelio_theme');if(t==='light'){isDarkTheme=false;document.body.classList.add('light-theme');}}catch(e){}
  }

  // ═══ EVENTS ═══
  function setupEventListeners(){
    searchInput.addEventListener('input',()=>renderObjectList());
    fieldSearchInput.addEventListener('input',()=>searchFields(fieldSearchInput.value));

    // Sidebar tabs
    document.querySelectorAll('.sidebar-tab').forEach(tab=>{tab.addEventListener('click',()=>{document.querySelectorAll('.sidebar-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));tab.classList.add('active');$(tab.dataset.tab==='objects'?'#tabObjects':'#tabFields').classList.add('active');});});

    // Detail panel tabs
    document.querySelectorAll('.detail-tab').forEach(tab=>{tab.addEventListener('click',()=>{document.querySelectorAll('.detail-tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.detail-tab-panel').forEach(p=>p.classList.remove('active'));tab.classList.add('active');$('#dtab'+tab.dataset.dtab.charAt(0).toUpperCase()+tab.dataset.dtab.slice(1)).classList.add('active');});});

    document.querySelectorAll('.filter-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');activeFilter=btn.dataset.filter;renderObjectList();});});
    $('#sidebarToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('collapsed'));
    erdCanvas.addEventListener('mousedown',e=>{if(e.button===0&&!dragNode){isPanning=true;panStart.x=e.clientX;panStart.y=e.clientY;erdCanvas.style.cursor='grabbing';}});
    erdCanvas.addEventListener('mousemove',onCanvasMouseMove);erdCanvas.addEventListener('mouseup',onCanvasMouseUp);erdCanvas.addEventListener('mouseleave',onCanvasMouseUp);
    erdCanvas.addEventListener('wheel',e=>{e.preventDefault();const r=erdCanvas.getBoundingClientRect();setZoom(zoom*(e.deltaY>0?0.9:1.1),e.clientX-r.left,e.clientY-r.top);},{passive:false});
    $('#btnZoomIn').addEventListener('click',()=>setZoom(zoom*1.2));$('#btnZoomOut').addEventListener('click',()=>setZoom(zoom/1.2));
    $('#btnFitAll').addEventListener('click',fitAll);$('#btnAutoLayout').addEventListener('click',autoLayout);
    $('#btnToggleRelations').addEventListener('click',()=>{showRelations=!showRelations;$('#btnToggleRelations').classList.toggle('active',showRelations);renderERD();});
    $('#btnExportPng').addEventListener('click',exportPng);$('#btnExportSvg').addEventListener('click',exportSvg);
    $('#btnExportMermaid').addEventListener('click',showMermaidModal);$('#btnExportPlantUml').addEventListener('click',showPlantUmlModal);$('#btnExportCsv').addEventListener('click',exportCsv);$('#btnExportPdf').addEventListener('click',exportPdfSpec);
    $('#btnSaveLayout').addEventListener('click',saveLayout);$('#btnLoadLayout').addEventListener('click',loadLayout);
    $('#mermaidModalClose').addEventListener('click',()=>$('#mermaidModal').classList.remove('visible'));
    $('#mermaidModalCancel').addEventListener('click',()=>$('#mermaidModal').classList.remove('visible'));
    $('#mermaidCopy').addEventListener('click',copyMermaid);
    $('#plantumlModalClose').addEventListener('click',()=>$('#plantumlModal').classList.remove('visible'));
    $('#plantumlModalCancel').addEventListener('click',()=>$('#plantumlModal').classList.remove('visible'));
    $('#plantumlCopy').addEventListener('click',copyPlantUml);
    $('#detailClose').addEventListener('click',()=>detailPanel.classList.remove('visible'));
    $('#btnThemeToggle').addEventListener('click',toggleTheme);
    $('#btnToggleRelations').classList.add('active');
    // Context menu
    erdCanvas.addEventListener('contextmenu',e=>{e.preventDefault();const n=e.target.closest('.erd-node');if(n){showContextMenu(e.clientX,e.clientY,n.dataset.api);}else{hideContextMenu();}});
    document.addEventListener('click',()=>hideContextMenu());
    document.querySelectorAll('.ctx-item').forEach(btn=>{btn.addEventListener('click',()=>handleContextAction(btn.dataset.action));});
    // Copy buttons delegation
    document.addEventListener('click',e=>{const cb=e.target.closest('.copy-btn');if(cb){e.stopPropagation();copyToClipboard(cb.dataset.copy);}});
    loadTheme();
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'){detailPanel.classList.remove('visible');$('#mermaidModal').classList.remove('visible');$('#plantumlModal').classList.remove('visible');hideContextMenu();}
      if(e.ctrlKey&&e.key==='='){e.preventDefault();setZoom(zoom*1.2);}if(e.ctrlKey&&e.key==='-'){e.preventDefault();setZoom(zoom/1.2);}
      if(e.ctrlKey&&e.key==='0'){e.preventDefault();fitAll();}if(e.ctrlKey&&e.key==='s'){e.preventDefault();saveLayout();}
      if(e.ctrlKey&&e.key==='z'){e.preventDefault();undo();}if(e.ctrlKey&&e.key==='y'){e.preventDefault();redo();}
      if(e.ctrlKey&&e.key==='f'){e.preventDefault();const tabs=document.querySelectorAll('.sidebar-tab');if(tabs[1])tabs[1].click();fieldSearchInput.focus();}
    });
  }

  init();
})();
