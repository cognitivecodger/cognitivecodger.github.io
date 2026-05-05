(() => {

    /* =========================================================
       DIGYRINTH RENDERERS
       ---------------------------------------------------------
       This file is responsible only for drawing/exporting map
       styles. It does not generate the dungeon.
  
       It receives:
         - G   = generator settings/state
         - map = the generated 2D block array
  
       export.js calls:
         window.DigyrinthRenderers.renderMapToCanvas(...)
    ========================================================= */


    /* =========================================================
       BASIC TILE CHECKS
       ---------------------------------------------------------
       These functions decide whether a grid square is a floor
       tile or solid wall/rock.
  
       Important:
       - The actual map has a 1-tile border around it.
       - Only x/y positions inside 1..G.Gmapx and 1..G.Gmapy
         count as real dungeon floor.
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
       ---------------------------------------------------------
       Prepares an export canvas.
  
       This is separate from the visible on-screen canvas.
       That means you can export at 72px per tile for Roll20
       without changing the display size in the browser.
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
       ---------------------------------------------------------
       These create pseudo-random values based on tile position
       and seed.
  
       This means the B/W wall texture should remain stable for
       the same generated map, rather than changing completely
       every export.
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
       ---------------------------------------------------------
       Draws a line made from several slightly wobbly segments.
  
       Used for:
         - rough wall outlines
         - rough floor tile grid lines
         - hatch strokes in the solid wall areas
  
       To make the whole map look cleaner:
         reduce wobble
  
       To make it look more hand-drawn:
         increase wobble
    ========================================================= */

    function drawRoughLine(ctx, x1, y1, x2, y2, wobble = 1) {
        ctx.beginPath();

        const steps = 4;

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;

            const x = x1 + (x2 - x1) * t + (Math.random() - 0.5) * wobble;
            const y = y1 + (y2 - y1) * t + (Math.random() - 0.5) * wobble;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }

        ctx.stroke();
    }


    /* =========================================================
       B/W WALL HATCH TEXTURE
       ---------------------------------------------------------
       Fills each wall tile with chunky, parallel pen-stroke
       stamps.
    
       This version uses a guaranteed coverage grid:
       every zone gets a stamp, and the loop extends beyond the
       tile edges so corners are covered too.
    
       Stamps are allowed to overlap. Each stamp paints a pale
       backing patch first, then draws parallel black strokes.
    ========================================================= */

    function drawStoneHatch(ctx, nx, ny, ts, x, y, seed) {
        ctx.save();

        // Keep all hatch marks inside this one wall tile.
        ctx.beginPath();
        ctx.rect(nx, ny, ts, ts);
        ctx.clip();

        // Base paper/stone colour.
        ctx.fillStyle = "#efefec";
        ctx.fillRect(nx, ny, ts, ts);

        let h = tileHash(x, y, seed);

        // Larger number after / = smaller zones = more stamps.
        // Good chunky settings: ts / 2.5 or ts / 2.2
        const zone = ts / 2.5;

        // Extend beyond the tile to prevent blank edges/corners.
        for (let gy = -2; gy <= 5; gy++) {
            for (let gx = -2; gx <= 5; gx++) {
                h = tileHash(x * 97 + gx * 31, y * 101 + gy * 37, h);

                // Stamp centre. Small jitter only, so coverage stays reliable.
                const cx =
                    nx +
                    gx * zone +
                    zone * 0.5 +
                    (hashRand(h + 2) - 0.5) * zone * 0.25;

                const cy =
                    ny +
                    gy * zone +
                    zone * 0.5 +
                    (hashRand(h + 3) - 0.5) * zone * 0.25;

                // Stamp length. Bigger values create chunkier strokes.
                const len = ts * (0.52 + hashRand(h + 4) * 0.28);

                // Number of parallel strokes per stamp.
                const strokeCount = 3 + Math.floor(hashRand(h + 5) * 3); // 3–5

                // Distance between the parallel strokes.
                const gap = ts * 0.07;

                // Backing patch width.
                // This keeps the stamps readable even when they overlap.
                const patchWidth = gap * (strokeCount + 1.35);

                // Choose from a set of clear pen angles.
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

                /* -----------------------------------------------------
                   1. OPAQUE BACKING PATCH
                   -----------------------------------------------------
                   This paints a pale patch behind each stroke bundle.
                   Because it is opaque, overlapping stamps do not become
                   a muddy dark scribble.
                ----------------------------------------------------- */

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

                /* -----------------------------------------------------
                   2. BLACK PARALLEL PEN STROKES
                ----------------------------------------------------- */

                ctx.strokeStyle = "#111";
                ctx.lineWidth = Math.max(1.5, ts * 0.032);
                ctx.lineCap = "square";

                for (let s = 0; s < strokeCount; s++) {
                    const offset = (s - (strokeCount - 1) / 2) * gap;

                    const jitterA = (hashRand(h + 30 + s) - 0.5) * ts * 0.025;
                    const jitterB = (hashRand(h + 50 + s) - 0.5) * ts * 0.025;

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
       VTT WALL STYLE
       ---------------------------------------------------------
       gives every solid wall tile a masonry/stone-block treatment 
       before floors are drawn on top.
       ========================================================= */
    function drawVttWallTile(ctx, nx, ny, ts, x, y, seed) {
        const h = tileHash(x, y, seed);
        const shade = 28 + Math.floor(hashRand(h) * 18);

        ctx.fillStyle = `rgb(${shade},${shade - 3},${shade - 8})`;
        ctx.fillRect(nx, ny, ts, ts);

        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = Math.max(1, ts * 0.018);

        const rows = 3;
        const brickH = ts / rows;

        for (let r = 1; r < rows; r++) {
            const yy = ny + r * brickH;
            ctx.beginPath();
            ctx.moveTo(nx, yy);
            ctx.lineTo(nx + ts, yy);
            ctx.stroke();
        }

        for (let r = 0; r < rows; r++) {
            const offset = r % 2 === 0 ? 0 : ts * 0.5;
            const yy = ny + r * brickH;

            ctx.beginPath();
            ctx.moveTo(nx + offset, yy);
            ctx.lineTo(nx + offset, yy + brickH);
            ctx.stroke();
        }

        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(nx, ny + ts * 0.65, ts, ts * 0.35);
    }


    /* =========================================================
       B/W FLOOR TILE STYLE
       ---------------------------------------------------------
       Draws:
         - a white floor square
         - subtle grey shading from top-left to bottom-right
         - thin rough tile lines
  
       Useful values to edit:
  
         rgba(0,0,0,0.08)
           Floor shadow darkness.
  
         ctx.strokeStyle = "rgba(0,0,0,0.16)"
           Floor grid darkness.
    ========================================================= */

    function drawFloorTileInk(ctx, nx, ny, ts, showGrid = true) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(nx, ny, ts, ts);

        if (showGrid) {
            // Light from top-left, shadow toward bottom-right.
           const grad = ctx.createLinearGradient(nx, ny, nx + ts, ny + ts);
          grad.addColorStop(0, "rgba(255,255,255,0)");
         grad.addColorStop(1, "rgba(0,0,0,0.08)");

        ctx.fillStyle = grad;
        ctx.fillRect(nx, ny, ts, ts);

        // Thin rough tile grid.
            ctx.strokeStyle = "rgba(0,0,0,0.16)";
            ctx.lineWidth = Math.max(0.6, ts * 0.01);

            drawRoughLine(ctx, nx, ny, nx + ts, ny, ts * 0.02);
            drawRoughLine(ctx, nx + ts, ny, nx + ts, ny + ts, ts * 0.02);
            drawRoughLine(ctx, nx, ny + ts, nx + ts, ny + ts, ts * 0.02);
            drawRoughLine(ctx, nx, ny, nx, ny + ts, ts * 0.02);
        }
    }


    /* =========================================================
       WATER SYMBOLS
       ---------------------------------------------------------
       Draws clipped wavy lines inside flooded tiles.
  
       Used by both:
         - Printable B/W renderer
         - VTT renderer
  
       Useful values to edit:
  
         const rows = 3;
           Number of wave lines.
  
         const amp = ts * 0.04;
           Wave height.
  
         const wave = ts * 0.28;
           Wave length.
    ========================================================= */

    function drawWaterWaves(ctx, x, y, ts, color) {
        ctx.save();

        // Prevent water lines spilling outside the tile.
        ctx.beginPath();
        ctx.rect(x, y, ts, ts);
        ctx.clip();

        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, ts * 0.035);

        const rows = 3;
        const amp = ts * 0.04;
        const wave = ts * 0.28;

        for (let r = 1; r <= rows; r++) {
            const cy = y + (ts / (rows + 1)) * r;

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
       ---------------------------------------------------------
       Works out which direction the passage runs.
  
       If the passage connects left/right, the door symbol should
       be vertical because it blocks the horizontal passage.
  
       If the passage connects up/down, the door symbol should
       be horizontal because it blocks the vertical passage.
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
       ---------------------------------------------------------
       Normal door:
         small barred rectangle across the passage.
  
       Locked door:
         same symbol plus a keyhole dot.
  
       Useful values to edit:
  
         ts * 0.18
           door thickness
  
         ts * 0.68
           door length
    ========================================================= */

    function drawDoorSymbol(ctx, G, map, x, y, ts, locked, style) {
        const nx = x * ts;
        const ny = y * ts;
        const cx = nx + ts / 2;
        const cy = ny + ts / 2;

        const orient = doorOrientation(G, map, x, y);

        ctx.save();

        ctx.strokeStyle = style === "print" ? "#000" : "#1a0f08";
        ctx.fillStyle = style === "print" ? "#fff" : "#c69b5b";
        ctx.lineWidth = Math.max(2, ts * 0.055);

        if (orient === "vertical") {
            const w = ts * 0.18;
            const h = ts * 0.68;

            ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
            ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

            // Small crossbar to make it read as a door symbol.
            ctx.beginPath();
            ctx.moveTo(cx - w * 1.45, cy);
            ctx.lineTo(cx + w * 1.45, cy);
            ctx.stroke();
        } else {
            const w = ts * 0.68;
            const h = ts * 0.18;

            ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
            ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);

            // Small crossbar to make it read as a door symbol.
            ctx.beginPath();
            ctx.moveTo(cx, cy - h * 1.45);
            ctx.lineTo(cx, cy + h * 1.45);
            ctx.stroke();
        }

        if (locked) {
            ctx.fillStyle = style === "print" ? "#000" : "#1a0f08";
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(2, ts * 0.055), 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }


    /* =========================================================
       KEY SYMBOL
       ---------------------------------------------------------
       Draws a small old-school key icon:
         - circular bow
         - shaft
         - teeth
    ========================================================= */

    function drawKeySymbol(ctx, x, y, ts, style) {
        const nx = x * ts;
        const ny = y * ts;
        const cx = nx + ts / 2;
        const cy = ny + ts / 2;

        ctx.save();

        ctx.strokeStyle = style === "print" ? "#000" : "#d89b25";
        ctx.fillStyle = style === "print" ? "#fff" : "#d89b25";
        ctx.lineWidth = Math.max(2, ts * 0.055);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        // Key bow.
        ctx.beginPath();
        ctx.arc(cx - ts * 0.14, cy, ts * 0.10, 0, Math.PI * 2);
        ctx.stroke();

        // Key shaft and teeth.
        ctx.beginPath();
        ctx.moveTo(cx - ts * 0.04, cy);
        ctx.lineTo(cx + ts * 0.20, cy);
        ctx.lineTo(cx + ts * 0.20, cy + ts * 0.09);

        ctx.moveTo(cx + ts * 0.09, cy);
        ctx.lineTo(cx + ts * 0.09, cy + ts * 0.08);

        ctx.stroke();

        ctx.restore();
    }

    /* =========================================================
    TINY SYMBOL NUMBER
    ---------------------------------------------------------
    Used for matching locked doors and keys.
    ========================================================= */

    function drawTinyNumber(ctx, text, x, y, ts, style) {
        ctx.save();

        const fontSize = Math.max(7, Math.floor(ts * 0.18));
        const pad = Math.max(2, ts * 0.035);

        ctx.font = `${fontSize}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const width = ctx.measureText(text).width + pad * 2;
        const height = fontSize + pad * 1.5;

        ctx.fillStyle = style === "print" ? "#ffffff" : "rgba(255,255,255,0.85)";
        ctx.strokeStyle = style === "print" ? "#000000" : "#111111";
        ctx.lineWidth = Math.max(1, ts * 0.025);

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
       ---------------------------------------------------------
       Draws:
         - normal door
         - locked door
         - key
         - tiny matching number next to locked doors and keys
    ========================================================= */

    function drawDoorAndKey(ctx, G, map, x, y, ts, style) {
        const b = map[x][y];

        if (b.doorType === 1) {
            drawDoorSymbol(ctx, G, map, x, y, ts, false, style);
        }

        if (b.doorType === 2) {
            drawDoorSymbol(ctx, G, map, x, y, ts, true, style);

            // Tiny number beside locked door.
            drawTinyNumber(
                ctx,
                String(b.doorId),
                x * ts + ts * 0.70,
                y * ts + ts * 0.30,
                ts,
                style
            );
        }

        if (b.keyId) {
            drawKeySymbol(ctx, x, y, ts, style);

            // Tiny number beside key.
            drawTinyNumber(
                ctx,
                String(b.keyId),
                x * ts + ts * 0.70,
                y * ts + ts * 0.30,
                ts,
                style
            );
        }
    }


    /* =========================================================
       START / EXIT MARKERS
       ---------------------------------------------------------
       Optional export symbols.
  
       These are drawn only if:
         Include start & exit is checked.
    ========================================================= */

    function drawStartExit(ctx, G, map, ts, style) {
        if (G.Gstartx > 0) {
            const x = G.Gstartx * ts;
            const y = G.Gstarty * ts;

            ctx.fillStyle = style === "print" ? "#fff" : "#2ecc71";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = Math.max(2, ts * 0.055);

            ctx.beginPath();
            ctx.arc(x + ts / 2, y + ts / 2, ts * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (ts >= 18) {
                ctx.fillStyle = "#000";
                ctx.font = `${Math.max(10, Math.floor(ts * 0.28))}px system-ui`;
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
            ctx.lineWidth = Math.max(2, ts * 0.055);

            ctx.beginPath();
            ctx.arc(x + ts / 2, y + ts / 2, ts * 0.28, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (ts >= 18) {
                ctx.fillStyle = "#000";
                ctx.font = `${Math.max(10, Math.floor(ts * 0.28))}px system-ui`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("E", x + ts / 2, y + ts / 2);
            }
        }
    }


    /* =========================================================
       PRINTABLE BLACK & WHITE RENDERER
       ---------------------------------------------------------
       This is the main B/W export style.
  
       Draw order matters:
  
         1. White page background
         2. Wall hatch / solid rock
         3. White floor tiles
         4. Water marks
         5. Thick wall outlines
         6. Bottom/right room shadows
         7. Doors and keys
         8. Start/exit markers
  
       If something appears hidden or drawn over the top of
       something else, this draw order is usually why.
    ========================================================= */

    function drawPrintableMap(ctx, G, map, tileSize, options) {
        const ts = tileSize;
        const seed = G._seedUsed || 0;

        // 1. White page background.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // 2. Draw wall/rock areas first.
        for (let y = 0; y <= G.Gmapy + 1; y++) {
            for (let x = 0; x <= G.Gmapx + 1; x++) {
                if (!isFloorTile(G, map, x, y)) {
                    drawStoneHatch(ctx, x * ts, y * ts, ts, x, y, seed);
                }
            }
        }

        // 3. Draw floor tiles over the wall texture.
        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                drawFloorTileInk(ctx, nx, ny, ts, options.showGrid);

                // 4. Flooded tiles get water wave marks.
                if (map[x][y].flood) {
                    ctx.fillStyle = "rgba(0,0,0,.05)";
                    ctx.fillRect(nx, ny, ts, ts);

                    drawWaterWaves(ctx, nx, ny, ts, "rgba(0,0,0,.45)");
                }
            }
        }

        // 5. Thick ink wall outlines around open floor areas.
        ctx.strokeStyle = "#000";
        ctx.lineWidth = Math.max(3, Math.floor(ts * .10));
        ctx.lineCap = "square";
        ctx.lineJoin = "round";

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                if (isWallTile(G, map, x, y - 1)) {
                    drawRoughLine(ctx, nx, ny, nx + ts, ny, ts * .03);
                }

                if (isWallTile(G, map, x + 1, y)) {
                    drawRoughLine(ctx, nx + ts, ny, nx + ts, ny + ts, ts * .03);
                }

                if (isWallTile(G, map, x, y + 1)) {
                    drawRoughLine(ctx, nx, ny + ts, nx + ts, ny + ts, ts * .03);
                }

                if (isWallTile(G, map, x - 1, y)) {
                    drawRoughLine(ctx, nx, ny, nx, ny + ts, ts * .03);
                }
            }
        }

        // 6. Top/left room shadow.
        // Drawn as one combined shape per tile to avoid overlap darkening.
        ctx.fillStyle = "rgba(0,0,0,0.30)";

        const shadowThickness = ts * 0.22;
        const cornerSize = ts * 0.22;

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                const wallLeft = isWallTile(G, map, x - 1, y);
                const wallTop = isWallTile(G, map, x, y - 1);
                const wallTopLeft = isWallTile(G, map, x - 1, y - 1);

                ctx.beginPath();

                if (wallTop) {
                    ctx.rect(nx, ny, ts, shadowThickness);
                }

                if (wallLeft) {
                    ctx.rect(nx, ny, shadowThickness, ts);
                }

                if (!wallTop && !wallLeft && wallTopLeft) {
                    ctx.rect(nx, ny, cornerSize, cornerSize);
                }

                ctx.fill();
            }
        }

        // 7. Doors and keys.
        if (options.showDoors) {
            for (let y = 1; y <= G.Gmapy; y++) {
                for (let x = 1; x <= G.Gmapx; x++) {
                    drawDoorAndKey(ctx, G, map, x, y, ts, "print");
                }
            }
        }

        // 8. Start and exit markers.
        if (options.showStartExit) {
            drawStartExit(ctx, G, map, ts, "print");
        }
    }

    /* =========================================================
       VTT BEVELLED STONE WALL EDGE
       ---------------------------------------------------------
       Draws exposed wall edges as raised stone lips.
    
       This version only bevels/shortens ends where there is an
       actual corner. Straight consecutive wall runs remain joined.
    ========================================================= */

    function drawVttBevelWallEdge(ctx, nx, ny, ts, side, bevelStart, bevelEnd, seed = 0) {
        const thick = Math.max(6, ts * 0.16);
        const offset = Math.max(3, ts * 0.075);
        const inset = Math.max(4, ts * 0.10);

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
   VTT ORGANIC COBBLESTONE FLOOR TILE
   ---------------------------------------------------------
   Canvas-friendly approximation of:
   - Poisson-like seed placement
   - Voronoi-style organic stone cells
   - rounded/wobbled stone shapes
   - mortar/grout between stones
   - top-left lighting and bottom-right shadow
========================================================= */

    function drawVttCobbleFloor(ctx, nx, ny, ts, x, y, seed, isFlood = false) {
        const h0 = tileHash(x, y, seed);

        // Flooded tiles stay water for now.
        if (isFlood) {
            ctx.fillStyle = "#243f52";
            ctx.fillRect(nx, ny, ts, ts);
            drawWaterWaves(ctx, nx, ny, ts, "rgba(210,235,255,.35)");
            return;
        }

        ctx.save();

        // Clip everything to this tile.
        ctx.beginPath();
        ctx.rect(nx, ny, ts, ts);
        ctx.clip();

        // Mortar base.
        ctx.fillStyle = "#2b2923";
        ctx.fillRect(nx, ny, ts, ts);

        /*
           Seed layout:
           This is not full Voronoi, but it creates the same visual idea:
           a loose set of rounded, differently-sized stone cells.
        */
        const cols = 5;
        const rows = 5;
        const cellW = ts / cols;
        const cellH = ts / rows;

        for (let gy = -1; gy <= rows; gy++) {
            for (let gx = -1; gx <= cols; gx++) {
                const h = tileHash(x * 101 + gx * 17, y * 131 + gy * 23, h0);

                const cx =
                    nx +
                    gx * cellW +
                    cellW * 0.5 +
                    (hashRand(h + 1) - 0.5) * cellW * 0.55;

                const cy =
                    ny +
                    gy * cellH +
                    cellH * 0.5 +
                    (hashRand(h + 2) - 0.5) * cellH * 0.55;

                const rx = cellW * (0.56 + hashRand(h + 3) * 0.16);
                const ry = cellH * (0.56 + hashRand(h + 4) * 0.16);

                const points = [];
                const verts = 8;

                for (let i = 0; i < verts; i++) {
                    const a = (Math.PI * 2 * i) / verts;
                    const wobble = 0.82 + hashRand(h + 20 + i) * 0.34;

                    points.push({
                        x: cx + Math.cos(a) * rx * wobble,
                        y: cy + Math.sin(a) * ry * wobble
                    });
                }

                // Per-stone colour variation.
                const base = 78 + Math.floor(hashRand(h + 40) * 22);
                const warm = Math.floor(hashRand(h + 41) * 8);

                const topColor = `rgb(${base + warm + 18},${base + warm + 17},${base + 12})`;
                const bottomColor = `rgb(${base - 18},${base - 20},${base - 23})`;

                const grad = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
                grad.addColorStop(0, topColor);
                grad.addColorStop(1, bottomColor);

                // Draw rounded organic stone.
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

                // Mortar/dark outline.
                ctx.strokeStyle = "rgba(10,9,8,0.75)";
                ctx.lineWidth = Math.max(1, ts * 0.018);
                ctx.stroke();

                // Inner highlight, top-left side.
                ctx.save();
                ctx.clip();

                ctx.strokeStyle = "rgba(255,255,230,0.18)";
                ctx.lineWidth = Math.max(1, ts * 0.018);
                ctx.beginPath();
                ctx.moveTo(cx - rx * 0.55, cy - ry * 0.35);
                ctx.lineTo(cx + rx * 0.15, cy - ry * 0.48);
                ctx.stroke();

                // Grit / mineral speckles.
                const specks = 5;
                for (let s = 0; s < specks; s++) {
                    const sx = cx + (hashRand(h + 60 + s) - 0.5) * rx * 1.4;
                    const sy = cy + (hashRand(h + 80 + s) - 0.5) * ry * 1.4;

                    ctx.fillStyle =
                        hashRand(h + 100 + s) > 0.5
                            ? "rgba(255,255,240,0.16)"
                            : "rgba(0,0,0,0.14)";

                    ctx.fillRect(sx, sy, Math.max(1, ts * 0.018), Math.max(1, ts * 0.018));
                }

                ctx.restore();
            }
        }

        // Soft tile-level darkening toward bottom-right.
        const shadow = ctx.createLinearGradient(nx, ny, nx + ts, ny + ts);
        shadow.addColorStop(0, "rgba(255,255,255,0.03)");
        shadow.addColorStop(1, "rgba(0,0,0,0.18)");
        ctx.fillStyle = shadow;
        ctx.fillRect(nx, ny, ts, ts);

        ctx.restore();
    }

    /* =========================================================
   VTT TOP/LEFT WALL SHADOWS
   ---------------------------------------------------------
   Draws soft shadows inside floor tiles where a wall touches
   the north/top edge, west/left edge, or top-left corner.
========================================================= */

    function drawVttTopLeftWallShadows(ctx, G, map, ts) {
        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                const wallTop = isWallTile(G, map, x, y - 1);
                const wallLeft = isWallTile(G, map, x - 1, y);
                const wallTopLeft = isWallTile(G, map, x - 1, y - 1);

                ctx.save();

                // North wall shadow: dark at top, fades downwards.
                if (wallTop) {
                    const grad = ctx.createLinearGradient(nx, ny, nx, ny + ts * 0.42);
                    grad.addColorStop(0, "rgba(0,0,0,0.38)");
                    grad.addColorStop(1, "rgba(0,0,0,0)");

                    ctx.fillStyle = grad;
                    ctx.fillRect(nx, ny, ts, ts * 0.42);
                }

                // West wall shadow: dark at left, fades rightwards.
                if (wallLeft) {
                    const grad = ctx.createLinearGradient(nx, ny, nx + ts * 0.42, ny);
                    grad.addColorStop(0, "rgba(0,0,0,0.38)");
                    grad.addColorStop(1, "rgba(0,0,0,0)");

                    ctx.fillStyle = grad;
                    ctx.fillRect(nx, ny, ts * 0.42, ts);
                }

                // Top-left diagonal corner shadow.
                // Only draw this when the diagonal top-left tile is wall,
                // but the direct top and left edges are NOT already shadowed.
                // This prevents the corner from becoming too dark.
                if (wallTopLeft && !wallTop && !wallLeft) {
                    const grad = ctx.createRadialGradient(
                        nx,
                        ny,
                        0,
                        nx,
                        ny,
                        ts * 0.48
                    );

                    grad.addColorStop(0, "rgba(0,0,0,0.24)");
                    grad.addColorStop(1, "rgba(0,0,0,0)");

                    ctx.fillStyle = grad;
                    ctx.fillRect(nx, ny, ts * 0.55, ts * 0.55);
                }

                ctx.restore();
            }
        }
    }

    /* =========================================================
       VTT RENDERER
       ---------------------------------------------------------
       Coloured version intended for Roll20/VTT export.
  
       This is intentionally simpler than the printable style:
         - dark rock background
         - grey stone floors
         - blue flooded tiles
         - darker wall outlines
         - optional doors/keys/start/exit
    ========================================================= */

    function drawVttMap(ctx, G, map, tileSize, options) {
        const ts = tileSize;

        // Dark solid rock background.
        const seed = G._seedUsed || 0;

        for (let y = 0; y <= G.Gmapy + 1; y++) {
            for (let x = 0; x <= G.Gmapx + 1; x++) {
                if (isWallTile(G, map, x, y)) {
                    drawVttWallTile(ctx, x * ts, y * ts, ts, x, y, seed);
                }
            }
        }

        // Draw floor and water tiles.
        for (let y = 0; y <= G.Gmapy + 1; y++) {
            for (let x = 0; x <= G.Gmapx + 1; x++) {
                const b = map[x][y];
                if (!b || b.flr <= 0) continue;

                const nx = x * ts;
                const ny = y * ts;

                drawVttCobbleFloor(
                    ctx,
                    nx,
                    ny,
                    ts,
                    x,
                    y,
                    G._seedUsed || 0,
                    b.flood
                );

                // Subtle individual tile edge.
                if (options.showGrid) {
                    ctx.strokeStyle = "rgba(0,0,0,0.22)";
                    ctx.lineWidth = Math.max(1, ts * 0.025);
                    ctx.strokeRect(nx + 0.5, ny + 0.5, ts - 1, ts - 1);
                }
            }
        }

        drawVttTopLeftWallShadows(ctx, G, map, ts);

        // Raised bevelled stone wall edges around exposed floor boundaries.
        // Straight runs remain continuous; only real corners are inset.
        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;
                const seed = G._seedUsed || 0;

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

        // Optional doors and keys.
        if (options.showDoors) {
            for (let y = 1; y <= G.Gmapy; y++) {
                for (let x = 1; x <= G.Gmapx; x++) {
                    drawDoorAndKey(ctx, G, map, x, y, ts, "vtt");
                }
            }
        }

        // Optional start and exit.
        if (options.showStartExit) {
            drawStartExit(ctx, G, map, ts, "vtt");
        }
    }


    /* =========================================================
       PUBLIC RENDER ENTRY POINT
       ---------------------------------------------------------
       export.js calls this function.
  
       style can be:
         "print" = B/W hand-drawn dungeon map
         "vtt"   = coloured VTT dungeon map
  
       The visible/current export is handled directly in export.js
       by copying the visible canvas.
    ========================================================= */

    function renderMapToCanvas(canvas, state, style, options = {}) {
        const { G, map } = state;
        const tileSize = options.tileSize || 72;

        const ctx = setupCanvas(canvas, G, tileSize);

        const renderOptions = {
            showDoors: options.showDoors !== false,
            showStartExit: options.showStartExit !== false,
            showGrid: options.showGrid !== false
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
       ---------------------------------------------------------
       This makes the renderer available to export.js as:
  
         window.DigyrinthRenderers.renderMapToCanvas(...)
    ========================================================= */

    window.DigyrinthRenderers = {
        renderMapToCanvas
    };

})();