/* Playable terrain with exact polygon cuttings and pond depressions. Render/collision share buffers. */
(function () {
  'use strict';
  const EPS=1e-8;
  const PALETTES=Object.freeze({
    grasslands:{ground:0x618c64,bank:0x6b8b5e,soil:0x66503b,water:0x397f9d},
    desert:{ground:0xb5663c,bank:0xbf7d4d,soil:0x87452e,basin:0xd1a273,dryBasins:true},
    snow:{ground:0xe6eef2,bank:0xcbdde4,soil:0x929da0,water:0x729aa9},
    autumn:{ground:0x96844d,bank:0x88703e,soil:0x66503b,water:0x397f9d},
    volcanic:{ground:0x393532,bank:0x51423a,soil:0x332b29,water:0xe25710,lava:true},
    city:{ground:0x505963,bank:0x777c7f,soil:0x474c50,water:0x397f9d}
  });
  const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
  const area=poly=>poly.reduce((sum,p,i)=>sum+p.x*poly[(i+1)%poly.length].z-p.z*poly[(i+1)%poly.length].x,0)*.5;
  const bounds=poly=>({minX:Math.min(...poly.map(p=>p.x)),maxX:Math.max(...poly.map(p=>p.x)),minZ:Math.min(...poly.map(p=>p.z)),maxZ:Math.max(...poly.map(p=>p.z))});
  const overlaps=(a,b)=>a.minX<=b.maxX+EPS && a.maxX>=b.minX-EPS && a.minZ<=b.maxZ+EPS && a.maxZ>=b.minZ-EPS;
  function split(poly,value) {
    const inside=[],outside=[];
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length],da=value(a),db=value(b);
      if(da>=-EPS)inside.push(a);if(da<=EPS)outside.push(a);
      if((da>EPS && db< -EPS)||(da< -EPS && db>EPS)) {
        const t=da/(da-db),p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};inside.push(p);outside.push(p);
      }
    }
    return {inside,outside};
  }
  function subtract(poly,hole) {
    if(!overlaps(bounds(poly),hole.bounds))return [poly];
    let remaining=poly;const result=[];
    for(let i=0;i<hole.poly.length;i++) {
      const a=hole.poly[i],b=hole.poly[(i+1)%hole.poly.length],parts=split(remaining,p=>cross(a,b,p));
      if(parts.outside.length>=3 && Math.abs(area(parts.outside))>EPS)result.push(parts.outside);
      remaining=parts.inside;
      if(remaining.length<3 || Math.abs(area(remaining))<EPS)return [poly]; // Disjoint; avoid unnecessary fragmentation.
    }
    return result;
  }
  function coverStatus(runtime,index) {
    const piece=runtime.pieces[index],ground=runtime.settings.groundY??0;
    if(!piece || piece.isGap)return {ok:false,reason:'Choose a road section.'};
    if(piece.isCurve)return {ok:false,reason:'Grass covers require a straight section.'};
    const rough=Number(piece.source?.SR??0),wood=window.TS2.surfaceType(window.TS2.pieceSurface(piece))?.id==='wood';
    const rise=rough*(wood?1.51:.85),depth=runtime.settings.tarmacDepth*.5;
    if(piece.poses.some(p=>Math.max(window.TS2.heightAcross(p,-1),window.TS2.heightAcross(p,0),window.TS2.heightAcross(p,1))+depth+rise>ground-.8))
      return {ok:false,reason:'The whole road needs at least 0.8 m of clearance below ground.'};
    const edge=(p,side)=>{const e=window.TS2.roadPoint(p,side),a=p.yaw*Math.PI/180;return {x:e.x+side*Math.cos(a)*.85,y:ground,z:e.z-side*Math.sin(a)*.85};};
    let poly=[edge(piece.start,1),edge(piece.start,-1),edge(piece.end,-1),edge(piece.end,1)];
    if(area(poly)<0)poly=poly.reverse();
    if(Math.abs(area(poly))<EPS)return {ok:false,reason:'This section cannot form a grass cover.'};
    const joined=(a,b)=>a && b && Math.hypot(a.end.x-b.start.x,a.end.y-b.start.y,a.end.z-b.start.z)<.001;
    const count=runtime.pieces.length,previous=runtime.pieces[(index+count-1)%count],next=runtime.pieces[(index+1)%count];
    const yaw=piece.start.yaw*Math.PI/180,fx=Math.sin(yaw),fz=Math.cos(yaw),length=Math.hypot(piece.end.x-piece.start.x,piece.end.z-piece.start.z);
    const along=p=>(p.x-piece.start.x)*fx+(p.z-piece.start.z)*fz;
    for(let i=0;i<count;i++){
      if(i===index)continue;
      const isPrevious=i===(index+count-1)%count && joined(previous,piece),isNext=i===(index+1)%count && joined(piece,next);
      const other=runtime.pieces[i];
      for(let j=1;j<other.poses.length;j++){
        const a=other.poses[j-1],b=other.poses[j];
        // Connected approaches can meet the portal, but are not exempt if
        // they loop back and actually travel beneath the covered section.
        if(isPrevious && Math.max(along(a),along(b))<=.25 || isNext && Math.min(along(a),along(b))>=length-.25)continue;
        let overlap=[window.TS2.roadPoint(a,1),window.TS2.roadPoint(a,-1),window.TS2.roadPoint(b,-1),window.TS2.roadPoint(b,1)];
        if(!overlaps(bounds(poly),bounds(overlap)))continue;
        for(let k=0;k<poly.length && overlap.length>=3;k++)overlap=split(overlap,p=>cross(poly[k],poly[(k+1)%poly.length],p)).inside;
        if(overlap.length>=3 && Math.abs(area(overlap))>1e-5)return {ok:false,reason:'Another track section crosses this cover.'};
      }
    }
    return {ok:true,poly,bounds:bounds(poly),index};
  }
  function coverPlans(runtime){return runtime.pieces.flatMap((piece,index)=>{if(!piece.source?.CG)return [];const result=coverStatus(runtime,index);return result.ok?[result]:[];});}
  function meshBuffer(settings) {
    const buffer={positions:[],colours:[],triangles:0,surface:'grass',grip:settings.grassGrip,drag:settings.grassDrag};
    buffer.tri=(a,b,c,color)=>{
      const nx=(b.y-a.y)*(c.z-a.z)-(b.z-a.z)*(c.y-a.y),ny=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z),nz=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
      if(Math.hypot(nx,ny,nz)<1e-10)return;
      buffer.positions.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
      const linear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
      const rgb=[((color>>16)&255)/255,((color>>8)&255)/255,(color&255)/255].map(linear);
      buffer.colours.push(...rgb,...rgb,...rgb);buffer.triangles++;
    };
    buffer.geometry=()=>{
      const geometry=new THREE.BufferGeometry();
      try{geometry.setAttribute('position',new THREE.Float32BufferAttribute(buffer.positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(buffer.colours,3));geometry.computeVertexNormals();return geometry;}
      catch(error){geometry.dispose();throw error;}
    };
    return buffer;
  }
  function generate(runtime,buffers,options={}) {
    const settings=runtime.settings,palette=PALETTES[options.environment??settings.environment]??PALETTES.grasslands,y=settings.groundY??0,ground=meshBuffer(settings),cuttings=meshBuffer(settings),portalkerb=meshBuffer(settings),coverShadow=meshBuffer(settings);
    ground.solidSurface=true;
    const covers=coverPlans(runtime);
    // A cover is already part of the grass surface. These simple polygons are
    // used only in the shadow map; the actual grass remains the visible and
    // collidable terrain, without casting the entire landscape into the map.
    for(const cover of covers)for(let i=1;i<cover.poly.length-1;i++)
      coverShadow.tri(cover.poly[0],cover.poly[i+1],cover.poly[i],0xffffff);
    coverShadow.collisionDisabled=true;
    const points=runtime.pieces.flatMap(piece=>piece.poses),outer=points.reduce((b,p)=>{
      const r=(p.width??settings.defaultTrackWidth)*.5+36;
      b.minX=Math.min(b.minX,p.x-r);b.maxX=Math.max(b.maxX,p.x+r);b.minZ=Math.min(b.minZ,p.z-r);b.maxZ=Math.max(b.maxZ,p.z+r);
      if(p.extraLeft || p.extraRight)for(const side of [-1,1]){const edge=window.TS2.roadPoint(p,side);b.minX=Math.min(b.minX,edge.x-36);b.maxX=Math.max(b.maxX,edge.x+36);b.minZ=Math.min(b.minZ,edge.z-36);b.maxZ=Math.max(b.maxZ,edge.z+36);}
      return b;
    },{minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity});
    const cellSize=Math.max(6,(outer.maxX-outer.minX)/96,(outer.maxZ-outer.minZ)/96),holes=[],cells=new Map(),seen=new Set();
    function add(a,b,c) {
      const determinant=cross(a,b,c);if(Math.abs(determinant)<EPS)return;
      let poly=split([a,b,c],p=>y-p.y).inside;
      if(poly.length<3 || Math.abs(area(poly))<EPS)return;
      if(area(poly)<0)poly=poly.slice().reverse();
      let fragments=[poly];for(const cover of covers)fragments=fragments.flatMap(part=>subtract(part,cover));
      for(const part of fragments){
        const key=part.map(p=>`${Math.round(p.x*1e6)},${Math.round(p.y*1e6)},${Math.round(p.z*1e6)}`).sort().join('|');if(seen.has(key))continue;seen.add(key);
        const hole={poly:part,bounds:bounds(part),a,b,c,determinant};holes.push(hole);
        for(let x=Math.floor(hole.bounds.minX/cellSize);x<=Math.floor(hole.bounds.maxX/cellSize);x++)for(let z=Math.floor(hole.bounds.minZ/cellSize);z<=Math.floor(hole.bounds.maxZ/cellSize);z++) {
          const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(hole);
        }
      }
    }
    if(settings.groundCutouts!==false) {
      // Physical bottom faces cover the full solid road/kerb/wall footprint.
      // The kerb parity metadata is essential on the legacy mirrored side.
      for(const buffer of Object.values(buffers)) {
        if(!buffer?.positions || buffer.collisionDisabled)continue;const p=buffer.positions;
        for(let i=0;i<p.length;i+=9) {
          const a={x:p[i],y:p[i+1],z:p[i+2]},b={x:p[i+3],y:p[i+4],z:p[i+5]},c={x:p[i+6],y:p[i+7],z:p[i+8]};
          if(cross(a,b,c)*(buffer.collisionSigns?.[i/9]??1)>EPS && Math.min(a.y,b.y,c.y)<y-EPS)add(a,b,c);
        }
      }
      // A buried jump opening must not be sealed by a patch of grass overhead.
      // At-grade/elevated road gaps retain normal grass beneath the opening.
      for(const piece of runtime.pieces)if(piece.isGap)for(let i=1;i<piece.poses.length;i++) {
        const a=piece.poses[i-1],b=piece.poses[i];
        if(Math.max(a.y,b.y)>=y-.05)continue;
        const edge=(p,u)=>({x:p.x+Math.cos(p.yaw*Math.PI/180)*u*(p.width*.5+.85),y:window.TS2.heightAcross(p,u)-settings.tarmacDepth*.5,z:p.z-Math.sin(p.yaw*Math.PI/180)*u*(p.width*.5+.85)});
        for(const [lo,hi] of [[-1,0],[0,1]]){add(edge(a,lo),edge(b,lo),edge(a,hi));add(edge(a,hi),edge(b,lo),edge(b,hi));}
      }
    }
    const candidates=p=>cells.get(Math.floor(p.x/cellSize)+','+Math.floor(p.z/cellSize))??[];
    const contains=(hole,p)=>hole.poly.every((a,i)=>cross(a,hole.poly[(i+1)%hole.poly.length],p)>=-EPS);
    const inHole=p=>candidates(p).some(hole=>contains(hole,p));
    const covered=new Set(covers.map(c=>c.index)),count=runtime.pieces.length,portals=[];
    for(const cover of covers){const piece=runtime.pieces[cover.index];
      for(const [pose,atStart] of [[piece.start,true],[piece.end,false]]){
        const otherIndex=(cover.index+(atStart?-1:1)+count)%count,other=runtime.pieces[otherIndex],otherPose=atStart?other?.end:other?.start;
        if(!otherPose || otherIndex===cover.index || covered.has(otherIndex) || Math.hypot(pose.x-otherPose.x,pose.y-otherPose.y,pose.z-otherPose.z)>.001)continue;
        const yaw=pose.yaw*Math.PI/180,fx=Math.sin(yaw),fz=Math.cos(yaw),sign=atStart?1:-1;
        portals.push({pose,fx,fz,sign,yaw,half:pose.width*.5+.85});
      }
    }
    const portalEdge=(a,b)=>portals.some(p=>{
      const along=v=>(v.x-p.pose.x)*p.fx+(v.z-p.pose.z)*p.fz,lateral=v=>(v.x-p.pose.x)*Math.cos(p.yaw)-(v.z-p.pose.z)*Math.sin(p.yaw);
      const mid={x:(a.x+b.x)*.5,z:(a.z+b.z)*.5};
      return Math.abs(along(a))<1e-5 && Math.abs(along(b))<1e-5 && Math.abs(lateral(mid))<=p.half+1e-5 && inHole({x:mid.x-p.fx*p.sign*.08,z:mid.z-p.fz*p.sign*.08});
    });
    function edgeParts(a,b,local) {
      const dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz,cuts=[0,1],box=bounds([a,b]);
      if(length2<1e-12)return [];
      // A mask can merely TOUCH an uncut neighbouring tile. Its edge then
      // spans both grass and hole; split there before classifying soil walls.
      for(const hole of local)if(overlaps(box,hole.bounds))for(let i=0;i<hole.poly.length;i++) {
        const c=hole.poly[i],d=hole.poly[(i+1)%hole.poly.length],ex=d.x-c.x,ez=d.z-c.z,det=dx*ez-dz*ex;
        if(Math.abs(det)>EPS) {
          const t=((c.x-a.x)*ez-(c.z-a.z)*ex)/det,u=((c.x-a.x)*dz-(c.z-a.z)*dx)/det;
          if(t>EPS && t<1-EPS && u>=-EPS && u<=1+EPS)cuts.push(t);
        } else if(Math.abs(cross(a,b,c))<1e-7)for(const point of [c,d]) {
          const t=((point.x-a.x)*dx+(point.z-a.z)*dz)/length2;if(t>EPS && t<1-EPS)cuts.push(t);
        }
      }
      cuts.sort((a,b)=>a-b);const unique=cuts.filter((v,i)=>!i || v-cuts[i-1]>1e-8),parts=[];
      const point=t=>({x:a.x+dx*t,y,z:a.z+dz*t});
      for(let i=1;i<unique.length;i++)parts.push([point(unique[i-1]),point(unique[i])]);return parts;
    }
    function bottomAt(p,at=p) {
      let highest=null;
      for(const hole of candidates(p))if(contains(hole,p)) {
        const {a,b,c,determinant}=hole,dx=at.x-a.x,dz=at.z-a.z;
        const u=(dx*(c.z-a.z)-(c.x-a.x)*dz)/determinant,v=((b.x-a.x)*dz-dx*(b.z-a.z))/determinant;
        const bottom=a.y+(b.y-a.y)*u+(c.y-a.y)*v;
        if(highest===null || bottom>highest)highest=bottom;
      }
      return highest;
    }
    const nx=Math.ceil((outer.maxX-outer.minX)/cellSize),nz=Math.ceil((outer.maxZ-outer.minZ)/cellSize),edges=new Set();let banks=0;
    for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++) {
      const minX=outer.minX+ix*cellSize,maxX=Math.min(outer.maxX,minX+cellSize),minZ=outer.minZ+iz*cellSize,maxZ=Math.min(outer.maxZ,minZ+cellSize);
      const local=new Set();for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++)for(const hole of cells.get(x+','+z)??[])local.add(hole);
      let polygons=[[{x:minX,y,z:minZ},{x:maxX,y,z:minZ},{x:maxX,y,z:maxZ},{x:minX,y,z:maxZ}]];
      for(const hole of local) {
        polygons=polygons.flatMap(poly=>subtract(poly,hole));if(!polygons.length)break;
        if(polygons.length>2048)throw Error('Terrain cutting is too complex in one area. Reduce overlapping track detail.');
      }
      for(const poly of polygons) {
        for(let i=1;i<poly.length-1;i++)ground.tri(poly[0],poly[i+1],poly[i],palette.ground);
        for(let i=0;i<poly.length;i++)for(const [a,b] of edgeParts(poly[i],poly[(i+1)%poly.length],local)) {
          const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-6)continue;
          const mx=(a.x+b.x)*.5,mz=(a.z+b.z)*.5,n={x:-(b.z-a.z)/length,z:(b.x-a.x)/length},probe=.0002;
          const left=inHole({x:mx+n.x*probe,z:mz+n.z*probe}),right=inHole({x:mx-n.x*probe,z:mz-n.z*probe});
          if(left===right)continue;
          // The boundary between a roof and an open cutting is a tunnel
          // entrance, not a solid soil face across the road.
          if(portalEdge(a,b))continue;
          const key=[a,b].map(p=>`${Math.round(p.x*1e6)},${Math.round(p.z*1e6)}`).sort().join('|');if(edges.has(key))continue;edges.add(key);
          const sign=left?1:-1,inside=p=>({x:p.x+n.x*probe*sign,z:p.z+n.z*probe*sign}),midpoint={x:mx,z:mz};
          // Probe inside only to choose the owning underside; evaluate its
          // height at the TRUE boundary. Sampling the probe's height creates
          // an invisible soil curtain where a ramp intersects ground level.
          const middle=bottomAt(inside(midpoint),midpoint);
          if(middle===null)continue;
          const inset=p=>({x:p.x+(mx-p.x)*1e-6,z:p.z+(mz-p.z)*1e-6});
          const ya=Math.min(y,bottomAt(inside(inset(a)),a)??middle),yb=Math.min(y,bottomAt(inside(inset(b)),b)??middle);
          if(y-Math.min(ya,yb,middle)<1e-6)continue;
          // Set soil just behind the existing kerb/wall outer skin, avoiding coplanar faces.
          const top=p=>({x:p.x-n.x*.005*sign,y,z:p.z-n.z*.005*sign});
          const ta=top(a),tb=top(b),ba={...ta,y:ya},bb={...tb,y:yb};
          cuttings.tri(ta,ba,tb,palette.soil);cuttings.tri(tb,ba,bb,palette.soil);banks++;
        }
      }
      if(ground.triangles+cuttings.triangles>200000)throw Error('Terrain exceeds the preview triangle budget. Simplify overlapping track sections.');
    }
    // A low kerb marks each actual opening in the grass. Consecutive covered
    // pieces share their roof without an internal crosswise kerb.
    for(const cover of covers){const piece=runtime.pieces[cover.index];
      for(const [pose,atStart] of [[piece.start,true],[piece.end,false]]){
        const otherIndex=(cover.index+(atStart?-1:1)+count)%count,other=runtime.pieces[otherIndex],otherPose=atStart?other?.end:other?.start;
        if(!otherPose || otherIndex===cover.index || covered.has(otherIndex) || Math.hypot(pose.x-otherPose.x,pose.y-otherPose.y,pose.z-otherPose.z)>.001)continue;
        const yaw=pose.yaw*Math.PI/180,fx=Math.sin(yaw),fz=Math.cos(yaw),sign=atStart?1:-1;
        if(!inHole({x:pose.x-fx*sign*.08,z:pose.z-fz*sign*.08}))continue;
        const side=(direction,along,height)=>{const e=window.TS2.roadPoint(pose,direction);return {x:e.x+direction*Math.cos(yaw)*.85+fx*sign*along,y:y+height,z:e.z-direction*Math.sin(yaw)*.85+fz*sign*along};};
        const a=side(-1,0,0),b=side(1,0,0),c=side(-1,.22,0),d=side(1,.22,0),A={...a,y:y+.12},B={...b,y:y+.12},C={...c,y:y+.12},D={...d,y:y+.12};
        const face=(u,v,w,t)=>{portalkerb.tri(u,v,w,0x9ba5ae);portalkerb.tri(v,t,w,0x9ba5ae);};
        if(cross(A,B,C)<0)face(A,B,C,D);else face(B,A,D,C);
        face(a,A,b,B);face(c,d,C,D);face(a,c,A,C);face(b,B,d,D);
      }
    }
    return {ground,cuttings,portalkerb,coverShadow,palette,bounds:outer,coveredIndices:[...covered],stats:{holes:holes.length,banks,triangles:ground.triangles+cuttings.triangles+portalkerb.triangles},height:y};
  }
  // Ponds (or dry canyon basins) are planned after buildings and barriers.
  // Cut the ground mesh and build the bank and floor into the same buffer
  // used by vehicle support, so no invisible surface remains above them.
  function applyPonds(terrain,ponds,settings){
    if(!ponds.length)return terrain;
    const original=terrain.ground,ground=meshBuffer(settings),palette=terrain.palette??PALETTES.grasslands,y=terrain.height;ground.solidSurface=true;
    const lava=palette.lava?meshBuffer(settings):null;
    // The shared outlines can be concave. Their radial construction keeps
    // the centre inside, so subtract a fan of convex wedges rather than
    // treating the whole outline as a convex polygon.
    const holes=ponds.map(pond=>{const poly=pond.points.map(p=>({x:p.x,y,z:p.z})),centre={x:pond.x,y,z:pond.z};
      const wedges=poly.map((p,i)=>{const triangle=[centre,p,poly[(i+1)%poly.length]];return {poly:triangle,bounds:bounds(triangle)};});return {poly,bounds:bounds(poly),pond,wedges};});
    for(let i=0;i<original.positions.length;i+=9){const p=original.positions;
      let polygons=[[{x:p[i],y:p[i+1],z:p[i+2]},{x:p[i+3],y:p[i+4],z:p[i+5]},{x:p[i+6],y:p[i+7],z:p[i+8]}]];
      for(const hole of holes){if(!polygons.some(poly=>overlaps(bounds(poly),hole.bounds)))continue;
        for(const wedge of hole.wedges){polygons=polygons.flatMap(poly=>subtract(poly,wedge));if(!polygons.length)break;}
        if(!polygons.length)break;}
      for(const poly of polygons)for(let j=1;j<poly.length-1;j++)ground.tri(poly[0],poly[j],poly[j+1],palette.ground);
      if(ground.triangles>200000)throw Error('Ponds exceed the terrain triangle budget. Reduce pond quantity or size.');
    }
    for(const {poly,pond} of holes){
      // Stable per-site variation gives dry basins a mix of nearly level and
      // shallow profiles without changing placement or consuming random state.
      const hash=(Math.imul(Math.round(pond.x*100),73856093)^Math.imul(Math.round(pond.z*100),19349663)^Math.imul(Math.round((pond.diameter??0)*100),83492791))>>>0;
      const depth=palette.dryBasins ? .06+.3*hash/0xffffffff : .32,floorY=y-depth;
      const inner=poly.map(p=>({x:pond.x+(p.x-pond.x)*.78,y:floorY,z:pond.z+(p.z-pond.z)*.78})),centre={x:pond.x,y:floorY,z:pond.z};
      for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;
        ground.tri(poly[i],inner[j],poly[j],palette.bank);ground.tri(poly[i],inner[i],inner[j],palette.bank);
        ground.tri(centre,inner[j],inner[i],palette.dryBasins?palette.basin:palette.water);
        if(lava){const lift=p=>({...p,y:p.y+.015});lava.tri(lift(centre),lift(inner[j]),lift(inner[i]),0xf66b13);}
      }
    }
    if(lava){lava.collisionDisabled=true;terrain.lava=lava;}
    terrain.ground=ground;terrain.stats.triangles=ground.triangles+terrain.cuttings.triangles+(terrain.portalkerb?.triangles??0);terrain.stats.ponds=ponds.length;
    return terrain;
  }
  window.TrackTerrain={generate,applyPonds,coverStatus,coverPlans};
})();
