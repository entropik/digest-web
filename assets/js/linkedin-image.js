(() => {
  const button = document.querySelector("[data-linkedin-share]");
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

  const copyText = async (text) => {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  };

  button.addEventListener("click", async () => {
    const imageUrl = button.dataset.shareImage;
    const title = button.dataset.shareTitle || "Web Digest";
    const text = button.dataset.shareText || "Une nouvelle édition du Web Digest.";
    const url = button.dataset.shareUrl || window.location.href;
    if (!imageUrl) return;
    button.disabled = true;
    feedback.textContent = "Préparation du texte, du lien et de la grande image…";

    try {
      const response = await fetch(imageUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error("IMAGE_UNAVAILABLE");
      const blob = await response.blob();
      const filename = imageUrl.split("/").pop() || "digest-linkedin.png";
      const file = new File([blob], filename, { type: "image/png" });
      const files = [file];

      if (navigator.share && navigator.canShare?.({ files })) {
        await navigator.share({ title, text, url, files });
        feedback.textContent = "Publication transmise avec son texte, son lien et sa grande image.";
        return;
      }

      const copied = await copyText(`${title}\n${text}\n\n${url}`);
      download(imageUrl);
      feedback.textContent =
        copied
          ? "Image téléchargée et texte copié. Ouvrez LinkedIn, ajoutez l’image puis collez le texte."
          : "Image téléchargée. Ouvrez LinkedIn, ajoutez-la puis copiez le texte et le lien de cette page.";
    } catch (error) {
      if (error?.name === "AbortError") {
        feedback.textContent = "Partage annulé.";
      } else {
        const copied = await copyText(`${title}\n${text}\n\n${url}`).catch(() => false);
        download(imageUrl);
        feedback.textContent = copied
          ? "Partage direct indisponible : image téléchargée et texte copié."
          : "Partage direct indisponible : l’image a été téléchargée.";
      }
    } finally {
      button.disabled = false;
    }
  });
})();
