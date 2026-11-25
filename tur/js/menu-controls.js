/* Keyboard and read-only Xbox-style input for the game-facing menu. */
(function(){
  'use strict';
  function create(host){
    const root=host.root,reader=window.TrackController.createReader(()=>{
      if(typeof navigator.getGamepads!=='function')throw Error('Gamepad API unavailable');
      return navigator.getGamepads();
    });
    let focused=true,armed=false,padIndex=null,buttons=[],direction='',held=0,nextRepeat=0,rate=60,setCursor=0,sampleTime=0;
    const active=()=>host.active() && focused && !document.hidden && (typeof document.hasFocus!=='function' || document.hasFocus());
    function status(value){host.status(value);}
    function reset(){armed=false;padIndex=null;buttons=[];direction='';held=0;nextRepeat=0;sampleTime=0;reader.reset();}
    function controls(){
      return Array.from(root.querySelectorAll?.('button, a[href], select, summary, textarea, input[type="file"], input[type="text"], input[type="range"], input[type="checkbox"]')??[])
        .filter(el=>!el.disabled && el.getAttribute?.('tabindex')!=='-1' && !el.closest?.('[hidden]') && (el.getClientRects?.().length??1)>0);
    }
    function focus(el){el?.focus?.();el?.scrollIntoView?.({block:'nearest'});}
    function move(step){
      if(host.selectionOpen?.()){host.selectionMove(step);return;}
      const items=controls();if(!items.length)return;
      let index=items.indexOf(document.activeElement);if(index<0)index=step>0?-1:0;
      focus(items[(index+step+items.length)%items.length]);
      if(document.activeElement?.id==='menuSavedSet')describeSet();
    }
    function eventChange(el){el.dispatchEvent(new Event('change',{bubbles:true}));}
    function describeSet(){
      const el=host.setSelect(),options=Array.from(el?.options??[]);setCursor=Math.max(0,Math.min(setCursor,options.length-1));
      const item=options[setCursor];host.setHint(item?`Set selection: ${item.textContent} - ${item.selected?'selected':'not selected'}. Press A or Space to toggle.`:'No saved tracks to select.');
    }
    function adjust(step){
      if(host.selectionOpen?.()){host.selectionMove(step);return;}
      const el=document.activeElement;
      if(el?.tagName==='INPUT' && el.type==='range'){
        const min=Number(el.min)||0,max=Number(el.max)||100,increment=Number(el.dataset?.menuStep)||Number(el.step)||1,value=Math.max(min,Math.min(max,(Number(el.value)||0)+step*increment));
        if(value!==Number(el.value)){el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));eventChange(el);}return;
      }
      if(el?.tagName!=='SELECT')return;
      const options=Array.from(el.options??[]);if(!options.length)return;
      if(el.multiple){setCursor=Math.max(0,Math.min(options.length-1,setCursor+step));describeSet();return;}
      let i=el.selectedIndex;if(i<0)i=0;
      for(let n=i+step;n>=0 && n<options.length;n+=step)if(!options[n].disabled){el.selectedIndex=n;eventChange(el);break;}
    }
    function activate(){
      if(host.selectionOpen?.()){host.selectionConfirm();return;}
      const el=document.activeElement;if(!el || !controls().includes(el))return;
      if(el.tagName==='SELECT'){
        if(el.multiple){const item=el.options?.[setCursor];if(item){item.selected=!item.selected;eventChange(el);describeSet();}}
        else if(host.openSelect?.(el))return;
        else move(1);
      }else if(el.tagName==='INPUT' && el.type==='file'){
        host.fileHint();
      }else el.click?.();
    }
    function back(){if(host.selectionOpen?.()){host.closeSelect();return;}host.back();}
    function keydown(event){
      if(!active() || event.ctrlKey || event.metaKey || event.altKey)return;
      const key=event.key||event.code;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape',' ','Space'].includes(key))host.inputMethod?.('keyboard');
      if(key==='Tab' && host.selectionOpen?.()){host.closeSelect();return;}
      if((document.activeElement?.tagName==='TEXTAREA' || document.activeElement?.tagName==='INPUT' && document.activeElement.type==='text') && key!=='Escape')return;
      if(key==='Escape'){event.preventDefault();if(!event.repeat)back();return;}
      if(key==='ArrowUp' || key==='ArrowDown'){event.preventDefault();move(key==='ArrowUp'?-1:1);return;}
      if(key==='ArrowLeft' || key==='ArrowRight'){event.preventDefault();adjust(key==='ArrowLeft'?-1:1);return;}
      // Native Enter/Space activates buttons, summaries and file pickers. Only
      // intercept multi-select to make independent selection possible.
      if((key===' ' || key==='Space' || key==='Enter') && document.activeElement?.tagName==='SELECT'){
        event.preventDefault();if(!event.repeat)activate();
      }
    }
    function update(dt){
      if(!active() || !host.enabled()){reset();if(host.active() && !host.enabled())status('Controller off - enable it in Track Builder settings.');return;}
      const wanted=host.rate()===30?30:60;if(wanted!==rate){rate=wanted;reader.setRate(rate);armed=false;padIndex=null;buttons=[];}
      sampleTime+=Math.max(0,Math.min(.25,Number(dt)||0));
      const sample=reader.sample(dt);if(!sample.fresh)return;
      const sampleDt=Math.min(.25,sampleTime);sampleTime=0;
      if(sample.error){armed=false;padIndex=null;buttons=[];direction='';held=0;nextRepeat=0;status('Controller unavailable - use keyboard or mouse.');return;}
      const pads=sample.pads,pad=pads.find(p=>p?.connected!==false && p?.mapping==='standard' && p.index===padIndex)??pads.find(p=>p?.connected!==false && p?.mapping==='standard');
      if(!pad){if(padIndex!==null)reset();status('Controller: connect an Xbox-style pad and press a button.');return;}
      if(pad.index!==padIndex){reset();padIndex=pad.index;}
      const input=window.TrackDrive.gamepadInput(pad);if(!input)return;
      if(!armed){if(!input.neutral){status('Release the controller controls to navigate.');return;}armed=true;buttons=input.buttons.slice();status('Controller ready - D-pad or left stick to navigate, A select, B back.');return;}
      const pressed=i=>input.buttons[i] && !buttons[i];
      const x=Number(pad.axes?.[0])||0,y=Number(pad.axes?.[1])||0;
      const up=input.buttons[12]||y<-.55,down=input.buttons[13]||y>.55,left=input.buttons[14]||x<-.55,right=input.buttons[15]||x>.55;
      const next=up&&!down?'up':down&&!up?'down':left&&!right?'left':right&&!left?'right':'';
      if(next || input.buttons.some((value,i)=>value&&!buttons[i]))host.inputMethod?.('controller');
      if(next!==direction){direction=next;held=0;nextRepeat=.38;if(next)navigate(next);}
      else if(next){held+=sampleDt;if(held>=nextRepeat){navigate(next);nextRepeat=held+.14;}}
      if(pressed(0))activate();else if(pressed(1))back();
      buttons=input.buttons.slice();
    }
    function navigate(which){if(which==='up')move(-1);else if(which==='down')move(1);else adjust(which==='left'?-1:1);}
    window.addEventListener('keydown',keydown);
    window.addEventListener('pointerdown',()=>{if(active())host.inputMethod?.('keyboard');});
    window.addEventListener('blur',()=>{focused=false;reset();});
    window.addEventListener('focus',()=>{focused=true;reset();});
    document.addEventListener?.('visibilitychange',reset);
    return {update,reset};
  }
  window.TrackMenuControls={create};
})();
