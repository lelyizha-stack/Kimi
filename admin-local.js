const STORAGE_KEY = "karbit-prime-admin-data";

let localGames = [];
let lastEntry = null;

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function renderSummary() {
  const summary = document.getElementById("localSummary");
  if (!summary) return;

  if (!localGames.length) {
    summary.innerHTML = `<div class="mini-row"><span>Belum ada data lokal</span><span>0 item</span></div>`;
    return;
  }

  const counts = localGames.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  summary.innerHTML = Object.entries(counts)
    .map(([key, value]) => {
      return `<div class="mini-row"><strong>${key.toUpperCase()}</strong><span>${value} item</span></div>`;
    })
    .join("");
}

function renderPreview() {
  const target = document.getElementById("entryPreview");
  if (!target) return;
  target.textContent = lastEntry
    ? JSON.stringify(lastEntry, null, 2)
    : '{ "status": "Belum ada entry baru" }';
  renderSummary();
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localGames));
}

function normalizeGameDownloads(game) {
  if (game.downloadUrls && typeof game.downloadUrls === "object") {
    return {
      ...game,
      downloadUrls: {
        Windows: game.downloadUrls.Windows || "#",
        Android: game.downloadUrls.Android || "#"
      }
    };
  }

  if (game.downloadUrl) {
    return {
      ...game,
      downloadUrls: {
        Windows: game.downloadUrl,
        Android: "#"
      }
    };
  }

  return {
    ...game,
    downloadUrls: {
      Windows: "#",
      Android: "#"
    }
  };
}

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (Array.isArray(saved)) {
      localGames = saved.map(normalizeGameDownloads);
    }
  } catch (e) {
    localGames = [];
  }
  renderPreview();
}

async function loadSiteData() {
  const res = await fetch("./data/games.json");
  const data = await res.json();
  localGames = Array.isArray(data) ? data.map(normalizeGameDownloads) : [];
  saveLocal();
  renderPreview();
  alert("Data situs berhasil dimuat ke admin lokal.");
}

function buildEntry(form) {
  const data = new FormData(form);

  const title = String(data.get("title") || "").trim();
  if (!title) throw new Error("Judul wajib diisi.");

  const category = String(data.get("category") || "").trim();
  const genres = String(data.get("genres") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const platform = [...form.querySelectorAll('input[name="platform"]:checked')].map((i) => i.value);
  if (!platform.length) {
    throw new Error("Pilih minimal satu platform.");
  }

  const slug = slugify(title);
  const sameCategory = localGames.filter((item) => item.category === category);

  const downloadWindows = String(data.get("downloadWindows") || "").trim() || "#";
  const downloadAndroid = String(data.get("downloadAndroid") || "").trim() || "#";

  if (platform.includes("Windows") && downloadWindows === "#") {
    throw new Error("Platform Windows dipilih, tapi link download Windows belum diisi.");
  }

  if (platform.includes("Android") && downloadAndroid === "#") {
    throw new Error("Platform Android dipilih, tapi link download Android belum diisi.");
  }

  return {
    id: `${category}-${String(sameCategory.length + 1).padStart(3, "0")}`,
    slug,
    title,
    category,
    genres,
    platform,
    version: String(data.get("version") || "").trim() || "v1.0",
    size: String(data.get("size") || "").trim() || "-",
    language: String(data.get("language") || "").trim() || "English",
    status: String(data.get("status") || "").trim() || "Updated",
    emoji: String(data.get("emoji") || "").trim() || "🎮",
    image: String(data.get("image") || "").trim(),
    description: String(data.get("description") || "").trim(),
    detailUrl:
      String(data.get("detailUrl") || "").trim() ||
      `./posts/${category}/${slug}.html`,
    downloadUrls: {
      Windows: downloadWindows,
      Android: downloadAndroid
    },
    createdAt: new Date().toISOString().slice(0, 10)
  };
}

function exportJson() {
  const blob = new Blob([JSON.stringify(localGames, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "games.json";
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener("DOMContentLoaded", () => {
  loadLocal();

  document.getElementById("loadCurrentData")?.addEventListener("click", async () => {
    try {
      await loadSiteData();
    } catch (e) {
      alert("Gagal load data situs: " + e.message);
    }
  });

  document.getElementById("exportJson")?.addEventListener("click", exportJson);

  document.getElementById("clearLocal")?.addEventListener("click", () => {
    if (!confirm("Hapus local cache admin?")) return;
    localGames = [];
    lastEntry = null;
    saveLocal();
    renderPreview();
  });

  document.getElementById("copyEntry")?.addEventListener("click", async () => {
    if (!lastEntry) {
      return alert("Belum ada entry baru.");
    }
    await navigator.clipboard.writeText(JSON.stringify(lastEntry, null, 2));
    alert("Entry terakhir berhasil dicopy.");
  });

  document.getElementById("importJson")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      return alert("File JSON tidak valid.");
    }
    localGames = data.map(normalizeGameDownloads);
    saveLocal();
    renderPreview();
    alert("games.json berhasil diimport.");
  });

  document.getElementById("gameForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const entry = buildEntry(e.currentTarget);
      localGames.unshift(entry);
      lastEntry = entry;
      saveLocal();
      renderPreview();
      e.currentTarget.reset();
      alert("Game baru masuk ke data lokal. Export games.json untuk menyimpan hasilnya.");
    } catch (err) {
      alert(err.message);
    }
  });
});