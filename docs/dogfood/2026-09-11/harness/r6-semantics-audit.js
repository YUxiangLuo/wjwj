(() => {
  const nameOf = (el) => el ? (el.tagName.toLowerCase()
    + (el.getAttribute && el.getAttribute("data-testid") ? "[" + el.getAttribute("data-testid") + "]" : "")) : "none";
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"; };

  const out = {
    tables: [], inputsWithoutName: [], invalidWithoutDescription: [], imagesWithoutAlt: [],
    svgWithoutLabel: [], liveRegions: [], positiveTabindex: [], ariaHiddenFocusable: [],
  };

  for (const table of document.querySelectorAll("table")) {
    if (!visible(table)) continue;
    const ths = [...table.querySelectorAll("th")];
    out.tables.push({
      el: nameOf(table),
      thCount: ths.length,
      scopedTh: ths.filter((th) => th.hasAttribute("scope")).length,
      hasCaption: Boolean(table.querySelector("caption")) || Boolean(table.getAttribute("aria-label")) || Boolean(table.getAttribute("aria-labelledby")),
    });
  }

  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (!visible(el)) continue;
    if (el.type === "hidden") continue;
    const hasName = Boolean(el.getAttribute("aria-label"))
      || Boolean(el.getAttribute("aria-labelledby"))
      || Boolean(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
      || Boolean(el.closest("label"));
    if (!hasName) out.inputsWithoutName.push(nameOf(el) + (el.id ? "#" + el.id : ""));
  }

  for (const el of document.querySelectorAll("[aria-invalid=true]")) {
    const described = el.getAttribute("aria-describedby");
    const ok = Boolean(described) && described.split(/\s+/).every((id) => document.getElementById(id));
    if (!ok) out.invalidWithoutDescription.push(nameOf(el) + (el.id ? "#" + el.id : ""));
  }

  for (const img of document.querySelectorAll("img")) {
    if (!visible(img)) continue;
    if (!img.hasAttribute("alt") && img.getAttribute("role") !== "presentation") out.imagesWithoutAlt.push(nameOf(img));
  }

  for (const svg of document.querySelectorAll("svg")) {
    if (!visible(svg)) continue;
    if (svg.closest("button, a")) continue;                       // 图标按钮由父级提供名称
    const r = svg.getBoundingClientRect();
    if (r.width < 120 || r.height < 80) continue;                  // 只看图表级图形
    const labelled = Boolean(svg.getAttribute("aria-label") || svg.getAttribute("aria-labelledby") || svg.querySelector("title"))
      || Boolean(svg.closest("[role=img]"))
      || Boolean(svg.parentElement && svg.parentElement.getAttribute("role") === "img");
    if (!labelled) out.svgWithoutLabel.push(nameOf(svg) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  for (const el of document.querySelectorAll("[aria-live], [role=status], [role=alert], [role=log]")) {
    if (!visible(el)) continue;
    out.liveRegions.push({ el: nameOf(el), role: el.getAttribute("role") || "aria-live=" + el.getAttribute("aria-live"), live: el.getAttribute("aria-live") });
  }

  for (const el of document.querySelectorAll("[tabindex]")) {
    const v = Number(el.getAttribute("tabindex"));
    if (v > 0) out.positiveTabindex.push(nameOf(el) + " tabindex=" + v);
  }

  for (const el of document.querySelectorAll("[aria-hidden=true]")) {
    const focusable = el.querySelector("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (focusable && visible(focusable)) out.ariaHiddenFocusable.push(nameOf(el) + " contains " + nameOf(focusable));
  }

  out.summary = {
    tables: out.tables.length,
    tablesWithUnscopedHeaders: out.tables.filter((t) => t.thCount > 0 && t.scopedTh === 0).length,
    inputsWithoutName: out.inputsWithoutName.length,
    invalidWithoutDescription: out.invalidWithoutDescription.length,
    imagesWithoutAlt: out.imagesWithoutAlt.length,
    svgChartsWithoutLabel: out.svgWithoutLabel.length,
    liveRegions: out.liveRegions.length,
    positiveTabindex: out.positiveTabindex.length,
    ariaHiddenFocusable: out.ariaHiddenFocusable.length,
  };
  return JSON.stringify(out);
})()
