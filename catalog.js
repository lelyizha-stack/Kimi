const CATEGORY_META = {
  all: { title: "Semua Katalog", page: "./" },
  renpy: { title: "Ren'Py", page: "./renpy.html" },
  rpgm: { title: "RPGM", page: "./rpgm.html" },
  mod: { title: "Mod", page: "./mod.html" },
  cheat: { title: "Cheat", page: "./cheat.html" },
  vip: { title: "VIP", page: "./vip.html" }
};

const PAGE_SIZE = {
  home: 8,
  catalog: 12
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

function isVipGame(game) {
  return String(game.access || "public").trim().toLowerCase() === "vip";
}

function visibleForPage(game, pageCategory) {
  if (pageCategory === "vip") {
    return isVipGame(game);
  }
  return !isVipGame(game);
}

async function loadGames() {
  const baseUrl = "https://script.google.com/macros/s/AKfycbyWrwUpmdLpMM-u0yHxbIFw_SEkFiXiXF52BBahIXz178xX-IaywLaowEGPXYq0heKN/exec";
  const sheetName = "Sheet1";

  const response = await fetch(`${baseUrl}?sheet=${encodeURIComponent(sheetName)}`);
  if (!response.ok) throw new Error("Gagal memuat data katalog.");

  const data = await response.json();
  console.log("DATA APPS SCRIPT:", data);

  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data.rows)
      ? data.rows
      : [];

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
    emoji: normalizeString(row.emoji),
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
  if (!fixedCategory && state.category && state.category !== "all") {
    sp.set("category", state.category);
  }
  if (state.genres && state.genres.length) {
    sp.set("genres", state.genres.join(","));
  }
  if (state.platform) sp.set("platform", state.platform);
  if (state.sort && state.sort !== "latest") sp.set("sort", state.sort);
  if (state.page && state.page > 1) sp.set("page", String(state.page));

  const qs = sp.toString();
  history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

function activeCategory(pageCategory, selectedCategory) {
  return pageCategory && pageCategory !== "all"
    ? pageCategory
    : (selectedCategory || "all");
}

function uniqueGenres(games, category) {
  const base = category === "all"
    ? games
    : games.filter((g) => g.category === category);

  return [...new Set(base.flatMap((g) => g.genres || []))]
    .sort((a, b) => a.localeCompare(b));
}

function filterGames(games, state, pageCategory) {
  const category = activeCategory(pageCategory, state.category);
  let result = [...games].filter((g) => visibleForPage(g, pageCategory));

  if (category !== "all") {
    result = result.filter((g) => g.category === category);
  }

  const q = state.q.trim().toLowerCase();
  if (q) {
    result = result.filter((game) => {
      const text = [
        game.title,
        game.category,
        game.description,
        game.language,
        game.status,
        ...(game.genres || []),
        ...(game.platform || [])
      ].join(" ").toLowerCase();

      return text.includes(q);
    });
  }

  if (state.genres && state.genres.length) {
    result = result.filter((g) => {
      const gameGenres = g.genres || [];
      return state.genres.every((genre) => gameGenres.includes(genre));
    });
  }

  if (state.platform === "both") {
    result = result.filter((g) => {
      const platforms = g.platform || [];
      return platforms.includes("Windows") && platforms.includes("Android");
    });
  } else if (state.platform) {
    result = result.filter((g) => (g.platform || []).includes(state.platform));
  }

  switch (state.sort) {
    case "title":
      result.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
      break;
    case "size":
      result.sort((a, b) =>
        String(a.size || "").localeCompare(String(b.size || ""), undefined, { numeric: true })
      );
      break;
    case "latest":
    default:
      result.sort((a, b) =>
        String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
      );
      break;
  }

  return result;
}

function paginateItems(items, currentPage, perPage) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (safePage - 1) * perPage;

  return {
    pageItems: items.slice(start, start + perPage),
    totalPages,
    currentPage: safePage,
    totalItems: items.length
  };
}

function renderImage(game) {
  const hasImage = typeof game.image === "string" && game.image.trim() !== "";
  if (hasImage) {
    return `
      <div class="catalog-cover">
        <img src="${escapeHTML(game.image)}" alt="${escapeHTML(game.title)}">
        <div class="cover-emoji">${escapeHTML(game.emoji || "🎮")}</div>
      </div>
    `;
  }

  return `
    <div class="catalog-cover">
      <div class="cover-emoji">${escapeHTML(game.emoji || "🎮")}</div>
    </div>
  `;
}

