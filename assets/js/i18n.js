(() => {
  const data = window.digestLanguageData || {};
  window.digestI18n = {
    locale: data.locale || "fr-FR",
    t: text => data.messages?.[text] || text,
    category: name => data.categories?.[name] || name,
    tag: name => data.tags?.[name] || name,
  };
  for (const link of document.querySelectorAll("[data-language-link]")) {
    const update = () => {
      const target = new URL(link.href);
      target.search = window.location.search;
      target.hash = window.location.hash;
      link.href = target.href;
    };
    update();
    link.addEventListener("click", update);
    link.addEventListener("pointerdown", update);
    link.addEventListener("focus", update);
  }
})();
