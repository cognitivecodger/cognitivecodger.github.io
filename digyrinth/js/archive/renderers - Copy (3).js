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

/* ---------- Hash helpers for repeatable ink texture ---------- */

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

/* ---------- Rough hand-drawn lines ---------- */

function drawRoughLine(ctx,x1,y1,x2,y2,wobble=1){
  ctx.beginPath();

  const steps=5;

  for(let i=0;i<=steps;i++){
    const t=i/steps;

    const x=
      x1+(x2-x1)*t+
      (Math.random()-0.5)*wobble;

    const y=
      y1+(y2-y1)*t+
      (Math.random()-0.5)*wobble;

    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  }

  ctx.stroke();
}

/* ---------- Crosshatch dungeon stone ---------- */

function drawWallCrosshatch(ctx,nx,ny,ts,x,y,seed){

  ctx.save();

  ctx.beginPath();
  ctx.rect(nx,ny,ts,ts);
  ctx.clip();

  ctx.fillStyle="#efefec";
  ctx.fillRect(nx,ny,ts,ts);

  ctx.strokeStyle="#111";
  ctx.lineWidth=Math.max(0.7,ts*0.018);

  const count=Math.max(6,Math.floor(ts/5));

  let h=tileHash(x,y,seed);

  for(let i=0;i<count;i++){

    h=tileHash(i+x*17,y*23,h);

    const r1=hashRand(h);
    const r2=hashRand(h+11);
    const r3=hashRand(h+29);
    const r4=hashRand(h+47);

    const cx=nx+r1*ts;
    const cy=ny+r2*ts;

    const len=
      ts*(0.22+r3*0.38);

    const angle=r4*Math.PI;

    const x1=cx-Math.cos(angle)*len*0.5;
    const y1=cy-Math.sin(angle)*len*0.5;

    const x2=cx+Math.cos(angle)*len*0.5;
    const y2=cy+Math.sin(angle)*len*0.5;

    drawRoughLine(
      ctx,x1,y1,x2,y2,ts*0.035
    );
  }

  ctx.restore();
}

/* ---------- Floor tiles ---------- */

function drawFloorTileInk(ctx,nx,ny,ts){

  ctx.fillStyle="#fff";
  ctx.fillRect(nx,ny,ts,ts);

  /* top-left lighting */
  const grad=
    ctx.createLinearGradient(
      nx,ny,nx+ts,ny+ts
    );

  grad.addColorStop(
    0,"rgba(255,255,255,0)"
  );

  grad.addColorStop(
    1,"rgba(0,0,0,0.10)"
  );

  ctx.fillStyle=grad;
  ctx.fillRect(nx,ny,ts,ts);

  ctx.strokeStyle=
    "rgba(0,0,0,0.18)";

  ctx.lineWidth=
    Math.max(0.6,ts*0.012);

  drawRoughLine(
    ctx,nx,ny,nx+ts,ny,
    ts*0.025
  );

  drawRoughLine(
    ctx,nx+ts,ny,
    nx+ts,ny+ts,
    ts*0.025
  );

  drawRoughLine(
    ctx,nx,ny+ts,
    nx+ts,ny+ts,
    ts*0.025
  );

  drawRoughLine(
    ctx,nx,ny,
    nx,ny+ts,
    ts*0.025
  );
}

/* ---------- Water ---------- */

function drawWaterWaves(
  ctx,x,y,ts,color
){
  ctx.save();

  ctx.beginPath();
  ctx.rect(x,y,ts,ts);
  ctx.clip();

  ctx.strokeStyle=color;
  ctx.lineWidth=
    Math.max(1,ts*0.035);

  const rows=3;
  const amp=ts*0.04;
  const wave=ts*0.28;

  for(let r=1;r<=rows;r++){

    const cy=
      y+(ts/(rows+1))*r;

    ctx.beginPath();

    for(
      let px=x-wave;
      px<=x+ts+wave;
      px+=2
    ){

      const t=(px-x)/wave;

      const py=
        cy+
        Math.sin(
          t*Math.PI*2
        )*amp;

      if(px===x-wave)
        ctx.moveTo(px,py);
      else
        ctx.lineTo(px,py);
    }

    ctx.stroke();
  }

  ctx.restore();
}

/* ---------- Doors ---------- */

function drawDoorAndKey(
 ctx,G,map,x,y,ts,style
){

 const nx=x*ts;
 const ny=y*ts;

 const b=map[x][y];

 if(b.doorType===1){

   ctx.fillStyle=
    style==="print"?
    "#000":"#7a4a16";

   ctx.fillRect(
    nx+ts*.35,
    ny+ts*.35,
    ts*.3,
    ts*.3
   );
 }

 if(b.doorType===2){

   ctx.fillStyle=
    style==="print"?
    "#000":"#c46b19";

   ctx.fillRect(
    nx+ts*.25,
    ny+ts*.25,
    ts*.5,
    ts*.5
   );
 }

 if(b.keyId){

   ctx.fillStyle=
    style==="print"?
    "#000":"#d89b25";

   ctx.beginPath();

   ctx.arc(
     nx+ts/2,
     ny+ts/2,
     ts*.16,
     0,
     Math.PI*2
   );

   ctx.fill();
 }

}

/* ---------- Start/Exit ---------- */

