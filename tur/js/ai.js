/* Arcade rivals drive along the ordered route using the normal car physics. */
(function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const angle=v=>Math.atan2(Math.sin(v),Math.cos(v));
  const DIFFICULTIES=Object.freeze({
    easy:{label:'Easy',cornering:6,topSpeed:20.5,accelerationMultiplier:1,build:'balanced'},
    normal:{label:'Normal',cornering:8.8,topSpeed:24,hillCornering:7.3,hillTopSpeed:24,accelerationMultiplier:1.05,build:{engine:'sport',tyres:'allround',suspension:'standard',drivetrain:'awd',steering:'standard',assist:'off'}},
    hard:{label:'Hard',cornering:10,topSpeed:30,hillCornering:8,hillTopSpeed:30,accelerationMultiplier:1.1,build:{engine:'sport',tyres:'allround',suspension:'standard',drivetrain:'awd',steering:'sport',assist:'basic'}}
  });
  function create(runtime,direction=1,difficulty='normal'){
    const profile=DIFFICULTIES[difficulty]??DIFFICULTIES.normal;
    const hilly=runtime.pieces.some(piece=>Math.abs(piece.end.y-piece.start.y)>.25);
    const reverseHills=hilly && direction===-1 && (difficulty==='normal' || difficulty==='hard');
    const cornering=reverseHills?7:hilly?(profile.hillCornering??profile.cornering):profile.cornering;
    const topSpeed=hilly?(profile.hillTopSpeed??profile.topSpeed):profile.topSpeed;
    // Keep the stronger engine on hills, while using predictable steering on
    // the more difficult elevation changes and close bridge approaches.
    const build=hilly && difficulty==='hard'?{...profile.build,steering:'standard',assist:'off'}:profile.build;
    const segments=[],pieces=runtime.pieces.map(()=>[]);let total=0;
    for(let index=0;index<runtime.pieces.length;index++){
      const poses=runtime.pieces[index].poses;
      for(let i=1;i<poses.length;i++){
        const a=poses[i-1],b=poses[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-8)continue;
        const part={a,b,length,start:total,index};segments.push(part);pieces[index].push(part);total+=length;
      }
    }
    if(!segments.length)throw Error('The rival needs a usable track route.');
    const first=segments[0].a,last=segments.at(-1).b;
    const closed=runtime.autoClose || Math.hypot(first.x-last.x,first.y-last.y,first.z-last.z)<.1;
    const dir=direction===-1?-1:1;
    function point(distance){
      if(closed)distance=((distance%total)+total)%total;else distance=clamp(distance,0,total);
      let lo=0,hi=segments.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(segments[mid].start+segments[mid].length<distance)lo=mid+1;else hi=mid;}
      const part=segments[lo],t=clamp((distance-part.start)/part.length,0,1);
      return {x:part.a.x+(part.b.x-part.a.x)*t,z:part.a.z+(part.b.z-part.a.z)*t,
        y:part.a.y+(part.b.y-part.a.y)*t,width:(part.a.width??8)+((part.b.width??8)-(part.a.width??8))*t,
        bankLeft:(part.a.bankLeft??0)+((part.b.bankLeft??0)-(part.a.bankLeft??0))*t,
        bankRight:(part.a.bankRight??0)+((part.b.bankRight??0)-(part.a.bankRight??0))*t,
        bankCurve:(part.a.bankCurve??0)+((part.b.bankCurve??0)-(part.a.bankCurve??0))*t,
        bankFlat:(part.a.bankFlat??0)+((part.b.bankFlat??0)-(part.a.bankFlat??0))*t,
        yaw:Math.atan2((part.b.x-part.a.x)*dir,(part.b.z-part.a.z)*dir),index:part.index};
    }
    function locate(state){
      const index=Number.isInteger(state.routePiece)?state.routePiece:0,contact=state.trackPiece;let best=null;
      function inspect(candidate){for(const part of pieces[candidate]??[]){
        const dx=part.b.x-part.a.x,dz=part.b.z-part.a.z,t=clamp(((state.x-part.a.x)*dx+(state.z-part.a.z)*dz)/(part.length*part.length),0,1);
        const x=part.a.x+dx*t,z=part.a.z+dz*t,score=(state.x-x)**2+(state.z-z)**2;
        if(!best || score<best.score)best={distance:part.start+part.length*t,score};
      }}
      inspect(index);
      // Wheels can straddle a join while the ordered route cursor still
      // belongs to the previous section. If that would put an aligned car's
      // target behind it, consider its validated, connected support section.
      if(best && state.routeValid && Number.isFinite(state.yaw) && Number.isInteger(contact) && contact!==index && runtime.pieces[index] && runtime.pieces[contact]){
        const forward=(index+1)%pieces.length===contact,backward=(contact+1)%pieces.length===index;
        const a=forward?runtime.pieces[index].end:runtime.pieces[contact].end;
        const b=forward?runtime.pieces[contact].start:runtime.pieces[index].start;
        if((forward||backward) && Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.05){
          const here=point(best.distance),look=clamp(3+Math.hypot(state.vx??0,state.vz??0)*.38,3,9),target=point(best.distance+dir*look);
          const lane=(state.x-here.x)*Math.cos(here.yaw)-(state.z-here.z)*Math.sin(here.yaw);
          const x=target.x+Math.cos(target.yaw)*lane-state.x,z=target.z-Math.sin(target.yaw)*lane-state.z;
          if(x*Math.sin(state.yaw)+z*Math.cos(state.yaw)<.15 && Math.abs(angle(here.yaw-state.yaw))<1.25)inspect(contact);
        }
      }
      return best??{distance:dir===1?0:total,score:Infinity};
    }
    function input(state){
      const location=locate(state),speed=Math.hypot(state.vx,state.vz),look=clamp(3+speed*.38,3,9);
      const target=point(location.distance+dir*look),near=point(location.distance+dir*2),far=point(location.distance+dir*14);
      const bend=Math.abs(angle(far.yaw-near.yaw))/12;
      const targetSpeed=clamp(Math.sqrt(cornering/Math.max(.02,bend)),5,topSpeed);
      const desired=Math.atan2(target.x-state.x,target.z-state.z),error=angle(desired-state.yaw);
      const steer=-clamp(error*1.5,-1,1);
      const throttle=speed>targetSpeed+1.2?-.5:speed>targetSpeed?0:1;
      return {throttle,steer,handbrake:false};
    }
    const driverCornerFactor=hilly?(difficulty==='hard'?(reverseHills?1.12:1.08):difficulty==='normal'?(reverseHills?1.25:1.16):1.25):difficulty==='hard'?1.9:difficulty==='normal'?1.7:1.3;
    const cornerBrakeBuffer=hilly?(reverseHills?(difficulty==='normal'?2.75:2.3):(difficulty==='hard'?1.7:2)):5;
    const cornerDangerLook=hilly && !reverseHills?9:6;
    const curvatureFloor=hilly?.02:.001;
    // Steep curved bridge approaches have much less margin than an ordinary
    // corner; retain their previous planning until the road levels out.
    const slopeCornerFactor=reverseHills?(difficulty==='hard'?1.02:driverCornerFactor):hilly?(difficulty==='hard'||difficulty==='normal'?1:1.15):driverCornerFactor;
    const slopeBrakeBuffer=reverseHills?(difficulty==='hard'?1.8:cornerBrakeBuffer):hilly?1.2:cornerBrakeBuffer;
    const slopeDangerLook=hilly && !reverseHills?12:cornerDangerLook;
    return {input,locate,point,total,closed,direction:dir,build,accelerationMultiplier:profile.accelerationMultiplier,cornering,driverCornerFactor,cornerBrakeBuffer,cornerDangerLook,curvatureFloor,topSpeed,hilly,slopeCornerFactor,slopeBrakeBuffer,slopeDangerLook,pieceCount:pieces.length,isGap:index=>!!runtime.pieces[index]?.isGap};
  }
  // Deterministic individual styles keep difficulty meaningful and replays
  // reproducible. Numbers vary within a narrow band rather than changing the
  // car physics or making every corner a drift.
  const STYLES=Object.freeze([
    {lane:-.42,speed:.97,corner:.97,look:16,steer:1.50,side:-1},
    {lane:.42,speed:1.02,corner:1.03,look:12,steer:1.55,side:1},
    {lane:-.19,speed:.94,corner:1.00,look:18,steer:1.44,side:-1},
    {lane:.20,speed:1.04,corner:1.04,look:13,steer:1.58,side:1},
    {lane:0,speed:.98,corner:.95,look:17,steer:1.47,side:1},
    {lane:-.32,speed:1.01,corner:1.01,look:14,steer:1.52,side:-1},
    {lane:.32,speed:.96,corner:1.02,look:15,steer:1.48,side:1}
  ].map(Object.freeze));
  const PERSONALITY_FIELDS=Object.freeze({
    lane:{label:'Preferred line',min:-1,max:1,step:.05},
    speed:{label:'Straight speed',min:.7,max:1.2,step:.01},
    corner:{label:'Corner speed',min:.6,max:1.6,step:.01},
    brake:{label:'Brake lateness',min:.4,max:2,step:.05},
    look:{label:'Corner look-ahead',min:8,max:25,step:1},
    steer:{label:'Steering response',min:.8,max:2.2,step:.05},
    overtake:{label:'Overtaking',min:0,max:1,step:.05},
    handbrake:{label:'Handbrake use',min:0,max:1,step:.05}
  });
  function defaultPersonality(index=0){return {...STYLES[((index%STYLES.length)+STYLES.length)%STYLES.length],brake:1,overtake:.5,handbrake:index%3!==2?.5:0,handbrakeCadence:7+(index%3)*.7};}
  function personality(values={},index=0){
    const base=defaultPersonality(index),result={...base};
    for(const [key,range] of Object.entries(PERSONALITY_FIELDS))if(Number.isFinite(values[key]))result[key]=clamp(values[key],range.min,range.max);
    if(values.side===-1 || values.side===1)result.side=values.side;
    if(Number.isFinite(values.handbrakeCadence))result.handbrakeCadence=clamp(values.handbrakeCadence,7,8.4);
    return result;
  }
  // Each car remembers its own chosen line, avoiding rapid left/right flips.
  // Other vehicles are sampled together before physics advances, so decisions
  // do not depend on which AI happened to be updated first.
  function createDriver(nav,index,initial,dimensions,options={}){
    let style=defaultPersonality(index);
    const random=typeof options.random==='function'?options.random:Math.random;
    const init=nav.locate(initial),origin=nav.point(init.distance);
    let lane=(initial.x-origin.x)*Math.cos(origin.yaw)-(initial.z-origin.z)*Math.sin(origin.yaw),hold=0,passing=null,handbrakeTime=0,handbrakeCooldown=0;
    let intent={mode:'line',lane,targetSpeed:0,target:null},seenGround=(initial.grounded??0)>0,airTime=0,landingTime=0,jumpPower=null;
    function input(self,field,dt=1/60){
      dt=clamp(Number.isFinite(dt)?dt:0,0,.1);
      const position=self.path??nav.locate(self.state),s=self.state,speed=Math.hypot(s.vx,s.vz);
      const look=clamp(3+speed*.38,3,9),here=nav.point(position.distance),target=nav.point(position.distance+nav.direction*look);
      const near=nav.point(position.distance+nav.direction*2),far=nav.point(position.distance+nav.direction*style.look);
      const bend=Math.abs(angle(far.yaw-near.yaw))/Math.max(1,style.look-2);
      const margin=dimensions.width*.5+.48*Math.max(.5,s.scale),room=Math.max(0,Math.min(here.width,target.width)*.5-margin);
      const base=clamp(style.lane*room,-room,room),leftX=Math.cos(here.yaw),leftZ=-Math.sin(here.yaw);
      const lateral=(s.x-here.x)*leftX+(s.z-here.z)*leftZ;
      let desired=base,limit=Infinity,mode='line',targetId=null;
      const nearby=[];
      for(const other of field){
        if(other.id===self.id || !Number.isFinite(other.path?.distance))continue;
        const delta=Math.abs((s.routePiece??-100)-(other.state.routePiece??100));
        if(delta>1 && !(nav.closed && delta===nav.pieceCount-1))continue;
        if(Math.abs((s.y-self.roadY)-(other.state.y-other.roadY))>Math.max(1,1.8*s.scale))continue;
        let ahead=(other.path.distance-position.distance)*nav.direction;
        if(nav.closed){if(ahead>nav.total/2)ahead-=nav.total;else if(ahead< -nav.total/2)ahead+=nav.total;}
        if(ahead< -6 || ahead>Math.max(12,Math.min(25,speed*1.15+6)))continue;
        const offset=(other.state.x-here.x)*leftX+(other.state.z-here.z)*leftZ;
        if(Math.abs(offset)>here.width*.65+other.width)continue;
        nearby.push({id:other.id,ahead,offset,width:other.width,length:other.length,
          speed:Math.max(0,other.state.vx*Math.sin(here.yaw)+other.state.vz*Math.cos(here.yaw))});
      }
      nearby.sort((a,b)=>a.ahead-b.ahead);
      const lead=nearby.find(o=>o.ahead>0 && Math.abs(o.offset-lateral)<(dimensions.width+o.width)*.5+.45);
      if(lead){
        const gap=(dimensions.width+lead.width)*.5+.42,forwardGap=(dimensions.length+lead.length)*.5+.55;
        // Do not initiate a lane change into a gap, into a car alongside, or
        // through a very tight turn. Follow safely when there is no room.
        const choices=[lead.offset-gap,lead.offset+gap].filter(value=>Math.abs(value)<=room &&
          nearby.every(other=>other.id===lead.id || other.ahead< -dimensions.length*2 || other.ahead>lead.ahead+dimensions.length ||
            Math.abs(value-other.offset)>=(dimensions.width+other.width)*.5+.25));
        const readyToPass=style.overtake>=.5 || lead.ahead<forwardGap+6+speed*(.3+style.overtake);
        if(choices.length && style.overtake>0 && readyToPass && !nav.isGap(here.index) && !nav.isGap(target.index) && bend<(.11+style.overtake*.1) && s.grounded>0){
          choices.sort((a,b)=>Math.abs(a-lane)-Math.abs(b-lane)||style.side*(b-a));
          desired=choices[0];passing=desired;hold=.8;mode='passing';targetId=lead.id;
        }else {mode='following';targetId=lead.id;}
        const aligned=Math.abs(lateral-lead.offset)>=gap*.85;
        if(!aligned){
          const trigger=forwardGap+speed*(mode==='passing'?clamp(.22-(style.overtake-.5)*.18,.1,.35):.55);
          if(lead.ahead<trigger)limit=Math.max(mode==='passing'?2:0,lead.speed+(lead.ahead-forwardGap)*1.1);
        }
      }else if(hold>0 && passing!==null){desired=clamp(passing,-room,room);hold=Math.max(0,hold-dt);mode='passing';}
      else {hold=0;passing=null;}
      // Smooth lateral movement and obey the road edge at the look-ahead point.
      lane=clamp(lane+clamp(desired-lane,-dt*.85,dt*.85),-room,room);
      const tx=target.x+Math.cos(target.yaw)*lane,tz=target.z-Math.sin(target.yaw)*lane;
      let desiredYaw=Math.atan2(tx-s.x,tz-s.z),tangentFallback=false;
      // A very tight bend can fold the lane target behind a car that is
      // already facing along the road. Follow the local tangent in that case
      // instead of demanding a U-turn into the inside wall.
      const ahead=(tx-s.x)*Math.sin(s.yaw)+(tz-s.z)*Math.cos(s.yaw);
      if(ahead<.15 && Math.abs(angle(here.yaw-s.yaw))<1.25){desiredYaw=here.yaw;tangentFallback=true;}
      const error=angle(desiredYaw-s.yaw);
      // On a complex hilly circuit, make sure a straight continues far
      // enough to shed the extra speed before the next turn. Heading samples
      // also catch an S-bend whose final direction happens to match the start.
      const clearStraight=bend<1e-4 && (nav.curvatureFloor<.01 || [10,20,30,40,50,60].every(distance=>
        Math.abs(angle(nav.point(position.distance+nav.direction*distance).yaw-here.yaw))<.04));
      const steepApproach=nav.hilly && Math.max(Math.abs(here.y-near.y),Math.abs(here.y-far.y),Math.abs(here.y-target.y))>.35;
      const cornerFactor=steepApproach?nav.slopeCornerFactor:nav.driverCornerFactor;
      const cap=clearStraight?nav.topSpeed*style.speed:
        clamp(Math.sqrt(nav.cornering*cornerFactor*style.corner/Math.max(nav.curvatureFloor,bend)),5,nav.topSpeed*style.speed);
      const targetSpeed=Math.min(cap,limit),steer=-clamp(error*style.steer,-1,1);
      const dangerLook=steepApproach?nav.slopeDangerLook:nav.cornerDangerLook;
      const close=nav.point(position.distance+nav.direction*dangerLook);
      const closeBend=Math.abs(angle(close.yaw-near.yaw))/Math.max(1,dangerLook-2);
      const sideways=s.vx*leftX+s.vz*leftZ;
      const projectedEdge=Math.abs(lateral+sideways*.55)>room+.3 && lateral*sideways>0 && Math.abs(sideways)>1;
      const trafficBrake=Number.isFinite(limit) && speed>limit+1.2;
      const cornerBrake=closeBend>.02 && speed>cap+(steepApproach?nav.slopeBrakeBuffer:nav.cornerBrakeBuffer)*style.brake;
      const dangerBrake=speed>5 && (projectedEdge || Math.abs(error)>.8);
      const brakeReason=trafficBrake?'traffic':dangerBrake?'edge':cornerBrake?'corner':null;
      let throttle=brakeReason?-.5:speed>targetSpeed?0:1;
      // A few drivers briefly rotate into a genuinely sharp bend. This uses
      // the same rear-wheel handbrake as the player, never a speed/position
      // override. Avoid traffic, edges, gaps and airborne or unverified cars.
      handbrakeCooldown=Math.max(0,handbrakeCooldown-dt);
      const turn=angle(close.yaw-near.yaw),alreadyTurning=Math.abs(angle(near.yaw-here.yaw))>.035;
      const forward=s.vx*Math.sin(s.yaw)+s.vz*Math.cos(s.yaw);
      const safeToSlide=s.grounded>=3 && s.routeValid!==false && mode==='line' && !trafficBrake && !dangerBrake &&
        !nav.isGap(here.index) && !nav.isGap(target.index) && Math.abs(lateral)<room*.65 &&
        Math.abs(here.y-close.y)<.3 && Math.abs(here.y-target.y)<.3 && Math.abs(s.pitch??0)<.12 &&
        !nearby.some(other=>other.ahead> -4 && other.ahead<10) && forward>6 && speed>7 && speed<19;
      if(handbrakeTime>0 && !safeToSlide)handbrakeTime=0;
      if(handbrakeTime<=0 && handbrakeCooldown<=0 && style.handbrake>0 && safeToSlide && !cornerBrake &&
        alreadyTurning && closeBend>.075 && Math.abs(error)>.065 && error*turn>0){
        handbrakeTime=.085;handbrakeCooldown=style.handbrakeCadence*(.5/style.handbrake);
      }
      const handbrake=handbrakeTime>0;
      if(handbrake){handbrakeTime=Math.max(0,handbrakeTime-dt);throttle=Math.min(throttle,.35);}
      // Decide once per sustained jump, not on every frame. A brief lost
      // wheel contact or a momentary touchdown does not reroll the choice.
      let airborneCoasting=false;
      if(s.grounded>0){seenGround=true;airTime=0;landingTime+=dt;if(landingTime>=.15)jumpPower=null;}
      else if(seenGround){landingTime=0;airTime+=dt;if(airTime>=.1){if(jumpPower===null)jumpPower=random()>=.9;throttle=jumpPower?1:0;airborneCoasting=!jumpPower;}}
      const aim=tangentFallback?{x:s.x+Math.sin(desiredYaw)*look,y:s.y+.25,z:s.z+Math.cos(desiredYaw)*look}:
        {x:tx,y:window.TS2.heightAcross(target,window.TS2.lateralU(target,lane*nav.direction))+.3,z:tz};
      intent={mode,lane,targetSpeed,target:targetId,nearby:nearby.length,brakeReason,
        throttle,steer,handbrake,airborneCoasting,headingError:error,curvature:bend,nearCurvature:closeBend,lateral,lookAhead:look,routeDistance:position.distance,routeOffset:Math.sqrt(position.score??0),
        aim,aimSection:target.index,aimKind:tangentFallback?'track tangent':'look-ahead point'};
      return {throttle,steer,handbrake};
    }
    function reset(state){
      const position=nav.locate(state),centre=nav.point(position.distance);
      lane=(state.x-centre.x)*Math.cos(centre.yaw)-(state.z-centre.z)*Math.sin(centre.yaw);hold=0;passing=null;handbrakeTime=0;handbrakeCooldown=0;
      intent={mode:'line',lane,targetSpeed:0,target:null};seenGround=(state.grounded??0)>0;airTime=0;landingTime=0;jumpPower=null;
    }
    return {input,reset,setPersonality(values){style=personality(values,index);},get style(){return style;},get intent(){return intent;}};
  }
  // A rolling six-second movement window ignores collision jitter and needs
  // sustained acceleration, so cars waiting without throttle are left alone.
  const STUCK_SECONDS=6;
  function updateStuck(car,state,throttle,dt){
    const reset=()=>{car.stuck=0;car.stuckDemand=0;car.stuckAnchor=null;};
    if(!(state.grounded>0)){if((state.airTime??0)>.3)reset();return false;}
    const anchor=car.stuckAnchor,limit=Math.max(1,car.sim.size.length*.65);
    if(!anchor || Math.hypot(state.x-anchor.x,state.z-anchor.z)>limit){reset();car.stuckAnchor={x:state.x,z:state.z};}
    car.stuck+=dt;if(throttle>.2)car.stuckDemand+=dt;
    if(car.stuck+1e-8<STUCK_SECONDS)return false;
    if(car.stuckDemand>=STUCK_SECONDS*.5 && Math.hypot(state.vx,state.vz)<1.5)return true;
    reset();return false;
  }
  // A bounded, symmetric oriented-box contact; vertical separation prevents
  // cars on stacked bridges from colliding. No damage or full physics engine.
  function collide(a,b,sizeA,sizeB){
    if(Math.abs(a.y-b.y)>(a.scale+b.scale)*.8)return false;
    const axes=[a.yaw,b.yaw].flatMap(yaw=>[{x:Math.cos(yaw),z:-Math.sin(yaw)},{x:Math.sin(yaw),z:Math.cos(yaw)}]);
    const extent=(state,size,axis)=>{
      const c=Math.cos(state.yaw),s=Math.sin(state.yaw);
      return size.width*.5*Math.abs(c*axis.x-s*axis.z)+size.length*.5*Math.abs(s*axis.x+c*axis.z);
    };
    const dx=b.x-a.x,dz=b.z-a.z;let depth=Infinity,normal=null;
    for(const axis of axes){
      const signed=dx*axis.x+dz*axis.z,overlap=extent(a,sizeA,axis)+extent(b,sizeB,axis)-Math.abs(signed);
      if(overlap<=0)return false;
      if(overlap<depth){depth=overlap;normal={x:axis.x*(signed<0?-1:1),z:axis.z*(signed<0?-1:1)};}
    }
    const correction=Math.min(depth+.001,.25*Math.min(a.scale,b.scale));
    a.x-=normal.x*correction*.5;a.z-=normal.z*correction*.5;b.x+=normal.x*correction*.5;b.z+=normal.z*correction*.5;
    const closing=(b.vx-a.vx)*normal.x+(b.vz-a.vz)*normal.z;
    if(closing<0){if(closing<-.8){const events=a.soundImpacts??(a.soundImpacts={});events.metal=Math.max(events.metal??0,-closing);}const impulse=-closing*.55;a.vx-=normal.x*impulse;a.vz-=normal.z*impulse;b.vx+=normal.x*impulse;b.vz+=normal.z*impulse;}
    return true;
  }
  window.TrackAI={create,createDriver,updateStuck,collide,DIFFICULTIES,STYLES,PERSONALITY_FIELDS,defaultPersonality,personality,STUCK_SECONDS};
})();
