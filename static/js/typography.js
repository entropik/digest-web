(() => {
  // Display only: never rewrite stored content, attributes, code or editor values.
  const excluded = 'script, style, noscript, pre, code, kbd, samp, textarea, input, select, svg, math, [contenteditable], [data-typography="off"]';
  const isFrench = !document.documentElement.lang.toLowerCase().startsWith("en");

  const normalizeSpaces = (node) => {
    if (!isFrench) return;
    const text = node.data
      .replace(/[ \t\r\n\f\u2009]+([:;!?»])/g, '\u00a0$1')
      .replace(/(«)[ \t\r\n\f\u2009]+/g, '$1\u00a0')
      .replace(/[ \t\r\n\f\u2009\u00a0\u202f]+([.,…])(?=$|[\s.,…:;!?»”’\)\]])/g, '$1');
    if (node.data !== text) node.data = text;
  };

  const italicizeParentheses = (node) => {
    if (!node.parentElement || node.parentElement.closest(excluded) || node.parentElement.closest('em, i')) return;
    const text = node.data;
    if (!text.includes('(') || !text.includes(')')) return;

    const parenRegex = /\(([^()]+)\)/g;
    if (!parenRegex.test(text)) return;
    parenRegex.lastIndex = 0;

    let match;
    let lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let hasReplacements = false;

    while ((match = parenRegex.exec(text)) !== null) {
      const inner = match[1];
      if (!inner.trim()) continue;

      // Skip URLs (e.g. https://.../(...))
      const before = text.slice(0, match.index);
      if (/(?:https?:\/\/|www\.)\S*$/i.test(before)) continue;

      hasReplacements = true;
      if (match.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }

      fragment.appendChild(document.createTextNode('('));
      const em = document.createElement('em');
      em.className = 'digest-parenthetical';
      em.textContent = inner;
      fragment.appendChild(em);
      fragment.appendChild(document.createTextNode(')'));

      lastIndex = parenRegex.lastIndex;
    }

    if (hasReplacements) {
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      node.parentNode.replaceChild(fragment, node);
    }
  };

  const processNode = (node) => {
    if (!node.parentElement || node.parentElement.closest(excluded)) return;
    normalizeSpaces(node);
    italicizeParentheses(node);
  };

  const visit = (root) => {
    if (root.nodeType === Node.TEXT_NODE) {
      processNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE || root.closest(excluded)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) processNode(node);
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
