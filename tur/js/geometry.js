/* Mesh generation from TrackShift-style sampled poses.
   Layers stay independent so they can be toggled for inspection. */
(function () {
  'use strict';
  const KERB_GREY=0x8d949a;
  const C = {
    kerbRed: 0xc73535, kerbWhite: 0xe5e7e7, kerbGrey: KERB_GREY,
    kerbSide: 0x414852, wallFace: KERB_GREY, wallOuter: KERB_GREY,
    wallTop:0x9ba5ae, wallBevel: KERB_GREY, wallBottom:0x404851
  };
  const triColours = color => [((color>>16)&255)/255, ((color>>8)&255)/255, (color&255)/255];
  class MeshBuffer {
    constructor(smoothing=false) { this.positions=[]; this.colours=[]; this.triangles=0;this.normalGroups=smoothing?[]:null; }
    tri(a,b,c,colour,oneSided=false) {
      if(this.clipTriangle){this.clipTriangle(a,b,c,colour,oneSided,(...args)=>this.rawTri(...args));return;}
      this.rawTri(a,b,c,colour,oneSided);
    }
    rawTri(a,b,c,colour,oneSided=false) {
      this.positions.push(a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z);
      const rgb=triColours(colour);
      this.colours.push(...rgb,...rgb,...rgb);
      if(this.normalGroups)this.normalGroups.push(a.normalKey??null,b.normalKey??null,c.normalKey??null);
      this.triangles++;
      if(this.collisionOneSided)this.collisionOneSided.push(oneSided);
      if(this.visual)this.visual.rawTri(a,b,c,colour,oneSided);
    }
    quad(a,b,c,d,color) {this.tri(a,c,b,color,true); this.tri(b,c,d,color,true);}
    detailedQuad(a,b,c,d,color,draw) {
      // Keep the original smooth profile for suspension, walls and terrain.
      // A lazily created visual mesh replaces the decorative cap/bevel faces.
      if(!this.visual){this.visual=new MeshBuffer();this.visual.positions=this.positions.slice();this.visual.colours=this.colours.slice();this.visual.triangles=this.triangles;}
      const visual=this.visual;visual.clipTriangle=this.clipTriangle;this.visual=null;
      this.quad(a,b,c,d,color);this.visual=visual;draw(visual);
    }
    normals() {
      // Topology keys average only connected smooth road-top vertices.
      // Untagged slab faces stay flat; coincident crossings never weld.
      const normals=new Float32Array(this.positions.length),sums=new Map(),p=this.positions;
      for(let i=0;i<p.length;i+=9) {
        const ax=p[i+3]-p[i],ay=p[i+4]-p[i+1],az=p[i+5]-p[i+2];
        const bx=p[i+6]-p[i],by=p[i+7]-p[i+1],bz=p[i+8]-p[i+2];
        const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,length=Math.hypot(nx,ny,nz)||1;
        for(let corner=0;corner<3;corner++) {
          const at=i+corner*3;normals[at]=nx/length;normals[at+1]=ny/length;normals[at+2]=nz/length;
          const key=this.normalGroups?.[i/3+corner];
          if(key!==null && key!==undefined) {
            if(!sums.has(key))sums.set(key,[0,0,0]);
            const sum=sums.get(key);sum[0]+=nx;sum[1]+=ny;sum[2]+=nz;
          }
        }
      }
      for(const sum of sums.values()) {
        const length=Math.hypot(...sum)||1;for(let i=0;i<3;i++)sum[i]/=length;
      }
      if(this.normalGroups)for(let i=0;i<this.normalGroups.length;i++) {
        const sum=sums.get(this.normalGroups[i]);if(sum)normals.set(sum,i*3);
      }
      return normals;
    }
    geometry() {
      if(this.visual)return this.visual.geometry();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));
      geo.setAttribute('color',new THREE.Float32BufferAttribute(this.colours,3));
      if(this.normalGroups)geo.setAttribute('normal',new THREE.Float32BufferAttribute(this.normals(),3));
      else geo.computeVertexNormals();
      return geo;
    }
  }
  function material() {return new THREE.MeshLambertMaterial({vertexColors:true, side:THREE.DoubleSide});}
  // The model's positive lateral axis is driver-left in Three.js (+Y up).
  function poseLateral(p) {return {x:Math.cos(p.yaw*Math.PI/180), z:-Math.sin(p.yaw*Math.PI/180)};}
  const heightAcross=(p,u)=>window.TS2.heightAcross(p,u);
  const hasBank=p=>Math.abs(p.bankLeft??0)>0 || Math.abs(p.bankRight??0)>0;
  function edgeAt(p,side) {
    if (p.edgeNegative && p.edgePositive) return side<0 ? p.edgeNegative : p.edgePositive;
    if(p.extraLeft || p.extraRight)return window.TS2.roadPoint(p,side);
    const r=poseLateral(p), half=p.width*.5;
    return {x:p.x+side*r.x*half, y:heightAcross(p,side), z:p.z+side*r.z*half};
  }
  function offsetEdge(p,side,more,above=0) {
    const e=edgeAt(p,side),r=(side<0?p.edgeLateralNegative:p.edgeLateralPositive)??poseLateral(p);
    return {x:e.x+side*r.x*more,y:e.y+above,z:e.z+side*r.z*more};
  }
  function at(p,offY) {return {x:p.x,y:p.y+offY,z:p.z};}
  function interpolate(a,b,t,exactEdges=false) {
    let delta=((b.yaw-a.yaw+540)%360)-180;
    const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,
      yaw:a.yaw+delta*t,width:a.width+(b.width-a.width)*t,
      height:a.height+(b.height-a.height)*t,edge:b.edge||a.edge};
    const shaped=a.extraLeft || a.extraRight || b.extraLeft || b.extraRight;
    if(shaped)for(const key of ['extraLeft','extraRight'])p[key]=(a[key]??0)+((b[key]??0)-(a[key]??0))*t;
    if (exactEdges || hasBank(a) || hasBank(b) || shaped) {
      for (const key of ['bankLeft','bankRight','bankCurve']) p[key]=(a[key]??0)+((b[key]??0)-(a[key]??0))*t;
      if(a.bankFlat!==undefined || b.bankFlat!==undefined)p.bankFlat=(a.bankFlat??0)+((b.bankFlat??0)-(a.bankFlat??0))*t;
      // Follow the actual straight mesh edge between sampled poses, including
      // its bank height, rather than drifting away from the road's chord.
      for (const [key,side] of [['edgeNegative',-1],['edgePositive',1]]) {
        const start=edgeAt(a,side),end=edgeAt(b,side);
        p[key]={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t};
      }
    }
    for(const key of ['edgeLateralNegative','edgeLateralPositive'])if(a[key] || b[key]){
      const start=a[key]??poseLateral(a),end=b[key]??poseLateral(b),x=lerp(start.x,end.x,t),z=lerp(start.z,end.z,t),length=Math.hypot(x,z);
      p[key]={x:x/length,z:z/length};
    }
    return p;
  }
  function surfacePoint(p,u,above=0) {
    if(p.extraLeft || p.extraRight || p.edgeNegative || p.edgePositive)return window.TS2.roadPoint(p,u,above);
    const r=poseLateral(p),distance=p.width*.5*u;
    return {x:p.x+r.x*distance,y:heightAcross(p,u)+above,z:p.z+r.z*distance};
  }
  const roughAmount=piece=>(piece.source?.FQ??1)>0?(piece.source?.SR??0):0;
  function matchingRoughLoop(runtime){
    const a=runtime.pieces[0],b=runtime.pieces.at(-1),amount=a?roughAmount(a):0;
    if(!a || !b || a.isGap || b.isGap || !amount || roughAmount(b)!==amount || (a.source?.FQ??1)!==(b.source?.FQ??1))return false;
    const wood=piece=>window.TS2.surfaceType(window.TS2.pieceSurface(piece))?.id==='wood';
    return wood(a)===wood(b) && ['bankLeft','bankRight','bankCurve','bankFlat'].every(key=>Math.abs((a.start[key]??0)-(b.end[key]??0))<1e-8);
  }
  function roadRows(runtime) {
    const samples=new Map(),depth=runtime.settings.tarmacDepth*.5;
    for (const piece of runtime.pieces) {
      if (piece.isGap) continue;
      const count=piece.widthSegments??(piece.poses.some(hasBank)?8:1);
      for (const pose of piece.poses) {
        if (!samples.has(pose)) samples.set(pose,new Set());
        for (let i=0;i<=count;i++) samples.get(pose).add(i/count);
        if((pose.bankFlat??0)>0 && hasBank(pose)) {
          const flat=pose.bankFlat,r=.2+.6*(pose.bankCurve??0);
          for(const q of [flat,flat+(1-flat)*r*.5,flat+(1-flat)*r])for(const side of [-1,1])samples.get(pose).add(.5+side*q*.5);
        }
      }
    }
    // A naturally closed loop has distinct first/last pose objects. Share
    // their boundary samples too when the cross-sections coincide.
    const identities=new Map();let nextId=0;
    for(const pose of samples.keys())identities.set(pose,nextId++);
    const first=runtime.pieces[0]?.start,last=runtime.pieces.at(-1)?.end;
    const closed=(runtime.autoClose || matchingRoughLoop(runtime)) && first && last && samples.has(first) && samples.has(last) &&
      Math.hypot(first.x-last.x,first.y-last.y,first.z-last.z)<.001 && Math.abs(first.width-last.width)<.001 &&
      Math.abs(((first.yaw-last.yaw+540)%360)-180)<.001;
    if (closed) {
      const shared=new Set([...samples.get(first),...samples.get(last)]);
      samples.set(first,shared);samples.set(last,shared);
      identities.set(last,identities.get(first));
    }
    // Carry the exact seam samples across each run of simplified flat
    // straights. Otherwise a detailed boundary is joined to two vertices
    // at the far end, forming a long fan of skinny triangles on both faces.
    // Only flat, unbanked rows participate, so extra samples stay on the
    // existing surface and do not reshape neighbouring banked sections.
    const neighbours=new Map(),link=(a,b)=>{
      if(!neighbours.has(a))neighbours.set(a,[]);if(!neighbours.has(b))neighbours.set(b,[]);
      neighbours.get(a).push(b);neighbours.get(b).push(a);
    };
    for(const piece of runtime.pieces)if(piece.flatRoad)link(piece.poses[0],piece.poses.at(-1));
    if(closed && (neighbours.has(first)||neighbours.has(last)))link(first,last);
    const visited=new Set();
    for(const pose of neighbours.keys()){
      if(visited.has(pose))continue;
      const stack=[pose],component=[],values=new Set();visited.add(pose);
      while(stack.length){const current=stack.pop();component.push(current);for(const u of samples.get(current))values.add(u);
        for(const next of neighbours.get(current))if(!visited.has(next)){visited.add(next);stack.push(next);}}
      const unique=[...values].sort((a,b)=>a-b).filter((u,i,all)=>i===0||u-all[i-1]>1e-10);
      for(const current of component)samples.set(current,new Set(unique));
    }
    const rows=new Map();
    for (const [pose,values] of samples) rows.set(pose,[...values].sort((a,b)=>a-b).filter((u,i,all)=>i===0 || u-all[i-1]>1e-10).map(u=>{
      const top=u===0||u===1?offsetEdge(pose,u===0?-1:1,0,depth):surfacePoint(pose,u*2-1,depth);
      const bottom=u===0||u===1?offsetEdge(pose,u===0?-1:1,0,-depth):surfacePoint(pose,u*2-1,-depth);
      Object.assign(top,{rowPose:pose,u,normalId:identities.get(pose)+':'+u});
      return {u,top,bottom};
    }));
    return rows;
  }
  function joinRows(a,b,quad,tri) {
    let i=0,j=0;
    while (i<a.length-1 || j<b.length-1) {
      const nextA=a[i+1]?.u??Infinity,nextB=b[j+1]?.u??Infinity;
      if (Math.abs(nextA-nextB)<1e-10) {
        quad(a[i].point,a[i+1].point,b[j].point,b[j+1].point);i++;j++;
      } else if (nextA<nextB) {
        tri(a[i].point,b[j].point,a[i+1].point);i++;
      } else {
        tri(a[i].point,b[j].point,b[j+1].point);j++;
      }
    }
  }
  function faceRow(row,face) {
    if (face==='top') return row.map(p=>({u:p.u,point:p.top}));
    return row.slice().reverse().map(p=>({u:1-p.u,point:p.bottom}));
  }
  // Split the actual slab top at each shallow join, so rendering and wheel
  // support share one solid surface. Connected wood sections share a phase;
  // incomplete joins are omitted at material changes and gaps.
  const woodCache=new WeakMap(),WOOD_SPACING=.5,WOOD_HALF_JOIN=.075,WOOD_DEPTH=.014;
  const ROUGH_STEP=.24,ROUGH_WIDTH=.3,ROUGH_MAX=.85,WOOD_ROUGH_MAX=1.35;
  const smooth01=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
  function noiseHash(x,z,seed=0){let n=(Math.imul(x|0,374761393)+Math.imul(z|0,668265263)+Math.imul(seed,1442695041))|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/2147483647.5-1;}
  function smoothNoise(x,z,scale,seed){
    x/=scale;z/=scale;const ix=Math.floor(x),iz=Math.floor(z),fx=smooth01(x-ix),fz=smooth01(z-iz);
    return lerp(lerp(noiseHash(ix,iz,seed),noiseHash(ix+1,iz,seed),fx),lerp(noiseHash(ix,iz+1,seed),noiseHash(ix+1,iz+1,seed),fx),fz);
  }
  // Refine only rough sections. Original pose objects remain shared at joins
  // so the neighbouring width rows have exactly the same vertices.
  function roughRuntime(runtime){
    if(!runtime.pieces.some(piece=>!piece.isGap && roughAmount(piece)>0))return runtime;
    let estimate=0;const wood=woodLayout(runtime);
    const pieces=runtime.pieces.map(piece=>{
      if(piece.isGap || !roughAmount(piece))return piece;
      if(piece.length/ROUGH_STEP>20000)throw Error('Surface roughness is too dense. Shorten the rough section.');
      const maxWidth=Math.max(...piece.poses.map(p=>p.width+(p.extraLeft??0)+(p.extraRight??0)));
      // Wooden boards are uniform across their width, so their existing bank
      // detail is sufficient; only the length needs additional samples.
      const widthSegments=wood.has(piece)?(piece.widthSegments??1):Math.max(piece.widthSegments??1,Math.min(48,Math.max(8,Math.ceil(maxWidth/ROUGH_WIDTH/2)*2)));
      const poses=[piece.poses[0]],roughSegments=[];
      for(let i=1;i<piece.poses.length;i++){
        const a=piece.poses[i-1],b=piece.poses[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/ROUGH_STEP));
        const original={a,b},profile=wood.get(piece),fractions=[];
        for(let j=1;j<=steps;j++)fractions.push(j/steps);
        if(profile){const from=profile.offset+profile.distances[i-1],to=profile.offset+profile.distances[i];
          for(const cut of woodCuts(from,to,profile))if(cut>from+1e-8 && cut<to-1e-8)fractions.push((cut-from)/(to-from));}
        fractions.sort((x,y)=>x-y);let previous=0;
        for(const fraction of fractions){if(fraction-previous<1e-8)continue;
          estimate+=widthSegments*2;if(estimate>180000)throw Error('Surface roughness exceeds the road mesh budget. Shorten rough sections or reduce track width.');
          poses.push(fraction>1-1e-8?b:interpolate(a,b,fraction,true));roughSegments.push({original,from:previous,to:fraction});previous=fraction;
        }
      }
      return {...piece,poses,widthSegments,roughSegments};
    });
    return {...runtime,pieces};
  }
  function roughLayout(runtime){
    const profiles=new Map();let previous=null,run=null;
    const connected=(a,b)=>a&&b&&Math.hypot(a.end.x-b.start.x,a.end.y-b.start.y,a.end.z-b.start.z)<.001;
    for(const piece of runtime.pieces){
      const strength=roughAmount(piece),frequency=piece.source?.FQ??1,wood=window.TS2.surfaceType(window.TS2.pieceSurface(piece))?.id==='wood';
      if(piece.isGap || !strength){previous=null;run=null;continue;}
      if(!connected(previous,piece) || !run || run.strength!==strength || run.frequency!==frequency || run.wood!==wood)run={total:0,profiles:[],strength,frequency,wood,closed:false};
      const distances=[0];for(let i=1;i<piece.poses.length;i++){const a=piece.poses[i-1],b=piece.poses[i];distances.push(distances.at(-1)+Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z));}
      const profile={run,offset:run.total,distances};profiles.set(piece,profile);run.profiles.push(profile);run.total+=distances.at(-1);previous=piece;
    }
    const head=profiles.get(runtime.pieces[0]),tail=profiles.get(runtime.pieces.at(-1));
    if(head && tail && connected(runtime.pieces.at(-1),runtime.pieces[0]) && head.run.strength===tail.run.strength && head.run.frequency===tail.run.frequency && head.run.wood===tail.run.wood){
      if(head.run===tail.run)head.run.closed=true;
      else{const first=head.run,last=tail.run,offset=last.total;for(const p of first.profiles){p.offset+=offset;p.run=last;last.profiles.push(p);}last.total+=first.total;}
    }
    return profiles;
  }
  function roughHeight(point,profile,planks,depth){
    const run=profile.run,frequency=run.frequency,gain=smooth01(frequency/.2);
    const taper=run.closed?1:smooth01(Math.min(point.r,run.total-point.r)/Math.min(2,run.total*.5));
    let value;
    if(planks){
      const w=planks.run,mod=index=>w.closed?((index%w.count)+w.count)%w.count:index;
      const joint=Math.round(point.s/w.spacing-.5),centre=(joint+.5)*w.spacing;
      const blend=Math.max(0,Math.min(1,(point.s-(centre-w.half))/(2*w.half)));
      // A plank has one height across its width. A shorter-range board
      // variation adds frequent small changes without losing the established
      // larger height profile or making adjacent plank steps excessive.
      const board=index=>{let sum=0;for(let n=-2;n<4;n++)sum+=noiseHash(mod(index+n),0,73);
        const base=sum/6,old=base*(base>=0?WOOD_ROUGH_MAX:Math.min(.1,depth*.4));
        return Math.max(-Math.min(.1,depth*.4),lerp(1,.85,frequency)*old+.13*frequency*noiseHash(mod(index),0,79)+.03*frequency);
      };
      value=lerp(board(joint),board(joint+1),blend);
    }else{
      const noise=.7*smoothNoise(point.x,point.z,lerp(1.25,.60,frequency),11)+.3*smoothNoise(point.x,point.z,lerp(1.6,.68,frequency),29);
      // Fold both halves of the noise into individual bumps rather than
      // flattening every negative region. Keep valleys shallow enough to
      // preserve the solid underside and the ground beneath the road.
      const dip=Math.min(.1,depth*.48);
      value=(Math.abs(noise)*(ROUGH_MAX+dip)-dip)*smooth01(Math.min(point.u,1-point.u)/.12);
    }
    return value*taper*run.strength*gain;
  }
  function woodLayout(runtime){
    if(woodCache.has(runtime))return woodCache.get(runtime);
    const profiles=new Map(),runs=[];let previous=null,run=null;
    const connected=(a,b)=>a&&b&&Math.hypot(a.end.x-b.start.x,a.end.y-b.start.y,a.end.z-b.start.z)<.001;
    for(const piece of runtime.pieces){
      if(piece.isGap || window.TS2.surfaceType(window.TS2.pieceSurface(piece))?.id!=='wood'){previous=null;run=null;continue;}
      if(!connected(previous,piece)){run={id:runs.length,total:0,profiles:[],closed:false};runs.push(run);}
      const distances=[0];for(let i=1;i<piece.poses.length;i++){const a=piece.poses[i-1],b=piece.poses[i];distances.push(distances.at(-1)+Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z));}
      const profile={run,offset:run.total,length:distances.at(-1),distances,depth:Math.min(WOOD_DEPTH,runtime.settings.tarmacDepth*.15)};
      profiles.set(piece,profile);run.profiles.push(profile);run.total+=profile.length;previous=piece;
    }
    const head=profiles.get(runtime.pieces[0]),tail=profiles.get(runtime.pieces.at(-1));
    if(head && tail && connected(runtime.pieces.at(-1),runtime.pieces[0])){
      if(head.run===tail.run)head.run.closed=true;
      else{const first=head.run,last=tail.run,offset=last.total;for(const p of first.profiles){p.offset+=offset;p.run=last;last.profiles.push(p);}last.total+=first.total;}
    }
    for(const profile of profiles.values()){
      const r=profile.run;r.count=r.closed?Math.max(1,Math.round(r.total/WOOD_SPACING)):null;
      r.spacing=r.closed&&r.total>1e-8?r.total/r.count:WOOD_SPACING;
      r.half=Math.min(WOOD_HALF_JOIN,r.spacing*.2);
    }
    woodCache.set(runtime,profiles);return profiles;
  }
  function woodDent(distance,profile){
    const r=profile.run,n=Math.round(distance/r.spacing-.5),centre=(n+.5)*r.spacing;
    if(centre-r.half< -1e-8 || centre+r.half>r.total+1e-8)return 0;
    return profile.depth*Math.max(0,1-Math.abs(distance-centre)/r.half);
  }
  function woodCuts(from,to,profile){
    const r=profile.run,cuts=[from,to];
    if((to-from)/r.spacing>20000)throw Error('Wood detail is too dense. Shorten the wooden run.');
    const first=Math.max(0,Math.ceil((from-r.half)/r.spacing-.5)),last=Math.min(Math.floor((r.total-r.half)/r.spacing-.5),Math.floor((to+r.half)/r.spacing-.5));
    for(let n=first;n<=last;n++)for(const distance of [(n+.5)*r.spacing-r.half,(n+.5)*r.spacing,(n+.5)*r.spacing+r.half])if(distance>from+1e-8&&distance<to-1e-8)cuts.push(distance);
    return cuts.sort((a,b)=>a-b).filter((v,i,a)=>!i || v-a[i-1]>1e-8);
  }
  function woodBand(distance,profile){
    const r=profile.run,n=Math.round(distance/r.spacing-.5),centre=(n+.5)*r.spacing,joint=woodDent(distance,profile)>1e-9;
    let board=Math.floor(distance/r.spacing+.5);if(r.closed)board=((board%r.count)+r.count)%r.count;
    return {key:joint?`j${n}:${distance<centre?'a':'b'}`:`p${board}`,shade:(.94+((board*37+17)%11)*.012)*(joint ? .68 : 1)};
  }
  function sliceWood(poly,from,to){
    for(const [boundary,sign] of [[from,1],[to,-1]]){
      const output=[];
      for(let i=0;i<poly.length;i++){
        const a=poly[i],b=poly[(i+1)%poly.length],da=(a.s-boundary)*sign,db=(b.s-boundary)*sign;
        if(da>=-1e-9)output.push(a);
        if(da>1e-9&&db< -1e-9 || da< -1e-9&&db>1e-9){const t=da/(da-db);output.push({x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t),s:boundary,r:lerp(a.r??0,b.r??0,t),u:lerp(a.u??0,b.u??0,t),weight:lerp(a.weight??1,b.weight??1,t)});}
      }
      poly=output;if(poly.length<3)break;
    }
    return poly;
  }
  const shadeColour=(colour,shade)=>[16,8,0].reduce((result,shift)=>result|(Math.min(255,Math.round(((colour>>shift)&255)*shade))<<shift),0);
  function plankFace(kind,points,colour,profile,emit,normalKey,roughen){
    const triangles=kind==='quad'?[[points[0],points[2],points[1]],[points[1],points[2],points[3]]]:[points];
    for(const triangle of triangles){
      const cuts=woodCuts(Math.min(...triangle.map(p=>p.s)),Math.max(...triangle.map(p=>p.s)),profile);
      for(let k=1;k<cuts.length;k++){
        const band=woodBand((cuts[k-1]+cuts[k])*.5,profile),poly=sliceWood(triangle,cuts[k-1],cuts[k]).map(v=>({...v,y:v.y-woodDent(v.s,profile)*(v.weight??1)+(roughen?roughen(v):0),...(normalKey?{normalKey:normalKey(v,band)}:{})}));
        for(let i=1;i<poly.length-1;i++){
          const [a,b,c]=[poly[0],poly[i],poly[i+1]],ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
          if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)>1e-10)emit([a,b,c],shadeColour(colour,band.shade));
        }
      }
    }
  }
  // Simplify only an exactly flat, constant-width straight. The section's
  // endpoints remain shared with neighbours, preserving their seam samples.
  // Wood and rough surfaces need their physical detail and are left alone.
  function simplifyFlatStraights(runtime,ignoreRoughness=false){
    const pieces=runtime.pieces.map(piece=>{
      if(piece.isGap || piece.isClose || !ignoreRoughness && roughAmount(piece)>0 || window.TS2.pieceSurface(piece)==='wood' || piece.poses.length<2)return piece;
      const a=piece.poses[0],b=piece.poses.at(-1),dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
      if(length2<1e-10)return piece;
      const flat=piece.poses.every(p=>{
        const t=((p.x-a.x)*dx+(p.z-a.z)*dz)/length2;
        return t>=-1e-8 && t<=1+1e-8 && Math.abs(p.x-(a.x+t*dx))<1e-7 && Math.abs(p.z-(a.z+t*dz))<1e-7 &&
          Math.abs(p.y-a.y)<1e-7 && Math.abs(p.width-a.width)<1e-7 &&
          !hasBank(p) && !p.extraLeft && !p.extraRight && Math.abs(((p.yaw-a.yaw+540)%360)-180)<1e-7;
      });
      if(!flat)return piece;
      return {...piece,poses:[a,b],widthSegments:1,flatRoad:true};
    });
    return {...runtime,pieces};
  }
  function generateRoad(runtime) {
    const authored=runtime,crossings=levelCrossings(runtime);runtime=simplifyFlatStraights(roughRuntime(runtime));
    const m = new MeshBuffer(runtime.pieces.some(piece=>piece.smoothRoad)),rows=roadRows(runtime),hardJoins=new Set(),wood=woodLayout(runtime),rough=roughLayout(runtime),baseRows=rough.size?roadRows(authored):null;
    const underside=rough.size?simplifyFlatStraights(authored,true):null,undersideRows=underside?roadRows(underside):null;
    // Extra width vertices must lie on the existing triangulated road, not
    // re-evaluate its bank curve: otherwise even SR=.01 changes the bank.
    if(baseRows)for(const [pose,row] of rows){
      const base=baseRows.get(pose);if(!base)continue;
      for(const vertex of row){let right=base.findIndex(item=>item.u>=vertex.u-1e-10);if(right<0)right=base.length-1;
        const a=base[Math.max(0,right-1)],b=base[right],t=b.u===a.u?0:(vertex.u-a.u)/(b.u-a.u);
        for(const face of ['top','bottom'])for(const axis of ['x','y','z'])vertex[face][axis]=lerp(a[face][axis],b[face][axis],t);
      }
    }
    const baseTriangles=new WeakMap();
    function basePoint(original,t,u){
      let triangles=baseTriangles.get(original);
      if(!triangles){triangles=[];const vertex=p=>({t:p.rowPose===original.a?0:1,u:p.u,x:p.x,y:p.y,z:p.z});
        const add=(a,b,c)=>triangles.push([vertex(a),vertex(b),vertex(c)]);
        joinRows(faceRow(baseRows.get(original.a),'top'),faceRow(baseRows.get(original.b),'top'),
          (a,b,c,d)=>{add(a,c,b);add(b,c,d);},(a,b,c)=>add(a,b,c));baseTriangles.set(original,triangles);
      }
      for(const [a,b,c] of triangles){
        const bt=b.t-a.t,bu=b.u-a.u,ct=c.t-a.t,cu=c.u-a.u,dt=t-a.t,du=u-a.u,denom=bt*cu-bu*ct;
        if(Math.abs(denom)<1e-12)continue;
        const v=(dt*cu-du*ct)/denom,w=(bt*du-bu*dt)/denom;
        if(v>=-1e-8 && w>=-1e-8 && v+w<=1+1e-8)return {x:a.x+(b.x-a.x)*v+(c.x-a.x)*w,y:a.y+(b.y-a.y)*v+(c.y-a.y)*w,z:a.z+(b.z-a.z)*v+(c.z-a.z)*w};
      }
      return null;
    }
    m.pieceRanges=[];m.collisionRoles=[];m.collisionTwoSided=[];m.surfaceTypes=[];let surface='road';
    if(rough.size)m.roughnessValues=[];let roughness=0;
    let roadClip=null;
    const face=(role,kind,points,color)=>{
      m.clipTriangle=role==='wall'?roadClip:null;m[kind](...points,color);m.clipTriangle=null;while(m.collisionRoles.length<m.triangles){m.collisionRoles.push(role);m.surfaceTypes.push(surface);if(m.roughnessValues)m.roughnessValues.push(roughness);}
      if((wood.size||rough.size)&&m.triangles>200000)throw Error('Surface detail exceeds the road mesh budget. Shorten detailed sections or reduce width subdivisions.');
    };
    const markJoin=(left,right)=>{
      if(!left || !right || left.isGap || right.isGap ||
        Math.hypot(left.end.x-right.start.x,left.end.y-right.start.y,left.end.z-right.start.z)>.001)return;
      if(left.endGradient && right.startGradient && left.endGradient.some((value,i)=>Math.abs(value-right.startGradient[i])>1e-6)){
        // Preserve a real slope/bank crease even with road smoothing enabled.
        hardJoins.add(left.end);hardJoins.add(right.start);
      }
    };
    for(let i=1;i<runtime.pieces.length;i++)markJoin(runtime.pieces[i-1],runtime.pieces[i]);
    if(runtime.autoClose || matchingRoughLoop(runtime))markJoin(runtime.pieces.at(-1),runtime.pieces[0]);
    const pieceIds=new Map(runtime.pieces.map((piece,index)=>[piece,index]));
    for (const piece of runtime.pieces) {
      if (piece.isGap) continue;
      roadClip=levelClipper(crossings.edgeByPiece[pieceIds.get(piece)]);
      surface=window.TS2.pieceSurface(piece);const material=window.TS2.surfaceType(surface)??window.TS2.SURFACE_TYPES[0];
      const planks=wood.get(piece),roughProfile=rough.get(piece);roughness=roughAmount(piece);let rowA,rowB,s0,s1,r0,r1,baseSegment;
      const firstTriangle=m.triangles;
      const poses = piece.poses;
      const topFace=(kind,points)=>{
        const half=points.reduce((sum,p)=>sum+p.u,0)/points.length<.5?'R':'L';
        let tagged=!piece.smoothRoad?points:points.map(p=>{
          const pose=p.rowPose,centreCrease=!(pose.bankFlat>0) && Math.abs(p.u-.5)<1e-10 && Math.abs(((pose.bankLeft??0)+(pose.bankRight??0))*(1-(pose.bankCurve??0)))>1e-6;
          return {...p,normalKey:p.normalId+(hardJoins.has(pose)?':piece'+pieceIds.get(piece):'')+(centreCrease?':'+half:'')};
        });
        if(roughProfile)tagged=tagged.map(p=>({...p,...basePoint(baseSegment.original,p.rowPose===rowA?baseSegment.from:baseSegment.to,p.u)}));
        const withRoughness=roughProfile?tagged.map(p=>({...p,r:p.rowPose===rowA?r0:r1})):tagged;
        if(!planks){face('support',kind,roughProfile?withRoughness.map(p=>({...p,y:p.y+roughHeight(p,roughProfile,null,runtime.settings.tarmacDepth)})):tagged,material.top);return;}
        const pointsWithDistance=withRoughness.map(p=>({...p,s:p.rowPose===rowA?s0:s1}));
        const key=piece.smoothRoad?(v,band)=>{
          const t=(v.s-s0)/Math.max(1e-12,s1-s0),left=lerp(rowA.bankLeft??0,rowB.bankLeft??0,t),right=lerp(rowA.bankRight??0,rowB.bankRight??0,t),curve=lerp(rowA.bankCurve??0,rowB.bankCurve??0,t),flat=lerp(rowA.bankFlat??0,rowB.bankFlat??0,t);
          const crease=flat<=0 && Math.abs(v.u-.5)<1e-8&&Math.abs((left+right)*(1-curve))>1e-6;
          const hard=Math.abs(v.s-s0)<1e-8&&hardJoins.has(rowA)||Math.abs(v.s-s1)<1e-8&&hardJoins.has(rowB);
          const distance=planks.run.closed&&Math.abs(v.s-planks.run.total)<1e-8?0:v.s;
          return `wood${planks.run.id}:${Math.round(distance*1e7)}:${Math.round(v.u*1e7)}:${band.key}${crease?':'+half:''}${hard?':piece'+pieceIds.get(piece):''}`;
        }:null;
        plankFace(kind,pointsWithDistance,material.top,planks,(points,colour)=>{
          face('support','tri',points,colour);
        },key,roughProfile?v=>roughHeight(v,roughProfile,planks,runtime.settings.tarmacDepth):null);
      };
      for (let i=0;i<poses.length-1;i++) {
        const a=poses[i], b=poses[i+1];
        rowA=a;rowB=b;if(planks){s0=planks.offset+planks.distances[i];s1=planks.offset+planks.distances[i+1];}if(roughProfile){r0=roughProfile.offset+roughProfile.distances[i];r1=roughProfile.offset+roughProfile.distances[i+1];baseSegment=piece.roughSegments[i];}
        const start=rows.get(a),end=rows.get(b);
        joinRows(faceRow(start,'top'),faceRow(end,'top'),(...points)=>topFace('quad',points),(...points)=>topFace('tri',points));
        const sideFace=points=>{
          if(!planks){face('wall','quad',points,material.side);return;}
          const tagged=points.map((p,k)=>({...p,s:k<2?s0:s1,r:k<2?r0:r1,weight:p===start[0].top||p===start.at(-1).top||p===end[0].top||p===end.at(-1).top?1:0}));
          plankFace('quad',tagged,material.side,planks,(points,colour)=>face('wall','tri',points,colour),null,roughProfile?v=>roughHeight(v,roughProfile,planks,runtime.settings.tarmacDepth)*v.weight:null);
        };
        sideFace([start[0].bottom,start[0].top,end[0].bottom,end[0].top]);
        sideFace([start.at(-1).top,start.at(-1).bottom,end.at(-1).top,end.at(-1).bottom]);
        if(!roughProfile)joinRows(faceRow(start,'bottom'),faceRow(end,'bottom'),
          (...points)=>face('ceiling','quad',points,material.bottom),(...points)=>face('ceiling','tri',points,material.bottom));
      }
      // The underside is unchanged by the detail. Keep its original coarse
      // triangles so terrain cutouts do not fragment into thousands of tiles.
      if(roughProfile){const original=underside.pieces[pieceIds.get(piece)];
        for(let i=1;i<original.poses.length;i++)joinRows(faceRow(undersideRows.get(original.poses[i-1]),'bottom'),faceRow(undersideRows.get(original.poses[i]),'bottom'),
          (...points)=>face('ceiling','quad',points,material.bottom),(...points)=>face('ceiling','tri',points,material.bottom));
      }
      // Exposed road ends need the slab's own solid face, independently of
      // optional ground supports. Do not cap a connected ordinary join.
      const index=pieceIds.get(piece),previous=runtime.pieces[index-1]??runtime.pieces.at(-1),next=runtime.pieces[index+1]??runtime.pieces[0];
      const joined=(left,right)=>!!left && !!right && !left.isGap && !right.isGap &&
        Math.hypot(left.end.x-right.start.x,left.end.y-right.start.y,left.end.z-right.start.z)<.001;
      for(const [pose,open] of [[piece.start,!joined(previous,piece)],[piece.end,!joined(piece,next)]])if(open){
        const row=rows.get(pose);
        for(let i=1;i<row.length;i++){
          const first=m.triangles,a=row[i-1],b=row[i];
          face('wall','quad',[a.bottom,a.top,b.bottom,b.top],material.side);
          for(let triangle=first;triangle<m.triangles;triangle++)m.collisionTwoSided[triangle]=true;
        }
      }
      m.pieceRanges.push({start:firstTriangle,count:m.triangles-firstTriangle,pieceIndex:pieceIds.get(piece)});
    }
    if(crossings.count){
      // Keep both road surfaces in the collision buffer so each route retains
      // its own ownership. Draw only the earlier surface in shared areas.
      const visual=new MeshBuffer(!!m.normalGroups);visual.pieceRanges=[];
      for(const range of m.pieceRanges){const start=visual.triangles,cutters=crossings.byPiece[range.pieceIndex].filter(c=>c.index<range.pieceIndex);
        for(let triangle=range.start;triangle<range.start+range.count;triangle++){
          const at=triangle*9,p=m.positions,vertices=[0,3,6].map((k,n)=>({x:p[at+k],y:p[at+k+1],z:p[at+k+2],normalKey:m.normalGroups?.[triangle*3+n]??null}));
          const col=m.colours,colour=(Math.round(col[at]*255)<<16)|(Math.round(col[at+1]*255)<<8)|Math.round(col[at+2]*255);
          const emit=(a,b,c)=>visual.rawTri(a,b,c,colour);
          if(cutters.length && (m.collisionRoles[triangle]==='support' || m.collisionRoles[triangle]==='ceiling'))cutLevelFootprints(vertices,cutters,emit);else emit(...vertices);
        }
        visual.pieceRanges.push({start,count:visual.triangles-start,pieceIndex:range.pieceIndex});
      }
      m.visual=visual;
    }
    m.levelCrossings=crossings.count;m.levelCrossingPartners=crossings.byPiece.map(items=>items.map(item=>item.index));
    return m;
  }
  // Each side feature is a closed cross-section. Closing the perimeter at
  // every along-track sample also seals the underside (no hollow curbs/walls).
  // All track-edge features share the same full-width 0.85 m footprint.
  // A wall is a vertical extension of the kerb, never a separate narrowing object.
  const EDGE_WIDTH=window.TS2.EDGE_WIDTH;
  const KERB_HEIGHT=.12;
  function kerbCross(p,side,depth) {
    const t=depth*.5,w=EDGE_WIDTH;
    return [
      offsetEdge(p,side,0,-t),
      offsetEdge(p,side,0,t+.008),
      offsetEdge(p,side,w*.30,t+.12),
      offsetEdge(p,side,w*.70,t+.12),
      offsetEdge(p,side,w,t-.018),
      offsetEdge(p,side,w,-t)
    ];
  }
  function capCross(m,cross,colour) {
    // A planar fan at the open ends; visible from either side of the mesh.
    const mid=cross.reduce((v,p)=>({x:v.x+p.x/cross.length,y:v.y+p.y/cross.length,z:v.z+p.z/cross.length}),{x:0,y:0,z:0});
    for(let i=0;i<cross.length;i++)m.tri(mid,cross[i],cross[(i+1)%cross.length],colour);
  }
  const smoothstep = x => {const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
  const lerp=(a,b,t)=>a+(b-a)*t;
  function crownQuad(buffer,a,b,c,d,colour,segment,from,to,spacing,depth0,depth1,face=2) {
    if(!segment.stone){buffer.quad(a,b,c,d,colour);return;}
    const half=Math.min(.075,spacing*.08),joints=[],cuts=[from,to];
    const first=Math.ceil(Math.max(from-half,segment.stoneStart+half)/spacing-.5-1e-8);
    const last=Math.floor(Math.min(to+half,segment.stoneEnd-half)/spacing-.5+1e-8);
    for(let n=first;n<=last;n++){
      const centre=(n+.5)*spacing;joints.push(centre);
      for(const distance of [centre-half,centre,centre+half])if(distance>from+1e-8 && distance<to-1e-8)cuts.push(distance);
    }
    if(!joints.length){buffer.quad(a,b,c,d,colour);return;}
    cuts.sort((x,y)=>x-y);
    const mix=(p,q,t)=>({x:lerp(p.x,q.x,t),y:lerp(p.y,q.y,t),z:lerp(p.z,q.z,t)});
    const row=distance=>{
      const t=(distance-from)/(to-from),inner=mix(a,c,t),outer=mix(b,d,t);
      const dent=Math.max(0,...joints.map(centre=>1-Math.abs(distance-centre)/half))*lerp(depth0,depth1,t);
      // The full dent crosses the cap and meets both bevels at the same
      // height. Fade it out down each bevel before the vertical face begins.
      return (face===2?[0,.12,.88,1]:[0,.5,1]).map(u=>{
        const p=mix(inner,outer,u),weight=face===1?u:face===3?1-u:1;
        p.y-=dent*weight;return p;
      });
    };
    buffer.detailedQuad(a,b,c,d,colour,visual=>{
      for(let i=1;i<cuts.length;i++){
        if(cuts[i]-cuts[i-1]<1e-8)continue;
        const p=row(cuts[i-1]),q=row(cuts[i]),middle=(cuts[i]+cuts[i-1])*.5;
        const joint=joints.some(centre=>Math.abs(middle-centre)<half);
        for(let k=0;k<p.length-1;k++)visual.quad(p[k],p[k+1],q[k],q[k+1],joint?0x68727b:colour);
      }
    });
  }
  // Upper wall profile only: sits directly on the EXISTING kerb top surface.
  // It occupies exactly the same lateral span as the kerb at all heights.
  // At zero rise, its top matches the ordinary kerb profile point-for-point;
  // wall ends therefore blend back into a continuous full-width kerb.
  function wallCross(p,side,depth,rise) {
    const top=depth*.5, w=EDGE_WIDTH;
    const bevel=Math.min(.18, rise*.25);
    return [
      offsetEdge(p,side,0,top+.008),               // Kerb: inner base
      offsetEdge(p,side,0,top+.008+rise-bevel),    // Wall: inner face
      offsetEdge(p,side,w*.30,top+KERB_HEIGHT+rise),// Wall: inner crown
      offsetEdge(p,side,w*.70,top+KERB_HEIGHT+rise),// Wall: outer crown
      offsetEdge(p,side,w,top-.018+rise-bevel),    // Wall: outer face
      offsetEdge(p,side,w,top-.018),               // Kerb: outer base
    ];
  }
  function styleFor(piece,pose) {
    if(piece.isClose && piece.edgeStyle!==undefined)return window.TS2.edgeStyle(piece.edgeStyle);
    const raw=piece.source.ES;
    return window.TS2.edgeStyle(raw && raw.toLowerCase()!=='default'?raw:pose.edge);
  }
  function modeFor(piece,a,b,options) {
    const style=styleFor(piece,b);
    if(style && style.mode!=='auto')return style.mode;
    if (options.sideMode === 'kerbs') return 'kerb';
    if (options.sideMode === 'walls') return 'wall';
    // A sloped segment remains a wall all the way to ground level. A broad
    // height tolerance made short kerb runs (and two wall tapers) at zero
    // crossings, even where the road continued straight into a cutting.
    const groundY=options.groundY??0;
    if (Math.max(a.y,b.y)-groundY > 1e-6 || Math.min(a.y,b.y)-groundY < -1e-6) return 'wall';
    return 'kerb';
  }
  function pointInTriangleXZ(x,z,a,b,c) {
    const dx1=b.x-a.x,dz1=b.z-a.z,dx2=c.x-a.x,dz2=c.z-a.z;
    const denom=dx1*dz2-dx2*dz1;
    if(Math.abs(denom)<1e-8)return null;
    const rx=x-a.x,rz=z-a.z;
    const u=(rx*dz2-dx2*rz)/denom, v=(dx1*rz-rx*dz1)/denom;
    if(u < -1e-5 || v < -1e-5 || u+v > 1.00001)return null;
    return a.y+(b.y-a.y)*u+(c.y-a.y)*v;
  }
  function buildRoadFootprints(runtime,options) {
    const faces=[],depth=runtime.settings.tarmacDepth*.5;
    if (runtime.pieces.some(piece=>piece.widthSegments>1 || piece.poses.some(hasBank))) {
      const rows=roadRows(runtime);
      const add=(piece,...vertices)=>faces.push({vertices,groundMargin:groundRoughnessMargin(piece),
        minX:Math.min(...vertices.map(v=>v.x)),maxX:Math.max(...vertices.map(v=>v.x)),
        minZ:Math.min(...vertices.map(v=>v.z)),maxZ:Math.max(...vertices.map(v=>v.z)),
        minY:Math.min(...vertices.map(v=>v.y))-depth,maxY:Math.max(...vertices.map(v=>v.y))-depth});
      for (const piece of runtime.pieces) {
        if (piece.isGap) continue;
        for (let i=0;i<piece.poses.length-1;i++) joinRows(faceRow(rows.get(piece.poses[i]),'top'),faceRow(rows.get(piece.poses[i+1]),'top'),
          (a,b,c,d)=>{add(piece,a,c,b);add(piece,b,c,d);},(a,b,c)=>add(piece,a,b,c));
      }
    } else for(const piece of runtime.pieces) {
      if(piece.isGap)continue;
      for(let i=0;i<piece.poses.length-1;i++) {
        const a=piece.poses[i],b=piece.poses[i+1];
        const al=offsetEdge(a,-1,0,depth),ar=offsetEdge(a,1,0,depth);
        const bl=offsetEdge(b,-1,0,depth),br=offsetEdge(b,1,0,depth);
        const vertices=[al,ar,bl,br];
        faces.push({vertices,groundMargin:groundRoughnessMargin(piece),minX:Math.min(...vertices.map(v=>v.x)),maxX:Math.max(...vertices.map(v=>v.x)),
          minZ:Math.min(...vertices.map(v=>v.z)),maxZ:Math.max(...vertices.map(v=>v.z)),
          minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y)});
      }
    }
    // Kerbs form part of an overhead deck too. Match the actual sampled
    // edge strips so a lower wall stops at the kerb's outside, not the road.
    for(const piece of runtime.pieces) {
      if(piece.isGap)continue;
      for(let i=0;i<piece.poses.length-1;i++) {
        const a=piece.poses[i],b=piece.poses[i+1];
        if(modeFor(piece,a,b,options)==='none')continue;
        const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.35));
        for(let j=0;j<steps;j++) {
          const p=interpolate(a,b,j/steps,piece.matchRoadEdges),q=interpolate(a,b,(j+1)/steps,piece.matchRoadEdges);
          for(const side of [-1,1]) {
            // Use the edge's road-top height as reference; subtracting the
            // full slab depth below gives the kerb's actual flat underside.
            const vertices=[offsetEdge(p,side,0,depth),offsetEdge(p,side,EDGE_WIDTH,depth),
              offsetEdge(q,side,0,depth),offsetEdge(q,side,EDGE_WIDTH,depth)];
            faces.push({vertices,groundMargin:groundRoughnessMargin(piece),minX:Math.min(...vertices.map(v=>v.x)),maxX:Math.max(...vertices.map(v=>v.x)),
              minZ:Math.min(...vertices.map(v=>v.z)),maxZ:Math.max(...vertices.map(v=>v.z)),
              minY:Math.min(...vertices.map(v=>v.y))-depth,maxY:Math.max(...vertices.map(v=>v.y))-depth});
          }
        }
      }
    }
    // Keep the additional edge strips local to each query instead of scanning
    // every kerb sample for every wall sample on the circuit.
    const cellSize=Math.max(2,Math.min(12,runtime.settings.trackUnitLength)),cells=new Map();
    for(const face of faces) {
      for(let x=Math.floor((face.minX-.001)/cellSize);x<=Math.floor((face.maxX+.001)/cellSize);x++)
        for(let z=Math.floor((face.minZ-.001)/cellSize);z<=Math.floor((face.maxZ+.001)/cellSize);z++) {
          const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(face);
        }
    }
    return {cellSize,cells};
  }
  function overheadBottomAt(p,side,footprints,depth) {
    let ceiling=Infinity;
    // Test the two sides of the wall's top to detect bridge coverage even
    // when the foot of the wall lies just outside the upper road footprint.
    for(const distance of [0,EDGE_WIDTH*.5,EDGE_WIDTH]) {
      const q=offsetEdge(p,side,distance,0);
      const nearby=footprints.cells.get(Math.floor(q.x/footprints.cellSize)+','+Math.floor(q.z/footprints.cellSize))??[];
      for(const f of nearby) {
        if(f.maxY < q.y+1.0 || q.x<f.minX-.001 || q.x>f.maxX+.001 || q.z<f.minZ-.001 || q.z>f.maxZ+.001)continue;
        const [a,b,c,d]=f.vertices;
        const y=pointInTriangleXZ(q.x,q.z,a,b,c) ?? (d ? pointInTriangleXZ(q.x,q.z,b,c,d) : null);
        if(y!==null && y-q.y > 1.0)ceiling=Math.min(ceiling,y-depth);
      }
    }
    return ceiling;
  }
  function splitPolygon(poly,value) {
    const values=poly.map(value),epsilon=1e-9;
    if(values.every(v=>v>=-epsilon))return {inside:poly,outside:[]};
    if(values.every(v=>v<=epsilon))return {inside:[],outside:poly};
    const inside=[],outside=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],va=values[i],vb=values[(i+1)%poly.length];
      if(va>=-epsilon)inside.push(a);if(va<=epsilon)outside.push(a);
      if(va>epsilon && vb< -epsilon || va< -epsilon && vb>epsilon){const t=va/(va-vb),p={x:lerp(a.x,b.x,t),y:lerp(a.y,b.y,t),z:lerp(a.z,b.z,t)};inside.push(p);outside.push(p);}
    }
    return {inside,outside};
  }
  // At-grade crossings are inferred from separate, flat, unbanked roads.
  // Sampled curved pieces use their actual individual road footprints.
  const levelCrossingCache=new WeakMap();
  function levelCrossings(runtime){
    if(levelCrossingCache.has(runtime))return levelCrossingCache.get(runtime);
    const byPiece=runtime.pieces.map(()=>new Set()),candidates=[],pairs=new Set(),locations=new Map(),firstPose=runtime.pieces[0]?.start,lastPose=runtime.pieces.at(-1)?.end;
    const closed=runtime.autoClose || !!firstPose && !!lastPose && Math.hypot(firstPose.x-lastPose.x,firstPose.y-lastPose.y,firstPose.z-lastPose.z)<.001;
    for(let i=0;i<runtime.pieces.length;i++){
      const piece=runtime.pieces[i],poses=piece.poses;
      if(piece.isGap || poses.length<2 || roughAmount(piece)>0 || window.TS2.surfaceType(window.TS2.pieceSurface(piece))?.id==='wood')continue;
      if(poses.some(p=>Math.abs(p.y-piece.start.y)>1e-6 || hasBank(p)))continue;
      for(let j=1;j<poses.length;j++){
        const a=poses[j-1],b=poses[j],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<1e-6)continue;
        const vertices=[window.TS2.roadPoint(a,-1),window.TS2.roadPoint(b,-1),window.TS2.roadPoint(b,1),window.TS2.roadPoint(a,1)];
        const area=vertices.reduce((sum,v,k)=>{const w=vertices[(k+1)%vertices.length];return sum+v.x*w.z-w.x*v.z;},0),sign=Math.sign(area);if(!sign)continue;
        const planes=vertices.map((v,k)=>{const w=vertices[(k+1)%vertices.length];return p=>((w.x-v.x)*(p.z-v.z)-(w.z-v.z)*(p.x-v.x))*sign;});
        candidates.push({index:i,piece,y:a.y,dx:dx/len,dz:dz/len,vertices,planes,minX:Math.min(...vertices.map(v=>v.x)),maxX:Math.max(...vertices.map(v=>v.x)),minZ:Math.min(...vertices.map(v=>v.z)),maxZ:Math.max(...vertices.map(v=>v.z))});
      }
    }
    const cells=new Map(),large=[],cellSize=Math.max(8,Math.min(24,runtime.settings.defaultTrackWidth*2));
    for(let i=0;i<candidates.length;i++){
      const c=candidates[i],x0=Math.floor(c.minX/cellSize),x1=Math.floor(c.maxX/cellSize),z0=Math.floor(c.minZ/cellSize),z1=Math.floor(c.maxZ/cellSize);
      if((x1-x0+1)*(z1-z0+1)>1024){large.push(i);continue;}
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}
    }
    const checked=new Set();function inspect(i,j){
      if(i===j)return;const key=i<j?i+','+j:j+','+i;if(checked.has(key))return;checked.add(key);
      const a=candidates[i],b=candidates[j],first=Math.min(a.index,b.index),last=Math.max(a.index,b.index);
      if(first===last || last-first===1 || closed && first===0 && last===runtime.pieces.length-1)return;
      if(Math.abs(a.y-b.y)>1e-5 || Math.abs(a.dx*b.dz-a.dz*b.dx)<.12 || a.maxX<b.minX || b.maxX<a.minX || a.maxZ<b.minZ || b.maxZ<a.minZ)return;
      let overlap=a.vertices;for(const plane of b.planes){overlap=splitPolygon(overlap,plane).inside;if(overlap.length<3)break;}
      const area=Math.abs(overlap.reduce((sum,v,k)=>{const w=overlap[(k+1)%overlap.length];return sum+v.x*w.z-w.x*v.z;},0));
      if(overlap.length<3 || area<.1)return;
      const pair=first+','+last,centre=overlap.reduce((sum,p)=>({x:sum.x+p.x/overlap.length,z:sum.z+p.z/overlap.length}),{x:0,z:0});
      if(!locations.has(pair))locations.set(pair,{first,last,weight:0,x:0,z:0,directions:[{x:0,z:0},{x:0,z:0}]});
      const location=locations.get(pair);location.weight+=area;location.x+=centre.x*area;location.z+=centre.z*area;
      for(const c of [a,b]){const d=location.directions[c.index===first?0:1];d.x+=c.dx*area;d.z+=c.dz*area;}
      byPiece[a.index].add(b);byPiece[b.index].add(a);pairs.add(pair);
    }
    for(const bucket of cells.values())for(let a=0;a<bucket.length;a++)for(let b=a+1;b<bucket.length;b++)inspect(bucket[a],bucket[b]);
    for(const i of large)for(let j=0;j<candidates.length;j++)inspect(i,j);
    // Detection needs only one overlapping pair of sampled road quads, but a
    // kerb extends beyond its own road edge. Include the entire crossing
    // section (and its level connected neighbours) as cutters; limiting the
    // cuts to quads that overlap the slab leaves kerb strips on the other road.
    const edgeByPiece=runtime.pieces.map(()=>new Set()),byIndex=runtime.pieces.map(()=>[]);
    for(const candidate of candidates)byIndex[candidate.index].push(candidate);
    const neighbour=(index,step)=>{const next=index+step;return next<0?(closed?runtime.pieces.length-1:null):next>=runtime.pieces.length?(closed?0:null):next;};
    for(const pair of pairs){const [first,last]=pair.split(',').map(Number);
      for(const [target,other] of [[first,last],[last,first]]){
        for(const candidate of byIndex[other]){byPiece[target].add(candidate);edgeByPiece[target].add(candidate);}
        for(const adjacent of [neighbour(other,-1),neighbour(other,1)]){
          if(adjacent===null || adjacent===target || adjacent===neighbour(target,-1) || adjacent===neighbour(target,1))continue;
          const before=adjacent===neighbour(other,-1),a=before?runtime.pieces[adjacent].end:runtime.pieces[other].end,b=before?runtime.pieces[other].start:runtime.pieces[adjacent].start;
          if(!a || !b || Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>.001)continue;
          const targetHeight=runtime.pieces[target].start.y;
          for(const candidate of byIndex[adjacent])if(Math.abs(candidate.y-targetHeight)<1e-5)edgeByPiece[target].add(candidate);
        }
      }
    }
    const result={byPiece:byPiece.map(items=>[...items]),edgeByPiece:edgeByPiece.map(items=>[...items]),count:pairs.size,locations:[...locations.values()]};levelCrossingCache.set(runtime,result);return result;
  }
  // Paint one direction arrow for each route approaching a level crossing.
  // The arrows are visual only; route and collision meshes remain unchanged.
  function generateCrossingArrows(runtime,road=null,direction=1){
    const buffer=new MeshBuffer(),crossings=levelCrossings(runtime);direction=direction===-1?-1:1;
    if(!crossings.count)return buffer;
    road??=generateRoad(runtime);
    for(const crossing of crossings.locations){
      const centre={x:crossing.x/crossing.weight,z:crossing.z/crossing.weight};
      for(const [n,index] of [crossing.first,crossing.last].entries()){
        const d=crossing.directions[n],length=Math.hypot(d.x,d.z);if(length<1e-8)continue;
        const forward={x:d.x/length*direction,z:d.z/length*direction},left={x:forward.z,z:-forward.x},piece=runtime.pieces[index],referenceY=piece.start.y+runtime.settings.tarmacDepth*.5;
        let shape=null;
        // Prefer the approach side, with a smaller fallback if the crossing
        // lies close to a section end or a very narrow road.
        for(const scale of [1,.7,.45]){for(const offset of [1.5,.9,.3,0,-.4]){
          const x=centre.x-forward.x*offset,z=centre.z-forward.z*offset;
          const coords=[[-.85,-.18],[.05,-.18],[.05,-.48],[.9,0],[.05,.48],[.05,.18],[-.85,.18]];
          const points=coords.map(([along,side])=>{const p={x:x+scale*(forward.x*along+left.x*side),z:z+scale*(forward.z*along+left.z*side),y:referenceY};
            const y=window.TrackRace.roadHeight(road,index,p);return y===null?null:{...p,y:y+.035};});
          if(points.every(Boolean)){shape=points;break;}
        }if(shape)break;}
        if(!shape)continue;
        const colour=0xe7edec;
        buffer.tri(shape[0],shape[1],shape[6],colour);buffer.tri(shape[1],shape[5],shape[6],colour);
        buffer.tri(shape[2],shape[3],shape[4],colour);
      }
    }
    return buffer;
  }
  function cutLevelFootprints(triangle,cutters,emit){
    let remaining=[triangle];
    for(const cutter of cutters){
      const next=[];for(const poly of remaining){let inside=poly;
        for(const plane of cutter.planes){if(inside.length<3)break;const parts=splitPolygon(inside,plane);if(parts.outside.length>=3)next.push(parts.outside);inside=parts.inside;}
      }remaining=next;if(!remaining.length)break;
    }
    for(const poly of remaining)for(let i=1;i<poly.length-1;i++){
      const [a,b,c]=[poly[0],poly[i],poly[i+1]],ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
      if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)>1e-10)emit(a,b,c);
    }
  }
  function levelClipper(cutters){if(!cutters.length)return null;return (a,b,c,colour,oneSided,emit)=>cutLevelFootprints([a,b,c],cutters,(u,v,w)=>emit(u,v,w,colour,oneSided));}
  function combineClips(first,second){if(!first)return second;if(!second)return first;return (a,b,c,colour,oneSided,emit)=>first(a,b,c,colour,oneSided,(u,v,w,col,one)=>second(u,v,w,col,one,emit));}
  function crossingClipper(footprints,p,q,side,depth,capColour,onClip,discardAbove=false,padding=0) {
    // Split complete faces at the actual upper road/kerb footprint. Lowering
    // sampled profile endpoints would interpolate a ramp across this boundary.
    const a=edgeAt(p,side),b=edgeAt(q,side),outerA=offsetEdge(p,side,EDGE_WIDTH),outerB=offsetEdge(q,side,EDGE_WIDTH);
    const minX=Math.min(a.x,b.x,outerA.x,outerB.x)-.0002-padding,maxX=Math.max(a.x,b.x,outerA.x,outerB.x)+.0002+padding,
      minZ=Math.min(a.z,b.z,outerA.z,outerB.z)-.0002-padding,maxZ=Math.max(a.z,b.z,outerA.z,outerB.z)+.0002+padding;
    const faces=new Set(),roofs=[],dx=b.x-a.x,dz=b.z-a.z,span=Math.max(1e-12,dx*dx+dz*dz);
    const baseAt=v=>a.y+(b.y-a.y)*((v.x-a.x)*dx+(v.z-a.z)*dz)/span;
    for(let x=Math.floor(minX/footprints.cellSize);x<=Math.floor(maxX/footprints.cellSize);x++)for(let z=Math.floor(minZ/footprints.cellSize);z<=Math.floor(maxZ/footprints.cellSize);z++)for(const face of footprints.cells.get(x+','+z)??[])faces.add(face);
    for(const face of faces){
      if(face.maxY<Math.min(a.y,b.y)+1 || face.maxX<minX || face.minX>maxX || face.maxZ<minZ || face.minZ>maxZ)continue;
      if(!face.clipRoofs){
        const [v0,v1,v2,v3]=face.vertices;face.clipRoofs=[];
        for(const vertices of v3?[[v0,v1,v2],[v1,v2,v3]]:[[v0,v1,v2]]){
          const [a,b,c]=vertices,ux=b.x-a.x,uz=b.z-a.z,vx=c.x-a.x,vz=c.z-a.z,denom=ux*vz-uz*vx;
          if(Math.abs(denom)<1e-10)continue;
          const slopeX=((b.y-a.y)*vz-(c.y-a.y)*uz)/denom,slopeZ=(ux*(c.y-a.y)-vx*(b.y-a.y))/denom;
          const offset=a.y-slopeX*a.x-slopeZ*a.z-depth-.18,sign=Math.sign(denom);
          const edges=vertices.map((v,i)=>{const w=vertices[(i+1)%3];return p=>((w.x-v.x)*(p.z-v.z)-(w.z-v.z)*(p.x-v.x))*sign;});
          face.clipRoofs.push({height:p=>slopeX*p.x+slopeZ*p.z+offset,edges});
        }
      }
      roofs.push(...face.clipRoofs);
    }
    if(!roofs.length)return null;
    const planes=roof=>[...roof.edges,v=>roof.height(v)+depth+.18-baseAt(v)-1];
    const outline=[a,outerA,outerB,b],winding=Math.sign(outline.reduce((sum,v,i)=>{const w=outline[(i+1)%4];return sum+v.x*w.z-w.x*v.z;},0));
    const clip=(a,b,c,colour,oneSided,write)=>{
      const triangle=[a,b,c],active=roofs.filter(roof=>triangle.some(v=>v.y>roof.height(v)+1e-8));
      if(!active.length){write(a,b,c,colour,oneSided);return;}
      let cells=[{poly:triangle,roof:null}];
      for(const roof of active){
        const next=[];
        for(const cell of cells){
          let inside=cell.poly;
          for(const plane of planes(roof)){
            if(inside.length<3)break;const parts=splitPolygon(inside,plane);
            if(parts.outside.length>=3)next.push({poly:parts.outside,roof:cell.roof});inside=parts.inside;
          }
          if(inside.length<3)continue;
          if(!cell.roof)next.push({poly:inside,roof});
          else {
            const parts=splitPolygon(inside,v=>roof.height(v)-cell.roof.height(v));
            if(parts.inside.length>=3)next.push({poly:parts.inside,roof:cell.roof});
            if(parts.outside.length>=3)next.push({poly:parts.outside,roof});
          }
        }
        cells=next;
      }
      if(!cells.some(cell=>cell.roof && cell.poly.some(v=>v.y>cell.roof.height(v)+1e-8))){write(a,b,c,colour,oneSided);return;}
      onClip();
      const emit=(a,b,c,colour,oneSided)=>{
        const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
        if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)>1e-10)write(a,b,c,colour,oneSided);
      };
      const cover=v=>{let roof=null;for(const r of active)if(planes(r).every(plane=>plane(v)>=-1e-9) && (!roof || r.height(v)<roof.height(v)))roof=r;return roof;};
      for(const {poly,roof} of cells){
        if(discardAbove){
          // Rails and their collision sheet are open structures: remove the
          // part above the bridge rather than flattening it into a solid cap.
          const points=roof?splitPolygon(poly,v=>roof.height(v)-v.y).inside:poly;
          for(let i=1;i<points.length-1;i++)emit(points[0],points[i],points[i+1],colour,oneSided);
          continue;
        }
        const clipped=poly.map(v=>roof?{...v,y:Math.min(v.y,roof.height(v))}:v);
        // Keep the crease where a sloping ceiling meets an existing face.
        const parts=roof?splitPolygon(poly,v=>roof.height(v)-v.y):{inside:poly,outside:[]};
        for(const [points,lower] of [[parts.inside,false],[parts.outside,true]]){
          const face=lower?points.map(v=>({...v,y:roof.height(v)})):points;
          for(let i=1;i<face.length-1;i++)emit(face[0],face[i],face[i+1],colour,oneSided);
        }
        if(!roof)continue;
        const area=poly.reduce((sum,v,i)=>{const w=poly[(i+1)%poly.length];return sum+v.x*w.z-w.x*v.z;},0);
        if(Math.abs(area)<1e-10)continue;
        for(let i=0;i<poly.length;i++){
          const a=poly[i],b=poly[(i+1)%poly.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-8)continue;
          const sign=Math.sign(area),probe={x:(a.x+b.x)*.5+(b.z-a.z)/length*sign*.0001,z:(a.z+b.z)*.5-(b.x-a.x)/length*sign*.0001};
          // A step closes the cut only where the full-height feature continues
          // outside it. Do not resurrect a wall beyond its actual open end or
          // lateral footprint when that end happens to match a bridge boundary.
          if(outline.some((v,k)=>{
            if(k===0 && !clip.openStart || k===2 && !clip.openEnd)return false;
            const w=outline[(k+1)%4];return ((w.x-v.x)*(probe.z-v.z)-(w.z-v.z)*(probe.x-v.x))*winding< -1e-9;
          }))continue;
          const neighbour=cover(probe),highA={...a,y:Math.min(a.y,neighbour?.height(a)??Infinity)},highB={...b,y:Math.min(b.y,neighbour?.height(b)??Infinity)},lowA=clipped[i],lowB=clipped[(i+1)%poly.length];
          if(Math.max(highA.y-lowA.y,highB.y-lowB.y)<1e-7)continue;
          emit(highA,highB,lowA,capColour,false);emit(lowA,highB,lowB,capColour,false);
        }
      }
    };
    return clip;
  }
  // Subtract the space occupied by lower roads from a vertical support face.
  // The same resulting triangles are used for rendering and car collisions.
  function groundRoughnessMargin(piece) {
    const strength=roughAmount(piece);
    return strength*(window.TS2.surfaceType(window.TS2.pieceSurface(piece))?.id==='wood'?WOOD_ROUGH_MAX+.16:ROUGH_MAX);
  }
  function groundSupportWriter(buffer,footprints,groundY,depth) {
    const clearance=2.8;
    return (start,end,levelCutters=[]) => {
      if(Math.max(start.y,end.y)<=groundY+1e-7)return;
      // Clip where the slab underside crosses ground. Clamping a below-ground
      // endpoint instead would lift the support above ground too early.
      const groundCross=(a,b)=>{const t=(groundY-a.y)/(b.y-a.y);return {x:lerp(a.x,b.x,t),y:groundY,z:lerp(a.z,b.z,t)};};
      if(start.y<groundY)start=groundCross(start,end);
      if(end.y<groundY)end=groundCross(end,start);
      const dx=end.x-start.x,dz=end.z-start.z,span=dx*dx+dz*dz;
      if(span<1e-12)return;
      const minX=Math.min(start.x,end.x)-1e-6,maxX=Math.max(start.x,end.x)+1e-6,
        minZ=Math.min(start.z,end.z)-1e-6,maxZ=Math.max(start.z,end.z)+1e-6;
      const topAt=v=>start.y+(end.y-start.y)*((v.x-start.x)*dx+(v.z-start.z)*dz)/span;
      const faces=new Set(),cutters=[];
      for(let x=Math.floor(minX/footprints.cellSize);x<=Math.floor(maxX/footprints.cellSize);x++)
        for(let z=Math.floor(minZ/footprints.cellSize);z<=Math.floor(maxZ/footprints.cellSize);z++)
          for(const face of footprints.cells.get(x+','+z)??[])faces.add(face);
      for(const face of faces){
        if(face.maxX<minX || face.minX>maxX || face.maxZ<minZ || face.minZ>maxZ || face.minY>Math.max(start.y,end.y)-.1)continue;
        if(!face.groundCutters){
          const [v0,v1,v2,v3]=face.vertices;face.groundCutters=[];
          for(const vertices of v3?[[v0,v1,v2],[v1,v2,v3]]:[[v0,v1,v2]]){
            const [a,b,c]=vertices,ux=b.x-a.x,uz=b.z-a.z,vx=c.x-a.x,vz=c.z-a.z,denom=ux*vz-uz*vx;
            if(Math.abs(denom)<1e-10)continue;
            const sx=((b.y-a.y)*vz-(c.y-a.y)*uz)/denom,sz=(ux*(c.y-a.y)-vx*(b.y-a.y))/denom,
              offset=a.y-sx*a.x-sz*a.z,sign=Math.sign(denom);
            const edges=vertices.map((v,i)=>{const w=vertices[(i+1)%3];return p=>((w.x-v.x)*(p.z-v.z)-(w.z-v.z)*(p.x-v.x))*sign;});
            face.groundCutters.push({height:p=>sx*p.x+sz*p.z+offset,edges,margin:face.groundMargin});
          }
        }
        cutters.push(...face.groundCutters);
      }
      const lowA={...start,y:groundY},lowB={...end,y:groundY};
      const highA={...start,y:Math.max(groundY,start.y)},highB={...end,y:Math.max(groundY,end.y)};
      const emit=poly=>{
        for(let i=1;i<poly.length-1;i++){
          const [a,b,c]=[poly[0],poly[i],poly[i+1]],ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
          if(Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)<1e-9)continue;
          const write=(u,v,w)=>{buffer.rawTri(u,v,w,C.wallOuter,false);buffer.collisionSigns.push(1);};
          if(levelCutters.length)cutLevelFootprints([a,b,c],levelCutters,write);else write(a,b,c);
        }
      };
      for(const triangle of [[lowA,highA,lowB],[lowB,highA,highB]]){
        let remaining=[triangle];
        for(const cutter of cutters){
          // Only a genuinely lower road creates an opening. The neighbouring
          // surface at the same height must not cut its own supporting wall.
          const planes=[...cutter.edges,v=>topAt(v)-cutter.height(v)-.15,
            v=>v.y-(cutter.height(v)-depth-.15),v=>cutter.height(v)+clearance+cutter.margin-v.y];
          const next=[];
          for(const poly of remaining){
            let inside=poly;
            for(const plane of planes){
              if(inside.length<3)break;
              const parts=splitPolygon(inside,plane);
              if(parts.outside.length>=3)next.push(parts.outside);
              inside=parts.inside;
            }
          }
          remaining=next;if(!remaining.length)break;
        }
        remaining.forEach(emit);
      }
    };
  }
  // The outer support sheets are hollow. Close the sides of each underpass
  // by following the LOWER road's outside edges across every supported deck.
  // Clip to the actual upper underside triangles, including banks and kerbs.
  function addUnderpassSides(runtime,options,footprints,walls,depth,supported) {
    const cellSize=footprints.cellSize,cells=new Map(),rows=roadRows(runtime),seen=new Set();
    function roof(a,b,c) {
      const ux=b.x-a.x,uz=b.z-a.z,vx=c.x-a.x,vz=c.z-a.z,denom=ux*vz-uz*vx;
      if(Math.abs(denom)<1e-10)return;
      const sx=((b.y-a.y)*vz-(c.y-a.y)*uz)/denom,sz=(ux*(c.y-a.y)-vx*(b.y-a.y))/denom,
        offset=a.y-sx*a.x-sz*a.z,sign=Math.sign(denom),vertices=[a,b,c];
      const face={vertices,height:p=>sx*p.x+sz*p.z+offset,
        minX:Math.min(a.x,b.x,c.x),maxX:Math.max(a.x,b.x,c.x),minZ:Math.min(a.z,b.z,c.z),maxZ:Math.max(a.z,b.z,c.z)};
      face.edges=vertices.map((v,i)=>{const w=vertices[(i+1)%3];return p=>((w.x-v.x)*(p.z-v.z)-(w.z-v.z)*(p.x-v.x))*sign;});
      for(let x=Math.floor((face.minX-.001)/cellSize);x<=Math.floor((face.maxX+.001)/cellSize);x++)
        for(let z=Math.floor((face.minZ-.001)/cellSize);z<=Math.floor((face.maxZ+.001)/cellSize);z++){
          const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(face);
        }
    }
    for(const piece of runtime.pieces){
      if(!supported(piece))continue;
      for(let i=1;i<piece.poses.length;i++){
        const a=piece.poses[i-1],b=piece.poses[i];
        joinRows(faceRow(rows.get(a),'bottom'),faceRow(rows.get(b),'bottom'),
          (p,q,r,s)=>{roof(p,r,q);roof(q,r,s);},roof);
        if(modeFor(piece,a,b,options)==='none')continue;
        const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2));
        for(let j=0;j<steps;j++){
          const p=interpolate(a,b,j/steps,piece.matchRoadEdges),q=interpolate(a,b,(j+1)/steps,piece.matchRoadEdges);
          for(const side of [-1,1]){
            const innerA=offsetEdge(p,side,0,-depth*.5),outerA=offsetEdge(p,side,EDGE_WIDTH,-depth*.5),
              innerB=offsetEdge(q,side,0,-depth*.5),outerB=offsetEdge(q,side,EDGE_WIDTH,-depth*.5);
            roof(innerA,innerB,outerA);roof(outerA,innerB,outerB);
          }
        }
      }
    }
    const write=groundSupportWriter(walls,footprints,options.groundY,depth);
    for(const piece of runtime.pieces){
      if(piece.isGap)continue;
      for(let i=1;i<piece.poses.length;i++){
        const a=piece.poses[i-1],b=piece.poses[i],mode=modeFor(piece,a,b,options),outside=mode==='none'?0:EDGE_WIDTH;
        const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z)/.35));
        for(let j=0;j<steps;j++){
          const p=interpolate(a,b,j/steps,mode==='none'||piece.matchRoadEdges),q=interpolate(a,b,(j+1)/steps,mode==='none'||piece.matchRoadEdges);
          for(const side of [-1,1]){
            // A small outward offset avoids coincident kerb faces and keeps
            // cars on the lower road clear of the new two-sided wall.
            const from=offsetEdge(p,side,outside+.035,depth*.5),to=offsetEdge(q,side,outside+.035,depth*.5);
            const near=new Set(),minX=Math.min(from.x,to.x)-.001,maxX=Math.max(from.x,to.x)+.001,
              minZ=Math.min(from.z,to.z)-.001,maxZ=Math.max(from.z,to.z)+.001;
            for(let x=Math.floor(minX/cellSize);x<=Math.floor(maxX/cellSize);x++)for(let z=Math.floor(minZ/cellSize);z<=Math.floor(maxZ/cellSize);z++)
              for(const face of cells.get(x+','+z)??[])near.add(face);
            for(const face of near){
              if(face.maxX<minX || face.minX>maxX || face.maxZ<minZ || face.minZ>maxZ)continue;
              let lo=0,hi=1;
              for(const edge of face.edges){
                const f0=edge(from),f1=edge(to);
                if(f0< -1e-9 && f1< -1e-9){hi=-1;break;}
                if(f0< -1e-9 || f1< -1e-9){const t=f0/(f0-f1);if(f0<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}
              }
              if(hi-lo<1e-7)continue;
              const point=t=>({x:lerp(from.x,to.x,t),y:lerp(from.y,to.y,t),z:lerp(from.z,to.z,t)});
              const clearance=t=>{const v=point(t);return face.height(v)-v.y-.15;};
              const c0=clearance(lo),c1=clearance(hi);if(c0<=0 && c1<=0)continue;
              if(c0<=0 || c1<=0){const t=lo+(hi-lo)*c0/(c0-c1);if(c0<=0)lo=t;else hi=t;}
              if(hi-lo<1e-7)continue;
              const u=point(lo),v=point(hi);u.y=face.height(u);v.y=face.height(v);
              const key=[u,v].map(w=>`${Math.round(w.x*1e5)},${Math.round(w.y*1e5)},${Math.round(w.z*1e5)}`).sort().join('|');
              if(seen.has(key))continue;seen.add(key);write(u,v);
            }
          }
        }
      }
    }
  }
  function generateSideFeatures(runtime,options={}) {
    options={groundY:runtime.settings.groundY??0,...options};
    const kerbs=new MeshBuffer(),walls=new MeshBuffer(),fences=new MeshBuffer(),fenceCollision=new MeshBuffer();
    // Decorative rails/posts never become wheel supports or individual body
    // obstacles. A separate, continuous vertical sheet supplies the barrier.
    fences.collisionDisabled=true;fenceCollision.collisionOneSided=[];
    // The legacy mirrored profiles keep their original render winding. The
    // collision reader needs outward normals on BOTH driver sides, including
    // top versus underside. Preserve the saved mesh arrays and tag that parity.
    kerbs.collisionSigns=[];walls.collisionSigns=[];kerbs.collisionOneSided=[];walls.collisionOneSided=[];
    const markCollisionSide=(buffer,side)=>{while(buffer.collisionSigns.length<buffer.triangles)buffer.collisionSigns.push(side);};
    const depth=runtime.settings.tarmacDepth;
    const footprints=buildRoadFootprints(runtime,options),crossings=levelCrossings(runtime),pieceIndices=new Map(runtime.pieces.map((piece,index)=>[piece,index]));
    const covered=new Set((window.TrackTerrain?.coverPlans(runtime)??[]).map(item=>runtime.pieces[item.index]));
    const belowCover=clip=>(a,b,c,colour,oneSided,emit)=>{
      const limit=(u,v,w,color,one)=>{
        const poly=splitPolygon([u,v,w],p=>options.groundY-.01-p.y).inside;
        for(let i=1;i<poly.length-1;i++)emit(poly[0],poly[i],poly[i+1],color,one);
      };
      if(clip)clip(a,b,c,colour,oneSided,limit);else limit(a,b,c,colour,oneSided);
    };
    let travel=0,bridgeClips=0,wallTransitions=0,kerbCaps=0,underpassSamples=0,fencePosts=0;
    const stripeLen=Math.max(.5,runtime.settings.trackUnitLength*.1);
    const segments=[];
    for(const piece of runtime.pieces) {
      if(piece.isGap) {
        // Keep complete boundary data even for invisible runs: neighbouring
        // gaps or ES=none sections still participate in run grouping.
        segments.push({style:'none',piece,a:piece.start,b:piece.end,length:piece.length,travel});
        travel+=piece.length;
        continue;
      }
      for(let i=0;i<piece.poses.length-1;i++) {
        const a=piece.poses[i],b=piece.poses[i+1];
        const length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
        const style=modeFor(piece,a,b,options);
        const edgeStyle=styleFor(piece,b);
        if(length>.00001)segments.push({piece,a,b,style,length,travel,edgeMode:edgeStyle?.mode??'auto',stone:edgeStyle?.crown==='stone',groundFence:edgeStyle?.groundLevel===true});
        travel+=length;
      }
    }
    const connected=(left,right)=>!!left && !!right && left.style!=='none' && right.style!=='none' &&
      Math.hypot(left.b.x-right.a.x,left.b.y-right.a.y,left.b.z-right.a.z)<.001;
    // Different fence variants meet seamlessly at ground height. Below it,
    // they need separate end caps and posts at their change in height.
    const sameRun=(left,right)=>left.style===right.style && (left.style!=='fence' || left.groundFence===right.groundFence ||
      [-1,1].every(side=>edgeAt(left.b,side).y>=options.groundY-1e-8));
    const closes=runtime.autoClose && connected(segments.at(-1),segments[0]);
    // Pattern phase follows the same cumulative distances as the striped
    // kerbs. Only complete grooves fit within a stone run, leaving its ends
    // flat against smooth styles, gaps and the closed code seam.
    for(let i=0;i<segments.length;i++)if(segments[i].stone){
      const start=i;while(i+1<segments.length && segments[i+1].stone && segments[i+1].style===segments[start].style && connected(segments[i],segments[i+1]))i++;
      for(let j=start;j<=i;j++){segments[j].stoneStart=segments[start].travel;segments[j].stoneEnd=segments[i].travel+segments[i].length;}
    }
    // Group consecutive matching styles into uninterrupted runs. This makes
    // wall approach ramps independent of individual road/curve subdivisions.
    let runStart=0;
    for(let i=0;i<segments.length;i++) {
      const first=i===0 || !sameRun(segments[i-1],segments[i]) ||
        Math.hypot(segments[i-1].b.x-segments[i].a.x,segments[i-1].b.y-segments[i].a.y,segments[i-1].b.z-segments[i].a.z)>.001;
      if(first)runStart=i;
      const last=i===segments.length-1 || !sameRun(segments[i],segments[i+1]) ||
        Math.hypot(segments[i].b.x-segments[i+1].a.x,segments[i].b.y-segments[i+1].a.y,segments[i].b.z-segments[i+1].a.z)>.001;
      if(last) {
        const startDistance=segments[runStart].travel;
        const total=(segments[i].travel+segments[i].length)-startDistance;
        const before=segments[runStart-1]??(closes?segments.at(-1):null),after=segments[i+1]??(closes?segments[0]:null);
        const hardStart=before?.style==='fence' && connected(before,segments[runStart]);
        const hardEnd=after?.style==='fence' && connected(segments[i],after);
        for(let j=runStart;j<=i;j++) {
          segments[j].runStart=startDistance;
          segments[j].runLength=total;
          segments[j].isRunStart=j===runStart;
          segments[j].isRunEnd=j===i;
          segments[j].wallHardStart=hardStart;segments[j].wallHardEnd=hardEnd;
        }
      }
    }
    // Closed wall runs join through the code seam. That seam is not an open
    // endpoint and must not taper a full-height retaining wall into a kerb.
    const head=segments[0],tail=segments.at(-1);
    if(runtime.autoClose && head?.style==='wall' && tail?.style==='wall' &&
      Math.hypot(head.a.x-tail.b.x,head.a.y-tail.b.y,head.a.z-tail.b.z)<.001) {
      if(head.runStart===tail.runStart){for(const s of segments){s.closedWall=true;s.isRunStart=s.isRunEnd=false;}}
      else {
        const firstStart=head.runStart,lastStart=tail.runStart,tailLength=tail.runLength,combined=head.runLength+tailLength;
        const hardStart=tail.wallHardStart,hardEnd=head.wallHardEnd;
        for(const s of segments){
          if(s.runStart===firstStart || s.runStart===lastStart){s.wallHardStart=hardStart;s.wallHardEnd=hardEnd;}
          if(s.runStart===firstStart){s.runOffset=tailLength;s.runLength=combined;s.isRunStart=false;}
          if(s.runStart===lastStart){s.runLength=combined;s.isRunEnd=false;}
        }
      }
    }
    const wallRamp=Math.max(.1,Number(options.wallRampLength ?? 6));
    const flatten=options.flattenUnderpass===true;
    const flattenBy=Math.max(.35,Math.min(1.20,Number(options.flattenBy ?? .75)));
    const levelH=runtime.settings.levelHeight;
    function heightFor(p,side) {
      const edgeY=edgeAt(p,side).y-options.groundY;
      let h=edgeY<-.4 ? Math.max(1.35,-edgeY+.14) : 1.35;
      // At 75% of one below-ground level, bring the top of the retaining
      // wall down to approximately the road surface. Avoid raised bumps in
      // the crossing while preserving taller walls near tunnel entrances.
      if(flatten && edgeY<0) {
        const depthFraction=-edgeY/Math.max(.01,levelH);
        const mix=smoothstep((depthFraction-(flattenBy-.30))/.30);
        if(mix>.001)underpassSamples++;
        h=lerp(h,.10,mix);
      }
      const rise=Math.max(0,h-KERB_HEIGHT);
      // A retaining wall must reach the ground-level kerb crown even while
      // its approach ramp blends down. Explicit underpass lowering can
      // override this; crossings trim the finished faces separately.
      return {rise,minimumRise:Math.min(rise,Math.max(0,-edgeY))};
    }
    function fenceHeight(p,side) {
      const ceiling=overheadBottomAt(p,side,footprints,depth);
      if(Number.isFinite(ceiling)){bridgeClips++;return Math.max(0,Math.min(1.2,ceiling-edgeAt(p,side).y-depth*.5-.16));}
      return 1.2;
    }
    function fenceRise(p,side) {
      // Match the entire profile of a normal fence on a ground-level road.
      return Math.max(0,options.groundY-edgeAt(p,side).y);
    }
    function railCross(p,side,height,halfHeight,rise=0) {
      return [offsetEdge(p,side,.36,depth*.5+rise+height-halfHeight),offsetEdge(p,side,.36,depth*.5+rise+height+halfHeight),
        offsetEdge(p,side,.49,depth*.5+rise+height+halfHeight),offsetEdge(p,side,.49,depth*.5+rise+height-halfHeight)];
    }
    function post(p,side,raised=false) {
      const height=raised?1.2:fenceHeight(p,side);if(height<=.16)return;
      const centre=offsetEdge(p,side,.425,depth*.5+(raised?fenceRise(p,side):0)),bottom=[],top=[];
      for(let k=0;k<8;k++){
        const angle=k*Math.PI/4+p.yaw*Math.PI/180,x=centre.x+Math.cos(angle)*.115,z=centre.z+Math.sin(angle)*.115;
        bottom.push({x,y:centre.y+.1,z});top.push({x,y:centre.y+height+.025,z});
      }
      for(let k=0;k<8;k++){const next=(k+1)%8;fences.quad(bottom[k],top[k],bottom[next],top[next],0x353c43);}
      capCross(fences,top,0x78828b);fencePosts++;
    }
    const closedFence=runtime.autoClose && segments[0]?.style==='fence' && segments.at(-1)?.style==='fence' && sameRun(segments.at(-1),segments[0]) &&
      Math.hypot(segments[0].a.x-segments.at(-1).b.x,segments[0].a.y-segments.at(-1).b.y,segments[0].a.z-segments.at(-1).b.z)<.001;
    // A fence continuing across the track-code seam is one run, not two.
    // Keep its post spacing and rail caps continuous through that join.
    if(closedFence) {
      if(head.runStart===tail.runStart) {
        for(const s of segments){s.isRunStart=s.isRunEnd=false;}
      } else {
        const firstStart=head.runStart,lastStart=tail.runStart,tailLength=tail.runLength,combined=head.runLength+tailLength;
        for(const s of segments) {
          if(s.runStart===firstStart){s.runOffset=tailLength;s.runLength=combined;s.isRunStart=false;}
          if(s.runStart===lastStart){s.runLength=combined;s.isRunEnd=false;}
        }
      }
    }
    // Adjacent kerb and wall sections ALWAYS use one continuous kerb base.
    // Cross-section end caps are needed only at genuine track ends or gaps,
    // not where a kerb changes into a wall (and back again).
    const contiguous=connected;
    for(let i=0;i<segments.length;i++) {
      const segment=segments[i];
      const {piece,a,b,style,length}=segment;
      if(style==='none')continue;
      const steps=Math.max(1,Math.ceil(length/.35)); // consistent sampling across kerb/wall transitions
      const hasPrevious=contiguous(segments[i-1],segment);
      const hasNext=contiguous(segment,segments[i+1]);
      for(let j=0;j<steps;j++) {
        const p=interpolate(a,b,j/steps,piece.matchRoadEdges),q=interpolate(a,b,(j+1)/steps,piece.matchRoadEdges);
        const dist0=segment.travel+length*j/steps;
        const dist1=segment.travel+length*(j+1)/steps;
        const stripe=Math.floor((dist0+dist1)*.5/stripeLen)%2===0;
        const striped=explicitStripe(piece) ?? piece.isCurve;
        for(const side of [-1,1]) {
          const clip=crossingClipper(footprints,p,q,side,depth,C.wallFace,()=>bridgeClips++);
          if(clip){clip.openStart=j===0 && !hasPrevious;clip.openEnd=j===steps-1 && !hasNext;}
          const levelClip=levelClipper(crossings.edgeByPiece[pieceIndices.get(piece)]),groundClip=combineClips(levelClip,covered.has(piece)?belowCover(clip):clip);
          kerbs.clipTriangle=walls.clipTriangle=groundClip;
          if(kerbs.visual)kerbs.visual.clipTriangle=groundClip;if(walls.visual)walls.visual.clipTriangle=groundClip;
          // ALWAYS generate the full kerb on each side, even below a wall.
          // This removes the abrupt cut ends at a wall/kerb transition.
          const base0=kerbCross(p,side,depth),base1=kerbCross(q,side,depth);
          for(let k=0;k<base0.length;k++) {
            const next=(k+1)%base0.length;
            // The outer kerb face reaches the underside of the slab. Keep it
            // the same grey as the wall/support instead of a dark slab stripe.
            const colour=k>=1 && k<=3 ? (striped?(stripe?C.kerbRed:C.kerbWhite):C.kerbGrey) : k===4?C.wallOuter:C.kerbSide;
            if(k>=1 && k<=3 && style==='kerb')crownQuad(kerbs,base0[k],base0[next],base1[k],base1[next],colour,segment,dist0,dist1,stripeLen,.028,.028,k);
            else kerbs.quad(base0[k],base0[next],base1[k],base1[next],colour);
          }
          // Only cap actual openings, not the join between wall and kerb.
          if(j===0 && !hasPrevious){capCross(kerbs,base0,C.kerbSide);kerbCaps++;}
          if(j===steps-1 && !hasNext){capCross(kerbs,base1,C.kerbSide);kerbCaps++;}

          // Kerbs in a cutting sit at the terrain height, with a retaining
          // face underneath. Explicit walls keep their normal full height.
          const groundRise=pose=>Math.max(0,options.groundY-edgeAt(pose,side).y);
          const raisedKerb=style==='kerb' && (groundRise(p)>1e-8 || groundRise(q)>1e-8);
          if(style==='wall' || raisedKerb) {
            if(clip){clip.openStart=j===0 && segment.isRunStart;clip.openEnd=j===steps-1 && segment.isRunEnd;}
            const scaleAt=d=>{
              if(segment.closedWall)return 1;
              const distance=d-segment.runStart+(segment.runOffset??0);
              // A fence meets the wall at a post, so that end stays full height.
              // The opposite end can still taper normally into a kerb/open end.
              const from=segment.wallHardStart?Infinity:distance;
              const to=segment.wallHardEnd?Infinity:segment.runLength-distance;
              // A short run's remaining ramp must fit before the fence.
              const ramp=segment.wallHardStart || segment.wallHardEnd?Math.min(wallRamp,segment.runLength):wallRamp;
              return smoothstep(Math.min(from,to)/ramp);
            };
            // Height grows upward from the kerb, never changes its width.
            // At tapered ground-level boundaries (rise=0), it meets the kerb.
            const height0=heightFor(p,side),height1=heightFor(q,side);
            const autoGround=segment.edgeMode==='auto' && options.sideMode!=='walls' && !flatten;
            const riseAt=(pose,height,distance)=>raisedKerb || autoGround && edgeAt(pose,side).y<=options.groundY+1e-8
              ?groundRise(pose):Math.max(height.minimumRise,height.rise*scaleAt(distance));
            const rise0=riseAt(p,height0,dist0),rise1=riseAt(q,height1,dist1);
            const u=wallCross(p,side,depth,rise0);
            const v=wallCross(q,side,depth,rise1);
            // Draw upper faces only. The existing kerb provides the bottom;
            // duplicating its top faces here would produce z-fighting.
            const target=raisedKerb?kerbs:walls,kerbColour=striped?(stripe?C.kerbRed:C.kerbWhite):C.kerbGrey;
            const colours=raisedKerb?[C.wallFace,kerbColour,kerbColour,kerbColour,C.wallOuter]:[C.wallFace,C.wallBevel,C.wallTop,C.wallBevel,C.wallOuter];
            for(let k=0;k<5;k++) {
              if(rise0<.00001 && rise1<.00001)continue;
              if(k>=1 && k<=3)crownQuad(target,u[k],u[k+1],v[k],v[k+1],colours[k],segment,dist0,dist1,stripeLen,Math.min(.045,rise0*.5),Math.min(.045,rise1*.5),k);
              else target.quad(u[k],u[k+1],v[k],v[k+1],colours[k]);
            }
            // Seal full-height ends beside fences and underground openings
            // that cannot contract to the kerb.
            if(j===0 && segment.isRunStart && rise0>.00001)capCross(target,u,C.wallFace);
            if(j===steps-1 && segment.isRunEnd && rise1>.00001)capCross(target,v,C.wallFace);
            if(style==='wall' && j===0 && segment.isRunStart)wallTransitions++;
            if(style==='wall' && j===steps-1 && segment.isRunEnd)wallTransitions++;
          }
          if(style==='fence') {
            const rise0=segment.groundFence?fenceRise(p,side):0,rise1=segment.groundFence?fenceRise(q,side):0,raised=Math.max(rise0,rise1)>1e-8;
            if(raised){
              // Raise the ordinary kerb into a continuous retaining base.
              // The existing crossing clipper also cuts this base at bridges.
              const u=wallCross(p,side,depth,rise0),v=wallCross(q,side,depth,rise1);
              const colours=[C.wallFace,C.wallBevel,C.wallTop,C.wallBevel,C.wallOuter];
              for(let k=0;k<5;k++)kerbs.quad(u[k],u[k+1],v[k],v[k+1],colours[k]);
              if(j===0 && segment.isRunStart && rise0>1e-8)capCross(kerbs,u,C.wallFace);
              if(j===steps-1 && segment.isRunEnd && rise1>1e-8)capCross(kerbs,v,C.wallFace);
            }
            // Unlike a solid kerb, rails and posts must disappear inside the
            // crossing instead of being flattened onto the bridge underside.
            // A post extends beyond its sampled row. Include its radius in
            // the footprint query, even if the row itself misses the bridge;
            // otherwise a post can poke through a neighbouring road triangle.
            const fenceClip=raised?crossingClipper(footprints,p,q,side,depth,C.wallFace,()=>bridgeClips++,true,.115):null;
            fences.clipTriangle=fenceCollision.clipTriangle=combineClips(levelClip,covered.has(piece)?belowCover(fenceClip):fenceClip);
            const height0=raised?1.2:fenceHeight(p,side),height1=raised?1.2:fenceHeight(q,side);
            if(Math.max(height0,height1)>.16) {
              for(const fraction of [.42,.83]){
                const u=railCross(p,side,height0*fraction,Math.min(.045,height0*.08),rise0),v=railCross(q,side,height1*fraction,Math.min(.045,height1*.08),rise1);
                for(let k=0;k<4;k++)fences.quad(u[k],u[(k+1)%4],v[k],v[(k+1)%4],k===1?0x68737d:0x30383f);
                if(j===0 && segment.isRunStart)capCross(fences,u,0x30383f);
                if(j===steps-1 && segment.isRunEnd)capCross(fences,v,0x30383f);
              }
              const firstCollisionTriangle=fenceCollision.triangles;
              fenceCollision.quad(offsetEdge(p,side,.31,depth*.5+rise0+.12),offsetEdge(p,side,.31,depth*.5+rise0+Math.max(.12,height0)),
                offsetEdge(q,side,.31,depth*.5+rise1+.12),offsetEdge(q,side,.31,depth*.5+rise1+Math.max(.12,height1)),0x30383f);
              // Both sides of this flat sheet block the car. There are no
              // invisible horizontal faces for a tyre to land on.
              for(let n=firstCollisionTriangle;n<fenceCollision.triangles;n++)fenceCollision.collisionOneSided[n]=false;
            }
            // Fit a whole number of approximately 2.4 m intervals into the
            // complete run, so the final post is not crowded against its
            // neighbour. Use cumulative distance across section boundaries.
            const intervals=Math.max(1,Math.round(segment.runLength/2.4)),spacing=segment.runLength/intervals;
            const offset=segment.runOffset??0,from=dist0-segment.runStart+offset,to=dist1-segment.runStart+offset;
            for(let n=Math.max(0,Math.ceil((from-1e-7)/spacing));n<intervals && n*spacing<to-1e-7;n++) {
              const t=Math.max(0,Math.min(1,(segment.runStart+n*spacing-offset-segment.travel)/length));
              post(interpolate(a,b,t,piece.matchRoadEdges),side,raised);
            }
            if(j===steps-1 && segment.isRunEnd)post(q,side,raised);
            fences.clipTriangle=fenceCollision.clipTriangle=null;
          }
          markCollisionSide(kerbs,side);markCollisionSide(walls,side);
        }
      }
    }
    // Clipping is a build-time operation; finished buffers must not retain
    // the spatial footprint index or a mutable writer from the final row.
    for(const buffer of [kerbs,walls,fences,fenceCollision,kerbs.visual,walls.visual])if(buffer)delete buffer.clipTriangle;
    const supported=piece=>!!piece && !piece.isGap && (piece.source.WG??runtime.settings.groundSupports??false);
    if(runtime.pieces.some(supported)){
      const support=groundSupportWriter(walls,footprints,options.groundY,depth);
      for(const piece of runtime.pieces){
        if(!supported(piece))continue;
        const levelCutters=crossings.edgeByPiece[pieceIndices.get(piece)];
        for(let i=0;i<piece.poses.length-1;i++){
          const a=piece.poses[i],b=piece.poses[i+1],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2));
          const outside=modeFor(piece,a,b,options)==='none'?0:EDGE_WIDTH;
          for(let j=0;j<steps;j++){
            const p=interpolate(a,b,j/steps,piece.matchRoadEdges),q=interpolate(a,b,(j+1)/steps,piece.matchRoadEdges);
            for(const side of [-1,1])support(offsetEdge(p,side,outside,-depth*.5),offsetEdge(q,side,outside,-depth*.5),levelCutters);
          }
        }
      }
      // Either end can be a landing when racing in reverse. A jump opening
      // itself remains empty; its supported neighbours supply the end faces.
      const pieces=runtime.pieces,joined=Math.hypot(pieces.at(-1).end.x-pieces[0].start.x,pieces.at(-1).end.y-pieces[0].start.y,pieces.at(-1).end.z-pieces[0].start.z)<.001;
      for(let i=0;i<pieces.length;i++){
        const piece=pieces[i];if(!supported(piece))continue;
        const levelCutters=crossings.edgeByPiece[i];
        for(const [pose,neighbour,atStart] of [[piece.start,pieces[i-1]??(joined?pieces.at(-1):null),true],[piece.end,pieces[i+1]??(joined?pieces[0]:null),false]]){
          const otherEnd=atStart?neighbour?.end:neighbour?.start;
          const adjoining=otherEnd && Math.hypot(pose.x-otherEnd.x,pose.y-otherEnd.y,pose.z-otherEnd.z)<.001?neighbour:null;
          const ownOutside=modeFor(piece,piece.poses[0],piece.poses[1],options)==='none'?0:EDGE_WIDTH;
          const neighbourOutside=supported(adjoining)?(modeFor(adjoining,adjoining.poses[0],adjoining.poses[1],options)==='none'?0:EDGE_WIDTH):0;
          // Close the thickness beneath each kerb wherever the support starts,
          // ends or changes its outer offset. This also seals both sides of a
          // supported end face where the next section has no ground support.
          if(ownOutside>neighbourOutside+1e-8)for(const side of [-1,1])
            support(offsetEdge(pose,side,neighbourOutside,-depth*.5),offsetEdge(pose,side,ownOutside,-depth*.5),levelCutters);
          // A continuous supported neighbour does not need an interior wall.
          // Otherwise close the exposed face down to ground; the shared writer
          // clips openings for any lower road and creates two-sided collisions.
          if(supported(adjoining))continue;
          const steps=hasBank(pose)?8:1;
          for(let j=0;j<steps;j++){
            const a=window.TS2.roadPoint(pose,-1+2*j/steps),b=window.TS2.roadPoint(pose,-1+2*(j+1)/steps);
            support({...a,y:a.y-depth*.5},{...b,y:b.y-depth*.5},levelCutters);
          }
        }
      }
      addUnderpassSides(runtime,options,footprints,walls,depth,supported);
    }
    return {kerbs,walls,fences,fenceCollision,stats:{wallTransitions,kerbCaps,bridgeClips,underpassSamples,fencePosts,levelCrossings:crossings.count}};
  }
  function explicitStripe(piece) {
    return styleFor(piece,piece.end)?.striped??null;
  }
  function addLines(parent,points,color,opacity=1) {
    if (points.length<2) return;
    const geom=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x,p.y,p.z)));
    parent.add(new THREE.Line(geom,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity,depthTest:false})));
  }
  function debugGroup(runtime, flags={}) {
    const group=new THREE.Group(), depth=runtime.settings.tarmacDepth*.5;
    const show=flags;
    for (const piece of runtime.pieces) {
      const poses=piece.poses;
      if(show.centre !== false) addLines(group,poses.map(p=>at(p,depth+.27)),piece.isClose?0xffa34e:0xffd349);
      if(show.edges !== false) {
        addLines(group,poses.map(p=>offsetEdge(p,1,0,depth+.21)),0x38ef77);
        addLines(group,poses.map(p=>offsetEdge(p,-1,0,depth+.24)),0x3d80ff);
      }
      if(show.ribs !== false) for(let i=0;i<poses.length;i+=2) {
        addLines(group,[offsetEdge(poses[i],-1,0,depth+.26),offsetEdge(poses[i],1,0,depth+.26)],0xa6adba,.7);
      }
    }
    const markerGeo=new THREE.SphereGeometry(.21,6,5),markerMat=new THREE.MeshBasicMaterial({color:0x20e5d4,depthTest:false});
    const endsMat=new THREE.MeshBasicMaterial({color:0xea64d4,depthTest:false});
    if(show.points !== false) for(const piece of runtime.pieces) {
      if(piece.isClose)continue;
      for(const [idx,p] of piece.poses.entries()) {
        if(!piece.isCurve && idx>0 && idx<piece.poses.length-1)continue;
        const point=new THREE.Mesh(markerGeo, idx===piece.poses.length-1?endsMat:markerMat);
        point.position.set(p.x,p.y+depth+.4,p.z);group.add(point);
      }
    }
    group.renderOrder=10;
    return group;
  }
  function selectionGroup(runtime,index,road=null) {
    const group=new THREE.Group(),piece=runtime.pieces[index];group.name='Section selection';
    if(!piece)return group;
    const depth=runtime.settings.tarmacDepth*.5;
    if(!piece.isGap) {
      let mesh;
      if(road && piece.source?.SR>0){
        // Use the already built surface so highlighting keeps the same
        // continuous roughness as its neighbours and does not rebuild a run.
        mesh=new MeshBuffer();const range=road.pieceRanges.find(entry=>entry.pieceIndex===index);
        if(range)for(let triangle=range.start;triangle<range.start+range.count;triangle++)if(road.collisionRoles[triangle]==='support'){
          const i=triangle*9,p=road.positions,point=offset=>({x:p[i+offset],y:p[i+offset+1],z:p[i+offset+2]});mesh.tri(point(0),point(3),point(6),0xffffff);
        }
      }else mesh=generateRoad({...runtime,pieces:[piece],autoClose:false});
      const surface=new THREE.Mesh(mesh.geometry(),new THREE.MeshBasicMaterial({color:0xffbf4f,transparent:true,opacity:.32,
        side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
      surface.name='Selection surface';surface.renderOrder=2;group.add(surface);
    }
    for(const side of [-1,1])addLines(group,piece.poses.map(p=>offsetEdge(p,side,0,depth+.06)),0xffc45b);
    addLines(group,piece.poses.map(p=>at(p,depth+.08)),0xffdf8c);
    return group;
  }
  // A small non-physical target lets the editor select an otherwise invisible gap.
  // The separate meshes retain their section IDs and never enter collision buffers.
  function gapMarkerGroup(runtime) {
    const group=new THREE.Group();group.name='Gap editor markers';
    try {
    for(const [index,piece] of runtime.pieces.entries()) {
      if(!piece.isGap)continue;
      const mesh=new MeshBuffer(),half=Math.min(.3,1.5/piece.length),steps=8;
      const point=(fraction,side)=>{
        const pose=window.TrackRace.at(piece,fraction),u=Math.min(.55,2.5/pose.width)*side;
        return surfacePoint(pose,u,runtime.settings.tarmacDepth*.5+.08);
      };
      for(let i=0;i<steps;i++){
        const a=.5-half+2*half*i/steps,b=.5-half+2*half*(i+1)/steps;
        mesh.quad(point(a,-1),point(b,-1),point(a,1),point(b,1),0xffffff);
      }
      const geometry=mesh.geometry();let material;
      try {
        material=new THREE.MeshBasicMaterial({color:0x19d7e4,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
        const marker=new THREE.Mesh(geometry,material);marker.name=`Gap ${index+1} editor marker`;marker.userData={gapPieceIndex:index};marker.renderOrder=3;group.add(marker);
      }catch(error){geometry.dispose();material?.dispose();throw error;}
    }
    return group;
    }catch(error){group.traverse(item=>{item.geometry?.dispose();item.material?.dispose();});throw error;}
  }
  function generateRaceMarkers(runtime,road=null,roles='all',direction=1) {
    direction=direction===-1?-1:1;
    const buffer=new MeshBuffer(),gates=window.TrackRace.plan(runtime,road,direction).gates.filter(gate=>
      roles==='checkpoints'?gate.kind==='CP':roles==='startFinish'?gate.kind!=='CP':true);
    if(gates.length)road??=generateRoad(runtime);
    function detailedFractions(fractions,part,profile,from,to){
      if(profile && profile.length>1e-8)fractions.push(...woodCuts(profile.offset+from*profile.length,profile.offset+to*profile.length,profile).map(value=>(value-profile.offset)/profile.length));
      if(part.source?.SR>0){const steps=Math.ceil((to-from)*part.length/.12);for(let i=1;i<steps;i++)fractions.push(from+(to-from)*i/steps);}
      return fractions.sort((a,b)=>a-b).filter((value,index,all)=>!index || value-all[index-1]>1e-8);
    }
    function paintTriangle(a,b,c,colour,index,rough,depth=4){
      if(!rough || depth===0){buffer.tri(a,b,c,colour);return;}
      const midpoint=(p,q)=>{const v={x:(p.x+q.x)/2,y:(p.y+q.y)/2,z:(p.z+q.z)/2};v.y=(window.TrackRace.roadHeight(road,index,v)??v.y-.02)+.02;return v;};
      const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
      const centre={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3,z:(a.z+b.z+c.z)/3};
      const height=window.TrackRace.roadHeight(road,index,centre);
      const error=Math.max(Math.abs(ab.y-(a.y+b.y)/2),Math.abs(bc.y-(b.y+c.y)/2),Math.abs(ca.y-(c.y+a.y)/2),height===null?0:Math.abs(centre.y-height-.02));
      if(error<.008){buffer.tri(a,b,c,colour);return;}
      paintTriangle(a,ab,ca,colour,index,true,depth-1);paintTriangle(ab,b,bc,colour,index,true,depth-1);
      paintTriangle(ca,bc,c,colour,index,true,depth-1);paintTriangle(ab,bc,ca,colour,index,true,depth-1);
    }
    function paintQuad(a,b,c,d,colour,index,rough){
      if(!rough){buffer.quad(a,b,c,d,colour);return;}
      paintTriangle(a,c,b,colour,index,true);paintTriangle(b,c,d,colour,index,true);
    }
    // Filled, low-poly lettering. C/P/O have chamfered corners and N/K use
    // diagonal strokes instead of square pixels. Each polygon is convex.
    const rect=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
    const letters={
      C:[rect(.65,0,3,.65),rect(0,.65,.65,4.35),rect(.65,4.35,3,5),[[0,.65],[.65,0],[.65,.65]],[[0,4.35],[.65,4.35],[.65,5]]],
      H:[rect(0,0,.65,5),rect(2.35,0,3,5),rect(.65,2.15,2.35,2.8)],
      E:[rect(0,0,.65,5),rect(.65,0,3,.65),rect(.65,2.15,2.6,2.8),rect(.65,4.35,3,5)],
      K:[rect(0,0,.65,5),[[.65,2.15],[1.3,2.15],[3,0],[2.15,0]],[[.65,2.15],[1.3,2.15],[3,5],[2.15,5]]],
      P:[rect(0,.65,.65,5),rect(.65,0,2.35,.65),rect(.65,2.15,2.35,2.8),rect(2.35,.65,3,2.15),
        [[0,.65],[.65,0],[.65,.65]],[[2.35,0],[3,.65],[2.35,.65]],[[2.35,2.15],[3,2.15],[2.35,2.8]]],
      O:[rect(0,.65,.65,4.35),rect(2.35,.65,3,4.35),rect(.65,0,2.35,.65),rect(.65,4.35,2.35,5),
        [[0,.65],[.65,0],[.65,.65]],[[2.35,0],[3,.65],[2.35,.65]],[[0,4.35],[.65,4.35],[.65,5]],[[2.35,4.35],[3,4.35],[2.35,5]]],
      I:[rect(0,0,3,.65),rect(1.175,.65,1.825,4.35),rect(0,4.35,3,5)],
      N:[rect(0,0,.65,5),rect(2.35,0,3,5),[[.65,0],[1.3,0],[2.35,5],[1.7,5]]],
      T:[rect(0,0,3,.65),rect(1.175,.65,1.825,5)]
    };
    function paintCheckpointLabel(gate){
      const pieces=runtime.pieces;
      function collect(travel){
        const spans=[];let index=gate.pieceIndex,fraction=gate.fraction,distance=0;
        for(let visited=0;visited<pieces.length && distance<2.5;visited++){
          const part=pieces[index];if(!part || part.isGap || !(part.length>1e-8))break;
          const available=(travel===1?fraction:1-fraction)*part.length;
          if(available>1e-8){spans.push({index,part,start:distance,end:distance+available,fraction});distance+=available;}
          if(distance>=2.5)break;
          const next=(index-travel+pieces.length)%pieces.length,other=pieces[next];
          if(!other || other.isGap)break;
          const a=travel===1?other.end:part.end,b=travel===1?part.start:other.start;
          if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)>.001)break;
          index=next;fraction=travel===1?1:0;
        }
        return {spans,distance};
      }
      let travel=direction,{spans,distance}=collect(travel);
      // A marker immediately after a gap has no approach surface to paint.
      // In that case put the same readable lettering just beyond the line.
      if(distance<.83){travel=-direction;({spans,distance}=collect(travel));}
      const gap=.48,depth=Math.min(1.55,distance-gap);if(depth<.35)return;
      const centreDistance=gap+depth*.5,span=spans.find(item=>centreDistance<=item.end+1e-8);if(!span)return;
      const centreFraction=span.fraction-travel*(centreDistance-span.start)/span.part.length;
      const centre=window.TrackRace.at(span.part,centreFraction),yaw=gate.pose.yaw*Math.PI/180;
      // A fixed gate-aligned frame keeps the word level and all letters the
      // same size on a bend, without tilting into the checkpoint stripe.
      const forward={x:Math.sin(yaw)*direction,z:Math.cos(yaw)*direction},left={x:Math.cos(yaw)*direction,z:-Math.sin(yaw)*direction};
      const referenceY=centre.y+gate.roadTop,indices=[...new Set(spans.map(item=>item.index))];
      function height(x,z){
        let best=null;for(const index of indices){const y=window.TrackRace.roadHeight(road,index,{x,y:referenceY,z});if(y!==null && (best===null || Math.abs(y-referenceY)<Math.abs(best-referenceY)))best=y;}return best;
      }
      const baseWidth=(window.TS2.halfWidth(centre,-1)+window.TS2.halfWidth(centre,1))*.78;
      let scale=1;
      const position=(u,v,s=scale)=>({x:centre.x+left.x*u*baseWidth*s+forward.x*v*depth*s,z:centre.z+left.z*u*baseWidth*s+forward.z*v*depth*s});
      // Uniformly scale the whole word if a very tight bend has insufficient
      // room. Sampling only connected road pieces prevents painting a bridge
      // underneath, adjacent grass, or across a jump.
      for(;scale>=.35;scale-=.05){let fits=true;for(let i=0;i<=8 && fits;i++)for(let j=0;j<=4;j++){
        const p=position(i/8-.5,j/4-.5);if(height(p.x,p.z)===null){fits=false;break;}
      }if(fits)break;}
      if(scale<.35)return;
      const point=(x,y)=>{const p=position(.5-x/39,.5-y/5),h=height(p.x,p.z);return h===null?null:{...p,y:h+.025};};
      function project(a,b,c,remaining=5){
        if(!a || !b || !c)return;
        const middle=(p,q)=>{const x=(p.x+q.x)*.5,z=(p.z+q.z)*.5,h=height(x,z);return h===null?null:{x,y:h+.025,z};};
        const ab=middle(a,b),bc=middle(b,c),ca=middle(c,a),x=(a.x+b.x+c.x)/3,z=(a.z+b.z+c.z)/3,h=height(x,z);
        if(!ab || !bc || !ca || h===null)return;
        const error=Math.max(Math.abs(ab.y-(a.y+b.y)/2),Math.abs(bc.y-(b.y+c.y)/2),Math.abs(ca.y-(c.y+a.y)/2),Math.abs(h+.025-(a.y+b.y+c.y)/3));
        if(remaining && error>.008){project(a,ab,ca,remaining-1);project(ab,b,bc,remaining-1);project(ca,bc,c,remaining-1);project(ab,bc,ca,remaining-1);}
        else buffer.tri(a,b,c,0xf2f7f4);
      }
      const text='CHECKPOINT';for(let i=0;i<text.length;i++)for(const polygon of letters[text[i]]){
        const points=polygon.map(([x,y])=>point(i*4+x,y));for(let j=1;j<points.length-1;j++)project(points[0],points[j],points[j+1]);
      }
    }
    for(const gate of gates) {
      const piece=runtime.pieces[gate.pieceIndex],columns=Math.max(8,Math.ceil(gate.pose.width/(piece.source?.SR>0 ? .25 : .5))),half=.28/piece.length;
      if(gate.kind==='CP')paintCheckpointLabel(gate);
      // A gate exactly at a split belongs to only one section, but its paint
      // must span both sides of the seam. Use each neighbour's own road mesh
      // for height and wood-join sampling; keep the race gate itself unique.
      const atStart=gate.fraction<1e-9,atEnd=gate.fraction>1-1e-9,count=runtime.pieces.length;
      const leftIndex=atStart?(gate.pieceIndex+count-1)%count:gate.pieceIndex,rightIndex=atStart?gate.pieceIndex:(gate.pieceIndex+1)%count;
      const leftPiece=runtime.pieces[leftIndex],rightPiece=runtime.pieces[rightIndex];
      const connected=(atStart||atEnd) && !leftPiece.isGap && !rightPiece.isGap &&
        Math.hypot(leftPiece.end.x-rightPiece.start.x,leftPiece.end.y-rightPiece.start.y,leftPiece.end.z-rightPiece.start.z)<.001;
      if(connected){
        for(const [row,index,from,to] of [[0,leftIndex,Math.max(0,1-.28/leftPiece.length),1],[1,rightIndex,0,Math.min(1,.28/rightPiece.length)]]){
          const part=runtime.pieces[index],profile=woodLayout(runtime).get(part);let fractions=[from,to];
          fractions=detailedFractions(fractions,part,profile,from,to);
          const poses=fractions.map(fraction=>window.TrackRace.at(part,fraction));
          const point=(pose,u)=>{const result=surfacePoint(pose,u,gate.roadTop);result.y=(window.TrackRace.roadHeight(road,index,result)??result.y)+.018;return result;};
          for(let strip=0;strip<poses.length-1;strip++)for(let column=0;column<columns;column++){
            const u0=column/columns*2-1,u1=(column+1)/columns*2-1;
            const colour=gate.kind==='SF'||gate.kind==='RF'?((row+column)%2?0xeef4e9:0x202b33):gate.kind==='RS'?(row?0xeef4e9:0x4dcc83):(row?0xc8edff:0x238cca);
            paintQuad(point(poses[strip],u0),point(poses[strip+1],u0),point(poses[strip],u1),point(poses[strip+1],u1),colour,index,part.source?.SR>0);
          }
        }
        const index=direction===1?rightIndex:leftIndex,part=runtime.pieces[index],profile=woodLayout(runtime).get(part);
        const position=distance=>direction===1?Math.min(1,distance/part.length):Math.max(0,1-distance/part.length);
        const back=position(.6),front=position(1.25),arrow=(fraction,u)=>{const result=surfacePoint(window.TrackRace.at(part,fraction),u,gate.roadTop);result.y=(window.TrackRace.roadHeight(road,index,result)??result.y)+.02;return result;};
        const colour=gate.kind==='CP'?0x238cca:0xe6c578;
        if(!profile || profile.length<=1e-8)paintTriangle(arrow(back,-.09),arrow(front,0),arrow(back,.09),colour,index,part.source?.SR>0);
        else{
          const distance=fraction=>profile.offset+profile.length*fraction;
          const triangle=[{...arrow(back,-.09),s:distance(back)},{...arrow(front,0),s:distance(front)},{...arrow(back,.09),s:distance(back)}];
          const cuts=woodCuts(Math.min(...triangle.map(p=>p.s)),Math.max(...triangle.map(p=>p.s)),profile);
          for(let i=1;i<cuts.length;i++){
            const poly=sliceWood(triangle,cuts[i-1],cuts[i]).map(point=>({...point,y:(window.TrackRace.roadHeight(road,index,point)??point.y-.02)+.02}));
            for(let j=1;j<poly.length-1;j++)paintTriangle(poly[0],poly[j],poly[j+1],colour,index,part.source?.SR>0);
          }
        }
        continue;
      }
      const clampFraction=value=>Math.max(0,Math.min(1,value));
      const profile=woodLayout(runtime).get(piece);
      let fractions=[-half,0,half].map(offset=>clampFraction(gate.fraction+offset));
      if(profile || piece.source?.SR>0)fractions=detailedFractions(fractions,piece,profile,fractions[0],fractions[2]);
      const rows=fractions.map(fraction=>window.TrackRace.at(piece,fraction));
      for(let row=0;row<rows.length-1;row++)for(let column=0;column<columns;column++) {
        const u0=column/columns*2-1,u1=(column+1)/columns*2-1;
        const halfRow=(fractions[row]+fractions[row+1])*.5<gate.fraction?0:1;
        const color=gate.kind==='SF'||gate.kind==='RF'?((halfRow+column)%2?0xeef4e9:0x202b33):
          gate.kind==='RS'?(halfRow?0xeef4e9:0x4dcc83):(halfRow?0xc8edff:0x238cca);
        const point=(p,u)=>{
          const result=surfacePoint(p,u,gate.roadTop);
          result.y=(window.TrackRace.roadHeight(road,gate.pieceIndex,result)??result.y)+.018;return result;
        };
        paintQuad(point(rows[row],u0),point(rows[row+1],u0),point(rows[row],u1),point(rows[row+1],u1),color,gate.pieceIndex,piece.source?.SR>0);
      }
      // A small forward chevron makes the legal crossing direction visible.
      const fraction=offset=>clampFraction(gate.fraction+offset/piece.length);
      const backFraction=fraction(.6*direction),frontFraction=fraction(1.25*direction);
      const back=window.TrackRace.at(piece,backFraction),front=window.TrackRace.at(piece,frontFraction);
      const arrow=(p,u)=>{const point=surfacePoint(p,u,gate.roadTop);point.y=(window.TrackRace.roadHeight(road,gate.pieceIndex,point)??point.y)+.02;return point;};
      const colour=gate.kind==='CP'?0x238cca:0xe6c578;
      if(!profile || profile.length<=1e-8)paintTriangle(arrow(back,-.09),arrow(front,0),arrow(back,.09),colour,gate.pieceIndex,piece.source?.SR>0);
      else{
        const distance=f=>profile.offset+profile.length*f;
        const triangle=[{...arrow(back,-.09),s:distance(backFraction)},{...arrow(front,0),s:distance(frontFraction)},{...arrow(back,.09),s:distance(backFraction)}];
        const cuts=woodCuts(Math.min(...triangle.map(p=>p.s)),Math.max(...triangle.map(p=>p.s)),profile);
        for(let i=1;i<cuts.length;i++){
          const poly=sliceWood(triangle,cuts[i-1],cuts[i]).map(point=>({...point,y:(window.TrackRace.roadHeight(road,gate.pieceIndex,point)??point.y-.02)+.02}));
          for(let j=1;j<poly.length-1;j++)paintTriangle(poly[0],poly[j],poly[j+1],colour,gate.pieceIndex,piece.source?.SR>0);
        }
      }
    }
    return buffer;
  }
  function generateBoostPads(runtime,road,direction=1){
    const buffer=new MeshBuffer(),pads=window.TrackBoost.plan(runtime,direction);
    for(const pad of pads){
      const piece=pad.piece,from=pad.fraction-pad.length/(2*piece.length),to=pad.fraction+pad.length/(2*piece.length);
      const clearance=.07,rough=(piece.source?.SR??0)>0 || window.TS2.pieceSurface(piece)==='wood';
      const point=(t,across,lift=0)=>{const pose=window.TrackRace.at(piece,from+(to-from)*t),distance=pad.centre+across*pad.width/2;
        const p=window.TS2.roadPoint(pose,Math.max(-1,Math.min(1,window.TS2.lateralU(pose,distance))),runtime.settings.tarmacDepth*.5+clearance);
        p.y=(window.TrackRace.roadHeight(road,pad.index,p)??p.y-clearance)+clearance+lift;return p;};
      // Subdivide each visual triangle where the real road differs from its
      // interpolated height. This follows sloped, banked and rough meshes;
      // the decoration never enters the vehicle's collision world.
      function paint(a,b,c,colour,lift,depth=0){
        const vertices=[a,b,c],midpoints=[],errors=[],lengths=[];
        for(let i=0;i<3;i++){
          const u=vertices[i],v=vertices[(i+1)%3],p={x:(u.x+v.x)/2,y:(u.y+v.y)/2,z:(u.z+v.z)/2};
          const height=window.TrackRace.roadHeight(road,pad.index,p),expected=p.y;
          if(height!==null)p.y=height+clearance+lift;
          midpoints.push(p);errors.push(Math.abs(p.y-expected));lengths.push(Math.hypot(u.x-v.x,u.z-v.z));
        }
        const centre={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3,z:(a.z+b.z+c.z)/3};
        const height=window.TrackRace.roadHeight(road,pad.index,centre),centreError=height===null?0:Math.abs(height+clearance+lift-centre.y);
        const longest=lengths.indexOf(Math.max(...lengths)),worst=errors.indexOf(Math.max(...errors));
        if(depth<12 && (Math.max(...errors,centreError)>.012 || rough && lengths[longest]>.4)){
          const edge=rough && lengths[longest]>.4 || centreError>=errors[worst]?longest:worst;
          const u=vertices[edge],v=vertices[(edge+1)%3],opposite=vertices[(edge+2)%3],mid=midpoints[edge];
          paint(u,mid,opposite,colour,lift,depth+1);paint(mid,v,opposite,colour,lift,depth+1);return;
        }
        buffer.tri(a,b,c,colour);
      }
      // A chamfered cyan outline and inset dark face approximate the rounded
      // frame in the reference without textures or extra collision geometry.
      function rounded(t0,t1,x0,x1,rt,rx,colour,lift){
        const ring=[[t0+rt,x0],[t0+rt*.28,x0+rx*.28],[t0,x0+rx],[t0,x1-rx],
          [t0+rt*.28,x1-rx*.28],[t0+rt,x1],[t1-rt,x1],[t1-rt*.28,x1-rx*.28],
          [t1,x1-rx],[t1,x0+rx],[t1-rt*.28,x0+rx*.28],[t1-rt,x0]];
        const centre=point((t0+t1)/2,(x0+x1)/2,lift);
        for(let i=0;i<ring.length;i++)paint(centre,point(...ring[i],lift),point(...ring[(i+1)%ring.length],lift),colour,lift);
      }
      rounded(0,1,-1,1,.10,.18,0x00e8e8,0);
      rounded(.045,.955,-.90,.90,.075,.14,0x101c23,.008);
      // Thick, filled yellow chevrons point in the direction of the race.
      for(const peak of [.33,.56,.79]){
        const v=[[peak-.08,-.62],[peak+.075,0],[peak-.08,.62],[peak-.19,.62],[peak-.035,0],[peak-.19,-.62]];
        const p=v.map(([t,x])=>point(direction===-1?1-t:t,x,.016));
        paint(p[0],p[1],p[4],0xffd400,.016);paint(p[0],p[4],p[5],0xffd400,.016);
        paint(p[1],p[2],p[3],0xffd400,.016);paint(p[1],p[3],p[4],0xffd400,.016);
      }
    }
    return buffer;
  }
  window.TrackGeometry = {material,generateRoad,generateSideFeatures,generateRaceMarkers,generateBoostPads,generateCrossingArrows,debugGroup,surfacePoint,selectionGroup,gapMarkerGroup};
})();
