const VXACE_MARSHAL_URL = "https://esm.sh/@hyrious/marshal";

let marshalCache = null;

export const RPGMVX_ENGINE = {
  id: "rpgmvx",
  label: "RPG Maker VX Ace",
  extensions: [".rvdata2"],

  async detect({ ext, buffer }) {
    if (ext !== ".rvdata2") return false;

    try {
      const marshal = await getMarshalApi();
      const parsed = tryMarshalLoad(marshal, buffer);
      return parsed !== null && parsed !== undefined;
    } catch (_) {
      return false;
    }
  },

  async parse({ buffer }) {
    const marshal = await getMarshalApi();

    let parsed;
    try {
      parsed = tryMarshalLoad(marshal, buffer);
    } catch (_) {
      throw new Error("Format .rvdata2 tidak terbaca sebagai RPG Maker VX Ace umum.");
    }

    if (parsed === null || parsed === undefined) {
      throw new Error("File .rvdata2 berhasil dibaca, tetapi data hasil parse kosong.");
    }

    return {
      mode: "vxace-rvdata2-marshal",
      parsed,
      meta: {
        container: "ruby-marshal",
        compressed: false
      }
    };
  },

  async findCandidates({ parsed, helpers }) {
    return helpers.defaultScanCandidates(parsed);
  },

  async applyValue({ parsed, keyChain, value, helpers }) {
    return helpers.setAtKeyChain(parsed, keyChain, value);
  },

  async serialize({ parsed, fileName }) {
    const marshal = await getMarshalApi();

    let dumped;
    try {
      dumped = marshal.dump(parsed);
    } catch (_) {
      throw new Error("Gagal mengubah data VX Ace kembali ke format Marshal.");
    }

    const outName = addEditedSuffix(
      ensureExtension(fileName || "save", ".rvdata2"),
      ".rvdata2"
    );

    return {
      fileName: outName,
      blob: makeBinaryBlob(dumped)
    };
  }
};

async function getMarshalApi() {
  if (marshalCache) return marshalCache;

  let mod;
  try {
    mod = await import(VXACE_MARSHAL_URL);
  } catch (_) {
    throw new Error("Gagal memuat library Ruby Marshal dari CDN.");
  }

  if (!mod || typeof mod.load !== "function" || typeof mod.dump !== "function") {
    throw new Error("Library Ruby Marshal tidak punya API load/dump yang diharapkan.");
  }

  marshalCache = mod;
  return marshalCache;
}

function tryMarshalLoad(marshal, buffer) {
  const tries = [
    () => marshal.load(buffer),
    () => marshal.load(new Uint8Array(buffer)),
    () => marshal.load(new DataView(buffer))
  ];

  let lastError = null;

  for (const run of tries) {
    try {
      return run();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Marshal load gagal.");
}

function makeBinaryBlob(data) {
  if (data instanceof Blob) {
    return data;
  }

  if (data instanceof Uint8Array) {
    return new Blob([data], { type: "application/octet-stream" });
  }

  if (data instanceof ArrayBuffer) {
    return new Blob([data], { type: "application/octet-stream" });
  }

  if (ArrayBuffer.isView(data)) {
    return new Blob([data.buffer], { type: "application/octet-stream" });
  }

  if (typeof data === "string") {
    return new Blob([data], { type: "application/octet-stream" });
  }

  throw new Error("Hasil dump VX Ace tidak valid untuk dibuat blob.");
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