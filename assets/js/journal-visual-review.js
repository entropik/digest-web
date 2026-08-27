(() => {
  const review = document.querySelector(".visual-review");
  if (!review) return;

  const storageKey = "journal-visuals-v2-rejected";
  const cards = [...review.querySelectorAll("[data-review-card]")];
  const filters = [...review.querySelectorAll("[data-review-filter]")];
  const search = review.querySelector("[data-review-search]");
  const keptCount = review.querySelector("[data-review-kept]");
  const rejectedCount = review.querySelector("[data-review-rejected]");
  const empty = review.querySelector("[data-review-empty]");
  const viewer = review.querySelector(".visual-review-viewer");
  const viewerContent = review.querySelector("[data-review-viewer-content]");
  const close = review.querySelector("[data-review-close]");
  let activeFilter = "all";
  let lastTrigger = null;
  let rejected = new Set();

  try {
    rejected = new Set(JSON.parse(localStorage.getItem(storageKey) || "[]"));
  } catch {}

  const updateCounts = () => {
    rejectedCount.textContent = rejected.size;
    keptCount.textContent = cards.length - rejected.size;
  };

  const apply = () => {
    const needle = search.value.trim().toLocaleLowerCase("fr");
    let visible = 0;
    cards.forEach((card) => {
      const matchesFilter = activeFilter === "all" || card.dataset.category === activeFilter;
      const matchesSearch = !needle || card.dataset.search.includes(needle);
      card.hidden = !(matchesFilter && matchesSearch);
      if (!card.hidden) visible += 1;
    });
    empty.hidden = visible !== 0;
  };

  cards.forEach((card) => {
    const rejectButton = card.querySelector("[data-review-reject]");
    const setRejected = (value) => {
      card.classList.toggle("is-rejected", value);
      rejectButton.setAttribute("aria-pressed", String(value));
      rejectButton.textContent = value ? "Réintégrer" : "Écarter";
    };
    setRejected(rejected.has(card.dataset.id));
    rejectButton.addEventListener("click", () => {
      if (rejected.has(card.dataset.id)) rejected.delete(card.dataset.id);
      else rejected.add(card.dataset.id);
      setRejected(rejected.has(card.dataset.id));
      localStorage.setItem(storageKey, JSON.stringify([...rejected]));
      updateCounts();
    });

    card.querySelector("[data-review-open]").addEventListener("click", (event) => {
      lastTrigger = event.currentTarget;
      viewerContent.replaceChildren(card.querySelector("[data-review-details]").content.cloneNode(true));
      viewer.hidden = false;
      document.body.classList.add("visual-review-open");
      close.focus();
    });
  });

  const closeViewer = () => {
    viewer.hidden = true;
    viewerContent.replaceChildren();
    document.body.classList.remove("visual-review-open");
    lastTrigger?.focus();
  };
  close.addEventListener("click", closeViewer);
  viewer.addEventListener("click", (event) => { if (event.target === viewer) closeViewer(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !viewer.hidden) closeViewer(); });

  filters.forEach((button) => button.addEventListener("click", () => {
    activeFilter = button.dataset.reviewFilter;
    filters.forEach((candidate) => {
      const selected = candidate === button;
      candidate.classList.toggle("is-active", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    });
    apply();
  }));
  search.addEventListener("input", apply);
  updateCounts();
  apply();
})();
