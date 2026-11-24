/* Connect editor working copies to individual entries in local TrackShift Packs. */
(function(){
  'use strict';
  const PREFIX='trackshift.packlink.v1.';
  function signature(track){
    // A compact comparison token avoids storing another complete track code in
    // localStorage. Two independent 32-bit hashes plus length detect changes.
    const text=JSON.stringify([track.name,track.code,window.TrackLibrary.options(track.options)]);
    let a=2166136261,b=2246822519;
    for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,3266489917);}
    return `${text.length}:${a>>>0}:${b>>>0}`;
  }
  function create(host){
    const $=id=>document.getElementById(id),{library,packStore}=host;
    let busy=false,selectedSource='mine',selectedTrack='';
    const option=(value,label)=>{const el=document.createElement('option');el.value=value;el.textContent=label;return el;};
    const status=(message,error=false)=>{const el=$('builderPackStatus');el.textContent=message;el.classList.toggle('error',error);};
    function storage(){if(!host.storage)throw Error('Browser storage is unavailable.');return host.storage;}
    function readLink(id){
      if(!id)return null;const raw=storage().getItem(PREFIX+id);if(raw===null)return null;
      const link=JSON.parse(raw);
      if(link?.version!==1 || typeof link.packId!=='string' || typeof link.trackId!=='string' || typeof link.base!=='string' || typeof link.workingName!=='string')throw Error('The working-copy link is not recognised.');
      return link;
    }
    function writeLink(id,link){storage().setItem(PREFIX+id,JSON.stringify(link));}
    function ensureIds(pack){
      let changed=false;const seen=new Set();
      for(const track of pack.tracks){
        if(!track.trackId || seen.has(track.trackId)){
          do{track.trackId=window.TrackPacks.newTrackId();}while(seen.has(track.trackId));changed=true;
        }
        seen.add(track.trackId);
      }
      return changed?packStore.put(pack):pack;
    }
    function linkFor(packId,trackId,targetSignature){
      const s=storage(),keys=[];for(let i=0;i<s.length;i++){const key=s.key(i);if(key?.startsWith(PREFIX))keys.push(key);}
      let fallback=null;
      for(const key of keys)try{
        const id=key.slice(PREFIX.length),link=readLink(id);
        if(link?.packId===packId && link.trackId===trackId && library.store.read(id)){
          if(link.base===targetSignature)return id;
          fallback??=id;
        }
      }catch(error){/* Leave unreadable links and tracks untouched. */}
      return fallback;
    }
    function packFor(value){const [source,id]=String(value||'').split(':');return source==='local'?packStore.read(id):source==='official'?host.officialPacks().find(pack=>pack.id===id):null;}
    function trackList(pack,source,preferred=''){
      const choices=pack?.tracks??[],select=$('builderPackTrack');
      select.replaceChildren(...choices.map((track,index)=>option(source==='local'?track.trackId:String(index),`${index+1}. ${track.name}`)));
      const values=choices.map((track,index)=>source==='local'?track.trackId:String(index));
      select.value=values.includes(preferred)?preferred:(values[0]??'');selectedTrack=select.value;
      select.disabled=!choices.length;
    }
    function linkedMessage(record,link,pack){
      const entry=pack?.tracks.find(track=>track.trackId===link.trackId),name=entry?.name??'removed track';
      const copy=record.name!==name?` Working copy: ${record.name}.`:'';
      return `Editing “${name}” in “${pack?.name??'missing pack'}”.${copy} Generated changes save to the pack; unfinished text stays in My tracks.`;
    }
    function showSelection(value,preferred=''){
      const [source]=value.split(':'),isPack=source==='local'||source==='official',pack=isPack?packFor(value):null;
      $('builderLibraryLabel').hidden=isPack;$('builderPackTrackLabel').hidden=!isPack;$('builderCopyOfficial').hidden=source!=='official';
      $('builderReloadPack').hidden=true;
      if(isPack)trackList(pack,source,preferred);
      if(source==='official')status('Official packs are read-only; the current track is unchanged. Make an editable copy to open or add tracks.');
      else if(source==='local' && !pack?.tracks.length)status('This pack is empty. Choose New to create its first track; the current track and its existing link are unchanged.');
      else {
        const link=readLink(library.activeId);
        if(link){const linkedPack=packStore.read(link.packId),record=library.store.read(library.activeId);if(record)status(linkedMessage(record,link,linkedPack));}
        else status(source==='local'?'Choose a track in this pack, or choose New to add one.':'New tracks are saved in My tracks. Choose a pack to edit its tracks.');
      }
      return pack;
    }
    function refresh(preferred){
      try{
        const select=$('builderPack'),old=preferred??select.value??selectedSource,items=[option('mine','My tracks')];
        for(const pack of host.localPacks())items.push(option('local:'+pack.id,'My pack · '+pack.name));
        for(const pack of host.officialPacks())items.push(option('official:'+pack.id,'Official · '+pack.name));
        select.replaceChildren(...items);select.value=items.some(item=>item.value===old)?old:'mine';selectedSource=select.value;
        let preferredTrack=selectedTrack;const link=readLink(library.activeId);
        if(link && selectedSource==='local:'+link.packId)preferredTrack=link.trackId;
        if(selectedSource.startsWith('local:')){const p=packFor(selectedSource);if(p)ensureIds(p);}
        showSelection(selectedSource,preferredTrack);
        if(link && !selectedSource.startsWith('official:')){const record=library.store.read(library.activeId);if(record)saved(record);}
      }catch(error){status('Could not load packs: '+error.message,true);}
    }
    function saved(record){
      const link=readLink(record.id);if(!link)return null;
      try{
        const pack=packStore.read(link.packId);if(!pack)throw Error('The linked pack no longer exists.');
        const index=pack.tracks.findIndex(track=>track.trackId===link.trackId);if(index<0)throw Error('This track was removed from the linked pack.');
        const current=pack.tracks[index],next={...current,name:record.name===link.workingName?current.name:record.name,code:record.document.code,options:record.document.options};
        const currentSignature=signature(current),nextSignature=signature(next);
        if(currentSignature!==link.base && currentSignature!==nextSignature)throw Error('The pack track changed elsewhere. Your working copy was kept; open the latest pack version to make a new working copy.');
        if(currentSignature!==nextSignature){pack.tracks[index]=next;packStore.put(pack);}
        if(link.base!==nextSignature || link.workingName!==record.name){link.base=nextSignature;link.workingName=record.name;writeLink(record.id,link);}
        if($('builderPack').value==='local:'+pack.id)trackList(pack,'local',link.trackId);
        $('builderReloadPack').hidden=true;
        status(linkedMessage(record,link,pack));
        const rename=typeof record.nameDraft==='string' && record.nameDraft.trim()!==record.name?' Press Save now to apply the name.':'';
        return {message:(record.document.draft!==record.document.code?'Draft saved in My tracks; the pack keeps the last generated version.':'Saved in My tracks and in “'+pack.name+'”.')+rename};
      }catch(error){
        const message='Saved in My tracks; pack not updated: '+error.message;
        $('builderReloadPack').hidden=!(/changed elsewhere/.test(error.message) && selectedSource==='local:'+link.packId);
        status(message,true);return {message,error:true};
      }
    }
    function created(record){
      if(busy || !selectedSource.startsWith('local:'))return;
      let added=false;
      try{
        let pack=packFor(selectedSource);if(!pack)throw Error('The selected pack no longer exists.');pack=ensureIds(pack);
        if(pack.tracks.length>=100)throw Error('The pack already has 100 tracks.');
        let trackId;do{trackId=window.TrackPacks.newTrackId();}while(pack.tracks.some(item=>item.trackId===trackId));
        const track={trackId,name:record.name,code:record.document.code,options:record.document.options};
        pack.tracks.push(track);pack=packStore.put(pack);added=true;
        writeLink(record.id,{version:1,packId:pack.id,trackId:track.trackId,base:signature(track),workingName:record.name});
        trackList(pack,'local',track.trackId);status(linkedMessage(record,{trackId:track.trackId},pack));
      }catch(error){
        selectedSource='mine';$('builderPack').value='mine';$('builderLibraryLabel').hidden=false;$('builderPackTrackLabel').hidden=true;$('builderCopyOfficial').hidden=true;$('builderReloadPack').hidden=true;
        status(`The track is safe in My tracks${added?' and was added to the pack':' but was not added to the pack'}. It is not linked, so further edits will not update the pack. ${error.message}`,true);
      }
    }
    function openSelected(){
      if(!selectedSource.startsWith('local:'))return false;
      let pack,track,opened=false;const previous=selectedTrack;
      try{
        pack=ensureIds(packFor(selectedSource));track=pack.tracks.find(item=>item.trackId===$('builderPackTrack').value);
        if(!track)throw Error('Choose a track in this pack.');
        busy=true;
        const existing=linkFor(pack.id,track.trackId,signature(track));
        if(existing){if(!library.open(existing)){$('builderPackTrack').value=previous;return false;}opened=true;}
        else {
          if(!library.newDocument(track.code,track.name,track.options)){$('builderPackTrack').value=previous;return false;}
          opened=true;
          const id=library.activeId,record=library.store.read(id);if(!record)throw Error('Could not save the working copy.');
          writeLink(id,{version:1,packId:pack.id,trackId:track.trackId,base:signature(track),workingName:record.name});
        }
        selectedTrack=track.trackId;
        const record=library.store.read(library.activeId),result=saved(record);if(result?.error)status(result.message,true);
        return true;
      }catch(error){
        if(opened){
          selectedSource='mine';$('builderPack').value='mine';$('builderLibraryLabel').hidden=false;$('builderPackTrackLabel').hidden=true;$('builderCopyOfficial').hidden=true;$('builderReloadPack').hidden=true;
          status('The working copy opened in My tracks, but its pack link could not be confirmed. Further edits may not update the pack. '+error.message,true);return true;
        }
        $('builderPackTrack').value=previous;status('Could not open the pack track: '+error.message,true);return false;
      }
      finally{busy=false;}
    }
    // Select a source without automatically opening its first entry. This is
    // also used when the menu creates a new track in an empty local pack.
    function selectContext(value){
      const previous=selectedSource,previousTrack=selectedTrack;
      if(!library.flush())return false;
      try{
        if(value!=='mine' && !value.startsWith('local:'))throw Error('Choose an editable track source.');
        let pack=value==='mine'?null:packFor(value);
        if(value!=='mine' && !pack)throw Error('The selected pack no longer exists.');
        if(pack)pack=ensureIds(pack);
        refresh(value);selectedSource=value;$('builderPack').value=value;showSelection(value);
        return true;
      }catch(error){selectedSource=previous;refresh(previous);showSelection(previous,previousTrack);status('Could not select track source: '+error.message,true);return false;}
    }
    function openPackEntry(packId,index){
      const previous=selectedSource,previousTrack=selectedTrack;
      if(!selectContext('local:'+packId))return false;
      try{
        const pack=packFor(selectedSource),track=pack?.tracks[index];if(!track)throw Error('Choose a track in this pack.');
        $('builderPackTrack').value=track.trackId;
        if(openSelected())return true;
        const reason=$('builderPackStatus').textContent;selectedSource=previous;refresh(previous);showSelection(previous,previousTrack);status(reason,true);return false;
      }catch(error){selectedSource=previous;refresh(previous);showSelection(previous,previousTrack);status('Could not open the pack track: '+error.message,true);return false;}
    }
    $('builderPack').addEventListener('change',()=>{
      const next=$('builderPack').value,previous=selectedSource,previousTrack=selectedTrack;
      if(!library.flush()){$('builderPack').value=previous;return;}
      try{
        selectedSource=next;let pack=packFor(next);if(next.startsWith('local:') && pack)pack=ensureIds(pack);
        showSelection(next);
        if(next.startsWith('local:') && pack?.tracks.length && !openSelected()){const message=$('builderPackStatus').textContent;$('builderPack').value=previous;selectedSource=previous;showSelection(previous,previousTrack);status(message,true);}
      }catch(error){$('builderPack').value=previous;selectedSource=previous;status('Could not select pack: '+error.message,true);}
    });
    $('builderPackTrack').addEventListener('change',()=>{if(selectedSource.startsWith('local:'))openSelected();});
    $('builderCopyOfficial').addEventListener('click',()=>{
      try{
        const original=packFor(selectedSource);if(!original)throw Error('The official pack is unavailable.');const index=Number($('builderPackTrack').value)||0;
        const name=(original.name.slice(0,64)+' editable copy').slice(0,80);let copy=ensureIds(packStore.copy(original,name));
        refresh('local:'+copy.id);$('builderPackTrack').value=copy.tracks[index]?.trackId??copy.tracks[0]?.trackId??'';
        if(copy.tracks.length && !openSelected())return;
        status(`Created editable pack “${copy.name}”. Changes will not alter the official pack.`);
      }catch(error){status('Could not copy the official pack: '+error.message,true);}
    });
    $('builderReloadPack').addEventListener('click',()=>{
      let oldId,oldLink,opened=false;
      try{
        oldId=library.activeId;oldLink=readLink(oldId);
        if(!oldLink || selectedSource!=='local:'+oldLink.packId)throw Error('Select the linked pack first.');
        const pack=packStore.read(oldLink.packId),track=pack?.tracks.find(item=>item.trackId===oldLink.trackId);
        if(!track)throw Error('The track is no longer in this pack.');
        busy=true;if(!library.newDocument(track.code,track.name,track.options))return;opened=true;
        const record=library.store.read(library.activeId);if(!record)throw Error('Could not save the new working copy.');
        writeLink(record.id,{version:1,packId:pack.id,trackId:track.trackId,base:signature(track),workingName:record.name});
        try{storage().removeItem(PREFIX+oldId);}catch(error){/* The old copy remains safe; matching links are preferred. */}
        trackList(pack,'local',track.trackId);$('builderReloadPack').hidden=true;
        status(`Opened the latest version of “${track.name}”. Your previous working copy remains in My tracks.`);
      }catch(error){
        if(opened){selectedSource='mine';$('builderPack').value='mine';$('builderLibraryLabel').hidden=false;$('builderPackTrackLabel').hidden=true;$('builderCopyOfficial').hidden=true;$('builderReloadPack').hidden=true;
          status('The latest version opened in My tracks, but could not be linked to the pack. Further edits will not update it. '+error.message,true);}
        else status('Could not open the latest pack version: '+error.message,true);
      }
      finally{busy=false;}
    });
    function activated(record){if(busy || !record)return;try{const link=readLink(record.id);if(link){const pack=packStore.read(link.packId);status(linkedMessage(record,link,pack));}}catch(error){status('Could not read the pack link: '+error.message,true);}}
    function deleted(id){try{if(!readLink(id))return;storage().removeItem(PREFIX+id);status('The My tracks working copy was deleted; the pack entry was kept.');}catch(error){status('The working copy was deleted; the pack entry was kept.',true);}}
    let initialLink=null;
    try{initialLink=readLink(library.activeId);if(initialLink)selectedSource='local:'+initialLink.packId;}catch(error){/* The ordinary track library remains usable. */}
    refresh(selectedSource);
    return {refresh,saved,created,activated,deleted,selectContext,openPackEntry};
  }
  window.TrackBuilderPacks={create,PREFIX};
})();
