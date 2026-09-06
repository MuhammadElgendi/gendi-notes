#!/usr/bin/env node
/* ============================================================================
 * GENDI NOTES — BUILD + LINT
 * ----------------------------------------------------------------------------
 *   node site/build.mjs           build site/dist/ AND regenerate INDEX.md
 *   node site/build.mjs --check   lint only, no writes (exit 1 on error)
 *   node site/build.mjs --quiet   build, print only warnings/errors
 *
 * Zero dependencies. Node 18+. No npm install, works offline.
 *
 * WHY THIS EXISTS
 *   The index must never lie. Hand-maintained indexes rot within a month.
 *   Here INDEX.md is *generated* from the notes themselves, and the linter
 *   fails the build on a broken cross-link. Add a note -> rebuild -> the
 *   index, the knowledge graph and the visual style all update themselves.
 * ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(__dirname, "dist");

const ARGV = new Set(process.argv.slice(2));
const CHECK_ONLY = ARGV.has("--check");
const QUIET = ARGV.has("--quiet");

/* Root-level documents are prose, not notes: no frontmatter is required. */
const ROOT_DOCS = ["README.md", "INDEX.md", "ROADMAP.md", "GLOSSARY.md",
                   "PRINCIPLES.md", "CONTRIBUTING.md"];
const SKIP_DIRS = new Set(["site", "node_modules", ".git", ".github", "templates"]);

const VALID_TYPES  = ["concept", "architecture", "troubleshooting", "interview",
                      "cheat-sheet", "system-design", "incident", "runbook"];
const VALID_STATUS = ["seed", "draft", "stable"];

const problems = [];
const err  = (f, m) => problems.push({ sev: "ERROR", file: f, msg: m });
const warn = (f, m) => problems.push({ sev: "WARN",  file: f, msg: m });

/* ------------------------------------------------------------ 1. FRONTMATTER */
/* A deliberately small YAML subset: scalars, [inline, lists], and - bullets.
   Enough for note metadata; refuses to guess at anything more exotic. */
