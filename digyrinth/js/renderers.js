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
        // TWEAK: Stair symbol sizing.
        const stairWidthRatio = 0.68;
        const stairHeightRatio = 0.68;
        const stairSteps = 5;
        const stairLineWidthRatio = 0.04;

        function getOpenDirection(x, y) {
            if (isFloorTile(G, map, x, y - 1)) return "north";
            if (isFloorTile(G, map, x + 1, y)) return "east";
            if (isFloorTile(G, map, x, y + 1)) return "south";
            if (isFloorTile(G, map, x - 1, y)) return "west";
            return "south";
        }

        function rotationForDirection(dir) {
            if (dir === "north") return 0;
            if (dir === "east") return Math.PI / 2;
            if (dir === "south") return Math.PI;
            if (dir === "west") return -Math.PI / 2;
            return 0;
        }

        function drawStairs(xTile, yTile, type) {
            const nx = xTile * ts;
            const ny = yTile * ts;
            const cx = nx + ts / 2;
            const cy = ny + ts / 2;

            const w = ts * stairWidthRatio;
            const h = ts * stairHeightRatio;

            const dir = getOpenDirection(xTile, yTile);
            const rotation = rotationForDirection(dir);

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rotation);

            ctx.lineWidth = Math.max(2, ts * stairLineWidthRatio);
            ctx.lineCap = "square";
            ctx.lineJoin = "round";

            const x0 = -w / 2;
            const y0 = -h / 2;

            // Print uses greys only.
            // UP = lighter at top, darker inward.
            // DOWN = darker at top, lighter inward.
            const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);

            if (style === "print") {
                if (type === "up") {
                    grad.addColorStop(0, "#eeeeee");
                    grad.addColorStop(1, "#9a9a9a");
                } else {
                    grad.addColorStop(0, "#777777");
                    grad.addColorStop(1, "#dddddd");
                }

                ctx.strokeStyle = "#000000";
            } else {
                // VTT greyscale stairs:
                // UP = mid → light
                // DOWN = mid → dark

                if (type === "up") {
                    grad.addColorStop(0, "#404040");  // mid grey
                    grad.addColorStop(1, "#909090");  // light grey
                } else {
                    grad.addColorStop(0, "#808080");  // mid grey
                    grad.addColorStop(1, "#101010");  // dark grey
                }

                ctx.strokeStyle = "#111111";
            }

            ctx.fillStyle = grad;

            // Back plate.
            ctx.beginPath();
            ctx.rect(x0, y0, w, h);
            ctx.fill();
            ctx.stroke();

            // Stair treads.
            for (let i = 1; i < stairSteps; i++) {
                const t = i / stairSteps;
                const yy = y0 + h * t;

                ctx.beginPath();
                ctx.moveTo(x0, yy);
                ctx.lineTo(x0 + w, yy);
                ctx.stroke();
            }

            // Direction marker triangle.
            ctx.fillStyle = style === "print" ? "#000000" : "#111111";
            const arrowSize = ts * 0.13;

            ctx.beginPath();

            if (type === "up") {
                ctx.moveTo(0, y0 + ts * 0.08);
                ctx.lineTo(-arrowSize, y0 + ts * 0.08 + arrowSize);
                ctx.lineTo(arrowSize, y0 + ts * 0.08 + arrowSize);
            } else {
                ctx.moveTo(0, y0 + h - ts * 0.08);
                ctx.lineTo(-arrowSize, y0 + h - ts * 0.08 - arrowSize);
                ctx.lineTo(arrowSize, y0 + h - ts * 0.08 - arrowSize);
            }

            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        if (G.Gstartx > 0) {
            drawStairs(G.Gstartx, G.Gstarty, "up");
        }

        if (G._exitX > 0) {
            drawStairs(G._exitX, G._exitY, "down");
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
            showWater: options.showWater !== false,
            floorStyle: options.floorStyle || "cobble",
            floorScale: Math.max(0.2, Math.min(1, Number(options.floorScale) || 0.5)),
            wallTileStyle: options.wallTileStyle || "textured",
            wallEdgeStyle: options.wallEdgeStyle || "brick",
            shadowDirections: options.shadowDirections || {
                n: true,
                e: true,
                s: false,
                w: false
            }
        };

        if (style === "print") {
            window.DigyrinthPrintRenderer.drawPrintableMap(ctx, G, map, tileSize, renderOptions);
            return canvas;
        }

        if (style === "vtt") {
            window.DigyrinthVttRenderer.drawVttMap(ctx, G, map, tileSize, renderOptions);
            return canvas;
        }

        return canvas;
    }


    /* =========================================================
       EXPOSE RENDERER TO OTHER FILES
    ========================================================= */
    window.DigyrinthRendererShared = {
        isFloorTile,
        isWallTile,
        setupCanvas,
        tileHash,
        hashRand,
        drawWaterWaves,
        drawDoorAndKey,
        drawStartExit
    };

    window.DigyrinthRenderers = {
        renderMapToCanvas
    };

})();