(() => {
  const button = document.querySelector("[data-linkedin-share]");
  const linkButtons = [...document.querySelectorAll("[data-linkedin-link-share]")];
  const shareButtons = [button, ...linkButtons].filter(Boolean);
  const deleteButtons = [...document.querySelectorAll("[data-archive-delete-link]")];
  const feedback =
    document.querySelector("[data-linkedin-feedback]") ||
    document.querySelector("[data-linkedin-composer-feedback]");
  const composer = document.querySelector("[data-linkedin-composer]");
  const form = document.querySelector("[data-linkedin-form]");
  const textField = document.querySelector("[data-linkedin-text]");
  const urlField = document.querySelector("[data-linkedin-url]");
  const accountField = document.querySelector("[data-linkedin-account]");
  const hashtagsField = document.querySelector("[data-linkedin-hashtags]");
  const tagsNote = document.querySelector("[data-linkedin-tags-note]");
  const confirmButton = document.querySelector("[data-linkedin-confirm]");
  const preview = document.querySelector("[data-linkedin-preview]");
  const imageStatus = document.querySelector("[data-linkedin-image-status]");
  const regenerateButton = document.querySelector("[data-linkedin-regenerate]");
  if (!shareButtons.length || !feedback || !composer || !form || !textField || !hashtagsField) return;
  let activeButton = shareButtons[0];
  let imageGeneration = 0;

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

  const revealForAuthenticatedAdmin = async () => {
    try {
      const response = await fetch("/api/admin/linkedin/status", {
        credentials: "same-origin",
      });
      if (response.ok) {
        shareButtons.forEach((shareButton) => { shareButton.hidden = false; });
        deleteButtons.forEach((deleteButton) => { deleteButton.hidden = false; });
      }
    } catch {
      // Le bouton reste invisible pour les visiteurs et en cas d’indisponibilité de l’admin.
    }
  };

  const showPost = (postUrl, alreadyPublished) => {
    feedback.replaceChildren(
      document.createTextNode(
        alreadyPublished
          ? "Cette ressource est déjà publiée. "
          : "Publié avec la grande image. ",
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

  revealForAuthenticatedAdmin();

  const publicationData = () => {
    const postText = textField.value.trim();
    const hashtags = hashtagsField.value.trim();
    return {
      imageUrl: activeButton.dataset.shareImage,
      linkId: activeButton.dataset.linkId || "",
      title: activeButton.dataset.shareTitle || "Web Digest",
      text: [postText, hashtags].filter(Boolean).join("\n\n"),
      url: activeButton.dataset.shareUrl || window.location.href,
    };
  };

  const normalizeHashtag = (tag) => {
    const parts = String(tag)
      .replace(/^#+/, "")
      .trim()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    if (!parts.length) return "";
    return parts
      .map((part) =>
        part === part.toUpperCase()
          ? part
          : part.charAt(0).toLocaleUpperCase("fr") + part.slice(1),
      )
      .join("");
  };

  const automaticHashtags = (shareButton) => {
    let tags = [];
    try {
      tags = JSON.parse(shareButton.dataset.shareTags || "[]");
    } catch {
      return [];
    }
    const counts = new Map();
    tags.forEach((tag, index) => {
      const label = normalizeHashtag(tag);
      if (!label) return;
      const key = label.toLocaleLowerCase("fr");
      const previous = counts.get(key);
      counts.set(key, previous
        ? { ...previous, count: previous.count + 1 }
        : { label, count: 1, index });
    });
    return [...counts.values()]
      .sort((left, right) => right.count - left.count || left.index - right.index)
      .slice(0, 5)
      .map(({ label }) => `#${label}`);
  };

  document.querySelectorAll("[data-linkedin-cancel]").forEach((cancel) => {
    cancel.addEventListener("click", () => composer.close("cancel"));
  });
  composer.addEventListener("close", () => {
    imageGeneration += 1;
    if (activeButton.dataset.published !== "true") activeButton.disabled = false;
  });

  const displayPreview = async (imageUrl) => {
    preview.hidden = false;
    preview.src = imageUrl;
    await preview.decode().catch(() => undefined);
    if (imageStatus) imageStatus.textContent = "";
  };

  const generateLinkPreview = async ({ refresh = false } = {}) => {
    const generation = ++imageGeneration;
    confirmButton.disabled = true;
    if (regenerateButton) regenerateButton.disabled = true;
    preview.hidden = true;
    if (imageStatus) {
      imageStatus.textContent = refresh
        ? "Nouvelle capture et traitement graphique en cours…"
        : "Capture du site et traitement noir et blanc en cours…";
    }
    const result = await api("/api/admin/linkedin/link-preview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        linkId: activeButton.dataset.linkId,
        refresh,
        confirm: true,
      }),
    });
    if (generation !== imageGeneration || !composer.open) return;
    activeButton.dataset.shareImage = result.imageUrl;
    await displayPreview(result.imageUrl);
    feedback.textContent = result.source === "fallback"
      ? "Le site a refusé la capture. Une carte OOBLIK propre à ce lien a été créée."
      : "Capture prête : noir et blanc, corail et titre du lien.";
    confirmButton.disabled = false;
    if (regenerateButton) regenerateButton.disabled = false;
  };

  const openComposer = async (shareButton) => {
    activeButton = shareButton;
    const { imageUrl, url } = {
      imageUrl: shareButton.dataset.shareImage,
      url: shareButton.dataset.shareUrl || window.location.href,
    };
    const isSingleLink = Boolean(shareButton.dataset.linkId);
    if (!isSingleLink && !imageUrl) return;
    shareButton.disabled = true;
    feedback.textContent = "Vérification du compte LinkedIn…";

    try {
      const status = await api("/api/admin/linkedin/status");
      if (!status.configured) {
        feedback.textContent =
          "L’application LinkedIn doit encore être configurée dans l’administration.";
        shareButton.disabled = false;
        return;
      }
      if (!status.connected) {
        connect();
        return;
      }
      const hashtags = automaticHashtags(shareButton);
      textField.value = "";
      hashtagsField.value = hashtags.join(" ");
      if (tagsNote) {
        tagsNote.textContent = hashtags.length
          ? `${hashtags.length} hashtags ont été ajoutés automatiquement. Ils restent modifiables.`
          : "Aucun hashtag automatique pour cette publication.";
      }
      if (regenerateButton) regenerateButton.hidden = !isSingleLink;
      if (imageStatus) imageStatus.textContent = "";
      if (!isSingleLink) await displayPreview(imageUrl);
      urlField.textContent = url;
      accountField.textContent = `Publication sur le compte ${status.memberName}`;
      feedback.textContent = isSingleLink
        ? "Préparation de l’image propre à ce lien…"
        : "Personnalisez le texte avant de confirmer.";
      composer.showModal();
      textField.focus();
      if (isSingleLink) {
        try {
          await generateLinkPreview();
        } catch (error) {
          if (error?.message === "AUTHENTICATION_REQUIRED") return;
          if (imageStatus) {
            imageStatus.textContent = "La création de l’image a échoué. Vous pouvez réessayer.";
          }
          feedback.textContent = "Impossible de préparer l’image LinkedIn.";
          if (regenerateButton) regenerateButton.disabled = false;
        }
      }
    } catch (error) {
      if (error?.message === "AUTHENTICATION_REQUIRED") return;
      feedback.textContent = "La vérification du compte LinkedIn a échoué.";
      shareButton.disabled = false;
    }
  };

  shareButtons.forEach((shareButton) => {
    shareButton.addEventListener("click", () => openComposer(shareButton));
  });

  regenerateButton?.addEventListener("click", async () => {
    try {
      await generateLinkPreview({ refresh: true });
    } catch (error) {
      if (error?.message === "AUTHENTICATION_REQUIRED") return;
      if (imageStatus) imageStatus.textContent = "La nouvelle capture a échoué.";
      feedback.textContent = "Impossible de régénérer l’image pour le moment.";
      regenerateButton.disabled = false;
    }
  });

  deleteButtons.forEach((deleteButton) => {
    deleteButton.addEventListener("click", async () => {
      const title = deleteButton.dataset.linkTitle || "ce lien";
      if (!window.confirm(`Retirer « ${title} » du Digest ? Le lien restera restaurable dans l’administration.`)) {
        return;
      }
      const item = deleteButton.closest(".archive-link");
      const itemFeedback = item?.querySelector("[data-archive-item-feedback]");
      deleteButton.disabled = true;
      if (itemFeedback) itemFeedback.textContent = "Retrait en cours…";
      try {
        await api(
          `/api/admin/links/${encodeURIComponent(deleteButton.dataset.linkId || "")}/hide`,
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ confirm: true }),
          },
        );
        if (itemFeedback) {
          itemFeedback.textContent = "Lien retiré. Le nouveau déploiement est lancé.";
        }
        item?.classList.add("is-removed");
        window.setTimeout(() => item?.remove(), 1200);
      } catch (error) {
        if (error?.message === "AUTHENTICATION_REQUIRED") return;
        if (itemFeedback) itemFeedback.textContent = "Le retrait du lien a échoué.";
        deleteButton.disabled = false;
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = publicationData();
    if (!data.text) {
      textField.focus();
      return;
    }
    confirmButton.disabled = true;
    try {
      feedback.textContent = "Téléversement de la grande image et publication…";
      const isSingleLink = Boolean(data.linkId);
      const publication = await api(
        isSingleLink
          ? "/api/admin/linkedin/publish-link"
          : "/api/admin/linkedin/publish",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isSingleLink
            ? { linkId: data.linkId, text: data.text, confirm: true }
            : { ...data, confirm: true }),
        },
      );
      composer.close("published");
      showPost(publication.postUrl, publication.alreadyPublished);
      window.dispatchEvent(new CustomEvent("digest:linkedin-published", {
        detail: { alreadyPublished: publication.alreadyPublished },
      }));
      activeButton.dataset.published = "true";
      if (isSingleLink) {
        const label = activeButton.querySelector("span:last-child");
        if (label) label.textContent = "Publié";
      } else {
        activeButton.textContent = "Publié sur LinkedIn";
      }
      activeButton.disabled = true;
    } catch (error) {
      if (error?.message === "AUTHENTICATION_REQUIRED") return;
      if (error?.code === "LINKEDIN_NOT_CONNECTED" || error?.code === "LINKEDIN_TOKEN_EXPIRED") {
        connect();
        return;
      }
      if (error?.code === "LINKEDIN_PUBLICATION_IN_PROGRESS") {
        feedback.textContent =
          "Cette publication LinkedIn est déjà en cours dans un autre onglet.";
        return;
      }
      feedback.textContent =
        "La publication LinkedIn a échoué. Aucun second post n’a été créé automatiquement.";
    } finally {
      confirmButton.disabled = false;
      if (activeButton.dataset.published !== "true") activeButton.disabled = false;
    }
  });
})();
