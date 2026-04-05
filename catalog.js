const CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfycbyWrwUpmdLpMM-u0yHxbIFw_SEkFiXiXF52BBahIXz178xX-IaywLaowEGPXYq0heKN/exec",
  sheet: "Sheet1"
};

const CATEGORY_META = {
  all: { title: "Semua Katalog", page: "./index.html" },
  renpy: { title: "Ren'Py", page: "./renpy.html" },
  rpgm: { title: "RPGM", page: "./rpgm.html" },
  mod: { title: "Mod", page: "./mod.html" },
  cheat: { title: "Cheat", page: "./cheat.html" },
  vip: { title: "VIP", page: "./vip.html" }
};

const PAGE_SIZE = {
  home: 8,
  catalog: 12,
  vip: 12
};

function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function normalizeCsvArray(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeString(value) {
  return String(value || "").trim();
}

function parseSizeWeight(size) {
  const raw = String(size || "").trim().toUpperCase();
  const match = raw.match(/([\d.]+)\s*(KB|MB|GB|TB)?/);
  if (!match) return Number.POSITIVE_INFINITY;
  const value = parseFloat(match[1]);
  const unit = match[2] || "MB";
  const multiplier = {
    KB: 1 / 1024,
    MB: 1,
    GB: 1024,
    TB: 1024 * 1024
  }[unit] || 1;
  return value * multiplier;
}

function isVipGame(game) {
  return String(game.access || "public").trim().toLowerCase() === "vip";
}

function visibleForPage(game, pageCategory) {
  if (pageCategory === "vip") return isVipGame(game);
  return !isVipGame(game);
}

async function loadGames() {
  const response = await fetch(`${CONFIG.endpoint}?sheet=${encodeURIComponent(CONFIG.sheet)}`);
  if (!response.ok) throw new Error("Gagal memuat data katalog.");

  const data = await response.json();
  const rows = Array.isArray(data) ? data : Array.isArray(data.rows) ? data.rows : [];

  return rows.map((row) => ({
    ...row,
    id: normalizeString(row.id),
    slug: normalizeString(row.slug),
    title: normalizeString(row.title || row.judul),
    category: normalizeString(row.category || row.kategori).toLowerCase(),
    access: normalizeString(row.access || row.akses || "public").toLowerCase(),
    genres: normalizeCsvArray(row.genres || row.genre),
    platform: normalizeCsvArray(row.platform),
    version: normalizeString(row.version || row.versi),
    size: normalizeString(row.size || row.ukuran),
    language: normalizeString(row.language || row.bahasa),
    status: normalizeString(row.status),
    emoji: normalizeString(row.emoji || "🎮"),
    image: normalizeString(row.image || row.gambar),
    description: normalizeString(row.description || row.deskripsi),
    detailUrl: normalizeString(row.detailUrl),
    windowsUrl: normalizeString(row.windowsUrl),
    androidUrl: normalizeString(row.androidUrl),
    createdAt: normalizeString(row.createdAt || row.dibuatPada || row.dibuatpada)
  }));
}

function getParams() {
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get("q") || "",
    category: sp.get("category") || "all",
    genres: (sp.get("genres") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    platform: sp.get("platform") || "",
    sort: sp.get("sort") || "latest",
    page: Math.max(1, parseInt(sp.get("page") || "1", 10) || 1)
  };
}

function updateParams(state, fixedCategory) {
  const sp = new URLSearchParams();

  if (state.q) sp.set("q", state.q);
  if (!fixedCategory && state.category && state.category !== "all") sp.set("category", state.category);
  if (state.genres.length) sp.set("genres", state.genres.join(","));
  if (state.platform) sp.set("platform", state.platform);
  if (state.sort !== "latest") sp.set("sort", state.sort);
  if (state.page > 1) sp.set("page", String(state.page));

  const next = sp.toString();
  history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
}

function activeCategory(pageCategory, selectedCategory) {
  return pageCategory && pageCategory !== "all" ? pageCategory : selectedCategory || "all";
}

function uniqueGenres(games, category, pageCategory) {
  const base = games.filter((game) => visibleForPage(game, pageCategory));
  const filtered = category === "all" ? base : base.filter((g) => g.category === category);
  return [...new Set(filtered.flatMap((g) => g.genres || []))].sort((a, b) => a.localeCompare(b));
}

function filterGames(games, state, pageCategory) {
  const category = activeCategory(pageCategory, state.category);
  let result = games.filter((game) => visibleForPage(game, pageCategory));

  if (category !== "all") {
    result = result.filter((game) => game.category === category);
  }

  const q = state.q.trim().toLowerCase();
  if (q) {
    result = result.filter((game) => {
      const haystack = [
        game.title,
        game.description,
        game.category,
        game.language,
        game.status,
        ...(game.genres || []),
        ...(game.platform || [])
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }

  if (state.genres.length) {
    result = result.filter((game) => state.genres.every((genre) => (game.genres || []).includes(genre)));
  }

  if (state.platform === "both") {
    result = result.filter((game) => {
      const platforms = game.platform || [];
      return platforms.includes("Windows") && platforms.includes("Android");
    });
  } else if (state.platform) {
    result = result.filter((game) => (game.platform || []).includes(state.platform));
  }

  switch (state.sort) {
    case "title":
      result.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "size":
      result.sort((a, b) => parseSizeWeight(a.size) - parseSizeWeight(b.size));
      break;
    case "latest":
    default:
      result.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      break;
  }

  return result;
}

function paginate(items, currentPage, perPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    pageItems: items.slice(start, start + perPage),
    currentPage: safePage,
    totalPages,
    totalItems: items.length
  };
}

function normalizeDownloadUrls(game) {
  return {
    windows: normalizeString(game.windowsUrl),
    android: normalizeString(game.androidUrl)
  };
}

function renderImage(game) {
  if (game.image) {
    return `
      <div class="card-cover with-image">
        <img src="${escapeHTML(game.image)}" alt="${escapeHTML(game.title)}">
        <span class="cover-emoji">${escapeHTML(game.emoji || "🎮")}</span>
      </div>
    `;
  }

  return `
    <div class="card-cover no-image">
      <span class="cover-emoji solo">${escapeHTML(game.emoji || "🎮")}</span>
    </div>
  `;
}

function renderDownloadButtons(game) {
  return "";
}

function renderCard(game) {
  const detail = `./detail.html?slug=${encodeURIComponent(game.slug || "")}`;
  const categoryLabel = CATEGORY_META[game.category]?.title || game.category || "Game";
  const meta = [
    game.version ? `<span>Versi ${escapeHTML(game.version)}</span>` : "",
    game.size ? `<span>${escapeHTML(game.size)}</span>` : "",
    game.language ? `<span>${escapeHTML(game.language)}</span>` : ""
  ].filter(Boolean).join("");

  const genrePreview = (game.genres || []).slice(0, 3).map((genre) =>
    `<span class="card-tag soft">${escapeHTML(genre)}</span>`
  ).join("");

  return `
    <article class="catalog-card">
      ${renderImage(game)}
      <div class="catalog-card-body">
        <div class="card-topline">
          <span class="card-tag">${escapeHTML(categoryLabel)}</span>
          ${game.status ? `<span class="card-tag soft">${escapeHTML(game.status)}</span>` : ""}
        </div>

        <h3>${escapeHTML(game.title)}</h3>

        ${genrePreview ? `<div class="card-meta">${genrePreview}</div>` : ""}
        ${meta ? `<div class="card-meta">${meta}</div>` : ""}

        <div class="card-actions">
          <a class="mini-link primary" href="${detail}">Detail</a>
        </div>
      </div>
    </article>
  `;
}


function setupGenreToggle(initialSelectedCount = 0) {
  const button = document.getElementById("genreToggleBtn");
  const panel = document.getElementById("genrePanelBody");
  if (!button || !panel) {
    return {
      setSelectedCount() {}
    };
  }

  const storageKey = `kp-genre-toggle-${document.body.dataset.page || "page"}-${document.body.dataset.category || "all"}`;
  let isOpen = sessionStorage.getItem(storageKey) === "1";
  let selectedCount = initialSelectedCount;

  const sync = () => {
    panel.hidden = !isOpen;
    button.setAttribute("aria-expanded", isOpen ? "true" : "false");
    const baseLabel = isOpen ? "Sembunyikan Genre" : "Tampilkan Genre";
    button.textContent = selectedCount > 0 ? `${baseLabel} (${selectedCount})` : baseLabel;
  };

  button.addEventListener("click", () => {
    isOpen = !isOpen;
    sessionStorage.setItem(storageKey, isOpen ? "1" : "0");
    sync();
  });

  sync();

  return {
    setSelectedCount(count) {
      selectedCount = Number(count) || 0;
      sync();
    }
  };
}

function renderGenreFilters(root, genres, selectedGenres, onToggle) {
  if (!root) return;
  if (!genres.length) {
    root.innerHTML = '<span class="genre-empty">Genre belum tersedia.</span>';
    return;
  }

  root.innerHTML = genres.map((genre) => {
    const active = selectedGenres.includes(genre) ? "is-active" : "";
    return `<button class="genre-chip ${active}" type="button" data-genre="${escapeHTML(genre)}">${escapeHTML(genre)}</button>`;
  }).join("");

  root.querySelectorAll("[data-genre]").forEach((button) => {
    button.addEventListener("click", () => onToggle(button.getAttribute("data-genre") || ""));
  });
}

function renderPagination(root, currentPage, totalPages, onChange) {
  if (!root) return;
  if (totalPages <= 1) {
    root.innerHTML = "";
    return;
  }

  const items = [];
  for (let page = 1; page <= totalPages; page += 1) {
    items.push(`
      <button type="button" class="page-btn ${page === currentPage ? "is-active" : ""}" data-page="${page}">${page}</button>
    `);
  }

  root.innerHTML = items.join("");
  root.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => onChange(Number(button.getAttribute("data-page"))));
  });
}

