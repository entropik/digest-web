(() => {
  const PAGE_SIZE = 51;
  const FAVORITES_STORAGE_KEY = "digest-favorites-v1";
  const search = document.querySelector("#digest-search");
  const dateFilter = document.querySelector("#digest-date");
  const filters = document.querySelector("#digest-filters");
  const randomButton = document.querySelector("#digest-random");
  const favoritesCount = document.querySelector("#digest-favorites-count");
  const tools = document.querySelector(".digest-tools");
  const grid = document.querySelector("#digest-grid");
  const empty = document.querySelector("#digest-empty");
  const pagination = document.querySelector("#digest-pagination");
  const pagePrev = document.querySelector("#digest-page-prev");
  const pageNext = document.querySelector("#digest-page-next");
  const pageStatus = document.querySelector("#digest-page-status");
  const rawLinks = JSON.parse(document.querySelector("#digest-data").textContent);
  const links = typeof rawLinks === "string" ? JSON.parse(rawLinks) : rawLinks;
  const modal = document.querySelector("#digest-modal");
  const modalClose = modal.querySelector(".digest-modal-close");
  const modalTitle = document.querySelector("#digest-modal-title");
  const modalCategory = document.querySelector("#digest-modal-category");
  const modalDescription = document.querySelector("#digest-modal-description");
  const modalTags = document.querySelector("#digest-modal-tags");
  const modalUrl = document.querySelector("#digest-modal-url");
  const modalLink = document.querySelector("#digest-modal-link");
  const modalFavorite = document.querySelector("#digest-modal-favorite");
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  let category = "all";
  let randomLinkUrl = "";
  let modalFavoriteUrl = "";
  let favorites = new Set();
  let currentPage = Math.max(
    1,
    Number.parseInt(new URL(window.location.href).searchParams.get("page"), 10) || 1,
  );

  try {
    const storedFavorites = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
    if (Array.isArray(storedFavorites)) favorites = new Set(storedFavorites.filter(Boolean));
  } catch {
    // Les favoris restent utilisables pour la session si le stockage est indisponible.
  }

  const isFavorite = (url) => favorites.has(url);

  const saveFavorites = () => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]));
    } catch {
      // Certains modes de navigation peuvent bloquer le stockage local.
    }
  };

  const updateFavoriteButton = (button, url, { expandedLabel = false } = {}) => {
    const active = isFavorite(url);
    button.classList.toggle("is-favorite", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute(
      "aria-label",
      active ? "Retirer ce lien des favoris" : "Ajouter ce lien aux favoris",
    );
    button.title = active ? "Retirer des favoris" : "Ajouter aux favoris";
    button.textContent = expandedLabel
      ? "Favoris"
      : active
        ? "♥"
        : "♡";
  };

  const refreshFavoriteControls = () => {
    favoritesCount.textContent = favorites.size;
    document.querySelectorAll(".digest-favorite").forEach((button) => {
      updateFavoriteButton(button, button.dataset.favoriteUrl);
    });
    if (modalFavoriteUrl) {
      updateFavoriteButton(modalFavorite, modalFavoriteUrl, { expandedLabel: true });
    }
  };

  const toggleFavorite = (url) => {
    if (isFavorite(url)) {
      favorites.delete(url);
    } else {
      favorites.add(url);
    }
    saveFavorites();
    refreshFavoriteControls();
  };

  const normalize = (value = "") =>
    String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

  const slugifyTag = (value) =>
    normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const getHost = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  const getSearchableText = (link) =>
    normalize(
      [
        link.title,
        link.category,
        link.url,
        getHost(link.url),
        link.description,
        link.status,
        link.status_note,
        ...(link.tags || []),
      ].join(" "),
    );

  const createCard = (link) => {
    const host = getHost(link.url);
    const article = document.createElement("article");
    article.className = "digest-card";
    if (link.status === "dead") article.classList.add("is-dead");

    const trigger = document.createElement("button");
    trigger.className = "digest-card-trigger";
    trigger.type = "button";
    trigger.dataset.title = link.title;
    trigger.dataset.url = link.url;
    trigger.dataset.description = link.description || "";
    trigger.dataset.categoryLabel = link.category;
    trigger.dataset.host = host;
    trigger.dataset.tags = (link.tags || []).join("|");
    trigger.dataset.status = link.status || "";
    trigger.dataset.statusNote = link.status_note || "";
    trigger.setAttribute("aria-label", `${link.title} — afficher le résumé`);

    const top = document.createElement("div");
    top.className = "digest-card-top";
    const labels = document.createElement("div");
    labels.className = "digest-card-labels";
    const categoryLabel = document.createElement("span");
    categoryLabel.className = "digest-category";
    categoryLabel.textContent = link.category;
    labels.append(categoryLabel);
    if (link.status === "dead") {
      const status = document.createElement("span");
      status.className = "digest-status";
      status.textContent = "Lien mort";
      labels.append(status);
    }
    const arrow = document.createElement("span");
    arrow.className = "digest-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "＋";
    top.append(labels, arrow);

    const title = document.createElement("h2");
    title.className = "link-title";
    const favicon = document.createElement("img");
    favicon.className = "link-favicon";
    favicon.src = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(link.url)}&sz=32`;
    favicon.alt = "";
    favicon.width = 16;
    favicon.height = 16;
    favicon.loading = "lazy";
    favicon.decoding = "async";
    favicon.referrerPolicy = "no-referrer";
    const titleText = document.createElement("span");
    titleText.textContent = link.title;
    title.append(favicon, titleText);

    const meta = document.createElement("div");
    meta.className = "digest-meta";
    const hostLabel = document.createElement("span");
    hostLabel.textContent = host;
    const date = document.createElement("time");
    date.dateTime = link.added;
    date.textContent = dateFormatter.format(new Date(`${link.added}T12:00:00`));
    meta.append(hostLabel, date);

    trigger.append(top, title, meta);
    const favorite = document.createElement("button");
    favorite.className = "digest-favorite";
    favorite.type = "button";
    favorite.dataset.favoriteUrl = link.url;
    updateFavoriteButton(favorite, link.url);

    article.append(trigger, favorite);
    return article;
  };

  const getFilteredLinks = () => {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    const selectedDate = dateFilter.value;
    return links.filter((link) => {
      const matchesCategory =
        category === "all" ||
        (category === "favorites" ? isFavorite(link.url) : link.category === category);
      const searchableText = getSearchableText(link);
      const matchesQuery = terms.every((term) => searchableText.includes(term));
      const matchesDate = !selectedDate || link.added === selectedDate;
      return matchesCategory && matchesQuery && matchesDate;
    });
  };

  const clearRandomSelection = () => {
    randomLinkUrl = "";
    randomButton.classList.remove("is-active");
    randomButton.setAttribute("aria-pressed", "false");
  };

  const syncPageUrl = (mode) => {
    const url = new URL(window.location.href);
    if (currentPage > 1) {
      url.searchParams.set("page", currentPage);
    } else {
      url.searchParams.delete("page");
    }
    window.history[`${mode}State`](null, "", url);
  };

  const render = ({ urlMode = null, scroll = false } = {}) => {
    const filteredLinks = getFilteredLinks();
    const randomLink = randomLinkUrl
      ? filteredLinks.find((link) => link.url === randomLinkUrl)
      : null;
    if (randomLinkUrl && !randomLink) clearRandomSelection();
    const displayedLinks = randomLink ? [randomLink] : filteredLinks;
    const pageCount = Math.max(1, Math.ceil(displayedLinks.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), pageCount);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageLinks = displayedLinks.slice(start, start + PAGE_SIZE);
    const fragment = document.createDocumentFragment();

    pageLinks.forEach((link) => fragment.append(createCard(link)));
    grid.replaceChildren(fragment);

    empty.hidden = filteredLinks.length !== 0;
    pagination.hidden = pageCount <= 1;
    pagePrev.disabled = currentPage === 1;
    pageNext.disabled = currentPage === pageCount;
    pageStatus.textContent = `Page ${currentPage} sur ${pageCount} · ${filteredLinks.length} liens`;

    if (urlMode) syncPageUrl(urlMode);
    if (scroll) {
      window.requestAnimationFrame(() => tools.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-category-label]");
    if (!button) return;
    category = button.dataset.categoryLabel;
    currentPage = 1;
    clearRandomSelection();
    filters.querySelector(".is-active")?.classList.remove("is-active");
    button.classList.add("is-active");
    render({ urlMode: "replace" });
  });

  search.addEventListener("input", () => {
    currentPage = 1;
    clearRandomSelection();
    render({ urlMode: "replace" });
  });

  dateFilter.addEventListener("input", () => {
    currentPage = 1;
    clearRandomSelection();
    render({ urlMode: "replace" });
  });

  randomButton.addEventListener("click", () => {
    const candidates = getFilteredLinks();
    currentPage = 1;
    if (candidates.length === 0) {
      clearRandomSelection();
      render({ urlMode: "replace" });
      return;
    }

    const alternatives =
      candidates.length > 1
        ? candidates.filter((link) => link.url !== randomLinkUrl)
        : candidates;
    randomLinkUrl = alternatives[Math.floor(Math.random() * alternatives.length)].url;
    randomButton.classList.add("is-active");
    randomButton.setAttribute("aria-pressed", "true");
    render({ urlMode: "replace", scroll: true });
  });

  pagePrev.addEventListener("click", () => {
    if (currentPage === 1) return;
    currentPage -= 1;
    render({ urlMode: "push", scroll: true });
  });

  pageNext.addEventListener("click", () => {
    currentPage += 1;
    render({ urlMode: "push", scroll: true });
  });

  window.addEventListener("popstate", () => {
    currentPage = Math.max(
      1,
      Number.parseInt(new URL(window.location.href).searchParams.get("page"), 10) || 1,
    );
    render();
  });

  grid.addEventListener("click", (event) => {
    const favorite = event.target.closest(".digest-favorite");
    if (favorite) {
      toggleFavorite(favorite.dataset.favoriteUrl);
      if (category === "favorites") render({ urlMode: "replace" });
      return;
    }

    const trigger = event.target.closest(".digest-card-trigger");
    if (!trigger) return;

    modalTitle.textContent = trigger.dataset.title;
    const isDead = trigger.dataset.status === "dead";
    modalCategory.textContent = isDead
      ? `${trigger.dataset.categoryLabel} · LIEN MORT`
      : trigger.dataset.categoryLabel;
    modalDescription.textContent =
      [trigger.dataset.statusNote, trigger.dataset.description].filter(Boolean).join(" ") ||
      "Aucun résumé n’est encore disponible pour cette ressource.";
    modalUrl.textContent = trigger.dataset.url;
    modalLink.href = trigger.dataset.url;
    modalLink.textContent = "Tester url";
    modalLink.setAttribute(
      "aria-label",
      isDead ? `Tester l’adresse d’origine de ${trigger.dataset.title}` : `Visiter ${trigger.dataset.host}`,
    );
    modalFavoriteUrl = trigger.dataset.url;
    updateFavoriteButton(modalFavorite, modalFavoriteUrl, { expandedLabel: true });

    modalTags.replaceChildren();
    (trigger.dataset.tags || "")
      .split("|")
      .filter(Boolean)
      .forEach((tag) => {
        const chip = document.createElement("a");
        chip.textContent = `#${tag}`;
        chip.href = `${modalTags.dataset.base}${slugifyTag(tag)}/`;
        modalTags.append(chip);
      });
    modalTags.hidden = modalTags.childElementCount === 0;

    modal.showModal();
    document.body.classList.add("digest-modal-open");
  });

  modalFavorite.addEventListener("click", () => {
    if (!modalFavoriteUrl) return;
    toggleFavorite(modalFavoriteUrl);
    if (category === "favorites") render({ urlMode: "replace" });
  });

  const closeModal = () => modal.close();
  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  modal.addEventListener("close", () => {
    document.body.classList.remove("digest-modal-open");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== search) {
      event.preventDefault();
      search.focus();
    }
  });

  refreshFavoriteControls();
  randomButton.setAttribute("aria-pressed", "false");
  render({ urlMode: "replace" });
})();
