import { browser } from "wxt/browser";
import {
  extractPageMetadata,
  isSupportedCaptureUrl,
  missingEditorialFields,
  type PageCapture
} from "../../lib/capture";

const API_ORIGIN = "https://digest.ooblik.com";
const form = document.querySelector<HTMLFormElement>("#capture-form")!;
const login = document.querySelector<HTMLElement>("#login")!;
const feedback = document.querySelector<HTMLElement>("#feedback")!;
const completeness = document.querySelector<HTMLElement>("#completeness")!;
const tagInput = document.querySelector<HTMLInputElement>("#tag-input")!;
const selectedTags = document.querySelector<HTMLElement>("#selected-tags")!;
const knownTags = document.querySelector<HTMLDataListElement>("#known-tags")!;
const category = document.querySelector<HTMLSelectElement>("#category")!;
const saveButton = document.querySelector<HTMLButtonElement>("#save")!;
let tags: string[] = [];

type ApiError = Error & { status?: number };
type CurationOptions = { categories: string[]; tags: string[] };
type StoredDraft = PageCapture & {
  category: string;
  tags: string[];
  privateNote: string;
};
type BootstrapResponse = {
  options: CurationOptions;
  draft: StoredDraft | null;
  published: { id?: string; title?: string } | null;
};

const api = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<T> => {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    const error = new Error(data.error || "REQUEST_FAILED") as ApiError;
    Object.assign(error, { data, status: response.status });
    throw error;
  }
  return data;
};

const field = (name: string): HTMLInputElement | HTMLTextAreaElement =>
  form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement;

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
        tags = tags.filter((candidate) => candidate !== tag);
        renderTags();
        updateCompleteness();
      });
      chip.append(remove);
      return chip;
    }),
  );
};

const addTag = (): void => {
  const value = tagInput.value.trim().replace(/^#+/, "").slice(0, 80);
  if (!value) return;
  const alreadySelected = tags.some(
    (tag) => tag.localeCompare(value, "fr", { sensitivity: "base" }) === 0,
  );
  if (!alreadySelected && tags.length >= 12) {
    feedback.textContent = "Maximum de 12 tags par lien.";
    return;
  }
  if (!alreadySelected) tags.push(value);
  tagInput.value = "";
  feedback.textContent = "";
  renderTags();
  updateCompleteness();
};

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
): void => {
  field("url").value = capture.url;
  field("title").value = capture.title;
  field("description").value = capture.description;
  field("privateNote").value = capture.privateNote;
  category.value = capture.category ?? "";
  tags = capture.tags ?? [];
  renderTags();
  updateCompleteness();
};

const populateOptions = (options: CurationOptions): void => {
  const blankCategory = document.createElement("option");
  blankCategory.value = "";
  category.replaceChildren(
    blankCategory,
    ...options.categories.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      return option;
    }),
  );
  knownTags.replaceChildren(
    ...options.tags.map((value) => {
      const option = document.createElement("option");
      option.value = value;
      return option;
    }),
  );
};

const captureActivePage = async (): Promise<PageCapture> => {
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
  return capture;
};

const initialize = async (): Promise<void> => {
  try {
    const capture = await captureActivePage();
    fillForm(capture);
    form.hidden = false;
    feedback.textContent = "Vérification du lien…";

    const bootstrap = await api<BootstrapResponse>(
      `/api/admin/curation/bootstrap?url=${encodeURIComponent(capture.url)}`,
    );
    populateOptions(bootstrap.options);
    if (bootstrap.draft) {
      fillForm(bootstrap.draft);
      feedback.textContent = "Ce brouillon existe déjà : le formulaire permet de le mettre à jour.";
      saveButton.disabled = false;
      return;
    }
    if (bootstrap.published) {
      feedback.textContent = "Ce lien est déjà publié dans le Digest.";
      return;
    }
    updateCompleteness();
    saveButton.disabled = false;
    feedback.textContent = "Lien vérifié · prêt à enregistrer.";
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.status === 401 || apiError.status === 403) {
      form.hidden = true;
      login.hidden = false;
      feedback.textContent = "";
      return;
    }
    feedback.textContent =
      error instanceof Error && error.message === "PAGE_NOT_SUPPORTED"
        ? "Cette page ne peut pas être publiée : seules les pages web publiques HTTP(S) sont acceptées."
        : "Impossible de préparer la capture. Vérifiez votre connexion au Digest.";
  }
};

document.querySelector("#login-button")?.addEventListener("click", () => {
  void browser.tabs.create({ url: `${API_ORIGIN}/admin` });
});
document.querySelector("#add-tag")?.addEventListener("click", addTag);
tagInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addTag();
  }
});
form.addEventListener("input", updateCompleteness);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  feedback.textContent = "Enregistrement…";
  try {
    const data = await api<{ existing: boolean }>(
      "/api/admin/curation/drafts",
      {
        method: "POST",
        body: JSON.stringify({
          url: field("url").value,
          title: field("title").value,
          category: category.value,
          description: field("description").value,
          tags,
          privateNote: field("privateNote").value,
          confirm: true,
        }),
      },
    );
    feedback.textContent = data.existing
      ? "Brouillon mis à jour."
      : "Brouillon ajouté à la file.";
    setTimeout(() => window.close(), 900);
  } catch (error) {
    const message = error instanceof Error ? error.message : "REQUEST_FAILED";
    feedback.textContent =
      message === "ALREADY_PUBLISHED"
        ? "Ce lien est déjà publié dans le Digest."
        : `Enregistrement impossible : ${message}`;
    saveButton.disabled = false;
  }
});

void initialize();
