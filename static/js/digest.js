(() => {
  const PAGE_SIZE = 51;
  const search = document.querySelector("#digest-search");
  const filters = document.querySelector("#digest-filters");
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
  const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  let category = "all";
  let currentPage = Math.max(
    1,
    Number.parseInt(new URL(window.location.href).searchParams.get("page"), 10) || 1,
  );

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
    title.textContent = link.title;

    const meta = document.createElement("div");
    meta.className = "digest-meta";
    const hostLabel = document.createElement("span");
    hostLabel.textContent = host;
    const date = document.createElement("time");
    date.dateTime = link.added;
    date.textContent = dateFormatter.format(new Date(`${link.added}T12:00:00`));
    meta.append(hostLabel, date);

    trigger.append(top, title, meta);
    article.append(trigger);
    return article;
  };

  const getFilteredLinks = () => {
    const terms = normalize(search.value).split(/\s+/).filter(Boolean);
    return links.filter((link) => {
      const matchesCategory = category === "all" || link.category === category;
      const searchableText = getSearchableText(link);
      const matchesQuery = terms.every((term) => searchableText.includes(term));
      return matchesCategory && matchesQuery;
    });
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
    const pageCount = Math.max(1, Math.ceil(filteredLinks.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), pageCount);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageLinks = filteredLinks.slice(start, start + PAGE_SIZE);
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
    filters.querySelector(".is-active")?.classList.remove("is-active");
    button.classList.add("is-active");
    render({ urlMode: "replace" });
  });

  search.addEventListener("input", () => {
    currentPage = 1;
    render({ urlMode: "replace" });
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
    modalLink.textContent = isDead ? "Tester l’adresse d’origine ↗" : "Visiter le site ↗";
    modalLink.setAttribute(
      "aria-label",
      isDead ? `Tester l’adresse d’origine de ${trigger.dataset.title}` : `Visiter ${trigger.dataset.host}`,
    );

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

  render({ urlMode: "replace" });
})();
