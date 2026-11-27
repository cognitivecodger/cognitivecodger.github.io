/* Boost pad placement and contact logic, shared by the editor and driving. */
(function(){
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),CAR_WIDTH=1.15;
  function randomAt(index,seed){let x=(Math.imul(index+1,0x9e3779b1)^seed)>>>0;x^=x>>>16;x=Math.imul(x,0x85ebca6b)>>>0;x^=x>>>13;return (x>>>0)/4294967296;}
  function plan(runtime,direction=1){
    const manual=runtime.pieces.some(p=>!p.isGap && p.source?.BP),density=runtime.settings.boostDensity??0,result=[];
    let seed=2166136261;for(const char of runtime.code.replace(/BPD=[^,)]+,?/gi,''))seed=Math.imul(seed^char.charCodeAt(0),16777619)>>>0;
    const starts=runtime.pieces.filter(piece=>piece.source?.SF || piece.source?.RS || piece.source?.RF).map(piece=>window.TrackRace.at(piece,piece.source.RP??.5));
    const automatic=new Map(),ordered=runtime.pieces.map((piece,index)=>({piece,index}));if(direction===-1)ordered.reverse();
    // One candidate per uninterrupted straight run, including a run made of
    // short adjacent sections. Leave enough straight after the pad to use it.
    for(let i=0;i<ordered.length;){
      if(ordered[i].piece.isGap || ordered[i].piece.isCurve || ordered[i].piece.isClose){i++;continue;}
      let end=i,total=0;while(end<ordered.length && !ordered[end].piece.isGap && !ordered[end].piece.isCurve && !ordered[end].piece.isClose){total+=ordered[end].piece.length;end++;}
      let remaining=total;
      for(let j=i;j<end;j++){
        const {piece,index}=ordered[j];
        const marker=piece.source?.SF || piece.source?.RS || piece.source?.RF;
        const afterMarker=marker?(direction===-1?(piece.source.RP??.5):1-(piece.source.RP??.5))*piece.length-12.1:Infinity;
        if(remaining>=12 && piece.length>2 && afterMarker>=8){automatic.set(index,!!marker);break;}
        remaining-=piece.length;
      }
      i=end;
    }
    runtime.pieces.forEach((piece,index)=>{
      if(piece.isGap || !(piece.length>.7))return;
      const p=piece.source??{},isManual=!!p.BP;
      if(manual && !isManual || !manual && (!density || !automatic.has(index) || randomAt(index,seed)>density))return;
      const length=Math.min(2,piece.length*.6),margin=length/(2*piece.length);
      // Automatic pads start a straight in the direction being raced.
      let requested=isManual?(p.BPP??.5):(direction===-1?1-Math.max(.18,margin):Math.max(.18,margin));
      if(!isManual && automatic.get(index))requested=direction===-1?Math.min(requested,(p.RP??.5)-12.1/piece.length):Math.max(requested,(p.RP??.5)+12.1/piece.length);
      const fraction=clamp(requested,margin,1-margin),pose=window.TrackRace.at(piece,fraction);
      if(!isManual && starts.some(start=>Math.hypot(start.x-pose.x,start.y-pose.y,start.z-pose.z)<12))return;
      const left=window.TS2.halfWidth(pose,1),right=window.TS2.halfWidth(pose,-1),roadWidth=left+right;
      const minimum=Math.min(CAR_WIDTH,roadWidth),width=minimum+(roadWidth-minimum)*(isManual?(p.BPW??0):0);
      const offset=clamp(isManual?(p.BPO??0):0,-1,1),centre=(left-width/2)*(1-offset)/2+(-right+width/2)*(1+offset)/2;
      const yaw=pose.yaw*Math.PI/180,x=pose.x+Math.cos(yaw)*centre,z=pose.z-Math.sin(yaw)*centre;
      result.push({index,piece,fraction,length,width,centre,pose,x,z,y:window.TS2.heightAcross(pose,window.TS2.lateralU(pose,centre)),yaw,manual:isManual});
    });
    return result;
  }
  const contacts=new WeakMap();
  function reset(state){contacts.delete(state);state.boostTime=0;}
  function step(state,previous,pads){
    if(!state || !previous || !pads?.length)return false;
    const inside=contacts.get(state)??new Set(),next=new Set();let activated=false;
    for(const pad of pads){
      const sin=Math.sin(pad.yaw),cos=Math.cos(pad.yaw),coords=p=>({x:(p.x-pad.x)*cos-(p.z-pad.z)*sin,z:(p.x-pad.x)*sin+(p.z-pad.z)*cos});
      const a=coords(previous),b=coords(state),halfWidth=pad.width/2+(state.scale??.5)*.6,halfLength=pad.length/2+(state.scale??.5)*.8;
      const now=Math.abs(b.x)<=halfWidth && Math.abs(b.z)<=halfLength;
      const supported=(state.contacts??[]).some(c=>c.force>.05 && c.hit?.road && c.hit.roadPiece===pad.index);
      if(now && supported)next.add(pad.index);
      let enter=0,exit=1;
      for(const [start,end,limit] of [[a.x,b.x,halfWidth],[a.z,b.z,halfLength]]){
        const delta=end-start;if(Math.abs(delta)<1e-9){if(Math.abs(start)>limit)enter=2;continue;}
        const u=(-limit-start)/delta,v=(limit-start)/delta;enter=Math.max(enter,Math.min(u,v));exit=Math.min(exit,Math.max(u,v));
      }
      const crosses=enter<=exit;
      if(!inside.has(pad.index) && crosses && supported && Math.abs(state.y-pad.y)<2){state.boostTime=1.5;state.boostLevel=1;next.add(pad.index);activated=true;}
    }
    contacts.set(state,next);
    return activated;
  }
  window.TrackBoost={plan,step,reset,CAR_WIDTH};
})();
