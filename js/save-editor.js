import { RPGMV_ENGINE } from "./engines/rpgmv.js";
import { RPGMZ_ENGINE } from "./engines/rpgmz.js";
import { RPGMVX_ENGINE } from "./engines/rpgmvx.js";
import { RENPY_ENGINE } from "./engines/renpy.js";

const LOCAL_ENGINES = [RPGMV_ENGINE, RPGMZ_ENGINE, RPGMVX_ENGINE];
const RENPY_RULES_URL = "https://script.google.com/macros/s/AKfycbzeCFEGNVwhnwYrdp6JlIh8sJOa0zYSe8w8TneyRQ-2swWwd7WoukEUb95n_3SzRy-dqg/exec";

const el = {
  saveFile: document.getElementById("saveFile"),
  fileName: document.getElementById("fileName"),
  detectMode: document.getElementById("detectMode"),
  gameSlug: document.getElementById("gameSlug"),
  gameSlugWrap: document.getElementById("gameSlugWrap"),
  candidateList: document.getElementById("candidateList"),
  selectedPath: document.getElementById("selectedPath"),
  currentMoney: document.getElementById("currentMoney"),
  newMoney: document.getElementById("newMoney"),
  inspectBtn: document.getElementById("inspectBtn"),
  applyBtn: document.getElementById("applyMoney"),
  downloadBtn: document.getElementById("downloadSave"),
  resetBtn: document.getElementById("resetEditor"),
  statusBox: document.getElementById("editorStatus"),
  logBox: document.getElementById("editorLog")
};

const state = {
  file: null,
  buffer: null,
  engine: null,
  parsed: null,
  mode: "",
  meta: null,
  candidates: [],
  selectedCandidate: null
};

const MONEY_RE = /(gold|money|cash|coin|coins|credit|credits|wallet|funds|balance|bank|saldo|uang|duit|emas|เงิน|ทอง|เหรียญ|เครดิต)/i;

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function getSlug() {
  return String(el.gameSlug?.value || "").trim().toLowerCase();
}

function setStatus(msg, isError = false) {
  if (!el.statusBox) return;
  el.statusBox.textContent = msg;
  el.statusBox.style.color = isError ? "#ffd1df" : "";
}

function setLog(data) {
  if (!el.logBox) return;
  if (typeof data === "string") {
    el.logBox.textContent = data;
  } else {
    el.logBox.textContent = JSON.stringify(data, null, 2);
  }
}

function updateSlugVisibility() {
  if (!el.gameSlugWrap) return;
  const show = state.engine?.id === "renpy";
  el.gameSlugWrap.style.display = show ? "" : "none";
}

