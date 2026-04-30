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
       ROUGH HAND-DRAWN LINE
    ========================================================= */

    function drawRoughLine(ctx, x1, y1, x2, y2, wobble = 1) {
        // TWEAK: More steps = smoother rough lines. Fewer = more jagged.
        const roughLineSteps = 4;

        ctx.beginPath();

        for (let i = 0; i <= roughLineSteps; i++) {
            const t = i / roughLineSteps;

            const x = x1 + (x2 - x1) * t + (Math.random() - 0.5) * wobble;
            const y = y1 + (y2 - y1) * t + (Math.random() - 0.5) * wobble;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();
    }


    /* =========================================================
       B/W WALL HATCH TEXTURE
    ========================================================= */

    function drawStoneHatch(ctx, nx, ny, ts, x, y, seed) {
        // TWEAK: Smaller zone divisor = larger hatch stamps.
        // Bigger zone divisor = smaller, denser hatch stamps.
        const hatchZoneDivisor = 2.5;

        // TWEAK: Larger values make longer hatch bundles.
        const hatchLengthBase = 0.52;
        const hatchLengthVariation = 0.28;

        // TWEAK: Number of parallel lines per hatch bundle.
        const hatchStrokeMin = 3;
        const hatchStrokeExtra = 3; // gives 3–5 strokes

        // TWEAK: Gap between parallel hatch strokes.
        const hatchStrokeGapRatio = 0.07;

        // TWEAK: Width of the pale backing patch around each hatch bundle.
        const hatchBackingExtra = 1.35;

        // TWEAK: Hatch stroke thickness.
        const hatchStrokeMinWidth = 1.5;
        const hatchStrokeWidthRatio = 0.032;

        // TWEAK: Jitter of stamp centre. Lower = more regular coverage.
        const hatchCentreJitterRatio = 0.25;

        // TWEAK: Jitter of individual stroke ends.
        const hatchEndJitterRatio = 0.025;

        // TWEAK: How far beyond the tile we stamp to avoid blank edges.
        const hatchLoopMin = -2;
        const hatchLoopMax = 5;

        ctx.save();

        ctx.beginPath();
        ctx.rect(nx, ny, ts, ts);
        ctx.clip();

        ctx.fillStyle = "#efefec";
        ctx.fillRect(nx, ny, ts, ts);

        let h = tileHash(x, y, seed);
        const zone = ts / hatchZoneDivisor;

        for (let gy = hatchLoopMin; gy <= hatchLoopMax; gy++) {
            for (let gx = hatchLoopMin; gx <= hatchLoopMax; gx++) {
                h = tileHash(x * 97 + gx * 31, y * 101 + gy * 37, h);

                const cx =
                    nx +
                    gx * zone +
                    zone * 0.5 +
                    (hashRand(h + 2) - 0.5) * zone * hatchCentreJitterRatio;

                const cy =
                    ny +
                    gy * zone +
                    zone * 0.5 +
                    (hashRand(h + 3) - 0.5) * zone * hatchCentreJitterRatio;

                const len = ts * (hatchLengthBase + hashRand(h + 4) * hatchLengthVariation);
                const strokeCount = hatchStrokeMin + Math.floor(hashRand(h + 5) * hatchStrokeExtra);
                const gap = ts * hatchStrokeGapRatio;
                const patchWidth = gap * (strokeCount + hatchBackingExtra);

                const directions = [
                    Math.PI * 0.06,
                    Math.PI * 0.18,
                    Math.PI * 0.32,
                    Math.PI * 0.48,
                    Math.PI * 0.64,
                    Math.PI * 0.78,
                    Math.PI * 0.92
                ];

                const angle =
                    directions[Math.floor(hashRand(h + 7) * directions.length)] +
                    (hashRand(h + 8) - 0.5) * 0.09;

                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const perpCos = Math.cos(angle + Math.PI / 2);
                const perpSin = Math.sin(angle + Math.PI / 2);

                // Opaque backing patch.
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(angle);

                ctx.fillStyle = "#efefec";
                ctx.fillRect(
                    -len * 0.56,
                    -patchWidth * 0.5,
                    len * 1.12,
                    patchWidth
                );

                ctx.restore();

                // Black parallel strokes.
                ctx.strokeStyle = "#111";
                ctx.lineWidth = Math.max(hatchStrokeMinWidth, ts * hatchStrokeWidthRatio);
                ctx.lineCap = "square";

                for (let s = 0; s < strokeCount; s++) {
                    const offset = (s - (strokeCount - 1) / 2) * gap;

                    const jitterA = (hashRand(h + 30 + s) - 0.5) * ts * hatchEndJitterRatio;
                    const jitterB = (hashRand(h + 50 + s) - 0.5) * ts * hatchEndJitterRatio;

                    const ox = perpCos * offset;
                    const oy = perpSin * offset;

                    const x1 = cx - cos * len * 0.5 + ox + perpCos * jitterA;
                    const y1 = cy - sin * len * 0.5 + oy + perpSin * jitterA;

                    const x2 = cx + cos * len * 0.5 + ox + perpCos * jitterB;
                    const y2 = cy + sin * len * 0.5 + oy + perpSin * jitterB;

                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }

    /* =========================================================
       B/W FLOOR TILE STYLE
    ========================================================= */

    function drawFloorTileInk(ctx, nx, ny, ts, showGrid = true) {
        // TWEAK: Floor grid/shading only appears when showGrid is true.
        const floorGradientShadowOpacity = 0.08;
        const floorGridOpacity = 0.16;
        const floorGridMinWidth = 0.6;
        const floorGridWidthRatio = 0.01;
        const floorGridWobbleRatio = 0.02;

        ctx.fillStyle = "#fff";
        ctx.fillRect(nx, ny, ts, ts);

        if (showGrid) {
            const grad = ctx.createLinearGradient(nx, ny, nx + ts, ny + ts);
            grad.addColorStop(0, "rgba(255,255,255,0)");
            grad.addColorStop(1, `rgba(0,0,0,${floorGradientShadowOpacity})`);

            ctx.fillStyle = grad;
            ctx.fillRect(nx, ny, ts, ts);

            ctx.strokeStyle = `rgba(0,0,0,${floorGridOpacity})`;
            ctx.lineWidth = Math.max(floorGridMinWidth, ts * floorGridWidthRatio);

            drawRoughLine(ctx, nx, ny, nx + ts, ny, ts * floorGridWobbleRatio);
            drawRoughLine(ctx, nx + ts, ny, nx + ts, ny + ts, ts * floorGridWobbleRatio);
            drawRoughLine(ctx, nx, ny + ts, nx + ts, ny + ts, ts * floorGridWobbleRatio);
            drawRoughLine(ctx, nx, ny, nx, ny + ts, ts * floorGridWobbleRatio);
        }
    }

    /* =========================================================
    PRINT PLAIN WALL TILE
    ---------------------------------------------------------
    Used when "Textured floor tiles" is unticked.
    ========================================================= */

    function drawPrintPlainWall(ctx, nx, ny, ts) {
        ctx.fillStyle = "#5f5f5a";
        ctx.fillRect(nx, ny, ts, ts);
    }

    /* =========================================================
    PRINT DIRECTIONAL WALL SHADOWS
    ---------------------------------------------------------
    Same logic as VTT shadows:
    - edge shadows are controlled by N/E/S/W checkboxes
    - corner shadows only appear when both corresponding
     directions are ticked
    - corner shadows only appear when the diagonal wall exists
     and both adjacent edge squares are empty
    ========================================================= */

    function drawPrintDirectionalWallShadows(ctx, G, map, ts, dirs) {
        // TWEAK: Printable shadow strength and reach.
        const printWallShadowOpacity = 0.30;
        const printWallShadowReachRatio = 0.22;

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

                ctx.fillStyle = `rgba(0,0,0,${printWallShadowOpacity})`;

                // Edge shadows.
                // Drawn as one combined path so overlapping corners do not get darker.
                ctx.beginPath();

                if (shadowN) {
                    ctx.rect(nx, ny, ts, ts * printWallShadowReachRatio);
                }

                if (shadowE) {
                    ctx.rect(
                        nx + ts - ts * printWallShadowReachRatio,
                        ny,
                        ts * printWallShadowReachRatio,
                        ts
                    );
                }

                if (shadowS) {
                    ctx.rect(
                        nx,
                        ny + ts - ts * printWallShadowReachRatio,
                        ts,
                        ts * printWallShadowReachRatio
                    );
                }

                if (shadowW) {
                    ctx.rect(nx, ny, ts * printWallShadowReachRatio, ts);
                }

                ctx.fill();

                // Corner shadows.
                // Same strict logic as VTT:
                // only draw a corner shadow when BOTH matching directions are ticked,
                // the diagonal wall exists, and BOTH adjacent edge squares are empty.
                if (dirs.n && dirs.w && wallNW && !wallN && !wallW) {
                    ctx.fillRect(
                        nx,
                        ny,
                        ts * printWallShadowReachRatio,
                        ts * printWallShadowReachRatio
                    );
                }

                if (dirs.n && dirs.e && wallNE && !wallN && !wallE) {
                    ctx.fillRect(
                        nx + ts - ts * printWallShadowReachRatio,
                        ny,
                        ts * printWallShadowReachRatio,
                        ts * printWallShadowReachRatio
                    );
                }

                if (dirs.s && dirs.e && wallSE && !wallS && !wallE) {
                    ctx.fillRect(
                        nx + ts - ts * printWallShadowReachRatio,
                        ny + ts - ts * printWallShadowReachRatio,
                        ts * printWallShadowReachRatio,
                        ts * printWallShadowReachRatio
                    );
                }

                if (dirs.s && dirs.w && wallSW && !wallS && !wallW) {
                    ctx.fillRect(
                        nx,
                        ny + ts - ts * printWallShadowReachRatio,
                        ts * printWallShadowReachRatio,
                        ts * printWallShadowReachRatio
                    );
                }

                ctx.restore();
            }
        }
    }

    /* =========================================================
       PRINTABLE BLACK & WHITE RENDERER
    ========================================================= */

    function drawPrintableMap(ctx, G, map, tileSize, options) {
        // TWEAK: Thick B/W wall outline.
        const printWallOutlineMinWidth = 3;
        const printWallOutlineWidthRatio = 0.10;
        const printWallOutlineWobbleRatio = 0.03;

        // TWEAK: B/W water overlay.
        const printWaterOverlayOpacity = 0.05;
        const printWaterWaveOpacity = 0.45;

        // TWEAK: B/W top/left cast shadow.
        const printShadowOpacity = 0.30;
        const printShadowThicknessRatio = 0.22;
        const printCornerShadowRatio = 0.22;

        const ts = tileSize;
        const seed = G._seedUsed || 0;

        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Wall / solid rock.
        // Textured ON  = hatch wall texture.
        // Textured OFF = plain dark-grey wall fill.
        for (let y = 0; y <= G.Gmapy + 1; y++) {
            for (let x = 0; x <= G.Gmapx + 1; x++) {
                if (!isFloorTile(G, map, x, y)) {
                    if (options.texturedFloors) {
                        drawStoneHatch(ctx, x * ts, y * ts, ts, x, y, seed);
                    } else {
                        drawPrintPlainWall(ctx, x * ts, y * ts, ts);
                    }
                }
            }
        }

        // Floor and water.
        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                drawFloorTileInk(ctx, nx, ny, ts, options.showGrid);

                if (map[x][y].flood) {
                    ctx.fillStyle = `rgba(0,0,0,${printWaterOverlayOpacity})`;
                    ctx.fillRect(nx, ny, ts, ts);

                    drawWaterWaves(ctx, nx, ny, ts, `rgba(0,0,0,${printWaterWaveOpacity})`);
                }
            }
        }

        // Thick wall outlines.
        ctx.strokeStyle = "#000";
        ctx.lineWidth = Math.max(printWallOutlineMinWidth, Math.floor(ts * printWallOutlineWidthRatio));
        ctx.lineCap = "square";
        ctx.lineJoin = "round";

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                if (isWallTile(G, map, x, y - 1)) {
                    drawRoughLine(ctx, nx, ny, nx + ts, ny, ts * printWallOutlineWobbleRatio);
                }

                if (isWallTile(G, map, x + 1, y)) {
                    drawRoughLine(ctx, nx + ts, ny, nx + ts, ny + ts, ts * printWallOutlineWobbleRatio);
                }

                if (isWallTile(G, map, x, y + 1)) {
                    drawRoughLine(ctx, nx, ny + ts, nx + ts, ny + ts, ts * printWallOutlineWobbleRatio);
                }

                if (isWallTile(G, map, x - 1, y)) {
                    drawRoughLine(ctx, nx, ny, nx, ny + ts, ts * printWallOutlineWobbleRatio);
                }
            }
        }

        // Directional room shadows.
        // Uses the same N/E/S/W checkbox logic as the VTT renderer.
        drawPrintDirectionalWallShadows(ctx, G, map, ts, options.shadowDirections);

        if (options.showDoors) {
            for (let y = 1; y <= G.Gmapy; y++) {
                for (let x = 1; x <= G.Gmapx; x++) {
                    drawDoorAndKey(ctx, G, map, x, y, ts, "print");
                }
            }
        }

        if (options.showStartExit) {
            drawStartExit(ctx, G, map, ts, "print");
        }
    }

    /* =========================================================
    EXPOSE RENDERER TO OTHER FILES
    ========================================================= */
    window.DigyrinthPrintRenderer = {
        drawPrintableMap
    };
})();