function categoryPage(category) {
  return (CATEGORY_META[category] || CATEGORY_META.all).page;
}

function filterLink(game, type, value) {
  const page = categoryPage(game.category);
  const sp = new URLSearchParams();

  if (type === "genre") sp.set("genres", value);
  if (type === "platform") sp.set("platform", value);

  return `${page}?${sp.toString()}`;
}

function normalizeDownloadUrls(game) {
  const urls = game.downloadUrls && typeof game.downloadUrls === "object"
    ? game.downloadUrls
    : {};

  const legacy = String(game.downloadUrl || "").trim();
  const platforms = Array.isArray(game.platform) ? game.platform : [];

  return {
    Windows: urls.Windows || ((legacy && platforms.includes("Windows")) ? legacy : ""),
    Android: urls.Android || ((legacy && platforms.includes("Android")) ? legacy : "")
  };
}

function renderDownloadButtons(game) {
  const urls = normalizeDownloadUrls(game);
  const platforms = Array.isArray(game.platform) ? game.platform : [];
  const buttons = [];

  if (platforms.includes("Windows") && urls.Windows) {
    buttons.push(
      `<a href="${escapeHTML(urls.Windows)}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Windows</a>`
    );
  }

  if (platforms.includes("Android") && urls.Android) {
    buttons.push(
      `<a href="${escapeHTML(urls.Android)}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Android</a>`
    );
  }

  return buttons.join("");
}

function renderCard(game) {
  const detail = `./detail.html?slug=${encodeURIComponent(game.slug || "")}`;

  return `
    <article class="download-card minimal-card">
      ${renderImage(game)}
      <div class="download-body">
        <h3>${escapeHTML(game.title)}</h3>

        <div class="download-actions">
          <a href="${escapeHTML(detail)}" class="btn btn-secondary">Detail</a>
        </div>
      </div>
    </article>
  `;
}

function renderList(target, games) {
  if (!target) return;

  if (!games.length) {
    target.innerHTML = `<div class="empty-state">Belum ada item yang cocok dengan filter ini.</div>`;
    return;
  }

  target.innerHTML = games.map(renderCard).join("");
}

function renderGenreFilter(container, games, category, selected = []) {
  if (!container) return [];

  const genres = uniqueGenres(games, category);

  container.innerHTML = genres.map((genre) => {
    const checked = selected.includes(genre) ? "checked" : "";
    const active = selected.includes(genre) ? " active" : "";
    return `
      <label class="multi-filter-item${active}">
        <input type="checkbox" name="genreMulti" value="${escapeHTML(genre)}" ${checked}>
        <span>${escapeHTML(genre)}</span>
      </label>
    `;
  }).join("");

  return genres;
}

function getCheckedGenres(container) {
  if (!container) return [];
  return [...container.querySelectorAll('input[name="genreMulti"]:checked')].map((el) => el.value);
}

function pageButton(label, page, disabled = false, active = false) {
  return `<button type="button" class="page-btn${active ? " active" : ""}" data-page="${page}"${disabled ? " disabled" : ""}>${label}</button>`;
}

function renderPagination(target, currentPage, totalPages) {
  if (!target) return;

  if (totalPages <= 1) {
    target.innerHTML = "";
    return;
  }

  const buttons = [];
  buttons.push(pageButton("Prev", currentPage - 1, currentPage <= 1, false));

  let start = Math.max(1, currentPage - 2);
  let end = Math.min(totalPages, currentPage + 2);

  if (currentPage <= 3) end = Math.min(totalPages, 5);
  if (currentPage >= totalPages - 2) start = Math.max(1, totalPages - 4);

  if (start > 1) {
    buttons.push(pageButton("1", 1, false, currentPage === 1));
    if (start > 2) buttons.push('<span class="page-dots">…</span>');
  }

  for (let page = start; page <= end; page += 1) {
    buttons.push(pageButton(String(page), page, false, page === currentPage));
  }

  if (end < totalPages) {
    if (end < totalPages - 1) buttons.push('<span class="page-dots">…</span>');
    buttons.push(pageButton(String(totalPages), totalPages, false, currentPage === totalPages));
  }

  buttons.push(pageButton("Next", currentPage + 1, currentPage >= totalPages, false));
  target.innerHTML = `<div class="pagination">${buttons.join("")}</div>`;
}

