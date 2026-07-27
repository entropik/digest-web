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
      tags: ["IA", "outils", "web"],
    });
    return;
  }
  if (url.pathname === "/api/admin/curation/drafts") {
    json(response, { drafts: sampleDrafts });
    return;
  }
  if (url.pathname === "/api/admin/curation/publications") {
    json(response, {
      publications: [
        {
          id: "publication",
          digestDate: "2026-07-27",
          title: "27 juillet 2026",
          state: "deploying",
          commitSha: "0123456789abcdef",
        },
      ],
    });
    return;
  }
  if (url.pathname === "/api/admin/editions") {
    json(response, { editions: ["2026-07-24", "2022-04-14"] });
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
