(() => {

    const {
        isFloorTile,
        isWallTile,
        tileHash,
        hashRand,
        drawWaterWaves,
        drawDoorAndKey,
        drawStartExit
    } = window.DigyrinthRendererShared;

/* =========================================================
   VTT WALL TILE BACKGROUND
   ---------------------------------------------------------
   Currently this gives the solid rock area a dark masonry
   feel underneath the floor and bevelled walls.
========================================================= */

function drawVttWallTile(ctx, nx, ny, ts, x, y, seed) {
    // TWEAK: Base darkness of wall/rock tiles.
    const wallShadeBase = 28;
    const wallShadeVariation = 18;

    // TWEAK: Mortar line opacity and width.
    const wallMortarOpacity = 0.07;
    const wallMortarWidthRatio = 0.018;

    // TWEAK: Number of brick rows in each solid wall tile.
    const wallBrickRows = 3;

    // TWEAK: Bottom darkening on wall tiles.
    const wallBottomShadeOpacity = 0.18;
    const wallBottomShadeStart = 0.65;

    const h = tileHash(x, y, seed);
    const shade = wallShadeBase + Math.floor(hashRand(h) * wallShadeVariation);

    ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 8})`;
    ctx.fillRect(nx, ny, ts, ts);

    ctx.strokeStyle = `rgba(255,255,255,${wallMortarOpacity})`;
    ctx.lineWidth = Math.max(1, ts * wallMortarWidthRatio);

    const brickH = ts / wallBrickRows;

    for (let r = 1; r < wallBrickRows; r++) {
        const yy = ny + r * brickH;
        ctx.beginPath();
        ctx.moveTo(nx, yy);
        ctx.lineTo(nx + ts, yy);
        ctx.stroke();
    }

    for (let r = 0; r < wallBrickRows; r++) {
        const offset = r % 2 === 0 ? 0 : ts * 0.5;
        const yy = ny + r * brickH;

        ctx.beginPath();
        ctx.moveTo(nx + offset, yy);
        ctx.lineTo(nx + offset, yy + brickH);
        ctx.stroke();
    }

    ctx.fillStyle = `rgba(0,0,0,${wallBottomShadeOpacity})`;
    ctx.fillRect(nx, ny + ts * wallBottomShadeStart, ts, ts * (1 - wallBottomShadeStart));
}





    /* =========================================================
       VTT EXPOSED BRICK WALL EDGES
       ---------------------------------------------------------
       Draws small grey outlined bricks along exposed wall edges.
       This replaces the current pipe-like bevel wall edges.
    ========================================================= */

    function drawVttBrickWallRuns(ctx, G, map, ts, shadowDirections = { n: true, e: true, s: false, w: false }) {
        const seed = G._seedUsed || 0;

        // TWEAKS
        const brickDepth = ts * 0.24;
        const brickDepthVariation = ts * 0.08; // tiny per-brick thickness variation
        const brickOutline = Math.max(1, ts * 0.02);
        const brickGap = 0; // Math.max(1, ts * 0.005);

        function drawBrick(ctx, x, y, w, h, hash, side) {
    const shade = 105 + Math.floor(hashRand(hash) * 38);

    // TWEAK: how much each brick corner can wobble.
    const cornerVariation = ts * 0.035;

    // TWEAK: bevel strength.
    const bevelOpacity = 0.50;
    const bevelWidth = Math.max(2, ts * 0.05);

    // Each corner gets its own independent x/y wobble.
    const tlx = (hashRand(hash + 101) - 0.5) * cornerVariation;
    const tly = (hashRand(hash + 102) - 0.5) * cornerVariation;

    const trx = (hashRand(hash + 103) - 0.5) * cornerVariation;
    const try_ = (hashRand(hash + 104) - 0.5) * cornerVariation;

    const brx = (hashRand(hash + 105) - 0.5) * cornerVariation;
    const bry = (hashRand(hash + 106) - 0.5) * cornerVariation;

    const blx = (hashRand(hash + 107) - 0.5) * cornerVariation;
    const bly = (hashRand(hash + 108) - 0.5) * cornerVariation;

    const x1 = x + brickGap;
    const y1 = y + brickGap;
    const x2 = x + w - brickGap;
    const y2 = y + h - brickGap;

    const pTL = { x: x1 + tlx, y: y1 + tly };
    const pTR = { x: x2 + trx, y: y1 + try_ };
    const pBR = { x: x2 + brx, y: y2 + bry };
    const pBL = { x: x1 + blx, y: y2 + bly };

    // Decide light side from shadow direction checkboxes.
    // Shadow direction = side that should be dark.
    // Light comes from the opposite side.
    const lightFromN = shadowDirections.n;
    const lightFromE = shadowDirections.e;
    const lightFromS = shadowDirections.s;
    const lightFromW = shadowDirections.w;

    ctx.save();

    // Brick body.
    ctx.fillStyle = `rgb(${shade},${shade},${shade - 4})`;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = brickOutline;

    ctx.beginPath();
    ctx.moveTo(pTL.x, pTL.y);
    ctx.lineTo(pTR.x, pTR.y);
    ctx.lineTo(pBR.x, pBR.y);
    ctx.lineTo(pBL.x, pBL.y);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Clip bevels to the brick shape.
    ctx.clip();

    ctx.lineWidth = bevelWidth;
    ctx.lineCap = "round";

    // Highlight edges.
    ctx.strokeStyle = `rgba(255,255,255,${bevelOpacity})`;

    if (lightFromN) {
        ctx.beginPath();
        ctx.moveTo(pTL.x, pTL.y);
        ctx.lineTo(pTR.x, pTR.y);
        ctx.stroke();
    }

    if (lightFromE) {
        ctx.beginPath();
        ctx.moveTo(pTR.x, pTR.y);
        ctx.lineTo(pBR.x, pBR.y);
        ctx.stroke();
    }

    if (lightFromS) {
        ctx.beginPath();
        ctx.moveTo(pBL.x, pBL.y);
        ctx.lineTo(pBR.x, pBR.y);
        ctx.stroke();
    }

    if (lightFromW) {
        ctx.beginPath();
        ctx.moveTo(pTL.x, pTL.y);
        ctx.lineTo(pBL.x, pBL.y);
        ctx.stroke();
    }

    // Shadow edges: opposite of the light edges.
    ctx.strokeStyle = `rgba(0,0,0,${bevelOpacity})`;

    if (!lightFromN) {
        ctx.beginPath();
        ctx.moveTo(pTL.x, pTL.y);
        ctx.lineTo(pTR.x, pTR.y);
        ctx.stroke();
    }

    if (!lightFromE) {
        ctx.beginPath();
        ctx.moveTo(pTR.x, pTR.y);
        ctx.lineTo(pBR.x, pBR.y);
        ctx.stroke();
    }

    if (!lightFromS) {
        ctx.beginPath();
        ctx.moveTo(pBL.x, pBL.y);
        ctx.lineTo(pBR.x, pBR.y);
        ctx.stroke();
    }

    if (!lightFromW) {
        ctx.beginPath();
        ctx.moveTo(pTL.x, pTL.y);
        ctx.lineTo(pBL.x, pBL.y);
        ctx.stroke();
    }

    ctx.restore();
        }

        function drawBrickCell(x, y, w, h, hash, side) {
            const r = hashRand(hash);

            if (r < 0.10) {
                // One large brick
                drawBrick(ctx, x, y, w, h, hash + 1, side);
            } else if (r < 0.50) {
                // Two side-by-side bricks
                drawBrick(ctx, x, y, w / 2, h, hash + 2, side);
                drawBrick(ctx, x + w / 2, y, w / 2, h, hash + 3, side);
            } else if (r < 0.75) {
                // Two stacked bricks
                drawBrick(ctx, x, y, w, h / 2, hash + 4, side);
                drawBrick(ctx, x, y + h / 2, w, h / 2, hash + 5, side);
            } else {
                // Three-brick mixed pattern
                if (hashRand(hash + 6) < 0.5) {
                    drawBrick(ctx, x, y, w / 2, h / 2, hash + 7, side);
                    drawBrick(ctx, x + w / 2, y, w / 2, h / 2, hash + 8, side);
                    drawBrick(ctx, x, y + h / 2, w, h / 2, hash + 9, side);
                } else {
                    drawBrick(ctx, x, y, w, h / 2, hash + 10, side);
                    drawBrick(ctx, x, y + h / 2, w / 2, h / 2, hash + 11,side);
                    drawBrick(ctx, x + w / 2, y + h / 2, w / 2, h / 2, hash + 12,side);
                }
            }
        }

        function drawHorizontalRun(x1, x2, y, hashBase, side) {
            const cell = brickDepth;
            let x = x1;

            while (x < x2) {
                const w = Math.min(cell, x2 - x);

                drawBrickCell(
                    x,
                    y - brickDepth / 2,
                    w,
                    brickDepth,
                    tileHash(Math.floor(x), Math.floor(y), hashBase),
                    side
                );

                x += cell;
            }
        }

        function drawVerticalRun(x, y1, y2, hashBase, side) {
            const cell = brickDepth;
            let y = y1;

            while (y < y2) {
                const h = Math.min(cell, y2 - y);

                drawBrickCell(
                    x - brickDepth / 2,
                    y,
                    brickDepth,
                    h,
                    tileHash(Math.floor(x), Math.floor(y), hashBase),
                    side
                );

                y += cell;
            }
        }

        // TOP edges
        for (let y = 1; y <= G.Gmapy; y++) {
            let runStart = null;

            for (let x = 1; x <= G.Gmapx + 1; x++) {
                const exposed =
                    x <= G.Gmapx &&
                    isFloorTile(G, map, x, y) &&
                    isWallTile(G, map, x, y - 1);

                if (exposed && runStart === null) runStart = x;

                if ((!exposed || x === G.Gmapx + 1) && runStart !== null) {
                    drawHorizontalRun(runStart * ts, x * ts, y * ts, tileHash(runStart, y, seed), "top");
                    runStart = null;
                }
            }
        }

        // BOTTOM edges
        for (let y = 1; y <= G.Gmapy; y++) {
            let runStart = null;

            for (let x = 1; x <= G.Gmapx + 1; x++) {
                const exposed =
                    x <= G.Gmapx &&
                    isFloorTile(G, map, x, y) &&
                    isWallTile(G, map, x, y + 1);

                if (exposed && runStart === null) runStart = x;

                if ((!exposed || x === G.Gmapx + 1) && runStart !== null) {
                    drawHorizontalRun(runStart * ts, x * ts, (y + 1) * ts, tileHash(runStart, y + 99, seed), "bottom");
                    runStart = null;
                }
            }
        }

        // LEFT edges
        for (let x = 1; x <= G.Gmapx; x++) {
            let runStart = null;

            for (let y = 1; y <= G.Gmapy + 1; y++) {
                const exposed =
                    y <= G.Gmapy &&
                    isFloorTile(G, map, x, y) &&
                    isWallTile(G, map, x - 1, y);

                if (exposed && runStart === null) runStart = y;

                if ((!exposed || y === G.Gmapy + 1) && runStart !== null) {
                    drawVerticalRun(x * ts, runStart * ts, y * ts, tileHash(x, runStart + 199, seed), "left");
                    runStart = null;
                }
            }
        }

        // RIGHT edges
        for (let x = 1; x <= G.Gmapx; x++) {
            let runStart = null;

            for (let y = 1; y <= G.Gmapy + 1; y++) {
                const exposed =
                    y <= G.Gmapy &&
                    isFloorTile(G, map, x, y) &&
                    isWallTile(G, map, x + 1, y);

                if (exposed && runStart === null) runStart = y;

                if ((!exposed || y === G.Gmapy + 1) && runStart !== null) {
                    drawVerticalRun((x + 1) * ts, runStart * ts, y * ts, tileHash(x + 299, runStart, seed), "right");
                    runStart = null;
                }
            }
        }
    }

/* =========================================================
VTT PLAIN FLOOR TILE
---------------------------------------------------------
Used when "Textured floor tiles" is unticked.
Gives a simple mid-grey floor, lighter than the walls.
========================================================= */

    function drawVttPlainFloor(ctx, nx, ny, ts, isFlood = false, showGrid = true, floorScale = 0.5) {
    if (isFlood) {
        ctx.fillStyle = "#243f52";
        ctx.fillRect(nx, ny, ts, ts);
        drawWaterWaves(ctx, nx, ny, ts, "rgba(210,235,255,0.35)");
        return;
    }

    ctx.fillStyle = "#6f6b60";
    ctx.fillRect(nx, ny, ts, ts);

    // Very subtle top-left light / bottom-right shade.
    if (showGrid) {
        const grad = ctx.createLinearGradient(nx, ny, nx + ts, ny + ts);
        grad.addColorStop(0, "rgba(255,255,255,0.06)");
        grad.addColorStop(1, "rgba(0,0,0,0.10)");

        ctx.fillStyle = grad;
        ctx.fillRect(nx, ny, ts, ts);
        }

    if (showGrid) {
        const divisions = Math.max(1, Math.round(1 / floorScale));

        ctx.strokeStyle = "rgba(0,0,0,0.18)";
        ctx.lineWidth = Math.max(1, ts * 0.018);

        for (let i = 1; i < divisions; i++) {
            const p = i / divisions;

            ctx.beginPath();
            ctx.moveTo(nx + ts * p, ny);
            ctx.lineTo(nx + ts * p, ny + ts);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(nx, ny + ts * p);
            ctx.lineTo(nx + ts, ny + ts * p);
            ctx.stroke();
        }
    }
}

/* =========================================================
   VTT ORGANIC COBBLESTONE FLOOR TILE
========================================================= */

function drawVttCobbleFloor(ctx, nx, ny, ts, x, y, seed, isFlood = false, floorScale = 0.5) {
    // TWEAK: Water tile colour and wave opacity.
    const vttWaterBaseColor = "#243f52";
    const vttWaterWaveOpacity = 0.35;

    // TWEAK: Cobble count per tile.
    const cobbleCols = Math.max(2, Math.round(2.5 / floorScale));
    const cobbleRows = cobbleCols;

    // TWEAK: Cobble size within each mini-cell.
    // Higher values = less grout.
    const cobbleRadiusBase = 0.56;
    const cobbleRadiusVariation = 0.16;

    // TWEAK: Cobble centre jitter.
    const cobbleCentreJitterRatio = 0.55;

    // TWEAK: Cobble edge wobble.
    const cobbleWobbleBase = 0.82;
    const cobbleWobbleVariation = 0.34;

    // TWEAK: Cobble shape complexity.
    const cobbleVerts = 8;

    // TWEAK: Mortar colour and line width.
    const cobbleMortarBaseColor = "#2b2923";
    const cobbleMortarStrokeOpacity = 0.75;
    const cobbleMortarMinWidth = 1;
    const cobbleMortarWidthRatio = 0.018;

    // TWEAK: Cobble colour variation.
    const cobbleBaseShade = 78;
    const cobbleShadeVariation = 22;
    const cobbleWarmVariation = 8;

    // TWEAK: Cobble highlight and speckles.
    const cobbleHighlightOpacity = 0.18;
    const cobbleSpeckCount = 5;
    const cobbleSpeckSizeRatio = 0.018;

    // TWEAK: Whole-tile cobble shading.
    const cobbleTileTopLightOpacity = 0.03;
    const cobbleTileBottomShadowOpacity = 0.18;

    const h0 = tileHash(x, y, seed);

    if (isFlood) {
        ctx.fillStyle = vttWaterBaseColor;
        ctx.fillRect(nx, ny, ts, ts);
        drawWaterWaves(ctx, nx, ny, ts, `rgba(210,235,255,${vttWaterWaveOpacity})`);
        return;
    }

    ctx.save();

    ctx.beginPath();
    ctx.rect(nx, ny, ts, ts);
    ctx.clip();

    ctx.fillStyle = cobbleMortarBaseColor;
    ctx.fillRect(nx, ny, ts, ts);

    const cellW = ts / cobbleCols;
    const cellH = ts / cobbleRows;

    for (let gy = -1; gy <= cobbleRows; gy++) {
        for (let gx = -1; gx <= cobbleCols; gx++) {
            const h = tileHash(x * 101 + gx * 17, y * 131 + gy * 23, h0);

            const cx =
                nx +
                gx * cellW +
                cellW * 0.5 +
                (hashRand(h + 1) - 0.5) * cellW * cobbleCentreJitterRatio;

            const cy =
                ny +
                gy * cellH +
                cellH * 0.5 +
                (hashRand(h + 2) - 0.5) * cellH * cobbleCentreJitterRatio;

            const rx = cellW * (cobbleRadiusBase + hashRand(h + 3) * cobbleRadiusVariation);
            const ry = cellH * (cobbleRadiusBase + hashRand(h + 4) * cobbleRadiusVariation);

            const points = [];

            for (let i = 0; i < cobbleVerts; i++) {
                const a = (Math.PI * 2 * i) / cobbleVerts;
                const wobble = cobbleWobbleBase + hashRand(h + 20 + i) * cobbleWobbleVariation;

                points.push({
                    x: cx + Math.cos(a) * rx * wobble,
                    y: cy + Math.sin(a) * ry * wobble
                });
            }

            const base = cobbleBaseShade + Math.floor(hashRand(h + 40) * cobbleShadeVariation);
            const warm = Math.floor(hashRand(h + 41) * cobbleWarmVariation);

            const topColor = `rgb(${base + warm + 18},${base + warm + 17},${base + 12})`;
            const bottomColor = `rgb(${base - 18},${base - 20},${base - 23})`;

            const grad = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
            grad.addColorStop(0, topColor);
            grad.addColorStop(1, bottomColor);

            ctx.beginPath();

            for (let i = 0; i < points.length; i++) {
                const p0 = points[(i - 1 + points.length) % points.length];
                const p1 = points[i];
                const p2 = points[(i + 1) % points.length];

                const mx1 = (p0.x + p1.x) / 2;
                const my1 = (p0.y + p1.y) / 2;
                const mx2 = (p1.x + p2.x) / 2;
                const my2 = (p1.y + p2.y) / 2;

                if (i === 0) ctx.moveTo(mx1, my1);

                ctx.quadraticCurveTo(p1.x, p1.y, mx2, my2);
            }

            ctx.closePath();

            ctx.fillStyle = grad;
            ctx.fill();

            ctx.strokeStyle = `rgba(10,9,8,${cobbleMortarStrokeOpacity})`;
            ctx.lineWidth = Math.max(cobbleMortarMinWidth, ts * cobbleMortarWidthRatio);
            ctx.stroke();

            ctx.save();
            ctx.clip();

            ctx.strokeStyle = `rgba(255,255,230,${cobbleHighlightOpacity})`;
            ctx.lineWidth = Math.max(1, ts * 0.018);
            ctx.beginPath();
            ctx.moveTo(cx - rx * 0.55, cy - ry * 0.35);
            ctx.lineTo(cx + rx * 0.15, cy - ry * 0.48);
            ctx.stroke();

            for (let s = 0; s < cobbleSpeckCount; s++) {
                const sx = cx + (hashRand(h + 60 + s) - 0.5) * rx * 1.4;
                const sy = cy + (hashRand(h + 80 + s) - 0.5) * ry * 1.4;

                ctx.fillStyle =
                    hashRand(h + 100 + s) > 0.5
                        ? "rgba(255,255,240,0.16)"
                        : "rgba(0,0,0,0.14)";

                const speckSize = Math.max(1, ts * cobbleSpeckSizeRatio);
                ctx.fillRect(sx, sy, speckSize, speckSize);
            }

            ctx.restore();
        }
    }

    const shadow = ctx.createLinearGradient(nx, ny, nx + ts, ny + ts);
    shadow.addColorStop(0, `rgba(255,255,255,${cobbleTileTopLightOpacity})`);
    shadow.addColorStop(1, `rgba(0,0,0,${cobbleTileBottomShadowOpacity})`);

    ctx.fillStyle = shadow;
    ctx.fillRect(nx, ny, ts, ts);

    ctx.restore();
}

    /* ========================================================
       VTT Cracked  FLOOR TILE
    ========================================================= */

    function drawVttCrackedFloor(ctx, nx, ny, ts, x, y, seed, isFlood = false, showGrid = true, floorScale = 0.5) {
        if (isFlood) {
            ctx.fillStyle = "#243f52";
            ctx.fillRect(nx, ny, ts, ts);
            drawWaterWaves(ctx, nx, ny, ts, "rgba(210,235,255,0.35)");
            return;
        }

        const h = tileHash(x, y, seed);

        const base = 100 + Math.floor(hashRand(h + 1) * 18);

        ctx.fillStyle = `rgb(${base},${base},${base - 5})`;
        ctx.fillRect(nx, ny, ts, ts);

        // Subtle stone variation.
        ctx.fillStyle = `rgba(255,255,255,${0.04 + hashRand(h + 2) * 0.04})`;
        ctx.fillRect(nx + ts * 0.08, ny + ts * 0.08, ts * 0.55, ts * 0.18);

        ctx.fillStyle = `rgba(0,0,0,${0.05 + hashRand(h + 3) * 0.06})`;
        ctx.fillRect(nx + ts * 0.18, ny + ts * 0.66, ts * 0.62, ts * 0.18);

        ctx.save();
        ctx.beginPath();
        ctx.rect(nx, ny, ts, ts);
        ctx.clip();

        // Cracks: fewer and edge-led, like the print version.
        const r = hashRand(h + 20);

        ctx.strokeStyle = "rgba(20,20,20,0.65)";
        ctx.lineWidth = Math.max(1.4, ts * 0.026);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        function edgePoint(edge, hh) {
            if (edge === 0) return { x: nx + hashRand(hh + 1) * ts, y: ny };
            if (edge === 1) return { x: nx + ts, y: ny + hashRand(hh + 2) * ts };
            if (edge === 2) return { x: nx + hashRand(hh + 3) * ts, y: ny + ts };
            return { x: nx, y: ny + hashRand(hh + 4) * ts };
        }

        if (r > 0.55) {
            const startEdge = Math.floor(hashRand(h + 21) * 4);
            const start = edgePoint(startEdge, h + 30);

            let px = start.x;
            let py = start.y;

            let angle = (startEdge * Math.PI / 2) + Math.PI + (hashRand(h + 31) - 0.5) * 1.2;
            const length = r > 0.85 ? ts * 0.72 : ts * 0.36;
            const segments = r > 0.85 ? 4 : 2;

            ctx.beginPath();
            ctx.moveTo(px, py);

            for (let i = 0; i < segments; i++) {
                px += Math.cos(angle) * length / segments;
                py += Math.sin(angle) * length / segments;

                angle += (hashRand(h + 40 + i) - 0.5) * 0.7;

                px = Math.max(nx + ts * 0.08, Math.min(nx + ts * 0.92, px));
                py = Math.max(ny + ts * 0.08, Math.min(ny + ts * 0.92, py));

                ctx.lineTo(px, py);
            }

            ctx.stroke();

            if (r > 0.97) {
                const branchAngle = angle + (hashRand(h + 80) < 0.5 ? 1 : -1) * 1.1;

                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(
                    px + Math.cos(branchAngle) * ts * 0.20,
                    py + Math.sin(branchAngle) * ts * 0.20
                );
                ctx.stroke();
            }
        }

        // Dirt clusters, not spray.
        const clusterCount = Math.max(1, Math.round(1 / floorScale));

        ctx.fillStyle = "rgba(20,20,20,0.42)";

        for (let c = 0; c < clusterCount; c++) {
            const ch = h + 200 + c * 47;

            const cx = nx + ts * (0.18 + hashRand(ch + 1) * 0.64);
            const cy = ny + ts * (0.18 + hashRand(ch + 2) * 0.64);
            const dotCount = 2 + Math.floor(hashRand(ch + 3) * 4);
            const angle = hashRand(ch + 4) * Math.PI * 2;
            const spacing = ts * (0.04 + floorScale * 0.07);

            for (let i = 0; i < dotCount; i++) {
                const along = (i - dotCount / 2) * spacing;
                const scatter = (hashRand(ch + 10 + i) - 0.5) * ts * 0.07;

                const dx =
                    cx +
                    Math.cos(angle) * along +
                    Math.cos(angle + Math.PI / 2) * scatter;

                const dy =
                    cy +
                    Math.sin(angle) * along +
                    Math.sin(angle + Math.PI / 2) * scatter;

                const radius = Math.max(1, ts * (0.010 + hashRand(ch + 30 + i) * 0.012));

                ctx.beginPath();
                ctx.arc(dx, dy, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();

        if (showGrid) {
            const divisions = Math.max(1, Math.round(1 / floorScale));

            ctx.strokeStyle = "rgba(0,0,0,0.22)";
            ctx.lineWidth = Math.max(1, ts * 0.018);

            for (let i = 1; i < divisions; i++) {
                const p = i / divisions;

                ctx.beginPath();
                ctx.moveTo(nx + ts * p, ny);
                ctx.lineTo(nx + ts * p, ny + ts);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(nx, ny + ts * p);
                ctx.lineTo(nx + ts, ny + ts * p);
                ctx.stroke();
            }
        }
    }

    /* =========================================================
       VTT ORGANIC STONE FLOOR World scale
    ========================================================= */
    function drawVttWorldStoneFloor(ctx, G, map, ts, seed, shadowDirections, optionsFloorScale = 0.5) {
        const cellSize = ts * optionsFloorScale;
        const jitter = 0.38;
        const neighbourRange = 2;

        const groutColor = "#2b2923";
        const lineWidth = Math.max(1, ts * 0.018);

        const lightOpacity = 0.22;
        const shadowOpacity = 0.24;

        function stonePoint(gx, gy) {
            const h = tileHash(gx, gy, seed);
            return {
                x: (gx + 0.5 + (hashRand(h + 1) - 0.5) * jitter) * cellSize,
                y: (gy + 0.5 + (hashRand(h + 2) - 0.5) * jitter) * cellSize,
                h
            };
        }

        function clipPolygon(poly, a, b) {
            const out = [];

            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dx = b.x - a.x;
            const dy = b.y - a.y;

            function inside(p) {
                return (p.x - mx) * dx + (p.y - my) * dy <= 0;
            }

            function intersect(p1, p2) {
                const v1 = (p1.x - mx) * dx + (p1.y - my) * dy;
                const v2 = (p2.x - mx) * dx + (p2.y - my) * dy;
                const t = v1 / (v1 - v2);

                return {
                    x: p1.x + (p2.x - p1.x) * t,
                    y: p1.y + (p2.y - p1.y) * t
                };
            }

            for (let i = 0; i < poly.length; i++) {
                const cur = poly[i];
                const prev = poly[(i + poly.length - 1) % poly.length];

                const curIn = inside(cur);
                const prevIn = inside(prev);

                if (curIn && !prevIn) out.push(intersect(prev, cur));
                if (curIn) out.push(cur);
                if (!curIn && prevIn) out.push(intersect(prev, cur));
            }

            return out;
        }

        // Convert shadow checkboxes into approximate light direction.
        const lx = (shadowDirections.e ? -1 : 0) + (shadowDirections.w ? 1 : 0);
        const ly = (shadowDirections.s ? -1 : 0) + (shadowDirections.n ? 1 : 0);

        ctx.save();

        // Clip to all floor tiles as one continuous floor area.
        ctx.beginPath();

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (isFloorTile(G, map, x, y)) {
                    ctx.rect(x * ts, y * ts, ts, ts);
                }
            }
        }

        ctx.clip();

        // Grout base under all stones.
        ctx.fillStyle = groutColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const maxGX = Math.ceil((G.Gmapx + 2) * ts / cellSize) + 2;
        const maxGY = Math.ceil((G.Gmapy + 2) * ts / cellSize) + 2;

        const polys = [];

        for (let gy = -2; gy <= maxGY; gy++) {
            for (let gx = -2; gx <= maxGX; gx++) {
                const a = stonePoint(gx, gy);

                let poly = [
                    { x: a.x - cellSize * 2, y: a.y - cellSize * 2 },
                    { x: a.x + cellSize * 2, y: a.y - cellSize * 2 },
                    { x: a.x + cellSize * 2, y: a.y + cellSize * 2 },
                    { x: a.x - cellSize * 2, y: a.y + cellSize * 2 }
                ];

                for (let oy = -neighbourRange; oy <= neighbourRange; oy++) {
                    for (let ox = -neighbourRange; ox <= neighbourRange; ox++) {
                        if (ox === 0 && oy === 0) continue;

                        const b = stonePoint(gx + ox, gy + oy);
                        poly = clipPolygon(poly, a, b);

                        if (poly.length < 3) break;
                    }

                    if (poly.length < 3) break;
                }

                if (poly.length >= 3) {
                    polys.push({ poly, h: a.h, cx: a.x, cy: a.y });
                }
            }
        }

        for (const item of polys) {
            const { poly, h, cx, cy } = item;

            const base = 78 + Math.floor(hashRand(h + 50) * 28);
            const warm = Math.floor(hashRand(h + 51) * 8);

            const lightGrey = base + warm + 18;
            const darkGrey = base - 18;

            const grad = ctx.createLinearGradient(
                cx - lx * cellSize,
                cy - ly * cellSize,
                cx + lx * cellSize,
                cy + ly * cellSize
            );

            grad.addColorStop(0, `rgb(${lightGrey},${lightGrey},${lightGrey - 4})`);
            grad.addColorStop(1, `rgb(${darkGrey},${darkGrey},${darkGrey - 6})`);

            ctx.beginPath();
            ctx.moveTo(poly[0].x, poly[0].y);

            for (let i = 1; i < poly.length; i++) {
                ctx.lineTo(poly[i].x, poly[i].y);
            }

            ctx.closePath();

            ctx.fillStyle = grad;
            ctx.fill();

            // Subtle stone outline / grout edge.
            ctx.strokeStyle = "rgba(10,9,8,0.85)";
            ctx.lineWidth = lineWidth;
            ctx.lineJoin = "round";
            ctx.stroke();

            // Tiny bevel hint: highlight/shadow edges according to light.
            ctx.save();
            ctx.clip();

            ctx.lineWidth = Math.max(1, ts * 0.012);
            ctx.lineCap = "round";

            for (let i = 0; i < poly.length; i++) {
                const p1 = poly[i];
                const p2 = poly[(i + 1) % poly.length];

                const ex = p2.x - p1.x;
                const ey = p2.y - p1.y;

                const nxEdge = -ey;
                const nyEdge = ex;

                const lit = nxEdge * lx + nyEdge * ly > 0;

                ctx.strokeStyle = lit
                    ? `rgba(255,255,255,${lightOpacity})`
                    : `rgba(0,0,0,${shadowOpacity})`;

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }

            ctx.restore();
        }

        ctx.restore();
    }

/* =========================================================
   VTT DIRECTIONAL WALL SHADOWS
   ---------------------------------------------------------
   Edge shadows are drawn first.
   Corner shadows are only drawn when no adjacent edge shadow
   already covers that corner.
========================================================= */

function drawVttDirectionalWallShadows(ctx, G, map, ts, dirs) {
    // TWEAK: Edge shadow strength and reach.
    const vttWallShadowOpacity = 0.54;
    const vttWallShadowReachRatio = 0.42;

    for (let y = 1; y <= G.Gmapy; y++) {
        for (let x = 1; x <= G.Gmapx; x++) {
            if (!isFloorTile(G, map, x, y)) continue;

            const nx = x * ts;
            const ny = y * ts;

            const wallN = isWallTile(G, map, x, y - 1);
            const wallE = isWallTile(G, map, x + 1, y);
            const wallS = isWallTile(G, map, x, y + 1);
            const wallW = isWallTile(G, map, x - 1, y);

            const wallNW = isWallTile(G, map, x - 1, y - 1);
            const wallNE = isWallTile(G, map, x + 1, y - 1);
            const wallSE = isWallTile(G, map, x + 1, y + 1);
            const wallSW = isWallTile(G, map, x - 1, y + 1);

            const shadowN = dirs.n && wallN;
            const shadowE = dirs.e && wallE;
            const shadowS = dirs.s && wallS;
            const shadowW = dirs.w && wallW;

            ctx.save();

            // ---------- Edge shadows first ----------

            if (shadowN) {
                const grad = ctx.createLinearGradient(nx, ny, nx, ny + ts * vttWallShadowReachRatio);
                grad.addColorStop(0, `rgba(0,0,0,${vttWallShadowOpacity})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = grad;
                ctx.fillRect(nx, ny, ts, ts * vttWallShadowReachRatio);
            }

            if (shadowE) {
                const grad = ctx.createLinearGradient(nx + ts, ny, nx + ts - ts * vttWallShadowReachRatio, ny);
                grad.addColorStop(0, `rgba(0,0,0,${vttWallShadowOpacity})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = grad;
                ctx.fillRect(
                    nx + ts - ts * vttWallShadowReachRatio,
                    ny,
                    ts * vttWallShadowReachRatio,
                    ts
                );
            }

            if (shadowS) {
                const grad = ctx.createLinearGradient(nx, ny + ts, nx, ny + ts - ts * vttWallShadowReachRatio);
                grad.addColorStop(0, `rgba(0,0,0,${vttWallShadowOpacity})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = grad;
                ctx.fillRect(
                    nx,
                    ny + ts - ts * vttWallShadowReachRatio,
                    ts,
                    ts * vttWallShadowReachRatio
                );
            }

            if (shadowW) {
                const grad = ctx.createLinearGradient(nx, ny, nx + ts * vttWallShadowReachRatio, ny);
                grad.addColorStop(0, `rgba(0,0,0,${vttWallShadowOpacity})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = grad;
                ctx.fillRect(nx, ny, ts * vttWallShadowReachRatio, ts);
            }

            // ---------- Corner shadows second ----------
            // Only draw a corner shadow if no adjacent edge shadow
            // already covers that corner.

            // NW corner:
            // relevant if N or W is enabled
            if (dirs.n && dirs.w && wallNW && !wallN && !wallW) {
                const grad = ctx.createRadialGradient(nx, ny, 0, nx, ny, ts * vttWallShadowReachRatio);
                grad.addColorStop(0, `rgba(0,0,0,${vttWallShadowOpacity})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = grad;
                ctx.fillRect(nx, ny, ts * vttWallShadowReachRatio, ts * vttWallShadowReachRatio);
            }

            // NE corner:
            // relevant if N or E is enabled
            if (dirs.n && dirs.e && wallNE && !wallN && !wallE) {
                const grad = ctx.createRadialGradient(nx + ts, ny, 0, nx + ts, ny, ts * vttWallShadowReachRatio);
                grad.addColorStop(0, `rgba(0,0,0,${vttWallShadowOpacity})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = grad;
                ctx.fillRect(
                    nx + ts * (1 - vttWallShadowReachRatio),
                    ny,
                    ts * vttWallShadowReachRatio,
                    ts * vttWallShadowReachRatio
                );
            }

            // SE corner:
            // relevant if S or E is enabled
            if (dirs.s && dirs.e && wallSE && !wallS && !wallE) {
                const grad = ctx.createRadialGradient(nx + ts, ny + ts, 0, nx + ts, ny + ts, ts * vttWallShadowReachRatio);
                grad.addColorStop(0, `rgba(0,0,0,${vttWallShadowOpacity})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = grad;
                ctx.fillRect(
                    nx + ts * (1 - vttWallShadowReachRatio),
                    ny + ts * (1 - vttWallShadowReachRatio),
                    ts * vttWallShadowReachRatio,
                    ts * vttWallShadowReachRatio
                );
            }

            // SW corner:
            // relevant if S or W is enabled
            if (dirs.s && dirs.w && wallSW && !wallS && !wallW) {
                const grad = ctx.createRadialGradient(nx, ny + ts, 0, nx, ny + ts, ts * vttWallShadowReachRatio);
                grad.addColorStop(0, `rgba(0,0,0,${vttWallShadowOpacity})`);
                grad.addColorStop(1, "rgba(0,0,0,0)");

                ctx.fillStyle = grad;
                ctx.fillRect(
                    nx,
                    ny + ts * (1 - vttWallShadowReachRatio),
                    ts * vttWallShadowReachRatio,
                    ts * vttWallShadowReachRatio
                );
            }

            ctx.restore();
        }
    }
}

    /* =========================================================
       default VTT wall tile "plain"
    ========================================================= */

    function drawVttPlainWallTile(ctx, nx, ny, ts) {
        ctx.fillStyle = "#252525";
        ctx.fillRect(nx, ny, ts, ts);
    }

    /* =========================================================
        vtt wall tile "crosshatch"
    ========================================================= */
    function drawVttCrosshatchWallTile(ctx, nx, ny, ts, x, y, seed) {
        const h = tileHash(x, y, seed);

        ctx.fillStyle = "#2b2b2b";
        ctx.fillRect(nx, ny, ts, ts);

        ctx.strokeStyle = "rgba(0,0,0,0.45)";
        ctx.lineWidth = Math.max(1, ts * 0.018);

        const spacing = Math.max(6, ts * 0.18);

        for (let i = -ts; i < ts * 2; i += spacing) {
            ctx.beginPath();
            ctx.moveTo(nx + i, ny + ts);
            ctx.lineTo(nx + i + ts, ny);
            ctx.stroke();
        }

        if (hashRand(h + 1) > 0.5) {
            ctx.strokeStyle = "rgba(255,255,255,0.06)";

            for (let i = -ts; i < ts * 2; i += spacing * 1.4) {
                ctx.beginPath();
                ctx.moveTo(nx + i, ny);
                ctx.lineTo(nx + i + ts, ny + ts);
                ctx.stroke();
            }
        }
    }

    /* =========================================================
       Draw VTT wall edge lines
    ========================================================= */

    function drawVttDarkWallLines(ctx, G, map, ts) {
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.lineWidth = Math.max(3, ts * 0.08);
        ctx.lineCap = "square";

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                ctx.beginPath();

                if (isWallTile(G, map, x, y - 1)) {
                    ctx.moveTo(nx, ny);
                    ctx.lineTo(nx + ts, ny);
                }

                if (isWallTile(G, map, x + 1, y)) {
                    ctx.moveTo(nx + ts, ny);
                    ctx.lineTo(nx + ts, ny + ts);
                }

                if (isWallTile(G, map, x, y + 1)) {
                    ctx.moveTo(nx, ny + ts);
                    ctx.lineTo(nx + ts, ny + ts);
                }

                if (isWallTile(G, map, x - 1, y)) {
                    ctx.moveTo(nx, ny);
                    ctx.lineTo(nx, ny + ts);
                }

                ctx.stroke();
            }
        }
    }

