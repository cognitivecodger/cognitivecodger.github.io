/* Lightweight arcade vehicle simulation. No Three.js or physics-engine dependency. */
(function () {
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  // Extra extension beyond the unloaded spring length. Keep tyres close to the
  // chassis in flight; the loaded ride height and compression stay unchanged.
  const CONFIG=Object.freeze({step:1/120,gravity:16,restLength:.76,travel:.04,stiffness:140,damping:17,
    halfTrack:.93,halfAxle:1.22,halfWidth:1.06,halfLength:1.86,maxSpeed:24,reverseSpeed:7});
  const CORNERS=Object.freeze([{name:'FL',x:.93,z:1.22},{name:'FR',x:-.93,z:1.22},
    {name:'RL',x:.93,z:-1.22},{name:'RR',x:-.93,z:-1.22}]);
  const routeCache=new WeakMap();
  function routeLinks(runtime){
    if(routeCache.has(runtime))return routeCache.get(runtime);
    const pieces=runtime.pieces,joins=pieces.map((piece,i)=>{
      const next=pieces[(i+1)%pieces.length];
      return !!next && Math.hypot(piece.end.x-next.start.x,piece.end.y-next.start.y,piece.end.z-next.start.z)<.05;
    });
    const links={ids:new Map(pieces.map((piece,i)=>[piece,i])),banked:pieces.map(piece=>(piece.poses??[]).some(pose=>Math.abs(pose.bankLeft??0)+Math.abs(pose.bankRight??0)>1e-6)),next:i=>joins[i]?(i+1)%pieces.length:null,previous:i=>{const before=(i+pieces.length-1)%pieces.length;return joins[before]?before:null;}};
    routeCache.set(runtime,links);return links;
  }
  const ENGINES=Object.freeze([
    {id:'standard',label:'Standard',maxSpeed:24,acceleration:10,description:'The original balance of acceleration and speed.'},
    {id:'sport',label:'Sport',maxSpeed:30,acceleration:12,description:'Higher top speed and stronger acceleration.'},
    {id:'torque',label:'High torque',maxSpeed:21,acceleration:13,description:'Strongest acceleration, with a lower speed limit.'}
  ].map(Object.freeze));
  const response=(grip=1,lateralGrip=1,brakeGrip=1,drag=1)=>Object.freeze({grip,lateralGrip,brakeGrip,drag});
  const NEUTRAL_TYRES=response();
  // Multipliers act on each loaded wheel's actual material, including grass.
  // Ice deliberately keeps its base response for every tyre choice.
  const TYRES=Object.freeze([
    {id:'allround',label:'All-round',description:'Original handling on every surface.',surfaces:{}},
    {id:'road',label:'Road',description:'More road grip; less traction on loose and soft ground.',surfaces:{
      tarmac:response(1.04,1.2,1.1),wood:response(1.02,1.1,1.05),gravel:response(.9,.82,.9,1.1),
      dirt:response(.88,.8,.88,1.1),mud:response(.85,.75,.85,1.1),grass:response(.88,.8,.88,1.1)}},
    {id:'rally',label:'Rally',description:'A small road-grip trade for better loose-surface control.',surfaces:{
      tarmac:response(.98,.98,1),wood:response(.98,.98,1),gravel:response(1.1,1.18,1.12,.85),
      dirt:response(1.12,1.18,1.12,.82),mud:response(1.06,1.12,1.06,.9),grass:response(1.1,1.12,1.08,.85)}},
    {id:'offroad',label:'Off-road',description:'Best soft-ground ability, with less road cornering grip.',surfaces:{
      tarmac:response(.94,.88,.94),wood:response(.94,.88,.94),gravel:response(1.08,1.12,1.08,.85),
      dirt:response(1.16,1.22,1.15,.75),mud:response(1.08,1.22,1.12,.85),grass:response(1.16,1.2,1.12,.75)}}
  ].map(tyres=>Object.freeze({...tyres,surfaces:Object.freeze(tyres.surfaces)})));
  const SUSPENSIONS=Object.freeze([
    {id:'standard',label:'Standard',restLength:.76,travel:.04,stiffness:1,damping:1,angularDamping:1,description:'The original suspension and landing response.'},
    {id:'firm',label:'Firm',restLength:.74,travel:.025,stiffness:1.25,damping:1.18,angularDamping:1.15,description:'Shorter, firmer travel for road driving.'},
    {id:'longtravel',label:'Long travel',restLength:.82,travel:.1,stiffness:.88,damping:1.12,angularDamping:1.08,description:'More compliant travel for hills and landings.'}
  ].map(Object.freeze));
  const DRIVETRAINS=Object.freeze([
    {id:'awd',label:'Four-wheel drive (4WD)',shortLabel:'4WD',front:.5,rear:.5,description:'Shares power and cornering grip across both axles for stable, neutral handling.'},
    {id:'fwd',label:'Front-wheel drive (FWD)',shortLabel:'FWD',front:1,rear:0,description:'Front tyres pull and steer. Heavy throttle pushes wide in corners; easing off restores turn-in.'},
    {id:'rwd',label:'Rear-wheel drive (RWD)',shortLabel:'RWD',front:0,rear:1,description:'Rear tyres push. Heavy throttle can step the tail out; ease off to regain grip. Tight low-speed turns allow power donuts.'}
  ].map(Object.freeze));
  const STEERINGS=Object.freeze([
    {id:'standard',label:'Standard',angle:1,response:12,yawResponse:14,cornering:1,description:'The current steering response and cornering ability.'},
    {id:'sport',label:'Sport',angle:1.06,response:16,yawResponse:17,cornering:1.08,description:'Quicker turn-in and 8% more cornering capacity, with a slightly tighter steering lock.'},
    {id:'competition',label:'Competition',angle:1.12,response:20,yawResponse:20,cornering:1.16,description:'Fastest response and 16% more cornering capacity. Tyres and slippery ground still set the limit.'}
  ].map(Object.freeze));
  const STEERING_ASSISTS=Object.freeze([
    {id:'off',label:'Off',strength:0,description:'Direct driver control; the current handling baseline.'},
    {id:'basic',label:'Basic',strength:.55,description:'Eases excessive steering and helps prevent the tail breaking loose under power.'},
    {id:'advanced',label:'Advanced',strength:1,description:'Stronger grip-aware steering and slide recovery. Steps aside for handbrake turns and deliberate power donuts.'}
  ].map(Object.freeze));
  const PRESETS=Object.freeze([
    {id:'balanced',label:'Balanced',engine:'standard',tyres:'allround',suspension:'standard',description:'The current car: a reference for every comparison.'},
    {id:'roadSport',label:'Road Sport',engine:'sport',tyres:'road',suspension:'firm',description:'Fast and grippy on tarmac; weaker on dirt, mud and grass.'},
    {id:'rally',label:'Rally',engine:'standard',tyres:'rally',suspension:'longtravel',description:'Mixed-surface control and compliant suspension, at normal top speed.'},
    {id:'offroad',label:'Off-road',engine:'torque',tyres:'offroad',suspension:'longtravel',description:'Strong pull and soft-ground ability, with a lower top speed and less road grip.'}
  ].map(preset=>Object.freeze({...preset,drivetrain:'awd',steering:'standard',assist:'off'})));
  function resolveBuild(value='balanced') {
    const selection=typeof value==='string'?PRESETS.find(p=>p.id===value):value;
    if(!selection || typeof selection!=='object')throw Error('Choose a valid vehicle setup.');
    const engine=ENGINES.find(p=>p.id===selection.engine),tyres=TYRES.find(p=>p.id===selection.tyres),suspension=SUSPENSIONS.find(p=>p.id===selection.suspension),drivetrain=DRIVETRAINS.find(p=>p.id===(selection.drivetrain??'awd')),
      steering=STEERINGS.find(p=>p.id===(selection.steering??'standard')),assist=STEERING_ASSISTS.find(p=>p.id===(selection.assist??'off'));
    if(!engine || !tyres || !suspension || !drivetrain || !steering || !assist)throw Error('Choose valid vehicle components, steering and steering assist.');
    const components={engine,tyres,suspension,drivetrain,steering,assist},parts=Object.fromEntries(Object.entries(components).map(([key,item])=>[key,item.id]));
    const preset=PRESETS.find(p=>Object.entries(parts).every(([key,value])=>p[key]===value))??null;
    return Object.freeze({...components,preset,label:preset?.label??'Custom',selection:Object.freeze(parts)});
  }
  function tyreResponse(tyres,surface='tarmac') {return tyres.surfaces[surface==='road'||surface==='asphalt'?'tarmac':surface]??NEUTRAL_TYRES;}
  function dimensions(scale=1,suspension='standard') {
    if(!Number.isFinite(scale) || scale<.5 || scale>1.5)throw Error('Car size must be between 50% and 150%.');
    const springs=SUSPENSIONS.find(p=>p.id===suspension);if(!springs)throw Error('Choose a valid suspension.');
    return Object.freeze({scale,width:CONFIG.halfWidth*2*scale,length:CONFIG.halfLength*2*scale,
      restLength:springs.restLength*scale,travel:springs.travel*scale,maxLength:(springs.restLength+springs.travel)*scale,wheelRadius:.29*scale,
      stiffness:CONFIG.stiffness*springs.stiffness/scale,damping:CONFIG.damping*springs.damping/Math.sqrt(scale)});
  }
  function mount(state,corner) {
    const cy=Math.cos(state.yaw),sy=Math.sin(state.yaw),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch),cr=Math.cos(state.roll),sr=Math.sin(state.roll);
    const scale=state.scale??1,x=corner.x*cr*scale,y=(corner.x*sr*cp+corner.z*sp)*scale,z=(corner.z*cp-corner.x*sr*sp)*scale;
    return {x:state.x+x*cy+z*sy,y:state.y+y,z:state.z-x*sy+z*cy};
  }
  function wheelMotion(state,contact) {
    const yaw=state.yaw??0,corner=CORNERS.find(c=>c.name===contact.name)??{x:0,z:0},scale=state.scale??.5;
    const x=Number.isFinite(contact.anchor?.x)?contact.anchor.x-(state.x??0):(corner.x*Math.cos(yaw)+corner.z*Math.sin(yaw))*scale;
    const z=Number.isFinite(contact.anchor?.z)?contact.anchor.z-(state.z??0):(-corner.x*Math.sin(yaw)+corner.z*Math.cos(yaw))*scale;
    const vx=(state.vx??0)+(state.yawRate??0)*z,vz=(state.vz??0)-(state.yawRate??0)*x;
    const heading=yaw-(contact.name[0]==='F'?(state.steering??0):0);
    return {forward:vx*Math.sin(heading)+vz*Math.cos(heading),lateral:-vx*Math.cos(heading)+vz*Math.sin(heading)};
  }
  function makeWorld(buffers) {
    const cellSize=6,supportCells=new Map(),ceilingCells=new Map(),wallCells=new Map(),walls=[],surfaces=[],wallKeys=new Map();
    let minY=Infinity,maxY=-Infinity;
    const insert=(cells,item)=>{
      for(let x=Math.floor(item.minX/cellSize);x<=Math.floor(item.maxX/cellSize);x++)for(let z=Math.floor(item.minZ/cellSize);z<=Math.floor(item.maxZ/cellSize);z++){
        const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(item);
      }
    };
    for(const buffer of Object.values(buffers)) {
      if(!buffer?.positions || buffer.collisionDisabled)continue;const p=buffer.positions,ranges=buffer===buffers.road?buffer.pieceRanges??[]:[];
      let rangeIndex=0;
      for(let i=0;i<p.length;i+=9) {
        while(rangeIndex<ranges.length && i/9>=ranges[rangeIndex].start+ranges[rangeIndex].count)rangeIndex++;
        const range=ranges[rangeIndex],roadPiece=range && i/9>=range.start?range.pieceIndex:undefined;
        const a={x:p[i],y:p[i+1],z:p[i+2]},b={x:p[i+3],y:p[i+4],z:p[i+5]},c={x:p[i+6],y:p[i+7],z:p[i+8]};
        const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
        const sign=buffer.collisionSigns?.[i/9]??1;
        const role=buffer.collisionRoles?.[i/9];
        const nx=(uy*vz-uz*vy)*sign,ny=(uz*vx-ux*vz)*sign,nz=(ux*vy-uy*vx)*sign,length=Math.hypot(nx,ny,nz);
        if(length<1e-10)continue;
        const bounds={minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z),minY:Math.min(a.y,b.y,c.y),maxY:Math.max(a.y,b.y,c.y)};
        minY=Math.min(minY,bounds.minY);maxY=Math.max(maxY,bounds.maxY);
        if(Math.abs(ny/length)>.22 && role!=='wall') {
            const tag=buffer.surfaceTypes?.[i/9]??buffer.surface;
            const material=buffer.surfaceTypes?window.TS2.surfaceType(tag)??window.TS2.SURFACE_TYPES[0]:null;
            const roughness=buffer.roughnessValues?.[i/9]??0;
            const triangle={...bounds,a,b,c,road:role==='support' || buffer===buffers.road,roadPiece,...(buffer===buffers.kerbs?{kerb:true}:{}),normal:{x:nx/length,y:ny/length,z:nz/length},denom:ux*vz-uz*vx,...(roughness>0?{roughness}:{}),
            ...(tag?{surface:material?.id??tag,surfaceTag:tag,grip:buffer.grip??material?.grip??1,drag:buffer.drag??material?.drag??0,
              lateralGrip:buffer.lateralGrip??material?.lateralGrip??buffer.grip??1,brakeGrip:buffer.brakeGrip??material?.brakeGrip??1}:{})};
          if(Math.abs(triangle.denom)>1e-10){if(ny>0 && (!role || role==='support')){surfaces.push(triangle);insert(supportCells,triangle);
            if(buffer.solidSurface)insert(ceilingCells,{...triangle,normal:{x:-triangle.normal.x,y:-triangle.normal.y,z:-triangle.normal.z}});
          }else if(ny<0 && (!role || role==='ceiling'))insert(ceilingCells,triangle);}
        }
        if(Math.abs(ny/length)<.65 && (!role || role==='wall')) {
          let pair=[a,b],distance=0;
          for(const [u,v] of [[a,b],[b,c],[c,a]]){const d=Math.hypot(v.x-u.x,v.z-u.z);if(d>distance){pair=[u,v];distance=d;}}
          if(distance<1e-6)continue;
          // Longitudinal slab sides are inward-facing; exposed end caps must
          // block approaches from either side without changing those walls.
          const normalLength=Math.hypot(nx,nz),oneSided=(role==='wall' && buffer.collisionTwoSided?.[i/9]!==true) || buffer.collisionOneSided?.[i/9]===true;
          const normal={x:nx/normalLength,z:nz/normalLength};
          const [u,v]=pair,keys=[`${Math.round(u.x*1e5)},${Math.round(u.z*1e5)}`,`${Math.round(v.x*1e5)},${Math.round(v.z*1e5)}`].sort();
          const key=keys.join('|')+(oneSided?`:${Math.round(normal.x*1e5)},${Math.round(normal.z*1e5)}`:':both');
          const bands=wallKeys.get(key)??[],old=bands.find(w=>w.minY<=bounds.maxY+.02 && w.maxY>=bounds.minY-.02);
          if(old){for(const axis of ['X','Y','Z']){old['min'+axis]=Math.min(old['min'+axis],bounds['min'+axis]);old['max'+axis]=Math.max(old['max'+axis],bounds['max'+axis]);}old.triangles.push([a,b,c]);continue;}
          const wall={...bounds,x:(u.x+v.x)/2,z:(u.z+v.z)/2,tx:(v.x-u.x)/distance,tz:(v.z-u.z)/distance,half:distance/2,oneSided,normal,triangles:[[a,b,c]]};
          bands.push(wall);wallKeys.set(key,bands);walls.push(wall);
        }
      }
    }
    walls.forEach(w=>insert(wallCells,w));
    function query(x,z,top,bottom,cells,highest,preferredPiece) {
      let best=null;
      for(const t of cells.get(Math.floor(x/cellSize)+','+Math.floor(z/cellSize))??[]) {
        if(x<t.minX-1e-7 || x>t.maxX+1e-7 || z<t.minZ-1e-7 || z>t.maxZ+1e-7 || t.maxY<bottom || t.minY>top)continue;
        const ux=t.b.x-t.a.x,uz=t.b.z-t.a.z,vx=t.c.x-t.a.x,vz=t.c.z-t.a.z,dx=x-t.a.x,dz=z-t.a.z;
        const u=(dx*vz-dz*vx)/t.denom,v=(ux*dz-uz*dx)/t.denom;
        if(u< -1e-7 || v< -1e-7 || u+v>1.0000001)continue;
        const y=t.a.y+u*(t.b.y-t.a.y)+v*(t.c.y-t.a.y);
        const better=!best || (highest?y>best.y+1e-6:y<best.y-1e-6) || Math.abs(y-best.y)<=1e-6 && Number.isInteger(preferredPiece) && t.roadPiece===preferredPiece && best.roadPiece!==preferredPiece;
        if(y<=top+1e-7 && y>=bottom-1e-7 && better)best={x,y,z,road:t.road,roadPiece:t.roadPiece,...(t.kerb?{kerb:true}:{}),normal:t.normal,...(t.roughness?{roughness:t.roughness}:{}),
          ...(t.surface?{surface:t.surface,surfaceTag:t.surfaceTag,grip:t.grip,drag:t.drag,lateralGrip:t.lateralGrip,brakeGrip:t.brakeGrip}:{})};
      }
      return best;
    }
    function nearbyWalls(a,b,radius) {
      const found=new Set();
      for(let x=Math.floor((Math.min(a.x,b.x)-radius)/cellSize);x<=Math.floor((Math.max(a.x,b.x)+radius)/cellSize);x++)
        for(let z=Math.floor((Math.min(a.z,b.z)-radius)/cellSize);z<=Math.floor((Math.max(a.z,b.z)+radius)/cellSize);z++)
          for(const wall of wallCells.get(x+','+z)??[])found.add(wall);
      return found;
    }
    return {support:(x,z,top,bottom,preferredPiece)=>query(x,z,top,bottom,supportCells,true,preferredPiece),ceiling:(x,z,bottom,top)=>query(x,z,top,bottom,ceilingCells,false),
      nearbyWalls,minY:Number.isFinite(minY)?minY:0,maxY:Number.isFinite(maxY)?maxY:0,stats:{surfaces:surfaces.length,walls:walls.length}};
  }
  const axes=(state,wall)=>[{x:Math.cos(state.yaw),z:-Math.sin(state.yaw)},{x:Math.sin(state.yaw),z:Math.cos(state.yaw)},
    {x:wall.tx,z:wall.tz},{x:-wall.tz,z:wall.tx}];
  function bodyShape(state) {
    const c=Math.cos(state.yaw),s=Math.sin(state.yaw),cp=Math.cos(state.pitch),sp=Math.sin(state.pitch),cr=Math.cos(state.roll),sr=Math.sin(state.roll),scale=state.scale??1;
    const x={x:cr*c-sr*sp*s,y:sr*cp,z:-cr*s-sr*sp*c},y={x:-sr*c-cr*sp*s,y:cr*cp,z:sr*s-cr*sp*c},z={x:cp*s,y:sp,z:cp*c};
    return {x,y,z,scale,offset:{x:y.x*.275*scale,z:y.z*.275*scale}};
  }
  function projected(state,wall,axis,shape) {
    let min=Infinity,max=-Infinity;
    for(const triangle of wall.triangles)for(const p of triangle){const d=p.x*axis.x+p.z*axis.z;min=Math.min(min,d);max=Math.max(max,d);}
    const dot=v=>v.x*axis.x+v.z*axis.z;
    const radius=shape.scale*(CONFIG.halfWidth*Math.abs(dot(shape.x))+.445*Math.abs(dot(shape.y))+CONFIG.halfLength*Math.abs(dot(shape.z)))+.025;
    return {centre:(state.x+shape.offset.x)*axis.x+(state.z+shape.offset.z)*axis.z,radius,min,max};
  }
  function touchesWall(state,wall,shape) {
    // Clip the real face to the pitched/rolled body box. A wall's global
    // height bounds must not turn a distant uphill triangle into a barrier.
    const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
    const planes=[['x',1,CONFIG.halfWidth*shape.scale+.025],['x',-1,CONFIG.halfWidth*shape.scale+.025],
      ['z',1,CONFIG.halfLength*shape.scale+.025],['z',-1,CONFIG.halfLength*shape.scale+.025],['y',1,.725*shape.scale],['y',-1,.175*shape.scale]];
    for(const triangle of wall.triangles) {
      let poly=triangle.map(p=>{const d={x:p.x-state.x,y:p.y-state.y,z:p.z-state.z};return {x:dot(d,shape.x),y:dot(d,shape.y),z:dot(d,shape.z)};});
      for(const [axis,sign,limit] of planes) {
        const next=[];
        for(let i=0;i<poly.length;i++) {
          const a=poly[i],b=poly[(i+1)%poly.length],da=limit-sign*a[axis],db=limit-sign*b[axis];
          if(da>=-1e-9)next.push(a);
          if((da<0)!==(db<0)){const t=da/(da-db);next.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t});}
        }
        poly=next;if(!poly.length)break;
      }
      if(poly.length)return true;
    }
    return false;
  }
  function wallNormal(state,wall,shape) {
    if(wall.oneSided)return {nx:wall.normal.x,nz:wall.normal.z};
    const axis={x:-wall.tz,z:wall.tx},p=projected(state,wall,axis,shape),sign=p.centre>=(p.min+p.max)/2?1:-1;
    return {nx:axis.x*sign,nz:axis.z*sign};
  }
  function heightOverlap(state,wall,y=state.y) {
    const scale=state.scale??1,tilt=(Math.abs(Math.sin(state.pitch))*CONFIG.halfLength+Math.abs(Math.sin(state.roll))*CONFIG.halfWidth)*scale;
    return y-.17*scale-tilt<wall.maxY-.015 && y+.72*scale+tilt>wall.minY+.015;
  }
  function overlap(state,wall,shape=bodyShape(state)) {
    if(!heightOverlap(state,wall))return null;
    for(const axis of axes(state,wall)) {
      const p=projected(state,wall,axis,shape);if(p.centre+p.radius<=p.min || p.centre-p.radius>=p.max)return null;
    }
    if(!touchesWall(state,wall,shape))return null;
    // SAT still tests the finite face, but its tessellation endpoints are not
    // physical end caps. A minimum translation along one of those endpoints
    // can push the car into the next face, cascading metres along the wall.
    // Resolve across the face; actual wall caps supply their own face normal.
    const normal=wallNormal(state,wall,shape),p=projected(state,wall,{x:normal.nx,z:normal.nz},shape);
    return {depth:Math.max(0,p.max+p.radius-p.centre),...normal};
  }
  function sweep(state,from,to,wall,shape) {
    let enter=0,exit=1;
    for(const axis of axes(state,wall)) {
      const p=projected({...state,x:from.x,z:from.z},wall,axis,shape),radius=p.radius+(p.max-p.min)/2,start=p.centre-(p.min+p.max)/2,delta=(to.x-from.x)*axis.x+(to.z-from.z)*axis.z;
      if(Math.abs(delta)<1e-10){if(Math.abs(start)>radius)return null;continue;}
      let a=(-radius-start)/delta,b=(radius-start)/delta;if(a>b)[a,b]=[b,a];
      enter=Math.max(enter,a);
      exit=Math.min(exit,b);if(enter>exit)return null;
    }
    if(enter<0 || enter>1)return null;
    const normal=wallNormal({...state,x:from.x,z:from.z},wall,shape);
    if((to.x-from.x)*normal.nx+(to.z-from.z)*normal.nz>=-1e-10)return null;
    const at=t=>({...state,x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t});
    if(touchesWall(at(0),wall,shape))return null; // Resolve existing overlap separately.
    let low=enter;
    // Narrow the broad swept interval against the actual triangles. Eight
    // samples cover a 120Hz step; binary refinement then locates first contact.
    for(let i=0;i<=8;i++) {
      const time=enter+(Math.min(1,exit)-enter)*i/8;
      if(heightOverlap(state,wall,at(time).y) && touchesWall(at(time),wall,shape)) {
        let high=time;for(let j=0;j<7;j++){const middle=(low+high)/2;if(touchesWall(at(middle),wall,shape))high=middle;else low=middle;}
        return {time:high,...normal};
      }
      low=time;
    }
    return null;
  }
  function resolveWalls(world,state,previous,dt) {
    let from={...previous},to={x:state.x,y:state.y,z:state.z},hits=0;
    const radius=Math.hypot(CONFIG.halfWidth,CONFIG.halfLength,.72)*(state.scale??1)+.06,shape=bodyShape(state);
    const response=(nx,nz)=>{const into=state.vx*nx+state.vz*nz;if(into<0){if(into<-.8){const events=state.soundImpacts??(state.soundImpacts={});events.metal=Math.max(events.metal??0,-into);}state.vx-=into*nx;state.vz-=into*nz;state.vx*=.985;state.vz*=.985;}hits++;};
    for(let iteration=0;iteration<3;iteration++) {
      let first=null;
      for(const wall of world.nearbyWalls(from,to,radius)) {const hit=sweep(state,from,to,wall,shape);if(hit && (!first || hit.time<first.time))first=hit;}
      if(!first)break;
      const t=Math.max(0,first.time-.0001);state.x=from.x+(to.x-from.x)*t;state.z=from.z+(to.z-from.z)*t;
      response(first.nx,first.nz);dt*=1-first.time;from={x:state.x,y:state.y,z:state.z};to={x:state.x+state.vx*dt,y:state.y,z:state.z+state.vz*dt};
    }
    state.x=to.x;state.z=to.z;
    // Use the closest escape face, not buffer iteration order. A shared budget
    // also keeps deep/rotating overlap local instead of applying dozens of
    // corrections in one step or fighting between the two skins of a wall.
    let remaining=.3*(state.scale??1);
    for(let iteration=0;iteration<8 && remaining>1e-7;iteration++) {
      let nearest=null;
      for(const wall of world.nearbyWalls(state,state,radius)){const hit=overlap(state,wall,shape);if(hit && (!nearest || hit.depth<nearest.depth))nearest=hit;}
      if(!nearest)break;
      const move=Math.min(remaining,nearest.depth+.0001);state.x+=nearest.nx*move;state.z+=nearest.nz*move;remaining-=move;response(nearest.nx,nearest.nz);
    }
    return hits;
  }
  function create(world,runtime,index=0,options={}) {
    const build=resolveBuild(options.build??'balanced'),size=dimensions(options.scale??1,build.suspension.id),scale=size.scale;
    const piece=runtime.pieces[index];
    if(!piece || piece.isGap)throw Error('Select a road section to start the test car.');
    if(Math.min(piece.start.width,piece.end.width)<2.4*scale)throw Error(`This car size needs a road at least ${(2.4*scale).toFixed(2)} m wide.`);
    let distance=options.spawnFraction===undefined?Math.min(2.3*scale,piece.length*.5):
      piece.poses.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-piece.poses[i].x,p.z-piece.poses[i].z),0)*clamp(options.spawnFraction,0,1),seed=null;
    for(let i=1;i<piece.poses.length;i++) {
      const a=piece.poses[i-1],b=piece.poses[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(distance<=length || i===piece.poses.length-1){const t=clamp(distance/Math.max(length,1e-9),0,1),dyaw=((b.yaw-a.yaw+540)%360)-180;
        seed={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,yaw:(a.yaw+dyaw*t)*Math.PI/180};break;}
      distance-=length;
    }
    // Racing supplies a road-following grid pose, including the lane's actual
    // bank height. Keep this immutable seed for explicit full resets.
    if(options.spawnPose) {
      const p=options.spawnPose;
      if(!['x','y','z','yaw'].every(key=>Number.isFinite(p[key])))throw Error('The starting position is invalid.');
      seed={x:p.x,y:p.y,z:p.z,yaw:p.yaw*Math.PI/180};
    }
    else if(seed && options.direction===-1)seed.yaw+=Math.PI;
    if(!seed)throw Error('This section has no usable road surface.');
    const wheelFeedback=()=>({yawRate:0,cornerYawRate:0,frontGripLoss:0,rearGripLoss:0,frontWheelSlip:0,rearWheelSlip:0,wheelSpins:{FL:0,FR:0,RL:0,RR:0}});
    const state={...seed,...wheelFeedback(),scale,trackPiece:null,routePiece:index,routeValid:false,vx:0,vy:0,vz:0,pitch:0,roll:0,pitchRate:0,rollRate:0,steering:0,contacts:[],grounded:0,airTime:0,collisions:0,wheelSpin:0,frontWheelSpin:0,rearWheelSpin:0,slideYawRate:0,handbrakeActive:false,handbrakeDirection:0,wheelSlip:0,brakeDemand:0,engineRPM:1000,engineLoad:0,resets:0,recoveries:0};
    const links=routeLinks(runtime),rideHeight=size.restLength-CONFIG.gravity/size.stiffness,maxLandingAdvance=3;
    // Optional arcade difficulty tuning scales forward engine pull only;
    // braking, reverse, top speed, traction and collision stay physical.
    const accelerationMultiplier=Number.isFinite(options.accelerationMultiplier)?clamp(options.accelerationMultiplier,.5,1.25):1;
    let accumulator=0,lastRoad=null,routeIndex=index,recoveryReason=null,bankResponse=0;
    let surfaceExitWindow=0,grassTrip=null,flightAnchor=null,flightTrip=null;
    const roadHistory=[];
    function gateCoordinates(point,pose){
      const yaw=pose.yaw*Math.PI/180,dx=point.x-pose.x,dz=point.z-pose.z;
      return {along:dx*Math.sin(yaw)+dz*Math.cos(yaw),across:dx*Math.cos(yaw)-dz*Math.sin(yaw)};
    }
    function insideGate(point,pose,gap=false){
      const {across}=gateCoordinates(point,pose),side=across<0?-1:1;
      if(Math.abs(across)>window.TS2.halfWidth(pose,side)+.15)return false;
      const roadY=window.TS2.heightAcross(pose,window.TS2.lateralU(pose,across))+runtime.settings.tarmacDepth*.5;
      // A jump can pass above a join. A lower crossing road must never pass
      // the gate of the bridge overhead. A gap's exit is a virtual air gate.
      return gap || point.y-rideHeight>=roadY-Math.max(.35,.6*scale);
    }
    function surfacePathTo(target,grassY){
      const level=pose=>Math.abs(pose.y+runtime.settings.tarmacDepth*.5-grassY)<=.8;
      // Rejoin only a nearby connected section, with no intervening gap or
      // raised/lowered deck. Race gates remain independent of this cursor.
      for(const direction of [-1,1]){
        let current=routeIndex,distance=0;
        for(let step=0;step<64;step++){
          // More than two joins are allowed only when the intermediate pieces
          // are short enough to fit under the car's footprint.
          if(step>=2 && distance>size.length+.35)break;
          if(runtime.pieces[current].isGap)break;
          const next=direction===1?links.next(current):links.previous(current);
          if(next===null || next===routeIndex || runtime.pieces[next].isGap)break;
          const exit=direction===1?runtime.pieces[current].end:runtime.pieces[current].start;
          const entry=direction===1?runtime.pieces[next].start:runtime.pieces[next].end;
          if(!level(exit) || !level(entry))break;
          if(next===target)return true;
          if(runtime.pieces[next].poses.some(p=>!level(p)))break;
          distance+=runtime.pieces[next].length;
          current=next;
        }
      }
      return false;
    }
    function updateSurfaceRejoin(roadHits,owners,dt){
      if(!options.allowSurfaceRejoin)return;
      const grass=state.contacts.filter(c=>c.force>.05 && c.hit?.surface==='grass' && !c.hit.road).map(c=>c.hit);
      const groundY=runtime.settings.groundY??0;
      const expected=owners.length>0 && owners.every(owner=>onRoute(owner,state));
      if(state.routeValid && expected){
        // Arm only while actually supported on the expected surface-level
        // road. A bridge landing cannot authorise a grass re-entry.
        surfaceExitWindow=roadHits.every(hit=>Math.abs(hit.y-groundY)<=.8) ? .75 : 0;
        if(!grass.length && roadHits.length===4 && owners.every(owner=>owner===routeIndex))grassTrip=null;
      }else surfaceExitWindow=Math.max(0,surfaceExitWindow-dt);
      if(!grassTrip && grass.length && surfaceExitWindow>0 && (expected || !owners.length)){
        grassTrip={height:grass.reduce((sum,hit)=>sum+hit.y,0)/grass.length,withoutGrass:0};
      }
      if(!grassTrip)return;
      if(grass.length){
        if(grass.some(hit=>Math.abs(hit.y-grassTrip.height)>.5)){grassTrip=null;return;}
        grassTrip.withoutGrass=0;
      }else grassTrip.withoutGrass+=dt;
      if(grassTrip.withoutGrass>.75){grassTrip=null;return;}
      if(roadHits.length===4 && owners.length===4){
        const target=forwardHeading(state,roadHits).index;
        if(roadHits.every(hit=>Math.abs(hit.y-grassTrip.height)<=.8) && surfacePathTo(target,grassTrip.height)){
          const previous=routeIndex;routeIndex=target;
          if(owners.every(owner=>onRoute(owner,state))){state.lastRouteRejoin={from:previous,to:target,kind:'grass'};grassTrip=null;surfaceExitWindow=0;flightTrip=null;flightAnchor=null;}
          else routeIndex=previous;
        }
      }
    }
    // On a continuous, approximately level run, reaching a nearby connected
    // section is enough even if the car passed outside the join planes. Compare
    // the full intervening road with the last trusted support height so a fall
    // onto a lower deck cannot authorise a shortcut.
    function levelNearbyPath(trip,destination,roadHits,direction){
      if(!Number.isFinite(trip.roadY) || !roadHits.every(hit=>Math.abs(hit.y-trip.roadY)<=.8))return false;
      const cached=trip.levelPathCache?.get(destination);if(cached!==undefined)return cached;
      const remember=value=>{if(!trip.levelPathCache)trip.levelPathCache=new Map();trip.levelPathCache.set(destination,value);return value;};
      const level=pose=>{
        const heights=[-1,0,1].map(u=>window.TS2.heightAcross(pose,u)+runtime.settings.tarmacDepth*.5);
        return trip.roadY>=Math.min(...heights)-.8 && trip.roadY<=Math.max(...heights)+.8;
      };
      for(let i=0;i<destination;i++){
        const piece=runtime.pieces[trip.path[i]];if(piece.isGap)return remember(false);
        if(i===0){
          // Inspect only the remaining part of the departure piece.
          let closest=0,best=Infinity;
          for(let j=0;j<piece.poses.length;j++){
            const pose=piece.poses[j],distance=(pose.x-trip.departure.x)**2+(pose.z-trip.departure.z)**2;
            if(distance<best){best=distance;closest=j;}
          }
          const poses=direction===1?piece.poses.slice(Math.max(0,closest-1)):piece.poses.slice(0,Math.min(piece.poses.length,closest+2));
          if(poses.some(pose=>!level(pose)))return remember(false);
        }else if(piece.poses.some(pose=>!level(pose)))return remember(false);
      }
      const target=runtime.pieces[trip.path[destination]];
      return remember(!target.isGap && level(direction===1?target.start:target.end));
    }
    // Track a bounded excursion over at most three connected sections in race
    // direction. Rejoin after a secure landing via either a verified airborne
    // path or the independent same-level connected-road check above.
    function updateNearbyLanding(previous,roadHits,owners){
      if(!options.allowSurfaceRejoin)return;
      const direction=options.direction===-1?-1:1;
      const expected=owners.length>0 && owners.every(owner=>onRoute(owner,state));
      if(!flightTrip && state.routeValid && expected){
        flightAnchor={route:routeIndex,point:{x:previous.x,y:previous.y,z:previous.z},roadY:roadHits.reduce((sum,hit)=>sum+hit.y,0)/roadHits.length};
      }
      if(!flightTrip && flightAnchor && (!owners.length || !expected)){
        // Connected links wrap at a closed track seam, including auto-close.
        const path=[flightAnchor.route];
        while(path.length<=maxLandingAdvance){
          const current=path[path.length-1],next=direction===1?links.next(current):links.previous(current);
          if(next===null || path.includes(next))break;
          path.push(next);
        }
        if(path.length>=2)flightTrip={origin:flightAnchor.route,path,passed:0,grass:false,last:flightAnchor.point,departure:flightAnchor.point,roadY:flightAnchor.roadY};
        flightAnchor=null;
      }
      if(!flightTrip)return;
      const trip=flightTrip;
      if(state.contacts.some(c=>c.force>.05 && c.hit?.surface==='grass' && !c.hit.road))trip.grass=true;
      let afterTime=-1;
      while(trip.passed<trip.path.length-1){
        const piece=runtime.pieces[trip.path[trip.passed]];
        const pose=direction===1?piece.end:piece.start;
        const a=gateCoordinates(trip.last,pose).along*direction,b=gateCoordinates(state,pose).along*direction;
        if(a>1e-7 || b< -1e-7 || b-a<1e-9)break;
        const t=clamp(-a/(b-a),0,1);if(t<afterTime-1e-8)break;
        const point={x:trip.last.x+(state.x-trip.last.x)*t,y:trip.last.y+(state.y-trip.last.y)*t,z:trip.last.z+(state.z-trip.last.z)*t};
        const across=gateCoordinates(point,pose).across,side=across<0?-1:1,half=window.TS2.halfWidth(pose,side);
        const lateral=clamp(across,-window.TS2.halfWidth(pose,-1),window.TS2.halfWidth(pose,1));
        const roadY=window.TS2.heightAcross(pose,window.TS2.lateralU(pose,lateral))+runtime.settings.tarmacDepth*.5;
        if(Math.abs(across)>half+Math.max(2,half) || (!piece.isGap && point.y-rideHeight<roadY-Math.max(.35,.6*scale)))break;
        trip.passed++;afterTime=t;
      }
      trip.last={x:state.x,y:state.y,z:state.z};
      let destination=-1;
      if(owners.length===4 && roadHits.length===4){
        const target=owners.every(owner=>owner===owners[0])?owners[0]:forwardHeading(state,roadHits).index;
        const candidate=trip.path.indexOf(target);
        if(candidate>=1){
          // Four wheels may straddle a real join, especially on short pieces.
          const saved=routeIndex;routeIndex=target;
          if(owners.every(owner=>onRoute(owner,state)))destination=candidate;
          routeIndex=saved;
        }
      }
      const cursor=trip.path.indexOf(routeIndex);
      const gap=destination>=1 && trip.path.slice(0,destination).some(index=>runtime.pieces[index].isGap);
      if(destination>=1 && cursor>=0 && cursor<destination && roadHits.length===4){
        const airborne=trip.passed>=destination && !(trip.grass && gap);
        const nearby=!airborne && levelNearbyPath(trip,destination,roadHits,direction);
        if(airborne || nearby){
          routeIndex=trip.path[destination];state.lastRouteRejoin={from:trip.origin,to:routeIndex,kind:nearby?'nearby':trip.grass?'grass':'landing'};
          flightTrip=null;flightAnchor=null;grassTrip=null;surfaceExitWindow=0;return;
        }
      }
      // Keep the last trusted excursion while the car is on a nearby rejected
      // section, so it can still be recognised after settling or manoeuvring.
      // Returning to the accepted route, or reaching an unrelated road, ends it.
      if(roadHits.length===4 && owners.length===4 && (expected || destination<0)){flightTrip=null;flightAnchor=null;}
    }
    function updateRoute(previous,dt=0){
      const roadHits=state.contacts.filter(c=>c.hit?.road && c.force>.05).map(c=>c.hit),owners=roadHits.map(h=>h.roadPiece).filter(Number.isInteger);
      updateNearbyLanding(previous,roadHits,owners);
      updateSurfaceRejoin(roadHits,owners,dt);
      const canTraverse=!owners.length || state.routeValid || owners.some(owner=>onRoute(owner,state));
      let afterTime=-1;
      // Ordered gate crossings, not nearest-road searches, advance the cursor.
      // Several tiny sections may fit into one fixed step; cap the per-step
      // route traversal work independently of track size.
      for(let count=0;canTraverse && count<Math.min(64,runtime.pieces.length);count++){
        const piece=runtime.pieces[routeIndex],events=[];
        for(const [direction,pose,next] of [[1,piece.end,links.next(routeIndex)],[-1,piece.start,links.previous(routeIndex)]]){
          if(next===null)continue;
          const a=gateCoordinates(previous,pose).along*direction,b=gateCoordinates(state,pose).along*direction;
          if(a>1e-7 || b< -1e-7 || b-a<1e-9)continue;
          const t=clamp(-a/(b-a),0,1);if(t<afterTime-1e-8)continue;
          const point={x:previous.x+(state.x-previous.x)*t,y:previous.y+(state.y-previous.y)*t,z:previous.z+(state.z-previous.z)*t};
          if(insideGate(point,pose,piece.isGap))events.push({t,next});
        }
        if(!events.length)break;
        const event=events.sort((a,b)=>a.t-b.t)[0];if(event.next===routeIndex)break;
        routeIndex=event.next;afterTime=event.t;
      }
      state.routePiece=routeIndex;
      state.trackPiece=owners.includes(routeIndex)?routeIndex:owners[0]??null;
      state.routeValid=roadHits.length>0 && owners.every(owner=>onRoute(owner,state));
    }
    function onRoute(owner,point){
      if(owner===routeIndex)return true;
      // Tyres straddling a real join can belong to both incident sections.
      // Tiny sections/gaps can fit between the axles. Walk only the bounded
      // footprint distance through them, never accept an entire neighbouring run.
      const piece=runtime.pieces[routeIndex],reach=size.length*.5+.35;
      for(const direction of [-1,1]){
        const seam=direction<0?piece.start:piece.end;
        if(Math.abs(gateCoordinates(point,seam).along)>reach || !insideGate(point,seam))continue;
        let distance=0,next=routeIndex;
        for(let count=0;count<64;count++){
          next=direction<0?links.previous(next):links.next(next);
          if(next===null || next===routeIndex || distance>reach)break;
          if(next===owner)return true;
          distance+=runtime.pieces[next].length;
        }
      }
      return false;
    }
    function supportedJoin(owner,point){
      if(owner===routeIndex)return true;
      const reach=size.length*.5+.35,heightTolerance=Math.max(.8,.6*scale);
      for(const direction of [-1,1]){
        let current=routeIndex,distance=0;
        for(let count=0;count<64;count++){
          const piece=runtime.pieces[current],seam=direction<0?piece.start:piece.end,coordinates=gateCoordinates(point,seam);
          if(Math.abs(coordinates.along)>reach || !insideGate(point,seam))break;
          const seamY=window.TS2.heightAcross(seam,window.TS2.lateralU(seam,coordinates.across))+runtime.settings.tarmacDepth*.5;
          // Gate traversal allows an airborne jump above a join. A stationary
          // recovery bookmark must also match its height, so an adjacent road
          // looping over the join cannot become a shortcut.
          if(Math.abs(point.y-rideHeight-seamY)>heightTolerance)break;
          const next=direction<0?links.previous(current):links.next(current);
          if(next===null || next===routeIndex || distance>reach)break;
          if(next===owner)return true;
          distance+=runtime.pieces[next].length;current=next;
        }
      }
      return false;
    }
    function forwardHeading(point,hits) {
      // The contacted mesh owns the road section. This avoids choosing the
      // heading of an unrelated deck at an overlapping bridge/cutting.
      const owners=new Set(hits.map(hit=>hit.roadPiece).filter(Number.isInteger));
      const pieces=owners.size?[...owners].map(i=>runtime.pieces[i]):runtime.pieces;
      let best=null;
      for(const road of pieces) {
        if(!road || road.isGap)continue;
        for(let i=1;i<road.poses.length;i++) {
          const a=road.poses[i-1],b=road.poses[i],dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
          if(length<1e-12)continue;
          const t=clamp(((point.x-a.x)*dx+(point.z-a.z)*dz)/length,0,1),x=a.x+dx*t,z=a.z+dz*t;
          const yaw=(a.yaw+(((b.yaw-a.yaw+540)%360)-180)*t)*Math.PI/180;
          let score=(point.x-x)**2+(point.z-z)**2,heightError=0;
          if(!owners.size) {
            // Legacy/raw buffers have no section ownership. Include height
            // and banking when matching their support back to the route.
            const pose={y:a.y+(b.y-a.y)*t};
            for(const key of ['width','bankLeft','bankRight','bankCurve'])pose[key]=(a[key]??0)+((b[key]??0)-(a[key]??0))*t;
            if(a.bankFlat!==undefined || b.bankFlat!==undefined)pose.bankFlat=(a.bankFlat??0)+((b.bankFlat??0)-(a.bankFlat??0))*t;
            const lateral=(point.x-x)*Math.cos(yaw)-(point.z-z)*Math.sin(yaw);
            const y=window.TS2.heightAcross(pose,window.TS2.lateralU(pose,lateral))+runtime.settings.tarmacDepth*.5+size.restLength-CONFIG.gravity/size.stiffness;
            heightError=point.y-y;score+=heightError*heightError;
          }
          if(!best || score<best.score)best={yaw,score,heightError,index:links.ids.get(road)};
        }
      }
      return best?{...best,yaw:best.yaw+(options.direction===-1?Math.PI:0)}:{yaw:seed.yaw,index:routeIndex,heightError:Infinity};
    }
    function rememberRoad() {
      if(state.grounded!==4 || !state.contacts.every(c=>c.hit?.road && c.force>.05))return;
      if(!state.contacts.every(c=>!Number.isInteger(c.hit.roadPiece) || onRoute(c.hit.roadPiece,state)))return;
      const point={x:state.x,y:state.y,z:state.z,yaw:state.yaw,pitch:state.pitch,roll:state.roll};
      // First identify support at the final live position, then turn a copy
      // along the authored forward direction and re-settle all four wheels.
      const original=CORNERS.map(c=>{const p=mount(state,c);return world.support(p.x,p.z,p.y+.25*scale,p.y-size.maxLength-.1*scale,routeIndex);});
      if(!original.every(hit=>hit?.road))return;
      if(!original.every(hit=>!Number.isInteger(hit.roadPiece) || onRoute(hit.roadPiece,point)))return;
      const frame=forwardHeading(point,original);
      if(!onRoute(frame.index,point) || Math.abs(frame.heightError)>Math.max(.35,.6*scale)){state.routeValid=false;return;}
      point.yaw=frame.yaw;
      const normal=original.reduce((n,h)=>({x:n.x+h.normal.x,y:n.y+h.normal.y,z:n.z+h.normal.z}),{x:0,y:0,z:0});
      point.pitch=Math.atan2(-(normal.x*Math.sin(point.yaw)+normal.z*Math.cos(point.yaw)),normal.y);
      point.roll=Math.atan2(-(normal.x*Math.cos(point.yaw)-normal.z*Math.sin(point.yaw)),normal.y);
      point.y=original.reduce((sum,h)=>sum+h.y,0)/4+size.restLength-CONFIG.gravity/size.stiffness;
      let hits;
      // Re-probe the final body position after wall resolution, then settle a
      // copy at rest. Grass, kerb crowns and airborne probes cannot replace it.
      for(let i=0;i<3;i++) {
        hits=CORNERS.map(c=>{const p=mount({...point,scale},c);return world.support(p.x,p.z,p.y+.25*scale,p.y-size.maxLength-.1*scale,routeIndex);});
        if(!hits.every(hit=>hit?.road && (!Number.isInteger(hit.roadPiece) || onRoute(hit.roadPiece,point))))return;
        point.pitch=Math.atan2((hits[0].y+hits[1].y-hits[2].y-hits[3].y)/2,CONFIG.halfAxle*2*scale);
        point.roll=Math.atan2((hits[0].y+hits[2].y-hits[1].y-hits[3].y)/2,CONFIG.halfTrack*2*scale);
        point.y=hits.reduce((sum,h)=>sum+h.y,0)/4+size.restLength-CONFIG.gravity/size.stiffness;
      }
      const radius=Math.hypot(CONFIG.halfWidth,CONFIG.halfLength,.72)*scale+.06,candidate={...point,scale},shape=bodyShape(candidate);
      if([...world.nearbyWalls(point,point,radius)].some(w=>overlap(candidate,w,shape)))return;
      const top=(.72+Math.abs(Math.sin(point.pitch))*CONFIG.halfLength+Math.abs(Math.sin(point.roll))*CONFIG.halfWidth)*scale;
      for(const corner of [{x:0,z:0},...CORNERS]) {
        const p=mount({...point,scale},corner);
        if(world.ceiling(p.x,p.z,point.y+.1*scale,point.y+top))return;
      }
      if(!supportedJoin(frame.index,point)){state.routeValid=false;return;}
      // A safe, fully supported pose can already be across the next join if
      // the centre missed the live gate by a fraction at the kerb. Reconcile
      // only an immediately connected section, on the crossed side of that
      // join, after the normal road, height and obstruction checks succeed.
      if(frame.index!==routeIndex){
        const piece=runtime.pieces[routeIndex];
        for(const [direction,seam,next] of [[1,piece.end,links.next(routeIndex)],[-1,piece.start,links.previous(routeIndex)]]){
          if(next===frame.index && gateCoordinates(point,seam).along*direction>=0 && insideGate(point,seam)){
            routeIndex=frame.index;state.routePiece=routeIndex;break;
          }
        }
      }
      // The supported road can already be the connected section across a
      // join even when the live route cursor has not crossed its gate yet.
      // Save the verified support section with the pose so recovery cannot
      // restore a car on one section with a cursor left on the previous one.
      lastRoad={point,hits,routeIndex:frame.index,pieceIndex:frame.index};
      const anchor=roadHistory.at(-1)?.point;
      if(!anchor || Math.hypot(point.x-anchor.x,point.y-anchor.y,point.z-anchor.z)>=4){
        roadHistory.push(lastRoad);if(roadHistory.length>16)roadHistory.shift();
      }
      state.trackPiece=frame.index;state.routeValid=true;
    }
    // Project an already verified bookmark onto its own ordered section. Do
    // not search other decks that happen to overlap in the horizontal view.
    function bookmarkFraction(bookmark) {
      const road=runtime.pieces[bookmark.pieceIndex];if(!road || road.isGap)return null;
      const lengths=road.poses.slice(1).map((p,i)=>Math.hypot(p.x-road.poses[i].x,p.y-road.poses[i].y,p.z-road.poses[i].z));
      const total=lengths.reduce((a,b)=>a+b,0);let distance=0,best=null;
      for(let i=0;i<lengths.length;i++){
        const a=road.poses[i],b=road.poses[i+1],dx=b.x-a.x,dz=b.z-a.z,denom=dx*dx+dz*dz;
        if(denom>1e-12){const t=clamp(((bookmark.point.x-a.x)*dx+(bookmark.point.z-a.z)*dz)/denom,0,1),
          x=a.x+dx*t,z=a.z+dz*t,y=a.y+(b.y-a.y)*t+runtime.settings.tarmacDepth*.5+rideHeight,
          score=(bookmark.point.x-x)**2+(bookmark.point.z-z)**2+(bookmark.point.y-y)**2;
          if(!best || score<best.score)best={score,fraction:(distance+lengths[i]*t)/Math.max(1e-9,total)};
        }
        distance+=lengths[i];
      }
      return best?.fraction??null;
    }
    const raceDirection=options.direction===-1?-1:1;
    const beforeIndex=i=>raceDirection===1?links.previous(i):links.next(i);
    const afterIndex=i=>raceDirection===1?links.next(i):links.previous(i);
    function nextJump(bookmark,limit=Math.max(8,size.length*2)) {
      const fraction=bookmarkFraction(bookmark);if(fraction===null)return null;
      let current=bookmark.pieceIndex,distance=(raceDirection===1?1-fraction:fraction)*runtime.pieces[current].length;
      for(let count=0;count<Math.min(64,runtime.pieces.length);count++){
        if(distance>limit)return null;
        const next=afterIndex(current);if(next===null || next===bookmark.pieceIndex)return null;
        const piece=runtime.pieces[next];if(piece.isGap)return {index:next,piece,distance};
        distance+=piece.length;current=next;
      }
      return null;
    }
    function jumpWasMissed(jump) {
      if(state.grounded===4 && state.routeValid)return false;
      if(routeIndex===jump.index)return true;
      const lip=raceDirection===1?jump.piece.start:jump.piece.end,at=gateCoordinates(state,lip);
      return at.along*raceDirection>=-size.length*.25 &&
        Math.abs(at.across)<=window.TS2.halfWidth(lip,at.across<0?-1:1)+Math.max(8,size.width*3);
    }
    function runupContactOnRoute(owner,point,index) {
      if(!Number.isInteger(owner) || owner===index)return true;
      const reach=size.length*.5+.35,heightTolerance=Math.max(.8,.6*scale);
      for(const direction of [-1,1]){
        let current=index,distance=0;
        for(let count=0;count<64;count++){
          const piece=runtime.pieces[current],seam=direction<0?piece.start:piece.end,coordinates=gateCoordinates(point,seam);
          if(Math.abs(coordinates.along)>reach || !insideGate(point,seam))break;
          const seamY=window.TS2.heightAcross(seam,window.TS2.lateralU(seam,coordinates.across))+runtime.settings.tarmacDepth*.5;
          if(Math.abs(point.y-rideHeight-seamY)>heightTolerance)break;
          const next=direction<0?links.previous(current):links.next(current);
          if(next===null || next===index || runtime.pieces[next].isGap || distance>reach)break;
          if(next===owner)return true;
          distance+=runtime.pieces[next].length;current=next;
        }
      }
      return false;
    }
    function verifiedRunup(jump) {
      const sections=[];let current=beforeIndex(jump.index),available=0;
      for(let count=0;current!==null && current!==jump.index && count<Math.min(64,runtime.pieces.length);count++){
        const road=runtime.pieces[current];if(road.isGap)break;
        sections.push({index:current,road,start:available,end:available+road.length});available+=road.length;
        if(available>=32+size.length)break;current=beforeIndex(current);
      }
      const maximum=Math.min(30,available-size.length*.5-.3),minimum=Math.max(4,size.length*1.2,jump.distance+2);
      for(let distance=maximum;distance>=minimum-1e-8;distance-=1){
        const section=sections.find(s=>distance<=s.end+1e-8);if(!section)continue;
        const fraction=clamp(raceDirection===1?1-(distance-section.start)/section.road.length:(distance-section.start)/section.road.length,0,1),
          pose=window.TrackRace.at(section.road,fraction),point={x:pose.x,y:pose.y+runtime.settings.tarmacDepth*.5+rideHeight,z:pose.z,
            yaw:pose.yaw*Math.PI/180+(raceDirection===-1?Math.PI:0),pitch:0,roll:0};
        let hits,valid=true;
        // Settle the car on the actual collision mesh. Require all four
        // wheels on this ordered section or its connected short neighbours,
        // so an overlapping deck cannot become a jump shortcut.
        for(let i=0;i<3;i++){
          hits=CORNERS.map(c=>{const p=mount({...point,scale},c),extra=i===0?1.4*scale:.25*scale;
            return world.support(p.x,p.z,p.y+extra,p.y-size.maxLength-(i===0?scale:.1*scale),section.index);});
          if(!hits.every(hit=>hit?.road && runupContactOnRoute(hit.roadPiece,point,section.index))){valid=false;break;}
          point.pitch=Math.atan2((hits[0].y+hits[1].y-hits[2].y-hits[3].y)/2,CONFIG.halfAxle*2*scale);
          point.roll=Math.atan2((hits[0].y+hits[2].y-hits[1].y-hits[3].y)/2,CONFIG.halfTrack*2*scale);
          point.y=hits.reduce((sum,hit)=>sum+hit.y,0)/4+rideHeight;
        }
        if(!valid)continue;
        const radius=Math.hypot(CONFIG.halfWidth,CONFIG.halfLength,.72)*scale+.06,candidate={...point,scale},shape=bodyShape(candidate);
        if([...world.nearbyWalls(point,point,radius)].some(w=>overlap(candidate,w,shape)))continue;
        const top=(.72+Math.abs(Math.sin(point.pitch))*CONFIG.halfLength+Math.abs(Math.sin(point.roll))*CONFIG.halfWidth)*scale;
        if([{x:0,z:0},...CORNERS].some(c=>{const p=mount(candidate,c);return world.ceiling(p.x,p.z,point.y+.1*scale,point.y+top);}))continue;
        return {point,hits,routeIndex:section.index,pieceIndex:section.index};
      }
      return null;
    }
    function rewindIntervals(from,to) {
      let current=from.pieceIndex,fraction=bookmarkFraction(from);const target=bookmarkFraction(to),result=[];
      if(fraction===null || target===null)return result;
      for(let count=0;count<Math.min(64,runtime.pieces.length);count++){
        if(current===to.pieceIndex && (raceDirection===1?target<=fraction+1e-8:target>=fraction-1e-8)){
          result.push({pieceIndex:current,low:Math.min(target,fraction),high:Math.max(target,fraction)});return result;
        }
        result.push({pieceIndex:current,low:raceDirection===1?0:fraction,high:raceDirection===1?fraction:1});
        const previous=beforeIndex(current);if(previous===null || previous===from.pieceIndex || runtime.pieces[previous].isGap)break;
        current=previous;fraction=raceDirection===1?1:0;
      }
      return [];
    }
    function reset() {
      state.soundImpacts={};
      window.TrackBoost?.reset(state);state.boostLevel=0;
      Object.assign(state,seed,wheelFeedback(),{vx:0,vy:0,vz:0,pitch:0,roll:0,pitchRate:0,rollRate:0,steering:0,airTime:0,wheelSpin:0,frontWheelSpin:0,rearWheelSpin:0,slideYawRate:0,handbrakeActive:false,handbrakeDirection:0,wheelSlip:0,brakeDemand:0,engineRPM:1000,engineLoad:0,collisions:0,recoveries:0});
      const floor=world.support(seed.x,seed.z,seed.y+runtime.settings.tarmacDepth*.5+.15,seed.y+runtime.settings.tarmacDepth*.5-.15,index);
      if(floor && world.ceiling(seed.x,seed.z,floor.y+.25*scale,floor.y+1.6*scale))throw Error('Not enough headroom for this car size here. Choose a smaller car or another section.');
      const contacts=CORNERS.map(corner=>{const p=mount(state,corner);return world.support(p.x,p.z,seed.y+runtime.settings.tarmacDepth*.5+1.1*scale,seed.y-2*scale,index);});
      if(contacts.some(p=>!p))throw Error('Not enough road under all four wheels here. Select a longer section away from a gap.');
      state.pitch=Math.atan2((contacts[0].y+contacts[1].y-contacts[2].y-contacts[3].y)/2,CONFIG.halfAxle*2*scale);
      state.roll=Math.atan2((contacts[0].y+contacts[2].y-contacts[1].y-contacts[3].y)/2,CONFIG.halfTrack*2*scale);
      state.y=contacts.reduce((sum,p)=>sum+p.y,0)/4+size.restLength-CONFIG.gravity/size.stiffness;
      state.contacts=contacts.map((hit,i)=>({name:CORNERS[i].name,hit,length:size.restLength-CONFIG.gravity/size.stiffness,force:CONFIG.gravity/4,anchor:mount(state,CORNERS[i])}));
      state.grounded=4;accumulator=0;lastRoad=null;roadHistory.length=0;surfaceExitWindow=0;grassTrip=null;flightTrip=null;flightAnchor=null;state.lastRouteRejoin=null;routeIndex=index;recoveryReason=null;bankResponse=0;updateRoute(state);rememberRoad();
      options.onReset?.(state);
    }
    function recover(recoveryOptions) {
      state.soundImpacts={};
      window.TrackBoost?.reset(state);state.boostLevel=0;
      if(!lastRoad){reset();return false;}
      recoveryReason=null;let rewind=null;
      const jump=nextJump(lastRoad);
      if(jump && jumpWasMissed(jump)){
        const candidate=verifiedRunup(jump);
        if(candidate){rewind=rewindIntervals(lastRoad,candidate);lastRoad=candidate;roadHistory.length=0;roadHistory.push(candidate);recoveryReason='jump-runup';}
        else {
          // A very short or obstructed approach can still use the oldest
          // verified point, never a point on the destination side of a gap.
          for(const candidate of roadHistory){const earlier=nextJump(candidate,32+size.length);
            if(earlier?.index===jump.index && earlier.distance>jump.distance+2){rewind=rewindIntervals(lastRoad,candidate);lastRoad=candidate;
              roadHistory.splice(roadHistory.indexOf(candidate)+1);recoveryReason='jump-runup';break;}}
          if(!recoveryReason)recoveryReason='jump-short';
        }
      }
      // AI may ask for an earlier verified road contact after repeatedly
      // recovering into the same obstruction. Player recovery stays at the
      // most recent safe contact, as before.
      if(recoveryOptions?.earlier && !recoveryReason){
        const recent=lastRoad.point;
        while(roadHistory.length && Math.hypot(roadHistory.at(-1).point.x-recent.x,roadHistory.at(-1).point.y-recent.y,roadHistory.at(-1).point.z-recent.z)<2.5)roadHistory.pop();
        if(roadHistory.length){lastRoad=roadHistory.at(-1);}
      }
      Object.assign(state,lastRoad.point,wheelFeedback(),{vx:0,vy:0,vz:0,pitchRate:0,rollRate:0,steering:0,airTime:0,wheelSpin:0,frontWheelSpin:0,rearWheelSpin:0,slideYawRate:0,handbrakeActive:false,handbrakeDirection:0,wheelSlip:0,brakeDemand:0,engineRPM:1000,engineLoad:0});
      state.contacts=lastRoad.hits.map((hit,i)=>({name:CORNERS[i].name,hit,length:size.restLength-CONFIG.gravity/size.stiffness,force:CONFIG.gravity/4,anchor:mount(state,CORNERS[i])}));
      state.grounded=4;state.recoveries++;accumulator=0;surfaceExitWindow=0;grassTrip=null;flightTrip=null;flightAnchor=null;bankResponse=0;routeIndex=lastRoad.routeIndex;updateRoute(state);options.onRecover?.(state,{rewind});return true;
    }
    // Local curve under the supported wheels, in radians per metre. Restrict
    // the search to contacted road pieces so an overlapping bridge or a nearby
    // bend cannot steer the car. On a straight bank this returns zero.
    function contactedCurve(point){
      const pieces=new Set(state.contacts.filter(c=>c.force>.05 && c.hit?.road && Number.isInteger(c.hit.roadPiece)).map(c=>c.hit.roadPiece));
      let best=null;
      for(const index of pieces){
        const poses=runtime.pieces[index]?.poses??[];
        for(let i=1;i<poses.length;i++){
          const a=poses[i-1],b=poses[i],dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;if(length2<1e-10)continue;
          const t=clamp(((point.x-a.x)*dx+(point.z-a.z)*dz)/length2,0,1),x=a.x+dx*t,z=a.z+dz*t;
          const distance=(point.x-x)**2+(point.z-z)**2;if(best && distance>=best.distance)continue;
          const delta=((b.yaw-a.yaw+540)%360)-180,yaw=(a.yaw+delta*t)*Math.PI/180;
          best={distance,yaw,curvature:delta*Math.PI/180/Math.sqrt(length2)};
        }
      }
      return best;
    }
    function tick(dt,input) {
      const previous={x:state.x,y:state.y,z:state.z},previousYaw=state.yaw,onRoad=state.grounded>0,previousAirTime=state.airTime,previousVy=state.vy;
      const f={x:Math.sin(state.yaw),z:Math.cos(state.yaw)},r={x:-Math.cos(state.yaw),z:Math.sin(state.yaw)};
      let speed=state.vx*f.x+state.vz*f.z,lateral=state.vx*r.x+state.vz*r.z;
      state.boostTime=Math.max(0,(state.boostTime??0)-dt);
      if(!state.boostTime)state.boostLevel=Math.max(0,(state.boostLevel??0)-dt*.5);
      const boostLevel=state.boostLevel??0,boostSpeedCap=build.engine.maxSpeed*(1+.35*boostLevel);
      const throttle=clamp(input.throttle??0,-1,1),steer=clamp(input.steer??0,-1,1);
      const handbrake=input.handbrake===true,serviceBrake=!!input.brake,power=Math.abs(throttle);
      // An opposing pedal applies the service brakes until the car is moving
      // very slowly. Only then can the engine drive in the other direction.
      const directionBrake=throttle<0 && speed>.5 || throttle>0 && speed<-.5;
      state.brakeDemand=serviceBrake?1:directionBrake?power:0;
      // The arcade 4WD coupling can send power to the front while the rear
      // handbrake is held. A rear-drive car cannot power its locked rear axle.
      const frontDrive=handbrake && build.drivetrain.front>0?1:build.drivetrain.front,rearDrive=handbrake?0:build.drivetrain.rear;
      let driveGrip=1,sideGrip=1,frontTraction=1,rearTraction=1,frontSide=1,rearSide=1,frontLoaded=0,rearLoaded=0,manoeuvreSupport=false,slideTarget=0,powerSlide=0,frontLimit=0,rearLimit=0,bankAcceleration=0,bankCurve=null;
      if(handbrake && (!state.handbrakeActive || !state.handbrakeDirection || Math.hypot(speed,lateral)<.15 && power>.2))state.handbrakeDirection=Math.abs(speed)>.15?Math.sign(speed):Math.sign(throttle);
      if(!handbrake)state.handbrakeDirection=0;
      state.handbrakeActive=handbrake;
      // Keep the familiar turning radius at every car size, but steer the
      // visible/front contact wheels to match the actual scaled wheelbase.
      let steeringTarget=Math.atan(scale*Math.tan(steer*.57*build.steering.angle/(1+Math.abs(speed)*.025)));
      if(onRoad) {
        // Gravity along the road in the driving direction, independent of body
        // pitch (which can bounce). Four actual contacts share the effect, so
        // support fades at a ramp lip and airborne motion stays ballistic.
        let grade=0,bankForce=0,bankNormalX=0,bankNormalZ=0,hasBankContact=false,supported=0,mudSupported=0,dragSum=0,lateralSum=0,brakeSum=0,frontGrip=0,rearGrip=0,frontPull=0,rearPull=0,frontMud=0,rearMud=0,rearBrake=0;
        for(const contact of state.contacts)if(contact.hit && contact.force>.05) {
          const n=contact.hit.normal;grade-=(n.x*f.x+n.z*f.z)/n.y;supported++;
          // Only authored banking contributes. Longitudinal hill normals
          // must not look like a bank when the car is angled across a slope.
          if(contact.hit.road && Number.isInteger(contact.hit.roadPiece) && links.banked[contact.hit.roadPiece]){
            const weight=n.y*clamp(contact.force/(CONFIG.gravity/4),0,1);
            bankNormalX+=n.x*weight;bankNormalZ+=n.z*weight;hasBankContact=true;
          }
          if(contact.hit.surface==='mud')mudSupported++;
          const tyres=tyreResponse(build.tyres,contact.hit.surface);
          const traction=(contact.hit.grip??1)*tyres.grip;
          dragSum+=(contact.hit.drag??0)*tyres.drag;
          const cornerGrip=(contact.hit.lateralGrip??contact.hit.grip??1)*tyres.lateralGrip;
          lateralSum+=cornerGrip;brakeSum+=(contact.hit.brakeGrip??1)*tyres.brakeGrip;
          if(contact.name[0]==='F'){frontLoaded++;frontGrip+=cornerGrip;frontPull+=traction;if(contact.hit.surface==='mud')frontMud++;}
          else{rearLoaded++;rearGrip+=cornerGrip;rearPull+=traction;rearBrake+=(contact.hit.brakeGrip??1)*tyres.brakeGrip;if(contact.hit.surface==='mud')rearMud++;}
        }
        if(supported)grade/=supported;
        if(hasBankContact){
          bankCurve=contactedCurve(state);
          if(bankCurve){
            const roadRight={x:-Math.cos(bankCurve.yaw),z:Math.sin(bankCurve.yaw)};
            // Remove the longitudinal grade before measuring the bank in the
            // car's lateral direction; this also prevents hill false positives.
            bankForce=(bankNormalX*roadRight.x+bankNormalZ*roadRight.z)*(r.x*roadRight.x+r.z*roadRight.z);
          }
        }
        // The supported surface also redirects a moving car towards its lower
        // side. Keep the signed lateral component for neutral steering too.
        bankAcceleration=clamp(CONFIG.gravity*bankForce/4,-8,8);
        const hillAcceleration=-CONFIG.gravity*grade/(1+grade*grade)*supported/4;
        const drag=supported?dragSum/supported:0,lateralGrip=supported?lateralSum/supported:1,brakeGrip=supported?brakeSum/supported:1;
        frontTraction=frontLoaded?frontPull/frontLoaded:1;rearTraction=rearLoaded?rearPull/rearLoaded:1;
        frontSide=frontLoaded?frontGrip/frontLoaded:1;rearSide=rearLoaded?rearGrip/rearLoaded:1;
        driveGrip=(frontPull*frontDrive+rearPull*rearDrive)/2;sideGrip=lateralGrip;
        const drivenSupport=(frontLoaded*frontDrive+rearLoaded*rearDrive)/2,drivenMud=(frontMud*frontDrive+rearMud*rearDrive)/2;
        manoeuvreSupport=supported>=2 && frontLoaded>0 && rearLoaded>0;
        // Power oversteer is confined to deliberate, tight low-speed RWD
        // turns. Normal steering and higher-speed racing keep their grip.
        if(build.drivetrain.id==='rwd' && !handbrake && !serviceBrake && manoeuvreSupport && throttle*speed>=0)
          powerSlide=clamp((power-.7)/.3,0,1)*clamp((Math.abs(steer)-.65)/.35,0,1)*clamp((Math.abs(speed)-.5)/1.2,0,1)*clamp((11-Math.abs(speed))/3,0,1);
        const turning=(handbrake || powerSlide>0) && !serviceBrake && manoeuvreSupport && Math.abs(steer)>.15;
        const poweredTurn=turning && power>.2 && drivenSupport>0 && !directionBrake;
        const donutSpeed=clamp(6/(1+drag*.35),1.5,6)*Math.max(.3,power);
        // Mud uses the selected engine's low-speed reverse pull. The reverse
        // speed cap stays unchanged; direction changes still brake first.
        const reversePull=mudSupported?build.engine.acceleration:7;
        const enginePull=throttle<0?reversePull:build.engine.acceleration*accelerationMultiplier;
        // Each axle has a finite sideways acceleration budget. The driven
        // tyres share that budget with engine pull: FWD runs out of steering
        // grip first; RWD loses rear support first; 4WD spreads the work.
        const powerUse=directionBrake || serviceBrake?0:power*enginePull/12*.75;
        const cornerLimit=(grip,traction,loaded,drive)=>30*build.steering.cornering*grip*loaded/2*Math.sqrt(1-clamp(powerUse*drive/Math.max(.5,traction),0,.82)**2);
        frontLimit=cornerLimit(frontSide,frontTraction,frontLoaded,frontDrive);
        rearLimit=cornerLimit(rearSide,rearTraction,rearLoaded,rearDrive);
        // Use only the sideways component of the contacted road, in the
        // intended turn direction. Helpful banking adds a modest amount of
        // cornering capacity; opposite banking reduces it. This adjustment
        // fades with steering angle and nearly-stationary motion.
        const bankAssist=clamp(CONFIG.gravity*bankForce/4*1.5*Math.sign(state.steering),-6,6)*clamp(Math.abs(state.steering)/.08,0,1)*clamp(Math.abs(speed)/4,0,1);
        // Preserve the tyre/surface trade-offs: banking cannot manufacture
        // grip on an unloaded axle or overwhelm a very slippery surface.
        frontLimit+=clamp(bankAssist*frontLoaded/2,-frontLimit*.35,frontLimit*.35);
        rearLimit+=clamp(bankAssist*rearLoaded/2,-rearLimit*.35,rearLimit*.35);
        let pull=directionBrake || serviceBrake?0:throttle*enginePull*driveGrip;
        if(poweredTurn && speed*Math.sign(throttle)>0)pull*=clamp((donutSpeed-speed*Math.sign(throttle))/Math.max(.6,donutSpeed*.35),0,1);
        // Low gearing keeps a powered mud climb playable when resistance and
        // gravity would otherwise stall it. Add bounded force, never a speed
        // floor; throttle release, braking, downhill travel and flight get none.
        const direction=Math.sign(throttle);
        if(drivenMud>0 && supported>=2 && power>0 && !directionBrake && !serviceBrake && !handbrake && (hillAcceleration*direction<=1e-6 || throttle<0)) {
          const crawl=clamp(1.2*enginePull*driveGrip/(.7+drag),.8,2.2)*power;
          const along=speed*direction,resistance=.7+drag+.012*speed*speed;
          const available=(pull+hillAcceleration)*direction-(.7+drag+.012*crawl*crawl);
          if(along<crawl && available<=0) {
            const desired=Math.min(1.2*power*drivenSupport,(crawl-along)*2);
            const natural=(pull+hillAcceleration)*direction-resistance*(Math.sign(along)||1);
            pull+=direction*clamp(desired-natural,0,build.engine.acceleration*power*drivenMud);
          }
        }
        speed+=(pull+hillAcceleration+(directionBrake || serviceBrake || handbrake?0:8*boostLevel))*dt;
        const handbrakeForce=turning?(poweredTurn?1+9*clamp((Math.abs(speed)-donutSpeed)/3,0,1):10):24;
        const pedalBrake=directionBrake?(throttle<0?19:16)*power*brakeGrip:0;
        const brake=(serviceBrake?24*brakeGrip:handbrake?handbrakeForce*rearBrake/2:0)+pedalBrake+.7+drag+.012*speed*speed;speed=Math.sign(speed)*Math.max(0,Math.abs(speed)-brake*dt);
        speed=clamp(speed,-CONFIG.reverseSpeed,boostSpeedCap);
        if(handbrake || powerSlide>0){
          const lateralDamping=handbrake?5*(frontGrip+rearGrip*.08)/Math.max(1,supported):10*(frontGrip+rearGrip*(1-.7*powerSlide))/Math.max(1,supported);
          lateral*=Math.exp(-lateralDamping*dt);
        }
        if(turning) {
          const motion=handbrake?state.handbrakeDirection:Math.sign(speed)||Math.sign(throttle);
          const looseness=clamp(1-(handbrake?lateralGrip:rearSide),0,.9),moving=Math.min(1,Math.hypot(speed,lateral)/1.3);
          slideTarget=-steer*motion*((poweredTurn?1.3:1.8)+2*looseness)*moving/(1+drag*.35)*(handbrake?1:powerSlide);
        }
      } else {speed*=Math.exp(-.06*dt);lateral*=Math.exp(-.04*dt);}
      const normalCornering=onRoad && !handbrake && powerSlide===0;
      const deliberateDonut=build.drivetrain.id==='rwd' && !serviceBrake && power>.7 && Math.abs(steer)>.65 && Math.abs(speed)<11 && throttle*speed>=0;
      const assistance=normalCornering && manoeuvreSupport && !deliberateDonut?build.assist.strength:0;
      if(assistance && Math.abs(speed)>1){
        // Turn the front wheels only as far as their available grip can use.
        // This is based on the car's contacts, never on a track/AI target.
        const usable=Math.atan(frontLimit*CONFIG.halfAxle*2*scale/(speed*speed))*.98;
        steeringTarget+=(Math.sign(steeringTarget)*Math.min(Math.abs(steeringTarget),usable)-steeringTarget)*assistance;
      }
      state.steering+=(steeringTarget-state.steering)*Math.min(1,dt*build.steering.response);
      if(slideTarget)state.slideYawRate+=(slideTarget-state.slideYawRate)*Math.min(1,dt*6);
      else state.slideYawRate*=Math.exp(-(manoeuvreSupport?2+5*sideGrip:8)*dt);
      state.vx=f.x*speed+r.x*lateral;state.vz=f.z*speed+r.z*lateral;
      const baseTurn=clamp(speed*Math.tan(state.steering)/(CONFIG.halfAxle*2*scale),-2.6,2.6);
      let baseYaw=-baseTurn*(onRoad?1:.12);
      if(normalCornering){
        const balance=1+(build.drivetrain.rear-build.drivetrain.front)*.12*power*clamp(Math.abs(speed)/6,0,1)*(1-assistance);
        let yawLimit=frontLimit/Math.max(1,Math.abs(speed));
        if(assistance){
          // Reserve some of the existing tyre force for catching a slide,
          // instead of letting body rotation outrun the rear axle's grip.
          const capacity=(frontLimit+rearLimit)*.5,rolling=-state.cornerYawRate*CONFIG.halfAxle*scale;
          const reserve=Math.min(capacity*.3,Math.abs(lateral-rolling)*2);
          const stable=Math.max(0,capacity-reserve)/Math.max(1,Math.abs(speed));
          yawLimit+=(Math.min(yawLimit,stable)-yawLimit)*assistance;
        }
        const target=Math.sign(baseYaw)*Math.min(Math.abs(baseYaw)*balance,yawLimit);
        state.cornerYawRate+=(target-state.cornerYawRate)*(1-Math.exp(-dt*build.steering.yawResponse));
        baseYaw=state.cornerYawRate*clamp(Math.abs(speed)/.6,0,1);
      }else state.cornerYawRate=baseYaw;
      // Smooth the rise of the bank response so plank seams and small rough
      // facets cannot abruptly steer the car. Reductions and loss of support
      // take effect immediately; old banking cannot steer a flat/airborne car.
      if(!normalCornering || !manoeuvreSupport || Math.abs(bankAcceleration)<.02)bankResponse=0;
      else{
        if(bankResponse*bankAcceleration<0)bankResponse=0;
        bankResponse+=(bankAcceleration-bankResponse)*(1-Math.exp(-dt*12));
        if(Math.abs(bankResponse)>Math.abs(bankAcceleration))bankResponse=bankAcceleration;
      }
      // On a banked bend, guide the path gently towards the lower side even
      // with centred steering. The contacted road's curvature and travel
      // direction determine the amount; a straight bank supplies no automatic
      // turn. Explicit steering remains in control, and all help fades with
      // low speed, weak grip, unloading or travel across rather than along it.
      const moving=Math.abs(speed);let bankYaw=0;
      if(normalCornering && manoeuvreSupport && moving>1.5 && Math.abs(bankResponse)>.02){
        const curve=bankCurve;
        if(curve && Math.abs(curve.curvature)>1e-7){
          const along=state.vx*Math.sin(curve.yaw)+state.vz*Math.cos(curve.yaw),alignment=Math.abs(along)/Math.max(.01,Math.hypot(state.vx,state.vz));
          const curveYaw=curve.curvature*along,bankDirection=-bankResponse/speed;
          const helpful=Math.sign(bankDirection*curveYaw);
          const bankStrength=clamp(Math.abs(bankResponse)/4,0,1)*clamp((alignment-.6)/.3,0,1)*clamp((moving-1.5)/3,0,1)*clamp(sideGrip,0,1);
          const steeringFade=1-.65*clamp(Math.abs(state.steering)/.08,0,1);
          bankYaw=clamp(curveYaw*helpful*bankStrength*steeringFade,-.7,.7);
        }
      }
      const rollingYaw=baseYaw+bankYaw;
      const extraYaw=manoeuvreSupport?clamp(state.slideYawRate,-3.8-rollingYaw,3.8-rollingYaw):0;
      state.yaw+=(rollingYaw+extraYaw)*dt;
      state.yawRate=(state.yaw-previousYaw)/dt;
      if(normalCornering){
        const tyreSpeed=Math.hypot(state.vx,state.vz);
        const f1={x:Math.sin(state.yaw),z:Math.cos(state.yaw)},r1={x:-f1.z,z:f1.x};
        const forward=state.vx*f1.x+state.vz*f1.z,side=state.vx*r1.x+state.vz*r1.z;
        // Rolling turns carry a small, intentional centre-of-car sidespeed:
        // the rear tyres roll straight while the steered fronts follow the arc.
        const rolling=-rollingYaw*CONFIG.halfAxle*scale;
        const correction=-speed*rollingYaw*dt+(rolling-lateral)*(1-Math.exp(-dt*(serviceBrake?2.5:10)*sideGrip));
        const limit=(frontLimit+rearLimit)*.5*(serviceBrake ? .6 : 1),impulse=clamp(correction,-limit*dt,limit*dt);
        state.vx=f1.x*forward+r1.x*(side+impulse);state.vz=f1.z*forward+r1.z*(side+impulse);
        // Side grip redirects momentum; it cannot act as an extra engine.
        const redirected=Math.hypot(state.vx,state.vz);
        if(redirected>tyreSpeed){state.vx*=tyreSpeed/redirected;state.vz*=tyreSpeed/redirected;}
        const demand=Math.abs(speed*baseTurn),recoveryDemand=Math.abs(correction)/dt;
        state.frontGripLoss=clamp((Math.max(demand,recoveryDemand)/Math.max(.1,frontLimit)-1)/.7,0,1);
        state.rearGripLoss=clamp((Math.max(Math.abs(speed*baseYaw),recoveryDemand)/Math.max(.1,rearLimit)-1)/.7,0,1);
      }else{
        state.frontGripLoss=state.rearGripLoss=onRoad?1:0;
      }
      const magnitude=Math.hypot(state.vx,state.vz);if(magnitude>boostSpeedCap){state.vx*=boostSpeedCap/magnitude;state.vz*=boostSpeedCap/magnitude;}
      state.x+=state.vx*dt;state.z+=state.vz*dt;state.wheelSpin+=speed*dt/size.wheelRadius;
      let lift=0,pitchTorque=0,rollTorque=0,grounded=0;
      const cy=Math.cos(state.yaw),sy=Math.sin(state.yaw);
      const previousContacts=state.contacts;
      state.contacts=CORNERS.map((corner,cornerIndex)=>{
        const anchor=mount(state,corner),oldAnchor=mount({...state,x:previous.x,y:previous.y,z:previous.z},corner);
        // Include the upcoming downward sweep so a fast fall cannot skip a thin
        // road/terrain surface between ticks. Do not extend the actual spring.
        const drop=Math.min(0,(state.vy-CONFIG.gravity*dt)*dt);
        const hit=world.support(anchor.x,anchor.z,Math.max(anchor.y+.25*scale,oldAnchor.y+.25*scale),anchor.y-size.maxLength+drop,routeIndex);
        const length=hit?anchor.y-hit.y:size.maxLength;
        let force=0;
        if(hit && length<=size.maxLength+1e-7) {
          let groundVelocity=-(hit.normal.x*state.vx+hit.normal.z*state.vz)/hit.normal.y;
          const oldHit=previousContacts[cornerIndex]?.hit;
          if(((hit.surface==='wood'&&oldHit?.surface==='wood')||(hit.roughness>0 && oldHit?.roughness>0))&&hit.roadPiece===oldHit.roadPiece&&Math.hypot(hit.x-oldHit.x,hit.z-oldHit.z)<Math.max(.6,Math.hypot(state.vx,state.vz)*dt*3)){
            // A fixed step can cross both sides of a small plank joint. Use
            // its sampled height change instead of aliasing one steep facet
            // into a launch. The visible/collision profile stays identical.
            groundVelocity=(hit.y-oldHit.y)/dt;
          }
          const velocity=state.vy+(state.pitchRate*corner.z+state.rollRate*corner.x)*scale-groundVelocity;
          force=clamp((size.stiffness*(size.restLength-length)-size.damping*velocity)/4,0,75);
          if(force>.05 && length<size.restLength+.12*scale)grounded++;
          lift+=force;
          pitchTorque+=force*((anchor.x-state.x)*sy+(anchor.z-state.z)*cy)/(1.35*scale*scale);
          rollTorque+=force*((anchor.x-state.x)*cy-(anchor.z-state.z)*sy)/(.58*scale*scale);
        }
        return {name:corner.name,anchor,hit,length,force};
      });
      state.vy+=(lift-CONFIG.gravity)*dt;state.y+=state.vy*dt;
      state.pitchRate=clamp((state.pitchRate+pitchTorque*dt)*Math.exp(-.6*dt*build.suspension.angularDamping),-4,4);
      state.rollRate=clamp((state.rollRate+rollTorque*dt)*Math.exp(-.8*dt*build.suspension.angularDamping),-4,4);
      state.pitch=clamp(state.pitch+state.pitchRate*dt,-1.05,1.05);state.roll=clamp(state.roll+state.rollRate*dt,-1.05,1.05);
      if(Math.abs(state.pitch)>=1.05)state.pitchRate=0;if(Math.abs(state.roll)>=1.05)state.rollRate=0;
      let bump=0;
      for(let i=0;i<CORNERS.length;i++)if(state.contacts[i].hit)bump=Math.max(bump,size.wheelRadius-(mount(state,CORNERS[i]).y-state.contacts[i].hit.y));
      if(bump>0){state.y+=bump;if(state.vy<0)state.vy=-state.vy*.04;}
      if(state.vy>0) {
        const top=(.72+Math.abs(Math.sin(state.pitch))*CONFIG.halfLength+Math.abs(Math.sin(state.roll))*CONFIG.halfWidth)*scale;
        let correction=0;
        for(const corner of [{x:0,z:0},...CORNERS]) {
          const point=mount(state,corner),ceiling=world.ceiling(point.x,point.z,previous.y+top-.02,state.y+top+.02);
          if(ceiling)correction=Math.max(correction,state.y+top-ceiling.y+.01*scale);
        }
        if(correction>0){state.y-=correction;state.vy=0;}
      }
      // Only a sustained flight followed by a real downward landing produces
      // a thud; ordinary kerb/suspension contact is handled by road rumble.
      if(grounded && previousAirTime>=.12 && previousVy<-.8){const events=state.soundImpacts??(state.soundImpacts={});events.landing=Math.max(events.landing??0,-previousVy);}
      state.grounded=grounded;state.airTime=grounded?0:state.airTime+dt;
      const wallHits=resolveWalls(world,state,previous,dt);state.collisions+=wallHits;
      updateRoute(previous,dt);
      // Estimated wheelspin drives the visual wheels and engine sound. It does
      // not manufacture tyre forces or feed more power back into the physics.
      const travel=state.vx*Math.sin(state.yaw)+state.vz*Math.cos(state.yaw),velocity=Math.hypot(state.vx,state.vz);
      const spinPower=state.brakeDemand>0?0:power;
      const slipDemand=(traction,side,driven,loaded)=>{
        if(!driven)return 0;
        const loss=clamp(Math.max(0,1-traction)*1.7+Math.max(0,1-side)*.35,0,1);
        const surfaceSpin=loss*spinPower*(.3+.7*clamp(1-velocity/(build.engine.maxSpeed*.8),0,1));
        return Math.max(surfaceSpin,handbrake && loaded?spinPower*.9:0,wallHits?spinPower*.85:0,!loaded?spinPower:0);
      };
      const frontDemand=slipDemand(frontTraction,frontSide,frontDrive,frontLoaded);
      const rearDemand=handbrake?0:Math.max(slipDemand(rearTraction,rearSide,rearDrive,rearLoaded),powerSlide*(.5+.4*clamp(1-rearSide,0,1)));
      const response=1-Math.exp(-dt*8);
      state.frontWheelSlip=frontDrive?state.frontWheelSlip+(frontDemand-state.frontWheelSlip)*response:0;
      state.rearWheelSlip=rearDrive?state.rearWheelSlip+(rearDemand-state.rearWheelSlip)*response:0;
      state.wheelSlip=Math.max(state.frontWheelSlip,state.rearWheelSlip);state.engineLoad=spinPower;
      const rpm=1000+5800*clamp(.15*spinPower+.65*velocity/(travel<-.15?CONFIG.reverseSpeed:build.engine.maxSpeed)+.85*state.wheelSlip,0,1);
      state.engineRPM+=(rpm-state.engineRPM)*(1-Math.exp(-dt*7));
      for(const contact of state.contacts){
        const front=contact.name[0]==='F';if(handbrake && !front)continue;
        const motion=wheelMotion(state,contact),slip=front?state.frontWheelSlip:state.rearWheelSlip;
        const wheelTravel=motion.forward+(Math.sign(throttle)||Math.sign(travel))*slip*(4+18*power);
        state.wheelSpins[contact.name]+=wheelTravel*dt/size.wheelRadius;
      }
      state.frontWheelSpin=(state.wheelSpins.FL+state.wheelSpins.FR)/2;state.rearWheelSpin=(state.wheelSpins.RL+state.wheelSpins.RR)/2;
      if(state.y<world.minY-14){const resets=state.resets+1;recover();state.resets=resets;options.onStep?.(state,state,dt);}
      else {rememberRoad();options.onStep?.(previous,state,dt);}
    }
    function advance(elapsed,input={}) {
      if(!Number.isFinite(elapsed) || elapsed<=0)return state;
      accumulator+=Math.min(.1,elapsed);
      while(accumulator+1e-10>=CONFIG.step){accumulator-=CONFIG.step;tick(CONFIG.step,input);}
      return state;
    }
    reset();
    return {state,advance,reset,recover,world,size,build,section:index,get recoveryPoint(){return lastRoad?{...lastRoad.point}:null;},get recoverySection(){return lastRoad?.pieceIndex??null;},get recoveryReason(){return recoveryReason;}};
  }
  window.TrackVehicle={CONFIG,CORNERS,ENGINES,TYRES,SUSPENSIONS,DRIVETRAINS,STEERINGS,STEERING_ASSISTS,PRESETS,resolveBuild,tyreResponse,dimensions,makeWorld,create,mount,wheelMotion};
})();
