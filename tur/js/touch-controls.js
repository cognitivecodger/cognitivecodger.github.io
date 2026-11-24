/* Multi-touch steering, pedals and zoom for the driving screen. */
(function(){
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function create({root,steering,knob,actions,onZoom,onRecover=()=>{}}){
    let enabled=false,steer=0,steerPointer=null,keyboardSteer=0,zoomDelay=0;
    const pointers=new Map(),useTouchEvents=typeof window.TouchEvent==='function';
    const active=action=>[...pointers.values()].some(item=>item.action===action);
    function setSteer(value){steer=clamp(value,-1,1);knob.style.left=(50+steer*39)+'%';steering.setAttribute('aria-valuenow',String(Math.round(steer*100)));}
    function pointSteering(event){const bounds=steering.getBoundingClientRect();if(bounds.width>0)setSteer((event.clientX-(bounds.left+bounds.width/2))/(bounds.width*.39));}
    function paint(action){const element=actions[action];if(element)element.classList.toggle('touch-active',active(action));}
    function releaseId(id){
      const item=pointers.get(id);if(!item)return;pointers.delete(id);
      if(item.action==='steer'){steerPointer=null;setSteer(keyboardSteer);}else paint(item.action);
      if(item.action==='zoomIn'||item.action==='zoomOut')zoomDelay=0;
    }
    function release(event){releaseId(event.pointerId);}
    function start(element,action,id,point){
      if(!enabled || pointers.has(id) || action==='steer' && steerPointer!==null)return false;
      pointers.set(id,{element,action});
      if(action==='steer'){steerPointer=id;pointSteering(point);}
      else{paint(action);if(action==='zoomIn'||action==='zoomOut'){onZoom(action==='zoomIn'?1:-1);zoomDelay=.35;}else if(action==='recover')onRecover();}
      return true;
    }
    function bind(element,action){
      element.addEventListener('pointerdown',event=>{
        if(event.pointerType==='touch' && useTouchEvents || event.pointerType==='mouse' && event.button!==0)return;
        if(!start(element,action,event.pointerId,event))return;event.preventDefault();
        try{element.setPointerCapture?.(event.pointerId);}catch(error){/* Window release is a fallback. */}
      });
      element.addEventListener('pointermove',event=>{if(enabled && action==='steer' && steerPointer===event.pointerId){event.preventDefault();pointSteering(event);}});
      for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,release);
      if(useTouchEvents){
        element.addEventListener('touchstart',event=>{
          if(!enabled)return;event.preventDefault();for(const point of event.changedTouches)start(element,action,'touch:'+point.identifier,point);
        },{passive:false});
        element.addEventListener('touchmove',event=>{
          if(!enabled)return;event.preventDefault();if(action==='steer')for(const point of event.changedTouches)if(steerPointer==='touch:'+point.identifier)pointSteering(point);
        },{passive:false});
        for(const name of ['touchend','touchcancel'])element.addEventListener(name,releaseTouches,{passive:false});
      }
    }
    function releaseTouches(event){
      const ids=Array.from(event.changedTouches,point=>'touch:'+point.identifier),handled=ids.some(id=>pointers.has(id));
      if(handled && event.cancelable!==false)event.preventDefault();for(const id of ids)releaseId(id);
    }
    bind(steering,'steer');for(const [action,element] of Object.entries(actions))bind(element,action);
    actions.recover?.addEventListener('click',event=>{if(enabled && event.detail===0)onRecover();});
    // Pointer capture is not available in every browser or embedded web view.
    window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    if(useTouchEvents){window.addEventListener('touchend',releaseTouches,{passive:false});window.addEventListener('touchcancel',releaseTouches,{passive:false});}
    steering.addEventListener('keydown',event=>{if(!enabled || !['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();keyboardSteer=event.key==='ArrowLeft'?-1:1;if(steerPointer===null)setSteer(keyboardSteer);});
    steering.addEventListener('keyup',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();keyboardSteer=0;if(steerPointer===null)setSteer(0);});
    function reset(){
      const held=[...pointers.entries()];pointers.clear();steerPointer=null;keyboardSteer=0;zoomDelay=0;setSteer(0);
      for(const action of Object.keys(actions))paint(action);
      for(const [pointerId,item] of held)if(typeof pointerId==='number')try{item.element.releasePointerCapture?.(pointerId);}catch(error){/* It may already have been released. */}
    }
    function setEnabled(value){enabled=!!value;reset();root.hidden=!enabled;}
    function sample(){return {steer,steeringActive:steerPointer!==null || keyboardSteer!==0,throttle:(active('accelerate')?1:0)-(active('brake')?1:0),throttleActive:active('accelerate')||active('brake')};}
    function tick(dt){
      if(!enabled)return;const direction=(active('zoomIn')?1:0)-(active('zoomOut')?1:0);if(!direction){zoomDelay=0;return;}
      zoomDelay-=clamp(Number.isFinite(dt)?dt:0,0,.1);if(zoomDelay<=0){onZoom(direction);zoomDelay=.14;}
    }
    setEnabled(false);return {setEnabled,reset,sample,tick};
  }
  window.TrackTouchControls={create};
})();
