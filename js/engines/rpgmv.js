export const RPGMV_ENGINE = {
  id: "rpgmv",
  label: "RPG Maker MV",
  extensions: [".rpgsave"],

  async detect({ ext, buffer, helpers }) {
    if (ext !== ".rpgsave") return false;

    try {
      const text = safeDecodeText(buffer, helpers).trim();
      if (!text) return false;

      if (looksLikeJson(text)) return true;

      const lz = getLZString();
      if (!lz || typeof lz.decompressFromBase64 !== "function") return false;

      const decompressed = lz.decompressFromBase64(text);
      return !!(decompressed && looksLikeJson(decompressed.trim()));
    } catch (_) {
      return false;
    }
  },

  async parse({ buffer, helpers }) {
    const text = safeDecodeText(buffer, helpers).trim();

    if (!text) {
      throw new Error("File .rpgsave kosong.");
    }

    if (looksLikeJson(text)) {
      return {
        mode: "mv-rpgsave-json",
        parsed: JSON.parse(text),
        meta: {
          container: "plain-json",
          compressed: false
        }
      };
    }

    const lz = getLZString();
    if (!lz || typeof lz.decompressFromBase64 !== "function") {
      throw new Error("Library LZString belum termuat.");
    }

    const decompressed = lz.decompressFromBase64(text);

    if (!decompressed) {
      throw new Error("Format .rpgsave tidak terbaca sebagai RPG Maker MV umum.");
    }

    const jsonText = decompressed.trim();
    if (!looksLikeJson(jsonText)) {
      throw new Error("Isi .rpgsave berhasil didekompres, tetapi bukan JSON yang valid.");
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (_) {
      throw new Error("JSON hasil dekompres .rpgsave tidak valid.");
    }

    return {
      mode: "mv-rpgsave-lzstring",
      parsed,
      meta: {
        container: "lzstring-base64",
        compressed: true
      }
    };
  },

  async findCandidates({ parsed, helpers }) {
    return helpers.defaultScanCandidates(parsed);
  },

  async applyValue({ parsed, keyChain, value, helpers }) {
    return helpers.setAtKeyChain(parsed, keyChain, value);
  },

  async serialize({ parsed, fileName, mode }) {
    const json = JSON.stringify(parsed);

    let outputText = json;
    let outName = ensureExtension(fileName || "save", ".rpgsave");

    if (mode === "mv-rpgsave-lzstring") {
      const lz = getLZString();
      if (!lz || typeof lz.compressToBase64 !== "function") {
        throw new Error("Library LZString belum termuat.");
      }

      outputText = lz.compressToBase64(json);
      if (!outputText) {
        throw new Error("Gagal mengompres save MV ke format base64.");
      }
    }

    outName = addEditedSuffix(outName, ".rpgsave");

    return {
      fileName: outName,
      blob: new Blob([outputText], { type: "text/plain;charset=utf-8" })
    };
  }
};

function getLZString() {
  return typeof window !== "undefined" ? window.LZString : null;
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

function ensureExtension(fileName, ext) {
  const name = String(fileName || "").trim() || "save";
  return name.toLowerCase().endsWith(ext) ? name : `${name}${ext}`;
}

function addEditedSuffix(fileName, ext) {
  const name = String(fileName || "").trim() || `save${ext}`;
  const escapedExt = escapeRegExp(ext);
  const re = new RegExp(`${escapedExt}$`, "i");

  if (re.test(name)) {
    return name.replace(re, `-money-edited${ext}`);
  }

  return `${name}-money-edited${ext}`;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}