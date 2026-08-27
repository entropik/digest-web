document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".procrastinator-single").forEach((article) => {
    const openButton = article.querySelector(".procrastinator-document-open");
    const viewer = article.querySelector(".procrastinator-viewer");
    const closeButton = viewer?.querySelector(".procrastinator-viewer-close");

    if (!openButton || !viewer || !closeButton) return;

    const closeViewer = () => {
      viewer.hidden = true;
      document.body.classList.remove("procrastinator-viewer-open");
      openButton.focus();
    };

    openButton.addEventListener("click", () => {
      viewer.hidden = false;
      document.body.classList.add("procrastinator-viewer-open");
      closeButton.focus();
    });
    closeButton.addEventListener("click", closeViewer);
    viewer.addEventListener("click", (event) => {
      if (event.target === viewer) closeViewer();
    });
    viewer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeViewer();
    });
  });
});
