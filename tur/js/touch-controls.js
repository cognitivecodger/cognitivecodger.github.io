/* Multi-touch steering, pedals and zoom for the driving screen. */
(function(){
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function create({root,steering,knob,actions,onZoom}){
    let enabled=false,steer=0,steerPointer=null,keyboardSteer=0,zoomDelay=0;
    const pointers=new Map();
    const active=action=>[...pointers.values()].some(item=>item.action===action);
    function setSteer(value){steer=clamp(value,-1,1);knob.style.left=(50+steer*39)+'%';steering.setAttribute('aria-valuenow',String(Math.round(steer*100)));}
    function pointSteering(event){const bounds=steering.getBoundingClientRect();if(bounds.width>0)setSteer((event.clientX-(bounds.left+bounds.width/2))/(bounds.width*.39));}
    function paint(action){const element=actions[action];if(element)element.classList.toggle('touch-active',active(action));}
    function release(event){
      const item=pointers.get(event.pointerId);if(!item)return;pointers.delete(event.pointerId);
      if(item.action==='steer'){steerPointer=null;setSteer(keyboardSteer);}else paint(item.action);
      if(item.action==='zoomIn'||item.action==='zoomOut')zoomDelay=0;
    }
    function bind(element,action){
      element.addEventListener('pointerdown',event=>{
        if(!enabled || pointers.has(event.pointerId) || action==='steer' && steerPointer!==null || event.pointerType==='mouse' && event.button!==0)return;
        event.preventDefault();pointers.set(event.pointerId,{element,action});
        try{element.setPointerCapture?.(event.pointerId);}catch(error){/* Window release is a fallback. */}
        if(action==='steer'){steerPointer=event.pointerId;pointSteering(event);}
        else{paint(action);if(action==='zoomIn'||action==='zoomOut'){onZoom(action==='zoomIn'?1:-1);zoomDelay=.35;}}
      });
      element.addEventListener('pointermove',event=>{if(enabled && action==='steer' && steerPointer===event.pointerId){event.preventDefault();pointSteering(event);}});
      for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,release);
    }
    bind(steering,'steer');for(const [action,element] of Object.entries(actions))bind(element,action);
    // Pointer capture is not available in every browser or embedded web view.
    window.addEventListener('pointerup',release);window.addEventListener('pointercancel',release);
    steering.addEventListener('keydown',event=>{if(!enabled || !['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();keyboardSteer=event.key==='ArrowLeft'?-1:1;if(steerPointer===null)setSteer(keyboardSteer);});
    steering.addEventListener('keyup',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();event.stopPropagation();keyboardSteer=0;if(steerPointer===null)setSteer(0);});
    function reset(){
      const held=[...pointers.entries()];pointers.clear();steerPointer=null;keyboardSteer=0;zoomDelay=0;setSteer(0);
      for(const action of Object.keys(actions))paint(action);
      for(const [pointerId,item] of held)try{item.element.releasePointerCapture?.(pointerId);}catch(error){/* It may already have been released. */}
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
