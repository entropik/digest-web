(() => {
  // Display only: never rewrite stored content, attributes, code or editor values.
  const excluded = 'script, style, noscript, pre, code, kbd, samp, textarea, input, select, svg, math, [contenteditable], [data-typography="off"]';
  const normalize = (node) => {
    if (!node.parentElement || node.parentElement.closest(excluded)) return;
    const text = node.data
      .replace(/[ \t\r\n\f\u2009]+([:;!?»])/g, '\u00a0$1')
      .replace(/(«)[ \t\r\n\f\u2009]+/g, '$1\u00a0')
      .replace(/[ \t\r\n\f\u2009\u00a0\u202f]+([.,…])(?=$|[\s.,…:;!?»”’\)\]])/g, '$1');
    if (node.data !== text) node.data = text;
  };

  const visit = (root) => {
    if (root.nodeType === Node.TEXT_NODE) {
      normalize(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) normalize(walker.currentNode);
  };

  visit(document.body);
  // Cards, search results, dialogs and admin feedback also arrive after page load.
  new MutationObserver((records) => {
    const roots = new Set();
    for (const record of records) {
      if (record.type === 'characterData') roots.add(record.target);
      else for (const node of record.addedNodes) roots.add(node);
    }
    for (const root of roots) {
      if (root.isConnected) visit(root);
    }
  }).observe(document.body, { childList: true, characterData: true, subtree: true });
})();
