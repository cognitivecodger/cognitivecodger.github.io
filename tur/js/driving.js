/* Test-drive controls, model and camera. Simulation lives in vehicle.js. */
(function () {
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),rad=Math.PI/180;
  const numeric=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  const VIEWS=Object.freeze({
    overview:{x:12,y:19,z:13,ahead:0,span:24,tracking:'follow'},
    chase:{x:0,y:6,z:-11,ahead:3,span:12,tracking:'turn'},
    top:{x:0,y:26,z:0,ahead:0,span:24,tracking:'follow',vertical:true},
    topChase:{x:0,y:26,z:-7,ahead:3,span:25,tracking:'turn'}
  });
  function defaultTuning(view='overview') {
    const v=VIEWS[view]??VIEWS.overview;
    return {tilt:Math.atan2(v.y,Math.hypot(v.x,v.z))/rad,distance:Math.hypot(v.x,v.y,v.z),orbit:0,ahead:v.ahead,side:0,smooth:50};
  }
  function cameraFrame(state,view='overview',heading=0,zoom=1,tuning={}) {
    const v=VIEWS[view]??VIEWS.overview,defaults=defaultTuning(view),orbit=(tuning.orbit??0)*rad;
    const angle=v.vertical?Math.PI/2:clamp(tuning.tilt??defaults.tilt,15,85)*rad;
    const distance=(tuning.distance??defaults.distance)/zoom,azimuth=heading+Math.atan2(v.x,v.z)+orbit;
    const horizontal=v.vertical?0:Math.cos(angle)*distance,aim=tuning.aimHeading??heading,c=Math.cos(aim),s=Math.sin(aim);
    return {position:{x:state.x+Math.sin(azimuth)*horizontal,y:state.y+Math.sin(angle)*distance,z:state.z+Math.cos(azimuth)*horizontal},
      target:{x:state.x+s*(tuning.ahead??v.ahead)-c*(tuning.side??0),y:state.y+.25,z:state.z+c*(tuning.ahead??v.ahead)+s*(tuning.side??0)},
      up:v.vertical?{x:Math.sin(heading+orbit),y:0,z:Math.cos(heading+orbit)}:{x:0,y:1,z:0}};
  }
  // Standard Gamepad layout: https://www.w3.org/TR/gamepad/#remapping
  function gamepadInput(pad) {
    if(!pad || pad.connected===false || pad.mapping!=='standard')return null;
    const axis=i=>clamp(numeric(pad.axes?.[i],0),-1,1),button=i=>clamp(numeric(pad.buttons?.[i]?.value,pad.buttons?.[i]?.pressed?1:0),0,1);
    const dead=value=>Math.abs(value)<=.16?0:Math.sign(value)*(Math.abs(value)-.16)/.84;
    const x=axis(2),y=axis(3),length=Math.hypot(x,y),magnitude=clamp((length-.16)/.84,0,1);
    const buttons=Array.from({length:17},(_,i)=>button(i)>.5);
    return {steer:dead(axis(0)),throttle:Math.max(0,(button(7)-.05)/.95)-Math.max(0,(button(6)-.05)/.95),brake:buttons[0],
      orbitX:length?x/length*magnitude:0,orbitY:length?y/length*magnitude:0,buttons,
      neutral:Math.abs(axis(0))<=.16 && length<=.16 && !Array.from({length:17},(_,i)=>button(i)>.1).some(Boolean)};
  }
  // Shared by the race and garage so both views always use the same model.
  const CAR_BODIES=Object.freeze({basic:'Basic car',wedge:'Wedge GT',compact:'Compact hatch'});
  const carBody=value=>Object.hasOwn(CAR_BODIES,value)?value:'basic';
  function createCarModel(colour=0xec963f,style='basic') {
    style=carBody(style);
    const wheels=[],group=new THREE.Group();group.name='Test car';
    const body=new THREE.MeshLambertMaterial({color:colour}),glass=new THREE.MeshLambertMaterial({color:0x244753}),dark=new THREE.MeshLambertMaterial({color:0x18222b}),metal=new THREE.MeshLambertMaterial({color:0x9facb3});
    const lamp=new THREE.MeshBasicMaterial({color:0xffe8a0}),tail=new THREE.MeshLambertMaterial({color:0x901a16,emissive:0xe01912,emissiveIntensity:.4});
    const box=(w,h,d,x,y,z,material)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
    // A low-poly tapered prism: front is positive Z, shared with the lights and wheels.
    const tapered=(bottom,top,yBottom,yTop,zBack,zFront,topBack,topFront,material,frontHeight=yTop)=>{
      const p=[[-bottom,yBottom,zBack],[bottom,yBottom,zBack],[bottom,yBottom,zFront],[-bottom,yBottom,zFront],[-top,yTop,topBack],[top,yTop,topBack],[top,frontHeight,topFront],[-top,frontHeight,topFront]];
      const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],vertices=[];
      for(const [a,b,c,d] of faces)for(const i of [a,c,b,a,d,c])vertices.push(...p[i]);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
    };
    if(style==='wedge'){
      tapered(.86,.80,-.19,.23,-1.73,1.73,-1.68,1.57,body,.06);
      tapered(.68,.49,.20,.62,-.96,.72,-.63,.12,glass);
      box(1.02,.07,.66,0,.64,-.25,body);
      box(1.47,.07,.21,0,.24,-1.44,dark);
      for(const x of [-.68,.68])box(.14,.20,.45,x,.15,-1.35,body);
      for(const x of [-.86,.86])box(.035,.14,.65,x,.03,-.79,dark);
    }else if(style==='compact'){
      box(1.65,.49,3.36,0,.04,0,body);
      tapered(.70,.61,.28,.87,-1.22,.84,-1.02,.51,glass);
      box(1.25,.09,1.60,0,.89,-.25,metal);
      box(1.38,.15,.18,0,.31,1.51,body);
      box(.78,.12,.08,0,.05,1.77,dark);
    }else{
      box(1.72,.4,3.5,0,.01,0,body);box(1.34,.5,1.45,0,.43,-.15,glass);box(1.45,.09,1.4,0,.72,-.15,body);
    }
    box(1.66,.13,.12,0,-.06,1.78,metal);box(1.66,.13,.12,0,-.06,-1.78,dark);
    for(const x of [-.55,.55]){
      if(style==='compact'){
        const headlight=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.08,12),lamp);headlight.rotation.x=Math.PI/2;headlight.position.set(x,.12,1.72);group.add(headlight);
      }else box(.32,.12,.08,x,.08,1.79,lamp);
      box(.3,.11,.08,x,.08,-1.79,tail);
    }
    for(const corner of TrackVehicle.CORNERS) {
      const pivot=new THREE.Group(),spin=new THREE.Group();pivot.position.set(Math.sign(corner.x)*.93,-.36,corner.z);pivot.add(spin);group.add(pivot);
      for(const [radius,width,material] of [[.29,.24,dark],[.15,.25,metal]]){
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,12),material);wheel.rotation.z=Math.PI/2;wheel.castShadow=true;spin.add(wheel);
      }
      wheels.push({pivot,spin,front:corner.z>0});
    }
    group.rotation.order='YXZ';return {group,wheels,bodyMaterial:body,tailMaterial:tail};
  }
  function create(host) {
    const $=id=>document.getElementById(id),keys=new Set();
    const tyreMarks=TrackSkids.create(host.scene);
    tyreMarks.setVisible($('showSkids').checked);
    function showTyreMarks(id) {
      const value=$(id).checked;
      for(const control of ['showSkids','driveShowSkids'])$(control).checked=value;
      tyreMarks.setVisible(value);
    }
    for(const id of ['showSkids','driveShowSkids'])$(id).addEventListener('change',()=>showTyreMarks(id));
    for(const id of ['clearSkids','driveClearSkids'])$(id).addEventListener('click',()=>{tyreMarks.clear();host.canvas.focus?.();});
    let sim=null,car=null,probes=null,driveCamera=null,race=null,rival=null,spawnPosition=null,gridSlot=1,raceDirection=1,paused=false,active=false,workshop=false,workshopDirection=1,workshopPrevious=null,freeFocus=null,freeCamera=false,smoothPosition=null,smoothFocus=null,smoothHeading=null,parkedPosition=null,wheelViews=[];
    let compactRace=false,soloTimed=false,soloCountdown=0,soloElapsed=0,lastQuickStandings='',quickPauseIndex=0;
    let soloFinishTime=null,soloStartLap=0,sessionBestLap=null,sessionBestRace=null,quickTimingRows=[],quickTimingShape='',lastCountdownCue=null;
    let lastQuickResults='',raceStopTime=0,raceParked=false,championshipReported=false;
    const quickPauseItems=['quickResume','quickSettings','quickStatsFps','quickStatsTriangles','quickStatsRoute','quickRestart','quickExit'];
    let projectionKind=null,fixedHeading=0,lastResets=0,carScale=.5,zoomPercent=100,tuning=defaultTuning();
    let smoothHeight=null,smoothAim=null,smoothLead=0,savedCamera=null,padIndex=null,padArmed=false,padButtons=[],focused=true;
    let controllerEnabled=true,controllerRate=60;
    let vehicleBuild=TrackVehicle.resolveBuild(),vehicleColour=0xec963f,vehicleBody='basic';
    let soundEnabled=true,soundVolume=.35,tyresEnabled=true,tyreVolume=.65,rivalsSoundEnabled=true,checkpointSound='speech';
    try{const preference=JSON.parse(window.localStorage.getItem('trackshift.engineAudio.v1'));if(preference?.version===1){soundEnabled=preference.enabled!==false;if(Number.isFinite(preference.volume))soundVolume=clamp(preference.volume,0,1);tyresEnabled=preference.tyres!==false;if(Number.isFinite(preference.tyreVolume))tyreVolume=clamp(preference.tyreVolume,0,1);rivalsSoundEnabled=preference.rivals!==false;checkpointSound=preference.checkpoint==='beep'?'beep':'speech';}}catch(error){}
    const engineSound=TrackAudio.create({enabled:soundEnabled,tyresEnabled,rivalsEnabled:rivalsSoundEnabled,checkpointMode:checkpointSound,onStatus:value=>{for(const prefix of ['editor','drive'])$(prefix+'EngineSoundStatus').textContent=value;}});engineSound.setVolume(soundVolume);engineSound.setTyreVolume(tyreVolume);
    try {
      const preference=JSON.parse(window.localStorage.getItem('trackshift.controller.v1'));
      if(preference?.version===1){controllerEnabled=preference.enabled!==false;controllerRate=preference.rate===30?30:60;}
    }catch(error){}
    const padReader=TrackController.createReader(()=>{
      if(typeof navigator.getGamepads!=='function')throw Error('Gamepad API unavailable');
      return navigator.getGamepads();
    },controllerRate);
    const dispose=object=>{if(!object)return;const geometries=new Set(),materials=new Set();object.traverse(part=>{if(part.geometry)geometries.add(part.geometry);if(part.material)materials.add(part.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());if(object.parent)object.parent.remove(object);};
    function makeCar(colour=vehicleColour,style=vehicleBody) {
      const model=createCarModel(colour,style);
      if(host.nightRace?.()){
        // Place lights at each lamp; they follow the chassis over slopes and
        // banks. Avoid shadow maps to limit the cost of a full field at night.
        const headlights=[],rear=[];
        for(const x of [-.55,.55]){
          const beam=new THREE.SpotLight(0xffedc9,4.5,24,.23,.5,1.4),target=new THREE.Object3D();
          beam.name='Headlight beam';beam.position.set(x,.12,1.85);target.position.set(Math.sign(x)*2.4,-2,18);beam.target=target;
          const tailLight=new THREE.PointLight(0xff2211,.35,4,1.5);tailLight.name='Tail light glow';tailLight.position.set(x,.1,-1.95);
          model.group.add(beam,target,tailLight);headlights.push(beam);rear.push(tailLight);
        }
        model.group.nightLights={headlights,rear,tail:model.tailMaterial};
      }
      return model;
    }
    function makeProbes() {
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(24),3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(24),3));
      const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,depthTest:false}));lines.frustumCulled=false;lines.renderOrder=30;return lines;
    }
    const view=()=>VIEWS[$('driveCamera').value]??VIEWS.overview;
    const zoomValue=()=>zoomPercent/100;
    function clearCamera() {smoothPosition=null;smoothFocus=null;smoothHeading=null;parkedPosition=null;smoothHeight=null;smoothAim=null;smoothLead=0;}
    function disarmPad() {padArmed=false;padButtons=[];}
    function syncTuning() {
      for(const [key,id,unit] of [['tilt','driveTilt','°'],['distance','driveDistance',' m'],['orbit','driveOrbit','°'],['ahead','driveAhead',' m'],['side','driveSide',' m'],['smooth','driveSmooth','%']]) {
        $(id).value=String(tuning[key]);$(id+'Value').textContent=(key==='distance'||key==='ahead'||key==='side'?tuning[key].toFixed(1):Math.round(tuning[key]))+unit;
      }
      $('driveTilt').disabled=!!view().vertical;
      if(view().vertical)$('driveTiltValue').textContent='90° (vertical)';
    }
    function resize() {
      if(!driveCamera)return;const aspect=window.innerWidth/Math.max(1,window.innerHeight);driveCamera.aspect=aspect;
      if(projectionKind==='orthographic'){const half=view().span/zoomValue()/2;driveCamera.left=-half*aspect;driveCamera.right=half*aspect;driveCamera.top=half;driveCamera.bottom=-half;}
      driveCamera.updateProjectionMatrix();
    }
    function ensureCamera() {
      const kind=$('driveProjection').value==='orthographic'?'orthographic':'perspective';
      if(!driveCamera || projectionKind!==kind){driveCamera=kind==='orthographic'?new THREE.OrthographicCamera(-1,1,1,-1,.15,2000):new THREE.PerspectiveCamera(48,1,.15,2000);projectionKind=kind;}
      resize();
    }
    function updateCamera(dt,snap=false) {
      if(!sim || !driveCamera)return;
      const watching=(workshop || $('aiDiagnostics').open && $('aiDiagnosticWatch').checked)?selectedDiagnostic():null;
      const watched=watching?.sim.state??sim.state,s=workshop && freeCamera && freeFocus?{...watched,...freeFocus,yaw:0,vx:0,vz:0}:watched,chosen=$('driveTracking').value||'follow',tracking=workshop && freeCamera?'follow':watching && chosen==='fixed'?'follow':chosen,desiredHeading=tracking==='turn'?s.yaw:fixedHeading;
      const amount=clamp(tuning.smooth/100,0,1),time=clamp(dt,0,.1),rate=2+14*(1-amount)**2;
      const blend=snap || amount===0?1:1-Math.exp(-time*rate),verticalBlend=snap || amount===0?1:1-Math.exp(-time*(1.5+10*(1-amount)**2));
      if(smoothHeading===null || snap)smoothHeading=desiredHeading;
      else smoothHeading+=Math.atan2(Math.sin(desiredHeading-smoothHeading),Math.cos(desiredHeading-smoothHeading))*blend;
      if(smoothHeight===null || snap)smoothHeight=s.y;else smoothHeight+=(s.y-smoothHeight)*verticalBlend;
      // Fixed-direction follow keeps a world-relative aim; turning the car or
      // changing speed must not rotate the camera behind the player's back.
      const desiredAim=tracking==='follow'?fixedHeading:s.yaw;
      if(smoothAim===null || snap || tracking==='follow')smoothAim=desiredAim;else smoothAim+=Math.atan2(Math.sin(desiredAim-smoothAim),Math.cos(desiredAim-smoothAim))*blend;
      const speed=s.vx*Math.sin(s.yaw)+s.vz*Math.cos(s.yaw),lead=tracking!=='follow' && $('driveSpeedLook').checked?clamp(speed*.35,-6,10):0;
      if(tracking==='follow')smoothLead=0;
      smoothLead+=(lead-smoothLead)*(snap?1:1-Math.exp(-time*4));
      const frame=cameraFrame({...s,y:smoothHeight},$('driveCamera').value||'overview',smoothHeading,zoomValue(),{...tuning,ahead:tuning.ahead+smoothLead,aimHeading:smoothAim}),target=frame.target;
      if(tracking==='fixed' && !parkedPosition)parkedPosition={...frame.position};
      const desired=tracking==='fixed'?parkedPosition:frame.position;
      if(!smoothPosition)smoothPosition={...desired};
      if(!smoothFocus)smoothFocus={...target};
      // Translate position and focus together in fixed-direction follow. If
      // they smooth separately, movement or zoom can temporarily twist the view.
      for(const axis of ['x','y','z']){const b=axis==='y'?1:blend;smoothPosition[axis]+=(desired[axis]-smoothPosition[axis])*b;
        if(tracking==='follow')smoothFocus[axis]=smoothPosition[axis]+target[axis]-desired[axis];
        else smoothFocus[axis]+=(target[axis]-smoothFocus[axis])*b;}
      driveCamera.position.set(smoothPosition.x,smoothPosition.y,smoothPosition.z);driveCamera.up.set(frame.up.x,frame.up.y,frame.up.z);
      driveCamera.lookAt(new THREE.Vector3(smoothFocus.x,smoothFocus.y,smoothFocus.z));
      const marker=$('carLocator');marker.hidden=!$('driveMarker').checked;
      if(!marker.hidden) {
        driveCamera.updateMatrixWorld();
        const point=new THREE.Vector3(s.x,s.y+.8*s.scale,s.z).project(driveCamera),front=new THREE.Vector3(s.x+Math.sin(s.yaw),s.y+.8*s.scale,s.z+Math.cos(s.yaw)).project(driveCamera);
        marker.hidden=point.z< -1 || point.z>1 || Math.abs(point.x)>1 || Math.abs(point.y)>1;
        marker.style.left=(point.x+1)*window.innerWidth/2+'px';marker.style.top=(1-point.y)*window.innerHeight/2+'px';
        marker.style.transform=`rotate(${Math.atan2(front.x-point.x,front.y-point.y)}rad)`;
      }
    }
    function buildMenu(id,items,custom=false) {
      const choices=items.map(item=>{const option=document.createElement('option');option.value=item.id;option.textContent=item.label;return option;});
      if(custom){const option=document.createElement('option');option.value='custom';option.textContent='Custom mix';option.disabled=true;choices.push(option);}
      $(id).replaceChildren(...choices);
    }
    function syncBuild() {
      const b=vehicleBuild,summary=`${b.label} · ${b.drivetrain.shortLabel} · ${Math.round(b.engine.maxSpeed*3.6)} km/h limit · ${Math.round(b.engine.acceleration*10)}% engine pull · ${b.steering.label} steering · ${b.assist.label} assist. ${b.preset?.description??'Your chosen engine, tyres, drive, suspension and steering.'}`;
      const parts=`${b.engine.label} engine: ${b.engine.description} ${b.tyres.label} tyres: ${b.tyres.description} ${b.drivetrain.label}: ${b.drivetrain.description} ${b.suspension.label} suspension: ${b.suspension.description} ${b.steering.label} steering: ${b.steering.description} Assist ${b.assist.label}: ${b.assist.description}`;
      for(const prefix of ['vehicle','driveVehicle']) {
        $(prefix+'Preset').value=b.preset?.id??'custom';
        for(const part of ['Engine','Tyres','Drivetrain','Suspension','Steering','Assist'])$(prefix+part).value=b[part.toLowerCase()].id;
        $(prefix+'Summary').textContent=summary;$(prefix+'PartsSummary').textContent=parts;
      }
    }
    function changeBuild(selection) {
      if(active && raceOver() && host.championshipRace?.()){syncBuild();host.message('Continue from the championship results first.');return false;}
      try {
        const candidate=TrackVehicle.resolveBuild(selection);
        if(['engine','tyres','drivetrain','suspension','steering','assist'].every(part=>candidate[part].id===vehicleBuild[part].id)){syncBuild();return true;}
        // Build and validate a fresh attempt before committing the chosen parts.
        // Completed times must never be compared across different vehicle setups.
        let next,nextRace,position,nextRival;
        if(active) {
          const track=host.getTrack();nextRace=createPlayerTrial(race.course);
          position=spawnPosition.slot?TrackRace.spawn(track.runtime,nextRace.course,carScale,currentGridSlot()):spawnPosition;
          next=simulation(sim.world,track.runtime,position,carScale,nextRace,candidate);
          if(rival)nextRival=prepareRival(sim.world,track.runtime,nextRace.course,carScale,currentGridSlot(),rival.laps,rival.difficulty,rival.opponents.length);
        }
        vehicleBuild=candidate;syncBuild();host.buildChanged?.(candidate);
        if(next){sim=next;race=nextRace;spawnPosition=position;if(nextRival)adoptRival(nextRival);if(soloTimed){soloCountdown=3;soloElapsed=0;soloFinishTime=null;soloStartLap=0;}resetRaceEnd();keys.clear();disarmPad();padReader.reset();clearCamera();renderCar(0,true);}
        if(active)host.canvas.focus?.();
        host.message(`${vehicleBuild.label} vehicle setup selected.${active?' Restarted with a new timing session.':''}`);return true;
      }catch(error){syncBuild();host.message(`Could not change vehicle setup: ${error.message}`,true);return false;}
    }
    function syncSize() {
      const size=TrackVehicle.dimensions(carScale),percent=Math.round(carScale*100),label=`Width ${size.width.toFixed(2)} m · Length ${size.length.toFixed(2)} m`;
      for(const id of ['carScale','driveScale']){$(id).value=String(percent);$(id+'Value').textContent=`${percent}%`;}
      $('carDimensions').textContent=label;$('driveDimensions').textContent=label;
    }
    function changeSize(percent) {
      if(active && raceOver() && host.championshipRace?.()){syncSize();host.message('Continue from the championship results first.');return false;}
      try {
        const scale=Number(percent)/100;TrackVehicle.dimensions(scale);
        // Reuse the collision world; validate a replacement before changing the
        // active simulation or model. Every comparison starts at the same section.
        const nextRace=active?createPlayerTrial(race.course):null;
        const runtime=active?host.getTrack().runtime:null;
        const position=active && spawnPosition.slot?TrackRace.spawn(runtime,nextRace.course,scale,currentGridSlot()):spawnPosition;
        const next=active?simulation(sim.world,runtime,position,scale,nextRace):null;
        const nextRival=active && rival?prepareRival(sim.world,runtime,nextRace.course,scale,currentGridSlot(),rival.laps,rival.difficulty,rival.opponents.length):null;
        carScale=scale;syncSize();
        if(next){sim=next;race=nextRace;spawnPosition=position;car.scale.set(scale,scale,scale);if(nextRival)adoptRival(nextRival,scale);if(soloTimed){soloCountdown=3;soloElapsed=0;soloFinishTime=null;soloStartLap=0;}resetRaceEnd();keys.clear();disarmPad();clearCamera();renderCar(0,true);}
        return true;
      }catch(error){syncSize();host.message(`Could not change car size: ${error.message}`,true);return false;}
    }
    function configureView(resetZoom=false) {
      tuning=defaultTuning($('driveCamera').value);syncTuning();$('drivePreset').value=resetZoom?'view':'custom';
      $('driveTracking').value=view().tracking;fixedHeading=view().tracking==='turn'?(sim?.state.yaw??0):0;
      if(resetZoom){$('driveSpeedLook').checked=false;$('driveMarker').checked=false;changeZoom(100);}
      clearCamera();if(active){ensureCamera();updateCamera(0,true);}host.canvas.focus?.();
    }
    function changeZoom(percent,snap=true) {
      zoomPercent=clamp(numeric(percent,100),20,250);$('driveZoom').value=String(Math.round(zoomPercent));$('driveZoomValue').textContent=`${Math.round(zoomPercent)}%`;
      if(active){resize();if(snap){parkedPosition=null;smoothPosition=null;updateCamera(0,true);}}
    }
    function recenter() {
      tuning.orbit=0;tuning.tilt=defaultTuning($('driveCamera').value).tilt;syncTuning();clearCamera();
      $('drivePreset').value='custom';if(active)updateCamera(0,true);host.canvas.focus?.();
    }
    function setup() {
      return {version:1,view:$('driveCamera').value,projection:$('driveProjection').value,tracking:$('driveTracking').value,heading:fixedHeading,zoom:zoomPercent,
        ...tuning,speedLook:$('driveSpeedLook').checked,marker:$('driveMarker').checked};
    }
    function validSetup(value) {
      if(!value || value.version!==1 || !Object.hasOwn(VIEWS,value.view) || !['perspective','orthographic'].includes(value.projection) || !['follow','turn','fixed'].includes(value.tracking))return null;
      const limits={zoom:[20,250],tilt:[15,85],distance:[6,80],orbit:[-180,180],ahead:[-12,20],side:[-12,12],smooth:[0,100]},result={version:1,view:value.view,projection:value.projection,tracking:value.tracking};
      for(const [key,[min,max]] of Object.entries(limits)){if(!Number.isFinite(value[key]))return null;result[key]=clamp(value[key],min,max);}
      result.heading=Number.isFinite(value.heading)?Math.atan2(Math.sin(value.heading),Math.cos(value.heading)):0;
      result.speedLook=value.speedLook===true;result.marker=value.marker===true;return result;
    }
    function applySetup(value) {
      const next=validSetup(value);if(!next)return;
      $('driveCamera').value=next.view;$('driveProjection').value=next.projection;$('driveTracking').value=next.tracking;
      for(const key of Object.keys(tuning))tuning[key]=next[key];
      $('driveSpeedLook').checked=next.speedLook;$('driveMarker').checked=next.marker;syncTuning();
      fixedHeading=next.tracking==='turn'?(sim?.state.yaw??0):next.heading;clearCamera();if(active)ensureCamera();changeZoom(next.zoom);
      host.canvas.focus?.();
    }
    function preset() {
      const name=$('drivePreset').value;
      if(name==='view'){configureView(true);return;}
      if(name==='saved'){applySetup(savedCamera);return;}
      const presets={arcade:{view:'overview',projection:'orthographic',tracking:'follow',zoom:65,tilt:60,distance:28,ahead:4,speedLook:true},
        wide:{view:'overview',projection:'orthographic',tracking:'follow',zoom:25,tilt:65,distance:30,ahead:2,marker:true},
        low:{view:'chase',projection:'perspective',tracking:'turn',zoom:110,tilt:22,distance:15,ahead:4,speedLook:true}};
      if(presets[name])applySetup({version:1,orbit:0,side:0,smooth:50,speedLook:false,marker:false,...presets[name]});
    }
    function saveSetup() {
      savedCamera=setup();$('savedCameraOption').disabled=false;$('drivePreset').value='saved';
      try {window.localStorage.setItem('trackshift.camera.v1',JSON.stringify(savedCamera));$('cameraSaveStatus').textContent='Camera saved in this browser.';}
      catch(error){$('cameraSaveStatus').textContent='Camera saved for this session. Browser storage is unavailable.';}
      host.canvas.focus?.();
    }
    function controllerMessage(value) {if($('controllerStatus').textContent!==value)$('controllerStatus').textContent=value;}
    function controller(dt) {
      const empty={throttle:0,steer:0,brake:false};
      if(!controllerEnabled){padIndex=null;disarmPad();padReader.reset();controllerMessage('Controller input off · keyboard and mouse available.');return empty;}
      const editing=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      // Do not enter the browser's controller API from background/hidden pages
      // or while editing a field. Re-entry always requires a fresh neutral sample.
      if(!focused || document.hidden || editing){disarmPad();padReader.reset();return empty;}
      const sample=padReader.sample(dt),pads=sample.pads;
      if(sample.error){if(padIndex!==null && !paused)setPaused(true);padIndex=null;controllerMessage('Controller access unavailable here. Try localhost in a desktop browser.');disarmPad();return empty;}
      const previous=padIndex,pad=pads.find(p=>p?.connected!==false && p?.mapping==='standard' && p.index===padIndex)??pads.find(p=>p?.connected!==false && p?.mapping==='standard');
      if(previous!==null && (!pad || pad.index!==previous)) {padIndex=null;disarmPad();if(!paused)setPaused(true);controllerMessage('Controller input lost · driving paused.');return empty;}
      if(!pad){controllerMessage(pads.some(p=>p?.connected!==false && p)?'Controller layout not recognised. Standard mapping required.':'Connect a controller and press a button.');return empty;}
      if(padIndex!==pad.index){padIndex=pad.index;disarmPad();}
      const input=gamepadInput(pad);
      if(!padArmed){if(input.neutral)padArmed=true;else{controllerMessage('Release sticks, triggers and buttons to enable controller.');return empty;}}
      controllerMessage('Controller ready · Xbox-style mapping');
      const previousButtons=padButtons,pressed=i=>input.buttons[i] && !previousButtons[i];padButtons=input.buttons.slice();
      if(pressed(3)){stop();return empty;}
      if(pressed(9)){setPaused(!paused);return empty;}
      if(compactRace && paused){
        if(pressed(12)||pressed(13)){selectQuickPause(quickPauseIndex+(pressed(13)?1:-1));return empty;}
        if(pressed(0)){activateQuickPause();return empty;}
      }
      if(raceOver() && !paused && host.championshipRace?.() && pressed(0)){host.championshipNext?.();return empty;}
      if(raceOver() && !paused && pressed(1)){stop();return empty;}
      if(pressed(8) && !raceOver()){recover();return empty;}
      if(pressed(2) && !(raceOver() && host.championshipRace?.())){reset();return empty;}
      if(pressed(11))recenter();
      const time=clamp(dt,0,.1);
      if(input.orbitX || input.orbitY || input.buttons.slice(12,16).some(Boolean)) {
        tuning.orbit=((tuning.orbit+input.orbitX*100*time+540)%360)-180;
        if(!view().vertical)tuning.tilt=clamp(tuning.tilt-input.orbitY*55*time,15,85);
        tuning.ahead=clamp(tuning.ahead+((input.buttons[12]?1:0)-(input.buttons[13]?1:0))*6*time,-12,20);
        tuning.side=clamp(tuning.side+((input.buttons[15]?1:0)-(input.buttons[14]?1:0))*6*time,-12,12);
        syncTuning();$('drivePreset').value='custom';parkedPosition=null;
      }
      const zoom=(input.buttons[5]?1:0)-(input.buttons[4]?1:0);if(zoom){changeZoom(zoomPercent*Math.exp(zoom*time),false);$('drivePreset').value='custom';parkedPosition=null;}
      return input;
    }
    function renderModel(model,wheels,vehicle){
      const s=vehicle.state;model.position.set(s.x,s.y,s.z);model.rotation.y=s.yaw;model.rotation.x=-s.pitch;model.rotation.z=s.roll;
      if(model.nightLights){const braking=clamp(Math.max(s.brakeDemand||0,s.handbrakeActive?1:0),0,1);for(const light of model.nightLights.rear)light.intensity=.35+1.15*braking;model.nightLights.tail.emissiveIntensity=.4+2*braking;}
      wheels.forEach((view,i)=>{const length=s.contacts[i]?.length??vehicle.size.maxLength;
        view.pivot.position.y=-(Math.max(vehicle.size.wheelRadius,Math.min(vehicle.size.maxLength,length))-vehicle.size.wheelRadius)/s.scale;
        view.pivot.rotation.y=view.front?-s.steering:0;view.spin.rotation.x=s.wheelSpins[TrackVehicle.CORNERS[i].name];});
    }
    function renderCar(dt=0,snap=false) {
      if(!sim || !car)return;const s=sim.state;
      if(s.resets!==lastResets){lastResets=s.resets;clearCamera();snap=true;}
      if(!workshop)renderModel(car,wheelViews,sim);
      if(rival)for(const opponent of rival.opponents)renderModel(opponent.car,opponent.wheels,opponent.sim);
      const p=probes.geometry.attributes.position.array,c=probes.geometry.attributes.color.array;
      s.contacts.forEach((contact,i)=>{
        const a=TrackVehicle.mount(s,TrackVehicle.CORNERS[i]),b=contact.hit??{x:a.x,y:a.y-sim.size.maxLength,z:a.z};
        p.set([a.x,a.y,a.z,b.x,b.y,b.z],i*6);const supported=contact.force>.05;
        c.set(supported?[.3,1,.6,.3,1,.6]:[1,.4,.3,1,.4,.3],i*6);
        $('contact'+contact.name).textContent=contact.name+(supported?' ●':' ○');
      });
      probes.geometry.attributes.position.needsUpdate=true;probes.geometry.attributes.color.needsUpdate=true;probes.visible=$('showSuspension').checked;
      $('driveSpeed').textContent=String(Math.round(Math.hypot(s.vx,s.vz)*3.6));
      $('driveState').textContent=paused?'Paused':s.grounded?`${s.grounded}/4 corners supported`:'Airborne';
      $('driveAngles').textContent=`Pitch ${(s.pitch*180/Math.PI).toFixed(1)}° · Roll ${(s.roll*180/Math.PI).toFixed(1)}°`;
      $('driveImpacts').textContent=`Wall contacts ${s.collisions} · Recoveries ${s.recoveries} · Auto-resets ${s.resets}`;
      const supported=s.contacts.filter(contact=>contact.hit && contact.force>.05),materials=[...new Set(supported.map(contact=>contact.hit.surface??'tarmac'))];
      const names=materials.map(value=>value==='grass'?'grass':TS2.surfaceType(value)?.label??value);
      $('driveSurface').textContent=!supported.length?'Surface · airborne':`Surface · ${names.length>1?'mixed: ':''}${names.join(' / ')}`;
      const section=s.trackPiece===null?'off road':`${s.trackPiece+1}${s.routeValid?'':' (out of sequence)'}`;
      $('driveRoute').textContent=`Track section · ${section} · Recovery ${sim.recoverySection===null?'spawn':sim.recoverySection+1}`;
      renderRace();
      // The workshop follows its selected AI; races always report the player.
      const inspected=workshop?selectedDiagnostic():null,routeSim=inspected?.sim??sim,routeRace=inspected?.trial??race,routeState=routeSim.state;
      const checkpoint=routeRace?.course?.checkpoints?.[routeRace.state.checkpoint];
      let nextLine='No lap markers';
      if(routeRace?.course?.valid){
        const next=!routeRace.state.running && !routeRace.state.finished?routeRace.course.start:checkpoint??routeRace.course.finish;
        const label=!routeRace.state.running && !routeRace.state.finished?'Start':checkpoint?`CP ${checkpoint.number}`:routeRace.course.mode==='lap'?'Start / finish':'Finish';
        nextLine=routeRace.state.finished?'Finished':`${label} - section ${next.pieceIndex+1}`;
      }
      host.performance.setRouteInfo({
        raceRouteContact:routeState.trackPiece===null?(routeState.contacts.some(contact=>contact.hit && contact.force>.05)?'Off road':'Airborne'):`Section ${routeState.trackPiece+1}${routeState.routeValid?'':' - out of sequence'}`,
        raceRouteCursor:Number.isInteger(routeState.routePiece)?`Section ${routeState.routePiece+1}`:'-',
        raceRouteRecovery:routeSim.recoverySection===null?'Starting grid':`Section ${routeSim.recoverySection+1}`,
        raceRouteRejoin:routeState.lastRouteRejoin?`${routeState.lastRouteRejoin.from+1} to ${routeState.lastRouteRejoin.to+1} (${routeState.lastRouteRejoin.kind})`:'None',
        raceRouteCheckpoint:routeRace?.course?.valid?`${routeRace.state.checkpoint} / ${routeRace.course.checkpoints.length}`:'Not timed',
        raceRouteNext:nextLine,
        raceRouteIssue:routeRace?.state?.lastIssue??'None'
      });
      renderDiagnostics();
      if(workshop)renderWorkshop();
      updateCamera(dt,snap);
    }
    function renderRace() {
      if(!race)return;
      const r=race.state,course=race.course;
      const title=rival?(course.mode==='lap'?`AI race \u00b7 ${rival.laps} lap${rival.laps===1?'':'s'}`:'AI sprint'):
        (course.valid?(course.mode==='lap'?'Lap time trial':'Sprint time trial'):'Free drive');
      $('raceMode').textContent=title+(course.direction===-1?' \u00b7 Reverse':'');
      $('raceTime').textContent=course.valid?TrackRace.format(r.elapsed):'\u2014';
      $('raceLast').textContent=TrackRace.format(r.last);$('raceBest').textContent=TrackRace.format(r.best);
      const lap=rival?Math.min(r.completed+1,rival.laps):r.completed+1;
      $('raceProgress').textContent=course.valid?`${course.mode==='lap'?'Lap '+lap+' \u00b7 ':''}CP ${r.checkpoint}/${course.checkpoints.length}`:'';
      let status=(paused?'Paused \u00b7 ':'')+r.message,entries=null;
      if(rival){
        const total=rival.opponents.length,finished=rival.opponents.filter(opponent=>opponent.done).length;
        const result=rival.winner?(rival.winner==='tie'?'Dead heat':rival.winner==='player'?'You finished first!':total===1?'Rival finished first.':`${rival.winnerName} finished first.`):'Race in progress';
        const progress=total===1?(course.mode==='lap'?`laps ${Math.min(rival.trial.state.completed,rival.laps)}/${rival.laps}`:(rival.aiDone?'finished':'racing')):`${finished}/${total} rivals finished`;
        entries=standings();const rivalStatus=workshop?`${finished}/${total} cars finished \u00b7 ${result}`:`${rivalPosition(entries)} \u00b7 ${result} \u00b7 ${TrackAI.DIFFICULTIES[rival.difficulty].label} ${total===1?'rival '+progress:progress}`;
        if($('raceRival').textContent!==rivalStatus)$('raceRival').textContent=rivalStatus;
        const order=entries.map((entry,index)=>`${entry.finishRank??index+1}. ${entry.name}`).join('  \u00b7  ');
        if($('raceStandings').textContent!==order)$('raceStandings').textContent=order;
        if(rival.countdown>0)status=`${paused?'Paused - ':''}Race starts in ${Math.ceil(rival.countdown)}...`;
        else if(rival.playerDone)status='Finished \u00b7 restart at the grid to race again.';
      }
      if($('raceStatus').textContent!==status)$('raceStatus').textContent=status;
      $('restartTimedRun').disabled=!course.valid;
      $('driveGridPosition').disabled=!course.valid || !!rival;
      if(compactRace)renderQuickRace(r,course,entries,lap);
    }
    function renderQuickRace(state,course,entries,lap) {
      $('quickStandingsPanel').hidden=!entries;$('quickPositionPanel').hidden=!entries;
      $('quickLapPanel').hidden=(!rival && !soloTimed) || !course.valid || course.mode!=='lap';
      $('quickLap').textContent=rival?`${lap} / ${rival.laps}`:String(Math.max(1,lap-soloStartLap));
      $('quickSpeed').textContent=$('driveSpeed').textContent;
      if(entries){
        const position=rival.playerFinishRank??entries.findIndex(entry=>entry.name==='You')+1;
        $('quickPosition').textContent=`${position} / ${entries.length}`;
        const order=entries.map((entry,index)=>`${entry.finishRank??index+1}. ${entry.name}`).join('|');
        if(order!==lastQuickStandings){
          $('quickStandings').replaceChildren(...entries.map((entry,index)=>{const row=document.createElement('li');row.textContent=`${entry.finishRank??index+1}. ${entry.name}`;if(entry.name==='You')row.className='race-hud-player';return row;}));
          lastQuickStandings=order;
        }
      }
      const remaining=rival?rival.countdown:soloCountdown,started=!!rival || soloTimed,elapsed=rival?rival.elapsed:soloElapsed;
      const countdown=started && !(rival?.playerDone || soloFinishTime!==null)?(remaining>1e-7?String(Math.ceil(remaining-1e-7)):elapsed<.9?'GO!':''):'';
      if($('quickCountdown').textContent!==countdown)$('quickCountdown').textContent=countdown;$('quickCountdown').hidden=!countdown;
      if(countdown && countdown!==lastCountdownCue && !paused && focused && !document.hidden){lastCountdownCue=countdown;engineSound.countdown(countdown);}
      renderQuickResults();
      renderQuickTiming(state,course);
    }
    function raceOver(){return !!(compactRace && (rival?.complete || soloTimed && soloFinishTime!==null));}
    function resetRaceEnd(){lastQuickResults='';raceStopTime=0;raceParked=false;lastCountdownCue=null;championshipReported=false;engineSound.cancelCountdown();engineSound.cancelCheckpointBeep();engineSound.cancelAnnouncements();$('quickChampionshipSummary').hidden=true;}
    function renderQuickResults(){
      const playerFinished=!!(rival?.playerDone || soloTimed && soloFinishTime!==null);
      $('quickFinished').hidden=!playerFinished;if(!playerFinished)return;
      const results=rival?rival.finishers:[{name:'You',rank:1,time:soloFinishTime,player:true}],remaining=rival?rival.opponents.filter(o=>!o.done).length:0;
      const championship=!!host.championshipRace?.();
      $('quickResultsReplay').hidden=championship;$('quickResultsNext').hidden=!championship || !raceOver();
      if(championship && raceOver() && !championshipReported){
        championshipReported=true;
        host.championshipResult?.({mode:race.course.mode,finishers:results.map(item=>({name:item.name,rank:item.rank,time:item.time,player:!!item.player})),laps:race.state.lapTimes.slice(0,rival.laps)});
      }
      $('quickResultsStatus').textContent=remaining?`Waiting for ${remaining} ${remaining===1?'car':'cars'} to finish…`:'All cars have finished';
      $('quickResultsActions').hidden=!raceOver();
      const signature=results.map(item=>`${item.rank}|${item.name}|${item.time}`).join(';');
      if(signature!==lastQuickResults){
        $('quickResultsList').replaceChildren(...results.map(item=>{const row=document.createElement('li');row.textContent=`${item.rank}. ${item.name}`.padEnd(20,' ')+TrackRace.format(item.time);if(item.player)row.className='quick-result-player';return row;}));
        lastQuickResults=signature;
      }
    }
    function renderQuickTiming(state,course) {
      const timed=course.valid && (!!rival || soloTimed);$('quickTimingPanel').hidden=!timed;if(!timed)return;
      const isLap=course.mode==='lap',finished=rival?!!rival.playerDone:!isLap && soloFinishTime!==null;
      const times=rival?(isLap?state.lapTimes.slice(0,rival.laps):state.lapTimes):state.lapTimes.slice(soloStartLap);
      const completed=soloTimed?Math.max(0,state.completed-soloStartLap):state.completed;
      for(const time of times)if(Number.isFinite(time))sessionBestLap=sessionBestLap===null?time:Math.min(sessionBestLap,time);
      const total=rival?(rival.playerFinishTime??rival.elapsed):(soloFinishTime??soloElapsed);
      if(finished && Number.isFinite(total))sessionBestRace=sessionBestRace===null?total:Math.min(sessionBestRace,total);
      const first=isLap && !rival?Math.max(0,completed-4):0;
      const count=isLap?(rival?rival.laps:Math.min(5,completed+1)):1,shape=`${isLap}:${first}:${count}`;
      if(shape!==quickTimingShape){quickTimingRows=Array.from({length:count},()=>document.createElement('li'));$('quickLapTimes').replaceChildren(...quickTimingRows);quickTimingShape=shape;}
      $('quickTimingTitle').textContent=isLap?(first?'RECENT LAP TIMES':'LAP TIMES'):'SPRINT TIME';
      quickTimingRows.forEach((row,index)=>{
        const n=first+index,current=isLap?!finished && n===completed:!finished;
        const value=isLap?(n<times.length?times[n]:current && state.running?state.elapsed:null):(finished?state.last:state.running?state.elapsed:null);
        const label=isLap?`Lap ${n+1}`:'Run';row.textContent=label.padEnd(8,' ')+TrackRace.format(value);row.className=current?'quick-timing-current':'';
      });
      const lapTotal=times.reduce((sum,time)=>sum+(Number.isFinite(time)?time:0),0)+(state.running && !finished?state.elapsed:0);
      $('quickLapTotalRow').hidden=!isLap;$('quickLapTotal').textContent=TrackRace.format(lapTotal);
      $('quickRaceTotal').textContent=TrackRace.format(total);$('quickBestLapLabel').textContent=isLap?'BEST LAP · SESSION':'BEST RUN · SESSION';
      $('quickBestLap').textContent=TrackRace.format(sessionBestLap);$('quickBestRaceRow').hidden=!rival && isLap;$('quickBestRace').textContent=TrackRace.format(sessionBestRace);
    }
    function createPlayerTrial(course){
      const trial=TrackRace.create(course,{
        onCheckpoint:()=>{if(!rival?.playerDone && !(rival && course.mode==='lap' && trial.state.completed>=rival.laps))engineSound.checkpoint();},
        onComplete:({mode,completed})=>{
          if(rival?.playerDone || rival && mode==='lap' && completed>rival.laps)return;
          if(mode==='sprint' || rival && completed===rival.laps){engineSound.finished();return;}
          engineSound.lapCompleted({finalLap:!!rival && completed===rival.laps-1});
        }
      });return trial;
    }
    function simulation(world,runtime,position,scale,trial,build=vehicleBuild) {
      const discontinuity=state=>tyreMarks.breakTrails(state);
      return TrackVehicle.create(world,runtime,position.index,{scale,build:build.selection,direction:trial.course.direction,spawnFraction:position.fraction,spawnPose:position.pose,allowSurfaceRejoin:true,
        onStep:(previous,state,dt)=>{trial.step(previous,state,dt);tyreMarks.step(state,dt,world.support);},
        onReset:state=>{trial.reset();discontinuity(state);},onRecover:(state,info)=>{trial.recover(info);discontinuity(state);}});
    }
    const rivalColours=[0x28a6dd,0xe65555,0xb67be3,0x6bbf59,0xe879b1,0xe6e8ed,0x37c7ad,0xf6ad42];
    const rivalColourNames=['Blue','Red','Purple','Green','Pink','White','Teal','Orange'];
    function prepareRival(world,runtime,course,scale,playerSlot,laps,difficulty='normal',count=1,spectator=false,personalities=null){
      if(!course.valid)throw Error(course.message);
      if(!Number.isInteger(count) || count<1 || count>(spectator?8:7))throw Error('Choose a valid number of AI cars.');
      const grid=TrackRace.startingGrid(runtime,course,scale,spectator?count:Math.max(playerSlot,count+1));
      const positions=(spectator?grid:grid.filter(position=>position.slot!==playerSlot)).slice(0,count);
      if(positions.length!==count)throw Error('There is not enough room on the starting grid for all cars.');
      const level=TrackAI.DIFFICULTIES[difficulty]?difficulty:'normal',nav=TrackAI.create(runtime,course.direction,level);
      const opponents=positions.map((position,index)=>{
        const trial=TrackRace.create(course);let driver=null,entry=null;
        const opponent=TrackVehicle.create(world,runtime,position.index,{scale,build:nav.build,accelerationMultiplier:nav.accelerationMultiplier,direction:course.direction,
          spawnFraction:position.fraction,spawnPose:position.pose,
          onStep:(previous,state,dt)=>{trial.step(previous,state,dt);tyreMarks.step(state,dt,world.support,spectator && index===0);},
          onReset:state=>{trial.reset();tyreMarks.breakTrails(state);driver?.reset(state);},onRecover:(state,info)=>{
            trial.recover(info);tyreMarks.breakTrails(state);driver?.reset(state);
            if(entry && !entry.recovering)recordRecovery(entry,{time:rival?.elapsed??0,reason:'automatic fall recovery',to:entry.sim.recoverySection,earlier:false});
          }});
        driver=TrackAI.createDriver(nav,index,opponent.state,opponent.size);
        if(personalities?.[index])driver.setPersonality(personalities[index]);
        entry={sim:opponent,trial,nav,driver,personality:{id:`default:${index}`,name:defaultPersonalityName(index),modified:false},slot:position.slot,name:`AI ${index+1} (${rivalColourNames[index]})`,colour:rivalColours[index],done:false,finishRank:null,stuck:0,offRoute:0,lastRecovery:null,recoveryEvents:[],samples:[],recovering:false};
        return entry;
      });
      return {opponents,spectator,difficulty:level,laps:[1,3,5].includes(Number(laps))?Number(laps):3,
        winner:null,winnerName:null,playerDone:false,playerFinishRank:null,playerFinishTime:null,complete:false,finishers:[],elapsed:0,contacts:0,countdown:3,accumulator:0,nextDiagnosticSample:0,
        // Existing single-rival integrations can still inspect the first car.
        get sim(){return this.opponents[0].sim;},get trial(){return this.opponents[0].trial;},
        get nav(){return this.opponents[0].nav;},get aiDone(){return this.opponents[0].done;}};
    }
    function recordRecovery(opponent,event){opponent.recoveryEvents.push(event);if(opponent.recoveryEvents.length>8)opponent.recoveryEvents.shift();}
    function diagnosticSample(opponent){
      const s=opponent.sim.state,i=opponent.driver.intent;
      const surfaces=[...new Set(s.contacts.filter(c=>c.hit && c.force>.05).map(c=>c.hit.surface??(c.hit.road?'road':'ground')))];
      return {time:rival?.elapsed??0,x:s.x,y:s.y,z:s.z,speed:Math.hypot(s.vx,s.vz)*3.6,
        route:s.routePiece,contact:s.trackPiece,valid:s.routeValid,grounded:s.grounded,surfaces,
        recovery:opponent.sim.recoverySection,recoveries:s.recoveries,resets:s.resets,stuck:opponent.stuck,offRoute:opponent.offRoute,
        yaw:s.yaw,mode:i.mode,traffic:i.target,nearby:i.nearby??0,targetSpeed:(i.targetSpeed??0)*3.6,
        throttle:i.throttle??0,steer:i.steer??0,handbrake:!!i.handbrake,brakeReason:i.brakeReason??null,headingError:i.headingError??null,
        routeDistance:i.routeDistance??null,routeOffset:i.routeOffset??null,aim:i.aim?{...i.aim}:null,aimSection:i.aimSection??null,aimKind:i.aimKind??null};
    }
    let diagnosticGuide=null;
    const diagNumber=(value,places=1)=>Number.isFinite(value)?value.toFixed(places):'—';
    const diagSection=value=>Number.isInteger(value)?String(value+1):'none';
    function selectedDiagnostic(){
      if(!rival)return null;const index=Number($('aiDiagnosticCar').value);
      return rival.opponents[Number.isInteger(index)&&index>=0&&index<rival.opponents.length?index:0]??null;
    }
    function syncDiagnostics(){
      const panel=$('aiDiagnostics'),select=$('aiDiagnosticCar');panel.hidden=!rival;
      if(!rival){select.replaceChildren();$('aiDiagnosticPersonality').replaceChildren();$('aiDiagnosticPersonalityStatus').textContent='';$('aiDiagnosticReadout').value='';return;}
      const selected=Number(select.value),options=rival.opponents.map((opponent,index)=>{
        const option=document.createElement('option');option.value=String(index);option.textContent=opponent.name;return option;
      });
      select.replaceChildren(...options);select.value=String(Number.isInteger(selected)&&selected>=0&&selected<options.length?selected:0);
      $('aiDiagnosticStatus').textContent='';syncDiagnosticPersonality();
    }
    function describeDiagnostic(opponent,sample,full=false){
      const next=Number.isInteger(sample.route)?sample.route+opponent.nav.direction:null;
      const nextSection=next===null?null:opponent.nav.closed?(next+opponent.nav.pieceCount)%opponent.nav.pieceCount:
        (next>=0 && next<opponent.nav.pieceCount?next:null);
      const traffic=workshop?(Number.isInteger(sample.traffic)?rival.opponents[sample.traffic]?.name??'another car':'none'):sample.traffic===0?'player':Number.isInteger(sample.traffic)?rival.opponents[sample.traffic-1]?.name??'another car':'none';
      const action=sample.throttle<0?`brake ${Math.round(-sample.throttle*100)}%`:sample.throttle>0?`accelerator ${Math.round(sample.throttle*100)}%`:'coasting';
      const turn=Math.abs(sample.steer)<.02?'straight':`${sample.steer>0?'right':'left'} ${Math.round(Math.abs(sample.steer)*100)}%`;
      const lines=[`${opponent.name} · ${TrackAI.DIFFICULTIES[rival.difficulty].label} · ${race.course.direction===-1?'reverse':'normal'} direction${paused?' · paused':''}`,
        `Race ${diagNumber(rival.elapsed)}s · laps ${opponent.trial.state.completed} · checkpoints ${opponent.trial.state.checkpoint}/${race.course.checkpoints.length}`,
        `Engine ${opponent.sim.build.engine.label} · AI pull boost ${Math.round((opponent.nav.accelerationMultiplier-1)*100)}% · tyres ${opponent.sim.build.tyres.label}`,
        `Personality ${personalityLabel(opponent)}`,
        `Speed ${diagNumber(sample.speed)} km/h · target ${diagNumber(sample.targetSpeed)} km/h`,
        `Controls: ${action}; steer ${turn}${sample.handbrake?'; handbrake on':''}`,
        `Decision: ${sample.mode??'waiting'}${sample.brakeReason?' · braking: '+sample.brakeReason:''} · traffic: ${traffic}`,
        `Expected section ${diagSection(sample.route)} · next ${diagSection(nextSection)}`,
        `Wheels on section ${diagSection(sample.contact)} · ${sample.valid?'in sequence':'off route / unverified'}`,
        `Aim: section ${diagSection(sample.aimSection)} (${sample.aimKind??'waiting'})`,
        `Heading error ${sample.headingError===null?'—':diagNumber(sample.headingError/rad)+'°'} · centre offset ${diagNumber(sample.routeOffset)} m`,
        `Surface ${sample.surfaces.join(' / ')||'airborne'} · wheels ${sample.grounded}/4`,
        `Recovery section ${diagSection(sample.recovery)} · recoveries ${sample.recoveries} · falls ${sample.resets}`,
        `Stuck ${diagNumber(sample.stuck)} / 7 s · off route ${diagNumber(sample.offRoute)} / 4 s`,
        `Position x ${diagNumber(sample.x)} · y ${diagNumber(sample.y)} · z ${diagNumber(sample.z)}`];
      if(sample.aim)lines.push(`Steering target x ${diagNumber(sample.aim.x)} · y ${diagNumber(sample.aim.y)} · z ${diagNumber(sample.aim.z)}`);
      lines.push('', 'Recent recoveries:');
      if(!opponent.recoveryEvents.length)lines.push('  None yet');
      for(const event of opponent.recoveryEvents.slice(full?0:-3)){
        const before=event.before;
        lines.push(`  ${diagNumber(event.time)}s: ${event.reason} → section ${diagSection(event.to)}${event.earlier?' (earlier point)':''}`);
        if(before)lines.push(`    Was on ${diagSection(before.contact)}; expected ${diagSection(before.route)}; aim ${diagSection(before.aimSection)}; ${diagNumber(before.speed)} km/h; ${before.mode}${before.brakeReason?' / '+before.brakeReason:''}`);
        if(before?.aim)lines.push(`    Target x ${diagNumber(before.aim.x)} y ${diagNumber(before.aim.y)} z ${diagNumber(before.aim.z)} · throttle ${diagNumber(before.throttle,2)} steer ${diagNumber(before.steer,2)}`);
      }
      lines.push('', 'Recent samples (half-second intervals):');
      for(const p of opponent.samples.slice(full?0:-4))lines.push(`  ${diagNumber(p.time)}s · section ${diagSection(p.route)} / wheels ${diagSection(p.contact)} ${p.valid?'valid':'unverified'} · aim ${diagSection(p.aimSection)} ${p.aimKind??'waiting'} · ${diagNumber(p.speed)} / ${diagNumber(p.targetSpeed)} km/h · throttle ${diagNumber(p.throttle,2)} steer ${diagNumber(p.steer,2)} · ${p.mode}${p.brakeReason?' / '+p.brakeReason:''} · x ${diagNumber(p.x)} y ${diagNumber(p.y)} z ${diagNumber(p.z)}`);
      if(full){
        const authored=$('code').value,actual=host.getTrack().runtime.code;
        lines.push('', 'Track code:',authored);
        if(actual!==authored)lines.push('', 'Race runtime code (may include temporary markers):',actual);
      }
      return lines.join('\n');
    }
    function showDiagnosticGuide(opponent,sample){
      const show=!!(opponent && sample?.aim && $('aiDiagnostics').open && $('aiDiagnosticGuide').checked);
      if(show && !diagnosticGuide){
        const group=new THREE.Group(),geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
        const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x00e5ff,depthTest:false}));
        const marker=new THREE.Mesh(new THREE.SphereGeometry(.28,12,8),new THREE.MeshBasicMaterial({color:0x00e5ff,depthTest:false}));
        line.frustumCulled=false;line.renderOrder=40;marker.renderOrder=41;group.name='AI steering guide';group.add(line,marker);host.scene.add(group);
        diagnosticGuide={group,line,marker};
      }
      if(!diagnosticGuide)return;diagnosticGuide.group.visible=show;if(!show)return;
      const s=opponent.sim.state,a=sample.aim,p=diagnosticGuide.line.geometry.attributes.position;
      p.array.set([s.x,s.y+.35,s.z,a.x,a.y,a.z]);p.needsUpdate=true;diagnosticGuide.marker.position.set(a.x,a.y,a.z);
    }
    function renderDiagnostics(){
      const opponent=selectedDiagnostic();
      if(!opponent || !$('aiDiagnostics').open){showDiagnosticGuide(null,null);return;}
      const sample=diagnosticSample(opponent),text=describeDiagnostic(opponent,sample);
      if($('aiDiagnosticReadout').value!==text)$('aiDiagnosticReadout').value=text;
      showDiagnosticGuide(opponent,sample);
    }
    const workshopFields={lane:'aiLane',speed:'aiSpeed',corner:'aiCorner',brake:'aiBrake',look:'aiLook',steer:'aiSteer',overtake:'aiOvertake',handbrake:'aiHandbrake'};
    const personalityKey='trackshift.aiPersonalities.v1';
    let personalities=[];
    function defaultPersonalityName(index){return `Default ${String(index+1).padStart(2,'0')}`;}
    function personalityLabel(opponent){return opponent?.personality?opponent.personality.name+(opponent.personality.modified?' · modified':''):'Unsaved personality';}
    function profileById(id){
      const match=/^default:([0-7])$/.exec(id??'');
      if(match){const index=Number(match[1]);return {id:`default:${index}`,name:defaultPersonalityName(index),settings:TrackAI.defaultPersonality(index),builtin:true};}
      const name=String(id??'').startsWith('saved:')?String(id).slice(6):id;
      const record=personalities.find(item=>item.name===name);return record?{...record,id:`saved:${record.name}`,builtin:false}:null;
    }
    function profileOptions(){
      const option=(value,label)=>{const item=document.createElement('option');item.value=value;item.textContent=label;return item;};
      return [option('','Choose a personality'),...Array.from({length:8},(_,index)=>option(`default:${index}`,defaultPersonalityName(index))),...personalities.map(record=>option(`saved:${record.name}`,record.name+' · saved'))];
    }
    function applyPersonality(opponent,profile){
      if(!opponent || !profile)return false;
      opponent.driver.setPersonality(profile.settings);opponent.personality={id:profile.id,name:profile.name,modified:false};return true;
    }
    function personalityMatches(opponent,profile){
      if(!profile)return false;
      const index=rival?.opponents.indexOf(opponent)??0,expected=TrackAI.personality(profile.settings,Math.max(0,index)),actual=opponent.driver.style;
      return [...Object.keys(workshopFields),'side','handbrakeCadence'].every(key=>actual[key]===expected[key]);
    }
    function syncDiagnosticPersonality(){
      const select=$('aiDiagnosticPersonality'),opponent=selectedDiagnostic();select.replaceChildren(...profileOptions());
      select.value=opponent?.personality?.id??'';$('aiDiagnosticPersonalityStatus').textContent=opponent?`Current: ${personalityLabel(opponent)}`:'';
    }
    function validPersonality(record){
      return !!record && typeof record.name==='string' && record.name.trim().length>0 && record.name.length<=60 && record.settings &&
        Object.entries(TrackAI.PERSONALITY_FIELDS).every(([key,range])=>Number.isFinite(record.settings[key]) && record.settings[key]>=range.min && record.settings[key]<=range.max) &&
        (record.settings.side===undefined || record.settings.side===-1 || record.settings.side===1) &&
        (record.settings.handbrakeCadence===undefined || Number.isFinite(record.settings.handbrakeCadence) && record.settings.handbrakeCadence>=7 && record.settings.handbrakeCadence<=8.4);
    }
    try{const saved=JSON.parse(window.localStorage.getItem(personalityKey));if(saved?.version===1 && Array.isArray(saved.items))personalities=saved.items.filter(validPersonality).slice(0,100);}catch(error){}
    function selectedWorkshop(){const index=Number($('aiWorkshopCar').value);return rival?.opponents[Number.isInteger(index)?index:0]??null;}
    function syncWorkshopFields(){
      const opponent=selectedWorkshop();if(!opponent)return;
      for(const [key,id] of Object.entries(workshopFields)){$(id).value=String(opponent.driver.style[key]);$(id+'Value').textContent=key==='look'?`${opponent.driver.style[key]} m`:Number(opponent.driver.style[key]).toFixed(2);}
      $('aiCurrentPersonality').textContent=`Current: ${personalityLabel(opponent)}`;refreshPersonalities(opponent.personality?.id??'');
    }
    function syncWorkshopCars(){
      const select=$('aiWorkshopCar'),old=Number(select.value);
      select.replaceChildren(...rival.opponents.map((opponent,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=opponent.name;return option;}));
      select.value=String(Number.isInteger(old)&&old>=0&&old<rival.opponents.length?old:0);$('aiDiagnosticCar').value=select.value;
      $('aiWorkshopCamera').value=$('driveCamera').value;$('aiWorkshopProjection').value=$('driveProjection').value;syncWorkshopFields();refreshPersonalities();
    }
    function renderWorkshop(){
      const opponent=selectedWorkshop();if(!opponent)return;
      $('aiWorkshopRace').textContent=`${paused?'Paused · ':''}${rival.countdown>0?'Starting in '+Math.ceil(rival.countdown)+' · ':''}${TrackRace.format(rival.elapsed)} · ${rival.opponents.filter(o=>o.done).length}/${rival.opponents.length} finished · ${standings().map((entry,index)=>`${entry.finishRank??index+1}. ${entry.name}`).join('  ·  ')}`;
      const sample=diagnosticSample(opponent);
      $('aiWorkshopSummary').textContent=`${opponent.name} · ${diagNumber(sample.speed)} / ${diagNumber(sample.targetSpeed)} km/h · ${sample.mode}${sample.handbrake?' · handbrake':''} · ${sample.recoveries} recoveries`;
      $('aiWorkshopInfo').textContent=describeDiagnostic(opponent,sample).split('\n').slice(0,14).join('\n');
    }
    function refreshPersonalities(selected=''){
      const list=$('aiPersonalityList'),old=selected||list.value;
      list.replaceChildren(...profileOptions());list.value=profileById(old)?.id??'';
    }
    function persistPersonalities(next){
      if(next.length>100)throw Error('A maximum of 100 personalities can be saved.');
      window.localStorage.setItem(personalityKey,JSON.stringify({version:1,items:next}));personalities=next;
    }
    function currentPersonality(){const style=selectedWorkshop()?.driver.style;if(!style)throw Error('Select an AI car first.');return Object.fromEntries([...Object.keys(workshopFields),'side','handbrakeCadence'].map(key=>[key,style[key]]));}
    function usePersonality(profile){const opponent=selectedWorkshop();if(!applyPersonality(opponent,profile))return;syncWorkshopFields();syncDiagnosticPersonality();}
    $('aiWorkshopCar').addEventListener('change',()=>{$('aiDiagnosticCar').value=$('aiWorkshopCar').value;syncWorkshopFields();const profile=profileById(selectedWorkshop()?.personality?.id);$('aiPersonalityName').value=profile && !profile.builtin?profile.name:'';$('aiPersonalityStatus').textContent='';clearCamera();renderCar(0,true);});
    for(const [key,id] of Object.entries(workshopFields))$(id).addEventListener('input',()=>{
      const opponent=selectedWorkshop(),value=Number($(id).value);if(!opponent || !Number.isFinite(value))return;
      opponent.driver.setPersonality({...opponent.driver.style,[key]:value});opponent.personality.modified=!personalityMatches(opponent,profileById(opponent.personality.id));syncWorkshopFields();syncDiagnosticPersonality();$('aiPersonalityStatus').textContent=opponent.personality.modified?'Unsaved changes on this car.':'Personality matches its saved settings.';
    });
    $('aiDefault').addEventListener('click',()=>{const index=Number($('aiWorkshopCar').value)||0;usePersonality(profileById(`default:${index}`));$('aiPersonalityStatus').textContent='Driver defaults restored.';});
    $('aiApplyAll').addEventListener('click',()=>{try{const settings=currentPersonality(),source=selectedWorkshop().personality;for(const opponent of rival.opponents){opponent.driver.setPersonality(settings);opponent.personality={...source};}syncWorkshopFields();syncDiagnosticPersonality();$('aiPersonalityStatus').textContent='Applied to every car in this race.';}catch(error){$('aiPersonalityStatus').textContent=error.message;}});
    $('aiPersonalitySave').addEventListener('click',()=>{try{
      const name=$('aiPersonalityName').value.trim();if(!name || name.length>60)throw Error('Enter a name of up to 60 characters.');
      const previous=personalities.find(item=>item.name.toLowerCase()===name.toLowerCase());
      if(!previous && Array.from({length:8},(_,index)=>defaultPersonalityName(index).toLowerCase()).includes(name.toLowerCase()))throw Error('Default names are reserved. Choose a new name for your edited personality.');
      const record={name,settings:currentPersonality()},next=personalities.filter(item=>item.name.toLowerCase()!==name.toLowerCase());next.push(record);persistPersonalities(next);
      for(const opponent of rival.opponents)if(previous && opponent.personality.id===`saved:${previous.name}`){opponent.personality={id:`saved:${name}`,name,modified:!personalityMatches(opponent,{...record,id:`saved:${name}`})};}
      selectedWorkshop().personality={id:`saved:${name}`,name,modified:false};syncWorkshopFields();syncDiagnosticPersonality();$('aiPersonalityStatus').textContent='Personality saved in this browser.';
    }catch(error){$('aiPersonalityStatus').textContent=`Could not save: ${error.message}`;}});
    $('aiPersonalityList').addEventListener('change',()=>{const profile=profileById($('aiPersonalityList').value);if(profile){$('aiPersonalityName').value=profile.builtin?'':profile.name;$('aiPersonalityStatus').textContent=`Choose Apply to assign ${profile.name} to this car.`;}});
    $('aiPersonalityLoad').addEventListener('click',()=>{const profile=profileById($('aiPersonalityList').value);if(!profile){$('aiPersonalityStatus').textContent='Choose a personality.';return;}usePersonality(profile);$('aiPersonalityName').value=profile.builtin?'':profile.name;$('aiPersonalityStatus').textContent=`${profile.name} applied to the selected car.`;});
    $('aiPersonalityDelete').addEventListener('click',()=>{try{const profile=profileById($('aiPersonalityList').value);if(!profile)throw Error('Choose a saved personality.');if(profile.builtin)throw Error('Default personalities cannot be deleted.');if(typeof window.confirm==='function' && !window.confirm(`Delete personality “${profile.name}”?`))return;persistPersonalities(personalities.filter(item=>item.name!==profile.name));for(const opponent of rival.opponents)if(opponent.personality.id===profile.id)opponent.personality={id:'',name:profile.name,modified:true};syncWorkshopFields();syncDiagnosticPersonality();$('aiPersonalityStatus').textContent='Personality deleted; cars keep their current settings.';}catch(error){$('aiPersonalityStatus').textContent=`Could not delete: ${error.message}`;}});
    $('aiPersonalityExport').addEventListener('click',()=>{try{if(!personalities.length)throw Error('Save a personality first.');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify({format:'TrackShift AI personalities',version:1,items:personalities},null,2)+'\n'],{type:'application/json'}));link.download='trackshift-ai-personalities.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);$('aiPersonalityStatus').textContent='Personalities exported.';}catch(error){$('aiPersonalityStatus').textContent=error.message;}});
    $('aiPersonalityImportButton').addEventListener('click',()=>$('aiPersonalityImport').click());
    $('aiPersonalityImport').addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;if(file.size>262144){$('aiPersonalityStatus').textContent='Personality file is too large.';event.target.value='';return;}const reader=new FileReader();reader.onload=()=>{try{
      const data=JSON.parse(String(reader.result));if(data?.format!=='TrackShift AI personalities' || data.version!==1 || !Array.isArray(data.items) || !data.items.length || !data.items.every(validPersonality))throw Error('Not a valid TUR personality file.');
      const next=personalities.slice();for(const record of data.items){let name=record.name.trim(),n=2;while(next.some(item=>item.name.toLowerCase()===name.toLowerCase()) || Array.from({length:8},(_,index)=>defaultPersonalityName(index).toLowerCase()).includes(name.toLowerCase())){const suffix=` (${n++})`;name=record.name.trim().slice(0,60-suffix.length)+suffix;}next.push({name,settings:record.settings});}persistPersonalities(next);refreshPersonalities();syncDiagnosticPersonality();$('aiPersonalityStatus').textContent=`Imported ${data.items.length} personality(s) as copies.`;
    }catch(error){$('aiPersonalityStatus').textContent=`Could not import: ${error.message}`;}};reader.onerror=()=>{$('aiPersonalityStatus').textContent='Could not read the personality file.';};reader.readAsText(file);event.target.value='';});
    $('aiWorkshopExit').addEventListener('click',stop);$('aiWorkshopPause').addEventListener('click',pause);$('aiWorkshopRestart').addEventListener('click',()=>restartRace());
    $('aiWorkshopGuide').addEventListener('change',()=>{$('aiDiagnosticGuide').checked=$('aiWorkshopGuide').checked;renderDiagnostics();});
    function workshopCameraButtons(){ $('aiFollow').setAttribute('aria-pressed',String(!freeCamera));$('aiFree').setAttribute('aria-pressed',String(freeCamera)); }
    $('aiFollow').addEventListener('click',()=>{freeCamera=false;freeFocus=null;workshopCameraButtons();clearCamera();updateCamera(0,true);});
    $('aiFree').addEventListener('click',()=>{const state=selectedWorkshop()?.sim.state;if(!state)return;freeFocus={x:state.x,y:state.y,z:state.z};freeCamera=true;workshopCameraButtons();clearCamera();updateCamera(0,true);});
    $('aiWorkshopCamera').addEventListener('change',()=>{$('driveCamera').value=$('aiWorkshopCamera').value;configureView();});
    $('aiWorkshopProjection').addEventListener('change',()=>{$('driveProjection').value=$('aiWorkshopProjection').value;ensureCamera();updateCamera(0,true);});
    let workshopDrag=null;
    host.canvas.addEventListener('pointerdown',event=>{if(!workshop || (event.button!==0 && event.button!==2))return;workshopDrag={x:event.clientX,y:event.clientY,button:event.button};host.canvas.setPointerCapture?.(event.pointerId);});
    host.canvas.addEventListener('pointermove',event=>{if(!workshop || !workshopDrag)return;const dx=event.clientX-workshopDrag.x,dy=event.clientY-workshopDrag.y;workshopDrag.x=event.clientX;workshopDrag.y=event.clientY;
      if(workshopDrag.button===0){tuning.orbit=((tuning.orbit-dx*.35+540)%360)-180;tuning.tilt=clamp(tuning.tilt+dy*.25,15,85);}
      else if(freeCamera && freeFocus){const scale=tuning.distance/zoomValue()/300,heading=(fixedHeading+tuning.orbit*rad);freeFocus.x+=(-dx*Math.cos(heading)+dy*Math.sin(heading))*scale;freeFocus.z+=(dx*Math.sin(heading)+dy*Math.cos(heading))*scale;}
      clearCamera();updateCamera(0,true);
    });
    for(const name of ['pointerup','pointercancel'])host.canvas.addEventListener(name,()=>{workshopDrag=null;});
    function adoptRival(next,scale=carScale){
      if(!next || !rival)return;
      next.opponents.forEach((opponent,index)=>{
        opponent.driver.setPersonality(rival.opponents[index].driver.style);
        opponent.personality={...rival.opponents[index].personality};
        opponent.car=rival.opponents[index].car;opponent.wheels=rival.opponents[index].wheels;
        opponent.car.scale.set(scale,scale,scale);
      });
      rival=next;
    }
    function updateRival(dt,input){
      // Advance the entire field together in small increments, then resolve
      // every car pair. A broad phase avoids expensive contact tests at range.
      const step=1/60;rival.accumulator+=Math.min(.1,Math.max(0,dt));
      while(rival.accumulator+1e-10>=step){
        rival.accumulator=Math.max(0,rival.accumulator-step);
        if(rival.countdown>0){rival.countdown=Math.max(0,rival.countdown-step);continue;}
        rival.elapsed+=step;
        // Sample the field once, before moving any car. Heights are compared
        // against each car's own banked road so an overpass is not traffic.
        const field=workshop?rival.opponents:[{sim,trial:race},...rival.opponents],nav=rival.nav;
        const snapshots=field.map((entry,id)=>{
          const source=entry.sim.state,state={x:source.x,y:source.y,z:source.z,vx:source.vx,vy:source.vy,vz:source.vz,
            yaw:source.yaw,scale:source.scale,grounded:source.grounded,routePiece:source.routePiece,trackPiece:source.trackPiece,routeValid:source.routeValid};
          const path=nav.locate(state),centre=nav.point(path.distance);
          const lateral=((state.x-centre.x)*Math.cos(centre.yaw)-(state.z-centre.z)*Math.sin(centre.yaw))*nav.direction;
          const roadY=TS2.heightAcross(centre,TS2.lateralU(centre,lateral));
          return {id,state,path,roadY,width:entry.sim.size.width,length:entry.sim.size.length};
        });
        // The player keeps control after finishing and can clear the line.
        if(!workshop)sim.advance(step,input);
        rival.opponents.forEach((opponent,index)=>{
          // Finished rivals keep moving on a cool-down lap so they do not
          // stop across the line and block the remaining field.
          const aiInput=opponent.driver.input(snapshots[index+(workshop?0:1)],snapshots,step);
          opponent.sim.advance(step,aiInput);
        });
        for(let i=0;i<field.length;i++)for(let j=i+1;j<field.length;j++){
          const a=field[i],b=field[j],sa=a.sim.state,sb=b.sim.state;
          const reach=(Math.hypot(a.sim.size.length,a.sim.size.width)+Math.hypot(b.sim.size.length,b.sim.size.width))*.5;
          if(Math.abs(sa.x-sb.x)>reach || Math.abs(sa.z-sb.z)>reach || Math.abs(sa.y-sb.y)>(sa.scale+sb.scale)*.8)continue;
          const beforeA={x:sa.x,y:sa.y,z:sa.z},beforeB={x:sb.x,y:sb.y,z:sb.z};
          if(TrackAI.collide(sa,sb,a.sim.size,b.sim.size)){
            rival.contacts++;
            // Contact correction can cross a race gate between physics steps.
            a.trial.step(beforeA,sa,1e-9);b.trial.step(beforeB,sb,1e-9);
          }
        }
        const finished=[];
        if(!workshop && !rival.playerDone && (race.course.mode==='lap'?race.state.completed>=rival.laps:race.state.finished)){
          rival.playerDone=true;rival.playerFinishTime=rival.elapsed;finished.push({name:'You',player:true});
        }
        for(const opponent of rival.opponents){
          if(!opponent.done && (race.course.mode==='lap'?opponent.trial.state.completed>=rival.laps:opponent.trial.state.finished)){
            opponent.done=true;finished.push({name:opponent.name,opponent});
          }
        }
        if(finished.length){
          const rank=rival.finishers.length+1;
          for(const finisher of finished){finisher.rank=rank;finisher.time=rival.elapsed;if(finisher.player)rival.playerFinishRank=rank;else {finisher.opponent.finishRank=rank;finisher.opponent.finishTime=rival.elapsed;}rival.finishers.push(finisher);}
          if(!rival.winner){
            rival.winner=finished.length>1?'tie':finished[0].player?'player':'ai';
            rival.winnerName=finished[0].name;
          }
        }
        // Quick Race ends only after the player and every opponent finish.
        // The AI workshop continues its cooldown laps for observation.
        if(compactRace && !workshop && rival.playerDone && rival.opponents.every(opponent=>opponent.done)){rival.complete=true;break;}
        for(const opponent of rival.opponents){
          const state=opponent.sim.state,speed=Math.hypot(state.vx,state.vz);
          opponent.stuck=!opponent.done && speed<.7?opponent.stuck+step:0;
          opponent.offRoute=!opponent.done && state.grounded>0 && !state.routeValid?opponent.offRoute+step:0;
          if(opponent.stuck>7 || opponent.offRoute>4){
            const point=opponent.sim.recoveryPoint,previous=opponent.lastRecovery;
            const repeated=point && previous && Math.hypot(point.x-previous.x,point.y-previous.y,point.z-previous.z)<3;
            const before=diagnosticSample(opponent),reason=opponent.stuck>7?'stuck':'off route';
            opponent.recovering=true;
            try{opponent.sim.recover({earlier:!!repeated});}finally{opponent.recovering=false;}
            recordRecovery(opponent,{time:rival.elapsed,reason,to:opponent.sim.recoverySection,earlier:!!repeated,before});
            opponent.lastRecovery={x:state.x,y:state.y,z:state.z};opponent.stuck=0;opponent.offRoute=0;
          }
        }
        if(rival.elapsed+1e-9>=rival.nextDiagnosticSample){
          rival.nextDiagnosticSample=rival.elapsed+.5;
          for(const opponent of rival.opponents){opponent.samples.push(diagnosticSample(opponent));if(opponent.samples.length>24)opponent.samples.shift();}
        }
      }
    }
    function standings(){
      const nav=rival.nav,start=nav.locate({x:race.course.start.pose.x,z:race.course.start.pose.z,routePiece:race.course.start.pieceIndex}).distance;
      function item(name,vehicle,trial,slot,finishRank){
        const state=trial.state;let distance=(nav.locate(vehicle.state).distance-start)*nav.direction;
        if(nav.closed)distance=(distance+nav.total)%nav.total;
        return {name,slot,finishRank,started:state.running||state.completed>0,completed:state.completed,checkpoint:state.checkpoint,distance};
      }
      const entries=[...(workshop?[]:[item('You',sim,race,spawnPosition.slot,rival.playerFinishRank)]),
        ...rival.opponents.map(opponent=>item(opponent.name,opponent.sim,opponent.trial,opponent.slot,opponent.finishRank))];
      entries.sort((a,b)=>{
        if(a.finishRank!==null || b.finishRank!==null)return (a.finishRank??Infinity)-(b.finishRank??Infinity)||a.slot-b.slot;
        if(a.started!==b.started)return a.started?-1:1;
        if(!a.started)return a.slot-b.slot;
        return b.completed-a.completed||b.checkpoint-a.checkpoint||b.distance-a.distance||a.slot-b.slot;
      });
      return entries;
    }
    function rivalPosition(entries=standings()){
      const position=rival.playerFinishRank??entries.findIndex(entry=>entry.name==='You')+1,total=entries.length;
      const suffix=position===1?'st':position===2?'nd':position===3?'rd':'th';
      return `${position}${suffix} of ${total}`;
    }
    function start(timed=false,versus=false,laps=3,difficulty='normal',opponentCount=1) {
      if(active)return true;
      try {
        const track=host.getTrack();if(!track.runtime)throw Error('Generate a track before driving.');
        if($('code').value.trim()!==track.runtime.code.trim())throw Error('Generate your edited track code before driving.');
        const nextRace=createPlayerTrial(TrackRace.plan(track.runtime,track.buffers.road,raceDirection));
        if(versus && (!Number.isInteger(opponentCount) || opponentCount<1 || opponentCount>7))throw Error('Choose between one and seven AI opponents.');
        const slot=versus?opponentCount+1:gridSlot;
        const spawn=timed?TrackRace.spawn(track.runtime,nextRace.course,carScale,slot):{index:host.selected(),fraction:undefined};
        const next=simulation(TrackVehicle.makeWorld(track.buffers),track.runtime,spawn,carScale,nextRace);
        const nextRival=versus?prepareRival(next.world,track.runtime,nextRace.course,carScale,slot,laps,difficulty,opponentCount):null;
        if(versus)nextRace.reset('Ready at the starting grid.');
        const nextCar=makeCar(),nextProbes=makeProbes();
        const rivalModels=nextRival?nextRival.opponents.map((opponent,index)=>makeCar(opponent.colour,['basic','wedge','compact'][index%3])):[];
        sim=next;race=nextRace;spawnPosition=spawn;car=nextCar.group;wheelViews=nextCar.wheels;probes=nextProbes;car.scale.set(carScale,carScale,carScale);
        rival=nextRival;syncGrid();syncDiagnostics();
        if(rival)rival.opponents.forEach((opponent,index)=>{opponent.car=rivalModels[index].group;opponent.wheels=rivalModels[index].wheels;
          opponent.car.name=index===0?'AI rival':`AI rival ${index+1}`;opponent.car.scale.set(carScale,carScale,carScale);host.scene.add(opponent.car);});
        $('raceRival').hidden=!rival;$('raceStandings').hidden=!rival;host.scene.add(car,probes);active=true;paused=false;keys.clear();padIndex=null;disarmPad();padReader.reset();clearCamera();lastResets=0;ensureCamera();
        compactRace=!!host.compactRace?.();soloTimed=compactRace && timed && !versus;soloCountdown=soloTimed?3:0;soloElapsed=0;soloFinishTime=null;soloStartLap=0;sessionBestLap=null;sessionBestRace=null;quickTimingShape='';lastQuickStandings='';resetRaceEnd();
        if(compactRace){const name=host.raceTrackName?.()||'Unnamed track';$('quickTrackName').textContent=name;$('quickTrackName').title=name;$('quickPauseTrack').textContent=name;$('quickResultsTrack').textContent=name;}
        if(compactRace)document.body.classList.add('quick-race');$('quickRaceHud').hidden=!compactRace;$('quickPauseOverlay').hidden=true;$('driveRaceDirection').disabled=!!host.championshipRace?.();
        document.body.classList.add('driving');$('driveHud').hidden=false;$('pauseCar').textContent='Pause';
        host.mode(true);host.canvas.focus?.();engineSound.setPlaying(focused && !document.hidden);engineSound.unlock();renderCar(0,true);
        host.message(`${timed?'Grid position '+slot:'Test drive from section '+(next.section+1)}. W/A/S/D or arrows · Space handbrake · R reset · Esc editor.`);
        return true;
      }catch(error){host.message(`Could not start driving: ${error.message}`,true);return false;}
    }
    function startWorkshop(count=2,laps=1,difficulty='normal',direction='normal') {
      if(active)return false;
      let models=[],nextProbes=null;
      try{
        const track=host.getTrack();if(!track.runtime)throw Error('Generate a track first.');
        const nextDirection=direction==='reverse'?-1:1,course=TrackRace.plan(track.runtime,track.buffers.road,nextDirection);
        const world=TrackVehicle.makeWorld(track.buffers),next=prepareRival(world,track.runtime,course,carScale,0,laps,difficulty,count,true);
        host.setDirection?.(nextDirection);
        models=next.opponents.map((opponent,index)=>makeCar(opponent.colour,['basic','wedge','compact'][index%3]));nextProbes=makeProbes();
        next.opponents.forEach((opponent,index)=>{opponent.car=models[index].group;opponent.wheels=models[index].wheels;opponent.car.name=`AI rival ${index+1}`;opponent.car.scale.set(carScale,carScale,carScale);host.scene.add(opponent.car);});
        workshopPrevious={camera:setup(),preset:$('drivePreset').value,diagnostics:$('aiDiagnostics').open,watch:$('aiDiagnosticWatch').checked,guide:$('aiDiagnosticGuide').checked};
        rival=next;workshop=true;workshopDirection=raceDirection;raceDirection=nextDirection;syncDirection();sim=next.opponents[0].sim;race=next.opponents[0].trial;
        car=next.opponents[0].car;wheelViews=next.opponents[0].wheels;spawnPosition={slot:1};probes=nextProbes;host.scene.add(probes);
        active=true;paused=false;freeCamera=false;freeFocus=null;workshopCameraButtons();keys.clear();padIndex=null;disarmPad();padReader.reset();clearCamera();lastResets=0;
        syncGrid();syncDiagnostics();$('aiDiagnostics').open=true;$('aiDiagnosticWatch').checked=true;syncWorkshopCars();
        document.body.classList.add('driving');document.body.classList.add('ai-workshop');$('driveHud').hidden=true;$('aiWorkshopHud').hidden=false;
        $('pauseCar').textContent='Pause';$('aiWorkshopPause').textContent='Pause';host.mode(true);ensureCamera();renderCar(0,true);
        engineSound.setPlaying(focused && !document.hidden);engineSound.unlock();host.message('AI workshop ready. Select a car to watch and tune.');return true;
      }catch(error){
        if(workshop && active){try{stop();}catch(cleanupError){/* Keep the original startup error. */}}
        else{for(const model of models)dispose(model.group);dispose(nextProbes);if(workshop)raceDirection=workshopDirection;workshop=false;workshopPrevious=null;rival=null;sim=null;race=null;car=null;probes=null;syncDirection();}
        host.message(`Could not start AI workshop: ${error.message}`,true);return false;
      }
    }
    function stop() {
      tyreMarks.breakTrails();
      const wasWorkshop=workshop;
      if(!active)return;active=false;engineSound.setPlaying(false);keys.clear();if(!workshop)dispose(car);dispose(probes);if(rival)for(const opponent of rival.opponents)dispose(opponent.car);rival=null;$('raceRival').hidden=true;$('raceStandings').hidden=true;car=null;probes=null;sim=null;race=null;driveCamera=null;
      if(workshop){raceDirection=workshopDirection;syncDirection();if(workshopPrevious){applySetup(workshopPrevious.camera);fixedHeading=workshopPrevious.camera.heading;$('drivePreset').value=workshopPrevious.preset;$('aiDiagnostics').open=workshopPrevious.diagnostics;$('aiDiagnosticWatch').checked=workshopPrevious.watch;$('aiDiagnosticGuide').checked=workshopPrevious.guide;}workshopPrevious=null;}
      workshop=false;freeCamera=false;freeFocus=null;$('aiWorkshopHud').hidden=true;document.body.classList.remove('ai-workshop');
      compactRace=false;soloTimed=false;soloCountdown=0;soloElapsed=0;soloFinishTime=null;soloStartLap=0;sessionBestLap=null;sessionBestRace=null;quickTimingShape='';quickTimingRows=[];resetRaceEnd();$('quickRaceHud').hidden=true;$('quickPauseOverlay').hidden=true;$('driveRaceDirection').disabled=false;document.body.classList.remove('quick-race');document.body.classList.remove('race-settings');
      if(diagnosticGuide){dispose(diagnosticGuide.group);diagnosticGuide=null;}if(!wasWorkshop)$('aiDiagnosticWatch').checked=false;syncDiagnostics();syncGrid();document.body.classList.remove('driving');$('driveHud').hidden=true;$('carLocator').hidden=true;padIndex=null;disarmPad();padReader.reset();const destination=host.mode(false);host.message(destination==='menu'?(wasWorkshop?'Back at AI workshop.':'Back at Quick Race.'):'Back in the section editor. Track code is unchanged by driving.');
    }
    function reset() {if(!sim || raceOver() && host.championshipRace?.())return;if(rival){restartRace();return;}sim.reset();if(soloTimed){soloCountdown=3;soloElapsed=0;soloFinishTime=null;soloStartLap=race.state.completed;}resetRaceEnd();keys.clear();disarmPad();clearCamera();renderCar(0,true);}
    function recover() {if(!sim || workshop)return;const restored=sim.recover();keys.clear();disarmPad();clearCamera();renderCar(0,true);host.canvas.focus?.();host.message(restored?(sim.recoveryReason==='jump-runup'?'Recovered before the jump with room for a run-up.':sim.recoveryReason==='jump-short'?'No safe run-up available · recovered to the last safe road position.':'Recovered stationary, facing forward along the track.'):'No safe road contact yet · returned to the starting position.');}
    function currentGridSlot() {return workshop?1:rival?rival.opponents.length+1:gridSlot;}
    function restartRace(slot=currentGridSlot()) {
      if(raceOver() && host.championshipRace?.())return false;
      if(!active)return start(true);
      try {
        if(workshop){
          const old=rival,styles=old.opponents.map(opponent=>({...opponent.driver.style}));
          const next=prepareRival(sim.world,host.getTrack().runtime,race.course,carScale,0,old.laps,old.difficulty,old.opponents.length,true,styles);
          adoptRival(next);sim=rival.opponents[0].sim;race=rival.opponents[0].trial;car=rival.opponents[0].car;wheelViews=rival.opponents[0].wheels;
          tyreMarks.breakTrails();keys.clear();disarmPad();clearCamera();renderCar(0,true);host.message('AI race restarted; personality edits kept.');return true;
        }
        if(rival)slot=currentGridSlot();
        const runtime=host.getTrack().runtime,spawn=TrackRace.spawn(runtime,race.course,carScale,slot);
        const nextRace=rival?createPlayerTrial(race.course):race;
        const next=simulation(sim.world,runtime,spawn,carScale,nextRace);
        const nextRival=rival?prepareRival(sim.world,runtime,nextRace.course,carScale,slot,rival.laps,rival.difficulty,rival.opponents.length):null;
        if(!rival)nextRace.reset('Ready at the starting grid.');
        sim=next;race=nextRace;spawnPosition=spawn;if(nextRival)adoptRival(nextRival);if(soloTimed){soloCountdown=3;soloElapsed=0;soloFinishTime=null;soloStartLap=race.state.completed;}resetRaceEnd();
        keys.clear();disarmPad();clearCamera();renderCar(0,true);host.canvas.focus?.();host.message(`Restarted at grid position ${slot}.`);return true;
      }catch(error){host.message(`Could not restart timed run: ${error.message}`,true);return false;}
    }
    function syncGrid() {$('gridPosition').value=String(gridSlot);$('driveGridPosition').value=String(currentGridSlot());}
    function changeGrid(value) {
      if(active && rival){syncGrid();return;}
      const slot=Number(value);
      if(!Number.isInteger(slot) || slot<1 || slot>8){syncGrid();return;}
      if(active && !restartRace(slot)){syncGrid();return;}
      gridSlot=slot;syncGrid();host.canvas.focus?.();
    }
    function syncDirection() {for(const id of ['raceDirection','driveRaceDirection'])$(id).value=raceDirection===-1?'reverse':'normal';}
    function changeDirection(value) {
      const direction=value==='reverse'?-1:1;
      if(direction===raceDirection){syncDirection();return;}
      if(active && host.championshipRace?.()){syncDirection();host.message('Race direction is fixed for this championship.');return;}
      try {
        let nextRace,next,position,nextRival;
        if(active) {
          const track=host.getTrack();nextRace=createPlayerTrial(TrackRace.plan(track.runtime,track.buffers.road,direction));
          position=spawnPosition.slot?TrackRace.spawn(track.runtime,nextRace.course,carScale,currentGridSlot()):{index:sim.section,fraction:spawnPosition.fraction};
          next=simulation(sim.world,track.runtime,position,carScale,nextRace);
          if(rival)nextRival=prepareRival(sim.world,track.runtime,nextRace.course,carScale,currentGridSlot(),rival.laps,rival.difficulty,rival.opponents.length);
        }
        // Markings and the candidate car must both succeed before committing.
        host.setDirection?.(direction);raceDirection=direction;syncDirection();
        if(next){sim=next;race=nextRace;spawnPosition=position;if(nextRival)adoptRival(nextRival);if(soloTimed){soloCountdown=3;soloElapsed=0;soloFinishTime=null;soloStartLap=0;}if(compactRace){sessionBestLap=null;sessionBestRace=null;}resetRaceEnd();keys.clear();disarmPad();clearCamera();renderCar(0,true);}
        host.canvas.focus?.();host.message(`${direction===-1?'Reverse':'Normal'} direction selected.${active?' New timing session started.':''}`);
      }catch(error){syncDirection();host.message(`Could not change race direction: ${error.message}`,true);}
    }
    function selectQuickPause(index,focus=true){quickPauseIndex=(index+quickPauseItems.length)%quickPauseItems.length;quickPauseItems.forEach((id,i)=>$(id).classList.toggle('quick-nav-selected',i===quickPauseIndex));if(focus)$(quickPauseItems[quickPauseIndex]).focus?.();}
    function quickResume(){setPaused(false);host.canvas.focus?.();}
    function quickSettings(){const open=!document.body.classList.contains('race-settings');if(open)document.body.classList.add('race-settings');else document.body.classList.remove('race-settings');$('quickSettings').textContent=open?'Hide race settings':'Camera & race settings';}
    function quickRestart(){if(raceOver() && host.championshipRace?.())return;if(rival || (race?.course.valid && soloTimed)){if(!restartRace())return;}else reset();quickResume();}
    function activateQuickPause(){[quickResume,quickSettings,()=>host.performance.toggleFps(),()=>host.performance.toggleTriangles(),()=>host.performance.toggleRoute(),quickRestart,stop][quickPauseIndex]();}
    function setPaused(value) {if(!active)return;paused=value;engineSound.setPlaying(!paused && focused && !document.hidden);keys.clear();disarmPad();padReader.reset();$('pauseCar').textContent=paused?'Resume':'Pause';$('aiWorkshopPause').textContent=paused?'Resume':'Pause';$('quickPauseOverlay').hidden=!compactRace || !paused;if(paused && compactRace)selectQuickPause(0,focused && !document.hidden);if(!paused){document.body.classList.remove('race-settings');$('quickSettings').textContent='Camera & race settings';}renderCar();}
    function pause() {setPaused(!paused);}
    function stopFinishedCars(dt){
      if(raceParked)return;
      const elapsed=clamp(dt,0,.1),cars=rival?[sim,...rival.opponents.map(opponent=>opponent.sim)]:[sim];raceStopTime+=elapsed;
      for(const vehicle of cars)vehicle.advance(elapsed,{brake:true});
      if(raceStopTime>=5 || cars.every(vehicle=>vehicle.state.grounded>0 && Math.hypot(vehicle.state.vx,vehicle.state.vz)<.2)){
        for(const vehicle of cars)Object.assign(vehicle.state,{vx:0,vy:0,vz:0});raceParked=true;
      }
    }
    function update(dt) {
      if(!active)return;
      const pad=controller(dt);if(!active)return;
      const throttle=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),steer=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
      if(!paused){const input={throttle:throttle||pad.throttle,steer:steer||pad.steer,handbrake:keys.has('Space')||pad.brake};if(raceOver())stopFinishedCars(dt);else if(rival)updateRival(dt,input);else if(soloTimed){const elapsed=Math.min(.1,Math.max(0,dt)),wait=Math.min(soloCountdown,elapsed);soloCountdown=Math.max(0,soloCountdown-wait);const running=elapsed-wait;if(running>0){soloElapsed+=running;sim.advance(running,input);if(race.course.mode==='sprint' && race.state.finished && soloFinishTime===null)soloFinishTime=soloElapsed;}}else sim.advance(dt,input);}
      const listening=workshop?selectedDiagnostic()?.sim??sim:sim;
      engineSound.setPlaying(!paused && focused && !document.hidden);
      if(raceParked)engineSound.silenceEngine();else engineSound.update(listening.state,listening.build.engine.id,rival?.opponents.filter(opponent=>opponent.sim!==listening).map(opponent=>({state:opponent.sim.state,engine:opponent.sim.build.engine.id}))??[]);
      tyreMarks.flush();
      renderCar(dt);
    }
    $('startDrive').addEventListener('click',()=>start());$('startTimedRun').addEventListener('click',()=>start(true));$('restartTimedRun').addEventListener('click',()=>restartRace());
    for(const id of ['gridPosition','driveGridPosition'])$(id).addEventListener('change',()=>changeGrid($(id).value));
    for(const id of ['raceDirection','driveRaceDirection'])$(id).addEventListener('change',()=>changeDirection($(id).value));
    $('exitDrive').addEventListener('click',stop);$('resetCar').addEventListener('click',reset);$('pauseCar').addEventListener('click',pause);
    $('quickPauseButton').addEventListener('click',pause);$('quickResume').addEventListener('click',quickResume);
    $('quickSettings').addEventListener('click',quickSettings);$('quickRestart').addEventListener('click',quickRestart);
    $('quickExit').addEventListener('click',stop);
    $('quickResultsReplay').addEventListener('click',quickRestart);$('quickResultsExit').addEventListener('click',stop);$('quickResultsNext').addEventListener('click',()=>host.championshipNext?.());
    quickPauseItems.forEach((id,index)=>$(id).addEventListener('focus',()=>selectQuickPause(index,false)));
    $('recoverCar').addEventListener('click',recover);
    for(const id of ['aiDiagnosticCar','aiDiagnosticWatch'])$(id).addEventListener('change',()=>{syncDiagnosticPersonality();clearCamera();if(active)updateCamera(0,true);renderDiagnostics();});
    $('aiDiagnosticPersonality').addEventListener('change',()=>{const opponent=selectedDiagnostic(),profile=profileById($('aiDiagnosticPersonality').value);if(!applyPersonality(opponent,profile))return;syncDiagnosticPersonality();if(workshop)syncWorkshopFields();renderDiagnostics();});
    $('aiDiagnosticGuide').addEventListener('change',renderDiagnostics);
    $('aiDiagnostics').addEventListener('toggle',()=>{clearCamera();if(active)updateCamera(0,true);renderDiagnostics();});
    $('aiDiagnosticCopy').addEventListener('click',async()=>{
      const opponent=selectedDiagnostic();if(!opponent)return;
      const report=describeDiagnostic(opponent,diagnosticSample(opponent),true);
      try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(report);$('aiDiagnosticStatus').textContent='Diagnostic report copied, including the track code.';}
      catch(error){$('aiDiagnosticStatus').textContent='Copy unavailable. Select the displayed details and copy the track code separately.';}
    });
    function syncSound() {for(const prefix of ['editor','drive','options']){$(prefix+'EngineSound').checked=soundEnabled;$(prefix+'EngineVolume').value=String(Math.round(soundVolume*100));$(prefix+'EngineVolumeValue').textContent=`${Math.round(soundVolume*100)}%`;
      $(prefix+'TyreSound').checked=tyresEnabled;$(prefix+'RivalSound').checked=rivalsSoundEnabled;$(prefix+'TyreVolume').value=String(Math.round(tyreVolume*100));$(prefix+'TyreVolumeValue').textContent=`${Math.round(tyreVolume*100)}%`;} $('optionsCheckpointSound').value=checkpointSound;}
    function saveSound() {try{window.localStorage.setItem('trackshift.engineAudio.v1',JSON.stringify({version:1,enabled:soundEnabled,volume:soundVolume,tyres:tyresEnabled,tyreVolume,rivals:rivalsSoundEnabled,checkpoint:checkpointSound}));}catch(error){}}
    for(const prefix of ['editor','drive','options']) {
      $(prefix+'EngineSound').addEventListener('change',()=>{soundEnabled=$(prefix+'EngineSound').checked;engineSound.setEnabled(soundEnabled);syncSound();saveSound();if(active)host.canvas.focus?.();});
      $(prefix+'EngineVolume').addEventListener('input',()=>{const value=Number($(prefix+'EngineVolume').value);if(Number.isFinite(value))soundVolume=clamp(value/100,0,1);engineSound.setVolume(soundVolume);syncSound();saveSound();});
      $(prefix+'EngineVolume').addEventListener('pointerup',()=>{if(active)host.canvas.focus?.();});
      $(prefix+'TyreSound').addEventListener('change',()=>{tyresEnabled=$(prefix+'TyreSound').checked;engineSound.setTyresEnabled(tyresEnabled);syncSound();saveSound();if(active)host.canvas.focus?.();});
      $(prefix+'RivalSound').addEventListener('change',()=>{rivalsSoundEnabled=$(prefix+'RivalSound').checked;engineSound.setRivalsEnabled(rivalsSoundEnabled);syncSound();saveSound();if(active)host.canvas.focus?.();});
      $(prefix+'TyreVolume').addEventListener('input',()=>{const value=Number($(prefix+'TyreVolume').value);if(Number.isFinite(value))tyreVolume=clamp(value/100,0,1);engineSound.setTyreVolume(tyreVolume);syncSound();saveSound();});
      $(prefix+'TyreVolume').addEventListener('pointerup',()=>{if(active)host.canvas.focus?.();});
    }
    $('optionsCheckpointSound').addEventListener('change',()=>{checkpointSound=$('optionsCheckpointSound').value==='beep'?'beep':'speech';engineSound.setCheckpointMode(checkpointSound);syncSound();saveSound();});
    $('unlockEngineSound').addEventListener('click',()=>{soundEnabled=true;engineSound.setEnabled(true);engineSound.unlock();syncSound();saveSound();host.canvas.focus?.();});
    window.addEventListener('pagehide',()=>{engineSound.dispose();tyreMarks.dispose();});
    $('carScale').addEventListener('input',()=>changeSize($('carScale').value));$('driveScale').addEventListener('input',()=>changeSize($('driveScale').value));
    $('defaultCar').addEventListener('click',()=>changeSize(50));$('smallCar').addEventListener('click',()=>changeSize(75));$('originalCar').addEventListener('click',()=>changeSize(100));
    for(const prefix of ['vehicle','driveVehicle']) {
      buildMenu(prefix+'Preset',TrackVehicle.PRESETS,true);
      for(const [part,items] of [['Engine',TrackVehicle.ENGINES],['Tyres',TrackVehicle.TYRES],['Drivetrain',TrackVehicle.DRIVETRAINS],['Suspension',TrackVehicle.SUSPENSIONS],['Steering',TrackVehicle.STEERINGS],['Assist',TrackVehicle.STEERING_ASSISTS]]) {
        buildMenu(prefix+part,items);
        $(prefix+part).addEventListener('change',()=>changeBuild({engine:$(prefix+'Engine').value,tyres:$(prefix+'Tyres').value,drivetrain:$(prefix+'Drivetrain').value,suspension:$(prefix+'Suspension').value,steering:$(prefix+'Steering').value,assist:$(prefix+'Assist').value}));
      }
      $(prefix+'Preset').addEventListener('change',()=>changeBuild($(prefix+'Preset').value));
    }
    $('driveCamera').addEventListener('change',()=>configureView());
    $('driveProjection').addEventListener('change',()=>{$('drivePreset').value='custom';if(active){ensureCamera();updateCamera(0,true);}host.canvas.focus?.();});
    $('driveTracking').addEventListener('change',()=>{$('drivePreset').value='custom';fixedHeading=smoothHeading??sim?.state.yaw??0;clearCamera();if(active)updateCamera(0,true);host.canvas.focus?.();});
    $('driveZoom').addEventListener('input',()=>{$('drivePreset').value='custom';changeZoom(Number($('driveZoom').value));});
    const controls={driveTilt:['tilt',15,85],driveDistance:['distance',6,80],driveOrbit:['orbit',-180,180],driveAhead:['ahead',-12,20],driveSide:['side',-12,12],driveSmooth:['smooth',0,100]};
    for(const [id,[key,min,max]] of Object.entries(controls))$(id).addEventListener('input',()=>{
      tuning[key]=clamp(numeric($(id).value,tuning[key]),min,max);syncTuning();$('drivePreset').value='custom';clearCamera();if(active)updateCamera(0,true);
    });
    for(const id of ['carScale','driveScale','driveZoom',...Object.keys(controls)])$(id).addEventListener('pointerup',()=>host.canvas.focus?.());
    for(const id of ['driveSpeedLook','driveMarker'])$(id).addEventListener('change',()=>{$('drivePreset').value='custom';if(active)updateCamera(0,true);host.canvas.focus?.();});
    $('drivePreset').addEventListener('change',preset);$('saveCamera').addEventListener('click',saveSetup);
    $('recenterCamera').addEventListener('click',recenter);$('resetCamera').addEventListener('click',()=>configureView(true));
    function syncController() {
      for(const id of ['enableController','editorController'])$(id).checked=controllerEnabled;
      for(const id of ['editorControllerRate','driveControllerRate'])$(id).value=String(controllerRate);
    }
    function changeController(id,rate=false) {
      if(rate)controllerRate=Number($(id).value)===30?30:60;else controllerEnabled=$(id).checked;
      if(active && padIndex!==null)setPaused(true);
      padIndex=null;disarmPad();padReader.setRate(controllerRate);syncController();
      try{window.localStorage.setItem('trackshift.controller.v1',JSON.stringify({version:1,enabled:controllerEnabled,rate:controllerRate}));}catch(error){}
      controllerMessage(controllerEnabled?'Release the controller controls to enable input.':'Controller input off · keyboard and mouse available.');
      if(active)host.canvas.focus?.();
    }
    for(const id of ['enableController','editorController'])$(id).addEventListener('change',()=>changeController(id));
    for(const id of ['editorControllerRate','driveControllerRate'])$(id).addEventListener('change',()=>changeController(id,true));
    $('showSuspension').addEventListener('change',()=>{if(probes)probes.visible=$('showSuspension').checked;host.canvas.focus?.();});
    window.addEventListener('keydown',event=>{
      if(!active || event.ctrlKey || event.metaKey || event.altKey)return;
      if(event.code==='Escape'){event.preventDefault();stop();return;}
      if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable)return;
      if(raceOver() && !paused && event.code==='Enter'){event.preventDefault();if(!event.repeat){if(event.target?.id==='quickResultsExit')stop();else if(host.championshipRace?.())host.championshipNext?.();else quickRestart();}return;}
      if(paused && compactRace && !document.body.classList.contains('race-settings')){
        if(event.code==='ArrowUp' || event.code==='ArrowDown'){event.preventDefault();if(!event.repeat)selectQuickPause(quickPauseIndex+(event.code==='ArrowDown'?1:-1));return;}
        if(event.code==='Enter' || event.code==='Space'){event.preventDefault();if(!event.repeat)activateQuickPause();return;}
      }
      if(event.code==='KeyR'){event.preventDefault();if(!event.repeat)reset();return;}
      if(event.code==='KeyQ'){event.preventDefault();if(!event.repeat && !raceOver())recover();return;}
      if(event.code==='KeyP'){event.preventDefault();if(!event.repeat)pause();return;}
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)){event.preventDefault();keys.add(event.code);}
    });
    window.addEventListener('keyup',event=>{keys.delete(event.code);});
    window.addEventListener('blur',()=>{focused=false;keys.clear();disarmPad();if(active && !paused)setPaused(true);});
    window.addEventListener('focus',()=>{focused=true;disarmPad();padReader.reset();});
    document.addEventListener?.('visibilitychange',()=>{if(document.hidden){keys.clear();disarmPad();if(active && !paused)setPaused(true);}});
    window.addEventListener('resize',resize);
    try {savedCamera=validSetup(JSON.parse(window.localStorage.getItem('trackshift.camera.v1')));}catch(error){}
    $('savedCameraOption').disabled=!savedCamera;syncSize();syncBuild();syncSound();syncGrid();syncDirection();syncTuning();syncController();changeZoom(Number($('driveZoom').value)||100);
    function setColour(colour){if(active || !Number.isInteger(colour) || colour<0 || colour>0xffffff)return false;vehicleColour=colour;return true;}
    function setBody(style){if(active || !Object.hasOwn(CAR_BODIES,style))return false;vehicleBody=style;return true;}
    return {start,startWorkshop,stop,update,reset,recover,restartRace,setRaceDirection:changeDirection,setBuild:changeBuild,setColour,setBody,clearMarks:tyreMarks.clear,get colour(){return vehicleColour;},get body(){return vehicleBody;},get tyreMarks(){return tyreMarks.pool;},zoom:delta=>changeZoom(zoomValue()*100*Math.exp(-delta*.001)),get active(){return active;},get workshop(){return workshop;},get camera(){return driveCamera;},get state(){return sim?.state;},get raceState(){return race?.state;},get rival(){return rival;},get opponents(){return rival?.opponents??[];},get gridPosition(){return active?spawnPosition.slot??null:null;},get direction(){return raceDirection;},get build(){return vehicleBuild;}};
  }
  window.TrackDrive={VIEWS,CAR_BODIES,cameraFrame,defaultTuning,gamepadInput,createCarModel,create};
})();
