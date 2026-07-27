(() => {
  const PAGE_SIZE = 51;
  const FAVORITES_STORAGE_KEY = "digest-favorites-v1";
  const search = document.querySelector("#digest-search");
  const dateFilter = document.querySelector("#digest-date");
  const dateToggle = document.querySelector("#digest-date-toggle");
  const dateValue = document.querySelector("#digest-date-value");
  const calendar = document.querySelector("#digest-calendar");
  const calendarTitle = document.querySelector("#digest-calendar-title");
  const calendarGrid = document.querySelector("#digest-calendar-grid");
  const calendarPrev = document.querySelector("#digest-calendar-prev");
  const calendarNext = document.querySelector("#digest-calendar-next");
  const calendarClear = document.querySelector("#digest-calendar-clear");
  const calendarToday = document.querySelector("#digest-calendar-today");
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
  const linkCountByDate = links.reduce((counts, link) => {
    const dateKey = String(link.added || "").slice(0, 10);
    if (dateKey) counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
    return counts;
  }, new Map());
  const modal = document.querySelector("#digest-modal");
  const modalClose = modal.querySelector(".digest-modal-close");
  const modalPrev = modal.querySelector(".digest-modal-prev");
  const modalNext = modal.querySelector(".digest-modal-next");
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
  const calendarMonthFormatter = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  });
  const calendarValueFormatter = new Intl.DateTimeFormat("fr-FR");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  let calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  let category = "all";
  let randomLinkUrl = "";
  let modalFavoriteUrl = "";
  let modalNavigationLinks = [];
  let modalNavigationIndex = -1;
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
    if (expandedLabel) {
      const heart = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      heart.setAttribute("aria-hidden", "true");
      heart.setAttribute("viewBox", "0 0 24 24");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M12 20.5 4.7 13.8A5.4 5.4 0 0 1 12 5.9a5.4 5.4 0 0 1 7.3 7.9Z");
      heart.append(path);
      const label = document.createElement("span");
      label.textContent = "Favoris";
      button.replaceChildren(heart, label);
    } else {
      button.textContent = active ? "♥" : "♡";
    }
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

  const toDateKey = (date) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");

  const parseDateKey = (dateKey) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  };

  const closeCalendar = () => {
    calendar.hidden = true;
    dateToggle.setAttribute("aria-expanded", "false");
  };

  const renderCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const selectedDate = dateFilter.value;
    const monthStart = new Date(year, month, 1, 12);
    const firstDayOffset = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - firstDayOffset, 12);
    const fragment = document.createDocumentFragment();

    calendarTitle.textContent = calendarMonthFormatter.format(calendarMonth);

    for (let index = 0; index < 42; index += 1) {
      const date = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index,
        12,
      );
      const dateKey = toDateKey(date);
      const linkCount = linkCountByDate.get(dateKey) || 0;
      const day = document.createElement("button");
      day.className = "digest-calendar-day";
      day.type = "button";
      day.textContent = date.getDate();
      day.dataset.date = dateKey;
      day.classList.toggle("is-outside", date.getMonth() !== month);
      day.classList.toggle("is-today", dateKey === toDateKey(today));
      day.classList.toggle("is-selected", dateKey === selectedDate);
      day.classList.toggle("has-links", linkCount > 0);
      day.setAttribute(
        "aria-label",
        `${calendarValueFormatter.format(date)}${linkCount ? ` · ${linkCount} lien${linkCount > 1 ? "s" : ""}` : ""}`,
      );
      if (dateKey === selectedDate) day.setAttribute("aria-current", "date");
      fragment.append(day);
    }

    calendarGrid.replaceChildren(fragment);
    calendarClear.disabled = !selectedDate;
  };

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
    trigger.dataset.archiveUrl = link.archive_url || "";
    trigger.dataset.archiveScope = link.archive_scope || "";
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
      status.textContent = "Lien mort · conservé pour mémoire";
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
      const matchesDate = !selectedDate || String(link.added).slice(0, 10) === selectedDate;
      return matchesCategory && matchesQuery && matchesDate;
    });
  };

  const clearRandomSelection = () => {
    randomLinkUrl = "";
    randomButton.classList.remove("is-active");
    randomButton.setAttribute("aria-pressed", "false");
  };

  const getDisplayState = () => {
    const filteredLinks = getFilteredLinks();
    const randomLink = randomLinkUrl
      ? filteredLinks.find((link) => link.url === randomLinkUrl)
      : null;
    if (randomLinkUrl && !randomLink) clearRandomSelection();
    return {
      filteredLinks,
      displayedLinks: randomLink ? [randomLink] : filteredLinks,
    };
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
    const { filteredLinks, displayedLinks } = getDisplayState();
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

  const selectDate = (dateKey) => {
    dateFilter.value = dateKey;
    dateValue.textContent = calendarValueFormatter.format(parseDateKey(dateKey));
    dateToggle.classList.add("has-value");
    currentPage = 1;
    clearRandomSelection();
    closeCalendar();
    render({ urlMode: "replace" });
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

  dateToggle.addEventListener("click", () => {
    const willOpen = calendar.hidden;
    if (!willOpen) {
      closeCalendar();
      return;
    }

    const referenceDate = dateFilter.value ? parseDateKey(dateFilter.value) : today;
    calendarMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 12);
    renderCalendar();
    calendar.hidden = false;
    dateToggle.setAttribute("aria-expanded", "true");
  });

  calendarPrev.addEventListener("click", () => {
    calendarMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() - 1,
      1,
      12,
    );
    renderCalendar();
  });

  calendarNext.addEventListener("click", () => {
    calendarMonth = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      1,
      12,
    );
    renderCalendar();
  });

  calendarGrid.addEventListener("click", (event) => {
    const day = event.target.closest(".digest-calendar-day");
    if (!day) return;
    selectDate(day.dataset.date);
  });

  calendarClear.addEventListener("click", () => {
    dateFilter.value = "";
    dateValue.textContent = "cliquer sur le calendrier";
    dateToggle.classList.remove("has-value");
    currentPage = 1;
    clearRandomSelection();
    closeCalendar();
    render({ urlMode: "replace" });
  });

  calendarToday.addEventListener("click", () => selectDate(toDateKey(today)));

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

  const renderModalLink = (link) => {
    const isDead = link.status === "dead";
    const archiveUrl = link.archive_url || "";
    const host = getHost(link.url);

    modalTitle.textContent = link.title;
    modalCategory.textContent = isDead ? `${link.category} · LIEN MORT` : link.category;
    modalDescription.textContent =
      [link.status_note, link.description].filter(Boolean).join(" ") ||
      "Aucun résumé n’est encore disponible pour cette ressource.";
    modalUrl.textContent = link.url;
    modalLink.href = isDead && archiveUrl ? archiveUrl : link.url;
    modalLink.textContent = isDead ? "Tester l’URL" : "Visiter le site";
    modalLink.setAttribute(
      "aria-label",
      isDead && archiveUrl
        ? `Tester l’URL archivée de ${link.title}`
        : isDead
          ? `Tester l’adresse d’origine de ${link.title}`
          : `Visiter ${host}`,
    );
    modalFavoriteUrl = link.url;
    updateFavoriteButton(modalFavorite, modalFavoriteUrl, { expandedLabel: true });

    modalTags.replaceChildren();
    (link.tags || []).forEach((tag) => {
      const chip = document.createElement("a");
      chip.textContent = `#${tag}`;
      chip.href = `${modalTags.dataset.base}${slugifyTag(tag)}/`;
      modalTags.append(chip);
    });
    modalTags.hidden = modalTags.childElementCount === 0;

    const previousLink = modalNavigationLinks[modalNavigationIndex - 1];
    const nextLink = modalNavigationLinks[modalNavigationIndex + 1];
    modalPrev.disabled = !previousLink;
    modalNext.disabled = !nextLink;
    modalPrev.setAttribute(
      "aria-label",
      previousLink ? `Lien précédent : ${previousLink.title}` : "Aucun lien précédent",
    );
    modalNext.setAttribute(
      "aria-label",
      nextLink ? `Lien suivant : ${nextLink.title}` : "Aucun lien suivant",
    );
    modal.scrollTop = 0;
  };

  const moveModal = (offset) => {
    const nextIndex = modalNavigationIndex + offset;
    if (nextIndex < 0 || nextIndex >= modalNavigationLinks.length) return;
    modalNavigationIndex = nextIndex;
    renderModalLink(modalNavigationLinks[modalNavigationIndex]);
  };

  grid.addEventListener("click", (event) => {
    const favorite = event.target.closest(".digest-favorite");
    if (favorite) {
      toggleFavorite(favorite.dataset.favoriteUrl);
      if (category === "favorites") render({ urlMode: "replace" });
      return;
    }

    const trigger = event.target.closest(".digest-card-trigger");
    if (!trigger) return;

    const { displayedLinks } = getDisplayState();
    modalNavigationLinks = displayedLinks;
    modalNavigationIndex = displayedLinks.findIndex(
      (link) => link.url === trigger.dataset.url && link.title === trigger.dataset.title,
    );
    if (modalNavigationIndex < 0) return;

    renderModalLink(modalNavigationLinks[modalNavigationIndex]);
    modal.showModal();
    document.body.classList.add("digest-modal-open");
  });

  modalPrev.addEventListener("click", () => moveModal(-1));
  modalNext.addEventListener("click", () => moveModal(1));

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
  document.addEventListener("click", (event) => {
    if (!calendar.hidden && !event.target.closest(".digest-date")) closeCalendar();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !calendar.hidden) {
      closeCalendar();
      dateToggle.focus();
      return;
    }
    if (modal.open && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      moveModal(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "/" && !modal.open && document.activeElement !== search) {
      event.preventDefault();
      search.focus();
    }
  });

  refreshFavoriteControls();
  randomButton.setAttribute("aria-pressed", "false");
  render({ urlMode: "replace" });
})();