function parseFrontmatter(raw, file) {
  if (!raw.startsWith("---")) return { data: null, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) { err(file, "frontmatter opened with --- but never closed"); return { data: null, body: raw }; }
  const block = raw.slice(3, end).trim();
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1);
  const data = {};
  let key = null;
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet && key) { (data[key] ||= []).push(unquote(bullet[1])); continue; }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) { warn(file, `unparsed frontmatter line: ${line.trim()}`); continue; }
    key = kv[1];
    const val = kv[2].trim();
    if (val === "") { data[key] = []; }
    else if (val.startsWith("[")) {
      data[key] = val.replace(/^\[|\]$/g, "").split(",")
                     .map(s => unquote(s.trim())).filter(Boolean);
    } else data[key] = unquote(val);
  }
  return { data, body };
}
const unquote = s => s.replace(/^["']|["']$/g, "");

/* ------------------------------------------------------------- 2. INLINE MD */
const escapeHtml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
                         .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Circled section numbers, as used by every template. */
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮";

function inline(text, ctx) {
  const stash = [];
  /* Rendered fragments park behind a NUL sentinel so later regexes can never
     chew through them. A plain " 0 " marker would collide with any digit in
     the prose ("level 3 note" -> stash[3]). */
  const keep = html => `\u0000${stash.push(html) - 1}\u0000`;

  let s = text;
  /* code spans first: their contents must survive untouched */
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${escapeHtml(c)}</code>`));
  s = escapeHtml(s);

  /* [[wikilink]] and [[wikilink|label]] -> resolved cross-reference */
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, slug, label) => {
    const target = ctx.slugs.get(slug.trim());
    const text = (label || (target ? target.title : slug)).trim();
    if (!target) { err(ctx.name, `wikilink to unknown slug: [[${slug.trim()}]]`); return `<span class="hl-red">${text}?</span>`; }
    return keep(`<a href="${ctx.rel(target.out)}">${escapeHtml(text)}</a>`);
  });

  /* [text](target) — .md targets are rewritten to .html and link-checked */
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    let out = href;
    if (!/^(https?:|mailto:|#)/.test(href)) {
      const abs = path.resolve(path.dirname(ctx.file), href.split("#")[0]);
      if (href.endsWith(".md") && !fs.existsSync(abs)) err(ctx.name, `broken link: ${href}`);
      out = href.replace(/\.md(#|$)/, ".html$1");
    }
    return keep(`<a href="${out}">${label}</a>`);
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/==([^=]+)==/g, '<span class="hl-red">$1</span>');
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

/* --------------------------------------------------------------- 3. BLOCKS */
const CALLOUTS = {
  key:       { cls: "is-key",       icon: "\u{1F4A1}", label: "Key Takeaway" },
  mental:    { cls: "is-mental",    icon: "\u{1F9E0}", label: "Mental Model" },
  trap:      { cls: "is-trap",      icon: "⚠️", label: "Trap" },
  senior:    { cls: "is-senior",    icon: "\u{1F525}", label: "Senior Tip" },
  failure:   { cls: "is-failure",   icon: "\u{1F6A8}", label: "Production Failure" },
  interview: { cls: "is-interview", icon: "\u{1F3AF}", label: "Interview Tip" },
  cloud:     { cls: "cloud",        icon: "",          label: "" },
};

function renderBody(md, ctx) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let sectionOpen = false;
  const closeSection = () => { if (sectionOpen) { out.push("</section>"); sectionOpen = false; } };

  while (i < lines.length) {
    const line = lines[i];

    /* --- fenced blocks: ```diagram is a drawn figure, ```sh is a command --- */
    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      const code = escapeHtml(buf.join("\n"));
      out.push(lang === "diagram"
        ? `<div class="diagram">${code}</div>`
        : `<pre><code class="lang-${lang || "text"}">${code}</code></pre>`);
      continue;
    }

    /* --- ::: callout containers --- */
    const dir = line.match(/^:::\s*(\w+)\s*(.*)$/);
    if (dir && CALLOUTS[dir[1]]) {
      const spec = CALLOUTS[dir[1]];
      const custom = dir[2].trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(":::")) buf.push(lines[i++]);
      i++;
      const inner = renderBody(buf.join("\n"), ctx);
      if (dir[1] === "cloud") { out.push(`<div class="cloud">${inner}</div>`); continue; }
      out.push(
        `<aside class="callout ${spec.cls}">` +
        `<span class="callout-icon" aria-hidden="true">${spec.icon}</span>` +
        `<span class="callout-label">${escapeHtml(custom || spec.label)}</span>` +
        `${inner}</aside>`
      );
      continue;
    }

    /* --- tables --- */
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || "")) {
      const cells = r => r.split("|").slice(1, -1).map(c => inline(c.trim(), ctx));
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead>` +
        `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      );
      continue;
    }

    /* --- headings. "## (1) Title" opens a numbered .section --- */
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const depth = h[1].length;
      let text = h[2].trim();
      if (depth === 1) { i++; continue; }          // H1 becomes .note-title in the shell
      if (depth === 2) {
        closeSection();
        const num = CIRCLED.includes(text[0]) ? text[0] : (text[0] === "★" ? "★" : null);
        if (num) text = text.slice(1).trim();
        out.push('<section class="section">');
        sectionOpen = true;
        out.push(
          `<h2 class="section-title">` +
          (num ? `<span class="section-number" aria-hidden="true">${num}</span>` : "") +
          `<span class="st-text">${inline(text, ctx)}</span></h2>`
        );
        i++; continue;
      }
      out.push(`<h${depth}>${inline(text, ctx)}</h${depth}>`);
      i++; continue;
    }

    /* --- blockquote --- */
    if (line.startsWith("> ")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote class="hand-box is-dashed">${renderBody(buf.join("\n"), ctx)}</blockquote>`);
      continue;
    }

    /* --- lists (checklist "- [x]" gets the green tick) --- */
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      let checklist = false;
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let t = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        if (/^\[[ xX]\]\s*/.test(t)) { checklist = true; t = t.replace(/^\[[ xX]\]\s*/, ""); }
        i++;
        /* lazy continuation lines belong to the current item */
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]))
          t += " " + lines[i++].trim();
        items.push(`<li>${inline(t, ctx)}</li>`);
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}${checklist ? ' class="checklist"' : ""}>${items.join("")}</${tag}>`);
      continue;
    }

    /* --- layout helpers written as raw HTML comments in the markdown --- */
    if (line.trim() === "<!-- grid -->")     { out.push('<div class="grid-2 is-divided">'); i++; continue; }
    if (line.trim() === "<!-- /grid -->")    { out.push("</div>"); i++; continue; }
    if (line.trim() === "<!-- col -->")      { out.push("<div>"); i++; continue; }
    if (line.trim() === "<!-- /col -->")     { out.push("</div>"); i++; continue; }

    if (line.trim() === "---") { out.push("<hr>"); i++; continue; }
    if (!line.trim()) { i++; continue; }

    /* --- paragraph --- */
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\||:::|---$|<!-- )/.test(lines[i]))
      buf.push(lines[i++]);
    if (buf.length) out.push(`<p>${inline(buf.join(" "), ctx)}</p>`);
    else i++;
  }
  closeSection();
  return out.join("\n");
}

/* ----------------------------------------------------------- 4. PAGE SHELL */
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Caveat:wght@600;700&family=Patrick+Hand&display=swap">';

function shell({ title, subtitle, tags, date, bodyHtml, cssPath, footer, homePath }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Gendi Notes</title>
${FONTS}
<link rel="stylesheet" href="${cssPath}">
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<main class="note-page" id="main">
  <div class="note-meta">
    <span class="note-tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(" ")}</span>
    <span class="note-date">${escapeHtml(date)}</span>
  </div>
  <h1 class="note-title">${escapeHtml(title)} <span class="star" aria-hidden="true">☆</span></h1>
  <span class="title-underline" aria-hidden="true"></span>
  ${subtitle ? `<p class="note-subtitle">${inline(subtitle, { file: title, slugs: new Map(), rel: x => x })}</p>` : ""}
  ${bodyHtml}
  ${footer}
  <p class="no-print" style="margin-top:1.5rem"><a href="${homePath}">← back to the index</a></p>
</main>
</body>
</html>`;
}

