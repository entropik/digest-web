(() => {
  const article = document.querySelector(".post-single");
  const content = article?.querySelector(".post-content");
  const canAnimate = window.matchMedia(
    "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)"
  );

  if (!article || !content) return;

  const meta = article.querySelector(".post-meta");
  let cue;
  if (meta) {
    cue = document.createElement("span");
    cue.className = "about-liquid-cue";
    cue.textContent = "plouf ?";
    cue.tabIndex = 0;
    cue.setAttribute("aria-describedby", "about-liquid-tooltip");

    const tooltip = document.createElement("span");
    tooltip.id = "about-liquid-tooltip";
    tooltip.className = "about-liquid-tooltip";
    tooltip.setAttribute("role", "tooltip");

    ["survolez", "le texte", "merci pretext.js !!!"].forEach((text, index) => {
      const line = document.createElement("span");
      line.className = `about-liquid-tooltip-line line-${index + 1}`;
      line.textContent = text;
      tooltip.append(line);
    });

    cue.append(tooltip);
    meta.append(cue);
  }

  let effect;
  const syncAvailability = () => {
    if (cue) cue.hidden = !canAnimate.matches;
    if (canAnimate.matches) {
      effect ??= initialize();
      effect.measure();
    } else {
      effect?.reset();
    }
  };

  const initialize = () => {
    const pool = document.createElement("div");
    pool.className = "about-liquid-pool";
    pool.setAttribute("aria-hidden", "true");
    content.prepend(pool);

    const textNodes = [];
    content.querySelectorAll("p, h2, h3, li, blockquote").forEach((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!node.nodeValue.trim() || parent?.closest("a, code, pre, script, style, .liquid-word")) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      while (walker.nextNode()) textNodes.push(walker.currentNode);
    });

    textNodes.forEach((node) => {
      const fragment = document.createDocumentFragment();
      node.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.append(document.createTextNode(part));
          return;
        }

        const word = document.createElement("span");
        word.className = "liquid-word";
        word.textContent = part;
        fragment.append(word);
      });
      node.replaceWith(fragment);
    });

    const states = [...content.querySelectorAll(".liquid-word")].map((element) => ({
      element,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      docX: 0,
      docY: 0,
      heat: 0,
    }));

    article.classList.add("about-liquid-page");

    const influenceRadius = 145;
    let pointerX = 0;
    let pointerY = 0;
    let pointerActive = false;
    let frame = 0;

    const measure = () => {
      states.forEach((state) => {
        const rect = state.element.getBoundingClientRect();
        state.docX = rect.left + window.scrollX + rect.width / 2 - state.x;
        state.docY = rect.top + window.scrollY + rect.height / 2 - state.y;
      });
    };

    const animate = () => {
      frame = 0;
      let stillMoving = false;

      states.forEach((state) => {
        const dx = state.docX - pointerX;
        const dy = state.docY - pointerY;
        const distance = Math.hypot(dx, dy);
        let targetX = 0;
        let targetY = 0;
        let targetHeat = 0;

        if (pointerActive && distance < influenceRadius) {
          const falloff = 1 - distance / influenceRadius;
          const pressure = falloff * falloff;
          const angle = Math.atan2(dy, dx);
          const push = pressure * 48;
          const swirl = pressure * 17;

          targetX = Math.cos(angle) * push - Math.sin(angle) * swirl;
          targetY = Math.sin(angle) * push + Math.cos(angle) * swirl;
          targetHeat = pressure;
        }

        state.vx = (state.vx + (targetX - state.x) * 0.13) * 0.72;
        state.vy = (state.vy + (targetY - state.y) * 0.13) * 0.72;
        state.x += state.vx;
        state.y += state.vy;
        state.heat += (targetHeat - state.heat) * 0.16;

        const rotation = Math.max(-4, Math.min(4, (state.x + state.y) * 0.055));
        const scale = 1 + state.heat * 0.1;
        state.element.style.transform =
          `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) ` +
          `rotate(${rotation.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        state.element.style.setProperty("--liquid-mix", `${(state.heat * 82).toFixed(1)}%`);

        if (
          Math.abs(state.x - targetX) > 0.04 ||
          Math.abs(state.y - targetY) > 0.04 ||
          Math.abs(state.vx) > 0.04 ||
          Math.abs(state.vy) > 0.04
        ) {
          stillMoving = true;
        }
      });

      if (pointerActive || stillMoving) frame = requestAnimationFrame(animate);
    };

    const startAnimation = () => {
      if (!canAnimate.matches) return;
      if (!frame) frame = requestAnimationFrame(animate);
    };

    content.addEventListener("pointerenter", (event) => {
      if (!canAnimate.matches) return;
      pointerActive = true;
      pointerX = event.clientX + window.scrollX;
      pointerY = event.clientY + window.scrollY;
      content.classList.add("is-liquid-active");
      startAnimation();
    });

    content.addEventListener("pointermove", (event) => {
      if (!canAnimate.matches) return;
      pointerActive = true;
      content.classList.add("is-liquid-active");
      const rect = content.getBoundingClientRect();
      pointerX = event.clientX + window.scrollX;
      pointerY = event.clientY + window.scrollY;
      content.style.setProperty("--pool-x", `${event.clientX - rect.left}px`);
      content.style.setProperty("--pool-y", `${event.clientY - rect.top}px`);
      startAnimation();
    });

    content.addEventListener("pointerleave", () => {
      pointerActive = false;
      content.classList.remove("is-liquid-active");
      startAnimation();
    });

    let resizeTimer = 0;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(measure, 120);
    });

    document.fonts.ready.then(measure);
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      pointerActive = false;
      content.classList.remove("is-liquid-active");
      states.forEach((state) => {
        state.x = state.y = state.vx = state.vy = state.heat = 0;
        state.element.style.removeProperty("transform");
        state.element.style.removeProperty("--liquid-mix");
      });
    };
    window.addEventListener("pagehide", reset);
    window.addEventListener("pageshow", measure);
    return { measure, reset };
  };

  canAnimate.addEventListener("change", syncAvailability);
  syncAvailability();
})();