function drawStartExit(
 ctx,G,map,ts,style
){

 if(G.Gstartx>0){

   ctx.fillStyle=
    style==="print"?
    "#fff":"#2ecc71";

   ctx.strokeStyle="#000";

   ctx.beginPath();

   ctx.arc(
    G.Gstartx*ts+ts/2,
    G.Gstarty*ts+ts/2,
    ts*.28,
    0,
    Math.PI*2
   );

   ctx.fill();
   ctx.stroke();
 }

 if(G._exitX>0){

   ctx.fillStyle=
    style==="print"?
    "#fff":"#e74c3c";

   ctx.strokeStyle="#000";

   ctx.beginPath();

   ctx.arc(
    G._exitX*ts+ts/2,
    G._exitY*ts+ts/2,
    ts*.28,
    0,
    Math.PI*2
   );

   ctx.fill();
   ctx.stroke();
 }

}

/* ---------- PRINTABLE STYLE ---------- */

function drawPrintableMap(
 ctx,G,map,tileSize,options
){

 const ts=tileSize;
 const seed=G._seedUsed||0;

 ctx.fillStyle="#fff";
 ctx.fillRect(
   0,0,
   ctx.canvas.width,
   ctx.canvas.height
 );

 /* draw walls first */

 for(
  let y=0;
  y<=G.Gmapy+1;
  y++
 ){

  for(
   let x=0;
   x<=G.Gmapx+1;
   x++
  ){

   if(
    !isFloorTile(G,map,x,y)
   ){

    drawWallCrosshatch(
      ctx,
      x*ts,
      y*ts,
      ts,
      x,y,seed
    );
   }

  }
 }

 /* floors over top */

 for(
  let y=1;
  y<=G.Gmapy;
  y++
 ){

  for(
   let x=1;
   x<=G.Gmapx;
   x++
  ){

   if(
    !isFloorTile(G,map,x,y)
   ) continue;

   const nx=x*ts;
   const ny=y*ts;

   drawFloorTileInk(
    ctx,nx,ny,ts
   );

   if(map[x][y].flood){

     ctx.fillStyle=
      "rgba(0,0,0,.05)";

     ctx.fillRect(
       nx,ny,ts,ts
     );

     drawWaterWaves(
      ctx,
      nx,ny,ts,
      "rgba(0,0,0,.45)"
     );
   }

  }
 }

 /* thick walls */

 ctx.strokeStyle="#000";

 ctx.lineWidth=
  Math.max(
   3,
   Math.floor(ts*.10)
  );

 for(
  let y=1;
  y<=G.Gmapy;
  y++
 ){

  for(
   let x=1;
   x<=G.Gmapx;
   x++
  ){

   if(
    !isFloorTile(G,map,x,y)
   ) continue;

   const nx=x*ts;
   const ny=y*ts;

   if(
    isWallTile(
     G,map,x,y-1
    )
   ){
    drawRoughLine(
      ctx,
      nx,ny,
      nx+ts,ny,
      ts*.035
    );
   }

   if(
    isWallTile(
     G,map,x+1,y
    )
   ){
    drawRoughLine(
      ctx,
      nx+ts,ny,
      nx+ts,ny+ts,
      ts*.035
    );
   }

   if(
    isWallTile(
     G,map,x,y+1
    )
   ){
    drawRoughLine(
      ctx,
      nx,ny+ts,
      nx+ts,ny+ts,
      ts*.035
    );
   }

   if(
    isWallTile(
     G,map,x-1,y
    )
   ){
    drawRoughLine(
      ctx,
      nx,ny,
      nx,ny+ts,
      ts*.035
    );
   }

  }
 }

 if(options.showDoors){

   for(let y=1;y<=G.Gmapy;y++)
   for(let x=1;x<=G.Gmapx;x++)
     drawDoorAndKey(
       ctx,G,map,x,y,
       ts,"print"
     );
 }

 if(options.showStartExit){
   drawStartExit(
     ctx,G,map,ts,"print"
   );
 }

}

/* ---------- VTT ---------- */

function drawVttMap(
 ctx,G,map,tileSize,options
){

 const ts=tileSize;

 ctx.fillStyle="#191715";
 ctx.fillRect(
   0,0,
   ctx.canvas.width,
   ctx.canvas.height
 );

 for(
  let y=0;
  y<=G.Gmapy+1;
  y++
 ){

  for(
   let x=0;
   x<=G.Gmapx+1;
   x++
  ){

   const b=map[x][y];
   if(!b||b.flr<=0)
     continue;

   const nx=x*ts;
   const ny=y*ts;

   if(b.flood){

    ctx.fillStyle="#243f52";

    ctx.fillRect(
      nx,ny,ts,ts
    );

    drawWaterWaves(
      ctx,
      nx,ny,ts,
      "rgba(210,235,255,.35)"
    );

   } else {

    ctx.fillStyle="#5f5b50";

    ctx.fillRect(
      nx,ny,ts,ts
    );
   }

  }

 }

 if(options.showDoors){

  for(let y=1;y<=G.Gmapy;y++)
  for(let x=1;x<=G.Gmapx;x++)
   drawDoorAndKey(
    ctx,G,map,x,y,
    ts,"vtt"
   );
 }

 if(options.showStartExit){
   drawStartExit(
    ctx,G,map,ts,"vtt"
   );
 }

}

/* ---------- EXPORT ---------- */

function renderMapToCanvas(
 canvas,
 state,
 style,
 options={}
){

 const {G,map}=state;

 const tileSize=
   options.tileSize||72;

 const ctx=
   setupCanvas(
     canvas,G,tileSize
   );

 const renderOptions={
  showDoors:
   options.showDoors!==false,

  showStartExit:
   options.showStartExit!==false
 };

 if(style==="print"){
   drawPrintableMap(
    ctx,G,map,
    tileSize,
    renderOptions
   );
   return canvas;
 }

 if(style==="vtt"){
   drawVttMap(
    ctx,G,map,
    tileSize,
    renderOptions
   );
   return canvas;
 }

 return canvas;
}

window.DigyrinthRenderers={
 renderMapToCanvas
};

})();
