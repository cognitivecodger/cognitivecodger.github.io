(() => {

    /* =========================================================
       DIGYRINTH RENDERERS
       ---------------------------------------------------------
       This file is responsible only for drawing/exporting map
       styles. It does not generate the dungeon.
    ========================================================= */


    /* =========================================================
       BASIC TILE CHECKS
    ========================================================= */

    function isFloorTile(G, map, x, y) {
        return x >= 1 && x <= G.Gmapx &&
            y >= 1 && y <= G.Gmapy &&
            map[x][y].flr > 0;
    }

    function isWallTile(G, map, x, y) {
        return !isFloorTile(G, map, x, y);
    }


    /* =========================================================
       CANVAS SETUP
    ========================================================= */

    function setupCanvas(canvas, G, tileSize) {
        canvas.width = tileSize * (G.Gmapx + 2);
        canvas.height = tileSize * (G.Gmapy + 2);

        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        return ctx;
    }


    /* =========================================================
       REPEATABLE RANDOM TEXTURE HELPERS
    ========================================================= */

    function tileHash(x, y, seed = 0) {
        let h = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return (h ^ (h >>> 16)) >>> 0;
    }

    function hashRand(hash) {
        hash = Math.imul(hash ^ (hash >>> 15), 1 | hash);
        hash ^= hash + Math.imul(hash ^ (hash >>> 7), 61 | hash);
        return ((hash ^ (hash >>> 14)) >>> 0) / 4294967296;
    }


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
       WATER SYMBOLS
    ========================================================= */

    function drawWaterWaves(ctx, x, y, ts, color) {
        // TWEAK: Number and shape of water wave lines.
        const waterRows = 3;
        const waterAmplitudeRatio = 0.04;
        const waterWavelengthRatio = 0.28;
        const waterLineWidthRatio = 0.035;

        ctx.save();

        ctx.beginPath();
        ctx.rect(x, y, ts, ts);
        ctx.clip();

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, ts * waterLineWidthRatio);

        const amp = ts * waterAmplitudeRatio;
        const wave = ts * waterWavelengthRatio;

        for (let r = 1; r <= waterRows; r++) {
            const cy = y + (ts / (waterRows + 1)) * r;

            ctx.beginPath();

            for (let px = x - wave; px <= x + ts + wave; px += 2) {
                const t = (px - x) / wave;
                const py = cy + Math.sin(t * Math.PI * 2) * amp;

                if (px === x - wave) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }

            ctx.stroke();
        }

        ctx.restore();
    }


    /* =========================================================
       DOOR ORIENTATION
    ========================================================= */

    function doorOrientation(G, map, x, y) {
        const left = isFloorTile(G, map, x - 1, y);
        const right = isFloorTile(G, map, x + 1, y);
        const up = isFloorTile(G, map, x, y - 1);
        const down = isFloorTile(G, map, x, y + 1);

        if (left && right) return "vertical";
        if (up && down) return "horizontal";

        return "unknown";
    }


    /* =========================================================
       DOOR SYMBOL
    ========================================================= */

    function drawDoorSymbol(ctx, G, map, x, y, ts, locked, style) {
        // TWEAK: Door symbol sizing.
        const doorThicknessRatio = 0.18;
        const doorLengthRatio = 0.68;
        const doorCrossbarMultiplier = 1.45;
        const doorLineWidthRatio = 0.055;

        // TWEAK: Locked door keyhole size.
        const keyholeMinRadius = 2;
        const keyholeRadiusRatio = 0.055;

        const nx = x * ts;
        const ny = y * ts;
        const cx = nx + ts / 2;
        const cy = ny + ts / 2;

        const orient = doorOrientation(G, map, x, y);

        ctx.save();

        ctx.strokeStyle = style === "print" ? "#000" : "#1a0f08";
        ctx.fillStyle = style === "print" ? "#fff" : "#c69b5b";
        ctx.lineWidth = Math.max(2, ts * doorLineWidthRatio);

        if (orient === "vertical") {
            const w = ts * doorThicknessRatio;
            const h = ts * doorLengthRatio;

            ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
            ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

            ctx.beginPath();
            ctx.moveTo(cx - w * doorCrossbarMultiplier, cy);
            ctx.lineTo(cx + w * doorCrossbarMultiplier, cy);
            ctx.stroke();
        } else {
            const w = ts * doorLengthRatio;
            const h = ts * doorThicknessRatio;

            ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
            ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

            ctx.beginPath();
            ctx.moveTo(cx, cy - h * doorCrossbarMultiplier);
            ctx.lineTo(cx, cy + h * doorCrossbarMultiplier);
            ctx.stroke();
        }

        if (locked) {
            ctx.fillStyle = style === "print" ? "#000" : "#1a0f08";
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(keyholeMinRadius, ts * keyholeRadiusRatio), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }


    /* =========================================================
       KEY SYMBOL
    ========================================================= */

    function drawKeySymbol(ctx, x, y, ts, style) {
        // TWEAK: Key symbol size and line width.
        const keyBowOffsetRatio = 0.14;
        const keyBowRadiusRatio = 0.10;
        const keyShaftStartRatio = 0.04;
        const keyShaftEndRatio = 0.20;
        const keyToothRatio = 0.09;
        const keyLineWidthRatio = 0.055;

        const nx = x * ts;
        const ny = y * ts;
        const cx = nx + ts / 2;
        const cy = ny + ts / 2;

        ctx.save();

        ctx.strokeStyle = style === "print" ? "#000" : "#d89b25";
        ctx.fillStyle = style === "print" ? "#fff" : "#d89b25";
        ctx.lineWidth = Math.max(2, ts * keyLineWidthRatio);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        ctx.beginPath();
        ctx.arc(cx - ts * keyBowOffsetRatio, cy, ts * keyBowRadiusRatio, 0, Math.PI * 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - ts * keyShaftStartRatio, cy);
        ctx.lineTo(cx + ts * keyShaftEndRatio, cy);
        ctx.lineTo(cx + ts * keyShaftEndRatio, cy + ts * keyToothRatio);

        ctx.moveTo(cx + ts * 0.09, cy);
        ctx.lineTo(cx + ts * 0.09, cy + ts * 0.08);

        ctx.stroke();

        ctx.restore();
    }


    /* =========================================================
       TINY SYMBOL NUMBER
    ========================================================= */

    function drawTinyNumber(ctx, text, x, y, ts, style) {
        // TWEAK: Tiny number label style.
        const numberFontRatio = 0.18;
        const numberMinFontSize = 7;
        const numberPaddingRatio = 0.035;
        const numberMinPadding = 2;
        const numberBoxLineWidthRatio = 0.025;

        const fontSize = Math.max(numberMinFontSize, Math.floor(ts * numberFontRatio));
        const pad = Math.max(numberMinPadding, ts * numberPaddingRatio);

        ctx.save();

        ctx.font = `${fontSize}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const width = ctx.measureText(text).width + pad * 2;
        const height = fontSize + pad * 1.5;

        ctx.fillStyle = style === "print" ? "#ffffff" : "rgba(255,255,255,0.85)";
        ctx.strokeStyle = style === "print" ? "#000000" : "#111111";
        ctx.lineWidth = Math.max(1, ts * numberBoxLineWidthRatio);

        ctx.beginPath();
        ctx.rect(x - width / 2, y - height / 2, width, height);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#000000";
        ctx.fillText(text, x, y + fontSize * 0.03);

        ctx.restore();
    }


    /* =========================================================
       DOORS AND KEYS COMBINED
    ========================================================= */

    function drawDoorAndKey(ctx, G, map, x, y, ts, style) {
        // TWEAK: Position of tiny number beside doors/keys.
        const numberXRatio = 0.70;
        const numberYRatio = 0.30;

        const b = map[x][y];

        if (b.doorType === 1) {
            drawDoorSymbol(ctx, G, map, x, y, ts, false, style);
        }

        if (b.doorType === 2) {
            drawDoorSymbol(ctx, G, map, x, y, ts, true, style);

            drawTinyNumber(
                ctx,
                String(b.doorId),
                x * ts + ts * numberXRatio,
                y * ts + ts * numberYRatio,
                ts,
                style
            );
        }

        if (b.keyId) {
            drawKeySymbol(ctx, x, y, ts, style);

            drawTinyNumber(
                ctx,
                String(b.keyId),
                x * ts + ts * numberXRatio,
                y * ts + ts * numberYRatio,
                ts,
                style
            );
        }
    }


    /* =========================================================
       START / EXIT MARKERS
    ========================================================= */

    function drawStartExit(ctx, G, map, ts, style) {
        // TWEAK: Start/exit marker size and label size.
        const markerRadiusRatio = 0.28;
        const markerLineWidthRatio = 0.055;
        const markerFontRatio = 0.28;
        const markerMinFontSize = 10;

        if (G.Gstartx > 0) {
            const x = G.Gstartx * ts;
            const y = G.Gstarty * ts;

            ctx.fillStyle = style === "print" ? "#fff" : "#2ecc71";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = Math.max(2, ts * markerLineWidthRatio);

            ctx.beginPath();
            ctx.arc(x + ts / 2, y + ts / 2, ts * markerRadiusRatio, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (ts >= 18) {
                ctx.fillStyle = "#000";
                ctx.font = `${Math.max(markerMinFontSize, Math.floor(ts * markerFontRatio))}px system-ui`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("S", x + ts / 2, y + ts / 2);
            }
        }

        if (G._exitX > 0) {
            const x = G._exitX * ts;
            const y = G._exitY * ts;

            ctx.fillStyle = style === "print" ? "#fff" : "#e74c3c";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = Math.max(2, ts * markerLineWidthRatio);

            ctx.beginPath();
            ctx.arc(x + ts / 2, y + ts / 2, ts * markerRadiusRatio, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (ts >= 18) {
                ctx.fillStyle = "#000";
                ctx.font = `${Math.max(markerMinFontSize, Math.floor(ts * markerFontRatio))}px system-ui`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("E", x + ts / 2, y + ts / 2);
            }
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
       PUBLIC RENDER ENTRY POINT
    ========================================================= */

    function renderMapToCanvas(canvas, state, style, options = {}) {
        const { G, map } = state;
        const tileSize = options.tileSize || 72;

        const ctx = setupCanvas(canvas, G, tileSize);

        const renderOptions = {
            showDoors: options.showDoors !== false,
            showStartExit: options.showStartExit !== false,
            showGrid: options.showGrid !== false,
            texturedFloors: options.texturedFloors !== false,
            shadowDirections: options.shadowDirections || {
                n: true,
                e: true,
                s: false,
                w: false
            }
        };

        if (style === "print") {
            drawPrintableMap(ctx, G, map, tileSize, renderOptions);
            return canvas;
        }

        if (style === "vtt") {
            drawVttMap(ctx, G, map, tileSize, renderOptions);
            return canvas;
        }

        return canvas;
    }


    /* =========================================================
       EXPOSE RENDERER TO OTHER FILES
    ========================================================= */

    window.DigyrinthRenderers = {
        renderMapToCanvas
    };

})();