function bindPagination(target, onChange) {
  if (!target) return;

  target.addEventListener("click", (event) => {
    const btn = event.target.closest(".page-btn");
    if (!btn || btn.disabled) return;
    const page = parseInt(btn.dataset.page || "1", 10) || 1;
    onChange(page);
  });
}

function bindCatalogPage(allGames) {
  const body = document.body;
  const pageType = body.dataset.page || "catalog";
  const pageCategory = body.dataset.category || "all";
  const perPage = PAGE_SIZE[pageType] || 12;

  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const genreFilterList = document.getElementById("genreFilterList");
  const platformFilter = document.getElementById("platformFilter");
  const sortFilter = document.getElementById("sortFilter");
  const resetBtn = document.getElementById("resetFilters");
  const countEl = document.getElementById("catalogCount");
  const catalogList = document.getElementById("catalogList");
  const paginationTarget = document.getElementById("catalogPagination");
  const featuredList = document.getElementById("featuredList");

  if (featuredList) {
    const latest = [...allGames]
      .filter((g) => visibleForPage(g, pageCategory))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 6);

    renderList(featuredList, latest);
  }

  if (!catalogList) return;

  const params = getParams();
  const state = {
    q: params.q,
    category: params.category,
    genres: params.genres,
    platform: params.platform,
    sort: params.sort,
    page: params.page
  };

  if (searchInput) searchInput.value = state.q;
  if (categoryFilter) categoryFilter.value = state.category;
  if (platformFilter) platformFilter.value = state.platform;
  if (sortFilter) sortFilter.value = state.sort;

  function rerender(resetPage = false) {
    state.q = searchInput ? searchInput.value : "";
    state.category = categoryFilter ? categoryFilter.value : state.category;
    state.platform = platformFilter ? platformFilter.value : state.platform;
    state.sort = sortFilter ? sortFilter.value : state.sort;

    const currentCategory = activeCategory(pageCategory, state.category);
    const visibleGames = allGames.filter((g) => visibleForPage(g, pageCategory));
    const availableGenres = renderGenreFilter(genreFilterList, visibleGames, currentCategory, state.genres);

    state.genres = state.genres.filter((genre) => availableGenres.includes(genre));

    if (resetPage) state.page = 1;

    const filtered = filterGames(allGames, state, pageCategory);
    const paged = paginateItems(filtered, state.page, perPage);
    state.page = paged.currentPage;

    renderList(catalogList, paged.pageItems);
    renderPagination(paginationTarget, paged.currentPage, paged.totalPages);

    if (countEl) {
      const label = activeCategory(pageCategory, state.category);
      const categoryText = label !== "all" ? ` • ${CATEGORY_META[label].title}` : "";
      countEl.textContent =
        `Ditemukan ${paged.totalItems} item${categoryText} • Halaman ${paged.currentPage}/${paged.totalPages}`;
    }

    updateParams(state, pageCategory !== "all");
  }

  if (searchInput) searchInput.addEventListener("input", () => rerender(true));

  if (categoryFilter) {
    categoryFilter.addEventListener("change", () => {
      state.genres = [];
      rerender(true);
    });
  }

  if (genreFilterList) {
    genreFilterList.addEventListener("change", () => {
      state.genres = getCheckedGenres(genreFilterList);
      rerender(true);
    });
  }

  if (platformFilter) platformFilter.addEventListener("change", () => rerender(true));
  if (sortFilter) sortFilter.addEventListener("change", () => rerender(true));

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (categoryFilter) categoryFilter.value = "all";
      if (platformFilter) platformFilter.value = "";
      if (sortFilter) sortFilter.value = "latest";

      state.q = "";
      state.genres = [];
      state.platform = "";
      state.sort = "latest";
      state.category = "all";
      state.page = 1;

      rerender(false);
    });
  }

  bindPagination(paginationTarget, (page) => {
    state.page = page;
    rerender(false);

    const topTarget =
      document.getElementById("cari-katalog") ||
      document.querySelector(".page-hero-wrap") ||
      document.querySelector(".page-section");

    if (topTarget) {
      topTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  rerender(false);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const games = await loadGames();
    bindCatalogPage(games);
  } catch (err) {
    const targets = [
      document.getElementById("catalogList"),
      document.getElementById("featuredList")
    ].filter(Boolean);

    targets.forEach((el) => {
      el.innerHTML = `<div class="empty-state">${escapeHTML(err.message)}</div>`;
    });
  }
});
