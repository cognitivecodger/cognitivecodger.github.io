/* TUR menu, editor and test drive. Three.js is supplied locally. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const msg = $('message');
  function message(text, error=false) {msg.textContent=text;msg.classList.toggle('error',error);}
  if(!window.THREE) {document.body.classList.remove('menu-mode');$('mainMenu').hidden=true;message('Could not load Three.js. Please connect to the internet, then reopen index.html.',true);return;}
  let renderer;
  try {renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}
  catch(e) {document.body.classList.remove('menu-mode');$('mainMenu').hidden=true;message(`WebGL could not start: ${e.message}`,true);return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.88;
  $('viewport').appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xabc8d2);
  const ambient=new THREE.HemisphereLight(0xffffff,0x647666,.48);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffffff,1.35);
  const saveDayLighting=()=>({background:scene.background,ambient:ambient.intensity,sun:sun.intensity});
  const applyNightLighting=()=>{scene.background=new THREE.Color(0x0a1321);ambient.intensity=.08;sun.intensity=.035;};
  const restoreDayLighting=saved=>{if(saved){scene.background=saved.background;ambient.intensity=saved.ambient;sun.intensity=saved.sun;}};
  const defaultSun={azimuth:211,elevation:25};
  let sunSettings={...defaultSun},shadowBounds=null;
  const bearing=value=>((Math.round(value)%360)+360)%360;
  try {
    const saved=JSON.parse(window.localStorage.getItem('trackshift.sun.v1'));
    if(saved?.version===1){
      if(Number.isFinite(saved.azimuth))sunSettings.azimuth=bearing(saved.azimuth);
      if(Number.isFinite(saved.elevation))sunSettings.elevation=Math.max(0,Math.min(90,Math.round(saved.elevation)));
    }
  }catch(error){}
  sun.castShadow=true;
  const shadowResolution=Math.min(4096,renderer.capabilities.maxTextureSize);
  sun.shadow.mapSize.set(shadowResolution,shadowResolution);
  sun.shadow.radius=.6;
  sun.shadow.camera.left=-170;sun.shadow.camera.right=170;
  sun.shadow.camera.top=170;sun.shadow.camera.bottom=-170;
  sun.shadow.camera.near=1;sun.shadow.camera.far=400;
  sun.shadow.bias=-.0005;
  sun.shadow.normalBias=.035;
  scene.add(sun,sun.target);
  function frameShadows(buffers) {
    // Cover the actual track AND playable ground, including tracks far from
    // the origin. A smaller light-space footprint gives each shadow more detail.
    const lo={x:Infinity,y:Infinity,z:Infinity},hi={x:-Infinity,y:-Infinity,z:-Infinity};
    for(const buffer of Object.values(buffers)) {
      const p=buffer?.positions;if(!p)continue;
      for(let i=0;i<p.length;i+=3){
        lo.x=Math.min(lo.x,p[i]);hi.x=Math.max(hi.x,p[i]);
        lo.y=Math.min(lo.y,p[i+1]);hi.y=Math.max(hi.y,p[i+1]);
        lo.z=Math.min(lo.z,p[i+2]);hi.z=Math.max(hi.z,p[i+2]);
      }
    }
    if(!Number.isFinite(lo.x))return;
    shadowBounds={lo,hi};positionSun();
  }
  function positionSun() {
    // Bearing describes the LIGHT SOURCE: N=-Z, E=+X, S=+Z, W=-X.
    // A direct camera basis also handles the zenith without a world-up singularity.
    const az=sunSettings.azimuth*Math.PI/180,el=sunSettings.elevation*Math.PI/180;
    const horizontal=sunSettings.elevation===90?0:Math.cos(el),vertical=sunSettings.elevation===0?0:Math.sin(el);
    const dx=Math.sin(az)*horizontal,dy=vertical,dz=-Math.cos(az)*horizontal;
    const right={x:-Math.cos(az),z:-Math.sin(az)},up={x:-Math.sin(az)*vertical,y:horizontal,z:Math.cos(az)*vertical};
    const camera=sun.shadow.camera;camera.up.set(up.x,up.y,up.z);
    if(!shadowBounds){sun.position.set(dx*140,dy*140,dz*140);return;}
    const {lo,hi}=shadowBounds;
    const centre={x:(lo.x+hi.x)/2,y:(lo.y+hi.y)/2,z:(lo.z+hi.z)/2};
    let left=Infinity,rightEdge=-Infinity,bottom=Infinity,top=-Infinity,front=-Infinity,back=Infinity;
    for(const x of [lo.x,hi.x])for(const y of [lo.y,hi.y])for(const z of [lo.z,hi.z]) {
      const px=x-centre.x,py=y-centre.y,pz=z-centre.z;
      const u=px*right.x+pz*right.z,v=px*up.x+py*up.y+pz*up.z,w=px*dx+py*dy+pz*dz;
      left=Math.min(left,u);rightEdge=Math.max(rightEdge,u);bottom=Math.min(bottom,v);top=Math.max(top,v);front=Math.max(front,w);back=Math.min(back,w);
    }
    const distance=Math.max(50,front+20);
    sun.target.position.set(centre.x,centre.y,centre.z);
    sun.position.set(centre.x+dx*distance,centre.y+dy*distance,centre.z+dz*distance);
    sun.target.updateMatrixWorld();sun.updateMatrixWorld();
    camera.left=left-2;camera.right=rightEdge+2;camera.bottom=bottom-2;camera.top=top+2;
    camera.near=Math.max(.1,distance-front-2);camera.far=distance-back+2;
    camera.updateProjectionMatrix();
    sun.shadow.needsUpdate=true;
  }
  function syncSun() {
    const {azimuth,elevation}=sunSettings,compass=$('sunCompass');
    $('sunAzimuth').value=String(azimuth);$('sunElevation').value=String(elevation);
    const direction=['N','NE','E','SE','S','SW','W','NW'][Math.round(azimuth/45)%8];
    $('sunBearingValue').textContent=`${azimuth}° · ${direction}`;$('sunElevationValue').textContent=`${elevation}°`;
    $('sunBearingNeedle').style.transform=`rotate(${azimuth}deg)`;
    compass.setAttribute('aria-valuenow',String(azimuth));compass.setAttribute('aria-valuetext',`${azimuth} degrees, ${direction}`);
  }
  function saveSun() {try{window.localStorage.setItem('trackshift.sun.v1',JSON.stringify({version:1,...sunSettings}));}catch(error){}}
  function setSun(azimuth=sunSettings.azimuth,elevation=sunSettings.elevation) {
    if(!Number.isFinite(azimuth)||!Number.isFinite(elevation))return;
    sunSettings={azimuth:bearing(azimuth),elevation:Math.max(0,Math.min(90,Math.round(elevation)))};
    syncSun();positionSun();
  }
  $('sunAzimuth').addEventListener('input',()=>{if($('sunAzimuth').value.trim()!=='')setSun(Number($('sunAzimuth').value));});
  $('sunAzimuth').addEventListener('change',()=>{syncSun();saveSun();});
  $('sunElevation').addEventListener('input',()=>setSun(undefined,Number($('sunElevation').value)));
  $('sunElevation').addEventListener('change',saveSun);
  $('resetSun').addEventListener('click',()=>{setSun(defaultSun.azimuth,defaultSun.elevation);saveSun();});
  const sunCompass=$('sunCompass');let sunPointer=null;
  function pointSun(event) {
    const rect=sunCompass.getBoundingClientRect(),x=event.clientX-rect.left-rect.width/2,y=event.clientY-rect.top-rect.height/2;
    if(Math.hypot(x,y)<6)return;
    setSun(Math.atan2(x,-y)*180/Math.PI);
  }
  sunCompass.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();sunCompass.focus();sunPointer=event.pointerId;sunCompass.setPointerCapture?.(event.pointerId);pointSun(event);});
  sunCompass.addEventListener('pointermove',event=>{if(sunPointer===event.pointerId)pointSun(event);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])sunCompass.addEventListener(name,event=>{if(sunPointer===event.pointerId){sunPointer=null;saveSun();}});
  sunCompass.addEventListener('keydown',event=>{
    const key=event.key,step=event.shiftKey?15:1;let value=sunSettings.azimuth;
    if(['ArrowRight','ArrowUp'].includes(key))value+=step;
    else if(['ArrowLeft','ArrowDown'].includes(key))value-=step;
    else if(key==='PageUp')value+=15;else if(key==='PageDown')value-=15;
    else if(key==='Home')value=0;else if(key==='End')value=359;else return;
    event.preventDefault();event.stopPropagation?.();setSun(value);saveSun();
  });
  syncSun();positionSun();
  function updateSlopeContrast() {
    const contrast=Math.max(0,Math.min(1,Number($('slopeContrast').value)));
    // Keep flat-road illumination roughly constant while redistributing fill
    // into directional light. Exposure remains the separate brightness control.
    ambient.intensity=.95-.72*contrast;
    sun.intensity=.74+.94*contrast;
    $('slopeContrastValue').textContent=`${Math.round(contrast*100)}%`;
  }
  $('slopeContrast').addEventListener('input',updateSlopeContrast);updateSlopeContrast();
  let world=new THREE.Group();scene.add(world);
  let runtime=null, road=null, kerbs=null,walls=null,fences=null,ground=null,sceneryLayer=null,debug=null,raceMarkers=null,checkpointMarkers=null,crossingArrows=null,boostLayer=null;
  let editor=null,selection=null,gapMarkers=null,drive=null,garage=null,driveBuffers=null,library=null,quickSession=null,menuControls=null,menuPreview=null,previewDayLighting=null,defaultPacksLoading=false,editorAITest=null;
  let editorPreviewEnvironment='default';$('editorEnvironment').value='default';
  const editorEnvironmentFor=track=>editorPreviewEnvironment==='default'?track.settings.environment:editorPreviewEnvironment;
  function updateGapVisibility() {
    if(gapMarkers)gapMarkers.visible=!$('editorPanel').hidden && !drive?.active && !document.body.classList.contains('menu-mode');
    const treeAreas=world?.children.find(child=>child.name==='Tree placement areas');
    if(treeAreas)treeAreas.visible=$('showTreeAreas').checked && !drive?.active && !document.body.classList.contains('menu-mode');
  }
  const viewCamera={target:new THREE.Vector3(),distance:140,theta:.75,phi:.70,zoom:1,projection:'orthographic'};
  let perspective, ortho, camera;
  function updateEditorOrientation() {
    const active=drive?.active===true;
    $('editorCompass').hidden=active;
    $('trackStartMarker').hidden=$('sectionStartMarker').hidden=true;
    if(active || !camera)return;
    const theta=viewCamera.theta,c=Math.cos(viewCamera.phi),normal=(x,y)=>{const length=Math.hypot(x,y);return {x:x/length,y:y/length};};
    const north=normal(Math.sin(theta),-Math.cos(theta)*c),east=normal(Math.cos(theta),Math.sin(theta)*c);
    const line=(id,a,b)=>{const el=$(id);el.setAttribute('x1',50+a.x*26);el.setAttribute('y1',50+a.y*26);el.setAttribute('x2',50+b.x*26);el.setAttribute('y2',50+b.y*26);};
    line('editorCompassEastAxis',{x:-east.x,y:-east.y},east);line('editorCompassSouthAxis',{x:0,y:0},{x:-north.x,y:-north.y});line('editorCompassNorthAxis',{x:0,y:0},north);
    $('editorCompassNorthTip').setAttribute('points',`${50+north.x*29},${50+north.y*29} ${50+north.x*16-north.y*4},${50+north.y*16+north.x*4} ${50+north.x*16+north.y*4},${50+north.y*16-north.x*4}`);
    for(const [id,d] of [['editorCompassN',north],['editorCompassS',{x:-north.x,y:-north.y}],['editorCompassE',east],['editorCompassW',{x:-east.x,y:-east.y}]]){
      $(id).setAttribute('x',50+d.x*39);$(id).setAttribute('y',50+d.y*39);
    }
    // At almost ground level the east/north projections can coincide. Keep
    // north readable instead of stacking cardinal letters on top of it.
    const crowded=Math.abs(north.x*east.x+north.y*east.y)>.9;
    $('editorCompassE').style.visibility=$('editorCompassW').style.visibility=crowded?'hidden':'visible';
    const angle=Math.atan2(north.x,-north.y),directions=['up','upper right','right','lower right','down','lower left','left','upper left'];
    $('editorNorthUp').setAttribute('aria-label',`Align north up. North currently points ${directions[(Math.round(angle/(Math.PI/4))+8)%8]}.`);
    const selected=!$('editorPanel').hidden?runtime?.pieces[editor?.selectedIndex??0]:null;
    $('editorFindStart').disabled=!runtime;
    $('editorFindStart').title=selected?`Centre on ${selected.isClose?'auto-close':`section ${(editor?.selectedIndex??0)+1}`} start`:'Centre on track start';
    if(!runtime || !$('showEditorStarts').checked)return;
    camera.updateMatrixWorld();
    const place=(id,arrow,p,label)=>{
      const y=p.y+runtime.settings.tarmacDepth*.5+.15,heading=p.yaw*Math.PI/180;
      const point=new THREE.Vector3(p.x,y,p.z).project(camera),front=new THREE.Vector3(p.x+Math.sin(heading),y,p.z+Math.cos(heading)).project(camera),el=$(id);
      el.hidden=point.z< -1 || point.z>1 || Math.abs(point.x)>1 || Math.abs(point.y)>1;
      el.style.left=(point.x+1)*window.innerWidth/2+'px';el.style.top=(1-point.y)*window.innerHeight/2+'px';
      $(arrow).style.transform=`rotate(${Math.atan2((front.x-point.x)*window.innerWidth,(front.y-point.y)*window.innerHeight)}rad)`;
      el.setAttribute('aria-label',label);
    };
    place('trackStartMarker','trackStartArrow',runtime.pieces[0].start,'Track start: first point in the track code');
    if(selected && (editor?.selectedIndex??0)>0){
      const label=selected.isClose?'Auto-close start':`${selected.isGap?'Gap':'Section'} ${editor.selectedIndex+1} start`;
      $('sectionStartLabel').textContent=label;place('sectionStartMarker','sectionStartArrow',selected.start,label);
    }
  }
  $('editorNorthUp').addEventListener('click',()=>{if(drive?.active)return;viewCamera.theta=0;updateCamPosition();});
  $('editorFindStart').addEventListener('click',()=>{
    if(drive?.active || !runtime)return;
    const p=(!$('editorPanel').hidden?runtime.pieces[editor?.selectedIndex??0]:null)?.start??runtime.pieces[0].start;
    viewCamera.target.set(p.x,p.y,p.z);updateCamPosition();
  });
  $('showEditorStarts').addEventListener('change',updateEditorOrientation);
  function updateCameras() {
    const aspect=window.innerWidth/Math.max(1,window.innerHeight);
    const viewSize=viewCamera.distance*.85/viewCamera.zoom;
    // A 30 cm near plane preserves depth precision between thin slab faces.
    perspective=new THREE.PerspectiveCamera(46,aspect,.3,5000);
    ortho=new THREE.OrthographicCamera(-viewSize*aspect/2,viewSize*aspect/2,viewSize/2,-viewSize/2,.3,5000);
    camera=viewCamera.projection==='perspective'?perspective:ortho;
    updateCamPosition();
  }
  function updateCamPosition() {
    if(!camera)return;
    const v=viewCamera;
    const sp=Math.sin(v.phi),cp=Math.cos(v.phi);
    const offset=new THREE.Vector3(Math.sin(v.theta)*sp,cp,Math.cos(v.theta)*sp).multiplyScalar(v.distance / (v.projection==='perspective' ? v.zoom : 1));
    camera.position.copy(v.target).add(offset);
    camera.up.set(0,1,0);
    camera.lookAt(v.target);
    camera.updateProjectionMatrix();
    updateEditorOrientation();
  }
  function disposeLayer(obj) {
    if(!obj)return;
    const geometries=new Set(),materials=new Set();
    obj.traverse(c=>{if(c.geometry)geometries.add(c.geometry); if(c.material){(Array.isArray(c.material)?c.material:[c.material]).forEach(m=>materials.add(m));}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    if(obj.parent)obj.parent.remove(obj);
  }
  function meshFrom(buffer,name) {
    const geometry=buffer.geometry();
    let material;
    try {
      material=TrackGeometry.material();
      // Closed profiles cast from their back faces, avoiding self-shadow
      // striping on the finer map while retaining their cast silhouettes.
      if(['Road','Kerbs','Fences'].includes(name))material.shadowSide=THREE.BackSide;
      const mesh=new THREE.Mesh(geometry,material);
      mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=true;
      return mesh;
    } catch(err) {geometry.dispose();if(material)material.dispose();throw err;}
  }
  function addTreeAreaBoundaries(parent,forests,groundY) {
    if(!forests?.length)return;
    const positions=[];
    for(const forest of forests)for(let i=0;i<forest.points.length;i++){
      const a=forest.points[i],b=forest.points[(i+1)%forest.points.length];
      positions.push(a.x,groundY+.12,a.z,b.x,groundY+.12,b.z);
    }
    const geometry=new THREE.BufferGeometry();let material;
    try {
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      material=new THREE.LineBasicMaterial({color:0xe55bff,depthTest:false,depthWrite:false,toneMapped:false});
      const lines=new THREE.LineSegments(geometry,material);lines.name='Tree placement areas';lines.renderOrder=1000;lines.visible=false;parent.add(lines);
    }catch(error){geometry.dispose();material?.dispose();throw error;}
  }
  function addLavaSurface(parent,terrain) {
    if(!terrain.lava?.triangles)return;
    const mesh=raceMeshFrom(terrain.lava,'Lava pools',false);
    mesh.castShadow=false;mesh.receiveShadow=false;parent.add(mesh);
  }
  function addGrassCoverShadow(parent,terrain) {
    if(!terrain.coverShadow?.triangles)return;
    const mesh=meshFrom(terrain.coverShadow,'Grass cover shadow');
    mesh.material.colorWrite=false;mesh.material.depthWrite=false;mesh.receiveShadow=false;
    parent.add(mesh);
  }
  function raceMeshFrom(buffer,name,night=quickSession?.night===true) {
    const geometry=buffer.geometry();let material;
    try {
      // Daytime editor markings remain bright and readable. At night use a
      // lit material so the paint darkens with the road and catches headlights.
      const Material=night?THREE.MeshLambertMaterial:THREE.MeshBasicMaterial;
      material=new Material({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
      const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=night;return mesh;
    }catch(error){geometry.dispose();material?.dispose();throw error;}
  }
  function makeNightSceneryLights(placements){
    const group=new THREE.Group();group.name='Night scenery lights';
    const stands=[],towers=[],point=(p,x,z)=>({x:p.x+p.lx*x+p.fx*z,z:p.z+p.lz*x+p.fz*z});
    for(const p of placements){
      if(p.kind==='stand'){
        const length=p.modelLength??11.4,count=Math.min(5,Math.max(1,Math.ceil(length/14)));
        for(let i=0;i<count;i++){const z=(i+.5)*length/count-length/2,origin=point(p,-p.side*.5,z),target=point(p,-p.side*4.7,z);
          stands.push({x:origin.x,y:p.ground+3.5,z:origin.z,tx:target.x,ty:p.ground,tz:target.z,building:p});}
      }else if(p.kind==='building')towers.push({x:p.x,y:p.ground+4.5,z:p.z});
    }
    // Keep a bounded pool because every active light adds GPU work, especially
    // alongside the headlights of an eight-car field. Prioritise fixtures in
    // the camera view, including those far from the player when zoomed out.
    const lamps=Array.from({length:Math.min(12,stands.length)},()=>{const lamp=new THREE.SpotLight(0xffe6ad,0,15,.8,.6,1.3),target=new THREE.Object3D();lamp.name='Bleacher spotlight';lamp.target=target;group.add(lamp,target);return lamp;});
    const glows=Array.from({length:Math.min(6,towers.length)},()=>{const lamp=new THREE.PointLight(0xffc257,0,10,1.5);lamp.name='Tower window glow';group.add(lamp);return lamp;});
    let elapsed=Infinity;
    function update(state,camera,dt=0){
      if(!state)return;elapsed+=dt;if(elapsed<.25)return;elapsed=0;
      if(camera?.isCamera)camera.updateMatrixWorld();
      const nearest=items=>items.map(item=>{
        const d=(item.x-state.x)**2+(item.z-state.z)**2;
        const p=camera?.isCamera?new THREE.Vector3(item.x,item.y,item.z).project(camera):null;
        const visible=!!p && p.z>=-1 && p.z<=1 && Math.abs(p.x)<=1.15 && Math.abs(p.y)<=1.15;
        return {item,d,visible};
      }).filter(entry=>entry.visible || entry.d<250**2).sort((a,b)=>Number(b.visible)-Number(a.visible)||a.d-b.d);
      const spread=(entries,count)=>{const chosen=[],used=new Set();if(!count)return chosen;for(const entry of entries){if(!used.has(entry.item.building)){chosen.push(entry.item);used.add(entry.item.building);if(chosen.length===count)return chosen;}}
        for(const entry of entries)if(!chosen.includes(entry.item)){chosen.push(entry.item);if(chosen.length===count)break;}return chosen;};
      const spotCandidates=spread(nearest(stands),lamps.length),towerCandidates=nearest(towers).slice(0,glows.length).map(entry=>entry.item);
      // Preserve the fixture already assigned to each slot wherever possible,
      // so a change in ordering does not make its light flash.
      function assign(slots,chosen,light){const pending=chosen.filter(p=>!slots.some(slot=>slot.nightFixture===p));
        for(const slot of slots){const p=chosen.includes(slot.nightFixture)?slot.nightFixture:pending.shift();slot.nightFixture=p??null;slot.intensity=p?light:0;
          if(p){slot.position.set(p.x,p.y,p.z);if(slot.target)slot.target.position.set(p.tx,p.ty,p.tz);}}}
      assign(lamps,spotCandidates,5);assign(glows,towerCandidates,.8);
    }
    return {group,update};
  }
  function attachNightScenery(scenery,mesh){
    if(scenery.nightWindows?.triangles){const geometry=scenery.nightWindows.geometry();let material;try{material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false});const windows=new THREE.Mesh(geometry,material);windows.name='Illuminated tower windows';mesh.add(windows);}catch(error){geometry.dispose();material?.dispose();throw error;}}
    const lights=makeNightSceneryLights(scenery.placements);mesh.add(lights.group);return lights;
  }
  // Count the generated visual track, not collision meshes, dynamic cars or
  // renderer draw calls. Hidden/static layers and markings remain in the total.
  function trackTriangleCount(){
    let total=0;
    for(const root of [road,kerbs,walls,fences,ground,sceneryLayer,raceMarkers,checkpointMarkers,crossingArrows])root?.traverse(node=>{
      const geometry=node.geometry;if(!geometry || node.isLine || node.isLineSegments)return;
      const position=geometry.attributes?.position,index=geometry.index;
      const count=index?(index.count??index.array?.length??0):(position?.count??(position?.array?.length??0)/(position?.itemSize??3));
      total+=Math.floor(count/3);
    });
    return total;
  }
  function createPerformanceDisplay(){
    const key='trackshift.performance.v1';let active=false,fps=false,triangles=false,route=false,last=null,elapsed=0,frames=0,lastTriangles=-Infinity;
    try{const saved=JSON.parse(window.localStorage.getItem(key));if(saved?.version===1){fps=saved.fps===true;triangles=saved.triangles===true;route=saved.route===true;}}catch(error){}
    function reset(){last=null;elapsed=0;frames=0;$('racePerformanceFps').textContent='—';}
    function refreshTriangles(){if(active && triangles)$('racePerformanceTriangles').textContent=trackTriangleCount().toLocaleString();}
    function sync(){
      $('quickStatsFps').textContent=`FPS: ${fps?'On':'Off'}`;$('quickStatsFps').setAttribute('aria-pressed',String(fps));
      $('quickStatsTriangles').textContent=`Track triangles: ${triangles?'On':'Off'}`;$('quickStatsTriangles').setAttribute('aria-pressed',String(triangles));
      $('quickStatsRoute').textContent=`Route diagnostics: ${route?'On':'Off'}`;$('quickStatsRoute').setAttribute('aria-pressed',String(route));
      for(const id of ['driveStatsRoute','workshopStatsRoute'])$(id).checked=route;
      for(const id of ['driveStatsFps','workshopStatsFps'])$(id).checked=fps;
      for(const id of ['driveStatsTriangles','workshopStatsTriangles'])$(id).checked=triangles;
      $('racePerformanceHud').hidden=!active || (!fps&&!triangles&&!route);$('raceRouteDiagnostics').hidden=!route;$('racePerformanceFpsRow').hidden=!fps;$('racePerformanceTrianglesRow').hidden=!triangles;
      if(!fps)reset();refreshTriangles();
    }
    function set(kind,value){
      if(kind==='fps'){if(fps!==value)reset();fps=value;}else if(kind==='triangles')triangles=value;else route=value;
      try{window.localStorage.setItem(key,JSON.stringify({version:1,fps,triangles,route}));}catch(error){}
      sync();
    }
    $('quickStatsFps').addEventListener('click',()=>set('fps',!fps));$('quickStatsTriangles').addEventListener('click',()=>set('triangles',!triangles));
    $('quickStatsRoute').addEventListener('click',()=>set('route',!route));
    for(const id of ['driveStatsRoute','workshopStatsRoute'])$(id).addEventListener('change',()=>set('route',$(id).checked));
    for(const id of ['driveStatsFps','workshopStatsFps'])$(id).addEventListener('change',()=>set('fps',$(id).checked));
    for(const id of ['driveStatsTriangles','workshopStatsTriangles'])$(id).addEventListener('change',()=>set('triangles',$(id).checked));
    document.addEventListener?.('visibilitychange',()=>{if(document.hidden)reset();});
    sync();
    return {toggleFps:()=>set('fps',!fps),toggleTriangles:()=>set('triangles',!triangles),toggleRoute:()=>set('route',!route),setRouteInfo(info){if(!active || !route)return;for(const [id,value] of Object.entries(info))$(id).textContent=value;},setActive(value){active=value;lastTriangles=-Infinity;reset();sync();},
      frame(now){if(!active)return;if(triangles && now-lastTriangles>=1000){lastTriangles=now;refreshTriangles();}
        if(!fps || document.hidden || !Number.isFinite(now)){if(last!==null)reset();return;}
        if(last!==null){const delta=now-last;if(delta>0 && delta<3000){elapsed+=delta;frames++;if(elapsed>=500){$('racePerformanceFps').textContent=String(Math.round(frames*1000/elapsed));elapsed=0;frames=0;}}
          else if(delta>=3000 || delta<0)reset();}
        last=now;
      }};
  }
  const performanceDisplay=createPerformanceDisplay();
  function updateSceneryStatus(environment=quickSession?.environment??editorEnvironmentFor(runtime)){
    const stats=sceneryLayer?.userData?.stats;
    const count=(n,label)=>`${n} ${n===1?label:label==='cactus'?'cacti':label+'s'}`;
    const manual=runtime?.pieces.some(p=>['SCL','SCR'].some(key=>p.source?.[key] && p.source[key]!=='none'));
    $('sceneryStatus').textContent=stats?.total?`${stats.total} placed · ${count(stats.stands,'stand')}, ${count(stats.buildings,'building')}, ${count(stats.bridges,'bridge')}, ${count(stats.parking,'car park')}.`:manual?'Requested buildings could not be placed. Check the section scenery settings.':!runtime?.settings.scenery?'Buildings are off.':'No suitable clear ground found for buildings.';
    $('tyreBarrierStatus').textContent=stats?.tyreStacks?`${count(stats.tyreStacks,'tyre stack')} placed${stats.tyreStacks>=1200?' · track limit reached':''}.`:'No tyre stacks placed.';
    const waterName=environment==='volcanic'?'lava pool':environment==='desert'?'dry basin':'pond',treeName=environment==='volcanic'?'basalt formation':environment==='desert'?'cactus':'tree';
    $('natureStatus').textContent=environment==='city'?`${count(stats?.cityBuildings??0,'city building')} · ${count(stats?.trees??0,'tree')} · ${count(stats?.rocks??0,'rock')} · ${count(stats?.bushes??0,'bush')} placed.`:stats?.ponds || stats?.trees || stats?.rocks || stats?.bushes?`${count(stats.ponds,waterName)} \u00b7 ${count(stats.trees,treeName)} \u00b7 ${count(stats.rocks,'rock')} \u00b7 ${count(stats.bushes,'bush')} placed.`:'No nature scenery placed.';
  }
  function rebuildLayers(nextRuntime=runtime) {
    if(!nextRuntime)return false;
    const nextWorld=new THREE.Group();
    let nextRoad,nextKerbs,nextWalls,nextFences,nextGround,nextScenery,nextNightSceneryLights,nextDebug,nextSelection,nextGapMarkers,nextBuffers,nextRaceMarkers,nextCheckpointMarkers,nextCrossingArrows,nextBoostLayer,geomStats;
    try {
      const gm=TrackGeometry.generateRoad(nextRuntime);
      nextRoad=meshFrom(gm,'Road');nextRoad.userData={pieceRanges:gm.visual?.pieceRanges??gm.pieceRanges};nextWorld.add(nextRoad);
      const features=TrackGeometry.generateSideFeatures(nextRuntime,{sideMode:$('sideMode').value,wallRampLength:Number($('wallRamp').value),flattenUnderpass:$('flattenUnderpass').checked,flattenBy:Number($('flattenBy').value)});
      const environment=quickSession?.environment??editorEnvironmentFor(nextRuntime);
      const terrain=TrackTerrain.generate(nextRuntime,{road:gm,kerbs:features.kerbs,walls:features.walls},{environment});
      nextBuffers={road:gm,kerbs:features.kerbs,walls:features.walls,fenceCollision:features.fenceCollision,ground:terrain.ground,cuttings:terrain.cuttings,portalkerb:terrain.portalkerb};
      if(TrackScenery.enabled(nextRuntime,{environment})){const scenery=TrackScenery.generate(nextRuntime,terrain,{sideMode:$('sideMode').value,night:quickSession?.night===true,environment});TrackTerrain.applyPonds(terrain,scenery.ponds,nextRuntime.settings);nextBuffers.ground=terrain.ground;nextScenery=meshFrom(scenery.visual,'Trackside scenery');nextScenery.userData={placements:scenery.placements,tyreStacks:scenery.tyreStacks,ponds:scenery.ponds,trees:scenery.trees,forests:scenery.forests,rocks:scenery.rocks,bushes:scenery.bushes,cityBuildings:scenery.cityBuildings,stats:scenery.stats};nextWorld.add(nextScenery);nextBuffers.scenery=scenery.collision;nextBuffers.sceneryVisual=scenery.visual;
        if(!quickSession)addTreeAreaBoundaries(nextWorld,scenery.forests,terrain.height);
        if(quickSession?.night)nextNightSceneryLights=attachNightScenery(scenery,nextScenery);
      }
      nextRaceMarkers=raceMeshFrom(TrackGeometry.generateRaceMarkers(nextRuntime,gm,'startFinish',drive?.direction??1),'Race markers');nextWorld.add(nextRaceMarkers);
      nextCheckpointMarkers=raceMeshFrom(TrackGeometry.generateRaceMarkers(nextRuntime,gm,'checkpoints',drive?.direction??1),'Checkpoint markings');nextWorld.add(nextCheckpointMarkers);
      nextCrossingArrows=raceMeshFrom(TrackGeometry.generateCrossingArrows(nextRuntime,gm,drive?.direction??1),'Crossroad arrows');nextWorld.add(nextCrossingArrows);
      const boostDirection=quickSession?.boostDirection??drive?.direction??1;
      nextBuffers.boostPads=TrackBoost.plan(nextRuntime,boostDirection);
      nextBoostLayer=raceMeshFrom(TrackGeometry.generateBoostPads(nextRuntime,gm,boostDirection),'Boost pads');nextWorld.add(nextBoostLayer);
      nextKerbs=meshFrom(features.kerbs,'Kerbs');nextWorld.add(nextKerbs);
      nextWalls=meshFrom(features.walls,'Walls');nextWorld.add(nextWalls);
      nextFences=meshFrom(features.fences,'Fences');nextWorld.add(nextFences);
      nextGround=new THREE.Group();nextGround.name='Terrain';nextWorld.add(nextGround);
      const grass=meshFrom(terrain.ground,'Grass');grass.castShadow=false;nextGround.add(grass);addLavaSurface(nextGround,terrain);
      addGrassCoverShadow(nextGround,terrain);
      nextGround.add(meshFrom(terrain.cuttings,'Soil cuttings'));
      if(terrain.portalkerb.triangles)nextGround.add(meshFrom(terrain.portalkerb,'Grass cover kerbs'));
      // Debug uses the original centre/edge/rib/pose concepts.
      nextDebug=TrackGeometry.debugGroup(nextRuntime,{});nextWorld.add(nextDebug);
      nextSelection=TrackGeometry.selectionGroup(nextRuntime,editor?.selectedIndex??0,gm);
      nextSelection.visible=!$('editorPanel').hidden;nextWorld.add(nextSelection);
      nextGapMarkers=TrackGeometry.gapMarkerGroup(nextRuntime);nextWorld.add(nextGapMarkers);
      const rendered=b=>(b.visual??b).triangles.toLocaleString();
      geomStats=`Road ${rendered(gm)} triangles · Kerbs ${rendered(features.kerbs)} · Walls ${rendered(features.walls)} · Fences ${rendered(features.fences)} · Terrain ${terrain.stats.triangles.toLocaleString()} · ${features.stats.wallTransitions} wall endpoints · ${features.stats.kerbCaps} kerb end caps · ${features.stats.bridgeClips} bridge-clearance samples · ${features.stats.levelCrossings} level crossing${features.stats.levelCrossings===1?'':'s'}`;
    } catch(err) {
      disposeLayer(nextWorld);
      message(`Could not generate track: ${err.message}`,true);
      return false;
    }
    // Commit only after every replacement layer has been built successfully.
    drive?.stop();
    drive?.clearMarks();
    const previousWorld=world;
    world=nextWorld;scene.add(world);
    road=nextRoad;kerbs=nextKerbs;walls=nextWalls;fences=nextFences;ground=nextGround;sceneryLayer=nextScenery??null;debug=nextDebug;selection=nextSelection;
    gapMarkers=nextGapMarkers;updateGapVisibility();
    raceMarkers=nextRaceMarkers;checkpointMarkers=nextCheckpointMarkers;crossingArrows=nextCrossingArrows;boostLayer=nextBoostLayer;
    if(quickSession)quickSession.nightSceneryLights=nextNightSceneryLights??null;
    runtime=nextRuntime;
    driveBuffers=nextBuffers;
    frameShadows(driveBuffers);
    updateLayersVisibility();
    $('geomStats').textContent=geomStats;
    updateSceneryStatus();
    updateTrackInformation();
    syncShapeControls();
    if(quickSession && !quickSession.staged){quickSession.staged=true;scene.remove(previousWorld);}
    else disposeLayer(previousWorld);
    return true;
  }
  function updateLayersVisibility() {
    if(road)road.visible=$('showRoad').checked;
    if(crossingArrows)crossingArrows.visible=$('showRoad').checked;
    if(boostLayer)boostLayer.visible=$('showRoad').checked && (!drive?.active || (quickSession?quickSession.specials:$('editorBoostMode').value==='specials'));
    if(kerbs)kerbs.visible=$('showKerbs').checked;
    if(walls)walls.visible=$('showWalls').checked;
    if(fences)fences.visible=$('showFences').checked;
    if(ground)ground.visible=$('showGround').checked;
    if(sceneryLayer)sceneryLayer.visible=$('showGround').checked && $('groundLevel').value!=='lowered';
    updateGroundPreview();
    if(debug)debug.visible=$('showDebug').checked;
    updateRaceVisibility();
    updateWireframe();
  }
  function updateWireframe() {
    const enabled=$('showWireframe').checked;$('driveWireframe').checked=enabled;
    for(const layer of [road,kerbs,walls,fences])if(layer){
      for(const material of (Array.isArray(layer.material)?layer.material:[layer.material]))if(material && material.wireframe!==enabled){material.wireframe=enabled;material.needsUpdate=true;}
    }
    const selectedSurface=selection?.children.find(child=>child.name==='Selection surface');if(selectedSurface)selectedSurface.visible=!enabled;
  }
  function updateRaceVisibility() {
    if(raceMarkers)raceMarkers.visible=$('showStartFinish').checked;
    if(checkpointMarkers)checkpointMarkers.visible=$('showCheckpoints').checked;
    $('driveShowStartFinish').checked=$('showStartFinish').checked;
    $('driveShowCheckpoints').checked=$('showCheckpoints').checked;
  }
  function setRaceDirection(direction) {
    if(!runtime || !driveBuffers)return;
    let lines,checkpoints,arrows,boosts;
    try {
      lines=raceMeshFrom(TrackGeometry.generateRaceMarkers(runtime,driveBuffers.road,'startFinish',direction),'Race markers');
      checkpoints=raceMeshFrom(TrackGeometry.generateRaceMarkers(runtime,driveBuffers.road,'checkpoints',direction),'Checkpoint markings');
      arrows=raceMeshFrom(TrackGeometry.generateCrossingArrows(runtime,driveBuffers.road,direction),'Crossroad arrows');
      boosts=raceMeshFrom(TrackGeometry.generateBoostPads(runtime,driveBuffers.road,direction),'Boost pads');
    }catch(error){if(lines)disposeLayer(lines);if(checkpoints)disposeLayer(checkpoints);if(arrows)disposeLayer(arrows);if(boosts)disposeLayer(boosts);throw error;}
    world.add(lines,checkpoints,arrows);disposeLayer(raceMarkers);disposeLayer(checkpointMarkers);disposeLayer(crossingArrows);
    world.add(boosts);disposeLayer(boostLayer);boostLayer=boosts;driveBuffers.boostPads=TrackBoost.plan(runtime,direction);
    raceMarkers=lines;checkpointMarkers=checkpoints;crossingArrows=arrows;crossingArrows.visible=$('showRoad').checked;boostLayer.visible=$('showRoad').checked && (!drive?.active || (quickSession?quickSession.specials:$('editorBoostMode').value==='specials'));updateRaceVisibility();
    $('raceSetupSummary').textContent=TrackRace.plan(runtime,driveBuffers.road,direction).message;
  }
  function restoreEditorAITest(){
    const previous=editorAITest;editorAITest=null;if(!previous || runtime!==previous.runtime)return;
    if(previous.hadMarkers)runtime.temporaryRaceMarkers=previous.markers;else delete runtime.temporaryRaceMarkers;
    if(previous.changedMarkers)try{setRaceDirection(drive?.direction??1);}catch(error){message('Could not restore editor race markings: '+error.message,true);}
  }
  function updateGroundPreview() {
    if(!ground || !runtime)return;
    ground.position.y=drive?.active || $('groundLevel').value!=='lowered'?0:
      Math.min(0,runtime.bounds.min.y-runtime.settings.tarmacDepth*.5-.08-runtime.settings.groundY);
  }
  function fitView(preset=true) {
    if(!runtime)return;
    const b=runtime.bounds;
    viewCamera.target.set((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2);
    const span=Math.max(45,b.max.x-b.min.x,b.max.z-b.min.z);
    viewCamera.distance=span*1.65;
    viewCamera.zoom=1;
    if(preset)applyPreset();
    if(window.innerWidth>750) {
      // Frame inside the space between the controls, rather than behind them.
      // The menu hides the editor panels with display:none. Temporarily restore
      // their layout while measuring so startup and menu-opened tracks use the
      // same framing as the visible editor. This is synchronous and never paints.
      const menuHidden=document.body.classList.contains('menu-mode');
      let left,right;
      if(menuHidden)document.body.classList.remove('menu-mode');
      try {
        left=$('panel').getBoundingClientRect?.().right??395;
        right=$('editorPanel').hidden?14:(window.innerWidth-($('editorPanel').getBoundingClientRect?.().left??(window.innerWidth-351)));
      } finally {if(menuHidden)document.body.classList.add('menu-mode');}
      const availableWidth=Math.max(180,window.innerWidth-left-right-36),availableHeight=Math.max(180,window.innerHeight-110);
      const margin=runtime.poses.reduce((width,p)=>Math.max(width,p.width),0)+1.7;
      const dx=b.max.x-b.min.x+margin,dy=b.max.y-b.min.y+1,dz=b.max.z-b.min.z+margin;
      const theta=viewCamera.theta,phi=viewCamera.phi;
      const width=Math.abs(Math.cos(theta))*dx+Math.abs(Math.sin(theta))*dz;
      const height=Math.abs(Math.sin(theta)*Math.cos(phi))*dx+Math.sin(phi)*dy+Math.abs(Math.cos(theta)*Math.cos(phi))*dz;
      const viewScale=viewCamera.projection==='perspective'?2*Math.tan(23*Math.PI/180):.85;
      viewCamera.distance=Math.max(viewCamera.distance,1.1*Math.max(width*window.innerHeight/availableWidth,height*window.innerHeight/availableHeight)/viewScale);
      // Centre the track in the visible space when the two side panels have
      // different widths (including the collapsed track rail).
      const shift=(right-left)*.5*viewCamera.distance*viewScale/window.innerHeight;
      viewCamera.target.x+=Math.cos(theta)*shift;viewCamera.target.z-=Math.sin(theta)*shift;
    }
    updateCameras();
  }
  function applyPreset() {
    const mode=$('cameraMode').value;
    viewCamera.projection=mode.includes('persp')?'perspective':'orthographic';
    if(mode.startsWith('top')) {viewCamera.phi=.006;viewCamera.theta=0;}
    else if(mode.startsWith('low')) {viewCamera.phi=1.12;viewCamera.theta=.92;}
    else {viewCamera.phi=.72;viewCamera.theta=.80;}
  }
  function applyCode(frame=true,code=$('code').value,options=shapeOptions(),temporaryMarkers=null) {
    let next;
    try {next=TS2.build(code,options);if(temporaryMarkers)next.temporaryRaceMarkers=temporaryMarkers;}
    catch(err) {message(err.message,true);return false;}
    if(!rebuildLayers(next))return false;
    $('code').value=code;editor?.accept(next);
    if(!quickSession)library?.changed();
    if(frame!==false)fitView();return true;
  }
  function shapeOptions() {
    return {turnSegments:Number($('samples').value),longitudinalSegments:Number($('samples').value),slopeEaseStart:['both','start'].includes($('slopeMode').value),
      slopeEaseEnd:['both','end'].includes($('slopeMode').value),slopeCurveStrength:Number($('slopeStrength').value),
      bankCurve:Number($('bankCurve').value),bankTransition:Number($('bankTransition').value),bankWidthSegments:Number($('bankSamples').value),
      widthSegments:Number($('bankSamples').value),curvedSlopeWidthSegments:Number($('curveWidthSamples').value),smoothRoad:$('smoothRoad').checked};
  }
  function encodedShape(s) {
    return {SC:s.slopeCurveStrength,SS:s.slopeEaseStart,SE:s.slopeEaseEnd,BC:s.bankCurve,BS:s.bankTransition,
      LS:s.longitudinalSegments??s.turnSegments,WS:s.widthSegments??s.bankWidthSegments,
      CSW:s.curvedSlopeWidthSegments??s.widthSegments??s.bankWidthSegments,SN:s.smoothRoad,
      ...(s.groundY!==undefined?{GY:s.groundY,GC:s.groundCutouts,GG:s.grassGrip,GD:s.grassDrag}:{})};
  }
  function applyShapeDefaults(frame=false) {
    const options=shapeOptions();
    let code;
    try {if(editor?.hasDraft)throw Error('Generate your edited track code before changing track defaults.');code=TS2.updateSettings($('code').value,encodedShape(options));}
    catch(err) {message(err.message,true);if(runtime)syncShapeControls();return;}
    if(!applyCode(frame,code))syncShapeControls();
  }
  function syncShapeControls() {
    const s=runtime.settings;
    $('slopeMode').value=s.slopeEaseStart ? (s.slopeEaseEnd?'both':'start') : (s.slopeEaseEnd?'end':'none');
    for(const [id,value] of [['slopeStrength',s.slopeCurveStrength],['bankCurve',s.bankCurve],['bankTransition',s.bankTransition]]) {
      $(id).value=String(value);$(id+'Value').textContent=`${Math.round(value*100)}%`;
    }
    $('samples').value=String(s.longitudinalSegments??s.turnSegments);
    $('bankSamples').value=String(s.widthSegments??s.bankWidthSegments);
    $('curveWidthSamples').value=String(s.curvedSlopeWidthSegments??s.widthSegments??s.bankWidthSegments);
    $('smoothRoad').checked=s.smoothRoad;
  }
  function portableCode() {
    const next=TS2.build($('code').value,shapeOptions());
    return TS2.updateSettings($('code').value,encodedShape(next.settings));
  }
  function loadExample(name) {
    const code=TS2.EXAMPLES[name];if(!code)return;
    const options=name==='original'?TrackLibrary.options():shapeOptions();
    const title=Array.from($('examples').options??[]).find(option=>option.value===name)?.textContent??(name==='original'?'Default sample track':name);
    if(library?library.newDocument(code,title,options):applyCode(true,code,options))$('examples').value=name;
  }
  function updateTrackInformation() {
    $('pieceCount').textContent=runtime.stats.pieces;
    $('poseCount').textContent=runtime.stats.poses;
    $('trackLength').textContent=`${runtime.stats.length.toFixed(1)} m`;
    $('levels').textContent=`${runtime.stats.minElevation.toFixed(1)} to ${runtime.stats.maxElevation.toFixed(1)} m`;
    const closing=runtime.pieces.find(piece=>piece.isClose);
    $('closure').textContent=!runtime.autoClose?'Open track':closing?
      `${closing.isCurve?'Curved':'Straight'} auto-close · ${closing.length.toFixed(1)} m`:'Closed at existing endpoints';
    if(runtime.warnings.length) message(`Track generated with note: ${runtime.warnings.join(' ')}`);
    else message(`Track generated successfully from ${runtime.pieces.length} sections.`);
  }
  $('brightness').addEventListener('input',()=>{renderer.toneMappingExposure=Number($('brightness').value);$('brightnessValue').textContent=Number($('brightness').value).toFixed(2);});
  $('code').value=TS2.EXAMPLE_CODE;
  $('generate').addEventListener('click',()=>applyCode());
  $('sample').addEventListener('click',()=>loadExample('original'));
  $('examples').addEventListener('change',()=>loadExample($('examples').value));
  $('fit').addEventListener('click',()=>fitView());
  $('cameraMode').addEventListener('change',()=>{applyPreset();updateCameras();});
  $('sideMode').addEventListener('change',()=>rebuildLayers());
  $('editorEnvironment').addEventListener('change',()=>{
    const previous=editorPreviewEnvironment,choice=$('editorEnvironment').value;
    if(choice!=='default' && !TS2.ENVIRONMENTS.includes(choice)){$('editorEnvironment').value=previous;return;}
    editorPreviewEnvironment=choice;
    if(!rebuildLayers()){editorPreviewEnvironment=previous;$('editorEnvironment').value=previous;}
  });
  $('groundLevel').addEventListener('change',()=>rebuildLayers());
  $('samples').addEventListener('change',()=>applyShapeDefaults(false));
  $('slopeMode').addEventListener('change',()=>applyShapeDefaults(false));
  $('slopeStrength').addEventListener('input',()=>applyShapeDefaults(false));
  $('bankCurve').addEventListener('input',()=>applyShapeDefaults(false));
  $('bankTransition').addEventListener('input',()=>applyShapeDefaults(false));
  $('bankSamples').addEventListener('change',()=>applyShapeDefaults(false));
  $('curveWidthSamples').addEventListener('change',()=>applyShapeDefaults(false));
  $('smoothRoad').addEventListener('change',()=>applyShapeDefaults(false));
  $('wallRamp').addEventListener('input',()=>{$('wallRampValue').textContent=`${Number($('wallRamp').value).toFixed(1)} m`;rebuildLayers();});
  $('flattenUnderpass').addEventListener('change',()=>rebuildLayers());
  $('flattenBy').addEventListener('input',()=>{$('flattenValue').textContent=`${Math.round(Number($('flattenBy').value)*100)}%`;rebuildLayers();});
  $('showTreeAreas').addEventListener('change',updateGapVisibility);
  ['showRoad','showKerbs','showWalls','showFences','showGround','showDebug'].forEach(id=>$(id).addEventListener('change',updateLayersVisibility));
  $('showWireframe').addEventListener('change',updateWireframe);
  $('driveWireframe').addEventListener('change',()=>{$('showWireframe').checked=$('driveWireframe').checked;updateWireframe();renderer.domElement.focus?.();});
  for(const [editorId,driveId] of [['showCheckpoints','driveShowCheckpoints'],['showStartFinish','driveShowStartFinish']]) {
    $(editorId).addEventListener('change',updateRaceVisibility);
    $(driveId).addEventListener('change',()=>{
      $(editorId).checked=$(driveId).checked;updateRaceVisibility();renderer.domElement.focus?.();
    });
  }
  $('copy').addEventListener('click',async()=>{
    let val;
    try {val=portableCode();if(!applyCode(false,val))return;}
    catch(err) {message(`Could not copy track: ${err.message}`,true);return;}
    try {if(navigator.clipboard && window.isSecureContext)await navigator.clipboard.writeText(val);
      else {$('code').focus();$('code').select();if(!document.execCommand('copy'))throw Error('copy unavailable');}
      message('Track code copied — ready to share.');
    } catch(e) {message('Select the track code and press Ctrl+C to copy it.',true);}
  });
  $('download').addEventListener('click',()=>{
    let code;
    try {code=portableCode();if(!applyCode(false,code))return;}
    catch(err) {message(`Could not save track: ${err.message}`,true);return;}
    const blob=new Blob([code+'\n'],{type:'text/plain'});
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='trackshift-circuit.ts2.txt';link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    message('Track code saved as a text file.');
  });
  $('upload').addEventListener('change',e=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();reader.onload=()=>{
      const code=String(reader.result).trim(),title=file.name.replace(/(?:\.ts2)?\.txt$|\.ts2$/i,'');
      if(library)library.newDocument(code,title,shapeOptions());else applyCode(true,code);
    };reader.onerror=()=>message('Could not read that track file.',true);reader.readAsText(file);
    e.target.value='';
  });
  const canvas=renderer.domElement;
  canvas.tabIndex=0;
  function highlight(index,indices=null) {
    if(!runtime)return;
    const next=TrackGeometry.selectionGroup(runtime,index,driveBuffers?.road);
    if(indices)for(const other of indices)if(other!==index)next.add(TrackGeometry.selectionGroup(runtime,other,driveBuffers?.road));
    next.visible=!$('editorPanel').hidden;world.add(next);disposeLayer(selection);selection=next;
    updateGapVisibility();
    updateWireframe();
    updateEditorOrientation();
    if(!quickSession)library?.changed();
  }
  editor=TrackEditor.create({commit:(code,options)=>applyCode(false,code,options??shapeOptions()),select:highlight,message,isDriving:()=>drive?.active,
    sceneryPlacements:()=>sceneryLayer?.userData?.placements??[]});
  drive=TrackDrive.create({scene,canvas,performance:performanceDisplay,getTrack:()=>({runtime,buffers:driveBuffers}),boostEnabled:()=>quickSession?!!quickSession.specials:$('editorBoostMode').value==='specials',raceTrackName:()=>quickSession?.trackName,nightRace:()=>quickSession?.night===true,selected:()=>editor.selectedIndex,message,setDirection:setRaceDirection,buildChanged:build=>garage?.externalChange(build),compactRace:()=>['race','championship'].includes(quickSession?.returnPage),
    championshipRace:()=>quickSession?.returnPage==='championship',championshipResult:recordChampionshipResult,championshipNext:nextChampionshipRace,
    mode:active=>{performanceDisplay.setActive(active);if(active){editor.cancelPendingDeletion();library?.cancelPendingDeletion();road.visible=true;kerbs.visible=true;walls.visible=true;fences.visible=true;ground.visible=true;if(boostLayer)boostLayer.visible=quickSession?!!quickSession.specials:$('editorBoostMode').value==='specials';if(sceneryLayer)sceneryLayer.visible=true;debug.visible=false;updateGroundPreview();}else {restoreEditorAITest();updateLayersVisibility();}
      if(selection)selection.visible=!active && !$('editorPanel').hidden;updateGapVisibility();drag=null;updateEditorOrientation();
      if(!active && quickSession?.started){const page=quickSession.returnPage??'race';restoreQuickSession();showMenu(page);return 'menu';}}});
  $('startEditorAI').addEventListener('click',()=>{
    if(drive.active)return;$('editorAIStatus').textContent='';
    try{
      if(!runtime)throw Error('Generate a track before starting an AI test.');
      if($('code').value.trim()!==runtime.code.trim())throw Error('Generate your edited track code before starting an AI test.');
      const count=Number($('editorAICount').value)||3;if(!Number.isInteger(count) || count<1 || count>7)throw Error('Choose between one and seven AI cars.');
      const temporary=!TrackRace.plan(runtime,driveBuffers.road,drive.direction).valid?TrackRace.temporaryMarkers(runtime):null;
      editorAITest={runtime,hadMarkers:Object.hasOwn(runtime,'temporaryRaceMarkers'),markers:runtime.temporaryRaceMarkers,changedMarkers:!!temporary};
      if(temporary){runtime.temporaryRaceMarkers=temporary;setRaceDirection(drive.direction);}
      const player=$('editorAIIncludePlayer').checked;
      const difficulty=Object.hasOwn(TrackAI.DIFFICULTIES,$('editorAIDifficulty').value)?$('editorAIDifficulty').value:'normal';
      $('aiWorkshopExit').textContent='← Back to editor';$('exitDrive').textContent='Back to editor · Y / Esc';
      const started=player?drive.start(true,true,3,difficulty,count):drive.startWorkshop(count,3,difficulty,drive.direction===-1?'reverse':'normal');
      if(!started){const reason=$('message').textContent;restoreEditorAITest();throw Error(reason||'Could not start the AI test.');}
      if(temporary)message('Temporary race markers are in use for this test. The track code is unchanged.');
    }catch(error){restoreEditorAITest();$('editorAIStatus').textContent=error.message;message('Could not start AI test: '+error.message,true);}
  });
  garage=TrackGarage.create({build:()=>drive.build,colour:()=>drive.colour,body:()=>drive.body,setBuild:value=>drive.setBuild(value),setColour:value=>drive.setColour(value),setBody:value=>drive.setBody(value),back:()=>showMenu('tools'),testDrive:()=>showMenu('race')});
  const raycaster=new THREE.Raycaster();
  function pickSection(event) {
    if(drive.active || $('editorPanel').hidden || document.body.classList.contains('menu-mode'))return;
    const rect=canvas.getBoundingClientRect();
    const point=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(point,camera);
    const hits=road?.visible?raycaster.intersectObject(road,false):[];
    if(gapMarkers?.visible && gapMarkers.children.length)hits.push(...raycaster.intersectObject(gapMarkers,true));
    hits.sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity));const hit=hits[0];if(!hit)return;
    if(hit.object?.userData?.gapPieceIndex!==undefined){editor.select(hit.object.userData.gapPieceIndex,true);return;}
    const range=road.userData.pieceRanges.find(range=>hit.faceIndex>=range.start && hit.faceIndex<range.start+range.count);
    if(range)editor.select(range.pieceIndex,true);
  }
  let drag=null;
  canvas.addEventListener('pointerdown',e=>{if(drive.active || (e.button!==0 && e.button!==2))return; drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,moved:false};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{
    if(!drag)return;
    if(!drag.moved && Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<4)return;
    drag.moved=true;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(drag.button===0){viewCamera.theta-=dx*.006;viewCamera.phi=Math.max(.015,Math.min(1.49,viewCamera.phi-dy*.006));}
    else {
      const right=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0);
      const up=new THREE.Vector3().setFromMatrixColumn(camera.matrix,1);
      const scale=viewCamera.distance/(Math.max(1,window.innerHeight))*1.25 /viewCamera.zoom;
      viewCamera.target.addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale);
    }
    drag.x=e.clientX;drag.y=e.clientY;updateCamPosition();
  });
  canvas.addEventListener('pointerup',e=>{if(drag && drag.button===0 && !drag.moved)pickSection(e);drag=null;});
  canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();
    if(drive.active){drive.zoom(e.deltaY);return;}
    const factor=Math.exp(-e.deltaY*.001);viewCamera.zoom=Math.max(.25,Math.min(7,viewCamera.zoom*factor));
    updateCameras();},{passive:false});
  window.addEventListener('resize',()=>{renderer.setSize(window.innerWidth,window.innerHeight);updateCameras();if(menuPreview)frameMenuPreview(menuPreview);});
  let lastTime=null;
  const animate=(now=0)=>{requestAnimationFrame(animate);const dt=lastTime===null?0:Math.max(0,(now-lastTime)/1000);lastTime=now;
    const wasDriving=drive.active;drive.update(dt);if(!wasDriving)menuControls?.update(dt);
    if(drive.active)quickSession?.nightSceneryLights?.update(drive.state,drive.camera,dt);
    renderer.render(scene,drive.active?drive.camera:menuPreview?.camera??camera);performanceDisplay.frame(now);};
  updateCameras();
  applyCode();
  let builderPacks=null;
  library=TrackLibrary.create({
    get:()=>quickSession?quickSession.libraryDocument:runtime?{code:runtime.code,draft:$('code').value,options:TrackLibrary.options(runtime.settings),selection:editor.selectedIndex}:null,
    load:doc=>{
      if(!applyCode(true,doc.code,doc.options))return false;
      editor.select(doc.selection);editor.resetHistory();$('code').value=doc.draft;return true;
    },
    message,
    saved:record=>builderPacks?.saved(record),created:record=>builderPacks?.created(record),activated:record=>builderPacks?.activated(record),deleted:id=>builderPacks?.deleted(id),
    resetHistory:()=>editor.resetHistory(),
    portableTrack:doc=>{const track=TS2.build(doc.code,doc.options);return TS2.updateSettings(doc.code,encodedShape(track.settings));},
    exportLibrary:(text,filename)=>{
      const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
      link.download=filename||'trackshift-all-tracks.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    },
    exportDraft:(text,title)=>{
      const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));
      link.download=(title.trim()||'trackshift').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.draft.txt';link.click();
      setTimeout(()=>URL.revokeObjectURL(link.href),1000);message('Exact track-code draft exported. Generate it before using it as a track.');
    }
  });
  let packStorage;try{packStorage=window.localStorage;}catch(error){/* Keep the rest of the editor usable. */}
  const packStore=TrackPacks.createStore(packStorage);
  const championshipStore=TrackChampionship.createStore(packStorage);
  let championshipState=null,championshipLoadError='',championshipPending=null,championshipDiscardPending=false,championshipChoosingNew=false;
  try{championshipState=championshipStore.read();}catch(error){championshipLoadError=error.message;}
  let pendingPackDelete=null,pendingMenuTrackDelete=null;
  function localPacks(){try{return packStore.list();}catch(error){return [];}}
  function officialPacks(){try{return TrackPacks.official();}catch(error){return [];}}
  function getPack(source,id){return source==='official'?officialPacks().find(pack=>pack.id===id):source==='local'?packStore.read(id):null;}
  builderPacks=TrackBuilderPacks.create({library,packStore,storage:packStorage,localPacks,officialPacks});
  // A quick drive stages a separate scene without switching the editor's local track,
  // undo history, exact draft or autosave document.
  function restoreQuickSession(){
    const saved=quickSession;if(!saved)return;
    restoreDayLighting(saved.dayLighting);
    if(saved.staged){
      disposeLayer(world);world=saved.world;scene.add(world);
      ({runtime,road,kerbs,walls,fences,ground,sceneryLayer,debug,raceMarkers,checkpointMarkers,crossingArrows,boostLayer,selection,gapMarkers,driveBuffers}=saved);
      frameShadows(driveBuffers);updateLayersVisibility();updateSceneryStatus(editorEnvironmentFor(runtime));$('geomStats').textContent=saved.stats;
      updateTrackInformation();syncShapeControls();$('code').value=saved.draft;editor.restoreState(saved.editorState);
    }
    const previousDirection=saved.previousDirection;quickSession=null;
    if(previousDirection!==undefined && drive.direction!==previousDirection)drive.setRaceDirection(previousDirection===-1?'reverse':'normal');
  }
  function trackDocument(choice){
    if(choice.startsWith('pack:')){const [,source,id,index]=choice.split(':'),pack=getPack(source,id),track=pack?.tracks[Number(index)];if(!track)throw Error('That pack track is no longer available.');return {name:track.name,code:track.code,options:track.options,selection:0};}
    if(choice.startsWith('saved:')){const track=library.store.read(choice.slice(6));if(!track)throw Error('That track is no longer available.');return {...track.document,name:track.name};}
    if(choice.startsWith('example:')){const key=choice.slice(8),code=TS2.EXAMPLES[key];if(!code)throw Error('Choose a track first.');const name=Array.from($('examples').options??[]).find(item=>item.value===key)?.textContent??key;return {name,code,options:TrackLibrary.options(),selection:0};}
    throw Error('Choose a track first.');
  }
  // Preview framing is independent of the editor's camera, target and zoom.
  function frameMenuPreview(preview){
    const b=preview.runtime.bounds,aspect=window.innerWidth/Math.max(1,window.innerHeight),theta=viewCamera.theta,phi=viewCamera.phi;
    const centre=new THREE.Vector3((b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2);
    const margin=preview.runtime.poses.reduce((width,p)=>Math.max(width,p.width),0)+2;
    const dx=b.max.x-b.min.x+margin,dy=b.max.y-b.min.y+1,dz=b.max.z-b.min.z+margin;
    const width=Math.abs(Math.cos(theta))*dx+Math.abs(Math.sin(theta))*dz;
    const height=Math.abs(Math.sin(theta)*Math.cos(phi))*dx+Math.sin(phi)*dy+Math.abs(Math.cos(theta)*Math.cos(phi))*dz;
    // The menu's left-hand controls cover part of the scene; its CSS also
    // enlarges the background by 1.3, so leave ample room around the track.
    const available=Math.max(window.innerWidth*.35,window.innerWidth-520);
    const size=1.5*Math.max(45,height,width*window.innerHeight/available),cam=preview.camera;
    cam.left=-size*aspect/2;cam.right=size*aspect/2;cam.top=size/2;cam.bottom=-size/2;
    const distance=Math.max(100,size*2),sp=Math.sin(phi);
    cam.position.set(centre.x+Math.sin(theta)*sp*distance,centre.y+Math.cos(phi)*distance,centre.z+Math.cos(theta)*sp*distance);
    cam.up.set(0,1,0);cam.lookAt(centre);cam.updateProjectionMatrix();
    preview.nightLights?.update(centre,cam,.25);
  }
  function setPreviewNight(night){
    if(night && !previewDayLighting){previewDayLighting=saveDayLighting();applyNightLighting();}
    else if(!night && previewDayLighting){restoreDayLighting(previewDayLighting);previewDayLighting=null;}
  }
  function clearMenuPreview(){
    setPreviewNight(false);
    if(!menuPreview)return;
    disposeLayer(menuPreview.group);menuPreview=null;if(world)world.visible=true;
    if(driveBuffers)frameShadows(driveBuffers);
  }
  function showTrackPreview(choice,statusId,documentOverride=null,nightOverride=null,environmentOverride=null){
    if(!choice){clearMenuPreview();$(statusId).textContent='No tracks are available in this selection.';return;}
    let group;
    try {
      const doc=documentOverride??trackDocument(choice),track=TS2.build(doc.code,doc.options);
      group=new THREE.Group();group.name='Menu track preview';group.userData={choice,code:doc.code,optionsKey:JSON.stringify(doc.options??null)};
      const gm=TrackGeometry.generateRoad(track);group.add(meshFrom(gm,'Road'));
      const features=TrackGeometry.generateSideFeatures(track,{sideMode:'auto',wallRampLength:Number($('wallRamp').value),flattenUnderpass:$('flattenUnderpass').checked,flattenBy:Number($('flattenBy').value)});
      const raceEnvironment=$('menuRaceEnvironment').value;
      const environment=environmentOverride??(statusId==='menuRaceStatus' && !['','default'].includes(raceEnvironment)?raceEnvironment:track.settings.environment);
      const night=nightOverride??(statusId==='menuRaceStatus' && $('menuRaceLighting').value==='night');
      const terrain=TrackTerrain.generate(track,{road:gm,kerbs:features.kerbs,walls:features.walls},{environment});
      group.add(meshFrom(features.kerbs,'Kerbs'));group.add(meshFrom(features.walls,'Walls'));group.add(meshFrom(features.fences,'Fences'));
      const scenery=TrackScenery.enabled(track,{environment})?TrackScenery.generate(track,terrain,{sideMode:'auto',environment,night}):null;let nightLights=null;
      if(scenery){TrackTerrain.applyPonds(terrain,scenery.ponds,track.settings);const mesh=meshFrom(scenery.visual,'Trackside scenery');group.add(mesh);if(night)nightLights=attachNightScenery(scenery,mesh);}
      const grass=meshFrom(terrain.ground,'Grass');grass.castShadow=false;group.add(grass);addLavaSurface(group,terrain);addGrassCoverShadow(group,terrain);group.add(meshFrom(terrain.cuttings,'Soil cuttings'));
      if(terrain.portalkerb.triangles)group.add(meshFrom(terrain.portalkerb,'Grass cover kerbs'));
      const previewDirection=statusId==='menuRaceStatus' && $('menuRaceDirection').value==='reverse'?-1:1;
      if(statusId==='menuRaceStatus' && $('menuRaceSpecials').value==='specials')group.add(raceMeshFrom(TrackGeometry.generateBoostPads(track,gm,previewDirection),'Preview boost pads',night));
      group.add(raceMeshFrom(TrackGeometry.generateRaceMarkers(track,gm,'startFinish',previewDirection),'Preview start / finish',night));
      group.add(raceMeshFrom(TrackGeometry.generateRaceMarkers(track,gm,'checkpoints',previewDirection),'Preview checkpoints',night));
      group.add(raceMeshFrom(TrackGeometry.generateCrossingArrows(track,gm,previewDirection),'Preview crossroad arrows',night));
      const preview={group,runtime:track,camera:new THREE.OrthographicCamera(-1,1,1,-1,.3,100000),night,nightLights};
      frameMenuPreview(preview);scene.add(group);
      if(menuPreview)disposeLayer(menuPreview.group);else if(world)world.visible=false;
      menuPreview=preview;setPreviewNight(night);frameShadows({road:gm,kerbs:features.kerbs,walls:features.walls,ground:terrain.ground,cuttings:terrain.cuttings,...(scenery?{scenery:scenery.visual}:{})});
      $(statusId).textContent='';
    }catch(error){if(group)disposeLayer(group);$(statusId).textContent=`Could not preview the selected track: ${error.message}`;}
  }
  const raceSelectIds=['menuRacePack','menuRaceTrack','menuRaceSpecials','menuRaceDirection','menuRaceLighting','menuRaceEnvironment','menuOpponentCount','menuRivalDifficulty','menuRaceLaps'];
  const championshipSelectIds=['menuChampPack','menuChampOpponents','menuChampDifficulty','menuChampLaps','menuChampDirection','menuChampLighting','menuChampEnvironment'];
  let raceChoice=null,pendingOfficialRefresh=false,quickRaceChoiceChanged=false;
  function raceInputMethod(method){for(const prefix of ['race','champ']){$(prefix+'HelpKeyboard').hidden=method==='controller';$(prefix+'HelpController').hidden=method!=='controller';}}
  function closeRaceChoice(restoreFocus=true){
    if(!raceChoice)return;const select=raceChoice.select;raceChoice=null;$('raceChoiceList').hidden=true;select.setAttribute('aria-expanded','false');if(restoreFocus)select.focus?.();
    if(pendingOfficialRefresh){pendingOfficialRefresh=false;refreshOfficialPackViews();}
  }
  function selectRaceOption(select,index){
    const options=Array.from(select.options??[]);if(!options[index] || options[index].disabled)return;
    if(select.selectedIndex!==index){select.selectedIndex=index;select.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  function stepRaceOption(select,step){
    const options=Array.from(select.options??[]);for(let i=select.selectedIndex+step;i>=0 && i<options.length;i+=step)if(!options[i].disabled){selectRaceOption(select,i);break;}
    select.focus?.();
  }
  function renderRaceChoice(){
    if(!raceChoice)return;const {select,index}=raceChoice,list=$('raceChoiceList');
    list.replaceChildren(...Array.from(select.options??[]).map((option,i)=>{
      const button=document.createElement('button');button.type='button';button.tabIndex=-1;button.className='race-list-option';button.textContent=option.textContent;button.disabled=option.disabled;
      button.setAttribute('role','option');button.setAttribute('aria-selected',String(i===index));button.addEventListener('click',()=>{selectRaceOption(select,i);closeRaceChoice();});return button;
    }));
    list.children?.[index]?.scrollIntoView?.({block:'nearest'});
  }
  function openRaceChoice(select){
    const quick=!$('menuRace').hidden && raceSelectIds.includes(select.id),championship=!$('menuChampionship').hidden && !$('menuChampSetup').hidden && championshipSelectIds.includes(select.id);
    if((!quick && !championship) || !select.options?.length)return false;
    closeRaceChoice(false);raceChoice={select,index:Math.max(0,select.selectedIndex)};const list=$('raceChoiceList'),rect=select.getBoundingClientRect();
    const maxHeight=Math.max(100,Math.min(260,window.innerHeight-16)),width=Math.min(Math.max(rect.width,260),window.innerWidth-16);
    list.style.width=`${width}px`;list.style.maxHeight=`${maxHeight}px`;list.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-width-8))}px`;
    list.style.top=`${Math.max(8,Math.min(rect.bottom+4,window.innerHeight-maxHeight-8))}px`;list.hidden=false;select.setAttribute('aria-expanded','true');renderRaceChoice();return true;
  }
  function moveRaceChoice(step){
    if(!raceChoice)return;const options=Array.from(raceChoice.select.options??[]);
    for(let i=raceChoice.index+step;i>=0 && i<options.length;i+=step)if(!options[i].disabled){raceChoice.index=i;renderRaceChoice();break;}
  }
  function confirmRaceChoice(){if(raceChoice){selectRaceOption(raceChoice.select,raceChoice.index);closeRaceChoice();}}
  for(const id of [...raceSelectIds,...championshipSelectIds]){
    const select=$(id);select.setAttribute('aria-haspopup','listbox');select.setAttribute('aria-expanded','false');select.setAttribute('aria-controls','raceChoiceList');
    select.addEventListener('pointerdown',event=>{event.preventDefault();select.focus?.();openRaceChoice(select);});
    select.addEventListener('click',event=>{event.preventDefault();select.focus?.();if(raceChoice?.select!==select)openRaceChoice(select);});
    for(const [suffix,step] of [['Prev',-1],['Next',1]])$(id+suffix).addEventListener('click',()=>{closeRaceChoice(false);stepRaceOption(select,step);});
  }
  document.addEventListener?.('pointerdown',event=>{if(raceChoice && event.target!==raceChoice.select && !$('raceChoiceList').contains(event.target))closeRaceChoice(false);});
  function showMenu(page='home'){
    cancelMenuTrackDeletion();
    menuControls?.reset();
    closeRaceChoice(false);
    if(page!=='race' && menuPreview?.night){
      // Keep the selected circuit as the home backdrop in daylight; other
      // sections either provide their own preview or open the editor/garage.
      if(page==='home' || page==='options')showTrackPreview(menuPreview.group.userData.choice,'menuRaceStatus',null,false);
      if(menuPreview?.night)clearMenuPreview();
    }
    document.body.classList.add('menu-mode');if(page==='race' || page==='championship')document.body.classList.add('race-setup');else document.body.classList.remove('race-setup');$('mainMenu').hidden=false;updateGapVisibility();
    if(page==='garage')document.body.classList.add('garage-mode');else {document.body.classList.remove('garage-mode');garage.close();}
    $('menuHome').hidden=page!=='home';$('menuTools').hidden=page!=='tools';$('menuRace').hidden=page!=='race';$('menuTracks').hidden=page!=='tracks';$('menuPacks').hidden=page!=='packs';$('menuAI').hidden=page!=='ai';$('menuGarage').hidden=page!=='garage';$('menuChampionship').hidden=page!=='championship';$('menuOptions').hidden=page!=='options';
    const championship=championshipState?.active;$('menuContinueChampionship').hidden=!championship || championship.results.length>=championship.pack.tracks.length;
    if(page==='garage'){clearMenuPreview();garage.open();}
    if(page==='race'){refreshPackChoices('menuRacePack');refreshRaceChoices();showTrackPreview($('menuRaceTrack').value,'menuRaceStatus');}
    if(page==='ai'){refreshPackChoices('menuAIPack');refreshRaceChoices('menuAITrack');showTrackPreview($('menuAITrack').value,'menuAIStatus');}
    if(page==='tracks'){refreshSavedChoices();showTrackPreview(libraryChoice(),'menuLibraryStatus');}
    if(page==='packs'){refreshPackManager();previewPackTrackOrAvailable();}
    if(page==='championship')refreshChampionship();
    const champFocus=!$('menuChampSetup').hidden?($('menuChampStart').disabled?'menuChampPack':'menuChampStart'):(!$('menuChampContinue').hidden?'menuChampContinue':!$('menuChampNew').hidden?'menuChampNew':'menuChampBack');
    $(page==='race'?'menuRival':page==='tools'?'menuGarageButton':page==='ai'?'menuAIBack':page==='tracks'?'menuLibraryPack':page==='packs'?'menuPacksBack':page==='garage'?'garagePreset':page==='championship'?champFocus:page==='options'?'optionsCheckpointSound':'menuQuick').focus?.();
  }
  function hideMenu(){menuControls?.reset();closeRaceChoice(false);garage.close();clearMenuPreview();document.body.classList.remove('menu-mode');document.body.classList.remove('garage-mode');document.body.classList.remove('race-setup');$('mainMenu').hidden=true;updateGapVisibility();}
  function option(value,label){const item=document.createElement('option');item.value=value;item.textContent=label;return item;}
  function savedTracks(){try{return library.store.list().tracks;}catch(error){return [];}}
  function refreshPackChoices(id){
    const select=$(id),old=select.value,items=[option('all','All tracks'),option('examples','Examples'),option('mine','My tracks')];
    for(const pack of officialPacks())items.push(option('official:'+pack.id,'Official pack - '+pack.name));
    for(const pack of localPacks())items.push(option('local:'+pack.id,'My pack - '+pack.name));
    select.replaceChildren(...items);select.value=items.some(item=>item.value===old)?old:'all';
  }
  function refreshRaceChoices(id='menuRaceTrack'){
    const select=$(id),old=select.value,items=[],group=$(id==='menuAITrack'?'menuAIPack':'menuRacePack').value||'all';
    if(group==='all'||group==='mine')for(const track of savedTracks())items.push(option('saved:'+track.id,'My tracks \u00b7 '+track.name));
    if(group==='all'||group==='examples'){
      const labels=Array.from($('examples').options??[]);
      for(const [key] of Object.entries(TS2.EXAMPLES)){
        const label=labels.find(item=>item.value===key)?.textContent??key;
        items.push(option('example:'+key,'Example \u00b7 '+label));
      }
    }
    if(group.startsWith('official:')||group.startsWith('local:')){
      const [source,packId]=group.split(':'),pack=getPack(source,packId);
      for(const [index,track] of (pack?.tracks??[]).entries())items.push(option(`pack:${source}:${packId}:${index}`,`${index+1}. ${track.name}`));
    }
    select.replaceChildren(...items);
    select.value=items.some(item=>item.value===old)?old:(items.some(item=>item.value==='saved:'+library.activeId)?'saved:'+library.activeId:(items.some(item=>item.value==='example:lapTrial')?'example:lapTrial':items[0]?.value??''));
  }
  function refreshPackManager(preferred,trackIndex){
    const packs=localPacks(),select=$('menuPackManage'),old=preferred??select.value;
    select.replaceChildren(...packs.map(pack=>option(pack.id,`${pack.name} · ${pack.tracks.length} tracks · ID ${pack.id.slice(0,8)}`)));
    select.value=packs.some(pack=>pack.id===old)?old:(packs[0]?.id??'');
    const pack=packs.find(item=>item.id===select.value),available=[];
    for(const track of savedTracks())available.push(option('saved:'+track.id,'My tracks - '+track.name));
    const labels=Array.from($('examples').options??[]);
    for(const [key] of Object.entries(TS2.EXAMPLES))available.push(option('example:'+key,'Example - '+(labels.find(item=>item.value===key)?.textContent??key)));
    const previous=$('menuPackAvailable').value;$('menuPackAvailable').replaceChildren(...available);
    $('menuPackAvailable').value=available.some(item=>item.value===previous)?previous:(available[0]?.value??'');
    const oldTrack=trackIndex??Number($('menuPackTracks').value);
    $('menuPackTracks').replaceChildren(...(pack?.tracks??[]).map((track,index)=>option(String(index),`${index+1}. ${track.name}`)));
    $('menuPackTracks').value=pack?.tracks.length?String(Math.min(Math.max(0,Number.isFinite(oldTrack)?oldTrack:0),pack.tracks.length-1)):'';
    if(pack)$('menuPackName').value=pack.name;
    for(const id of ['menuPackRename','menuPackAdd','menuPackExport','menuPackDelete','menuPackCopyId'])$(id).disabled=!pack;
    $('menuPackCreateTrack').disabled=!pack || pack.tracks.length>=100;
    $('menuPackCreateTrack').title=!pack?'Choose a pack first.':pack.tracks.length>=100?'This pack already has 100 tracks.':'Create a track linked to this pack in the track builder.';
    for(const id of ['menuPackUp','menuPackDown','menuPackRemove'])$(id).disabled=!pack?.tracks.length;
    pendingPackDelete=null;$('menuPackDelete').textContent='Delete selected pack...';
  }
  function previewPackTrack(){
    const id=$('menuPackManage').value,value=$('menuPackTracks').value;
    if(!id || value==='')return false;
    try{
      const index=Number(value),pack=packStore.read(id),track=Number.isInteger(index) && index>=0?pack?.tracks[index]:null;
      if(!track)return false;
      const choice=`pack:local:${id}:${index}`,current=menuPreview?.group.userData;
      // A click on an already-selected list item must restore its preview,
      // but the click following a change must not regenerate it twice.
      if(current?.choice!==choice || current.code!==track.code || current.optionsKey!==JSON.stringify(track.options??null))showTrackPreview(choice,'menuPackPreviewStatus');
      return true;
    }catch(error){$('menuPackPreviewStatus').textContent='Could not preview that pack track: '+error.message;return false;}
  }
  function previewPackAvailable(){const choice=$('menuPackAvailable').value;if(choice)showTrackPreview(choice,'menuPackPreviewStatus');}
  function previewPackTrackOrAvailable(){if(!previewPackTrack())previewPackAvailable();}
  function updatePack(mutator){
    try{const pack=packStore.read($('menuPackManage').value);if(!pack)throw Error('Choose a pack first.');
      const index=Number($('menuPackTracks').value);const next=mutator(pack,Number.isFinite(index)?index:0);packStore.put(pack);
      refreshPackManager(pack.id,next);previewPackTrackOrAvailable();$('menuPackStatus').textContent='Pack saved in this browser.';
    }catch(error){$('menuPackStatus').textContent='Could not save pack: '+error.message;}
  }
  function libraryChoice(){
    const value=$('menuSavedTrack').value;if(!value)return '';
    return $('menuLibraryPack').value==='mine'?'saved:'+value:value;
  }
  function cancelMenuTrackDeletion(){
    pendingMenuTrackDelete=null;$('menuDeleteTrackPrompt').hidden=true;$('menuDeleteTrack').setAttribute('aria-expanded','false');
  }
  function updateMenuDeleteTrack(){
    const allowed=$('menuLibraryPack').value==='mine' && !!$('menuSavedTrack').value;
    $('menuDeleteTrack').disabled=!allowed;
    $('menuDeleteTrack').title=allowed?'Delete the selected My Tracks copy':'Select a saved track in My tracks to delete it.';
  }
  function refreshSavedChoices(){
    const groups=$('menuLibraryPack'),oldGroup=groups.value,items=[option('mine','My tracks'),option('examples','Built-in examples')];
    for(const pack of officialPacks())items.push(option('official:'+pack.id,'Built-in pack - '+pack.name));
    for(const pack of localPacks())items.push(option('local:'+pack.id,'My pack - '+pack.name));
    groups.replaceChildren(...items);groups.value=items.some(item=>item.value===oldGroup)?oldGroup:'mine';
    const group=groups.value,select=$('menuSavedTrack'),old=select.value,tracks=savedTracks(),choices=[];
    if(group==='mine')for(const track of tracks)choices.push(option(track.id,track.name));
    else if(group==='examples'){
      const labels=Array.from($('examples').options??[]);
      for(const [key] of Object.entries(TS2.EXAMPLES))choices.push(option('example:'+key,labels.find(item=>item.value===key)?.textContent??key));
    }else{
      const [source,id]=group.split(':'),pack=getPack(source,id);
      for(const [index,track] of (pack?.tracks??[]).entries())choices.push(option(`pack:${source}:${id}:${index}`,`${index+1}. ${track.name}`));
    }
    select.replaceChildren(...choices);select.value=choices.some(item=>item.value===old)?old:(group==='mine' && choices.some(item=>item.value===library.activeId)?library.activeId:(choices[0]?.value??''));
    if(pendingMenuTrackDelete && (group!=='mine' || select.value!==pendingMenuTrackDelete.id))cancelMenuTrackDeletion();
    select.disabled=!choices.length;$('menuOpenTrack').disabled=!choices.length;$('menuExportTrack').disabled=!choices.length;
    updateMenuDeleteTrack();
    $('menuSavedSet').replaceChildren(...tracks.map(track=>option(track.id,track.name)));$('menuExportSet').disabled=!tracks.length;
    $('menuLibraryPackHint').textContent=group.startsWith('local:')?'Opening or creating tracks here edits this local pack.':group==='mine'?'Tracks saved in this browser.':'Built-in tracks are read-only; opening one creates an editable copy in My tracks.';
  }
  function championshipRows(target,active){
    const rows=TrackChampionship.standings(active);
    const items=rows.map((row,index)=>{const li=document.createElement('li');li.textContent=`${index+1}. ${row.name} · ${row.points} pts`;if(row.player)li.className='championship-player';return li;});
    if(!items.length){const li=document.createElement('li');li.textContent='Standings appear after the first race.';items.push(li);}
    $(target).replaceChildren(...items);
  }
  function championshipBests(target,pack,settings,plans=null){
    $(target).replaceChildren(...(pack?.tracks??[]).map((track,index)=>{
      const directions=plans?[plans[index].direction]:settings.direction==='random'?['normal','reverse']:[settings.direction];
      const descriptions=directions.map(direction=>{const key={...settings,direction},record=championshipState?.bests.find(b=>b.key===TrackChampionship.bestKey(track,key,'lap'))??championshipState?.bests.find(b=>b.key===TrackChampionship.bestKey(track,key,'sprint'));
        return (directions.length>1?`${direction}: `:'')+(record?`Race ${TrackRace.format(record.race)}${record.lap===null?'':` / Lap ${TrackRace.format(record.lap)}`}`:'No time yet');});
      const li=document.createElement('li');li.textContent=track.name+' - '+descriptions.join(' | ');return li;
    }));
  }
  function refreshChampionship(){
    const select=$('menuChampPack'),old=select.value,items=[];
    for(const pack of officialPacks())if(pack.tracks.length)items.push(option('official:'+pack.id,'Official · '+pack.name));
    for(const pack of localPacks())if(pack.tracks.length)items.push(option('local:'+pack.id,'My pack · '+pack.name));
    select.replaceChildren(...items);select.value=items.some(item=>item.value===old)?old:(items[0]?.value??'');
    const [source,id]=select.value.split(':'),pack=getPack(source,id),active=championshipState?.active,index=active?.results.length??0,complete=!!active && index>=active.pack.tracks.length;
    for(const [field,fallback] of [['menuChampOpponents','7'],['menuChampDifficulty','normal'],['menuChampLaps','3'],['menuChampDirection','normal'],['menuChampLighting','default'],['menuChampEnvironment','default']])if(!$(field).value)$(field).value=fallback;
    championshipBests('menuChampSetupBests',pack,{laps:Number($('menuChampLaps').value),direction:$('menuChampDirection').value,lighting:$('menuChampLighting').value||'default',environment:$('menuChampEnvironment').value||'default'});
    $('menuChampPackInfo').textContent=pack?`${pack.tracks.length} track${pack.tracks.length===1?'':'s'} · ${pack.tracks.slice(0,4).map(t=>t.name).join(' → ')}${pack.tracks.length>4?' → …':''}`:'Create or import a non-empty pack in My tracks & backups.';
    $('menuChampSetup').hidden=!!active && !championshipChoosingNew;$('menuChampProgress').hidden=!active || championshipChoosingNew;
    $('menuChampCancelNew').hidden=!championshipChoosingNew;$('menuChampNew').hidden=!complete;
    $('menuChampStart').disabled=!pack || !!championshipLoadError;
    $('menuChampStatus').textContent=championshipLoadError;
    if(active){
      $('menuChampTitle').textContent=active.pack.name;
      const nextRace=active.races[Math.min(index,active.races.length-1)];
      $('menuChampProgressText').textContent=complete?`Championship complete - ${index} races.`:`Race ${index+1} of ${active.pack.tracks.length} - ${active.pack.tracks[index].name} - ${active.settings.opponents} AI - ${active.settings.difficulty} - ${active.settings.laps} laps (sprints once) - ${nextRace.direction} - ${nextRace.lighting} - ${nextRace.environment}.`;
      championshipRows('menuChampStandings',active);
      championshipBests('menuChampBests',active.pack,active.settings,active.races);
      $('menuChampContinue').hidden=complete && !championshipPending;$('menuChampContinue').textContent=championshipPending?'Retry saving and continue →':'Continue to next race →';$('menuChampDiscard').textContent=complete?'Clear championship results...':'Discard championship...';
      if(!championshipChoosingNew){const preview=active.pack.tracks[Math.min(index,active.pack.tracks.length-1)];showTrackPreview('championship','menuChampStatus',preview,nextRace.lighting==='night',nextRace.environment);}
    }
    if(!active || championshipChoosingNew){if(pack){const env=$('menuChampEnvironment').value,light=$('menuChampLighting').value;showTrackPreview(`pack:${source}:${id}:0`,'menuChampStatus',null,light==='night',env && !['default','random'].includes(env)?env:null);}else clearMenuPreview();}
    if(championshipPending)$('menuChampStatus').textContent='The last result is not saved: '+championshipPending.error+' · Retry before closing the page.';
    else if(championshipLoadError)$('menuChampStatus').textContent=championshipLoadError;
    championshipDiscardPending=false;
  }
  function updateChampionshipResults(){
    const active=championshipState?.active;
    $('quickChampionshipSummary').hidden=false;
    if(active)championshipRows('quickChampionshipStandings',active);
    $('quickChampionshipStatus').textContent=championshipPending?'Result not saved: '+championshipPending.error+' · Retry before closing the page.':'Results and personal bests saved in this browser.';
    $('quickResultsNext').textContent=championshipPending?'Retry saving':active && active.results.length>=active.pack.tracks.length?'Championship standings · A / Enter':'Next race · A / Enter';
  }
  function saveChampionshipPending(){
    if(!championshipPending)return true;
    let next;
    try{next=championshipStore.finish(championshipState,championshipPending.result);}
    catch(error){championshipPending.error=error.message;updateChampionshipResults();return false;}
    championshipState=next;championshipPending=null;updateChampionshipResults();return true;
  }
  function recordChampionshipResult(result){if(!quickSession || quickSession.championshipRecorded)return;quickSession.championshipRecorded=true;championshipPending={result,error:''};saveChampionshipPending();}
  function nextChampionshipRace(){
    if(!quickSession || quickSession.returnPage!=='championship' || !saveChampionshipPending())return;
    const active=championshipState.active,complete=active.results.length>=active.pack.tracks.length;
    drive.stop();if(!complete)quickDrive(true,true,false,true);
  }
  function quickDrive(timed,versus=false,workshop=false,championship=false){
    const trackId=workshop?'menuAITrack':'menuRaceTrack',statusId=championship?'menuChampStatus':workshop?'menuAIStatus':'menuRaceStatus';
    $(statusId).textContent='';
    try {
      const active=championshipState?.active,index=active?.results.length??0;
      const choice=championship?'championship':$(trackId).value,doc=championship?active?.pack.tracks[index]:trackDocument(choice);
      if(!doc)throw Error('There is no next championship track.');
      const built=TS2.build(doc.code,doc.options),plan=championship?active.races[index]:null,raceEnvironment=$('menuRaceEnvironment').value;
      const chosenEnvironment=plan?.environment??(!workshop && raceEnvironment && raceEnvironment!=='default'?raceEnvironment:built.settings.environment);
      const chosenNight=championship?plan.lighting==='night':!workshop && $('menuRaceLighting').value==='night';
      clearMenuPreview();
      quickSession={world,runtime,road,kerbs,walls,fences,ground,sceneryLayer,debug,raceMarkers,checkpointMarkers,crossingArrows,boostLayer,selection,gapMarkers,driveBuffers,
        draft:$('code').value,stats:$('geomStats').textContent,editorState:editor.snapshotState(),
        libraryDocument:{code:runtime.code,draft:$('code').value,options:TrackLibrary.options(runtime.settings),selection:editor.selectedIndex},trackName:doc.name??'Unnamed track',returnPage:championship?'championship':workshop?'ai':'race',night:chosenNight,environment:chosenEnvironment,specials:!workshop && !championship && $('menuRaceSpecials').value==='specials',boostDirection:(!workshop && (championship?plan.direction:$('menuRaceDirection').value)==='reverse')?-1:1,previousDirection:drive.direction,staged:false,started:false};
      // Incomplete/unmarked race setups receive temporary in-memory gates.
      // The selected code and editor document remain byte-for-byte unchanged.
      let temporaryMarkers=null;
      if(timed){
        const racePlan=TrackRace.plan(built);
        if(!racePlan.valid)temporaryMarkers=TrackRace.temporaryMarkers(built);
      }
      if(!applyCode(false,doc.code,doc.options,temporaryMarkers))throw Error($('message').textContent);
      if(quickSession.night){quickSession.dayLighting=saveDayLighting();applyNightLighting();}
      if(!workshop){const direction=championship?plan.direction:($('menuRaceDirection').value||'normal');drive.setRaceDirection(direction);if(drive.direction!==(direction==='reverse'?-1:1))throw Error('Could not set the race direction.');}
      // Free drive starts on the first road, not on a saved editor selection or gap.
      editor.select(Math.max(0,runtime.pieces.findIndex(piece=>!piece.isGap)));
      if(workshop)$('aiWorkshopExit').textContent='← AI workshop';
      const started=workshop?drive.startWorkshop(Number($('menuAICount').value)||2,Number($('menuAILaps').value)||1,$('menuAIDifficulty').value||'normal',$('menuAIDirection').value||'normal'):
        drive.start(timed,versus,championship?active.settings.laps:Number($('menuRaceLaps').value)||3,championship?active.settings.difficulty:$('menuRivalDifficulty').value||'normal',championship?active.settings.opponents:Number($('menuOpponentCount').value)||1);
      if(!started){
        const detail=$('message').textContent;
        throw Error(detail+(versus?' For a larger field, try fewer opponents or a wider, longer start area.':''));
      }
      quickSession.started=true;hideMenu();$('exitDrive').textContent=championship?'Back to championship · Y / Esc':'Back to menu \u00b7 Y / Esc';
      if(temporaryMarkers)message('Temporary race markers are in use for this run. The saved track is unchanged.');
      return true;
    }catch(error){restoreQuickSession();if(championship)refreshChampionship();else showTrackPreview($(trackId).value,statusId);$(statusId).textContent=error.message;return false;}
  }
  $('menuQuick').addEventListener('click',()=>showMenu('race'));
  $('menuChampionshipButton').addEventListener('click',()=>showMenu('championship'));
  $('menuContinueChampionship').addEventListener('click',()=>showMenu('championship'));
  $('menuChampBack').addEventListener('click',()=>showMenu());
  $('menuChampPack').addEventListener('change',refreshChampionship);
  for(const id of ['menuChampLaps','menuChampDirection','menuChampLighting','menuChampEnvironment'])$(id).addEventListener('change',refreshChampionship);
  $('menuChampStart').addEventListener('click',()=>{
    try{
      if(championshipLoadError)throw Error(championshipLoadError);
      const [source,id]=$('menuChampPack').value.split(':'),pack=getPack(source,id);if(!pack)throw Error('Choose a non-empty pack.');
      championshipState=championshipStore.start(championshipState,pack,{opponents:Number($('menuChampOpponents').value),difficulty:$('menuChampDifficulty').value,laps:Number($('menuChampLaps').value),direction:$('menuChampDirection').value,lighting:$('menuChampLighting').value||'default',environment:$('menuChampEnvironment').value||'default'});
      championshipPending=null;championshipChoosingNew=false;quickDrive(true,true,false,true);
    }catch(error){$('menuChampStatus').textContent='Could not start championship: '+error.message;}
  });
  $('menuChampContinue').addEventListener('click',()=>{if(!saveChampionshipPending()){refreshChampionship();return;}if(championshipState.active.results.length>=championshipState.active.pack.tracks.length)refreshChampionship();else quickDrive(true,true,false,true);});
  $('menuChampNew').addEventListener('click',()=>{championshipChoosingNew=true;refreshChampionship();$('menuChampPack').focus?.();});
  $('menuChampCancelNew').addEventListener('click',()=>{championshipChoosingNew=false;refreshChampionship();$('menuChampNew').focus?.();});
  $('menuChampDiscard').addEventListener('click',()=>{
    if(!championshipDiscardPending){championshipDiscardPending=true;$('menuChampDiscard').textContent='Confirm discard championship';$('menuChampStatus').textContent='Press again to discard this championship. Personal bests are kept.';return;}
    try{championshipState=championshipStore.discard(championshipState);championshipPending=null;championshipChoosingNew=false;refreshChampionship();$('menuChampStatus').textContent='Championship cleared. Personal bests are kept.';}
    catch(error){$('menuChampStatus').textContent='Could not clear championship: '+error.message;}
  });
  $('menuGarageButton').addEventListener('click',()=>showMenu('garage'));
  $('menuOptionsButton').addEventListener('click',()=>showMenu('options'));
  $('menuOptionsBack').addEventListener('click',()=>showMenu());
  $('menuToolsButton').addEventListener('click',()=>showMenu('tools'));$('menuToolsBack').addEventListener('click',()=>showMenu());
  $('menuWorkshop').addEventListener('click',()=>showMenu('ai'));
  $('menuBuilder').addEventListener('click',()=>{builderPacks.refresh();hideMenu();$('exitDrive').textContent='Back to editor \u00b7 Y / Esc';});
  $('menuLibrary').addEventListener('click',()=>showMenu('tracks'));
  $('menuEditPacks').addEventListener('click',()=>showMenu('packs'));$('menuPacksBack').addEventListener('click',()=>showMenu('tracks'));
  $('menuRaceBack').addEventListener('click',()=>showMenu());$('menuTracksBack').addEventListener('click',()=>showMenu('tools'));$('menuAIBack').addEventListener('click',()=>showMenu('tools'));
  $('menuRacePack').addEventListener('change',()=>{quickRaceChoiceChanged=true;refreshRaceChoices();showTrackPreview($('menuRaceTrack').value,'menuRaceStatus');});
  $('menuAIPack').addEventListener('change',()=>{refreshRaceChoices('menuAITrack');showTrackPreview($('menuAITrack').value,'menuAIStatus');});
  $('menuRaceTrack').addEventListener('change',()=>{quickRaceChoiceChanged=true;showTrackPreview($('menuRaceTrack').value,'menuRaceStatus');});
  $('menuRaceDirection').addEventListener('change',()=>showTrackPreview($('menuRaceTrack').value,'menuRaceStatus'));
  $('menuRaceSpecials').addEventListener('change',()=>showTrackPreview($('menuRaceTrack').value,'menuRaceStatus'));
  $('menuRaceLighting').addEventListener('change',()=>showTrackPreview($('menuRaceTrack').value,'menuRaceStatus'));
  $('menuRaceEnvironment').addEventListener('change',()=>showTrackPreview($('menuRaceTrack').value,'menuRaceStatus'));
  $('menuAITrack').addEventListener('change',()=>showTrackPreview($('menuAITrack').value,'menuAIStatus'));
  $('menuAIStart').addEventListener('click',()=>quickDrive(true,true,true));
  $('menuLibraryPack').addEventListener('change',()=>{refreshSavedChoices();showTrackPreview(libraryChoice(),'menuLibraryStatus');});
  $('menuSavedTrack').addEventListener('change',()=>{cancelMenuTrackDeletion();updateMenuDeleteTrack();showTrackPreview(libraryChoice(),'menuLibraryStatus');});
  $('menuDeleteTrack').addEventListener('click',()=>{
    cancelMenuTrackDeletion();if($('menuLibraryPack').value!=='mine' || !$('menuSavedTrack').value)return;
    try{pendingMenuTrackDelete=library.prepareDeletion($('menuSavedTrack').value);
      $('menuDeleteTrackText').textContent=`Delete “${pendingMenuTrackDelete.name}” and its saved unfinished edits from My tracks? Track-pack entries and exported files are kept.`;
      $('menuDeleteTrackPrompt').hidden=false;$('menuDeleteTrack').setAttribute('aria-expanded','true');$('menuCancelDeleteTrack').focus?.();
    }catch(error){$('menuLibraryStatus').textContent=`Could not delete track: ${error.message}`;}
  });
  $('menuCancelDeleteTrack').addEventListener('click',()=>{cancelMenuTrackDeletion();$('menuDeleteTrack').focus?.();});
  $('menuConfirmDeleteTrack').addEventListener('click',()=>{
    const target=pendingMenuTrackDelete;cancelMenuTrackDeletion();
    if(!target || $('menuLibraryPack').value!=='mine' || $('menuSavedTrack').value!==target.id)return;
    try{library.deletePrepared(target,{leaveUnsavedIfLast:true});refreshSavedChoices();
      const choice=libraryChoice();if(choice)showTrackPreview(choice,'menuLibraryStatus');else clearMenuPreview();
      $('menuLibraryStatus').textContent=`Deleted “${target.name}” from My tracks. Track-pack entries and exported files were kept.`;
    }catch(error){refreshSavedChoices();$('menuLibraryStatus').textContent=`Could not delete track: ${error.message}`;}
  });
  $('backToMenu').addEventListener('click',()=>showMenu());
  $('menuRival').addEventListener('click',()=>quickDrive(true,true));$('menuTimed').addEventListener('click',()=>quickDrive(true));$('menuFreeDrive').addEventListener('click',()=>quickDrive(false));
  function enterBuilder(){hideMenu();$('exitDrive').textContent='Back to editor \u00b7 Y / Esc';}
  function menuTrackContext(){const source=$('menuLibraryPack').value;return source.startsWith('local:')?source:'mine';}
  $('menuOpenTrack').addEventListener('click',()=>{
    try{
      const choice=libraryChoice();if(!choice)throw Error('Choose a track first.');let opened=false;
      if(choice.startsWith('pack:local:')){const [, ,id,index]=choice.split(':');opened=builderPacks.openPackEntry(id,Number(index));}
      else if(choice.startsWith('saved:')){if(!builderPacks.selectContext('mine'))throw Error($('builderPackStatus').textContent);opened=library.open(choice.slice(6));}
      else {if(!builderPacks.selectContext('mine'))throw Error($('builderPackStatus').textContent);const doc=trackDocument(choice);opened=library.newDocument(doc.code,doc.name,doc.options);}
      if(opened)enterBuilder();else $('menuLibraryStatus').textContent=$('builderPackStatus').textContent||$('saveStatus').textContent;
    }catch(error){$('menuLibraryStatus').textContent='Could not open track: '+error.message;}
  });
  $('menuNewTrack').addEventListener('click',()=>{
    if(!builderPacks.selectContext(menuTrackContext())){$('menuLibraryStatus').textContent=$('builderPackStatus').textContent;return;}
    if(library.newDocument())enterBuilder();else $('menuLibraryStatus').textContent=$('saveStatus').textContent;
  });
  $('menuExportAll').addEventListener('click',()=>{library.exportAll();$('menuLibraryStatus').textContent=$('message').textContent;});
  $('menuExportSet').addEventListener('click',()=>{const ids=Array.from($('menuSavedSet').selectedOptions??[],item=>item.value);library.exportAll(ids);$('menuLibraryStatus').textContent=$('message').textContent;});
  $('menuPackManage').addEventListener('change',()=>{refreshPackManager();previewPackTrackOrAvailable();});
  $('menuPackTracks').addEventListener('change',previewPackTrack);
  $('menuPackTracks').addEventListener('click',previewPackTrack);
  $('menuPackAvailable').addEventListener('change',previewPackAvailable);
  $('menuPackNew').addEventListener('click',()=>{try{const pack=packStore.create($('menuPackName').value);refreshPackManager(pack.id);previewPackTrackOrAvailable();$('menuPackStatus').textContent='Pack created. Add tracks to it below.';}catch(error){$('menuPackStatus').textContent='Could not create pack: '+error.message;}});
  $('menuPackCreateTrack').addEventListener('click',()=>{
    try{
      const id=$('menuPackManage').value,pack=id?packStore.read(id):null;
      if(!pack)throw Error('Choose a pack first.');if(pack.tracks.length>=100)throw Error('This pack already has 100 tracks.');
      if(!builderPacks.selectContext('local:'+id))throw Error($('builderPackStatus').textContent||'Could not select the pack.');
      if(library.newDocument())enterBuilder();else $('menuPackStatus').textContent=$('saveStatus').textContent;
    }catch(error){$('menuPackStatus').textContent='Could not create a track in this pack: '+error.message;}
  });
  $('menuPackRename').addEventListener('click',()=>updatePack(pack=>{pack.name=$('menuPackName').value;}));
  $('menuPackAdd').addEventListener('click',()=>updatePack(pack=>{const choice=$('menuPackAvailable').value,doc=trackDocument(choice);
    const item=Array.from($('menuPackAvailable').children??[]).find(o=>o.value===choice),name=(item?.textContent??'Track').replace(/^(My tracks|Example) - /,'');
    pack.tracks.push({name,code:doc.code,options:doc.options});return pack.tracks.length-1;}));
  $('menuPackRemove').addEventListener('click',()=>updatePack((pack,index)=>{pack.tracks.splice(index,1);return Math.max(0,index-1);}));
  $('menuPackUp').addEventListener('click',()=>updatePack((pack,index)=>{if(index>0)[pack.tracks[index-1],pack.tracks[index]]=[pack.tracks[index],pack.tracks[index-1]];return Math.max(0,index-1);}));
  $('menuPackDown').addEventListener('click',()=>updatePack((pack,index)=>{if(index<pack.tracks.length-1)[pack.tracks[index],pack.tracks[index+1]]=[pack.tracks[index+1],pack.tracks[index]];return Math.min(pack.tracks.length-1,index+1);}));
  $('menuPackExport').addEventListener('click',()=>{try{const pack=packStore.read($('menuPackManage').value),text=TrackPacks.stringify(pack);
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));link.download=(pack.name||'trackshift-pack').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.tsp.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    $('menuPackStatus').textContent='Pack exported with all track codes.';}catch(error){$('menuPackStatus').textContent='Could not export pack: '+error.message;}});
  $('menuPackCopyId').addEventListener('click',()=>{try{const source=packStore.read($('menuPackManage').value);if(!source)throw Error('Choose a pack first.');const name=(source.name.slice(0,64)+' copy').slice(0,80),copy=packStore.copy(source,name);refreshPackManager(copy.id);previewPackTrackOrAvailable();$('menuPackStatus').textContent=`Created “${copy.name}” with a new UUID. Export it to keep a portable copy.`;}catch(error){$('menuPackStatus').textContent='Could not copy pack: '+error.message;}});
  $('menuPackDelete').addEventListener('click',()=>{const id=$('menuPackManage').value;if(!id)return;if(pendingPackDelete!==id){const pack=localPacks().find(item=>item.id===id);pendingPackDelete=id;$('menuPackDelete').textContent='Confirm delete pack';$('menuPackStatus').textContent=`Press Confirm delete pack to remove “${pack?.name??'this pack'}” and its ${pack?.tracks.length??0} packed tracks from this browser. My tracks and championship snapshots stay. Export the pack first if needed.`;return;}
    try{packStore.remove(id);refreshPackManager();previewPackTrackOrAvailable();$('menuPackStatus').textContent='Pack deleted from this browser. My tracks and championship snapshots were kept.';}catch(error){$('menuPackStatus').textContent='Could not delete pack: '+error.message;}});
  function importPackText(text,statusId='menuPackStatus'){
    if(defaultPacksLoading)throw Error('Please wait for the built-in pack list to finish loading before importing.');
    if(!text.trim())throw Error('Paste a complete pack JSON first.');
    const pack=packStore.importText(text);refreshPackManager(pack.id);previewPackTrackOrAvailable();
    $(statusId).textContent=`Imported ${pack.name} with ${pack.tracks.length} tracks.`;return pack;
  }
  $('menuPackPaste').addEventListener('input',()=>{$('menuPackPasteStatus').textContent='';});
  $('menuPackPasteImport').addEventListener('click',()=>{try{importPackText($('menuPackPaste').value,'menuPackPasteStatus');}catch(error){$('menuPackPasteStatus').textContent='Could not import pack: '+error.message;}});
  $('menuPackImport').addEventListener('change',event=>{const file=event.target.files?.[0];if(!file)return;
    if(defaultPacksLoading){$('menuPackStatus').textContent='Please wait for the built-in pack list to finish loading before importing.';event.target.value='';return;}
    if(file.size>8000000){$('menuPackStatus').textContent='Pack file is too large (maximum 8 MB).';event.target.value='';return;}
    const reader=new FileReader();reader.onload=()=>{try{importPackText(String(reader.result));}catch(error){$('menuPackStatus').textContent='Could not import pack: '+error.message;}};
    reader.onerror=()=>{$('menuPackStatus').textContent='Could not read that pack file.';};reader.readAsText(file);event.target.value='';});
  $('menuExportTrack').addEventListener('click',()=>{
    try{const track=trackDocument(libraryChoice());
      const built=TS2.build(track.code,track.options),code=TS2.updateSettings(track.code,encodedShape(built.settings));
      const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([code+'\n'],{type:'text/plain;charset=utf-8'}));
      link.download=(track.name||'trackshift').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.ts2.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
      $('menuLibraryStatus').textContent='Selected track exported as shareable TS2 code.';
    }catch(error){$('menuLibraryStatus').textContent='Could not export track: '+error.message;}
  });
  $('menuImport').addEventListener('change',event=>{
    const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{
      const text=String(reader.result),title=file.name.replace(/(?:\.ts2)?\.txt$|\.ts2$/i,'');
      if(text.includes('RAW BACKUP DATA \u2014 exact local records and current working state:')){
        library.importBackup(text);refreshSavedChoices();$('menuLibraryStatus').textContent=$('message').textContent;
      }else if(!builderPacks.selectContext(menuTrackContext()))$('menuLibraryStatus').textContent=$('builderPackStatus').textContent;
      else if(library.newDocument(text.trim(),title,TrackLibrary.options()))enterBuilder();
      else $('menuLibraryStatus').textContent=$('message').textContent;
    };reader.onerror=()=>{$('menuLibraryStatus').textContent='Could not read that file.';};reader.readAsText(file);event.target.value='';
  });
  menuControls=TrackMenuControls.create({
    root:$('mainMenu'),active:()=>document.body.classList.contains('menu-mode') && !drive.active,
    enabled:()=>$('editorController').checked,rate:()=>Number($('editorControllerRate').value),
    status:value=>{if($('menuControllerStatus').textContent!==value)$('menuControllerStatus').textContent=value;},setSelect:()=>$('menuSavedSet'),
    setHint:value=>{if($('menuSetHint').textContent!==value)$('menuSetHint').textContent=value;},
    inputMethod:raceInputMethod,openSelect:openRaceChoice,selectionOpen:()=>!!raceChoice,selectionMove:moveRaceChoice,selectionConfirm:confirmRaceChoice,closeSelect:()=>closeRaceChoice(),
    fileHint:()=>{$($('menuPacks').hidden?'menuLibraryStatus':'menuPackStatus').textContent='Use the mouse or keyboard to open the file picker; browsers require a direct click or key press.';},
    back:()=>{if(!$('menuHome').hidden)return;showMenu(!$('menuPacks').hidden?'tracks':!$('menuGarage').hidden || !$('menuAI').hidden || !$('menuTracks').hidden?'tools':'home');}
  });
  function syncFullscreen(){
    const active=!!(document.fullscreenElement || document.webkitFullscreenElement);
    for(const id of ['menuFullscreen','quickFullscreen'])$(id).textContent=active?'Exit fullscreen':'Enter fullscreen';
  }
  async function toggleFullscreen(){
    const active=!!(document.fullscreenElement || document.webkitFullscreenElement),target=document.documentElement;
    const method=active?(document.exitFullscreen || document.webkitExitFullscreen):(target?.requestFullscreen || target?.webkitRequestFullscreen);
    const status=['menuFullscreenStatus','quickFullscreenStatus'];
    try{
      if(!method)throw Error('Fullscreen is unavailable in this browser. Try your browser menu or add the game to your home screen.');
      await method.call(active?document:target);for(const id of status)$(id).textContent='';syncFullscreen();
    }catch(error){for(const id of status)$(id).textContent=error.message || 'Fullscreen could not be opened. Try the browser menu.';}
  }
  for(const id of ['menuFullscreen','quickFullscreen'])$(id).addEventListener('click',toggleFullscreen);
  document.addEventListener?.('fullscreenchange',syncFullscreen);document.addEventListener?.('webkitfullscreenchange',syncFullscreen);syncFullscreen();
  function selectDefaultQuickRaceTrack(){
    if(quickRaceChoiceChanged)return;
    const pack=officialPacks().find(item=>item.tracks.length);
    if(!pack){
      refreshPackChoices('menuRacePack');refreshRaceChoices();
      if(document.body.classList.contains('menu-mode') && (!$('menuHome').hidden || !$('menuRace').hidden))showTrackPreview($('menuRaceTrack').value,'menuRaceStatus');
      return;
    }
    refreshPackChoices('menuRacePack');$('menuRacePack').value='official:'+pack.id;
    refreshRaceChoices();$('menuRaceTrack').value=`pack:official:${pack.id}:0`;
    if(document.body.classList.contains('menu-mode') && (!$('menuHome').hidden || !$('menuRace').hidden))showTrackPreview($('menuRaceTrack').value,'menuRaceStatus');
  }
  showMenu();
  selectDefaultQuickRaceTrack();
  function refreshOfficialPackViews(){
    if(raceChoice){pendingOfficialRefresh=true;return;}
    selectDefaultQuickRaceTrack();
    if(drive.active)return; // The active race has its own track snapshot.
    if(!document.body.classList.contains('menu-mode')){builderPacks.refresh();return;}
    if(!$('menuRace').hidden){refreshPackChoices('menuRacePack');refreshRaceChoices();if($('menuRaceTrack').value.startsWith('pack:official:'))showTrackPreview($('menuRaceTrack').value,'menuRaceStatus');}
    else if(!$('menuAI').hidden){refreshPackChoices('menuAIPack');refreshRaceChoices('menuAITrack');if($('menuAITrack').value.startsWith('pack:official:'))showTrackPreview($('menuAITrack').value,'menuAIStatus');}
    else if(!$('menuTracks').hidden)refreshSavedChoices();
    else if(!$('menuChampionship').hidden)refreshChampionship();
  }
  // file:// browsers usually block fetch of neighbouring files. The starter
  // pack remains available there; hosted games load the editable manifest.
  if(typeof window.fetch==='function' && /^https?:/i.test(document.baseURI??window.location?.href??'')){
    defaultPacksLoading=true;
    TrackPacks.loadOfficialManifest().then(result=>{
      $('officialPacksStatus').textContent=result.errors.length?(result.loaded?'Some built-in packs could not be loaded: ':'Built-in pack list could not be loaded; the starter pack remains available. ')+result.errors.join(' · '):'';
      if(result.loaded)refreshOfficialPackViews();
    }).catch(error=>{$('officialPacksStatus').textContent='Could not load the built-in pack list; the starter pack remains available. '+error.message;}).finally(()=>{defaultPacksLoading=false;});
  }
  animate();
})();
