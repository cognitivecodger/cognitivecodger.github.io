/* Deterministic, conservative trackside scenery. No external assets required. */
(function(){
  'use strict';
  const RAD=Math.PI/180,EPS=1e-7;
  function random(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  // One subdivision of an icosahedron: 80 triangles instead of the 320 in
  // the original Unity canopy. Its topology is shared by all foliage.
  const foliageSphere=(()=>{
    const t=(1+Math.sqrt(5))/2,normal=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
    const vertices=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(normal);
    const original=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]],cache=new Map(),faces=[];
    const middle=(a,b)=>{const key=a<b?`${a}:${b}`:`${b}:${a}`;if(cache.has(key))return cache.get(key);
      const index=vertices.length;vertices.push(normal(vertices[a].map((v,i)=>v+vertices[b][i])));cache.set(key,index);return index;};
    for(const [a,b,c] of original){const ab=middle(a,b),bc=middle(b,c),ca=middle(c,a);faces.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}
    return {vertices,faces};
  })();
  function seedFor(runtime){
    let hash=2166136261;const add=value=>{for(const c of String(value)){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}};
    add((runtime.settings.groundY??0).toFixed(3));
    for(const p of runtime.pieces){for(const v of [p.start.x,p.start.y,p.start.z,p.end.x,p.end.y,p.end.z,p.start.yaw,p.end.yaw,p.start.width,p.end.width,p.angle])add(Number(v??0).toFixed(3));add(p.isGap?'g':'r');}
    return hash>>>0;
  }
  function basis(yaw){const a=yaw*RAD;return {lx:Math.cos(a),lz:-Math.sin(a),fx:Math.sin(a),fz:Math.cos(a)};}
  function at(rect,x,z){return {x:rect.x+rect.lx*x+rect.fx*z,z:rect.z+rect.lz*x+rect.fz*z};}
  function local(rect,p){const x=p.x-rect.x,z=p.z-rect.z;return {x:x*rect.lx+z*rect.lz,z:x*rect.fx+z*rect.fz};}
  function segmentBox(a,b,hx,hz){
    let lo=0,hi=1;for(const [p,d,half] of [[a.x,b.x-a.x,hx],[a.z,b.z-a.z,hz]]){
      if(Math.abs(d)<EPS){if(Math.abs(p)>half)return false;continue;}
      let t0=(-half-p)/d,t1=(half-p)/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;
    }return true;
  }
  function triangleBox(points,hx,hz){
    // Test a sampled road triangle against the building's oriented footprint.
    // Keeping the real asymmetric road edges avoids turning a widened outside
    // corner into a large square clearance area on *both* sides of the road.
    const axes=[[1,0],[0,1]];
    for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3],dx=b.x-a.x,dz=b.z-a.z;if(Math.hypot(dx,dz)>EPS)axes.push([-dz,dx]);}
    for(const [x,z] of axes){const values=points.map(p=>p.x*x+p.z*z),radius=hx*Math.abs(x)+hz*Math.abs(z);
      if(Math.min(...values)>radius+EPS || Math.max(...values)<-radius-EPS)return false;}
    return true;
  }
  function intersectsRoad(rect,segments,ignore){
    const rx=Math.abs(rect.lx)*rect.hx+Math.abs(rect.fx)*rect.hz,rz=Math.abs(rect.lz)*rect.hx+Math.abs(rect.fz)*rect.hz;
    for(const s of segments){if(s.index===ignore || s.maxX<rect.x-rx || s.minX>rect.x+rx || s.maxZ<rect.z-rz || s.minZ>rect.z+rz)continue;const a=local(rect,s.a),b=local(rect,s.b);
      if(s.footprint){const p=s.footprint.map(point=>local(rect,point)),hx=rect.hx+.8,hz=rect.hz+.8;
        if(triangleBox([p[0],p[1],p[2]],hx,hz)||triangleBox([p[0],p[2],p[3]],hx,hz))return true;
      }else if(segmentBox(a,b,rect.hx+s.radius,rect.hz+s.radius))return true;}
    return false;
  }
  function intersectsRect(a,b){
    const dx=b.x-a.x,dz=b.z-a.z;
    for(const [x,z] of [[a.lx,a.lz],[a.fx,a.fz],[b.lx,b.lz],[b.fx,b.fz]]){
      const distance=Math.abs(dx*x+dz*z),ra=a.hx*Math.abs(a.lx*x+a.lz*z)+a.hz*Math.abs(a.fx*x+a.fz*z),rb=b.hx*Math.abs(b.lx*x+b.lz*z)+b.hz*Math.abs(b.fx*x+b.fz*z);
      if(distance>ra+rb+.5)return false;
    }return true;
  }
  function onGround(rect,bounds){
    for(const x of [-rect.hx,rect.hx])for(const z of [-rect.hz,rect.hz]){const p=at(rect,x,z);
      if(p.x<bounds.minX+.25 || p.x>bounds.maxX-.25 || p.z<bounds.minZ+.25 || p.z>bounds.maxZ-.25)return false;}
    return true;
  }
  function hasGround(rect,terrain){
    // Road/gap reservations are conservative; sample the actual terrain as a
    // second check so the car park is never deliberately placed in a cutting.
    const p=terrain.ground.positions;
    for(const x of [-rect.hx,0,rect.hx])for(const z of [-rect.hz,0,rect.hz]){
      const q=at(rect,x*.98,z*.98);let found=false;
      for(let i=0;i<p.length;i+=9){const ax=p[i],az=p[i+2],bx=p[i+3],bz=p[i+5],cx=p[i+6],cz=p[i+8];
        if(q.x<Math.min(ax,bx,cx)-EPS || q.x>Math.max(ax,bx,cx)+EPS || q.z<Math.min(az,bz,cz)-EPS || q.z>Math.max(az,bz,cz)+EPS)continue;
        const ab=(bx-ax)*(q.z-az)-(bz-az)*(q.x-ax),bc=(cx-bx)*(q.z-bz)-(cz-bz)*(q.x-bx),ca=(ax-cx)*(q.z-cz)-(az-cz)*(q.x-cx);
        if((ab>=-EPS&&bc>=-EPS&&ca>=-EPS)||(ab<=EPS&&bc<=EPS&&ca<=EPS)){found=true;break;}
      }if(!found)return false;
    }return true;
  }
  // Existing forest sampling regions retain their established rounded outlines.
  function roundedOutline(cx,cz,diameter,aspect,angle,phase,phase2){
    const raw=Array.from({length:28},(_,i)=>{const theta=i*2*Math.PI/28,r=1+.12*Math.sin(theta+phase2)+.27*Math.sin(theta*2+phase)+.18*Math.sin(theta*3+phase2)+.1*Math.sin(theta*4-phase);
      return {x:r*Math.cos(theta),z:aspect*r*Math.sin(theta)};});
    const scale=diameter*.5/Math.max(...raw.map(p=>Math.hypot(p.x,p.z)));
    return raw.map(p=>({x:cx+scale*(p.x*Math.cos(angle)-p.z*Math.sin(angle)),z:cz+scale*(p.x*Math.sin(angle)+p.z*Math.cos(angle))}));
  }
  // Independently seeded radial points, rounded with the same midpoint-based
  // quadratic curves as the pond example. Positive radii and angular ordering
  // keep the outline star-shaped for the terrain's centre-fan cutting code.
  function pondOutline(cx,cz,diameter,aspect,angle,seed){
    const rng=random(seed),sizeFactor=Math.sqrt(Math.max(0,Math.min(1,(diameter-2)/98)));
    // Small ponds get fewer controls; larger ponds can have up to 30. Vary the
    // count per seed while keeping the original 4-30 supported range.
    const vertexCount=Math.max(4,Math.min(30,Math.round(4+22*sizeFactor+(rng()-.5)*(3+5*sizeFactor))));
    // Larger ponds can use more of the 20-90% range, even with many points.
    // A modest count penalty avoids maximum irregularity on dense outlines.
    const countFactor=1-.2*(vertexCount-4)/26,irregularityLimit=20+70*sizeFactor*countFactor;
    const irregularity=20+(irregularityLimit-20)*(.7+.3*rng()),amount=irregularity/100;
    // Smooth adjacent random radii, then restore a size-dependent portion of
    // the lost amplitude. Without that compensation, large ponds with many
    // controls became nearly circular despite a high irregularity setting.
    let offsets=Array.from({length:vertexCount},()=>rng()*2-1);
    for(let pass=0;pass<(vertexCount>=14?2:1);pass++)offsets=offsets.map((v,i)=>.6*v+.2*(offsets[(i+vertexCount-1)%vertexCount]+offsets[(i+1)%vertexCount]));
    const mean=offsets.reduce((sum,v)=>sum+v,0)/vertexCount;offsets=offsets.map(v=>v-mean);
    const peak=Math.max(...offsets.map(Math.abs)),restore=peak>1e-6?1+sizeFactor*(1/peak-1):1;
    const controls=offsets.map((v,i)=>{const theta=i*2*Math.PI/vertexCount,r=1+v*restore*amount;
      return {x:r*Math.cos(theta),z:aspect*r*Math.sin(theta)};});
    // Smaller polygons receive more curve samples, without exceeding 60 points.
    const subdivisions=vertexCount<8?4:vertexCount<14?3:2,raw=[];
    for(let i=0;i<vertexCount;i++){
      const previous=controls[(i+vertexCount-1)%vertexCount],current=controls[i],next=controls[(i+1)%vertexCount];
      const a={x:(previous.x+current.x)*.5,z:(previous.z+current.z)*.5},b={x:(current.x+next.x)*.5,z:(current.z+next.z)*.5};
      for(let j=0;j<subdivisions;j++){const t=j/subdivisions,u=1-t;raw.push({x:u*u*a.x+2*u*t*current.x+t*t*b.x,z:u*u*a.z+2*u*t*current.z+t*t*b.z});}
    }
    const scale=diameter*.5/Math.max(...raw.map(p=>Math.hypot(p.x,p.z))),cos=Math.cos(angle),sin=Math.sin(angle);
    return {seed,vertexCount,irregularity,irregularityLimit,points:raw.map(p=>({x:cx+scale*(p.x*cos-p.z*sin),z:cz+scale*(p.x*sin+p.z*cos)}))};
  }
  function plan(runtime,terrain){
    const density=runtime.settings.sceneryDensity??(runtime.settings.scenery ? .5 : 0),pieces=runtime.pieces;
    const requests=[];
    for(let index=0;index<pieces.length;index++)for(const [side,key] of [[1,'SCL'],[-1,'SCR']]){
      const choice=pieces[index].source?.[key];if(!choice || choice==='none')continue;
      // A bridge selected on both sides is one structure spanning the road.
      const same=['footbridge','tyre'].includes(choice) && requests.find(r=>r.index===index && r.choice===choice);
      if(same)same.sides.push(side);else requests.push({index,choice,sides:[side],candidates:[]});
    }
    if(density<=0 && !requests.length)return [];
    const ground=runtime.settings.groundY??0,segments=[],candidates=[],rng=random(seedFor(runtime));
    for(let i=0;i<pieces.length;i++){
      const piece=pieces[i];for(let j=1;j<piece.poses.length;j++){
        const a=piece.poses[j-1],b=piece.poses[j],extra=Math.max(a.extraLeft??0,a.extraRight??0,b.extraLeft??0,b.extraRight??0);
        const angle=Math.abs(((b.yaw-a.yaw+540)%360)-180)*RAD,sagitta=Math.hypot(b.x-a.x,b.z-a.z)*.5*Math.tan(angle/4);
        const radius=Math.max(a.width,b.width)*.5+extra+.8+sagitta;
        const footprint=[window.TS2.roadPoint(a,1),window.TS2.roadPoint(a,-1),window.TS2.roadPoint(b,-1),window.TS2.roadPoint(b,1)];
        // A rotated building's .8 m local margin can project up to sqrt(2)
        // times that on either world axis; keep the broad phase conservative.
        const margin=.8*Math.SQRT2;
        segments.push({index:i,a,b,radius,footprint,length:Math.hypot(b.x-a.x,b.z-a.z),gap:piece.isGap,
          minX:Math.min(...footprint.map(p=>p.x))-margin,maxX:Math.max(...footprint.map(p=>p.x))+margin,
          minZ:Math.min(...footprint.map(p=>p.z))-margin,maxZ:Math.max(...footprint.map(p=>p.z))+margin});
      }
      const p=piece.start,q=piece.end;
      const roadTop=(runtime.settings.tarmacDepth??0)*.5;
      // A straight beside an open cutting is also suitable: the structures
      // stay at terrain height rather than descending to the road surface.
      if(piece.isGap || piece.isCurve || terrain.coveredIndices?.includes(i) || piece.length<8 || p.y+roadTop-ground>.4 || q.y+roadTop-ground>.4)continue;
      // A banked straight can still have level, clear grass alongside it.
      // Bridges span the road, so retain their stricter banking restriction.
      const banked=[p,q].some(v=>Math.abs(v.bankLeft??0)>.15 || Math.abs(v.bankRight??0)>.15);
      const dir=basis(p.yaw),count=Math.min(8,Math.max(1,Math.floor(piece.length/26))),autoEligible=!piece.isClose && piece.length>=18;
      const choices={1:piece.source?.SCL,'-1':piece.source?.SCR};
      const request=(side,choice)=>requests.find(r=>r.index===i && r.choice===choice && r.sides.includes(side));
      for(const side of [-1,1]){
        const c={kind:'stand',index:i,side,start:p,length:piece.length,half:Math.max(p.width,q.width)*.5,hx:3.2,...dir,ground};
        if(choices[side]==='stand')request(side,'stand').candidates.push(c);
        else if(choices[side]===undefined && autoEligible)candidates.push(c);
      }
      // Try the middle first for explicit requests; keep the original
      // automatic candidate positions and ordering unchanged.
      const offsets=Array.from({length:count},(_,n)=>(n+1)/(count+1));
      const samples=[...offsets.map(t=>({t,automatic:true}))];
      if(!offsets.some(t=>Math.abs(t-.5)<EPS))samples.push({t:.5,automatic:false});
      for(const {t,automatic} of samples){
        const cx=p.x+(q.x-p.x)*t,cz=p.z+(q.z-p.z)*t,half=(p.width+(q.width-p.width)*t)*.5;
        for(const side of [-1,1]){const hx=3.6,hz=4.5,offset=half+1.9+hx,c={kind:'building',index:i,side,x:cx+dir.lx*offset*side,z:cz+dir.lz*offset*side,hx,hz,...dir,ground,half};
          if(choices[side]==='tower' && piece.length>=10)request(side,'tower').candidates.push(c);
          else if(choices[side]===undefined && autoEligible && automatic)candidates.push(c);
        }
        // Keep bridges away from immediate jump take-off / landing sections,
        // including the seam between the last and first pieces of a loop.
        const previous=pieces[i-1]??(runtime.autoClose?pieces.at(-1):null),next=pieces[i+1]??(runtime.autoClose?pieces[0]:null);
        if(piece.length>=10 && half<=10 && !banked && !(piece.source?.SR>0) && !previous?.isGap && !next?.isGap)
          for(const kind of ['footbridge','tyre']){
            const c={kind,index:i,x:cx,z:cz,hx:half+(kind==='footbridge'?8:6.6),hz:kind==='footbridge'?1.8:2.2,...dir,ground,half};
            for(const r of requests)if(r.index===i && r.choice===kind)r.candidates.push(c);
            if(!piece.isClose && automatic && choices[1]===undefined && choices[-1]===undefined)candidates.push(c);
          }
      }
    }
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    // Reserve bridge opportunities throughout the same deterministic order as
    // other structures; otherwise one long stand can consume every crossing.
    const spans=candidates.filter(c=>c.kind==='footbridge'||c.kind==='tyre'),other=candidates.filter(c=>c.kind!=='footbridge'&&c.kind!=='tyre'),ordered=[];
    for(let i=0,j=0;i<spans.length||j<other.length;){if(i<spans.length)ordered.push(spans[i++]);for(let k=0;k<2 && j<other.length;k++)ordered.push(other[j++]);}
    const placed=[],limits={stand:24,building:14,footbridge:6,tyre:6};let bridges=0;
    const clear=c=>onGround(c,terrain.bounds) && !intersectsRoad(c,segments,undefined) && !placed.some(other=>intersectsRect(c,other));
    function tryPlace(c,manualSides){
      const bridge=c.kind==='footbridge'||c.kind==='tyre';
      if(placed.length>=48 || placed.filter(p=>p.kind===c.kind).length>=limits[c.kind] || bridge && bridges>=6)return false;
      if(c.kind==='stand'){
        let found=null;const max=Math.min(96,c.length-2);
        for(let length=max;length>=6-EPS && !found;length=length<=6?5.9:Math.max(6,length-2)){
          const min=length/2+1,maxCentre=c.length-min;if(maxCentre<min)continue;
          for(const distance of [c.length/2,min,maxCentre]){
            const offset=c.half+1.9+c.hx,site={kind:'stand',index:c.index,side:c.side,x:c.start.x+c.fx*distance+c.lx*offset*c.side,z:c.start.z+c.fz*distance+c.lz*offset*c.side,
              hx:c.hx,hz:(length+.3)/2,lx:c.lx,lz:c.lz,fx:c.fx,fz:c.fz,ground:c.ground,half:c.half,modelLength:length};
            if(clear(site) && hasGround(site,terrain)){found=site;break;}
          }
        }if(!found)return false;c=found;
      }
      if(!onGround(c,terrain.bounds) || intersectsRoad(c,segments,bridge?c.index:undefined) || placed.some(other=>intersectsRect(c,other)) || (!bridge && !hasGround(c,terrain)))return false;
      if(bridge){
        // Only the span may cross its own road. Both support/approach footprints
        // must be on clear grass, including alongside the road being crossed.
        let clear=true;for(const side of [-1,1]){const mid=c.half+(c.kind==='footbridge'?4.7:4.8),point=at(c,side*mid,0),support={...c,x:point.x,z:point.z,hx:c.kind==='footbridge'?3.1:1.7,hz:c.hz};
          if(!onGround(support,terrain.bounds)||intersectsRoad(support,segments,undefined)||!hasGround(support,terrain)){clear=false;break;}}
        if(!clear)return false;bridges++;
      }
      placed.push(manualSides?{...c,manualSides:[...manualSides]}:c);return true;
    }
    // Reserve road-spanning bridges before stands so a stand can shorten or
    // shift to fit beside one, irrespective of the side that requested it.
    requests.sort((a,b)=>Number(['footbridge','tyre'].includes(b.choice))-Number(['footbridge','tyre'].includes(a.choice)) || a.index-b.index || b.sides[0]-a.sides[0]);
    for(const r of requests){r.candidates.sort((a,b)=>{
      if(a.kind==='stand')return 0;
      const midpoint=pieces[r.index].start,dir=basis(midpoint.yaw),centre=pieces[r.index].length/2;
      return Math.abs((a.x-midpoint.x)*dir.fx+(a.z-midpoint.z)*dir.fz-centre)-Math.abs((b.x-midpoint.x)*dir.fx+(b.z-midpoint.z)*dir.fz-centre);
    });for(const candidate of r.candidates)if(tryPlace(candidate,r.sides))break;}
    const manualCount=placed.length;
    const automatic=[];
    if(density>0){
      const available=ordered.slice(0,800),manualBridges=bridges;
      const take=queue=>{while(queue.length){const candidate=queue.shift();if(tryPlace(candidate))return {candidate,item:placed.at(-1)};}return null;};
      function bootstrap(bridgeLimit){
        const spans=available.filter(c=>c.kind==='footbridge'||c.kind==='tyre'),towers=available.filter(c=>c.kind==='building');
        let stands=available.filter(c=>c.kind==='stand');const bridgeReservations=[];
        // Reserve bridges early when possible; they may be released below if
        // they are the only reason a stand/tower combination cannot fit.
        for(const kind of ['footbridge','tyre']){
          if(bridgeReservations.length>=bridgeLimit)break;
          const options=spans.filter(c=>c.kind===kind),reservation=take(options);
          if(reservation){bridgeReservations.push(reservation.item);spans.splice(spans.indexOf(reservation.candidate),1);}
        }
        const first=take(stands);let second=null,reservedTower=null;
        if(first){
          // Trying several sites lets a stand shorten around the tower.
          const remaining=[...stands];
          for(let attempt=0;attempt<8 && towers.length && !second;attempt++){
            const reservation=take(towers);if(!reservation)break;
            const trial=[...remaining],stand=take(trial);
            if(stand){reservedTower=reservation;second=stand;stands=trial;}
            else placed.splice(placed.indexOf(reservation.item),1);
          }
          if(!second){stands=remaining;second=take(stands);}
        }
        return {spans,stands,towers,bridgeReservations,first,second,reservedTower,items:placed.slice(manualCount),bridgeCount:bridges};
      }
      let chosen=bootstrap(2);
      if(!chosen.reservedTower && chosen.bridgeReservations.length){
        const original=chosen;
        // An automatically selected bridge must not crowd out the first
        // tower when there is room for the requested two stands and a tower.
        for(const limit of [1,0]){
          if(limit>=original.bridgeReservations.length)continue;
          placed.splice(manualCount);bridges=manualBridges;
          const retry=bootstrap(limit);if(retry.reservedTower){chosen=retry;break;}
        }
        if(!chosen.reservedTower){placed.splice(manualCount);placed.push(...original.items);bridges=original.bridgeCount;chosen=original;}
      }
      const {spans,stands,towers,bridgeReservations,first,second,reservedTower}=chosen;
      if(first)automatic.push(first.item);
      if(second)automatic.push(second.item);
      let standCount=Number(!!first)+Number(!!second),towerCount=0;
      if(reservedTower && second && placed.includes(reservedTower.item)){automatic.push(reservedTower.item);towerCount++;}
      automatic.push(...bridgeReservations);
      // Towers are considered only once stands outnumber them comfortably.
      // This ordering also keeps every density-slider prefix in balance.
      let cycle=0;
      while(placed.length<48 && (stands.length||towers.length||spans.length)){
        if(spans.length && cycle++%3===0){const bridge=take(spans);if(bridge)automatic.push(bridge.item);}
        let item=null;
        if(towers.length && standCount>=2 && standCount>=2*towerCount+1){item=take(towers);if(item)towerCount++;}
        if(!item && stands.length){item=take(stands);if(item)standCount++;}
        if(item)automatic.push(item.item);
        else if(!spans.length)break;
      }
    }
    // Prefer a site beside a building or stand, then try grass close to the
    // track. Never move existing structures to make room for the car park.
    let parking=null;const bounds=terrain.bounds,parkingDir=basis(0),sites=[];
    for(const b of placed.filter(p=>p.kind==='building'||p.kind==='stand'))for(const side of [-1,1]){
      sites.push({x:b.x+b.lx*side*(b.hx+10),z:b.z+b.lz*side*(b.hx+10)});
      sites.push({x:b.x+b.fx*side*(b.hz+9),z:b.z+b.fz*side*(b.hz+9)});
    }
    const roads=segments.filter(s=>!s.gap && s.length>EPS && !terrain.coveredIndices?.includes(s.index));
    for(let i=0;density>0 && i<200 && roads.length;i++){
      const s=roads[Math.floor(rng()*roads.length)],t=rng(),side=rng()<.5?-1:1,offset=s.radius+10+rng()*4;
      sites.push({x:s.a.x+(s.b.x-s.a.x)*t+side*(s.b.z-s.a.z)/s.length*offset,z:s.a.z+(s.b.z-s.a.z)*t-side*(s.b.x-s.a.x)/s.length*offset});
    }
    for(const point of density>0?sites:[]){const site={kind:'parking',...point,hx:7,hz:6,...parkingDir,ground,seed:Math.floor(rng()*0xffffffff)};
      if(clear(site) && hasGround(site,terrain)){parking=site;break;}}
    if(parking){
      // A visual access lane may run to the map edge, but only if its whole
      // reserved footprint avoids roads, other structures and cuttings.
      const directions=[['x',-1],['x',1],['z',-1],['z',1]].map(([axis,sign])=>{
        const start=parking[axis]+sign*(axis==='x'?6.9:5.9),end=sign<0?(axis==='x'?bounds.minX:bounds.minZ)+.4:(axis==='x'?bounds.maxX:bounds.maxZ)-.4;
        const length=Math.abs(end-start),site={kind:'access',x:axis==='x'?(start+end)/2:parking.x,z:axis==='z'?(start+end)/2:parking.z,hx:axis==='x'?length/2:1.6,hz:axis==='z'?length/2:1.6,...parkingDir,ground};return {length,site};
      }).sort((a,b)=>a.length-b.length);
      for(const {length,site} of directions)if(length>.5 && clear(site) && hasGround(site,terrain)){parking.access=site;break;}
    }
    if(parking)automatic.splice(Math.min(3,automatic.length),0,parking);
    return [...placed.slice(0,manualCount),...automatic.slice(0,Math.ceil(automatic.length*Math.min(1,density)))];
  }
  function buffer(){
    return {positions:[],colours:[],triangles:0,tri(a,b,c,color,convert=false){this.positions.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);let rgb=[((color>>16)&255)/255,((color>>8)&255)/255,(color&255)/255];
      if(convert)rgb=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);this.colours.push(...rgb,...rgb,...rgb);this.triangles++;},
      quad(a,b,c,d,color,convert=false){this.tri(a,b,c,color,convert);this.tri(a,c,d,color,convert);},geometry(){const g=new THREE.BufferGeometry();try{g.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.colours,3));g.computeVertexNormals();return g;}catch(error){g.dispose();throw error;}}};
  }
  function enabled(runtime,options={}){return (options.environment??runtime.settings.environment)==='city' || !!runtime.settings.scenery || runtime.settings.treeDensity>0 || runtime.settings.pondQuantity>0 || runtime.settings.rockDensity>0 || runtime.settings.bushDensity>0 || runtime.settings.tyreInside>0 || runtime.settings.tyreOutside>0 || runtime.pieces.some(p=>(p.source?.TBL??0)>0 || (p.source?.TBR??0)>0 || ['SCL','SCR'].some(key=>p.source?.[key] && p.source[key]!=='none'));}
  function planTyreStacks(runtime,terrain,structures,options={}){
    if(!(runtime.settings.tyreInside>0 || runtime.settings.tyreOutside>0 || runtime.pieces.some(p=>(p.source?.TBL??0)>0 || (p.source?.TBR??0)>0)))return [];
    const ground=runtime.settings.groundY??0,roadSegments=[],stacks=[];
    function outerEdge(p,side){
      const edge=window.TS2.roadPoint(p,side),normal=p[side>0?'edgeLateralPositive':'edgeLateralNegative']??basis(p.yaw),nx=normal.x??normal.lx,nz=normal.z??normal.lz;
      return {x:edge.x+side*nx*.85,z:edge.z+side*nz*.85};
    }
    for(let index=0;index<runtime.pieces.length;index++){
      const piece=runtime.pieces[index];
      for(let i=1;i<piece.poses.length;i++){
        const a=piece.poses[i-1],b=piece.poses[i],points=[outerEdge(a,1),outerEdge(b,1),outerEdge(b,-1),outerEdge(a,-1)];
        roadSegments.push({points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});
      }
    }
    function hitsRoad(site){
      const radius=.4,cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x),inside=(a,b,c,p)=>{
        const u=cross(a,b,p),v=cross(b,c,p),w=cross(c,a,p);return (u>=-EPS&&v>=-EPS&&w>=-EPS)||(u<=EPS&&v<=EPS&&w<=EPS);};
      for(const s of roadSegments){if(site.x+radius<s.minX || site.x-radius>s.maxX || site.z+radius<s.minZ || site.z-radius>s.maxZ)continue;
        const p=s.points;if(inside(p[0],p[1],p[2],site)||inside(p[0],p[2],p[3],site))return true;
        for(let i=0;i<4;i++){const a=p[i],b=p[(i+1)%4],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((site.x-a.x)*dx+(site.z-a.z)*dz)/(dx*dx+dz*dz||1)));
          if(Math.hypot(site.x-a.x-t*dx,site.z-a.z-t*dz)<radius)return true;}
      }return false;
    }
    for(let index=0;index<runtime.pieces.length && stacks.length<1200;index++){
      const piece=runtime.pieces[index];if(piece.isGap || piece.poses.length<2)continue;
      const source=piece.source??{},style=window.TS2.edgeStyle((source.ES && source.ES.toLowerCase()!=='default'?source.ES:piece.end.edge)??'auto');
      const mode=style?.mode??'auto';if(mode!=='kerb' && !(mode==='auto' && options.sideMode!=='walls'))continue;
      const inside=piece.angle>0?1:-1,angle=Math.abs(piece.angle??0);
      for(const side of [1,-1]){
        const override=source[side>0?'TBL':'TBR'],global=side===inside?runtime.settings.tyreInside:runtime.settings.tyreOutside;
        const density=override??(piece.isCurve && global>0 && angle+1e-7>=90*(1-global)?1:0);
        if(!(density>0))continue;
        const stackPoint=p=>{const edge=outerEdge(p,side),normal=p[side>0?'edgeLateralPositive':'edgeLateralNegative']??basis(p.yaw),nx=normal.x??normal.lx,nz=normal.z??normal.lz,nlen=Math.hypot(nx,nz)||1;
          return {x:edge.x+side*nx/nlen*.46,z:edge.z+side*nz/nlen*.46};};
        const segments=[];let length=0;
        for(let i=1;i<piece.poses.length;i++){const a=piece.poses[i-1],b=piece.poses[i],pa=stackPoint(a),pb=stackPoint(b),distance=Math.hypot(pb.x-pa.x,pb.z-pa.z);
          if(distance>EPS){segments.push({a,b,pa,pb,from:length,to:length+distance});length+=distance;}}
        const slots=Math.floor(length/.86);if(slots<2)continue;
        const count=Math.min(slots,Math.max(2,2+Math.floor((slots-2)*Math.max(0,(density-.1)/.9))));
        for(let n=0;n<count && stacks.length<1200;n++){
          const distance=length/2+(n-(count-1)/2)*.86,seg=segments.find(s=>distance<=s.to+EPS)??segments.at(-1),t=Math.max(0,Math.min(1,(distance-seg.from)/(seg.to-seg.from)));
          const {a,b}=seg,y=a.y+(b.y-a.y)*t,bank=(window.TS2.heightAcross(a,side)+(window.TS2.heightAcross(b,side)-window.TS2.heightAcross(a,side))*t)-y;
          if(mode==='auto' && options.sideMode!=='kerbs' && (Math.abs(a.y-ground)>1e-6 || Math.abs(b.y-ground)>1e-6))continue;
          if(Math.abs(y-ground)>.06 || Math.abs(bank)>.06)continue;
          const delta=((b.yaw-a.yaw+540)%360)-180,yaw=a.yaw+delta*t,dir=basis(yaw);
          const site={kind:'tyreStack',index,side,distance,x:seg.pa.x+(seg.pb.x-seg.pa.x)*t,z:seg.pa.z+(seg.pb.z-seg.pa.z)*t,hx:.38,hz:.38,...dir,ground,red:Math.floor(n/2)%2===0};
          if(!onGround(site,terrain.bounds)||hitsRoad(site)||structures.some(other=>intersectsRect(site,other))||stacks.some(other=>Math.hypot(site.x-other.x,site.z-other.z)<.77)||!hasGround(site,terrain))continue;
          stacks.push(site);
        }
      }
    }
    return stacks;
  }
  function planNature(runtime,terrain,occupied,options={}){
    const settings=runtime.settings,ponds=[],trees=[],forests=[],rocks=[],bushes=[];
    if(!(settings.pondQuantity>0 || settings.treeDensity>0 || settings.rockDensity>0 || settings.bushDensity>0))return {ponds,trees,forests,rocks,bushes};
    const segments=[],ground=settings.groundY??0,area=terrain.bounds,grass=terrain.ground.positions,cell=12,grassCells=new Map();
    for(let i=0;i<grass.length;i+=9){
      const a={x:grass[i],z:grass[i+2]},b={x:grass[i+3],z:grass[i+5]},c={x:grass[i+6],z:grass[i+8]},triangle=[a,b,c];
      for(let x=Math.floor(Math.min(a.x,b.x,c.x)/cell);x<=Math.floor(Math.max(a.x,b.x,c.x)/cell);x++)for(let z=Math.floor(Math.min(a.z,b.z,c.z)/cell);z<=Math.floor(Math.max(a.z,b.z,c.z)/cell);z++){
        const key=x+','+z;if(!grassCells.has(key))grassCells.set(key,[]);grassCells.get(key).push(triangle);
      }
    }
    const grassAt=p=>{const candidates=grassCells.get(Math.floor(p.x/cell)+','+Math.floor(p.z/cell))??[];
      for(const [a,b,c] of candidates){const ab=(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x),bc=(c.x-b.x)*(p.z-b.z)-(c.z-b.z)*(p.x-b.x),ca=(a.x-c.x)*(p.z-c.z)-(a.z-c.z)*(p.x-c.x);
        if((ab>=-EPS&&bc>=-EPS&&ca>=-EPS)||(ab<=EPS&&bc<=EPS&&ca<=EPS))return true;}return false;};
    for(let index=0;index<runtime.pieces.length;index++)for(let i=1;i<runtime.pieces[index].poses.length;i++){
      const a=runtime.pieces[index].poses[i-1],b=runtime.pieces[index].poses[i],extra=Math.max(a.extraLeft??0,a.extraRight??0,b.extraLeft??0,b.extraRight??0),angle=Math.abs(((b.yaw-a.yaw+540)%360)-180)*RAD;
      const radius=Math.max(a.width,b.width)*.5+extra+1.1+Math.hypot(b.x-a.x,b.z-a.z)*.5*Math.tan(angle/4);
      segments.push({index,a,b,radius,length:Math.hypot(b.x-a.x,b.z-a.z),gap:runtime.pieces[index].isGap,minX:Math.min(a.x,b.x)-radius,maxX:Math.max(a.x,b.x)+radius,minZ:Math.min(a.z,b.z)-radius,maxZ:Math.max(a.z,b.z)+radius});
    }
    const reserved=[...occupied],dir=basis(0),covered=new Set(terrain.coveredIndices??[]),uncoveredSegments=segments.filter(s=>!covered.has(s.index));
    // City can have hundreds of buildings, so index reservations rather than
    // scanning all of them for every tree, rock and bush candidate.
    const reservationCells=new Map(),reservationSize=12;
    function reservationKeys(site,visit){const rx=Math.abs(site.lx)*site.hx+Math.abs(site.fx)*site.hz+.5,rz=Math.abs(site.lz)*site.hx+Math.abs(site.fz)*site.hz+.5;
      for(let x=Math.floor((site.x-rx)/reservationSize);x<=Math.floor((site.x+rx)/reservationSize);x++)for(let z=Math.floor((site.z-rz)/reservationSize);z<=Math.floor((site.z+rz)/reservationSize);z++)visit(x+','+z);}
    function indexReservation(site){reservationKeys(site,key=>{if(!reservationCells.has(key))reservationCells.set(key,[]);reservationCells.get(key).push(site);});}
    if(options.city)for(const site of reserved)indexReservation(site);
    function reserve(site){reserved.push(site);if(options.city)indexReservation(site);}
    function isReserved(site){if(!options.city)return reserved.some(other=>intersectsRect(site,other));
      const candidates=new Set();reservationKeys(site,key=>{for(const other of reservationCells.get(key)??[])candidates.add(other);});return [...candidates].some(other=>intersectsRect(site,other));}
    // Near a covered section, the ordinary centreline-radius reservation can
    // consume its entire roof at adjacent portals. Test the real road edges
    // for these candidates while still keeping an .8 m clearance margin.
    const roofNeighbours=covered.size?uncoveredSegments.map(s=>({...s,footprint:[window.TS2.roadPoint(s.a,1),window.TS2.roadPoint(s.a,-1),window.TS2.roadPoint(s.b,-1),window.TS2.roadPoint(s.b,1)]})):uncoveredSegments;
    const roofs=[...covered].map(index=>runtime.pieces[index]).filter(Boolean);
    const roofArea=roofs.reduce((sum,p)=>sum+Math.hypot(p.end.x-p.start.x,p.end.z-p.start.z)*((p.start.width+p.end.width)*.5+1.7),0);
    function roofPosition(rng,radius){
      const viable=roofs.map(piece=>{const length=Math.hypot(piece.end.x-piece.start.x,piece.end.z-piece.start.z),yaw=piece.start.yaw*RAD,margin=radius*(Math.abs(Math.cos(yaw))+Math.abs(Math.sin(yaw)))+.45;
        return {piece,length,yaw,margin,weight:Math.max(0,length-2*margin)*Math.max(0,Math.min(piece.start.width,piece.end.width)+1.7-2*margin)};}).filter(item=>item.weight>0);
      if(!viable.length)return null;
      let weight=rng()*viable.reduce((sum,item)=>sum+item.weight,0),chosen=viable.at(-1);
      for(const item of viable){if(weight<=item.weight){chosen=item;break;}weight-=item.weight;}
      const {piece,length,yaw,margin}=chosen,along=margin+rng()*(length-2*margin),t=along/length;
      const half=(piece.start.width+(piece.end.width-piece.start.width)*t)*.5+.85-margin,lateral=(rng()*2-1)*Math.max(0,half);
      return {x:piece.start.x+Math.sin(yaw)*along+Math.cos(yaw)*lateral,z:piece.start.z+Math.cos(yaw)*along-Math.sin(yaw)*lateral};
    }
    function clear(site,allowCovered=false,nearCover=false){
      if(!onGround(site,area)||intersectsRoad(site,allowCovered?(nearCover?roofNeighbours:uncoveredSegments):segments,undefined)||isReserved(site))return false;
      for(const x of [-site.hx,0,site.hx])for(const z of [-site.hz,0,site.hz])if(!grassAt(at(site,x*.98,z*.98)))return false;
      return true;
    }
    const roads=segments.filter(s=>!s.gap && s.length>EPS),roadLength=roads.reduce((sum,s)=>sum+s.length,0);
    function besideTrack(rng,extent){
      if(!roads.length)return null;
      let distance=rng()*roadLength,segment=roads.at(-1);for(const s of roads){if(distance<=s.length){segment=s;break;}distance-=s.length;}
      const t=Math.max(0,Math.min(1,distance/segment.length)),side=rng()<.5?-1:1,dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z,offset=segment.radius+extent+1+rng()*8;
      return {x:segment.a.x+dx*t+side*dz/segment.length*offset,z:segment.a.z+dz*t-side*dx/segment.length*offset};
    }
    // Separate random streams make each layout stable as density increases.
    const pondRandom=random(seedFor(runtime)^0x6e52c7a1),treeRandom=random(seedFor(runtime)^0x91d46e35);
    const targetPonds=!options.city && settings.pondQuantity>0?Math.max(1,Math.round(100*settings.pondQuantity**2)):0,maxDiameter=settings.pondMaxMetres??(2+28*(settings.pondMaxSize??.35));
    for(let tries=0;ponds.length<targetPonds && tries<targetPonds*20+80;tries++){
      // Reserve part of the deterministic size distribution for small ponds.
      // Their 2-10 m range stays fixed when the maximum rises above 10 m;
      // other candidates can use the full allowed range, up to 100 m.
      const sizePick=pondRandom(),smallSpan=Math.min(8,maxDiameter-2),diameter=sizePick<.5
        ?2+smallSpan*Math.pow(sizePick*2,1.5)
        :2+(maxDiameter-2)*(sizePick*2-1);
      const aspect=.68+.32*pondRandom(),angle=pondRandom()*Math.PI*2;
      // Keep the location stream independent of the shape's vertex count.
      // These two draws retain the earlier placement sequence for saved tracks.
      pondRandom();pondRandom();
      const extent=diameter*.5+.12,position=besideTrack(pondRandom,extent);if(!position)break;
      const site={kind:'pond',...position,hx:extent,hz:extent,...dir,ground};
      if(!clear(site))continue;
      const seed=(seedFor(runtime)^Math.imul(tries+1,0x9e3779b1))>>>0,shape=pondOutline(site.x,site.z,diameter,aspect,angle,seed);
      Object.assign(site,shape,{diameter});ponds.push(site);reserve(site);
    }
    if(options.city && settings.treeDensity>0){
      // Unlike forests, city trees can occupy any clear site in the map.
      const mapArea=(area.maxX-area.minX)*(area.maxZ-area.minZ),target=Math.min(700,Math.round(Math.min(700,Math.max(40,mapArea/150))*settings.treeDensity));
      for(let tries=0;trees.length<target && tries<target*30+100;tries++){
        const radius=.65+treeRandom()*.7,site={kind:'tree',x:area.minX+treeRandom()*(area.maxX-area.minX),z:area.minZ+treeRandom()*(area.maxZ-area.minZ),hx:radius,hz:radius,...dir,ground,radius,height:2.3+treeRandom()*2.6,shade:Math.floor(treeRandom()*3)};
        const style=treeRandom();site.shape=style<.25?'broadleaf':style<.58?'organic':'conifer';
        if(!clear(site,true))continue;trees.push(site);reserve(site);
      }
    }else if(settings.treeDensity>0 && roadLength>EPS){
      // The forest footprint may cross roads or extend beyond terrain. It is
      // only a sampling region: each individual tree must still pass clear().
      const count=Math.min(6,Math.max(2,Math.ceil(roadLength/120))),forestSeed=seedFor(runtime),forestRandom=random(forestSeed^0x873b926f),biases=Array.from({length:count},(_,i)=>(random(forestSeed^Math.imul(i+1,0x32c2f531))()-.5)*.2);
      for(let i=0;i<count;i++){
        let distance=roadLength*(i+.2+forestRandom()*.6)/count,segment=roads.at(-1);
        for(const s of roads){if(distance<=s.length){segment=s;break;}distance-=s.length;}
        const t=Math.max(0,Math.min(1,distance/segment.length)),side=forestRandom()<.5?-1:1,dx=segment.b.x-segment.a.x,dz=segment.b.z-segment.a.z;
        const offset=segment.radius+4+forestRandom()*10,cx=segment.a.x+dx*t+side*dz/segment.length*offset,cz=segment.a.z+dz*t-side*dx/segment.length*offset;
        const diameter=45+155*forestRandom()**3,aspect=.68+.32*forestRandom(),angle=forestRandom()*Math.PI*2,phase=forestRandom()*Math.PI*2,phase2=forestRandom()*Math.PI*2;
        forests.push({kind:'forest',x:cx,z:cz,diameter,points:roundedOutline(cx,cz,diameter,aspect,angle,phase,phase2)});
      }
      const inside=(p,poly)=>{let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
        const a=poly[i],b=poly[j];if((a.z>p.z)!==(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;};
      const nearRoad=p=>roads.some(s=>{const limit=s.radius+26;if(p.x<s.minX-26 || p.x>s.maxX+26 || p.z<s.minZ-26 || p.z>s.maxZ+26)return false;
        const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=Math.max(0,Math.min(1,((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/(s.length*s.length)));return Math.hypot(p.x-s.a.x-t*dx,p.z-s.a.z-t*dz)<=limit;});
      const targetTrees=Math.min(700,Math.round(Math.min(700,Math.max(40,roadLength*1.6))*(options.volcanic ? .25 : settings.treeDensity)));
      let roofTrees=0;const roofTreeLimit=Math.ceil(roofArea/32);
      for(let tries=0;trees.length<targetTrees && tries<targetTrees*45+150;tries++){
        const forest=forests[tries%forests.length],radius=(.65+treeRandom()*.7)*(options.volcanic?1.65:1),height=2.3+treeRandom()*2.6,extent=forest.diameter*.5;
        const forestId=tries%forests.length,bias=biases[forestId];
        const roofPoint=roofs.length && roofTrees<roofTreeLimit && tries%7===0?roofPosition(treeRandom,radius):null;
        const point=roofPoint??{x:forest.x+(treeRandom()*2-1)*extent,z:forest.z+(treeRandom()*2-1)*extent};
        const site={kind:'tree',...point,hx:radius,hz:radius,...dir,ground,radius,height,shade:Math.floor(treeRandom()*3),forest:forestId};
        const style=treeRandom();site.shape=style<.25+bias?'broadleaf':style<.58+bias?'organic':'conifer';
        if(!inside(site,forest.points) || !nearRoad(site) || !clear(site,true,!!roofPoint))continue;
        if(roofPoint)roofTrees++;trees.push(site);reserve(site);
      }
    }
    function placeDetails(kind,density,maximum,seed){
      const rng=random(seedFor(runtime)^seed),items=kind==='rock'?rocks:bushes,target=Math.min(maximum,Math.round(Math.min(maximum,Math.max(20,roadLength*.55))*density));
      let roofItems=0;const roofLimit=Math.ceil(roofArea/(kind==='rock'?50:24));
      for(let tries=0;items.length<target && tries<target*30+100;tries++){
        const diameter=kind==='rock'?1+9*rng()**1.6:1+rng()*1.4,radius=diameter*.5;
        const roofPoint=roofs.length && roofItems<roofLimit && tries%3===0?roofPosition(rng,radius):null;
        let position;if(roofPoint)position=roofPoint;else if(ponds.length && rng()<.45){const pond=ponds[Math.floor(rng()*ponds.length)],angle=rng()*Math.PI*2,distance=pond.hx+radius+1+rng()*5;
          position={x:pond.x+Math.cos(angle)*distance,z:pond.z+Math.sin(angle)*distance};}
        else position=besideTrack(rng,radius);if(!position)break;
        const site={kind,...position,hx:radius,hz:radius,...dir,ground,radius,diameter,height:kind==='rock'?diameter*(.35+rng()*.25):diameter*(.55+rng()*.2),shade:Math.floor(rng()*3),seed:Math.floor(rng()*0xffffffff)};
        if(!clear(site,true,!!roofPoint))continue;if(roofPoint)roofItems++;items.push(site);reserve(site);
      }
    }
    placeDetails('rock',settings.rockDensity??0,200,0x2856e73a);
    placeDetails('bush',settings.bushDensity??0,350,0xe723a919);
    return {ponds,trees,forests,rocks,bushes};
  }
  // A compact city grid inspired by Mini City. Sites are reserved against
  // every road (including bridges and gaps) and against authored scenery.
  // The fixed cap keeps even very large tracks practical to render and drive.
  function planCity(runtime,terrain,occupied){
    const buildings=[],streets=[],pavements=[],segments=[],bounds=terrain.bounds,ground=terrain.height,dir=basis(0),seed=seedFor(runtime),rng=random(seed^0x841db21),density=Math.max(0,Math.min(1,runtime.settings.pondQuantity??0)),pondSize=runtime.settings.pondMaxMetres??(2+28*(runtime.settings.pondMaxSize??.35)),maxHeight=Math.max(2,pondSize*.3);
    if(density<=0)return {buildings,streets,pavements};
    for(let index=0;index<runtime.pieces.length;index++)for(let i=1;i<runtime.pieces[index].poses.length;i++){
      const a=runtime.pieces[index].poses[i-1],b=runtime.pieces[index].poses[i],footprint=[window.TS2.roadPoint(a,1),window.TS2.roadPoint(a,-1),window.TS2.roadPoint(b,-1),window.TS2.roadPoint(b,1)],margin=1.2;
      segments.push({index,a,b,footprint,minX:Math.min(...footprint.map(p=>p.x))-margin,maxX:Math.max(...footprint.map(p=>p.x))+margin,minZ:Math.min(...footprint.map(p=>p.z))-margin,maxZ:Math.max(...footprint.map(p=>p.z))+margin});
    }
    // Index the actual ground triangles so buildings cannot stand in cutouts.
    const cell=16,groundCells=new Map(),p=terrain.ground.positions;
    for(let i=0;i<p.length;i+=9){const a={x:p[i],z:p[i+2]},b={x:p[i+3],z:p[i+5]},c={x:p[i+6],z:p[i+8]};
      for(let x=Math.floor(Math.min(a.x,b.x,c.x)/cell);x<=Math.floor(Math.max(a.x,b.x,c.x)/cell);x++)for(let z=Math.floor(Math.min(a.z,b.z,c.z)/cell);z<=Math.floor(Math.max(a.z,b.z,c.z)/cell);z++){
        const key=x+','+z;if(!groundCells.has(key))groundCells.set(key,[]);groundCells.get(key).push([a,b,c]);}}
    const groundAt=q=>{for(const [a,b,c] of groundCells.get(Math.floor(q.x/cell)+','+Math.floor(q.z/cell))??[]){
      const ab=(b.x-a.x)*(q.z-a.z)-(b.z-a.z)*(q.x-a.x),bc=(c.x-b.x)*(q.z-b.z)-(c.z-b.z)*(q.x-b.x),ca=(a.x-c.x)*(q.z-c.z)-(a.z-c.z)*(q.x-c.x);
      if((ab>=-EPS&&bc>=-EPS&&ca>=-EPS)||(ab<=EPS&&bc<=EPS&&ca<=EPS))return true;}return false;};
    const clear=site=>{if(!onGround(site,bounds)||intersectsRoad(site,segments,undefined)||occupied.some(other=>intersectsRect(site,other)))return false;
      for(const x of [-site.hx,0,site.hx])for(const z of [-site.hz,0,site.hz])if(!groundAt(at(site,x*.98,z*.98)))return false;return true;};
    // Four lots per block leave continuous open lanes. Shuffle blocks before
    // applying the cap so the city is distributed across the whole map.
    const width=bounds.maxX-bounds.minX,depth=bounds.maxZ-bounds.minZ,step=Math.max(12.2,Math.ceil(Math.sqrt(width*depth/130)/2)*2),blocks=[],fullBlocks=new Map();
    for(let x=Math.floor(bounds.minX/step);x<=Math.ceil(bounds.maxX/step);x++)for(let z=Math.floor(bounds.minZ/step);z<=Math.ceil(bounds.maxZ/step);z++)blocks.push({x:x*step,z:z*step,ix:x,iz:z,order:rng()});
    blocks.sort((a,b)=>a.order-b.order);
    for(const block of blocks){if(buildings.length>=700)break;
      const blockBuildings=[];
      for(const dx of [-2.15,2.15])for(const dz of [-2.15,2.15]){
        if(buildings.length>=700)break;
        const hx=1.38+rng()*.22,hz=1.38+rng()*.22,heightDraw=rng(),shade=Math.floor(rng()*6),roof=Math.floor(rng()*3),buildingSeed=Math.floor(rng()*0xffffffff),densityDraw=rng(),totalHeight=2+heightDraw*Math.max(0,maxHeight-2);
        const windowStyle=['square','horizontal','vertical'][Math.floor(random(buildingSeed^0x19fa273b)()*3)];
        const site={kind:'city',x:block.x+dx,z:block.z+dz,hx,hz,...dir,ground,height:totalHeight-[.28,.78,.75][roof],totalHeight,shade,roof,windowStyle,seed:buildingSeed};
        if(densityDraw>=density || !clear(site))continue;buildings.push(site);blockBuildings.push(site);
      }
      if(blockBuildings.length){
        // Cover the whole block when it is clear, leaving the gaps between
        // blocks as streets. Near a track or facility, use smaller safe lots.
        const blockPavement={kind:'cityPavement',x:block.x,z:block.z,hx:4.3,hz:4.3,...dir,ground};
        if(clear(blockPavement)){pavements.push(blockPavement);fullBlocks.set(`${block.ix},${block.iz}`,block);}
        else for(const building of blockBuildings){
          let pavement=null;
          for(const half of [2.15,1.95,1.75]){
            const site={kind:'cityPavement',x:building.x,z:building.z,hx:half,hz:half,...dir,ground};
            if(clear(site)){pavement=site;break;}
          }
          pavements.push(pavement??{kind:'cityPavement',x:building.x,z:building.z,hx:building.hx,hz:building.hz,...dir,ground});
        }
      }
      // Keep city street markings well away from the racing surface, including
      // curves, overpasses and gaps, while leaving nearby buildings unchanged.
      if(blockBuildings.length)for(const vertical of [false,true])for(const along of [-3,0,3]){
        const mark={x:block.x+(vertical?step/2:along),z:block.z+(vertical?along:step/2),hx:vertical?.07:.55,hz:vertical?.55:.07,...dir,ground};
        // intersectsRoad adds its normal .8 m margin; the larger test gives
        // the markings a total 8 m clearance from the track's actual edges.
        if(clear(mark) && !intersectsRoad({...mark,hx:mark.hx+7.2,hz:mark.hz+7.2},segments))streets.push(mark);
      }
    }
    // Occasionally fill the street between two complete blocks with a pair
    // of buildings. Each block joins at most once, keeping most streets open.
    const gap=step-8.6,joined=new Set(),joinRandom=random(seed^0x65c129e3);
    if(gap>=3.4 && gap<=8)for(const block of fullBlocks.values())for(const [dx,dz] of [[1,0],[0,1]]){
      if(buildings.length+2>700)break;
      const key=`${block.ix},${block.iz}`,otherKey=`${block.ix+dx},${block.iz+dz}`,other=fullBlocks.get(otherKey);
      if(!other || joined.has(key) || joined.has(otherKey) || joinRandom()>=.12)continue;
      const joinId=`${key}:${dx?'x':'z'}`,pavement={kind:'cityPavement',joinId,x:(block.x+other.x)*.5,z:(block.z+other.z)*.5,hx:dx?gap*.5:4.3,hz:dz?gap*.5:4.3,...dir,ground};
      if(!clear(pavement))continue;
      const pair=[];
      for(const along of [-2.15,2.15]){
        const hx=1.38+joinRandom()*.22,hz=1.38+joinRandom()*.22,roof=Math.floor(joinRandom()*3),shade=Math.floor(joinRandom()*6),buildingSeed=Math.floor(joinRandom()*0xffffffff),totalHeight=2+joinRandom()*Math.max(0,maxHeight-2);
        const site={kind:'city',joinId,x:pavement.x+(dz?along:0),z:pavement.z+(dx?along:0),hx,hz,...dir,ground,height:totalHeight-[.28,.78,.75][roof],totalHeight,shade,roof,windowStyle:['square','horizontal','vertical'][Math.floor(random(buildingSeed^0x19fa273b)()*3)],seed:buildingSeed};
        pair.push(site);
      }
      if(pair.some(site=>!clear(site) || buildings.some(other=>intersectsRect(site,other))) || intersectsRect(pair[0],pair[1]))continue;
      buildings.push(...pair);pavements.push(pavement);joined.add(key);joined.add(otherKey);
      // The filled street is no longer a road, so remove its lane markings.
      for(let i=streets.length-1;i>=0;i--)if(intersectsRect(streets[i],pavement))streets.splice(i,1);
    }
    return {buildings,streets,pavements};
  }
  function generate(runtime,terrain,options={}){
    const requested=options.environment??runtime.settings.environment,environment=['desert','snow','autumn','volcanic','city'].includes(requested)?requested:'grasslands',city=environment==='city';
    // Trackside facilities and barriers have priority over city blocks. Trees
    // and other nature are then placed in the remaining available space.
    const placements=plan(runtime,terrain),obstacles=[...placements,...placements.flatMap(p=>p.access?[p.access]:[])],tyreStacks=planTyreStacks(runtime,terrain,obstacles,options);
    const cityPlan=city?planCity(runtime,terrain,[...obstacles,...tyreStacks]):{buildings:[],streets:[],pavements:[]},cityBuildings=cityPlan.buildings;
    const nature=planNature(runtime,terrain,[...obstacles,...tyreStacks,...cityBuildings],{city,volcanic:environment==='volcanic'}),{ponds,forests,rocks,bushes}=nature;
    // Desert cacti use a sparse deterministic subset; volcanic formations
    // are already planned at a fixed quarter of the full tree-site target.
    const trees=environment==='desert'?nature.trees.filter(t=>((Math.imul(Math.round(t.x*10),73856093)^Math.imul(Math.round(t.z*10),19349663))>>>0)%3===0):nature.trees;
    const visual=buffer(),nightWindows=options.night?buffer():null,collision={positions:[]},sceneSeed=seedFor(runtime);visual.collisionDisabled=true;
    function point(c,x,y,z){const p=at(c,x,z);return {x:p.x,y:c.ground+y,z:p.z};}
    let buildingPalette=false;
    function face(a,b,c,d,color){visual.quad(a,b,c,d,color,buildingPalette);}
    function triangle(a,b,c,color){visual.tri(a,b,c,color,buildingPalette);}
    function box(c,x,y,z,w,h,l,color,solid=false,snowTop=false){
      const lo=x-w/2,hi=x+w/2,front=z-l/2,back=z+l/2,bottom=y,top=y+h;
      const a=point(c,lo,bottom,front),b=point(c,hi,bottom,front),d=point(c,lo,bottom,back),e=point(c,hi,bottom,back),
        A=point(c,lo,top,front),B=point(c,hi,top,front),D=point(c,lo,top,back),E=point(c,hi,top,back);
      face(a,d,e,b,color);face(A,B,E,D,environment==='snow' && snowTop?0xe9f1f4:color);face(a,b,B,A,color);face(b,e,E,B,color);face(e,d,D,E,color);face(d,a,A,D,color);
      if(solid)for(const [p,q,r,s] of [[a,b,B,A],[b,e,E,B],[e,d,D,E],[d,a,A,D]])for(const v of [p,q,r,p,r,s])collision.positions.push(v.x,v.y,v.z);
    }
    function tyreStack(c){
      const sides=10,colour=c.red?0xc42e35:0xe9ebea,rim=.19;
      const ring=(radius,y,i)=>point(c,Math.cos(i*2*Math.PI/sides)*radius,y,Math.sin(i*2*Math.PI/sides)*radius);
      for(let k=0;k<4;k++)for(let i=0;i<sides;i++){
        const j=i+1,y=k*.22;
        for(const [r0,h0,r1,h1] of [[.35,y,.39,y+.035],[.39,y+.035,.39,y+.185],[.39,y+.185,.35,y+.22]])face(ring(r0,h0,i),ring(r0,h0,j),ring(r1,h1,j),ring(r1,h1,i),colour);
        face(ring(.35,y+.22,i),ring(.35,y+.22,j),ring(rim,y+.22,j),ring(rim,y+.22,i),colour);
        face(ring(rim,y+.22,i),ring(rim,y+.22,j),ring(rim,y+.13,j),ring(rim,y+.13,i),0x24262a);
      }
      for(let i=0;i<sides;i++)triangle(point(c,0,.78,0),ring(rim,.78,i),ring(rim,.78,i+1),0x17191c);
      for(let i=0;i<sides;i++){const a=ring(.39,0,i),b=ring(.39,0,i+1),C=ring(.39,.88,i+1),D=ring(.39,.88,i);for(const v of [a,b,C,a,C,D])collision.positions.push(v.x,v.y,v.z);}
    }
    function organicCanopy(c,centreY,heightRadius,colour,snow=false){
      const seed=c.seed??(sceneSeed^Math.imul(Math.round(c.x*1000),0x45d9f3b)^Math.imul(Math.round(c.z*1000),0x119de1f3)),rng=random(seed),p=rng()*Math.PI*2,q=rng()*Math.PI*2,r=rng()*Math.PI*2;
      const deformed=foliageSphere.vertices.map(([x,y,z])=>{const noise=.16*Math.sin(3.7*x+2.1*y+1.5*z+p)+.11*Math.sin(-1.8*x+3.4*y+3.1*z+q)+.07*Math.cos(4.2*x-2.7*z+r),scale=1+noise;
        return {x:x*scale,y:y*scale,z:z*scale};});
      const horizontal=Math.max(...deformed.map(v=>Math.hypot(v.x,v.z))),vertical=Math.max(...deformed.map(v=>Math.abs(v.y)));
      const vertices=deformed.map(v=>point(c,v.x/horizontal*c.radius,centreY+v.y/vertical*heightRadius,v.z/horizontal*c.radius));
      if(!snow){for(const [a,b,d] of foliageSphere.faces)triangle(vertices[a],vertices[b],vertices[d],colour);return;}
      const centre=point(c,0,centreY,0);
      for(const [a,b,d] of foliageSphere.faces){
        const A=vertices[a],B=vertices[b],C=vertices[d],u={x:B.x-A.x,y:B.y-A.y,z:B.z-A.z},v={x:C.x-A.x,y:C.y-A.y,z:C.z-A.z};
        let nx=u.y*v.z-u.z*v.y,ny=u.z*v.x-u.x*v.z,nz=u.x*v.y-u.y*v.x;
        const out=(A.x+B.x+C.x)/3-centre.x,up=(A.y+B.y+C.y)/3-centre.y,across=(A.z+B.z+C.z)/3-centre.z;
        if(nx*out+ny*up+nz*across<0){nx=-nx;ny=-ny;nz=-nz;}
        triangle(A,B,C,ny>Math.hypot(nx,ny,nz)*.25?0xe5eef0:colour);
      }
    }
    function cactus(c){
      const sides=8,radius=.14+c.radius*.075,visualRadius=.23+c.radius*.09,height=c.height*.9,colour=[0x417b4b,0x518653,0x386d42][c.shade];
      const ring=(r,y,i)=>point(c,Math.cos(i*2*Math.PI/sides)*r,y,Math.sin(i*2*Math.PI/sides)*r);
      for(let i=0;i<sides;i++){const a=ring(visualRadius,0,i),b=ring(visualRadius,0,i+1),C=ring(visualRadius,height-.14,i+1),D=ring(visualRadius,height-.14,i);
        face(a,b,C,D,colour);triangle(D,C,point(c,0,height,0),colour);
        const ca=ring(radius,0,i),cb=ring(radius,0,i+1),cc=ring(radius,c.height*.4,i+1),cd=ring(radius,c.height*.4,i);
        for(const v of [ca,cb,cc,ca,cc,cd])collision.positions.push(v.x,v.y,v.z);
      }
      // Chunky low-poly arms are visual foliage, like the existing tree canopy.
      for(const side of [-1,1]){if(side===1 && c.shade===0)continue;const y=height*(side<0 ? .42 : .57),reach=Math.min(c.radius*.72,.8),thickness=visualRadius*.85;
        box(c,side*reach*.5,y,0,reach,thickness,thickness,colour);box(c,side*reach,y,0,thickness,height*.24,thickness,colour);}
    }
    function tree(c){
      if(environment==='desert'){cactus(c);return;}
      if(environment==='volcanic'){
        // A seeded, compact hexagonal cluster: the setting controls the
        // number of columns, not the number of formation sites.
        const seed=(sceneSeed^Math.imul(Math.round(c.x*1000),0x45d9f3b)^Math.imul(Math.round(c.z*1000),0x119de1f3))>>>0,rng=random(seed),rotation=rng()*Math.PI*2;
        const density=Math.max(0,Math.min(1,runtime.settings.treeDensity)),maxColumns=3+Math.round(27*density),count=3+Math.floor(rng()*(maxColumns-2));
        c.pillarCount=count;
        const cells=[];for(let q=-4;q<=4;q++)for(let r=-4;r<=4;r++)if(Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=4){
          const x=Math.sqrt(3)*(q+r/2),z=1.5*r,order=random((seed^Math.imul(q+7,73856093)^Math.imul(r+7,19349663))>>>0)();
          cells.push({x,z,distance:Math.hypot(x,z),order});
        }
        cells.sort((a,b)=>a.distance-b.distance || a.order-b.order);const chosen=cells.slice(0,count),scale=c.radius/(Math.max(...chosen.map(cell=>cell.distance))+1),radius=scale*.92;
        const sides=6,colours=[0x4c4c4b,0x585854,0x424342],cos=Math.cos(rotation),sin=Math.sin(rotation);
        for(let column=0;column<count;column++){
          const cell=chosen[column],cx=(cell.x*cos-cell.z*sin)*scale,cz=(cell.x*sin+cell.z*cos)*scale,height=c.height*(.38+rng()*.48),colour=colours[(c.shade+column)%colours.length];
          const ring=(y,i)=>point(c,cx+Math.cos(i*Math.PI/3+rotation+Math.PI/6)*radius,y,cz+Math.sin(i*Math.PI/3+rotation+Math.PI/6)*radius);
          const centre=point(c,cx,height,cz);
          for(let i=0;i<sides;i++){
            const a=ring(0,i),b=ring(0,i+1),C=ring(height,i+1),D=ring(height,i);
            face(a,b,C,D,colour);triangle(centre,C,D,colour);
            for(const v of [a,b,C,a,C,D])collision.positions.push(v.x,v.y,v.z);
          }
        }
        return;
      }
      const sides=8,trunk=.14+c.radius*.075,top=c.height*.4;
      const ring=(r,y,i)=>point(c,Math.cos(i*2*Math.PI/sides)*r,y,Math.sin(i*2*Math.PI/sides)*r);
      for(let i=0;i<sides;i++){
        const a=ring(trunk,0,i),b=ring(trunk,0,i+1),C=ring(trunk,top,i+1),D=ring(trunk,top,i);
        face(a,b,C,D,0x76513a);for(const v of [a,b,C,a,C,D])collision.positions.push(v.x,v.y,v.z);
      }
      const colours=environment==='autumn' && c.shape!=='conifer'?[0xd7922e,0xb44c29,0xc97b27]:[0x347144,0x407d47,0x29643e],colour=colours[c.shade];
      if(c.shape==='organic')organicCanopy(c,c.height*.69,c.height*.4,colour,environment==='snow');
      else if(c.shape==='broadleaf')for(let i=0;i<sides;i++){
        const j=i+1;face(ring(c.radius*.55,c.height*.42,i),ring(c.radius*.55,c.height*.42,j),ring(c.radius,c.height*.65,j),ring(c.radius,c.height*.65,i),colour);
        face(ring(c.radius,c.height*.65,i),ring(c.radius,c.height*.65,j),ring(c.radius*.68,c.height*.86,j),ring(c.radius*.68,c.height*.86,i),environment==='snow'?0xe5eef0:colour);
        triangle(ring(c.radius*.68,c.height*.86,i),ring(c.radius*.68,c.height*.86,j),point(c,0,c.height,0),environment==='snow'?0xe5eef0:colour);
      }else for(const [base,radius,apex] of [[c.height*.25,c.radius,c.height*.72],[c.height*.48,c.radius*.78,c.height]])for(let i=0;i<sides;i++){
        if(environment==='snow'){
          const a=ring(radius,base,i),b=ring(radius,base,i+1),upperA=ring(radius*.5,(base+apex)*.5,i),upperB=ring(radius*.5,(base+apex)*.5,i+1);
          face(a,b,upperB,upperA,colour);triangle(upperA,upperB,point(c,0,apex,0),0xe5eef0);
        }else triangle(ring(radius,base,i),ring(radius,base,i+1),point(c,0,apex,0),colour);
        triangle(point(c,0,base,0),ring(radius,base,i+1),ring(radius,base,i),0x285d37);
      }
    }
    function naturalDetail(c){
      const sides=8,rng=random(c.seed),palette=c.kind==='rock'?[0x777d7e,0x898d89,0x6c7271]:environment==='autumn'?[0x9a6d30,0xb08037,0x82602c]:environment==='volcanic'?[0x51483b,0x605442,0x453d35]:[0x3f7639,0x4c873f,0x356b3a],colour=palette[c.shade],base=[];
      if(c.kind==='bush'){
        organicCanopy(c,c.height*.43,c.height*.54,colour);
        // Let the car enter the foliage before reaching a small, solid core.
        const radius=c.radius*.32;for(let i=0;i<sides;i++){const a=i*2*Math.PI/sides,b=(i+1)*2*Math.PI/sides,
          A=point(c,Math.cos(a)*radius,0,Math.sin(a)*radius),B=point(c,Math.cos(b)*radius,0,Math.sin(b)*radius),
          C={...B,y:c.ground+c.height*.65},D={...A,y:c.ground+c.height*.65};
          for(const v of [A,B,C,A,C,D])collision.positions.push(v.x,v.y,v.z);}
        return;
      }
      const rotation=rng()*Math.PI*2,stretchX=.72+rng()*.28,stretchZ=.72+rng()*.28;
      for(let i=0;i<sides;i++){const a=rotation+i*2*Math.PI/sides,r=c.radius*(.82+rng()*.18);base.push(point(c,Math.cos(a)*r*stretchX,.03,Math.sin(a)*r*stretchZ));}
      // Collision stays a dependable vertical hull under the visual model.
      for(let i=0;i<sides;i++){const a=base[i],b=base[(i+1)%sides],A={...a,y:c.ground+c.height*.7},B={...b,y:c.ground+c.height*.7};
        for(const v of [a,b,B,a,B,A])collision.positions.push(v.x,v.y,v.z);}
      // Two uneven rings and a broad faceted crown give each boulder its own
      // silhouette; no single peak makes it resemble a tent.
      const middle=[],top=[],leanX=(rng()-.5)*c.radius*.28,leanZ=(rng()-.5)*c.radius*.28;
      for(let i=0;i<sides;i++){const a=rotation+i*2*Math.PI/sides,midR=c.radius*(.84+rng()*.16),topR=c.radius*(.38+rng()*.25);
        middle.push(point(c,Math.cos(a)*midR*stretchX,c.height*(.34+rng()*.19),Math.sin(a)*midR*stretchZ));
        top.push(point(c,leanX+Math.cos(a)*topR*stretchX,c.height*(.78+rng()*.2),leanZ+Math.sin(a)*topR*stretchZ));}
      for(let i=0;i<sides;i++){const j=(i+1)%sides;face(base[i],base[j],middle[j],middle[i],colour);face(middle[i],middle[j],top[j],top[i],colour);}
      for(let i=1;i<sides-1;i++)triangle(top[0],top[i],top[i+1],colour);
    }
    function standEnd(c,z){
      // The end walls rise towards the back of the stepped seating, rather
      // than closing the stand with a tall rectangular block.
      const front=-c.side*3.15,back=c.side*3.15,z0=z-.17,z1=z+.17;
      const a=point(c,front,.2,z0),b=point(c,back,.2,z0),C=point(c,back,2.3,z0),D=point(c,front,.58,z0),
        a1=point(c,front,.2,z1),b1=point(c,back,.2,z1),C1=point(c,back,2.3,z1),D1=point(c,front,.58,z1),color=0xc4ccce;
      face(a,b,C,D,color);face(a1,D1,C1,b1,color);face(D,C,C1,D1,0xe0e4e2);face(a,a1,b1,b,color);face(a,D,D1,a1,color);face(b,b1,C1,C,color);
      for(const [p,q,r,s] of [[a,b,C,D],[a1,b1,C1,D1]])for(const v of [p,q,r,p,r,s])collision.positions.push(v.x,v.y,v.z);
    }
    function controlRoom(c){
      const ring=(x,z,cut)=>[[-x+cut,-z],[x-cut,-z],[x,-z+cut],[x,z-cut],[x-cut,z],[-x+cut,z],[-x,z-cut],[-x,-z+cut]];
      const low=ring(2.12,2.47,.65),high=ring(2.55,2.9,.8),roof=ring(2.75,3.1,.86),y0=2.88,y1=5.75;
      const lerp=(a,b,t)=>a+(b-a)*t;
      for(let i=0;i<8;i++){
        const j=(i+1)%8,A=low[i],B=low[j],C=high[j],D=high[i];
        face(point(c,A[0],y0,A[1]),point(c,B[0],y0,B[1]),point(c,C[0],y1,C[1]),point(c,D[0],y1,D[1]),0xc8cfd0);
        const dx=B[0]-A[0],dz=B[1]-A[1],mag=Math.hypot(dx,dz),nx=dz/mag*.025,nz=-dx/mag*.025;
        const pane=(u,v)=>{const x0=lerp(A[0],B[0],u),z0=lerp(A[1],B[1],u),x1=lerp(D[0],C[0],u),z1=lerp(D[1],C[1],u);
          return point(c,lerp(x0,x1,v)+nx,lerp(y0,y1,v),lerp(z0,z1,v)+nz);};
        const glass=[pane(.1,.19),pane(.9,.19),pane(.9,.83),pane(.1,.83)];
        if(nightWindows)nightWindows.quad(...glass,0xffd35b,true);else face(...glass,0x255a91);
        const R=roof[i],S=roof[j];face(point(c,R[0],y1,R[1]),point(c,S[0],y1,S[1]),point(c,S[0],y1+.22,S[1]),point(c,R[0],y1+.22,R[1]),0xbb3535);
        triangle(point(c,0,y1+.22,0),point(c,R[0],y1+.22,R[1]),point(c,S[0],y1+.22,S[1]),environment==='snow'?0xe9f1f4:0xbb3535);
      }
    }
    function bridgeRamp(c,side,pier){
      const inner=side*(pier+.4),outer=side*(pier+6),a=point(c,inner,0,-1.3),b=point(c,outer,0,-1.3),top=point(c,inner,3.2,-1.3),
        a1=point(c,inner,0,1.3),b1=point(c,outer,0,1.3),top1=point(c,inner,3.2,1.3);
      triangle(a,b,top,0xb7bec0);triangle(a1,top1,b1,0xb7bec0);face(top,b,b1,top1,0xc8cdcc);face(a,a1,b1,b,0xa8b0b0);
      for(const v of [a,b,top,a1,top1,b1])collision.positions.push(v.x,v.y,v.z);
    }
    for(const c of placements){
      buildingPalette=c.kind==='stand'||c.kind==='building'||c.kind==='parking'||c.kind==='tyre';
      if(c.kind==='stand'){
        const length=c.modelLength??11.4,seats=length-.8;
        box(c,0,0,0,6.4,.25,length,0xaeb9bd,true);
        for(let i=0;i<8;i++){
          const height=.21+i*.21,x=c.side*(-2.73+i*.78);
          box(c,x,.25,0,.75,height,seats,0x3268a5,true);
          box(c,x,.25+height,0,.75,.05,seats,0x3b81c6);
        }
        for(const z of [-length/2+.18,length/2-.18])standEnd(c,z);
        box(c,c.side*3.02,.25,0,.25,2.05,length-.35,0xc4ccce,true);
        const supports=Math.max(2,Math.ceil(length/5));for(let i=0;i<=supports;i++){const z=-length/2+.65+i*(length-1.3)/supports;box(c,c.side*2.65,.25,z,.25,3.4,.25,0xaeb8bb);}
        box(c,0,3.58,0,6.35,.16,length+.3,0x525b5e);
        box(c,0,3.74,0,6.35,.22,length+.3,0xbf3938,false,true);
      }else if(c.kind==='building'){
        // Paddock building: two garage bays below a glazed control room.
        box(c,0,0,0,7,2.8,8.8,0xc6cdcd,true);
        for(const z of [-2.15,2.15]){
          box(c,-c.side*3.51,.12,z,.04,2.05,3.1,0x39454c);
          box(c,-c.side*3.54,2.18,z,.04,.09,3.1,0x9ea9ac);
        }
        for(const z of [-4.41,4.41])box(c,1.8,.1,z,.7,.95,.04,0x275f98);
        box(c,0,2.8,0,6.88,.08,8.68,0xb9c1c3,false,true);
        for(const side of [-1,1]){
          box(c,side*3.5,2.66,0,.1,.22,8.9,0xb63433);
          box(c,0,2.66,side*4.4,7.1,.22,.1,0xb63433);
        }
        controlRoom(c);
      }else if(c.kind==='footbridge'){
        const pier=c.half+1.55,span=pier*2+.8;
        box(c,0,3.2,0,span,.3,2.6,0xb9c1c5);for(const side of [-1,1]){
          box(c,side*pier,0,0,.8,3.2,2.6,0xa1abad,true);
          bridgeRamp(c,side,pier);
        }
        const posts=Math.max(4,Math.ceil(span/1.8));for(const z of [-1.15,1.15]){box(c,0,4.02,z,span,.07,.07,0x327cb1);for(let i=0;i<=posts;i++)box(c,-span/2+i*span/posts,3.5,z,.07,.52,.07,0x327cb1);}
      }else if(c.kind==='parking'){
        const rng=random(c.seed),colours=[0xd43b32,0x2766ae,0xe7ba35,0xd9e1e4,0x30333b,0x31a99a,0xc45a92];
        if(c.access)box(c.access,0,.012,0,c.access.hx*2,.015,c.access.hz*2,0x50575c);
        box(c,0,.01,0,14,.04,12,0x50575c);
        for(let i=0;i<=8;i++)for(const side of [-1,1])box(c,-6+i*1.5,.055,side*3.1,.045,.012,3.3,0xe6e8df);
        let occupied=0;for(let i=0;i<8;i++)for(const side of [-1,1])if(rng()<.68 || (i===7 && side===1 && occupied===0)){
          occupied++;
          const x=-5.25+i*1.5,z=side*3.1,color=colours[Math.floor(rng()*colours.length)];
          box(c,x,.07,z,.86,.22,1.75,color,true);box(c,x,.29,z,.65,.23,.75,0x183b4b);box(c,x,.52,z,.7,.05,.72,color);
          for(const dx of [-.48,.48])for(const dz of [-.55,.55])box(c,x+dx,.06,z+dz,.14,.18,.28,0x1e2528);
        }
      }else{
        // A broad upper slice of a tyre, with angled ends and a generous
        // opening. The inset panel is above the road, not a driving barrier.
        const start=Math.PI/7,cosStart=Math.cos(start),sinStart=Math.sin(start),rx=c.half+3.6,outer=rx+2.4,depth=1.65;
        const edgeSin=Math.sqrt(1-(c.half*cosStart/rx)**2),edgeFraction=(edgeSin-sinStart)/(1-sinStart);
        const ry=Math.max(4.4,4.25/edgeFraction),outerY=ry+1.6;
        const p=(r,h,t,z,lift=0)=>point(c,r*Math.cos(t)/cosStart+lift*Math.cos(t),h*(Math.sin(t)-sinStart)/(1-sinStart)+lift*Math.sin(t),z);
        for(let i=0;i<24;i++){
          const a=start+(Math.PI-2*start)*i/24,b=start+(Math.PI-2*start)*(i+1)/24;
          const ia=p(rx,ry,a,-depth),ib=p(rx,ry,b,-depth),oa=p(outer,outerY,a,-depth),ob=p(outer,outerY,b,-depth),
            ia2=p(rx,ry,a,depth),ib2=p(rx,ry,b,depth),oa2=p(outer,outerY,a,depth),ob2=p(outer,outerY,b,depth);
          face(ia,ib,ob,oa,0x222328);face(ia2,oa2,ob2,ib2,0x222328);face(oa,ob,ob2,oa2,0x292b30);face(ia,ia2,ib2,ib,0x1a1c20);
          if(Math.min(ia.y,ib.y)-c.ground<2.5)for(const [u,v,w,x] of [[ia,ib,ob,oa],[ia2,oa2,ob2,ib2],[ia,ia2,ib2,ib],[oa,ob,ob2,oa2]])
            for(const vertex of [u,v,w,u,w,x])collision.positions.push(vertex.x,vertex.y,vertex.z);
        }
        // Short diagonal strips across the tread suggest the raised blocks of
        // a racing tyre without needing a texture or additional collision.
        const arc=Math.PI-2*start;
        for(let i=1;i<20;i++){
          const t=start+arc*i/20,d=.018,slant=.055;
          face(p(outer,outerY,t,-depth+.06,.035),p(outer,outerY,t+d,-depth+.06,.035),
               p(outer,outerY,t+d+slant,0,.035),p(outer,outerY,t+slant,0,.035),0x121419);
          face(p(outer,outerY,t+slant,0,.035),p(outer,outerY,t+d+slant,0,.035),
               p(outer,outerY,t+d,depth-.06,.035),p(outer,outerY,t,depth-.06,.035),0x121419);
        }
        // Yellow infill follows the inside of the tyre and finishes above the
        // clearance line; both faces are visible from either race direction.
        const panelBottom=4.17,limit=c.half;
        const innerHeight=x=>ry*(Math.sqrt(Math.max(0,1-(x*cosStart/rx)**2))-sinStart)/(1-sinStart);
        for(const z of [-.95,.95])for(let i=0;i<16;i++){
          const x0=-limit+2*limit*i/16,x1=-limit+2*limit*(i+1)/16;
          face(point(c,x0,panelBottom,z),point(c,x1,panelBottom,z),point(c,x1,innerHeight(x1),z),point(c,x0,innerHeight(x0),z),0xf7bd18);
        }
        box(c,0,panelBottom-.1,0,limit*2,.1,2,0xb58a16);
        for(const side of [-1,1])box(c,side*(c.half+4.85),0,0,3.2,.55,4.2,0x92979a,true);
      }
    }
    buildingPalette=true;for(const stack of tyreStacks)tyreStack(stack);for(const item of trees)tree(item);for(const item of [...rocks,...bushes])naturalDetail(item);
    // These shallow slabs are visual pavement; vehicles still use the same
    // terrain surface and the existing solid building walls for collision.
    for(const pavement of cityPlan.pavements)box(pavement,0,0,0,pavement.hx*2,.10,pavement.hz*2,0xb4b6b3);
    for(const c of cityBuildings){
      const rand=random(c.seed),width=c.hx*2-.22,depth=c.hz*2-.22,height=c.height,palette=[0xb8b3a8,0x9ea7ac,0xc6b69e,0x979b9c,0xb29f98,0xaaaeb4],colour=palette[c.shade];
      // Solid walls use the same collision mesh as the trackside structures.
      box(c,0,.10,0,width,height,depth,colour,true);
      if(c.roof===0)box(c,0,height+.10,0,width+.08,.18,depth+.08,0x545a5e);
      else if(c.roof===1){box(c,0,height+.10,0,width+.05,.18,depth+.05,0x5e6263);box(c,0,height+.28,0,width*.55,.50,depth*.55,colour,true);}
      else {const y=height+.10,ridge=y+.65;
        face(point(c,-width/2,y,-depth/2),point(c,0,ridge,-depth/2),point(c,0,ridge,depth/2),point(c,-width/2,y,depth/2),0x5f5553);
        face(point(c,0,ridge,-depth/2),point(c,width/2,y,-depth/2),point(c,width/2,y,depth/2),point(c,0,ridge,depth/2),0x5f5553);
        triangle(point(c,-width/2,y,-depth/2),point(c,width/2,y,-depth/2),point(c,0,ridge,-depth/2),colour);
        triangle(point(c,width/2,y,depth/2),point(c,-width/2,y,depth/2),point(c,0,ridge,depth/2),colour);}
      // Bound window geometry on tall buildings to keep maximum height usable.
      const floors=Math.min(16,Math.max(1,Math.floor(height/1.25)));
      for(let floor=0;floor<floors;floor++)for(const side of [-1,1])for(const axis of ['x','z']){
        const span=axis==='x'?depth:width,available=(height-.3)/floors,desiredHeight=c.windowStyle==='vertical'?.85:c.windowStyle==='horizontal'?.30:.56;
        const h=Math.min(desiredHeight,available*.8),desiredWidth=c.windowStyle==='vertical'?.38:c.windowStyle==='horizontal'?1.05:.58,w=Math.min(desiredWidth,span*.38);
        const y=.15+(height-.3)*(floor+.5)/floors-h/2,offset=(axis==='x'?width:depth)/2+.012;
        for(const along of [-.25,.25]){const centre=along*(axis==='x'?depth:width);
          const points=axis==='x'?[point(c,side*offset,y,centre-w/2),point(c,side*offset,y,centre+w/2),point(c,side*offset,y+h,centre+w/2),point(c,side*offset,y+h,centre-w/2)]:[point(c,centre-w/2,y,side*offset),point(c,centre+w/2,y,side*offset),point(c,centre+w/2,y+h,side*offset),point(c,centre-w/2,y+h,side*offset)];
          if(nightWindows && rand()<.4)nightWindows.quad(...points,0xffd276,true);else face(...points,0x47677a);
        }
      }
    }
    for(const mark of cityPlan.streets)face(point(mark,-mark.hx,.018,-mark.hz),point(mark,mark.hx,.018,-mark.hz),point(mark,mark.hx,.018,mark.hz),point(mark,-mark.hx,.018,mark.hz),0xc5c3b1);
    return {visual,nightWindows,collision,placements,tyreStacks,ponds,trees,forests,rocks,bushes,cityBuildings,cityStreets:cityPlan.streets,cityPavements:cityPlan.pavements,stats:{total:placements.length,stands:placements.filter(p=>p.kind==='stand').length,buildings:placements.filter(p=>p.kind==='building').length,bridges:placements.filter(p=>p.kind==='footbridge'||p.kind==='tyre').length,parking:placements.filter(p=>p.kind==='parking').length,tyreStacks:tyreStacks.length,ponds:ponds.length,trees:trees.length,rocks:rocks.length,bushes:bushes.length,cityBuildings:cityBuildings.length}};
  }
  window.TrackScenery={plan,planTyreStacks,planNature,generate,enabled};
})();