/* ------------------------------------------------------------ 5. DISCOVERY */
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, acc); }
    else if (e.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

const REQUIRED = ["title", "slug", "type", "domain", "level", "status", "updated"];

function loadNotes() {
  const notes = [];
  /* Notes live ONLY in the numbered domain directories. Scanning by that rule
     rather than by an exclusion list means tooling directories (deploy/,
     scripts/, .github/) can carry their own README without failing the build —
     and the deploy hook runs --check, so a false failure there blocks
     publishing. */
  const domains = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
    .map(e => path.join(ROOT, e.name));

  for (const file of domains.flatMap(d => walk(d))) {
    const relFile = path.relative(ROOT, file).replace(/\\/g, "/");
    if (ROOT_DOCS.includes(relFile)) continue;

    const raw = fs.readFileSync(file, "utf8");
    const { data, body } = parseFrontmatter(raw, relFile);
    if (!data) { err(relFile, "missing YAML frontmatter"); continue; }

    for (const k of REQUIRED) if (!data[k]) err(relFile, `frontmatter missing required key: ${k}`);
    if (data.type && !VALID_TYPES.includes(data.type)) err(relFile, `unknown type "${data.type}"`);
    if (data.status && !VALID_STATUS.includes(data.status)) err(relFile, `unknown status "${data.status}"`);
    const lvl = Number(data.level);
    if (data.level && !(lvl >= 1 && lvl <= 5)) err(relFile, `level must be 1..5, got "${data.level}"`);

    const expectedSlug = path.basename(file, ".md");
    if (data.slug && data.slug !== expectedSlug)
      err(relFile, `slug "${data.slug}" must match the filename "${expectedSlug}"`);

    /* The one-line mental model is the first blockquote under the H1. It is
       promoted to the page subtitle, so strip it from the body — otherwise it
       renders twice, once as the subtitle and once as a quote. */
    const lines = body.split("\n");
    let start = -1, end = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break;              // reached the first section
      if (start === -1 && /^>\s+\S/.test(lines[i])) start = i;
      if (start !== -1) { if (/^>/.test(lines[i])) end = i; else if (lines[i].trim()) break; }
    }
    let summary = "";
    let bodyForRender = body;
    if (start !== -1) {
      summary = lines.slice(start, end + 1).map(l => l.replace(/^>\s?/, "").trim()).join(" ").trim();
      bodyForRender = [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
    }
    if (!summary) warn(relFile, "no one-sentence mental model (a `> ...` line) found");

    notes.push({
      file, relFile, data, body: bodyForRender, summary,
      slug: data.slug || expectedSlug,
      title: data.title || expectedSlug,
      level: lvl || 1,
      out: relFile.replace(/\.md$/, ".html"),
    });
  }
  return notes;
}

/* --------------------------------------------------------------- 6. RENDER */
function build() {
  const notes = loadNotes();

  const slugs = new Map();
  for (const n of notes) {
    if (slugs.has(n.slug)) err(n.relFile, `duplicate slug "${n.slug}" (also in ${slugs.get(n.slug).relFile})`);
    slugs.set(n.slug, n);
  }

  /* cross-reference integrity: prerequisites/related must point at real notes */
  for (const n of notes)
    for (const key of ["prerequisites", "related"])
      for (const ref of n.data[key] || [])
        if (!slugs.has(ref)) err(n.relFile, `${key} references unknown slug "${ref}"`);

  checkRootDocs(notes);

  if (CHECK_ONLY) return report(notes);

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });
  fs.copyFileSync(path.join(__dirname, "assets", "notebook.css"),
                  path.join(DIST, "assets", "notebook.css"));
  /* the living style guide ships with the site so the visual system is
     always inspectable next to the notes it governs */
  fs.copyFileSync(path.join(__dirname, "styleguide.html"), path.join(DIST, "styleguide.html"));

  for (const n of notes) {
    const depth = n.out.split("/").length - 1;
    const up = depth ? "../".repeat(depth) : "./";
    const ctx = {
      file: n.file, name: n.relFile, slugs,
      rel: target => up + target,      // dist paths mirror the repo tree
    };

    const bodyNoH1 = n.body.replace(/^#\s+.*$/m, "");
    const bodyHtml = renderBody(bodyNoH1, ctx);

    /* Dangling refs are already reported as errors by the linter. Render what
       resolves rather than crashing the whole build — writing `related:` before
       the target note exists is a normal step in drafting. */
    const link = s => {
      const t = slugs.get(s);
      return t ? `<a href="${up + t.out}">${escapeHtml(t.title)}</a>` : null;
    };
    const chainOf = (key, label, sep) => {
      const links = (n.data[key] || []).map(link).filter(Boolean);
      return links.length ? `<span class="chain"><strong>${label}</strong> ${links.join(sep)}</span>` : "";
    };
    const chain = [
      chainOf("prerequisites", "Needs first:", " → "),
      chainOf("related", "Leads to:", " · "),
    ].filter(Boolean).join("<br>");

    const footer =
      `<div class="related">${chain}</div>` +
      `<div class="note-footer"><span>Level ${n.level} · ${escapeHtml(n.data.type)} · ${escapeHtml(n.data.status)}</span>` +
      `<span>${escapeHtml(n.data.domain)}</span></div>`;

    const html = shell({
      title: n.title,
      subtitle: n.summary,
      tags: n.data.tags || [],
      date: n.data.updated,
      bodyHtml, footer,
      cssPath: up + "assets/notebook.css",
      homePath: up + "index.html",
    });

    const outPath = path.join(DIST, n.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, "utf8");
  }

  writeGallery(notes);
  writeIndexMd(notes);
  return report(notes);
}

