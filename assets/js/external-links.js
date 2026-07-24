(() => {
  const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

  const getExternalUrl = (anchor) => {
    if (!(anchor instanceof HTMLAnchorElement) || !anchor.hasAttribute("href")) return null;
    try {
      const url = new URL(anchor.href, window.location.href);
      return HTTP_PROTOCOLS.has(url.protocol) && url.origin !== window.location.origin ? url : null;
    } catch {
      return null;
    }
  };

  const hardenExternalLink = (anchor) => {
    if (!getExternalUrl(anchor)) return;
    anchor.target = "_blank";
    const rel = new Set((anchor.rel || "").split(/\s+/).filter(Boolean));
    rel.add("noopener");
    rel.add("noreferrer");
    anchor.rel = [...rel].join(" ");
  };

  const hardenExternalLinks = (root) => {
    if (root instanceof HTMLAnchorElement) hardenExternalLink(root);
    root.querySelectorAll?.("a[href]").forEach(hardenExternalLink);
  };

  hardenExternalLinks(document);

  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === "attributes") {
        hardenExternalLink(mutation.target);
        return;
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) hardenExternalLinks(node);
      });
    });
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["href"],
    childList: true,
    subtree: true,
  });
})();
