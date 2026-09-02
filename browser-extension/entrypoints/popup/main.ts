import { browser } from "wxt/browser";
import {
  extractPageMetadata,
  isSupportedCaptureUrl,
  missingEditorialFields,
  type AnalyzedPageCapture,
  type PageCapture
} from "../../lib/capture";
import { DigestApiError, requestJson } from "../../lib/api";
import {
  suggestTags,
  type TagDefinition,
} from "../../lib/tag-suggestions";
import {
  canonicalLocalDraftUrl,
  clearLocalDraft,
  loadLocalDraft,
  pruneExpiredLocalDrafts,
  saveLocalDraft,
  type LocalDraftFields,
} from "../../lib/local-draft";

const API_ORIGIN = "https://digest.ooblik.com";
const MAX_SELECTED_TAGS = 5;
const form = document.querySelector<HTMLFormElement>("#capture-form")!;
const login = document.querySelector<HTMLElement>("#login")!;
const feedback = document.querySelector<HTMLElement>("#feedback")!;
const completeness = document.querySelector<HTMLElement>("#completeness")!;
const tagInput = document.querySelector<HTMLInputElement>("#tag-input")!;
const selectedTags = document.querySelector<HTMLElement>("#selected-tags")!;
const knownTags = document.querySelector<HTMLElement>("#known-tags")!;
const tagSuggestions = document.querySelector<HTMLElement>("#tag-suggestions")!;
const suggestedTags = document.querySelector<HTMLElement>("#suggested-tags")!;
const tagCount = document.querySelector<HTMLElement>("#tag-count")!;
const createTagConfirm = document.querySelector<HTMLElement>("#create-tag-confirm")!;
const createTagName = document.querySelector<HTMLElement>("#create-tag-name")!;
const confirmCreateTag = document.querySelector<HTMLButtonElement>("#confirm-create-tag")!;
const cancelCreateTag = document.querySelector<HTMLButtonElement>("#cancel-create-tag")!;
const category = document.querySelector<HTMLSelectElement>("#category")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
const retryButton = document.querySelector<HTMLButtonElement>("#retry")!;
const discardLocalButton =
  document.querySelector<HTMLButtonElement>("#discard-local")!;
let tags: string[] = [];
let addedTags: string[] = [];
let removedTags: string[] = [];
let verifiedUrl: string | null = null;
let verificationSequence = 0;
let canSaveVerifiedDraft = false;
let localSaveTimer: ReturnType<typeof setTimeout> | undefined;
let popupCloseTimer: ReturnType<typeof setTimeout> | undefined;
let localPersistenceEnabled = false;
let localDraftDirty = false;
let restoredLocalDraftUrl: string | null = null;
let restoredTagsAuthoritative = false;
let capturedPageUrl: string | null = null;
let capturedPageText = "";
let availableTagDefinitions: TagDefinition[] = [];
let activeTagOption = -1;
let pendingTagName = "";
let creatingTag = false;
const persistedLocalDraftUrls = new Set<string>();
const pendingLocalWrites = new Set<Promise<void>>();

type CurationOptions = {
  categories: string[];
  tags: string[];
  themes?: TagDefinition[];
};
type EditableField = keyof PageCapture | "category" | "tags";
type StoredDraft = PageCapture & {
  category: string;
  tags: string[];
  privateNote: string;
};
const touchedFields = new Set<EditableField>();
type BootstrapResponse = {
  options: CurationOptions;
  draft: StoredDraft | null;
  published: { id?: string; title?: string } | null;
};
type ActivePageCapture = {
  capture: AnalyzedPageCapture;
  pageUrl: string;
  localPersistenceAllowed: boolean;
};

