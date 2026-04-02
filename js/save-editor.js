import { RPGMV_ENGINE } from "./engines/rpgmv.js";
import { RPGMZ_ENGINE } from "./engines/rpgmz.js";
import { RPGMVX_ENGINE } from "./engines/rpgmvx.js";
import { RENPY_ENGINE } from "./engines/renpy.js";

const ENGINES = [
  RPGMV_ENGINE,
  RPGMZ_ENGINE,
  RPGMVX_ENGINE,
  RENPY_ENGINE
];

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
  engine: null,
  parsed: null,
  candidates: [],
  selectedPath: "",
  selectedValue: null
};

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
  const isRenpy = state.engine?.id === "renpy";
  el.gameSlugWrap.style.display = isRenpy ? "" : "none";
}

async function loadRenpyGameList() {
  if (!el.gameSlug) return;

  try {
    const res = await fetch(RENPY_RULES_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = await res.json();
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw.rows) ? raw.rows : [];

    const items = rows
      .filter((row) => {
        const enabled = String(row.enabled ?? "true").trim().toLowerCase();
        return !["false", "0", "no", "off"].includes(enabled);
      })
      .map((row) => ({
        slug: String(row.gameSlug || row.slug || "").trim(),
        title: String(row.title || row.gameTitle || row.label || row.gameSlug || "").trim()
      }))
      .filter((item) => item.slug && item.title);

    items.sort((a, b) => a.title.localeCompare(b.title));

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

function renderCandidates() {
  if (!el.candidateList) return;

  if (!state.candidates.length) {
    el.candidateList.innerHTML = `<div class="empty-state">Belum ada candidate. Upload save dulu.</div>`;
    return;
  }

  el.candidateList.innerHTML = state.candidates.map((item) => {
    const active = item.path === state.selectedPath ? "active" : "";
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

function selectCandidate(path, value) {
  state.selectedPath = path;
  state.selectedValue = value;

  if (el.selectedPath) el.selectedPath.value = path;
  if (el.currentMoney) el.currentMoney.value = String(value ?? "");
  if (el.newMoney) el.newMoney.value = String(value ?? "");

  renderCandidates();
  setStatus(`Candidate dipilih: ${path}`);
}

function detectEngine(file) {
  return ENGINES.find((engine) => engine.match(file)) || null;
}

function resetEditor() {
  state.file = null;
  state.engine = null;
  state.parsed = null;
  state.candidates = [];
  state.selectedPath = "";
  state.selectedValue = null;

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
    const value = Number(btn.dataset.value || 0);
    if (!path) return;

    selectCandidate(path, value);
  });
}

if (el.saveFile) {
  el.saveFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      state.file = file;
      state.engine = detectEngine(file);

      if (!state.engine) {
        throw new Error("Format file belum didukung.");
      }

      if (el.fileName) el.fileName.value = file.name;
      if (el.detectMode) el.detectMode.value = state.engine.label;

      updateSlugVisibility();
      setStatus(`Membaca save dengan engine ${state.engine.label}...`);

      const result = await state.engine.read(file, {
        slug: getSlug()
      });

      state.parsed = result.parsed || null;
      state.candidates = Array.isArray(result.candidates) ? result.candidates : [];

      renderCandidates();

      if (state.candidates.length) {
        const first = state.candidates[0];
        selectCandidate(first.path, first.value);
      }

      setStatus(`Save berhasil dibaca dengan ${state.engine.label}.`);
      setLog(result);
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

      if (typeof state.engine.inspect !== "function") {
        setStatus(`Inspect tidak tersedia untuk ${state.engine.label}.`);
        setLog("Engine ini tidak memiliki method inspect().");
        return;
      }

      setStatus("Inspect save...");
      const result = await state.engine.inspect(state.file, {
        slug: getSlug()
      });

      setStatus("Inspect berhasil.");
      setLog(result);
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
      if (!state.selectedPath) throw new Error("Pilih candidate dulu.");

      const newValue = Number(el.newMoney?.value);
      if (!Number.isFinite(newValue) || newValue < 0) {
        throw new Error("Nilai uang baru tidak valid.");
      }

      setStatus("Menyimpan nilai uang...");

      const result = await state.engine.applyMoney({
        file: state.file,
        parsed: state.parsed,
        path: state.selectedPath,
        value: newValue,
        slug: getSlug()
      });

      state.parsed = result.parsed || state.parsed;
      state.candidates = Array.isArray(result.candidates) ? result.candidates : state.candidates;

      if (el.currentMoney) el.currentMoney.value = String(newValue);

      renderCandidates();
      setStatus("Nilai uang berhasil diubah.");
      setLog(result);
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

      const result = await state.engine.download({
        file: state.file,
        parsed: state.parsed,
        slug: getSlug(),
        path: state.selectedPath,
        value: Number(el.newMoney?.value || 0)
      });

      setStatus("Save baru berhasil dibuat.");
      setLog(result || "Download berhasil.");
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