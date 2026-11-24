/* Shareable race gates and simulation-time trials. No rendering or storage. */
(function () {
  'use strict';
  const rad=Math.PI/180;
  const surfaceCache=new WeakMap();
  function roadHeight(buffer,index,point) {
    let pieces=surfaceCache.get(buffer);if(!pieces){pieces=new Map();surfaceCache.set(buffer,pieces);}
    let surface=pieces.get(index);
    if(!surface) {
      // Race paint can sample a detailed rough section thousands of times.
      // Index its existing faces once so each sample only checks nearby
      // triangles, while exceptionally large faces remain in a short fallback.
      const cellSize=4,cells=new Map(),large=[];
      const range=buffer.pieceRanges.find(range=>range.pieceIndex===index),positions=buffer.positions;
      if(range)for(let i=range.start*9;i<(range.start+range.count)*9;i+=9) {
        const a={x:positions[i],y:positions[i+1],z:positions[i+2]},
          b={x:positions[i+3],y:positions[i+4],z:positions[i+5]},c={x:positions[i+6],y:positions[i+7],z:positions[i+8]};
        const dx1=b.x-a.x,dz1=b.z-a.z,dx2=c.x-a.x,dz2=c.z-a.z,denom=dx1*dz2-dx2*dz1;
        if(denom< -1e-10){ // Upward top faces only; exclude slab bottoms/sides.
          const triangle={a,b,c,dx1,dz1,dx2,dz2,denom,order:i},margin=Math.max(1e-6,(Math.abs(dx1)+Math.abs(dx2))*1e-5,(Math.abs(dz1)+Math.abs(dz2))*1e-5);
          const minX=Math.floor((Math.min(a.x,b.x,c.x)-margin)/cellSize),maxX=Math.floor((Math.max(a.x,b.x,c.x)+margin)/cellSize),
            minZ=Math.floor((Math.min(a.z,b.z,c.z)-margin)/cellSize),maxZ=Math.floor((Math.max(a.z,b.z,c.z)+margin)/cellSize);
          if((maxX-minX+1)*(maxZ-minZ+1)>2048)large.push(triangle);
          else for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
            const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(triangle);
          }
        }
      }
      surface={cells,large,cellSize};pieces.set(index,surface);
    }
    let closest=null,bestOrder=Infinity;
    const local=surface.cells.get(Math.floor(point.x/surface.cellSize)+','+Math.floor(point.z/surface.cellSize))??[];
    for(const {a,b,c,dx1,dz1,dx2,dz2,denom,order} of surface.large.length?[...local,...surface.large]:local) {
      const dx=point.x-a.x,dz=point.z-a.z,u=(dx*dz2-dx2*dz)/denom,v=(dx1*dz-dx*dz1)/denom;
      if(u< -1e-5 || v< -1e-5 || u+v>1.00001)continue;
      const y=a.y+(b.y-a.y)*u+(c.y-a.y)*v;
      const distance=Math.abs(y-point.y),best=closest===null?Infinity:Math.abs(closest-point.y);
      if(distance<best || distance===best && order<bestOrder){closest=y;bestOrder=order;}
    }
    return closest;
  }
  function at(piece,fraction) {
    const lengths=piece.poses.slice(1).map((p,i)=>Math.hypot(p.x-piece.poses[i].x,p.y-piece.poses[i].y,p.z-piece.poses[i].z));
    let distance=lengths.reduce((sum,v)=>sum+v,0)*fraction;
    for(let i=0;i<lengths.length;i++) {
      if(distance<=lengths[i] || i===lengths.length-1) {
        const a=piece.poses[i],b=piece.poses[i+1],t=Math.max(0,Math.min(1,distance/Math.max(1e-12,lengths[i]))),p={};
        for(const key of ['x','y','z','width','bankLeft','bankRight','bankCurve'])p[key]=(a[key]??0)+((b[key]??0)-(a[key]??0))*t;
        if(a.bankFlat!==undefined || b.bankFlat!==undefined)p.bankFlat=(a.bankFlat??0)+((b.bankFlat??0)-(a.bankFlat??0))*t;
        if(a.extraLeft || a.extraRight || b.extraLeft || b.extraRight){
          for(const key of ['extraLeft','extraRight'])p[key]=(a[key]??0)+((b[key]??0)-(a[key]??0))*t;
          for(const [key,side] of [['edgeNegative',-1],['edgePositive',1]]){
            const start=window.TS2.roadPoint(a,side),end=window.TS2.roadPoint(b,side);
            p[key]={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:start.z+(end.z-start.z)*t};
          }
        }
        p.yaw=a.yaw+(((b.yaw-a.yaw+540)%360)-180)*t;return p;
      }
      distance-=lengths[i];
    }
    return {...piece.start};
  }
  function plan(runtime,road=null,direction=1) {
    const gates=[];let distance=0;
    runtime.pieces.forEach((piece,index)=>{
      const markers=runtime.temporaryRaceMarkers?
        runtime.temporaryRaceMarkers.filter(marker=>marker.pieceIndex===index):
        (()=>{const kind=window.TS2.raceMarker(piece.source);return kind?[{kind,number:kind==='CP'?piece.source.CP:null,fraction:piece.source.RP??.5}]:[];})();
      for(const marker of markers){
        const {kind}=marker,fraction=marker.fraction,pose=at(piece,fraction),yaw=pose.yaw*rad;
        const explicit=piece.source.ES,edge=piece.isClose && piece.edgeStyle!==undefined?piece.edgeStyle:
          explicit && explicit.toLowerCase()!=='default'?explicit:piece.end.edge;
        const edgeWidth=window.TS2.edgeStyle(edge)?.mode==='none'?0:window.TS2.EDGE_WIDTH;
        gates.push({kind,number:kind==='CP'?marker.number:null,pieceIndex:index,fraction,pose,distance:distance+piece.length*fraction,levelCrossingPartners:road?.levelCrossingPartners?.[index]??[],
          forward:{x:Math.sin(yaw),z:Math.cos(yaw)},left:{x:Math.cos(yaw),z:-Math.sin(yaw)},roadTop:runtime.settings.tarmacDepth*.5,edgeWidth,road});
      }
      distance+=piece.length;
    });
    const result={gates,total:distance,direction:direction===-1?-1:1,mode:'free',valid:false,start:null,finish:null,checkpoints:[],message:'Free drive · add race markers or choose a time-trial example.'};
    if(!gates.length)return result;
    const sf=gates.filter(g=>g.kind==='SF'),rs=gates.filter(g=>g.kind==='RS'),rf=gates.filter(g=>g.kind==='RF');
    const fail=message=>({...result,message});
    if(sf.length) {
      result.mode='lap';
      if(sf.length!==1 || rs.length || rf.length)return fail('Lap timing needs one SF line and no separate RS/RF lines.');
      result.start=result.finish=sf[0];
    } else {
      result.mode='sprint';
      if(rs.length!==1 || rf.length!==1)return fail('Sprint timing needs one RS start and one RF finish.');
      result.start=rs[0];result.finish=rf[0];
      if(result.finish.distance<=result.start.distance)return fail('Place the sprint finish after its start in track order.');
    }
    const cp=gates.filter(g=>g.kind==='CP').sort((a,b)=>a.number-b.number);
    if(result.mode==='lap' && !cp.length)return fail('Add at least CP=1 to validate laps, or use Set up lap timing.');
    const first=runtime.pieces[0].start,lastPose=runtime.pieces.at(-1).end;
    if(result.mode==='lap' && !runtime.autoClose && Math.hypot(first.x-lastPose.x,first.y-lastPose.y,first.z-lastPose.z)>.1)
      return fail('Lap timing needs a closed track. Use Auto-close, or RS/RF for a sprint.');
    if(cp.some((gate,i)=>gate.number!==i+1))return fail('Checkpoint numbers must be unique and consecutive: CP=1, CP=2, …');
    for(let i=0;i<gates.length;i++)for(let j=i+1;j<gates.length;j++) {
      const a=gates[i].pose,b=gates[j].pose;
      if(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.05)return fail('Place race markers at different positions. Use one SF line for a shared start/finish.');
    }
    const relative=gate=>result.mode==='lap'?(gate.distance-result.start.distance+distance)%distance:gate.distance-result.start.distance;
    let last=0;
    for(const gate of cp) {
      const offset=relative(gate);
      if(offset<=last+1e-5 || (result.mode==='sprint' && gate.distance>=result.finish.distance-1e-5))return fail('Checkpoints must follow CP number order between start and finish.');
      last=offset;
    }
    result.checkpoints=cp;result.valid=true;
    result.message=`${result.mode==='lap'?'Lap timing':'Sprint timing'} · ${cp.length} ordered checkpoint${cp.length===1?'':'s'}. Cross lines in the track direction.`;
    if(result.direction===-1) {
      // Validate authored markers once, then derive a reversed race. Physical
      // poses/left vectors keep their bank meaning; only travel vectors flip.
      const reversed=new Map(gates.map(g=>[g,{...g,kind:g.kind==='RS'?'RF':g.kind==='RF'?'RS':g.kind,
        forward:{x:-g.forward.x,z:-g.forward.z}}]));
      const start=result.start;result.start=reversed.get(result.finish);result.finish=reversed.get(start);
      result.gates=gates.map(g=>reversed.get(g));result.checkpoints=cp.slice().reverse().map(g=>reversed.get(g));
      result.message=`Reverse ${result.mode==='lap'?'lap':'sprint'} · checkpoint order: ${result.checkpoints.map(g=>'CP '+g.number).join(' → ')||'none'}. Cross lines in reverse.`;
    }
    return result;
  }
  // In-memory race markers; shared TS2 code and authored section metadata are
  // never rewritten. Multiple temporary gates may occupy one long section.
  function temporaryMarkers(runtime) {
    const existing=plan(runtime),pieces=runtime.pieces,first=pieces[0].start,last=pieces.at(-1).end;
    const closed=runtime.autoClose || Math.hypot(first.x-last.x,first.y-last.y,first.z-last.z)<.1;
    const starts=existing.gates.filter(g=>g.kind==='SF'),authoredCheckpoints=existing.gates.filter(g=>g.kind==='CP');
    // Preserve an authored lap line and checkpoint positions while fixing
    // missing or out-of-sequence CP numbers in this temporary course only.
    if(!closed && starts.length)throw Error('This track is open but has a shared start/finish line. Enable Auto-close or set separate sprint start and finish markers in the track builder.');
    if(existing.gates.length && (!closed || starts.length>1 || existing.gates.some(g=>!['SF','CP'].includes(g.kind))))
      throw Error(existing.message+' Check or complete the authored markers in the track builder.');
    const incompleteStart=starts.length===1;
    const roads=[];let total=0;
    pieces.forEach((piece,index)=>{if(!piece.isGap && piece.length>1e-6)roads.push({piece,index,start:total,end:total+piece.length});total+=piece.length;});
    if(!roads.length || total<4)throw Error('This track needs a longer road to start a race.');
    function atDistance(distance) {
      if(closed)distance=((distance%total)+total)%total;else distance=Math.max(0,Math.min(total,distance));
      const candidates=roads.map(item=>{
        const margin=Math.min(item.piece.length*.1,1),d=Math.max(item.start+margin,Math.min(item.end-margin,distance));
        const delta=Math.abs(d-distance),score=closed?Math.min(delta,total-delta):delta;
        return {...item,d,score};
      }).sort((a,b)=>a.score-b.score);
      const chosen=candidates[0];return {pieceIndex:chosen.index,fraction:(chosen.d-chosen.start)/chosen.piece.length,distance:chosen.d};
    }
    let start;
    if(incompleteStart){const g=starts[0];start={pieceIndex:g.pieceIndex,fraction:g.fraction,distance:g.distance};}
    else if(closed){
      // Prefer a long straight for a safe grid; fall back to the longest road.
      const suitable=roads.slice().sort((a,b)=>{
        const score=item=>item.piece.length/(1+Math.abs(item.piece.angle||0)/30);
        return score(b)-score(a);
      });
      for(const road of suitable){
        for(const fraction of [.5,.35,.65]){
          const candidate=atDistance(road.start+road.piece.length*fraction),pose=at(pieces[candidate.pieceIndex],candidate.fraction);
          if(authoredCheckpoints.every(g=>Math.hypot(g.pose.x-pose.x,g.pose.y-pose.y,g.pose.z-pose.z)>.1)){start=candidate;break;}
        }
        if(start)break;
      }
      if(!start)throw Error('Could not place a temporary start line away from the existing checkpoints.');
    }else start=atDistance(Math.min(total*.55,Math.max(total*.25,4))); // Leave room for a small two-car grid.
    const markers=[{kind:closed?'SF':'RS',pieceIndex:start.pieceIndex,fraction:start.fraction}];
    if(closed){
      if(authoredCheckpoints.length){
        const ordered=authoredCheckpoints.slice().sort((a,b)=>
          ((a.distance-start.distance+total)%total)-((b.distance-start.distance+total)%total));
        ordered.forEach((gate,index)=>markers.push({kind:'CP',number:index+1,pieceIndex:gate.pieceIndex,fraction:gate.fraction}));
      }else for(const [number,offset] of [[1,1/3],[2,2/3]]){
        const cp=atDistance(start.distance+total*offset);
        markers.push({kind:'CP',number,pieceIndex:cp.pieceIndex,fraction:cp.fraction});
      }
    }else{
      const finish=atDistance(total*.8);markers.push({kind:'RF',pieceIndex:finish.pieceIndex,fraction:finish.fraction});
    }
    const candidate={...runtime,temporaryRaceMarkers:markers},result=plan(candidate);
    if(!result.valid)throw Error(`Could not create temporary race markers: ${result.message}`);
    return markers;
  }
  function startingGrid(runtime,course,scale=.5,count=8) {
    if(!course.valid)throw Error(course.message);
    if(!Number.isInteger(count) || count<1 || count>8)throw Error('Choose between one and eight starting-grid positions.');
    const size=window.TrackVehicle.dimensions(scale),halfWidth=size.width/2,halfLength=size.length/2;
    const clearance=3*scale,margin=.2*scale,grid=[],direction=course.direction??1;
    const rowsBehind=3,minimumSpacing=size.length+.6*scale,desiredSpacing=size.length+2.4*scale;
    // Give each row more room to launch. On a short approach, use as much of
    // the available road as possible while retaining the previous minimum.
    // Base the fit on the full grid so each slot stays in the same position
    // regardless of field size. Existing safety checks still validate the cars
    // that are actually requested.
    const available=course.mode==='lap'?course.total:(direction===-1?course.total-course.start.distance:course.start.distance);
    const fit=(available-clearance-halfLength-margin-.01*scale)/rowsBehind;
    const spacing=Math.max(minimumSpacing,Math.min(desiredSpacing,fit));
    const wrap=distance=>((distance%course.total)+course.total)%course.total;
    function locate(distance) {
      if(course.mode==='lap')distance=wrap(distance);
      else if(distance<0 || distance>course.total)throw Error(direction===-1?
        'Reverse starts at the original finish: move that line farther into the road so there is space for the car behind it.':
        'Move the start line farther into the road so there is space for the car behind it.');
      for(let index=0;index<runtime.pieces.length;index++) {
        const piece=runtime.pieces[index];
        if(distance<=piece.length || index===runtime.pieces.length-1) {
          if(piece.isGap)throw Error('The approach to the start line is a gap. Move the marker onto a longer road section.');
          const fraction=Math.max(0,Math.min(1,distance/piece.length));
          return {index,fraction,pose:at(piece,fraction)};
        }
        distance-=piece.length;
      }
    }
    // Inspect the whole approach, including gaps between rows and at a car's
    // nose/tail. A lap may cross the code seam, but never wrap a whole circuit.
    function validateApproach(depth) {
      if(course.mode==='lap' && depth>=course.total)throw Error('This track is too short for the starting grid. Use fewer cars or a smaller car size.');
      const approachEnd=course.start.distance-direction*depth,approachStart=Math.min(approachEnd,course.start.distance),approachFinish=Math.max(approachEnd,course.start.distance);
      if(course.mode!=='lap')locate(approachEnd);
      for(let index=0,distance=0;index<runtime.pieces.length;index++) {
        const piece=runtime.pieces[index];
        for(const shift of course.mode==='lap'?[-course.total,0,course.total]:[0])
          if(piece.isGap && distance+shift<approachFinish && distance+piece.length+shift>approachStart)
            throw Error('The approach to the start line is a gap. Move the marker onto a longer road section.');
        distance+=piece.length;
      }
    }
    validateApproach(clearance+Math.floor((count-1)/2)*spacing+halfLength+margin);
    // Equal distances on the centre line are shorter on a bend's inside lane
    // and longer on its outside lane. Measure along each actual lane instead,
    // retaining the existing centre-line coordinates for approach validation.
    const paths=new Map(),maxBack=course.mode==='lap'?course.total-1e-7:available;
    function lanePoint(back,left){
      const centre=locate(course.start.distance-direction*back).pose,lateral=(left?1:-1)*direction*centre.width/4;
      return {x:centre.x+Math.cos(centre.yaw*rad)*lateral,y:window.TS2.heightAcross(centre,window.TS2.lateralU(centre,lateral)),z:centre.z-Math.sin(centre.yaw*rad)*lateral};
    }
    function lanePath(left){
      if(!paths.has(left))paths.set(left,[{back:0,length:0,point:lanePoint(0,left)}]);
      return paths.get(left);
    }
    function extendLane(path,left){
      const previous=path.at(-1),back=Math.min(maxBack,previous.back+.1);
      if(back<=previous.back+1e-9)throw Error(course.mode==='lap'?'This track is too short for the starting grid. Use fewer cars or a smaller car size.':
        direction===-1?'Reverse starts at the original finish: move that line farther into the road so there is space for the car behind it.':'Move the start line farther into the road so there is space for the car behind it.');
      const point=lanePoint(back,left),distance=Math.hypot(point.x-previous.point.x,point.y-previous.point.y,point.z-previous.point.z);
      path.push({back,length:previous.length+distance,point});
    }
    function centreBackForLaneLength(length,left){
      const path=lanePath(left);while(path.at(-1).length<length-1e-9)extendLane(path,left);
      let i=1;while(i<path.length-1 && path[i].length<length)i++;
      const a=path[i-1],b=path[i],t=(length-a.length)/Math.max(1e-12,b.length-a.length);return a.back+(b.back-a.back)*t;
    }
    function laneLengthForCentreBack(back,left){
      const path=lanePath(left);while(path.at(-1).back<back-1e-9)extendLane(path,left);
      let i=1;while(i<path.length-1 && path[i].back<back)i++;
      const a=path[i-1],b=path[i],t=(back-a.back)/Math.max(1e-12,b.back-a.back);return a.length+(b.length-a.length)*t;
    }
    const previousLaneLength=new Map();
    for(let slot=1;slot<=count;slot++) {
      const row=Math.floor((slot-1)/2),left=slot%2===1;
      // If an earlier car needed extra clearance, maintain that gap in the
      // same lane for later rows rather than compressing the field again.
      const laneLength=Math.max(clearance+row*spacing,(previousLaneLength.get(left)??-spacing)+spacing);
      let back=centreBackForLaneLength(laneLength,left);
      let placed=false;
      for(let attempt=0;attempt<2048;attempt++) {
      validateApproach(back+halfLength+margin);
      const distance=course.start.distance-direction*back;
      const position=locate(distance),centre=position.pose,lateral=(left?1:-1)*direction*centre.width/4,yaw=(centre.yaw+(direction===-1?180:0))*rad;
      if(centre.width/4<halfWidth+margin){
        if(attempt || slot>2){back+=Math.max(.2,.5*scale);continue;}
        throw Error(`Grid position ${slot} needs a wider road for two cars side by side. Move the start line or reduce the car size.`);
      }
      const pose={...centre,x:centre.x+Math.cos(centre.yaw*rad)*lateral,z:centre.z-Math.sin(centre.yaw*rad)*lateral,yaw:yaw/rad};
      pose.y=window.TS2.heightAcross(centre,window.TS2.lateralU(centre,lateral));
      const line=course.start,forward=line.forward;
      const nose=(pose.x-line.pose.x)*forward.x+(pose.z-line.pose.z)*forward.z+
        halfLength*Math.abs(Math.sin(yaw)*forward.x+Math.cos(yaw)*forward.z)+
        halfWidth*Math.abs(Math.cos(yaw)*forward.x-Math.sin(yaw)*forward.z);
      if(nose>-.1*scale){
        if(attempt || slot>2){back+=Math.max(.2,.5*scale);continue;}
        throw Error(`Grid position ${slot} reaches across the start line on this bend. Move the start line onto a straighter section.`);
      }
      const road=course.start.road;
      if(road) {
        const height=roadHeight(road,position.index,{...pose,y:pose.y+course.start.roadTop});
        if(height===null){
          if(attempt || slot>2){back+=Math.max(.2,.5*scale);continue;}
          throw Error(`Grid position ${slot} is outside the road. Move the start line onto a wider, gentler section.`);
        }
        pose.y=height-course.start.roadTop;
        const nearby=new Set([position.index]);
        // Use only the connected approach for footprint queries, so another
        // road at a crossing cannot conceal a missing starting surface.
        locate(distance-halfLength-margin);locate(distance+halfLength+margin);
        for(let index=0,start=0;index<runtime.pieces.length;index++) {
          const piece=runtime.pieces[index];
          for(const shift of course.mode==='lap'?[-course.total,0,course.total]:[0])
            if(start+shift<=distance+halfLength+margin && start+piece.length+shift>=distance-halfLength-margin)nearby.add(index);
          start+=piece.length;
        }
        let footprintFits=true;
        for(const x of [-halfWidth-margin,halfWidth+margin])for(const z of [-halfLength-margin,halfLength+margin]) {
          const point={x:pose.x+Math.cos(yaw)*x+Math.sin(yaw)*z,y:pose.y+course.start.roadTop,z:pose.z-Math.sin(yaw)*x+Math.cos(yaw)*z};
          if(![...nearby].some(index=>roadHeight(road,index,point)!==null))footprintFits=false;
        }
        if(!footprintFits){
          if(attempt || slot>2){back+=Math.max(.2,.5*scale);continue;}
          throw Error(`Grid position ${slot} does not have enough road around it. Move the start line onto a wider, gentler section.`);
        }
      }
      const item={...position,pose,lateral,slot,row:row+1,lane:left?'left':'right'};
      // Adjacent rows can converge on a very tight bend. Check the complete
      // car rectangles, rather than assuming route-distance spacing is enough.
      let overlaps=false;
      for(const other of grid) {
        const axes=[yaw,other.pose.yaw*rad].flatMap(angle=>[{x:Math.cos(angle),z:-Math.sin(angle)},{x:Math.sin(angle),z:Math.cos(angle)}]);
        const extent=(angle,axis)=>(halfWidth+margin/2)*Math.abs(Math.cos(angle)*axis.x-Math.sin(angle)*axis.z)+
          (halfLength+margin/2)*Math.abs(Math.sin(angle)*axis.x+Math.cos(angle)*axis.z);
        const separate=axes.some(axis=>Math.abs((pose.x-other.pose.x)*axis.x+(pose.z-other.pose.z)*axis.z)>=extent(yaw,axis)+extent(other.pose.yaw*rad,axis));
        if(!separate){overlaps=true;break;}
      }
      if(overlaps){back+=Math.max(.2,.5*scale);continue;}
      grid.push(item);previousLaneLength.set(left,laneLengthForCentreBack(back,left));placed=true;break;
      }
      if(!placed)throw Error('There is not enough clear road for this starting grid. Use fewer cars or a smaller car size.');
    }
    return grid;
  }
  function spawn(runtime,course,scale,slot=1) {
    return startingGrid(runtime,course,scale,slot).at(-1);
  }
  function create(course,options={}) {
    const state={running:false,finished:false,elapsed:0,last:null,best:null,completed:0,checkpoint:0,lapTimes:[],
      message:course.valid?'Ready · cross the start line in the selected race direction.':course.message,lastIssue:null};
    let armed=new Map(),skipRewoundFinish=false;
    function reset(reason='Car reset · cross the start line to begin a new attempt.') {
      state.running=false;state.finished=false;state.elapsed=0;state.checkpoint=0;armed=new Map();skipRewoundFinish=false;state.lastIssue=null;
      state.message=course.valid?reason:course.message;
    }
    function begin(message) {state.running=true;state.finished=false;state.elapsed=0;state.checkpoint=0;state.message=message;}
    function nextLabel(){return course.checkpoints[state.checkpoint]?`Next: CP ${course.checkpoints[state.checkpoint].number}`:`Next: ${course.mode==='lap'?'start/finish':'finish'}`;}
    function recover(info) {
      // Teleporting back to safety is not a gate crossing or a new attempt.
      // Re-arm from the restored side on the next physical simulation step.
      armed=new Map();
      // A run-up can move back across an already crossed lap line. Ignore
      // that line once when replaying it; required checkpoints stay ordered.
      if(course.mode==='lap' && state.running && info?.rewind?.some(part=>part.pieceIndex===course.start.pieceIndex &&
        course.start.fraction>=part.low-1e-8 && course.start.fraction<=part.high+1e-8))skipRewoundFinish=true;
      if(course.valid)state.message=state.running?`Recovered on track · ${nextLabel()}`:
        state.finished?'Finished · restart at the grid for another attempt.':'Recovered on track · cross the start line to begin.';
    }
    function event(gate,direction) {
      if(direction>0 && skipRewoundFinish && gate===course.start && gate===course.finish && state.running){skipRewoundFinish=false;state.message=nextLabel();return;}
      if(direction<0){if(state.running){reset('Wrong direction - attempt cancelled. Return to the start.');state.lastIssue=`Wrong direction at ${gate.kind==='CP'?'CP '+gate.number:gate.kind} - section ${gate.pieceIndex+1}`;}return;}
      if(gate===course.start && !state.running){begin('');state.message=nextLabel();return;}
      if(!state.running || state.finished)return;
      const next=course.checkpoints[state.checkpoint];
      if(gate===next){state.checkpoint++;state.message=nextLabel();options.onCheckpoint?.(gate);return;}
      if(gate===course.finish) {
        if(next) {
          if(course.mode==='lap')begin(`Missed CP ${next.number} · lap restarted. Next: CP ${course.checkpoints[0].number}`);
          else reset(`Missed CP ${next.number} · attempt cancelled. Return to the start.`);
          state.lastIssue=`Missed CP ${next.number} - section ${next.pieceIndex+1}`;
          return;
        }
        state.last=state.elapsed;state.best=state.best===null?state.last:Math.min(state.best,state.last);state.completed++;state.lapTimes.push(state.last);
        if(course.mode==='lap')begin(`Lap complete · next: CP ${course.checkpoints[0].number}`);
        else {state.running=false;state.finished=true;state.message='Finished · restart at the start for another attempt.';}
        options.onComplete?.({mode:course.mode,completed:state.completed,time:state.last});
      } else if(gate.kind==='CP' && course.checkpoints.indexOf(gate)>state.checkpoint){const missed=next;reset(`Skipped CP ${missed.number} - attempt cancelled. Return to the start.`);state.lastIssue=`Skipped CP ${missed.number} - section ${missed.pieceIndex+1}`;}
    }
    function step(before,after,dt) {
      if(!course.valid || !(dt>0))return;
      const hits=[],scale=after.scale??1;
      for(const gate of course.gates) {
        const signed=p=>(p.x-gate.pose.x)*gate.forward.x+(p.z-gate.pose.z)*gate.forward.z;
        const a=signed(before),b=signed(after),h=.2*scale;
        let side=armed.get(gate)??(a<-h?-1:a>h?1:0);
        const direction=a<0 && b>=0?1:a>0 && b<=0?-1:0;
        if(direction && side===-direction) {
          const t=a/(a-b),x=before.x+(after.x-before.x)*t,z=before.z+(after.z-before.z)*t,y=before.y+(after.y-before.y)*t;
          const lateral=(x-gate.pose.x)*gate.left.x+(z-gate.pose.z)*gate.left.z;
          const half=window.TS2.halfWidth(gate.pose,lateral<0?-1:1),roadLateral=Math.max(-half,Math.min(half,lateral));
          // Kerbs extend beyond the road and stay level with its edge, even
          // when the road is banked. Sample the edge rather than extending
          // the bank profile into the grass.
          const expected=window.TS2.heightAcross(gate.pose,window.TS2.lateralU(gate.pose,roadLateral))+gate.roadTop;
          const surface=gate.road?(roadHeight(gate.road,gate.pieceIndex,{x:x-(lateral-roadLateral)*gate.left.x,y:expected,z:z-(lateral-roadLateral)*gate.left.z})??expected):expected;
          // A car can launch off a crest and pass above a downhill marker.
          // Only extend the gate for an airborne car whose ordered route
          // cursor actually reaches this section. A car on a crossing bridge,
          // or one that has fallen onto a different road, must not trigger it.
          const airborneOnRoute=after.grounded===0 && after.trackPiece===null && after.airTime>0 && after.routePiece===gate.pieceIndex;
          const upper=airborneOnRoute?Math.max(1.5*scale,5):1.5*scale;
          const centreInside=Math.abs(lateral)<=half+gate.edgeWidth+1e-6;
          // If the centre is just outside, one loaded wheel on this road or
          // its kerb is enough. Grass, distant wheels, and another deck cannot
          // award the crossing. No particular number of wheels is required.
          const wheelInside=!centreInside && Array.isArray(after.contacts) && after.contacts.some(contact=>{
            const hit=contact.hit;if(!(contact.force>.05) || !hit || !(hit.road && hit.roadPiece===gate.pieceIndex || hit.kerb && gate.edgeWidth>0))return false;
            const dx=hit.x-gate.pose.x,dz=hit.z-gate.pose.z,along=dx*gate.forward.x+dz*gate.forward.z,across=dx*gate.left.x+dz*gate.left.z;
            const wheelHalf=window.TS2.halfWidth(gate.pose,across<0?-1:1);
            if(Math.abs(along)>2.15*scale+.35 || Math.abs(across)>wheelHalf+gate.edgeWidth+1e-6)return false;
            const clamped=Math.max(-wheelHalf,Math.min(wheelHalf,across));
            const expectedWheel=window.TS2.heightAcross(gate.pose,window.TS2.lateralU(gate.pose,clamped))+gate.roadTop;
            return Math.abs(hit.y-expectedWheel)<=.9;
          });
          // A level crossing can physically overlap an unrelated route and
          // its gate. Only the route being followed can award that marker.
          const otherRoute=Number.isInteger(after.routePiece) && gate.levelCrossingPartners.includes(after.routePiece) && before.routePiece!==gate.pieceIndex;
          if(!otherRoute && (centreInside || wheelInside) && y>=surface-.3*scale && y<=surface+upper)hits.push({gate,direction,t});
          side=0;
        }
        if(b<-h)side=-1;else if(b>h)side=1;
        armed.set(gate,side);
      }
      hits.sort((a,b)=>a.t-b.t);let fraction=0;
      for(const hit of hits) {
        if(state.running)state.elapsed+=(hit.t-fraction)*dt;
        event(hit.gate,hit.direction);fraction=hit.t;
      }
      if(state.running)state.elapsed+=(1-fraction)*dt;
    }
    return {state,step,reset,recover,course};
  }
  function format(seconds) {
    if(seconds===null || !Number.isFinite(seconds))return '—';
    const ms=Math.max(0,Math.floor(seconds*1000+1e-6)),minutes=Math.floor(ms/60000);
    return `${minutes}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;
  }
  window.TrackRace={at,plan,temporaryMarkers,startingGrid,spawn,create,format,roadHeight};
})();