/* ------------------------------------------------------- 7. GALLERY + INDEX */
const byDomain = notes => {
  const m = new Map();
  for (const n of notes) (m.get(n.data.domain) || m.set(n.data.domain, []).get(n.data.domain)).push(n);
  for (const list of m.values()) list.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title));
  return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])));
};

function writeGallery(notes) {
  const sections = [...byDomain(notes).entries()].map(([domain, list]) => `
  <section class="section">
    <h2 class="section-title"><span class="st-text">${escapeHtml(domain)}</span></h2>
    <div class="card-grid">
      ${list.map(n => `<article class="hand-box card">
        <h3><a href="${n.out}">${escapeHtml(n.title)}</a>
        <span class="level-badge lvl-${n.level}">L${n.level}</span></h3>
        <p>${escapeHtml(n.summary)}</p>
      </article>`).join("")}
    </div>
  </section>`).join("");

  fs.writeFileSync(path.join(DIST, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gendi Notes</title>${FONTS}
<link rel="stylesheet" href="assets/notebook.css"></head>
<body><main class="note-page" id="main">
  <div class="note-meta"><span class="note-tags"><span class="tag">DevOps</span> <span class="tag">SRE</span> <span class="tag">PlatformEngineering</span></span>
  <span class="note-date">${new Date().toISOString().slice(0, 10)}</span></div>
  <h1 class="note-title">Gendi Notes <span class="star">☆</span></h1>
  <span class="title-underline"></span>
  <p class="note-subtitle">A second brain for production engineering — ${notes.length} notes.</p>
  ${sections}
</main></body></html>`, "utf8");
}

/* INDEX.md is regenerated between markers so hand-written prose survives. */
function writeIndexMd(notes) {
  const idx = path.join(ROOT, "INDEX.md");
  if (!fs.existsSync(idx)) return;
  const cur = fs.readFileSync(idx, "utf8");
  const S = "<!-- AUTO-INDEX:START -->", E = "<!-- AUTO-INDEX:END -->";
  if (!cur.includes(S) || !cur.includes(E)) { warn("INDEX.md", "missing AUTO-INDEX markers; index not regenerated"); return; }

  const body = [...byDomain(notes).entries()].map(([domain, list]) => {
    const rows = list.map(n =>
      `| L${n.level} | [${n.title}](${n.relFile}) | ${n.data.type} | ${n.summary} |`).join("\n");
    return `### ${domain}\n\n| Lvl | Note | Type | Mental model |\n|:---|:---|:---|:---|\n${rows}\n`;
  }).join("\n");

  const generated = `${S}\n<!-- Generated by \`node site/build.mjs\`. Do not edit by hand. -->\n\n` +
    `**${notes.length} notes.** Last generated ${new Date().toISOString().slice(0, 10)}.\n\n${body}\n${E}`;

  fs.writeFileSync(idx, cur.slice(0, cur.indexOf(S)) + generated + cur.slice(cur.indexOf(E) + E.length), "utf8");
}

