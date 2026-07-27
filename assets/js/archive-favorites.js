(() => {
  const FAVORITES_STORAGE_KEY = "digest-favorites-v1";
  const buttons = [...document.querySelectorAll(".archive-favorite")];
  if (!buttons.length) return;

  let favorites = new Set();

  const loadFavorites = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
      favorites = new Set(Array.isArray(stored) ? stored.filter(Boolean) : []);
    } catch {
      favorites = new Set();
    }
  };

  const saveFavorites = () => {
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]));
    } catch {
      // Les favoris restent actifs pour la session si le stockage est indisponible.
    }
  };

  const refreshButtons = () => {
    buttons.forEach((button) => {
      const active = favorites.has(button.dataset.favoriteUrl);
      button.classList.toggle("is-favorite", active);
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute(
        "aria-label",
        active ? "Retirer ce lien des favoris" : "Ajouter ce lien aux favoris",
      );
      button.title = active ? "Retirer des favoris" : "Ajouter aux favoris";
    });
  };

  loadFavorites();
  refreshButtons();

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const url = button.dataset.favoriteUrl;
      if (!url) return;

      if (favorites.has(url)) {
        favorites.delete(url);
      } else {
        favorites.add(url);
      }

      saveFavorites();
      refreshButtons();
    });
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== FAVORITES_STORAGE_KEY) return;
    loadFavorites();
    refreshButtons();
  });
})();