const api = async <T>(
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<T> => requestJson<T>(API_ORIGIN, path, init, { timeoutMs });

const field = (name: string): HTMLInputElement | HTMLTextAreaElement =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;

const currentLocalDraft = (): LocalDraftFields => ({
  url: field("url").value.trim(),
  title: field("title").value,
  category: category.value,
  description: field("description").value,
  tags: [...tags],
  privateNote: field("privateNote").value,
});

const reportLocalDraftWriteFailure = (): void => {
  localPersistenceEnabled = false;
  localDraftDirty = false;
  feedback.textContent =
    "Reprise locale impossible : cette saisie n’a pas été enregistrée sur l’appareil.";
};

const persistLocalDraft = (): void => {
  if (!localPersistenceEnabled || !localDraftDirty) return;
  const url = field("url").value.trim();
  if (!capturedPageUrl || !isSupportedCaptureUrl(url)) return;
  persistedLocalDraftUrls.add(capturedPageUrl);
  const write = saveLocalDraft(
    browser.storage.local,
    capturedPageUrl,
    currentLocalDraft(),
  ).catch(() => {
    reportLocalDraftWriteFailure();
  });
  pendingLocalWrites.add(write);
  void write.finally(() => {
    pendingLocalWrites.delete(write);
  });
};

const clearSessionLocalDrafts = async (): Promise<void> => {
  await Promise.all([...pendingLocalWrites]);
  const urls = [
    ...new Set(
      [
        ...persistedLocalDraftUrls,
        restoredLocalDraftUrl,
        capturedPageUrl,
      ].filter((url): url is string => !!url),
    ),
  ];
  await Promise.all(
    urls.map((url) =>
      clearLocalDraft(browser.storage.local, url).catch((error) => {
        if (
          error instanceof TypeError ||
          (error instanceof Error && error.message === "SENSITIVE_URL")
        ) return;
        throw error;
      }),
    ),
  );
  persistedLocalDraftUrls.clear();
  restoredLocalDraftUrl = null;
};

const flushLocalDraftSave = (): void => {
  if (localSaveTimer) clearTimeout(localSaveTimer);
  localSaveTimer = undefined;
  persistLocalDraft();
};

const scheduleLocalDraftSave = (): void => {
  localDraftDirty = true;
  if (localSaveTimer) clearTimeout(localSaveTimer);
  localSaveTimer = setTimeout(flushLocalDraftSave, 300);
};

const tagKey = (tag: string): string =>
  tag
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const sameTag = (left: string, right: string): boolean =>
  tagKey(left) === tagKey(right);

const updateSaveAvailability = (): void => {
  saveButton.disabled =
    creatingTag || !canSaveVerifiedDraft || tags.length > MAX_SELECTED_TAGS;
};

const definitionForLabel = (value: string): TagDefinition | undefined =>
  availableTagDefinitions.find((definition) =>
    [definition.name, ...definition.aliases].some((label) => sameTag(label, value)),
  );

const closeKnownTags = (): void => {
  knownTags.replaceChildren();
  activeTagOption = -1;
  tagInput.setAttribute("aria-expanded", "false");
  tagInput.removeAttribute("aria-activedescendant");
};

const setActiveTagOption = (index: number): void => {
  const items = [...knownTags.querySelectorAll<HTMLButtonElement>("button")];
  if (!items.length) {
    activeTagOption = -1;
    tagInput.removeAttribute("aria-activedescendant");
    return;
  }
  activeTagOption = (index + items.length) % items.length;
  items.forEach((item, itemIndex) =>
    item.setAttribute("aria-selected", String(itemIndex === activeTagOption)),
  );
  const active = items[activeTagOption];
  if (!active) return;
  tagInput.setAttribute("aria-activedescendant", active.id);
  active.scrollIntoView?.({ block: "nearest" });
};

const openCreateTagConfirmation = (rawValue: string): void => {
  const value = rawValue.trim().replace(/^#+/, "").slice(0, 80);
  if (!value || tags.length >= MAX_SELECTED_TAGS) return;
  pendingTagName = value;
  createTagName.textContent = `« ${value} »`;
  createTagConfirm.hidden = false;
  closeKnownTags();
  confirmCreateTag.focus();
};

const renderKnownTags = (query = tagInput.value): void => {
  if (
    creatingTag ||
    tags.length >= MAX_SELECTED_TAGS ||
    !availableTagDefinitions.length
  ) {
    closeKnownTags();
    return;
  }
  const needle = tagKey(query);
  const matches = availableTagDefinitions
    .filter((definition) => !tags.some((tag) => sameTag(tag, definition.name)))
    .filter((definition) => {
      if (!needle) return true;
      return tagKey(
        `${definition.name} ${definition.description} ${definition.aliases.join(" ")}`,
      ).includes(needle);
    })
    .slice(0, 8);
  const exact = query.trim() ? definitionForLabel(query) : undefined;
  const buttons = matches.map((definition, index) => {
    const button = document.createElement("button");
    button.id = `known-tag-${index}`;
    button.type = "button";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.dataset.existingTag = definition.name;
    const strong = document.createElement("strong");
    strong.textContent = definition.name;
    button.append(strong);
    if (definition.description) {
      const small = document.createElement("small");
      small.textContent = definition.description;
      button.append(small);
    }
    button.addEventListener("click", () => addTag(definition.name));
    return button;
  });
  if (query.trim() && !exact) {
    const create = document.createElement("button");
    create.id = `known-tag-${buttons.length}`;
    create.type = "button";
    create.className = "create-tag-option";
    create.setAttribute("role", "option");
    create.setAttribute("aria-selected", "false");
    create.dataset.proposeTag = query.trim();
    create.textContent = `Créer le tag « ${query.trim()} »`;
    create.addEventListener("click", () => openCreateTagConfirmation(query));
    buttons.push(create);
  }
  knownTags.replaceChildren(...buttons);
  tagInput.setAttribute("aria-expanded", String(Boolean(buttons.length)));
  if (buttons.length) setActiveTagOption(0);
};

const renderTagSuggestions = (): void => {
  const candidates = suggestTags(
    {
      title: field("title").value,
      description: field("description").value,
      body: capturedPageText,
    },
    availableTagDefinitions,
    10,
  )
    .filter((candidate) => !tags.some((tag) => sameTag(tag, candidate)))
    .slice(0, 5);
  suggestedTags.replaceChildren(
    ...candidates.map((tag) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = tag;
      button.setAttribute("aria-label", `Ajouter le tag ${tag}`);
      button.addEventListener("click", () => addTag(tag));
      return button;
    }),
  );
  tagSuggestions.hidden = candidates.length === 0;
};

const renderTags = (): void => {
  selectedTags.replaceChildren(
    ...tags.map((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag";
      chip.append(tag);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", `Retirer ${tag}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        touchedFields.add("tags");
        if (!removedTags.some((candidate) => sameTag(candidate, tag))) {
          removedTags.push(tag);
        }
        addedTags = addedTags.filter(
          (candidate) => !sameTag(candidate, tag),
        );
        tags = tags.filter((candidate) => candidate !== tag);
        renderTags();
        updateCompleteness();
        updateSaveAvailability();
        scheduleLocalDraftSave();
        if (canSaveVerifiedDraft && tags.length <= MAX_SELECTED_TAGS) {
          feedback.textContent = "Brouillon prêt à enregistrer.";
        }
      });
      chip.append(remove);
      return chip;
    }),
  );
  tagCount.textContent = `${tags.length}/${MAX_SELECTED_TAGS} tags sélectionnés`;
  tagInput.disabled = tags.length >= MAX_SELECTED_TAGS || creatingTag;
  if (tags.length >= MAX_SELECTED_TAGS) closeKnownTags();
  renderTagSuggestions();
};

