(() => {
  const posters = [...document.querySelectorAll(".archive-edition-poster img[data-src]")];

  const loadPoster = (poster) => {
    poster.addEventListener("load", () => poster.classList.add("is-loaded"), { once: true });
    poster.src = poster.dataset.src;
    poster.removeAttribute("data-src");
  };

  if (!("IntersectionObserver" in window)) {
    posters.forEach(loadPoster);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      loadPoster(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "600px 0px" });

  posters.forEach((poster) => observer.observe(poster));
})();
