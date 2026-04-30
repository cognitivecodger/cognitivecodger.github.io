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
   VTT BEVELLED STONE WALL EDGE
   ---------------------------------------------------------
   Kept for compatibility with the current VTT wall system.
========================================================= */

function drawVttBevelWallEdge(ctx, nx, ny, ts, side, bevelStart, bevelEnd, seed = 0) {
    // TWEAK: VTT wall lip thickness and bevel offset.
    const vttWallThickMin = 6;
    const vttWallThickRatio = 0.16;
    const vttWallOffsetMin = 3;
    const vttWallOffsetRatio = 0.075;
    const vttWallInsetMin = 4;
    const vttWallInsetRatio = 0.10;

    const thick = Math.max(vttWallThickMin, ts * vttWallThickRatio);
    const offset = Math.max(vttWallOffsetMin, ts * vttWallOffsetRatio);
    const inset = Math.max(vttWallInsetMin, ts * vttWallInsetRatio);

    const startInset = bevelStart ? inset : 0;
    const endInset = bevelEnd ? inset : 0;

    const light = "rgba(205,200,175,0.90)";
    const mid = "rgba(92,88,76,0.98)";
    const dark = "rgba(8,7,6,0.98)";

    let x1, y1, x2, y2;
    let lx1, ly1, lx2, ly2;
    let dx1, dy1, dx2, dy2;

    if (side === "top") {
        x1 = nx + startInset;
        y1 = ny;
        x2 = nx + ts - endInset;
        y2 = ny;

        lx1 = x1; ly1 = ny - offset * 0.35;
        lx2 = x2; ly2 = ny - offset * 0.35;

        dx1 = x1; dy1 = ny + offset;
        dx2 = x2; dy2 = ny + offset;
    }

    if (side === "bottom") {
        x1 = nx + startInset;
        y1 = ny + ts;
        x2 = nx + ts - endInset;
        y2 = ny + ts;

        lx1 = x1; ly1 = ny + ts - offset;
        lx2 = x2; ly2 = ny + ts - offset;

        dx1 = x1; dy1 = ny + ts + offset * 0.35;
        dx2 = x2; dy2 = ny + ts + offset * 0.35;
    }

    if (side === "left") {
        x1 = nx;
        y1 = ny + startInset;
        x2 = nx;
        y2 = ny + ts - endInset;

        lx1 = nx - offset * 0.35; ly1 = y1;
        lx2 = nx - offset * 0.35; ly2 = y2;

        dx1 = nx + offset; dy1 = y1;
        dx2 = nx + offset; dy2 = y2;
    }

    if (side === "right") {
        x1 = nx + ts;
        y1 = ny + startInset;
        x2 = nx + ts;
        y2 = ny + ts - endInset;

        lx1 = nx + ts - offset; ly1 = y1;
        lx2 = nx + ts - offset; ly2 = y2;

        dx1 = nx + ts + offset * 0.35; dy1 = y1;
        dx2 = nx + ts + offset * 0.35; dy2 = y2;
    }

    ctx.save();
    ctx.lineCap = "square";

    ctx.lineWidth = thick;
    ctx.strokeStyle = mid;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.lineWidth = Math.max(2, ts * 0.04);

    ctx.strokeStyle = light;
    ctx.beginPath();
    ctx.moveTo(lx1, ly1);
    ctx.lineTo(lx2, ly2);
    ctx.stroke();

    ctx.strokeStyle = dark;
    ctx.beginPath();
    ctx.moveTo(dx1, dy1);
    ctx.lineTo(dx2, dy2);
    ctx.stroke();

    ctx.restore();
}

/* =========================================================
VTT PLAIN FLOOR TILE
---------------------------------------------------------
Used when "Textured floor tiles" is unticked.
Gives a simple mid-grey floor, lighter than the walls.
========================================================= */

function drawVttPlainFloor(ctx, nx, ny, ts, isFlood = false, showGrid = true) {
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
}

/* =========================================================
   VTT ORGANIC COBBLESTONE FLOOR TILE
========================================================= */

function drawVttCobbleFloor(ctx, nx, ny, ts, x, y, seed, isFlood = false) {
    // TWEAK: Water tile colour and wave opacity.
    const vttWaterBaseColor = "#243f52";
    const vttWaterWaveOpacity = 0.35;

    // TWEAK: Cobble count per tile.
    const cobbleCols = 5;
    const cobbleRows = 5;

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
                drawVttWallTile(ctx, x * ts, y * ts, ts, x, y, seed);
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

            if (options.texturedFloors) {
                drawVttCobbleFloor(ctx, nx, ny, ts, x, y, seed, b.flood);
            } else {
                drawVttPlainFloor(ctx, nx, ny, ts, b.flood, options.showGrid);
            }

            if (options.showGrid) {
                ctx.strokeStyle = `rgba(0,0,0,${vttGridOpacity})`;
                ctx.lineWidth = Math.max(1, ts * vttGridLineWidthRatio);
                ctx.strokeRect(nx + 0.5, ny + 0.5, ts - 1, ts - 1);
            }
        }
    }

    // Soft shadows over the cobble floor.
    drawVttDirectionalWallShadows(ctx, G, map, ts, options.shadowDirections);

    // Current VTT wall edges.
    // This is still the per-tile bevel system.
    for (let y = 1; y <= G.Gmapy; y++) {
        for (let x = 1; x <= G.Gmapx; x++) {
            if (!isFloorTile(G, map, x, y)) continue;

            const nx = x * ts;
            const ny = y * ts;

            const top = isWallTile(G, map, x, y - 1);
            const right = isWallTile(G, map, x + 1, y);
            const bottom = isWallTile(G, map, x, y + 1);
            const left = isWallTile(G, map, x - 1, y);

            if (top) {
                const continuesLeft = isFloorTile(G, map, x - 1, y) && isWallTile(G, map, x - 1, y - 1);
                const continuesRight = isFloorTile(G, map, x + 1, y) && isWallTile(G, map, x + 1, y - 1);

                drawVttBevelWallEdge(
                    ctx,
                    nx,
                    ny,
                    ts,
                    "top",
                    !continuesLeft,
                    !continuesRight,
                    tileHash(x, y, seed)
                );
            }

            if (bottom) {
                const continuesLeft = isFloorTile(G, map, x - 1, y) && isWallTile(G, map, x - 1, y + 1);
                const continuesRight = isFloorTile(G, map, x + 1, y) && isWallTile(G, map, x + 1, y + 1);

                drawVttBevelWallEdge(
                    ctx,
                    nx,
                    ny,
                    ts,
                    "bottom",
                    !continuesLeft,
                    !continuesRight,
                    tileHash(x, y + 11, seed)
                );
            }

            if (left) {
                const continuesUp = isFloorTile(G, map, x, y - 1) && isWallTile(G, map, x - 1, y - 1);
                const continuesDown = isFloorTile(G, map, x, y + 1) && isWallTile(G, map, x - 1, y + 1);

                drawVttBevelWallEdge(
                    ctx,
                    nx,
                    ny,
                    ts,
                    "left",
                    !continuesUp,
                    !continuesDown,
                    tileHash(x - 11, y, seed)
                );
            }

            if (right) {
                const continuesUp = isFloorTile(G, map, x, y - 1) && isWallTile(G, map, x + 1, y - 1);
                const continuesDown = isFloorTile(G, map, x, y + 1) && isWallTile(G, map, x + 1, y + 1);

                drawVttBevelWallEdge(
                    ctx,
                    nx,
                    ny,
                    ts,
                    "right",
                    !continuesUp,
                    !continuesDown,
                    tileHash(x + 11, y, seed)
                );
            }
        }
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