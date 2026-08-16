(() => {
  const button = document.querySelector("[data-linkedin-share]");
  const feedback = document.querySelector("[data-linkedin-feedback]");
  if (!button || !feedback) return;

  const api = async (path, options) => {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      sessionStorage.setItem("digest-linkedin-return", window.location.pathname);
      window.location.assign("/admin");
      throw new Error("AUTHENTICATION_REQUIRED");
    }
    if (!response.ok) {
      const error = new Error(data.error || "LINKEDIN_FAILED");
      error.code = data.error;
      throw error;
    }
    return data;
  };

  const connect = () => {
    const returnTo = encodeURIComponent(window.location.pathname);
    window.location.assign(`/api/admin/linkedin/connect?returnTo=${returnTo}`);
  };

  const showPost = (postUrl, alreadyPublished) => {
    feedback.replaceChildren(
      document.createTextNode(
        alreadyPublished ? "Cette édition est déjà publiée. " : "Publié avec la grande image. ",
      ),
    );
    const link = document.createElement("a");
    link.href = postUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Voir sur LinkedIn ↗";
    feedback.append(link);
  };

  if (new URLSearchParams(window.location.search).get("linkedin") === "connected") {
    feedback.textContent = "Compte LinkedIn connecté. Cliquez pour publier cette édition.";
    history.replaceState(null, "", window.location.pathname);
  }

  button.addEventListener("click", async () => {
    const imageUrl = button.dataset.shareImage;
    const title = button.dataset.shareTitle || "Web Digest";
    const text = button.dataset.shareText || "Une nouvelle édition du Web Digest.";
    const url = button.dataset.shareUrl || window.location.href;
    if (!imageUrl) return;
    button.disabled = true;
    feedback.textContent = "Vérification du compte LinkedIn…";

    try {
      const status = await api("/api/admin/linkedin/status");
      if (!status.configured) {
        feedback.textContent =
          "L’application LinkedIn doit encore être configurée dans l’administration.";
        return;
      }
      if (!status.connected) {
        connect();
        return;
      }
      if (!window.confirm(`Publier « ${title} » sur le compte LinkedIn ${status.memberName} ?`)) {
        feedback.textContent = "Publication annulée.";
        return;
      }
      feedback.textContent = "Téléversement de la grande image et publication…";
      const publication = await api("/api/admin/linkedin/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text, url, imageUrl, confirm: true }),
      });
      showPost(publication.postUrl, publication.alreadyPublished);
      button.textContent = "Publié sur LinkedIn";
      button.disabled = true;
    } catch (error) {
      if (error?.message === "AUTHENTICATION_REQUIRED") return;
      if (error?.code === "LINKEDIN_NOT_CONNECTED" || error?.code === "LINKEDIN_TOKEN_EXPIRED") {
        connect();
        return;
      }
      feedback.textContent =
        "La publication LinkedIn a échoué. Aucun second post n’a été créé automatiquement.";
    } finally {
      if (button.textContent !== "Publié sur LinkedIn") button.disabled = false;
    }
  });
})();
