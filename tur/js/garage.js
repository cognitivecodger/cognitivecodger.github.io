/* Garage controls use the same component catalogue as the driving simulation. */
(function(){
  'use strict';
  const KEY='trackshift.garage.v1';
  const PARTS={Engine:['engine','ENGINES'],Tyres:['tyres','TYRES'],Drivetrain:['drivetrain','DRIVETRAINS'],Suspension:['suspension','SUSPENSIONS'],Steering:['steering','STEERINGS'],Assist:['assist','STEERING_ASSISTS']};
  const COLOURS={Orange:0xec963f,Blue:0x278ef6,Red:0xe64d42,Green:0x32b879,Purple:0xa35ced,White:0xdce7ec};
  const colorValid=n=>Number.isInteger(n) && Object.values(COLOURS).includes(n);
  const validBody=value=>Object.hasOwn(window.TrackDrive.CAR_BODIES,value)?value:'basic';
  function create(host){
    const $=id=>document.getElementById(id),catalog=window.TrackVehicle;
    let records=[],draft={...host.build().selection},colour=host.colour(),body=host.body(),writing=false,preview=null,previewObserver=null;
    const status=text=>{$('garageStatus').textContent=text;};
    const validSelection=value=>{try{return {...catalog.resolveBuild(value).selection};}catch(error){return null;}};
    function read(){
      try{
        const raw=window.localStorage.getItem(KEY);if(!raw)return;
        const data=JSON.parse(raw);if(data?.version!==1 || !Array.isArray(data.setups))return;
        const names=new Set();records=data.setups.flatMap(item=>{
          const selection=validSelection(item?.selection),name=typeof item?.name==='string'?item.name.trim():'';
          if(!name || name.length>48 || names.has(name.toLowerCase()) || !selection || !colorValid(item.colour))return [];
          names.add(name.toLowerCase());return [{name,selection,colour:item.colour,body:validBody(item.body)}];
        }).slice(0,100);
        const active=validSelection(data.active?.selection),activeColour=data.active?.colour;
        if(active && colorValid(activeColour)){host.setColour(activeColour);host.setBody(validBody(data.active?.body));host.setBuild(active);}
      }catch(error){}
    }
    function persist(activeSelection=host.build().selection,activeColour=host.colour(),next=records){
      try{window.localStorage.setItem(KEY,JSON.stringify({version:1,active:{selection:{...activeSelection},colour:activeColour,body:host.body()},setups:next}));return true;}
      catch(error){return false;}
    }
    function fillPresets(){
      const options=catalog.PRESETS.map(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.label;return option;});
      const custom=document.createElement('option');custom.value='custom';custom.textContent='Custom mix';custom.disabled=true;options.push(custom);
      $('garagePreset').replaceChildren(...options);
    }
    function fillSaved(preferred=''){
      const options=records.map(item=>{const option=document.createElement('option');option.value=item.name;option.textContent=item.name;return option;});
      if(!options.length){const option=document.createElement('option');option.value='';option.textContent='No saved setups yet';options.push(option);}
      $('garageSaved').replaceChildren(...options);$('garageSaved').value=records.some(item=>item.name===preferred)?preferred:(records[0]?.name??'');
      $('garageLoad').disabled=!records.length;$('garageDelete').disabled=!records.length;
    }
    function closePreview(){
      previewObserver?.disconnect();previewObserver=null;
      if(!preview)return;
      const geometries=new Set(),materials=new Set();
      preview.scene.traverse(part=>{if(part.geometry)geometries.add(part.geometry);if(part.material)(Array.isArray(part.material)?part.material:[part.material]).forEach(material=>materials.add(material));});
      for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
      preview.renderer.dispose?.();preview=null;
    }
    function drawPreview(){
      if(!preview)return;
      if(preview.body!==body){
        const old=preview.car.group,geometries=new Set(),materials=new Set();
        old.traverse(part=>{if(part.geometry)geometries.add(part.geometry);if(part.material)materials.add(part.material);});
        preview.scene.remove(old);for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
        preview.car=window.TrackDrive.createCarModel(colour,body);preview.car.group.position.y=.65;preview.car.group.rotation.y=-.25;preview.scene.add(preview.car.group);preview.body=body;
      }
      const canvas=$('garageCarPreview'),box=canvas.getBoundingClientRect?.();
      const width=Math.round(box?.width??canvas.clientWidth??0),height=Math.round(box?.height??canvas.clientHeight??0);
      if(width<1 || height<1)return;
      const camera=preview.camera,half=2.75,aspect=width/height;
      camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();
      preview.renderer.setSize(width,height,false);
      const paint=preview.car.bodyMaterial.color;
      if(paint && typeof paint.setHex==='function')paint.setHex(colour);else preview.car.bodyMaterial.color=colour;
      preview.renderer.render(preview.scene,camera);
    }
    function openPreview(){
      if(preview){drawPreview();return;}
      let renderer=null,scene=null;
      try{
        renderer=new THREE.WebGLRenderer({canvas:$('garageCarPreview'),alpha:true,antialias:true});
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setClearColor?.(0x000000,0);
        renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
        scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x52647a,.8));
        const light=new THREE.DirectionalLight(0xffffff,1.2);light.position.set(5,8,7);scene.add(light);
        for(const [radius,height,y,color] of [[2.8,.18,-.22,0x101a36],[2.72,.07,-.095,0x3ae3f5],[2.58,.05,-.035,0x263b59]]){
          const disc=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,height,48),new THREE.MeshLambertMaterial({color}));disc.position.y=y;scene.add(disc);
        }
        const car=window.TrackDrive.createCarModel(colour,body);car.group.position.y=.65;car.group.rotation.y=-.25;scene.add(car.group);
        const camera=new THREE.OrthographicCamera(-4,4,2.75,-2.75,.1,100);camera.position.set(6.5,4.8,8);camera.lookAt(new THREE.Vector3(0,.42,0));
        preview={renderer,scene,camera,car,body};$('garagePreviewMessage').textContent='Current in-game car';
        if(typeof ResizeObserver!=='undefined'){previewObserver=new ResizeObserver(()=>drawPreview());previewObserver.observe($('garageCarPreview'));}
        drawPreview();
      }catch(error){
        if(scene && renderer){preview={scene,renderer};closePreview();}else renderer?.dispose?.();
        $('garagePreviewMessage').textContent='3D preview unavailable';
      }
    }
    function render(){
      const b=catalog.resolveBuild(draft);$('garagePreset').value=b.preset?.id??'custom';
      $('garageBody').value=body;$('garageBodyCard').textContent=window.TrackDrive.CAR_BODIES[body];$('garageBodyTitle').textContent=window.TrackDrive.CAR_BODIES[body];
      $('garagePreviewLabel').textContent=b.label+' setup';$('garageTopSpeed').textContent=Math.round(b.engine.maxSpeed*3.6)+' km/h';
      $('garageAcceleration').textContent=Math.round(b.engine.acceleration*10)+'%';$('garageDriveMetric').textContent=b.drivetrain.shortLabel;
      $('garageSteeringMetric').textContent=b.steering.label;
      for(const [suffix,[key,collection]] of Object.entries(PARTS)){
        const item=b[key],choices=catalog[collection],index=choices.findIndex(choice=>choice.id===item.id);
        $('garage'+suffix+'Value').textContent=item.shortLabel??item.label;$('garage'+suffix+'Help').textContent=item.description;
        $('garage'+suffix+'Prev').disabled=index===0;$('garage'+suffix+'Next').disabled=index===choices.length-1;
      }
      for(const [name,value] of Object.entries(COLOURS))$('garageColour'+name).setAttribute('aria-pressed',String(value===colour));
      drawPreview();
    }
    function open(){draft={...host.build().selection};colour=host.colour();body=host.body();fillSaved();render();openPreview();status('Changes are a preview until you apply the setup.');}
    function apply(){
      if(!validSelection(draft) || !colorValid(colour)){status('Choose a valid vehicle setup.');return false;}
      writing=true;let ok=false;const previousColour=host.colour(),previousBody=host.body();
      try{if(!host.setColour(colour)){status('Stop driving before changing the vehicle.');return false;}ok=host.setBody(body)!==false && host.setBuild(draft)!==false;if(!ok){host.setColour(previousColour);host.setBody(previousBody);}}
      finally{writing=false;}
      if(!ok){status('The setup could not be applied.');return false;}
      const saved=persist();status(saved?'Setup applied and kept in this browser.':'Setup applied for this session; browser storage is unavailable.');return true;
    }
    function externalChange(build){if(writing)return;persist(build.selection,host.colour());}
    for(const [suffix,[key,collection]] of Object.entries(PARTS))for(const [direction,step] of [['Prev',-1],['Next',1]])$('garage'+suffix+direction).addEventListener('click',()=>{
      const choices=catalog[collection],index=choices.findIndex(item=>item.id===draft[key]),next=Math.max(0,Math.min(choices.length-1,index+step));
      draft={...draft,[key]:choices[next].id};render();status('Changes are a preview until you apply the setup.');
    });
    for(const [name,value] of Object.entries(COLOURS))$('garageColour'+name).addEventListener('click',()=>{colour=value;render();status('Changes are a preview until you apply the setup.');});
    $('garageBody').addEventListener('change',()=>{body=validBody($('garageBody').value);render();status('Changes are a preview until you apply the setup.');});
    $('garagePreset').addEventListener('change',()=>{try{draft={...catalog.resolveBuild($('garagePreset').value).selection};render();status('Preset selected. Apply it to use it for driving.');}catch(error){render();}});
    $('garageReset').addEventListener('click',()=>{draft={...catalog.resolveBuild('balanced').selection};colour=COLOURS.Orange;body='basic';render();status('Balanced orange car restored in the preview. Apply it to use it.');});
    $('garageApply').addEventListener('click',apply);
    $('garageTest').addEventListener('click',()=>{if(apply())host.testDrive();});
    $('garageBack').addEventListener('click',()=>host.back());
    $('garageSave').addEventListener('click',()=>{
      const name=$('garageName').value.trim();
      if(!name || name.length>48){status('Enter a setup name of up to 48 characters.');return;}
      if(records.some(item=>item.name.toLowerCase()===name.toLowerCase())){status('That name already exists. Choose a different name.');return;}
      if(records.length>=100){status('The garage can store up to 100 setups.');return;}
      const next=[...records,{name,selection:{...draft},colour,body}];
      if(!persist(host.build().selection,host.colour(),next)){status('Could not save: browser storage is unavailable or full.');return;}
      records=next;fillSaved(name);status('Setup saved in this browser. Apply it when you are ready to drive.');
    });
    $('garageLoad').addEventListener('click',()=>{
      const item=records.find(record=>record.name===$('garageSaved').value);if(!item)return;
      draft={...item.selection};colour=item.colour;body=item.body;$('garageName').value=item.name;render();status('Saved setup loaded for preview. Apply it to use it.');
    });
    $('garageDelete').addEventListener('click',()=>{
      const item=records.find(record=>record.name===$('garageSaved').value);if(!item)return;
      if(typeof window.confirm==='function' && !window.confirm(`Delete the saved setup “${item.name}”?`))return;
      const next=records.filter(record=>record!==item);
      if(!persist(host.build().selection,host.colour(),next)){status('Could not delete: browser storage is unavailable.');return;}
      records=next;fillSaved();status('Saved setup deleted. The current car is unchanged.');
    });
    window.addEventListener('resize',drawPreview);window.addEventListener('pagehide',closePreview);
    fillPresets();read();fillSaved();render();
    return {open,close:closePreview,externalChange,apply,get selection(){return {...draft};},get colour(){return colour;},get setups(){return records.map(item=>({...item,selection:{...item.selection}}));}};
  }
  window.TrackGarage={create,KEY,COLOURS};
})();
