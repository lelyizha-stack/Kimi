export const RPGMZ_ENGINE = {
  id: "rpgmz",
  label: "RPG Maker MZ",
  extensions: [".rmmzsave"],

  async detect({ ext, buffer, helpers }) {
    if (ext !== ".rmmzsave") return false;

    try {
      const text = safeDecodeText(buffer, helpers).trim();
      if (!text) return false;

      if (looksLikeJson(text)) return true;
    } catch (_) {}

    const pako = getPako();
    if (!pako || typeof pako.inflate !== "function") {
      return false;
    }

    try {
      const rawBytes = new Uint8Array(buffer);
      const jsonText = pako.inflate(rawBytes, { to: "string" });
      if (jsonText && looksLikeJson(jsonText.trim())) return true;
    } catch (_) {}

    try {
      const base64Text = safeDecodeText(buffer, helpers).trim();
      if (!base64Text) return false;

      const bytes = base64ToBytes(base64Text);
      const jsonText = pako.inflate(bytes, { to: "string" });
      if (jsonText && looksLikeJson(jsonText.trim())) return true;
    } catch (_) {}

    return false;
  },

  async parse({ buffer, helpers }) {
    const text = safeDecodeText(buffer, helpers).trim();

    if (!text && buffer.byteLength === 0) {
      throw new Error("File .rmmzsave kosong.");
    }

    if (text && looksLikeJson(text)) {
      return {
        mode: "mz-rmmzsave-json",
        parsed: JSON.parse(text),
        meta: {
          container: "plain-json",
          compressed: false
        }
      };
    }

    const pako = getPako();
    if (!pako || typeof pako.inflate !== "function") {
      throw new Error("Library pako belum termuat.");
    }

    try {
      const rawBytes = new Uint8Array(buffer);
      const jsonText = pako.inflate(rawBytes, { to: "string" });

      if (jsonText && looksLikeJson(jsonText.trim())) {
        return {
          mode: "mz-rmmzsave-gzip",
          parsed: JSON.parse(jsonText),
          meta: {
            container: "gzip-bytes",
            compressed: true
          }
        };
      }
    } catch (_) {}

    try {
      const base64Text = text || safeDecodeText(buffer, helpers).trim();
      const bytes = base64ToBytes(base64Text);
      const jsonText = pako.inflate(bytes, { to: "string" });

      if (jsonText && looksLikeJson(jsonText.trim())) {
        return {
          mode: "mz-rmmzsave-gzip-base64",
          parsed: JSON.parse(jsonText),
          meta: {
            container: "gzip-base64",
            compressed: true
          }
        };
      }
    } catch (_) {}

    throw new Error("Format .rmmzsave tidak terbaca sebagai RPG Maker MZ umum.");
  },

  async findCandidates({ parsed, helpers }) {
    return helpers.defaultScanCandidates(parsed);
  },

  async applyValue({ parsed, keyChain, value, helpers }) {
    return helpers.setAtKeyChain(parsed, keyChain, value);
  },

  async serialize({ parsed, fileName, mode }) {
    const json = JSON.stringify(parsed);
    const outName = addEditedSuffix(ensureExtension(fileName || "save", ".rmmzsave"), ".rmmzsave");

    if (mode === "mz-rmmzsave-json") {
      return {
        fileName: outName,
        blob: new Blob([json], { type: "application/json;charset=utf-8" })
      };
    }

    const pako = getPako();
    if (!pako || typeof pako.gzip !== "function") {
      throw new Error("Library pako belum termuat.");
    }

    const gz = pako.gzip(json);

    if (mode === "mz-rmmzsave-gzip-base64") {
      const base64 = bytesToBase64(gz);
      return {
        fileName: outName,
        blob: new Blob([base64], { type: "text/plain;charset=utf-8" })
      };
    }

    return {
      fileName: outName,
      blob: new Blob([gz], { type: "application/octet-stream" })
    };
  }
};

function getPako() {
  return typeof window !== "undefined" ? window.pako : null;
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

function base64ToBytes(base64Text) {
  const cleaned = String(base64Text || "").replace(/\s+/g, "");
  if (!cleaned) {
    throw new Error("Base64 kosong.");
  }

  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}