const ZIP_JS_URL = "https://esm.sh/@zip.js/zip.js";

/*
  Ganti URL ini ke deployment Apps Script public milikmu.
  Kalau gagal fetch, engine akan fallback ke data/renpycode.json
*/
const RENPY_RULES_URLS = [
  "https://script.google.com/macros/s/AKfycbzeCFEGNVwhnwYrdp6JlIh8sJOa0zYSe8w8TneyRQ-2swWwd7WoukEUb95n_3SzRy-dqg/exec",
  "data/renpycode.json"
];

let zipApiCache = null;
let renpyRulesCache = null;

export const RENPY_ENGINE = {
  id: "renpy",
  label: "Ren'Py",
  extensions: [".save"],

  async detect({ ext, buffer }) {
    if (ext !== ".save") return false;

    try {
      const zip = await getZipApi();
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      const reader = new zip.ZipReader(new zip.BlobReader(blob));

      try {
        const entries = await reader.getEntries();
        const names = (entries || []).map((entry) => String(entry.filename || entry.name || ""));
        return names.includes("log") || names.includes("json") || names.includes("screenshot.png");
      } finally {
        await safeZipClose(reader);
      }
    } catch (_) {}

    try {
      const text = new TextDecoder("utf-8").decode(buffer).trim();
      return text.startsWith("{") || text.startsWith("[");
    } catch (_) {}

    return false;
  },

  async parse({ buffer, helpers }) {
    const zip = await getZipApi();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    let reader = null;

    try {
      reader = new zip.ZipReader(new zip.BlobReader(blob));
      const entries = await reader.getEntries();

      if (!entries || !entries.length) {
        throw new Error("File .save Ren'Py terbuka sebagai ZIP, tetapi isinya kosong.");
      }

      const names = entries.map((entry) => String(entry.filename || entry.name || ""));
      const logEntry = entries.find((entry) => String(entry.filename || entry.name || "") === "log");
      const jsonEntry = entries.find((entry) => String(entry.filename || entry.name || "") === "json");

      let metaJson = null;
      if (jsonEntry) {
        try {
          const jsonText = await jsonEntry.getData(new zip.TextWriter());
          metaJson = JSON.parse(jsonText);
        } catch (_) {}
      }

      if (!logEntry) {
        throw new Error("Entry log tidak ditemukan di save Ren'Py.");
      }

      const logBlob = await logEntry.getData(new zip.BlobWriter());
      const logBuffer = await logBlob.arrayBuffer();

      const renpyPickle = getRenpyPickleApi();
      const parsed = renpyPickle.parseLogBuffer(logBuffer);

      return {
        mode: "renpy-save-pickle-read",
        parsed,
        meta: {
          container: "renpy-zip",
          entries: names,
          hasMetaJson: !!metaJson,
          parsedType: describeRenpyValue(parsed),
          metaJson
        }
      };
    } catch (error) {
      try {
        const text = safeDecodeText(buffer, helpers).trim();
        if (looksLikeJson(text)) {
          return {
            mode: "renpy-json-export",
            parsed: JSON.parse(text),
            meta: {
              container: "plain-json",
              parsedType: "json-export"
            }
          };
        }
      } catch (_) {}

      if (error instanceof Error) {
        throw error;
      }

      throw new Error("File .save Ren'Py tidak terbaca.");
    } finally {
      if (reader) {
        await safeZipClose(reader);
      }
    }
  },

  async findCandidates({ parsed, helpers }) {
    const slug = String(helpers.getCurrentGameSlug?.() || "").trim().toLowerCase();
    const rulesBySlug = await loadRenpyRules();

    const byRules = slug
      ? collectRenpyCandidatesFromRules(parsed, slug, rulesBySlug, helpers)
      : [];

    if (byRules.length) {
      return byRules;
    }

    return helpers.defaultScanCandidates(parsed);
  },

  async applyValue({ parsed, keyChain, value, helpers }) {
    return helpers.setAtKeyChain(parsed, keyChain, value);
  },

  async serialize() {
    throw new Error("Repack .save Ren'Py belum dipasang. Untuk sementara edit Ren'Py baru sampai baca dan ubah di memori.");
  }
};

