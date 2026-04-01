(() => {
  const fileInput = document.getElementById("saveFile");
  const fileNameInput = document.getElementById("fileName");
  const detectModeInput = document.getElementById("detectMode");
  const candidateList = document.getElementById("candidateList");
  const selectedPathInput = document.getElementById("selectedPath");
  const currentMoneyInput = document.getElementById("currentMoney");
  const newMoneyInput = document.getElementById("newMoney");
  const applyBtn = document.getElementById("applyMoney");
  const downloadBtn = document.getElementById("downloadSave");
  const resetBtn = document.getElementById("resetEditor");
  const editorStatus = document.getElementById("editorStatus");
  const editorLog = document.getElementById("editorLog");
  const gameSlugInput = document.getElementById("gameSlug");

  const MONEY_RE = /(gold|money|cash|coin|coins|credit|credits|wallet|funds|balance|bank|saldo|uang)/i;
  const VXACE_MARSHAL_URL = "https://esm.sh/@hyrious/marshal";
  const ZIP_JS_URL = "https://esm.sh/@zip.js/zip.js";
  const RENPY_RULES_URL = "https://script.googleusercontent.com/macros/echo?user_content_key=AWDtjMVCqdm-kXhbZ2NlEllCYe7CnbriUv7NbxKBur1iMSfaMiF3tm2-A5jJf2RuXR734zwqG0w-scWiMkbyTZ-nT_VGpr_ft6dOgeVkdmRsUKdKP8FvDtLujTU4B29zCYL0qNtbdkogGbkZf22cyTv4AwkGu5eHJ0zoFioctKSx3YH4aTam4f1w-8CIMLSXiRf0yr3D71MaQcyaopQfGcezNiGKcFz1nR01ngxRk-mUXaMqAJ_pSoLuCtHvRUuPdAWNnHnqbXD-hWgg9CgKDUNKz3GNMHuN5A&lib=M51hLTJXPQ14ZsjBvmZx8t4ZA7c56I8fg&sheet=renpy_save_code";

  const state = {
    fileName: "",
    mode: "",
    parsed: null,
    selectedPathLabel: "",
    selectedKeyChain: null,
    candidates: [],
    marshalApi: null,
    zipApi: null,
    originalBuffer: null,
    renpyRulesBySlug: null
  };

  function setStatus(msg, isError = false) {
    if (!editorStatus) return;
    editorStatus.textContent = msg;
    editorStatus.style.color = isError ? "#ffd3dc" : "";
  }

  function setLog(msg) {
    if (!editorLog) return;
    editorLog.textContent = msg;
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

  function decodeUtf8(buffer) {
    return new TextDecoder("utf-8").decode(buffer);
  }

  function parseJsonText(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) throw new Error("File kosong.");
    return JSON.parse(trimmed);
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

  function normalizeBool(value) {
    const v = String(value ?? "").trim().toLowerCase();
    return !(v === "false" || v === "0" || v === "no" || v === "off");
  }

  async function loadRenpyRules() {
    if (state.renpyRulesBySlug) return state.renpyRulesBySlug;

    const res = await fetch(RENPY_RULES_URL);
    if (!res.ok) {
      throw new Error("Gagal memuat rules Ren'Py dari Google Sheet.");
    }

    const data = await res.json();
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const grouped = {};

    rows.forEach((row) => {
      const slug = String(row.gameSlug || "").trim();
      const moneyPath = String(row.moneyPath || "").trim();
      const label = String(row.label || moneyPath).trim();
      const enabled = normalizeBool(row.enabled);

      if (!enabled || !slug || !moneyPath) return;

      if (!grouped[slug]) grouped[slug] = [];
      grouped[slug].push({
        path: moneyPath,
        label
      });
    });

    state.renpyRulesBySlug = grouped;
    return grouped;
  }

  function getCurrentGameSlug() {
    return String(gameSlugInput?.value || "").trim();
  }

  function collectRenpyCandidatesFromRules(parsed, gameSlug, rulesBySlug) {
    const rules = rulesBySlug?.[gameSlug] || [];
    const bucket = [];

    for (const rule of rules) {
      const keyChain = pathToKeyChain(rule.path);
      const value = getAtKeyChain(parsed, keyChain);

      if (typeof value === "number" && Number.isFinite(value)) {
        bucket.push({
          pathLabel: rule.path,
          keyChain,
          key: rule.label || rule.path,
          value,
          source: "renpy-rule"
        });
      }
    }

    return bucket;
  }

  function walk(obj, pathLabels = [], keyChain = [], bucket = []) {
    if (!isObjectLike(obj) && !Array.isArray(obj)) return bucket;

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        walk(item, [...pathLabels, String(index)], [...keyChain, index], bucket);
      });
      return bucket;
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
          value
        });
      }

      if (isObjectLike(value) || Array.isArray(value)) {
        walk(value, nextLabels, nextKeyChain, bucket);
      }
    }

    return bucket;
  }

  function uniqueCandidates(items) {
    const seen = new Set();
    return items.filter((item) => {
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
        if (path.includes("gameparty._gold")) return 0;
        if (path.includes("@gold")) return 1;
        if (path.endsWith("._gold")) return 2;
        if (path.endsWith(".gold")) return 3;
        if (path.includes("gold")) return 4;
        if (path.includes("money")) return 5;
        if (path.includes("cash")) return 6;
        if (path.includes("credit")) return 7;
        if (path.includes("wallet")) return 8;
        if (path.includes("funds")) return 9;
        if (path.includes("balance")) return 10;
        return 20;
      };
      return score(a) - score(b);
    });
  }

  function renderCandidates() {
    if (!candidateList) return;

    if (!state.candidates.length) {
      candidateList.innerHTML = '<div class="empty-state">Tidak ada kandidat uang yang ditemukan pada save ini.</div>';
      return;
    }

    candidateList.innerHTML = state.candidates.map((item) => {
      const active = item.pathLabel === state.selectedPathLabel ? "active" : "";
      return `
        <button type="button" class="candidate-chip ${active}" data-path="${escapeHTML(item.pathLabel)}">
          <span>${escapeHTML(item.pathLabel)}</span>
          <strong>${escapeHTML(item.value)}</strong>
        </button>
      `;
    }).join("");

    candidateList.querySelectorAll(".candidate-chip").forEach((btn) => {
      btn.addEventListener("click", () => selectPath(btn.dataset.path));
    });
  }

  function selectPath(pathLabel) {
    const item = state.candidates.find((c) => c.pathLabel === pathLabel);
    if (!item) return;

    state.selectedPathLabel = item.pathLabel;
    state.selectedKeyChain = item.keyChain;

    if (selectedPathInput) selectedPathInput.value = item.pathLabel;

    const value = getAtKeyChain(state.parsed, item.keyChain);
    if (currentMoneyInput) currentMoneyInput.value = value ?? "";
    if (newMoneyInput) newMoneyInput.value = value ?? "";

    renderCandidates();
    setStatus(`Candidate dipilih: ${item.pathLabel}`);
  }

  async function getMarshalApi() {
    if (state.marshalApi) return state.marshalApi;

    try {
      const mod = await import(VXACE_MARSHAL_URL);
      if (!mod || typeof mod.load !== "function" || typeof mod.dump !== "function") {
        throw new Error("Library Ruby Marshal tidak punya API load/dump yang diharapkan.");
      }
      state.marshalApi = mod;
      return mod;
    } catch (error) {
      throw new Error("Gagal memuat library VX Ace dari CDN. Cek koneksi atau coba lagi.");
    }
  }

  async function getZipApi() {
    if (state.zipApi) return state.zipApi;

    try {
      const mod = await import(ZIP_JS_URL);
      if (!mod || typeof mod.ZipReader !== "function" || typeof mod.BlobReader !== "function") {
        throw new Error("zip.js tidak punya API yang diharapkan.");
      }
      state.zipApi = mod;
      return mod;
    } catch (error) {
      throw new Error("Gagal memuat zip.js dari CDN.");
    }
  }

  async function tryParseRenpySave(buffer) {
    const zip = await getZipApi();
    const blob = new Blob([buffer], { type: "application/octet-stream" });

    let zipReader;

    try {
      zipReader = new zip.ZipReader(new zip.BlobReader(blob));
      const entries = await zipReader.getEntries();

      if (!entries || !entries.length) {
        throw new Error("File .save Ren'Py terbuka sebagai ZIP, tetapi tidak punya isi.");
      }

      const names = entries.map((entry) => entry.filename || entry.name || "");

      const logEntry = entries.find((entry) => {
        const name = String(entry.filename || entry.name || "");
        return name === "log";
      });

      const jsonEntry = entries.find((entry) => {
        const name = String(entry.filename || entry.name || "");
        return name === "json";
      });

      let metaJson = null;
      if (jsonEntry) {
        try {
          const jsonText = await jsonEntry.getData(new zip.TextWriter());
          metaJson = JSON.parse(jsonText);
        } catch (_) {}
      }

      let logBuffer = null;
      if (logEntry) {
        try {
          const logBlob = await logEntry.getData(new zip.BlobWriter());
          logBuffer = await logBlob.arrayBuffer();
        } catch (_) {}
      }

      await zipReader.close();

      return {
        mode: "renpy-save-zip",
        parsed: {
          __renpyArchive: true,
          entries: names,
          metaJson,
          logBuffer
        }
      };
    } catch (error) {
      try {
        if (zipReader) await zipReader.close();
      } catch (_) {}

      try {
        const text = decodeUtf8(buffer).trim();
        if (text.startsWith("{") || text.startsWith("[")) {
          return {
            mode: "renpy-json-export",
            parsed: JSON.parse(text)
          };
        }
      } catch (_) {}

      throw new Error("File .save tidak terbaca sebagai ZIP Ren'Py yang valid.");
    }
  }

  async function tryParse(buffer, fileName) {
    const ext = getExt(fileName);

    if (ext === ".save") {
      return await tryParseRenpySave(buffer);
    }

    if (ext === ".json" || ext === ".txt") {
      const text = decodeUtf8(buffer);
      return { mode: "json", parsed: parseJsonText(text) };
    }

    if (ext === ".rpgsave") {
      const text = decodeUtf8(buffer).trim();

      if (text.startsWith("{") || text.startsWith("[")) {
        return { mode: "json", parsed: JSON.parse(text) };
      }

      if (window.LZString && typeof window.LZString.decompressFromBase64 === "function") {
        const decompressed = window.LZString.decompressFromBase64(text);
        if (decompressed && (decompressed.trim().startsWith("{") || decompressed.trim().startsWith("["))) {
          return {
            mode: "mv-rpgsave-lzstring",
            parsed: JSON.parse(decompressed)
          };
        }
      }

      throw new Error("Format .rpgsave tidak terbaca sebagai MV umum.");
    }

    if (ext === ".rmmzsave") {
  const rawBytes = new Uint8Array(buffer);

  try {
    const text = decodeUtf8(buffer).trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      return { mode: "json", parsed: JSON.parse(text) };
    }
  } catch (_) {}

  if (!window.pako || typeof window.pako.inflate !== "function") {
    throw new Error("Library pako tidak termuat.");
  }

  try {
    const jsonText = window.pako.inflate(rawBytes, { to: "string" });
    if (jsonText && (jsonText.trim().startsWith("{") || jsonText.trim().startsWith("["))) {
      return {
        mode: "mz-rmmzsave-gzip",
        parsed: JSON.parse(jsonText)
      };
    }
  } catch (_) {}

  try {
    const zipText = decodeUtf8(buffer);
    const zipBytes = Uint8Array.from(zipText, ch => ch.charCodeAt(0) & 0xff);
    const jsonText = window.pako.inflate(zipBytes, { to: "string" });

    if (jsonText && (jsonText.trim().startsWith("{") || jsonText.trim().startsWith("["))) {
      return {
        mode: "mz-rmmzsave-gzip",
        parsed: JSON.parse(jsonText)
      };
    }
  } catch (_) {}

  try {
    const base64Text = decodeUtf8(buffer).trim();
    const binary = atob(base64Text);
    const zipBytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const jsonText = window.pako.inflate(zipBytes, { to: "string" });

    if (jsonText && (jsonText.trim().startsWith("{") || jsonText.trim().startsWith("["))) {
      return {
        mode: "mz-rmmzsave-gzip-base64",
        parsed: JSON.parse(jsonText)
      };
    }
  } catch (_) {}

  throw new Error("Format .rmmzsave tidak terbaca sebagai MZ umum.");
}

