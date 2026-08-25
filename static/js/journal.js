(() => {
  const links = [...document.querySelectorAll("[data-journal-anchor]")];
  if (!links.length) return;

  const updateCurrent = () => {
    const target = window.location.hash.slice(1);
    let matched = false;

    links.forEach((link, index) => {
      const isCurrent = target
        ? link.dataset.journalAnchor === target
        : index === links.length - 2;
      link.toggleAttribute("aria-current", isCurrent);
      matched ||= isCurrent;
    });

    if (!matched) links.forEach((link) => link.removeAttribute("aria-current"));
  };

  window.addEventListener("hashchange", updateCurrent);
  updateCurrent();
})();
