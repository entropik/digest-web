import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import {
  adminCss,
  adminJs,
  dashboardPage,
} from "../dist/src/admin-assets.js";

const popupHtml = readFileSync(
  new URL("../../browser-extension/entrypoints/popup/index.html", import.meta.url),
  "utf8",
)
  .replace("./style.css", "/popup-style.css")
  .replace("<section id=\"login\" hidden>", "<section id=\"login\" hidden>")
  .replace("<form id=\"capture-form\" hidden>", "<form id=\"capture-form\">")
  .replace(/<script[\s\S]*?<\/script>/, "");
const popupCss = readFileSync(
  new URL("../../browser-extension/entrypoints/popup/style.css", import.meta.url),
  "utf8",
);
const themeDefinitions = JSON.parse(
  readFileSync(new URL("../../data/tags.json", import.meta.url), "utf8"),
);

const sampleDrafts = [
  {
    id: "draft-complete",
    url: "https://example.com/article",
    title: "Un article prêt à publier",
    category: "Développement",
    description: "Un résumé éditorial court pour vérifier la mise en page.",
    tags: ["web", "outils"],
    privateNote: "Une note privée issue de la sélection.",
    state: "draft",
  },
  {
    id: "draft-incomplete",
    url: "https://example.org/project",
    title: "Un brouillon incomplet",
    category: "",
    description: "",
    tags: [],
    privateNote: "",
    state: "draft",
  },
];

let publicationStep = 0;
let publicationAction = "publish";
const publicationStates = ["validating", "deploying", "live"];
const samplePublication = () => {
  const state = publicationStates[Math.min(publicationStep, publicationStates.length - 1)];
  return {
    id: "publication",
    digestDate: "2026-08-16",
    title: "16 août 2026",
    action: publicationAction,
    source: "edition",
    state,
    commitSha: "0123456789abcdef",
    validateUrl: "https://github.com/example/digest/actions/runs/1",
    deployUrl:
      state === "deploying" || state === "live"
        ? "https://github.com/example/digest/actions/runs/2"
        : null,
    errorCode: null,
    createdAt: "2026-08-16T10:00:00.000Z",
  };
};

const json = (response, value) => {
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4179");
  if (url.pathname === "/popup") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(popupHtml);
    return;
  }
  if (url.pathname === "/popup-style.css") {
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end(popupCss);
    return;
  }
  if (url.pathname === "/admin/style.css") {
    response.writeHead(200, { "Content-Type": "text/css" });
    response.end(adminCss);
    return;
  }
  if (url.pathname === "/admin/app.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" });
    response.end(adminJs);
    return;
  }
  if (url.pathname === "/api/admin/curation/options") {
    json(response, {
      categories: [
        "Développement",
        "Design & Création",
        "IA & Agents",
        "Médias & Veille",
        "Mémoire du web social",
      ],
      tags: themeDefinitions.map((theme) => theme.name),
      themes: themeDefinitions,
    });
    return;
  }
  if (url.pathname === "/api/admin/curation/drafts") {
    json(response, { drafts: sampleDrafts });
    return;
  }
  if (url.pathname === "/api/admin/categories") {
    json(response, {
      categories: [
        { name: "Développement", description: "Code, outils et cultures techniques.", linkCount: 1240, draftCount: 1 },
        { name: "Design & Création", description: "Design graphique, édition et pratiques créatives.", linkCount: 1768, draftCount: 0 },
        { name: "IA & Agents", description: "Intelligence artificielle et systèmes agentiques.", linkCount: 612, draftCount: 0 },
        { name: "Médias & Veille", description: "Médias, analyses et signaux contemporains.", linkCount: 498, draftCount: 0 },
        { name: "Mémoire du web social", description: "Traces et histoires des plateformes sociales.", linkCount: 27, draftCount: 0 },
        { name: "Krisis", description: "Séparation, discernement, jugement et décision.", linkCount: 0, draftCount: 0 },
      ],
    });
    return;
  }
  if (url.pathname === "/api/admin/themes") {
    json(response, {
      themes: [
        ...themeDefinitions.map((theme, index) => ({
          ...theme,
          active: true,
          linkCount: Math.max(0, 41 - index),
          draftCount: index < 2 ? 1 : 0,
        })),
        {
          name: "Memory",
          description: "",
          aliases: [],
          active: true,
          linkCount: 0,
          draftCount: 1,
        },
        {
          name: "tag-archivé",
          description: "Ancienne définition conservée pour mémoire.",
          aliases: ["ancien tag"],
          active: false,
          linkCount: 3,
          draftCount: 0,
        },
      ],
    });
    return;
  }
  if (
    url.pathname === "/api/admin/curation/publications" &&
    request.method === "POST"
  ) {
    publicationStep = 0;
    json(response, { publication: samplePublication() });
    return;
  }
  if (url.pathname === "/api/admin/curation/publications") {
    json(response, { publications: [samplePublication()] });
    return;
  }
  if (url.pathname === "/api/admin/curation/publications/publication") {
    publicationStep = Math.min(publicationStep + 1, publicationStates.length - 1);
    json(response, { publication: samplePublication() });
    return;
  }
  if (
    /^\/api\/admin\/editions\/\d{4}-\d{2}-\d{2}\/(publish|unpublish)$/.test(
      url.pathname,
    ) && request.method === "POST"
  ) {
    publicationStep = 0;
    publicationAction = url.pathname.endsWith("/unpublish")
      ? "unpublish"
      : "publish";
    json(response, { publication: samplePublication() });
    return;
  }
  if (url.pathname === "/api/admin/editions" && url.searchParams.has("date")) {
    const draft = url.searchParams.get("date") === "2026-08-29";
    json(response, {
      edition: {
        digestDate: url.searchParams.get("date"),
        title: draft ? "Après l’IDE, voici l’ADE" : "Une édition publiée",
        description: "Une description éditoriale pour vérifier le cycle de vie.",
        introduction: "Une introduction administrable conservée avec son état.",
        ...(draft ? { draft: true } : {}),
        state: draft ? "draft" : "published",
        linkCount: draft ? 7 : 20,
        visibleLinkCount: draft ? 0 : 20,
        stagedLinkCount: draft ? 7 : 0,
      },
    });
    return;
  }
  if (url.pathname === "/api/admin/editions") {
    json(response, {
      editions: [
        { date: "2026-08-29", state: "draft", linkCount: 7, visibleLinkCount: 0, stagedLinkCount: 7 },
        { date: "2026-08-28", state: "published", linkCount: 20, visibleLinkCount: 20, stagedLinkCount: 0 },
      ],
    });
    return;
  }
  if (url.pathname === "/api/admin/links/hidden") {
    json(response, { links: [] });
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(dashboardPage("Marc"));
}).listen(4179, "127.0.0.1", () => {
  console.log("Admin preview: http://127.0.0.1:4179/admin");
});
