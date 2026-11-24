/* Local championship progress and personal records. Pack snapshots are never edited. */
(function(){
  'use strict';
  const KEY='trackshift.championship.v1',POINTS=[10,8,6,5,4,3,2,1];
  const validTime=value=>Number.isFinite(value) && value>=0;
  function options(value){
    if(!value || !Number.isInteger(value.opponents) || value.opponents<1 || value.opponents>7 || !['easy','normal','hard'].includes(value.difficulty) || ![1,3,5].includes(value.laps) || !['normal','reverse','random'].includes(value.direction))throw Error('Invalid championship race settings.');
    const lighting=value.lighting??'default',environment=value.environment??'default';
    if(!['default','day','night','random'].includes(lighting) || !['default','random',...window.TS2.ENVIRONMENTS].includes(environment))throw Error('Invalid championship appearance settings.');
    return {opponents:value.opponents,difficulty:value.difficulty,laps:value.laps,direction:value.direction,lighting,environment};
  }
  function racePlan(pack,settings,random=Math.random){
    const pick=choices=>choices[Math.floor(random()*choices.length)];
    return pack.tracks.map(track=>({
      direction:settings.direction==='random'?pick(['normal','reverse']):settings.direction,
      lighting:settings.lighting==='random'?(random()<.25?'night':'day'):settings.lighting==='default'?'day':settings.lighting,
      environment:settings.environment==='random'?pick(window.TS2.ENVIRONMENTS):settings.environment==='default'?window.TS2.parse(track.code).settings.environment:settings.environment
    }));
  }
  function validatePlan(value,pack,settings){
    // Championships saved before race plans existed always used fixed day,
    // Grasslands and a fixed direction. Keep them readable without rerolling.
    if(value===undefined){
      if(settings.direction==='random'||settings.lighting==='random'||settings.environment==='random')throw Error('Random championship race choices are missing.');
      return racePlan(pack,settings);
    }
    if(!Array.isArray(value)||value.length!==pack.tracks.length)throw Error('Invalid championship race plan.');
    return value.map(item=>{if(!item || !['normal','reverse'].includes(item.direction) || !['day','night'].includes(item.lighting) || !window.TS2.ENVIRONMENTS.includes(item.environment))throw Error('Invalid championship race choice.');return {direction:item.direction,lighting:item.lighting,environment:item.environment};});
  }
  function result(value,field){
    if(!value || !['lap','sprint'].includes(value.mode) || !Array.isArray(value.finishers) || value.finishers.length!==field || !Array.isArray(value.laps) || value.laps.some(t=>!validTime(t)))throw Error('Invalid championship result.');
    const names=new Set();let players=0;
    const finishers=value.finishers.map(item=>{
      if(!item || typeof item.name!=='string' || !item.name || names.has(item.name) || !Number.isInteger(item.rank) || item.rank<1 || item.rank>field || !validTime(item.time))throw Error('Invalid championship finisher.');
      names.add(item.name);if(item.player)players++;
      return {name:item.name,rank:item.rank,time:item.time,player:!!item.player};
    });
    if(players!==1 || !finishers.some(item=>item.player && item.name==='You'))throw Error('Championship result has no player.');
    return {mode:value.mode,finishers,laps:value.laps.slice()};
  }
  function standings(active){
    if(!active)return [];
    const rows=new Map();
    for(const race of active.results)for(const item of race.finishers){
      if(!rows.has(item.name))rows.set(item.name,{name:item.name,player:item.player,points:0,wins:0,time:0});
      const row=rows.get(item.name);row.points+=POINTS[item.rank-1]??0;row.wins+=Number(item.rank===1);row.time+=item.time;
    }
    return [...rows.values()].sort((a,b)=>b.points-a.points || b.wins-a.wins || a.time-b.time || a.name.localeCompare(b.name));
  }
  function bestKey(track,settings,mode){return JSON.stringify([track.code,track.options,mode,mode==='lap'?settings.laps:1,settings.direction]);}
  function createStore(storage,config={}){
    const random=config.random??Math.random;
    function available(){if(!storage)throw Error('Browser storage is unavailable. Championship progress cannot be saved.');return storage;}
    function validate(raw){
      if(!raw || raw.version!==1 || !Array.isArray(raw.bests))throw Error('Championship save is not recognised.');
      const bests=raw.bests.map(b=>{if(!b || typeof b.key!=='string' || !validTime(b.race) || !(b.lap===null || validTime(b.lap)))throw Error('Invalid personal-best record.');return {key:b.key,race:b.race,lap:b.lap};});
      if(raw.active===null)return {version:1,active:null,bests};
      const a=raw.active;if(!a || !Array.isArray(a.results))throw Error('Invalid championship progress.');
      const pack=window.TrackPacks.validate(a.pack),settings=options(a.settings);
      if(a.results.length>pack.tracks.length)throw Error('Too many championship results.');
      const results=a.results.map(r=>result(r,settings.opponents+1)),races=validatePlan(a.races,pack,settings);
      return {version:1,active:{pack,settings,results,races},bests};
    }
    function read(){const raw=available().getItem(KEY);if(raw===null)return {version:1,active:null,bests:[]};try{return validate(JSON.parse(raw));}catch(error){throw Error('Could not read championship progress: '+error.message);}}
    function write(state){const text=JSON.stringify(state);available().setItem(KEY,text);return JSON.parse(text);}
    function start(state,pack,settings){
      if(state.active && state.active.results.length<state.active.pack.tracks.length)throw Error('Continue or discard the current championship first.');
      const snapshot=window.TrackPacks.validate(pack),resolved=options(settings),active={pack:snapshot,settings:resolved,results:[],races:racePlan(snapshot,resolved,random)};return write({...state,active});
    }
    function finish(state,entry){
      const active=state.active,index=active?.results.length;
      if(!active || index>=active.pack.tracks.length)throw Error('There is no unfinished championship race.');
      const race=result(entry,active.settings.opponents+1),player=race.finishers.find(item=>item.player),key=bestKey(active.pack.tracks[index],{...active.settings,direction:active.races[index].direction},race.mode);
      const lap=race.mode==='lap' && race.laps.length?Math.min(...race.laps):null,previous=state.bests.find(item=>item.key===key);
      const best={key,race:previous?Math.min(previous.race,player.time):player.time,lap:lap===null?(previous?.lap??null):previous?.lap==null?lap:Math.min(previous.lap,lap)};
      return write({version:1,active:{...active,results:[...active.results,race]},bests:[...state.bests.filter(item=>item.key!==key),best]});
    }
    function discard(state){return write({...state,active:null});}
    return {read,start,finish,discard};
  }
  window.TrackChampionship={createStore,standings,bestKey,POINTS};
})();
