/* TrackShift editor presentation. Existing controls remain the source of truth. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id),tabs=[...document.querySelectorAll('[data-workspace]')];
  function workspace(id) {
    if(window.matchMedia('(max-width: 1000px)').matches && !document.body.classList.contains('rail-collapsed'))railVisibility(false);
    if($('editorPanel').hidden)$('toggleEditor').click();
    if($(id).hidden)$('editorPanel').scrollTop=0;
    for(const tab of tabs){const selected=tab.dataset.workspace===id;tab.setAttribute('aria-pressed',String(selected));$(tab.dataset.workspace).hidden=!selected;}
  }
  for(const tab of tabs)tab.addEventListener('click',()=>workspace(tab.dataset.workspace));
  const rail=$('toggleRail');
  function railVisibility(visible) {document.body.classList.toggle('rail-collapsed',!visible);document.body.classList.toggle('rail-open',visible);rail.setAttribute('aria-expanded',String(visible));rail.textContent=visible?'Hide tracks':'Show tracks';}
  railVisibility(!window.matchMedia('(max-width: 1000px)').matches);
  rail.addEventListener('click',()=>railVisibility(document.body.classList.contains('rail-collapsed')));
  const tools=document.createElement('div');tools.className='viewport-tools';tools.setAttribute('aria-label','Track view tools');
  const frame=document.createElement('button');frame.type='button';frame.textContent='◎  Frame track';frame.title='Fit the entire track in the editor view';frame.addEventListener('click',()=>$('fit').click());
  const view=document.createElement('button');view.type='button';view.textContent='◉  View & layers';view.addEventListener('click',()=>workspace('workspaceView'));
  const hint=document.createElement('span');hint.textContent='Drag to orbit · right-drag to pan · scroll to zoom';tools.append(frame,view,hint);document.body.append(tools);
  const updateName=()=>{const name=$('trackName').value.trim()||'Untitled track',status=$('saveStatus').textContent.trim();$('topbarTrackName').textContent=name+(status?' · '+status:'');$('topbarTrackName').title=status||name;};
  $('trackName').addEventListener('input',updateName);$('trackName').addEventListener('change',updateName);
  const nameObserver=new MutationObserver(updateName);nameObserver.observe($('savedTracks'),{childList:true,subtree:true});nameObserver.observe($('saveStatus'),{childList:true,subtree:true,characterData:true});updateName();

  // Keep the existing select and its editor handlers as the source of truth;
  // these larger buttons are a more legible, keyboard-operable presentation.
  const list=$('sectionList'),buttons=$('sectionButtons');
  function syncSelection() {
    const multi=$('multiSelectMode').checked;buttons.setAttribute('aria-multiselectable',String(multi));
    for(const button of buttons.children){const active=button.dataset.value===list.value,option=[...list.options].find(item=>item.value===button.dataset.value),chosen=multi?!!option?.multiSelected:active;button.setAttribute('aria-selected',String(chosen));button.classList.toggle('section-primary',multi && active);button.tabIndex=active?0:-1;}
  }
  function choose(value,focus=false) {
    list.value=value;list.dispatchEvent(new Event('change',{bubbles:true}));syncSelection();
    if(focus)buttons.querySelector(`[data-value="${CSS.escape(value)}"]`)?.focus();
  }
  function renderSections() {
    const scroll=buttons.scrollTop,fragment=document.createDocumentFragment();
    for(const option of list.options) {
      const button=document.createElement('button'),icon=document.createElement('span'),title=document.createElement('span');
      const text=option.textContent;button.type='button';button.className='section-button';button.dataset.value=option.value;button.setAttribute('role','option');
      icon.className='section-button-icon';icon.setAttribute('aria-hidden','true');icon.textContent=text.includes('Gap')?'⋯':text.includes('Left bend')?'↶':text.includes('Right bend')?'↷':text.includes('Auto-close')?'↺':'━';
      title.className='section-button-label';title.textContent=text;button.append(icon,title);button.addEventListener('click',()=>choose(option.value));fragment.append(button);
    }
    buttons.replaceChildren(fragment);buttons.scrollTop=scroll;syncSelection();
  }
  buttons.addEventListener('keydown',event=>{
    const values=[...list.options].map(option=>option.value),at=values.indexOf(list.value);let target;
    if(event.key==='ArrowDown')target=Math.min(values.length-1,at+1);else if(event.key==='ArrowUp')target=Math.max(0,at-1);
    else if(event.key==='Home')target=0;else if(event.key==='End')target=values.length-1;else return;
    if(target>=0 && values[target]!==undefined){event.preventDefault();choose(values[target],true);}
  });
  new MutationObserver(renderSections).observe(list,{childList:true,subtree:true});
  list.addEventListener('change',syncSelection);list.addEventListener('trackshift:selection',syncSelection);renderSections();
  list.tabIndex=-1;list.setAttribute('aria-hidden','true');document.body.classList.add('enhanced-section-list');

  const materialColours={tarmac:'#66727c',gravel:'#aeb3ba',dirt:'#a5805d',wood:'#986638',ice:'#a5e8f6',mud:'#604535'};
  function colourHint(id,statusId,colours) {
    const select=$(id),hint=document.createElement('span'),dot=document.createElement('span'),text=document.createElement('span');
    hint.className='choice-hint';dot.className='choice-swatch';dot.setAttribute('aria-hidden','true');hint.append(dot,text);select.insertAdjacentElement('afterend',hint);
    const update=()=>{
      const raw=select.value.toLowerCase(),fallback=$(statusId)?.textContent.split(/[.:]/)[0].trim().toLowerCase();
      const actual=Object.hasOwn(colours,raw)?raw:Object.hasOwn(colours,fallback)?fallback:null;
      dot.style.background=colours[actual]??'#758c9f';text.textContent=raw?select.selectedOptions[0]?.textContent||raw:`Continuing ${fallback||'previous choice'}`;
    };
    select.addEventListener('change',update);new MutationObserver(update).observe(select,{childList:true,subtree:true});
    if($(statusId))new MutationObserver(update).observe($(statusId),{childList:true,subtree:true,characterData:true});update();
  }
  colourHint('editSurface','sectionMaterialStatus',materialColours);
  colourHint('editEdge','sectionEdgeStatus',{auto:'#95a9b8',curb:'#d4dce2',grey:'#aebcc6',stonekerb:'#8998a3',stripe:'repeating-linear-gradient(90deg,#e66e75 0 5px,#f1f2ee 5px 10px)',wall:'#c8d0d5',stonewall:'#95a5ad',fence:'#8f7658',none:'#263a4b',default:'#95a9b8'});

  const increments={globalLength:.5,globalWidth:.25,globalDepth:.05,globalLevelHeight:.25,globalOuterCorner:.05,
    globalHeading:5,globalStartLevel:.25,globalStartWidth:.25,globalStartLeft:.1,globalStartRight:.1,globalStartCurve:.05,globalStartFlat:.05,
    globalGroundHeight:.25,globalGrassGrip:.05,globalGrassDrag:.25,samples:1,sunAzimuth:5,
    editLength:.1,editAngle:5,editOuterCorner:.05,editHeight:.25,editWidth:.25,editLeft:.1,editRight:.1,editFlatCentre:.05,
    editSlope:.05,editCrossCurve:.05,editSlopeEntryCurve:.05,editSlopeExitCurve:.05,editBankEase:.05,editLengthDetail:1,editWidthDetail:2,editCheckpoint:1,editRacePosition:5};
  const scopes=['#panel','#editorPanel'];
  function step(input,direction) {
    if(input.matches(':disabled'))return;
    const raw=input.value.trim(),fallback=(input.placeholder??'').match(/-?\d+(?:\.\d+)?/),min=input.getAttribute('min'),max=input.getAttribute('max');
    const initial=raw!==''?Number(raw):fallback?Number(fallback[0]):min!==null?Math.max(0,Number(min)):0;
    if(!Number.isFinite(initial))return;
    let value=Number((initial+direction*(increments[input.id]??1)).toPrecision(15));
    if(min!==null)value=Math.max(Number(min),value);if(max!==null)value=Math.min(Number(max),value);
    input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  for(const input of document.querySelectorAll(scopes.map(s=>`${s} input[type=number]`).join(','))) {
    const wrap=document.createElement('span');wrap.className='number-stepper';
    const label=input.getAttribute('aria-label')||input.closest('label')?.textContent.trim()||'value';
    const minus=document.createElement('button'),plus=document.createElement('button');
    for(const [button,sign,direction] of [[minus,'−',-1],[plus,'+',1]]) {
      button.type='button';button.className='stepper-button';button.textContent=sign;
      button.setAttribute('aria-label',`${direction<0?'Decrease':'Increase'} ${label}`);
      button.title=`${direction<0?'Decrease':'Increase'} ${label} by ${increments[input.id]??1}`;
      button.addEventListener('click',()=>step(input,direction));
    }
    input.parentNode.insertBefore(wrap,input);wrap.append(minus,input,plus);
  }
  // Sliders keep their existing input/change handlers. A precise companion
  // field changes the same control and follows programmatic editor refreshes.
  for(const slider of document.querySelectorAll('#editorPanel input[type=range]')) {
    if(slider.closest('#workspaceDrive'))continue;
    if(['editRoughness','editFrequency'].includes(slider.id))slider.step='any';
    const label=slider.closest('label');if(!label)continue;
    const number=document.createElement('input');number.type='number';number.className='range-number';number.step='any';
    number.min=slider.min;number.max=slider.max;number.setAttribute('aria-label',(slider.getAttribute('aria-label')||label.childNodes[0]?.textContent.trim()||'Slider')+' precise value');
    const sync=()=>{if(document.activeElement!==number)number.value=slider.value;};
    slider.insertAdjacentElement('afterend',number);sync();slider.addEventListener('input',sync);slider.addEventListener('change',sync);
    const readout=label.querySelector('.sliderValue');if(readout)new MutationObserver(sync).observe(readout,{childList:true,subtree:true,characterData:true});
    number.addEventListener('change',()=>{
      if(number.value.trim()==='' || !Number.isFinite(Number(number.value)) || !number.checkValidity()){number.setCustomValidity('Enter a value within the allowed range.');number.reportValidity();number.setCustomValidity('');sync();return;}
      slider.value=number.value;slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));number.value=slider.value;
    });
  }
})();