function renderFeatured(root, games) {
  if (!root) return;
  const latest = games
    .filter((game) => !isVipGame(game))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 8);

  root.innerHTML = latest.map((game) => {
    const detail = `./detail.html?slug=${encodeURIComponent(game.slug || "")}`;
    return `
      <article class="featured-card">
        ${renderImage(game)}
        <div class="featured-body">
          <span class="card-tag">${escapeHTML(CATEGORY_META[game.category]?.title || game.category || "Game")}</span>
          <h3>${escapeHTML(game.title)}</h3>
          <a href="${detail}" class="mini-link primary">Lihat detail</a>
        </div>
      </article>
    `;
  }).join("");
}

function syncHeroCount(games) {
  const target = document.getElementById("heroCount");
  if (!target) return;
  target.textContent = String(games.filter((game) => !isVipGame(game)).length);
}

async function initCatalog() {
  const page = document.body.dataset.page || "home";
  const pageCategory = document.body.dataset.category || "all";

  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const platformFilter = document.getElementById("platformFilter");
  const sortFilter = document.getElementById("sortFilter");
  const resetFilters = document.getElementById("resetFilters");
  const genreFilterList = document.getElementById("genreFilterList");
  const catalogCount = document.getElementById("catalogCount");
  const catalogList = document.getElementById("catalogList");
  const catalogPagination = document.getElementById("catalogPagination");
  const featuredList = document.getElementById("featuredList");
  const featuredPrev = document.getElementById("featuredPrev");
  const featuredNext = document.getElementById("featuredNext");

  if (!catalogList) return;

  const state = getParams();
  const genreToggleManager = setupGenreToggle(state.genres.length);
  let games = [];

  function applyInputs() {
    if (searchInput) searchInput.value = state.q;
    if (categoryFilter) categoryFilter.value = activeCategory(pageCategory, state.category);
    if (platformFilter) platformFilter.value = state.platform;
    if (sortFilter) sortFilter.value = state.sort;
  }

  function render() {
    const effectiveCategory = activeCategory(pageCategory, state.category);
    const filtered = filterGames(games, state, pageCategory);
    const paged = paginate(filtered, state.page, PAGE_SIZE[page] || PAGE_SIZE.catalog);

    state.page = paged.currentPage;
    updateParams(state, pageCategory !== "all");

    const genrePool = uniqueGenres(games, effectiveCategory, pageCategory);
    renderGenreFilters(genreFilterList, genrePool, state.genres, (genre) => {
      state.genres = state.genres.includes(genre)
        ? state.genres.filter((item) => item !== genre)
        : [...state.genres, genre];
      state.page = 1;
      render();
    });

    genreToggleManager.setSelectedCount(state.genres.length);

    if (catalogCount) {
      catalogCount.textContent = `${paged.totalItems} item ditemukan`;
    }

    if (!paged.pageItems.length) {
      catalogList.innerHTML = `
        <div class="empty-state">
          <strong>Tidak ada hasil.</strong>
          <p>Coba ubah kata kunci, kategori, atau filter genre.</p>
        </div>
      `;
    } else {
      catalogList.innerHTML = paged.pageItems.map(renderCard).join("");
    }

    renderPagination(catalogPagination, paged.currentPage, paged.totalPages, (nextPage) => {
      state.page = nextPage;
      render();
      window.scrollTo({ top: catalogList.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
    });
  }

  try {
    catalogList.innerHTML = `<div class="empty-state"><strong>Memuat katalog...</strong></div>`;
    games = await loadGames();
    syncHeroCount(games);
    applyInputs();
    render();
    renderFeatured(featuredList, games);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memuat katalog.";
    catalogList.innerHTML = `
      <div class="empty-state">
        <strong>Gagal memuat katalog.</strong>
        <p>${escapeHTML(message)}</p>
      </div>
    `;
  }

  searchInput?.addEventListener("input", (event) => {
    state.q = event.target.value;
    state.page = 1;
    render();
  });

  categoryFilter?.addEventListener("change", (event) => {
    state.category = event.target.value;
    state.genres = [];
    state.page = 1;
    render();
  });

  platformFilter?.addEventListener("change", (event) => {
    state.platform = event.target.value;
    state.page = 1;
    render();
  });

  sortFilter?.addEventListener("change", (event) => {
    state.sort = event.target.value;
    state.page = 1;
    render();
  });

  resetFilters?.addEventListener("click", () => {
    state.q = "";
    state.category = pageCategory === "all" ? "all" : pageCategory;
    state.genres = [];
    state.platform = "";
    state.sort = "latest";
    state.page = 1;
    applyInputs();
    render();
  });

  if (featuredList && featuredPrev && featuredNext) {
    const scrollAmount = () => Math.min(featuredList.clientWidth * 0.86, 420);
    featuredPrev.addEventListener("click", () => {
      featuredList.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
    });
    featuredNext.addEventListener("click", () => {
      featuredList.scrollBy({ left: scrollAmount(), behavior: "smooth" });
    });
  }
}

document.addEventListener("DOMContentLoaded", initCatalog);
