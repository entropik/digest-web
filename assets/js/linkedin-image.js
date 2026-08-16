(() => {
  const button = document.querySelector("[data-linkedin-image]");
  const feedback = document.querySelector("[data-linkedin-feedback]");
  if (!button || !feedback) return;

  const download = (url) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = url.split("/").pop() || "digest-linkedin.png";
    document.body.append(link);
    link.click();
    link.remove();
  };

  button.addEventListener("click", async () => {
    const url = button.dataset.linkedinImage;
    if (!url) return;
    button.disabled = true;
    feedback.textContent = "Préparation de l’image…";

    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) throw new Error("IMAGE_UNAVAILABLE");
      const blob = await response.blob();

      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        feedback.textContent =
          "Image copiée. Ouvrez LinkedIn, créez un post puis collez-la avec Ctrl+V.";
      } else {
        download(url);
        feedback.textContent =
          "Image téléchargée. Ajoutez-la à votre publication LinkedIn.";
      }
    } catch {
      download(url);
      feedback.textContent =
        "Copie indisponible : l’image a été téléchargée pour être ajoutée à LinkedIn.";
    } finally {
      button.disabled = false;
    }
  });
})();