/* =========================================================
   VTT RENDERER
========================================================= */

function drawVttMap(ctx, G, map, tileSize, options) {
    // TWEAK: Grid line style.
    const vttGridOpacity = 0.22;
    const vttGridLineWidthRatio = 0.025;

    const ts = tileSize;
    const seed = G._seedUsed || 0;

    // Wall/rock background.
    for (let y = 0; y <= G.Gmapy + 1; y++) {
        for (let x = 0; x <= G.Gmapx + 1; x++) {
            if (isWallTile(G, map, x, y)) {
                const nx = x * ts;
                const ny = y * ts;

                if (options.wallTileStyle === "plain") {
                    drawVttPlainWallTile(ctx, nx, ny, ts);
                } else if (options.wallTileStyle === "crosshatch") {
                    drawVttCrosshatchWallTile(ctx, nx, ny, ts, x, y, seed);
                } else {
                    drawVttWallTile(ctx, nx, ny, ts, x, y, seed);
                }
            }
        }
    }

    // Floors and water.
    for (let y = 0; y <= G.Gmapy + 1; y++) {
        for (let x = 0; x <= G.Gmapx + 1; x++) {
            const b = map[x][y];
            if (!b || b.flr <= 0) continue;

            const nx = x * ts;
            const ny = y * ts;
            const showAsFlooded = options.showWater && b.flood;

            if (options.floorStyle === "stone") {
                drawVttPlainFloor(ctx, nx, ny, ts, showAsFlooded, false, options.floorScale);
            } else if (options.floorStyle === "cracked") {
                drawVttCrackedFloor(ctx, nx, ny, ts, x, y, seed, showAsFlooded, options.showGrid, options.floorScale);
            } else if (options.floorStyle === "plain") {
                drawVttPlainFloor(ctx, nx, ny, ts, showAsFlooded, options.showGrid, options.floorScale);
            } else {
                drawVttCobbleFloor(ctx, nx, ny, ts, x, y, seed, showAsFlooded, options.floorScale);
            }

            if (options.showGrid) {
                ctx.strokeStyle = `rgba(0,0,0,${vttGridOpacity})`;
                ctx.lineWidth = Math.max(1, ts * vttGridLineWidthRatio);
                ctx.strokeRect(nx + 0.5, ny + 0.5, ts - 1, ts - 1);
            }
        }
    }

    // Apply world-scale stone floor over everything if that option is selected.
    if (options.floorStyle === "stone") {
        drawVttWorldStoneFloor(ctx, G, map, ts, seed, options.shadowDirections, options.floorScale);
    }

    // Soft shadows over the cobble floor.
    drawVttDirectionalWallShadows(ctx, G, map, ts, options.shadowDirections);

    // Exposed brick wall edges.
    if (options.wallEdgeStyle === "lines") {
        drawVttDarkWallLines(ctx, G, map, ts);
    } else {
        drawVttBrickWallRuns(ctx, G, map, ts, options.shadowDirections);
    }

    if (options.showDoors) {
        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                drawDoorAndKey(ctx, G, map, x, y, ts, "vtt");
            }
        }
    }

    if (options.showStartExit) {
        drawStartExit(ctx, G, map, ts, "vtt");
    }
    }
    /* =========================================================
       EXPOSE RENDERER TO OTHER FILES
    ========================================================= */
    window.DigyrinthVttRenderer = {
        drawVttMap
    };

})();