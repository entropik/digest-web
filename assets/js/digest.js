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
  const categoryBrowser = document.querySelector("#digest-category-browser");
  const categoryDetail = document.querySelector("#digest-category-detail");
  const categoryDetailTitle = document.querySelector("#digest-category-detail-title");
  const categoryDetailDescription = document.querySelector(
    "#digest-category-detail-description",
  );
  const categoryReset = document.querySelector("#digest-category-reset");
  const randomButton = document.querySelector("#digest-random");
  const favoritesCount = document.querySelector("#digest-favorites-count");
  const tools = document.querySelector(".digest-tools");
  const grid = document.querySelector("#digest-grid");
  const empty = document.querySelector("#digest-empty");
  const pagination = document.querySelector("#digest-pagination");
  const pagePrev = document.querySelector("#digest-page-prev");
  const pageNext = document.querySelector("#digest-page-next");
  const pageStatus = document.querySelector("#digest-page-status");
  const emptyMessage = empty.textContent;
  const faviconFallbackData = document.querySelector("#digest-favicon-fallbacks");
  const rawFaviconFallbackHosts = JSON.parse(faviconFallbackData.textContent);
  const faviconFallbackHosts = new Set(
    typeof rawFaviconFallbackHosts === "string"
      ? JSON.parse(rawFaviconFallbackHosts)
      : rawFaviconFallbackHosts,
  );
  const faviconFallbackSrc = faviconFallbackData.dataset.fallbackSrc;
  const indexUrl = grid.dataset.indexUrl;
  let links = null;
  let linksPromise = null;
  let linkCountByDate = new Map();
  const modal = document.querySelector("#digest-modal");
  const modalClose = modal.querySelector(".digest-modal-close");
  const modalPrev = modal.querySelector(".digest-modal-prev");
  const modalNext = modal.querySelector(".digest-modal-next");
  const modalTitle = document.querySelector("#digest-modal-title");
  const modalCategory = document.querySelector("#digest-modal-category");
  const modalDescription = document.querySelector("#digest-modal-description");
  const modalArchive = document.querySelector("#digest-modal-archive");
  const modalArchiveText = document.querySelector("#digest-modal-archive-text");
  const modalImage = document.querySelector("#digest-modal-image");
  const modalTags = document.querySelector("#digest-modal-tags");
  const modalTagRoutes = document.querySelector("#digest-tag-routes");
  const modalUrl = document.querySelector("#digest-modal-url");
  const modalLink = document.querySelector("#digest-modal-link");
  const modalOrigin = document.querySelector("#digest-modal-origin");
  const modalOriginRow = document.querySelector("#digest-modal-origin-row");
  const modalFavorite = document.querySelector("#digest-modal-favorite");
  const modalAdminTools = document.querySelector("#digest-modal-admin-tools");
  const modalTagEditor = document.querySelector("#digest-modal-tag-editor");
  const modalTagForm = document.querySelector("#digest-modal-tag-form");
  const modalTagInput = document.querySelector("#digest-modal-tag-input");
  const modalTagSubmit = modalTagForm.querySelector('button[type="submit"]');
  const modalLinkedIn = document.querySelector("#digest-modal-linkedin");
  const modalAdmin = document.querySelector("#digest-modal-admin");
  const modalAdminFeedback = document.querySelector("#digest-modal-admin-feedback");
  const adminNotice = document.querySelector("#digest-admin-notice");
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
  let modalAdminId = "";
  let modalNavigationLinks = [];
  let modalNavigationIndex = -1;
  let isAdmin = false;
  let favorites = new Set();
  let searchRevision = 0;
  let renderedSearchRevision = 0;
  let renderedPage = 1;
  let calendarRequestedOpen = false;
  let currentPage = Math.max(
    1,
    Number.parseInt(new URL(window.location.href).searchParams.get("page"), 10) || 1,
  );

  const decodeLink = (entry) => ({
    id: entry.i,
    title: entry.t,
    url: entry.u,
    category: entry.c,
    description: entry.d || "",
    archive_text: entry.x || "",
    tags: entry.g || [],
    added: entry.a,
    stream: entry.m || "",
    status: entry.s || "",
    status_note: entry.n || "",
    archive_url: entry.r || "",
    archive_scope: entry.o || "",
    image: entry.p || "",
    image_alt: entry.l || "",
    origin_url: entry.q || "",
  });

  const loadLinks = () => {
    if (links) return Promise.resolve(links);
    if (!linksPromise) {
      linksPromise = fetch(indexUrl, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      })
        .then((response) => {
          if (!response.ok) throw new Error(`INDEX_${response.status}`);
          return response.json();
        })
        .then((entries) => {
          if (!Array.isArray(entries)) throw new Error("INDEX_INVALID");
          links = entries.map(decodeLink);
          linkCountByDate = links.filter((link) => !link.stream || (link.stream === "blog-ooblik" && link.origin_url)).reduce((counts, link) => {
            const dateKey = String(link.added || "").slice(0, 10);
            if (dateKey) counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
            return counts;
          }, new Map());
          return links;
        })
        .catch((error) => {
          linksPromise = null;
          throw error;
        });
    }
    return linksPromise;
  };

  const withLinks = async (task, onError = null) => {
    try {
      await loadLinks();
    } catch {
      onError?.();
      empty.textContent =
        "L’index de recherche n’a pas pu être chargé. Réessaie dans un instant.";
      empty.hidden = false;
      return undefined;
    }
    empty.textContent = emptyMessage;
    empty.hidden = true;
    if (searchRevision > renderedSearchRevision) {
      render({ urlMode: "replace" });
    } else if (currentPage !== renderedPage) {
      render({ urlMode: "replace" });
    }
    return task();
  };

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

  const tagRoutes = (() => {
    try {
      return new Map(
        Object.entries(JSON.parse(modalTagRoutes?.textContent || "{}"))
          .map(([tag, route]) => [normalize(tag), route]),
      );
    } catch {
      return new Map();
    }
  })();

  const getHost = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  const getFaviconHost = (url) => {
    try {
      return new URL(url).hostname;
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
        link.archive_text,
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
    calendarRequestedOpen = false;
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
    const faviconHost = getFaviconHost(link.url);
    const article = document.createElement("article");
    article.className = "digest-card";
    if (link.status === "dead") article.classList.add("is-dead");

    const trigger = document.createElement("button");
    trigger.className = "digest-card-trigger";
    trigger.type = "button";
    trigger.dataset.id = link.id;
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
    trigger.dataset.image = link.image || "";
    trigger.dataset.imageAlt = link.image_alt || "";
    trigger.dataset.originUrl = link.origin_url || "";
    trigger.setAttribute("aria-label", `${link.title} — afficher le résumé`);

    if (link.image) {
      const image = document.createElement("img");
      image.className = "digest-card-image";
      image.src = link.image;
      image.alt = link.image_alt || "";
      image.width = 960;
      image.height = 540;
      image.loading = "lazy";
      image.decoding = "async";
      trigger.append(image);
    }

    const content = document.createElement("div");
    content.className = "digest-card-content";

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
    favicon.src = faviconFallbackHosts.has(host)
      ? faviconFallbackSrc
      : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(faviconHost)}&sz=32`;
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

    content.append(top, title, meta);
    trigger.append(content);
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
        (category === "all" && (!link.stream || (link.stream === "blog-ooblik" && link.origin_url))) ||
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

  const syncCategoryBrowser = (button, requestedCategory) => {
    filters.querySelectorAll("button[data-category-label]").forEach((filterButton) => {
      const active = filterButton === button;
      filterButton.classList.toggle("is-active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    });

    const hasDetail = requestedCategory !== "all" && requestedCategory !== "favorites";
    categoryBrowser.classList.toggle("has-category-detail", hasDetail);
    categoryDetail.hidden = !hasDetail;
    if (!hasDetail) return;

    const label = button.dataset.categoryLabel;
    categoryDetailTitle.textContent = label;
    categoryDetailDescription.textContent =
      button.dataset.categoryDescription.trim() ||
      `Une sélection de liens consacrés à « ${label} ».`;
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
    const folio = String(currentPage).padStart(2, "0");
    const folioCount = String(pageCount).padStart(2, "0");
    pageStatus.textContent = `Folio ${folio}/${folioCount} · ${filteredLinks.length} liens`;
    renderedSearchRevision = searchRevision;
    renderedPage = currentPage;

    if (urlMode) syncPageUrl(urlMode);
    if (scroll) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const header = document.querySelector(".header");
          const headerHeight = header?.offsetHeight || 0;
          const gridTop = window.scrollY + grid.getBoundingClientRect().top;
          const stickyToolsHeight =
            window.getComputedStyle(tools).position === "sticky"
              ? tools.getBoundingClientRect().height
              : 0;
          const top = Math.max(0, gridTop - headerHeight - stickyToolsHeight);
          const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth";
          window.scrollTo({ top, behavior });
        });
      });
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
    const requestedCategory = button.dataset.categoryLabel;
    if (requestedCategory === "favorites") {
      searchRevision += 1;
      search.value = "";
      dateFilter.value = "";
      dateValue.textContent = "cliquer sur le calendrier";
      dateToggle.classList.remove("has-value");
      closeCalendar();
    }
    void withLinks(() => {
      category = requestedCategory;
      currentPage = 1;
      clearRandomSelection();
      syncCategoryBrowser(button, requestedCategory);
      render({ urlMode: "replace" });
    });
  });

  categoryReset.addEventListener("click", () => {
    const allButton = filters.querySelector('button[data-category-label="all"]');
    void withLinks(() => {
      category = "all";
      currentPage = 1;
      clearRandomSelection();
      syncCategoryBrowser(allButton, "all");
      render({ urlMode: "replace" });
      allButton.focus();
    });
  });

  search.addEventListener("input", () => {
    searchRevision += 1;
    currentPage = 1;
    clearRandomSelection();
    void withLinks(() => undefined);
  });

  dateToggle.addEventListener("click", () => {
    calendarRequestedOpen = !calendarRequestedOpen;
    if (!calendarRequestedOpen) {
      closeCalendar();
      return;
    }
    void withLinks(
      () => {
        if (!calendarRequestedOpen) return;
        const referenceDate = dateFilter.value ? parseDateKey(dateFilter.value) : today;
        calendarMonth = new Date(
          referenceDate.getFullYear(),
          referenceDate.getMonth(),
          1,
          12,
        );
        renderCalendar();
        calendar.hidden = false;
        dateToggle.setAttribute("aria-expanded", "true");
      },
      () => {
        calendarRequestedOpen = false;
      },
    );
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
    const requestedSearchRevision = searchRevision;
    void withLinks(() => {
      if (requestedSearchRevision !== searchRevision) return;
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
  });

  pagePrev.addEventListener("click", () => {
    const displayedPage = renderedPage;
    const requestedSearchRevision = searchRevision;
    if (displayedPage === 1) return;
    void withLinks(() => {
      if (requestedSearchRevision !== searchRevision) return;
      currentPage = displayedPage - 1;
      render({ urlMode: "push", scroll: true });
    });
  });

  pageNext.addEventListener("click", () => {
    const displayedPage = renderedPage;
    const requestedSearchRevision = searchRevision;
    void withLinks(() => {
      if (requestedSearchRevision !== searchRevision) return;
      currentPage = displayedPage + 1;
      render({ urlMode: "push", scroll: true });
    });
  });

  window.addEventListener("popstate", () => {
    currentPage = Math.max(
      1,
      Number.parseInt(new URL(window.location.href).searchParams.get("page"), 10) || 1,
    );
    void withLinks(() => undefined);
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
    modalArchive.hidden = !link.archive_text;
    modalArchiveText.textContent = link.archive_text || "";
    modalImage.hidden = !link.image;
    if (link.image) {
      modalImage.src = link.image;
      modalImage.alt = link.image_alt || "";
    } else {
      modalImage.removeAttribute("src");
      modalImage.alt = "";
    }
    modalOriginRow.hidden = !link.origin_url;
    if (link.origin_url) modalOrigin.href = link.origin_url;
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
    modalAdminId = link.id;
    modalAdminTools.hidden = !isAdmin;
    modalLinkedIn.hidden = !isAdmin;
    modalLinkedIn.disabled = false;
    delete modalLinkedIn.dataset.published;
    modalLinkedIn.dataset.linkId = link.id;
    delete modalLinkedIn.dataset.shareImage;
    modalLinkedIn.dataset.shareTitle = link.title;
    modalLinkedIn.dataset.shareTags = JSON.stringify(link.tags || []);
    modalLinkedIn.dataset.shareUrl = link.url;
    modalLinkedIn.querySelector("span:last-child").textContent = "Partager sur LinkedIn";
    modalAdmin.hidden = !isAdmin;
    modalAdmin.disabled = false;
    modalAdmin.textContent = "Retirer du Digest";
    modalTagEditor.open = false;
    modalTagInput.value = "";
    modalTagSubmit.disabled = false;
    modalAdminFeedback.textContent = "";
    updateFavoriteButton(modalFavorite, modalFavoriteUrl, { expandedLabel: true });

    modalTags.replaceChildren();
    (link.tags || []).forEach((tag) => {
      const route = tagRoutes.get(normalize(tag));
      const chip = document.createElement(route ? "a" : "span");
      chip.textContent = `#${tag}`;
      if (route) chip.href = route;
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
    void withLinks(() => {
      const { displayedLinks } = getDisplayState();
      modalNavigationLinks = displayedLinks;
      modalNavigationIndex = displayedLinks.findIndex(
        (link) => link.id === trigger.dataset.id,
      );
      if (modalNavigationIndex < 0) return;

      renderModalLink(modalNavigationLinks[modalNavigationIndex]);
      modal.showModal();
      document.body.classList.add("digest-modal-open");
    });
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

  let noticeTimeout = 0;
  const showAdminNotice = (message) => {
    window.clearTimeout(noticeTimeout);
    adminNotice.textContent = message;
    adminNotice.hidden = false;
    noticeTimeout = window.setTimeout(() => {
      adminNotice.hidden = true;
    }, 7000);
  };

  window.addEventListener("digest:linkedin-published", (event) => {
    showAdminNotice(
      event.detail?.alreadyPublished
        ? "Cette ressource était déjà publiée sur LinkedIn."
        : "Ressource publiée sur LinkedIn avec la grande image.",
    );
  });

  const refreshAdminSession = async () => {
    try {
      const response = await fetch("/api/admin/session", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      isAdmin = response.ok && (await response.json()).isAdmin === true;
      modalAdminTools.hidden = !isAdmin || !modalAdminId;
      modalLinkedIn.hidden = !isAdmin || !modalAdminId;
      modalAdmin.hidden = !isAdmin || !modalAdminId;
    } catch {
      isAdmin = false;
      modalAdminTools.hidden = true;
      modalLinkedIn.hidden = true;
      modalAdmin.hidden = true;
    }
  };

  modalTagForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isAdmin || !modalAdminId) return;
    const link = links.find((candidate) => candidate.id === modalAdminId);
    if (!link) return;
    const tags = modalTagInput.value
      .split(/[,\n]+/)
      .map((tag) => tag.trim().replace(/^#+/, ""))
      .filter(Boolean);
    if (!tags.length) {
      modalTagInput.focus();
      return;
    }

    modalTagSubmit.disabled = true;
    modalAdminFeedback.textContent = "";
    try {
      const response = await fetch(
        `/api/admin/links/${encodeURIComponent(modalAdminId)}/tags`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags, confirm: true }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          isAdmin = false;
          modalAdminTools.hidden = true;
          throw new Error("La session propriétaire a expiré. Reconnecte-toi sur /admin.");
        }
        throw new Error(
          result.error === "UNKNOWN_TAG"
            ? "Choisis un tag existant dans l’index."
            : result.error || "Les tags n’ont pas pu être enregistrés.",
        );
      }

      link.tags = [...result.link.tags];
      renderModalLink(link);
      showAdminNotice(
        result.changed
          ? "Tags ajoutés. La version publique sera mise à jour dans quelques minutes."
          : "Ces tags étaient déjà présents.",
      );
    } catch (error) {
      modalTagSubmit.disabled = false;
      modalAdminFeedback.textContent =
        error instanceof Error ? error.message : "L’ajout des tags a échoué.";
    }
  });

  modalAdmin.addEventListener("click", async () => {
    if (!isAdmin || !modalAdminId) return;
    const link = links.find((candidate) => candidate.id === modalAdminId);
    if (!link) return;

    modalAdmin.disabled = true;
    modalAdmin.textContent = "Retrait en cours…";
    modalAdminFeedback.textContent = "";
    try {
      const response = await fetch(
        `/api/admin/links/${encodeURIComponent(modalAdminId)}/hide`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          isAdmin = false;
          modalAdminTools.hidden = true;
          modalAdmin.hidden = true;
          throw new Error("La session propriétaire a expiré. Reconnecte-toi sur /admin.");
        }
        throw new Error(result.error || "Le retrait n’a pas pu être enregistré.");
      }

      const index = links.findIndex((candidate) => candidate.id === modalAdminId);
      if (index >= 0) links.splice(index, 1);
      modal.close();
      clearRandomSelection();
      render({ urlMode: "replace" });
      showAdminNotice(
        "Lien retiré. La version publique sera mise à jour dans quelques minutes.",
      );
    } catch (error) {
      modalAdmin.disabled = false;
      modalAdmin.textContent = "Retirer du Digest";
      modalAdminFeedback.textContent =
        error instanceof Error ? error.message : "Le retrait a échoué.";
    }
  });
  document.addEventListener("click", (event) => {
    if (calendarRequestedOpen && !event.target.closest(".digest-date")) closeCalendar();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !calendar.hidden) {
      closeCalendar();
      dateToggle.focus();
      return;
    }
    if (
      modal.open &&
      !event.target.matches("input, textarea") &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
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
  refreshAdminSession();
  randomButton.setAttribute("aria-pressed", "false");
  if (currentPage > 1) void withLinks(() => undefined);
})();