async function loadRenpyGameList() {
  if (!el.gameSlug) return;

  try {
    el.gameSlug.innerHTML = `<option value="">Memuat daftar game...</option>`;

    const res = await fetch(RENPY_RULES_URL, {
      method: "GET",
      cache: "no-store"
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.json();

    let rows = [];
    if (Array.isArray(raw)) {
      rows = raw;
    } else if (Array.isArray(raw.rows)) {
      rows = raw.rows;
    } else if (Array.isArray(raw.data)) {
      rows = raw.data;
    } else if (Array.isArray(raw.games)) {
      rows = raw.games;
    }

    const items = rows
      .map((row) => {
        const enabled = String(row.enabled ?? "true").trim().toLowerCase();
        const slug = String(row.gameSlug || row.slug || "").trim();
        const title = String(
          row.title ||
          row.gameTitle ||
          row.name ||
          row.label ||
          row.gameSlug ||
          row.slug ||
          ""
        ).trim();

        return {
          enabled: !["false", "0", "no", "off"].includes(enabled),
          slug,
          title
        };
      })
      .filter((item) => item.enabled && item.slug && item.title);

    items.sort((a, b) => a.title.localeCompare(b.title));

    if (!items.length) {
      el.gameSlug.innerHTML = `<option value="">Tidak ada game tersedia</option>`;
      return;
    }

    el.gameSlug.innerHTML = `
      <option value="">Pilih game...</option>
      ${items.map((item) => `
        <option value="${escapeHtml(item.slug)}">${escapeHtml(item.title)}</option>
      `).join("")}
    `;
  } catch (error) {
    console.error("Gagal memuat daftar game Ren'Py:", error);
    el.gameSlug.innerHTML = `<option value="">Gagal memuat daftar game</option>`;
  }
}

function decodeText(buffer) {
  return new TextDecoder("utf-8").decode(buffer);
}

function extOf(fileName) {
  const m = String(fileName || "").toLowerCase().match(/(\.[^.]+)$/);
  return m ? m[1] : "";
}

function candidateScore(path) {
  const p = String(path || "").toLowerCase();
  if (p === "store.money" || p.endsWith(".money")) return 0;
  if (p.includes("money")) return 1;
  if (p === "store.gold" || p.endsWith(".gold")) return 2;
  if (p.includes("gold")) return 3;
  if (p.includes("cash")) return 4;
  if (p.includes("coin") || p.includes("เหรียญ")) return 5;
  if (p.includes("credit") || p.includes("เครดิต")) return 6;
  if (p.includes("wallet")) return 7;
  if (p.includes("fund")) return 8;
  if (p.includes("balance")) return 9;
  if (p.includes("เงิน") || p.includes("uang") || p.includes("duit")) return 10;
  if (p.includes("ทอง") || p.includes("emas")) return 11;
  return 50;
}

function pathFromKeyChain(keyChain) {
  return (Array.isArray(keyChain) ? keyChain : []).map(String).join(".");
}

function isObjectLike(value) {
  return value !== null && typeof value === "object";
}

function isNumericValue(value) {
  return (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "bigint");
}

function defaultScanCandidates(root) {
  const out = [];
  const seen = new Set();

  function walk(node, keyChain = [], depth = 0) {
    if (depth > 8) return;
    if (!isObjectLike(node)) return;

    const id = node;
    if (seen.has(id)) return;
    seen.add(id);

    if (Array.isArray(node)) {
      node.forEach((value, index) => {
        const nextKeyChain = [...keyChain, index];
        const path = pathFromKeyChain(nextKeyChain);

        if (isNumericValue(value) && MONEY_RE.test(path)) {
          out.push({
            keyChain: nextKeyChain,
            path,
            value: Number(value),
            score: candidateScore(path)
          });
        }

        if (isObjectLike(value)) {
          walk(value, nextKeyChain, depth + 1);
        }
      });
      return;
    }

    if (node instanceof Map) {
      for (const [key, value] of node.entries()) {
        const nextKeyChain = [...keyChain, key];
        const path = pathFromKeyChain(nextKeyChain);

        if (isNumericValue(value) && MONEY_RE.test(path)) {
          out.push({
            keyChain: nextKeyChain,
            path,
            value: Number(value),
            score: candidateScore(path)
          });
        }

        if (isObjectLike(value)) {
          walk(value, nextKeyChain, depth + 1);
        }
      }
      return;
    }

    Object.entries(node).forEach(([key, value]) => {
      const nextKeyChain = [...keyChain, key];
      const path = pathFromKeyChain(nextKeyChain);

      if (isNumericValue(value) && MONEY_RE.test(path)) {
        out.push({
          keyChain: nextKeyChain,
          path,
          value: Number(value),
          score: candidateScore(path)
        });
      }

      if (isObjectLike(value)) {
        walk(value, nextKeyChain, depth + 1);
      }
    });
  }

  walk(root);

  const unique = [];
  const used = new Set();

  out
    .sort((a, b) => (a.score - b.score) || a.path.localeCompare(b.path))
    .forEach((item) => {
      const sig = `${item.path}::${item.value}`;
      if (used.has(sig)) return;
      used.add(sig);
      unique.push(item);
    });

  return unique;
}

function setAtKeyChain(root, keyChain, value) {
  if (!Array.isArray(keyChain) || !keyChain.length) {
    throw new Error("keyChain candidate tidak valid.");
  }

  let ref = root;

  for (let i = 0; i < keyChain.length - 1; i += 1) {
    const key = keyChain[i];

    if (Array.isArray(ref)) {
      ref = ref[key];
    } else if (ref instanceof Map) {
      ref = ref.get(key);
    } else if (isObjectLike(ref)) {
      ref = ref[key];
    } else {
      throw new Error("Gagal menelusuri path candidate.");
    }
  }

  const last = keyChain[keyChain.length - 1];

  if (Array.isArray(ref)) {
    ref[last] = value;
    return true;
  }

  if (ref instanceof Map) {
    ref.set(last, value);
    return true;
  }

  if (isObjectLike(ref)) {
    ref[last] = value;
    return true;
  }

  throw new Error("Gagal menyimpan nilai pada candidate.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "save-money-edited";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const helpers = {
  decodeText,
  defaultScanCandidates,
  setAtKeyChain,
  downloadBlob
};

function renderCandidates() {
  if (!el.candidateList) return;

  if (!state.candidates.length) {
    el.candidateList.innerHTML = `<div class="empty-state">Belum ada candidate. Upload save dulu.</div>`;
    return;
  }

  el.candidateList.innerHTML = state.candidates.map((item) => {
    const active = item.path === state.selectedCandidate?.path ? "active" : "";
    return `
      <button
        type="button"
        class="candidate-chip ${active}"
        data-path="${escapeHtml(item.path)}"
        data-value="${escapeHtml(item.value)}"
      >
        <span>${escapeHtml(item.path)}</span>
        <strong>${escapeHtml(item.value)}</strong>
      </button>
    `;
  }).join("");
}

function selectCandidate(candidate) {
  if (!candidate) return;

  state.selectedCandidate = candidate;

  if (el.selectedPath) el.selectedPath.value = candidate.path || "";
  if (el.currentMoney) el.currentMoney.value = String(candidate.value ?? "");
  if (el.newMoney) el.newMoney.value = String(candidate.value ?? "");

  renderCandidates();
  setStatus(`Candidate dipilih: ${candidate.path}`);
}

async function detectEngine(file, buffer) {
  if (RENPY_ENGINE && typeof RENPY_ENGINE.match === "function" && RENPY_ENGINE.match(file)) {
    return RENPY_ENGINE;
  }

  const ext = extOf(file.name);

  for (const engine of LOCAL_ENGINES) {
    if (!engine) continue;

    if (Array.isArray(engine.extensions) && !engine.extensions.includes(ext)) {
      continue;
    }

    if (typeof engine.detect === "function") {
      try {
        const ok = await engine.detect({ ext, buffer, helpers });
        if (ok) return engine;
      } catch (_) {}
    } else {
      return engine;
    }
  }

  return null;
}

function resetEditor() {
  state.file = null;
  state.buffer = null;
  state.engine = null;
  state.parsed = null;
  state.mode = "";
  state.meta = null;
  state.candidates = [];
  state.selectedCandidate = null;

  if (el.saveFile) el.saveFile.value = "";
  if (el.fileName) el.fileName.value = "";
  if (el.detectMode) el.detectMode.value = "";
  if (el.selectedPath) el.selectedPath.value = "";
  if (el.currentMoney) el.currentMoney.value = "";
  if (el.newMoney) el.newMoney.value = "";

  renderCandidates();
  updateSlugVisibility();
  setStatus("Menunggu file save.");
  setLog("Belum ada proses.");
}

if (el.candidateList) {
  el.candidateList.addEventListener("click", (event) => {
    const btn = event.target.closest(".candidate-chip");
    if (!btn) return;

    const path = btn.dataset.path || "";
    const candidate = state.candidates.find((item) => item.path === path);
    if (!candidate) return;

    selectCandidate(candidate);
  });
}

if (el.saveFile) {
  el.saveFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      state.file = file;
      state.buffer = await file.arrayBuffer();
      state.engine = await detectEngine(file, state.buffer);

      if (!state.engine) {
        throw new Error("Format file belum didukung.");
      }

      if (el.fileName) el.fileName.value = file.name;
      if (el.detectMode) el.detectMode.value = state.engine.label || state.engine.id || "Unknown";

      updateSlugVisibility();
      setStatus(`Membaca save dengan engine ${state.engine.label}...`);

      if (state.engine.id === "renpy") {
        const result = await state.engine.read(file, { slug: getSlug() });

        state.parsed = null;
        state.mode = "renpy-backend";
        state.meta = result.meta || null;
        state.candidates = Array.isArray(result.candidates) ? result.candidates : [];
      } else {
        const parsedResult = await state.engine.parse({
          buffer: state.buffer,
          helpers
        });

        state.parsed = parsedResult.parsed;
        state.mode = parsedResult.mode || "";
        state.meta = parsedResult.meta || null;

        let candidates = [];
        if (typeof state.engine.findCandidates === "function") {
          candidates = await state.engine.findCandidates({
            parsed: state.parsed,
            helpers
          });
        }

        if (!Array.isArray(candidates) || !candidates.length) {
          candidates = defaultScanCandidates(state.parsed);
        }

        state.candidates = candidates.map((item) => ({
          keyChain: item.keyChain,
          path: item.path || pathFromKeyChain(item.keyChain || []),
          value: Number(item.value ?? 0)
        }));
      }

      renderCandidates();

      if (state.candidates.length) {
        selectCandidate(state.candidates[0]);
      }

      setStatus(`Save berhasil dibaca dengan ${state.engine.label}.`);
      setLog({
        engine: state.engine.id,
        mode: state.mode,
        meta: state.meta,
        candidate_count: state.candidates.length,
        candidates: state.candidates
      });
    } catch (error) {
      setStatus(error.message || "Gagal membaca save.", true);
      setLog(String(error.stack || error));
    }
  });
}

