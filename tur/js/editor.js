/* TrackShift section editor. TS2 remains the saved document format. */
(function () {
  'use strict';
  const movement=p=>['FL','GL','DA','DH'].some(key=>Object.hasOwn(p,key));
  const token=params=>'('+Object.entries(params).map(([key,value])=>`${key}=${typeof value==='boolean'?(value?1:0):value}`).join(',')+')';
  const closeToken=params=>Object.keys(params).length?'AC'+token(params):'AC';
  function read(code) {
    const parsed=window.TS2.parse(code),parts=code.trim().split('|').map(p=>p.trim()).filter(Boolean),sections=[];
    let pending={},modifiers=[];
    parsed.instructions.slice(1).forEach((entry,i)=>{
      const at=i+3;
      if(!movement(entry)){pending={...pending,...entry};modifiers.push(at);return;}
      const params={...pending,...entry};
      if(params.FL===undefined && params.GL===undefined)params.FL=1;
      sections.push({at,modifiers,params});pending={};modifiers=[];
    });
    return {parts,sections,autoClose:parsed.autoClose,closeParams:{...parsed.closeParams},global:{...parsed.global},settings:{...parsed.settings},start:{...parsed.instructions[0]}};
  }
  // Express each half of a Hermite transition as its own Hermite transition.
  // Keeping endpoint tangents makes the geometry survive saving/reloading.
  function halfTransitions(start,end){
    const at=t=>{const h=t*t*(3-2*t),a=t*t*t-2*t*t+t,b=t*t*t-t*t;return h+a*start+b*end;};
    const derivative=t=>6*t-6*t*t+(3*t*t-4*t+1)*start+(3*t*t-2*t)*end;
    const mid=at(.5),slope=derivative(.5),first=Math.abs(mid)<1e-12?0:.5/mid,second=Math.abs(1-mid)<1e-12?0:.5/(1-mid);
    return {mid,first:[start*first,slope*first],second:[slope*second,end*second]};
  }
  function markerSplitFraction(piece){
    let previous=piece.poses[0],yaw=previous.yaw,angle=0,left=0,total=0;
    const segments=[];
    for(let i=1;i<piece.poses.length;i++){
      const p=piece.poses[i],distance=Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z);
      let progress;
      if(Math.abs(piece.angle)>1e-8){let delta=((p.yaw-yaw+540)%360)-180;if(piece.angle>0 && delta< -1e-8)delta+=360;if(piece.angle<0 && delta>1e-8)delta-=360;angle+=delta;progress=angle/piece.angle;}
      else {const heading=piece.start.yaw*Math.PI/180;progress=((p.x-piece.start.x)*Math.sin(heading)+(p.z-piece.start.z)*Math.cos(heading))/piece.length;}
      if(i===piece.poses.length-1)progress=1;
      segments.push({distance,progress});total+=distance;previous=p;yaw=p.yaw;
    }
    let last=0;
    for(const segment of segments){const fraction=segment.progress<=.5?1:last>=.5?0:(.5-last)/Math.max(1e-12,segment.progress-last);left+=segment.distance*Math.max(0,Math.min(1,fraction));last=segment.progress;}
    return total>1e-10?Math.max(1e-9,Math.min(1-1e-9,left/total)):.5;
  }
  function splitSection(section,piece,settings){
    const source=section.params,first={...source},second={...source},lengthKey=source.GL!==undefined?'GL':'FL';
    first[lengthKey]=source[lengthKey]/2;second[lengthKey]=source[lengthKey]/2;
    if(source.DA!==undefined){first.DA=source.DA/2;second.DA=source.DA/2;}
    const slopeStrength=source.SC??settings.slopeCurveStrength;
    const slope=halfTransitions(source.S0??(1-(source.SI??((source.SS??settings.slopeEaseStart)?slopeStrength:0))),source.S1??(1-(source.SO??((source.SE??settings.slopeEaseEnd)?slopeStrength:0))));
    const startHeight=piece.start.height,endHeight=piece.end.height,midHeight=startHeight+(endHeight-startHeight)*slope.mid;
    if(source.AH!==undefined){first.AH=midHeight;second.AH=endHeight;}
    else if(source.DH!==undefined){first.DH=midHeight-startHeight;second.DH=endHeight-midHeight;}
    if(Math.abs(endHeight-startHeight)>1e-10){[first.S0,first.S1]=slope.first;[second.S0,second.S1]=slope.second;}
    if(source.TW!==undefined){first.TW=(piece.start.width+piece.end.width)/2;second.TW=piece.end.width;}
    else if(source.DW!==undefined){first.DW=source.DW/2;second.DW=source.DW/2;}
    if(source.WA==='L' || source.WA==='R'){
      const origin=source.WI??0,sign=source.WA==='L'?1:-1;
      second.WI=origin+sign*(piece.end.width-piece.start.width)/4;
      if(Math.abs(second.WI)<1e-12)delete second.WI;
    }
    const ease=source.BS??settings.bankTransition,bank=halfTransitions(source.B0??(1-ease),source.B1??(1-ease));
    let bankChanges=false;
    for(const [key,attribute] of [['BL','bankLeft'],['BR','bankRight'],['BC','bankCurve'],['BF','bankFlat']])if(source[key]!==undefined){
      const start=piece.start[attribute]??(key==='BC'?settings.bankCurve:0),end=source[key];
      first[key]=start+(end-start)*bank.mid;second[key]=end;if(Math.abs(end-start)>1e-10)bankChanges=true;
    }
    if(bankChanges){[first.B0,first.B1]=bank.first;[second.B0,second.B1]=bank.second;}
    const corner=source.OC??settings.outerCorner;
    if(source.OA!==undefined || (corner>0 && Math.abs(piece.angle)>1e-8 && !piece.isGap)){
      const original=source.OA??piece.angle,from=source.O0??0,to=source.O1??1,mid=(from+to)/2;
      Object.assign(first,{OA:original,O0:from,O1:mid});Object.assign(second,{OA:original,O0:mid,O1:to});
    }
    const marker=window.TS2.raceMarker(source);
    if(marker){
      const boundary=markerSplitFraction(piece),position=source.RP??.5,left=position<=boundary;
      for(const key of ['SF','RS','RF','CP','RP'])delete (left?second:first)[key];
      (left?first:second).RP=left?position/boundary:(position-boundary)/(1-boundary);
    }else delete second.RP;
    return [first,second];
  }
  function change(code,index,action,changes={},runtime=null) {
    const doc=read(code),section=doc.sections[index];
    if(doc.autoClose && index===doc.sections.length && action==='update') {
      const params={...doc.closeParams};
      for(const [key,value] of Object.entries(changes)){
        if(!['ST','ES','SF','RS','RF','CP','RP','SR','FQ','WG','TBL','TBR','SCL','SCR','CG'].includes(key))throw Error(`Auto-close ${key} is calculated automatically.`);
        if(value===null || value==='')delete params[key];else params[key]=value;
      }
      doc.parts[doc.parts.length-1]=closeToken(params);const result=doc.parts.join('|');window.TS2.parse(result);return result;
    }
    if(!section && !['insert','insertBefore'].includes(action))throw Error('Select an authored section first.');
    const parts=[...doc.parts];
    if(action==='insert' || action==='insertBefore') {
      // Insert before the selected section's modifier block, so its pending
      // settings remain attached to the original section. Generated AC stays last.
      const at=section?(action==='insertBefore'?(section.modifiers[0]??section.at):section.at+1):doc.sections.at(-1).at+1;
      parts.splice(at,0,'(FL=1)');
    } else if(action==='duplicate') {
      const params={...section.params};for(const key of ['SF','RS','RF','CP','RP'])delete params[key];
      parts.splice(section.at+1,0,token(params));
    } else if(action==='split') {
      const current=runtime??window.TS2.build(code),piece=current.pieces[index];
      const [first,second]=splitSection(section,piece,current.settings);
      parts[section.at]=token(first);for(const at of section.modifiers)parts[at]=null;
      parts.splice(section.at+1,0,token(second));
    } else {
      if(action==='delete' && doc.sections.length===1)throw Error('Keep at least one authored section in the track.');
      if(!['delete','update'].includes(action))throw Error('Unknown section operation.');
      const params={...section.params};
      const changed=key=>Object.hasOwn(changes,key) && (changes[key]??undefined)!==(params[key]??undefined);
      if(['SC','SS','SE'].some(changed)){delete params.S0;delete params.S1;}
      if(changed('SI'))delete params.S0;
      if(changed('SO'))delete params.S1;
      if(changed('BS')){delete params.B0;delete params.B1;}
      if(changed('DA')){delete params.OA;delete params.O0;delete params.O1;}
      for(const [key,value] of Object.entries(changes)) {
        if(value===null || value==='')delete params[key];else params[key]=value;
      }
      if(params.GL!==undefined || Math.abs(params.DA??0)>1e-8)delete params.CG;
      parts[section.at]=action==='delete'?null:token(params);
      // Consume modifier-only tokens into this section, so clearing an override
      // really returns to its default and deleting a section cannot leak metadata.
      for(const at of section.modifiers)parts[at]=null;
    }
    const result=parts.filter(p=>p!==null).join('|');window.TS2.parse(result);return result;
  }
  function closing(code,on) {
    const doc=read(code),parts=doc.autoClose?doc.parts.slice(0,-1):[...doc.parts];
    if(on)parts.push(closeToken(doc.closeParams));return parts.join('|');
  }
  function multiChange(code,indices,staged,current=null) {
    const doc=read(code),runtime=current??window.TS2.build(code),chosen=[...new Set(indices)].sort((a,b)=>a-b);
    if(chosen.length<2 || chosen.some(i=>!Number.isInteger(i) || !doc.sections[i]))throw Error('Select at least two authored sections.');
    let result=code;
    for(const i of chosen){
      const source=doc.sections[i].params,changes={...staged};
      if(Object.hasOwn(staged,'_length') || Object.hasOwn(staged,'_kind')){
        const length=staged._length??source.FL??source.GL,kind=staged._kind??(source.GL!==undefined?'gap':'road');
        changes.FL=kind==='road'?length:null;changes.GL=kind==='gap'?length:null;
      }
      delete changes._length;delete changes._kind;
      if(Object.hasOwn(changes,'SF') || Object.hasOwn(changes,'RS') || Object.hasOwn(changes,'RF') || Object.hasOwn(changes,'CP')){
        if(['SF','RS','RF','CP'].some(key=>changes[key]))throw Error('Place race markers one section at a time; markers must be unique.');
      }
      if((source.GL!==undefined && changes.GL!==null || changes.GL!==undefined && changes.GL!==null) && ['SR','FQ','WG','TBL','TBR','SCL','SCR','CG'].some(key=>changes[key]!==undefined && changes[key]!==null && changes[key]!==false))throw Error('Road appearance and scenery cannot be applied to a gap.');
      result=change(result,i,'update',changes);
    }
    // Edge style and material normally persist. Restore the original value at
    // the next unselected section so a multi-edit stays local to its targets.
    for(const i of chosen){
      const next=i+1,closing=next===doc.sections.length && runtime.pieces[next]?.isClose;
      if(chosen.includes(next) || !doc.sections[next] && !closing)continue;
      const restore={},nextSource=closing?doc.closeParams:doc.sections[next].params;
      if(Object.hasOwn(staged,'ST') && nextSource.ST===undefined)restore.ST=window.TS2.pieceSurface(runtime.pieces[next]);
      if(Object.hasOwn(staged,'ES') && nextSource.ES===undefined)restore.ES=runtime.pieces[next].edgeSetting??'default';
      if(Object.keys(restore).length)result=change(result,next,'update',restore);
    }
    const built=window.TS2.build(result,runtime.settings);
    if(staged.CG)for(const i of chosen){const cover=window.TrackTerrain.coverStatus(built,i);if(!cover.ok)throw Error(`Section ${i+1}: ${cover.reason}`);}
    return result;
  }
  function combineSections(code,indices,current=null) {
    const doc=read(code),runtime=current??window.TS2.build(code),chosen=[...new Set(indices)].sort((a,b)=>a-b);
    if(chosen.length<2 || chosen.some((i,n)=>!Number.isInteger(i) || !doc.sections[i] || n>0 && i!==chosen[n-1]+1))throw Error('Choose two or more consecutive authored sections.');
    const pieces=chosen.map(i=>runtime.pieces[i]),markers=pieces.flatMap((piece,n)=>window.TS2.raceMarker(piece.source)?[{piece,n,kind:window.TS2.raceMarker(piece.source)}]:[]);
    if(markers.length>1)throw Error('These sections contain multiple race markers. Move or remove markers before combining.');
    const first=pieces[0],last=pieces.at(-1),params={...doc.sections[chosen[0]].params},key=first.isGap?'GL':'FL';
    delete params.FL;delete params.GL;params[key]=pieces.reduce((sum,p)=>sum+p.length,0)/(runtime.settings.trackUnitLength/runtime.settings.metresPerUnityUnit);
    params.DA=pieces.reduce((sum,p)=>sum+p.angle,0);delete params.AH;params.DH=last.end.height-first.start.height;
    for(const k of ['S0','S1','B0','B1','OA','O0','O1','WI','SF','RS','RF','CP','RP'])delete params[k];
    if(markers.length){const {piece,n,kind}=markers[0],distance=pieces.slice(0,n).reduce((sum,p)=>sum+p.length,0)+(piece.source.RP??.5)*piece.length;
      params[kind]=kind==='CP'?piece.source.CP:true;params.RP=distance/pieces.reduce((sum,p)=>sum+p.length,0);}
    const parts=[...doc.parts];parts[doc.sections[chosen[0]].at]=token(params);
    for(const i of chosen){const s=doc.sections[i];if(i!==chosen[0])parts[s.at]=null;for(const at of s.modifiers)parts[at]=null;}
    const result=parts.filter(part=>part!==null).join('|');window.TS2.build(result,runtime.settings);return result;
  }
  // Store physical distances instead of a track's TL/LH units, so templates
  // retain their length and height changes when inserted into another track.
  function captureTemplate(code,indices,current=null) {
    const doc=read(code),runtime=current??window.TS2.build(code),chosen=[...new Set(indices)].sort((a,b)=>a-b);
    if(chosen.length<2 || chosen.length>200 || chosen.some((i,n)=>!Number.isInteger(i) || !doc.sections[i] || n>0 && i!==chosen[n-1]+1))throw Error('Select 2 to 200 consecutive authored sections.');
    return chosen.map(i=>{
      const piece=runtime.pieces[i],s=runtime.settings,params={...doc.sections[i].params};
      for(const key of ['SF','RS','RF','CP','RP','AH','DH','FL','GL','DW'])delete params[key];
      params.TW=piece.end.width;params.BL=piece.end.bankLeft??0;params.BR=piece.end.bankRight??0;
      params.BC=piece.end.bankCurve??s.bankCurve;params.BF=piece.end.bankFlat??0;
      params.ST=window.TS2.pieceSurface(piece);params.ES=piece.end.edge;params.WG=piece.source.WG??s.groundSupports;
      for(const [key,value] of Object.entries({SC:s.slopeCurveStrength,SS:s.slopeEaseStart,SE:s.slopeEaseEnd,BS:s.bankTransition,LS:s.longitudinalSegments,WS:s.widthSegments,SN:s.smoothRoad,OC:s.outerCorner}))if(params[key]===undefined && value!==undefined)params[key]=value;
      return {params,gap:piece.isGap,length:piece.length*s.metresPerUnityUnit,height:(piece.end.height-piece.start.height)*s.levelHeight};
    });
  }
  function insertTemplate(code,indices,sections,before=true,current=null) {
    const doc=read(code),runtime=current??window.TS2.build(code),chosen=[...new Set(indices)].sort((a,b)=>a-b);
    if(!chosen.length || chosen.some((i,n)=>!Number.isInteger(i) || i<0 || i>doc.sections.length || i===doc.sections.length && (!doc.autoClose || !before) || n>0 && i!==chosen[n-1]+1))throw Error('Select one section or consecutive sections; auto-close only supports inserting before it.');
    if(!Array.isArray(sections) || sections.length<2 || sections.length>200)throw Error('This template is invalid.');
    const atIndex=before?chosen[0]:chosen.at(-1)+1,anchor=doc.sections[atIndex];
    const at=anchor?(anchor.modifiers[0]??anchor.at):doc.sections.at(-1).at+1;
    const inserts=sections.map(item=>{
      if(!item || typeof item.params!=='object' || !item.params || Array.isArray(item.params) || !Number.isFinite(item.length) || item.length<=0 || !Number.isFinite(item.height) || typeof item.gap!=='boolean')throw Error('This template is invalid.');
      const p={...item.params};for(const key of ['FL','GL','AH','DH','SF','RS','RF','CP','RP'])delete p[key];
      p[item.gap?'GL':'FL']=item.length/runtime.settings.trackUnitLength;p.DH=item.height/runtime.settings.levelHeight;return token(p);
    });
    const parts=[...doc.parts];parts.splice(at,0,...inserts);let result=parts.join('|');
    // Return an originally inherited surface/edge on the next existing piece.
    const next=runtime.pieces[atIndex],nextSource=anchor?.params??(next?.isClose?doc.closeParams:null);
    if(next && nextSource){const restore={};if(nextSource.ST===undefined)restore.ST=window.TS2.pieceSurface(next);if(nextSource.ES===undefined)restore.ES=next.edgeSetting??'default';if(Object.keys(restore).length)result=change(result,atIndex+inserts.length,'update',restore);}
    window.TS2.build(result,runtime.settings);return {code:result,index:atIndex};
  }
  function globals(code,changes,startChanges={}) {
    const updated=window.TS2.updateSettings(code,changes),doc=read(updated),start={...doc.start};
    for(const [key,value] of Object.entries(startChanges)){if(value===null || value==='')delete start[key];else start[key]=value;}
    doc.parts[2]=token(start);const result=doc.parts.join('|');window.TS2.parse(result);return result;
  }
  function raceSetup(code,clear=false,startIndex=undefined) {
    const runtime=window.TS2.build(code),doc=read(code),assignments=new Map();
    if(!clear) {
      const first=runtime.pieces[0].start,last=runtime.pieces.at(-1).end;
      if(!runtime.autoClose && Math.hypot(first.x-last.x,first.y-last.y,first.z-last.z)>.1)throw Error('Automatic lap setup needs a closed track. Use Auto-close, or place RS/RF sprint markers manually.');
      let distance=0;
      const all=runtime.pieces.map((piece,index)=>{const result={index,distance:distance+piece.length*.5,piece};distance+=piece.length;return result;});
      const selected=startIndex===undefined?all.find(item=>!item.piece.isGap && !item.piece.isClose):all.find(item=>item.index===startIndex);
      if(!selected)throw Error('Select a road section for the start/finish line.');
      if(selected.piece.isGap)throw Error('The selected section is a gap. Select a road section for the start/finish line.');
      // The generated connector is editable too; otherwise retain the
      // existing behaviour of placing automatic checkpoints on authored road.
      const roads=all.filter(item=>!item.piece.isGap && (!item.piece.isClose || item.index===selected.index));
      if(roads.length<3)throw Error('Automatic lap setup needs at least three road sections. Add sections or place markers manually.');
      assignments.set(selected.index,{SF:true,RP:.5});
      const relative=item=>(item.distance-selected.distance+distance)%distance;
      const remaining=roads.filter(item=>item.index!==selected.index),chosen=[];
      for(const fraction of [1/3,2/3]) {
        const target=distance*fraction;
        remaining.sort((a,b)=>Math.abs(relative(a)-target)-Math.abs(relative(b)-target));chosen.push(remaining.shift());
      }
      chosen.sort((a,b)=>relative(a)-relative(b)).forEach((item,i)=>assignments.set(item.index,{CP:i+1,RP:.5}));
    }
    doc.sections.forEach((section,index)=>{
      const params={...section.params};for(const key of ['SF','RS','RF','CP','RP'])delete params[key];
      Object.assign(params,assignments.get(index));doc.parts[section.at]=token(params);
      section.modifiers.forEach(at=>{doc.parts[at]=null;});
    });
    if(doc.autoClose){const p={...doc.closeParams};for(const key of ['SF','RS','RF','CP','RP'])delete p[key];Object.assign(p,assignments.get(doc.sections.length));doc.parts[doc.parts.length-1]=closeToken(p);}
    const result=doc.parts.filter(p=>p!==null).join('|');window.TS2.parse(result);return result;
  }
  function create(host) {
    const $=id=>document.getElementById(id);
    const TEMPLATE_KEY='trackshift.sectionTemplates.v1';
    const numericFields={editLeft:'BL',editRight:'BR',editFlatCentre:'BF',editSlope:'SC',editSlopeEntryCurve:'SI',editSlopeExitCurve:'SO',editCrossCurve:'BC',editBankEase:'BS',editLengthDetail:'LS',editWidthDetail:'WS',editOuterCorner:'OC'};
    const flagFields={editSlopeStart:'SS',editSlopeEnd:'SE',editShading:'SN'};
    const globalFields={globalLength:'TL',globalWidth:'TW',globalDepth:'TD',globalLevelHeight:'LH',globalGroundHeight:'GY',globalGrassGrip:'GG',globalGrassDrag:'GD',globalOuterCorner:'OC'};
    let runtime=null,doc=null,selected=0,history=[],cursor=-1,replaying=false,pendingDeletion=null,pendingCombine=null,densityPending=false;
    let multiMode=false,multiSelected=new Set(),staged={},bulkCommitting=false,templates=[],templateLoadError=false;
    try{
      const raw=window.localStorage?.getItem(TEMPLATE_KEY);
      if(raw){const data=JSON.parse(raw);if(data?.version!==1 || !Array.isArray(data.templates) || data.templates.length>100)throw Error('Invalid template library');
        const names=new Set();for(const item of data.templates){if(typeof item.name!=='string' || !item.name.trim() || item.name.length>48 || names.has(item.name.toLowerCase()) || !Array.isArray(item.sections) || item.sections.length<2 || item.sections.length>200)throw Error('Invalid template library');names.add(item.name.toLowerCase());}
        templates=data.templates;}
    }catch(error){templateLoadError=true;}
    function fillTemplates(preferred=''){
      const options=templates.map(item=>{const option=document.createElement('option');option.value=item.name;option.textContent=`${item.name} · ${item.sections.length} pieces`;return option;});
      if(!options.length){const option=document.createElement('option');option.value='';option.textContent='No saved templates';options.push(option);}
      $('templateList').replaceChildren(...options);$('templateList').value=templates.some(item=>item.name===preferred)?preferred:(templates[0]?.name??'');
    }
    function persistTemplates(next){
      if(templateLoadError)throw Error('The saved template library could not be read; it has not been overwritten.');
      try{if(!window.localStorage?.setItem)throw Error('unavailable');window.localStorage.setItem(TEMPLATE_KEY,JSON.stringify({version:1,templates:next}));}catch(error){throw Error('Could not save templates: browser storage is unavailable or full.');}
    }
    const multiActive=()=>multiMode && multiSelected.size>=2;
    function multiStatus(){
      const indices=[...multiSelected].sort((a,b)=>a-b),count=indices.length,changes=Object.keys(staged).length;
      $('multiTrackActions').disabled=!multiActive();$('multiApply').disabled=!multiActive() || !changes;$('multiDiscard').disabled=!changes;
      const sequential=count>=2 && indices.every((n,i)=>i===0 || n===indices[i-1]+1);
      $('multiCombine').disabled=!multiActive() || !sequential || changes>0;
      $('templateSave').disabled=!multiActive() || !sequential || changes>0 || templateLoadError;
      const canInsert=!!runtime && (!multiActive() || sequential) && changes===0 && templates.length>0;
      $('templateBefore').disabled=!canInsert;$('templateAfter').disabled=!canInsert || selected>=doc.sections.length;
      $('templateDelete').disabled=!templates.length || templateLoadError;
      $('multiTrackStatus').textContent=!multiMode?'Select multiple sections to begin.':`${count} selected${count?': '+indices.map(i=>i+1).join(', '):''}. ${changes?`${changes} change${changes===1?'':'s'} staged.`:'Choose settings below; nothing is changed until you apply.'}`;
      Array.from($('sectionList').children??[]).forEach(option=>{option.multiSelected=multiMode && multiSelected.has(Number(option.value));});
      if(typeof Event!=='undefined')$('sectionList').dispatchEvent?.(new Event('trackshift:selection'));
    }
    function stage(changes){cancelCombine();Object.assign(staged,changes);multiStatus();host.message('Changes staged. Use Apply to these pieces in Multi Track.');}
    const pending=()=>runtime && $('code').value.trim()!==runtime.code.trim();
    const editable=()=>runtime && !pending() && selected<doc.sections.length;
    const appearanceEditable=()=>runtime && !pending() && (selected<doc.sections.length || runtime.pieces[selected]?.isClose);
    function checkDraft() {
      if(pending())throw Error('Generate your edited track code before using the section editor.');
    }
    function historyButtons() {$('undo').disabled=cursor<=0;$('redo').disabled=cursor>=history.length-1;}
    function cancelCombine() {pendingCombine=null;$('combineConfirm').hidden=true;$('multiCombine').setAttribute?.('aria-expanded','false');}
    function cancelDeletion() {pendingDeletion=null;$('deleteConfirm').hidden=true;$('deleteSection').setAttribute?.('aria-expanded','false');cancelCombine();}
    function requestDeletion() {
      try {cancelDeletion();checkDraft();if(!editable() || doc.sections.length<=1)return;
        pendingDeletion={code:runtime.code,index:selected};
        $('deleteConfirmText').textContent=`Delete section ${selected+1} (${runtime.pieces[selected].length.toFixed(1)} m)? You can undo this.`;
        $('confirmDeleteSection').textContent=`Delete section ${selected+1}`;$('deleteConfirm').hidden=false;$('deleteSection').setAttribute?.('aria-expanded','true');$('cancelDeleteSection').focus?.();
      }catch(error){host.message(error.message,true);}
    }
    function confirmDeletion() {
      const request=pendingDeletion;cancelDeletion();if(!request)return;
      if(request.index!==selected || request.code!==runtime?.code)return;
      if(perform('delete'))$('sectionList').focus?.();
    }
    const edgeName=value=>window.TS2.edgeStyle(value)?.label??`Other style: ${value} (automatic preview)`;
    function edgeOptions(id,value,prefix=[]) {
      const choices=[...prefix,...window.TS2.EDGE_STYLES.map(style=>[style.id,style.label])];
      if(!choices.some(([key])=>key===value))choices.push([value,edgeName(value)+' · kept from code']);
      $(id).replaceChildren(...choices.map(([key,label])=>{const option=document.createElement('option');option.value=key;option.textContent=label;return option;}));$(id).value=value;
    }
    const materialName=value=>window.TS2.surfaceType(value)?.label??`Other material (${value}; tarmac fallback)`;
    function materialOptions(id,value,inheritLabel) {
      const choices=[['',inheritLabel],...window.TS2.SURFACE_TYPES.map(surface=>[surface.id,surface.label])];
      if(!choices.some(([key])=>key===value))choices.push([value,materialName(value)+' · kept from code']);
      $(id).replaceChildren(...choices.map(([key,label])=>{const option=document.createElement('option');option.value=key;option.textContent=label;return option;}));$(id).value=value;
    }
    const startDirectionNames=['N','NE','E','SE','S','SW','W','NW'];
    const compassAngle=value=>((value%360)+360)%360;
    function showStartBearing(bearing) {
      const angle=compassAngle(bearing),label=bearing===360?360:Number(angle.toFixed(3));
      $('globalStartBearing').value=String(label);
      $('globalStartBearingValue').textContent=`${label}° · ${startDirectionNames[Math.round(angle/45)%8]}`;
      for(let i=0;i<startDirectionNames.length;i++)$('startDirection'+startDirectionNames[i]).setAttribute('aria-pressed',String(Math.abs(angle-i*45)<1e-7));
    }
    function fillGlobals() {
      const s=runtime.settings,start=doc.start;
      $('globalEnvironment').value=s.environment;
      const city=s.environment==='city';
      $('globalPondQuantityLabel').textContent=city?'City building density (0-1)':'Pond quantity (0-1)';
      $('globalPondSizeLabel').textContent=city?'Maximum building height (0-1)':'Maximum pond size (0-1)';
      $('globalPondQuantity').setAttribute('aria-label',city?'City building density':'Pond quantity');
      $('globalPondSize').setAttribute('aria-label',city?'Maximum building height':'Maximum pond size');
      $('showTreeAreas').disabled=city;
      $('treeAreaHelp').textContent=city?'City trees are distributed across clear ground instead of forest areas.':'Purple outlines show sampling areas. Trees only appear where there is suitable, clear ground within them.';
      $('treeDensityHelp').textContent=city?'Tree density fills available spaces across the map, up to 700 trees.':'Trees form varied forest clusters near the track, with up to 700 trees. In the Volcanic environment, this density controls pillars per basalt formation.';
      $('pondDensityHelp').textContent=city?'Building density controls the proportion of suitable city lots. Maximum height is 30% of the shared pond-size setting, with a 2 m minimum.':'Pond quantity 0.1 requests one; 1 requests up to 100. Sizes start at 2 m; maximum size limits the largest diameter.';
      $('sceneryOrderHelp').textContent=city?'Trackside facilities and tyre barriers are placed first, followed by city buildings, trees, rocks and bushes. Objects need clear ground.':'Buildings and tyre barriers are placed first, then ponds, trees, rocks and bushes. Objects need clear grass and may be omitted if there is not enough space. Ponds currently use grass driving behaviour.';
      $('globalGroundHeight').value=String(s.groundY);$('globalGrassGrip').value=String(s.grassGrip);$('globalGrassDrag').value=String(s.grassDrag);$('globalGroundCutouts').checked=s.groundCutouts;
      $('globalWallToGround').checked=s.groundSupports;
      densityPending=false;$('globalSceneryDensity').value=String(s.sceneryDensity);$('globalSceneryDensityValue').textContent=s.sceneryDensity.toFixed(2);
      for(const [id,value] of [['globalPondQuantity',s.pondQuantity],['globalPondSize',(s.pondMaxMetres-2)/98],['globalTreeDensity',s.treeDensity],['globalRockDensity',s.rockDensity],['globalBushDensity',s.bushDensity]]){
        $(id).value=String(value);$(id+'Value').textContent=id==='globalPondSize'?`${value.toFixed(2)} · ${city?'maximum ':'2 to '}${(city?Math.max(2,s.pondMaxMetres*.3):s.pondMaxMetres).toFixed(1)} m`:value.toFixed(2);
      }
      for(const [id,value] of [['globalTyresInside',s.tyreInside],['globalTyresOutside',s.tyreOutside]]){$(id).value=String(value);$(id+'Value').textContent=value.toFixed(2);}
      for(const [id,value] of [['globalLength',s.trackUnitLength],['globalWidth',s.defaultTrackWidth],['globalDepth',s.tarmacDepth],['globalLevelHeight',s.levelHeight],['globalOuterCorner',s.outerCorner],
        ['globalHeading',start.AA],['globalStartLevel',start.AH],['globalStartWidth',start.TW??''],['globalStartLeft',start.BL??''],['globalStartRight',start.BR??''],['globalStartCurve',start.BC??''],['globalStartFlat',start.BF??'']])$(id).value=String(value);
      showStartBearing(180-start.AA);
      edgeOptions('globalEdge',s.defaultEdgeStyle);
      materialOptions('globalStartSurface',start.ST??'','Tarmac (default)');
      edgeOptions('globalStartEdge',start.ES?.toLowerCase()==='default'?'':start.ES??'',[['','Use track default']]);
      $('globalStartWidth').placeholder=`Track width (${s.defaultTrackWidth} m)`;
      $('globalStartCurve').placeholder=`Track curve (${s.bankCurve})`;
      $('globalSummary').textContent=`1 track unit = ${s.trackUnitLength} m · 1 level = ${s.levelHeight} m. Explicit section widths, materials and edge styles take priority.`;
      const edgeOverrides=doc.sections.filter(section=>section.params.ES!==undefined && section.params.ES.toLowerCase()!=='default').length;
      const widthOverrides=doc.sections.filter(section=>section.params.TW!==undefined || section.params.DW!==undefined).length;
      const notices=[];
      if(start.TW!==undefined)notices.push(`Starting width overrides the track width (${start.TW} m).`);
      if(start.ES!==undefined && start.ES.toLowerCase()!=='default')notices.push(`Starting edge override: ${edgeName(start.ES)}. Choose Use track default below to clear it.`);
      if(start.BC!==undefined)notices.push(`Starting bank curve overrides the default (${start.BC}). Clear it below to follow the track curve.`);
      const materialOverrides=doc.sections.filter(section=>section.params.ST!==undefined).length;
      if(materialOverrides)notices.push(`Material changes: ${materialOverrides}. Starting material applies until the first section change.`);
      if(edgeOverrides || widthOverrides)notices.push(`Section overrides: ${widthOverrides} width changes, ${edgeOverrides} edge changes.`);
      $('globalOverrides').textContent=notices.join(' ');
      if(start.TW!==undefined || start.ES!==undefined || start.BL!==undefined || start.BR!==undefined || start.BC!==undefined || start.BF!==undefined)$('startingOverrides').open=true;
    }
    function fill() {
      if(!runtime)return;
      const piece=runtime.pieces[selected],section=doc.sections[selected],isClose=!!piece?.isClose,p=section?.params??(isClose?doc.closeParams:null);
      const q=isClose?{FL:Number((piece.length/(runtime.settings.trackUnitLength/runtime.settings.metresPerUnityUnit)).toFixed(6)),DA:Number(piece.angle.toFixed(6)),AH:piece.end.height,TW:piece.end.width,BL:piece.end.bankLeft??0,BR:piece.end.bankRight??0}:p;
      $('sectionFields').disabled=!p;
      $('sectionShapeFields').disabled=isClose || !p;$('sectionDetailFields').disabled=isClose || !p;$('sectionGeometryFields').disabled=isClose || !p;
      $('sectionRaceFields').disabled=!!piece?.isGap;$('gapRaceNote').hidden=!piece?.isGap;
      $('editRoughness').disabled=!p || !!piece?.isGap;
      $('editFrequency').disabled=!p || !!piece?.isGap;
      $('editWallToGround').disabled=!p || !!piece?.isGap;
      $('editWallToGroundDefault').disabled=!p || !!piece?.isGap || !multiActive() && p.WG===undefined;
      const cover=window.TrackTerrain.coverStatus(runtime,selected);
      $('editGrassCover').checked=!!p?.CG && !piece?.isGap && !piece?.isCurve;
      $('editGrassCover').disabled=!p || !!piece?.isGap || !!piece?.isCurve || (!p?.CG && !cover.ok);
      $('sectionGrassCoverStatus').textContent=cover.ok?(p?.CG?'Grass cover is active.':'This section can be covered.'):`Grass cover unavailable: ${cover.reason}`;
      for(const [id,key] of [['editTyresLeft','TBL'],['editTyresRight','TBR']]){
        $(id).disabled=!p || !!piece?.isGap;$(id+'Default').disabled=!p || !!piece?.isGap || !multiActive() && p[key]===undefined;
        const side=key==='TBL'?1:-1,inside=(piece?.angle??0)>0?1:-1,setting=side===inside?runtime.settings.tyreInside:runtime.settings.tyreOutside;
        const inherited=piece?.isCurve && setting>0 && Math.abs(piece.angle)+1e-7>=90*(1-setting)?1:0;
        $(id).value=String(p?.[key]??inherited);$(id+'Value').textContent=p?.[key]===undefined?`Track default (${inherited.toFixed(2)})`:Number(p[key]).toFixed(2);
      }
      for(const [id,key] of [['editSceneryLeft','SCL'],['editSceneryRight','SCR']]){
        $(id).disabled=!p || !!piece?.isGap;$(id).value=p?.[key]??'';
      }
      const requested=[['Left',1,p?.SCL],['Right',-1,p?.SCR]].filter(([,side,choice])=>choice && choice!=='none');
      const placed=host.sceneryPlacements?.()??[];
      $('sectionSceneryStatus').textContent=piece?.isGap?'Gaps cannot have buildings.':requested.length?requested.map(([label,side])=>
        `${label}: ${placed.some(item=>item.index===selected && item.manualSides?.includes(side))?'placed':'not placed - needs a suitable straight, clear grass and enough space'}`).join(' · '):
        'Automatic uses the track-wide buildings density; None prevents automatic placement on that side.';
      $('duplicateSection').disabled=!section || multiActive();$('splitSection').disabled=!section || multiActive();$('deleteSection').disabled=!section || doc.sections.length===1 || multiActive();
      $('insertBeforeSection').disabled=multiActive();$('insertSection').disabled=multiActive();$('setupLapRace').disabled=multiActive();$('clearRace').disabled=multiActive();
      $('previousSection').disabled=selected===0;$('nextSection').disabled=selected>=runtime.pieces.length-1;
      $('autoClose').checked=runtime.autoClose;
      const course=window.TrackRace.plan(runtime,null,$('raceDirection').value==='reverse'?-1:1);$('raceSetupSummary').textContent=course.message;
      $('startTimedRun').disabled=!course.valid;
      $('sectionTitle').textContent=multiActive()?`Edit ${multiSelected.size} selected sections`:isClose?'Auto-close connector':`Edit section ${selected+1}${piece.isGap?' · Gap':''}`;
      $('sectionSummary').textContent=piece?`${piece.length.toFixed(1)} m · Height ${piece.start.y.toFixed(1)} → ${piece.end.y.toFixed(1)} m · Width ${piece.start.width.toFixed(1)} → ${piece.end.width.toFixed(1)} m`:'';
      const surface=piece?window.TS2.pieceSurface(piece):'road',material=window.TS2.surfaceType(surface);
      $('sectionMaterialStatus').textContent=`${materialName(surface)}. ${material?.description??'Imported value is preserved; uses tarmac appearance and handling.'}${piece?.isGap?' No road is generated in this gap; material continues after it.':isClose?(p.ST!==undefined?' Auto-close material override only.':' The closing connector continues its incoming material.'):' Material continues until changed by another section.'}`;
      $('sectionHelp').textContent=isClose?'Edit material, roughness, edge style, scenery, ground supports and race markers here. Shape is calculated automatically from the neighbouring sections.':p && ['S0','S1','B0','B1','OA'].some(key=>p[key]!==undefined)?'Split section keeps its original shape. Changing its slope or bank transition reshapes this half.':'Changes preview when you leave a field. Blank optional fields use the default or continue the previous value.';
      $('sectionEdgeLabel').textContent=isClose?'Edge style on auto-close':'Edge style from this section';
      $('sectionMaterialLabel').textContent=isClose?'Material on auto-close':'Material from this section';
      $('sectionAppearanceHelp').textContent=isClose?'These settings apply only to the generated connector. Leave them blank to continue the incoming style and material.':'Material choices continue into following sections until changed. Choose Tarmac to return to normal road. Colours and handling change together.';
      $('sectionBankHelp').hidden=isClose;$('applySection').textContent=isClose?'Apply auto-close settings':'Apply section changes';
      if(!p){host.select(selected);return;}
      $('editKind').value=q.GL!==undefined?'gap':'road';$('editLength').value=String(q.FL??q.GL);
      $('editWallToGround').checked=p.WG??runtime.settings.groundSupports;
      $('sectionGroundSupportStatus').textContent=`${p.WG===undefined?'Follows track default':p.WG?'Enabled for this section':'Disabled for this section'}. Openings are cut for roads underneath; raised ends beside a jump form a solid landing face.`;
      materialOptions('editSurface',p.ST??'',isClose?'Continue incoming material':'Continue previous material');
      $('editRoughness').value=String(p.SR??0);$('editRoughnessValue').textContent=Number(p.SR??0).toFixed(2);
      $('editFrequency').value=String(p.FQ??1);$('editFrequencyValue').textContent=Number(p.FQ??1).toFixed(2);
      $('editRaceKind').value=window.TS2.raceMarker(p)??'';
      $('editCheckpoint').value=String(p.CP??1);$('editCheckpoint').disabled=!p.CP;
      $('editRacePosition').value=String((p.RP??.5)*100);$('editRacePosition').disabled=!window.TS2.raceMarker(p);
      $('editAngle').value=String(q.DA??0);
      $('editHeightMode').value=q.AH!==undefined?'absolute':'relative';$('editHeight').value=String(q.AH??q.DH??0);
      $('editWidthMode').value=q.TW!==undefined?'absolute':q.DW!==undefined?'relative':'inherit';
      $('editWidth').value=String(q.TW??q.DW??'');$('editWidth').disabled=$('editWidthMode').value==='inherit';
      $('editWidthSide').value=q.WA??'B';$('editWidthSide').disabled=$('editWidthMode').value==='inherit';
      $('editWidth').placeholder=`Continues at ${piece.start.width.toFixed(2)} m`;
      edgeOptions('editEdge',p.ES??'',[['',isClose?'Continue incoming style':'Continue previous style'],['default','Use track default']]);
      let origin=p.ES!==undefined?(p.ES.toLowerCase()==='default'?'Track default (reset here)':'Override from this section'):
        String(piece.edgeSetting).toLowerCase()==='default'?'Track default':'Continued override';
      if(isClose)origin=p.ES===undefined?'Continues incoming style':p.ES.toLowerCase()==='default'?'Track default':'Auto-close override';
      $('sectionEdgeStatus').textContent=`${origin}: ${edgeName(isClose?piece.edgeStyle:piece.end.edge)}.${isClose?' Applies only to the generated connector.':' Edge choices continue until changed.'}${piece.isGap?' Gaps have no edge geometry; the choice carries into the following road.':''}`;
      for(const [id,key] of Object.entries(numericFields))$(id).value=String(q[key]??'');
      for(const [id,key] of Object.entries(flagFields))$(id).value=q[key]===undefined?'':q[key]?'1':'0';
      for(const [id,value] of [['editLeft',piece.start.bankLeft??0],['editRight',piece.start.bankRight??0],['editFlatCentre',piece.start.bankFlat??0],['editCrossCurve',piece.start.bankCurve??runtime.settings.bankCurve]])
        $(id).placeholder=`Continue (${value})`;
      for(const [id,value] of [['editSlope',runtime.settings.slopeCurveStrength],['editBankEase',runtime.settings.bankTransition],['editLengthDetail',runtime.settings.longitudinalSegments??runtime.settings.turnSegments],['editWidthDetail',piece.widthSegments],['editOuterCorner',runtime.settings.outerCorner]])
        $(id).placeholder=`Default (${value})`;
      for(const [id,key,setting] of [['editSlopeEntryCurve','SS','slopeEaseStart'],['editSlopeExitCurve','SE','slopeEaseEnd']])
        $(id).placeholder=`Setting (${(q[key]??runtime.settings[setting])?(q.SC??runtime.settings.slopeCurveStrength):0})`;
      host.select(selected,multiMode?[...multiSelected]:null);multiStatus();
    }
    function select(index,toggle=false) {
      if(!runtime)return;
      cancelDeletion();
      if(toggle && multiMode){
        if(Object.keys(staged).length){$('sectionList').value=String(selected);host.message('Apply or discard staged changes before changing the selection.');multiStatus();return;}
        if(index>=doc.sections.length){$('sectionList').value=String(selected);host.message('The auto-close connector cannot be included in multi-selection.');multiStatus();return;}
        if(multiSelected.has(index)){if(multiSelected.size>1){multiSelected.delete(index);if(index===selected)index=[...multiSelected].at(-1);}else {multiStatus();return;}}
        else multiSelected.add(index);
      }else if(multiMode && !bulkCommitting && !multiSelected.has(index))multiSelected=new Set([index]);
      selected=Math.max(0,Math.min(runtime.pieces.length-1,index));
      if(history[cursor])history[cursor].selection=selected;
      $('sectionList').value=String(selected);fill();
      if(typeof Event!=='undefined')$('sectionList').dispatchEvent?.(new Event('trackshift:selection'));
    }
    function accept(next) {
      if(runtime && runtime.code!==next.code && !bulkCommitting){multiMode=false;multiSelected.clear();staged={};$('multiSelectMode').checked=false;}
      runtime=next;doc=read(next.code);
      const snapshot={code:next.code,options:{...next.settings},selection:selected};
      const current=history[cursor];
      if(!replaying && (!current || current.code!==snapshot.code || JSON.stringify(current.options)!==JSON.stringify(snapshot.options))) {
        history.splice(cursor+1);history.push(snapshot);if(history.length>100)history.shift();cursor=history.length-1;
      }
      const options=runtime.pieces.map((piece,index)=>{
        const option=document.createElement('option');option.value=String(index);
        const marker=window.TS2.raceMarker(piece.source);
        option.textContent=(piece.isClose?'↩ Auto-close · generated':`${index+1}. ${piece.isGap?'Gap':piece.isCurve?(piece.angle>0?'Left bend':'Right bend'):'Straight'}${piece.isCurve?` ${piece.angle>0?'+':''}${Number(piece.angle.toFixed(1))}°`:''} · ${piece.length.toFixed(1)} m${piece.end.y!==piece.start.y?` · ${piece.end.y>piece.start.y?'up':'down'}`:''}`)+`${marker?` · ${marker==='CP'?'CP '+piece.source.CP:marker}`:''} · ${materialName(window.TS2.pieceSurface(piece))}`;
        return option;
      });
      $('sectionList').replaceChildren(...options);fillGlobals();historyButtons();select(selected);multiStatus();
    }
    function commit(code,index=selected) {
      cancelDeletion();
      if(!bulkCommitting && Object.keys(staged).length){host.message('Apply or discard staged multi-section changes first.',true);return false;}
      const previous=selected;selected=index;
      if(!host.commit(code)){selected=previous;return false;}return true;
    }
    function perform(action) {
      cancelDeletion();
      try {checkDraft();const index=selected;
        const code=change(runtime.code,index,action,{},runtime);
        return commit(code,action==='insert'?Math.min(index+1,doc.sections.length):action==='insertBefore'?Math.min(index,doc.sections.length):action==='duplicate'||action==='split'?index+1:Math.min(index,doc.sections.length-2));
      }catch(error){host.message(error.message,true);return false;}
    }
    function number(id,optional=false) {
      const field=$(id),raw=field.value.trim();
      if(optional && raw==='')return null;
      const value=Number(raw);
      if(raw==='' || !Number.isFinite(value) || (field.validity && !field.validity.valid))throw Error(`Check ${field.getAttribute?.('aria-label')||field.name||id}: enter a valid number.`);
      return value;
    }
    function apply(event) {
      cancelDeletion();
      try {checkDraft();if(!appearanceEditable())return;
        if(runtime.pieces[selected].isClose){commit(change(runtime.code,selected,'update',{ES:$('editEdge').value||null,ST:$('editSurface').value||null}));return;}
        const gap=$('editKind').value==='gap',heightMode=$('editHeightMode').value,widthMode=$('editWidthMode').value;
        const changes={FL:null,GL:null,DA:number('editAngle'),AH:null,DH:null,TW:null,DW:null};
        changes[gap?'GL':'FL']=number('editLength');changes[heightMode==='absolute'?'AH':'DH']=number('editHeight');
        if(widthMode!=='inherit')changes[widthMode==='absolute'?'TW':'DW']=number('editWidth');
        changes.WA=widthMode==='inherit' || $('editWidthSide').value==='B'?null:$('editWidthSide').value;
        const original=doc.sections[selected]?.params;
        if(original?.WI!==undefined && (changes.WA!==(original.WA??null) || (changes.TW??null)!==(original.TW??null) || (changes.DW??null)!==(original.DW??null) || changes.DA!==(original.DA??0)))changes.WI=null;
        for(const [id,key] of Object.entries(numericFields))changes[key]=number(id,true);
        for(const [id,key] of Object.entries(flagFields))changes[key]=$(id).value===''?null:$(id).value==='1';
        changes.ES=$('editEdge').value || null;
        changes.ST=$('editSurface').value || null;
        if(multiActive()){
          const id=event?.target?.id,keys={editKind:['_kind'],editLength:['_length'],editAngle:['DA'],editHeight:['AH','DH'],editHeightMode:['AH','DH'],editWidth:['TW','DW','WA'],editWidthMode:['TW','DW','WA'],editWidthSide:['TW','DW','WA'],editEdge:['ES'],editSurface:['ST']};
          for(const [field,key] of Object.entries(numericFields))keys[field]=[key];for(const [field,key] of Object.entries(flagFields))keys[field]=[key];
          if(!keys[id]){host.message('Use Apply to these pieces in Multi Track.');return;}
          const patch={};for(const key of keys[id])patch[key]=key==='_kind'?(gap?'gap':'road'):key==='_length'?number('editLength'):changes[key];
          stage(patch);return;
        }
        commit(change(runtime.code,selected,'update',changes));
      }catch(error){host.message(error.message,true);}
    }
    function applyGlobals() {
      cancelDeletion();
      try {checkDraft();if(!runtime)return;
        const changes={ES:$('globalEdge').value,GC:$('globalGroundCutouts').checked};for(const [id,key] of Object.entries(globalFields))changes[key]=number(id);
        if(doc.global.WG!==undefined || $('globalWallToGround').checked!==runtime.settings.groundSupports)changes.WG=$('globalWallToGround').checked;
        if(densityPending)changes.SD=number('globalSceneryDensity');
        const start={AA:number('globalHeading'),AH:number('globalStartLevel'),TW:number('globalStartWidth',true),BL:number('globalStartLeft',true),BR:number('globalStartRight',true),BC:number('globalStartCurve',true),BF:number('globalStartFlat',true),ES:$('globalStartEdge').value || null,ST:$('globalStartSurface').value || null};
        if(!commit(globals(runtime.code,changes,start))){densityPending=false;$('globalSceneryDensity').value=String(runtime.settings.sceneryDensity);$('globalSceneryDensityValue').textContent=runtime.settings.sceneryDensity.toFixed(2);}
      }catch(error){densityPending=false;if(runtime){$('globalSceneryDensity').value=String(runtime.settings.sceneryDensity);$('globalSceneryDensityValue').textContent=runtime.settings.sceneryDensity.toFixed(2);}host.message(error.message,true);}
    }
    function setStartBearing(value) {
      $('globalHeading').value=String(compassAngle(180-value));
      applyGlobals();
      if(doc){$('globalHeading').value=String(doc.start.AA);showStartBearing(180-doc.start.AA);}
    }
    $('globalStartBearing').addEventListener('input',()=>showStartBearing(Number($('globalStartBearing').value)));
    $('globalStartBearing').addEventListener('change',()=>setStartBearing(Number($('globalStartBearing').value)));
    startDirectionNames.forEach((name,index)=>$('startDirection'+name).addEventListener('click',()=>setStartBearing(index*45)));
    function restore(direction) {
      cancelDeletion();
      if(Object.keys(staged).length){host.message('Apply or discard staged multi-section changes before using undo or redo.');return;}
      try {checkDraft();const at=cursor+direction,snapshot=history[at];if(!snapshot)return;
        const previous=selected,previousCursor=cursor;selected=snapshot.selection;cursor=at;replaying=true;
        try {if(host.commit(snapshot.code,snapshot.options)){historyButtons();$('templateStatus').textContent='Track history restored. Saved templates are unchanged.';}else {selected=previous;cursor=previousCursor;historyButtons();}}
        finally {replaying=false;}
      }catch(error){host.message(error.message,true);}
    }
    function applyRace() {
      cancelDeletion();
      try {
        checkDraft();if(!appearanceEditable())return;
        const kind=$('editRaceKind').value,changes={SF:null,RS:null,RF:null,CP:null,RP:null};
        if(kind) {changes[kind]=kind==='CP'?number('editCheckpoint'):true;changes.RP=number('editRacePosition')/100;}
        if(multiActive()){stage(changes);return;}
        commit(change(runtime.code,selected,'update',changes));
      }catch(error){host.message(error.message,true);}
    }
    $('editRoughness').addEventListener('input',()=>{$('editRoughnessValue').textContent=Number($('editRoughness').value).toFixed(2);});
    $('editRoughness').addEventListener('change',()=>{
      cancelDeletion();try{checkDraft();if(!appearanceEditable() || runtime.pieces[selected].isGap)return;
        const value=number('editRoughness');if(multiActive()){stage({SR:value===0?null:value});return;}if(!commit(change(runtime.code,selected,'update',{SR:value===0?null:value})))fill();
      }catch(error){host.message(error.message,true);fill();}
    });
    $('editFrequency').addEventListener('input',()=>{$('editFrequencyValue').textContent=Number($('editFrequency').value).toFixed(2);});
    $('editFrequency').addEventListener('change',()=>{
      cancelDeletion();try{checkDraft();if(!appearanceEditable() || runtime.pieces[selected].isGap)return;
        const value=number('editFrequency');if(multiActive()){stage({FQ:value===1?null:value});return;}if(!commit(change(runtime.code,selected,'update',{FQ:value===1?null:value})))fill();
      }catch(error){host.message(error.message,true);fill();}
    });
    $('sectionList').addEventListener('change',()=>select(Number($('sectionList').value),multiMode));
    $('multiSelectMode').addEventListener('change',()=>{
      cancelCombine();
      if(Object.keys(staged).length){$('multiSelectMode').checked=true;host.message('Apply or discard staged changes before leaving multi-selection.');return;}
      multiMode=$('multiSelectMode').checked;multiSelected=multiMode && selected<doc.sections.length?new Set([selected]):new Set();fill();multiStatus();
    });
    $('multiDiscard').addEventListener('click',()=>{staged={};fill();multiStatus();host.message('Staged multi-section changes discarded.');});
    $('multiApply').addEventListener('click',()=>{
      try{checkDraft();if(!multiActive() || !Object.keys(staged).length)return;
        const code=multiChange(runtime.code,[...multiSelected],staged,runtime),old=staged;staged={};bulkCommitting=true;
        try{if(!commit(code)){staged=old;multiStatus();return;}}finally{bulkCommitting=false;}
        multiStatus();host.message('Changes applied to the selected sections.');
      }catch(error){host.message(error.message,true);}
    });
    $('multiCombine').addEventListener('click',()=>{
      try{cancelDeletion();checkDraft();if(!multiActive() || Object.keys(staged).length)return;
        const indices=[...multiSelected].sort((a,b)=>a-b);combineSections(runtime.code,indices,runtime);
        pendingCombine={trackCode:runtime.code,indices};$('combineConfirmText').textContent=`Combine sections ${indices.map(i=>i+1).join(', ')}? The route may change shape. The first section's settings will be used. You can undo this.`;
        $('combineConfirm').hidden=false;$('multiCombine').setAttribute?.('aria-expanded','true');$('cancelCombine').focus?.();
      }catch(error){host.message(error.message,true);}
    });
    $('confirmCombine').addEventListener('click',()=>{
      const request=pendingCombine;cancelCombine();if(!request)return;
      try{checkDraft();const indices=[...multiSelected].sort((a,b)=>a-b);
        if(!multiActive() || Object.keys(staged).length || runtime.code!==request.trackCode || indices.length!==request.indices.length || indices.some((index,i)=>index!==request.indices[i]))return;
        const code=combineSections(runtime.code,indices,runtime);
        const oldSelected=multiSelected;multiSelected=new Set([indices[0]]);bulkCommitting=true;
        try{if(!commit(code,indices[0])){multiSelected=oldSelected;multiStatus();return;}}finally{bulkCommitting=false;}
        fill();multiStatus();host.message('Sections combined. You can undo the change.');
      }catch(error){host.message(error.message,true);}
    });
    $('cancelCombine').addEventListener('click',()=>{cancelCombine();$('multiCombine').focus?.();});
    $('templateSave').addEventListener('click',()=>{
      try{checkDraft();if(!multiActive() || Object.keys(staged).length)throw Error('Select consecutive sections and apply or discard staged changes first.');
        const name=$('templateName').value.trim();if(!name || name.length>48)throw Error('Enter a template name of up to 48 characters.');
        if(templates.some(item=>item.name.toLowerCase()===name.toLowerCase()))throw Error('That template name already exists. Choose a different name.');
        if(templates.length>=100)throw Error('The browser can store up to 100 templates.');
        const sections=captureTemplate(runtime.code,[...multiSelected],runtime),next=[...templates,{name,sections}];persistTemplates(next);templates=next;fillTemplates(name);multiStatus();
        $('templateStatus').textContent=`Saved “${name}” (${sections.length} pieces) in this browser. Race markers were left out.`;
      }catch(error){$('templateStatus').textContent=error.message;host.message(error.message,true);}
    });
    function addTemplate(before){
      try{checkDraft();if(Object.keys(staged).length)throw Error('Apply or discard staged changes before inserting a template.');
        const item=templates.find(entry=>entry.name===$('templateList').value);if(!item)throw Error('Choose a saved template.');
        const indices=multiActive()?[...multiSelected]:[selected],result=insertTemplate(runtime.code,indices,item.sections,before,runtime);
        const oldMode=multiMode,oldSelection=multiSelected;multiMode=false;multiSelected=new Set();$('multiSelectMode').checked=false;bulkCommitting=true;
        try{if(!commit(result.code,result.index)){multiMode=oldMode;multiSelected=oldSelection;$('multiSelectMode').checked=oldMode;fill();return;}}finally{bulkCommitting=false;}
        multiStatus();$('templateStatus').textContent=`Added “${item.name}”. Use Undo to remove it.`;host.message(`Inserted template “${item.name}”.`);
      }catch(error){$('templateStatus').textContent=error.message;host.message(error.message,true);}
    }
    $('templateBefore').addEventListener('click',()=>addTemplate(true));$('templateAfter').addEventListener('click',()=>addTemplate(false));
    $('templateDelete').addEventListener('click',()=>{
      try{const item=templates.find(entry=>entry.name===$('templateList').value);if(!item)return;
        if(typeof window.confirm==='function' && !window.confirm(`Delete the saved template “${item.name}”?`))return;
        const next=templates.filter(entry=>entry!==item);persistTemplates(next);templates=next;fillTemplates();multiStatus();$('templateStatus').textContent=`Deleted “${item.name}”.`;
      }catch(error){$('templateStatus').textContent=error.message;host.message(error.message,true);}
    });
    $('previousSection').addEventListener('click',()=>select(Math.max(0,selected-1),multiMode));$('nextSection').addEventListener('click',()=>select(Math.min(runtime.pieces.length-1,selected+1),multiMode));
    $('insertBeforeSection').addEventListener('click',()=>perform('insertBefore'));$('insertSection').addEventListener('click',()=>perform('insert'));$('duplicateSection').addEventListener('click',()=>perform('duplicate'));$('splitSection').addEventListener('click',()=>perform('split'));
    $('deleteSection').addEventListener('click',requestDeletion);$('confirmDeleteSection').addEventListener('click',confirmDeletion);
    $('cancelDeleteSection').addEventListener('click',()=>{cancelDeletion();$('deleteSection').focus?.();});
    for(const id of ['code','editorPanel','trackSettingsPanel'])$(id).addEventListener('input',cancelDeletion);
    $('applySection').addEventListener('click',apply);
    $('applyRaceMarker').addEventListener('click',applyRace);
    for(const id of ['editRaceKind','editCheckpoint','editRacePosition'])$(id).addEventListener('change',applyRace);
    for(const [id,clear] of [['setupLapRace',false],['clearRace',true]])$(id).addEventListener('click',()=>{
      cancelDeletion();try{checkDraft();commit(raceSetup(runtime.code,clear,selected));}catch(error){host.message(error.message,true);}
    });
    for(const id of ['editKind','editLength','editAngle','editHeight','editWidth','editWidthSide','editEdge','editSurface',...Object.keys(numericFields),...Object.keys(flagFields)])$(id).addEventListener('change',apply);
    $('editWallToGround').addEventListener('change',()=>{
      cancelDeletion();try{checkDraft();if(!appearanceEditable() || runtime.pieces[selected].isGap)return;
        if(multiActive()){stage({WG:$('editWallToGround').checked});return;}
        if(!commit(change(runtime.code,selected,'update',{WG:$('editWallToGround').checked})))fill();
      }catch(error){host.message(error.message,true);fill();}
    });
    $('editWallToGroundDefault').addEventListener('click',()=>{
      cancelDeletion();try{checkDraft();if(multiActive()){stage({WG:null});return;}if(appearanceEditable() && !runtime.pieces[selected].isGap && !commit(change(runtime.code,selected,'update',{WG:null})))fill();}
      catch(error){host.message(error.message,true);fill();}
    });
    $('editGrassCover').addEventListener('change',()=>{
      cancelDeletion();try{checkDraft();if(!appearanceEditable() || runtime.pieces[selected].isGap || runtime.pieces[selected].isCurve)return;
        if($('editGrassCover').checked && !window.TrackTerrain.coverStatus(runtime,selected).ok){fill();return;}
        if(multiActive()){stage({CG:$('editGrassCover').checked?true:null});return;}
        if(!commit(change(runtime.code,selected,'update',{CG:$('editGrassCover').checked?true:null})))fill();
      }catch(error){host.message(error.message,true);fill();}
    });
    $('applyGlobals').addEventListener('click',applyGlobals);
    $('globalGroundCutouts').addEventListener('change',applyGlobals);
    $('globalWallToGround').addEventListener('change',applyGlobals);
    $('globalEnvironment').addEventListener('change',()=>{try{checkDraft();if(!commit(globals(runtime.code,{ENV:$('globalEnvironment').value})))fillGlobals();}catch(error){if(runtime)fillGlobals();host.message(error.message,true);}});
    $('globalSceneryDensity').addEventListener('input',()=>{densityPending=true;$('globalSceneryDensityValue').textContent=Number($('globalSceneryDensity').value).toFixed(2);});
    $('globalSceneryDensity').addEventListener('change',()=>{densityPending=true;applyGlobals();});
    for(const [id,key] of [['globalPondQuantity','PQ'],['globalPondSize','PZ'],['globalTreeDensity','TR'],['globalRockDensity','RD'],['globalBushDensity','BU']]){
      $(id).addEventListener('input',()=>{const value=Number($(id).value),city=runtime?.settings.environment==='city',metres=2+98*value;$(id+'Value').textContent=id==='globalPondSize'?`${value.toFixed(2)} · ${city?'maximum ':'2 to '}${(city?Math.max(2,metres*.3):metres).toFixed(1)} m`:value.toFixed(2);});
      $(id).addEventListener('change',()=>{try{checkDraft();const value=number(id),stored=key==='PZ'?Number((2+98*value).toFixed(3)):value;if(!commit(globals(runtime.code,{[key]:stored})))fillGlobals();}catch(error){host.message(error.message,true);if(runtime)fillGlobals();}});
    }
    for(const [id,key] of [['globalTyresInside','TI'],['globalTyresOutside','TO']]){
      $(id).addEventListener('input',()=>{$(id+'Value').textContent=Number($(id).value).toFixed(2);});
      $(id).addEventListener('change',()=>{try{checkDraft();if(!commit(globals(runtime.code,{[key]:number(id)})))fillGlobals();}catch(error){host.message(error.message,true);if(runtime)fillGlobals();}});
    }
    for(const [id,key] of [['editTyresLeft','TBL'],['editTyresRight','TBR']]){
      $(id).addEventListener('input',()=>{$(id+'Value').textContent=Number($(id).value).toFixed(2);});
      $(id).addEventListener('change',()=>{try{checkDraft();if(!appearanceEditable() || runtime.pieces[selected].isGap)return;if(multiActive()){stage({[key]:number(id)});return;}if(!commit(change(runtime.code,selected,'update',{[key]:number(id)})))fill();}catch(error){host.message(error.message,true);fill();}});
      $(id+'Default').addEventListener('click',()=>{try{checkDraft();if(!appearanceEditable() || runtime.pieces[selected].isGap)return;if(multiActive()){stage({[key]:null});return;}if(!commit(change(runtime.code,selected,'update',{[key]:null})))fill();}catch(error){host.message(error.message,true);fill();}});
    }
    for(const [id,key] of [['editSceneryLeft','SCL'],['editSceneryRight','SCR']])$(id).addEventListener('change',()=>{
      cancelDeletion();try{checkDraft();if(!appearanceEditable() || runtime.pieces[selected].isGap)return;if(multiActive()){stage({[key]:$(id).value||null});return;}
        if(!commit(change(runtime.code,selected,'update',{[key]:$(id).value||null})))fill();
      }catch(error){host.message(error.message,true);fill();}
    });
    for(const id of [...Object.keys(globalFields),'globalHeading','globalStartLevel','globalStartWidth','globalStartLeft','globalStartRight','globalStartCurve','globalStartFlat','globalEdge','globalStartEdge','globalStartSurface'])$(id).addEventListener('change',applyGlobals);
    $('editHeightMode').addEventListener('change',()=>{
      const piece=runtime?.pieces[selected];if(!piece || !editable())return;
      $('editHeight').value=String($('editHeightMode').value==='absolute'?piece.end.height:piece.end.height-piece.start.height);apply({target:$('editHeightMode')});
    });
    $('editWidthMode').addEventListener('change',()=>{
      const piece=runtime?.pieces[selected];if(!piece || !editable())return;
      const mode=$('editWidthMode').value;$('editWidth').disabled=mode==='inherit';
      $('editWidth').value=mode==='inherit'?'':String(mode==='absolute'?piece.end.width:piece.end.width-piece.start.width);apply({target:$('editWidthMode')});
    });
    $('autoClose').addEventListener('change',()=>{cancelDeletion();try{checkDraft();if(!commit(closing(runtime.code,$('autoClose').checked)))$('autoClose').checked=runtime.autoClose;}catch(error){$('autoClose').checked=runtime.autoClose;host.message(error.message,true);}});
    $('undo').addEventListener('click',()=>restore(-1));$('redo').addEventListener('click',()=>restore(1));
    $('toggleEditor').addEventListener('click',()=>{cancelDeletion();const hidden=!$('editorPanel').hidden;$('editorPanel').hidden=hidden;$('toggleEditor').textContent=hidden?'Show editor':'Hide editor';host.select(hidden?-1:selected);});
    window.addEventListener('keydown',event=>{
      if(host.isDriving?.() || event.target?.closest?.('#mainMenu'))return;
      if(pendingCombine && (event.key==='Escape' || event.code==='Escape')){event.preventDefault();cancelCombine();$('multiCombine').focus?.();return;}
      if(pendingDeletion && (event.key==='Escape' || event.code==='Escape')){event.preventDefault();cancelDeletion();$('deleteSection').focus?.();return;}
      if(!event.ctrlKey && !event.metaKey)return;
      if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable)return;
      if(event.key.toLowerCase()==='z'){event.preventDefault();restore(event.shiftKey?1:-1);}
      else if(event.key.toLowerCase()==='y'){event.preventDefault();restore(1);}
    });
    function resetHistory() {
      cancelDeletion();history=[];cursor=-1;
      if(runtime)accept(runtime);
    }
    function snapshotState(){return {runtime,selected,history:history.map(item=>({...item,options:{...item.options}})),cursor};}
    function restoreState(state){
      selected=state.selected;replaying=true;try{accept(state.runtime);}finally{replaying=false;}
      history=state.history;cursor=state.cursor;historyButtons();
    }
    fillTemplates();if(templateLoadError)$('templateStatus').textContent='The saved template library could not be read; it has not been changed.';
    return {accept,select,resetHistory,snapshotState,restoreState,cancelPendingDeletion:cancelDeletion,get selectedIndex(){return selected;},get hasDraft(){return pending();}};
  }
  window.TrackEditor={read,change,multiChange,combineSections,captureTemplate,insertTemplate,closing,globals,raceSetup,create};
})();