function addTag(rawValue = tagInput.value): void {
  const definition = definitionForLabel(rawValue);
  if (!definition) {
    openCreateTagConfirmation(rawValue);
    return;
  }
  const value = definition.name;
  const alreadySelected = tags.some((tag) => sameTag(tag, value));
  if (!alreadySelected && tags.length >= MAX_SELECTED_TAGS) {
    feedback.textContent = "Choisissez au maximum cinq tags.";
    return;
  }
  if (!alreadySelected) {
    touchedFields.add("tags");
    removedTags = removedTags.filter(
      (candidate) => !sameTag(candidate, value),
    );
    addedTags.push(value);
    tags.push(value);
  }
  tagInput.value = "";
  createTagConfirm.hidden = true;
  pendingTagName = "";
  closeKnownTags();
  feedback.textContent = "";
  renderTags();
  updateCompleteness();
  updateSaveAvailability();
  scheduleLocalDraftSave();
}

const updateCompleteness = (): void => {
  const missing = missingEditorialFields({
    title: field("title").value,
    category: category.value,
    description: field("description").value,
    tags,
  });
  completeness.textContent = missing.length
    ? `Brouillon enregistrable · avant publication, compléter : ${missing.join(", ")}.`
    : "Brouillon complet et publiable.";
};

const fillForm = (
  capture: PageCapture & { category?: string; tags?: string[] },
  allowProvisionalCategory = false,
): void => {
  field("url").value = capture.url;
  field("title").value = capture.title;
  field("description").value = capture.description;
  field("privateNote").value = capture.privateNote;
  if (
    allowProvisionalCategory &&
    capture.category &&
    ![...category.options].some((option) => option.value === capture.category)
  ) {
    const provisionalCategory = document.createElement("option");
    provisionalCategory.value = capture.category;
    provisionalCategory.textContent = capture.category;
    category.append(provisionalCategory);
  }
  category.value = capture.category ?? "";
  tags = capture.tags ?? [];
  renderTags();
  updateCompleteness();
};

