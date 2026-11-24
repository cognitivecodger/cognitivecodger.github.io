/* Versioned, self-contained track collections; imported data is never executed. */
(function(){
  'use strict';
  const PREFIX='trackshift.pack.v1.',MAX_TEXT=2000000,MAX_TRACKS=100,MAX_CODE=100000;
  const id=()=>window.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function newUUID(){
    const crypto=window.crypto;if(crypto?.randomUUID)return crypto.randomUUID().toLowerCase();
    if(!crypto?.getRandomValues)throw Error('Secure random numbers are unavailable; a pack UUID cannot be created.');
    const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function title(value,label){if(typeof value!=='string'||!value.trim()||value.trim().length>80)throw Error(`${label} must be 1-80 characters.`);return value.trim();}
  function validate(value,allowEmpty=false){
    if(!value||value.format!=='TrackShift Pack'||value.version!==1)throw Error('Unsupported track pack format or version.');
    if(typeof value.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(value.id))throw Error('Invalid pack identifier.');
    const name=title(value.name,'Pack name');
    if(!Array.isArray(value.tracks)||value.tracks.length>MAX_TRACKS||(!allowEmpty&&!value.tracks.length))throw Error(`A pack must contain 1-${MAX_TRACKS} tracks.`);
    const tracks=value.tracks.map((entry,index)=>{
      if(!entry||typeof entry.code!=='string'||entry.code.length>MAX_CODE)throw Error(`Invalid track ${index+1}.`);
      const options=window.TrackLibrary.options(entry.options??{}),name=title(entry.name,`Track ${index+1} name`);
      try{window.TS2.build(entry.code,options);}catch(error){throw Error(`Track ${index+1} (${name}): ${error.message}`);}
      // Optional stable IDs keep an editor working copy attached to the same
      // pack entry when tracks are reordered. Older packs need no migration.
      const track={name,code:entry.code,options};
      if(typeof entry.trackId==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(entry.trackId))track.trackId=entry.trackId;
      return track;
    });
    return {format:'TrackShift Pack',version:1,id:value.id,name,tracks};
  }
  function parse(text){
    if(typeof text!=='string'||text.length>MAX_TEXT)throw Error('Pack file is too large (maximum 2 MB of text).');
    let raw;try{raw=JSON.parse(text);}catch(e){throw Error('This is not a valid track pack JSON file.');}
    const pack=validate(raw);if(!UUID.test(pack.id))throw Error('Pack ID must be a valid UUID. This file was not imported.');pack.id=pack.id.toLowerCase();return pack;
  }
  function createStore(storage){
    function get(){if(!storage)throw Error('Local storage is unavailable.');return storage;}
    function read(key){const raw=get().getItem(PREFIX+key);if(raw===null)return null;const result=validate(JSON.parse(raw),true);if(result.id!==key)throw Error('Pack identifier does not match its storage key.');return result;}
    function list(){const out=[],s=get();for(let i=0;i<s.length;i++){const key=s.key(i);if(key?.startsWith(PREFIX)){try{const p=read(key.slice(PREFIX.length));if(p)out.push(p);}catch(e){/* Keep unrecognised records untouched. */}}}return out.sort((a,b)=>a.name.localeCompare(b.name));}
    function put(value){const pack=validate(value,true);get().setItem(PREFIX+pack.id,JSON.stringify(pack));return pack;}
    function hasId(id){const s=get(),needle=id.toLowerCase();for(let i=0;i<s.length;i++){const key=s.key(i);if(key?.startsWith(PREFIX) && key.slice(PREFIX.length).toLowerCase()===needle)return true;}
      return (window.TRACKSHIFT_OFFICIAL_PACKS??[]).some(pack=>typeof pack.id==='string' && pack.id.toLowerCase()===needle);}
    function freshId(){for(let i=0;i<10;i++){const next=newUUID();if(!hasId(next))return next;}throw Error('Could not generate a unique pack UUID.');}
    function create(name){return put({format:'TrackShift Pack',version:1,id:freshId(),name,tracks:[]});}
    function copy(pack,name){const original=validate(pack,true);return put({...original,id:freshId(),name:name??original.name});}
    function importText(text){const value=parse(text);if(hasId(value.id))throw Error('This pack ID is already in the game. The existing pack was not changed.');return put(value);}
    function remove(key){get().removeItem(PREFIX+key);}
    return {read,list,put,create,copy,importText,remove};
  }
  let officialSource=null,officialCache=[];
  function official(){
    const source=window.TRACKSHIFT_OFFICIAL_PACKS??[];
    if(source!==officialSource || source.length!==officialCache.length){officialCache=source.map(value=>{const pack=validate(value);if(!UUID.test(pack.id))throw Error('An official pack has an invalid UUID.');return pack;});officialSource=source;}
    // Callers may edit a copy; the read-only built-in catalogue stays intact.
    return officialCache.map(pack=>({...pack,tracks:pack.tracks.map(track=>({...track,options:{...track.options}}))}));
  }
  // A web server cannot enumerate its directories, so the publisher lists
  // the exact pack filenames. JSON stays data and is validated like imports.
  async function loadOfficialManifest(options={}){
    const fetcher=options.fetcher??window.fetch?.bind(window),directory=options.directory??'data/TrackPacks',errors=[];
    if(!fetcher)return {loaded:false,errors:['This browser cannot load the pack manifest.']};
    async function read(url){const response=await fetcher(url,{cache:'no-cache'});if(!response.ok)throw Error(`HTTP ${response.status}`);return response.text();}
    let text;try{text=await read(directory+'/Default%20Packs.txt');}catch(error){return {loaded:false,errors:[`Could not load Default Packs.txt: ${error.message}`]};}
    if(text.length>64000)return {loaded:false,errors:['Default Packs.txt is too large.']};
    const names=[],seenNames=new Set();
    for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
      const name=line.trim();if(!name || name.startsWith('#'))continue;
      if(!/^[^\\/:*?"<>|%#\x00-\x1f]+\.tsp\.txt$/i.test(name) || name.includes('..')){errors.push(`Invalid pack filename: ${name}`);continue;}
      const key=name.toLowerCase();if(seenNames.has(key)){errors.push(`Repeated pack filename: ${name}`);continue;}seenNames.add(key);names.push(name);
    }
    if(names.length>100)return {loaded:false,errors:['Default Packs.txt lists more than 100 files.']};
    const results=await Promise.all(names.map(async name=>{try{return {name,pack:parse(await read(directory+'/'+encodeURIComponent(name)))};}catch(error){return {name,error:error.message};}}));
    const packs=[],seenIds=new Set();for(const result of results){
      if(result.error){errors.push(`${result.name}: ${result.error}`);continue;}
      const key=result.pack.id.toLowerCase();if(seenIds.has(key)){errors.push(`${result.name}: duplicate pack ID ${result.pack.id}.`);continue;}
      seenIds.add(key);packs.push(result.pack);
    }
    // Keep the fallback if the list contains only failed entries. A genuinely
    // empty manifest is intentional and can disable all built-in packs.
    if(!packs.length && errors.length)return {loaded:false,errors};
    window.TRACKSHIFT_OFFICIAL_PACKS=packs;return {loaded:true,count:packs.length,errors};
  }
  function stringify(pack){const value=validate(pack);if(!UUID.test(value.id))throw Error('This older pack needs a UUID. Use Copy pack with new ID, then export the copy.');const text=JSON.stringify(value,null,2)+'\n';if(text.length>MAX_TEXT)throw Error('Pack is too large to export (maximum 2 million characters).');return text;}
  window.TrackPacks={createStore,official,parse,stringify,validate,loadOfficialManifest,newTrackId:id,PREFIX};
})();
