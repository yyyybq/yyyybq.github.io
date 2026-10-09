(() => {
  const cfg = window.ELE_CONFIG;
  const META = window.ELE_META || {};
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  };
  const clean = (...kids) => kids.flat().filter((k) => k != null);
  const slugOf = (src) => src.split("/").pop().replace(/\.mp4$/, "");
  const durOf = (src) => (META[slugOf(src)] || {}).dur;
  const clock = (s) => {
    if (s == null) return "—";
    s = Math.round(s);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };
  const hm = (s) => {
    const hrs = Math.floor(s / 3600);
    const min = Math.round((s % 3600) / 60);
    return hrs ? `${hrs} h ${min} min` : `${min} min`;
  };
  const copyText = async (text, btn) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = h("textarea", { style: "position:fixed;opacity:0" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    if (btn) {
      const use = $("use", btn);
      const label = $("span", btn);
      const prev = label && label.textContent;
      use && use.setAttribute("href", "#i-check");
      if (label) label.textContent = "Copied";
      setTimeout(() => {
        use && use.setAttribute("href", "#i-copy");
        if (label) label.textContent = prev;
      }, 1600);
    }
  };

  /* ── masthead ─────────────────────────── */
  if (cfg.authors.length) {
    const ul = $("#authors");
    cfg.authors.forEach((a) => ul.append(h("li", {}, a.name, a.aff || a.note ? h("sup", {}, [a.aff, a.note].filter(Boolean).join(",")) : null)));
    ul.hidden = false;
  }
  if (cfg.affiliations.length) {
    const p = $("#affiliations");
    cfg.affiliations.forEach((a) => p.append(h("span", {}, h("sup", {}, a.id), " ", a.name)));
    p.hidden = false;
  }
  document.querySelectorAll("[data-link]").forEach((a) => {
    const key = a.dataset.link;
    const url = key === "scene" ? cfg.scene.url : cfg.links[key];
    if (url) {
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
    } else {
      a.classList.add("is-soon");
      a.setAttribute("aria-disabled", "true");
      a.removeAttribute("href");
    }
  });

  /* ── interactive scene ────────────────── */
  const sceneUrl = new URL(cfg.scene.url, location.href);
  const canEmbed = sceneUrl.origin === location.origin || new URLSearchParams(location.search).has("embed");
  const stage = $("#scene-stage");
  const canvas = $("#scene-canvas");
  $("#scene-title").textContent = cfg.scene.name;
  $("#scene-open").href = sceneUrl.href;
  if (cfg.scene.inviteCode) {
    $("#invite-code").textContent = cfg.scene.inviteCode;
    $("#invite").hidden = false;
    $("#invite-copy").addEventListener("click", (e) => copyText(cfg.scene.inviteCode, e.currentTarget));
  } else {
    $("#invite-note").hidden = false;
  }
  $("#scene-launch").addEventListener("click", () => {
    if (!canEmbed) {
      if (cfg.scene.inviteCode) copyText(cfg.scene.inviteCode, $("#invite-copy"));
      window.open(sceneUrl.href, "_blank", "noopener");
      return;
    }
    const frame = h("iframe", {
      src: sceneUrl.href,
      title: `${cfg.scene.name} interactive 3D scene`,
      allow: "fullscreen; xr-spatial-tracking",
      allowfullscreen: true,
    });
    canvas.append(frame);
    stage.dataset.state = "live";
    const fs = $("#scene-fullscreen");
    fs.hidden = false;
    fs.addEventListener("click", () => (frame.requestFullscreen ? frame.requestFullscreen() : null));
  });

  /* ── stat strip ───────────────────────── */
  const rollouts = window.ELE_ROLLOUTS;
  const stages = window.ELE_STAGES;
  const gallery = window.ELE_GALLERY;
  const longest = Math.max(...rollouts.map((r) => r.realtime || 0));
  [
    [rollouts.length, "long-horizon robot rollouts"],
    [stages.reduce((n, t) => n + t.steps.length, 0), `sub-steps across ${stages.length} staged tasks`],
    [gallery.length, "close-up physical interactions"],
    [hm(longest), "longest real-time episode, reasoning included"],
  ].forEach(([n, label]) => $("#stat-strip").append(h("li", {}, h("strong", {}, String(n)), h("span", {}, label))));

  /* ── nav: progress, active section, mobile ─ */
  const bar = $("#reading-progress");
  const navLinks = [...document.querySelectorAll("#site-nav a")];
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  const sectionObs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id));
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  navLinks.forEach((a) => {
    const sec = document.querySelector(a.getAttribute("href"));
    if (sec) sectionObs.observe(sec);
  });
  const menu = $("#menu-toggle");
  const nav = $("#site-nav");
  menu.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    menu.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      nav.classList.remove("is-open");
      menu.setAttribute("aria-expanded", "false");
    }
  });

  /* ── autoplay-in-view videos ──────────── */
  const autoObs = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target: v, isIntersecting }) => {
        if (isIntersecting) {
          if (!v.src && v.dataset.src) v.src = v.dataset.src;
          v.play().catch(() => {});
        } else if (!v.paused) v.pause();
      });
    },
    { threshold: 0.35 }
  );
  document.querySelectorAll("video.autoplay").forEach((v) => autoObs.observe(v));

  /* ── before / after slider ────────────── */
  const range = $("#compare-range");
  range.addEventListener("input", () => $("#compare-stage").style.setProperty("--pos", range.value + "%"));

  /* ── rollouts ─────────────────────────── */
  const rv = $("#rollout-video");
  const tabs = $("#rollout-tabs");
  let curRollout = 0;
  const selectView = (r, i) => {
    const view = r.views[i];
    rv.poster = view.poster;
    rv.src = view.src;
    [...$("#rollout-views").children].forEach((c, j) => c.setAttribute("aria-pressed", String(i === j)));
    const stats = $("#rollout-stats");
    stats.replaceChildren(...clean(
      h("div", {}, h("dt", {}, "Clip length"), h("dd", {}, clock(durOf(view.src)))),
      h("div", {}, h("dt", {}, "Views"), h("dd", {}, String(r.views.length))),
      r.realtime ? h("div", { class: "wide" }, h("dt", {}, "Real-time length (1×, with reasoning)"), h("dd", {}, hm(r.realtime))) : null
    ));
  };
  const selectRollout = (i, { play = false } = {}) => {
    curRollout = i;
    const r = rollouts[i];
    [...tabs.children].forEach((t, j) => {
      t.setAttribute("aria-selected", String(i === j));
      t.tabIndex = i === j ? 0 : -1;
    });
    $("#rollout-room").textContent = r.room;
    $("#rollout-title").textContent = r.title;
    $("#rollout-summary").textContent = r.summary;
    $("#rollout-views").replaceChildren(...clean(
      ...r.views.map((v, j) => h("button", { class: "chip", type: "button", "aria-pressed": "false", onclick: () => selectView(r, j) }, v.label))
    ));
    selectView(r, 0);
    if (play) rv.play().catch(() => {});
  };
  rollouts.forEach((r, i) =>
    tabs.append(
      h(
        "button",
        { class: "rollout-tab", role: "tab", type: "button", id: "rollout-tab-" + r.id, "aria-controls": "rollout-panel", onclick: () => selectRollout(i) },
        h("small", {}, r.room),
        h("strong", {}, r.title)
      )
    )
  );
  tabs.addEventListener("keydown", (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    const n = (curRollout + d + rollouts.length) % rollouts.length;
    selectRollout(n);
    tabs.children[n].focus();
  });
  selectRollout(0);

  /* ── stage breakdown ──────────────────── */
  const sv = $("#stage-video");
  const chainBtn = $("#stage-chain");
  let task = stages[0];
  let stepIdx = 0;
  let chaining = false;
  const stepButtons = () => [...document.querySelectorAll("#stage-steps .step")];
  const setChaining = (on) => {
    chaining = on;
    chainBtn.setAttribute("aria-pressed", String(on));
    $("span", chainBtn).textContent = on ? "Stop" : "Play all steps";
    sv.loop = !on;
  };
  const loadStep = (i, autoplay = true) => {
    stepIdx = i;
    const isFull = i === task.steps.length;
    const clip = isFull ? task.full : task.steps[i];
    stepButtons().forEach((b, j) => {
      b.setAttribute("aria-current", String(i === j));
      $(".step-progress", b).style.width = "0";
    });
    sv.poster = clip.poster;
    sv.src = clip.src;
    $("#stage-caption").textContent = isFull
      ? `Full trajectory · ${clock(durOf(clip.src))}`
      : `Step ${i + 1} of ${task.steps.length} · ${clip.label} · ${clock(durOf(clip.src))}`;
    if (autoplay) sv.play().catch(() => {});
  };
  const selectTask = (t) => {
    task = t;
    setChaining(false);
    [...$("#stage-tabs").children].forEach((c) => c.setAttribute("aria-selected", String(c.dataset.id === t.id)));
    const list = $("#stage-steps");
    list.replaceChildren(...clean(
      ...t.steps.map((s, i) =>
        h("li", {}, h("button", { class: "step", type: "button", onclick: () => (setChaining(false), loadStep(i)) }, h("span", { class: "num" }, String(i + 1)), s.label, h("span", { class: "step-progress" })))
      ),
      t.full
        ? h("li", {}, h("button", { class: "step is-full", type: "button", onclick: () => (setChaining(false), loadStep(t.steps.length)) }, h("span", { class: "num" }, "∑"), "Full trajectory", h("span", { class: "step-progress" })))
        : null
    ));
    loadStep(0, false);
  };
  stages.forEach((t) =>
    $("#stage-tabs").append(
      h("button", { class: "chip", role: "tab", type: "button", "data-id": t.id, "aria-selected": "false", onclick: () => selectTask(t) }, t.title, h("small", {}, `${t.steps.length} steps`))
    )
  );
  chainBtn.addEventListener("click", () => {
    if (chaining) {
      setChaining(false);
      sv.pause();
      return;
    }
    setChaining(true);
    loadStep(0);
  });
  sv.addEventListener("timeupdate", () => {
    const b = stepButtons()[stepIdx];
    if (b && sv.duration) $(".step-progress", b).style.width = `${(sv.currentTime / sv.duration) * 100}%`;
  });
  sv.addEventListener("ended", () => {
    if (!chaining) return;
    if (stepIdx + 1 < task.steps.length) loadStep(stepIdx + 1);
    else setChaining(false);
  });
  sv.loop = true;
  selectTask(stages[0]);

  /* ── gallery ──────────────────────────── */
  const groups = window.ELE_GALLERY_GROUPS;
  const groupLabel = Object.fromEntries(groups.map((g) => [g.id, g.label]));
  const grid = $("#gallery-grid");
  const filters = $("#gallery-filters");
  let filter = "all";
  const cards = gallery.map((item, i) => {
    const thumb = h("div", { class: "g-thumb" }, h("img", { src: item.poster, alt: "", loading: "lazy", width: 960, height: 540 }), h("span", { class: "g-dur" }, clock(durOf(item.src))));
    const card = h(
      "button",
      { class: "g-card", type: "button", "data-group": item.group, "aria-label": `Play: ${item.title}` },
      thumb,
      h("div", { class: "g-meta" }, h("strong", {}, item.title), h("small", {}, groupLabel[item.group]))
    );
    let vid;
    card.addEventListener("mouseenter", () => {
      if (!matchMedia("(hover: hover)").matches) return;
      if (!vid) {
        vid = h("video", { muted: true, loop: true, playsinline: true, preload: "auto", src: item.src });
        vid.muted = true;
        thumb.insertBefore(vid, thumb.lastChild);
      }
      card.classList.add("is-playing");
      vid.play().catch(() => {});
    });
    card.addEventListener("mouseleave", () => {
      card.classList.remove("is-playing");
      if (vid) vid.pause();
    });
    card.addEventListener("click", () => openLightbox(i));
    grid.append(card);
    return card;
  });
  const setFilter = (id) => {
    filter = id;
    [...filters.children].forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.id === id)));
    cards.forEach((c) => (c.hidden = id !== "all" && c.dataset.group !== id));
  };
  [{ id: "all", label: "All" }, ...groups].forEach((g) => {
    const n = g.id === "all" ? gallery.length : gallery.filter((x) => x.group === g.id).length;
    filters.append(h("button", { class: "chip", type: "button", "data-id": g.id, "aria-pressed": "false", onclick: () => setFilter(g.id) }, g.label, h("small", {}, String(n))));
  });
  setFilter("all");

  /* lightbox */
  const lb = $("#lightbox");
  const lbv = $("#lightbox-video");
  let lbList = [];
  let lbPos = 0;
  const showLb = () => {
    const item = gallery[lbList[lbPos]];
    lbv.poster = item.poster;
    lbv.src = item.src;
    lbv.play().catch(() => {});
    $("#lightbox-title").textContent = item.title;
    $("#lightbox-count").textContent = `${lbPos + 1} / ${lbList.length}`;
  };
  function openLightbox(i) {
    lbList = gallery.map((_, j) => j).filter((j) => !cards[j].hidden);
    lbPos = Math.max(0, lbList.indexOf(i));
    showLb();
    lb.showModal();
  }
  const stepLb = (d) => {
    lbPos = (lbPos + d + lbList.length) % lbList.length;
    showLb();
  };
  $("#lightbox-prev").addEventListener("click", () => stepLb(-1));
  $("#lightbox-next").addEventListener("click", () => stepLb(1));
  $("#lightbox-close").addEventListener("click", () => lb.close());
  lb.addEventListener("click", (e) => e.target === lb && lb.close());
  lb.addEventListener("close", () => {
    lbv.pause();
    lbv.removeAttribute("src");
    lbv.load();
  });
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") stepLb(1);
    if (e.key === "ArrowLeft") stepLb(-1);
  });

  /* ── scene hotspots → demos below ─────── */
  window.ELE_HOTSPOTS.forEach((p) =>
    $("#hotspots").append(
      h(
        "button",
        {
          class: "hotspot",
          type: "button",
          style: `left:${p.x}%;top:${p.y}%`,
          onclick: () => {
            if (p.target === "gallery") setFilter(p.filter);
            if (p.target === "rollouts") selectRollout(rollouts.findIndex((r) => r.id === p.rollout));
            document.getElementById(p.target).scrollIntoView({ behavior: "smooth" });
          },
        },
        p.label
      )
    )
  );

  /* ── citation ─────────────────────────── */
  $("#bibtex").textContent = cfg.bibtex;
  $("#bib-copy").addEventListener("click", (e) => copyText(cfg.bibtex, e.currentTarget));
})();
