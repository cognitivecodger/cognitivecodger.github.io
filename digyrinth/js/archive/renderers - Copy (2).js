(() => {
  function isFloorTile(G, map, x, y) {
    return x >= 1 && x <= G.Gmapx && y >= 1 && y <= G.Gmapy && map[x][y].flr > 0;
  }

  function isWallTile(G, map, x, y) {
    return !isFloorTile(G, map, x, y);
  }

  function setupCanvas(canvas, G, tileSize) {
    canvas.width = tileSize * (G.Gmapx + 2);
    canvas.height = tileSize * (G.Gmapy + 2);

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    return ctx;
  }

  function drawClippedHatch(ctx, x, y, w, h, spacing, color, lineWidth) {
    ctx.save();

    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    for (let i = -h; i < w + h; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + h);
      ctx.lineTo(x + i + h, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawWaterWaves(ctx, x, y, ts, color) {
    ctx.save();

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

  function drawDoorAndKey(ctx, G, map, x, y, ts, style) {
    const nx = x * ts;
    const ny = y * ts;
    const block = map[x][y];

    if (block.doorType === 1) {
      const verticalDoor = isFloorTile(G, map, x - 1, y) && isFloorTile(G, map, x + 1, y);

      ctx.fillStyle = style === "print" ? "#000000" : "#7a4a16";

      if (verticalDoor) {
        ctx.fillRect(nx + ts * 0.42, ny + ts * 0.12, ts * 0.16, ts * 0.76);
      } else {
        ctx.fillRect(nx + ts * 0.12, ny + ts * 0.42, ts * 0.76, ts * 0.16);
      }
    }

    if (block.doorType === 2) {
      const verticalDoor = isFloorTile(G, map, x - 1, y) && isFloorTile(G, map, x + 1, y);

      ctx.fillStyle = style === "print" ? "#000000" : "#c46b19";

      if (verticalDoor) {
        ctx.fillRect(nx + ts * 0.35, ny + ts * 0.08, ts * 0.3, ts * 0.84);
      } else {
        ctx.fillRect(nx + ts * 0.08, ny + ts * 0.35, ts * 0.84, ts * 0.3);
      }

      if (ts >= 16) {
        ctx.fillStyle = style === "print" ? "#ffffff" : "#111111";
        ctx.font = `${Math.max(10, Math.floor(ts * 0.35))}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(block.doorId), nx + ts / 2, ny + ts / 2);
      }
    }

    if (block.keyId) {
      const cx = nx + ts / 2;
      const cy = ny + ts / 2;
      const size = ts * 0.24;

      ctx.fillStyle = style === "print" ? "#000000" : "#d89b25";
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size, cy);
      ctx.closePath();
      ctx.fill();

      if (ts >= 16) {
        ctx.fillStyle = style === "print" ? "#ffffff" : "#111111";
        ctx.font = `${Math.max(10, Math.floor(ts * 0.32))}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(block.keyId), cx, cy);
      }
    }
  }

  function drawStartExit(ctx, G, map, ts, style) {
    if (G.Gstartx > 0 && G.Gstarty > 0) {
      const x = G.Gstartx * ts;
      const y = G.Gstarty * ts;

      ctx.fillStyle = style === "print" ? "#ffffff" : "#2ecc71";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = Math.max(2, ts * 0.06);

      ctx.beginPath();
      ctx.arc(x + ts / 2, y + ts / 2, ts * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (ts >= 18) {
        ctx.fillStyle = "#000000";
        ctx.font = `${Math.max(10, Math.floor(ts * 0.28))}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("S", x + ts / 2, y + ts / 2);
      }
    }

    if (G._exitX > 0 && G._exitY > 0) {
      const x = G._exitX * ts;
      const y = G._exitY * ts;

      ctx.fillStyle = style === "print" ? "#ffffff" : "#e74c3c";
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = Math.max(2, ts * 0.06);

      ctx.beginPath();
      ctx.arc(x + ts / 2, y + ts / 2, ts * 0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (ts >= 18) {
        ctx.fillStyle = "#000000";
        ctx.font = `${Math.max(10, Math.floor(ts * 0.28))}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("E", x + ts / 2, y + ts / 2);
      }
    }
  }

  function drawPrintableMap(ctx, G, map, tileSize, options) {
    const ts = tileSize;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (let y = 1; y <= G.Gmapy; y++) {
      for (let x = 1; x <= G.Gmapx; x++) {
        if (!isFloorTile(G, map, x, y)) continue;

        const nx = x * ts;
        const ny = y * ts;

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(nx, ny, ts, ts);

        if (map[x][y].flood) {
          ctx.fillStyle = "#f1f1f1";
          ctx.fillRect(nx, ny, ts, ts);

          drawClippedHatch(
            ctx,
            nx + ts * 0.08,
            ny + ts * 0.08,
            ts * 0.84,
            ts * 0.84,
            Math.max(6, ts * 0.22),
            "#000000",
            Math.max(1, ts * 0.025)
          );
        }
      }
    }

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = Math.max(2, Math.floor(ts * 0.075));
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";

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

  function drawVttMap(ctx, G, map, tileSize, options) {
    const ts = tileSize;

    ctx.fillStyle = "#191715";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (let y = 0; y <= G.Gmapy + 1; y++) {
      for (let x = 0; x <= G.Gmapx + 1; x++) {
        const block = map[x][y];
        if (!block || block.flr <= 0) continue;

        const nx = x * ts;
        const ny = y * ts;

        if (block.flood) {
          ctx.fillStyle = "#243f52";
          ctx.fillRect(nx, ny, ts, ts);

          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.fillRect(nx + ts * 0.08, ny + ts * 0.08, ts * 0.84, ts * 0.84);

          drawWaterWaves(ctx, nx, ny, ts, "rgba(210,235,255,0.35)");
        } else {
          ctx.fillStyle = "#5f5b50";
          ctx.fillRect(nx, ny, ts, ts);

          ctx.fillStyle = "rgba(255,255,255,0.045)";
          ctx.fillRect(nx + ts * 0.08, ny + ts * 0.08, ts * 0.84, ts * 0.38);

          ctx.fillStyle = "rgba(0,0,0,0.10)";
          ctx.fillRect(nx + ts * 0.08, ny + ts * 0.58, ts * 0.84, ts * 0.34);
        }

        ctx.strokeStyle = "rgba(0,0,0,0.22)";
        ctx.lineWidth = Math.max(1, ts * 0.025);
        ctx.strokeRect(nx + 0.5, ny + 0.5, ts - 1, ts - 1);
      }
    }

    ctx.strokeStyle = "#24201b";
    ctx.lineWidth = Math.max(5, ts * 0.12);
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";

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

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = Math.max(1, ts * 0.025);

    for (let y = 1; y <= G.Gmapy; y++) {
      for (let x = 1; x <= G.Gmapx; x++) {
        if (!isFloorTile(G, map, x, y)) continue;

        const nx = x * ts;
        const ny = y * ts;

        ctx.strokeRect(nx + ts * 0.12, ny + ts * 0.12, ts * 0.76, ts * 0.76);
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

  function renderMapToCanvas(canvas, state, style, options = {}) {
    const { G, map } = state;
    const tileSize = options.tileSize || 72;
    const ctx = setupCanvas(canvas, G, tileSize);

    const renderOptions = {
      showDoors: options.showDoors !== false,
      showStartExit: options.showStartExit !== false,
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

  window.DigyrinthRenderers = {
    renderMapToCanvas,
  };
})();