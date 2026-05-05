(() => {

function isFloorTile(G,map,x,y){
  return x>=1 && x<=G.Gmapx &&
         y>=1 && y<=G.Gmapy &&
         map[x][y].flr>0;
}

function isWallTile(G,map,x,y){
  return !isFloorTile(G,map,x,y);
}

function setupCanvas(canvas,G,tileSize){
  canvas.width = tileSize*(G.Gmapx+2);
  canvas.height = tileSize*(G.Gmapy+2);

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled=false;

  return ctx;
}

function tileHash(x,y,seed=0){
  let h=(x*374761393+y*668265263+seed*1442695041)>>>0;
  h=Math.imul(h^(h>>>13),1274126177);
  return (h^(h>>>16))>>>0;
}

function hashRand(hash){
  hash=Math.imul(hash^(hash>>>15),1|hash);
  hash^=hash+Math.imul(hash^(hash>>>7),61|hash);
  return ((hash^(hash>>>14))>>>0)/4294967296;
}

function drawRoughLine(ctx,x1,y1,x2,y2,wobble=1){
  ctx.beginPath();

  const steps=4;

  for(let i=0;i<=steps;i++){
    const t=i/steps;
    const x=x1+(x2-x1)*t+(Math.random()-0.5)*wobble;
    const y=y1+(y2-y1)*t+(Math.random()-0.5)*wobble;

    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  }

  ctx.stroke();
}

/* less-random 3-stroke dungeon hatch */
function drawStoneHatch(ctx,nx,ny,ts,x,y,seed){
  ctx.save();

  ctx.beginPath();
  ctx.rect(nx,ny,ts,ts);
  ctx.clip();

  ctx.fillStyle="#efefec";
  ctx.fillRect(nx,ny,ts,ts);

  ctx.strokeStyle="#111";
  ctx.lineWidth=Math.max(0.7,ts*0.018);
  ctx.lineCap="round";

  const cell=ts/3;
  let h=tileHash(x,y,seed);

  for(let gy=-1;gy<4;gy++){
    for(let gx=-1;gx<4;gx++){
      h=tileHash(x*31+gx,y*37+gy,h);

      const skip=hashRand(h);
      if(skip<0.18) continue;

      const cx=nx+gx*cell+cell*0.5+(hashRand(h+1)-0.5)*cell*0.5;
      const cy=ny+gy*cell+cell*0.5+(hashRand(h+2)-0.5)*cell*0.5;

      const len=ts*(0.18+hashRand(h+3)*0.14);

      const family=Math.floor(hashRand(h+4)*3);

      let angle;

      if(family===0) angle=Math.PI*0.12;
      else if(family===1) angle=Math.PI*0.38;
      else angle=Math.PI*0.72;

      angle+=(hashRand(h+5)-0.5)*0.25;

      for(let s=0;s<3;s++){
        const off=(s-1)*ts*0.035;

        const ox=Math.cos(angle+Math.PI/2)*off;
        const oy=Math.sin(angle+Math.PI/2)*off;

        drawRoughLine(
          ctx,
          cx-Math.cos(angle)*len*0.5+ox,
          cy-Math.sin(angle)*len*0.5+oy,
          cx+Math.cos(angle)*len*0.5+ox,
          cy+Math.sin(angle)*len*0.5+oy,
          ts*0.018
        );
      }
    }
  }

  ctx.restore();
}

function drawFloorTileInk(ctx,nx,ny,ts){
  ctx.fillStyle="#fff";
  ctx.fillRect(nx,ny,ts,ts);

  const grad=ctx.createLinearGradient(nx,ny,nx+ts,ny+ts);
  grad.addColorStop(0,"rgba(255,255,255,0)");
  grad.addColorStop(1,"rgba(0,0,0,0.08)");

  ctx.fillStyle=grad;
  ctx.fillRect(nx,ny,ts,ts);

  ctx.strokeStyle="rgba(0,0,0,0.16)";
  ctx.lineWidth=Math.max(0.6,ts*0.01);

  drawRoughLine(ctx,nx,ny,nx+ts,ny,ts*0.02);
  drawRoughLine(ctx,nx+ts,ny,nx+ts,ny+ts,ts*0.02);
  drawRoughLine(ctx,nx,ny+ts,nx+ts,ny+ts,ts*0.02);
  drawRoughLine(ctx,nx,ny,nx,ny+ts,ts*0.02);
}

function drawWaterWaves(ctx,x,y,ts,color){
  ctx.save();

  ctx.beginPath();
  ctx.rect(x,y,ts,ts);
  ctx.clip();

  ctx.strokeStyle=color;
  ctx.lineWidth=Math.max(1,ts*0.035);

  const rows=3;
  const amp=ts*0.04;
  const wave=ts*0.28;

  for(let r=1;r<=rows;r++){
    const cy=y+(ts/(rows+1))*r;

    ctx.beginPath();

    for(let px=x-wave;px<=x+ts+wave;px+=2){
      const t=(px-x)/wave;
      const py=cy+Math.sin(t*Math.PI*2)*amp;

      if(px===x-wave) ctx.moveTo(px,py);
      else ctx.lineTo(px,py);
    }

    ctx.stroke();
  }

  ctx.restore();
}

function doorOrientation(G,map,x,y){
  const left=isFloorTile(G,map,x-1,y);
  const right=isFloorTile(G,map,x+1,y);
  const up=isFloorTile(G,map,x,y-1);
  const down=isFloorTile(G,map,x,y+1);

  if(left && right) return "vertical";
  if(up && down) return "horizontal";

  return "unknown";
}

function drawDoorSymbol(ctx,G,map,x,y,ts,locked,style){
  const nx=x*ts;
  const ny=y*ts;
  const cx=nx+ts/2;
  const cy=ny+ts/2;

  const orient=doorOrientation(G,map,x,y);

  ctx.save();

  ctx.strokeStyle=style==="print"?"#000":"#1a0f08";
  ctx.fillStyle=style==="print"?"#fff":"#c69b5b";
  ctx.lineWidth=Math.max(2,ts*0.055);

  if(orient==="vertical"){
    const w=ts*0.18;
    const h=ts*0.68;

    ctx.fillRect(cx-w/2,cy-h/2,w,h);
    ctx.strokeRect(cx-w/2,cy-h/2,w,h);

    ctx.beginPath();
    ctx.moveTo(cx-w*1.45,cy);
    ctx.lineTo(cx+w*1.45,cy);
    ctx.stroke();
  } else {
    const w=ts*0.68;
    const h=ts*0.18;

    ctx.fillRect(cx-w/2,cy-h/2,w,h);
    ctx.strokeRect(cx-w/2,cy-h/2,w,h);

    ctx.beginPath();
    ctx.moveTo(cx,cy-h*1.45);
    ctx.lineTo(cx,cy+h*1.45);
    ctx.stroke();
  }

  if(locked){
    ctx.fillStyle=style==="print"?"#000":"#1a0f08";
    ctx.beginPath();
    ctx.arc(cx,cy,Math.max(2,ts*0.055),0,Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

function drawKeySymbol(ctx,x,y,ts,style){
  const nx=x*ts;
  const ny=y*ts;
  const cx=nx+ts/2;
  const cy=ny+ts/2;

  ctx.save();

  ctx.strokeStyle=style==="print"?"#000":"#d89b25";
  ctx.fillStyle=style==="print"?"#fff":"#d89b25";
  ctx.lineWidth=Math.max(2,ts*0.055);
  ctx.lineCap="round";
  ctx.lineJoin="round";

  ctx.beginPath();
  ctx.arc(cx-ts*0.14,cy,ts*0.10,0,Math.PI*2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx-ts*0.04,cy);
  ctx.lineTo(cx+ts*0.20,cy);
  ctx.lineTo(cx+ts*0.20,cy+ts*0.09);
  ctx.moveTo(cx+ts*0.09,cy);
  ctx.lineTo(cx+ts*0.09,cy+ts*0.08);
  ctx.stroke();

  ctx.restore();
}

function drawDoorAndKey(ctx,G,map,x,y,ts,style){
  const b=map[x][y];

  if(b.doorType===1){
    drawDoorSymbol(ctx,G,map,x,y,ts,false,style);
  }

  if(b.doorType===2){
    drawDoorSymbol(ctx,G,map,x,y,ts,true,style);
  }

  if(b.keyId){
    drawKeySymbol(ctx,x,y,ts,style);
  }
}

function drawStartExit(ctx,G,map,ts,style){
  if(G.Gstartx>0){
    const x=G.Gstartx*ts;
    const y=G.Gstarty*ts;

    ctx.fillStyle=style==="print"?"#fff":"#2ecc71";
    ctx.strokeStyle="#000";
    ctx.lineWidth=Math.max(2,ts*0.055);

    ctx.beginPath();
    ctx.arc(x+ts/2,y+ts/2,ts*0.28,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();

    if(ts>=18){
      ctx.fillStyle="#000";
      ctx.font=`${Math.max(10,Math.floor(ts*0.28))}px system-ui`;
      ctx.textAlign="center";
      ctx.textBaseline="middle";
      ctx.fillText("S",x+ts/2,y+ts/2);
    }
  }

  if(G._exitX>0){
    const x=G._exitX*ts;
    const y=G._exitY*ts;

    ctx.fillStyle=style==="print"?"#fff":"#e74c3c";
    ctx.strokeStyle="#000";
    ctx.lineWidth=Math.max(2,ts*0.055);

    ctx.beginPath();
    ctx.arc(x+ts/2,y+ts/2,ts*0.28,0,Math.PI*2);
    ctx.fill();
    ctx.stroke();

    if(ts>=18){
      ctx.fillStyle="#000";
      ctx.font=`${Math.max(10,Math.floor(ts*0.28))}px system-ui`;
      ctx.textAlign="center";
      ctx.textBaseline="middle";
      ctx.fillText("E",x+ts/2,y+ts/2);
    }
  }
}

function drawPrintableMap(ctx,G,map,tileSize,options){
  const ts=tileSize;
  const seed=G._seedUsed||0;

  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);

  for(let y=0;y<=G.Gmapy+1;y++){
    for(let x=0;x<=G.Gmapx+1;x++){
      if(!isFloorTile(G,map,x,y)){
        drawStoneHatch(ctx,x*ts,y*ts,ts,x,y,seed);
      }
    }
  }

  for(let y=1;y<=G.Gmapy;y++){
    for(let x=1;x<=G.Gmapx;x++){
      if(!isFloorTile(G,map,x,y)) continue;

      const nx=x*ts;
      const ny=y*ts;

      drawFloorTileInk(ctx,nx,ny,ts);

      if(map[x][y].flood){
        ctx.fillStyle="rgba(0,0,0,.05)";
        ctx.fillRect(nx,ny,ts,ts);
        drawWaterWaves(ctx,nx,ny,ts,"rgba(0,0,0,.45)");
      }
    }
  }

  ctx.strokeStyle="#000";
  ctx.lineWidth=Math.max(3,Math.floor(ts*.10));
  ctx.lineCap="square";
  ctx.lineJoin="round";

  for(let y=1;y<=G.Gmapy;y++){
    for(let x=1;x<=G.Gmapx;x++){
      if(!isFloorTile(G,map,x,y)) continue;

      const nx=x*ts;
      const ny=y*ts;

      if(isWallTile(G,map,x,y-1)){
        drawRoughLine(ctx,nx,ny,nx+ts,ny,ts*.03);
      }

      if(isWallTile(G,map,x+1,y)){
        drawRoughLine(ctx,nx+ts,ny,nx+ts,ny+ts,ts*.03);
      }

      if(isWallTile(G,map,x,y+1)){
        drawRoughLine(ctx,nx,ny+ts,nx+ts,ny+ts,ts*.03);
      }

      if(isWallTile(G,map,x-1,y)){
        drawRoughLine(ctx,nx,ny,nx,ny+ts,ts*.03);
      }
    }
  }

  /* bottom/right room shadow */
  ctx.fillStyle="rgba(0,0,0,0.08)";

  for(let y=1;y<=G.Gmapy;y++){
    for(let x=1;x<=G.Gmapx;x++){
      if(!isFloorTile(G,map,x,y)) continue;

      const nx=x*ts;
      const ny=y*ts;

      if(isWallTile(G,map,x+1,y)){
        ctx.fillRect(nx+ts*.86,ny,ts*.14,ts);
      }

      if(isWallTile(G,map,x,y+1)){
        ctx.fillRect(nx,ny+ts*.86,ts,ts*.14);
      }
    }
  }

  if(options.showDoors){
    for(let y=1;y<=G.Gmapy;y++){
      for(let x=1;x<=G.Gmapx;x++){
        drawDoorAndKey(ctx,G,map,x,y,ts,"print");
      }
    }
  }

  if(options.showStartExit){
    drawStartExit(ctx,G,map,ts,"print");
  }
}

function drawVttMap(ctx,G,map,tileSize,options){
  const ts=tileSize;

  ctx.fillStyle="#191715";
  ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);

  for(let y=0;y<=G.Gmapy+1;y++){
    for(let x=0;x<=G.Gmapx+1;x++){
      const b=map[x][y];
      if(!b||b.flr<=0) continue;

      const nx=x*ts;
      const ny=y*ts;

      if(b.flood){
        ctx.fillStyle="#243f52";
        ctx.fillRect(nx,ny,ts,ts);
        drawWaterWaves(ctx,nx,ny,ts,"rgba(210,235,255,.35)");
      } else {
        ctx.fillStyle="#5f5b50";
        ctx.fillRect(nx,ny,ts,ts);
      }

      ctx.strokeStyle="rgba(0,0,0,0.22)";
      ctx.lineWidth=Math.max(1,ts*0.025);
      ctx.strokeRect(nx+0.5,ny+0.5,ts-1,ts-1);
    }
  }

  ctx.strokeStyle="#24201b";
  ctx.lineWidth=Math.max(5,ts*.12);
  ctx.lineCap="square";
  ctx.lineJoin="miter";

  for(let y=1;y<=G.Gmapy;y++){
    for(let x=1;x<=G.Gmapx;x++){
      if(!isFloorTile(G,map,x,y)) continue;

      const nx=x*ts;
      const ny=y*ts;

      ctx.beginPath();

      if(isWallTile(G,map,x,y-1)){
        ctx.moveTo(nx,ny);
        ctx.lineTo(nx+ts,ny);
      }

      if(isWallTile(G,map,x+1,y)){
        ctx.moveTo(nx+ts,ny);
        ctx.lineTo(nx+ts,ny+ts);
      }

      if(isWallTile(G,map,x,y+1)){
        ctx.moveTo(nx,ny+ts);
        ctx.lineTo(nx+ts,ny+ts);
      }

      if(isWallTile(G,map,x-1,y)){
        ctx.moveTo(nx,ny);
        ctx.lineTo(nx,ny+ts);
      }

      ctx.stroke();
    }
  }

  if(options.showDoors){
    for(let y=1;y<=G.Gmapy;y++){
      for(let x=1;x<=G.Gmapx;x++){
        drawDoorAndKey(ctx,G,map,x,y,ts,"vtt");
      }
    }
  }

  if(options.showStartExit){
    drawStartExit(ctx,G,map,ts,"vtt");
  }
}

function renderMapToCanvas(canvas,state,style,options={}){
  const {G,map}=state;
  const tileSize=options.tileSize||72;
  const ctx=setupCanvas(canvas,G,tileSize);

  const renderOptions={
    showDoors:options.showDoors!==false,
    showStartExit:options.showStartExit!==false
  };

  if(style==="print"){
    drawPrintableMap(ctx,G,map,tileSize,renderOptions);
    return canvas;
  }

  if(style==="vtt"){
    drawVttMap(ctx,G,map,tileSize,renderOptions);
    return canvas;
  }

  return canvas;
}

window.DigyrinthRenderers={
  renderMapToCanvas
};

})();