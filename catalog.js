const categoryMap = {
  all: { title: "Semua Katalog", icon: "🎮" },
  renpy: { title: "Ren'Py", icon: "🎭" },
  rpgm: { title: "RPGM", icon: "🗺️" },
  mod: { title: "Mod", icon: "🧩" },
  cheat: { title: "Cheat", icon: "⚡" }
};

function escapeHTML(text) {
  return String(text).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function getFilteredGames(config = {}) {
  const {
    category = "all",
    query = "",
    genre = "",
    platform = "",
    sort = "latest",
    limit = null
  } = config;

  let result = [...games];

  if (category !== "all") {
    result = result.filter(game => game.category === category);
  }

  const q = query.trim().toLowerCase();
  if (q) {
    result = result.filter(game => {
      const text = [
        game.title,
        game.category,
        game.description,
        game.language,
        game.status,
        game.genres.join(" "),
        game.platform.join(" ")
      ].join(" ").toLowerCase();
      return text.includes(q);
    });
  }

  if (genre) {
    result = result.filter(game => game.genres.includes(genre));
  }

  if (platform) {
    result = result.filter(game => game.platform.includes(platform));
  }

  switch (sort) {
    case "title":
      result.sort((a,b) => a.title.localeCompare(b.title));
      break;
    case "size":
      result.sort((a,b) => a.size.localeCompare(b.size, undefined, {numeric:true}));
      break;
    case "category":
      result.sort((a,b) => a.category.localeCompare(b.category));
      break;
    default:
      break;
  }

  if (limit) {
    result = result.slice(0, limit);
  }

  return result;
}

function populateGenres(selectEl, category) {
  if (!selectEl) return;
  const base = category === "all" ? games : games.filter(game => game.category === category);
  const genres = [...new Set(base.flatMap(game => game.genres))].sort();
  selectEl.innerHTML = `<option value="">Semua Genre</option>` +
    genres.map(genre => `<option value="${escapeHTML(genre)}">${escapeHTML(genre)}</option>`).join("");
}

function renderCard(game) {
  return `
    <article class="download-card">
      <div class="catalog-cover ${escapeHTML(game.imageClass)}">
        <div class="cover-emoji">${escapeHTML(game.emoji || "🎮")}</div>
      </div>

      <div class="download-body">
        <div class="post-meta">
          <span class="tag ${escapeHTML(game.category)}">${escapeHTML(game.category.toUpperCase())}</span>
          ${game.platform.map(item => `<span class="tag platform">${escapeHTML(item)}</span>`).join("")}
          <span class="tag status">${escapeHTML(game.status)}</span>
        </div>

        <h3>${escapeHTML(game.title)}</h3>
        <p>${escapeHTML(game.description)}</p>

        <div class="genre-wrap">
          ${game.genres.map(genre => `<span class="genre-chip">${escapeHTML(genre)}</span>`).join("")}
        </div>

        <div class="download-meta">
          <div><strong>${escapeHTML(game.version)}</strong><span>Versi</span></div>
          <div><strong>${escapeHTML(game.size)}</strong><span>Ukuran</span></div>
          <div><strong>${escapeHTML(game.language)}</strong><span>Bahasa</span></div>
        </div>

        <div class="download-actions">
          <a href="${escapeHTML(game.detail || "#")}" class="btn btn-secondary">Detail</a>
          <a href="${escapeHTML(game.download || "#")}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">Download</a>
        </div>
      </div>
    </article>
  `;
}

function initCatalogPage() {
  const pageType = document.body.dataset.page || "home";
  const category = document.body.dataset.category || "all";

  if (pageType === "catalog") {
    const searchInput = document.getElementById("searchInput");
    const genreFilter = document.getElementById("genreFilter");
    const platformFilter = document.getElementById("platformFilter");
    const sortFilter = document.getElementById("sortFilter");
    const resultCount = document.getElementById("resultCount");
    const resultGrid = document.getElementById("resultGrid");

    populateGenres(genreFilter, category);

    function updateCatalog() {
      const items = getFilteredGames({
        category,
        query: searchInput.value,
        genre: genreFilter.value,
        platform: platformFilter.value,
        sort: sortFilter.value
      });

      resultCount.textContent = `${items.length} item ditemukan`;

      if (!items.length) {
        resultGrid.innerHTML = `<div class="results-empty">Tidak ada hasil yang cocok. Coba ganti kata kunci, genre, atau platform.</div>`;
        return;
      }

      resultGrid.innerHTML = items.map(renderCard).join("");
    }

    [searchInput, genreFilter, platformFilter, sortFilter].forEach(el => {
      el.addEventListener("input", updateCatalog);
      el.addEventListener("change", updateCatalog);
    });

    updateCatalog();
  }

  if (pageType === "home") {
    const homeSearch = document.getElementById("homeSearch");
    const homeCategory = document.getElementById("homeCategory");
    const homeGenre = document.getElementById("homeGenre");
    const homePlatform = document.getElementById("homePlatform");
    const homeSort = document.getElementById("homeSort");
    const homeCount = document.getElementById("homeCount");
    const homeGrid = document.getElementById("homeGrid");
    const latestGrid = document.getElementById("latestGrid");

    populateGenres(homeGenre, "all");

    function updateHomeCatalog() {
      const categoryValue = homeCategory.value || "all";
      populateGenres(homeGenre, categoryValue);
      const previousGenre = homeGenre.dataset.value || "";
      if (previousGenre && [...homeGenre.options].some(opt => opt.value === previousGenre)) {
        homeGenre.value = previousGenre;
      } else if (![...homeGenre.options].some(opt => opt.value === homeGenre.value)) {
        homeGenre.value = "";
      }

      const items = getFilteredGames({
        category: categoryValue,
        query: homeSearch.value,
        genre: homeGenre.value,
        platform: homePlatform.value,
        sort: homeSort.value,
        limit: 6
      });

      homeCount.textContent = `${items.length} item tampil`;

      if (!items.length) {
        homeGrid.innerHTML = `<div class="results-empty">Belum ada item yang cocok dengan filter ini.</div>`;
      } else {
        homeGrid.innerHTML = items.map(renderCard).join("");
      }
    }

    if (latestGrid) {
      latestGrid.innerHTML = getFilteredGames({category:"all", limit:3}).map(renderCard).join("");
    }

    homeCategory.addEventListener("change", () => {
      homeGenre.dataset.value = "";
      updateHomeCatalog();
    });

    homeGenre.addEventListener("change", () => {
      homeGenre.dataset.value = homeGenre.value;
      updateHomeCatalog();
    });

    [homeSearch, homePlatform, homeSort].forEach(el => {
      el.addEventListener("input", updateHomeCatalog);
      el.addEventListener("change", updateHomeCatalog);
    });

    updateHomeCatalog();
  }
}

document.addEventListener("DOMContentLoaded", initCatalogPage);
