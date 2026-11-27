/* Synthesized engine and contact-driven tyre voices, sharing one audio context. */
(function () {
  'use strict';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function engineTone(rpm=1000,load=0,slip=0,engine='standard') {
    const speed=clamp(Number.isFinite(rpm)?rpm:1000,800,7000),power=clamp(Number.isFinite(load)?load:0,0,1),spin=clamp(Number.isFinite(slip)?slip:0,0,1);
    const character=engine==='torque'?.86:engine==='sport'?1.06:1;
    return {frequency:speed/30*character,cutoff:550+speed*.16+power*900+spin*350,gain:.055+power*.09+spin*.025};
  }
  function tyreTone(state={}) {
    let sum=0,loaded=0,rear=0,loose=0,rearLoose=0;
    const speed=Math.hypot(state.vx??0,state.vz??0),locked=clamp((speed-.7)/3,0,1);
    // Ordinary slip can continue while the handbrake is held. Exclude only
    // its synthetic rear lock from the high voice, and rear wheelspin when
    // those wheels are locked. The low voice has its own contact-based gate.
    const rolling={...state,handbrakeActive:false},lockedRear={...rolling,wheelSlip:0,rearWheelSlip:0};
    for(const contact of state.contacts??[]) {
      if(!contact.hit || contact.force<=.05)continue;
      const rearWheel=contact.name[0]==='R';
      const amount=window.TrackSkids?.slip(state.handbrakeActive && rearWheel?lockedRear:rolling,contact)??0;
      const surface=contact.hit.surface??'tarmac',rough=['gravel','dirt','mud','grass'].includes(surface);
      loaded++;sum+=amount;if(rough)loose+=amount;
      if(state.handbrakeActive && rearWheel){rear+=locked;if(rough)rearLoose+=locked;}
    }
    const highIntensity=clamp(sum/Math.max(4,loaded),0,1),deep=clamp(rear/2,0,1);
    const highRoughness=sum?loose/sum:0;
    // Restore the original ordinary-skid variation, independently of rear lock.
    const high={intensity:highIntensity,roughness:highRoughness,
      frequency:1050-200*highIntensity+Math.min(speed,20)*7,cutoff:2600-350*highRoughness,gain:.85*highIntensity**1.35};
    const low={intensity:deep,roughness:rear?rearLoose/rear:0,frequency:380,cutoff:1000,gain:.85*deep};
    return {intensity:Math.max(highIntensity,deep),deep,roughness:(sum+rear)?(loose+rearLoose)/(sum+rear):0,gain:Math.max(high.gain,low.gain),high,low};
  }
  function surfaceRumble(state={}) {
    const vx=Number.isFinite(state.vx)?state.vx:0,vz=Number.isFinite(state.vz)?state.vz:0;
    // Each loaded wheel contributes once. Kerbs are three times louder than
    // wood; if both tags occur on one wheel, use the kerb contribution only.
    let weight=0;for(const contact of state.contacts??[]){if(!(contact.force>.05) || !contact.hit)continue;
      if(contact.hit.kerb===true)weight+=3;else if(contact.hit.surface==='wood')weight++;}
    const speed=Math.hypot(vx,vz);
    return {gain:1.02*clamp((speed-.5)/12,0,1)*clamp(weight/4,0,3),cutoff:160+Math.min(speed,25)*4};
  }
  // Distance is measured in world metres, including height at bridges. A
  // bounded contribution keeps a full starting grid from drowning the player.
  // The wider fade keeps opponents audible farther around the circuit.
  function distanceGain(listener,source) {
    if(!listener || !source)return 0;
    const coordinates=[listener.x,listener.y,listener.z,source.x,source.y,source.z];
    if(!coordinates.every(Number.isFinite))return 0;
    const distance=Math.hypot(source.x-listener.x,source.y-listener.y,source.z-listener.z);
    return .9*clamp(1-distance/120,0,1)**2;
  }
  function tyreVoice(context,destination) {
    if(!context.createBuffer || !context.createBufferSource)return null;
    const noise=context.createBufferSource();
    const buffer=context.createBuffer(1,Math.round(context.sampleRate*2),context.sampleRate),samples=buffer.getChannelData(0);
    let seed=734231,low=0;
    for(let i=0;i<samples.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const white=(seed>>>0)/2147483648-1;low=.96*low+.04*white;samples[i]=white*.6+low*.4;}
    noise.buffer=buffer;noise.loop=true;
    function layer(frequency,cutoff,noiseLevel,toneLevel) {
      const squeal=context.createOscillator(),filter=context.createBiquadFilter(),toneFilter=context.createBiquadFilter();
      const noiseGain=context.createGain(),toneGain=context.createGain(),gain=context.createGain();
      // The low layer keeps its fixed, noise-heavy character. Only the high
      // layer is later modulated by ordinary skid intensity/speed/surface.
      squeal.type='sawtooth';squeal.frequency.value=frequency;
      filter.type='bandpass';filter.frequency.value=cutoff;filter.Q.value=.7;
      toneFilter.type='lowpass';toneFilter.frequency.value=cutoff;toneFilter.Q.value=.45;
      noiseGain.gain.value=noiseLevel;toneGain.gain.value=toneLevel;gain.gain.value=0;
      noise.connect(filter);filter.connect(noiseGain);noiseGain.connect(gain);
      squeal.connect(toneFilter);toneFilter.connect(toneGain);toneGain.connect(gain);gain.connect(destination);
      squeal.start();return {squeal,filter,toneFilter,noiseGain,toneGain,gain};
    }
    const high=layer(900,2000,.55,.12),lowLayer=layer(380,1000,1.1,.035);
    // Reuse the existing noise source for a separate low, non-tonal road
    // rumble. It can play alongside either skid voice without altering them.
    const rumbleFilter=context.createBiquadFilter(),rumbleGain=context.createGain();
    rumbleFilter.type='lowpass';rumbleFilter.frequency.value=160;rumbleFilter.Q.value=.7;rumbleGain.gain.value=0;
    noise.connect(rumbleFilter);rumbleFilter.connect(rumbleGain);rumbleGain.connect(destination);
    high.toneFilter.frequency.value=2200;
    noise.start();return {noise,high,low:lowLayer,rumble:{filter:rumbleFilter,gain:rumbleGain}};
  }
  function create(options={}) {
    let context=null,voice=null,playing=false,enabled=options.enabled!==false,volume=.35,lastStatus='',countdownVoice=null,countdownGeneration=0;
    let checkpointMode=options.checkpointMode==='beep'?'beep':'speech',checkpointVoice=null,checkpointGeneration=0;
    let tyresEnabled=options.tyresEnabled!==false,tyreVolume=.65,rivalsEnabled=options.rivalsEnabled!==false,rivalAudioFailed=false;
    const rivals=[],samples={},boostVoices=[],impactTimes=new WeakMap();let announcementQueue=[],announcementCurrent=null,announcementGeneration=0;
    // HTML audio can load local files when the game is opened via file://.
    // Start preloading after page load so media cannot delay the application.
    const AudioElement=options.Audio??window.Audio;
    if(AudioElement)for(const [key,file] of Object.entries({three:'three.mp3',two:'two.mp3',one:'one.mp3',go:'go.mp3',checkpoint:'check-point.mp3',lapCompleted:'lap-completed.mp3',finalLap:'final-lap.mp3',finished:'finished.mp3'}))try{
      const sound=new AudioElement();sound.preload='none';sound.src='assets/sfx/'+file;sound.volume=volume;samples[key]=sound;
    }catch(error){/* Missing audio support must never prevent a race. */}
    const preloadSamples=()=>{for(const sound of Object.values(samples))try{sound.preload='auto';sound.load?.();}catch(error){}};
    if(window.document?.readyState==='complete')preloadSamples();else window.addEventListener?.('load',preloadSamples,{once:true});
    function stopSample(key){const sound=samples[key];if(!sound)return;try{sound.pause();sound.currentTime=0;}catch(error){}}
    function playSample(key,onFailure){
      const sound=samples[key];if(!sound || !playing || !enabled || volume<=0 || sound.error)return false;
      try{sound.pause();sound.currentTime=0;sound.volume=volume;const pending=sound.play();pending?.catch?.(()=>onFailure?.());return true;}catch(error){return false;}
    }
    function stopBoosts(onlyRivals=false){for(const item of boostVoices){if(onlyRivals && !item.rival)continue;try{item.sound.pause();item.sound.currentTime=0;}catch(error){}item.busy=false;}}
    function boost(source,listener){
      if(!playing || !enabled || volume<=0 || !AudioElement || !source || !listener)return false;
      const rival=source!==listener,attenuation=rival?(rivalsEnabled?distanceGain(listener,source):0):1;
      if(attenuation<=0)return false;
      try{
        let item=boostVoices.find(voice=>!voice.busy);
        if(!item && boostVoices.length<8){
          const sound=new AudioElement();sound.preload='auto';sound.src='assets/sfx/TUR_Speed_Boost.mp3';sound.load?.();
          item={sound,busy:false,rival:false,attenuation:1};sound.onended=()=>{item.busy=false;};sound.onerror=()=>{item.busy=false;};boostVoices.push(item);
        }
        // Prefer an audible player cue over an occupied distant-rival voice.
        if(!item && !rival)item=boostVoices.find(voice=>voice.rival);
        if(!item || item.sound.error)return false;
        const sound=item.sound;if(item.busy){sound.pause();sound.currentTime=0;}
        item.busy=true;item.rival=rival;item.attenuation=attenuation;sound.volume=volume*attenuation;sound.currentTime=0;
        const pending=sound.play();pending?.catch?.(()=>{item.busy=false;});return true;
      }catch(error){return false;}
    }
    function cancelAnnouncements(){
      announcementGeneration++;announcementQueue=[];
      if(announcementCurrent){const sound=samples[announcementCurrent.key];if(sound){sound.onended=null;sound.onerror=null;}stopSample(announcementCurrent.key);announcementCurrent=null;}
    }
    function nextAnnouncement(){
      if(announcementCurrent || !playing || !enabled || volume<=0)return;
      while(announcementQueue.length){
        const key=announcementQueue.shift(),sound=samples[key];if(!sound || sound.error)continue;
        const token=++announcementGeneration;announcementCurrent={key,token};
        const complete=()=>{if(announcementCurrent?.token!==token)return;sound.onended=null;sound.onerror=null;announcementCurrent=null;nextAnnouncement();};
        sound.onended=complete;sound.onerror=complete;
        if(playSample(key,complete))return;
        complete();return;
      }
    }
    function announce(...keys){if(!playing || !enabled || volume<=0)return;announcementQueue.push(...keys);nextAnnouncement();}
    const status=value=>{if(value!==lastStatus){lastStatus=value;options.onStatus?.(value);}};
    const ramp=(param,value,time=.04)=>{param.cancelScheduledValues(context.currentTime);param.setTargetAtTime(value,context.currentTime,time);};
    const mute=()=>{if(voice){for(const param of [voice.master.gain,voice.tyres?.high.gain.gain,voice.tyres?.low.gain.gain,voice.tyres?.rumble.gain.gain].filter(Boolean)){param.cancelScheduledValues(context.currentTime);param.setValueAtTime(0,context.currentTime);}}};
    function cancelCountdown(){
      countdownGeneration++;
      for(const key of ['three','two','one','go'])stopSample(key);
      if(countdownVoice){const old=countdownVoice;countdownVoice=null;try{old.gain.gain.cancelScheduledValues(context.currentTime);old.gain.gain.setValueAtTime(0,context.currentTime);old.osc.stop(context.currentTime);}catch(error){} }
    }
    function countdown(cue=false){
      if(!playing || !enabled)return;
      cancelCountdown();const generation=countdownGeneration,activeContext=context;
      const key=typeof cue==='string'?({'3':'three','2':'two','1':'one','GO!':'go'}[cue]??cue):(cue?'go':'three');
      if(playSample(key))return;
      if(!context || !voice)return;
      const go=key==='go';
      const sound=()=>{
        if(generation!==countdownGeneration || !playing || !enabled || context!==activeContext || context.state!=='running' || !voice)return;
        try{
          const now=context.currentTime,duration=go?.34:.14,osc=context.createOscillator(),gain=context.createGain();
          osc.type='sine';osc.frequency.value=go?990:660;
          gain.gain.setValueAtTime(0,now);
          if(gain.gain.linearRampToValueAtTime){gain.gain.linearRampToValueAtTime(.32,now+.008);gain.gain.setValueAtTime(.32,now+duration-.025);gain.gain.linearRampToValueAtTime(0,now+duration);}
          else gain.gain.setTargetAtTime(.32,now,.008);
          osc.connect(gain);gain.connect(voice.master);countdownVoice={osc,gain};
          osc.onended=()=>{if(countdownVoice?.osc===osc)countdownVoice=null;try{osc.disconnect();gain.disconnect();}catch(error){}};
          osc.start(now);osc.stop(now+duration);
        }catch(error){/* A blocked or unavailable audio device must not stop the race. */}
      };
      if(context.state==='running')sound();else try{context.resume()?.then?.(sound)?.catch?.(()=>{});}catch(error){}
    }
    function cancelCheckpointBeep(){
      checkpointGeneration++;
      if(checkpointVoice){const old=checkpointVoice;checkpointVoice=null;try{old.gain.gain.cancelScheduledValues(context.currentTime);old.gain.gain.setValueAtTime(0,context.currentTime);old.osc.stop(context.currentTime);}catch(error){}}
    }
    function checkpointBeep(){
      if(!playing || !enabled || volume<=0 || !context || !voice)return;
      cancelCheckpointBeep();const generation=checkpointGeneration,activeContext=context;
      const sound=()=>{
        if(generation!==checkpointGeneration || !playing || !enabled || volume<=0 || checkpointMode!=='beep' || context!==activeContext || context.state!=='running' || !voice)return;
        try{
          const now=context.currentTime,duration=.16,osc=context.createOscillator(),gain=context.createGain();osc.type='sine';osc.frequency.value=880;
          gain.gain.setValueAtTime(0,now);
          if(gain.gain.linearRampToValueAtTime){gain.gain.linearRampToValueAtTime(.35,now+.008);gain.gain.setValueAtTime(.35,now+duration-.025);gain.gain.linearRampToValueAtTime(0,now+duration);}
          else gain.gain.setTargetAtTime(.35,now,.008);
          osc.connect(gain);gain.connect(voice.master);checkpointVoice={osc,gain};
          osc.onended=()=>{if(checkpointVoice?.osc===osc)checkpointVoice=null;try{osc.disconnect();gain.disconnect();}catch(error){}};
          osc.start(now);osc.stop(now+duration);
        }catch(error){/* Audio failure must never interrupt the race. */}
      };
      if(context.state==='running')sound();else try{context.resume()?.then?.(sound)?.catch?.(()=>{});}catch(error){}
    }
    function setCheckpointMode(value){
      const next=value==='beep'?'beep':'speech';if(next===checkpointMode)return;checkpointMode=next;cancelCheckpointBeep();
      if(next==='beep'){
        announcementQueue=announcementQueue.filter(key=>key!=='checkpoint');
        if(announcementCurrent?.key==='checkpoint'){const sample=samples.checkpoint;if(sample){sample.onended=null;sample.onerror=null;}announcementGeneration++;announcementCurrent=null;stopSample('checkpoint');nextAnnouncement();}
      }
    }
    function checkpoint(){if(checkpointMode==='beep')checkpointBeep();else announce('checkpoint');}
    function lapCompleted({finalLap=false}={}){
      if(finalLap){cancelCheckpointBeep();cancelAnnouncements();announce('finalLap');}
      else announce('lapCompleted');
    }
    // Finishing takes priority over any queued checkpoint or lap voice.
    function finished(){cancelCheckpointBeep();cancelAnnouncements();announce('finished');}
    function suspend() {cancelCountdown();cancelCheckpointBeep();cancelAnnouncements();stopBoosts();mute();try{const pending=context?.suspend();pending?.catch?.(()=>{});}catch(error){}}
    function unlock() {
      if(!enabled || !playing)return false;
      try {
        if(!context || context.state==='closed') {
          const Constructor=options.Context??window.AudioContext??window.webkitAudioContext;
          if(!Constructor){status('Driving sound unavailable in this browser.');return false;}
          context=new Constructor({latencyHint:'interactive'});
          const motor=context.createOscillator(),bass=context.createOscillator(),motorGain=context.createGain(),bassGain=context.createGain(),filter=context.createBiquadFilter(),limiter=context.createDynamicsCompressor(),engineGain=context.createGain(),master=context.createGain();
          motor.type='sawtooth';bass.type='triangle';motor.frequency.value=34;bass.frequency.value=17;
          motorGain.gain.value=.55;bassGain.gain.value=.3;filter.type='lowpass';filter.frequency.value=900;filter.Q.value=.55;
          limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.005;limiter.release.value=.12;master.gain.value=0;
          motor.connect(motorGain);bass.connect(bassGain);motorGain.connect(filter);bassGain.connect(filter);filter.connect(limiter);limiter.connect(engineGain);engineGain.connect(master);master.connect(context.destination);
          voice={motor,bass,filter,engineGain,master,tyres:null};motor.start();bass.start();
          try{voice.tyres=tyreVoice(context,master);}catch(error){/* Engine-only fallback if tyre synthesis is unavailable. */}
        }
        mute();
        const pending=context.resume();
        pending?.then?.(()=>{if(!playing || !enabled)suspend();else status(context.state==='running'?'Driving sound on.':'Use Enable / retry sound to allow audio.');})?.catch?.(()=>status('Use Enable / retry sound to allow audio.'));
        status(context.state==='running'?'Driving sound on.':'Use Enable / retry sound to allow audio.');return true;
      }catch(error){mute();status('Driving sound unavailable; driving is still available.');return false;}
    }
    function setPlaying(value) {
      const next=!!value;if(next===playing)return;playing=next;
      if(!playing)suspend();else if(context && enabled)unlock();
    }
    function setEnabled(value) {enabled=!!value;if(!enabled){suspend();status('Driving sound off.');}else if(playing)unlock();else status('Driving sound ready for Test Drive.');}
    function setVolume(value) {if(Number.isFinite(value))volume=clamp(value,0,1);for(const sound of Object.values(samples))try{sound.volume=volume;}catch(error){}for(const item of boostVoices)try{item.sound.volume=volume*item.attenuation;}catch(error){}if(volume===0){stopBoosts();mute();cancelCheckpointBeep();cancelAnnouncements();for(const key of Object.keys(samples))stopSample(key);}}
    function muteTyres(){for(const item of [voice,...rivals])if(item?.tyres)for(const v of [item.tyres.high,item.tyres.low,item.tyres.rumble])ramp(v.gain.gain,0,.025);}
    function setTyresEnabled(value){tyresEnabled=!!value;if(!tyresEnabled)muteTyres();}
    function setTyreVolume(value){if(Number.isFinite(value))tyreVolume=clamp(value,0,1);if(tyreVolume===0)muteTyres();}
    function setRivalsEnabled(value){rivalsEnabled=!!value;if(!rivalsEnabled){stopBoosts(true);if(context)for(const rival of rivals)if(rival)ramp(rival.fader.gain,0,.025);}}
    function makeRivalVoice() {
      const motor=context.createOscillator(),bass=context.createOscillator(),motorGain=context.createGain(),bassGain=context.createGain(),filter=context.createBiquadFilter(),limiter=context.createDynamicsCompressor(),engineGain=context.createGain(),fader=context.createGain();
      motor.type='sawtooth';bass.type='triangle';motor.frequency.value=34;bass.frequency.value=17;
      motorGain.gain.value=.55;bassGain.gain.value=.3;filter.type='lowpass';filter.frequency.value=900;filter.Q.value=.55;
      limiter.threshold.value=-12;limiter.knee.value=12;limiter.ratio.value=6;limiter.attack.value=.005;limiter.release.value=.12;fader.gain.value=0;
      motor.connect(motorGain);bass.connect(bassGain);motorGain.connect(filter);bassGain.connect(filter);filter.connect(limiter);limiter.connect(engineGain);engineGain.connect(fader);fader.connect(voice.master);
      const result={motor,bass,filter,engineGain,fader,tyres:null};motor.start();bass.start();
      try{result.tyres=tyreVoice(context,fader);}catch(error){/* Keep engine-only fallback. */}
      return result;
    }
    function updateVoice(item,state,engine) {
      const tone=engineTone(state.engineRPM,state.engineLoad,state.wheelSlip,engine);
      ramp(item.motor.frequency,tone.frequency);ramp(item.bass.frequency,tone.frequency*.5);ramp(item.filter.frequency,tone.cutoff,.07);ramp(item.engineGain.gain,tone.gain,.03);
      if(item.tyres){const tyre=tyreTone(state),high=item.tyres.high,low=item.tyres.low;
        ramp(high.squeal.frequency,tyre.high.frequency,.06);ramp(high.filter.frequency,tyre.high.cutoff,.06);ramp(high.toneFilter.frequency,tyre.high.cutoff,.06);
        ramp(high.noiseGain.gain,.45+.25*tyre.high.roughness,.06);ramp(high.toneGain.gain,.14-.09*tyre.high.roughness,.06);
        ramp(low.noiseGain.gain,1.1+.15*tyre.low.roughness,.06);ramp(low.toneGain.gain,.035-.02*tyre.low.roughness,.06);
        ramp(high.gain.gain,tyresEnabled?tyre.high.gain*tyreVolume:0,tyre.high.gain>high.gain.gain.value?.035:.11);
        ramp(low.gain.gain,tyresEnabled?tyre.low.gain*tyreVolume:0,tyre.low.gain>0?.018:.025);
        const rumble=surfaceRumble(state);ramp(item.tyres.rumble.filter.frequency,rumble.cutoff,.07);
        ramp(item.tyres.rumble.gain.gain,tyresEnabled?rumble.gain*tyreVolume:0,rumble.gain>0?.06:.09);
      }
    }
    // Brief synthesized impacts go through the same master volume as the car.
    // Strength is the actual downward or closing speed in metres per second.
    // Every audible hit is at least three times its previous signal level,
    // with extra headroom for harder hits even above the old maximum.
    function impact(kind,strength,level){
      if(!context || !voice || level<=0)return;
      try{
        const now=context.currentTime,base=clamp((strength-.8)/8,.14,1),severity=clamp((strength-.8)/18,0,1);
        const amount=3*base*(1+severity*.35),metal=kind==='metal',duration=.23;
        for(const [frequency,weight] of (metal?[[110,.28],[310,.13],[520,.07]]:[[95,.42],[48,.18]])){
          const osc=context.createOscillator(),gain=context.createGain();osc.type=metal?'triangle':'sine';osc.frequency.value=frequency;
          gain.gain.setValueAtTime(weight*amount*level,now);gain.gain.setTargetAtTime(0,now,metal?.035:.055);
          osc.connect(gain);gain.connect(voice.master);osc.onended=()=>{try{osc.disconnect();gain.disconnect();}catch(error){}};
          osc.start(now);osc.stop(now+duration);
        }
      }catch(error){/* Optional effects must not interrupt driving. */}
    }
    function update(state,engine='standard',opponents=[]) {
      const field=Array.isArray(opponents)?opponents.slice(0,7):[];
      const ready=playing && enabled && voice && context.state==='running' && volume>0;
      // Consume telemetry even when muted or paused, so old contacts cannot
      // play after audio is re-enabled. Each kind has a short per-car cooldown.
      for(const [source,level] of [[state,1],...field.map(entry=>[entry?.state,rivalsEnabled?distanceGain(state,entry?.state):0])]){
        if(!source?.soundImpacts)continue;
        const events=source.soundImpacts;source.soundImpacts={};
        if(!ready || level<=0)continue;
        const last=impactTimes.get(source)??{};
        for(const kind of ['landing','metal'])if(events[kind]>.8 && context.currentTime-(last[kind]??-Infinity)>(kind==='metal'?.3:.4)){
          impact(kind,events[kind],level);last[kind]=context.currentTime;
        }
        impactTimes.set(source,last);
      }
      if(!ready)return;
      updateVoice(voice,state,engine);ramp(voice.master.gain,volume,.03);
      const gains=field.map(entry=>rivalsEnabled && entry?distanceGain(state,entry.state):0);
      const total=gains.reduce((sum,gain)=>sum+gain,0),mix=total>2.2?2.2/total:1;
      for(let i=0;i<Math.max(field.length,rivals.length);i++){
        const entry=field[i],gain=(gains[i]??0)*mix;
        if(gain>0 && !rivals[i] && !rivalAudioFailed){
          try{rivals[i]=makeRivalVoice();}catch(error){rivalAudioFailed=true;continue;}
        }
        const other=rivals[i];if(!other)continue;
        ramp(other.fader.gain,gain,.08);
        if(gain>0)updateVoice(other,entry.state,entry.engine??'standard');
      }
    }
    function dispose() {
      playing=false;cancelCountdown();cancelCheckpointBeep();cancelAnnouncements();stopBoosts();mute();
      if(voice){try{voice.motor.stop();voice.bass.stop();}catch(error){}}
      if(voice?.tyres){try{voice.tyres.noise.stop();voice.tyres.high.squeal.stop();voice.tyres.low.squeal.stop();}catch(error){}}
      for(const item of rivals){if(!item)continue;try{item.motor.stop();item.bass.stop();}catch(error){}if(item.tyres)try{item.tyres.noise.stop();item.tyres.high.squeal.stop();item.tyres.low.squeal.stop();}catch(error){}}
      rivals.length=0;
      try{context?.close()?.catch?.(()=>{});}catch(error){}voice=null;context=null;rivalAudioFailed=false;
    }
    status(enabled?'Driving sound ready for Test Drive.':'Driving sound off.');
    return {unlock,setPlaying,setEnabled,setVolume,setTyresEnabled,setTyreVolume,setRivalsEnabled,setCheckpointMode,update,boost,silenceEngine:mute,countdown,checkpoint,lapCompleted,finished,cancelCountdown,cancelCheckpointBeep,cancelAnnouncements,dispose,get enabled(){return enabled;},get volume(){return volume;},get tyresEnabled(){return tyresEnabled;},get tyreVolume(){return tyreVolume;},get rivalsEnabled(){return rivalsEnabled;},get checkpointMode(){return checkpointMode;},get status(){return lastStatus;}};
  }
  window.TrackAudio={engineTone,tyreTone,surfaceRumble,woodRumble:surfaceRumble,distanceGain,create};
})();