async function getZipApi() {
  if (zipApiCache) return zipApiCache;

  let mod;
  try {
    mod = await import(ZIP_JS_URL);
  } catch (_) {
    throw new Error("Gagal memuat zip.js dari CDN.");
  }

  if (!mod || typeof mod.ZipReader !== "function" || typeof mod.BlobReader !== "function") {
    throw new Error("zip.js tidak punya API yang dibutuhkan.");
  }

  zipApiCache = mod;
  return zipApiCache;
}

function getRenpyPickleApi() {
  if (typeof window === "undefined" || !window.renpyPickle) {
    throw new Error("renpy-pickle.js belum termuat.");
  }

  if (typeof window.renpyPickle.parseLogBuffer !== "function") {
    throw new Error("renpyPickle.parseLogBuffer tidak ditemukan.");
  }

  return window.renpyPickle;
}

async function safeZipClose(reader) {
  try {
    await reader.close();
  } catch (_) {}
}

function safeDecodeText(buffer, helpers) {
  if (helpers && typeof helpers.decodeText === "function") {
    return helpers.decodeText(buffer);
  }
  return new TextDecoder("utf-8").decode(buffer);
}

function looksLikeJson(text) {
  const t = String(text || "").trim();
  return t.startsWith("{") || t.startsWith("[");
}

function normalizeBool(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return !(v === "false" || v === "0" || v === "no" || v === "off");
}

async function loadRenpyRules() {
  if (renpyRulesCache) return renpyRulesCache;

  let lastError = null;

  for (const url of RENPY_RULES_URLS) {
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data.rows)
          ? data.rows
          : [];

      const grouped = {};

      for (const row of rows) {
        const slug = String(row.gameSlug || row.slug || "").trim().toLowerCase();
        const moneyPath = String(row.moneyPath || row.path || "").trim();
        const label = String(row.label || moneyPath).trim();
        const enabled = normalizeBool(row.enabled);

        if (!enabled || !slug || !moneyPath) continue;

        if (!grouped[slug]) grouped[slug] = [];
        grouped[slug].push({
          path: moneyPath,
          label
        });
      }

      renpyRulesCache = grouped;
      return renpyRulesCache;
    } catch (error) {
      lastError = error;
    }
  }

  console.warn("Gagal memuat rules Ren'Py, fallback ke scan otomatis.", lastError);
  renpyRulesCache = {};
  return renpyRulesCache;
}

function collectRenpyCandidatesFromRules(parsed, gameSlug, rulesBySlug, helpers) {
  const rules = rulesBySlug?.[gameSlug] || [];
  const bucket = [];

  for (const rule of rules) {
    const basePath = String(rule.path || "").trim();
    if (!basePath) continue;

    const candidatePaths = [basePath];

    if (Array.isArray(parsed)) {
      for (let i = 0; i < parsed.length; i += 1) {
        candidatePaths.push(`${i}.${basePath}`);
      }
    }

    for (const candidatePath of candidatePaths) {
      const keyChain = helpers.pathToKeyChain(candidatePath);
      const value = helpers.getAtKeyChain(parsed, keyChain);

      if (typeof value === "number" && Number.isFinite(value)) {
        bucket.push({
          pathLabel: candidatePath,
          keyChain,
          key: rule.label || rule.path,
          value,
          source: "rule"
        });
        break;
      }
    }
  }

  return bucket;
}

function describeRenpyValue(value) {
  if (typeof window !== "undefined" && window.renpyPickle && typeof window.renpyPickle.safeDescribe === "function") {
    try {
      return window.renpyPickle.safeDescribe(value);
    } catch (_) {}
  }

  if (Array.isArray(value)) return `Array(${value.length})`;
  if (value === null) return "null";
  return typeof value;
}