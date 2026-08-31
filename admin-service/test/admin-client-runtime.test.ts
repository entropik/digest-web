import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Window } from "happy-dom";

import { adminJs, dashboardPage } from "../src/admin-assets.js";

type JsonReply = {
  body: Record<string, unknown>;
  status?: number;
};

type ClientHarnessOptions = {
  initialPublications?: Array<Record<string, unknown>>;
  publicationPost?: () => JsonReply | Promise<JsonReply>;
  publicationPoll?: () => JsonReply | Promise<JsonReply>;
};

type TestButton = {
  dataset: Record<string, string>;
  disabled: boolean;
};

const draft = {
  id: "draft-1",
  url: "https://example.com/article",
  title: "Article prêt",
  category: "Développement",
  description: "Une description complète.",
  tags: [],
  privateNote: "",
};

const flush = async (turns = 12): Promise<void> => {
  for (let index = 0; index < turns; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
};

const createHarness = async (options: ClientHarnessOptions = {}) => {
  const window = new Window({ url: "https://digest.ooblik.com/admin" });
  window.document.write(dashboardPage("Marc"));

  const calls: Array<{ method: string; path: string }> = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let publications = [...(options.initialPublications ?? [])];

  window.setTimeout = ((callback: () => void) => {
    timerId += 1;
    timers.set(timerId, callback);
    return timerId;
  }) as unknown as typeof window.setTimeout;
  window.clearTimeout = ((id: number) => {
    timers.delete(id);
  }) as unknown as typeof window.clearTimeout;

  window.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input), window.location.href);
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname });

    let reply: JsonReply;
    if (
      url.pathname === "/api/admin/curation/publications" &&
      method === "POST"
    ) {
      reply = options.publicationPost
        ? await options.publicationPost()
        : {
            body: {
              publication: {
                id: "publication-1",
                digestDate: "2026-08-28",
                title: "Digest test",
                state: "validating",
              },
            },
          };
    } else if (
      url.pathname.startsWith("/api/admin/curation/publications/") &&
      method === "GET"
    ) {
      reply = options.publicationPoll
        ? await options.publicationPoll()
        : { body: { publication: publications[0] } };
    } else if (
      url.pathname === "/api/admin/curation/publications" &&
      method === "GET"
    ) {
      reply = { body: { publications } };
    } else if (url.pathname === "/api/admin/curation/options") {
      reply = {
        body: {
          categories: ["Développement"],
          tags: [],
          themes: [],
        },
      };
    } else if (url.pathname === "/api/admin/curation/drafts") {
      reply = { body: { drafts: [draft] } };
    } else if (url.pathname === "/api/admin/editions") {
      reply = { body: { editions: [] } };
    } else if (url.pathname === "/api/admin/categories") {
      reply = { body: { categories: [] } };
    } else if (url.pathname === "/api/admin/themes") {
      reply = { body: { themes: [] } };
    } else if (url.pathname === "/api/admin/links/hidden") {
      reply = { body: { links: [] } };
    } else if (url.pathname === "/api/admin/linkedin/status") {
      reply = { body: { configured: false, connected: false } };
    } else {
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    }

    const status = reply.status ?? 200;
    return {
      status,
      ok: status >= 200 && status < 300,
      json: async () => reply.body,
    } as unknown as Awaited<ReturnType<typeof window.fetch>>;
  }) as unknown as typeof window.fetch;

  window.eval(adminJs);
  await flush();

  const selectDraft = () => {
    const checkbox = window.document.querySelector(".draft-select") as unknown as
      | { click(): void }
      | null;
    assert.ok(checkbox);
    checkbox.click();
  };

  const submitPublication = () => {
    const form = window.document.querySelector("#publication-form") as unknown as
      | { dispatchEvent(event: unknown): boolean }
      | null;
    const button = window.document.querySelector(
      "#submit-publication",
    ) as unknown as TestButton | null;
    assert.ok(form);
    assert.ok(button);
    form.dispatchEvent(
      new window.SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );
  };

  return {
    calls,
    document: window.document,
    flush,
    selectDraft,
    submitPublication,
    timers,
    setPublications: (items: Array<Record<string, unknown>>) => {
      publications = items;
    },
    window,
  };
};

test("the shipped admin client has valid JavaScript syntax", () => {
  assert.doesNotThrow(() => Function(adminJs));
});