if (el.inspectBtn) {
  el.inspectBtn.addEventListener("click", async () => {
    try {
      if (!state.engine) throw new Error("Upload save dulu.");

      if (state.engine.id === "renpy") {
        if (typeof state.engine.inspect === "function") {
          const result = await state.engine.inspect(state.file, { slug: getSlug() });
          setStatus("Inspect berhasil.");
          setLog(result);
          return;
        }

        setStatus("Inspect backend Ren'Py belum disediakan.");
        setLog({
          engine: "renpy",
          slug: getSlug(),
          candidate_count: state.candidates.length,
          meta: state.meta
        });
        return;
      }

      setStatus("Inspect berhasil.");
      setLog({
        engine: state.engine.id,
        label: state.engine.label,
        mode: state.mode,
        meta: state.meta,
        candidate_count: state.candidates.length,
        candidates: state.candidates
      });
    } catch (error) {
      setStatus(error.message || "Inspect gagal.", true);
      setLog(String(error.stack || error));
    }
  });
}

if (el.applyBtn) {
  el.applyBtn.addEventListener("click", async () => {
    try {
      if (!state.engine) throw new Error("Upload save dulu.");
      if (!state.selectedCandidate) throw new Error("Pilih candidate dulu.");

      const newValue = Number(el.newMoney?.value);
      if (!Number.isFinite(newValue) || newValue < 0) {
        throw new Error("Nilai uang baru tidak valid.");
      }

      setStatus("Menyimpan nilai uang...");

      if (state.engine.id === "renpy") {
        const result = await state.engine.applyMoney({
          file: state.file,
          parsed: null,
          path: state.selectedCandidate.path,
          value: newValue,
          slug: getSlug()
        });

        state.meta = result.meta || state.meta;
        state.selectedCandidate.value = newValue;
      } else {
        await state.engine.applyValue({
          parsed: state.parsed,
          keyChain: state.selectedCandidate.keyChain,
          value: newValue,
          helpers
        });

        state.candidates = defaultScanCandidates(state.parsed).map((item) => ({
          keyChain: item.keyChain,
          path: item.path,
          value: Number(item.value ?? 0)
        }));

        const updated = state.candidates.find((c) => c.path === state.selectedCandidate.path) || state.candidates[0];
        if (updated) {
          state.selectedCandidate = updated;
        }
      }

      if (el.currentMoney) el.currentMoney.value = String(newValue);

      renderCandidates();
      if (state.selectedCandidate) {
        selectCandidate(state.selectedCandidate);
      }

      setStatus("Nilai uang berhasil diubah.");
      setLog({
        ok: true,
        engine: state.engine.id,
        selected_path: state.selectedCandidate?.path || "",
        new_value: newValue
      });
    } catch (error) {
      setStatus(error.message || "Gagal mengubah uang.", true);
      setLog(String(error.stack || error));
    }
  });
}

