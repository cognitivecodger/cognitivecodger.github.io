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

    function setExportBusy(isBusy, text = "Rendering...") {

        const status = document.getElementById("exportStatus");
        const exportBtn = document.getElementById("btnExportPng");
        const previewBtn = document.getElementById("btnPreviewRender");

        if (status) status.textContent = isBusy ? text : "";
        if (exportBtn) exportBtn.disabled = isBusy;
        if (previewBtn) previewBtn.disabled = isBusy;

    }

    function nextFrame() {
        return new Promise(resolve => setTimeout(resolve, 30));
    }

    async function previewRender() {
        setExportBusy(true, "Rendering preview...");
        await nextFrame();

        try {
            if (!window.Digyrinth) {
                alert("Digyrinth map state is not available.");
                return;
            }

            const state = window.Digyrinth.ensureGenerated();

            const style = document.getElementById("exportStyle")?.value || "current";
            const tileSize = Math.max(8, Math.min(256, parseInt(document.getElementById("exportTileSize")?.value, 10) || 72));
            const showDoors = !!document.getElementById("exportShowDoors")?.checked;
            const showStartExit = !!document.getElementById("exportShowStartExit")?.checked;
            const showGrid = !!document.getElementById("exportShowGrid")?.checked;
            const showWater = !!document.getElementById("exportShowWater")?.checked;
            const floorStyle = document.getElementById("optFloorStyle")?.value || "cobble";
            const floorScale = Math.max(
                0.2,
                Math.min(1, parseFloat(document.getElementById("exportFloorScale")?.value) || 0.5)
            );
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
                    floorScale,
                    wallTileStyle,
                    wallEdgeStyle,
                    shadowDirections,
                });
            }

            const dataUrl = canvas.toDataURL("image/png");

            const overlay = document.getElementById("previewOverlay");
            const image = document.getElementById("previewImage");

            if (!overlay || !image) {
                alert("Preview panel is missing from the page.");
                return;
            }

            image.src = dataUrl;
            overlay.hidden = false;

            // Reset the preview viewer once the image has loaded.
            if (typeof window.resetPreviewViewer === "function") {
                if (image.complete) {
                    window.resetPreviewViewer();
                } else {
                    image.onload = () => window.resetPreviewViewer();
                }
            }

        } catch (err) {
            console.error(err);
            alert("Preview failed. Check the browser console for details.");
        } finally {
            setExportBusy(false);
        }
    }

    async function exportPng() {
        setExportBusy(true, "Rendering PNG...");
        await nextFrame();

        try {
            if (!window.Digyrinth) {
                alert("Digyrinth map state is not available.");
                return;
            }

            const state = window.Digyrinth.ensureGenerated();

            window.Digyrinth.ensureGenerated();

        const style = document.getElementById("exportStyle")?.value || "current";
        const tileSize = Math.max(8, Math.min(256, parseInt(document.getElementById("exportTileSize")?.value, 10) || 72));
        const showDoors = !!document.getElementById("exportShowDoors")?.checked;
        const showStartExit = !!document.getElementById("exportShowStartExit")?.checked;
        const showGrid = !!document.getElementById("exportShowGrid")?.checked;
        const showWater = !!document.getElementById("exportShowWater")?.checked;
        const floorStyle = document.getElementById("optFloorStyle")?.value || "cobble";
        const floorScale = Math.max(
            0.2,
            Math.min(1, parseFloat(document.getElementById("exportFloorScale")?.value) || 0.5)
        );
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
                floorScale,
                wallTileStyle,
                wallEdgeStyle,
                shadowDirections,
            });
        }

        const seed = safeFilenamePart(state.G._seedUsed || "random");
        const filename = `digyrinth-${style}-${seed}.png`;

        downloadCanvas(canvas, filename);
        } catch (err) {
            console.error(err);
            alert("Export failed. Check the browser console for details.");
        } finally {
            setExportBusy(false);
        }
    }

    const btn = document.getElementById("btnExportPng");

    if (btn) {
        btn.addEventListener("click", exportPng);
    }

    const previewBtn = document.getElementById("btnPreviewRender");

    if (previewBtn) {
        previewBtn.addEventListener("click", previewRender);
    }

    const floorScaleInput = document.getElementById("exportFloorScale");
    const floorScaleValue = document.getElementById("exportFloorScaleValue");

    if (floorScaleInput && floorScaleValue) {
        const updateFloorScaleValue = () => {
            floorScaleValue.textContent = Number(floorScaleInput.value).toFixed(2);
        };

        floorScaleInput.addEventListener("input", updateFloorScaleValue);
        updateFloorScaleValue();
    }

    const closePreviewBtn = document.getElementById("btnClosePreview");
    const previewOverlay = document.getElementById("previewOverlay");

    if (closePreviewBtn && previewOverlay) {
        closePreviewBtn.addEventListener("click", () => {
            previewOverlay.hidden = true;
        });
    }

    if (previewOverlay) {
        previewOverlay.addEventListener("click", (event) => {
            if (event.target === previewOverlay) {
                previewOverlay.hidden = true;
            }
        });
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && previewOverlay && !previewOverlay.hidden) {
            previewOverlay.hidden = true;
        }
    });

    /* =========================================================
   PREVIEW VIEWER ZOOM / PAN
   ---------------------------------------------------------
   Adds:
   - mouse wheel zoom
   - drag to pan
   - double-click reset
========================================================= */

    const previewViewer = document.getElementById("previewViewer");
    const previewImage = document.getElementById("previewImage");

    let previewScale = 1;
    let previewX = 0;
    let previewY = 0;
    let previewDragging = false;
    let previewDragStartX = 0;
    let previewDragStartY = 0;
    let previewStartX = 0;
    let previewStartY = 0;

    function updatePreviewTransform() {
        if (!previewImage) return;

        previewImage.style.transform =
            `translate(${previewX}px, ${previewY}px) scale(${previewScale})`;
    }

    function resetPreviewViewer() {
        if (!previewViewer || !previewImage) return;

        const vw = previewViewer.clientWidth;
        const vh = previewViewer.clientHeight;

        const iw = previewImage.naturalWidth || previewImage.width;
        const ih = previewImage.naturalHeight || previewImage.height;

        if (!vw || !vh || !iw || !ih) return;

        const fitScale = Math.min(vw / iw, vh / ih) * 0.95;

        previewScale = Math.max(0.05, fitScale);
        previewX = (vw - iw * previewScale) / 2;
        previewY = (vh - ih * previewScale) / 2;

        updatePreviewTransform();
    }

    function zoomPreviewAt(pointX, pointY, factor) {
        if (!previewViewer || !previewImage) return;

        const oldScale = previewScale;
        const newScale = Math.max(0.05, Math.min(16, previewScale * factor));

        const imageX = (pointX - previewX) / oldScale;
        const imageY = (pointY - previewY) / oldScale;

        previewScale = newScale;

        previewX = pointX - imageX * previewScale;
        previewY = pointY - imageY * previewScale;

        updatePreviewTransform();
    }

    // Make this callable from previewRender().
    window.resetPreviewViewer = resetPreviewViewer;

    if (previewViewer && previewImage) {
        previewViewer.addEventListener("wheel", (e) => {
            e.preventDefault();

            const rect = previewViewer.getBoundingClientRect();
            const pointX = e.clientX - rect.left;
            const pointY = e.clientY - rect.top;

            const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;

            zoomPreviewAt(pointX, pointY, factor);
        }, { passive: false });

        previewViewer.addEventListener("mousedown", (e) => {
            previewDragging = true;
            previewViewer.classList.add("dragging");

            previewDragStartX = e.clientX;
            previewDragStartY = e.clientY;
            previewStartX = previewX;
            previewStartY = previewY;
        });

        window.addEventListener("mousemove", (e) => {
            if (!previewDragging) return;

            previewX = previewStartX + (e.clientX - previewDragStartX);
            previewY = previewStartY + (e.clientY - previewDragStartY);

            updatePreviewTransform();
        });

        window.addEventListener("mouseup", () => {
            previewDragging = false;
            previewViewer.classList.remove("dragging");
        });

        previewViewer.addEventListener("dblclick", () => {
            resetPreviewViewer();
        });

        window.addEventListener("resize", () => {
            const overlay = document.getElementById("previewOverlay");

            if (overlay && !overlay.hidden) {
                resetPreviewViewer();
            }
        });
    }

})();