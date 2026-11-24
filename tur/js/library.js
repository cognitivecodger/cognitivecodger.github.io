/* Local named tracks and exact-text draft recovery. No network or accounts. */
(function () {
  'use strict';
  const TRACK='trackshift.track.v1.',RECOVERY='trackshift.recovery.v1.';
  const ACTIVE='trackshift.library.active.v1',SESSION='trackshift.sessionRecovery.v1';
  const NEW_CODE='TS2|(TL=10,TW=8,TD=0.25,LH=4)|(AA=0,AH=0)|(FL=2)';
  const defaults={turnSegments:12,longitudinalSegments:12,slopeEaseStart:true,slopeEaseEnd:true,slopeCurveStrength:1,
    bankCurve:0,bankTransition:1,bankWidthSegments:8,widthSegments:8,curvedSlopeWidthSegments:12,smoothRoad:true};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const token=()=>window.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const name=value=>String(value??'').trim().slice(0,80)||'Untitled track';
  function options(value={}) {
    const result={};
    for(const [key,fallback] of Object.entries(defaults)) {
      const v=value[key];
      if(v===undefined)result[key]=fallback;
      else if(typeof fallback==='boolean' && typeof v==='boolean')result[key]=v;
      else if(typeof fallback==='number' && typeof v==='number' && Number.isFinite(v) && v>=0 && v<=128)result[key]=v;
      else throw Error('Unrecognised saved track settings.');
    }
    return result;
  }
  function documentData(value) {
    if(!value || typeof value.code!=='string' || typeof value.draft!=='string')throw Error('Incomplete saved track.');
    window.TS2.parse(value.code); // Only the last generated code must be valid. Drafts may be anything.
    return {code:value.code,draft:value.draft,options:options(value.options),selection:Math.max(0,Math.trunc(Number(value.selection)||0))};
  }
  function recordData(value,id) {
    if(!value || value.version!==1 || value.id!==id || typeof value.revision!=='string' || !Number.isFinite(value.updatedAt))throw Error('Unrecognised saved track.');
    return {...value,name:name(value.name),nameDraft:String(value.nameDraft??value.name??'').slice(0,80),document:documentData(value.document)};
  }
  // Each track has its own key: a save cannot replace a stale, whole-library index.
  function createStore(storage,config={}) {
    const id=config.id??token,now=config.now??Date.now;
    function getStorage(){if(!storage)throw Error('Local storage is unavailable.');return storage;}
    function read(trackId) {
      const raw=getStorage().getItem(TRACK+trackId);
      return raw===null?null:recordData(JSON.parse(raw),trackId);
    }
    function list() {
      const tracks=[],recoveries=[];let unreadable=0;const s=getStorage(),keys=[];
      for(let i=0;i<s.length;i++)keys.push(s.key(i));
      for(const key of keys) {
        if(!key?.startsWith(TRACK) && !key?.startsWith(RECOVERY))continue;
        try {
          if(key.startsWith(TRACK)){const record=read(key.slice(TRACK.length));if(record)tracks.push(record);}
          else {
            const r=JSON.parse(s.getItem(key));
            if(r.version!==1 || typeof r.id!=='string' || key!==RECOVERY+r.id || !Number.isFinite(r.updatedAt))throw Error('Invalid recovery.');
            recoveries.push({...r,name:name(r.name),document:documentData(r.document)});
          }
        }catch(error){unreadable++;} // Leave unknown/corrupt data untouched for manual recovery.
      }
      tracks.sort((a,b)=>b.updatedAt-a.updatedAt||a.name.localeCompare(b.name));
      recoveries.sort((a,b)=>b.updatedAt-a.updatedAt);
      return {tracks,recoveries,unreadable};
    }
    // Preserve even unknown or damaged records, rather than silently omitting
    // them from a user's library backup. Do not modify browser storage.
    function snapshot() {
      const s=getStorage(),entries=[];
      for(let i=0;i<s.length;i++){
        const key=s.key(i);
        if(key===ACTIVE || key?.startsWith(TRACK) || key?.startsWith(RECOVERY)){
          const value=s.getItem(key);if(value!==null)entries.push({key,value});
        }
      }
      return entries.sort((a,b)=>a.key.localeCompare(b.key));
    }
    function check(trackId,expected) {
      const current=read(trackId);
      if((current?.revision??null)!==expected)throw Error('This track changed in another tab.');
    }
    function put(value,expected=null) {
      const trackId=value.id??id();check(trackId,expected);
      const record={version:1,id:trackId,name:name(value.name),nameDraft:String(value.nameDraft??value.name??'').slice(0,80),
        revision:id(),updatedAt:now(),document:documentData(value.document)};
      getStorage().setItem(TRACK+trackId,JSON.stringify(record));return record;
    }
    function remove(trackId,expected){check(trackId,expected);getStorage().removeItem(TRACK+trackId);}
    function journal(value) {
      const r={...value,version:1,updatedAt:now(),document:documentData(value.document)};
      getStorage().setItem(RECOVERY+r.id,JSON.stringify(r));return r;
    }
    return {read,list,snapshot,put,remove,journal,
      removeRecovery:journalId=>getStorage().removeItem(RECOVERY+journalId),
      active:()=>getStorage().getItem(ACTIVE),setActive:trackId=>getStorage().setItem(ACTIVE,trackId)};
  }
  function create(host) {
    const $=id=>document.getElementById(id);
    let storage;try{storage=window.localStorage;}catch(error){/* Private/disabled storage still permits editing. */}
    const store=createStore(storage);
    let record=null,journalId=token(),loading=false,timer=null,conflict=false,pendingDelete=null,leaveBlankUnsaved=false;
    let savedFingerprint='',durableFingerprint='',initialFingerprint='',lastError='';
    const session={get(){try{return window.sessionStorage?.getItem(SESSION);}catch(e){return null;}},
      set(value){try{window.sessionStorage?.setItem(SESSION,value);}catch(e){/* Record/recovery storage remains usable. */}},
      clear(){try{window.sessionStorage?.removeItem(SESSION);}catch(e){}}};
    function capture(){const doc=host.get();return doc?{document:documentData(doc),nameDraft:$('trackName').value}:null;}
    const fingerprint=value=>JSON.stringify(value);
    function status(text,error=false){if($('saveStatus').textContent!==text)$('saveStatus').textContent=text;$('saveStatus').classList.toggle('error',error);}
    function cancelDeletion(){pendingDelete=null;$('deleteTrackPrompt').hidden=true;}
    function refresh() {
      try {
        const data=store.list(),select=$('savedTracks');
        const items=data.tracks.map(track=>{const o=document.createElement('option');o.value=track.id;o.textContent=track.name;return o;});
        if(!record || !data.tracks.some(t=>t.id===record.id)) {
          const o=document.createElement('option');o.value='';o.textContent=record?`${record.name} (working copy)`:'Unsaved working track';items.unshift(o);
        }
        select.replaceChildren(...items);select.value=data.tracks.some(t=>t.id===record?.id)?record.id:'';
        const old=$('recoveryTracks').value,recoveries=data.recoveries.filter(r=>r.id!==journalId);
        $('recoveryTracks').replaceChildren(...recoveries.map(r=>{const o=document.createElement('option');o.value=r.id;
          o.textContent=`${r.name} · ${new Date(r.updatedAt).toLocaleString()}`;return o;}));
        if(recoveries.some(r=>r.id===old))$('recoveryTracks').value=old;
        else $('recoveryTracks').value=recoveries[0]?.id??'';
        $('recoveryPanel').hidden=!recoveries.length;
        if(recoveries.length)$('recoveryPanel').open=true;
        $('deleteTrack').disabled=!record;
        return data;
      }catch(error){
        const o=document.createElement('option');o.value='';o.textContent='Unsaved working track';$('savedTracks').replaceChildren(o);
        $('savedTracks').value='';$('deleteTrack').disabled=true;return {tracks:[],recoveries:[],unreadable:0};
      }
    }
    function uniqueName(proposed,exclude=null) {
      const tracks=store.list().tracks.filter(t=>t.id!==exclude),base=name(proposed);
      let candidate=base,i=1;
      while(tracks.some(t=>t.name.toLowerCase()===candidate.toLowerCase())) {
        const suffix=i===1?' copy':` copy ${i}`;candidate=base.slice(0,80-suffix.length)+suffix;i++;
      }
      return candidate;
    }
    function clearJournal() {
      try{store.removeRecovery(journalId);if(session.get()===journalId)session.clear();}catch(error){/* A redundant recovery copy is safe. */}
    }
    function storedStatus(value) {
      const draft=value.document.draft!==value.document.code;
      const rename=value.nameDraft.trim()!==record.name;
      status(`${draft?'Draft autosaved; preview uses last generated code.':'Saved locally.'}${rename?' Press Save now to apply the name.':''}`);
    }
    function notifySaved() {
      if(!record || !host.saved)return;
      try{const result=host.saved(record);if(result?.message)status(result.message,!!result.error);}
      catch(error){status(`Saved in My tracks; the pack could not be updated: ${error.message}`,true);}
    }
    function flush(rename=false) {
      if(timer!==null){window.clearTimeout?.(timer);timer=null;}
      if(loading)return true;
      const value=capture();if(!value)return false;
      const fp=fingerprint(value);
      // Deleting the last saved track leaves a blank editor, not a new library
      // entry just because the browser is closing or the tab loses focus.
      if(!record && leaveBlankUnsaved && fp===initialFingerprint && !rename)return true;
      if(record && fp===savedFingerprint && !rename){
        if(conflict)status('This track changed in another tab. Save a copy to keep your work.',true);else {storedStatus(value);notifySaved();}
        return true;
      }
      let recovered=false;
      try {
        store.journal({id:journalId,trackId:record?.id??null,baseRevision:record?.revision??null,
          name:record?.name??name(value.nameDraft),nameDraft:value.nameDraft,document:value.document});
        session.set(journalId);durableFingerprint=fp;recovered=true;
      }catch(error){lastError=error.message;}
      try {
        if(conflict)throw Error('This track changed in another tab.');
        let nextName=record?.name??name(value.nameDraft);
        if(rename || !record) {
          nextName=name(value.nameDraft);
          if(store.list().tracks.some(t=>t.id!==record?.id && t.name.toLowerCase()===nextName.toLowerCase()))throw Error('That name is already used. Choose a different name or Save a copy.');
        }
        const next=store.put({id:record?.id,name:nextName,nameDraft:rename?nextName:value.nameDraft,document:value.document},record?.revision??null);
        record=next;leaveBlankUnsaved=false;$('trackName').value=next.nameDraft;
        savedFingerprint=fingerprint({document:next.document,nameDraft:next.nameDraft});durableFingerprint=savedFingerprint;
        initialFingerprint=savedFingerprint;lastError='';clearJournal();
        try{store.setActive(record.id);}catch(error){/* Track data is durable even if the last-open pointer could not be updated. */}
        refresh();storedStatus({document:next.document,nameDraft:next.nameDraft});notifySaved();return true;
      }catch(error) {
        lastError=error.message;
        if(/another tab/.test(lastError))conflict=true;
        status(`${recovered?'Recovery draft saved.':'Not saved locally.'} ${lastError} ${conflict?'Use Save a copy to keep both.':recovered?'Use Save now to retry.':'Export draft to keep your work.'}`,true);
        return recovered;
      }
    }
    function changed() {
      if(loading)return;
      cancelDeletion();const value=capture();if(!value)return;
      if(fingerprint(value)===savedFingerprint)return;
      status(conflict?'Changed in another tab; saving a recovery draft…':'Saving…',conflict);
      if(timer!==null)window.clearTimeout?.(timer);
      timer=window.setTimeout(()=>{timer=null;flush();},450);
    }
    function canLeave() {
      const durable=flush();
      if(durable || fingerprint(capture())===initialFingerprint)return true;
      host.message('This working track could not be saved. Export draft before opening another track.',true);return false;
    }
    function activate(next,reset=true) {
      loading=true;
      try {if(!host.load(next.document,reset))return false;}
      finally{loading=false;}
      cancelDeletion();record=next.id?next:null;leaveBlankUnsaved=false;conflict=false;journalId=token();
      $('trackName').value=next.nameDraft??next.name;
      const fp=fingerprint(capture());savedFingerprint=record?fp:'';durableFingerprint=record?fp:'';initialFingerprint=fp;
      if(record){try{store.setActive(record.id);}catch(e){}storedStatus(capture());}
      refresh();host.activated?.(record);return true;
    }
    function open(trackId) {
      if(trackId===record?.id && !conflict)return true;
      cancelDeletion();if(!canLeave()){refresh();return false;}
      try {
        const next=store.read(trackId);if(!next)throw Error('That saved track is no longer available.');
        if(!activate(next)){refresh();return false;}return true;
      }catch(error){status(`Could not open track: ${error.message}`,true);refresh();return false;}
    }
    function newDocument(code=NEW_CODE,title='Untitled track',settings=defaults) {
      cancelDeletion();if(!canLeave())return false;
      let next;
      try{
        let nextName;try{nextName=uniqueName(title);}catch(error){nextName=name(title);}
        next={name:nextName,document:documentData({code,draft:code,options:settings,selection:0})};
      }
      catch(error){host.message(`Could not open track: ${error.message}`,true);return false;}
      if(!activate({...next,nameDraft:next.name}))return false;
      if(flush() && record)host.created?.(record);return true;
    }
    function copy() {
      cancelDeletion();const value=capture();if(!value)return false;
      let title;
      try{title=uniqueName(value.nameDraft);}catch(error){status(`Could not save a copy: ${error.message}`,true);return false;}
      // Preserve a failed/conflicting draft before creating the independent copy.
      flush();
      try {
        const next=store.put({name:title,nameDraft:title,document:value.document});
        clearJournal();record=next;conflict=false;journalId=token();$('trackName').value=title;
        host.resetHistory?.();
        savedFingerprint=fingerprint(capture());durableFingerprint=savedFingerprint;initialFingerprint=savedFingerprint;
        try{store.setActive(next.id);}catch(e){}refresh();storedStatus(capture());host.created?.(record);return true;
      }catch(error){status(`Could not save a copy: ${error.message}. Export draft to keep your work.`,true);return false;}
    }
    function exportAll(selectedIds=null) {
      cancelDeletion();
      try {
        const data=store.list(),allEntries=store.snapshot(),current=selectedIds?null:capture();
        if(selectedIds){const ids=new Set(selectedIds);data.tracks=data.tracks.filter(t=>ids.has(t.id));data.recoveries=[];data.unreadable=0;if(!data.tracks.length)throw Error('Select at least one saved track.');}
        const entries=selectedIds?allEntries.filter(e=>data.tracks.some(t=>e.key===TRACK+t.id)):allEntries;
        const stored=data.tracks.find(track=>track.id===record?.id);
        const includeCurrent=!!current && (!stored || fingerprint(current)!==fingerprint({document:stored.document,nameDraft:stored.nameDraft}));
        const lines=['TRACKSHIFT — LOCAL TRACK BACKUP',
          'This file contains saved tracks from this browser and address, plus any recovery drafts and unsaved working copy.',
          'To restore a track: create a new track, copy the text between PLAYABLE TRACK CODE and END PLAYABLE TRACK CODE into the editor, select Generate track, then enter its name and select Save now.',
          'Use the main menu Import tracks button to restore this backup as copies. Unfinished drafts may need editing before generation.',
          'The raw backup data at the end preserves exact stored records, options and draft text for future recovery.',
          `Saved tracks: ${data.tracks.length} | Recovery drafts: ${data.recoveries.length} | Additional unreadable records: ${data.unreadable}`,''];
        let formattingFailures=0;
        function add(title,doc,nameDraft){
          lines.push('============================================================',title);
          if(typeof nameDraft==='string' && nameDraft.trim() && !title.endsWith(nameDraft))lines.push(`Editor name: ${JSON.stringify(nameDraft)}`);
          try{lines.push('PLAYABLE TRACK CODE:',host.portableTrack(doc),'END PLAYABLE TRACK CODE');}
          catch(error){formattingFailures++;lines.push('STORED TRACK CODE (could not encode saved settings):',doc.code,'Saved settings: '+JSON.stringify(doc.options));}
          if(doc.draft!==doc.code)lines.push('UNFINISHED EDITOR DRAFT — may not be valid TS2:',doc.draft,'END OF DRAFT');
          lines.push('');
        }
        data.tracks.forEach((track,index)=>add(`TRACK ${index+1}: ${track.name.replace(/[\r\n]+/g,' ')}`,track.document,track.nameDraft));
        data.recoveries.forEach((recovery,index)=>add(`RECOVERY ${index+1}: ${recovery.name.replace(/[\r\n]+/g,' ')}`,recovery.document,recovery.nameDraft));
        if(includeCurrent)add(`CURRENT WORKING COPY: ${name(current.nameDraft).replace(/[\r\n]+/g,' ')}`,current.document,current.nameDraft);
        lines.push('============================================================','RAW BACKUP DATA — exact local records and current working state:',
          JSON.stringify({format:'TrackShift local library backup',version:1,entries,workingCopy:current?{trackId:record?.id??null,...current}:null},null,2),'');
        host.exportLibrary(lines.join('\n'),selectedIds?'trackshift-selected-tracks.txt':'trackshift-all-tracks.txt');
        const note=[data.recoveries.length?`${data.recoveries.length} recovery draft(s)`:null,includeCurrent?'current working copy':null,
          data.unreadable?`${data.unreadable} unreadable item(s) preserved as raw data`:null,
          formattingFailures?`${formattingFailures} track(s) kept as stored code and settings`:null].filter(Boolean);
        host.message(`Saved ${data.tracks.length} track(s)${note.length?' plus '+note.join(', '):''} in one text file.`);
      }catch(error){host.message(`Could not export all tracks: ${error.message}`,true);}
    }
    // Restore only recognised records, as independent copies; never replace a local track.
    function importBackup(text) {
      const marker='RAW BACKUP DATA \u2014 exact local records and current working state:';
      const created=[];
      try {
        if(text.length>25000000)throw Error('Backup file is too large.');
        const at=text.lastIndexOf(marker);if(at<0)throw Error('This is not a TUR library backup.');
        const backup=JSON.parse(text.slice(at+marker.length).trim());
        if(backup.format!=='TrackShift local library backup' || backup.version!==1 || !Array.isArray(backup.entries))throw Error('Unsupported backup format.');
        const candidates=[];let skipped=0;
        for(const entry of backup.entries) {
          if(typeof entry?.key!=='string' || typeof entry.value!=='string') {skipped++;continue;}
          if(!entry.key.startsWith(TRACK) && !entry.key.startsWith(RECOVERY))continue;
          try {
            const data=JSON.parse(entry.value);
            if(entry.key.startsWith(TRACK)) {
              const r=recordData(data,entry.key.slice(TRACK.length));
              candidates.push({name:r.name,nameDraft:r.nameDraft,document:r.document});
            }else {
              if(data.version!==1 || typeof data.id!=='string' || entry.key!==RECOVERY+data.id || !Number.isFinite(data.updatedAt))throw Error('Invalid recovery.');
              candidates.push({name:name(data.name)+' recovered',nameDraft:data.nameDraft,document:documentData(data.document)});
            }
          }catch(error){skipped++;}
        }
        if(backup.workingCopy) {
          try {
            const w=backup.workingCopy,doc=documentData(w.document);
            if(!candidates.some(c=>fingerprint(c.document)===fingerprint(doc) && String(c.nameDraft??c.name)===String(w.nameDraft)))
              candidates.push({name:name(w.nameDraft)+' working copy',nameDraft:w.nameDraft,document:doc});
          }catch(error){skipped++;}
        }
        if(!candidates.length)throw Error('No readable tracks were found in this backup.');
        for(const c of candidates) {
          const title=uniqueName(c.name);
          created.push(store.put({name:title,nameDraft:String(c.nameDraft??c.name).trim()===c.name.trim()?title:(c.nameDraft??title),document:c.document}));
        }
        refresh();host.message(`Imported ${created.length} track(s) as copies.${skipped?` ${skipped} unreadable item(s) left in the backup file.`:''}`);
        return {count:created.length,skipped};
      }catch(error){
        let remaining=0;for(const item of created){try{store.remove(item.id,item.revision);}catch(e){remaining++;}}
        refresh();host.message(`Could not import backup: ${error.message}.${remaining?` ${remaining} imported copy/copies remain; existing tracks were not replaced.`:''}`,true);
        return null;
      }
    }
    function recover(recoveryId) {
      cancelDeletion();if(!canLeave())return false;
      try {
        const r=store.list().recoveries.find(item=>item.id===recoveryId);if(!r)throw Error('That recovery draft is no longer available.');
        const title=uniqueName(`${r.name.slice(0,65)} recovered`);
        if(!activate({name:title,nameDraft:title,document:r.document}))return false;
        if(flush() && record){store.removeRecovery(recoveryId);if(session.get()===recoveryId)session.clear();}
        refresh();return true;
      }catch(error){status(`Could not recover draft: ${error.message}`,true);return false;}
    }
    function prepareDeletion(trackId) {
      if(record?.id===trackId){
        if(!flush())throw Error('The current track could not be saved. Export its draft before deleting.');
        if(conflict)throw Error('This track changed in another tab. Switch away and reopen it before deleting.');
        if(fingerprint(capture())!==savedFingerprint)throw Error('The current edits could not be saved to the track. Keep or export the recovery draft before deleting.');
      }
      const target=store.read(trackId);if(!target)throw Error('That saved track is no longer available.');
      if(record?.id===trackId && target.revision!==record.revision)throw Error('This track changed in another tab.');
      return {id:target.id,name:target.name,revision:target.revision,fingerprint:record?.id===trackId?fingerprint(capture()):null};
    }
    function deletePrepared(target,{leaveUnsavedIfLast=false}={}) {
      if(!target)throw Error('Choose a saved track first.');
      if(store.read(target.id)?.revision!==target.revision)throw Error('This track changed in another tab.');
      if(record?.id!==target.id){
        if(target.fingerprint!==null)throw Error('The current track changed. Select the track again before deleting.');
        store.remove(target.id,target.revision);refresh();host.deleted?.(target.id);return true;
      }
      if(target.fingerprint===null || fingerprint(capture())!==target.fingerprint)throw Error('The working track changed. Select it again before deleting.');
        const tracks=store.list().tracks.filter(t=>t.id!==target.id);
        const replacement=tracks[0]??{name:'Untitled track',nameDraft:'Untitled track',document:{code:NEW_CODE,draft:NEW_CODE,options:defaults,selection:0}};
        // Stage the replacement preview before removing any saved data.
        loading=true;let loaded;try{loaded=host.load(replacement.document,true);}finally{loading=false;}
        if(!loaded)throw Error('Could not prepare the replacement track; nothing was deleted.');
        try{store.remove(target.id,target.revision);}catch(error){loading=true;try{host.load(record.document,true);}finally{loading=false;}throw error;}
        clearJournal();
        // Other tabs' recovery drafts remain available even after their source is deleted.
        record=replacement.id?replacement:null;conflict=false;journalId=token();$('trackName').value=replacement.nameDraft??replacement.name;
        savedFingerprint=record?fingerprint(capture()):'';durableFingerprint=savedFingerprint;initialFingerprint=fingerprint(capture());
        if(record){try{store.setActive(record.id);}catch(error){}storedStatus(capture());}
        else if(leaveUnsavedIfLast){leaveBlankUnsaved=true;try{store.setActive('');}catch(error){}status('Unsaved working track.');}
        else flush();
        refresh();host.deleted?.(target.id);host.activated?.(record);return true;
    }
    function requestDeletion() {
      if(!record)return;
      try{pendingDelete=prepareDeletion(record.id);$('deleteTrackText').textContent=`Delete “${record.name}” and its unfinished edits from this browser? Text exports are kept.`;
        $('deleteTrackPrompt').hidden=false;$('cancelDeleteTrack').focus?.();}
      catch(error){status(`Could not delete track: ${error.message}`,true);}
    }
    function confirmDeletion() {
      const target=pendingDelete;cancelDeletion();
      if(!target || record?.id!==target.id || fingerprint(capture())!==target.fingerprint)return;
      try{deletePrepared(target);}catch(error){status(`Could not delete track: ${error.message}`,true);refresh();}
    }
    $('trackName').value='Default sample track';initialFingerprint=fingerprint(capture());
    $('savedTracks').addEventListener('change',()=>open($('savedTracks').value));
    $('code').addEventListener('input',changed);$('trackName').addEventListener('input',changed);
    $('newTrack').addEventListener('click',()=>newDocument());$('saveTrack').addEventListener('click',()=>{cancelDeletion();flush(true);});
    $('copyTrack').addEventListener('click',copy);$('exportDraft').addEventListener('click',()=>host.exportDraft($('code').value,$('trackName').value));
    $('exportAllTracks').addEventListener('click',()=>exportAll());
    $('deleteTrack').addEventListener('click',requestDeletion);$('confirmDeleteTrack').addEventListener('click',confirmDeletion);
    $('cancelDeleteTrack').addEventListener('click',cancelDeletion);$('recoverTrack').addEventListener('click',()=>recover($('recoveryTracks').value));
    window.addEventListener('keydown',event=>{if(event.key==='Escape')cancelDeletion();});
    window.addEventListener('pagehide',()=>flush());
    window.addEventListener('beforeunload',event=>{
      if(!flush() && fingerprint(capture())!==initialFingerprint && fingerprint(capture())!==durableFingerprint){event.preventDefault();event.returnValue='';}
    });
    document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
    window.addEventListener('storage',event=>{
      if(event.key===null || event.key===TRACK+record?.id) {
        try{if(record && store.read(record.id)?.revision!==record.revision){conflict=true;cancelDeletion();
          status('This track changed in another tab. Save a copy to keep your work.',true);changed();}}
        catch(error){status(`Could not read local tracks: ${error.message}`,true);}
      }
      if(event.key===null || event.key?.startsWith(TRACK) || event.key?.startsWith(RECOVERY))refresh();
    });
    // A failed save in this tab is recovered as a new track, never over its original.
    const data=refresh(),ownRecovery=data.recoveries.find(r=>r.id===session.get());
    let restored=false;
    if(ownRecovery) {
      try {
        const title=uniqueName(`${ownRecovery.name.slice(0,65)} recovered`);
        restored=activate({name:title,nameDraft:title,document:ownRecovery.document});
        if(restored && flush() && record){store.removeRecovery(ownRecovery.id);session.clear();}
      }catch(error){status(`Recovery draft kept: ${error.message}`,true);}
    }
    if(!restored) {
      let active;try{active=store.active();}catch(error){}
      const previous=data.tracks.find(t=>t.id===active)??data.tracks[0];
      if(previous)restored=activate(previous);
      // If a saved preview fails to rebuild, preserve every record and recovery.
      if(previous && !restored)status('Saved preview could not be opened. Your local tracks are kept; choose another track or export the current text.',true);
      else if(!previous)flush();
    }
    if(data.unreadable)host.message(`${data.unreadable} unreadable local item(s) were left untouched. Valid tracks are still available.`,true);
    refresh();
    return {changed,flush,open,newDocument,copy,recover,exportAll,importBackup,prepareDeletion,deletePrepared,cancelPendingDeletion:cancelDeletion,
      get activeId(){return record?.id??null;},get store(){return store;}};
  }
  window.TrackLibrary={createStore,create,options,documentData,NEW_CODE,keys:{TRACK,RECOVERY,ACTIVE,SESSION}};
})();