/* ------------------------------------------------- 7b. ROOT DOCUMENT LINKS */
/* Root docs are exempt from frontmatter, but their links still have to resolve.
   README and ROADMAP are the most-followed paths in the repo, so an unchecked
   dead link there is worse than one buried in a note. */
function checkRootDocs(notes) {
  const byPath = new Set(notes.map(n => n.relFile));
  for (const doc of ROOT_DOCS) {
    const abs = path.join(ROOT, doc);
    if (!fs.existsSync(abs)) { warn(doc, "referenced root document does not exist"); continue; }
    const text = fs.readFileSync(abs, "utf8");
    for (const m of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      const target = href.split("#")[0];
      if (!target) continue;
      if (!fs.existsSync(path.resolve(ROOT, target))) {
        err(doc, `broken link: ${target}`);
      } else if (/^\d{2}-/.test(target) && target.endsWith(".md") && !byPath.has(target)) {
        /* Only a .md inside a numbered domain is expected to be an indexed
           note. Links to tooling docs (deploy/README.md, site/README.md) are
           legitimate, and warning about them would train you to ignore
           warnings — which is worse than not having them. */
        warn(doc, `links into a domain directory but is not an indexed note: ${target}`);
      }
    }
  }
}

/* --------------------------------------------------------------- 8. REPORT */
function report(notes) {
  const errors = problems.filter(p => p.sev === "ERROR");
  const warns  = problems.filter(p => p.sev === "WARN");
  for (const p of problems)
    console.log(`${p.sev === "ERROR" ? "✗" : "!"} ${p.sev}  ${p.file}\n    ${p.msg}`);
  if (!QUIET || problems.length)
    console.log(`\n${CHECK_ONLY ? "Checked" : "Built"} ${notes.length} notes — ${errors.length} error(s), ${warns.length} warning(s).`);
  if (errors.length) process.exitCode = 1;
  return notes.length;
}

build();
