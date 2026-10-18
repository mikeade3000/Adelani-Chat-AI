/* ══════════════════════════════════════════════════════════════════════════
   GRACE STUDIO PRO — Adelani AI's presentation engine
   Turns Grace's JSON design into a professional, fully editable .pptx in the
   browser (PptxGenJS). Free: no paid API, no server.

   What makes the decks stand out:
   • Designer themes with painted gradient backgrounds (rendered on a canvas)
   • AI photography (Pollinations, free) on covers, sections, quotes and image
     slides, with a colour overlay so text stays readable
   • 16 layouts incl. agenda, timeline, process, native editable charts,
     comparison, SWOT matrix, image split and closing slides
   • Colour icons rendered as images (look the same in every PowerPoint)
   • Speaker notes, slide numbers, consistent spacing and typography

   Public API: window.GraceStudio.buildDeck(spec, onProgress)
               → {url, filename, count, preview}
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const W = 13.333, H = 7.5;                 // 16:9 in inches
  const PX = 1600, PY = 900;                 // background canvas size
  const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  /* ── Themes ─────────────────────────────────────────────────────────────── */
  const THEMES = {
    adelani:  { name: "Adelani",  mode: "light", c1: "3D0E18", c2: "7A2232", glow1: "D9B86A", glow2: "B23A50", bg: "FFFDF8", tint: "B08D3C", card: "F7F1E6", primary: "7A2232", accent: "B08D3C", accent2: "2F5687", text: "2A2118", muted: "7D6E5B", head: "Georgia", body: "Calibri", pattern: "dots" },
    executive:{ name: "Executive",mode: "light", c1: "0B1A33", c2: "1E3A8A", glow1: "C9A227", glow2: "3B82F6", bg: "FFFFFF", tint: "1E3A8A", card: "F2F5FB", primary: "1E2F5C", accent: "C9A227", accent2: "2563EB", text: "1B2230", muted: "5A6470", head: "Georgia", body: "Calibri", pattern: "lines" },
    aurora:   { name: "Aurora",   mode: "light", c1: "0F172A", c2: "3B1C8C", glow1: "22D3EE", glow2: "A78BFA", bg: "FFFFFF", tint: "7C3AED", card: "F5F3FF", primary: "312E81", accent: "7C3AED", accent2: "0891B2", text: "1E1B3A", muted: "6B6A85", head: "Century Gothic", body: "Calibri", pattern: "dots" },
    obsidian: { name: "Obsidian", mode: "dark",  c1: "09090B", c2: "1C1917", glow1: "D4AF37", glow2: "7C5C1E", bg: "111113", tint: "D4AF37", card: "1C1C20", primary: "F2E3B3", accent: "D4AF37", accent2: "A8A29E", text: "F5F5F4", muted: "A8A29E", head: "Georgia", body: "Calibri", pattern: "lines" },
    savanna:  { name: "Savanna",  mode: "light", c1: "5A1E0B", c2: "B4501A", glow1: "F59E0B", glow2: "FDBA74", bg: "FFFBF5", tint: "C2410C", card: "FBF1E6", primary: "7C2D12", accent: "D97706", accent2: "15803D", text: "2B1A10", muted: "7C6553", head: "Georgia", body: "Calibri", pattern: "dots" },
    ocean:    { name: "Ocean",    mode: "light", c1: "062C43", c2: "0E6E8C", glow1: "22D3EE", glow2: "F97316", bg: "FFFFFF", tint: "0891B2", card: "EEF8FB", primary: "0C4A6E", accent: "0891B2", accent2: "F97316", text: "0F2530", muted: "56707C", head: "Century Gothic", body: "Calibri", pattern: "lines" },
    forest:   { name: "Forest",   mode: "light", c1: "052E16", c2: "166534", glow1: "EAB308", glow2: "4ADE80", bg: "FFFFFF", tint: "166534", card: "F0F7F1", primary: "14532D", accent: "CA8A04", accent2: "0F766E", text: "15241A", muted: "5B6B5F", head: "Georgia", body: "Calibri", pattern: "dots" },
    royal:    { name: "Royal",    mode: "dark",  c1: "140B33", c2: "3B1D78", glow1: "E9D5A1", glow2: "A855F7", bg: "17102E", tint: "E9D5A1", card: "221840", primary: "F1E6C8", accent: "E9C46A", accent2: "C084FC", text: "F3EEFF", muted: "B6A9D6", head: "Georgia", body: "Calibri", pattern: "lines" },
    coral:    { name: "Coral",    mode: "light", c1: "3B0A1E", c2: "BE123C", glow1: "FDA4AF", glow2: "FB923C", bg: "FFFFFF", tint: "E11D48", card: "FFF1F3", primary: "9F1239", accent: "E11D48", accent2: "2F3C7E", text: "2A1A20", muted: "766068", head: "Century Gothic", body: "Calibri", pattern: "dots" },
    minimal:  { name: "Minimal",  mode: "light", c1: "111827", c2: "1F2937", glow1: "60A5FA", glow2: "334155", bg: "FFFFFF", tint: "2563EB", card: "F3F5F8", primary: "111827", accent: "2563EB", accent2: "0EA5E9", text: "111827", muted: "6B7280", head: "Arial", body: "Arial", pattern: "none" },
  };
  const ALIASES = { emerald: "forest", midnight: "obsidian", slate: "minimal", teal: "ocean", classic: "adelani", corporate: "executive", luxury: "obsidian", african: "savanna", tech: "aurora" };

  /* ── Small helpers ──────────────────────────────────────────────────────── */
  const num = (v, d) => { const n = Number(v); return isFinite(n) ? n : d; };
  const hex = (c, d) => {
    const s = String(c == null ? "" : c).replace(/^#/, "").trim();
    if (/^[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
    if (/^[0-9A-Fa-f]{3}$/.test(s)) return s.split("").map(x => x + x).join("").toUpperCase();
    return d || "1A1208";
  };
  const str = v => (v == null ? "" : String(v)).trim();
  const cleanTitle = s => str(s).replace(/^\s*slide\s*\d+\s*[:.\-–]\s*/i, "");
  const lum = c => { const h = hex(c); return parseInt(h.slice(0, 2), 16) * 0.299 + parseInt(h.slice(2, 4), 16) * 0.587 + parseInt(h.slice(4, 6), 16) * 0.114; };
  const isDark = c => lum(c) < 140;
  const rgba = (h, a) => { h = hex(h); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
  const imgPrompt = v => (v && typeof v === "object") ? str(v.prompt) : str(v);
  const list = (v, max) => (Array.isArray(v) ? v : []).slice(0, max);
  const itemText = it => (it && typeof it === "object") ? str(it.text || it.desc || it.description) : str(it);
  const itemTitle = it => (it && typeof it === "object") ? str(it.title || it.header || it.name || it.label) : str(it);

  /* ── Canvas painting (backgrounds, photo overlays, icons) ──────────────── */
  function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

  function paintGradient(ctx, w, h, t, variant) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#" + t.c1); g.addColorStop(1, "#" + t.c2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const glow = (x, y, r, col, a) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, rgba(col, a)); rg.addColorStop(1, rgba(col, 0)); ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h); };
    if (variant === "section") { glow(w * 0.15, h * 0.85, w * 0.55, t.glow1, 0.30); glow(w * 0.95, h * 0.05, w * 0.45, t.glow2, 0.35); }
    else { glow(w * 0.88, h * 0.12, w * 0.55, t.glow1, 0.34); glow(w * 0.05, h * 0.95, w * 0.5, t.glow2, 0.38); glow(w * 0.55, h * 0.55, w * 0.35, t.glow2, 0.12); }
    paintPattern(ctx, w, h, t.pattern, "rgba(255,255,255,0.05)");
    grain(ctx, w, h, 10);
  }
  function paintPattern(ctx, w, h, kind, col) {
    ctx.save(); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    if (kind === "dots") { for (let y = 30; y < h; y += 36) for (let x = 30; x < w; x += 36) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); } }
    else if (kind === "lines") { for (let x = -h; x < w; x += 44) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.stroke(); } }
    ctx.restore();
  }
  function grain(ctx, w, h, amt) {
    const d = ctx.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const n = (Math.random() - 0.5) * amt; p[i] += n; p[i + 1] += n; p[i + 2] += n; }
    ctx.putImageData(d, 0, 0);
  }
  /* Dark full-bleed background (cover / section / closing / quote) */
  function darkBackground(t, variant) {
    const c = canvas(PX, PY), ctx = c.getContext("2d");
    paintGradient(ctx, PX, PY, t, variant);
    return c.toDataURL("image/jpeg", 0.9);
  }
  /* Light content background: paper with a faint tinted corner glow */
  function contentBackground(t) {
    const c = canvas(PX, PY), ctx = c.getContext("2d");
    ctx.fillStyle = "#" + t.bg; ctx.fillRect(0, 0, PX, PY);
    const dark = isDark(t.bg);
    const rg = ctx.createRadialGradient(PX, 0, 0, PX, 0, PX * 0.6);
    rg.addColorStop(0, rgba(t.tint, dark ? 0.16 : 0.07)); rg.addColorStop(1, rgba(t.tint, 0));
    ctx.fillStyle = rg; ctx.fillRect(0, 0, PX, PY);
    const rg2 = ctx.createRadialGradient(0, PY, 0, 0, PY, PX * 0.45);
    rg2.addColorStop(0, rgba(t.accent, dark ? 0.10 : 0.05)); rg2.addColorStop(1, rgba(t.accent, 0));
    ctx.fillStyle = rg2; ctx.fillRect(0, 0, PX, PY);
    if (dark) grain(ctx, PX, PY, 6);
    return c.toDataURL("image/jpeg", 0.9);
  }
  /* Photo with a theme-coloured overlay so white text reads well */
  function photoBackground(img, t, style) {
    const c = canvas(PX, PY), ctx = c.getContext("2d");
    const r = Math.max(PX / img.width, PY / img.height), iw = img.width * r, ih = img.height * r;
    ctx.drawImage(img, (PX - iw) / 2, (PY - ih) / 2, iw, ih);
    let g;
    if (style === "center") { g = ctx.createLinearGradient(0, 0, 0, PY); g.addColorStop(0, rgba(t.c1, 0.55)); g.addColorStop(1, rgba(t.c1, 0.85)); }
    else { g = ctx.createLinearGradient(0, 0, PX, 0); g.addColorStop(0, rgba(t.c1, 0.94)); g.addColorStop(0.55, rgba(t.c2, 0.72)); g.addColorStop(1, rgba(t.c2, 0.25)); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, PX, PY);
    return c.toDataURL("image/jpeg", 0.88);
  }
  /* Photo cropped to a box (for split layouts) */
  function photoCrop(img, wIn, hIn) {
    const pw = Math.round(wIn * 120), ph = Math.round(hIn * 120);
    const c = canvas(pw, ph), ctx = c.getContext("2d");
    const r = Math.max(pw / img.width, ph / img.height), iw = img.width * r, ih = img.height * r;
    ctx.drawImage(img, (pw - iw) / 2, (ph - ih) / 2, iw, ih);
    return c.toDataURL("image/jpeg", 0.88);
  }
  /* Emoji → PNG, so icons look identical in every PowerPoint. Returns null if the
     browser has no colour emoji font (then the emoji is placed as text instead). */
  const ICON_CACHE = {};
  function iconImage(emoji) {
    if (!emoji) return null;
    if (emoji in ICON_CACHE) return ICON_CACHE[emoji];
    let out = null;
    try {
      const s = 160, c = canvas(s, s), ctx = c.getContext("2d");
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = `${Math.round(s * 0.78)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif`;
      ctx.fillText(emoji, s / 2, s / 2 + s * 0.04);
      const p = ctx.getImageData(0, 0, s, s).data;
      let colourful = 0, filled = 0;
      for (let i = 0; i < p.length; i += 16) {
        if (p[i + 3] > 40) { filled++; const mx = Math.max(p[i], p[i + 1], p[i + 2]), mn = Math.min(p[i], p[i + 1], p[i + 2]); if (mx - mn > 40) colourful++; }
      }
      if (filled > 30 && colourful > filled * 0.15) out = c.toDataURL("image/png");
    } catch (e) { out = null; }
    ICON_CACHE[emoji] = out;
    return out;
  }

  /* ── AI images (Pollinations — free, no key) ───────────────────────────── */
  const PHOTO_STYLE = ", professional editorial photograph, cinematic soft lighting, rich detail, shallow depth of field, high resolution, no text, no words, no watermark, no logo";
  function photoURL(prompt, w, h) {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + PHOTO_STYLE)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e6)}`;
  }
  async function loadImage(url, ms) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { mode: "cors", signal: ctl.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const b = await r.blob();
      const u = URL.createObjectURL(b);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
      return img;
    } finally { clearTimeout(timer); }
  }

  /* ── The builder ────────────────────────────────────────────────────────── */
  async function buildDeck(spec, onProgress) {
    const say = m => { try { onProgress && onProgress(m); } catch (e) {} };
    if (!window.PptxGenJS) throw new Error("PowerPoint library not loaded");
    const pptx = new window.PptxGenJS();
    pptx.defineLayout({ name: "ADL", width: W, height: H }); pptx.layout = "ADL";
    pptx.title = str(spec.title) || "Presentation";
    pptx.author = "Adelani AI · Grace";
    pptx.company = "Adelani AI";

    /* theme */
    let key = typeof spec.theme === "string" ? spec.theme.toLowerCase().trim() : "adelani";
    key = ALIASES[key] || key;
    const t = { ...(THEMES[key] || THEMES.adelani) };
    if (spec.theme && typeof spec.theme === "object") {
      const o = spec.theme;
      ["primary", "accent", "accent2", "text", "muted", "card", "bg"].forEach(k => { if (o[k]) t[k] = hex(o[k], t[k]); });
      if (o.c1 || o.titleBg) t.c1 = hex(o.c1 || o.titleBg, t.c1);
      if (o.c2) t.c2 = hex(o.c2, t.c2);
      if (o.font) { t.head = o.font; t.body = o.font; }
      if (o.headFont || o.titleFont) t.head = o.headFont || o.titleFont;
      if (o.bodyFont) t.body = o.bodyFont;
    }
    if (spec.font) { t.head = spec.font; t.body = spec.font; }
    const HF = t.head, BF = t.body;
    const darkDeck = t.mode === "dark";
    const TXT = darkDeck ? t.text : t.text, MUT = t.muted;
    const HEAD = darkDeck ? t.primary : t.primary;
    const CHART_COLORS = [t.accent, t.primary, t.accent2, t.muted, t.glow1, t.glow2].map(c => hex(c));
    const SHADOW = { type: "outer", color: "000000", opacity: darkDeck ? 0.45 : 0.12, blur: 12, offset: 3, angle: 90 };

    const slides = Array.isArray(spec.slides) && spec.slides.length ? spec.slides.slice(0, 30) : [{ layout: "title", title: spec.title || "Presentation" }];

    /* photos */
    say("Painting backgrounds…");
    const wanted = [];
    slides.forEach((sd, i) => {
      const lay = str(sd.layout).toLowerCase() || (i === 0 ? "title" : "content");
      const p = imgPrompt(sd.image) || imgPrompt(sd.background && sd.background.image);
      if (p && ["title", "cover", "section", "quote", "image", "image-split", "closing", "content"].includes(lay)) wanted.push(p);
    });
    const prompts = [...new Set(wanted)].slice(0, 6);
    const PHOTOS = {};
    if (prompts.length) {
      let done = 0; say(`Creating ${prompts.length} AI photo${prompts.length > 1 ? "s" : ""}…`);
      await Promise.all(prompts.map(async p => {
        try { PHOTOS[p] = await loadImage(photoURL(p, 1280, 720), 35000); } catch (e) { PHOTOS[p] = null; }
        done++; say(`Creating AI photos (${done}/${prompts.length})…`);
      }));
    }
    const photo = sd => { const p = imgPrompt(sd.image) || imgPrompt(sd.background && sd.background.image); return p ? PHOTOS[p] : null; };

    say("Designing slides…");
    const BG_DARK = darkBackground(t, "cover");
    const BG_SECTION = darkBackground(t, "section");
    const BG_CONTENT = contentBackground(t);
    pptx.defineSlideMaster({ title: "CONTENT", background: { data: BG_CONTENT }, objects: [] });
    pptx.defineSlideMaster({ title: "DARK", background: { data: BG_DARK }, objects: [] });
    pptx.defineSlideMaster({ title: "SECTION", background: { data: BG_SECTION }, objects: [] });

    const footerText = spec.footer !== undefined ? str(spec.footer) : (str(spec.title) ? `${str(spec.title)}  ·  Adelani AI` : "Adelani AI");
    let page = 0;
    const total = slides.length;

    /* reusable pieces */
    const pill = (s, x, y, label, onDark) => {
      if (!label) return;
      const w = Math.min(0.5 + label.length * 0.095, 6);
      s.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.38, fill: { color: t.accent, transparency: onDark ? 10 : 0 }, line: { type: "none" }, rectRadius: 0.19 });
      s.addText(label.toUpperCase(), { x, y, w, h: 0.38, fontFace: BF, fontSize: 10.5, bold: true, color: isDark(t.accent) ? "FFFFFF" : "1A1208", align: "center", valign: "middle", charSpacing: 2.5, margin: 0 });
    };
    const heading = (s, sd, opts = {}) => {
      const x = opts.x != null ? opts.x : 0.75, w = opts.w != null ? opts.w : W - 1.5;
      let y = 0.55;
      if (sd.kicker) { s.addText(str(sd.kicker).toUpperCase(), { x, y, w, h: 0.32, fontFace: BF, fontSize: 11, bold: true, color: t.accent, charSpacing: 3, margin: 0 }); y += 0.36; }
      s.addText(cleanTitle(sd.title), { x, y, w, h: 0.85, fontFace: HF, fontSize: num(sd.titleSize, 32), bold: true, color: opts.color || HEAD, valign: "middle", margin: 0, fit: "shrink" });
      y += 0.92;
      s.addShape(pptx.ShapeType.rect, { x, y, w: 0.9, h: 0.06, fill: { color: t.accent }, line: { type: "none" } });
      y += 0.2;
      if (sd.subtitle) { s.addText(str(sd.subtitle), { x, y, w, h: 0.45, fontFace: BF, fontSize: 15, italic: true, color: opts.mutedColor || MUT, margin: 0 }); y += 0.55; }
      return y + 0.1;
    };
    const footer = (s, onDark, o = {}) => {
      page++;
      const c = onDark ? "C9CED8" : MUT;
      if (footerText) s.addText(footerText, { x: o.x != null ? o.x : 0.75, y: H - 0.5, w: o.w || 8, h: 0.3, fontFace: BF, fontSize: 9, color: c, margin: 0 });
      s.addText(`${String(page + 1).padStart(2, "0")}`, { x: o.numX != null ? o.numX : W - 1.35, y: H - 0.52, w: 0.6, h: 0.32, fontFace: HF, fontSize: 11, bold: true, color: onDark ? t.glow1 : t.accent, align: "right", margin: 0 });
      // progress hairline
      s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.06, w: W, h: 0.06, fill: { color: onDark ? "FFFFFF" : t.primary, transparency: onDark ? 85 : 92 }, line: { type: "none" } });
      s.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.06, w: W * Math.min(1, (page + 1) / total), h: 0.06, fill: { color: t.accent }, line: { type: "none" } });
    };
    const icon = (s, emoji, x, y, sz, chip) => {
      if (chip) s.addShape(pptx.ShapeType.ellipse, { x, y, w: sz, h: sz, fill: { color: t.accent, transparency: darkDeck ? 75 : 86 }, line: { color: t.accent, width: 0.75, transparency: 50 } });
      const e = str(emoji);
      if (!e) { s.addShape(pptx.ShapeType.ellipse, { x: x + sz * 0.38, y: y + sz * 0.38, w: sz * 0.24, h: sz * 0.24, fill: { color: t.accent }, line: { type: "none" } }); return; }
      const png = iconImage(e), pad = sz * 0.22;
      if (png) s.addImage({ data: png, x: x + pad, y: y + pad, w: sz - pad * 2, h: sz - pad * 2 });
      else s.addText(e, { x, y, w: sz, h: sz, fontSize: Math.round(sz * 26), align: "center", valign: "middle", margin: 0 });
    };
    const card = (s, x, y, w, h, opts = {}) => {
      s.addShape(pptx.ShapeType.roundRect, { x, y, w, h, fill: { color: opts.fill || t.card }, line: opts.line ? { color: opts.line, width: 1 } : { type: "none" }, rectRadius: 0.1, shadow: opts.shadow === false ? undefined : SHADOW });
      if (opts.topBar) s.addShape(pptx.ShapeType.rect, { x: x + 0.25, y, w: w - 0.5, h: 0.06, fill: { color: opts.topBar }, line: { type: "none" } });
    };
    const bullets = (items, fs, color) => items.map(b => ({
      text: itemTitle(b) && itemText(b) && typeof b === "object" ? `${itemTitle(b)} — ${itemText(b)}` : (itemText(b) || itemTitle(b)),
      options: { bullet: { code: "25A0", indent: 18 }, fontSize: fs, color, fontFace: BF, paraSpaceAfter: 10, lineSpacingMultiple: 1.1 },
    }));

    /* ── slide renderers ── */
    const R = {};

    R.title = (sd) => {
      const ph = photo(sd);
      const s = ph ? pptx.addSlide() : pptx.addSlide({ masterName: "DARK" });
      if (ph) s.background = { data: photoBackground(ph, t) };
      s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.55, w: 0.08, h: 3.1, fill: { color: t.accent }, line: { type: "none" } });
      pill(s, 1.15, 1.55, str(sd.kicker || spec.kicker || "Presentation"), true);
      s.addText(cleanTitle(sd.title) || str(spec.title), { x: 1.1, y: 2.1, w: W * 0.66, h: 1.9, fontFace: HF, fontSize: num(sd.titleSize, 50), bold: true, color: "FFFFFF", valign: "top", margin: 0, fit: "shrink", lineSpacingMultiple: 0.95 });
      if (sd.subtitle) s.addText(str(sd.subtitle), { x: 1.12, y: 4.05, w: W * 0.6, h: 0.75, fontFace: BF, fontSize: 20, color: "E6E9F0", margin: 0, valign: "top" });
      const by = [str(sd.presenter || spec.presenter || sd.facilitator || spec.facilitator), str(sd.date || spec.date)].filter(Boolean).join("   ·   ");
      if (by) s.addText(by, { x: 1.12, y: 5.25, w: W * 0.6, h: 0.4, fontFace: BF, fontSize: 14, color: t.glow1, bold: true, margin: 0 });
      s.addText("ADELANI AI  ·  GRACE STUDIO", { x: 1.12, y: H - 0.75, w: 6, h: 0.3, fontFace: BF, fontSize: 9, color: "C9CED8", charSpacing: 3, margin: 0 });
    };
    R.cover = R.title;

    R.section = (sd, i) => {
      const ph = photo(sd);
      const s = ph ? pptx.addSlide() : pptx.addSlide({ masterName: "SECTION" });
      if (ph) s.background = { data: photoBackground(ph, t) };
      const n = str(sd.number) || String(slides.slice(0, i + 1).filter(x => str(x.layout).toLowerCase() === "section").length).padStart(2, "0");
      s.addText(n.slice(0, 3), { x: 0.9, y: 0.9, w: 6, h: 2.6, fontFace: HF, fontSize: 160, bold: true, color: t.glow1, transparency: 25, margin: 0 });
      s.addShape(pptx.ShapeType.rect, { x: 1.0, y: 3.85, w: 1.4, h: 0.07, fill: { color: t.accent }, line: { type: "none" } });
      s.addText(cleanTitle(sd.title), { x: 0.95, y: 4.1, w: W - 2, h: 1.3, fontFace: HF, fontSize: 42, bold: true, color: "FFFFFF", margin: 0, fit: "shrink" });
      if (sd.subtitle) s.addText(str(sd.subtitle), { x: 1.0, y: 5.35, w: W - 2.2, h: 0.7, fontFace: BF, fontSize: 18, color: "E6E9F0", margin: 0 });
      return s;
    };

    R.agenda = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const pw = 4.2;
      s.addImage({ data: BG_SECTION, x: 0, y: 0, w: pw, h: H, sizing: { type: "cover", w: pw, h: H } });
      s.addText(str(sd.kicker || "Overview").toUpperCase(), { x: 0.6, y: 1.2, w: pw - 1, h: 0.35, fontFace: BF, fontSize: 11, bold: true, color: t.glow1, charSpacing: 3, margin: 0 });
      s.addText(cleanTitle(sd.title) || "Agenda", { x: 0.6, y: 1.6, w: pw - 0.9, h: 1.5, fontFace: HF, fontSize: 40, bold: true, color: "FFFFFF", margin: 0, valign: "top", fit: "shrink" });
      const items = list(sd.items || sd.bullets, 7); const n = items.length || 1;
      const top = 0.95, areaH = H - top - 0.9, rowH = Math.min(areaH / n, 1.05);
      items.forEach((it, k) => {
        const y = top + k * rowH + (areaH - rowH * n) / 2;
        s.addText(String(k + 1).padStart(2, "0"), { x: pw + 0.7, y, w: 0.9, h: rowH * 0.8, fontFace: HF, fontSize: 26, bold: true, color: t.accent, valign: "middle", margin: 0 });
        s.addText([{ text: itemTitle(it) || itemText(it), options: { fontFace: HF, fontSize: 19, bold: true, color: HEAD, breakLine: !!(itemTitle(it) && itemText(it)) } },
          ...(itemTitle(it) && itemText(it) ? [{ text: itemText(it), options: { fontFace: BF, fontSize: 13, color: MUT } }] : [])],
          { x: pw + 1.65, y, w: W - pw - 2.4, h: rowH * 0.8, valign: "middle", margin: 0 });
        if (k < n - 1) s.addShape(pptx.ShapeType.line, { x: pw + 0.7, y: y + rowH * 0.9, w: W - pw - 1.45, h: 0, line: { color: t.muted, width: 0.5, transparency: 70 } });
      });
      footer(s, false, { x: pw + 0.7, w: W - pw - 2.5 });
      return s;
    };

    R.features = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const items = list(sd.items, 5); const n = items.length || 1;
      const areaTop = Math.max(top, 2.0), areaH = H - areaTop - 0.85;
      const rowH = Math.min(areaH / n, 1.2), gap = n > 1 ? (areaH - rowH * n) / (n - 1) : 0;
      items.forEach((it, k) => {
        const y = areaTop + k * (rowH + gap), sz = Math.min(rowH - 0.12, 0.9);
        icon(s, it.icon, 0.8, y + (rowH - sz) / 2, sz, true);
        const tx = 0.8 + sz + 0.35;
        s.addText(itemTitle(it), { x: tx, y: y + 0.04, w: W - tx - 0.8, h: 0.42, fontFace: HF, fontSize: 19, bold: true, color: HEAD, valign: "middle", margin: 0 });
        if (itemText(it)) s.addText(itemText(it), { x: tx, y: y + 0.48, w: W - tx - 0.8, h: Math.max(rowH - 0.5, 0.4), fontFace: BF, fontSize: 15, color: MUT, valign: "top", margin: 0 });
      });
      footer(s, false);
      return s;
    };

    R.grid = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const items = list(sd.items || sd.cards, 6); const n = items.length || 1;
      const cols = n <= 3 ? n : (n === 4 ? 2 : 3), rows = Math.ceil(n / cols);
      const areaTop = Math.max(top, 2.0), areaH = H - areaTop - 0.85, gx = 0.35, gy = 0.3;
      const cw = (W - 1.5 - (cols - 1) * gx) / cols, ch = (areaH - (rows - 1) * gy) / rows;
      items.forEach((it, k) => {
        const r = Math.floor(k / cols), c = k % cols, x = 0.75 + c * (cw + gx), y = areaTop + r * (ch + gy);
        card(s, x, y, cw, ch, { topBar: [t.accent, t.primary, t.accent2][k % 3] });
        const sz = Math.min(0.75, ch * 0.32);
        icon(s, it.icon, x + 0.3, y + 0.3, sz, true);
        s.addText(itemTitle(it), { x: x + 0.3, y: y + 0.38 + sz, w: cw - 0.6, h: 0.45, fontFace: HF, fontSize: 17, bold: true, color: HEAD, margin: 0, fit: "shrink" });
        if (itemText(it)) s.addText(itemText(it), { x: x + 0.3, y: y + 0.86 + sz, w: cw - 0.6, h: Math.max(ch - sz - 1.05, 0.4), fontFace: BF, fontSize: 13, color: MUT, valign: "top", margin: 0 });
      });
      footer(s, false);
      return s;
    };
    R.cards = R.grid;

    R.process = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const items = list(sd.items || sd.steps, 6); const n = items.length || 1;
      const y0 = Math.max(top, 2.2) + 0.3, gap = 0.25, cw = (W - 1.5 - (n - 1) * gap) / n, d = 0.8;
      s.addShape(pptx.ShapeType.line, { x: 0.75 + cw / 2, y: y0 + d / 2, w: (n - 1) * (cw + gap), h: 0, line: { color: t.accent, width: 2, dashType: "dash" } });
      items.forEach((it, k) => {
        const x = 0.75 + k * (cw + gap), cx = x + cw / 2 - d / 2;
        s.addShape(pptx.ShapeType.ellipse, { x: cx, y: y0, w: d, h: d, fill: { color: k % 2 ? t.primary : t.accent }, line: { color: darkDeck ? t.bg : "FFFFFF", width: 3 }, shadow: SHADOW });
        s.addText(String(k + 1), { x: cx, y: y0, w: d, h: d, fontFace: HF, fontSize: 22, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0 });
        const cardH = Math.min(H - (y0 + d + 0.3) - 0.95, 2.7);
        card(s, x, y0 + d + 0.3, cw, cardH, { shadow: true, fill: darkDeck ? t.card : "FFFFFF", topBar: k % 2 ? t.primary : t.accent });
        s.addText(itemTitle(it), { x: x + 0.15, y: y0 + d + 0.5, w: cw - 0.3, h: 0.7, fontFace: HF, fontSize: 18, bold: true, color: HEAD, align: "center", valign: "middle", margin: 0, fit: "shrink" });
        if (itemText(it)) s.addText(itemText(it), { x: x + 0.2, y: y0 + d + 1.25, w: cw - 0.4, h: cardH - 1.1, fontFace: BF, fontSize: 14, color: MUT, align: "center", valign: "top", margin: 0 });
      });
      footer(s, false);
      return s;
    };
    R.steps = R.process;

    R.timeline = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const items = list(sd.items || sd.events, 6); const n = items.length || 1;
      const ly = Math.max(top, 2.0) + 1.55, gap = (W - 1.5) / n;
      s.addShape(pptx.ShapeType.rect, { x: 0.75, y: ly - 0.03, w: W - 1.5, h: 0.06, fill: { color: t.primary, transparency: 60 }, line: { type: "none" } });
      items.forEach((it, k) => {
        const cx = 0.75 + gap * k + gap / 2, up = k % 2 === 0;
        s.addShape(pptx.ShapeType.ellipse, { x: cx - 0.17, y: ly - 0.17, w: 0.34, h: 0.34, fill: { color: t.accent }, line: { color: darkDeck ? t.bg : "FFFFFF", width: 2.5 } });
        s.addShape(pptx.ShapeType.line, { x: cx, y: up ? ly - 0.95 : ly + 0.2, w: 0, h: 0.75, line: { color: t.accent, width: 1, transparency: 30 } });
        const date = str(it.date || it.year || it.when);
        s.addText(date, { x: cx - gap / 2 + 0.05, y: up ? ly - 1.45 : ly + 0.98, w: gap - 0.1, h: 0.45, fontFace: HF, fontSize: 18, bold: true, color: t.accent, align: "center", margin: 0, fit: "shrink" });
        s.addText([{ text: itemTitle(it), options: { fontFace: HF, fontSize: 15, bold: true, color: HEAD, breakLine: true } }, { text: itemText(it), options: { fontFace: BF, fontSize: 12, color: MUT } }],
          { x: cx - gap / 2 + 0.08, y: up ? ly + 0.35 : ly - 2.4, w: gap - 0.16, h: 1.95, align: "center", valign: up ? "top" : "bottom", margin: 0 });
      });
      footer(s, false);
      return s;
    };

    R.stat = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const stats = list(sd.stats || sd.items, 4); const n = stats.length || 1;
      const gap = 0.35, cw = (W - 1.5 - (n - 1) * gap) / n, cy = Math.max(top, 2.1) + 0.2, chh = Math.min(3.4, H - cy - 1.0);
      stats.forEach((st, k) => {
        const x = 0.75 + k * (cw + gap);
        card(s, x, cy, cw, chh, { topBar: k % 2 ? t.primary : t.accent });
        s.addText(str(st.value || st.number), { x, y: cy + 0.4, w: cw, h: 1.3, fontFace: HF, fontSize: n > 3 ? 44 : 54, bold: true, color: k % 2 ? HEAD : t.accent, align: "center", valign: "middle", margin: 0, fit: "shrink" });
        s.addText(str(st.label || st.title), { x: x + 0.25, y: cy + 1.8, w: cw - 0.5, h: 0.5, fontFace: HF, fontSize: 15, bold: true, color: HEAD, align: "center", margin: 0 });
        if (st.text || st.desc) s.addText(str(st.text || st.desc), { x: x + 0.25, y: cy + 2.3, w: cw - 0.5, h: chh - 2.45, fontFace: BF, fontSize: 12, color: MUT, align: "center", valign: "top", margin: 0 });
      });
      if (sd.source) s.addText("Source: " + str(sd.source), { x: 0.75, y: H - 0.9, w: W - 1.5, h: 0.3, fontFace: BF, fontSize: 9, italic: true, color: MUT, margin: 0 });
      footer(s, false);
      return s;
    };

    R.chart = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const ch = sd.chart || {};
      const typeName = str(ch.type || "bar").toLowerCase();
      const TYPE = { bar: pptx.ChartType.bar, column: pptx.ChartType.bar, line: pptx.ChartType.line, area: pptx.ChartType.area, pie: pptx.ChartType.pie, doughnut: pptx.ChartType.doughnut, donut: pptx.ChartType.doughnut }[typeName] || pptx.ChartType.bar;
      const labels = list(ch.labels, 12).map(str);
      let series = list(ch.series, 4).map(se => ({ name: str(se.name) || "Series", labels, values: list(se.values, 12).map(v => num(String(v).replace(/[^0-9.\-]/g, ""), 0)) }));
      if (!series.length && Array.isArray(ch.values)) series = [{ name: str(ch.name) || "Value", labels, values: ch.values.map(v => num(v, 0)) }];
      const insights = list(sd.insights || sd.bullets, 4);
      const cy = Math.max(top, 2.0), chW = insights.length ? (W - 1.5) * 0.62 : W - 1.5, chH = H - cy - 0.95;
      card(s, 0.75, cy, chW, chH, { shadow: true, fill: darkDeck ? t.card : "FFFFFF" });
      if (series.length && labels.length) {
        const round = TYPE === pptx.ChartType.pie || TYPE === pptx.ChartType.doughnut;
        s.addChart(TYPE, series, {
          x: 0.95, y: cy + 0.15, w: chW - 0.4, h: chH - 0.3,
          chartColors: CHART_COLORS, showLegend: round || series.length > 1, legendPos: "b", legendFontFace: BF, legendFontSize: 11, legendColor: TXT,
          showValue: round || labels.length <= 8, dataLabelFontFace: BF, dataLabelFontSize: 10, dataLabelColor: round ? "FFFFFF" : TXT,
          dataLabelPosition: round ? "ctr" : undefined, showPercent: round, holeSize: 55,
          catAxisLabelColor: MUT, catAxisLabelFontFace: BF, catAxisLabelFontSize: 11, valAxisLabelColor: MUT, valAxisLabelFontFace: BF, valAxisLabelFontSize: 10,
          valGridLine: { color: darkDeck ? "333338" : "E5E7EB", size: 0.5 }, catGridLine: { style: "none" }, barGapWidthPct: 60, lineSize: 3, lineDataSymbolSize: 9,
        });
      }
      if (insights.length) {
        const ix = 0.75 + chW + 0.4, iw = W - ix - 0.75;
        s.addText("KEY INSIGHTS", { x: ix, y: cy, w: iw, h: 0.35, fontFace: BF, fontSize: 11, bold: true, color: t.accent, charSpacing: 3, margin: 0 });
        insights.forEach((it, k) => {
          const y = cy + 0.5 + k * ((chH - 0.5) / insights.length);
          s.addShape(pptx.ShapeType.rect, { x: ix, y: y + 0.05, w: 0.06, h: 0.75, fill: { color: k % 2 ? t.primary : t.accent }, line: { type: "none" } });
          s.addText(itemText(it) || itemTitle(it), { x: ix + 0.22, y, w: iw - 0.22, h: (chH - 0.5) / insights.length - 0.1, fontFace: BF, fontSize: 14, color: TXT, valign: "top", margin: 0 });
        });
      }
      if (sd.source) s.addText("Source: " + str(sd.source), { x: 0.75, y: H - 0.85, w: W - 1.5, h: 0.28, fontFace: BF, fontSize: 9, italic: true, color: MUT, margin: 0 });
      footer(s, false);
      return s;
    };

    R.comparison = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const L = sd.left && !Array.isArray(sd.left) ? sd.left : { title: sd.leftTitle, points: sd.left };
      const Rr = sd.right && !Array.isArray(sd.right) ? sd.right : { title: sd.rightTitle, points: sd.right };
      const cy = Math.max(top, 2.0), gap = 0.5, cw = (W - 1.5 - gap) / 2;
      const most = Math.max(list(L.points || L.items || L.bullets, 6).length, list(Rr.points || Rr.items || Rr.bullets, 6).length, 2);
      const chh = Math.min(H - cy - 0.95, 1.35 + most * 0.62);
      [[L, 0.75, t.primary], [Rr, 0.75 + cw + gap, t.accent]].forEach(([side, x, col]) => {
        card(s, x, cy, cw, chh, { fill: darkDeck ? t.card : "FFFFFF" });
        s.addShape(pptx.ShapeType.rect, { x, y: cy, w: cw, h: 0.75, fill: { color: col }, line: { type: "none" } });
        s.addText(str(side.title) || "", { x: x + 0.3, y: cy, w: cw - 0.6, h: 0.75, fontFace: HF, fontSize: 19, bold: true, color: isDark(col) ? "FFFFFF" : "1A1208", valign: "middle", margin: 0 });
        const pts = list(side.points || side.items || side.bullets, 6);
        s.addText(bullets(pts, 17, TXT), { x: x + 0.3, y: cy + 1.0, w: cw - 0.6, h: chh - 1.2, valign: "top", margin: 0 });
      });
      s.addShape(pptx.ShapeType.ellipse, { x: W / 2 - 0.38, y: cy + chh / 2 - 0.38, w: 0.76, h: 0.76, fill: { color: darkDeck ? t.bg : "FFFFFF" }, line: { color: t.accent, width: 2 }, shadow: SHADOW });
      s.addText(str(sd.vs) || "VS", { x: W / 2 - 0.38, y: cy + chh / 2 - 0.38, w: 0.76, h: 0.76, fontFace: HF, fontSize: 15, bold: true, color: t.accent, align: "center", valign: "middle", margin: 0 });
      footer(s, false);
      return s;
    };
    R["two-column"] = R.comparison;

    R.matrix = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const items = list(sd.items || sd.quadrants, 4);
      const cy = Math.max(top, 2.0), gap = 0.25, cw = (W - 1.5 - gap) / 2, chh = (H - cy - 0.95 - gap) / 2;
      const cols = [t.primary, t.accent, t.accent2, t.muted];
      const DEFAULT = ["Strengths", "Weaknesses", "Opportunities", "Threats"];
      items.forEach((it, k) => {
        const x = 0.75 + (k % 2) * (cw + gap), y = cy + Math.floor(k / 2) * (chh + gap), col = hex(cols[k]);
        card(s, x, y, cw, chh, { fill: darkDeck ? t.card : "FFFFFF", shadow: true });
        s.addShape(pptx.ShapeType.rect, { x, y, w: 0.12, h: chh, fill: { color: col }, line: { type: "none" } });
        s.addText(str(it.letter) || (itemTitle(it) || DEFAULT[k] || "")[0] || "", { x: x + cw - 1.3, y: y + 0.05, w: 1.15, h: 1.15, fontFace: HF, fontSize: 60, bold: true, color: col, transparency: 82, align: "right", margin: 0 });
        s.addText(itemTitle(it) || DEFAULT[k], { x: x + 0.35, y: y + 0.18, w: cw - 1.6, h: 0.45, fontFace: HF, fontSize: 18, bold: true, color: col, margin: 0 });
        const pts = list(it.points || it.items, 4);
        if (pts.length) s.addText(bullets(pts, 14, TXT), { x: x + 0.35, y: y + 0.68, w: cw - 0.6, h: chh - 0.8, valign: "top", margin: 0 });
        else if (itemText(it)) s.addText(itemText(it), { x: x + 0.35, y: y + 0.68, w: cw - 0.6, h: chh - 0.8, fontFace: BF, fontSize: 13, color: TXT, valign: "top", margin: 0 });
      });
      footer(s, false);
      return s;
    };
    R.swot = R.matrix;

    R.image = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const ph = photo(sd), right = str(sd.side).toLowerCase() !== "left", iw = W * 0.45;
      const ix = right ? W - iw : 0;
      if (ph) s.addImage({ data: photoCrop(ph, iw, H), x: ix, y: 0, w: iw, h: H });
      else s.addImage({ data: BG_SECTION, x: ix, y: 0, w: iw, h: H, sizing: { type: "cover", w: iw, h: H } });
      s.addShape(pptx.ShapeType.rect, { x: right ? ix : iw - 0.1, y: 0, w: 0.1, h: H, fill: { color: t.accent }, line: { type: "none" } });
      const tx = right ? 0.75 : iw + 0.7, tw = W - iw - 1.45;
      const top = heading(s, sd, { x: tx, w: tw });
      const pts = list(sd.bullets || sd.items || sd.points, 6);
      if (pts.length) s.addText(bullets(pts, 18, TXT), { x: tx, y: Math.max(top, 2.0), w: tw, h: H - Math.max(top, 2.0) - 0.9, valign: "top", margin: 0 });
      else if (sd.body || sd.text) s.addText(str(sd.body || sd.text), { x: tx, y: Math.max(top, 2.0), w: tw, h: H - Math.max(top, 2.0) - 0.9, fontFace: BF, fontSize: 16, color: TXT, valign: "top", lineSpacingMultiple: 1.25, margin: 0 });
      if (sd.caption && ph) s.addText(str(sd.caption), { x: ix + 0.3, y: H - 0.75, w: iw - 0.6, h: 0.35, fontFace: BF, fontSize: 10, italic: true, color: "FFFFFF", margin: 0 });
      footer(s, false, { x: tx, w: tw - 1, numX: tx + tw - 0.6 });
      return s;
    };
    R["image-split"] = R.image;

    R.quote = (sd) => {
      const ph = photo(sd);
      const s = ph ? pptx.addSlide() : pptx.addSlide({ masterName: "DARK" });
      if (ph) s.background = { data: photoBackground(ph, t, "center") };
      s.addText("“", { x: W / 2 - 1, y: 0.55, w: 2, h: 2, fontFace: "Georgia", fontSize: 160, bold: true, color: t.glow1, align: "center", margin: 0 });
      s.addText(str(sd.quote || sd.text), { x: 1.5, y: 2.2, w: W - 3, h: 2.8, fontFace: HF, fontSize: 32, italic: true, color: "FFFFFF", align: "center", valign: "middle", lineSpacingMultiple: 1.15, margin: 0, fit: "shrink" });
      if (sd.attribution) {
        s.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.5, y: 5.3, w: 1, h: 0.05, fill: { color: t.accent }, line: { type: "none" } });
        s.addText(str(sd.attribution).replace(/^[—-]\s*/, "").toUpperCase(), { x: 1.5, y: 5.5, w: W - 3, h: 0.45, fontFace: BF, fontSize: 13, bold: true, color: t.glow1, align: "center", charSpacing: 3, margin: 0 });
      }
      page++;
      return s;
    };

    R.table = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const rows = list(sd.table || sd.rows, 9).map(r => list(r, 7));
      if (rows.length) {
        const cols = Math.max(...rows.map(r => r.length));
        const data = rows.map((r, ri) => Array.from({ length: cols }, (_, ci) => ({
          text: str(r[ci]),
          options: { fontFace: ri === 0 ? HF : BF, fontSize: ri === 0 ? 15 : 14, bold: ri === 0 || ci === 0, color: ri === 0 ? (isDark(t.primary) ? "FFFFFF" : "1A1208") : (ci === 0 ? HEAD : TXT),
            fill: { color: ri === 0 ? t.primary : (ri % 2 ? (darkDeck ? t.card : "FFFFFF") : t.card) }, valign: "middle", margin: [4, 8, 4, 8],
            border: [{ type: "none" }, { type: "none" }, { pt: 0.5, color: darkDeck ? "333338" : "E5E7EB" }, { type: "none" }] },
        })));
        const y = Math.max(top, 2.0), rh = Math.min(0.55, (H - y - 1.0) / rows.length);
        s.addTable(data, { x: 0.75, y, w: W - 1.5, rowH: rh, autoPage: false });
      }
      footer(s, false);
      return s;
    };

    R.content = (sd) => {
      if (photo(sd)) return R.image(sd);
      const s = pptx.addSlide({ masterName: "CONTENT" });
      const top = heading(s, sd);
      const y = Math.max(top, 2.0);
      const pts = list(sd.bullets || sd.items || sd.points, 7);
      if (pts.length) s.addText(bullets(pts, 18, TXT), { x: 0.8, y, w: W - 1.6, h: H - y - 0.95, valign: "top", margin: 0 });
      else if (sd.body || sd.text) s.addText(str(sd.body || sd.text), { x: 0.8, y, w: W - 1.6, h: H - y - 0.95, fontFace: BF, fontSize: 18, color: TXT, valign: "top", lineSpacingMultiple: 1.3, margin: 0 });
      footer(s, false);
      return s;
    };

    R.closing = (sd) => {
      const ph = photo(sd);
      const s = ph ? pptx.addSlide() : pptx.addSlide({ masterName: "DARK" });
      if (ph) s.background = { data: photoBackground(ph, t, "center") };
      s.addText(cleanTitle(sd.title) || "Thank You", { x: 1, y: 2.0, w: W - 2, h: 1.6, fontFace: HF, fontSize: 60, bold: true, color: "FFFFFF", align: "center", valign: "middle", margin: 0, fit: "shrink" });
      s.addShape(pptx.ShapeType.rect, { x: W / 2 - 0.6, y: 3.75, w: 1.2, h: 0.06, fill: { color: t.accent }, line: { type: "none" } });
      if (sd.subtitle) s.addText(str(sd.subtitle), { x: 1.5, y: 4.0, w: W - 3, h: 0.8, fontFace: BF, fontSize: 20, color: "E6E9F0", align: "center", margin: 0 });
      const contact = str(sd.contact || spec.contact);
      if (contact) s.addText(contact, { x: 1.5, y: 5.0, w: W - 3, h: 0.5, fontFace: BF, fontSize: 15, bold: true, color: t.glow1, align: "center", margin: 0 });
      s.addText("ADELANI AI  ·  GRACE STUDIO", { x: 1, y: H - 0.75, w: W - 2, h: 0.3, fontFace: BF, fontSize: 9, color: "C9CED8", charSpacing: 3, align: "center", margin: 0 });
      page++;
      return s;
    };
    R.thanks = R.closing; R.end = R.closing;

    /* legacy free-form slides from older prompts */
    R.custom = (sd) => {
      const s = pptx.addSlide({ masterName: "CONTENT" });
      (sd.elements || []).forEach(el => {
        try {
          if (el.kind === "text") s.addText(str(el.text), { x: num(el.x, 0.75), y: num(el.y, 0.75), w: num(el.w, W - 1.5), h: num(el.h, 1), fontFace: el.fontFace || BF, fontSize: num(el.fontSize, 18), bold: !!el.bold, italic: !!el.italic, color: hex(el.color, TXT), align: el.align || "left", valign: el.valign || "top" });
          else if (el.kind === "bullets") s.addText(bullets(list(el.items, 10), num(el.fontSize, 16), hex(el.color, TXT)), { x: num(el.x, 0.75), y: num(el.y, 1.6), w: num(el.w, W - 1.5), h: num(el.h, H - 2.4), valign: "top" });
          else if (el.kind === "shape") s.addShape(pptx.ShapeType[{ ellipse: "ellipse", circle: "ellipse", line: "line", roundrect: "roundRect" }[str(el.shape).toLowerCase()] || "rect"], { x: num(el.x, 0), y: num(el.y, 0), w: num(el.w, 1), h: num(el.h, 0.3), fill: el.fill ? { color: hex(el.fill), transparency: num(el.transparency, 0) } : undefined, line: el.lineColor ? { color: hex(el.lineColor), width: num(el.lineWidth, 1) } : { type: "none" } });
        } catch (e) {}
      });
      footer(s, false);
      return s;
    };

    slides.forEach((sd, i) => {
      let lay = str(sd.layout).toLowerCase() || (i === 0 ? "title" : "content");
      if (sd.custom || (sd.elements && !sd.layout)) lay = "custom";
      if (!R[lay]) lay = (Array.isArray(sd.items) && sd.items.length) ? "features" : (sd.chart ? "chart" : (sd.stats ? "stat" : (sd.table ? "table" : "content")));
      let s;
      try { s = R[lay](sd, i); }
      catch (e) { console.warn("Slide", i + 1, "fell back to a simple layout:", e); s = R.content({ title: sd.title, bullets: sd.bullets || (sd.items || []).map(it => itemTitle(it) || itemText(it)) }); }
      const notes = str(sd.notes || sd.speakerNotes);
      if (s && notes) s.addNotes(notes);
    });

    say("Packing your presentation…");
    const blob = new Blob([await pptx.write("blob")], { type: PPTX_MIME });
    const filename = (str(spec.filename || spec.title || "presentation").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "presentation") + ".pptx";

    /* small cover preview for the chat */
    let preview = null;
    try {
      const first = slides[0] || {}, ph = photo(first);
      const c = canvas(640, 360), ctx = c.getContext("2d"), bg = new Image();
      bg.src = ph ? photoBackground(ph, t) : BG_DARK;
      await new Promise(r => { bg.onload = r; bg.onerror = r; });
      ctx.drawImage(bg, 0, 0, 640, 360);
      ctx.fillStyle = "#" + t.accent; ctx.fillRect(38, 74, 4, 130);
      ctx.fillStyle = "#FFFFFF"; ctx.font = `bold 34px Georgia, serif`;
      const words = (cleanTitle(first.title) || str(spec.title)).split(/\s+/); let line = "", y = 108;
      for (const w of words) { const test = line ? line + " " + w : w; if (ctx.measureText(test).width > 470 && line) { ctx.fillText(line, 58, y); line = w; y += 40; if (y > 190) break; } else line = test; }
      if (y <= 190) ctx.fillText(line, 58, y);
      ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.font = `16px Calibri, Arial, sans-serif`;
      ctx.fillText(`${slides.length} slides  ·  ${t.name} theme`, 58, Math.min(y + 40, 250));
      preview = c.toDataURL("image/jpeg", 0.8);
    } catch (e) { preview = null; }

    return { url: URL.createObjectURL(blob), filename, count: slides.length, preview, theme: t.name };
  }

  window.GraceStudio = { buildDeck, THEMES: Object.keys(THEMES), version: "2.0" };
})();
