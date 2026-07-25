(() => {
  const explorer = document.querySelector("[data-tag-explorer]");
  const scene = explorer?.querySelector("[data-tag-scene]");
  const search = explorer?.querySelector("[data-tag-search]");
  const buttons = [...(explorer?.querySelectorAll("[data-tag-sort]") || [])];
  const alphabet = explorer?.querySelector("[data-tag-alphabet]");
  const status = explorer?.querySelector("[data-tag-status]");
  const items = [...(scene?.querySelectorAll(".tag-cloud-item") || [])];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (!explorer || !scene || !search || !alphabet || !status || !items.length) return;

  const normalize = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("fr");

  const hash = (value) => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  };

  const records = items.map((element) => ({
    element,
    tag: element.dataset.tag || "",
    normalized: normalize(element.dataset.tag || ""),
    count: Number(element.dataset.count) || 0,
    seed: hash(element.dataset.tag || ""),
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rotation: 0,
    angularVelocity: 0,
    width: 0,
    height: 0,
    locked: false,
  }));

  let mode = "popular";
  let selectedLetter = "A";
  let wanderSeed = 0;
  let active = [];
  let frame = 0;
  let sceneWidth = 0;
  let sceneHeight = 0;

  const nodeLimit = () => {
    if (window.innerWidth < 560) return 14;
    if (window.innerWidth < 900) return 26;
    return 50;
  };

  const compareAlpha = (a, b) => a.tag.localeCompare(b.tag, "fr");
  const comparePopular = (a, b) => b.count - a.count || compareAlpha(a, b);
  const compareWander = (a, b) =>
    ((a.seed ^ wanderSeed) >>> 0) - ((b.seed ^ wanderSeed) >>> 0);
  const initialFor = (record) => {
    const initial = record.normalized.charAt(0).toLocaleUpperCase("fr");
    return /^[A-Z]$/.test(initial) ? initial : "#";
  };
  const alphabetLetters = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
  const letterCounts = new Map(
    alphabetLetters.map((letter) => [
      letter,
      records.filter((record) => initialFor(record) === letter).length,
    ])
  );
  const letterButtons = alphabetLetters.map((letter) => {
    const button = document.createElement("button");
    const count = letterCounts.get(letter) || 0;
    button.type = "button";
    button.dataset.tagLetter = letter;
    button.textContent = letter;
    button.disabled = count === 0;
    button.setAttribute("aria-label", `${letter}, ${count} ${count === 1 ? "thème" : "thèmes"}`);
    button.setAttribute("aria-pressed", String(letter === selectedLetter));
    button.classList.toggle("is-active", letter === selectedLetter);
    alphabet.append(button);
    return button;
  });

  const place = () => {
    const bounds = scene.getBoundingClientRect();
    sceneWidth = bounds.width;
    sceneHeight = bounds.height;
    if (!sceneWidth || !sceneHeight) return;

    const placed = [];
    active.forEach((record, index) => {
      const rect = record.element.getBoundingClientRect();
      record.width = rect.width;
      record.height = rect.height;
      let randomState = (record.seed ^ (index * 0x9e3779b9)) >>> 0;
      let best = null;

      const random = () => {
        randomState += 0x6d2b79f5;
        let value = randomState;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };

      for (let attempt = 0; attempt < 160; attempt += 1) {
        const candidate = {
          x: 12 + random() * Math.max(0, sceneWidth - record.width - 24),
          y: 12 + random() * Math.max(0, sceneHeight - record.height - 24),
          score: Number.POSITIVE_INFINITY,
        };

        placed.forEach((other) => {
          const dx = candidate.x + record.width / 2 - (other.x + other.width / 2);
          const dy = candidate.y + record.height / 2 - (other.y + other.height / 2);
          const distance = Math.hypot(dx, dy);
          const required = Math.hypot(
            (record.width + other.width) / 2 + 10,
            (record.height + other.height) / 2 + 7
          );
          candidate.score = Math.min(candidate.score, distance / required);
        });

        if (!best || candidate.score > best.score) best = candidate;
        if (candidate.score >= 1) break;
      }

      record.x = best?.x ?? sceneWidth / 2 - record.width / 2;
      record.y = best?.y ?? sceneHeight / 2 - record.height / 2;
      record.vx = ((record.seed % 17) - 8) * 0.012;
      record.vy = (((record.seed >>> 4) % 17) - 8) * 0.012;
      record.rotation = ((record.seed % 2001) / 2000 - 0.5) * 5;
      record.angularVelocity =
        (record.seed % 2 ? 1 : -1) *
        (0.008 + ((record.seed >>> 8) % 101) / 100 * 0.018);
      record.locked = false;
      placed.push(record);
    });

    settle(45);
  };

  const settle = (iterations) => {
    const padding = 10;

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      for (let first = 0; first < active.length; first += 1) {
        for (let second = first + 1; second < active.length; second += 1) {
          const a = active[first];
          const b = active[second];
          const dx = a.x + a.width / 2 - (b.x + b.width / 2);
          const dy = a.y + a.height / 2 - (b.y + b.height / 2);
          const overlapX = (a.width + b.width) / 2 + 10 - Math.abs(dx);
          const overlapY = (a.height + b.height) / 2 + 7 - Math.abs(dy);

          if (overlapX <= 0 || overlapY <= 0) continue;

          if (overlapX < overlapY) {
            const shift = Math.sign(dx || 1) * overlapX * 0.52;
            a.x += shift;
            b.x -= shift;
          } else {
            const shift = Math.sign(dy || 1) * overlapY * 0.52;
            a.y += shift;
            b.y -= shift;
          }
        }
      }

      active.forEach((record) => {
        record.x = Math.max(padding, Math.min(sceneWidth - padding - record.width, record.x));
        record.y = Math.max(padding, Math.min(sceneHeight - padding - record.height, record.y));
      });
    }
  };

  const update = () => {
    const query = normalize(search.value.trim().replace(/^#/, ""));
    let matches = records.filter((record) => {
      if (query) return record.normalized.includes(query);
      if (mode === "alpha") return initialFor(record) === selectedLetter;
      return true;
    });

    if (mode === "alpha") matches.sort(compareAlpha);
    else if (mode === "wander") matches.sort(compareWander);
    else matches.sort(comparePopular);

    const visible = matches.slice(0, nodeLimit());
    const visibleSet = new Set(visible);
    records.forEach((record) => {
      record.element.hidden = !visibleSet.has(record);
    });
    active = visible;

    const shown = visible.length;
    if (query) {
      status.textContent = matches.length
        ? `${shown} résultat${shown > 1 ? "s" : ""}${matches.length > shown ? ` sur ${matches.length}` : ""} pour « ${search.value.trim()} »`
        : `Aucun thème pour « ${search.value.trim()} »`;
    } else {
      const label =
        mode === "popular" ? "les plus présents" : mode === "alpha" ? `en ${selectedLetter}` : "pour flâner";
      const total = mode === "alpha" ? matches.length : records.length;
      status.textContent = `${shown} thèmes ${label} sur ${total} · cherchez pour révéler les autres`;
    }

    requestAnimationFrame(() => {
      place();
      draw();
    });
  };

  const draw = () => {
    active.forEach((record) => {
      record.element.style.transform =
        `translate3d(${record.x.toFixed(1)}px, ${record.y.toFixed(1)}px, 0) ` +
        `rotate(${record.rotation.toFixed(2)}deg)`;
    });
  };

  const animate = () => {
    frame = requestAnimationFrame(animate);
    if (reduceMotion.matches || document.hidden || !active.length) return;

    const padding = 8;
    active.forEach((record) => {
      if (record.locked) {
        record.vx = 0;
        record.vy = 0;
        record.angularVelocity = 0;
        return;
      }

      record.vx += Math.sin((performance.now() + record.seed) * 0.00031) * 0.0025;
      record.vy += Math.cos((performance.now() + record.seed) * 0.00027) * 0.0025;

      record.vx *= 0.993;
      record.vy *= 0.993;
      record.x += record.vx;
      record.y += record.vy;
      record.rotation += record.angularVelocity;

      if (Math.abs(record.rotation) > 7) {
        record.rotation = Math.sign(record.rotation) * 7;
        record.angularVelocity *= -0.82;
      }

      if (record.x < padding) {
        record.x = padding;
        record.vx = Math.abs(record.vx) * 0.9;
      } else if (record.x + record.width > sceneWidth - padding) {
        record.x = sceneWidth - padding - record.width;
        record.vx = -Math.abs(record.vx) * 0.9;
      }
      if (record.y < padding) {
        record.y = padding;
        record.vy = Math.abs(record.vy) * 0.9;
      } else if (record.y + record.height > sceneHeight - padding) {
        record.y = sceneHeight - padding - record.height;
        record.vy = -Math.abs(record.vy) * 0.9;
      }
    });

    for (let first = 0; first < active.length; first += 1) {
      for (let second = first + 1; second < active.length; second += 1) {
        const a = active[first];
        const b = active[second];
        const dx = a.x + a.width / 2 - (b.x + b.width / 2);
        const dy = a.y + a.height / 2 - (b.y + b.height / 2);
        const overlapX = (a.width + b.width) / 2 + 7 - Math.abs(dx);
        const overlapY = (a.height + b.height) / 2 + 5 - Math.abs(dy);

        if (overlapX > 0 && overlapY > 0) {
          if (overlapX < overlapY) {
            const direction = Math.sign(dx || 1);
            const correction = overlapX * (a.locked || b.locked ? 0.85 : 0.52);

            if (!a.locked) a.x += direction * correction;
            if (!b.locked) b.x -= direction * correction;

            if (a.locked && !b.locked) {
              b.vx = -direction * Math.max(Math.abs(b.vx), 0.28);
            } else if (b.locked && !a.locked) {
              a.vx = direction * Math.max(Math.abs(a.vx), 0.28);
            } else if (!a.locked && !b.locked) {
              const velocity = a.vx;
              a.vx = b.vx * 0.78;
              b.vx = velocity * 0.78;
            }
          } else {
            const direction = Math.sign(dy || 1);
            const correction = overlapY * (a.locked || b.locked ? 0.85 : 0.52);

            if (!a.locked) a.y += direction * correction;
            if (!b.locked) b.y -= direction * correction;

            if (a.locked && !b.locked) {
              b.vy = -direction * Math.max(Math.abs(b.vy), 0.28);
            } else if (b.locked && !a.locked) {
              a.vy = direction * Math.max(Math.abs(a.vy), 0.28);
            } else if (!a.locked && !b.locked) {
              const velocity = a.vy;
              a.vy = b.vy * 0.78;
              b.vy = velocity * 0.78;
            }
          }

          const spin = Math.min(0.025, Math.hypot(a.vx - b.vx, a.vy - b.vy) * 0.025);
          if (!a.locked) a.angularVelocity += spin * Math.sign(dy || 1);
          if (!b.locked) b.angularVelocity -= spin * Math.sign(dx || 1);
        }
      }
    }
    draw();
  };

  const setLocked = (record, locked) => {
    record.locked = locked;
    record.element.classList.toggle("is-locked", locked);
    if (!locked) {
      record.vx = ((record.seed % 9) - 4) * 0.025;
      record.vy = (((record.seed >>> 5) % 9) - 4) * 0.025;
      record.angularVelocity = (((record.seed >>> 9) % 7) - 3) * 0.006;
    }
  };

  records.forEach((record) => {
    record.element.addEventListener("pointerenter", () => setLocked(record, true));
    record.element.addEventListener("pointerleave", () => setLocked(record, false));
    record.element.addEventListener("focus", () => setLocked(record, true));
    record.element.addEventListener("blur", () => setLocked(record, false));
  });

  search.addEventListener("input", update);
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.tagSort || "popular";
      alphabet.hidden = mode !== "alpha";
      if (mode === "wander") wanderSeed = (wanderSeed + 0x9e3779b9) >>> 0;
      buttons.forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle("is-active", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      });
      update();
    });
  });
  letterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedLetter = button.dataset.tagLetter || "A";
      letterButtons.forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle("is-active", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      });
      update();
    });
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(update, 120);
  });

  records.forEach((record) => {
    record.element.hidden = true;
  });
  explorer.classList.add("is-enhanced");
  document.fonts.ready.then(() => {
    update();
    frame = requestAnimationFrame(animate);
  });

  window.addEventListener("pagehide", () => cancelAnimationFrame(frame), { once: true });
})();
