/* 新加坡探店地图 · 前端逻辑（无构建步骤，直接由 GitHub Pages 提供） */
(() => {
  "use strict";

  const C = window.SGMAP_CONFIG;
  const REST = `${C.supabaseUrl}/rest/v1`;
  const FN = `${C.supabaseUrl}/functions/v1/sgmap`;
  const PUBLIC_IMG = `${C.supabaseUrl}/storage/v1/object/public/${C.bucket}/`;
  const SG_BOUNDS = L.latLngBounds([1.144, 103.535], [1.494, 104.502]);
  // OneMap 使用条款要求的 logo + 来源标注（原文来自 onemap.gov.sg/docs/maps）
  const ATTRIBUTION =
    '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
  const MAX_IMAGES = 12;
  const DESKTOP = () => window.innerWidth >= 900;

  const $ = (sel, root = document) => root.querySelector(sel);

  const state = {
    places: [],
    filter: null, // null = 全部；否则为 Set(类别 key)
    selectedId: null,
    markers: new Map(),
    hubs: [],
    lastLoad: 0,
    auth: readAuth(),
  };

  // ======================================================================
  // 小工具
  // ======================================================================

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function catOf(key) {
    return C.categories.find((c) => c.key === key) || C.categories[C.categories.length - 1];
  }

  function imgUrl(path) {
    return PUBLIC_IMG + path.split("/").map(encodeURIComponent).join("/");
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  let toastTimer;
  function toast(msg, isError = false, ms = 2600) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("is-error", isError);
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-on"), ms);
  }

  const SMALL_WORDS = new Set(["and", "of", "the", "at", "by", "for", "in", "on"]);
  function titleCase(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\b([a-z])([a-z']*)/g, (w, a, b, i) => (i > 0 && SMALL_WORDS.has(w) ? w : a.toUpperCase() + b));
  }

  function prettyAddress(r) {
    const street = [r.blk, titleCase(r.road)].filter(Boolean).join(" ");
    const building = titleCase(r.building);
    return [building, street].filter(Boolean).join(", ") || titleCase(r.address).replace(/ Singapore \d{6}$/i, "");
  }

  // ======================================================================
  // 链接：提取网址 + 按域名识别来源
  // ======================================================================

  const URL_RE = /https?:\/\/[^\s<>"'，。！？、；：（）【】「」『』《》　一-鿿]+/gi;
  const BARE_RE = /\b(?:[a-z0-9-]+\.)+(?:com|cn|sg|net|org|io|me|co|gl|ly)\/[^\s<>"'，。！？、；：（）【】「」　一-鿿]*/gi;
  const TRAIL_RE = /[.,;:!?)\]}>'"]+$/;

  function extractUrls(text) {
    let found = (String(text).match(URL_RE) || []).map((u) => u.replace(TRAIL_RE, ""));
    if (!found.length) found = (String(text).match(BARE_RE) || []).map((u) => "https://" + u.replace(TRAIL_RE, ""));
    return [...new Set(found.filter((u) => u.length > 10 && u.length <= 1000))];
  }

  function linkSource(url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { ...C.otherLinkSource, host: "" };
    }
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const hostPath = host + u.pathname;
    for (const s of C.linkSources) {
      for (const raw of s.domains) {
        const d = raw.toLowerCase();
        const hit = d.includes("/") ? hostPath.startsWith(d) : host === d || host.endsWith("." + d);
        if (hit) return { ...s, host };
      }
    }
    return { ...C.otherLinkSource, host };
  }

  function shortUrl(url) {
    try {
      const u = new URL(url);
      const s = u.hostname.replace(/^www\./, "") + (u.pathname === "/" ? "" : u.pathname);
      return s.length > 48 ? s.slice(0, 46) + "…" : s;
    } catch {
      return url;
    }
  }

  // ======================================================================
  // 编辑口令 + 后端调用
  // ======================================================================

  const AUTH_KEY = "sgmap.auth.v1";

  function readAuth() {
    try {
      return JSON.parse(localStorage.getItem(AUTH_KEY)) || { passcode: "", nickname: "" };
    } catch {
      return { passcode: "", nickname: "" };
    }
  }

  function saveAuth(a) {
    state.auth = a;
    try {
      localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    } catch { /* 隐私模式下存不了也没关系，本次打开期间仍有效 */ }
    updateWho();
  }

  const hasAuth = () => !!state.auth.passcode;

  class AuthError extends Error {}

  async function api(action, body, formData) {
    if (!hasAuth()) throw new AuthError("需要先输入编辑口令");
    const headers = { "x-sgmap-passcode": encodeURIComponent(state.auth.passcode) };
    let payload = formData;
    if (!formData) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify({ nickname: state.auth.nickname, ...(body || {}) });
    }
    let res;
    try {
      res = await fetch(`${FN}?action=${action}`, { method: "POST", headers, body: payload });
    } catch {
      throw new Error("网络连接失败，请检查网络后重试");
    }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      saveAuth({ passcode: "", nickname: state.auth.nickname });
      throw new AuthError(json.error || "编辑口令不对");
    }
    if (!res.ok) throw new Error(json.error || `出错了（${res.status}）`);
    return json;
  }

  function handleError(err) {
    if (err instanceof AuthError) {
      toast(err.message + "，请重新输入", true);
      ensureAuth();
    } else {
      toast(err?.message || "出错了，请重试", true, 4000);
    }
  }

  let authPromise = null;
  function ensureAuth() {
    if (hasAuth()) return Promise.resolve(true);
    if (authPromise) return authPromise;
    authPromise = new Promise((resolve) => {
      const dlg = $("#auth-dialog");
      const form = $("#auth-form");
      const pass = $("#a-pass");
      const nick = $("#a-nick");
      const err = $("#auth-error");
      const btn = $("#auth-submit");
      const ctrl = new AbortController();
      pass.value = "";
      nick.value = state.auth.nickname || "";
      err.textContent = "";

      const finish = (ok) => {
        ctrl.abort();
        if (dlg.open) dlg.close();
        authPromise = null;
        resolve(ok);
      };

      form.addEventListener(
        "submit",
        async (e) => {
          e.preventDefault();
          const p = pass.value;
          const n = nick.value.trim();
          if (!p) return (err.textContent = "请输入编辑口令");
          if (!n) return (err.textContent = "请填一个昵称");
          btn.disabled = true;
          btn.textContent = "验证中…";
          try {
            const res = await fetch(`${FN}?action=verify`, {
              method: "POST",
              headers: { "x-sgmap-passcode": encodeURIComponent(p) },
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
              err.textContent = j.error || `验证失败（${res.status}）`;
              return;
            }
            saveAuth({ passcode: p, nickname: n.slice(0, 24) });
            toast(`你好，${n}！现在可以添加和编辑了`);
            finish(true);
          } catch {
            err.textContent = "网络连接失败，请重试";
          } finally {
            btn.disabled = false;
            btn.textContent = "确定";
          }
        },
        { signal: ctrl.signal },
      );
      $("#auth-cancel").addEventListener("click", () => finish(false), { signal: ctrl.signal });
      dlg.addEventListener("cancel", () => finish(false), { signal: ctrl.signal });

      dlg.showModal();
      pass.focus();
    });
    return authPromise;
  }

  function updateWho() {
    const btn = $("#who-btn");
    if (hasAuth()) {
      btn.hidden = false;
      btn.textContent = `✎ ${state.auth.nickname}`;
      btn.title = "点击退出编辑身份";
    } else {
      btn.hidden = true;
    }
    $("#editor-who").textContent = hasAuth() ? state.auth.nickname : "";
  }

  // ======================================================================
  // 数据
  // ======================================================================

  async function loadPlaces() {
    const all = [];
    const page = 1000;
    for (let offset = 0; ; offset += page) {
      const res = await fetch(`${REST}/places?select=*&order=created_at.asc&limit=${page}&offset=${offset}`, {
        headers: { apikey: C.supabaseKey },
      });
      if (!res.ok) throw new Error(`加载失败（${res.status}）`);
      const rows = await res.json();
      all.push(...rows);
      if (rows.length < page) break;
    }
    state.places = all;
    state.lastLoad = Date.now();
    renderAll();
    if (state.selectedId) {
      if (state.places.some((p) => p.id === state.selectedId) && isVisible(placeById(state.selectedId))) {
        openDetail(state.selectedId, { pan: false });
      } else closeDetail();
    }
  }

  const placeById = (id) => state.places.find((p) => p.id === id);

  function upsertLocal(place) {
    const i = state.places.findIndex((p) => p.id === place.id);
    if (i >= 0) state.places[i] = place;
    else state.places.push(place);
  }

  // ======================================================================
  // 地图
  // ======================================================================

  function addBasemap(target) {
    const retina = L.Browser.retina;
    // 高清屏用 Default_HD（有 z20 瓦片），普通屏用 Default
    L.tileLayer(`https://www.onemap.gov.sg/maps/tiles/${retina ? "Default_HD" : "Default"}/{z}/{x}/{y}.png`, {
      detectRetina: retina,
      maxZoom: retina ? 20 : 19,
      minZoom: 11,
      attribution: ATTRIBUTION,
    }).addTo(target);
  }

  const map = L.map("map", {
    center: C.map.center,
    zoom: C.map.zoom,
    minZoom: 11,
    maxZoom: 19,
    maxBounds: SG_BOUNDS,
    maxBoundsViscosity: 0.8,
    zoomControl: false,
    attributionControl: false,
  });
  addBasemap(map);
  L.control.attribution({ position: "bottomleft", prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>' }).addTo(map);
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) L.control.zoom({ position: "topleft" }).addTo(map);
  map.on("click", () => closeDetail());

  function pinSize() {
    const z = map.getZoom();
    return z <= 12 ? 24 : z <= 14 ? 30 : 34;
  }

  function pinIcon(p, size, dx = 0, dy = 0, selected = false) {
    const c = catOf(p.category);
    const len = Math.hypot(dx, dy);
    const leg = len
      ? `<i class="pin-leg" style="width:${len.toFixed(1)}px;transform:rotate(${Math.atan2(-dy, -dx).toFixed(4)}rad)"></i>`
      : "";
    return L.divIcon({
      className: "pin-wrap",
      iconSize: [size, size],
      iconAnchor: [size / 2 - dx, size / 2 - dy],
      html: `${leg}<div class="pin${selected ? " is-selected" : ""}" style="--c:${c.color};--s:${size}px"><span>${c.icon}</span></div>`,
    });
  }

  // 把相距 20 米以内的地点（同一栋楼 / 同一邮编）分成一组，组内按固定像素围成一圈，互不遮挡
  function groupNearby(places) {
    const groups = [];
    const near = (a, b) => {
      const dy = (a.lat - b.lat) * 111320;
      const dx = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
      return dx * dx + dy * dy < 20 * 20;
    };
    for (const p of places) {
      const g = groups.find((g) => (p.postal && g.items[0].postal === p.postal) || near(g.items[0], p));
      if (g) g.items.push(p);
      else groups.push({ items: [p] });
    }
    for (const g of groups) {
      g.items.sort((a, b) => a.created_at.localeCompare(b.created_at));
      g.lat = g.items.reduce((s, p) => s + p.lat, 0) / g.items.length;
      g.lng = g.items.reduce((s, p) => s + p.lng, 0) / g.items.length;
    }
    return groups;
  }

  const isVisible = (p) => !state.filter || state.filter.has(catOf(p.category).key);

  let renderedSize = 0;
  function renderMarkers() {
    for (const m of state.markers.values()) m.remove();
    for (const h of state.hubs) h.remove();
    state.markers.clear();
    state.hubs = [];
    const size = (renderedSize = pinSize());
    for (const g of groupNearby(state.places.filter(isVisible))) {
      const n = g.items.length;
      if (n > 1) {
        state.hubs.push(
          L.circleMarker([g.lat, g.lng], { radius: 4, color: "#fff", weight: 2, fillColor: "#3d4148", fillOpacity: 1, interactive: false }).addTo(map),
        );
      }
      const R = n > 1 ? Math.max(size * 1.05, ((size + 8) * n) / (2 * Math.PI)) : 0;
      g.items.forEach((p, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const dx = n > 1 ? R * Math.cos(a) : 0;
        const dy = n > 1 ? R * Math.sin(a) : 0;
        const selected = p.id === state.selectedId;
        const m = L.marker(n > 1 ? [g.lat, g.lng] : [p.lat, p.lng], {
          icon: pinIcon(p, size, dx, dy, selected),
          title: p.name,
          alt: p.name,
          riseOnHover: true,
          zIndexOffset: selected ? 1000 : 0,
        });
        m.sg = { dx, dy };
        m.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          openDetail(p.id);
        });
        m.addTo(map);
        state.markers.set(p.id, m);
      });
    }
  }

  function refreshPin(id) {
    const m = id && state.markers.get(id);
    const p = id && placeById(id);
    if (!m || !p) return;
    const selected = id === state.selectedId;
    m.setIcon(pinIcon(p, renderedSize, m.sg.dx, m.sg.dy, selected));
    m.setZIndexOffset(selected ? 1000 : 0);
  }

  map.on("zoomend", () => {
    if (pinSize() !== renderedSize) renderMarkers();
  });

  // ======================================================================
  // 顶栏：筛选 + 计数
  // ======================================================================

  function renderFilters() {
    const counts = {};
    for (const p of state.places) {
      const k = catOf(p.category).key;
      counts[k] = (counts[k] || 0) + 1;
    }
    const f = state.filter;
    $("#filters").innerHTML =
      `<button type="button" class="chip${f ? "" : " is-on"}" data-k="" aria-pressed="${!f}">全部 <span class="n">${state.places.length}</span></button>` +
      C.categories
        .map((c) => {
          const on = !!f && f.has(c.key);
          return `<button type="button" class="chip${on ? " is-on" : ""}" style="--c:${c.color}" data-k="${esc(c.key)}" aria-pressed="${on}">${c.icon} ${esc(c.label)} <span class="n">${counts[c.key] || 0}</span></button>`;
        })
        .join("");
  }

  $("#filters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const k = chip.dataset.k;
    if (!k) state.filter = null;
    else if (!state.filter) state.filter = new Set([k]);
    else {
      state.filter.has(k) ? state.filter.delete(k) : state.filter.add(k);
      if (!state.filter.size || state.filter.size === C.categories.length) state.filter = null;
    }
    if (state.selectedId && !isVisible(placeById(state.selectedId))) closeDetail();
    renderAll();
  });

  function renderCount() {
    const total = state.places.length;
    const shown = state.places.filter(isVisible).length;
    $("#count").textContent = !total ? "还没有地点" : shown === total ? `${total} 个地点` : `显示 ${shown} / ${total}`;
  }

  function renderAll() {
    renderFilters();
    renderCount();
    renderMarkers();
  }

  // ======================================================================
  // 详情卡片
  // ======================================================================

  const detailEl = $("#detail");

  function openDetail(id, { pan = true } = {}) {
    const p = placeById(id);
    if (!p) return;
    const prev = state.selectedId;
    state.selectedId = id;
    if (prev !== id) refreshPin(prev);
    refreshPin(id);

    const c = catOf(p.category);
    const imgs = Array.isArray(p.images) ? p.images : [];
    const links = Array.isArray(p.links) ? p.links : [];
    const addr = [p.unit, p.address, p.postal ? `新加坡 ${p.postal}` : ""].filter(Boolean).join(" · ");
    const edited = p.updated_by && new Date(p.updated_at) - new Date(p.created_at) > 60_000;

    detailEl.innerHTML = `
      <span class="detail-handle" aria-hidden="true"></span>
      <button type="button" class="detail-close" data-close-detail aria-label="关闭">×</button>
      ${
        imgs.length
          ? `<div class="carousel">
              <div class="carousel-track">${imgs
                .map(
                  (im, i) =>
                    `<button type="button" data-zoom="${i}" aria-label="查看大图 ${i + 1}"><img src="${esc(imgUrl(im.path))}" alt="${esc(p.name)} 图 ${i + 1}" loading="${i ? "lazy" : "eager"}" decoding="async"></button>`,
                )
                .join("")}</div>
              ${imgs.length > 1 ? `<span class="carousel-counter">1 / ${imgs.length}</span>` : ""}
            </div>`
          : ""
      }
      <div class="detail-body">
        <span class="cat-badge" style="--c:${c.color}">${c.icon} ${esc(c.label)}</span>
        <h2>${esc(p.name)}</h2>
        ${addr ? `<p class="addr">${esc(addr)}</p>` : ""}
        ${p.note ? `<p class="note">${esc(p.note)}</p>` : ""}
        ${
          links.length
            ? `<div class="links">${links
                .map((u) => {
                  const s = linkSource(u);
                  return `<a class="src-link" href="${esc(u)}" target="_blank" rel="noopener noreferrer"><span class="src-tag" style="--c:${s.color}">${esc(s.label)}</span><span class="src-url">${esc(shortUrl(u))}</span><span class="src-open">打开原帖 ›</span></a>`;
                })
                .join("")}</div>`
            : ""
        }
        <div class="detail-actions">
          <a class="secondary-btn" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener noreferrer">导航</a>
          <button type="button" class="secondary-btn" data-edit>编辑</button>
        </div>
        <p class="meta">${esc(p.created_by)} 添加于 ${fmtDate(p.created_at)}${edited ? ` · ${esc(p.updated_by)} 编辑于 ${fmtDate(p.updated_at)}` : ""}</p>
      </div>`;
    detailEl.classList.toggle("no-images", !imgs.length);
    detailEl.hidden = false;
    detailEl.scrollTop = 0;
    document.body.classList.add("panel-open");
    history.replaceState(null, "", `#p=${id}`);

    const track = $(".carousel-track", detailEl);
    const counter = $(".carousel-counter", detailEl);
    if (track && counter) {
      track.addEventListener("scroll", () => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        counter.textContent = `${i + 1} / ${imgs.length}`;
      }, { passive: true });
    }
    if (pan) panIntoView(id);
  }

  function closeDetail() {
    if (detailEl.hidden) return;
    const prev = state.selectedId;
    state.selectedId = null;
    refreshPin(prev);
    detailEl.hidden = true;
    detailEl.innerHTML = "";
    document.body.classList.remove("panel-open");
    history.replaceState(null, "", location.pathname + location.search);
  }

  detailEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-detail]")) return closeDetail();
    const zoom = e.target.closest("[data-zoom]");
    if (zoom) return openLightbox(placeById(state.selectedId), Number(zoom.dataset.zoom));
    if (e.target.closest("[data-edit]")) {
      const p = placeById(state.selectedId);
      if (!p) return;
      if (hasAuth()) openEditor(p);
      else ensureAuth().then((ok) => ok && openEditor(p));
    }
  });

  // 让选中的标记露在卡片上方（手机）或卡片左侧（电脑）；太远时顺便放大到街道级别
  function panIntoView(id) {
    requestAnimationFrame(() => {
      const m = state.markers.get(id);
      if (!m) return;
      const size = map.getSize();
      const rect = detailEl.getBoundingClientRect();
      const headerH = $(".topbar").getBoundingClientRect().bottom;
      const box = DESKTOP()
        ? { x0: 40, x1: rect.left - 40, y0: headerH + 20, y1: size.y - 40 }
        : { x0: 30, x1: size.x - 30, y0: headerH + 24, y1: rect.top - 24 };
      const z = Math.max(map.getZoom(), 15);
      if (z === map.getZoom()) {
        const cp = map.latLngToContainerPoint(m.getLatLng()).add([m.sg.dx, m.sg.dy]);
        if (cp.x >= box.x0 && cp.x <= box.x1 && cp.y >= box.y0 && cp.y <= box.y1) return;
      }
      const target = map.project(m.getLatLng(), z).add([m.sg.dx, m.sg.dy]);
      const offset = L.point((box.x0 + box.x1) / 2 - size.x / 2, (box.y0 + box.y1) / 2 - size.y / 2);
      map.setView(map.unproject(target.subtract(offset), z), z, { animate: true });
    });
  }

  // ======================================================================
  // 大图查看
  // ======================================================================

  const lightbox = $("#lightbox");
  const lbTrack = $("#lightbox-track");
  const lbCounter = $("#lightbox-counter");

  function openLightbox(p, start) {
    if (!p) return;
    const imgs = p.images || [];
    lbTrack.innerHTML = imgs.map((im, i) => `<img src="${esc(imgUrl(im.path))}" alt="${esc(p.name)} 图 ${i + 1}">`).join("");
    lightbox.hidden = false;
    lbCounter.textContent = imgs.length > 1 ? `${start + 1} / ${imgs.length}` : "";
    requestAnimationFrame(() => (lbTrack.scrollLeft = start * lbTrack.clientWidth));
  }
  function closeLightbox() {
    lightbox.hidden = true;
    lbTrack.innerHTML = "";
  }
  lbTrack.addEventListener("scroll", () => {
    const n = lbTrack.children.length;
    if (n > 1) lbCounter.textContent = `${Math.round(lbTrack.scrollLeft / lbTrack.clientWidth) + 1} / ${n}`;
  }, { passive: true });
  $("#lightbox-close").addEventListener("click", closeLightbox);
  lbTrack.addEventListener("click", closeLightbox);

  // ======================================================================
  // 添加 / 编辑
  // ======================================================================

  const editorEl = $("#editor");
  const formEl = $("#place-form");
  const f = {
    postal: $("#f-postal"),
    kw: $("#f-kw"),
    address: $("#f-address"),
    name: $("#f-name"),
    unit: $("#f-unit"),
    link: $("#f-link"),
    note: $("#f-note"),
    file: $("#f-file"),
  };
  let form = null; // 当前编辑状态
  let miniMap = null;
  let miniMarker = null;

  function newFormState(place) {
    return {
      id: place?.id || null,
      loc: place ? { lat: place.lat, lng: place.lng } : null,
      category: place ? catOf(place.category).key : null,
      images: (place?.images || []).map((im) => ({ ...im, url: imgUrl(im.path) })),
      links: [...(place?.links || [])],
      dirty: false,
      saving: false,
      lastSearch: "",
    };
  }

  function openEditor(place) {
    form = newFormState(place);
    $("#editor-title").textContent = place ? "编辑地点" : "添加地点";
    f.postal.value = place?.postal || "";
    f.kw.value = "";
    f.address.value = place?.address || "";
    f.name.value = place?.name || "";
    f.unit.value = place?.unit || "";
    f.link.value = "";
    f.note.value = place?.note || "";
    $("#kw-box").hidden = true;
    $("#search-results").innerHTML = "";
    setLocStatus(place ? "" : "输入 6 位邮编会自动定位");
    $("#delete-zone").hidden = !place;
    renderCatPick();
    renderThumbs();
    renderLinks();
    updateWho();

    editorEl.hidden = false;
    document.body.classList.add("editor-open");
    $(".editor-body", editorEl).scrollTop = 0;
    if (form.loc) showLocation(18);
    else $("#loc-field").hidden = true;
    if (!place) f.postal.focus();
  }

  function closeEditor(force = false) {
    if (!form) return;
    if (!force && form.dirty && !confirm("放弃还没保存的内容吗？")) return;
    for (const im of form.images) if (im.blob && im.url) URL.revokeObjectURL(im.url);
    form = null;
    editorEl.hidden = true;
    document.body.classList.remove("editor-open");
  }

  formEl.addEventListener("input", () => form && (form.dirty = true));
  $("[data-close-editor]").addEventListener("click", () => closeEditor());

  function setLocStatus(msg, isError = false) {
    const el = $("#loc-status");
    el.textContent = msg;
    el.classList.toggle("is-error", isError);
  }

  // ----- 位置：邮编 / 关键词 / 手动 -----

  f.postal.addEventListener("input", () => {
    const v = f.postal.value.replace(/\D/g, "").slice(0, 6);
    if (v !== f.postal.value) f.postal.value = v;
    if (v.length === 6 && v !== form.lastSearch) searchPostal(v);
  });
  f.postal.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchPostal(f.postal.value);
    }
  });
  $("#f-postal-go").addEventListener("click", () => searchPostal(f.postal.value));

  async function searchPostal(v) {
    if (!/^\d{6}$/.test(v)) return setLocStatus("邮编应该是 6 位数字", true);
    form.lastSearch = v;
    setLocStatus("查找中…");
    $("#search-results").innerHTML = "";
    try {
      const r = await api("search", { q: v });
      if (!form) return;
      const list = r.results.filter((x) => x.postal === v);
      if (!list.length) {
        setLocStatus("没查到这个邮编。可以用店名 / 地址搜索，或在地图上手动选点。", true);
        $("#kw-box").hidden = false;
        return;
      }
      if (list.length > 1) renderResults(list, "postal");
      pickResult(list[0], "postal");
      setLocStatus(list.length > 1 ? `这个邮编有 ${list.length} 个结果，已选第一个，可点选更准确的` : `已定位：${prettyAddress(list[0])}`);
      if (!f.name.value.trim()) f.name.focus({ preventScroll: true });
    } catch (e) {
      form && (form.lastSearch = "");
      setLocStatus(e.message, true);
      handleError(e);
    }
  }

  $("#kw-toggle").addEventListener("click", () => {
    $("#kw-box").hidden = false;
    f.kw.value ||= f.name.value.trim();
    f.kw.focus();
  });
  f.kw.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchKeyword();
    }
  });
  $("#f-kw-go").addEventListener("click", searchKeyword);

  async function searchKeyword() {
    const q = f.kw.value.trim();
    if (!q) return f.kw.focus();
    setLocStatus("搜索中…");
    $("#search-results").innerHTML = "";
    try {
      const r = await api("search", { q });
      if (!form) return;
      if (!r.results.length) return setLocStatus("没找到，换个关键词试试，或在地图上手动选点。", true);
      renderResults(r.results.slice(0, 10), "kw");
      setLocStatus(`找到 ${r.found} 个结果，点选一个`);
    } catch (e) {
      setLocStatus(e.message, true);
      handleError(e);
    }
  }

  let lastResults = [];
  function renderResults(list, mode) {
    lastResults = list.map((r) => ({ ...r, mode }));
    $("#search-results").innerHTML = lastResults
      .map(
        (r, i) =>
          `<button type="button" class="result" data-r="${i}">${esc(titleCase(r.title))}<small>${esc(titleCase(r.address))}</small></button>`,
      )
      .join("");
  }

  $("#search-results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-r]");
    if (!b) return;
    const r = lastResults[Number(b.dataset.r)];
    pickResult(r, r.mode);
    setLocStatus(`已定位：${prettyAddress(r)}`);
  });

  function pickResult(r, mode) {
    form.loc = { lat: r.lat, lng: r.lng };
    form.dirty = true;
    f.address.value = prettyAddress(r);
    if (r.postal && /^\d{6}$/.test(r.postal)) {
      f.postal.value = r.postal;
      form.lastSearch = r.postal;
    }
    if (mode === "kw" && !f.name.value.trim() && r.title) f.name.value = titleCase(r.title);
    const idx = lastResults.indexOf(r);
    document.querySelectorAll("#search-results .result").forEach((el, i) => el.classList.toggle("is-picked", i === idx));
    showLocation(18);
  }

  $("#manual-pin").addEventListener("click", () => {
    const c = map.getCenter();
    form.loc = SG_BOUNDS.contains(c) ? { lat: c.lat, lng: c.lng } : { lat: C.map.center[0], lng: C.map.center[1] };
    form.dirty = true;
    showLocation(Math.max(map.getZoom(), 15));
    setLocStatus("拖动标记，或直接点按小地图，放到店的位置");
  });

  function showLocation(zoom) {
    $("#loc-field").hidden = false;
    const ll = [form.loc.lat, form.loc.lng];
    if (!miniMap) {
      miniMap = L.map("mini-map", {
        center: ll,
        zoom,
        minZoom: 11,
        maxZoom: 19,
        maxBounds: SG_BOUNDS,
        zoomControl: false,
        attributionControl: false,
      });
      addBasemap(miniMap);
      L.control.attribution({ position: "bottomleft", prefix: false }).addTo(miniMap);
      miniMarker = L.marker(ll, { draggable: true, autoPan: true, icon: miniIcon() }).addTo(miniMap);
      miniMarker.on("dragend", () => {
        const p = miniMarker.getLatLng();
        form.loc = { lat: p.lat, lng: p.lng };
        form.dirty = true;
        setLocStatus("位置已微调");
      });
      miniMap.on("click", (e) => {
        miniMarker.setLatLng(e.latlng);
        form.loc = { lat: e.latlng.lat, lng: e.latlng.lng };
        form.dirty = true;
        setLocStatus("位置已微调");
      });
    }
    requestAnimationFrame(() => {
      miniMap.invalidateSize();
      miniMap.setView(ll, zoom, { animate: false });
      miniMarker.setLatLng(ll);
      miniMarker.setIcon(miniIcon());
    });
  }

  function miniIcon() {
    const c = catOf(form?.category || "other");
    return L.divIcon({
      className: "pin-wrap",
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      html: `<div class="pin is-selected" style="--c:${c.color};--s:40px"><span>${c.icon}</span></div>`,
    });
  }

  // ----- 类别 -----

  function renderCatPick() {
    $("#f-cats").innerHTML = C.categories
      .map(
        (c) =>
          `<button type="button" class="cat-opt" role="radio" aria-checked="${form.category === c.key}" data-k="${esc(c.key)}" style="--c:${c.color}">${c.icon} ${esc(c.label)}${c.hint ? `<small>${esc(c.hint)}</small>` : ""}</button>`,
      )
      .join("");
  }

  $("#f-cats").addEventListener("click", (e) => {
    const b = e.target.closest(".cat-opt");
    if (!b) return;
    form.category = b.dataset.k;
    form.dirty = true;
    renderCatPick();
    if (miniMarker) miniMarker.setIcon(miniIcon());
  });

  // ----- 图片：浏览器端压缩 -----

  let webpOk = null;
  function canEncodeWebp() {
    if (webpOk === null) {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      webpOk = c.toDataURL("image/webp").startsWith("data:image/webp");
    }
    return webpOk;
  }

  async function compressImage(file) {
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode(); // <img> 会按 EXIF 方向自动摆正
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const target = C.image.targetKB * 1024;
      const type = canEncodeWebp() ? "image/webp" : "image/jpeg";
      let scale = Math.min(1, C.image.maxSide / Math.max(W, H));
      let blob = null;
      let w = 0;
      let h = 0;
      for (let attempt = 0; attempt < 5; attempt++) {
        w = Math.max(1, Math.round(W * scale));
        h = Math.max(1, Math.round(H * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        for (const q of [0.86, 0.78, 0.7, 0.62, 0.54, 0.46]) {
          blob = await new Promise((r) => canvas.toBlob(r, type, q));
          if (blob && blob.size <= target) break;
        }
        canvas.width = canvas.height = 0; // 释放内存（iOS 对画布内存很敏感）
        if (blob && blob.size <= target * 1.1) break;
        scale *= 0.82;
      }
      if (!blob) throw new Error("图片压缩失败");
      return { blob, w, h, url: URL.createObjectURL(blob) };
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  f.file.addEventListener("change", async () => {
    const files = [...f.file.files];
    f.file.value = "";
    if (!form || !files.length) return;
    const room = MAX_IMAGES - form.images.length;
    if (files.length > room) toast(`最多 ${MAX_IMAGES} 张图片，多出来的没有加入`, true);
    const myForm = form;
    for (const file of files.slice(0, Math.max(0, room))) {
      const item = { busy: true };
      myForm.images.push(item);
      renderThumbs();
      try {
        Object.assign(item, await compressImage(file), { busy: false });
      } catch {
        myForm.images.splice(myForm.images.indexOf(item), 1);
        toast("有一张图片读不出来（格式可能不支持），换一张试试", true);
      }
      if (form === myForm) renderThumbs();
    }
    myForm.dirty = true;
  });

  const ADD_THUMB = `<label class="thumb add-thumb" for="f-file"><span aria-hidden="true">＋</span><small>选图片</small></label>`;
  function renderThumbs() {
    $("#f-images").innerHTML =
      form.images
        .map(
          (im, i) =>
            `<div class="thumb${im.busy ? " is-busy" : ""}" data-i="${i}" role="button" tabindex="0" aria-label="${i === 0 ? "封面图" : `图 ${i + 1}，点按设为封面`}">${
              im.url ? `<img src="${esc(im.url)}" alt="">` : ""
            }${i === 0 ? '<span class="cover-tag">封面</span>' : ""}${im.busy ? "" : `<button type="button" class="rm" data-rm="${i}" aria-label="删掉这张">×</button>`}</div>`,
        )
        .join("") + (form.images.length < MAX_IMAGES ? ADD_THUMB : "");
  }

  $("#f-images").addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]");
    if (rm) {
      const [im] = form.images.splice(Number(rm.dataset.rm), 1);
      if (im?.blob && im.url) URL.revokeObjectURL(im.url);
      form.dirty = true;
      return renderThumbs();
    }
    const t = e.target.closest(".thumb[data-i]");
    if (t) {
      const i = Number(t.dataset.i);
      if (i > 0 && !form.images[i].busy) {
        form.images.unshift(...form.images.splice(i, 1));
        form.dirty = true;
        renderThumbs();
        toast("已设为封面");
      }
    }
  });

  // ----- 链接 -----

  function absorbLinks(silent = false) {
    if (!form) return;
    const text = f.link.value;
    if (!text.trim()) return;
    const urls = extractUrls(text);
    if (!urls.length) {
      if (!silent) toast("这段文字里没找到网址", true);
      return;
    }
    let added = 0;
    for (const u of urls) {
      if (!form.links.includes(u) && form.links.length < 10) {
        form.links.push(u);
        added++;
      }
    }
    f.link.value = "";
    form.dirty = true;
    renderLinks();
    if (!silent && added) toast(`已提取 ${added} 个链接`);
  }

  f.link.addEventListener("paste", () => setTimeout(() => absorbLinks(), 0));
  f.link.addEventListener("blur", () => absorbLinks(true));
  f.link.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      absorbLinks();
    }
  });

  function renderLinks() {
    $("#f-links").innerHTML = form.links
      .map((u, i) => {
        const s = linkSource(u);
        return `<div class="link-item"><span class="src-tag" style="--c:${s.color}">${esc(s.label)}</span><span class="src-url">${esc(shortUrl(u))}</span><button type="button" class="rm" data-rm-link="${i}" aria-label="删除这个链接">×</button></div>`;
      })
      .join("");
  }

  $("#f-links").addEventListener("click", (e) => {
    const b = e.target.closest("[data-rm-link]");
    if (!b) return;
    form.links.splice(Number(b.dataset.rmLink), 1);
    form.dirty = true;
    renderLinks();
  });

  // ----- 保存 -----

  function fail(msg, focusEl) {
    toast(msg, true);
    if (focusEl) {
      const el = typeof focusEl === "string" ? $(focusEl) : focusEl;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      if (el.focus) el.focus({ preventScroll: true });
    }
  }

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form || form.saving) return;
    absorbLinks(true);
    const name = f.name.value.trim();
    if (!form.loc) return fail("请先定位：输入邮编、搜索店名，或手动选点", f.postal);
    if (!name) return fail("请填写店名", f.name);
    if (!form.category) return fail("请选一个类别", "#f-cats");
    if (form.images.some((i) => i.busy)) return fail("图片还在压缩，稍等一下");
    if (!(await ensureAuth())) return;

    const btn = $("#save-btn");
    const myForm = form;
    myForm.saving = true;
    btn.disabled = true;
    const uploaded = [];
    try {
      const pending = myForm.images.filter((im) => !im.path);
      for (let i = 0; i < pending.length; i++) {
        btn.textContent = `上传图片 ${i + 1}/${pending.length}…`;
        const im = pending[i];
        const fd = new FormData();
        fd.append("file", im.blob, im.blob.type === "image/webp" ? "image.webp" : "image.jpg");
        const r = await api("upload", null, fd);
        im.path = r.path;
        uploaded.push(im);
      }
      btn.textContent = "保存中…";
      const place = {
        name,
        category: myForm.category,
        postal: /^\d{6}$/.test(f.postal.value) ? f.postal.value : null,
        address: f.address.value.trim() || null,
        unit: f.unit.value.trim() || null,
        lat: myForm.loc.lat,
        lng: myForm.loc.lng,
        images: myForm.images.map((im) => ({ path: im.path, w: im.w || 0, h: im.h || 0 })),
        links: myForm.links,
        note: f.note.value.trim() || null,
      };
      const r = myForm.id ? await api("update", { id: myForm.id, place }) : await api("create", { place });
      upsertLocal(r.place);
      closeEditor(true);
      renderAll();
      openDetail(r.place.id);
      toast(myForm.id ? "已保存修改" : "已添加到地图");
    } catch (err) {
      // 保存失败：把这次刚上传的图片清掉，下次重试会重新上传
      if (uploaded.length) {
        api("discard", { paths: uploaded.map((im) => im.path) }).catch(() => {});
        for (const im of uploaded) delete im.path;
      }
      handleError(err);
    } finally {
      myForm.saving = false;
      btn.disabled = false;
      btn.textContent = "保存";
    }
  });

  // ----- 删除 -----

  $("#delete-btn").addEventListener("click", async () => {
    if (!form?.id) return;
    const p = placeById(form.id);
    if (!confirm(`确定删除「${p?.name || "这个地点"}」吗？图片会一起删除，无法恢复。`)) return;
    if (!(await ensureAuth())) return;
    const btn = $("#delete-btn");
    btn.disabled = true;
    try {
      await api("delete", { id: form.id });
      state.places = state.places.filter((x) => x.id !== form.id);
      closeEditor(true);
      closeDetail();
      renderAll();
      toast("已删除");
    } catch (err) {
      handleError(err);
    } finally {
      btn.disabled = false;
    }
  });

  // ======================================================================
  // 其他交互
  // ======================================================================

  $("#add-btn").addEventListener("click", () => {
    // 已有口令时同步打开，手机上才能直接弹出数字键盘
    if (hasAuth()) openEditor();
    else ensureAuth().then((ok) => ok && openEditor());
  });

  $("#who-btn").addEventListener("click", () => {
    if (confirm(`当前以「${state.auth.nickname}」的身份编辑。\n退出后，下次添加或编辑要重新输入口令。确定退出吗？`)) {
      saveAuth({ passcode: "", nickname: state.auth.nickname });
      toast("已退出编辑身份");
    }
  });

  let meMarker = null;
  $("#locate-btn").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("这个浏览器不支持定位", true);
    toast("定位中…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
        if (!SG_BOUNDS.contains(ll)) return toast("你现在好像不在新加坡", true);
        if (!meMarker) {
          meMarker = L.marker(ll, {
            interactive: false,
            keyboard: false,
            icon: L.divIcon({ className: "pin-wrap", iconSize: [16, 16], html: '<div class="me-dot"></div>' }),
          }).addTo(map);
        } else meMarker.setLatLng(ll);
        map.setView(ll, Math.max(map.getZoom(), 16));
        toast("已定位到你的位置");
      },
      () => toast("拿不到位置，需要允许浏览器使用定位", true),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!lightbox.hidden) closeLightbox();
    else if (!editorEl.hidden) closeEditor();
    else closeDetail();
  });

  // 切回这个页面时自动刷新数据，看到朋友们的新添加
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - state.lastLoad > 30_000 && editorEl.hidden) {
      loadPlaces().catch(() => {});
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (form?.dirty) e.preventDefault();
  });

  // ======================================================================
  // 启动
  // ======================================================================

  updateWho();
  renderAll();
  loadPlaces()
    .then(() => {
      const m = location.hash.match(/^#p=([0-9a-f-]{36})$/);
      const p = m && placeById(m[1]);
      if (p) {
        map.setView([p.lat, p.lng], 17, { animate: false });
        openDetail(p.id);
      }
    })
    .catch((e) => toast(`${e.message}，请刷新重试`, true, 6000));

  // 方便调试 / 自动测试
  window.sgmap = { state, map, extractUrls, linkSource };
})();
