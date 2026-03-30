const CATEGORY_META = {
  all: { title: "Semua Katalog", page: "./" },
  renpy: { title: "Ren'Py", page: "./renpy.html" },
  rpgm: { title: "RPGM", page: "./rpgm.html" },
  mod: { title: "Mod", page: "./mod.html" },
  cheat: { title: "Cheat", page: "./cheat.html" }
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
    sort: sp.get("sort") || "latest"
  };
}

function updateParams(state, fixedCategory) {
  const sp = new URLSearchParams();
  if (state.q) sp.set("q", state.q);
  if (!fixedCategory && state.category && state.category !== "all") sp.set("category", state.category);
  if (state.genre) sp.set("genre", state.genre);
  if (state.platform) sp.set("platform", state.platform);
  if (state.sort && state.sort !== "latest") sp.set("sort", state.sort);
  const qs = sp.toString();
  history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
}

function activeCategory(pageCategory, selectedCategory) {
  return pageCategory && pageCategory !== "all" ? pageCategory : (selectedCategory || "all");
}

function uniqueGenres(games, category) {
  const base = category === "all" ? games : games.filter(g => g.category === category);
  return [...new Set(base.flatMap(g => g.genres))].sort((a,b) => a.localeCompare(b));
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
  if (state.genre) result = result.filter(g => g.genres.includes(state.genre));
  if (state.platform) result = result.filter(g => g.platform.includes(state.platform));

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

function bindCatalogPage(allGames) {
  const body = document.body;
  const pageCategory = body.dataset.category || "all";
  const searchInput = document.getElementById("searchInput");
  const categoryFilter = document.getElementById("categoryFilter");
  const genreFilter = document.getElementById("genreFilter");
  const platformFilter = document.getElementById("platformFilter");
  const sortFilter = document.getElementById("sortFilter");
  const resetBtn = document.getElementById("resetFilters");
  const countEl = document.getElementById("catalogCount");
  const catalogList = document.getElementById("catalogList");
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
    sort: params.sort
  };

  if (searchInput) searchInput.value = state.q;
  if (categoryFilter) categoryFilter.value = state.category;
  if (platformFilter) platformFilter.value = state.platform;
  if (sortFilter) sortFilter.value = state.sort;

  function rerender() {
    const currentCategory = activeCategory(pageCategory, categoryFilter ? categoryFilter.value : state.category);
    fillGenreSelect(genreFilter, allGames, currentCategory, state.genre);

    state.q = searchInput ? searchInput.value : "";
    state.category = categoryFilter ? categoryFilter.value : state.category;
    state.genre = genreFilter ? genreFilter.value : state.genre;
    state.platform = platformFilter ? platformFilter.value : state.platform;
    state.sort = sortFilter ? sortFilter.value : state.sort;

    const filtered = filterGames(allGames, state, pageCategory);
    renderList(catalogList, filtered);
    if (countEl) {
      const label = activeCategory(pageCategory, state.category);
      countEl.textContent = `Ditemukan ${filtered.length} item${label !== "all" ? ` • ${CATEGORY_META[label].title}` : ""}`;
    }
    updateParams(state, pageCategory !== "all");
  }

  if (searchInput) searchInput.addEventListener("input", rerender);
  if (categoryFilter) categoryFilter.addEventListener("change", () => {
    state.genre = "";
    rerender();
  });
  if (genreFilter) genreFilter.addEventListener("change", rerender);
  if (platformFilter) platformFilter.addEventListener("change", rerender);
  if (sortFilter) sortFilter.addEventListener("change", rerender);
  if (resetBtn) resetBtn.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (platformFilter) platformFilter.value = "";
    if (sortFilter) sortFilter.value = "latest";
    state.q = ""; state.genre = ""; state.platform = ""; state.sort = "latest"; state.category = "all";
    rerender();
  });

  rerender();
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
