/* Read-only Gamepad snapshots, sampled independently of display refresh rate. */
(function () {
  'use strict';
  function snapshot(pad) {
    if(!pad)return null;
    return {index:pad.index,id:String(pad.id??''),mapping:pad.mapping,connected:pad.connected!==false,
      axes:Array.from(pad.axes??[],value=>Number.isFinite(value)?value:0),
      buttons:Array.from(pad.buttons??[],button=>({value:Number.isFinite(button?.value)?button.value:button?.pressed?1:0,pressed:button?.pressed===true}))};
  }
  function createReader(read,rate=60) {
    let interval=1/60,elapsed=Infinity,cached=null;
    function reset(){elapsed=Infinity;cached=null;}
    function setRate(value){interval=1/(Number(value)===30?30:60);reset();}
    function sample(dt=0) {
      elapsed+=Number.isFinite(dt)?Math.max(0,Math.min(.25,dt)):0;
      if(cached && elapsed+1e-10<interval)return {...cached,fresh:false};
      elapsed=Number.isFinite(elapsed)?Math.max(0,elapsed%interval):0;
      // Avoid a floating point remainder just below the next full interval.
      if(interval-elapsed<1e-10)elapsed=0;
      try{cached={pads:Array.from(read(),snapshot),error:null};}
      catch(error){cached={pads:[],error:error?.message||'Gamepad access unavailable.'};}
      return {...cached,fresh:true};
    }
    setRate(rate);return {sample,reset,setRate};
  }
  window.TrackController={createReader,snapshot};
})();
