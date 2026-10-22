/* ============================================================
   Schelio — Design Mode module
   Draft objects / fields / relationships on the canvas, then
   export them as SFDX source (+ package.xml) ready to deploy.
   Nothing here writes to the org: the output is a ZIP the user
   deploys with `sf project deploy start`.
   ============================================================ */
(function () {
  'use strict';
  const S = window.Schelio; if (!S) return;
  const $ = s => document.querySelector(s);

  // ── State ───────────────────────────────────────────────
  // drafts = { objects: { 'Invoice__c': {label, plural, api, description, sharing, fields:[...]} },
  //            fields:  { 'Account': [ {api,label,type,...}, ... ] } }   // new fields on EXISTING objects
  let drafts = { objects: {}, fields: {} };
  let designMode = false;
  let editing = null; // { objectApi, fieldIndex } when editing an existing draft field

  const FIELD_TYPES = [
    ['Text','Text'],['LongTextArea','Long Text Area'],['Number','Number'],['Currency','Currency'],['Percent','Percent'],
    ['Checkbox','Checkbox'],['Date','Date'],['DateTime','Date/Time'],['Email','Email'],['Phone','Phone'],['Url','URL'],
    ['Picklist','Picklist'],['MultiselectPicklist','Multi-Select Picklist'],['Lookup','Lookup Relationship'],['MasterDetail','Master-Detail Relationship']
  ];
  const TYPE_TO_DESCRIBE = { Text:'string', LongTextArea:'textarea', Number:'double', Currency:'currency', Percent:'percent', Checkbox:'boolean', Date:'date', DateTime:'datetime', Email:'email', Phone:'phone', Url:'url', Picklist:'picklist', MultiselectPicklist:'multipicklist', Lookup:'reference', MasterDetail:'reference' };

  function load(){ drafts = S.storage.get('drafts', { objects: {}, fields: {} }); if(!drafts.objects) drafts.objects={}; if(!drafts.fields) drafts.fields={}; }
  function save(){ S.storage.set('drafts', drafts); updateCounter(); }

  function draftCount(){ const o=Object.keys(drafts.objects).length; const f=Object.values(drafts.objects).reduce((n,ob)=>n+ob.fields.length,0)+Object.values(drafts.fields).reduce((n,a)=>n+a.length,0); return {objects:o, fields:f}; }
  function updateCounter(){ const c=draftCount(); const el=$('#designCounter'); if(el) el.textContent=c.objects+' obj · '+c.fields+' fields'; const btn=$('#btnExportSfdx'); if(btn) btn.disabled=(c.objects+c.fields)===0; }

  // ── API name helpers ────────────────────────────────────
  function toApiName(label){ return label.trim().replace(/[^A-Za-z0-9 _]/g,'').replace(/\s+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'').replace(/^[0-9]/,'X$&'); }
  function ensureSuffix(api){ return toApiName(String(api||'').replace(/__c$/i,''))+'__c'; }
  function relationshipName(api){ return api.replace(/__c$/,'').replace(/__/g,'_'); }

  // ── Hooks into core rendering ──────────────────────────
  S.on('extraFields', api => (drafts.fields[api]||[]).map(f => ({ name:f.api, label:f.label, type:TYPE_TO_DESCRIBE[f.type]||'string', referenceTo:f.referenceTo?[f.referenceTo]:undefined })));

  S.on('renderExtraNodes', () => {
    Object.values(drafts.objects).forEach(ob => {
      const key = 'draft:'+ob.api;
      if (!S.nodePositions[key]) S.nodePositions[key] = S.nextFreePosition();
      const pos = S.nodePositions[key];
      const fields = ob.fields.slice(0, S.MAX_FIELDS_SHOWN);
      const cardH = S.CARD_HEADER_H + Math.max(1,fields.length)*S.FIELD_ROW_H + S.CARD_PADDING*2 + (ob.fields.length>S.MAX_FIELDS_SHOWN?20:0) + (designMode?26:0);
      const g = S.svgEl('g', { class:'erd-node erd-node-draft', 'data-api':key, transform:'translate('+pos.x+','+pos.y+')' });
      g.appendChild(S.svgEl('rect',{class:'card-bg card-bg-draft',width:S.CARD_WIDTH,height:cardH,filter:'url(#cardShadow)'}));
      g.appendChild(S.svgEl('rect',{class:'card-header-bg',width:S.CARD_WIDTH,height:S.CARD_HEADER_H,fill:'#3B2F0B','clip-path':'inset(0 0 0 0 round 8px 8px 0 0)'}));
      g.appendChild(S.svgEl('rect',{x:0,y:S.CARD_HEADER_H-2,width:S.CARD_WIDTH,height:2,fill:'#FBBF24',opacity:0.8}));
      g.appendChild(S.svgEl('rect',{x:S.CARD_WIDTH-52,y:6,width:44,height:16,rx:4,fill:'rgba(251,191,36,0.2)'}));
      let t=S.svgEl('text',{x:S.CARD_WIDTH-30,y:18,'text-anchor':'middle','font-size':'9','font-weight':'600','font-family':"'JetBrains Mono',monospace",fill:'#FBBF24'}); t.textContent='DRAFT'; g.appendChild(t);
      t=S.svgEl('text',{class:'card-title',x:14,y:22}); t.textContent=S.truncate(ob.label,20); g.appendChild(t);
      t=S.svgEl('text',{class:'card-api-name',x:14,y:38}); t.textContent=ob.api; g.appendChild(t);
      if (!fields.length) { const e=S.svgEl('text',{x:S.CARD_WIDTH/2,y:S.CARD_HEADER_H+S.CARD_PADDING+15,'text-anchor':'middle','font-size':'10',fill:'#64748B','font-family':"'JetBrains Mono',monospace"}); e.textContent='no fields yet'; g.appendChild(e); }
      fields.forEach((f,i)=>{
        const fy=S.CARD_HEADER_H+S.CARD_PADDING+i*S.FIELD_ROW_H;
        const row=S.svgEl('rect',{x:2,y:fy,width:S.CARD_WIDTH-4,height:S.FIELD_ROW_H,fill:'transparent',rx:3,class:'draft-field-row'});
        row.addEventListener('dblclick',ev=>{ev.stopPropagation();openFieldModal(ob.api,i);});
        g.appendChild(row);
        let el=S.svgEl('text',{class:'field-icon',x:12,y:fy+15}); el.textContent=S.FIELD_ICONS[TYPE_TO_DESCRIBE[f.type]]||'◽'; g.appendChild(el);
        el=S.svgEl('text',{class:'field-name',x:28,y:fy+15}); el.textContent=S.truncate(f.label,20); g.appendChild(el);
        el=S.svgEl('text',{class:'field-type',x:S.CARD_WIDTH-12,y:fy+15,'text-anchor':'end'}); el.textContent=f.type.toLowerCase(); g.appendChild(el);
      });
      if (ob.fields.length>S.MAX_FIELDS_SHOWN){const my=S.CARD_HEADER_H+S.CARD_PADDING+fields.length*S.FIELD_ROW_H+6;const el=S.svgEl('text',{x:S.CARD_WIDTH/2,y:my+8,'text-anchor':'middle','font-size':'10',fill:'#64748B','font-family':"'JetBrains Mono',monospace"});el.textContent='+ '+(ob.fields.length-S.MAX_FIELDS_SHOWN)+' more';g.appendChild(el);}
      if (designMode) addCardActions(g, cardH, ob.api, true);
      g.dataset.height=cardH;
      g.addEventListener('mousedown', S.onNodeMouseDown);
      g.addEventListener('dblclick', ()=>openObjectModal(ob.api));
      S.erdNodes.appendChild(g);
    });
  });

  // In design mode, existing (real) cards get a "+ field" action strip
  S.on('decorateNode', (api, g) => { if (designMode) { const h=parseInt(g.dataset.height)||200; addCardActions(g, h, api, false); g.dataset.height = h+26; g.querySelector('.card-bg').setAttribute('height', h+26); } });

  function addCardActions(g, cardH, api, isDraft){
    const y = cardH - 22;
    const mk = (x,w,label,onClick,danger) => {
      const b=S.svgEl('g',{class:'card-action'+(danger?' danger':''),transform:'translate('+x+','+y+')'});
      b.appendChild(S.svgEl('rect',{width:w,height:16,rx:4}));
      const t=S.svgEl('text',{x:w/2,y:11,'text-anchor':'middle'}); t.textContent=label; b.appendChild(t);
      b.addEventListener('mousedown',e=>e.stopPropagation()); b.addEventListener('click',e=>{e.stopPropagation();onClick();}); return b;
    };
    g.appendChild(mk(8, 64, '+ field', ()=>openFieldModal(api, null)));
    if (isDraft) { g.appendChild(mk(78, 44, 'edit', ()=>openObjectModal(api))); g.appendChild(mk(S.CARD_WIDTH-60, 52, 'delete', ()=>deleteObject(api), true)); }
    else if ((drafts.fields[api]||[]).length) { g.appendChild(mk(78, 90, 'draft fields ▾', ()=>openDraftFieldList(api))); }
  }

  function ensurePositions(){ Object.keys(drafts.objects).forEach(a=>{ if(!S.nodePositions['draft:'+a]) S.nodePositions['draft:'+a]=S.nextFreePosition(); }); }

  // Draft relationships: lookups/MD from drafts to real or draft objects
  // (relationships render before nodes, so positions are assigned here too)
  S.on('renderExtraRelationships', () => {
    ensurePositions();
    const edges = [];
    Object.values(drafts.objects).forEach(ob => ob.fields.forEach(f => { if (f.referenceTo) edges.push({ from:'draft:'+ob.api, to:f.referenceTo, field:f.api, md:f.type==='MasterDetail' }); }));
    Object.entries(drafts.fields).forEach(([api, list]) => list.forEach(f => { if (f.referenceTo) edges.push({ from:api, to:f.referenceTo, field:f.api, md:f.type==='MasterDetail' }); }));
    edges.forEach(e => {
      const toKey = drafts.objects[e.to] ? 'draft:'+e.to : e.to;
      const c = S.connectorPath(e.from, toKey); if (!c) return;
      S.erdRels.appendChild(S.svgEl('path',{class:'rel-line rel-draft '+(e.md?'master-detail':'lookup'),d:c.d,'marker-end':e.md?'url(#arrowMD)':'url(#arrowLookup)'}));
      const l=S.svgEl('text',{class:'rel-label',x:c.mx,y:c.my-6,'text-anchor':'middle'}); l.textContent='✎ '+e.field; S.erdRels.appendChild(l);
    });
  });

  // ── Object modal ───────────────────────────────────────
  function openObjectModal(api){
    const ob = api ? drafts.objects[api] : null;
    $('#dmObjTitle').textContent = ob ? 'Edit draft object' : 'New draft object';
    $('#dmObjLabel').value = ob?ob.label:''; $('#dmObjPlural').value = ob?ob.plural:''; $('#dmObjApi').value = ob?ob.api:'';
    $('#dmObjDesc').value = ob?(ob.description||''):''; $('#dmObjSharing').value = ob?(ob.sharing||'ReadWrite'):'ReadWrite';
    $('#dmObjNameLabel').value = ob?(ob.nameLabel||(ob.label+' Name')):''; $('#dmObjNameType').value = ob?(ob.nameType||'Text'):'Text';
    $('#dmObjApi').disabled = !!ob; $('#dmObjSave').dataset.api = api||'';
    S.openModal('#designObjectModal'); $('#dmObjLabel').focus();
  }
  function saveObjectModal(){
    const prev = $('#dmObjSave').dataset.api;
    const label = $('#dmObjLabel').value.trim(); if (!label) { S.showToast('Label is required','⚠️'); return; }
    const api = prev || ensureSuffix($('#dmObjApi').value.trim() || label);
    if (!prev && (drafts.objects[api] || S.objectMeta[api] || S.allObjects.some(o=>o.name===api))) { S.showToast(api+' already exists','⚠️'); return; }
    const ob = drafts.objects[api] || { api, fields: [] };
    ob.label=label; ob.plural=$('#dmObjPlural').value.trim()||label+'s'; ob.description=$('#dmObjDesc').value.trim(); ob.sharing=$('#dmObjSharing').value;
    ob.nameLabel=$('#dmObjNameLabel').value.trim()||label+' Name'; ob.nameType=$('#dmObjNameType').value;
    if(!prev) S.pushUndo();
    drafts.objects[api]=ob; save(); S.closeModal('#designObjectModal'); S.renderERD(); S.showToast(prev?'Draft updated':'Draft object added','✎');
  }
  function deleteObject(api){
    if (!confirm('Remove draft object '+api+' and its fields?')) return;
    S.pushUndo();
    delete drafts.objects[api]; delete S.nodePositions['draft:'+api];
    // drop references pointing to it
    Object.values(drafts.objects).forEach(o=>{o.fields=o.fields.filter(f=>f.referenceTo!==api);});
    Object.keys(drafts.fields).forEach(k=>{drafts.fields[k]=drafts.fields[k].filter(f=>f.referenceTo!==api);});
    save(); S.renderERD();
  }

  // ── Field modal ────────────────────────────────────────
  function fieldList(objectApi){ return drafts.objects[objectApi] ? drafts.objects[objectApi].fields : (drafts.fields[objectApi] = drafts.fields[objectApi] || []); }

  function openFieldModal(objectApi, index){
    editing = { objectApi, index };
    const f = index!=null ? fieldList(objectApi)[index] : null;
    $('#dmFieldTitle').textContent = (f?'Edit field on ':'New field on ')+objectApi;
    $('#dmFieldLabel').value=f?f.label:''; $('#dmFieldApi').value=f?f.api:''; $('#dmFieldApi').disabled=!!f;
    $('#dmFieldType').value=f?f.type:'Text'; $('#dmFieldLength').value=f?(f.length||255):255; $('#dmFieldPrecision').value=f?(f.precision||18):18; $('#dmFieldScale').value=f?(f.scale||2):2;
    $('#dmFieldRequired').checked=!!(f&&f.required); $('#dmFieldUnique').checked=!!(f&&f.unique); $('#dmFieldExternalId').checked=!!(f&&f.externalId);
    $('#dmFieldPicklist').value=f&&f.values?f.values.join('\n'):''; $('#dmFieldDesc').value=f?(f.description||''):''; $('#dmFieldHelp').value=f?(f.help||''):'';
    // reference target options: all org objects + drafts
    const sel=$('#dmFieldRefTo'); const names=new Set([...S.allObjects.map(o=>o.name), ...Object.keys(drafts.objects)]); names.delete(objectApi);
    sel.innerHTML=[...names].sort().map(n=>'<option value="'+S.escHtml(n)+'">'+S.escHtml(n)+(drafts.objects[n]?' (draft)':'')+'</option>').join('');
    if (f&&f.referenceTo) sel.value=f.referenceTo;
    $('#dmFieldDelete').style.display=f?'':'none';
    refreshFieldModalVisibility(); S.openModal('#designFieldModal'); $('#dmFieldLabel').focus();
  }
  function refreshFieldModalVisibility(){
    const t=$('#dmFieldType').value;
    $('#dmRowLength').style.display=(t==='Text'||t==='LongTextArea')?'':'none';
    $('#dmRowNumber').style.display=(t==='Number'||t==='Currency'||t==='Percent')?'':'none';
    $('#dmRowPicklist').style.display=(t==='Picklist'||t==='MultiselectPicklist')?'':'none';
    $('#dmRowRef').style.display=(t==='Lookup'||t==='MasterDetail')?'':'none';
    $('#dmRowUnique').style.display=(t==='Text'||t==='Number'||t==='Email')?'':'none';
  }
  function saveFieldModal(){
    const {objectApi,index}=editing; const list=fieldList(objectApi);
    const label=$('#dmFieldLabel').value.trim(); if(!label){S.showToast('Label is required','⚠️');return;}
    const api=index!=null?list[index].api:ensureSuffix($('#dmFieldApi').value.trim()||label);
    if(index==null){ const taken=list.some(x=>x.api===api)||(S.objectMeta[objectApi]&&S.objectMeta[objectApi].fields.some(x=>x.name===api)); if(taken){S.showToast(api+' already exists on '+objectApi,'⚠️');return;} }
    const type=$('#dmFieldType').value;
    const f={ api, label, type, description:$('#dmFieldDesc').value.trim(), help:$('#dmFieldHelp').value.trim(), required:$('#dmFieldRequired').checked };
    if(type==='Text'||type==='LongTextArea') f.length=Math.max(1,parseInt($('#dmFieldLength').value)||255);
    if(type==='Number'||type==='Currency'||type==='Percent'){ f.precision=Math.min(18,Math.max(1,parseInt($('#dmFieldPrecision').value)||18)); f.scale=Math.min(f.precision-1,Math.max(0,parseInt($('#dmFieldScale').value)||0)); }
    if(type==='Picklist'||type==='MultiselectPicklist'){ f.values=$('#dmFieldPicklist').value.split('\n').map(v=>v.trim()).filter(Boolean); if(!f.values.length){S.showToast('Add at least one picklist value','⚠️');return;} }
    if(type==='Lookup'||type==='MasterDetail'){ f.referenceTo=$('#dmFieldRefTo').value; if(!f.referenceTo){S.showToast('Pick a related object','⚠️');return;} if(type==='MasterDetail') f.required=true; }
    if($('#dmRowUnique').style.display!=='none'){ f.unique=$('#dmFieldUnique').checked; f.externalId=$('#dmFieldExternalId').checked; }
    if(index!=null) list[index]=f; else list.push(f);
    save(); S.closeModal('#designFieldModal'); S.buildRelationships(); S.renderERD(); S.showToast(index!=null?'Field updated':'Field added to '+objectApi,'✎');
  }
  function deleteField(){ const {objectApi,index}=editing; if(index==null)return; fieldList(objectApi).splice(index,1); if(drafts.fields[objectApi]&&!drafts.fields[objectApi].length) delete drafts.fields[objectApi]; save(); S.closeModal('#designFieldModal'); S.renderERD(); }

  function openDraftFieldList(api){
    const list=drafts.fields[api]||[]; const body=$('#designListBody');
    $('#designListTitle').textContent='Draft fields on '+api;
    body.innerHTML=list.map((f,i)=>'<div class="design-list-row" data-i="'+i+'"><span class="design-list-icon">'+(S.FIELD_ICONS[TYPE_TO_DESCRIBE[f.type]]||'◽')+'</span><span class="design-list-name">'+S.escHtml(f.label)+'</span><span class="design-list-api">'+S.escHtml(f.api)+' · '+f.type+(f.referenceTo?' → '+S.escHtml(f.referenceTo):'')+'</span><button class="design-list-edit">edit</button></div>').join('')||'<div class="empty-tab-msg">No draft fields.</div>';
    body.querySelectorAll('.design-list-edit').forEach(b=>b.addEventListener('click',()=>{S.closeModal('#designListModal');openFieldModal(api,parseInt(b.parentElement.dataset.i));}));
    S.openModal('#designListModal');
  }

  // ── SFDX generation ────────────────────────────────────
  const X = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

  // Elements are emitted in alphabetical order, like the Metadata API itself does.
  function xmlBlock(root, pairs, indent){
    const pad=' '.repeat(indent);
    return pairs.filter(p=>p[1]!==undefined&&p[1]!==null&&p[1]!=='').sort((a,b)=>a[0].localeCompare(b[0]))
      .map(([k,v])=>Array.isArray(v)?pad+'<'+k+'>\n'+xmlBlock(null,v,indent+4)+pad+'</'+k+'>\n':pad+'<'+k+'>'+(typeof v==='boolean'?String(v):X(v))+'</'+k+'>\n').join('');
  }
  function objectXml(ob){
    const name=[['label',ob.nameLabel],['type',ob.nameType==='AutoNumber'?'AutoNumber':'Text']];
    if(ob.nameType==='AutoNumber') name.push(['displayFormat',ob.api.replace(/__c$/,'').toUpperCase().slice(0,3)+'-{00000}']);
    const pairs=[['label',ob.label],['pluralLabel',ob.plural],['description',ob.description],['nameField',name],['deploymentStatus','Deployed'],['sharingModel',(ob.fields||[]).some(f=>f.type==='MasterDetail')?'ControlledByParent':(ob.sharing||'ReadWrite')],
      ['enableActivities',true],['enableBulkApi',true],['enableFeeds',false],['enableHistory',false],['enableReports',true],['enableSearch',true],['enableSharing',true],['enableStreamingApi',true],['externalSharingModel','Private']];
    return HEAD+'<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">\n'+xmlBlock(null,pairs,4)+'</CustomObject>\n';
  }

  // Child relationship name: the child's plural label (Salesforce's own default),
  // suffixed with the field when the same child points twice at the same parent.
  function childRelName(ob, f, siblings){
    let base=toApiName(ob.plural||ob.label+'s').replace(/__+/g,'_').replace(/^_|_$/g,'')||relationshipName(ob.api);
    const same=(siblings||[]).filter(x=>x!==f&&(x.type==='Lookup'||x.type==='MasterDetail')&&x.referenceTo===f.referenceTo);
    if(same.length) base+='_'+relationshipName(f.api);
    return base.slice(0,40);
  }

  function fieldXml(ob, f, siblings){
    const t=f.type; const pairs=[['fullName',f.api],['label',f.label],['description',f.description],['inlineHelpText',f.help],['type',t],['trackTrending',false]];
    if(f.externalId) pairs.push(['externalId',true]);
    if(t==='Lookup'||t==='MasterDetail'){
      pairs.push(['referenceTo',f.referenceTo],['relationshipLabel',ob.plural||ob.label+'s'],['relationshipName',childRelName(ob,f,siblings)]);
      if(t==='MasterDetail') pairs.push(['relationshipOrder',0],['reparentableMasterDetail',false],['writeRequiresMasterRead',false]);
      else pairs.push(['deleteConstraint','SetNull'],['required',!!f.required]);
    } else {
      if(t!=='Checkbox') pairs.push(['required',!!f.required]); else pairs.push(['defaultValue','false']);
      if(t==='Text') pairs.push(['length',f.length||255],['unique',!!f.unique]);
      if(t==='LongTextArea') pairs.push(['length',f.length||32768],['visibleLines',3]);
      if(t==='Number'||t==='Currency'||t==='Percent') pairs.push(['precision',f.precision||18],['scale',f.scale!=null?f.scale:2]);
      if(t==='Number') pairs.push(['unique',!!f.unique]);
      if(t==='Email') pairs.push(['unique',!!f.unique]);
      if(t==='Picklist'||t==='MultiselectPicklist'){
        const values=(f.values||[]).map(v=>['value',[['fullName',v],['default',false],['label',v]]]);
        pairs.push(['valueSet',[['restricted',true],['valueSetDefinition',[['sorted',false]].concat(values)]]]);
        if(t==='MultiselectPicklist') pairs.push(['visibleLines',4]);
      }
    }
    return HEAD+'<CustomField xmlns="http://soap.sforce.com/2006/04/metadata">\n'+xmlBlock(null,pairs,4)+'</CustomField>\n';
  }

  function packageXml(objects, fields){
    let p=HEAD+'<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n';
    if(objects.length) p+='    <types>\n'+objects.map(o=>'        <members>'+X(o)+'</members>\n').join('')+'        <name>CustomObject</name>\n    </types>\n';
    if(fields.length) p+='    <types>\n'+fields.map(f=>'        <members>'+X(f)+'</members>\n').join('')+'        <name>CustomField</name>\n    </types>\n';
    return p+'    <version>59.0</version>\n</Package>\n';
  }

  function buildSfdx(){
    const files = {}; const objMembers=[], fieldMembers=[];
    const base='force-app/main/default/objects/';
    Object.values(drafts.objects).forEach(ob=>{
      files[base+ob.api+'/'+ob.api+'.object-meta.xml']=objectXml(ob); objMembers.push(ob.api);
      ob.fields.forEach(f=>{ files[base+ob.api+'/fields/'+f.api+'.field-meta.xml']=fieldXml(ob,f,ob.fields); fieldMembers.push(ob.api+'.'+f.api); });
    });
    Object.entries(drafts.fields).forEach(([api,list])=>{
      const meta=S.objectMeta[api]; const ob={api,label:meta?meta.label:api,plural:meta?meta.labelPlural:api+'s'};
      list.forEach(f=>{ files[base+api+'/fields/'+f.api+'.field-meta.xml']=fieldXml(ob,f,list); fieldMembers.push(api+'.'+f.api); });
    });
    files['manifest/package.xml']=packageXml(objMembers,fieldMembers);
    files['sfdx-project.json']=JSON.stringify({packageDirectories:[{path:'force-app',default:true}],namespace:'',sfdcLoginUrl:'https://login.salesforce.com',sourceApiVersion:'59.0'},null,2)+'\n';
    files['README.md']='# Schelio design package\n\nGenerated '+new Date().toISOString()+' from '+S.instanceUrl+'\n\n'
      +'Objects: '+objMembers.length+' · Fields: '+fieldMembers.length+'\n\n## Deploy\n\n```bash\nsf org login web --alias target\nsf project deploy start --manifest manifest/package.xml --target-org target\n```\n\n'
      +'Validate first (no changes): add `--dry-run`.\n\n> Review sharing model, FLS and page layouts after deployment — this package creates objects and fields only.\n';
    return { files, objMembers, fieldMembers };
  }

  // ── Minimal ZIP writer (STORE, no compression) ─────────
  const CRC_TABLE = (()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
  function dosDateTime(d){return {time:((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF,date:(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF};}
  function makeZip(files){
    const enc=new TextEncoder(); const parts=[]; const central=[]; let offset=0; const now=dosDateTime(new Date());
    Object.entries(files).forEach(([name,content])=>{
      const nameB=enc.encode(name), data=enc.encode(content), crc=crc32(data);
      const local=new DataView(new ArrayBuffer(30));
      local.setUint32(0,0x04034b50,true); local.setUint16(4,20,true); local.setUint16(6,0x0800,true); local.setUint16(8,0,true);
      local.setUint16(10,now.time,true); local.setUint16(12,now.date,true); local.setUint32(14,crc,true); local.setUint32(18,data.length,true); local.setUint32(22,data.length,true);
      local.setUint16(26,nameB.length,true); local.setUint16(28,0,true);
      parts.push(new Uint8Array(local.buffer),nameB,data);
      const cd=new DataView(new ArrayBuffer(46));
      cd.setUint32(0,0x02014b50,true); cd.setUint16(4,20,true); cd.setUint16(6,20,true); cd.setUint16(8,0x0800,true); cd.setUint16(10,0,true);
      cd.setUint16(12,now.time,true); cd.setUint16(14,now.date,true); cd.setUint32(16,crc,true); cd.setUint32(20,data.length,true); cd.setUint32(24,data.length,true);
      cd.setUint16(28,nameB.length,true); cd.setUint16(30,0,true); cd.setUint16(32,0,true); cd.setUint16(34,0,true); cd.setUint16(36,0,true); cd.setUint32(38,0,true); cd.setUint32(42,offset,true);
      central.push(new Uint8Array(cd.buffer),nameB);
      offset+=30+nameB.length+data.length;
    });
    const cdSize=central.reduce((n,p)=>n+p.length,0);
    const end=new DataView(new ArrayBuffer(22));
    end.setUint32(0,0x06054b50,true); end.setUint16(4,0,true); end.setUint16(6,0,true); end.setUint16(8,Object.keys(files).length,true); end.setUint16(10,Object.keys(files).length,true);
    end.setUint32(12,cdSize,true); end.setUint32(16,offset,true); end.setUint16(20,0,true);
    return new Blob([...parts,...central,new Uint8Array(end.buffer)],{type:'application/zip'});
  }

  function exportSfdx(){
    const {files,objMembers,fieldMembers}=buildSfdx();
    if(!objMembers.length&&!fieldMembers.length){S.showToast('Nothing drafted yet','⚠️');return;}
    const blob=makeZip(files); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='schelio-design-'+new Date().toISOString().slice(0,10)+'.zip'; a.click();
    S.showToast('SFDX package: '+objMembers.length+' objects, '+fieldMembers.length+' fields','📦');
  }
  function previewSfdx(){
    const {files}=buildSfdx();
    $('#designPreviewBody').innerHTML=Object.entries(files).map(([n,c])=>'<div class="design-preview-file"><div class="design-preview-name">'+S.escHtml(n)+'</div><pre>'+S.escHtml(c)+'</pre></div>').join('')||'<div class="empty-tab-msg">Nothing drafted yet.</div>';
    S.openModal('#designPreviewModal');
  }

  // ── Mode toggle & wiring ───────────────────────────────
  function setDesignMode(on){
    designMode=on; document.body.classList.toggle('design-mode',on);
    $('#btnDesignMode').classList.toggle('active',on); $('#designBar').classList.toggle('visible',on);
    S.renderERD(); if(on) S.showToast('Design Mode — draft objects & fields, then export SFDX','✎');
  }

  function wire(){
    load(); updateCounter();
    $('#btnDesignMode').addEventListener('click',()=>setDesignMode(!designMode));
    $('#btnDesignAddObject').addEventListener('click',()=>openObjectModal(null));
    $('#btnExportSfdx').addEventListener('click',exportSfdx);
    $('#btnPreviewSfdx').addEventListener('click',previewSfdx);
    $('#btnDesignClear').addEventListener('click',()=>{ if(confirm('Discard all drafts for this org?')){ Object.keys(drafts.objects).forEach(a=>delete S.nodePositions['draft:'+a]); drafts={objects:{},fields:{}}; save(); S.renderERD(); } });
    $('#dmObjSave').addEventListener('click',saveObjectModal);
    $('#dmObjLabel').addEventListener('input',()=>{ if(!$('#dmObjApi').disabled){ $('#dmObjApi').value=ensureSuffix($('#dmObjLabel').value||''); if(!$('#dmObjNameLabel').dataset.touched) $('#dmObjNameLabel').value=$('#dmObjLabel').value.trim()+' Name'; } });
    $('#dmObjNameLabel').addEventListener('input',()=>{$('#dmObjNameLabel').dataset.touched='1';});
    $('#dmFieldSave').addEventListener('click',saveFieldModal);
    $('#dmFieldDelete').addEventListener('click',deleteField);
    $('#dmFieldType').addEventListener('change',refreshFieldModalVisibility);
    $('#dmFieldLabel').addEventListener('input',()=>{ if(!$('#dmFieldApi').disabled) $('#dmFieldApi').value=ensureSuffix($('#dmFieldLabel').value||''); });
    // re-render once the object list is in (positions depend on it)
    document.addEventListener('schelio:objects-ready', ()=>S.renderERD());
  }

  // Expose for other modules (lint can score drafts, mapping can target them)
  S.design = { get drafts(){ return drafts; }, openFieldModal, openObjectModal, buildSfdx, makeZip, FIELD_TYPES, TYPE_TO_DESCRIBE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