const populateOptions = (options: CurationOptions): void => {
  const selectedCategory = category.value;
  const blankCategory = document.createElement("option");
  blankCategory.value = "";
  const categoryOptions = options.categories.map((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    return option;
  });
  category.replaceChildren(
    blankCategory,
    ...categoryOptions,
  );
  category.value = options.categories.includes(selectedCategory)
    ? selectedCategory
    : "";
  availableTagDefinitions =
    options.themes ??
    options.tags.map((name) => ({ name, description: "", aliases: [] }));
  renderTagSuggestions();
};

const fillDraftPreservingEdits = (draft: StoredDraft): void => {
  const mergedTags = [...addedTags, ...tags, ...draft.tags]
    .filter(
      (tag) => !removedTags.some((removedTag) => sameTag(removedTag, tag)),
    )
    .filter(
      (tag, index, candidates) =>
        candidates.findIndex((candidate) => sameTag(candidate, tag)) === index,
    );
  fillForm({
    url: touchedFields.has("url") ? field("url").value : draft.url,
    title: touchedFields.has("title") ? field("title").value : draft.title,
    description: touchedFields.has("description")
      ? field("description").value
      : draft.description,
    privateNote: touchedFields.has("privateNote")
      ? field("privateNote").value
      : draft.privateNote,
    category: touchedFields.has("category") ? category.value : draft.category,
    tags: touchedFields.has("tags")
      ? restoredTagsAuthoritative
        ? tags
        : mergedTags
      : draft.tags,
  });
};

const captureActivePage = async (): Promise<ActivePageCapture> => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || !isSupportedCaptureUrl(tab.url)) {
    throw new Error("PAGE_NOT_SUPPORTED");
  }
  const [result] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageMetadata,
  });
  const capture = result?.result;
  if (!capture || !isSupportedCaptureUrl(capture.url)) {
    throw new Error("PAGE_NOT_SUPPORTED");
  }
  let localPersistenceAllowed = true;
  try {
    canonicalLocalDraftUrl(tab.url);
  } catch {
    localPersistenceAllowed = false;
  }
  return { capture, pageUrl: tab.url, localPersistenceAllowed };
};

const bootstrapErrorMessage = (error: DigestApiError): string => {
  if (error.code === "REQUEST_TIMEOUT") {
    return "La vérification prend trop de temps.";
  }
  if (error.code === "NETWORK_UNAVAILABLE") {
    return "Réseau indisponible pour vérifier ce lien.";
  }
  if ((error.status ?? 0) >= 500) {
    return "Le service du Digest est temporairement indisponible.";
  }
  return "Impossible de vérifier ce lien.";
};

