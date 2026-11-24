/* Bounded tyre ribbons, sampled from loaded suspension contacts. No textures. */
(function () {
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const STYLES=Object.freeze({
    tarmac:{colour:0x050606,opacity:.64}, wood:{colour:0x201006,opacity:.48},
    gravel:{colour:0x202326,opacity:.36}, dirt:{colour:0x24170f,opacity:.42},
    mud:{colour:0x160c06,opacity:.48}, grass:{colour:0x201a0c,opacity:.36},
    ice:{colour:0xb5d6df,opacity:.20}
  });
  function slip(state,contact) {
    if(!contact.hit || contact.force<=.05)return 0;
    const motion=window.TrackVehicle?.wheelMotion(state,contact);
    const forward=motion?.forward??state.vx*Math.sin(state.yaw)+state.vz*Math.cos(state.yaw);
    const lateral=Math.abs(motion?.lateral??(-state.vx*Math.cos(state.yaw)+state.vz*Math.sin(state.yaw)));
    const speed=motion?Math.hypot(motion.forward,motion.lateral):Math.hypot(state.vx,state.vz),rear=contact.name[0]==='R';
    // Ordinary cornering leaves no marks. Locked rears, lateral sliding and
    // powered wheelspin each contribute; unloaded/airborne wheels never do.
    const gripLoss=rear?state.rearGripLoss:state.frontGripLoss,measured=Number.isFinite(gripLoss);
    // The simulation supplies a real saturated-grip gate. With it, modest
    // tyre scrub can make a faint mark; steering angle alone cannot do so.
    // Keep the standalone/legacy sample fallback for callers without physics.
    const slide=clamp((lateral-(measured ? .8 : 1.1))/3,0,1)*
      clamp((lateral/(Math.abs(forward)+1)-(measured ? .025 : .13))*(measured?16:4),0,1)*(measured?clamp(gripLoss*2,0,1):1);
    const locked=state.handbrakeActive && rear?clamp((speed-.7)/3,0,1):0;
    const axleSlip=(rear?state.rearWheelSlip:state.frontWheelSlip)??state.wheelSlip??0;
    const spin=(!state.handbrakeActive || !rear)?clamp((axleSlip-.28)*2,0,1)*(state.engineLoad??0):0;
    // Braking alone does not imply a locked wheel. Only actual sliding,
    // powered spin or the locked handbrake tyres leave marks.
    return Math.max(slide,locked,spin);
  }
  function footprint(state,contact,intensity,time) {
    const hit=contact.hit,n=hit.normal??{x:0,y:1,z:0},surface=hit.surface??'tarmac';
    const rx=Math.cos(state.yaw),rz=-Math.sin(state.yaw),dot=rx*n.x+rz*n.z;
    let x=rx-dot*n.x,y=-dot*n.y,z=rz-dot*n.z;
    const length=Math.hypot(x,y,z)||1,half=.12*(state.scale??.5);
    x*=half/length;y*=half/length;z*=half/length;
    const p={x:hit.x+n.x*.006,y:hit.y+n.y*.006,z:hit.z+n.z*.006};
    return {p,n,surface,intensity,time,left:{x:p.x-x,y:p.y-y,z:p.z-z},right:{x:p.x+x,y:p.y+y,z:p.z+z}};
  }
  function createPool(options={}) {
    const capacity=options.capacity??4096,lifetime=options.lifetime??36;
    if(!Number.isInteger(capacity)||capacity<1||!Number.isFinite(lifetime)||lifetime<=0)throw Error('Invalid tyre mark limits.');
    const records=new Array(capacity);
    // Share a bounded mark buffer and fade clock, but never join tyre trails
    // between different cars. Weak keys also release replaced race vehicles.
    let head=0,count=0,time=0,total=0,enabled=true,trailsByCar=new WeakMap();
    function breakTrails(state){if(state)trailsByCar.delete(state);else trailsByCar=new WeakMap();}
    function clear(){records.fill(undefined);head=count=total=0;breakTrails();options.onClear?.();}
    function step(state,dt,support,advanceTime=true) {
      if(!Number.isFinite(dt)||dt<=0)return;
      if(advanceTime){time+=dt;options.onTime?.(time);}
      if(!enabled){trailsByCar.delete(state);return;}
      let trails=trailsByCar.get(state);
      if(!trails){trails=new Map();trailsByCar.set(state,trails);}
      const present=new Set();
      for(const contact of state.contacts??[]) {
        present.add(contact.name);
        const intensity=slip(state,contact);
        if(intensity<.08){trails.delete(contact.name);continue;}
        const current=footprint(state,contact,intensity,time),previous=trails.get(contact.name);
        if(!previous){trails.set(contact.name,current);continue;}
        const distance=Math.hypot(current.p.x-previous.p.x,current.p.y-previous.p.y,current.p.z-previous.p.z);
        const aligned=current.n.x*previous.n.x+current.n.y*previous.n.y+current.n.z*previous.n.z;
        if(distance>Math.max(.8,2*(state.scale??.5)) || aligned<.82 || current.surface!==previous.surface) {
          trails.set(contact.name,current);continue;
        }
        // Spacing also bounds stationary burnouts: no repeated zero-length quads.
        if(distance<Math.max(.055,.18*(state.scale??.5)))continue;
        // Only emitted ribbons need these local grid queries. Check both tyre
        // edges and the join so marks cannot bridge a gap or hang off a kerb.
        if(support) {
          const middle={x:(current.p.x+previous.p.x)/2,y:(current.p.y+previous.p.y)/2,z:(current.p.z+previous.p.z)/2};
          const valid=[previous.left,previous.right,current.left,current.right,middle].every(p=>{
            const hit=support(p.x,p.z,p.y+.035,p.y-.045);
            return hit && (hit.surface??'tarmac')===current.surface;
          });
          if(!valid){trails.set(contact.name,current);continue;}
        }
        const record={from:previous,to:current,born:time,wheel:contact.name};
        records[head]=record;options.onSegment?.(record,head);
        head=(head+1)%capacity;count=Math.min(capacity,count+1);total++;
        trails.set(contact.name,current);
      }
      for(const name of trails.keys())if(!present.has(name))trails.delete(name);
    }
    return {step,clear,breakTrails,records,capacity,lifetime,
      setEnabled(value){enabled=!!value;breakTrails();},
      get enabled(){return enabled;},get time(){return time;},get count(){return count;},get total(){return total;},
      opacity(record){const t=clamp((time-record.born-lifetime*.65)/(lifetime*.35),0,1);return 1-t*t*(3-2*t);}};
  }
  function create(scene,options={}) {
    const capacity=options.capacity??4096,vertices=18;
    const geometry=new THREE.BufferGeometry();
    const position=new THREE.Float32BufferAttribute(new Float32Array(capacity*vertices*3),3);
    const colour=new THREE.Float32BufferAttribute(new Float32Array(capacity*vertices*4),4);
    const birth=new THREE.Float32BufferAttribute(new Float32Array(capacity*vertices),1);
    for(const attr of [position,colour,birth])attr.setUsage?.(THREE.DynamicDrawUsage);
    geometry.setAttribute('position',position);geometry.setAttribute('color',colour);geometry.setAttribute('markBirth',birth);
    geometry.setDrawRange(0,0);
    const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,
      toneMapped:false,alphaTest:.005,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const clock={value:0},life={value:options.lifetime??36};
    material.onBeforeCompile=shader=>{
      shader.uniforms.markTime=clock;shader.uniforms.markLife=life;
      shader.vertexShader='attribute float markBirth; varying float markAge; uniform float markTime;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nmarkAge = markTime - markBirth;');
      shader.fragmentShader='varying float markAge; uniform float markLife;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(markLife * 0.65, markLife, markAge);');
    };
    const mesh=new THREE.Mesh(geometry,material);mesh.name='Tyre marks';mesh.frustumCulled=false;mesh.renderOrder=2;scene.add(mesh);
    const point=(frame,t)=>({x:frame.left.x+(frame.right.x-frame.left.x)*t,y:frame.left.y+(frame.right.y-frame.left.y)*t,z:frame.left.z+(frame.right.z-frame.left.z)*t});
    let drawn=0,dirtyStart=Infinity,dirtyEnd=0;
    const pool=createPool({...options,capacity,onTime:time=>{clock.value=time;},onClear:()=>{drawn=0;geometry.setDrawRange(0,0);},onSegment:(record,index)=>{
      const style=STYLES[record.to.surface]??STYLES.tarmac,hex=style.colour,r=(hex>>16&255)/255,g=(hex>>8&255)/255,b=(hex&255)/255;
      const stops=[0,.18,.82,1],alphas=[0,1,1,0];let vertex=index*vertices;
      for(let band=0;band<3;band++) {
        const corners=[[record.from,band],[record.to,band],[record.to,band+1],[record.from,band],[record.to,band+1],[record.from,band+1]];
        for(const [frame,edge] of corners){const p=point(frame,stops[edge]),v=vertex++;
          position.array.set([p.x,p.y,p.z],v*3);colour.array.set([r,g,b,alphas[edge]*style.opacity*frame.intensity],v*4);birth.array[v]=record.born;}
      }
      dirtyStart=Math.min(dirtyStart,index*vertices);dirtyEnd=Math.max(dirtyEnd,(index+1)*vertices);
      drawn=Math.max(drawn,index+1);geometry.setDrawRange(0,drawn*vertices);
    }});
    return {pool,mesh,clear:pool.clear,breakTrails:pool.breakTrails,step:pool.step,
      flush(){if(dirtyEnd>dirtyStart){for(const attr of [position,colour,birth]){
        attr.updateRange={offset:dirtyStart*attr.itemSize,count:(dirtyEnd-dirtyStart)*attr.itemSize};attr.needsUpdate=true;
      }dirtyStart=Infinity;dirtyEnd=0;}},
      setVisible(value){mesh.visible=!!value;pool.setEnabled(value);},dispose(){scene.remove(mesh);geometry.dispose();material.dispose();}};
  }
  window.TrackSkids={STYLES,slip,createPool,create};
})();
