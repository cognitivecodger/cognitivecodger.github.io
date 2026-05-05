(() => {
  function safeFilenamePart(value) {
    return String(value ?? "")
      .trim()
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  }

  function downloadCanvas(canvas, filename) {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function copyCanvas(sourceCanvas) {
    const canvas = document.createElement("canvas");
    canvas.width = sourceCanvas.width;
    canvas.height = sourceCanvas.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(sourceCanvas, 0, 0);

    return canvas;
  }

    function previewRender() {
        if (!window.Digyrinth) {
            alert("Digyrinth map state is not available.");
            return;
        }

        const state = window.Digyrinth.getState();
        const style = document.getElementById("exportStyle")?.value || "current";
        const tileSize = Math.max(8, Math.min(256, parseInt(document.getElementById("exportTileSize")?.value, 10) || 72));
        const showDoors = !!document.getElementById("exportShowDoors")?.checked;
        const showStartExit = !!document.getElementById("exportShowStartExit")?.checked;
        const showGrid = !!document.getElementById("exportShowGrid")?.checked;
        const showWater = !!document.getElementById("exportShowWater")?.checked;
        const floorStyle = document.getElementById("optFloorStyle")?.value || "cobble";
        const wallTileStyle = document.getElementById("optWallTileStyle")?.value || "textured";
        const wallEdgeStyle = document.getElementById("optWallEdgeStyle")?.value || "brick";
        const shadowDirections = {
            n: !!document.getElementById("exportShadowN")?.checked,
            e: !!document.getElementById("exportShadowE")?.checked,
            s: !!document.getElementById("exportShadowS")?.checked,
            w: !!document.getElementById("exportShadowW")?.checked
        };

        let canvas;

        if (style === "current") {
            canvas = copyCanvas(window.Digyrinth.getVisibleCanvas());
        } else {
            canvas = document.createElement("canvas");

            window.DigyrinthRenderers.renderMapToCanvas(canvas, state, style, {
                tileSize,
                showDoors,
                showStartExit,
                showGrid,
                showWater,
                floorStyle,
                wallTileStyle,
                wallEdgeStyle,
                shadowDirections,
            });
        }

        const dataUrl = canvas.toDataURL("image/png");
        const previewWindow = window.open();

        if (!previewWindow) {
            alert("Preview blocked by browser popup settings.");
            return;
        }

        previewWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Digyrinth Render Preview</title>
        <style>
          body {
            margin: 0;
            background: #111;
            color: #eee;
            font-family: system-ui, sans-serif;
            display: grid;
            place-items: center;
            min-height: 100vh;
          }

          img {
            max-width: 95vw;
            max-height: 95vh;
            image-rendering: pixelated;
            background: white;
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" alt="Digyrinth render preview">
      </body>
    </html>
  `);

        previewWindow.document.close();
    }


  function exportPng() {
    if (!window.Digyrinth) {
      alert("Digyrinth map state is not available.");
      return;
    }

    const state = window.Digyrinth.getState();
    const style = document.getElementById("exportStyle")?.value || "current";
    const tileSize = Math.max(8, Math.min(256, parseInt(document.getElementById("exportTileSize")?.value, 10) || 72));
    const showDoors = !!document.getElementById("exportShowDoors")?.checked;
    const showStartExit = !!document.getElementById("exportShowStartExit")?.checked;
      const showGrid = !!document.getElementById("exportShowGrid")?.checked;
      const showWater = !!document.getElementById("exportShowWater")?.checked;
      const floorStyle = document.getElementById("optFloorStyle")?.value || "cobble";
      const wallTileStyle = document.getElementById("optWallTileStyle")?.value || "textured";
      const wallEdgeStyle = document.getElementById("optWallEdgeStyle")?.value || "brick";
      const shadowDirections = {
          n: !!document.getElementById("exportShadowN")?.checked,
          e: !!document.getElementById("exportShadowE")?.checked,
          s: !!document.getElementById("exportShadowS")?.checked,
          w: !!document.getElementById("exportShadowW")?.checked
      };

    let canvas;

    if (style === "current") {
      canvas = copyCanvas(window.Digyrinth.getVisibleCanvas());
    } else {
      canvas = document.createElement("canvas");

        window.DigyrinthRenderers.renderMapToCanvas(canvas, state, style, {
            tileSize,
            showDoors,
            showStartExit,
            showGrid,
            showWater,
            floorStyle,
            wallTileStyle,
            wallEdgeStyle,
            shadowDirections,
        });
    }

    const seed = safeFilenamePart(state.G._seedUsed || "random");
    const filename = `digyrinth-${style}-${seed}.png`;

    downloadCanvas(canvas, filename);
  }

  const btn = document.getElementById("btnExportPng");

  if (btn) {
    btn.addEventListener("click", exportPng);
  }

  const previewBtn = document.getElementById("btnPreviewRender");

  if (previewBtn) {
    previewBtn.addEventListener("click", previewRender);
  }
})();