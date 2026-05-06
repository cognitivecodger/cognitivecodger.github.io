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

    function drawFloorTileInk(ctx, nx, ny, ts, showGrid = true, floorScale = 0.5) {
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

            const innerLines = Math.max(0, Math.round(1 / floorScale) - 1);

            for (let i = 1; i <= innerLines; i++) {
                const p = i / (innerLines + 1);

                drawRoughLine(ctx, nx + ts * p, ny, nx + ts * p, ny + ts, ts * floorGridWobbleRatio);
                drawRoughLine(ctx, nx, ny + ts * p, nx + ts, ny + ts * p, ts * floorGridWobbleRatio);
            }

            const divisions = Math.max(1, Math.round(1 / floorScale));

            // Internal sub-grid lines.
            for (let i = 1; i < divisions; i++) {
                const p = i / divisions;

                drawRoughLine(ctx, nx + ts * p, ny, nx + ts * p, ny + ts, ts * floorGridWobbleRatio);
                drawRoughLine(ctx, nx, ny + ts * p, nx + ts, ny + ts * p, ts * floorGridWobbleRatio);
            }

            // Outer tile border.
            drawRoughLine(ctx, nx, ny, nx + ts, ny, ts * floorGridWobbleRatio);
            drawRoughLine(ctx, nx + ts, ny, nx + ts, ny + ts, ts * floorGridWobbleRatio);
            drawRoughLine(ctx, nx, ny + ts, nx + ts, ny + ts, ts * floorGridWobbleRatio);
            drawRoughLine(ctx, nx, ny, nx, ny + ts, ts * floorGridWobbleRatio);
        }
    }



    /* =========================================================
       Cracked floor tile style
    ========================================================= */
    function drawFloorTileCracked(ctx, nx, ny, ts, showGrid = true, floorScale = 0.5) {
        const h = Math.floor((nx * 73856093) ^ (ny * 19349663));

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(nx, ny, ts, ts);

        ctx.save();
        ctx.beginPath();
        ctx.rect(nx, ny, ts, ts);
        ctx.clip();

        const r = Math.random();

        ctx.strokeStyle = "rgba(0,0,0,0.62)";
        ctx.lineWidth = Math.max(1.4, ts * 0.04);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        function drawCrack(points) {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);

            for (let i = 1; i < points.length; i++) {
                // slight width variation per segment
                ctx.lineWidth = Math.max(2, ts * (0.035 + Math.random() * 0.01));
                ctx.lineTo(points[i].x, points[i].y);
            }

            ctx.stroke();
        }

        function edgePoint(edge) {
            if (edge === 0) return { x: nx + Math.random() * ts, y: ny };          // top
            if (edge === 1) return { x: nx + ts, y: ny + Math.random() * ts };     // right
            if (edge === 2) return { x: nx + Math.random() * ts, y: ny + ts };     // bottom
            return { x: nx, y: ny + Math.random() * ts };                         // left
        }

        // 55%: no crack, just wear.
        // 30%: short edge crack.
        // 12%: crossing crack.
        // 3%: forked crack.
        if (r > 0.55) {
            const startEdge = Math.floor(Math.random() * 4);
            const start = edgePoint(startEdge);

            let points = [start];

            const length = r > 0.85 ? ts * 0.75 : ts * 0.35;
            let angle = (startEdge * Math.PI / 2) + Math.PI + (Math.random() - 0.5) * 1.2;

            let px = start.x;
            let py = start.y;

            const segments = r > 0.85 ? 4 : 2;

            for (let i = 0; i < segments; i++) {
                px += Math.cos(angle) * length / segments;
                py += Math.sin(angle) * length / segments;

                angle += (Math.random() - 0.5) * 0.7;

                px = Math.max(nx + ts * 0.08, Math.min(nx + ts * 0.92, px));
                py = Math.max(ny + ts * 0.08, Math.min(ny + ts * 0.92, py));

                points.push({ x: px, y: py });
            }

            drawCrack(points);

            // Rare small branch.
            if (r > 0.97 && points.length > 2) {
                const branchFrom = points[1];
                const branchAngle = angle + (Math.random() < 0.5 ? 1 : -1) * 1.1;
                drawCrack([
                    branchFrom,
                    {
                        x: branchFrom.x + Math.cos(branchAngle) * ts * 0.22,
                        y: branchFrom.y + Math.sin(branchAngle) * ts * 0.22
                    }
                ]);
            }
        }

        // Inked pitting / dirt clusters.
        // Fewer than before, but grouped into little pen-mark clusters.
        const clusterCount = Math.max(1, Math.round(1 / floorScale));

        ctx.fillStyle = "rgba(0,0,0,0.72)";

        for (let c = 0; c < clusterCount; c++) {
            const ch = h + 400 + c * 50;

            const cx = nx + ts * (0.18 + hashRand(ch + 1) * 0.64);
            const cy = ny + ts * (0.18 + hashRand(ch + 2) * 0.64);

            const dotCount = 3 + Math.floor(hashRand(ch + 3) * 5); // 3–7 dots
            const clusterAngle = hashRand(ch + 4) * Math.PI * 2;
            const spacing = ts * (0.04 + floorScale * 0.07);

            for (let i = 0; i < dotCount; i++) {
                const along = (i - dotCount / 2) * spacing;
                const scatter = (hashRand(ch + 10 + i) - 0.5) * ts * 0.08;

                const dx =
                    cx +
                    Math.cos(clusterAngle) * along +
                    Math.cos(clusterAngle + Math.PI / 2) * scatter;

                const dy =
                    cy +
                    Math.sin(clusterAngle) * along +
                    Math.sin(clusterAngle + Math.PI / 2) * scatter;

                //const radius = Math.max(1.4, ts * (0.016 + hashRand(ch + 30 + i) * 0.012));
                const radius = Math.max(1.2, ts * (0.014 + hashRand(ch + 30 + i) * 0.018));

                ctx.beginPath();
                ctx.arc(dx, dy, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();

        if (showGrid) {
            ctx.strokeStyle = "rgba(0,0,0,0.45)";
            ctx.lineWidth = Math.max(1.1, ts * 0.03);

            const wobble = ts * 0.05;

            // top
            drawRoughLine(ctx, nx, ny, nx + ts, ny, wobble);

            // right
            drawRoughLine(ctx, nx + ts, ny, nx + ts, ny + ts, wobble);

            // bottom
            drawRoughLine(ctx, nx, ny + ts, nx + ts, ny + ts, wobble);

            // left
            drawRoughLine(ctx, nx, ny, nx, ny + ts, wobble);
        }
    }



    /* =========================================================
    PRINT Cobblestone Floor tile
    ========================================================= */
    function drawPrintCobbleFloor(ctx, nx, ny, ts, x, y, seed, floorScale = 0.5) {
        const h0 = tileHash(x, y, seed);

        // Base
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(nx, ny, ts, ts);

        ctx.save();
        ctx.beginPath();
        ctx.rect(nx, ny, ts, ts);
        ctx.clip();

        const cols = Math.max(2, Math.round(2 / floorScale));
        const rows = cols;

        const cellW = ts / cols;
        const cellH = ts / rows;

        for (let gy = -1; gy <= rows; gy++) {
            for (let gx = -1; gx <= cols; gx++) {
                const h = tileHash(x * 101 + gx * 17, y * 131 + gy * 23, h0);

                const cx =
                    nx +
                    gx * cellW +
                    cellW * 0.5 +
                    (hashRand(h + 1) - 0.5) * cellW * 0.6;

                const cy =
                    ny +
                    gy * cellH +
                    cellH * 0.5 +
                    (hashRand(h + 2) - 0.5) * cellH * 0.6;

                const rx = cellW * (0.45 + hashRand(h + 3) * 0.25);
                const ry = cellH * (0.45 + hashRand(h + 4) * 0.25);

                const verts = 7;

                ctx.beginPath();

                for (let i = 0; i < verts; i++) {
                    const a = (Math.PI * 2 * i) / verts;
                    const wobble = 0.75 + hashRand(h + 10 + i) * 0.4;

                    const vx = cx + Math.cos(a) * rx * wobble;
                    const vy = cy + Math.sin(a) * ry * wobble;

                    if (i === 0) ctx.moveTo(vx, vy);
                    else ctx.lineTo(vx, vy);
                }

                ctx.closePath();

                // Fill (very light grey so ink still shows structure)
                ctx.fillStyle = "#f2f2f2";
                ctx.fill();

                // Outline
                ctx.strokeStyle = "#000";
                ctx.lineWidth = Math.max(1.2, ts * 0.025);
                ctx.stroke();
            }
        }

        ctx.restore();
    }


    /* =========================================================
    PRINT WORLD-SPACE STONE FLOOR
    ---------------------------------------------------------
    Creates a continuous field of irregular stones across the
    whole map, then clips it to floor tiles.

       This avoids the "each square has its own pattern" look.
    ========================================================= */

    function drawPrintWorldStoneFloor(ctx, G, map, ts, seed, optionsFloorScale = 0.5) {
        const cellSize = ts * (optionsFloorScale ?? 0.5);
        const jitter = 0.38;
        const neighbourRange = 2;

        const lineWidth = Math.max(1.2, ts * 0.025);

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

        // White floor base.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const minGX = Math.floor(0 / cellSize) - 2;
        const maxGX = Math.ceil((G.Gmapx + 2) * ts / cellSize) + 2;
        const minGY = Math.floor(0 / cellSize) - 2;
        const maxGY = Math.ceil((G.Gmapy + 2) * ts / cellSize) + 2;

        const polys = [];

        for (let gy = minGY; gy <= maxGY; gy++) {
            for (let gx = minGX; gx <= maxGX; gx++) {
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

                if (poly.length >= 3) polys.push(poly);
            }
        }

        // Fill stones first.
        ctx.fillStyle = "#ffffff";

        for (const poly of polys) {
            ctx.beginPath();
            ctx.moveTo(poly[0].x, poly[0].y);

            for (let i = 1; i < poly.length; i++) {
                ctx.lineTo(poly[i].x, poly[i].y);
            }

            ctx.closePath();
            ctx.fill();
        }

        // Then stroke all borders, so the grout reads consistently.
        ctx.strokeStyle = "rgba(0,0,0,0.82)";
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        for (const poly of polys) {
            ctx.beginPath();
            ctx.moveTo(poly[0].x, poly[0].y);

            for (let i = 1; i < poly.length; i++) {
                ctx.lineTo(poly[i].x, poly[i].y);
            }

            ctx.closePath();
            ctx.stroke();
        }

        ctx.restore();
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
   PRINT TEXTURED WALL TILE
   ---------------------------------------------------------
   Ink stipple wall texture.
   Dots are denser near exposed floor edges and thinner deeper
   inside solid wall.
========================================================= */

    function drawPrintTexturedWall(ctx, G, map, nx, ny, ts, x, y, seed) {
        const h = tileHash(x, y, seed);

        // Base paper colour.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(nx, ny, ts, ts);

        const wallN = isFloorTile(G, map, x, y - 1);
        const wallE = isFloorTile(G, map, x + 1, y);
        const wallS = isFloorTile(G, map, x, y + 1);
        const wallW = isFloorTile(G, map, x - 1, y);

        const exposed = wallN || wallE || wallS || wallW;

        ctx.save();
        ctx.beginPath();
        ctx.rect(nx, ny, ts, ts);
        ctx.clip();

        // More dots near exposed wall edges, fewer in deep rock.

        // TWEAK: Number of dots in exposed vs deep wall areas. Higher ratio = more texture contrast.
        const edgeDotCount = exposed ? 60 : 2;

        // TWEAK: Number of dots in the middle of the tile. Higher = more overall texture density.
        const centreDotCount = exposed ? 4 : 1; 

        ctx.fillStyle = "rgba(0,0,0,0.78)";

        function dot(px, py, r) {
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
        }

        function edgeDots(side, count, hashBase) {
            for (let i = 0; i < count; i++) {
                const ih = hashBase + i * 17;

                let px = nx + hashRand(ih + 1) * ts;
                let py = ny + hashRand(ih + 2) * ts;

                // Bias dots toward the exposed edge.
                const depth = Math.pow(hashRand(ih + 3), 3.8) * ts * 0.34; // tighter cluster near edge
                //const depth = Math.pow(hashRand(ih + 3), 2.2) * ts * 0.55; // looser cluster for more visible texture

                if (side === "north") py = ny + depth;
                if (side === "south") py = ny + ts - depth;
                if (side === "west") px = nx + depth;
                if (side === "east") px = nx + ts - depth;

                const r = Math.max(1.4, ts * (0.018 + hashRand(ih + 4) * 0.018));
                dot(px, py, r);
            }
        }

        if (wallN) edgeDots("north", edgeDotCount, h + 100);
        if (wallE) edgeDots("east", edgeDotCount, h + 200);
        if (wallS) edgeDots("south", edgeDotCount, h + 300);
        if (wallW) edgeDots("west", edgeDotCount, h + 400);

        // Sparse internal texture.
        for (let i = 0; i < centreDotCount; i++) {
            const ih = h + 600 + i * 19;
            const px = nx + ts * (0.15 + hashRand(ih + 1) * 0.70);
            const py = ny + ts * (0.15 + hashRand(ih + 2) * 0.70);
            const r = Math.max(1.1, ts * (0.012 + hashRand(ih + 3) * 0.012));
            dot(px, py, r);
        }

        // Varied little outlined rock
        if (hashRand(h + 900) < 0.20) {

            const cx = nx + ts * (0.20 + hashRand(h + 901) * 0.60);
            const cy = ny + ts * (0.20 + hashRand(h + 902) * 0.60);

            // Slight size variation
            const baseR = ts * (0.08 + hashRand(h + 903) * 0.10);

            // Random number of vertices (5–8)
            //const verts = 5 + Math.floor(hashRand(h + 904) * 4);
            const verts = 8 + Math.floor(hashRand(h + 904) * 4); // 8–11 sides

            ctx.strokeStyle = "rgba(0,0,0,0.75)";
            ctx.lineWidth = Math.max(1.3, ts * 0.03);

            ctx.beginPath();

            for (let i = 0; i < verts; i++) {
                const a = (Math.PI * 2 * i) / verts;

                // Per-point radial variation
                //const wobble = 0.6 + hashRand(h + 910 + i) * 0.9;
                const wobble = 0.82 + hashRand(h + 910 + i) * 0.28;

                const px = cx + Math.cos(a) * baseR * wobble;
                const py = cy + Math.sin(a) * baseR * wobble;

                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }

            ctx.closePath();

            // Fill with white first so it covers stipple dots underneath.
            ctx.fillStyle = "#ffffff";
            ctx.fill();

            ctx.stroke();

            // Rare little cracks in the rock.
            //if (hashRand(h + 950) > 0.5) {
            //    ctx.beginPath();
            //    ctx.moveTo(cx - baseR * 0.3, cy);
            //    ctx.lineTo(cx + baseR * 0.2, cy + baseR * 0.2);
            //    ctx.stroke();
            //}
        }

        ctx.restore();
    }

    /* =========================================================
        Wall Edge BRICK RUNS
    ========================================================= */
    function drawPrintBrickWallRuns(ctx, G, map, ts) {
        const seed = G._seedUsed || 0;

        const brickDepth = ts * 0.22;
        const brickOutline = Math.max(1.2, ts * 0.028);

        function drawBrick(x, y, w, h, hash) {
            ctx.save();

            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#000000";
            ctx.lineWidth = brickOutline;
            ctx.lineJoin = "round";

            const wobble = ts * 0.015;

            const x1 = x + (hashRand(hash + 1) - 0.5) * wobble;
            const y1 = y + (hashRand(hash + 2) - 0.5) * wobble;
            const x2 = x + w + (hashRand(hash + 3) - 0.5) * wobble;
            const y2 = y + h + (hashRand(hash + 4) - 0.5) * wobble;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x1, y2);
            ctx.closePath();

            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }

        function drawBrickCell(x, y, w, h, hash) {
            const r = hashRand(hash);

            if (r < 0.15) {
                drawBrick(x, y, w, h, hash + 1);
            } else if (r < 0.50) {
                drawBrick(x, y, w / 2, h, hash + 2);
                drawBrick(x + w / 2, y, w / 2, h, hash + 3);
            } else if (r < 0.75) {
                drawBrick(x, y, w, h / 2, hash + 4);
                drawBrick(x, y + h / 2, w, h / 2, hash + 5);
            } else {
                drawBrick(x, y, w / 2, h / 2, hash + 6);
                drawBrick(x + w / 2, y, w / 2, h / 2, hash + 7);
                drawBrick(x, y + h / 2, w, h / 2, hash + 8);
            }
        }

        function drawHorizontalRun(x1, x2, y, hashBase) {
            let x = x1;
            const cell = brickDepth;

            while (x < x2) {
                const w = Math.min(cell, x2 - x);
                drawBrickCell(
                    x,
                    y - brickDepth / 2,
                    w,
                    brickDepth,
                    tileHash(Math.floor(x), Math.floor(y), hashBase)
                );
                x += cell;
            }
        }

        function drawVerticalRun(x, y1, y2, hashBase) {
            let y = y1;
            const cell = brickDepth;

            while (y < y2) {
                const h = Math.min(cell, y2 - y);
                drawBrickCell(
                    x - brickDepth / 2,
                    y,
                    brickDepth,
                    h,
                    tileHash(Math.floor(x), Math.floor(y), hashBase)
                );
                y += cell;
            }
        }

        // Top edges
        for (let y = 1; y <= G.Gmapy; y++) {
            let runStart = null;

            for (let x = 1; x <= G.Gmapx + 1; x++) {
                const exposed =
                    x <= G.Gmapx &&
                    isFloorTile(G, map, x, y) &&
                    isWallTile(G, map, x, y - 1);

                if (exposed && runStart === null) runStart = x;

                if ((!exposed || x === G.Gmapx + 1) && runStart !== null) {
                    drawHorizontalRun(runStart * ts, x * ts, y * ts, tileHash(runStart, y, seed));
                    runStart = null;
                }
            }
        }

        // Bottom edges
        for (let y = 1; y <= G.Gmapy; y++) {
            let runStart = null;

            for (let x = 1; x <= G.Gmapx + 1; x++) {
                const exposed =
                    x <= G.Gmapx &&
                    isFloorTile(G, map, x, y) &&
                    isWallTile(G, map, x, y + 1);

                if (exposed && runStart === null) runStart = x;

                if ((!exposed || x === G.Gmapx + 1) && runStart !== null) {
                    drawHorizontalRun(runStart * ts, x * ts, (y + 1) * ts, tileHash(runStart, y + 99, seed));
                    runStart = null;
                }
            }
        }

        // Left edges
        for (let x = 1; x <= G.Gmapx; x++) {
            let runStart = null;

            for (let y = 1; y <= G.Gmapy + 1; y++) {
                const exposed =
                    y <= G.Gmapy &&
                    isFloorTile(G, map, x, y) &&
                    isWallTile(G, map, x - 1, y);

                if (exposed && runStart === null) runStart = y;

                if ((!exposed || y === G.Gmapy + 1) && runStart !== null) {
                    drawVerticalRun(x * ts, runStart * ts, y * ts, tileHash(x, runStart + 199, seed));
                    runStart = null;
                }
            }
        }

        // Right edges
        for (let x = 1; x <= G.Gmapx; x++) {
            let runStart = null;

            for (let y = 1; y <= G.Gmapy + 1; y++) {
                const exposed =
                    y <= G.Gmapy &&
                    isFloorTile(G, map, x, y) &&
                    isWallTile(G, map, x + 1, y);

                if (exposed && runStart === null) runStart = y;

                if ((!exposed || y === G.Gmapy + 1) && runStart !== null) {
                    drawVerticalRun((x + 1) * ts, runStart * ts, y * ts, tileHash(x + 299, runStart, seed));
                    runStart = null;
                }
            }
        }
    }

    /* =========================================================
        Wall Edge Dark Lines
    ========================================================= */
    function drawPrintDarkWallLines(ctx, G, map, ts) {
        const printWallOutlineMinWidth = 3;
        const printWallOutlineWidthRatio = 0.10;
        const printWallOutlineWobbleRatio = 0.03;

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
    }


    /* =========================================================
       PRINTABLE BLACK & WHITE RENDERER
    ========================================================= */

    function drawPrintableMap(ctx, G, map, tileSize, options) {

        // TWEAK: B/W water overlay.
        const printWaterOverlayOpacity = 0.05;
        const printWaterWaveOpacity = 0.45;

        const ts = tileSize;
        const seed = G._seedUsed || 0;

        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Wall Tile Style:
        // Plain      = dark solid fill
        // Crosshatch = hatch wall texture
        // Textured   = stippled ink wall texture
        for (let y = 0; y <= G.Gmapy + 1; y++) {
            for (let x = 0; x <= G.Gmapx + 1; x++) {
                if (isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                if (options.wallTileStyle === "plain") {
                    drawPrintPlainWall(ctx, nx, ny, ts);
                } else if (options.wallTileStyle === "crosshatch") {
                    drawStoneHatch(ctx, nx, ny, ts, x, y, seed);
                } else {
                    drawPrintTexturedWall(ctx, G, map, nx, ny, ts, x, y, seed);
                }
            }
        }

        // Floor and water.
        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (!isFloorTile(G, map, x, y)) continue;

                const nx = x * ts;
                const ny = y * ts;

                if (options.floorStyle === "stone") {
                    // Stone is drawn later as one continuous world-space layer.
                    drawFloorTileInk(ctx, nx, ny, ts, options.showGrid, options.floorScale);
                } else if (options.floorStyle === "cracked") {
                    drawFloorTileCracked(ctx, nx, ny, ts, options.showGrid, options.floorScale);
                } else if (options.floorStyle === "cobble") {
                    drawPrintCobbleFloor(ctx, nx, ny, ts, x, y, seed, options.floorScale);
                } else {
                    drawFloorTileInk(ctx, nx, ny, ts, options.showGrid, options.floorScale);
                }

                if (options.showWater && map[x][y].flood) {
                    ctx.fillStyle = `rgba(0,0,0,${printWaterOverlayOpacity})`;
                    ctx.fillRect(nx, ny, ts, ts);

                    drawWaterWaves(ctx, nx, ny, ts, `rgba(0,0,0,${printWaterWaveOpacity})`);
                }
            }
        }

        if (options.floorStyle === "stone") {
            drawPrintWorldStoneFloor(ctx, G, map, ts, seed, options.floorScale);
        }

        // Directional room shadows.
        // Uses the same N/E/S/W checkbox logic as the VTT renderer.
        drawPrintDirectionalWallShadows(ctx, G, map, ts, options.shadowDirections);

        if (options.wallEdgeStyle === "brick") {
            drawPrintBrickWallRuns(ctx, G, map, ts);
        } else {
            drawPrintDarkWallLines(ctx, G, map, ts);
        }

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
