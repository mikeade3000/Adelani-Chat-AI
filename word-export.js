/* ══════════════════════════════════════════════════════════════════════════
   ADELANI AI — WORD (.docx) EXPORT
   Turns an answer (markdown) into a real, editable Word document in the
   browser using the docx library (vendor/docx.min.js). Free: no server.

   Keeps: headings, paragraphs, bold/italic/code, links, bullet and numbered
   lists (with nesting), tables, quotes, code blocks and horizontal rules.
   Adds: title block, A4 pages, header, page numbers.

   Public API: window.AdelaniWord.build(markdown, {title, agent, subtitle})
               → Promise<{blob, filename}>
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const WINE = "7A2232", GOLD = "A8843A", INK = "2A2118", MUTED = "7D6E5B";

  function clean(s) { return String(s == null ? "" : s).replace(/\u0000/g, ""); }

  /* Inline markdown → runs (bold, italic, code, links). */
  function inline(D, text, base) {
    base = base || {};
    const out = [];
    const re = /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|_([^_\n]+)_|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
    let last = 0, m;
    text = clean(text);
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(new D.TextRun({ text: text.slice(last, m.index), ...base }));
      if (m[2]) out.push(new D.TextRun({ text: m[2], bold: true, italics: true, ...base }));
      else if (m[3] || m[4]) out.push(new D.TextRun({ text: m[3] || m[4], bold: true, ...base }));
      else if (m[5] || m[6]) out.push(new D.TextRun({ text: m[5] || m[6], italics: true, ...base }));
      else if (m[7]) out.push(new D.TextRun({ text: m[7], font: "Consolas", shading: { type: D.ShadingType.CLEAR, fill: "F3ECDF", color: "auto" }, ...base }));
      else if (m[8]) out.push(new D.ExternalHyperlink({ link: m[9], children: [new D.TextRun({ text: m[8], style: "Hyperlink", ...base })] }));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(new D.TextRun({ text: text.slice(last), ...base }));
    return out.length ? out : [new D.TextRun({ text: "", ...base })];
  }

  const splitRow = line => {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map(c => c.trim());
  };
  const isTableSep = line => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line || "");

  function table(D, rows) {
    const cols = Math.max(...rows.map(r => r.length));
    const border = { style: D.BorderStyle.SINGLE, size: 4, color: "D9CDB6" };
    return new D.Table({
      width: { size: 100, type: D.WidthType.PERCENTAGE },
      borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
      rows: rows.map((r, ri) => new D.TableRow({
        tableHeader: ri === 0,
        children: Array.from({ length: cols }, (_, ci) => new D.TableCell({
          shading: ri === 0 ? { type: D.ShadingType.CLEAR, fill: WINE, color: "auto" } : (ri % 2 === 0 ? { type: D.ShadingType.CLEAR, fill: "FAF6EE", color: "auto" } : undefined),
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          children: [new D.Paragraph({ spacing: { after: 0 }, children: inline(D, r[ci] || "", ri === 0 ? { bold: true, color: "FFFFFF" } : {}) })],
        })),
      })),
    });
  }

  function blocks(D, md) {
    const lines = clean(md).replace(/\r/g, "").split("\n");
    const out = [];
    let para = [], numInstance = 0, inNumbered = false;
    const flush = () => {
      if (!para.length) return;
      const children = [];
      para.forEach((l, i) => { if (i) children.push(new D.TextRun({ text: "", break: 1 })); children.push(...inline(D, l)); });
      out.push(new D.Paragraph({ children, spacing: { after: 160 } }));
      para = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // code block
      if (/^\s*```/.test(line)) {
        flush(); inNumbered = false;
        const code = [];
        while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
        code.forEach((c, k) => out.push(new D.Paragraph({
          shading: { type: D.ShadingType.CLEAR, fill: "F3ECDF", color: "auto" },
          spacing: { after: k === code.length - 1 ? 160 : 0 },
          children: [new D.TextRun({ text: c || " ", font: "Consolas", size: 19 })],
        })));
        continue;
      }
      // table
      if (/^\s*\|/.test(line) && isTableSep(lines[i + 1])) {
        flush(); inNumbered = false;
        const rows = [splitRow(line)]; i++;
        while (i + 1 < lines.length && /^\s*\|/.test(lines[i + 1])) rows.push(splitRow(lines[++i]));
        out.push(table(D, rows));
        out.push(new D.Paragraph({ children: [], spacing: { after: 120 } }));
        continue;
      }
      let m;
      if ((m = line.match(/^\s*(#{1,6})\s+(.*)$/))) {
        flush(); inNumbered = false;
        const lvl = Math.min(m[1].length, 4);
        const H = [D.HeadingLevel.HEADING_1, D.HeadingLevel.HEADING_2, D.HeadingLevel.HEADING_3, D.HeadingLevel.HEADING_4][lvl - 1];
        out.push(new D.Paragraph({ heading: H, children: inline(D, m[2].replace(/\s*#+\s*$/, "")) }));
        continue;
      }
      if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
        flush(); inNumbered = false;
        out.push(new D.Paragraph({ border: { bottom: { style: D.BorderStyle.SINGLE, size: 6, color: GOLD, space: 1 } }, spacing: { after: 200 }, children: [] }));
        continue;
      }
      if ((m = line.match(/^(\s*)[-*•+❧]\s+(.*)$/))) {
        flush();
        const level = Math.min(Math.floor(m[1].replace(/\t/g, "  ").length / 2), 3);
        out.push(new D.Paragraph({ numbering: { reference: "adl-bullets", level }, spacing: { after: 80 }, children: inline(D, m[2]) }));
        continue;
      }
      if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) {
        flush();
        const level = Math.min(Math.floor(m[1].replace(/\t/g, "  ").length / 2), 3);
        if (!inNumbered && level === 0) numInstance++;
        inNumbered = true;
        out.push(new D.Paragraph({ numbering: { reference: "adl-numbers", level, instance: numInstance }, spacing: { after: 80 }, children: inline(D, m[3]) }));
        continue;
      }
      if ((m = line.match(/^\s*>\s?(.*)$/))) {
        flush(); inNumbered = false;
        out.push(new D.Paragraph({
          indent: { left: 400 }, spacing: { after: 120 },
          border: { left: { style: D.BorderStyle.SINGLE, size: 18, color: GOLD, space: 8 } },
          children: inline(D, m[1], { italics: true, color: MUTED }),
        }));
        continue;
      }
      if (!line.trim()) { flush(); if (inNumbered && !/^\s*\d+[.)]\s/.test(lines[i + 1] || "")) inNumbered = false; continue; }
      inNumbered = false;
      para.push(line.trim());
    }
    flush();
    return out;
  }

  function guessTitle(md) {
    const h = clean(md).match(/^\s*#{1,2}\s+(.+)$/m);
    if (h) return h[1].replace(/[*_`#]/g, "").trim();
    const first = clean(md).replace(/[*_`#>|-]/g, " ").trim().split(/\s+/).slice(0, 8).join(" ");
    return first || "Adelani AI document";
  }

  async function build(markdown, opts) {
    opts = opts || {};
    const D = window.docx;
    if (!D) throw new Error("Word library not loaded");
    let md = clean(markdown).trim();
    const title = clean(opts.title) || guessTitle(md);
    // If the answer starts with the same heading as the title, don't print it twice.
    md = md.replace(/^\s*#{1,2}\s+(.+)\n?/, (all, h) => (h.replace(/[*_`]/g, "").trim() === title ? "" : all));
    const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    const by = [opts.agent ? `Prepared with Adelani AI · ${opts.agent}` : "Prepared with Adelani AI", date].join(" · ");

    const levels = (fmt, texts) => texts.map((tx, l) => ({
      level: l, format: fmt[l % fmt.length], text: tx, alignment: D.AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 360 + l * 360, hanging: 300 } } },
    }));

    const doc = new D.Document({
      creator: "Adelani AI", title, description: "Generated by Adelani AI",
      styles: {
        default: { document: { run: { font: "Calibri", size: 22, color: INK }, paragraph: { spacing: { line: 288 } } } },
        paragraphStyles: [
          { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", run: { font: "Georgia", size: 48, bold: true, color: WINE }, paragraph: { spacing: { after: 80, line: 260, lineRule: D.LineRuleType.AUTO } } },
          { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Georgia", size: 32, bold: true, color: WINE }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true } },
          { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Georgia", size: 27, bold: true, color: WINE }, paragraph: { spacing: { before: 240, after: 100 }, keepNext: true } },
          { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Georgia", size: 24, bold: true, color: INK }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true } },
          { id: "Heading4", name: "Heading 4", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Calibri", size: 22, bold: true, italics: true, color: INK }, paragraph: { spacing: { before: 160, after: 60 }, keepNext: true } },
        ],
        characterStyles: [{ id: "Hyperlink", name: "Hyperlink", run: { color: WINE, underline: { type: D.UnderlineType.SINGLE, color: WINE } } }],
      },
      numbering: {
        config: [
          { reference: "adl-bullets", levels: levels([D.LevelFormat.BULLET], ["•", "◦", "▪", "•"]) },
          { reference: "adl-numbers", levels: levels([D.LevelFormat.DECIMAL, D.LevelFormat.LOWER_LETTER, D.LevelFormat.LOWER_ROMAN, D.LevelFormat.DECIMAL], ["%1.", "%2.", "%3.", "%4."]) },
        ],
      },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1300, right: 1300 } } },
        headers: { default: new D.Header({ children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ text: "Adelani AI", font: "Georgia", size: 18, color: GOLD, bold: true })] })] }) },
        footers: { default: new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [
          new D.TextRun({ text: "Page ", size: 18, color: MUTED }), new D.TextRun({ children: [D.PageNumber.CURRENT], size: 18, color: MUTED }),
          new D.TextRun({ text: " of ", size: 18, color: MUTED }), new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], size: 18, color: MUTED }),
        ] })] }) },
        children: [
          new D.Paragraph({ style: "Title", children: [new D.TextRun({ text: title })] }),
          new D.Paragraph({ spacing: { after: 120 }, children: [new D.TextRun({ text: opts.subtitle || by, italics: true, size: 19, color: MUTED })] }),
          new D.Paragraph({ border: { bottom: { style: D.BorderStyle.DOUBLE, size: 6, color: GOLD, space: 1 } }, spacing: { after: 240 }, children: [] }),
          ...blocks(D, md),
        ],
      }],
    });
    const raw = await D.Packer.toBlob(doc);
    const blob = new Blob([raw], { type: DOCX_MIME });
    const filename = (title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "Adelani-AI-document") + ".docx";
    return { blob, filename };
  }

  window.AdelaniWord = { build, version: "1.0" };
})();
