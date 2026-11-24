/* Explicit, read-only controller isolation check. No game, Three.js or haptics. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const reader=TrackController.createReader(()=>{
    if(typeof navigator.getGamepads!=='function')throw Error('Gamepad API unavailable. Try a desktop browser on localhost.');
    return navigator.getGamepads();
  });
  let active=false,frame=null,previousTime=null,reads=0,lastView=0,lastSignature='',started=null;
  const lines=[];
  function log(message) {
    lines.push(`${new Date().toISOString()} · ${message}`);if(lines.length>120)lines.shift();
    $('checkLog').value=lines.join('\n');
  }
  const name=pad=>`${pad.id||'Unnamed controller'} · slot ${pad.index} · ${pad.mapping||'unmapped'}`;
  function connected(event){log(`Browser connected event: ${name(event.gamepad)}`);}
  function disconnected(event){log(`Browser disconnected event: ${name(event.gamepad)}`);}
  function stop(reason='Monitoring stopped by user.') {
    if(!active)return;
    active=false;if(frame!==null)cancelAnimationFrame(frame);frame=null;reader.reset();
    window.removeEventListener('gamepadconnected',connected);window.removeEventListener('gamepaddisconnected',disconnected);
    $('checkStart').disabled=false;$('checkStop').disabled=true;$('checkRate').disabled=false;
    $('checkStatus').textContent='Stopped · no controller reads';log(reason);
  }
  function update(now) {
    if(!active)return;
    const sample=reader.sample(previousTime===null?0:(now-previousTime)/1000);previousTime=now;
    if(sample.fresh)reads++;
    if(sample.error){log(`Input read failed: ${sample.error}`);stop('Monitoring stopped after an input error.');return;}
    const pads=sample.pads.filter(p=>p?.connected),signature=pads.map(p=>name(p)).join('\n');
    if(signature!==lastSignature){log(pads.length?`Visible controller(s): ${signature}`:'No connected controller is visible to the browser.');lastSignature=signature;}
    if(now-lastView>=100 || lastView===0) {
      lastView=now;$('checkStatus').textContent=pads.length?`${pads.length} controller(s) visible`:'Waiting · press a controller button';
      $('checkReading').textContent=pads.length?pads.map(p=>`${name(p)}\nAxes: ${p.axes.map(value=>value.toFixed(2)).join(', ')}\nButtons down: ${p.buttons.map((b,i)=>b.pressed||b.value>.1?i:null).filter(i=>i!==null).join(', ')||'none'}`).join('\n\n'):'No controller visible.';
      $('checkCounts').textContent=`Reads: ${reads} · selected limit ${$('checkRate').value}/second`;
    }
    frame=requestAnimationFrame(update);
  }
  function start() {
    if(active)return;
    active=true;started=new Date().toISOString();previousTime=null;lastView=0;lastSignature='';
    reader.setRate(Number($('checkRate').value));$('checkStart').disabled=true;$('checkStop').disabled=false;$('checkRate').disabled=true;
    log(`Monitoring started at ${$('checkRate').value} reads/second. Browser: ${navigator.userAgent}`);
    window.addEventListener('gamepadconnected',connected);window.addEventListener('gamepaddisconnected',disconnected);
    frame=requestAnimationFrame(update);
  }
  function report(){return `TUR controller connection check\nStarted: ${started??'Not started'}\nReads: ${reads}\n\n${lines.join('\n')||'No controller reads taken.'}\n\nLatest reading:\n${$('checkReading').textContent}\n`;}
  $('checkStart').addEventListener('click',start);$('checkStop').addEventListener('click',()=>stop());
  window.addEventListener('blur',()=>stop('Monitoring stopped on focus loss.'));
  window.addEventListener('pagehide',()=>stop('Monitoring stopped on page exit.'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('Monitoring stopped when the page became hidden.');});
  $('checkCopy').addEventListener('click',async()=>{
    stop('Monitoring stopped to copy the report.');
    try{await navigator.clipboard.writeText(report());$('checkCopyStatus').textContent='Report copied.';}
    catch(error){$('checkLog').value=report();$('checkLog').focus();$('checkLog').select();$('checkCopyStatus').textContent='Report selected. Press Ctrl+C to copy it.';}
  });
  $('checkSave').addEventListener('click',()=>{
    stop('Monitoring stopped to save the report.');
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([report()],{type:'text/plain'}));
    link.download='tur-controller-check.txt';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  });
})();
