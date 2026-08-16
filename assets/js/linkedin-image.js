(() => {
  const button = document.querySelector("[data-linkedin-share]");
  const feedback = document.querySelector("[data-linkedin-feedback]");
  const composer = document.querySelector("[data-linkedin-composer]");
  const form = document.querySelector("[data-linkedin-form]");
  const textField = document.querySelector("[data-linkedin-text]");
  const urlField = document.querySelector("[data-linkedin-url]");
  const accountField = document.querySelector("[data-linkedin-account]");
  const hashtagsField = document.querySelector("[data-linkedin-hashtags]");
  const tagsNote = document.querySelector("[data-linkedin-tags-note]");
  const confirmButton = document.querySelector("[data-linkedin-confirm]");
  if (!button || !feedback || !composer || !form || !textField || !hashtagsField) return;

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

  const publicationData = () => {
    const postText = textField.value.trim();
    const hashtags = hashtagsField.value.trim();
    return {
      imageUrl: button.dataset.shareImage,
      title: button.dataset.shareTitle || "Web Digest",
      text: [postText, hashtags].filter(Boolean).join("\n\n"),
      url: button.dataset.shareUrl || window.location.href,
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

  const automaticHashtags = () => {
    let tags = [];
    try {
      tags = JSON.parse(button.dataset.shareTags || "[]");
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
    if (button.textContent !== "Publié sur LinkedIn") button.disabled = false;
  });

  button.addEventListener("click", async () => {
    const { imageUrl, url } = {
      imageUrl: button.dataset.shareImage,
      url: button.dataset.shareUrl || window.location.href,
    };
    if (!imageUrl) return;
    button.disabled = true;
    feedback.textContent = "Vérification du compte LinkedIn…";

    try {
      const status = await api("/api/admin/linkedin/status");
      if (!status.configured) {
        feedback.textContent =
          "L’application LinkedIn doit encore être configurée dans l’administration.";
        button.disabled = false;
        return;
      }
      if (!status.connected) {
        connect();
        return;
      }
      const hashtags = automaticHashtags();
      textField.value = "";
      hashtagsField.value = hashtags.join(" ");
      if (tagsNote) {
        tagsNote.textContent = hashtags.length
          ? `${hashtags.length} hashtags issus des liens ont été ajoutés automatiquement. Ils restent modifiables.`
          : "Aucun hashtag automatique pour cette édition.";
      }
      urlField.textContent = url;
      accountField.textContent = `Publication sur le compte ${status.memberName}`;
      feedback.textContent = "Personnalisez le texte avant de confirmer.";
      composer.showModal();
      textField.focus();
    } catch (error) {
      if (error?.message === "AUTHENTICATION_REQUIRED") return;
      feedback.textContent = "La vérification du compte LinkedIn a échoué.";
      button.disabled = false;
    }
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
      const publication = await api("/api/admin/linkedin/publish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, confirm: true }),
      });
      composer.close("published");
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
      confirmButton.disabled = false;
      if (button.textContent !== "Publié sur LinkedIn") button.disabled = false;
    }
  });
})();