const tagErrorMessage = (error: unknown): string => {
  if (!(error instanceof DigestApiError)) return "L’opération sur le tag a échoué.";
  if (error.code === "INVALID_ORIGIN") {
    return "Ce profil Firefox n’est pas autorisé par le service du Digest.";
  }
  if (error.status === 401 || error.status === 403) {
    return "La session a expiré. Reconnectez-vous à l’administration.";
  }
  if (error.code === "UNKNOWN_TAG") {
    return "Ce tag n’existe plus dans le registre. Choisissez-en un autre.";
  }
  if (error.code === "TOO_MANY_THEMES") {
    return "Choisissez au maximum cinq tags.";
  }
  if (error.code === "THEME_RESERVED") {
    return "Ce nom appartient à un ancien tag. Réactivez-le ou renommez-le depuis l’administration.";
  }
  if (error.code === "INVALID_THEME_NAME" || error.code === "INVALID_THEME") {
    return "Saisissez un nom de tag valide.";
  }
  if (error.code === "NETWORK_UNAVAILABLE" || error.code === "REQUEST_TIMEOUT") {
    return "Réseau indisponible. La saisie est conservée pour réessayer.";
  }
  return "Le tag n’a pas pu être enregistré. Réessayez.";
};

const verifyCapture = async (verificationUrl: string): Promise<void> => {
  const verificationId = ++verificationSequence;
  if (!isSupportedCaptureUrl(verificationUrl)) {
    verifiedUrl = null;
    canSaveVerifiedDraft = false;
    saveButton.disabled = true;
    feedback.textContent =
      "Cette URL ne peut pas être publiée : utilisez une adresse web publique HTTP(S).";
    retryButton.hidden = true;
    return;
  }

  verifiedUrl = null;
  canSaveVerifiedDraft = false;
  saveButton.disabled = true;
  retryButton.hidden = true;
  feedback.textContent = "Vérification du lien…";

  try {
    const bootstrap = await api<BootstrapResponse>(
      `/api/admin/curation/bootstrap?url=${encodeURIComponent(verificationUrl)}`,
      {},
      9_000,
    );
    if (
      verificationId !== verificationSequence ||
      field("url").value.trim() !== verificationUrl
    ) return;
    populateOptions(bootstrap.options);
    if (bootstrap.draft) {
      fillDraftPreservingEdits(bootstrap.draft);
      verifiedUrl = field("url").value.trim();
      canSaveVerifiedDraft = true;
      updateSaveAvailability();
      feedback.textContent =
        tags.length > MAX_SELECTED_TAGS
          ? "La limite de cinq tags est dépassée · retirez-en un avant d’enregistrer."
          : "Ce brouillon existe déjà : le formulaire permet de le mettre à jour.";
      return;
    }
    if (bootstrap.published) {
      verifiedUrl = verificationUrl;
      canSaveVerifiedDraft = false;
      feedback.textContent = "Ce lien est déjà publié dans le Digest.";
      return;
    }
    updateCompleteness();
    verifiedUrl = verificationUrl;
    canSaveVerifiedDraft = true;
    updateSaveAvailability();
    feedback.textContent =
      tags.length > MAX_SELECTED_TAGS
        ? "La limite de cinq tags est dépassée · retirez-en un avant d’enregistrer."
        : "Lien vérifié · prêt à enregistrer.";
  } catch (error) {
    if (verificationId !== verificationSequence) return;
    if (
      error instanceof DigestApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      form.hidden = true;
      login.hidden = false;
      feedback.textContent = "";
      return;
    }
    feedback.textContent =
      error instanceof DigestApiError
        ? bootstrapErrorMessage(error)
        : "Impossible de vérifier ce lien.";
    retryButton.hidden = false;
  }
};

