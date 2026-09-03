(() => {
  const t = window.digestI18n?.t || ((text) => text);
  const locale = window.digestI18n?.locale || "fr-FR";
  const button = document.querySelector("[data-linkedin-share]");
  const linkButtons = [...document.querySelectorAll("[data-linkedin-link-share]")];
  const shareButtons = [button, ...linkButtons].filter(Boolean);
  const deleteButtons = [...document.querySelectorAll("[data-archive-delete-link]")];
  const pageFeedback = document.querySelector("[data-linkedin-feedback]");
  const composerFeedback = document.querySelector("[data-linkedin-composer-feedback]");
  const feedback = composerFeedback || pageFeedback;
  const composer = document.querySelector("[data-linkedin-composer]");
  const form = document.querySelector("[data-linkedin-form]");
  const textField = document.querySelector("[data-linkedin-text]");
  const urlField = document.querySelector("[data-linkedin-url]");
  const accountField = document.querySelector("[data-linkedin-account]");
  const hashtagsField = document.querySelector("[data-linkedin-hashtags]");
  const tagsNote = document.querySelector("[data-linkedin-tags-note]");
  const characterCount = document.querySelector("[data-linkedin-character-count]");
  const confirmButton = document.querySelector("[data-linkedin-confirm]");
  const preview = document.querySelector("[data-linkedin-preview]");
  const imageStatus = document.querySelector("[data-linkedin-image-status]");
  const regenerateButton = document.querySelector("[data-linkedin-regenerate]");
  if (!shareButtons.length || !feedback || !composer || !form || !textField || !hashtagsField) return;
  let activeButton = shareButtons[0];
  let imageGeneration = 0;
  let suspendedDialog = null;
  let suspendedDialogBodyClass = false;
  let republishRequested = false;
  const maxCommentaryLength = 3000;

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

  const showPost = (
    target,
    postUrl,
    alreadyPublished,
    publicationCount,
    prepareRepublish,
  ) => {
    const count = Number(publicationCount || (alreadyPublished ? 1 : 0));
    target.replaceChildren(
      document.createTextNode(
        alreadyPublished
          ? `Cette ressource a déjà été publiée${count > 1 ? ` ${count} fois` : ""}. `
          : "Publié avec la grande image. ",
      ),
    );
    const link = document.createElement("a");
    link.href = postUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = t("Voir sur LinkedIn ↗");
    target.append(link);
    if (alreadyPublished && prepareRepublish) {
      target.append(document.createTextNode(" "));
      const republishButton = document.createElement("button");
      republishButton.type = "button";
      republishButton.textContent = t("Republier sur LinkedIn");
      republishButton.addEventListener("click", () => {
        republishButton.disabled = true;
        prepareRepublish();
      });
      target.append(republishButton);
    }
  };

  const applyPublicationStatus = (publicationStatus, fallbackMessage) => {
    republishRequested = publicationStatus.alreadyPublished === true;
    confirmButton.textContent = republishRequested
      ? "Confirmer la republication"
      : t("Confirmer la publication");
    if (!republishRequested) {
      feedback.textContent = fallbackMessage;
      return;
    }
    activeButton.dataset.published = "true";
    const label = activeButton.querySelector("span:last-child");
    if (label) {
      label.textContent = t("Republier");
    } else {
      activeButton.textContent = t("Republier sur LinkedIn");
    }
    showPost(
      feedback,
      publicationStatus.latestPostUrl,
      true,
      publicationStatus.publicationCount,
    );
  };

  if (new URLSearchParams(window.location.search).get("linkedin") === "connected") {
    feedback.textContent = t("Compte LinkedIn connecté. Cliquez pour publier cette édition.");
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

  const updateCharacterCount = () => {
    const data = publicationData();
    const commentary = [data.text, data.url].filter(Boolean).join("\n\n");
    const remaining = maxCommentaryLength - commentary.length;
    const exceeded = remaining < 0;
    textField.setCustomValidity(
      exceeded
        ? `Réduisez le post de ${Math.abs(remaining)} caractères.`
        : "",
    );
    if (!characterCount) return;
    characterCount.textContent = exceeded
      ? `${Math.abs(remaining).toLocaleString("fr-FR")} caractères en trop`
      : `${remaining.toLocaleString("fr-FR")} caractères disponibles`;
    characterCount.classList.toggle("is-over-limit", exceeded);
  };

  textField.addEventListener("input", updateCharacterCount);
  hashtagsField.addEventListener("input", updateCharacterCount);

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
          : part.charAt(0).toLocaleUpperCase(locale) + part.slice(1),
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
      const key = label.toLocaleLowerCase(locale);
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
    confirmButton.disabled = false;
    if (regenerateButton) regenerateButton.disabled = false;
    activeButton.disabled = false;
    if (suspendedDialog && !suspendedDialog.open) {
      suspendedDialog.showModal();
      if (suspendedDialogBodyClass) document.body.classList.add("digest-modal-open");
    }
    suspendedDialog = null;
    suspendedDialogBodyClass = false;
  });

  const displayPreview = async (imageUrl) => {
    preview.hidden = false;
    preview.src = imageUrl;
    const decoded = await preview.decode().then(
      () => true,
      () => false,
    );
    if (decoded) {
      const isSquare = preview.naturalWidth === preview.naturalHeight;
      preview.classList.toggle("is-square", isSquare);
      preview.width = 1200;
      preview.height = isSquare ? 1200 : 627;
    }
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
      ? t("Le site a refusé la capture. Une carte OOBLIK propre à ce lien a été créée.")
      : t("Capture prête : noir et blanc, corail et titre du lien.");
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
    republishRequested = false;
    confirmButton.textContent = t("Confirmer la publication");
    confirmButton.disabled = false;
    feedback.textContent = t("Vérification du compte LinkedIn…");

    try {
      const [status, publicationStatus] = await Promise.all([
        api("/api/admin/linkedin/status"),
        api("/api/admin/linkedin/publication-status", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }),
      ]);
      if (!status.configured) {
        feedback.textContent =
          t("L’application LinkedIn doit encore être configurée dans l’administration.");
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
          : t("Aucun hashtag automatique pour cette publication.");
      }
      if (regenerateButton) regenerateButton.hidden = !isSingleLink;
      if (imageStatus) imageStatus.textContent = "";
      if (!isSingleLink) await displayPreview(imageUrl);
      urlField.textContent = url;
      updateCharacterCount();
      accountField.textContent = `Publication sur le compte ${status.memberName}`;
      feedback.textContent = isSingleLink
        ? t("Préparation de l’image propre à ce lien…")
        : "Personnalisez le texte avant de confirmer.";
      if (!isSingleLink) {
        applyPublicationStatus(
          publicationStatus,
          "Personnalisez le texte avant de confirmer.",
        );
      }
      const parentDialog = shareButton.closest("dialog[open]");
      if (parentDialog && parentDialog !== composer) {
        suspendedDialog = parentDialog;
        suspendedDialogBodyClass = document.body.classList.contains("digest-modal-open");
        parentDialog.close();
      }
      composer.showModal();
      textField.focus();
      if (isSingleLink) {
        try {
          await generateLinkPreview();
          if (publicationStatus.alreadyPublished) {
            applyPublicationStatus(publicationStatus, "");
          }
        } catch (error) {
          if (error?.message === "AUTHENTICATION_REQUIRED") return;
          if (imageStatus) {
            imageStatus.textContent = t("La création de l’image a échoué. Vous pouvez réessayer.");
          }
          feedback.textContent = t("Impossible de préparer l’image LinkedIn.");
          if (regenerateButton) regenerateButton.disabled = false;
        }
      }
    } catch (error) {
      if (error?.message === "AUTHENTICATION_REQUIRED") return;
      feedback.textContent = t("La vérification du compte LinkedIn a échoué.");
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
      if (imageStatus) imageStatus.textContent = t("La nouvelle capture a échoué.");
      feedback.textContent = t("Impossible de régénérer l’image pour le moment.");
      regenerateButton.disabled = false;
    }
  });

  deleteButtons.forEach((deleteButton) => {
    deleteButton.addEventListener("click", async () => {
      const title = deleteButton.dataset.linkTitle || t("ce lien");
      if (!window.confirm(`Retirer « ${title} » du Digest ? Le lien restera restaurable dans l’administration.`)) {
        return;
      }
      const item = deleteButton.closest(".archive-link");
      const itemFeedback = item?.querySelector("[data-archive-item-feedback]");
      deleteButton.disabled = true;
      if (itemFeedback) itemFeedback.textContent = t("Retrait en cours…");
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
          itemFeedback.textContent = t("Lien retiré. Le nouveau déploiement est lancé.");
        }
        item?.classList.add("is-removed");
        window.setTimeout(() => item?.remove(), 1200);
      } catch (error) {
        if (error?.message === "AUTHENTICATION_REQUIRED") return;
        if (itemFeedback) itemFeedback.textContent = t("Le retrait du lien a échoué.");
        deleteButton.disabled = false;
      }
    });
  });

  const submitPublication = async () => {
    const data = publicationData();
    if (!data.text) {
      textField.focus();
      return;
    }
    confirmButton.disabled = true;
    try {
      feedback.textContent = t("Téléversement de la grande image et publication…");
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
            ? {
                linkId: data.linkId,
                text: data.text,
                republish: republishRequested,
                confirm: true,
              }
            : { ...data, republish: republishRequested, confirm: true }),
        },
      );
      showPost(
        feedback,
        publication.postUrl,
        publication.alreadyPublished,
        publication.publicationCount,
        () => {
          republishRequested = true;
          confirmButton.textContent = "Confirmer la republication";
          feedback.textContent =
            "Modifiez si besoin le texte et les hashtags, puis confirmez la nouvelle publication.";
          textField.focus();
        },
      );
      window.dispatchEvent(new CustomEvent("digest:linkedin-published", {
        detail: { alreadyPublished: publication.alreadyPublished },
      }));
      if (publication.alreadyPublished) {
        return;
      }
      if (pageFeedback && pageFeedback !== feedback) {
        showPost(
          pageFeedback,
          publication.postUrl,
          false,
          publication.publicationCount,
        );
      }
      composer.close("published");
      activeButton.dataset.published = "true";
      if (isSingleLink) {
        const label = activeButton.querySelector("span:last-child");
        if (label) label.textContent = t("Republier");
      } else {
        activeButton.textContent = t("Republier sur LinkedIn");
      }
      activeButton.disabled = false;
    } catch (error) {
      if (error?.message === "AUTHENTICATION_REQUIRED") return;
      if (error?.code === "LINKEDIN_NOT_CONNECTED" || error?.code === "LINKEDIN_TOKEN_EXPIRED") {
        connect();
        return;
      }
      if (error?.code === "LINKEDIN_PUBLICATION_IN_PROGRESS") {
        feedback.textContent =
          t("Cette publication LinkedIn est déjà en cours dans un autre onglet.");
        return;
      }
      if (error?.code === "LINKEDIN_PUBLICATION_OUTCOME_UNKNOWN") {
        feedback.textContent =
          "LinkedIn a peut-être publié ce post, mais le Digest ne peut pas le confirmer. Vérifiez votre profil LinkedIn avant toute action. Si aucun post n’existe, suivez la procédure opérateur documentée pour autoriser un nouvel essai.";
        return;
      }
      feedback.textContent =
        t("La publication LinkedIn a échoué. Aucun second post n’a été créé automatiquement.");
    } finally {
      confirmButton.disabled = false;
      activeButton.disabled = false;
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitPublication();
  });
})();
