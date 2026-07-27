// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  LOCAL_DRAFT_TTL_MS,
  localDraftStorageKey,
} from "../lib/local-draft";

const browserMock = vi.hoisted(() => ({
  scripting: {
    executeScript: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
  tabs: {
    create: vi.fn(),
    query: vi.fn(),
  },
}));

vi.mock("wxt/browser", () => ({ browser: browserMock }));

const popupHtml = readFileSync(
  resolve(process.cwd(), "entrypoints/popup/index.html"),
  "utf8",
);

const capture = {
  url: "https://example.com/article",
  title: "Titre capturé",
  description: "Résumé capturé",
  privateNote: "",
};

const options = {
  categories: ["Design", "Développement"],
  tags: ["design", "outil"],
};

const bootstrap = (overrides: Record<string, unknown> = {}) => ({
  options,
  draft: null,
  published: null,
  ...overrides,
});

const response = (body: unknown, status = 200): Response =>
  Response.json(body, { status });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const element = <T extends HTMLElement>(selector: string): T => {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Élément introuvable : ${selector}`);
  return match;
};

const input = (name: string): HTMLInputElement | HTMLTextAreaElement =>
  element(`[name="${name}"]`);

const loadPopup = async (): Promise<void> => {
  await import("../entrypoints/popup/main");
};

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(window, "close").mockImplementation(() => undefined);
  document.documentElement.innerHTML = new DOMParser().parseFromString(
    popupHtml,
    "text/html",
  ).documentElement.innerHTML;
  browserMock.tabs.query.mockResolvedValue([
    { id: 7, url: capture.url },
  ]);
  browserMock.scripting.executeScript.mockResolvedValue([
    { result: capture },
  ]);
  browserMock.storage.local.get.mockResolvedValue({});
  browserMock.storage.local.set.mockResolvedValue(undefined);
  browserMock.storage.local.remove.mockResolvedValue(undefined);
  browserMock.tabs.create.mockResolvedValue(undefined);
});

afterEach(() => {
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("états asynchrones du popup", () => {
  test("affiche immédiatement la capture locale pendant la vérification", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));

    await loadPopup();

    await vi.waitFor(() => {
      expect(element<HTMLFormElement>("#capture-form").hidden).toBe(false);
      expect(input("title").value).toBe("Titre capturé");
      expect(element("#feedback").textContent).toBe("Vérification du lien…");
      expect(element<HTMLButtonElement>("#save").disabled).toBe(true);
    });
  });

  test("autorise l’enregistrement quand le lien est disponible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(bootstrap())),
    );

    await loadPopup();

    await vi.waitFor(() => {
      expect(element("#feedback").textContent).toBe(
        "Lien vérifié · prêt à enregistrer.",
      );
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
    });
  });

  test("garde l’enregistrement désactivé pour un lien déjà publié", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(bootstrap({ published: { id: "link-1", title: "Publié" } })),
      ),
    );

    await loadPopup();

    await vi.waitFor(() => {
      expect(element("#feedback").textContent).toBe(
        "Ce lien est déjà publié dans le Digest.",
      );
      expect(element<HTMLButtonElement>("#save").disabled).toBe(true);
    });
  });

  test("reprend un brouillon existant et permet sa mise à jour", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response(
          bootstrap({
            draft: {
              url: "https://example.com/article",
              title: "Titre éditorial",
              category: "Design",
              description: "Résumé éditorial",
              tags: ["design"],
              privateNote: "À relire",
            },
          }),
        ),
      ),
    );

    await loadPopup();

    await vi.waitFor(() => {
      expect(input("title").value).toBe("Titre éditorial");
      expect(element<HTMLSelectElement>("#category").value).toBe("Design");
      expect(element("#selected-tags").textContent).toContain("design");
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
    });
  });

  test.each([401, 403])(
    "affiche la connexion et interdit l’enregistrement après une réponse %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          response({ error: "AUTHENTICATION_REQUIRED" }, status),
        ),
      );

      await loadPopup();

      await vi.waitFor(() => {
        expect(element<HTMLFormElement>("#capture-form").hidden).toBe(true);
        expect(element("#login").hidden).toBe(false);
        expect(element<HTMLButtonElement>("#save").disabled).toBe(true);
      });
    },
  );

  test("présente une relance après une erreur réseau", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await loadPopup();

    await vi.waitFor(() => {
      expect(element("#feedback").textContent).toBe(
        "Réseau indisponible pour vérifier ce lien.",
      );
      expect(element<HTMLButtonElement>("#retry").hidden).toBe(false);
      expect(element<HTMLButtonElement>("#save").disabled).toBe(true);
    });
  });

  test("présente une relance lorsque la vérification expire", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      ),
    );

    await loadPopup();
    await vi.advanceTimersByTimeAsync(9_000);

    expect(element("#feedback").textContent).toBe(
      "La vérification prend trop de temps.",
    );
    expect(element<HTMLButtonElement>("#retry").hidden).toBe(false);
    expect(element<HTMLButtonElement>("#save").disabled).toBe(true);
  });

  test("réussit après une relance sans perdre les saisies locales", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(
        response(
          bootstrap({
            draft: {
              url: capture.url,
              title: "Titre distant",
              category: "Design",
              description: "Résumé distant",
              tags: ["design"],
              privateNote: "Note distante",
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await loadPopup();
    await vi.waitFor(() => {
      expect(element<HTMLButtonElement>("#retry").hidden).toBe(false);
    });

    input("title").value = "Titre saisi localement";
    input("title").dispatchEvent(new Event("input", { bubbles: true }));
    element<HTMLButtonElement>("#retry").click();

    await vi.waitFor(() => {
      expect(input("title").value).toBe("Titre saisi localement");
      expect(input("description").value).toBe("Résumé distant");
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  test("préserve une saisie arrivée avant une réponse distante tardive", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));

    await loadPopup();
    await vi.waitFor(() => {
      expect(input("title").value).toBe("Titre capturé");
    });

    input("title").value = "Titre modifié pendant l’attente";
    input("title").dispatchEvent(new Event("input", { bubbles: true }));
    pending.resolve(
      response(
        bootstrap({
          draft: {
            url: capture.url,
            title: "Titre distant",
            category: "Design",
            description: "Résumé distant",
            tags: ["design"],
            privateNote: "",
          },
        }),
      ),
    );

    await vi.waitFor(() => {
      expect(input("title").value).toBe("Titre modifié pendant l’attente");
      expect(input("description").value).toBe("Résumé distant");
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
    });
  });

  test("restaure une saisie locale récente avant la réponse distante", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const key = localDraftStorageKey(capture.url);
    browserMock.storage.local.get.mockImplementation(async () => ({
      [key]: {
        version: 1,
        url: capture.url,
        savedAt: Date.now(),
        expiresAt: Date.now() + LOCAL_DRAFT_TTL_MS,
        fields: {
          title: "Titre local restauré",
          category: "Design",
          description: "Résumé local restauré",
          tags: ["design"],
          privateNote: "Note privée locale",
        },
      },
    }));

    await loadPopup();

    await vi.waitFor(() => {
      expect(input("title").value).toBe("Titre local restauré");
      expect(input("privateNote").value).toBe("Note privée locale");
      expect(element<HTMLSelectElement>("#category").value).toBe("Design");
      expect(element("#selected-tags").textContent).toContain("design");
      expect(
        element<HTMLButtonElement>("#discard-local").hidden,
      ).toBe(false);
    });

    pending.resolve(
      response(
        bootstrap({
          draft: {
            url: capture.url,
            title: "Titre distant",
            category: "Développement",
            description: "Résumé distant",
            tags: ["outil"],
            privateNote: "Note distante",
          },
        }),
      ),
    );
    await vi.waitFor(() => {
      expect(input("title").value).toBe("Titre local restauré");
      expect(element<HTMLSelectElement>("#category").value).toBe("Design");
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
      expect(element("#selected-tags").textContent).not.toContain("outil");
    });

    input("url").value = "https://example.com/autre";
    input("url").dispatchEvent(new Event("input", { bubbles: true }));
    element<HTMLButtonElement>("#discard-local").click();
    await vi.waitFor(() => {
      expect(browserMock.storage.local.remove).toHaveBeenCalledWith(key);
      expect(browserMock.storage.local.remove).toHaveBeenCalledWith(
        localDraftStorageKey("https://example.com/autre"),
      );
      expect(element("#feedback").textContent).toBe(
        "La saisie reste affichée, mais ne sera plus restaurée.",
      );
    });
  });

  test("retire la catégorie locale si elle n’existe plus dans la taxonomie", async () => {
    const key = localDraftStorageKey(capture.url);
    browserMock.storage.local.get.mockImplementation(async () => ({
      [key]: {
        version: 1,
        url: capture.url,
        savedAt: Date.now(),
        expiresAt: Date.now() + LOCAL_DRAFT_TTL_MS,
        fields: {
          title: "Titre local",
          category: "Catégorie disparue",
          description: "Résumé local",
          tags: ["design"],
          privateNote: "",
        },
      },
    }));
    vi.stubGlobal("fetch", vi.fn(async () => response(bootstrap())));

    await loadPopup();

    await vi.waitFor(() => {
      expect(element<HTMLSelectElement>("#category").value).toBe("");
      expect(
        [...element<HTMLSelectElement>("#category").options].map(
          (option) => option.value,
        ),
      ).not.toContain("Catégorie disparue");
    });
  });

  test("force la dernière sauvegarde locale lorsque le popup se ferme", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(bootstrap())));
    await loadPopup();
    await vi.waitFor(() => {
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
    });

    input("title").value = "Dernière correction";
    input("title").dispatchEvent(new Event("input", { bubbles: true }));
    window.dispatchEvent(new PageTransitionEvent("pagehide"));

    await vi.waitFor(() => {
      expect(browserMock.storage.local.set).toHaveBeenCalledWith({
        [localDraftStorageKey(capture.url)]: expect.objectContaining({
          fields: expect.objectContaining({ title: "Dernière correction" }),
        }),
      });
    });
  });

  test("supprime la sauvegarde locale après un enregistrement réussi", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(bootstrap()))
        .mockResolvedValueOnce(response({ existing: false })),
    );
    await loadPopup();
    await vi.waitFor(() => {
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
    });

    element<HTMLFormElement>("#capture-form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(browserMock.storage.local.remove).toHaveBeenCalledWith(
        localDraftStorageKey(capture.url),
      );
      expect(element("#feedback").textContent).toBe(
        "Brouillon ajouté à la file.",
      );
    });

    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    expect(browserMock.storage.local.set).not.toHaveBeenCalled();
  });

  test("nettoie toutes les URL sauvegardées pendant la session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
        response(init?.method === "POST" ? { existing: false } : bootstrap()),
      ),
    );
    await loadPopup();
    await vi.waitFor(() => {
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
    });

    input("title").value = "Correction locale";
    input("title").dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));

    input("url").value = "https://example.com/intermediaire";
    input("url").dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));

    input("url").value = capture.url;
    input("url").dispatchEvent(new Event("input", { bubbles: true }));
    element<HTMLButtonElement>("#retry").click();
    await vi.waitFor(() => {
      expect(element<HTMLButtonElement>("#save").disabled).toBe(false);
    });
    element<HTMLFormElement>("#capture-form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(browserMock.storage.local.remove).toHaveBeenCalledWith(
        localDraftStorageKey(capture.url),
      );
      expect(browserMock.storage.local.remove).toHaveBeenCalledWith(
        localDraftStorageKey("https://example.com/intermediaire"),
      );
      expect(element("#feedback").textContent).toBe(
        "Brouillon ajouté à la file.",
      );
    });
  });
});