test("the admin bundle normalizes dynamic feedback without a public asset request", async () => {
  const harness = await createHarness();
  try {
    const feedback = harness.document.querySelector("#admin-feedback")!;
    feedback.textContent = "Publication : prête !";
    await harness.flush();
    assert.equal(feedback.textContent, "Publication\u00a0: prête\u00a0!");
    assert.equal(harness.document.querySelector('script[src^="/js/"]'), null);
  } finally {
    await harness.window.happyDOM.close();
  }
});

test("the admin client route remains compatible with the self-only CSP", async () => {
  const server = await readFile(
    new URL("../src/server.ts", import.meta.url),
    "utf8",
  );

  assert.match(server, /script-src 'self'/);
  assert.match(
    server,
    /app\.get\("\/admin\/app\.js",[\s\S]*?context\.body\(adminJs, 200/,
  );
  assert.match(server, /"Content-Type": "application\/javascript; charset=utf-8"/);
});

test("publication submission is single-flight and transitions the real DOM", async () => {
  let resolvePost!: (reply: JsonReply) => void;
  const pendingPost = new Promise<JsonReply>((resolve) => {
    resolvePost = resolve;
  });
  const harness = await createHarness({
    publicationPost: () => pendingPost,
  });

  harness.selectDraft();
  harness.submitPublication();
  harness.submitPublication();
  await harness.flush();

  assert.equal(
    harness.calls.filter(
      (call) =>
        call.method === "POST" &&
        call.path === "/api/admin/curation/publications",
    ).length,
    1,
  );
  assert.equal(
    (
      harness.document.querySelector(
        "#submit-publication",
      ) as unknown as TestButton | null
    )?.dataset.busy,
    "true",
  );

  resolvePost({
    body: {
      publication: {
        id: "publication-1",
        digestDate: "2026-08-28",
        title: "Digest test",
        state: "validating",
      },
    },
  });
  await harness.flush();

  assert.match(
    harness.document.querySelector("#admin-feedback")?.textContent ?? "",
    /Validation GitHub en cours/,
  );
  assert.ok(
    harness.document
      .querySelector('[data-panel="publications"]')
      ?.classList.contains("is-active"),
  );
  assert.equal(
    harness.document.querySelector("#selected-count")?.textContent,
    "0",
  );
});

for (const status of [422, 503]) {
  test(`publication HTTP ${status} restores controls and renders the failure`, async () => {
    const harness = await createHarness({
      publicationPost: () => ({
        status,
        body: { error: status === 422 ? "INVALID_PUBLICATION" : "UPSTREAM" },
      }),
    });

    harness.selectDraft();
    harness.submitPublication();
    await harness.flush();

    const button = harness.document.querySelector(
      "#submit-publication",
    ) as unknown as TestButton | null;
    assert.equal(button?.dataset.busy, "false");
    assert.equal(button?.disabled, false);
    assert.match(
      harness.document.querySelector("#publication-submit-status")
        ?.textContent ?? "",
      /Publication impossible/,
    );
  });
}

test("failed publication polling schedules one retry and recovers the DOM", async () => {
  const active = {
    id: "publication-active",
    digestDate: "2026-08-28",
    title: "Digest actif",
    state: "validating",
    createdAt: "2026-08-28T10:00:00Z",
  };
  const live = { ...active, state: "live" };
  let attempts = 0;
  const harness = await createHarness({
    initialPublications: [active],
    publicationPoll: () => {
      attempts += 1;
      return attempts === 1
        ? { status: 503, body: { error: "UPSTREAM" } }
        : { body: { publication: live } };
    },
  });

  assert.match(
    harness.document.querySelector("#admin-feedback")?.textContent ?? "",
    /Nouvelle tentative automatique/,
  );
  assert.equal(harness.timers.size, 1);

  harness.setPublications([live]);
  const retry = [...harness.timers.values()][0];
  assert.ok(retry);
  retry();
  await harness.flush();

  assert.equal(attempts, 2);
  assert.match(
    harness.document.querySelector("#admin-feedback")?.textContent ?? "",
    /Digest est en ligne/,
  );
  assert.match(
    harness.document.querySelector("#publication-list")?.textContent ?? "",
    /En ligne/,
  );
});
