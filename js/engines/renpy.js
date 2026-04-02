const BACKEND = "https://Kimi810.pythonanywhere.com";

function base64ToBlob(base64String) {
  const binary = atob(base64String);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: "application/octet-stream" });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "edited.save";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function postRenpy(endpoint, file, extra = {}) {
  const form = new FormData();
  form.append("file", file);

  Object.entries(extra).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    form.append(key, String(value));
  });

  const res = await fetch(`${BACKEND}${endpoint}`, {
    method: "POST",
    body: form
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.detail || data?.error || `HTTP ${res.status}`);
  }

  return data;
}

export const RENPY_ENGINE = {
  id: "renpy",
  label: "Ren'Py",

  match(file) {
    return file.name.toLowerCase().endsWith(".save");
  },

  async read(file, { slug }) {
    const data = await postRenpy("/api/renpy/find-candidates", file, { slug });

    return {
      parsed: null,
      candidates: data.candidates || [],
      meta: data
    };
  },

  async applyMoney({ file, path, value, slug }) {
    const data = await postRenpy("/api/renpy/edit-money", file, {
      slug,
      path,
      value
    });

    return {
      parsed: null,
      candidates: path ? [{ path, value }] : [],
      meta: data
    };
  },

  async download({ file, path, value, slug }) {
    const data = await postRenpy("/api/renpy/edit-money", file, {
      slug,
      path,
      value
    });

    if (!data.edited_save_base64) {
      throw new Error("Backend tidak mengirim edited_save_base64.");
    }

    const blob = base64ToBlob(data.edited_save_base64);
    downloadBlob(blob, data.edited_filename || "edited.save");

    return data;
  }
};