throw new Error("Format save belum didukung. Untuk saat ini pakai .save, .rpgsave, .rmmzsave, atau .rvdata2.");
}

  function resetEditor() {
    state.fileName = "";
    state.mode = "";
    state.parsed = null;
    state.selectedPathLabel = "";
    state.selectedKeyChain = null;
    state.candidates = [];
    state.originalBuffer = null;

    if (fileInput) fileInput.value = "";
    if (fileNameInput) fileNameInput.value = "";
    if (detectModeInput) detectModeInput.value = "";
    if (selectedPathInput) selectedPathInput.value = "";
    if (currentMoneyInput) currentMoneyInput.value = "";
    if (newMoneyInput) newMoneyInput.value = "";

    if (candidateList) {
      candidateList.innerHTML = '<div class="empty-state">Belum ada data. Upload save dulu.</div>';
    }

    setStatus("Menunggu file save.");
    setLog("Belum ada proses.");
  }

  if (fileInput) {
    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        state.originalBuffer = buffer;
        state.fileName = file.name;
        if (fileNameInput) fileNameInput.value = file.name;

        setStatus("Membaca file save...");

        const parsedResult = await tryParse(buffer, file.name);
        state.mode = parsedResult.mode;
        state.parsed = parsedResult.parsed;
        if (detectModeInput) detectModeInput.value = parsedResult.mode;

        if (parsedResult.mode === "renpy-save-zip") {
  const info = {
    entries: parsedResult.parsed.entries || [],
    hasMetaJson: !!parsedResult.parsed.metaJson,
    hasLog: !!parsedResult.parsed.logBuffer
  };

  if (!parsedResult.parsed.logBuffer) {
    state.candidates = [];
    renderCandidates();
    setLog(JSON.stringify(info, null, 2));
    setStatus("Arsip .save Ren'Py terbuka, tetapi entry log tidak ditemukan.", true);
    return;
  }

  let renpyState;
  try {
    if (!window.renpyPickle || typeof window.renpyPickle.parseLogBuffer !== "function") {
      throw new Error("renpy-pickle.js belum termuat.");
    }

    renpyState = window.renpyPickle.parseLogBuffer(parsedResult.parsed.logBuffer);
  } catch (err) {
    state.candidates = [];
    renderCandidates();
    setLog(JSON.stringify(info, null, 2));
    setStatus(`ZIP Ren'Py terbuka, tetapi pickle log gagal diparse: ${err.message}`, true);
    return;
  }

  state.mode = "renpy-save-pickle-read";
  state.parsed = renpyState;
  if (detectModeInput) detectModeInput.value = state.mode;

  const slug = getCurrentGameSlug();
  if (!slug) {
    setLog(JSON.stringify({
      ...info,
      parsedType: window.renpyPickle.safeDescribe(renpyState)
    }, null, 2));
    setStatus("ZIP dan pickle Ren'Py berhasil dibaca. Isi Game Slug untuk mencocokkan rules.", true);
    return;
  }

  const rulesBySlug = await loadRenpyRules();
  const byRules = collectRenpyCandidatesFromRules(state.parsed, slug, rulesBySlug);
  const autoScan = rankCandidates(uniqueCandidates(walk(state.parsed)));

  const found = byRules.length ? byRules : autoScan;
  state.candidates = found;

  setLog(JSON.stringify(
    {
      ...info,
      parsedType: window.renpyPickle.safeDescribe(renpyState),
      candidates: found.slice(0, 12).map((item) => ({
        path: item.pathLabel,
        value: item.value
      }))
    },
    null,
    2
  ));

  if (!found.length) {
    renderCandidates();
    setStatus("ZIP dan pickle Ren'Py berhasil dibaca, tetapi candidate uang belum ditemukan.", true);
    return;
  }

  selectPath(found[0].pathLabel);
  renderCandidates();
  setStatus(`Ren'Py berhasil dibaca. Ditemukan ${found.length} candidate.`);
  return;
}

        let found = [];

        if (String(parsedResult.mode).startsWith("renpy")) {
          const slug = getCurrentGameSlug();

          if (!slug) {
            throw new Error("Isi Game Slug Ren'Py dulu sebelum upload save Ren'Py.");
          }

          const rulesBySlug = await loadRenpyRules();
          const byRules = collectRenpyCandidatesFromRules(state.parsed, slug, rulesBySlug);
          const autoScan = rankCandidates(uniqueCandidates(walk(state.parsed)));

          found = byRules.length ? byRules : autoScan;

          if (!byRules.length) {
            setStatus("Rules Ren'Py tidak menemukan path yang cocok. Dipakai auto scan.", true);
          }
        } else {
          found = rankCandidates(uniqueCandidates(walk(state.parsed)));
        }

        state.candidates = found;

        setLog(JSON.stringify(
          found.slice(0, 12).map((item) => ({
            path: item.pathLabel,
            value: item.value
          })),
          null,
          2
        ));

        if (!found.length) {
          renderCandidates();
          setStatus("Save berhasil dibaca, tapi candidate uang tidak ditemukan.", true);
          return;
        }

        selectPath(found[0].pathLabel);
        renderCandidates();
        setStatus(`Save berhasil dibaca. Ditemukan ${found.length} candidate.`);
      } catch (error) {
        resetEditor();
        if (fileNameInput) fileNameInput.value = file.name || "";
        setStatus(error.message || "Gagal membaca save.", true);
        setLog(String(error.stack || error));
      }
    });
  }

  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      if (!state.parsed || !state.selectedKeyChain) {
        setStatus("Upload save dan pilih candidate uang dulu.", true);
        return;
      }

      const nextValue = Number(newMoneyInput?.value);
      if (!Number.isFinite(nextValue) || nextValue < 0) {
        setStatus("Masukkan nilai uang yang valid.", true);
        return;
      }

      const ok = setAtKeyChain(state.parsed, state.selectedKeyChain, nextValue);
      if (!ok) {
        setStatus("Gagal menyimpan nilai baru ke path terpilih.", true);
        return;
      }

      if (currentMoneyInput) currentMoneyInput.value = String(nextValue);

      state.candidates = rankCandidates(uniqueCandidates(walk(state.parsed)));
      renderCandidates();

      setStatus(`Nilai uang diubah menjadi ${nextValue}. Sekarang kamu bisa download save baru.`);
      setLog(JSON.stringify(
        state.candidates.slice(0, 12).map((item) => ({
          path: item.pathLabel,
          value: item.value
        })),
        null,
        2
      ));
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      if (!state.parsed || !state.mode) {
        setStatus("Belum ada save yang siap didownload.", true);
        return;
      }

      if (String(state.mode).startsWith("renpy")) {
        setStatus(
          "Mode Ren'Py rules sudah aktif, tapi repack .save Ren'Py belum dipasang.",
          true
        );
        return;
      }

      try {
        const json = JSON.stringify(state.parsed);
        let blob;
        let outName = state.fileName || "edited-save";

        if (state.mode === "mv-rpgsave-lzstring") {
          if (!window.LZString || typeof window.LZString.compressToBase64 !== "function") {
            throw new Error("Library LZString tidak termuat.");
          }
          const output = window.LZString.compressToBase64(json);
          if (!outName.endsWith(".rpgsave")) outName += ".rpgsave";
          blob = new Blob([output], { type: "text/plain;charset=utf-8" });
        } else if (state.mode === "mz-rmmzsave-gzip") {
          if (!window.pako || typeof window.pako.gzip !== "function") {
            throw new Error("Library pako tidak termuat.");
          }
          const gz = window.pako.gzip(json);
          if (!outName.endsWith(".rmmzsave")) outName += ".rmmzsave";
          blob = new Blob([gz], { type: "application/octet-stream" });
        } else if (state.mode === "vxace-rvdata2-marshal") {
          const marshal = await getMarshalApi();
          const dumped = marshal.dump(state.parsed);
          if (!outName.endsWith(".rvdata2")) outName += ".rvdata2";
          blob = new Blob([dumped], { type: "application/octet-stream" });
        } else {
          if (!outName.endsWith(".json")) outName += ".json";
          blob = new Blob([json], { type: "application/json;charset=utf-8" });
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = outName.replace(/(\.rpgsave|\.rmmzsave|\.rvdata2|\.json)?$/, "-money-edited$1");
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        setStatus("Save baru berhasil dibuat dan diunduh.");
      } catch (error) {
        setStatus(error.message || "Gagal membuat save baru.", true);
        setLog(String(error.stack || error));
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", resetEditor);
  }

  resetEditor();
})();