document.addEventListener("DOMContentLoaded", () => {
  const italicizeParentheticals = (article) => {
    const blocks = article.querySelectorAll(
      ".procrastinator-entry-body :is(p, li, blockquote, h2, h3, h4)",
    );

    blocks.forEach((block) => {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.parentElement?.closest("code, pre, a, em, script, style")
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT;
        },
      });
      const characters = [];
      let node = walker.nextNode();

      while (node) {
        for (let offset = 0; offset < node.data.length; offset += 1) {
          characters.push({ node, offset, value: node.data[offset] });
        }
        node = walker.nextNode();
      }

      const ranges = [];
      const openings = [];
      characters.forEach((character, index) => {
        if (character.value === "(") openings.push(index);
        if (character.value !== ")" || openings.length === 0) return;

        const start = openings.pop();
        if (openings.length === 0) ranges.push({ start, end: index });
      });

      ranges.reverse().forEach(({ start, end }) => {
        const first = characters[start];
        const last = characters[end];
        const range = document.createRange();
        range.setStart(first.node, first.offset);
        range.setEnd(last.node, last.offset + 1);

        const emphasis = document.createElement("em");
        emphasis.className = "procrastinator-parenthetical";
        emphasis.append(range.extractContents());
        range.insertNode(emphasis);
      });
    });
  };

  document.querySelectorAll(".procrastinator-single").forEach((article) => {
    italicizeParentheticals(article);

    const openButton = article.querySelector(".procrastinator-document-open");
    const viewer = article.querySelector(".procrastinator-viewer");
    const closeButton = viewer?.querySelector(".procrastinator-viewer-close");

    if (!openButton || !viewer || !closeButton) return;

    const closeViewer = () => {
      viewer.hidden = true;
      document.body.classList.remove("procrastinator-viewer-open");
      openButton.focus();
    };

    openButton.addEventListener("click", () => {
      viewer.hidden = false;
      document.body.classList.add("procrastinator-viewer-open");
      closeButton.focus();
    });
    closeButton.addEventListener("click", closeViewer);
    viewer.addEventListener("click", (event) => {
      if (event.target === viewer) closeViewer();
    });
    viewer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeViewer();
    });
  });
});
