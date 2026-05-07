(() => {
    // ---------- Utilities ----------
    const clamp = (v, lo = 0, hi = 1) => v < lo ? lo : (v > hi ? hi : v);

    const randInt = (rng, a, b) => {
        if (b === undefined) {
            b = a;
            a = 0;
        }
        return a + Math.floor(rng() * (b - a + 1));
    };

    function hashSeedToUint32(seedStr) {
        let h = 1779033703 ^ seedStr.length;

        for (let i = 0; i < seedStr.length; i++) {
            h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }

        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);

        return (h ^= h >>> 16) >>> 0;
    }

    function makeRNG(seed) {
        let t = seed >>> 0;

        return function () {
            t += 0x6D2B79F5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---------- Data Structures ----------
    class Block {
        constructor() {
            this.flr = 0;
            this.Notouch = false;
            this.flood = false;
            this.fire = false;
            this.undiggable = false;
            this.id = 0;
            this.dir = 0;
            this.undug = false;
            this.doorType = 0;
            this.doorId = 0;
            this.keyId = 0;
            this.teleportId = 0;
            this.teleportType = ""; // "branch" or "shortcut"
            this.teleportRole = ""; // "source" or "destination"
        }
    }

    // ---------- DOM ----------
    const els = {
        c: document.getElementById("c"),
        status: document.getElementById("status"),
        statsPanel: document.getElementById("statsPanel"),
        toggleSidebar: document.getElementById("toggleSidebar"),
        showProcess: document.getElementById("showProcess"),
        processSpeed: document.getElementById("processSpeed"),
        processSpeedValue: document.getElementById("processSpeedValue"),
        edgeStart: document.getElementById("edgeStart"),
        btnGenerate: document.getElementById("btnGenerate"),
        Gmapx: document.getElementById("Gmapx"),
        Gmapy: document.getElementById("Gmapy"),
        GPOMF: document.getElementById("GPOMF"),
        GCOBR: document.getElementById("GCOBR"),
        GCORR: document.getElementById("GCORR"),
        GCOJJ: document.getElementById("GCOJJ"),
        GCOFA: document.getElementById("GCOFA"),
        GCKSD: document.getElementById("GCKSD"),
        GMAXFJ: document.getElementById("GMAXFJ"),
        seed: document.getElementById("seed"),
        configCode: document.getElementById("configCode"),
        btnApplyCode: document.getElementById("btnApplyCode"),
        btnCopyCode: document.getElementById("btnCopyCode"),
        showArrows: document.getElementById("showArrows"),
        currentStatus: document.getElementById("currentStatus"),
        blockMin: document.getElementById("blockMin"),
        blockMax: document.getElementById("blockMax"),
        randMin: document.getElementById("randMin"),
        randMax: document.getElementById("randMax"),
        targetDoors: document.getElementById("targetDoors"),
        edgeRoughness: document.getElementById("edgeRoughness"),
        lockedDoorPct: document.getElementById("lockedDoorPct"),
        maxKeyId: document.getElementById("maxKeyId"),
        doorPlacementAttempts: document.getElementById("doorPlacementAttempts"),
        doorSpacing: document.getElementById("doorSpacing"),
        showTint: document.getElementById("showTint"),
        showWater: document.getElementById("showWater"),
        showDoors: document.getElementById("showDoors"),
        showExit: document.getElementById("showExit"),
        GCOTB: document.getElementById("GCOTB"),
        GCOTS: document.getElementById("GCOTS"),
        maxBranchTeleports: document.getElementById("maxBranchTeleports"),
        maxShortcutTeleports: document.getElementById("maxShortcutTeleports"),
        showTeleports: document.getElementById("showTeleports"),

        mapViewport: document.getElementById("mapViewport"),
        legendPanel: document.getElementById("legendPanel"),
        legendBody: document.getElementById("legendBody"),
        toggleLegend: document.getElementById("toggleLegend"),

    };

    const ctx = els.c.getContext("2d");

    // ---------- Globals ----------
    let G = {};
    let map = [];
    let choices = [];
    let rng = Math.random;
    let animHandle = null;
    let processStepAccumulator = 0;

    window.Digyrinth = {
        getState() {
            return { G, map };
        },

        getVisibleCanvas() {
            return els.c;
        },

        hasGeneratedMap() {
            return !!G._finished && G.Gstartx > 0;
        },

        ensureGenerated() {
            const alreadyGenerated = !!G._finished && G.Gstartx > 0;

            if (!alreadyGenerated) {
                run(false);
            }

            return { G, map };
        }
    };

    function setCurrentStatus(txt) {
        G._currentStatus = txt;
        if (els.currentStatus) els.currentStatus.textContent = txt;
    }

    function updateStats() {
        if (!els.statsPanel) return;

        const rows = [
            ["Seed", `${G._seedUsed ?? 0}`],
            ["Tiles", `${G.Gts ?? 0}px`],
            ["Failed Jumps", `${G.Gflops ?? 0}/${G.GMAXFJ ?? 0}`],
            ["POMF", `${G._pomfPlaced ?? 0}/${G._pomfTarget ?? 0}`],
            ["Mini-gaps", `${G._filledHoleCount ?? 0}/${G._fillableHoleCount ?? 0} filled`],
            ["Edge Roughness", `${G.edgeRoughness ?? 0}%`],
            ["Door tiles", `${G._doorCandidateCount ?? 0}`],
            ["Block Rooms", `${G._blockRoomCount ?? 0}`],
            ["Random Rooms", `${G._randomRoomCount ?? 0}`],
            ["Doors", `${G._doorCount ?? 0}/${G.targetDoors ?? 0}`],
            ["Unlocked Doors", `${G._unlockedDoorCount ?? 0}`],
            ["Locked Doors", `${G._lockedDoorCount ?? 0}`],
            ["Keys", `${G._keyCount ?? 0}`],
            ["Teleports", `${G._teleportCount ?? 0}`],
            ["Branch TPs", `${G._branchTeleportCount ?? 0}`],
            ["Shortcut TPs", `${G._shortcutTeleportCount ?? 0}`],
            ["Solvable locks", `${G._solvableLockedDoorCount ?? 0}`],
        ];

        els.statsPanel.innerHTML = rows
            .map(([label, value]) => `<div class="stat-row"><span>${label}</span><span>${value}</span></div>`)
            .join("");
    }

    function base64UrlEncode(str) {
        const bytes = new TextEncoder().encode(str);
        let binary = "";

        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }

        return btoa(binary)
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/g, "");
    }

    function base64UrlDecode(str) {
        const normalized = str.replace(/-/g, "+").replace(/_/g, "/");
        const pad = normalized.length % 4;
        const padded = normalized + (pad ? "=".repeat(4 - pad) : "");

        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);

        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        return new TextDecoder().decode(bytes);
    }

    function toB36(v) {
        return Math.max(0, Number(v) || 0).toString(36);
    }

    function fromB36(v, fallback = 0) {
        if (v === undefined || v === null || v === "") return fallback;
        const n = parseInt(String(v), 36);
        return Number.isFinite(n) ? n : fallback;
    }

    function encodeSeedCompact(seed) {
        const s = (seed || "").trim();

        if (!s) return "-";
        if (/^\d+$/.test(s)) return "n" + parseInt(s, 10).toString(36);

        return "t" + base64UrlEncode(s);
    }

    function decodeSeedCompact(seedCode) {
        if (!seedCode || seedCode === "-") return "";

        if (seedCode[0] === "n") {
            const n = parseInt(seedCode.slice(1), 36);
            return Number.isFinite(n) ? String(n) : "";
        }

        if (seedCode[0] === "t") {
            try {
                return base64UrlDecode(seedCode.slice(1));
            } catch {
                return "";
            }
        }

        return "";
    }

    function getFieldValue(id, fallback = "") {
        const el = document.getElementById(id);
        return el ? el.value : fallback;
    }

    function getFieldChecked(id) {
        const el = document.getElementById(id);
        return !!(el && el.checked);
    }

    function buildConfigObject() {
        return {
            v: 2,
            seed: getFieldValue("seed", "").trim(),
            Gmapx: parseInt(getFieldValue("Gmapx", "50")) || 50,
            Gmapy: parseInt(getFieldValue("Gmapy", "30")) || 30,
            GPOMF: parseInt(getFieldValue("GPOMF", "0")) || 0,
            GCOBR: parseInt(getFieldValue("GCOBR", "40")) || 40,
            blockMin: parseInt(getFieldValue("blockMin", "2")) || 2,
            blockMax: parseInt(getFieldValue("blockMax", "8")) || 8,
            GCORR: parseInt(getFieldValue("GCORR", "40")) || 40,
            randMin: parseInt(getFieldValue("randMin", "5")) || 5,
            randMax: parseInt(getFieldValue("randMax", "50")) || 50,
            edgeRoughness: parseInt(getFieldValue("edgeRoughness", "0")) || 0,
            GCOFA: parseInt(getFieldValue("GCOFA", "10")) || 10,
            GCOJJ: parseInt(getFieldValue("GCOJJ", "1000")) || 1000,
            GMAXFJ: parseInt(getFieldValue("GMAXFJ", "10")) || 10,
            GCKSD: parseInt(getFieldValue("GCKSD", "10")) || 10,
            edgeStart: getFieldChecked("edgeStart"),
            targetDoors: parseInt(getFieldValue("targetDoors", "40")) || 40,
            lockedDoorPct: parseInt(getFieldValue("lockedDoorPct", "35")) || 35,
            maxKeyId: parseInt(getFieldValue("maxKeyId", "9")) || 9,
            doorPlacementAttempts: parseInt(getFieldValue("doorPlacementAttempts", "100")) || 100,
            doorSpacing: parseInt(getFieldValue("doorSpacing", "3")) || 3,
            showProcess: getFieldChecked("showProcess"),
            showArrows: getFieldChecked("showArrows"),
            showTint: getFieldChecked("showTint"),
            showWater: getFieldChecked("showWater"),
            showDoors: getFieldChecked("showDoors"),
            showExit: getFieldChecked("showExit"),
            GCOTB: parseInt(getFieldValue("GCOTB", "0")) || 0,
            GCOTS: parseInt(getFieldValue("GCOTS", "0")) || 0,
            maxBranchTeleports: parseInt(getFieldValue("maxBranchTeleports", "3")) || 3,
            maxShortcutTeleports: parseInt(getFieldValue("maxShortcutTeleports", "3")) || 3,
            showTeleports: getFieldChecked("showTeleports"),
        };
    }

    function packFlags(cfg) {
        let flags = 0;

        if (cfg.edgeStart) flags |= 1;
        if (cfg.showProcess) flags |= 2;
        if (cfg.showArrows) flags |= 4;
        if (cfg.showTint) flags |= 8;
        if (cfg.showWater) flags |= 16;
        if (cfg.showDoors) flags |= 32;
        if (cfg.showExit) flags |= 64;
        if (cfg.showTeleports) flags |= 128;

        return flags;
    }

    function unpackFlags(flags) {
        return {
            edgeStart: !!(flags & 1),
            showProcess: !!(flags & 2),
            showArrows: !!(flags & 4),
            showTint: !!(flags & 8),
            showWater: !!(flags & 16),
            showDoors: !!(flags & 32),
            showExit: !!(flags & 64),
            showTeleports: !!(flags & 128),
        };
    }

    function generateConfigCode() {
        const cfg = buildConfigObject();

        const parts = [
            encodeSeedCompact(cfg.seed),
            toB36(cfg.Gmapx),
            toB36(cfg.Gmapy),
            toB36(cfg.GPOMF),
            toB36(cfg.GCOBR),
            toB36(cfg.blockMin),
            toB36(cfg.blockMax),
            toB36(cfg.GCORR),
            toB36(cfg.randMin),
            toB36(cfg.randMax),
            toB36(cfg.GCOFA),
            toB36(cfg.GCOJJ),
            toB36(cfg.GMAXFJ),
            toB36(cfg.GCKSD),
            toB36(cfg.targetDoors),
            toB36(cfg.lockedDoorPct),
            toB36(cfg.maxKeyId),
            toB36(cfg.doorPlacementAttempts),
            toB36(cfg.doorSpacing),
            toB36(cfg.edgeRoughness),
            toB36(cfg.GCOTB),
            toB36(cfg.GCOTS),
            toB36(cfg.maxBranchTeleports),
            toB36(cfg.maxShortcutTeleports),
            toB36(packFlags(cfg)),
        ];

        return "MG3-" + parts.join(".");
    }

    function refreshConfigCode(force = false) {
        if (!els.configCode) return;
        if (!force && document.activeElement === els.configCode) return;

        els.configCode.value = generateConfigCode();
    }

    function setFieldValue(id, value) {
        const el = document.getElementById(id);
        if (el && value !== undefined && value !== null) el.value = String(value);
    }

    function setFieldChecked(id, value) {
        const el = document.getElementById(id);
        if (el) el.checked = !!value;
    }

    function applyConfigObject(cfg) {
        setFieldValue("seed", cfg.seed ?? "");
        setFieldValue("Gmapx", cfg.Gmapx);
        setFieldValue("Gmapy", cfg.Gmapy);
        setFieldValue("GPOMF", cfg.GPOMF);
        setFieldValue("GCOBR", cfg.GCOBR);
        setFieldValue("blockMin", cfg.blockMin);
        setFieldValue("blockMax", cfg.blockMax);
        setFieldValue("GCORR", cfg.GCORR);
        setFieldValue("randMin", cfg.randMin);
        setFieldValue("randMax", cfg.randMax);
        setFieldValue("edgeRoughness", cfg.edgeRoughness ?? 0);
        setFieldValue("GCOFA", cfg.GCOFA);
        setFieldValue("GCOJJ", cfg.GCOJJ);
        setFieldValue("GMAXFJ", cfg.GMAXFJ);
        setFieldValue("GCKSD", cfg.GCKSD);
        setFieldChecked("edgeStart", cfg.edgeStart);

        setFieldValue("targetDoors", cfg.targetDoors);
        setFieldValue("lockedDoorPct", cfg.lockedDoorPct);
        setFieldValue("maxKeyId", cfg.maxKeyId);
        setFieldValue("doorPlacementAttempts", cfg.doorPlacementAttempts);
        setFieldValue("doorSpacing", cfg.doorSpacing);

        setFieldChecked("showProcess", cfg.showProcess);
        setFieldChecked("showArrows", cfg.showArrows);
        setFieldChecked("showTint", cfg.showTint);
        setFieldChecked("showWater", cfg.showWater);
        setFieldChecked("showDoors", cfg.showDoors);
        setFieldChecked("showExit", cfg.showExit);

        setFieldValue("GCOTB", cfg.GCOTB ?? 0);
        setFieldValue("GCOTS", cfg.GCOTS ?? 0);
        setFieldValue("maxBranchTeleports", cfg.maxBranchTeleports ?? 3);
        setFieldValue("maxShortcutTeleports", cfg.maxShortcutTeleports ?? 3);
        setFieldChecked("showTeleports", cfg.showTeleports ?? true);
    }

    function parseCompactCode(raw) {
        const code = (raw || "").trim();

        if (!code) return null;

        if (code.startsWith("MG1-")) {
            const payload = code.slice(4);
            return JSON.parse(base64UrlDecode(payload));
        }

        const isMG3 = code.startsWith("MG3-");
        const isMG2 = code.startsWith("MG2-");

        const payload = isMG3 ? code.slice(4) : (isMG2 ? code.slice(4) : code);
        const parts = payload.split(".");

        if (parts.length < 21) throw new Error("Invalid compact code");

        const flagsIndex = isMG3 ? 24 : 20;
        const flags = unpackFlags(fromB36(parts[flagsIndex], 0));

        return {
            v: isMG3 ? 3 : 2,
            seed: decodeSeedCompact(parts[0]),
            Gmapx: fromB36(parts[1], 50),
            Gmapy: fromB36(parts[2], 30),
            GPOMF: fromB36(parts[3], 0),
            GCOBR: fromB36(parts[4], 40),
            blockMin: fromB36(parts[5], 2),
            blockMax: fromB36(parts[6], 8),
            GCORR: fromB36(parts[7], 40),
            randMin: fromB36(parts[8], 5),
            randMax: fromB36(parts[9], 50),
            GCOFA: fromB36(parts[10], 10),
            GCOJJ: fromB36(parts[11], 1000),
            GMAXFJ: fromB36(parts[12], 10),
            GCKSD: fromB36(parts[13], 10),
            targetDoors: fromB36(parts[14], 40),
            lockedDoorPct: fromB36(parts[15], 35),
            maxKeyId: fromB36(parts[16], 9),
            doorPlacementAttempts: fromB36(parts[17], 100),
            doorSpacing: fromB36(parts[18], 3),
            edgeRoughness: fromB36(parts[19], 0),

            GCOTB: isMG3 ? fromB36(parts[20], 0) : 0,
            GCOTS: isMG3 ? fromB36(parts[21], 0) : 0,
            maxBranchTeleports: isMG3 ? fromB36(parts[22], 3) : 3,
            maxShortcutTeleports: isMG3 ? fromB36(parts[23], 3) : 3,

            ...flags,
        };
    }

    function applyConfigCode(raw) {
        const cfg = parseCompactCode(raw);

        if (!cfg) return false;

        applyConfigObject(cfg);
        refreshConfigCode(true);
        setCurrentStatus("Code applied");

        return true;
    }

    function readConfig() {
        const width = clamp(parseInt(els.Gmapx.value) || 30, 4, 512);
        const height = clamp(parseInt(els.Gmapy.value) || 20, 4, 512);

        G.Gmapx = width;
        G.Gmapy = height;
        G.GPOMF = clamp(parseInt(els.GPOMF.value) || 0, 0, 90);
        G.GCOBR = Math.max(0, parseInt(els.GCOBR.value) || 0);
        G.GCORR = Math.max(0, parseInt(els.GCORR.value) || 0);
        G.GCOJJ = Math.max(0, parseInt(els.GCOJJ.value) || 0);
        G.GCOTB = Math.max(0, parseInt(els.GCOTB?.value) || 0);
        G.GCOTS = Math.max(0, parseInt(els.GCOTS?.value) || 0);
        G.maxBranchTeleports = clamp(parseInt(els.maxBranchTeleports?.value) || 0, 0, 99);
        G.maxShortcutTeleports = clamp(parseInt(els.maxShortcutTeleports?.value) || 0, 0, 99);
        G.GCOFA = Math.max(0, parseInt(els.GCOFA.value) || 0);
        G.GCKSD = clamp(parseInt(els.GCKSD.value) || 10, 1, 100);
        G.GMAXFJ = clamp(parseInt(els.GMAXFJ.value) || 10, 1, 1000);
        G.edgeStart = !!els.edgeStart?.checked;
        G.showArrows = !!els.showArrows?.checked;

        G.showTint = !!els.showTint?.checked;
        G.showWater = !!els.showWater?.checked;
        G.showDoors = !!els.showDoors?.checked;
        G.showExit = !!els.showExit?.checked;
        G.showTeleports = !!els.showTeleports?.checked;

        G.targetDoors = clamp(parseInt(els.targetDoors.value) || 0, 0, 500);
        G.lockedDoorPct = clamp(parseInt(els.lockedDoorPct.value) || 0, 0, 100);
        G.maxKeyId = clamp(parseInt(els.maxKeyId.value) || 9, 1, 99);
        G.doorPlacementAttempts = clamp(parseInt(els.doorPlacementAttempts.value) || 100, 1, 1000);
        G.doorSpacing = clamp(parseInt(els.doorSpacing.value) || 3, 0, 20);

        const bMin = Math.max(2, parseInt(els.blockMin.value) || 2);
        const bMax = Math.max(bMin, parseInt(els.blockMax.value) || bMin);

        G.blockMin = bMin;
        G.blockMax = bMax;

        const rMin = Math.max(5, parseInt(els.randMin.value) || 5);
        const rMax = Math.max(rMin, parseInt(els.randMax.value) || rMin);

        G.randMin = rMin;
        G.randMax = rMax;
        G.edgeRoughness = clamp(parseInt(els.edgeRoughness.value) || 0, 0, 100);

        const s = els.seed.value.trim();

        if (s === "") {
            const r =
                self.crypto && self.crypto.getRandomValues
                    ? self.crypto.getRandomValues(new Uint32Array(1))[0]
                    : Math.floor(Math.random() * 4294967296);

            G._seedUsed = r >>> 0;
            rng = makeRNG(r);
        } else {
            const isInt = /^\d+$/.test(s);
            const seedNum = isInt ? parseInt(s, 10) >>> 0 : hashSeedToUint32(s);

            G._seedUsed = seedNum >>> 0;
            rng = makeRNG(seedNum);
        }
    }

    function allocateMap() {
        map = Array.from({ length: G.Gmapx + 2 }, () =>
            Array.from({ length: G.Gmapy + 2 }, () => new Block())
        );
    }

    // ---------- Helpers matching original semantics ----------
    function random(a, b) {
        if (a === undefined) return 0;
        if (b === undefined) return randInt(rng, 0, a);
        return randInt(rng, a, b);
    }

    function wallcount(x, y) {
        let count = 0;

        if (x === 0 || x === G.Gmapx + 1 || y === 0 || y === G.Gmapy + 1) {
            count++;
        } else {
            if (map[x - 1][y].flr === 0) count++;
            if (map[x + 1][y].flr === 0) count++;
            if (map[x][y - 1].flr === 0) count++;
            if (map[x][y + 1].flr === 0) count++;
        }

        return count;
    }

    function add_choice(nx, ny, adj = 2, eq = 1, mustbewall = true, dir = 0) {
        const walls = wallcount(nx, ny);
        let wll = false;

        if (eq === 1 && walls > adj) wll = true;
        if (eq === 0 && walls === adj) wll = true;
        if (eq === -1 && walls < adj) wll = true;

        if (map[nx][ny].undiggable) wll = false;
        if (map[nx][ny].Notouch) wll = false;

        const keepWeight = G.Gprevious === dir ? G.GCKSD : 1;

        if ((map[nx][ny].flr === 0 || !mustbewall) && wll) {
            for (let t = 0; t < keepWeight; t++) choices.push(dir);
        }
    }

    function choose_direction(x = 0, y = 0, adj = 2, eq = 1, mustbewall = true) {
        choices.length = 0;

        add_choice(x + 1, y, adj, eq, mustbewall, 1);
        add_choice(x - 1, y, adj, eq, mustbewall, 2);
        add_choice(x, y - 1, adj, eq, mustbewall, 3);
        add_choice(x, y + 1, adj, eq, mustbewall, 4);

        let move = 0;

        if (choices.length > 0) {
            move = choices[random(1, choices.length) - 1];
        }

        G.Gprevious = move;

        return move;
    }

    function dig(x = 0, y = 0, env = 1) {
        if (x === 0) x = G.Gdx;
        if (y === 0) y = G.Gdy;

        if (map[x][y].flr === 0) {
            map[x][y].flr = env;
            G.Gid++;
        }

        let di = G.Gid;

        if (map[x + 1][y].id > 0 && map[x + 1][y].id <= di) {
            di = map[x + 1][y].id;
            map[x][y].dir = 1;
        }

        if (map[x - 1][y].id > 0 && map[x - 1][y].id <= di) {
            di = map[x - 1][y].id;
            map[x][y].dir = 2;
        }

        if (map[x][y - 1].id > 0 && map[x][y - 1].id <= di) {
            di = map[x][y - 1].id;
            map[x][y].dir = 3;
        }

        if (map[x][y + 1].id > 0 && map[x][y + 1].id <= di) {
            di = map[x][y + 1].id;
            map[x][y].dir = 4;
        }

        di = di + 1;
        map[x][y].id = di;
    }


    function tileTouchesTeleport(x, y) {
        return (
            !!map[x - 1]?.[y]?.teleportId ||
            !!map[x + 1]?.[y]?.teleportId ||
            !!map[x]?.[y - 1]?.teleportId ||
            !!map[x]?.[y + 1]?.teleportId
        );
    }

    function undig(x = 0, y = 0) {
        const b = map[x]?.[y];

        if (!b) return false;

        // Do not let cleanup remove important feature tiles.
        if (b.teleportId) return false;

        // Do not remove the access tile beside a teleport.
        // This helps stop portals becoming isolated by cleanup.
        if (tileTouchesTeleport(x, y)) return false;

        if (x === G.Gstartx && y === G.Gstarty) return false;
        if (x === G._exitX && y === G._exitY) return false;

        b.flr = 0;
        b.dir = 0;
        b.id = 0;
        b.undug = true;

        return true;
    }

    // ---------- Init / meta ----------
    function initialize_map(undiggableborder = true) {
        for (let y = 0; y <= G.Gmapy + 1; y++) {
            for (let x = 0; x <= G.Gmapx + 1; x++) {
                map[x][y] = new Block();

                if (undiggableborder) {
                    if (y === 0 || x === 0 || y === G.Gmapy + 1 || x === G.Gmapx + 1) {
                        map[x][y].Notouch = true;
                    }
                }
            }
        }
    }

    function enforceSingleStartEntrance(entranceX, entranceY) {
        if (G._startEntranceEnforced) return;

        const sx = G.Gstartx;
        const sy = G.Gstarty;
        const dirs = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ];

        for (const [dx, dy] of dirs) {
            const nx = sx + dx;
            const ny = sy + dy;

            if (nx < 1 || nx > G.Gmapx || ny < 1 || ny > G.Gmapy) continue;
            if (nx === entranceX && ny === entranceY) continue;

            map[nx][ny].Notouch = true;
        }

        G._startEntranceEnforced = true;
    }

    function setup_notouchzones() {
        const W = G.Gmapx + 2;
        const H = G.Gmapy + 2;
        const idx = (x, y) => y * W + x;

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                map[x][y].Notouch = false;
            }
        }

        const diggableMask = () => {
            const m = new Uint8Array(W * H);

            for (let y = 1; y <= G.Gmapy; y++) {
                for (let x = 1; x <= G.Gmapx; x++) {
                    m[idx(x, y)] = map[x][y].Notouch ? 0 : 1;
                }
            }

            return m;
        };

        const bfsCount = (mask) => {
            let sx = -1;
            let sy = -1;

            for (let y = 1; y <= G.Gmapy && sx < 0; y++) {
                for (let x = 1; x <= G.Gmapx; x++) {
                    if (mask[idx(x, y)] === 1) {
                        sx = x;
                        sy = y;
                        break;
                    }
                }
            }

            if (sx < 0) return 0;

            const seen = new Uint8Array(W * H);
            const qx = new Int32Array(W * H);
            const qy = new Int32Array(W * H);

            let qh = 0;
            let qt = 0;
            let count = 0;

            const push = (x, y) => {
                const i = idx(x, y);

                if (!seen[i] && mask[i] === 1) {
                    seen[i] = 1;
                    qx[qt] = x;
                    qy[qt] = y;
                    qt++;
                }
            };

            push(sx, sy);

            while (qh < qt) {
                const x = qx[qh];
                const y = qy[qh];

                qh++;
                count++;

                if (x > 1) push(x - 1, y);
                if (x < G.Gmapx) push(x + 1, y);
                if (y > 1) push(x, y - 1);
                if (y < G.Gmapy) push(x, y + 1);
            }

            return count;
        };

        const countOnes = (mask) => {
            let c = 0;

            for (let y = 1; y <= G.Gmapy; y++) {
                for (let x = 1; x <= G.Gmapx; x++) {
                    if (mask[idx(x, y)] === 1) c++;
                }
            }

            return c;
        };

        const placeRectCandidate = (targetLeft) => {
            const maxW = Math.max(2, Math.floor(G.Gmapx / 3));
            const maxH = Math.max(2, Math.floor(G.Gmapy / 3));

            const w = Math.max(
                1,
                Math.min(maxW, 1 + Math.floor(-Math.log(1 - Math.max(1e-6, rng())) * 4))
            );

            const h = Math.max(
                1,
                Math.min(maxH, 1 + Math.floor(-Math.log(1 - Math.max(1e-6, rng())) * 4))
            );

            const x1 = random(1, Math.max(1, G.Gmapx - w + 1));
            const y1 = random(1, Math.max(1, G.Gmapy - h + 1));

            const cells = [];
            let add = 0;

            for (let y = y1; y < y1 + h; y++) {
                for (let x = x1; x < x1 + w; x++) {
                    if (map[x][y].Notouch) continue;

                    cells.push([x, y]);
                    add++;

                    if (add >= targetLeft) break;
                }

                if (add >= targetLeft) break;
            }

            if (add === 0) return 0;

            for (const [x, y] of cells) map[x][y].Notouch = true;

            const m2 = diggableMask();
            const ok = countOnes(m2) === bfsCount(m2);

            if (ok) return add;

            for (const [x, y] of cells) map[x][y].Notouch = false;

            return 0;
        };

        const interior = G.Gmapx * G.Gmapy;
        const target = Math.floor(interior * (G.GPOMF / 100));

        let placed = 0;

        if (target <= 0) {
            G._pomfTarget = 0;
            G._pomfPlaced = 0;
            return;
        }

        let attempts = 0;
        const maxAttempts = Math.max(100, Math.min(5000, target * 20));

        while (placed < target && attempts < maxAttempts) {
            const before = placed;
            const delta = placeRectCandidate(target - placed);

            if (delta > 0) placed += delta;

            attempts++;

            if (attempts % 200 === 0 && placed === before) {
                const x = random(1, G.Gmapx);
                const y = random(1, G.Gmapy);

                if (!map[x][y].Notouch) {
                    map[x][y].Notouch = true;

                    const m2 = diggableMask();

                    if (countOnes(m2) === bfsCount(m2)) {
                        placed++;
                    } else {
                        map[x][y].Notouch = false;
                    }
                }
            }
        }

        G._pomfTarget = target;
        G._pomfPlaced = placed;
    }

    function initialize_digger(edgeStart = false) {
        let attempt = 0;

        if (edgeStart) {
            const positions = [];

            for (let x = 1; x <= G.Gmapx; x++) {
                positions.push([x, 1]);
                positions.push([x, G.Gmapy]);
            }

            for (let y = 2; y <= G.Gmapy - 1; y++) {
                positions.push([1, y]);
                positions.push([G.Gmapx, y]);
            }

            for (let i = positions.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                const tmp = positions[i];
                positions[i] = positions[j];
                positions[j] = tmp;
            }

            let found = false;

            for (const [sx, sy] of positions) {
                if (map[sx][sy].flr === 0 && !map[sx][sy].Notouch) {
                    G.Gdx = sx;
                    G.Gdy = sy;
                    found = true;
                    break;
                }
            }

            if (!found) {
                while (attempt++ < 10000) {
                    G.Gdx = random(1, G.Gmapx);
                    G.Gdy = random(1, G.Gmapy);

                    if (map[G.Gdx][G.Gdy].flr === 0 && !map[G.Gdx][G.Gdy].Notouch) break;
                }
            }
        } else {
            while (attempt++ < 10000) {
                G.Gdx = random(1, G.Gmapx);
                G.Gdy = random(1, G.Gmapy);

                if (map[G.Gdx][G.Gdy].flr === 0 && !map[G.Gdx][G.Gdy].Notouch) break;
            }
        }

        dig(G.Gdx, G.Gdy);

        G.Gstartx = G.Gdx;
        G.Gstarty = G.Gdy;
    }

    function map_undiggable_edges() {
        map[G.Gdx][G.Gdy].flr = 0;

        for (let yy = 1; yy <= G.Gmapy; yy++) {
            for (let xx = 1; xx <= G.Gmapx; xx++) {
                const c = wallcount(xx, yy);

                if (c < 4 && map[xx][yy].flr === 0) {
                    map[xx][yy].undiggable = true;
                } else {
                    map[xx][yy].undiggable = false;
                }

                if (map[xx][yy].flr === 1) {
                    map[xx][yy].undiggable = true;
                }
            }
        }

        map[G.Gdx][G.Gdy].flr = 1;
    }

    function release_undiggables() {
        for (let yy = 1; yy <= G.Gmapy; yy++) {
            for (let xx = 1; xx <= G.Gmapx; xx++) {
                map[xx][yy].undiggable = false;
            }
        }
    }

    // ---------- Room planning ----------
    function planBlockRoom(x = 0, y = 0) {
        map_undiggable_edges();

        let finished = false;
        let failed = 0;
        let plan = null;
        let lastxx = 0;
        let lastyy = 0;
        let flood = false;

        // blockMin/blockMax are now interpreted as room edge limits,
        // not total cell counts.
        //
        // Example:
        // blockMin = 2
        // blockMax = 8
        //
        // Allows rooms such as:
        // 2x2, 3x5, 8x2, 6x6, 8x8
        const minEdge = Math.max(2, Math.min(G.blockMin, G.blockMax));
        const maxEdge = Math.max(minEdge, G.blockMax);

        while (!finished && failed < 100) {
            /*
              Mixed room shape logic:
        
              1. Roll a long edge.
              2. Roll the short edge from minEdge up to longEdge.
              3. Randomly rotate.
        
              This allows square rooms, chunky rooms, and rectangular rooms,
              but avoids extremely silly shapes unless maxEdge is very high.
            */
            const longEdge = random(minEdge, maxEdge);
            const shortEdge = random(minEdge, longEdge);

            let w;
            let h;

            if (random(0, 1) === 0) {
                w = longEdge;
                h = shortEdge;
            } else {
                w = shortEdge;
                h = longEdge;
            }

            // Clamp to current map size just in case the user enters values
            // larger than the map itself.
            w = Math.min(w, G.Gmapx);
            h = Math.min(h, G.Gmapy);

            const dirX = random(0, 1) === 1 ? -1 : 1;
            const dirY = random(0, 1) === 1 ? -1 : 1;

            let fail = false;
            const cells = [];

            for (let ox = 0; ox < w; ox++) {
                for (let oy = 0; oy < h; oy++) {
                    const xx = x + (dirX === 1 ? ox : -ox);
                    const yy = y + (dirY === 1 ? oy : -oy);

                    if (xx < 1 || xx > G.Gmapx || yy < 1 || yy > G.Gmapy) {
                        fail = true;
                        continue;
                    }

                    const b = map[xx][yy];
                    const isOrigin = ox === 0 && oy === 0;

                    if ((b.undiggable || b.flr !== 0 || b.Notouch) && !isOrigin) {
                        fail = true;
                    }

                    cells.push([xx, yy]);

                    lastxx = dirX === 1 ? ox : -ox;
                    lastyy = dirY === 1 ? oy : -oy;
                }
            }

            if (!fail && cells.length > 0) {
                flood = G.GCOFA > 0 && random(G.GCOFA) === 1;

                plan = {
                    type: "block",
                    cells,
                    end: [x + lastxx, y + lastyy],
                    flood,
                };

                finished = true;
            } else {
                failed++;
            }
        }

        if (!plan) {
            release_undiggables();
            return null;
        }

        return plan;
    }

    function planRandRoom(x = 0, y = 0) {
        map_undiggable_edges();

        const digmax = random(G.randMin, G.randMax);
        const flood = G.GCOFA > 0 && random(G.GCOFA) === 1;

        return {
            type: "rand",
            x,
            y,
            remain: digmax,
            flood,
        };
    }

    // ---------- Post-process ----------
    function solo_hole_filler() {
        const fillableHoles = [];

        // First collect every mini-gap that could be filled.
        for (let yy = 1; yy <= G.Gmapy; yy++) {
            for (let xx = 1; xx <= G.Gmapx; xx++) {

                if (map[xx][yy].teleportId) continue;
                if (tileTouchesTeleport(xx, yy)) continue;

                if (wallcount(xx, yy) === 3) {
                    let nx = xx;
                    let ny = yy;

                    switch (map[xx][yy].dir) {
                        case 1:
                            nx = nx - 1;
                            break;
                        case 2:
                            nx = nx + 1;
                            break;
                        case 3:
                            ny = ny - 1;
                            break;
                        case 4:
                            ny = ny + 1;
                            break;
                    }

                    if (wallcount(nx, ny) < 2) {
                        fillableHoles.push({ x: xx, y: yy });
                    }
                }
            }
        }

        // Edge Roughness %
        // 0   = fill all mini-gaps
        // 100 = keep all mini-gaps
        const keepChance = (G.edgeRoughness ?? 0) / 100;

        for (const hole of fillableHoles) {
            if (rng() < keepChance) continue;
            undig(hole.x, hole.y);
        }

        G._fillableHoleCount = fillableHoles.length;
        G._filledHoleCount = fillableHoles.length - Math.round(fillableHoles.length * keepChance);
    }

    function computeExitTile() {
        let bestId = -1;
        let bx = 0;
        let by = 0;

        // Prefer an existing floor tile that is a dead-end:
        // exactly one neighbouring floor tile, meaning three adjacent walls.
        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                const b = map[x][y];
                if (!b || b.flr <= 0) continue;
                if (x === G.Gstartx && y === G.Gstarty) continue;

                const openNeighbours =
                    (isFloorTile(x + 1, y) ? 1 : 0) +
                    (isFloorTile(x - 1, y) ? 1 : 0) +
                    (isFloorTile(x, y + 1) ? 1 : 0) +
                    (isFloorTile(x, y - 1) ? 1 : 0);

                if (openNeighbours !== 1) continue;

                const id = b.id || 0;

                if (id > bestId) {
                    bestId = id;
                    bx = x;
                    by = y;
                }
            }
        }

        // Fallback: if no dead-end exists, use the old behaviour.
        // This keeps the generator robust.
        if (bestId < 0) {
            for (let y = 1; y <= G.Gmapy; y++) {
                for (let x = 1; x <= G.Gmapx; x++) {
                    const b = map[x][y];
                    if (!b || b.flr <= 0) continue;
                    if (x === G.Gstartx && y === G.Gstarty) continue;

                    const id = b.id || 0;

                    if (id > bestId) {
                        bestId = id;
                        bx = x;
                        by = y;
                    }
                }
            }
        }

        if (bestId > 0) {
            G._exitX = bx;
            G._exitY = by;
        } else {
            G._exitX = 0;
            G._exitY = 0;
        }
    }

    // ---------- Main generation phase ----------
    function DiggerPhase(showprocess = false, stepLimit = 1e6) {
        G.Gflops = 0;

        let steps = 0;

        setCurrentStatus("Digging");

        while (G.Gflops < G.GMAXFJ && steps < stepLimit) {
            let attempt = 0;
            let mv = choose_direction(G.Gdx, G.Gdy);

            if (
                !G._startEntranceEnforced &&
                G.Gdx === G.Gstartx &&
                G.Gdy === G.Gstarty &&
                mv >= 1 &&
                mv <= 4
            ) {
                let ex = G.Gdx;
                let ey = G.Gdy;

                if (mv === 1) ex = G.Gdx + 1;
                else if (mv === 2) ex = G.Gdx - 1;
                else if (mv === 3) ey = G.Gdy - 1;
                else if (mv === 4) ey = G.Gdy + 1;

                enforceSingleStartEntrance(ex, ey);
            }

            if (mv === 0) setCurrentStatus("Jumping jack");
            else if (mv >= 1 && mv <= 4) setCurrentStatus("Digging");
            else if (mv === 5) setCurrentStatus("Block room");
            else if (mv === 6) setCurrentStatus("Random room");

            if (G.GCOBR > 0 && random(G.GCOBR) === 1) {
                mv = 5;
                G.Gprevious = 0;
            }

            if (mv !== 5 && G.GCORR > 0 && random(G.GCORR) === 1) {
                mv = 6;
                G.Gprevious = 0;
            }

            if (G.GCOJJ > 0 && random(G.GCOJJ) === 1) {
                mv = 0;
            }

            if (mv !== 5 && mv !== 6 && tryTeleportJump()) {
                steps++;
                continue;
            }

            if (mv === 0) {
                let ok = false;
                let nx = 0;
                let ny = 0;

                while (!ok && attempt < 900) {
                    attempt++;

                    nx = random(1, G.Gmapx);
                    ny = random(1, G.Gmapy);

                    let wll = true;

                    if (wallcount(nx, ny) !== 3) wll = false;
                    if (map[nx][ny].flr !== 0) wll = false;
                    if (map[nx][ny].undiggable || map[nx][ny].Notouch) wll = false;

                    // Do not let ordinary jumping jack dig onto or beside teleport pads.
                    if (map[nx][ny].teleportId) wll = false;
                    if (tileNearTeleport(nx, ny, 1)) wll = false;

                    if (wll) ok = true;
                }

                if (attempt < 900) {
                    G.Gdx = nx;
                    G.Gdy = ny;
                }
            } else if (mv === 1) {
                G.Gdx++;
            } else if (mv === 2) {
                G.Gdx--;
            } else if (mv === 3) {
                G.Gdy--;
            } else if (mv === 4) {
                G.Gdy++;
            } else if (mv === 5) {
                const plan = planBlockRoom(G.Gdx, G.Gdy);

                if (plan) {
                    setCurrentStatus("Block room");
                    G._blockRoomCount++;

                    for (const [X, Y] of plan.cells) {
                        dig(X, Y);
                        map[X][Y].flood = plan.flood;
                    }

                    G.Gdx = plan.end[0];
                    G.Gdy = plan.end[1];
                }

                release_undiggables();
            } else if (mv === 6) {
                const plan = planRandRoom(G.Gdx, G.Gdy);

                if (plan) {
                    setCurrentStatus("Random room");
                    G._randomRoomCount++;

                    for (let i = 0; i < plan.remain; i++) {
                        G.Gprevious = 0;

                        const mv2 = choose_direction(plan.x, plan.y, 4, -1, true);

                        if (mv2 === 1) plan.x++;
                        else if (mv2 === 2) plan.x--;
                        else if (mv2 === 3) plan.y--;
                        else if (mv2 === 4) plan.y++;

                        if (mv2 > 0) {
                            dig(plan.x, plan.y);
                            map[plan.x][plan.y].flood = plan.flood;
                        }
                    }

                    G.Gdx = plan.x;
                    G.Gdy = plan.y;
                }

                release_undiggables();
            }

            if (attempt < 900 && mv !== 5) {
                dig(G.Gdx, G.Gdy);
            } else {
                if (mv !== 5) G.Gflops++;
            }

            steps++;
        }

        setCurrentStatus("Finished");
    }

    function isFloorTile(x, y) {
        return x >= 1 && x <= G.Gmapx && y >= 1 && y <= G.Gmapy && map[x][y].flr > 0;
    }

    function getDoorCandidateType(x, y) {
        if (!isFloorTile(x, y)) return 0;
        if (map[x][y].teleportId) return 0;
        if (map[x][y].flood || map[x][y].Notouch || map[x][y].undug) return 0;

        const left = isFloorTile(x - 1, y);
        const right = isFloorTile(x + 1, y);
        const up = isFloorTile(x, y - 1);
        const down = isFloorTile(x, y + 1);

        const openCount = (left ? 1 : 0) + (right ? 1 : 0) + (up ? 1 : 0) + (down ? 1 : 0);

        if (openCount !== 2) return 0;
        if (left && right) return 1;
        if (up && down) return 2;

        return 0;
    }

    function collectDoorCandidates() {
        const out = [];

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                const type = getDoorCandidateType(x, y);

                if (!type) continue;

                out.push({
                    x,
                    y,
                    id: map[x][y].id || 0,
                    type,
                });
            }
        }

        return out;
    }

    function buildBlockedDoorSet(extraDoorKey = "") {
        const blocked = new Set();

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (map[x][y].doorType === 2) blocked.add(`${x},${y}`);
            }
        }

        if (extraDoorKey) blocked.add(extraDoorKey);

        return blocked;
    }

    function computeReachable(blockedDoors) {
        const seen = new Set();
        const q = [];

        const sx = G.Gstartx;
        const sy = G.Gstarty;

        if (!isFloorTile(sx, sy)) return seen;

        const startKey = `${sx},${sy}`;

        if (blockedDoors.has(startKey)) return seen;

        seen.add(startKey);
        q.push([sx, sy]);

        let qi = 0;

        while (qi < q.length) {
            const [x, y] = q[qi++];

            const dirs = [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ];

            for (const [dx, dy] of dirs) {
                const nx = x + dx;
                const ny = y + dy;

                if (!isFloorTile(nx, ny)) continue;

                const k = `${nx},${ny}`;

                if (blockedDoors.has(k) || seen.has(k)) continue;

                seen.add(k);
                q.push([nx, ny]);
            }
        }

        return seen;
    }

    function getExistingLockedDoors() {
        const out = [];

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (map[x][y].doorType === 2) {
                    out.push({
                        x,
                        y,
                        id: map[x][y].id || 0,
                    });
                }
            }
        }

        return out;
    }

    function getExistingKeys() {
        const out = [];

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (map[x][y].keyId !== 0) {
                    out.push({
                        x,
                        y,
                        id: map[x][y].id || 0,
                        keyId: map[x][y].keyId,
                    });
                }
            }
        }

        return out;
    }

    function chooseKeyTileFromReachable(
        reachableSet,
        maxDoorRouteId = Infinity,
        doorX = 0,
        doorY = 0,
        minDoorDistance = 4
    ) {
        const candidates = [];
        const existingKeys = getExistingKeys();

        for (const key of reachableSet) {
            const [xStr, yStr] = key.split(",");
            const x = parseInt(xStr, 10);
            const y = parseInt(yStr, 10);

            if (x === G.Gstartx && y === G.Gstarty) continue;

            const b = map[x][y];

            if (!b || b.flr <= 0) continue;
            if (b.teleportId) continue;
            if (b.doorType !== 0) continue;
            if (b.keyId !== 0) continue;

            const routeId = b.id || 0;

            if (routeId <= 0 || routeId >= maxDoorRouteId) continue;

            const doorDist = doorX > 0 && doorY > 0 ? Math.abs(x - doorX) + Math.abs(y - doorY) : 999;

            candidates.push({
                x,
                y,
                id: routeId,
                doorDist,
            });
        }

        if (!candidates.length) return null;

        const farEnough = candidates.filter((c) => c.doorDist >= minDoorDistance);
        const pool = farEnough.length ? farEnough : candidates;

        let best = null;
        let bestScore = -Infinity;

        for (const c of pool) {
            const ratio = maxDoorRouteId > 0 ? c.id / maxDoorRouteId : 0;
            const closenessToLateReachable = 1 - Math.abs(ratio - 0.72);

            let minKeyDist = 999;

            for (const k of existingKeys) {
                const d = Math.abs(k.x - c.x) + Math.abs(k.y - c.y);
                if (d < minKeyDist) minKeyDist = d;
            }

            if (!existingKeys.length) minKeyDist = Math.max(0, c.id);

            const spacingScore = Math.min(minKeyDist, 30) / 30;
            const routeDepthScore = Math.min(c.id, maxDoorRouteId || c.id) / Math.max(1, maxDoorRouteId || c.id);

            const distancePastMinimum = Math.max(0, c.doorDist - minDoorDistance);

            const doorDistanceScore = farEnough.length
                ? 1.5 + (Math.min(distancePastMinimum, 18) / 18) * 1.5
                : (Math.min(c.doorDist, minDoorDistance) / Math.max(1, minDoorDistance)) * 1.0;

            const score =
                closenessToLateReachable * 2.0 +
                spacingScore * 1.5 +
                routeDepthScore * 1.25 +
                doorDistanceScore * 2.5 +
                rng() * 0.15;

            if (score > bestScore) {
                bestScore = score;
                best = c;
            }
        }

        return best;
    }

    function evaluateLockedDoorCandidate(c) {
        const doorKey = `${c.x},${c.y}`;
        const doorRouteId = map[c.x][c.y].id || 0;

        const reachableOpen = computeReachable(buildBlockedDoorSet());

        if (!reachableOpen.has(doorKey)) return null;

        const reachableClosed = computeReachable(buildBlockedDoorSet(doorKey));
        const gatedTiles = [];

        for (const k of reachableOpen) {
            if (!reachableClosed.has(k)) gatedTiles.push(k);
        }

        if (!gatedTiles.length) return null;

        let deeperTiles = 0;

        for (const k of gatedTiles) {
            const [xStr, yStr] = k.split(",");
            const x = parseInt(xStr, 10);
            const y = parseInt(yStr, 10);

            if ((map[x][y].id || 0) > doorRouteId) deeperTiles++;
        }

        if (deeperTiles < 2) return null;

        const keySpot = chooseKeyTileFromReachable(reachableClosed, doorRouteId, c.x, c.y, 4);

        if (!keySpot) return null;

        const existingLocked = getExistingLockedDoors();

        let minLockedDist = 999;
        let minLockedIdGap = 999999;

        for (const d of existingLocked) {
            const dist = Math.abs(d.x - c.x) + Math.abs(d.y - c.y);
            const idGap = Math.abs((d.id || 0) - doorRouteId);

            if (dist < minLockedDist) minLockedDist = dist;
            if (idGap < minLockedIdGap) minLockedIdGap = idGap;
        }

        if (!existingLocked.length) {
            minLockedDist = 30;
            minLockedIdGap = doorRouteId;
        }

        const keyGap = doorRouteId - (keySpot.id || 0);
        const keyLateRatio = doorRouteId > 0 ? (keySpot.id || 0) / doorRouteId : 0;

        const score =
            Math.min(deeperTiles, 40) * 0.9 +
            Math.min(minLockedDist, 20) * 1.3 +
            Math.min(minLockedIdGap, 60) * 0.25 +
            Math.min(doorRouteId, 200) * 0.05 +
            keyLateRatio * 8.0 +
            Math.min(keyGap, 80) * 0.03;

        return {
            keySpot,
            gatedCount: gatedTiles.length,
            score,
            doorRouteId,
        };
    }

    function tileNearDoor(x, y, minSpacing = 1, lockedOnly = false) {
        for (let yy = Math.max(1, y - minSpacing); yy <= Math.min(G.Gmapy, y + minSpacing); yy++) {
            for (let xx = Math.max(1, x - minSpacing); xx <= Math.min(G.Gmapx, x + minSpacing); xx++) {
                if (xx === x && yy === y) continue;

                const dist = Math.abs(xx - x) + Math.abs(yy - y);

                if (dist > minSpacing) continue;

                if (lockedOnly) {
                    if (map[xx][yy].doorType === 2) return true;
                } else {
                    if (map[xx][yy].doorType !== 0) return true;
                }
            }
        }

        return false;
    }

    function tryPlaceDoorFromCandidates(candidates, attempts, wantLocked, nextKeyIdRef) {
        if (!candidates.length) return null;

        if (wantLocked) {
            let best = null;
            let bestEval = null;

            for (let attempt = 0; attempt < attempts; attempt++) {
                const c = candidates[random(0, candidates.length - 1)];
                const tile = map[c.x][c.y];

                if (tile.teleportId || tile.doorType !== 0 || tile.keyId !== 0) continue;
                if (tileNearDoor(c.x, c.y, G.doorSpacing)) continue;
                if (tileNearDoor(c.x, c.y, Math.max(G.doorSpacing + 2, 5), true)) continue;

                const test = evaluateLockedDoorCandidate(c);

                if (!test) continue;
                if (map[test.keySpot.x][test.keySpot.y].keyId !== 0) continue;

                if (!bestEval || test.score > bestEval.score) {
                    best = c;
                    bestEval = test;
                }
            }

            if (!best || !bestEval) return null;

            const keyId = nextKeyIdRef.value;

            nextKeyIdRef.value++;

            if (nextKeyIdRef.value > G.maxKeyId) nextKeyIdRef.value = 1;

            map[best.x][best.y].doorType = 2;
            map[best.x][best.y].doorId = keyId;
            map[bestEval.keySpot.x][bestEval.keySpot.y].keyId = keyId;

            return { locked: true };
        }

        for (let attempt = 0; attempt < attempts; attempt++) {
            const c = candidates[random(0, candidates.length - 1)];
            const tile = map[c.x][c.y];

            if (tile.teleportId || tile.doorType !== 0 || tile.keyId !== 0) continue;
            if (tileNearDoor(c.x, c.y, G.doorSpacing)) continue;

            tile.doorType = 1;
            tile.doorId = 0;

            return { locked: false };
        }

        return null;
    }

    function placeDoorsAndKeys() {
        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                map[x][y].doorType = 0;
                map[x][y].doorId = 0;
                map[x][y].keyId = 0;
            }
        }

        const candidates = collectDoorCandidates();

        G._doorCandidateCount = candidates.length;
        G._solvableLockedDoorCount = 0;

        if (!candidates.length || G.targetDoors <= 0) {
            G._doorCount = 0;
            G._lockedDoorCount = 0;
            G._unlockedDoorCount = 0;
            G._keyCount = 0;
            return;
        }

        const maxDoors = Math.min(candidates.length, Math.max(0, G.targetDoors));
        const lockedTarget = Math.min(maxDoors, Math.round(maxDoors * (G.lockedDoorPct / 100)));

        let placed = 0;
        let lockedPlaced = 0;

        const nextKeyIdRef = { value: 1 };

        while (lockedPlaced < lockedTarget && placed < maxDoors) {
            const result = tryPlaceDoorFromCandidates(candidates, G.doorPlacementAttempts, true, nextKeyIdRef);

            if (!result) break;

            lockedPlaced++;
            placed++;
        }

        while (placed < maxDoors) {
            const result = tryPlaceDoorFromCandidates(candidates, G.doorPlacementAttempts, false, nextKeyIdRef);

            if (!result) break;

            placed++;
        }

        let keyCount = 0;

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                if (map[x][y].keyId) keyCount++;
            }
        }

        G._doorCount = placed;
        G._lockedDoorCount = lockedPlaced;
        G._unlockedDoorCount = Math.max(0, placed - lockedPlaced);
        G._solvableLockedDoorCount = lockedPlaced;
        G._keyCount = keyCount;
    }

    // ---------- Teleports ------------

    function resetTeleports() {
        G.teleports = [];
        G._teleportCount = 0;
        G._branchTeleportCount = 0;
        G._shortcutTeleportCount = 0;

        for (let y = 1; y <= G.Gmapy; y++) {
            for (let x = 1; x <= G.Gmapx; x++) {
                map[x][y].teleportId = 0;
                map[x][y].teleportType = "";
                map[x][y].teleportRole = "";
            }
        }
    }

    function canPlaceTeleportOnCurrentTile() {
        const b = map[G.Gdx][G.Gdy];

        if (!b || b.flr <= 0) return false;
        if (b.teleportId) return false;
        if (b.keyId) return false;
        if (b.doorType) return false;
        if (G.Gdx === G.Gstartx && G.Gdy === G.Gstarty) return false;

        // Do not allow teleports beside other teleports.
        if (tileNearTeleport(G.Gdx, G.Gdy, 1)) return false;

        return true;
    }

    function isValidBranchTeleportDestination(x, y) {
        if (x < 1 || x > G.Gmapx || y < 1 || y > G.Gmapy) return false;

        const b = map[x][y];

        if (b.flr !== 0) return false;
        if (b.Notouch || b.undiggable) return false;
        if (b.teleportId) return false;

        // Must be sealed before placement.
        if (wallcount(x, y) !== 4) return false;

        // Do not allow teleports beside other teleports.
        if (tileNearTeleport(x, y, 1)) return false;

        // Must have at least one direction the branch can dig out through.
        if (!chooseTeleportBranchExit(x, y)) return false;

        return true;
    }

    function findBranchTeleportDestination() {
        for (let attempt = 0; attempt < 900; attempt++) {
            const x = random(1, G.Gmapx);
            const y = random(1, G.Gmapy);

            if (isValidBranchTeleportDestination(x, y)) {
                return { x, y };
            }
        }

        return null;
    }

    function hasEarlierNeighbour(x, y, sourceId, minBacktrack = 20) {
        const requiredMaxId = Math.max(1, sourceId - minBacktrack);

        const neighbours = [
            map[x - 1]?.[y],
            map[x + 1]?.[y],
            map[x]?.[y - 1],
            map[x]?.[y + 1],
        ];

        return neighbours.some(n =>
            n &&
            n.flr > 0 &&
            n.id > 0 &&
            n.id <= requiredMaxId
        );
    }

    function isValidShortcutTeleportDestination(x, y, sourceId) {
        if (x < 1 || x > G.Gmapx || y < 1 || y > G.Gmapy) return false;

        const b = map[x][y];

        if (b.flr !== 0) return false;
        if (b.Notouch || b.undiggable) return false;
        if (b.teleportId) return false;
        if (b.doorType || b.keyId) return false;

        // Shortcut destination must be a wall tile beside exactly one open route.
        // That means it will become a clean one-exit arrival pad when dug.
        if (wallcount(x, y) !== 3) return false;

        // Do not allow teleports beside other teleports.
        if (tileNearTeleport(x, y, 1)) return false;

        return hasEarlierNeighbour(x, y, sourceId, 20);
    }

    function findShortcutTeleportDestination(sourceId) {
        for (let attempt = 0; attempt < 900; attempt++) {
            const x = random(1, G.Gmapx);
            const y = random(1, G.Gmapy);

            if (isValidShortcutTeleportDestination(x, y, sourceId)) {
                return { x, y };
            }
        }

        return null;
    }


    function dirToDelta(dir) {
        if (dir === 1) return { dx: 1, dy: 0 };   // east
        if (dir === 2) return { dx: -1, dy: 0 };  // west
        if (dir === 3) return { dx: 0, dy: -1 };  // north
        if (dir === 4) return { dx: 0, dy: 1 };   // south
        return { dx: 0, dy: 0 };
    }

    function oppositeDir(dir) {
        if (dir === 1) return 2;
        if (dir === 2) return 1;
        if (dir === 3) return 4;
        if (dir === 4) return 3;
        return 0;
    }

    function dirFromTo(x1, y1, x2, y2) {
        if (x2 === x1 + 1 && y2 === y1) return 1;
        if (x2 === x1 - 1 && y2 === y1) return 2;
        if (x2 === x1 && y2 === y1 - 1) return 3;
        if (x2 === x1 && y2 === y1 + 1) return 4;
        return 0;
    }

    function tileNearTeleport(x, y, radius = 1) {
        for (let yy = y - radius; yy <= y + radius; yy++) {
            for (let xx = x - radius; xx <= x + radius; xx++) {
                if (xx < 1 || xx > G.Gmapx || yy < 1 || yy > G.Gmapy) continue;

                const dist = Math.abs(xx - x) + Math.abs(yy - y);

                // Manhattan radius, so radius 1 means directly adjacent.
                if (dist > radius) continue;

                if (map[xx]?.[yy]?.teleportId) return true;
            }
        }

        return false;
    }

    function lockTeleportToSingleExit(x, y, exitDir) {
        if (!exitDir) return;

        const dirs = [
            { dir: 1, dx: 1, dy: 0 },
            { dir: 2, dx: -1, dy: 0 },
            { dir: 3, dx: 0, dy: -1 },
            { dir: 4, dx: 0, dy: 1 },
        ];

        for (const d of dirs) {
            if (d.dir === exitDir) continue;

            const nx = x + d.dx;
            const ny = y + d.dy;

            if (nx < 1 || nx > G.Gmapx || ny < 1 || ny > G.Gmapy) continue;

            const b = map[nx][ny];

            // Only block undug wall cells.
            // Do not overwrite existing corridors, doors, keys, or teleports.
            if (!b) continue;
            if (b.flr > 0) continue;
            if (b.doorType || b.keyId || b.teleportId) continue;

            b.Notouch = true;
        }
    }

    function digTeleportExit(x, y, exitDir) {
        if (!exitDir) return false;

        const d = dirToDelta(exitDir);
        const nx = x + d.dx;
        const ny = y + d.dy;

        if (nx < 1 || nx > G.Gmapx || ny < 1 || ny > G.Gmapy) return false;

        const b = map[nx][ny];

        if (!b) return false;
        if (b.flr !== 0) return false;
        if (b.Notouch || b.undiggable) return false;
        if (b.teleportId || b.doorType || b.keyId) return false;

        dig(nx, ny);

        G.Gdx = nx;
        G.Gdy = ny;
        G.Gprevious = exitDir;

        return true;
    }

    function chooseTeleportBranchExit(x, y) {
        const possible = [];

        const dirs = [
            { dir: 1, dx: 1, dy: 0 },
            { dir: 2, dx: -1, dy: 0 },
            { dir: 3, dx: 0, dy: -1 },
            { dir: 4, dx: 0, dy: 1 },
        ];

        for (const d of dirs) {
            const nx = x + d.dx;
            const ny = y + d.dy;

            if (nx < 1 || nx > G.Gmapx || ny < 1 || ny > G.Gmapy) continue;

            const b = map[nx][ny];

            if (!b) continue;
            if (b.flr !== 0) continue;
            if (b.Notouch || b.undiggable) continue;

            possible.push(d.dir);
        }

        if (!possible.length) return 0;

        return possible[random(0, possible.length - 1)];
    }

    function placeBranchTeleportJump() {
        if (!canPlaceTeleportOnCurrentTile()) return false;
        if ((G._branchTeleportCount ?? 0) >= G.maxBranchTeleports) return false;

        const dest = findBranchTeleportDestination();

        if (!dest) return false;

        const id = G.teleports.length + 1;
        const sourceX = G.Gdx;
        const sourceY = G.Gdy;

        map[sourceX][sourceY].teleportId = id;
        map[sourceX][sourceY].teleportType = "branch";
        map[sourceX][sourceY].teleportRole = "source";

        G.Gdx = dest.x;
        G.Gdy = dest.y;

        dig(G.Gdx, G.Gdy);

        map[G.Gdx][G.Gdy].teleportId = id;
        map[G.Gdx][G.Gdy].teleportType = "branch";
        map[G.Gdx][G.Gdy].teleportRole = "destination";

        // Branch destination: one exit yes.
        // Pick the one direction the new branch is allowed to leave from.
        const branchExitDir = chooseTeleportBranchExit(G.Gdx, G.Gdy);

        // If no exit is possible, cancel this teleport attempt.
        if (!branchExitDir) {
            map[sourceX][sourceY].teleportId = 0;
            map[sourceX][sourceY].teleportType = "";
            map[sourceX][sourceY].teleportRole = "";

            map[G.Gdx][G.Gdy].teleportId = 0;
            map[G.Gdx][G.Gdy].teleportType = "";
            map[G.Gdx][G.Gdy].teleportRole = "";

            return false;
        }

        lockTeleportToSingleExit(G.Gdx, G.Gdy, branchExitDir);

        // Actually dig the first exit tile immediately.
        // This prevents isolated branch teleport destinations.
        if (!digTeleportExit(dest.x, dest.y, branchExitDir)) {
            map[sourceX][sourceY].teleportId = 0;
            map[sourceX][sourceY].teleportType = "";
            map[sourceX][sourceY].teleportRole = "";

            map[dest.x][dest.y].teleportId = 0;
            map[dest.x][dest.y].teleportType = "";
            map[dest.x][dest.y].teleportRole = "";

            return false;
        }

        // Final safety: branch destination should now have exactly one exit.
        if (wallcount(dest.x, dest.y) !== 3) {
            map[sourceX][sourceY].teleportId = 0;
            map[sourceX][sourceY].teleportType = "";
            map[sourceX][sourceY].teleportRole = "";

            map[dest.x][dest.y].teleportId = 0;
            map[dest.x][dest.y].teleportType = "";
            map[dest.x][dest.y].teleportRole = "";

            return false;
        }

        // Optional branch source behaviour.
        // Leave this commented out for now because we agreed branch source is optional.
        // If you later want branch sources to have only one exit too, uncomment it.
        //
        // const sourceExitDir = map[sourceX][sourceY].dir || 0;
        // if (sourceExitDir) lockTeleportToSingleExit(sourceX, sourceY, sourceExitDir);

        G.teleports.push({
            id,
            type: "branch",
            a: { x: sourceX, y: sourceY },
            b: { x: G.Gdx, y: G.Gdy },
            bidirectional: true,
        });

        G._branchTeleportCount = (G._branchTeleportCount ?? 0) + 1;
        G._teleportCount = G.teleports.length;

        G.Gprevious = 0;
        setCurrentStatus("Branch teleport");

        return true;
    }
    function findEarlierNeighbourDir(x, y, sourceId, minBacktrack = 20) {
        const requiredMaxId = Math.max(1, sourceId - minBacktrack);

        const neighbours = [
            { dir: 1, x: x + 1, y },
            { dir: 2, x: x - 1, y },
            { dir: 3, x, y: y - 1 },
            { dir: 4, x, y: y + 1 },
        ];

        const valid = [];

        for (const n of neighbours) {
            const b = map[n.x]?.[n.y];

            if (
                b &&
                b.flr > 0 &&
                b.id > 0 &&
                b.id <= requiredMaxId
            ) {
                valid.push(n.dir);
            }
        }

        if (!valid.length) return 0;

        return valid[random(0, valid.length - 1)];
    }

    function placeShortcutTeleportJump() {
        if (!canPlaceTeleportOnCurrentTile()) return false;
        if ((G._shortcutTeleportCount ?? 0) >= G.maxShortcutTeleports) return false;

        const sourceId = map[G.Gdx][G.Gdy].id || 0;
        const dest = findShortcutTeleportDestination(sourceId);

        if (!dest) return false;

        const id = G.teleports.length + 1;
        const sourceX = G.Gdx;
        const sourceY = G.Gdy;

        map[sourceX][sourceY].teleportId = id;
        map[sourceX][sourceY].teleportType = "shortcut";
        map[sourceX][sourceY].teleportRole = "source";

        G.Gdx = dest.x;
        G.Gdy = dest.y;

        dig(G.Gdx, G.Gdy);

        map[G.Gdx][G.Gdy].teleportId = id;
        map[G.Gdx][G.Gdy].teleportType = "shortcut";
        map[G.Gdx][G.Gdy].teleportRole = "destination";

        // Shortcut destination: one exit yes.
        // The exit should point back toward the earlier corridor it reconnects to.
        const shortcutExitDir = findEarlierNeighbourDir(G.Gdx, G.Gdy, sourceId, 20);
        lockTeleportToSingleExit(G.Gdx, G.Gdy, shortcutExitDir);

        // Final safety: shortcut destination should have exactly one exit.
        if (wallcount(G.Gdx, G.Gdy) !== 3) {
            map[sourceX][sourceY].teleportId = 0;
            map[sourceX][sourceY].teleportType = "";
            map[sourceX][sourceY].teleportRole = "";

            map[G.Gdx][G.Gdy].teleportId = 0;
            map[G.Gdx][G.Gdy].teleportType = "";
            map[G.Gdx][G.Gdy].teleportRole = "";

            return false;
        }

        G.teleports.push({
            id,
            type: "shortcut",
            from: { x: sourceX, y: sourceY },
            to: { x: G.Gdx, y: G.Gdy },
            startsOneWay: true,
            unlocksToTwoWay: true,
        });

        G._shortcutTeleportCount = (G._shortcutTeleportCount ?? 0) + 1;
        G._teleportCount = G.teleports.length;

        G.Gprevious = 0;
        setCurrentStatus("Shortcut teleport");

        return true;
    }

    function tryTeleportJump() {
        // Shortcut first, because it has stricter placement requirements.
        if (
            G.GCOTS > 0 &&
            (G._shortcutTeleportCount ?? 0) < G.maxShortcutTeleports &&
            random(G.GCOTS) === 1
        ) {
            if (placeShortcutTeleportJump()) return true;
        }

        if (
            G.GCOTB > 0 &&
            (G._branchTeleportCount ?? 0) < G.maxBranchTeleports &&
            random(G.GCOTB) === 1
        ) {
            if (placeBranchTeleportJump()) return true;
        }

        return false;
    }


    // ---------- Drawing ----------
    function computeTileAndResizeCanvas() {
        const view = els.mapViewport || document.getElementById("mapViewport");

        if (!view) return;

        /*
          Fit the map to the currently available map viewport.
    
          Important:
          We measure #mapViewport, not #view.
    
          #view includes the legend panel.
          #mapViewport is only the remaining space reserved for the map.
        */

        const styles = getComputedStyle(view);

        const padX =
            parseFloat(styles.paddingLeft || 0) +
            parseFloat(styles.paddingRight || 0);

        const padY =
            parseFloat(styles.paddingTop || 0) +
            parseFloat(styles.paddingBottom || 0);

        const availableWidth = Math.max(1, view.clientWidth - padX);
        const availableHeight = Math.max(1, view.clientHeight - padY);

        const mapCols = G.Gmapx + 2;
        const mapRows = G.Gmapy + 2;

        const tileByWidth = Math.floor(availableWidth / mapCols);
        const tileByHeight = Math.floor(availableHeight / mapRows);

        let tile = Math.min(tileByWidth, tileByHeight);

        if (tile < 1) tile = 1;

        els.c.width = tile * mapCols;
        els.c.height = tile * mapRows;

        els.c.style.width = els.c.width + "px";
        els.c.style.height = els.c.height + "px";

        G.Gts = tile;
    }

    function drawTeleportSymbol(x, y, ts, b) {
        const nx = x * ts;
        const ny = y * ts;
        const cx = nx + ts / 2;
        const cy = ny + ts / 2;

        const outer = Math.max(4, ts * 0.35);
        const inner = Math.max(2, ts * 0.20);

        ctx.save();

        // Soft purple glow.
        ctx.fillStyle = "rgba(190, 80, 255, 0.28)";
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(5, ts * 0.43), 0, Math.PI * 2);
        ctx.fill();

        // Outer portal ring.
        ctx.strokeStyle = "#C85CFF";
        ctx.lineWidth = Math.max(2, ts * 0.10);
        ctx.beginPath();
        ctx.arc(cx, cy, outer, 0, Math.PI * 2);
        ctx.stroke();

        // Inner dark hole.
        ctx.fillStyle = "#180020";
        ctx.beginPath();
        ctx.arc(cx, cy, inner, 0, Math.PI * 2);
        ctx.fill();

        // Bright centre dot.
        ctx.fillStyle = "#F3D1FF";
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1.5, ts * 0.06), 0, Math.PI * 2);
        ctx.fill();

        // Shortcut/source marker.
        if (b.teleportType === "shortcut") {
            ctx.fillStyle = "#F3D1FF";

            if (b.teleportRole === "from") {
                // Tiny triangle means "this side sends you somewhere".
                ctx.beginPath();
                ctx.moveTo(cx + ts * 0.22, cy);
                ctx.lineTo(cx + ts * 0.04, cy - ts * 0.10);
                ctx.lineTo(cx + ts * 0.04, cy + ts * 0.10);
                ctx.closePath();
                ctx.fill();
            } else {
                // Tiny square means "arrival / unlock side".
                ctx.fillRect(cx - ts * 0.06, cy - ts * 0.06, ts * 0.12, ts * 0.12);
            }
        }

        // Pair number.
        if (ts >= 14) {
            const text = String(b.teleportId);

            ctx.font = `${Math.max(8, Math.floor(ts * 0.32))}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = Math.max(2, ts * 0.08);

            ctx.strokeStyle = "#180020";
            ctx.fillStyle = "#FFFFFF";

            ctx.strokeText(text, cx, cy);
            ctx.fillText(text, cx, cy);
        }

        ctx.restore();
    }

    function legendItem(className, label) {
        return `
        <div class="legend-item">
            <span class="legend-swatch ${className}">${className === "legend-arrow" ? "→" : ""}</span>
            <span class="legend-label">${label}</span>
        </div>
    `;
    }

    function legendGroup(title, items) {
        if (!items.length) return "";

        return `
        <div class="legend-group">
            <div class="legend-group-title">${title}</div>
            ${items.join("")}
        </div>
    `;
    }

    function updateLegend() {
        if (!els.legendBody) return;

        const terrain = [];

        terrain.push(legendItem("legend-wall", "Wall"));
        terrain.push(legendItem("legend-floor", "Floor"));

        if (G.showTint) {
            terrain.push(legendItem("legend-notouch", "Blocked / No-touch"));
            terrain.push(legendItem("legend-undiggable", "Temp undiggable"));
            terrain.push(legendItem("legend-undug", "Filled gap"));
        }

        if (G.showWater) {
            terrain.push(legendItem("legend-water", "Flooded"));
        }

        const features = [];

        features.push(legendItem("legend-start", "Start"));

        if (G.showExit) {
            features.push(legendItem("legend-exit", "Exit"));
        }

        if (G.showDoors) {
            features.push(legendItem("legend-door", "Door"));
            features.push(legendItem("legend-locked-door", "Locked door"));
            features.push(legendItem("legend-key", "Key"));
        }

        if (G.showTeleports) {
            features.push(legendItem("legend-teleport-source", "Teleport source"));
            features.push(legendItem("legend-teleport-destination", "Teleport destination"));
        }

        const debug = [];

        if (G.showArrows) {
            debug.push(legendItem("legend-arrow", "Route arrow"));
        }

        els.legendBody.innerHTML =
            legendGroup("Terrain", terrain) +
            legendGroup("Features", features) +
            legendGroup("Debug", debug);
    }

    function draw() {
        computeTileAndResizeCanvas();

        const ts = G.Gts;

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, els.c.width, els.c.height);

        const drawLineArrow = (x, y, dir) => {
            if (!dir) return;

            const nx = x * ts;
            const ny = y * ts;
            const cx = nx + ts / 2;
            const cy = ny + ts / 2;
            const shaft = Math.max(2, ts * 0.28);
            const head = Math.max(3, ts * 0.18);

            let dx = 0;
            let dy = 0;

            if (dir === 1) dx = 1;
            else if (dir === 2) dx = -1;
            else if (dir === 3) dy = -1;
            else if (dir === 4) dy = 1;

            const ex = cx + dx * shaft;
            const ey = cy + dy * shaft;

            ctx.save();
            ctx.strokeStyle = "rgba(200,100,100,0.9)";
            ctx.fillStyle = "rgba(200,100,100,0.9)";
            ctx.lineWidth = Math.max(1.5, ts * 0.1);
            ctx.lineCap = "round";

            ctx.beginPath();
            ctx.moveTo(cx - dx * shaft * 0.55, cy - dy * shaft * 0.55);
            ctx.lineTo(ex, ey);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(ex, ey);

            if (dx !== 0) {
                ctx.lineTo(ex - dx * head, ey - head * 0.75);
                ctx.lineTo(ex - dx * head, ey + head * 0.75);
            } else {
                ctx.lineTo(ex - head * 0.75, ey - dy * head);
                ctx.lineTo(ex + head * 0.75, ey - dy * head);
            }

            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        function drawMapCircleMarker(ctx, cx, cy, radius, fillColor, strokeColor, label = "") {
            ctx.save();

            // Main coloured circle
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            // Dark outline around the circle
            ctx.lineWidth = Math.max(1, Math.floor(radius * 0.22));
            ctx.strokeStyle = strokeColor;
            ctx.beginPath();
            ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
            ctx.stroke();

            // Optional label in the centre
            if (label) {
                drawOutlinedMarkerLabel(ctx, label, cx, cy, radius);
            }

            ctx.restore();
        }
        function drawMapDiamondMarker(ctx, cx, cy, radius, fillColor, strokeColor, label = "") {
            ctx.save();

            ctx.fillStyle = fillColor;
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = Math.max(1, Math.floor(radius * 0.22));

            ctx.beginPath();
            ctx.moveTo(cx, cy - radius);
            ctx.lineTo(cx + radius, cy);
            ctx.lineTo(cx, cy + radius);
            ctx.lineTo(cx - radius, cy);
            ctx.closePath();

            ctx.fill();
            ctx.stroke();

            ctx.restore();

            if (label) {
                drawOutlinedMarkerLabel(ctx, label, cx, cy, radius);
            }
        }

        function drawMapDoorMarker(ctx, x, y, ts, fillColor, label = "") {
            const nx = x * ts;
            const ny = y * ts;
            const cx = nx + ts / 2;
            const cy = ny + ts / 2;

            const vertical = isVerticalDoorTile(x, y);

            // Make locked doors a little thicker if they have a label.
            const thickness = label
                ? Math.max(3, Math.ceil(ts * 0.5))
                : Math.max(2, Math.ceil(ts * 0.3));

            const offset = label
                ? Math.floor(ts * 0.25)
                : Math.floor(ts * 0.35);

            ctx.save();

            ctx.fillStyle = fillColor;

            if (vertical) {
                ctx.fillRect(nx + offset, ny, thickness, ts);
            } else {
                ctx.fillRect(nx, ny + offset, ts, thickness);
            }

            ctx.restore();

            if (label) {
                drawOutlinedMarkerLabel(ctx, label, cx, cy, Math.max(4, ts * 0.36));
            }
        }

        function isVerticalDoorTile(x, y) {
            return isFloorTile(x - 1, y) && isFloorTile(x + 1, y);
        }

        function drawOutlinedMarkerLabel(ctx, text, cx, cy, radius) {
            if (!text) return;

            const fontSize = Math.max(8, Math.floor(radius * 1.15));

            ctx.save();

            ctx.font = `600 ${fontSize}px system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            // Same softer outline style as the improved S/E markers.
            ctx.lineWidth = Math.max(1.25, radius * 0.14);
            ctx.strokeStyle = "rgba(0,0,0,0.85)";
            ctx.fillStyle = "rgba(255,255,255,0.92)";

            const label = String(text);
            const yOffset = fontSize * 0.03;

            ctx.strokeText(label, cx, cy + yOffset);
            ctx.fillText(label, cx, cy + yOffset);

            ctx.restore();
        }

        const getTeleportColour = (tile) => {
            const role = String(tile.teleportRole || "").toLowerCase();

            // Destination / arrival pad.
            if (
                role === "destination" ||
                role === "dest" ||
                role === "target" ||
                role === "arrival"
            ) {
                return {
                    fill: "#00D7FF",
                    stroke: "#003344",
                    text: "#FFFFFF",
                    symbol: "D"
                };
            }

            // Source / departure pad.
            return {
                fill: "#B000FF",
                stroke: "#2A003F",
                text: "#FFFFFF",
                symbol: "S"
            };
        };

        const drawTeleportMarker = (x, y, tile) => {
            if (!tile.teleportId) return;

            const nx = x * ts;
            const ny = y * ts;
            const cx = nx + ts / 2;
            const cy = ny + ts / 2;
            const r = Math.max(4, ts * 0.34);

            const colours = getTeleportColour(tile);

            ctx.save();

            // Outer ring.
            ctx.fillStyle = colours.fill;
            ctx.strokeStyle = colours.stroke;
            ctx.lineWidth = Math.max(2, ts * 0.08);

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Inner dark hole.
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
            ctx.fill();

            // Small role glyph.
            if (ts >= 12) {
                ctx.font = `${Math.max(8, Math.floor(ts * 0.38))}px system-ui`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.lineWidth = Math.max(2, ts * 0.08);

                // Dark outline keeps white numbers readable on both cyan and purple.
                ctx.strokeStyle = "rgba(0,0,0,0.85)";
                ctx.fillStyle = "#FFFFFF";

                const text = String(tile.teleportId);

                ctx.strokeText(text, cx, cy);
                ctx.fillText(text, cx, cy);
            }

            ctx.restore();
        };

        const DEBUG_TILE_STYLES = {
            // 0 = wall / solid rock / undug space
            wall: { rgb: [200, 150, 50], bevel: true },

            // 1 = dug floor / walkable empty space
            floor: { rgb: [0, 0, 0], bevel: true },

            // 2 = no-touch / permanently blocked from generation
            notouch: { rgb: [150, 50, 0], bevel: true },

            // 3 = flooded room tile
            water: { rgb: [0, 0, 150], bevel: false },

            // 4 = fully surrounded floor / open interior marker
            interior: { rgb: [50, 50, 50], bevel: false },

            // 5 = temporary undiggable tile used during room planning
            undiggable: { rgb: [0, 100, 100], bevel: true },

            // 6 = tile removed by hole-filler / post-process cleanup
            undug: { rgb: [175, 125, 25], bevel: true }
        };

        const rgbString = ([r, g, b]) => `rgb(${r},${g},${b})`;

        const adjustRgb = ([r, g, b], amount) => [
            Math.max(0, Math.min(255, r + amount)),
            Math.max(0, Math.min(255, g + amount)),
            Math.max(0, Math.min(255, b + amount))
        ];

        const drawDebugTile = (nx, ny, ts, style) => {
            const { rgb, bevel } = style;

            ctx.fillStyle = rgbString(rgb);
            ctx.fillRect(nx, ny, ts, ts);

            if (!bevel) return;

            ctx.fillStyle = rgbString(adjustRgb(rgb, -50));
            ctx.fillRect(nx + 1, ny + 1, ts - 1, ts - 1);

            ctx.fillStyle = rgbString(adjustRgb(rgb, 50));
            ctx.fillRect(nx, ny, ts - 1, ts - 1);

            ctx.fillStyle = rgbString(rgb);
            ctx.fillRect(nx + 1, ny + 1, ts - 2, ts - 2);
        };

        const getDebugTileStyle = (x, y, tile) => {
            const isFlood = tile.flood;
            const isNotouch = tile.Notouch;
            const isUndiggable = tile.undiggable;
            const isUndug = tile.undug;

            /*
              Simplified display mode:
              - ignores most debug tint categories
              - still shows water if Show Water is enabled
              - otherwise only distinguishes wall vs floor
            */
            if (!G.showTint) {
                if (isFlood && G.showWater) return DEBUG_TILE_STYLES.water;
                if (tile.flr === 0) return DEBUG_TILE_STYLES.wall;
                return DEBUG_TILE_STYLES.floor;
            }

            /*
              Full tint/debug display mode.
        
              Base tile meaning:
              - flr === 0 means wall
              - flr === 1 means floor
        
              Then special debug states override that base meaning.
            */
            let col = tile.flr;

            // Hidden water is treated as normal floor.
            if (!G.showWater && isFlood) col = 1;

            // Temp undiggable is shown only when the tile is not plain floor.
            if (col !== 1 && isUndiggable) col = 5;

            // Fully surrounded floor/interior marker.
            if (col === 1 && wallcount(x, y) === 0) col = 4;

            // No-touch always overrides ordinary wall/floor display.
            if (isNotouch) col = 2;

            // Flooded overrides most tint states when water display is enabled.
            if (isFlood && G.showWater) col = 3;

            // Undug/filled gap marker has final priority.
            if (isUndug) col = 6;

            switch (col) {
                case 1: return DEBUG_TILE_STYLES.floor;
                case 0: return DEBUG_TILE_STYLES.wall;
                case 2: return DEBUG_TILE_STYLES.notouch;
                case 3: return DEBUG_TILE_STYLES.water;
                case 4: return DEBUG_TILE_STYLES.interior;
                case 5: return DEBUG_TILE_STYLES.undiggable;
                case 6: return DEBUG_TILE_STYLES.undug;
                default: return DEBUG_TILE_STYLES.wall;
            }
        };

        for (let y = 0; y <= G.Gmapy + 1; y++) {
            for (let x = 0; x <= G.Gmapx + 1; x++) {
                const nx = x * ts;
                const ny = y * ts;

                let col = map[x][y].flr;

                const isFlood = map[x][y].flood;
                const isNotouch = map[x][y].Notouch;
                const isUndiggable = map[x][y].undiggable;
                const isUndug = map[x][y].undug;

                if (!G.showWater && isFlood) {
                    col = 1;
                }

                drawDebugTile(nx, ny,ts, getDebugTileStyle(x, y, map[x][y]) );

                if (!G._finished && x === G.Gdx && y === G.Gdy) {
                    ctx.fillStyle = "rgb(255,255,0)";
                    ctx.fillRect(nx, ny, ts, ts);
                }

                if (x === G.Gstartx && y === G.Gstarty) {
                    const sx = nx + ts / 2;
                    const sy = ny + ts / 2;
                    const rad = Math.max(4, ts * 0.40);

                    drawMapCircleMarker(ctx, sx, sy, rad, "#00F000", "#003300","S");
                }

                // Show doors as cyan or orange rectangles, with locked doors labelled by their ID number.
                if (G.showDoors && map[x][y].doorType === 1) {
                    drawMapDoorMarker(ctx, x, y, ts, "#00FFFF" );
                } else if (G.showDoors && map[x][y].doorType === 2) {
                    drawMapDoorMarker(ctx, x, y, ts, "#FF8800", String(map[x][y].doorId) );
                }

                // Show keys as orange diamonds with their ID number.
                if (G.showDoors && map[x][y].keyId) {
                    drawMapDiamondMarker(
                        ctx,
                        nx + ts / 2,
                        ny + ts / 2,
                        Math.max(4, ts * 0.36),
                        "#FF8800",
                        "#552200",
                        String(map[x][y].keyId)
                    );
                }

                if (G.showTeleports && map[x][y].teleportId) {
                    drawTeleportMarker(x, y, map[x][y]);
                }
            }
        }

        if (G.showArrows) {
            for (let y = 0; y <= G.Gmapy + 1; y++) {
                for (let x = 0; x <= G.Gmapx + 1; x++) {
                    const b = map[x][y];

                    if (!b) continue;

                    // Keep route arrows off special feature tiles.
                    if (b.teleportId) continue;
                    if (b.doorType) continue;
                    if (b.keyId) continue;

                    drawLineArrow(x, y, b.dir);
                }
            }
        }

        if (G.showExit && G._exitX > 0 && G._exitY > 0) {
            const ex = G._exitX * ts + ts / 2;
            const ey = G._exitY * ts + ts / 2;
            const rad = Math.max(4, ts * 0.40);

            drawMapCircleMarker(ctx, ex, ey, rad, "#FF3333", "#220000", "E");
        }

        updateStats();
        updateLegend();
    }

    // ---------- Step-by-step Runner ----------

    function getProcessSpeed() {
        return clamp(parseInt(els.processSpeed?.value) || 0, 0, 100);
    }

    function updateProcessSpeedLabel() {
        if (!els.processSpeed || !els.processSpeedValue) return;

        els.processSpeedValue.textContent = `${getProcessSpeed()}%`;
    }

    function processSpeedToStepsPerFrame(speed) {
        if (speed <= 0) return 0;

        if (speed >= 100) return 250;

        /*
          Very slow-friendly curve.
    
          Low values produce fractional steps per frame.
          Example:
          1%  = about 1 step every 60 frames
          4%  = about 1 step every 15 frames
          10% = about 1 step every 4 frames
        */

        const t = speed / 100;

        return t * t * 80;
    }

    function runStepByStep() {
        G.Gflops = 0;
        G._roomPlan = null;
        G._mode = "step";

        setCurrentStatus("Digging");

        function finishStepGeneration() {
            setCurrentStatus("Finished");

            solo_hole_filler();
            placeDoorsAndKeys();
            computeExitTile();

            G._finished = true;

            draw();
        }

        function stepOnce() {
            if (G.Gflops >= G.GMAXFJ) {
                finishStepGeneration();
                return true;
            }

            if (G._roomPlan) {
                if (G._roomPlan.type === "block") {
                    setCurrentStatus("Block room");

                    const cell = G._roomPlan.cells.shift();

                    if (cell) {
                        const [X, Y] = cell;

                        dig(X, Y);

                        map[X][Y].flood = G._roomPlan.flood;
                        G.Gdx = X;
                        G.Gdy = Y;
                    }

                    if (!G._roomPlan.cells.length) {
                        G.Gdx = G._roomPlan.end[0];
                        G.Gdy = G._roomPlan.end[1];

                        release_undiggables();

                        G._roomPlan = null;
                    }
                } else if (G._roomPlan.type === "rand") {
                    setCurrentStatus("Random room");

                    G.Gprevious = 0;

                    const mv = choose_direction(G._roomPlan.x, G._roomPlan.y, 4, -1, true);

                    if (mv === 1) G._roomPlan.x++;
                    else if (mv === 2) G._roomPlan.x--;
                    else if (mv === 3) G._roomPlan.y--;
                    else if (mv === 4) G._roomPlan.y++;

                    if (mv > 0) {
                        dig(G._roomPlan.x, G._roomPlan.y);

                        map[G._roomPlan.x][G._roomPlan.y].flood = G._roomPlan.flood;

                        G.Gdx = G._roomPlan.x;
                        G.Gdy = G._roomPlan.y;
                    }

                    if (--G._roomPlan.remain <= 0) {
                        G.Gdx = G._roomPlan.x;
                        G.Gdy = G._roomPlan.y;

                        release_undiggables();

                        G._roomPlan = null;
                    }
                }

                return false;
            }

            let attempt = 0;
            let mv = choose_direction(G.Gdx, G.Gdy);

            if (G.GCOBR > 0 && random(G.GCOBR) === 1) {
                mv = 5;
                G.Gprevious = 0;
            }

            if (mv !== 5 && G.GCORR > 0 && random(G.GCORR) === 1) {
                mv = 6;
                G.Gprevious = 0;
            }

            if (G.GCOJJ > 0 && random(G.GCOJJ) === 1) {
                mv = 0;
            }

            // Keep this if you have added teleports.
            if (typeof tryTeleportJump === "function" && mv !== 5 && mv !== 6 && tryTeleportJump()) {
                return false;
            }

            if (mv === 0) setCurrentStatus("Jumping jack");
            else if (mv >= 1 && mv <= 4) setCurrentStatus("Digging");
            else if (mv === 5) setCurrentStatus("Block room");
            else if (mv === 6) setCurrentStatus("Random room");

            if (mv === 0) {
                let ok = false;
                let nx = 0;
                let ny = 0;

                while (!ok && attempt < 900) {
                    attempt++;

                    nx = random(1, G.Gmapx);
                    ny = random(1, G.Gmapy);

                    let wll = true;

                    if (wallcount(nx, ny) !== 3) wll = false;
                    if (map[nx][ny].flr !== 0) wll = false;
                    if (map[nx][ny].undiggable || map[nx][ny].Notouch) wll = false;

                    // Do not let ordinary jumping jack dig onto or beside teleport pads.
                    if (map[nx][ny].teleportId) wll = false;
                    if (tileNearTeleport(nx, ny, 1)) wll = false;

                    if (wll) ok = true;
                }

                if (attempt < 900) {
                    G.Gdx = nx;
                    G.Gdy = ny;
                    dig(G.Gdx, G.Gdy);
                } else {
                    G.Gflops++;
                }
            } else if (mv >= 1 && mv <= 4) {
                if (mv === 1) G.Gdx++;
                else if (mv === 2) G.Gdx--;
                else if (mv === 3) G.Gdy--;
                else if (mv === 4) G.Gdy++;

                dig(G.Gdx, G.Gdy);
            } else if (mv === 5) {
                const plan = planBlockRoom(G.Gdx, G.Gdy);

                if (plan) {
                    G._blockRoomCount++;
                    G._roomPlan = plan;
                } else {
                    G.Gflops++;
                }
            } else if (mv === 6) {
                const plan = planRandRoom(G.Gdx, G.Gdy);

                if (plan) {
                    G._randomRoomCount++;
                    G._roomPlan = plan;
                } else {
                    G.Gflops++;
                }
            }

            return false;
        }

        const frame = () => {
            const speed = getProcessSpeed();
            const speedSteps = processSpeedToStepsPerFrame(speed);

            if (speedSteps <= 0) {
                setCurrentStatus("Paused");
                draw();
                animHandle = requestAnimationFrame(frame);
                return;
            }

            processStepAccumulator += speedSteps;

            const stepsThisFrame = Math.floor(processStepAccumulator);
            processStepAccumulator -= stepsThisFrame;

            if (stepsThisFrame <= 0) {
                draw();
                animHandle = requestAnimationFrame(frame);
                return;
            }

            for (let i = 0; i < stepsThisFrame; i++) {
                const finished = stepOnce();

                if (finished) {
                    animHandle = null;
                    return;
                }
            }

            draw();

            animHandle = requestAnimationFrame(frame);
        };

        frame();
    }

    // ---------- Orchestration ----------
    function run(showProcess) {
        if (animHandle) {
            cancelAnimationFrame(animHandle);
            animHandle = null;
        }

        readConfig();
        allocateMap();
        initialize_map(true);

        G.Gmove = 0;
        G.Gdx = 0;
        G.Gdy = 0;
        G.Gprevious = 0;
        G.Gid = 0;
        G.Gstartx = 0;
        G.Gstarty = 0;
        G.Gflops = 0;
        G._roomPlan = null;
        G._startEntranceEnforced = false;
        G._finished = false;
        G._exitX = 0;
        G._exitY = 0;
        G._blockRoomCount = 0;
        G._randomRoomCount = 0;
        G._unlockedDoorCount = 0;
        G._lockedDoorCount = 0;
        processStepAccumulator = 0;
        resetTeleports();
        setup_notouchzones();
        initialize_digger(!!G.edgeStart);

        setCurrentStatus("Starting");

        if (showProcess) {
            runStepByStep();
        } else {
            DiggerPhase(false);
            solo_hole_filler();
            placeDoorsAndKeys();
            computeExitTile();

            G._finished = true;

            draw();
        }
    }

    // ---------- Events ----------
    els.btnGenerate.addEventListener("click", () => run(els.showProcess.checked));

    let resizeDrawQueued = false;

    function queueDraw() {
        if (resizeDrawQueued) return;

        resizeDrawQueued = true;

        requestAnimationFrame(() => {
            resizeDrawQueued = false;

            if (G && map && map.length) {
                draw();
            }
        });
    }

    window.addEventListener("resize", queueDraw);

    const sidebarEl = document.getElementById("sidebar");
    const viewEl = document.getElementById("mapViewport");

    els.toggleSidebar?.addEventListener("click", () => {
        if (!sidebarEl) return;

        sidebarEl.classList.toggle("collapsed");

        queueDraw();
        setTimeout(queueDraw, 130);
        setTimeout(queueDraw, 260);
    });

    if (viewEl && "ResizeObserver" in window) {
        const viewResizeObserver = new ResizeObserver(() => {
            queueDraw();
        });

        viewResizeObserver.observe(viewEl);
    }

    els.showArrows.addEventListener("change", () => {
        G.showArrows = !!els.showArrows.checked;
        draw();
    });

    els.showTint.addEventListener("change", () => {
        G.showTint = !!els.showTint.checked;
        draw();
    });

    els.showWater.addEventListener("change", () => {
        G.showWater = !!els.showWater.checked;
        draw();
    });

    els.showDoors.addEventListener("change", () => {
        G.showDoors = !!els.showDoors.checked;
        draw();
    });

    els.showExit.addEventListener("change", () => {
        G.showExit = !!els.showExit.checked;

        if (G._finished) computeExitTile();

        draw();
    });

    els.showTeleports?.addEventListener("change", () => {
        G.showTeleports = !!els.showTeleports.checked;
        draw();
    });

    document.querySelectorAll(".section-header").forEach((header) => {
        header.addEventListener("click", () => {
            header.parentElement.classList.toggle("open");
        });
    });

    els.processSpeed?.addEventListener("input", () => {
        updateProcessSpeedLabel();
    });

    if (els.btnApplyCode) {
        els.btnApplyCode.addEventListener("click", () => {
            try {
                applyConfigCode(els.configCode.value);
                draw();
            } catch (err) {
                setCurrentStatus("Invalid code");
            }
        });
    }

    if (els.btnCopyCode) {
        els.btnCopyCode.addEventListener("click", async () => {
            try {
                refreshConfigCode(true);
                await navigator.clipboard.writeText(els.configCode.value);
                setCurrentStatus("Code copied");
            } catch (err) {
                setCurrentStatus("Copy failed");
            }
        });
    }

    if (els.configCode) {
        els.configCode.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();

                try {
                    applyConfigCode(els.configCode.value);
                    draw();
                } catch (err) {
                    setCurrentStatus("Invalid code");
                }
            }
        });
    }

    document.querySelectorAll("input").forEach((el) => {
        if (el.id !== "configCode") {
            el.addEventListener("input", () => refreshConfigCode());
            el.addEventListener("change", () => refreshConfigCode(true));
        }
    });

    els.toggleLegend?.addEventListener("click", () => {
        if (!els.legendPanel) return;

        const collapsed = els.legendPanel.classList.toggle("collapsed");

        els.toggleLegend.setAttribute("aria-expanded", String(!collapsed));

        queueDraw();
        setTimeout(queueDraw, 130);
        setTimeout(queueDraw, 260);
    });

    // ---------- First paint ----------
    readConfig();
    allocateMap();
    initialize_map(true);
    setCurrentStatus("Ready");
    updateProcessSpeedLabel();
    refreshConfigCode(true);
    draw();
})();