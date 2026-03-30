const CATEGORY_META = {
  all: { title: "Semua Katalog", page: "./" },
  renpy: { title: "Ren'Py", page: "./renpy.html" },
  rpgm: { title: "RPGM", page: "./rpgm.html" },
  mod: { title: "Mod", page: "./mod.html" },
  cheat: { title: "Cheat", page: "./cheat.html" }
};

const PAGE_SIZE = {
  home: 8,
  catalog: 12
};

function escapeHTML(text) {
  return String(text ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

async function loadGames() {
  const response = await fetch("./data/games.json");
  if (!response.ok) throw new Error("Gagal memuat data katalog.");
  return response.json();
}

function getParams() {
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get("q") || "",
    category: sp.get("category") || "all",
    genre: sp.get("genre") || "",
    platform: sp.get("platform") || "",
    sort: sp.get("sort") || "latest",
    page: Math.max(1, parseInt(sp.get("page") || "1", 10) || 1)
  };
}

function updateParams(state, fixedCategory) {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (!fixedCategory && state.category && state.category !== "all") sp.set("category", state.category);
  if (state.genre) sp.set("genre", state.genre);
  if (state.platform) sp.set("platform", state.platform);
  if (state.sort && state.sort !== "latest") sp.set("sort", state.sort);
  if (state.page && state.page > 1) sp.set("page", String(state.page));
  const qs = sp.toString();
  history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

function activeCategory(pageCategory, selectedCategory) {
  return pageCategory && pageCategory !== "all" ? pageCategory : (selectedCategory || "all");
}

function uniqueGenres(games, category) {
  const base = category === "all" ? games : games.filter(g => g.category === category);
  return [...new Set(base.flatMap(g => g.genres || []))].sort((a,b) => a.localeCompare(b));
}

function filterGames(games, state, pageCategory) {
  const category = activeCategory(pageCategory, state.category);
  let result = [...games];
  if (category !== "all") result = result.filter(g => g.category === category);

  const q = state.q.trim().toLowerCase();
  if (q) {
    result = result.filter(game => {
      const text = [
        game.title, game.category, game.description, game.language, game.status,
        ...(game.genres || []), ...(game.platform || [])
      ].join(" ").toLowerCase();
      return text.includes(q);
    });
  }
  if (state.genre) result = result.filter(g => (g.genres || []).includes(state.genre));
  if (state.platform) result = result.filter(g => (g.platform || []).includes(state.platform));

  switch (state.sort) {
    case "title":
      result.sort((a,b) => a.title.localeCompare(b.title));
      break;
    case "size":
      result.sort((a,b) => String(a.size).localeCompare(String(b.size), undefined, {numeric:true}));
      break;
    case "latest":
    default:
      result.sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
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
    totalItems: items.length,
    startIndex: items.length ? start + 1 : 0,
    endIndex: Math.min(start + perPage, items.length)
  };
}

function renderImage(game) {
  return `<div class="catalog-cover"><img src="${escapeHTML(game.image)}" alt="${escapeHTML(game.title)}"><div class="cover-emoji">${escapeHTML(game.emoji || "🎮")}</div></div>`;
}

function categoryPage(category) {
  return (CATEGORY_META[category] || CATEGORY_META.all).page;
}

function filterLink(game, type, value) {
  const page = categoryPage(game.category);
  const sp = new URLSearchParams();
  if (type === "genre") sp.set("genre", value);
  if (type === "platform") sp.set("platform", value);
  return `${page}?${sp.toString()}`;
}

function renderCard(game) {
  const detail = game.detailUrl || "#";
  const download = game.downloadUrl || "#";
  return `
    <article class="download-card">
      ${renderImage(game)}
      <div class="download-body">
        <div class="post-meta">
          <a class="tag ${escapeHTML(game.category)} clickable" href="${escapeHTML(categoryPage(game.category))}">${escapeHTML(game.category.toUpperCase())}</a>
          ${(game.platform || []).map(item => `<a class="tag platform clickable" href="${escapeHTML(filterLink(game, "platform", item))}">${escapeHTML(item)}</a>`).join("")}
          <span class="tag status">${escapeHTML(game.status || "Updated")}</span>
        </div>

        <h3>${escapeHTML(game.title)}</h3>
        <p>${escapeHTML(game.description)}</p>

        <div class="genre-wrap">
          ${(game.genres || []).map(genre => `<a class="genre-chip clickable" href="${escapeHTML(filterLink(game, "genre", genre))}">${escapeHTML(genre)}</a>`).join("")}
        </div>

        <div class="download-meta">
          <div><strong>${escapeHTML(game.version || "-")}</strong><span>Versi</span></div>
          <div><strong>${escapeHTML(game.size || "-")}</strong><span>Ukuran</span></div>
          <div><strong>${escapeHTML(game.language || "-")}</strong><span>Bahasa</span></div>
        </div>

        <div class="download-actions">
          <a href="${escapeHTML(detail)}" class="btn btn-secondary">Detail</a>
          <a href="${escapeHTML(download)}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Download</a>
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

function fillGenreSelect(select, games, category, selected = "") {
  if (!select) return;
  const genres = uniqueGenres(games, category);
  select.innerHTML = `<option value="">Semua Genre</option>` + genres.map(genre => `<option value="${escapeHTML(genre)}">${escapeHTML(genre)}</option>`).join("");
  select.value = selected && genres.includes(selected) ? selected : "";
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
  target.addEventListener("click", event => {
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
  const genreFilter = document.getElementById("genreFilter");
  const platformFilter = document.getElementById("platformFilter");
  const sortFilter = document.getElementById("sortFilter");
  const resetBtn = document.getElementById("resetFilters");
  const countEl = document.getElementById("catalogCount");
  const catalogList = document.getElementById("catalogList");
  const paginationTarget = document.getElementById("catalogPagination");
  const featuredList = document.getElementById("featuredList");

  if (featuredList) {
    const latest = [...allGames].sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 6);
    renderList(featuredList, latest);
  }

  if (!catalogList) return;

  const params = getParams();
  const state = {
    q: params.q,
    category: params.category,
    genre: params.genre,
    platform: params.platform,
    sort: params.sort,
    page: params.page
  };

  if (searchInput) searchInput.value = state.q;
  if (categoryFilter) categoryFilter.value = state.category;
  if (platformFilter) platformFilter.value = state.platform;
  if (sortFilter) sortFilter.value = state.sort;

  function rerender(resetPage = false) {
    const currentCategory = activeCategory(pageCategory, categoryFilter ? categoryFilter.value : state.category);
    fillGenreSelect(genreFilter, allGames, currentCategory, state.genre);

    state.q = searchInput ? searchInput.value : "";
    state.category = categoryFilter ? categoryFilter.value : state.category;
    state.genre = genreFilter ? genreFilter.value : state.genre;
    state.platform = platformFilter ? platformFilter.value : state.platform;
    state.sort = sortFilter ? sortFilter.value : state.sort;
    if (resetPage) state.page = 1;

    const filtered = filterGames(allGames, state, pageCategory);
    const paged = paginateItems(filtered, state.page, perPage);
    state.page = paged.currentPage;

    renderList(catalogList, paged.pageItems);
    renderPagination(paginationTarget, paged.currentPage, paged.totalPages);

    if (countEl) {
      const label = activeCategory(pageCategory, state.category);
      const categoryText = label !== "all" ? ` • ${CATEGORY_META[label].title}` : "";
      countEl.textContent = `Ditemukan ${paged.totalItems} item${categoryText} • Halaman ${paged.currentPage}/${paged.totalPages}`;
    }
    updateParams(state, pageCategory !== "all");
  }

  const resetAndRender = () => rerender(true);

  if (searchInput) searchInput.addEventListener("input", resetAndRender);
  if (categoryFilter) categoryFilter.addEventListener("change", () => {
    state.genre = "";
    rerender(true);
  });
  if (genreFilter) genreFilter.addEventListener("change", resetAndRender);
  if (platformFilter) platformFilter.addEventListener("change", resetAndRender);
  if (sortFilter) sortFilter.addEventListener("change", resetAndRender);
  if (resetBtn) resetBtn.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (platformFilter) platformFilter.value = "";
    if (sortFilter) sortFilter.value = "latest";
    state.q = "";
    state.genre = "";
    state.platform = "";
    state.sort = "latest";
    state.category = "all";
    state.page = 1;
    rerender(false);
  });

  bindPagination(paginationTarget, page => {
    state.page = page;
    rerender(false);
    const topTarget = document.getElementById("cari-katalog") || document.querySelector(".page-hero-wrap") || document.querySelector(".page-section");
    if (topTarget) topTarget.scrollIntoView({behavior: "smooth", block: "start"});
  });

  rerender(false);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const games = await loadGames();
    bindCatalogPage(games);
  } catch (err) {
    const targets = [document.getElementById("catalogList"), document.getElementById("featuredList")].filter(Boolean);
    targets.forEach(el => { el.innerHTML = `<div class="empty-state">${escapeHTML(err.message)}</div>`; });
  }
});
