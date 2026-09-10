(() => {
  const out = { viewport: { w: innerWidth, h: innerHeight }, doc: {}, occlusion: [], clipped: [], stickyActions: [], tableScrollers: [], dialogs: [] };
  const root = document.documentElement;
  out.doc = {
    scrollWidth: root.scrollWidth, clientWidth: root.clientWidth,
    overflowX: root.scrollWidth > root.clientWidth + 1,
    overflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
  };

  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const nameOf = (el) => el ? (el.tagName.toLowerCase()
    + (el.getAttribute && el.getAttribute("data-testid") ? "[" + el.getAttribute("data-testid") + "]" : "")
    + (el.className && typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "")) : "none";

  const controls = [...document.querySelectorAll("button, a[href], input, select, textarea, [role=tab], [contenteditable=true]")];
  for (const el of controls) {
    if (!isVisible(el)) continue;
    if (el.closest("[inert]") || el.hasAttribute("inert")) continue;
    if (el.getAttribute("aria-hidden") === "true") continue;
    if (getComputedStyle(el).pointerEvents === "none") continue;
    const r = el.getBoundingClientRect();
    // 完全在视口外：正常滚动内容，跳过（含焦点前隐藏的 skip link）
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const inside = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
    if (!inside) { out.clipped.push({ target: nameOf(el), rect: { top: Math.round(r.top), bottom: Math.round(r.bottom) } }); continue; }
    const top = document.elementFromPoint(cx, cy);
    if (!top) { out.occlusion.push({ target: nameOf(el), reason: "no-element-at-point", at: [Math.round(cx), Math.round(cy)] }); continue; }
    if (!(top === el || el.contains(top) || top.contains(el))) {
      out.occlusion.push({ target: nameOf(el), reason: "covered-by", coveredBy: nameOf(top), at: [Math.round(cx), Math.round(cy)] });
    }
  }

  // 底部 sticky/fixed chrome 里的"主操作"按钮，逐个验证中心点命中自己
  for (const chrome of document.querySelectorAll("footer, div, section")) {
    const s = getComputedStyle(chrome);
    if (s.position !== "sticky" && s.position !== "fixed") continue;
    if (!isVisible(chrome)) continue;
    const cr = chrome.getBoundingClientRect();
    if (cr.bottom < innerHeight - 2) continue;           // 只关心贴底 chrome
    if (cr.height > innerHeight * 0.5) continue;          // 排除整页容器
    for (const btn of chrome.querySelectorAll("button, a[href]")) {
      if (!isVisible(btn)) continue;
      const br = btn.getBoundingClientRect();
      const cx = br.left + br.width / 2, cy = br.top + br.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      const top = document.elementFromPoint(cx, cy);
      out.stickyActions.push({
        chrome: nameOf(chrome), action: nameOf(btn), label: (btn.textContent || "").trim().slice(0, 20),
        hitsItself: Boolean(top && (top === btn || btn.contains(top) || top.contains(btn))),
        coveredBy: top && !(top === btn || btn.contains(top) || top.contains(btn)) ? nameOf(top) : null,
      });
    }
  }

  for (const el of document.querySelectorAll("div, section")) {
    const s = getComputedStyle(el);
    if (!/auto|scroll/.test(s.overflowX)) continue;
    if (!isVisible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1) out.tableScrollers.push({ el: nameOf(el), clientWidth: el.clientWidth, scrollWidth: el.scrollWidth });
  }

  for (const el of document.querySelectorAll("[role=dialog], [role=alertdialog]")) {
    if (!isVisible(el)) continue;
    const r = el.getBoundingClientRect();
    out.dialogs.push({ el: nameOf(el), fitsViewport: r.top >= -1 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1,
      rect: { top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom), right: Math.round(r.right) } });
  }

  out.summary = {
    occlusionCount: out.occlusion.length,
    clippedAtEdge: out.clipped.length,
    docOverflowX: out.doc.overflowX,
    stickyActionsChecked: out.stickyActions.length,
    stickyActionsCovered: out.stickyActions.filter((a) => !a.hitsItself).length,
    dialogsOutOfViewport: out.dialogs.filter((d) => !d.fitsViewport).length,
  };
  return JSON.stringify(out);
})()
