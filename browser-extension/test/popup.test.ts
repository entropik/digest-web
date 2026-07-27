// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  scripting: {
    executeScript: vi.fn(),
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
  browserMock.tabs.create.mockResolvedValue(undefined);
});

afterEach(() => {
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
});
