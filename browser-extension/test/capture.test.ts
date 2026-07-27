// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import {
  extractPageMetadata,
  isSupportedCaptureUrl,
  missingEditorialFields,
} from "../lib/capture";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

describe("page capture", () => {
  test("extracts canonical URL, metadata and the selected private note", () => {
    document.title = "Titre document";
    document.head.innerHTML +=
      '<link rel="canonical" href="https://example.com/article">' +
      '<meta name="description" content="Résumé de la page">' +
      '<meta property="og:title" content="Titre social">';
    document.body.innerHTML = "<p>Extrait privé utile</p>";
    const range = document.createRange();
    range.selectNodeContents(document.querySelector("p")!);
    window.getSelection()?.addRange(range);

    expect(extractPageMetadata()).toEqual({
      url: "https://example.com/article",
      title: "Titre social",
      description: "Résumé de la page",
      privateNote: "Extrait privé utile",
    });
  });

  test("rejects browser, local and credentialed URLs", () => {
    expect(isSupportedCaptureUrl("chrome://settings")).toBe(false);
    expect(isSupportedCaptureUrl("http://localhost/report")).toBe(false);
    expect(isSupportedCaptureUrl("http://app.localhost/report")).toBe(false);
    expect(isSupportedCaptureUrl("http://app.localhost./report")).toBe(false);
    expect(isSupportedCaptureUrl("http://100.64.0.1/report")).toBe(false);
    expect(isSupportedCaptureUrl("http://224.0.0.1/report")).toBe(false);
    expect(isSupportedCaptureUrl("http://[::]/report")).toBe(false);
    expect(
      isSupportedCaptureUrl("http://[::ffff:127.0.0.1]/report"),
    ).toBe(false);
    expect(
      isSupportedCaptureUrl("http://[::ffff:192.168.1.1]/report"),
    ).toBe(false);
    expect(isSupportedCaptureUrl("http://[::1]/report")).toBe(false);
    expect(isSupportedCaptureUrl("http://[ff02::1]/report")).toBe(false);
    expect(isSupportedCaptureUrl("https://user:pass@example.com")).toBe(false);
    expect(isSupportedCaptureUrl("https://example.com/article")).toBe(true);
  });

  test("reports every editorial field required before publication", () => {
    expect(
      missingEditorialFields({
        title: "",
        category: "",
        description: "",
        tags: [],
      }),
    ).toEqual(["titre", "catégorie", "résumé", "tag"]);
  });
});