const initialize = async (): Promise<void> => {
  try {
    const { capture, pageUrl, localPersistenceAllowed } =
      await captureActivePage();
    capturedPageUrl = pageUrl;
    capturedPageText = capture.analysisText ?? "";
    localPersistenceEnabled = localPersistenceAllowed;
    fillForm(capture);
    form.hidden = false;
    void pruneExpiredLocalDrafts(browser.storage.local).catch(() => undefined);
    const localDraft = await loadLocalDraft(
      browser.storage.local,
      pageUrl,
    ).catch(() => null);
    if (localDraft) {
      const localTags = touchedFields.has("tags")
        ? [...addedTags, ...tags, ...localDraft.tags]
            .filter(
              (tag) =>
                !removedTags.some((removedTag) => sameTag(removedTag, tag)),
            )
            .filter(
              (tag, index, candidates) =>
                candidates.findIndex((candidate) => sameTag(candidate, tag)) ===
                index,
            )
        : localDraft.tags;
      fillForm(
        {
          url: touchedFields.has("url")
            ? field("url").value
            : localDraft.url,
          title: touchedFields.has("title")
            ? field("title").value
            : localDraft.title,
          description: touchedFields.has("description")
            ? field("description").value
            : localDraft.description,
          privateNote: touchedFields.has("privateNote")
            ? field("privateNote").value
            : localDraft.privateNote,
          category: touchedFields.has("category")
            ? category.value
            : localDraft.category,
          tags: localTags,
        },
        true,
      );
      addedTags = [...tags];
      restoredLocalDraftUrl = pageUrl;
      restoredTagsAuthoritative = true;
      discardLocalButton.hidden = false;
      (
        [
          "url",
          "title",
          "description",
          "privateNote",
          "category",
          "tags",
        ] as EditableField[]
      ).forEach((name) => touchedFields.add(name));
    }
    await verifyCapture(field("url").value.trim());
  } catch (error) {
    feedback.textContent =
      error instanceof Error && error.message === "PAGE_NOT_SUPPORTED"
        ? "Cette page ne peut pas être publiée : seules les pages web publiques HTTP(S) sont acceptées."
        : "Impossible de préparer la capture. Vérifiez votre connexion au Digest.";
  }
};

