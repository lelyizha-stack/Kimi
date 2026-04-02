import { RPGMV_ENGINE } from "./engines/rpgmv.js";
import { RPGMZ_ENGINE } from "./engines/rpgmz.js";
import { RPGMVX_ENGINE } from "./engines/rpgmvx.js";
import { RENPY_ENGINE } from "./engines/renpy.js";

(() => {
  const el = {
    fileInput: document.getElementById("saveFile"),
    fileNameInput: document.getElementById("fileName"),
    detectModeInput: document.getElementById("detectMode"),
    candidateList: document.getElementById("candidateList"),
    selectedPathInput: document.getElementById("selectedPath"),
    currentMoneyInput: document.getElementById("currentMoney"),
    newMoneyInput: document.getElementById("newMoney"),
    applyBtn: document.getElementById("applyMoney"),
    downloadBtn: document.getElementById("downloadSave"),
    resetBtn: document.getElementById("resetEditor"),
    editorStatus: document.getElementById("editorStatus"),
    editorLog: document.getElementById("editorLog"),
    gameSlugWrap: document.getElementById("gameSlugWrap"),
    gameSlugInput: document.getElementById("gameSlug")
  };

  const ENGINES = [
    RENPY_ENGINE,
    RPGMV_ENGINE,
    RPGMZ_ENGINE,
    RPGMVX_ENGINE
  ];

  const state = {
    file: null,
    fileName: "",
    ext: "",
    engine: null,
    mode: "",
    parsed: null,
    meta: null,
    candidates: [],
    selectedPathLabel: "",
    selectedKeyChain: null,
    originalBuffer: null
  };

  function setStatus(message, isError = false) {
    if (!el.editorStatus) return;
    el.editorStatus.textContent = String(message || "");
    el.editorStatus.style.color = isError ? "#ffd3dc" : "";
  }

  function setLog(value) {
    if (!el.editorLog) return;

    if (typeof value === "string") {
      el.editorLog.textContent = value;
      return;
    }

    try {
      el.editorLog.textContent = JSON.stringify(value, null, 2);
    } catch (_) {
      el.editorLog.textContent = String(value);
    }
  }

  function escapeHTML(text) {
    return String(text ?? "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  function isObjectLike(value) {
    return value !== null && typeof value === "object";
  }

  function getExt(fileName) {
    const name = String(fileName || "").toLowerCase();
    const idx = name.lastIndexOf(".");
    return idx >= 0 ? name.slice(idx) : "";
  }

  function keyToLabel(key) {
    if (typeof key === "symbol") {
      return Symbol.keyFor(key) || key.description || key.toString();
    }
    return String(key);
  }

  function joinPathLabels(parts) {
    return parts.join(".");
  }

  function getChildKeys(obj) {
    if (!isObjectLike(obj) && !Array.isArray(obj)) return [];
    return [
      ...Object.keys(obj),
      ...Object.getOwnPropertySymbols(obj)
    ];
  }

  function getAtKeyChain(obj, keyChain) {
    if (!Array.isArray(keyChain)) return undefined;

    let ref = obj;
    for (const key of keyChain) {
      if (!isObjectLike(ref) && !Array.isArray(ref)) return undefined;
      ref = ref[key];
    }
    return ref;
  }

  function setAtKeyChain(obj, keyChain, value) {
    if (!Array.isArray(keyChain) || !keyChain.length) return false;

    let ref = obj;
    for (let i = 0; i < keyChain.length - 1; i += 1) {
      const key = keyChain[i];
      if (!isObjectLike(ref) && !Array.isArray(ref)) return false;
      if (!(key in ref)) return false;
      ref = ref[key];
    }

    const last = keyChain[keyChain.length - 1];
    if (!isObjectLike(ref) && !Array.isArray(ref)) return false;

    ref[last] = value;
    return true;
  }

  function pathToKeyChain(path) {
    return String(path || "")
      .split(".")
      .map((part) => /^\d+$/.test(part) ? Number(part) : part)
      .filter((part) => part !== "");
  }

  function uniqueCandidates(items) {
    const seen = new Set();

    return (Array.isArray(items) ? items : []).filter((item) => {
      const sig = `${item.pathLabel}:${item.value}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }

  function rankCandidates(items) {
    return [...items].sort((a, b) => {
      const score = (item) => {
        const path = String(item.pathLabel || "").toLowerCase();

        if (item.source === "rule") return -10;
        if (path === "money" || path.endsWith(".money")) return 0;
        if (path.includes("money")) return 1;
        if (path === "gold" || path.endsWith(".gold")) return 2;
        if (path.includes("_gold")) return 3;
        if (path.includes("gold")) return 4;
        if (path.includes("cash")) return 5;
        if (path.includes("coin")) return 6;
        if (path.includes("credit")) return 7;
        if (path.includes("wallet")) return 8;
        if (path.includes("fund")) return 9;
        if (path.includes("balance")) return 10;
        return 50;
      };

      return score(a) - score(b);
    });
  }

  function pickInitialCandidate(items) {
    if (!items.length) return null;

    const exactMoney = items.find((item) => {
      const path = String(item.pathLabel || "").toLowerCase();
      return path === "money" || path.endsWith(".money");
    });
    if (exactMoney) return exactMoney;

    const exactGold = items.find((item) => {
      const path = String(item.pathLabel || "").toLowerCase();
      return path === "gold" || path.endsWith(".gold");
    });
    if (exactGold) return exactGold;

    const ruleMatch = items.find((item) => item.source === "rule");
    if (ruleMatch) return ruleMatch;

    return items[0];
  }

  function showGameSlug(show) {
    if (!el.gameSlugWrap) return;
    el.gameSlugWrap.style.display = show ? "" : "none";
  }

  function getCurrentGameSlug() {
    return String(el.gameSlugInput?.value || "").trim().toLowerCase();
  }

  function defaultScanCandidates(root) {
    const MONEY_RE = /(gold|money|cash|coin|coins|credit|credits|wallet|funds|balance|bank|saldo|uang)/i;
    const bucket = [];

    function walk(obj, pathLabels = [], keyChain = []) {
      if (!isObjectLike(obj) && !Array.isArray(obj)) return;

      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          walk(item, [...pathLabels, String(index)], [...keyChain, index]);
        });
        return;
      }

      for (const key of getChildKeys(obj)) {
        const value = obj[key];
        const label = keyToLabel(key);
        const nextLabels = [...pathLabels, label];
        const nextKeyChain = [...keyChain, key];
        const pathLabel = joinPathLabels(nextLabels);

        if (typeof value === "number" && Number.isFinite(value) && MONEY_RE.test(`${label} ${pathLabel}`)) {
          bucket.push({
            pathLabel,
            keyChain: nextKeyChain,
            key: label,
            value,
            source: "scan"
          });
        }

        if (isObjectLike(value) || Array.isArray(value)) {
          walk(value, nextLabels, nextKeyChain);
        }
      }
    }

    walk(root);
    return bucket;
  }

  function renderCandidates() {
    if (!el.candidateList) return;

    if (!state.candidates.length) {
      el.candidateList.innerHTML = '<div class="empty-state">Tidak ada candidate uang yang ditemukan.</div>';
      return;
    }

    el.candidateList.innerHTML = state.candidates.map((item) => {
      const active = item.pathLabel === state.selectedPathLabel ? "active" : "";
      return `
        <button type="button" class="candidate-chip ${active}" data-path="${escapeHTML(item.pathLabel)}">
          <span>${escapeHTML(item.pathLabel)}</span>
          <strong>${escapeHTML(item.value)}</strong>
        </button>
      `;
    }).join("");
  }

  function selectPath(pathLabel) {
    const item = state.candidates.find((c) => c.pathLabel === pathLabel);
    if (!item) return;

    state.selectedPathLabel = item.pathLabel;
    state.selectedKeyChain = item.keyChain;

    if (el.selectedPathInput) el.selectedPathInput.value = item.pathLabel;

    const value = getAtKeyChain(state.parsed, item.keyChain);
    if (el.currentMoneyInput) el.currentMoneyInput.value = value ?? "";
    if (el.newMoneyInput) el.newMoneyInput.value = value ?? "";

    renderCandidates();
    setStatus(`Candidate dipilih: ${item.pathLabel}`);
  }

  async function detectEngine(fileName, buffer) {
    const ext = getExt(fileName);

    for (const engine of ENGINES) {
      try {
        if (typeof engine.detect === "function") {
          const matched = await engine.detect({
            fileName,
            ext,
            buffer,
            helpers: {
              getExt,
              decodeText: (buf) => new TextDecoder("utf-8").decode(buf)
            }
          });

          if (matched) return engine;
        } else if (Array.isArray(engine.extensions) && engine.extensions.includes(ext)) {
          return engine;
        }
      } catch (_) {}
    }

    return null;
  }

  async function buildCandidates() {
    if (!state.engine || !state.parsed) {
      state.candidates = [];
      renderCandidates();
      return;
    }

    let found = [];

    if (typeof state.engine.findCandidates === "function") {
      found = await state.engine.findCandidates({
        parsed: state.parsed,
        state,
        helpers: {
          defaultScanCandidates,
          getAtKeyChain,
          pathToKeyChain,
          getCurrentGameSlug
        }
      });
    } else {
      found = defaultScanCandidates(state.parsed);
    }

    found = rankCandidates(uniqueCandidates(found));
    state.candidates = found;
    renderCandidates();

    const initial = pickInitialCandidate(found);
    if (initial) {
      selectPath(initial.pathLabel);
    } else {
      if (el.selectedPathInput) el.selectedPathInput.value = "";
      if (el.currentMoneyInput) el.currentMoneyInput.value = "";
      if (el.newMoneyInput) el.newMoneyInput.value = "";
      state.selectedPathLabel = "";
      state.selectedKeyChain = null;
    }
  }

  function resetEditor() {
    state.file = null;
    state.fileName = "";
    state.ext = "";
    state.engine = null;
    state.mode = "";
    state.parsed = null;
    state.meta = null;
    state.candidates = [];
    state.selectedPathLabel = "";
    state.selectedKeyChain = null;
    state.originalBuffer = null;

    if (el.fileInput) el.fileInput.value = "";
    if (el.fileNameInput) el.fileNameInput.value = "";
    if (el.detectModeInput) el.detectModeInput.value = "";
    if (el.selectedPathInput) el.selectedPathInput.value = "";
    if (el.currentMoneyInput) el.currentMoneyInput.value = "";
    if (el.newMoneyInput) el.newMoneyInput.value = "";

    if (el.candidateList) {
      el.candidateList.innerHTML = '<div class="empty-state">Belum ada data. Upload save dulu.</div>';
    }

    showGameSlug(false);
    setStatus("Menunggu file save.");
    setLog("Belum ada proses.");
  }

  if (el.candidateList) {
    el.candidateList.addEventListener("click", (event) => {
      const btn = event.target.closest(".candidate-chip");
      if (!btn) return;

      const path = btn.dataset.path || "";
      if (!path) return;

      selectPath(path);
    });
  }

  if (el.fileInput) {
    el.fileInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        resetEditor();

        state.file = file;
        state.fileName = file.name;
        state.ext = getExt(file.name);
        state.originalBuffer = await file.arrayBuffer();

        if (el.fileNameInput) el.fileNameInput.value = file.name;

        setStatus("Mendeteksi engine save...");

        const engine = await detectEngine(file.name, state.originalBuffer);
        if (!engine) {
          throw new Error("Engine save belum dikenali. Format belum didukung.");
        }

        state.engine = engine;
        showGameSlug(engine.id === "renpy");

        setStatus(`Engine terdeteksi: ${engine.label}. Membaca save...`);

        const result = await engine.parse({
          file,
          fileName: file.name,
          ext: state.ext,
          buffer: state.originalBuffer,
          helpers: {
            getExt,
            decodeText: (buf) => new TextDecoder("utf-8").decode(buf)
          },
          ui: {
            getCurrentGameSlug
          }
        });

        state.mode = String(result?.mode || engine.id);
        state.parsed = result?.parsed ?? null;
        state.meta = result?.meta ?? null;

        if (!state.parsed) {
          throw new Error("Parse berhasil dipanggil, tetapi data save kosong.");
        }

        if (el.detectModeInput) {
          el.detectModeInput.value = `${engine.label} / ${state.mode}`;
        }

        await buildCandidates();

        setLog({
          engine: engine.id,
          label: engine.label,
          mode: state.mode,
          meta: state.meta,
          candidates: state.candidates.slice(0, 12).map((item) => ({
            path: item.pathLabel,
            value: item.value,
            source: item.source || "scan"
          }))
        });

        if (!state.candidates.length) {
          setStatus("Save berhasil dibaca, tetapi candidate uang tidak ditemukan.", true);
          return;
        }

        setStatus(`Save berhasil dibaca. Engine: ${engine.label}. Candidate: ${state.candidates.length}.`);
      } catch (error) {
        const fileName = file?.name || "";
        resetEditor();
        if (el.fileNameInput) el.fileNameInput.value = fileName;
        setStatus(error?.message || "Gagal membaca save.", true);
        setLog(String(error?.stack || error));
      }
    });
  }

  if (el.applyBtn) {
    el.applyBtn.addEventListener("click", async () => {
      try {
        if (!state.parsed || !state.engine) {
          setStatus("Upload save dulu.", true);
          return;
        }

        if (!state.selectedKeyChain) {
          setStatus("Pilih candidate uang dulu.", true);
          return;
        }

        const nextValue = Number(el.newMoneyInput?.value);
        if (!Number.isFinite(nextValue) || nextValue < 0) {
          setStatus("Masukkan nilai uang yang valid.", true);
          return;
        }

        const previousPath = state.selectedPathLabel;

        let ok = false;
        if (typeof state.engine.applyValue === "function") {
          ok = await state.engine.applyValue({
            parsed: state.parsed,
            keyChain: state.selectedKeyChain,
            value: nextValue,
            state,
            helpers: {
              setAtKeyChain
            }
          });
        } else {
          ok = setAtKeyChain(state.parsed, state.selectedKeyChain, nextValue);
        }

        if (!ok) {
          setStatus("Gagal menyimpan nilai uang baru.", true);
          return;
        }

        if (el.currentMoneyInput) el.currentMoneyInput.value = String(nextValue);

        await buildCandidates();

        const stillExists = state.candidates.find((item) => item.pathLabel === previousPath);
        if (stillExists) {
          selectPath(previousPath);
        }

        setLog({
          engine: state.engine.id,
          mode: state.mode,
          selectedPath: state.selectedPathLabel,
          candidates: state.candidates.slice(0, 12).map((item) => ({
            path: item.pathLabel,
            value: item.value,
            source: item.source || "scan"
          }))
        });

        setStatus(`Nilai uang berhasil diubah menjadi ${nextValue}.`);
      } catch (error) {
        setStatus(error?.message || "Gagal menerapkan nilai baru.", true);
        setLog(String(error?.stack || error));
      }
    });
  }

  if (el.downloadBtn) {
    el.downloadBtn.addEventListener("click", async () => {
      try {
        if (!state.engine || !state.parsed) {
          setStatus("Belum ada save yang siap didownload.", true);
          return;
        }

        if (typeof state.engine.serialize !== "function") {
          setStatus("Engine ini belum punya fungsi serialize/download.", true);
          return;
        }

        setStatus("Membuat save baru...");

        const result = await state.engine.serialize({
          parsed: state.parsed,
          state,
          fileName: state.fileName,
          mode: state.mode,
          originalBuffer: state.originalBuffer,
          ui: {
            getCurrentGameSlug
          }
        });

        if (!result || !result.blob) {
          throw new Error("Serialize tidak menghasilkan blob.");
        }

        const downloadName = String(result.fileName || state.fileName || "edited-save");
        const url = URL.createObjectURL(result.blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        a.remove();

        URL.revokeObjectURL(url);

        setStatus("Save baru berhasil dibuat dan diunduh.");
      } catch (error) {
        setStatus(error?.message || "Gagal membuat save baru.", true);
        setLog(String(error?.stack || error));
      }
    });
  }

  if (el.resetBtn) {
    el.resetBtn.addEventListener("click", resetEditor);
  }

  if (el.gameSlugInput) {
    el.gameSlugInput.addEventListener("change", async () => {
      if (!state.engine || state.engine.id !== "renpy" || !state.parsed) return;

      try {
        setStatus("Game slug berubah. Memuat ulang candidate Ren'Py...");
        await buildCandidates();

        setLog({
          engine: state.engine.id,
          mode: state.mode,
          gameSlug: getCurrentGameSlug(),
          candidates: state.candidates.slice(0, 12).map((item) => ({
            path: item.pathLabel,
            value: item.value,
            source: item.source || "scan"
          }))
        });

        if (!state.candidates.length) {
          setStatus("Rules/scan Ren'Py tidak menemukan candidate uang.", true);
          return;
        }

        setStatus(`Candidate Ren'Py dimuat ulang. Ditemukan ${state.candidates.length} candidate.`);
      } catch (error) {
        setStatus(error?.message || "Gagal memuat ulang candidate Ren'Py.", true);
        setLog(String(error?.stack || error));
      }
    });
  }

  resetEditor();
})();