if (el.downloadBtn) {
  el.downloadBtn.addEventListener("click", async () => {
    try {
      if (!state.engine) throw new Error("Upload save dulu.");

      setStatus("Membuat file save baru...");

      if (state.engine.id === "renpy") {
        const result = await state.engine.download({
          file: state.file,
          parsed: null,
          slug: getSlug(),
          path: state.selectedCandidate?.path || "",
          value: Number(el.newMoney?.value || state.selectedCandidate?.value || 0)
        });

        setStatus("Save baru berhasil dibuat.");
        setLog(result || "Download berhasil.");
        return;
      }

      const serialized = await state.engine.serialize({
        parsed: state.parsed,
        fileName: state.file.name,
        mode: state.mode,
        helpers
      });

      if (!serialized || !serialized.blob) {
        throw new Error("Serialize gagal membuat blob.");
      }

      downloadBlob(serialized.blob, serialized.fileName || state.file.name);
      setStatus("Save baru berhasil dibuat.");
      setLog({
        ok: true,
        engine: state.engine.id,
        fileName: serialized.fileName
      });
    } catch (error) {
      setStatus(error.message || "Gagal download save.", true);
      setLog(String(error.stack || error));
    }
  });
}

if (el.resetBtn) {
  el.resetBtn.addEventListener("click", resetEditor);
}

loadRenpyGameList();
resetEditor();