document.querySelector("#login-button")?.addEventListener("click", () => {
  void browser.tabs.create({ url: `${API_ORIGIN}/admin` });
});
retryButton.addEventListener("click", () => {
  void verifyCapture(field("url").value.trim());
});
discardLocalButton.addEventListener("click", () => {
  localPersistenceEnabled = false;
  localDraftDirty = false;
  if (localSaveTimer) clearTimeout(localSaveTimer);
  localSaveTimer = undefined;
  void clearSessionLocalDrafts().then(() => {
    discardLocalButton.hidden = true;
    feedback.textContent =
      "La saisie reste affichée, mais ne sera plus restaurée.";
  }).catch(() => {
    localPersistenceEnabled = true;
    feedback.textContent = "Impossible d’oublier la reprise locale.";
  });
});
window.addEventListener(
  "pagehide",
  () => {
    if (popupCloseTimer) clearTimeout(popupCloseTimer);
    popupCloseTimer = undefined;
    flushLocalDraftSave();
  },
  { once: true },
);
tagInput.addEventListener("keydown", (event) => {
  const items = [...knownTags.querySelectorAll<HTMLButtonElement>("button")];
  if (event.key === "Escape") {
    event.preventDefault();
    closeKnownTags();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!items.length) renderKnownTags();
    else setActiveTagOption(activeTagOption + (event.key === "ArrowDown" ? 1 : -1));
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const active = items[activeTagOption];
    if (active) active.click();
  }
});
tagInput.addEventListener("input", () => renderKnownTags());
tagInput.addEventListener("focus", () => renderKnownTags());
cancelCreateTag.addEventListener("click", () => {
  createTagConfirm.hidden = true;
  pendingTagName = "";
  tagInput.focus();
  renderKnownTags();
});
confirmCreateTag.addEventListener("click", async () => {
  if (!pendingTagName || creatingTag) return;
  creatingTag = true;
  confirmCreateTag.disabled = true;
  cancelCreateTag.disabled = true;
  updateSaveAvailability();
  feedback.textContent = "Création du tag…";
  try {
    const data = await api<{ theme: TagDefinition }>("/api/admin/themes", {
      method: "POST",
      body: JSON.stringify({
        name: pendingTagName,
        description: "",
        aliases: [],
        confirm: true,
      }),
    });
    const existingIndex = availableTagDefinitions.findIndex((definition) =>
      sameTag(definition.name, data.theme.name),
    );
    if (existingIndex >= 0) availableTagDefinitions[existingIndex] = data.theme;
    else availableTagDefinitions.push(data.theme);
    availableTagDefinitions.sort((left, right) =>
      left.name.localeCompare(right.name, "fr"),
    );
    creatingTag = false;
    addTag(data.theme.name);
    feedback.textContent = `Tag « ${data.theme.name} » créé et sélectionné.`;
  } catch (error) {
    feedback.textContent = tagErrorMessage(error);
    creatingTag = false;
  } finally {
    confirmCreateTag.disabled = false;
    cancelCreateTag.disabled = false;
    updateSaveAvailability();
  }
});
document.addEventListener("click", (event) => {
  if (!(event.target as Element).closest(".tag-combobox") &&
      !(event.target as Element).closest("#create-tag-confirm")) {
    closeKnownTags();
  }
});
form.addEventListener("input", (event) => {
  const name = (event.target as HTMLInputElement | HTMLTextAreaElement).name;
  if (
    name === "url" ||
    name === "title" ||
    name === "description" ||
    name === "privateNote" ||
    name === "category"
  ) {
    touchedFields.add(name);
  }
  if (name === "url") {
    verificationSequence += 1;
    verifiedUrl = null;
    canSaveVerifiedDraft = false;
    saveButton.disabled = true;
    feedback.textContent = "URL modifiée · vérifiez-la à nouveau.";
    retryButton.hidden = false;
  }
  updateCompleteness();
  if (name === "title" || name === "description") renderTagSuggestions();
  scheduleLocalDraftSave();
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (field("url").value.trim() !== verifiedUrl) {
    saveButton.disabled = true;
    feedback.textContent = "Vérifiez cette URL avant de l’enregistrer.";
    retryButton.hidden = false;
    return;
  }
  if (tags.length > MAX_SELECTED_TAGS) {
    saveButton.disabled = true;
    feedback.textContent =
      "Retirez un tag avant d’enregistrer : la limite est de cinq.";
    return;
  }
  saveButton.disabled = true;
  feedback.textContent = "Enregistrement…";
  try {
    const data = await api<{ existing: boolean }>(
      "/api/admin/curation/drafts",
      {
        method: "POST",
        body: JSON.stringify({
          url: field("url").value.trim(),
          title: field("title").value,
          category: category.value,
          description: field("description").value,
          tags,
          privateNote: field("privateNote").value,
          confirm: true,
        }),
      },
    );
    localPersistenceEnabled = false;
    localDraftDirty = false;
    restoredTagsAuthoritative = false;
    discardLocalButton.hidden = true;
    if (localSaveTimer) clearTimeout(localSaveTimer);
    localSaveTimer = undefined;
    try {
      await clearSessionLocalDrafts();
    } catch {
      discardLocalButton.hidden = false;
      feedback.textContent =
        "Brouillon enregistré, mais sa reprise locale n’a pas pu être effacée. Utilisez « Oublier la reprise locale » pour réessayer.";
      return;
    }
    discardLocalButton.hidden = true;
    feedback.textContent = data.existing
      ? "Brouillon mis à jour."
      : "Brouillon ajouté à la file.";
    popupCloseTimer = setTimeout(() => window.close(), 900);
  } catch (error) {
    const message = error instanceof Error ? error.message : "REQUEST_FAILED";
    feedback.textContent = message === "ALREADY_PUBLISHED"
      ? "Ce lien est déjà publié dans le Digest."
      : error instanceof DigestApiError
        ? tagErrorMessage(error)
        : "L’enregistrement du brouillon a échoué. Réessayez.";
    saveButton.disabled = false;
  }
});

void initialize();
