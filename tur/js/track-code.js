/* TrackShift TS2 interpreter — plain JavaScript (no Node.js required).
   Based on TrackParserV2, TrackPieceBuilderV2, TrackRuntimeBuilderV2.
   Legacy Unity coordinates: +Y up, yaw 0 points +Z. Positive DA increases yaw;
   this appears as driver-left in the right-handed Three.js viewer.
*/
(function () {
  'use strict';
  const DEFAULTS = Object.freeze({ metresPerUnityUnit: 1, trackUnitLength: 10, defaultTrackWidth: 8,
    tarmacDepth: 0.5, levelHeight: 4, groundY: 0, turnSegments: 12 });
  // The side-feature footprint is shared by geometry and race gates.
  const EDGE_WIDTH=.85;
  const SCALES = new Set(['TL', 'TW', 'TD', 'LH', 'SC', 'SS', 'SE', 'BC', 'BS', 'WS', 'LS', 'CSW', 'SN', 'ES', 'GY', 'GC', 'GG', 'GD', 'OC', 'WG', 'BD', 'SD', 'TI', 'TO', 'TR', 'PQ', 'PM', 'PZ', 'RD', 'BU', 'ENV']);
  const ENVIRONMENTS=Object.freeze(['grasslands','desert','snow','autumn','volcanic','city']);
  // Shared menu/render catalogue. New edge profiles can add a style here and
  // a generator mode without duplicating global and section UI options.
  const EDGE_STYLES=Object.freeze([
    {id:'auto',label:'Automatic by elevation',mode:'auto',striped:null,aliases:[]},
    {id:'curb',label:'Kerbs · automatic stripes',mode:'kerb',striped:null,aliases:[]},
    {id:'grey',label:'Smooth grey kerbs',mode:'kerb',striped:false,aliases:['gray','plain','kerb']},
    {id:'stonekerb',label:'Stone kerbs',mode:'kerb',striped:false,crown:'stone',aliases:['stonecurb','stonekerbs','stonecurbs','brickkerb','brickcurb']},
    {id:'stripe',label:'Striped kerbs',mode:'kerb',striped:true,aliases:['striped','redwhite','race']},
    {id:'wall',label:'Smooth retaining walls',mode:'wall',striped:null,aliases:['walls']},
    {id:'stonewall',label:'Stone retaining walls',mode:'wall',striped:false,crown:'stone',aliases:['stonewalls','brickwall','brickwalls']},
    {id:'fence',label:'Post-and-rail fence',mode:'fence',striped:false,aliases:['fences']},
    {id:'groundfence',label:'Post-and-rail fence · ground level',mode:'fence',striped:false,groundLevel:true,aliases:[]},
    {id:'none',label:'No edge features',mode:'none',striped:null,aliases:['off']}
  ].map(style=>Object.freeze({...style,aliases:Object.freeze(style.aliases)})));
  function edgeStyle(value) {const id=String(value??'auto').toLowerCase();return EDGE_STYLES.find(style=>style.id===id || style.aliases.includes(id));}
  // Shared editor, colour and arcade handling profiles. Preserve raw ST text;
  // resolve aliases/fallbacks only when displaying or building a collision world.
  const SURFACE_TYPES=Object.freeze([
    {id:'tarmac',label:'Tarmac',aliases:['road','asphalt'],top:0x30363d,side:0x20262d,bottom:0x171d24,grip:1,lateralGrip:1,brakeGrip:1,drag:0,description:'Standard road grip and speed.'},
    {id:'gravel',label:'Gravel',aliases:[],top:0x717983,side:0x424954,bottom:0x2f3641,grip:.82,lateralGrip:.62,brakeGrip:.8,drag:.8,description:'Loose cornering grip and some extra resistance.'},
    {id:'dirt',label:'Dirt',aliases:[],top:0x6e5c49,side:0x493c2e,bottom:0x32291f,grip:.78,lateralGrip:.72,brakeGrip:.8,drag:1.35,description:'Moderate loose-ground grip and slower acceleration.'},
    {id:'wood',label:'Wood',aliases:[],top:0x321808,side:0x221006,bottom:0x160a04,grip:.95,lateralGrip:.9,brakeGrip:.95,drag:.1,description:'Solid planks with gentle bumps and grip close to tarmac.'},
    {id:'ice',label:'Ice',aliases:[],top:0x8fc5d5,side:0x628996,bottom:0x496a79,grip:.7,lateralGrip:.1,brakeGrip:.3,drag:.05,description:'Very little sideways grip and weaker braking.'},
    {id:'mud',label:'Mud',aliases:[],top:0x402c1e,side:0x2c1e14,bottom:0x1e150e,grip:.55,lateralGrip:.45,brakeGrip:.65,drag:3.8,description:'Heavy resistance, low speed and reduced grip.'}
  ].map(surface=>Object.freeze({...surface,aliases:Object.freeze(surface.aliases)})));
  function surfaceType(value) {const id=String(value??'road').trim().toLowerCase();return SURFACE_TYPES.find(surface=>surface.id===id || surface.aliases.includes(id));}
  // Authored ST applies to the whole piece, although its shared start pose
  // retains the previous ST. AC ends on the first pose, so use its incoming ST.
  function pieceSurface(piece) {return piece.source?.ST??(piece.isClose?piece.start.surface:piece.end.surface)??'road';}
  const KEYS = new Set(['AA', 'AH', 'FL', 'GL', 'DA', 'DH', 'TW', 'DW', 'WA', 'WI', 'ST', 'ES', 'EC', 'SS', 'SE', 'SC', 'SI', 'SO', 'BL', 'BR', 'BC', 'BF', 'BS', 'WS', 'LS', 'SN', 'SF', 'RS', 'RF', 'CP', 'RP', 'OC', 'SR', 'FQ', 'WG', 'S0', 'S1', 'B0', 'B1', 'OA', 'O0', 'O1', 'TBL', 'TBR', 'SCL', 'SCR', 'CG']);
  const NUMERIC = new Set(['AA', 'AH', 'FL', 'GL', 'DA', 'DH', 'TW', 'DW', 'WI', 'SC', 'SI', 'SO', 'BL', 'BR', 'BC', 'BF', 'BS', 'WS', 'LS', 'CP', 'RP', 'OC', 'SR', 'FQ', 'S0', 'S1', 'B0', 'B1', 'OA', 'O0', 'O1', 'TBL', 'TBR']);
  const INTEGER = new Set(['WS', 'LS', 'CSW', 'CP']);
  const FLAGS = new Set(['SS', 'SE', 'SN', 'EC', 'SF', 'RS', 'RF', 'WG', 'CG']);
  const FRACTIONS = new Set(['SC', 'BC', 'BS', 'RP', 'OC', 'SR', 'FQ', 'O0', 'O1', 'SD', 'TI', 'TO', 'TBL', 'TBR', 'TR', 'PQ', 'PM', 'RD', 'BU']);
  const EXAMPLE_CODE = 'TS2|(TL=10,TW=8,TD=0.25,LH=4)|(AA=0,AH=0)|(FL=2)|(DA=90)|(FL=3)|(DA=-90)|(FL=2)|(DA=-90)|(FL=3)|(DA=90,DH=1)|(FL=1)|(DA=90,DH=-1)|(FL=1)|(DA=90)|(FL=1,DH=1)|(FL=1)|(FL=1,DH=-1,SE=0)|(FL=1,DH=-1,SS=0)|(FL=2.5)|(FL=1,DH=1)|(FL=3)|(DA=90,DH=-1)|(FL=2)|(DA=70,DH=1)|(FL=1)|AC';

  function readPairs(token, index) {
    if (!token.startsWith('(') || !token.endsWith(')')) throw Error(`Token ${index}: expected (KEY=value), got “${token}”.`);
    const pairs = Object.create(null);
    for (const raw of token.slice(1, -1).split(',')) {
      if (!raw.trim()) continue;
      const at = raw.indexOf('=');
      if (at < 1 || at === raw.length - 1) throw Error(`Token ${index}: invalid parameter “${raw}”.`);
      const key = raw.slice(0, at).trim().toUpperCase();
      const value = raw.slice(at + 1).trim();
      if (!value) throw Error(`Token ${index}: missing value for ${key}.`);
      if (Object.hasOwn(pairs, key)) throw Error(`Token ${index}: duplicate ${key}.`);
      pairs[key] = value;
    }
    return pairs;
  }
  function numeric(value, key, idx, integer = false) {
    const n = Number(value);
    if (!Number.isFinite(n) || value.trim() === '' || (integer && !Number.isInteger(n)))
      throw Error(`Token ${idx}: ${key} must be ${integer ? 'an integer' : 'a number'}.`);
    return n;
  }
  function parameter(value,key,index) {
    if(key==='ENV'){const environment=value.toLowerCase();if(!ENVIRONMENTS.includes(environment))throw Error(`Token ${index}: ENV expects grasslands, desert, snow, autumn, volcanic or city.`);return environment;}
    if(key==='WA') {
      const side=value.toUpperCase();
      if(!['L','R','B'].includes(side))throw Error(`Token ${index}: WA expects L, R or B.`);
      return side;
    }
    if(key==='SCL' || key==='SCR') {
      const choice=value.toLowerCase();
      if(!['none','stand','tower','footbridge','tyre'].includes(choice))throw Error(`Token ${index}: ${key} expects none, stand, tower, footbridge or tyre.`);
      return choice;
    }
    if(key==='GC' || key==='BD') {
      const flag=value.toLowerCase();
      if(!['true','false','1','0','yes','no'].includes(flag))throw Error(`Token ${index}: ${key} expects true or false.`);
      return ['true','1','yes'].includes(flag);
    }
    if(key==='ES') {
      if(!value.trim() || value.toLowerCase()==='default')throw Error('Global edge style must name a style, such as auto, grey or wall.');
      return value;
    }
    if (FLAGS.has(key)) {
      const v=value.toLowerCase();
      if (!['true','false','1','0','yes','no'].includes(v)) throw Error(`Token ${index}: ${key} expects true or false.`);
      return ['true','1','yes'].includes(v);
    }
    const n=numeric(value,key,index,INTEGER.has(key));
    if(key==='GG' && (n<.1 || n>1))throw Error('GG grass grip must be between 0.1 and 1.');
    if(key==='GD' && (n<0 || n>20))throw Error('GD extra grass drag must be between 0 and 20.');
    if(key==='PZ' && (n<2 || n>100))throw Error('PZ maximum pond diameter must be between 2 and 100 metres.');
    if (FRACTIONS.has(key) && (n<0 || n>1)) throw Error(`Token ${index}: ${key} must be between 0 and 1.`);
    if (['SI','SO'].includes(key) && (n< -1 || n>1)) throw Error(`Token ${index}: ${key} must be between -1 and 1.`);
    if (key==='BF' && (n<0 || n>.9)) throw Error(`Token ${index}: BF must be between 0 and 0.9.`);
    if (['WS','CSW'].includes(key) && (n<2 || n>32 || n%2!==0)) throw Error(`Token ${index}: ${key} must be an even subdivision count from 2 to 32.`);
    if (key==='LS' && (n<1 || n>128)) throw Error(`Token ${index}: LS must be a subdivision count from 1 to 128.`);
    if (key==='CP' && (n<1 || n>999)) throw Error(`Token ${index}: CP must be a checkpoint number from 1 to 999.`);
    return n;
  }
  function raceMarker(params) {
    const markers=['SF','RS','RF','CP'].filter(key=>params[key]);
    if(markers.length>1)throw Error('Use only one race marker per section: SF, RS, RF or CP.');
    if(markers.length && params.GL!==undefined)throw Error('Race markers need a road section, not a gap.');
    return markers[0]??null;
  }
  function parse(code) {
    const parts = code.trim().split('|').map(s => s.trim()).filter(Boolean);
    if (parts[0]?.toUpperCase() !== 'TS2') throw Error('Track code must start with TS2|.');
    if (parts.length < 4) throw Error('Expected TS2|, scale settings, start settings and movement.');
    const scale = readPairs(parts[1], 1);
    for (const key of Object.keys(scale)) {
      if (!SCALES.has(key)) throw Error(`Unknown scale parameter ${key}.`);
      scale[key] = parameter(scale[key], key, 1);
      if (['TL','TW','TD','LH'].includes(key) && scale[key] <= 0) throw Error(`Scale parameter ${key} must be greater than zero.`);
    }
    const settings = { ...DEFAULTS, trackUnitLength: scale.TL ?? DEFAULTS.trackUnitLength,
      defaultTrackWidth: scale.TW ?? DEFAULTS.defaultTrackWidth, tarmacDepth: scale.TD ?? DEFAULTS.tarmacDepth,
      levelHeight: scale.LH ?? DEFAULTS.levelHeight,defaultEdgeStyle:scale.ES??'auto',environment:scale.ENV??'grasslands',
      groundY:scale.GY??0,groundCutouts:scale.GC??true,grassGrip:scale.GG??.55,grassDrag:scale.GD??3,outerCorner:scale.OC??0,
      groundSupports:scale.WG??false,sceneryDensity:scale.SD??(scale.BD ? .5 : 0),scenery:(scale.SD??(scale.BD ? .5 : 0))>0,
      tyreInside:scale.TI??0,tyreOutside:scale.TO??0,treeDensity:scale.TR??0,pondQuantity:scale.PQ??0,pondMaxSize:scale.PM??.35,pondMaxMetres:scale.PZ??(2+28*(scale.PM??.35)),rockDensity:scale.RD??0,bushDensity:scale.BU??0 };
    const instructions = [];
    let autoClose = false,closeParams={};
    for (let i = 2; i < parts.length; i++) {
      const token = parts[i];
      if (/^AC(?:\(|$)/i.test(token)) {
        if (autoClose || i !== parts.length - 1) throw Error('AC can occur only once, at the very end.');
        closeParams=token.length===2?{}:readPairs(token.slice(2),i);
        for(const key of Object.keys(closeParams)){
          if(!['ST','ES','SF','RS','RF','CP','RP','SR','FQ','WG','TBL','TBR','SCL','SCR','CG'].includes(key))throw Error(`Auto-close cannot set ${key}; only appearance, scenery, ground supports and race markers are editable.`);
          if(NUMERIC.has(key)||FLAGS.has(key)||key==='SCL'||key==='SCR')closeParams[key]=parameter(closeParams[key],key,i);
        }
        raceMarker(closeParams);
        autoClose = true;
        continue;
      }
      const params = readPairs(token, i);
      for (const key of Object.keys(params)) {
        if (!KEYS.has(key)) throw Error(`Token ${i}: unrecognised parameter ${key}.`);
        if (NUMERIC.has(key) || FLAGS.has(key) || key==='SCL' || key==='SCR' || key==='WA') params[key]=parameter(params[key],key,i);
      }
      raceMarker(params);
      const outerPart=['OA','O0','O1'].filter(key=>params[key]!==undefined);
      if(outerPart.length && (outerPart.length!==3 || Math.abs(params.OA)<1e-8 || Math.abs(params.OA)>360 || params.O0>=params.O1 || Math.abs((params.DA??0)-params.OA*(params.O1-params.O0))>1e-6))
        throw Error(`Token ${i}: split corner settings must describe a valid portion of the original turn.`);
      if (Object.hasOwn(params,'TW') && Object.hasOwn(params,'DW')) throw Error(`Token ${i}: TW and DW cannot be combined.`);
      if (Object.hasOwn(params,'FL') && Object.hasOwn(params,'GL')) throw Error(`Token ${i}: FL and GL cannot be combined.`);
      if (Object.hasOwn(params,'AH') && Object.hasOwn(params,'DH')) throw Error(`Token ${i}: AH and DH cannot be combined.`);
      if (params.TW !== undefined && params.TW <= 0) throw Error(`Token ${i}: TW must be positive.`);
      if (i === 2) {
        if(params.WA!==undefined || params.WI!==undefined)throw Error('Put width side settings on a movement section, not the starting position.');
        if(params.SI!==undefined || params.SO!==undefined)throw Error('Put SI and SO slope overrides on a movement section, not the starting position.');
        if(params.SR!==undefined || params.FQ!==undefined || params.WG!==undefined)throw Error('Set surface detail and WG ground supports on an individual section, not the starting position.');
        if(params.TBL!==undefined || params.TBR!==undefined)throw Error('Put tyre-barrier overrides on a movement section, not the starting position.');
        if(params.SCL!==undefined || params.SCR!==undefined)throw Error('Put trackside scenery choices on a movement section, not the starting position.');
        if(params.CG!==undefined)throw Error('Put CG grass coverage on a movement section, not the starting position.');
        if(params.OC!==undefined)throw Error('Put OC in the global settings or on a movement section, not the start token.');
        if(['SF','RS','RF','CP','RP'].some(key=>params[key]!==undefined))throw Error('Place race markers on movement sections, for example (FL=6,SF=1).');
        if (!Object.hasOwn(params, 'AA') || !Object.hasOwn(params,'AH'))
          throw Error('Start token must contain AA (starting yaw) and AH (starting height).');
        if (Object.hasOwn(params,'FL') || Object.hasOwn(params,'GL')) throw Error('Start token must not contain movement.');
      } else {
        // Standalone DA/DH instructions create one-unit movement sections.
        if ((params.FL ?? params.GL ?? 1) <= 0) throw Error(`Token ${i}: FL / GL must be positive.`);
      }
      instructions.push(params);
    }
    if (!instructions.slice(1).some(params =>
      ['FL','GL','DA','DH'].some(key => Object.hasOwn(params,key))))
      throw Error('Add at least one movement segment after the start settings.');
    return { settings, instructions, autoClose, closeParams, global:scale };
  }
  function updateSettings(code,changes) {
    parse(code);
    const parts=code.trim().split('|').map(s=>s.trim()).filter(Boolean);
    const settings=readPairs(parts[1],1);
    for (const [key,value] of Object.entries(changes)) {
      if (!SCALES.has(key)) throw Error(`Unknown global parameter ${key}.`);
      settings[key]=typeof value==='boolean' ? (value?'1':'0') : String(value);
    }
    parts[1]='('+Object.entries(settings).map(([key,value])=>`${key}=${value}`).join(',')+')';
    const updated=parts.join('|');
    parse(updated);
    return updated;
  }
  const rad = a => a * Math.PI / 180;
  function normYaw(yaw) { return ((yaw % 360) + 360) % 360; }
  function makePose(x, y, z, yaw, height, width, surface, edge, banking) {
    const pose={ x, y, z, yaw: normYaw(yaw), height, width, surface: surface || 'road', edge: edge || 'auto' };
    if (banking) Object.assign(pose,banking);
    return pose;
  }
  function heightAcross(p,u) {
    const distance=Math.abs(u),curve=p.bankCurve??0;
    // Positive u follows (cos(yaw), 0, -sin(yaw)). In Three.js this is
    // the driver's LEFT: up cross forward, with yaw 0 travelling toward +Z.
    const edge=u<0 ? (p.bankRight??0) : (p.bankLeft??0);
    const flat=p.bankFlat??0;
    if(flat<=0)return p.y+edge*((1-curve)*distance+curve*distance*distance);
    const q=Math.max(0,Math.min(1,(distance-flat)/(1-flat)));
    // Blend continuously out of the legacy shape near zero. Beyond a small
    // transition, the profile has a level centre, curved shoulder and a
    // straight outer bank; BC controls the size of the curved shoulder.
    const r=.2+.6*curve,s=q<r?q*q/(2*r):q-r/2,rounded=s/(1-r/2);
    const t=Math.min(1,flat/.1),mix=t*t*(3-2*t),legacy=(1-curve)*q+curve*q*q;
    return p.y+edge*(legacy+(rounded-legacy)*mix);
  }
  function halfWidth(p,side) {
    const cached=side<0?p.edgeNegative:p.edgePositive;
    if(cached){const yaw=rad(p.yaw);return Math.abs((cached.x-p.x)*Math.cos(yaw)-(cached.z-p.z)*Math.sin(yaw));}
    return p.width*.5+(side<0?p.extraRight??0:p.extraLeft??0);
  }
  function lateralU(p,distance) {return distance/halfWidth(p,distance<0?-1:1);}
  function roadPoint(p,u,above=0) {
    const side=u<0?-1:1,cached=side<0?p.edgeNegative:p.edgePositive;
    if(cached)return {x:p.x+(cached.x-p.x)*Math.abs(u),y:heightAcross(p,u)+above,z:p.z+(cached.z-p.z)*Math.abs(u)};
    const distance=halfWidth(p,side)*u,yaw=rad(p.yaw);
    return {x:p.x+Math.cos(yaw)*distance,y:heightAcross(p,u)+above,z:p.z-Math.sin(yaw)*distance};
  }
  function cornerShape(angle,strength,t) {
    // A circular fillet between the two outside tangent lines, expressed in
    // units of outer radius. Split long turns into sectors of at most 90°.
    const sweep=Math.abs(rad(angle)),count=Math.ceil(sweep/(Math.PI/2)),span=sweep/count;
    const sector=Math.min(count-1,Math.floor(t*count)),theta=(t*count-sector)*span,half=span*.5;
    const fillet=1-.95*strength,centre=1-fillet,flat=1/Math.max(Math.cos(theta),Math.cos(span-theta));
    let factor=flat,nx=Math.cos(theta<=half?0:span),nz=Math.sin(theta<=half?0:span);
    if(flat*Math.cos(theta-half)>centre/Math.cos(half)+fillet*Math.cos(half)+1e-12){
      const o=centre/Math.cos(half),projection=o*Math.cos(theta-half);
      factor=projection+Math.sqrt(Math.max(0,fillet*fillet-o*o+projection*projection));
      nx=factor*Math.cos(theta)-centre;nz=factor*Math.sin(theta)-centre*Math.tan(half);
      const length=Math.hypot(nx,nz);nx/=length;nz/=length;
    }
    return {factor,normalX:nx,normalZ:nz,sectorAngle:sector*span};
  }
  function cornerSamples(angle,strength) {
    // Sample fillet normals, not just centreline angles: a nearly square
    // corner needs several points in its small remaining rounded portion.
    const sweep=Math.abs(rad(angle)),count=Math.ceil(sweep/(Math.PI/2)),span=sweep/count,fillet=1-.95*strength,result=[];
    for(let sector=0;sector<count;sector++)for(let j=0;j<=8;j++){
      const normal=span*j/8,x=1-fillet+fillet*Math.cos(normal),z=(1-fillet)*Math.tan(span*.5)+fillet*Math.sin(normal);
      result.push((sector*span+Math.atan2(z,x))/sweep);
    }
    return result;
  }
  function widthDetail(settings,source,isCurve,isSlope,poses) {
    return source.WS ?? (isCurve && isSlope ? settings.curvedSlopeWidthSegments : undefined) ??
      settings.widthSegments ?? (poses.some(p=>(p.bankLeft??0)!==0 || (p.bankRight??0)!==0)?settings.bankWidthSegments:1);
  }
  function pushDistinct(arr, pose) {
    const p = arr[arr.length-1];
    if (!p || Math.hypot(p.x-pose.x, p.y-pose.y, p.z-pose.z) > 0.000001) arr.push(pose);
  }
  function hermite(a,b,m0,m1,t) {
    return a+(b-a)*t*t*(3-2*t)+(t*t*t-2*t*t+t)*m0+(t*t*t-t*t)*m1;
  }
  function bezier(points,t) {
    const [a,b,c,d]=points,u=1-t;
    const result={};
    for(const axis of ['x','z']) {
      result[axis]=u*u*u*a[axis]+3*u*u*t*b[axis]+3*u*t*t*c[axis]+t*t*t*d[axis];
      result['d'+axis]=3*u*u*(b[axis]-a[axis])+6*u*t*(c[axis]-b[axis])+3*t*t*(d[axis]-c[axis]);
      result['dd'+axis]=6*u*(c[axis]-2*b[axis]+a[axis])+6*t*(d[axis]-2*c[axis]+b[axis]);
    }
    return result;
  }
  function closingPath(last,first) {
    const dx=first.x-last.x,dz=first.z-last.z,distance=Math.hypot(dx,dz);
    if(distance<.01)throw Error('Auto-close needs horizontal space between vertically separated endpoints. Add a connecting section.');
    const forward=p=>({x:Math.sin(rad(p.yaw)),z:Math.cos(rad(p.yaw))});
    const f0=forward(last),f1=forward(first),direction={x:dx/distance,z:dz/distance};
    const offset=(p,f,h)=>({x:p.x+f.x*h,z:p.z+f.z*h});
    const straight=Math.abs(f0.x-direction.x)<1e-7 && Math.abs(f0.z-direction.z)<1e-7 &&
      Math.abs(f1.x-direction.x)<1e-7 && Math.abs(f1.z-direction.z)<1e-7;
    const evaluate=curves=>t=>{
      const segment=Math.min(curves.length-1,Math.floor(t*curves.length));
      const p=bezier(curves[segment],t*curves.length-segment);
      p.dx*=curves.length;p.dz*=curves.length;
      p.ddx*=curves.length*curves.length;p.ddz*=curves.length*curves.length;
      return p;
    };
    const radiusNeeded=Math.max(last.width,first.width)*.5+1;
    function assess(curves) {
      const at=evaluate(curves),points=[];
      let length=0,minRadius=Infinity,previous=null;
      for(let i=0;i<=96;i++) {
        const p=at(i/96),speed=Math.hypot(p.dx,p.dz);
        if(speed<Math.max(1,distance)*1e-5 || (previous && previous.dx*p.dx+previous.dz*p.dz<0))return null;
        const cross=Math.abs(p.dx*p.ddz-p.dz*p.ddx);
        if(cross>1e-9)minRadius=Math.min(minRadius,speed*speed*speed/cross);
        if(previous)length+=Math.hypot(p.x-previous.x,p.z-previous.z);
        points.push(p);previous=p;
      }
      const side=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
      for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++) {
        const a=points[i],b=points[i+1],c=points[j],d=points[j+1];
        if(side(a,b,c)*side(a,b,d)<-1e-10 && side(c,d,a)*side(c,d,b)<-1e-10)return null;
      }
      return {at,minRadius,length,straight,score:length+Math.max(0,radiusNeeded-minRadius)*1000};
    }
    const direct=h=>[[last,offset(last,f0,h),offset(first,f1,-h),first]];
    const initial=assess(direct(distance/3));
    if(initial && initial.minRadius>=radiusNeeded)return initial;
    const candidates=initial?[initial]:[];
    for(const scale of [.2,.5,.75,1,1.5]) {
      const candidate=assess(direct(Math.max(distance*scale,radiusNeeded*.75)));
      if(candidate)candidates.push(candidate);
    }
    // Collinear endpoints facing away from the gap cannot be joined by one
    // regular cubic. Try two cubics through a side waypoint instead.
    for(const size of [1,1.5,2.5])for(const sign of [1,-1])for(const handleScale of [1/3,.6]) {
      const bulge=Math.max(radiusNeeded*2,distance*.5)*size*sign;
      const middle={x:(last.x+first.x)*.5+direction.z*bulge,z:(last.z+first.z)*.5-direction.x*bulge};
      const startHandle=Math.hypot(middle.x-last.x,middle.z-last.z)*handleScale;
      const endHandle=Math.hypot(first.x-middle.x,first.z-middle.z)*handleScale;
      const midHandle=Math.max(Math.abs(bulge)/3,distance/6,radiusNeeded*.75);
      const candidate=assess([[last,offset(last,f0,startHandle),offset(middle,direction,-midHandle),middle],
        [middle,offset(middle,direction,midHandle),offset(first,f1,-endHandle),first]]);
      if(candidate)candidates.push(candidate);
    }
    if(!candidates.length)throw Error('Auto-close could not form a regular curve for these endpoints. Add a section with more turning space.');
    candidates.sort((a,b)=>a.score-b.score);
    const chosen=candidates[0];chosen.straight=false;
    chosen.tight=chosen.minRadius<radiusNeeded;
    return chosen;
  }
  function buildClosingPiece(last,first,pieces,settings,bankPose,warnings) {
    const path=closingPath(last,first),incoming=pieces.at(-1),outgoing=pieces[0];
    const grade=(piece,end,key)=>{
      if(key==='y') {
        const smooth=end?(piece.source.SE??settings.slopeEaseEnd):(piece.source.SS??settings.slopeEaseStart);
        const tangent=piece.source[end?'S1':'S0']??(1-(piece.source[end?'SO':'SI']??(smooth?(piece.source.SC??settings.slopeCurveStrength):0)));
        return (piece.end.y-piece.start.y)/piece.length*tangent;
      }
      return ((piece.end[key]??0)-(piece.start[key]??0))/piece.length*(piece.source[end?'B1':'B0']??(1-(piece.source.BS??settings.bankTransition)));
    };
    const speed0=Math.hypot(path.at(0).dx,path.at(0).dz),speed1=Math.hypot(path.at(1).dx,path.at(1).dz);
    const tangents={};
    for(const key of ['y','bankLeft','bankRight'])tangents[key]=[grade(incoming,true,key)*speed0,grade(outgoing,false,key)*speed1];
    const value=(key,t)=>hermite(last[key]??0,first[key]??0,...tangents[key],t);
    const bankingMatches=['bankLeft','bankRight','bankCurve','bankFlat'].every(key=>Math.abs((last[key]??0)-(first[key]??0))<1e-9);
    const unchanging=last.y===first.y && last.width===first.width && bankingMatches &&
      Object.values(tangents).every(pair=>pair.every(m=>Math.abs(m)<1e-9));
    let poses=[last],length;
    if(path.straight && unchanging && settings.longitudinalSegments===undefined) {
      // Preserve an already aligned straight seam, including legacy fixtures.
      length=Math.hypot(first.x-last.x,first.y-last.y,first.z-last.z);
    } else {
      const table=[{t:0,length:0}],samples=512;
      let previous={...path.at(0),y:last.y},total=0,turn=0,previousYaw=last.yaw;
      for(let i=1;i<=samples;i++) {
        const t=i/samples,p={...path.at(t),y:value('y',t)},yaw=Math.atan2(p.dx,p.dz)*180/Math.PI;
        total+=Math.hypot(p.x-previous.x,p.y-previous.y,p.z-previous.z);
        turn+=Math.abs(((yaw-previousYaw+540)%360)-180);
        table.push({t,length:total});previous=p;previousYaw=yaw;
      }
      length=total;
      const steps=Math.min(2048,Math.max(settings.longitudinalSegments??(path.straight?2:settings.turnSegments),Math.ceil(length/.8),Math.ceil(turn/10)));
      let cursor=1;
      for(let i=1;i<steps;i++) {
        const target=total*i/steps;while(table[cursor].length<target)cursor++;
        const a=table[cursor-1],b=table[cursor],t=a.t+(b.t-a.t)*(target-a.length)/(b.length-a.length),p=path.at(t),mix=t*t*(3-2*t);
        poses.push(makePose(p.x,value('y',t),p.z,Math.atan2(p.dx,p.dz)*180/Math.PI,
          last.height+(first.height-last.height)*mix,last.width+(first.width-last.width)*mix,last.surface,last.edge,
          bankPose(value('bankLeft',t),value('bankRight',t),(last.bankCurve??0)+((first.bankCurve??0)-(last.bankCurve??0))*mix,(last.bankFlat??0)+((first.bankFlat??0)-(last.bankFlat??0))*mix)));
      }
    }
    poses.push(first);
    if(path.tight)warnings.push('Auto-close needs a tight bend for these endpoints; add more turning space if the road edges overlap.');
    return {index:pieces.length+1,isClose:true,isCurve:!path.straight,isGap:false,source:{ES:last.edge},
      length,angle:((first.yaw-last.yaw+540)%360)-180,
      widthSegments:widthDetail(settings,{},!path.straight,poses.some(p=>Math.abs(p.y-last.y)>1e-6),poses),
      smoothRoad:settings.smoothRoad,
      matchRoadEdges:settings.longitudinalSegments!==undefined || settings.widthSegments!==undefined || settings.curvedSlopeWidthSegments!==undefined,
      startGradient:[grade(incoming,true,'y'),grade(incoming,true,'bankLeft'),grade(incoming,true,'bankRight'),0,...(last.bankFlat!==undefined?[0]:[])],
      endGradient:[grade(outgoing,false,'y'),grade(outgoing,false,'bankLeft'),grade(outgoing,false,'bankRight'),0,...(first.bankFlat!==undefined?[0]:[])],
      poses,start:last,end:first};
  }
  function build(code, options = {}) {
    const parsed = parse(code);
    const s = { ...parsed.settings, turnSegments: Math.max(2, Math.min(128, Math.round(options.turnSegments ?? parsed.settings.turnSegments))) };
    s.slopeCurveStrength=parsed.global.SC ?? options.slopeCurveStrength ?? 1;
    s.slopeEaseStart=parsed.global.SS ?? options.slopeEaseStart ?? true;
    s.slopeEaseEnd=parsed.global.SE ?? options.slopeEaseEnd ?? true;
    s.bankCurve=parsed.global.BC ?? options.bankCurve ?? 0;
    s.bankTransition=parsed.global.BS ?? options.bankTransition ?? 1;
    s.bankWidthSegments=parsed.global.WS ?? options.bankWidthSegments ?? 8;
    s.longitudinalSegments=parsed.global.LS ?? options.longitudinalSegments;
    s.widthSegments=parsed.global.WS ?? options.widthSegments;
    s.curvedSlopeWidthSegments=parsed.global.CSW ?? options.curvedSlopeWidthSegments;
    s.smoothRoad=parameter(String(parsed.global.SN ?? options.smoothRoad ?? false),'SN',1);
    for (const [key,value] of [['SC',s.slopeCurveStrength],['BC',s.bankCurve],['BS',s.bankTransition],['WS',s.bankWidthSegments]]) parameter(String(value),key,1);
    for (const [key,value] of [['LS',s.longitudinalSegments],['WS',s.widthSegments],['CSW',s.curvedSlopeWidthSegments]])
      if(value!==undefined)parameter(String(value),key,1);
    const ins = parsed.instructions;
    const start = ins[0];
    const hasFlatData=ins.some(p=>p.BF!==undefined);
    const hasBankData=s.bankCurve!==0 || hasFlatData || ins.some(p=>p.BL!==undefined || p.BR!==undefined || p.BC!==undefined);
    const bankPose=(left,right,curve,flat)=>hasBankData ? {bankLeft:left,bankRight:right,bankCurve:curve,...(hasFlatData?{bankFlat:flat??0}:{})} : undefined;
    let edgeSetting=start.ES??'default';
    const resolveEdge=value=>String(value).toLowerCase()==='default'?s.defaultEdgeStyle:value;
    let previous = makePose(0, start.AH * s.levelHeight, 0, start.AA, start.AH,
      start.TW ?? s.defaultTrackWidth, start.ST ?? 'road', resolveEdge(edgeSetting),bankPose(start.BL??0,start.BR??0,start.BC??s.bankCurve,start.BF??0));
    const poses = [previous], pieces = [], warnings = [];
    const unit = s.trackUnitLength / s.metresPerUnityUnit;
    let pending = {};
    for (let index = 1; index < ins.length; index++) {
      const entry = ins[index];
      // Legacy sample shorthand: (DA=90)|(FL=3) means one unit of turning,
      // followed by three units straight. The supplied Unity parser also
      // supports standalone DA; standalone DH is an HTML5 extension.
      // Treating DA as a modifier of FL=3 made the entire 30m section curved.
      const implicitUnitTurn = entry.FL === undefined && entry.GL === undefined &&
        (entry.DA !== undefined || entry.DH !== undefined);
      const lengthUnits = entry.FL ?? entry.GL ?? (implicitUnitTurn ? 1 : null);
      if (lengthUnits === null) {
        // Non-movement metadata can still be applied to the next section.
        pending = { ...pending, ...entry };
        continue;
      }
      const op = { ...pending, ...entry };
      raceMarker(op);
      if (implicitUnitTurn && !warnings.includes('Converted standalone DA/DH instructions into one-unit segments, matching the explicit Unity examples.'))
        warnings.push('Converted standalone DA/DH instructions into one-unit segments, matching the explicit Unity examples.');
      pending = {};
      const height = op.AH ?? (previous.height + (op.DH ?? 0));
      const width = op.TW ?? (previous.width + (op.DW ?? 0));
      if (!Number.isFinite(width) || width <= 0) throw Error(`Section ${index}: width must remain finite and positive.`);
      const widthSide=op.WA??'B',widthSign=widthSide==='L'?1:widthSide==='R'?-1:0,widthOrigin=widthSign?(op.WI??0):0;
      const surface = op.ST ?? previous.surface;
      edgeSetting=op.ES??edgeSetting;
      const edge = resolveEdge(edgeSetting);
      const angle = op.DA ?? 0;
      const outerCorner=op.OC??s.outerCorner,shaped=outerCorner>0 && Math.abs(angle)>.00001 && op.GL===undefined;
      if(shaped && Math.abs(angle)>360)throw Error('OC supports turns up to 360 degrees. Split a larger turn into separate sections.');
      const length = lengthUnits * unit;
      const local = [previous];
      const rising = Math.abs(height*s.levelHeight - previous.y) > 0.000001;
      const slopeCurveStrength = op.SC ?? s.slopeCurveStrength;
      const startSmooth = (op.SS ?? s.slopeEaseStart) ? slopeCurveStrength : 0;
      const endSmooth = (op.SE ?? s.slopeEaseEnd) ? slopeCurveStrength : 0;
      const slopeStart=op.S0??(1-(op.SI??startSmooth)),slopeEnd=op.S1??(1-(op.SO??endSmooth));
      const left0=previous.bankLeft??0,right0=previous.bankRight??0,curve0=previous.bankCurve??0,flat0=previous.bankFlat??0;
      const left=op.BL??left0,right=op.BR??right0,bankCurve=op.BC??curve0,bankFlat=op.BF??flat0;
      const bankTransition=op.BS??s.bankTransition;
      const bankStart=op.B0??(1-bankTransition),bankEnd=op.B1??(1-bankTransition);
      const changingBank=left!==left0 || right!==right0 || ((left!==0 || right!==0) && (bankCurve!==curve0 || bankFlat!==flat0));
      const bankSteps=changingBank ? Math.max(2,Math.ceil(length/.8)) : 1;
      const elevationSteps = rising ? Math.max(2,Math.ceil(length / 0.8)) : 1;
      const yaw0 = previous.yaw;
      const desiredSteps=op.LS ?? s.longitudinalSegments ?? (Math.abs(angle)<.00001?1:s.turnSegments);
      const turnSteps = Math.max(desiredSteps,bankSteps,elevationSteps);
      const signed = Math.sign(angle);
      const radius = Math.abs(angle) < 0.00001 ? Infinity : length / Math.abs(rad(angle));
      const cx = previous.x + Math.cos(rad(yaw0))*radius*signed;
      const cz = previous.z - Math.sin(rad(yaw0))*radius*signed;
      const rvx = previous.x - cx, rvz = previous.z - cz;
      const outerAngle=op.OA??angle,outerFrom=op.O0??0,outerTo=op.O1??1;
      const fractions=Array.from({length:turnSteps},(_,j)=>(j+1)/turnSteps);
      if(shaped){fractions.push(...cornerSamples(outerAngle,outerCorner).filter(t=>t>outerFrom+1e-9 && t<outerTo-1e-9).map(t=>(t-outerFrom)/(outerTo-outerFrom)));fractions.sort((a,b)=>a-b);}
      for (let j=0;j<fractions.length;j++) {
        const t=fractions[j];if(j>0 && t-fractions[j-1]<1e-9)continue;
        const delta=rad(angle*t),last=t===1;
        let x,z;
        if (Math.abs(angle) < 0.00001) {
          x = previous.x + Math.sin(rad(yaw0)) * length * t;
          z = previous.z + Math.cos(rad(yaw0)) * length * t;
        } else {
          x = cx + rvx*Math.cos(delta) + rvz*Math.sin(delta);
          z = cz - rvx*Math.sin(delta) + rvz*Math.cos(delta);
        }
        if(widthSign){
          const offset=widthOrigin+widthSign*(width-previous.width)*t*.5,heading=rad(yaw0+angle*t);
          x+=offset*Math.cos(heading)-widthOrigin*Math.cos(rad(yaw0));
          z-=offset*Math.sin(heading)-widthOrigin*Math.sin(rad(yaw0));
        }
        // Cubic Hermite elevation with independent start/end tangent controls.
        // Signed per-end curvature: -1 steepens, 0 is linear, 1 levels out.
        // The horizontal arc/straight maths is unchanged.
        const dY = height*s.levelHeight - previous.y;
        const h01 = -2*t*t*t+3*t*t;
        const h10 = t*t*t-2*t*t+t;
        const h11 = t*t*t-t*t;
        const elevT = h01 + h10*slopeStart + h11*slopeEnd;
        const bankT = op.B0===undefined && op.B1===undefined?t+(t*t*(3-2*t)-t)*bankTransition:h01+h10*bankStart+h11*bankEnd;
        local.push(makePose(x, previous.y + dY*elevT, z,
          yaw0 + angle*t, last ? height : Math.round(previous.height + (height-previous.height)*t),
          previous.width+(width-previous.width)*t, surface, edge,
          bankPose(last?left:left0+(left-left0)*bankT,last?right:right0+(right-right0)*bankT,
            last?bankCurve:curve0+(bankCurve-curve0)*bankT,last?bankFlat:flat0+(bankFlat-flat0)*bankT)));
        const outerT=outerFrom+(outerTo-outerFrom)*t;
        if(shaped && (!last || outerT<1-1e-9)){
          const p=local.at(-1),shape=cornerShape(outerAngle,outerCorner,outerT);
          // Squared outer corners use the actual outer radius. A one-sided
          // width change shifts the centre, so account for that offset too.
          const centreShift=widthSign?widthOrigin+widthSign*(width-previous.width)*t*.5:0;
          const extra=(radius+p.width*.5-signed*centreShift)*Math.max(0,shape.factor-1);
          if(extra>1e-9){
            const side=-signed,heading=rad(yaw0-outerAngle*outerFrom)+signed*shape.sectorAngle;
            p[side>0?'extraLeft':'extraRight']=extra;
            const nx=side*Math.cos(heading)*shape.normalX+Math.sin(heading)*shape.normalZ,
              nz=-side*Math.sin(heading)*shape.normalX+Math.cos(heading)*shape.normalZ;
            p[side>0?'edgeLateralPositive':'edgeLateralNegative']={x:side*nx,z:side*nz};
          }
        }
      }
      const piece = { index, source:op, edgeSetting,poses:local, isCurve:Math.abs(angle)>0.00001,
        isGap:op.GL !== undefined, length, angle,
        widthSegments:Math.max(shaped?2:1,widthDetail(s,op,Math.abs(angle)>.00001,rising,local)),smoothRoad:op.SN??s.smoothRoad,
        matchRoadEdges:op.LS!==undefined || op.WS!==undefined || s.longitudinalSegments!==undefined || s.widthSegments!==undefined || s.curvedSlopeWidthSegments!==undefined,
        startGradient:[(height*s.levelHeight-previous.y)/length*slopeStart,(left-left0)/length*bankStart,
          (right-right0)/length*bankStart,(bankCurve-curve0)/length*bankStart,...(hasFlatData?[(bankFlat-flat0)/length*bankStart]:[])],
        endGradient:[(height*s.levelHeight-previous.y)/length*slopeEnd,(left-left0)/length*bankEnd,
          (right-right0)/length*bankEnd,(bankCurve-curve0)/length*bankEnd,...(hasFlatData?[(bankFlat-flat0)/length*bankEnd]:[])],
        start:local[0], end:local[local.length-1] };
      pieces.push(piece);
      for (const p of local.slice(1)) pushDistinct(poses,p);
      previous = local[local.length-1];
    }
    if (Object.keys(pending).length) warnings.push('The final modifier-only token had no following movement and was ignored.');
    if (parsed.autoClose) {
      const first = poses[0], last=poses[poses.length-1];
      const gap = Math.hypot(first.x-last.x,first.y-last.y,first.z-last.z);
      const bankMismatch=Math.abs((first.bankLeft??0)-(last.bankLeft??0))>1e-6 ||
        Math.abs((first.bankRight??0)-(last.bankRight??0))>1e-6 ||
        ((Math.abs(first.bankLeft??0)+Math.abs(first.bankRight??0)>1e-6) && (Math.abs((first.bankCurve??0)-(last.bankCurve??0))>1e-6 || Math.abs((first.bankFlat??0)-(last.bankFlat??0))>1e-6));
      if (gap<=.01 && bankMismatch) throw Error('Auto-close banking does not match at the start/end. Add a section returning BL, BR, BC and BF to their starting values.');
      if (gap > 0.01) {
        const closing=buildClosingPiece(last,first,pieces,s,bankPose,warnings);
        closing.source={...closing.source,...parsed.closeParams};
        closing.edgeSetting=parsed.closeParams.ES??edgeSetting;
        closing.edgeStyle=resolveEdge(closing.edgeSetting);
        pieces.push(closing);
        for(const pose of closing.poses.slice(1,-1))pushDistinct(poses,pose);
      } else {
        if(Object.keys(parsed.closeParams).length)throw Error('Auto-close has no generated connector because the endpoints already meet. Put its material, edge style or race markers on an authored section instead.');
        if(Math.abs(((last.yaw-first.yaw+540)%360)-180)>.01)warnings.push('Auto-close endpoints already meet but their headings differ; adjust the final turn to remove the corner.');
        if(Math.abs(last.width-first.width)>.001)throw Error('Auto-close endpoints meet with different widths. Return TW to the starting width before AC.');
      }
    }
    const points = pieces.flatMap(p => p.poses);
    const min = {x:Infinity,y:Infinity,z:Infinity}, max={x:-Infinity,y:-Infinity,z:-Infinity};
    for (const p of points) {
      for (const k of ['x','y','z']) {min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
      min.y=Math.min(min.y,heightAcross(p,-1),heightAcross(p,1));
      max.y=Math.max(max.y,heightAcross(p,-1),heightAcross(p,1));
      if(p.extraLeft || p.extraRight)for(const side of [-1,1]){const edge=roadPoint(p,side);for(const axis of ['x','z']){min[axis]=Math.min(min[axis],edge[axis]);max[axis]=Math.max(max[axis],edge[axis]);}}
    }
    return {code, settings:s, pieces, poses, autoClose:parsed.autoClose,
      bounds:{min,max}, warnings, stats:{pieces:pieces.length,poses:poses.length,
        length:pieces.reduce((n,p)=>n+p.length,0), maxElevation:max.y, minElevation:min.y} };
  }
  const EXAMPLES={
    original:EXAMPLE_CODE,
    linearSlopes:'TS2|(TL=10,TW=8,TD=.25,LH=4,SC=1,SS=1,SE=1,BC=0,BS=1,WS=8)|(AA=0,AH=0)|(FL=1)|(FL=2,DH=1,SS=0,SE=0)|(FL=2,DH=1,SS=0,SE=0)|(FL=1)',
    easedSlopes:'TS2|(TL=10,TW=8,TD=.25,LH=4,SC=1,SS=1,SE=1,BC=0,BS=1,WS=8)|(AA=0,AH=0)|(FL=1)|(FL=2,DH=1,SS=1,SE=0)|(FL=2,DH=1,SS=0,SE=1)|(FL=1)',
    bankedCurve:'TS2|(TL=10,TW=10,TD=.25,LH=4,SC=1,SS=1,SE=1,BC=1,BS=1,WS=8)|(AA=0,AH=0)|(FL=2)|(FL=2,BL=2)|(FL=4,DA=90)|(FL=2,BL=0)|(FL=2)',
    twist:'TS2|(TL=10,TW=10,TD=.25,LH=4,SC=1,SS=1,SE=1,BC=0,BS=1,WS=8)|(AA=0,AH=0)|(FL=1)|(FL=3,BL=-2,BR=2)|(FL=2)|(FL=4,BL=2,BR=-2)|(FL=2)|(FL=3,BL=0,BR=0)',
    bowl:'TS2|(TL=10,TW=10,TD=.25,LH=4,SC=1,SS=1,SE=1,BC=1,BS=1,WS=12)|(AA=0,AH=0)|(FL=1)|(FL=3,BL=2,BR=2)|(FL=4,DA=90)|(FL=3,BL=0,BR=0)|(FL=1)',
    surfaceDetail:'TS2|(TL=10,TW=8,TD=.25,LH=4,LS=12,WS=8,CSW=16,SN=1,SC=1,BC=1,BS=1)|(AA=0,AH=0)|(FL=2,LS=4,WS=4)|(FL=1,DA=45,DH=1,TW=10,LS=8,WS=6,BR=1)|(FL=1,DA=45,DH=1,TW=12,LS=32,WS=16,BL=1,BR=0)|(FL=2,DH=-1,TW=8,LS=8,WS=4,BL=0,BR=0)|(FL=2)',
    driveLoop:'TS2|(TL=10,TW=12,TD=.25,LH=4,LS=24,WS=8,CSW=12,SN=1,SC=1,SS=1,SE=1,BC=0,BS=1)|(AA=0,AH=0)|(FL=6)|(FL=4,DA=90)|(FL=3)|(FL=4,DA=90)|(FL=6)|(FL=4,DA=90)|(FL=3)|(FL=4,DA=90)|AC',
    jumpTest:'TS2|(TL=10,TW=8,TD=.25,LH=4,LS=24,WS=8,CSW=12,SN=1,SC=1,SS=1,SE=1,BC=0,BS=1)|(AA=0,AH=0)|(FL=2,DH=1,SS=1,SE=0,ES=none)|(GL=.5)|(FL=15,ES=none)',
    lapTrial:'TS2|(TL=10,TW=12,TD=.25,LH=4,LS=24,WS=8,SN=1)|(AA=0,AH=0)|(FL=6,SF=1,RP=.25)|(FL=4,DA=90)|(FL=3,CP=1)|(FL=4,DA=90)|(FL=6)|(FL=4,DA=90)|(FL=3,CP=2)|(FL=4,DA=90)|AC',
    sprintTrial:'TS2|(TL=10,TW=8,TD=.25,LH=4,LS=24,WS=8,SN=1)|(AA=0,AH=0)|(FL=4,RS=1,RP=.25)|(FL=4,CP=1)|(FL=4,CP=2)|(FL=4,RF=1,RP=.75)',
    terrainTest:'TS2|(TL=10,TW=8,TD=.25,LH=4,LS=16,WS=8,SN=1,GY=0,GC=1,GG=.55,GD=3)|(AA=0,AH=0)|(FL=4,ES=none)|(FL=2,DH=-1,ES=wall)|(FL=4)|(FL=2,DH=1)|(FL=2,ES=none)|(FL=3,DH=1)|(FL=4)|(FL=3,DH=-1)|(FL=2)',
    materialTest:'TS2|(TL=10,TW=12,TD=.25,LH=4,LS=24,WS=8,SN=1)|(AA=0,AH=0)|(FL=6,ST=tarmac,SF=1,RP=.25)|(FL=4,DA=90,ST=gravel)|(FL=4,ST=dirt,CP=1)|(FL=4,DA=90,ST=wood)|(FL=6,ST=ice)|(FL=4,DA=90,ST=mud)|(FL=4,ST=tarmac,CP=2)|(FL=4,DA=90)|AC',
    mudHill:'TS2|(TL=10,TW=12,TD=.25,LH=4,LS=48,WS=4,SC=1,SS=1,SE=1,SN=1)|(AA=0,AH=0)|(FL=2,ST=mud,RS=1,RP=.75)|(FL=2,DH=2,CP=1)|(FL=2,RF=1,RP=.25)',
    skidPractice:'TS2|(TL=10,TW=48,TD=.25,LS=16,WS=4,SN=1,ES=grey)|(AA=0,AH=0)|(FL=8,ST=gravel,RS=1,RP=.5)|(FL=8,ST=dirt,CP=1)|(FL=8,ST=tarmac,CP=2)|(FL=8,ST=mud,RF=1,RP=.5)',
    fenceDemo:'TS2|(TL=10,TW=8,TD=.25,ES=fence,LS=24,WS=4,SN=1)|(AA=0,AH=0)|(FL=5,SF=1,RP=.5)|(FL=2,DA=90)|(FL=3,CP=1)|(FL=2,DA=90)|(FL=5)|(FL=2,DA=90)|(FL=3,CP=2)|(FL=2,DA=90)|AC',
    stoneDemo:'TS2|(TL=10,TW=8,TD=.25,ES=stonekerb,LS=24,WS=4,SN=1)|(AA=0,AH=0)|(FL=3,SF=1,RP=.5)|(FL=2,DA=90,ES=stonewall)|(FL=2,CP=1)|(FL=2,DA=90,ES=wall)|(FL=3,ES=stonekerb)|(FL=2,DA=90)|(FL=2,CP=2,ES=grey)|(FL=2,DA=90,ES=stonekerb)|AC',
    outerCorners:'TS2|(TL=10,TW=8,TD=.25,LH=4,OC=0,ES=stonekerb,LS=24,WS=4,SN=1)|(AA=0,AH=0)|(FL=3,SF=1,RP=.5)|(FL=2,DA=90,OC=0)|(FL=2,CP=1)|(FL=2,DA=90,OC=.5)|(FL=3)|(FL=2,DA=90,OC=1)|(FL=2,CP=2)|(FL=2,DA=90,OC=.75)|AC',
    levelCrossing:'TS2|(TL=10,TW=8,TD=.25,LH=4,ES=grey)|(AA=0,AH=0)|(FL=4,SF=1,RP=.25)|(FL=2,DA=90)|(FL=4)|(FL=2,DA=90,CP=1)|(FL=2)|(FL=2,DA=90)|(FL=6)|(FL=2,DA=90)|(FL=2)|AC'
  };
  window.TS2 = {DEFAULTS, ENVIRONMENTS, EDGE_WIDTH,EDGE_STYLES,edgeStyle,SURFACE_TYPES,surfaceType,pieceSurface,EXAMPLE_CODE, EXAMPLES, parse, build, updateSettings, heightAcross,halfWidth,lateralU,roadPoint,raceMarker};
})();
