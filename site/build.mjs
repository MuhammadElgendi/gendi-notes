#!/usr/bin/env node
/* ============================================================================
 * GENDI NOTES — BUILD + LINT
 * ----------------------------------------------------------------------------
 *   node site/build.mjs           build site/dist/ AND regenerate INDEX.md
 *   node site/build.mjs --check   lint only, no writes (exit 1 on error)
 *   node site/build.mjs --quiet   build, print only warnings/errors
 *
 * Zero dependencies. Node 18+. Works offline.
 *
 * WHY THIS EXISTS
 *   The index must never lie. Hand-maintained indexes rot within a month, so
 *   INDEX.md is generated from the notes' own frontmatter, and the linter
 *   fails the build on a broken cross-reference. Add a note -> rebuild -> the
 *   index, the navigation and the styling all update themselves.
 * ========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { notePage, homePage, DOMAIN_NAMES } from "./shell.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(__dirname, "dist");

const ARGV = new Set(process.argv.slice(2));
const CHECK_ONLY = ARGV.has("--check");
const QUIET = ARGV.has("--quiet");

const ROOT_DOCS = ["README.md", "INDEX.md", "ROADMAP.md", "GLOSSARY.md",
                   "PRINCIPLES.md", "CONTRIBUTING.md", "PUBLISHING.md"];
const SKIP_DIRS = new Set(["site", "node_modules", ".git", ".github", "templates"]);

const VALID_TYPES = ["concept", "guide", "architecture", "troubleshooting", "interview",
                     "cheat-sheet", "system-design", "incident", "runbook"];
const VALID_STATUS = ["seed", "draft", "stable"];

const problems = [];
const err  = (f, m) => problems.push({ sev: "ERROR", file: f, msg: m });
const warn = (f, m) => problems.push({ sev: "WARN",  file: f, msg: m });

/* --------------------------------------------------------- 1. FRONTMATTER */
/* A deliberately small YAML subset: scalars, [inline, lists], and - bullets. */
function parseFrontmatter(raw, file) {
  if (!raw.startsWith("---")) return { data: null, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) { err(file, "frontmatter opened with --- but never closed"); return { data: null, body: raw }; }
  const block = raw.slice(3, end).trim();
  const body = raw.slice(raw.indexOf("\n", end + 1) + 1);
  const data = {};
  let key = null;
  /* An inline [a, b, c] list is allowed to wrap across lines. Keyword lists
     run long now that they carry Arabic search terms beside the English ones,
     and a 140-character unbreakable line in the frontmatter is worse than
     this fold. Brackets cannot nest here, so a non-greedy scan is enough. */
  const folded = block.replace(/\[[^\]]*\]/g, m => m.replace(/\s*\n\s*/g, " "));
  for (const line of folded.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet && key) { (data[key] ||= []).push(unquote(bullet[1])); continue; }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) { warn(file, `unparsed frontmatter line: ${line.trim()}`); continue; }
    key = kv[1];
    const val = kv[2].trim();
    if (val === "") data[key] = [];
    else if (val.startsWith("[")) {
      data[key] = val.replace(/^\[|\]$/g, "").split(",").map(s => unquote(s.trim())).filter(Boolean);
    } else data[key] = unquote(val);
  }
  return { data, body };
}
const unquote = s => s.replace(/^["']|["']$/g, "");

/* ----------------------------------------------------------- 2. INLINE MD */
const escapeHtml = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
                         .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* BIDIRECTIONAL TEXT
   These notes are bilingual: an English technical spine — headings, commands,
   tables — with the teaching in Egyptian Arabic. Any block containing an
   Arabic letter is marked dir="auto", so the browser resolves direction from
   the block's first strong character. A table cell reading "صورة مجمّدة" then
   right-aligns itself while the English cell beside it does not, with no
   markup from the author. Blocks with no Arabic get no attribute at all. */
/* Range endpoints are written as literal characters, not escapes, so the class
   survives every editor and encoding round-trip. In hex they are:
     0600-06FF Arabic · 0750-077F Supplement · 08A0-08FF Extended-A
     FB50-FDFF Presentation Forms-A · FE70-FEFC Presentation Forms-B
   Forms-B deliberately stops at FEFC, one short of FEFF, so a stray
   byte-order mark never makes an English-only block look Arabic. */
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-ﻼ]/;
const bidi = s => (ARABIC.test(s) ? ' dir="auto"' : "");

function inline(text, ctx) {
  /* Rendered fragments park behind a NUL sentinel so later regexes cannot
     chew through them. A plain " 0 " marker would collide with any digit in
     the prose ("level 3 note" -> stash[3]). */
  const stash = [];
  const keep = html => `\u0000${stash.push(html) - 1}\u0000`;

  let s = text;
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${escapeHtml(c)}</code>`));
  s = escapeHtml(s);

  /* [[slug]] and [[slug|label]] — checked cross-references */
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, slug, label) => {
    const target = ctx.slugs.get(slug.trim());
    const txt = (label || (target ? target.title : slug)).trim();
    if (!target) { err(ctx.name, `wikilink to unknown slug: [[${slug.trim()}]]`); return escapeHtml(txt); }
    return keep(`<a href="${ctx.up + target.out}">${escapeHtml(txt)}</a>`);
  });

  /* [text](target) — .md targets rewritten to .html and existence-checked */
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    let out = href;
    if (!/^(https?:|mailto:|#)/.test(href)) {
      const abs = path.resolve(path.dirname(ctx.file), href.split("#")[0]);
      if (href.endsWith(".md") && !fs.existsSync(abs)) err(ctx.name, `broken link: ${href}`);
      out = href.replace(/\.md(#|$)/, ".html$1");
    }
    const ext = /^https?:/.test(out) ? ' target="_blank" rel="noopener"' : "";
    return keep(`<a href="${out}"${ext}>${label}</a>`);
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
}

/* -------------------------------------------------------------- 3. BLOCKS */
const CALLOUTS = {
  tip:    { cls: "is-tip",    icon: "\u{1F4A1}", label: "Tip" },
  key:    { cls: "is-key",    icon: "✓",    label: "Key point" },
  warn:   { cls: "is-warn",   icon: "⚠",    label: "Watch out" },
  danger: { cls: "is-danger", icon: "\u{1F6A8}", label: "Common failure" },
  note:   { cls: "is-note",   icon: "\u{1F4D8}", label: "Going deeper" },
  /* The Egyptian-Arabic explainer: the paragraph above, said again in the
     language the reader thinks in. Rendered RTL in an Arabic face; code,
     diagrams and command names inside it are forced back to LTR by the
     stylesheet. See .callout.is-ar in app.css. */
  ar:     { cls: "is-ar",     icon: "\u{1F4AC}", label: "شرح" },
};

const slugify = s => s.toLowerCase().trim()
  .replace(/[`*_~\[\]()]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "") || "section";

/* Reads the body of a ::: block, honouring nesting, and reports the index of
   the line after its closing fence. Shared by the callouts and by :::q. */
function readDirective(lines, i) {
  const buf = [];
  let depth = 1;
  while (i < lines.length) {
    if (/^:::\s*\w+/.test(lines[i])) depth++;
    else if (/^:::\s*$/.test(lines[i])) { depth--; if (!depth) break; }
    buf.push(lines[i++]);
  }
  return { body: buf.join("\n"), end: i + 1 };
}

function renderBody(md, ctx, toc) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    /* fenced blocks. ```diagram is box art; ```sh title="…" is a command. */
    const fence = line.match(/^```(\S*)\s*(?:title="([^"]*)")?/);
    if (fence) {
      const lang = fence[1];
      const title = fence[2];
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      const code = escapeHtml(buf.join("\n"));
      if (lang === "diagram") { out.push(`<div class="diagram">${code}</div>`); continue; }
      out.push(
        `<div class="code-block">` +
        (title ? `<div class="code-label">${escapeHtml(title)}</div>` : "") +
        `<pre><code class="lang-${lang || "text"}">${code}</code></pre></div>`
      );
      continue;
    }

    /* :::q <question> — one interview question. The answer stays collapsed
       until it is clicked, so an interview page can be worked through as a
       quiz before it is read as a reference. <details> does this natively:
       no JavaScript, and the answer still prints and still matches Ctrl-F
       because the text is always in the DOM. */
    const question = line.match(/^:::\s*q\s+(.+)$/);
    if (question) {
      const q = question[1].trim();
      const read = readDirective(lines, i + 1);
      i = read.end;
      out.push(
        `<details class="qa">` +
        `<summary${bidi(q)}>${inline(q, ctx)}</summary>` +
        `<div class="qa-answer">${renderBody(read.body, ctx, null)}</div>` +
        `</details>`
      );
      continue;
    }

    /* ::: callouts */
    const dir = line.match(/^:::\s*(\w+)\s*(.*)$/);
    if (dir && CALLOUTS[dir[1]]) {
      const spec = CALLOUTS[dir[1]];
      const custom = dir[2].trim();
      const read = readDirective(lines, i + 1);
      i = read.end;
      /* dir/lang go on the aside itself: the label and the body both need to
         flip, and lang lets the browser pick Arabic shaping and hyphenation. */
      const rtl = dir[1] === "ar" ? ` dir="rtl" lang="ar-EG"` : "";
      out.push(
        `<aside class="callout ${spec.cls}"${rtl}>` +
        `<span class="callout-icon" aria-hidden="true">${spec.icon}</span>` +
        /* A custom title runs through inline() so `code` and **bold** in it
           render, instead of showing literal backticks and asterisks — titles
           name flags and commands constantly (":::warn `chmod 777` is not a
           fix"). The default label is a plain string and only needs escaping. */
        `<span class="callout-label"${bidi(custom)}>` +
        `${custom ? inline(custom, ctx) : escapeHtml(spec.label)}</span>` +
        `<div class="callout-body">${renderBody(read.body, ctx, null)}</div></aside>`
      );
      continue;
    }

    /* tables */
    if (/^\|/.test(line) && /^\|[\s:|-]+\|$/.test(lines[i + 1] || "")) {
      const cells = r => r.split("|").slice(1, -1).map(c => inline(c.trim(), ctx));
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map(h => `<th${bidi(h)}>${h}</th>`).join("")}</tr></thead>` +
        `<tbody>${rows.map(r => `<tr>${r.map(c => `<td${bidi(c)}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      );
      continue;
    }

    /* headings — H2/H3 get an id and land in the on-page TOC */
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const depth = h[1].length;
      const text = h[2].trim();
      if (depth === 1) { i++; continue; }            // H1 is rendered by the shell
      const id = slugify(text);
      if (toc && depth <= 3) toc.push({ level: depth, id, text: text.replace(/[`*]/g, "") });
      const anchor = depth <= 3 ? `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a>` : "";
      out.push(`<h${depth} id="${id}"${bidi(text)}>${inline(text, ctx)}${anchor}</h${depth}>`);
      i++; continue;
    }

    /* blockquote */
    if (line.startsWith("> ")) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith(">")) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote class="callout is-note"><span class="callout-icon" aria-hidden="true">&ldquo;</span>` +
               `<span class="callout-label">Note</span>` +
               `<div class="callout-body">${renderBody(buf.join("\n"), ctx, null)}</div></blockquote>`);
      continue;
    }

    /* lists */
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      let checklist = false;
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let t = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        if (/^\[[ xX]\]\s*/.test(t)) { checklist = true; t = t.replace(/^\[[ xX]\]\s*/, ""); }
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i]))
          t += " " + lines[i++].trim();
        items.push(`<li${bidi(t)}>${inline(t, ctx)}</li>`);
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}${checklist ? ' class="checklist"' : ""}>${items.join("")}</${tag}>`);
      continue;
    }

    if (line.trim() === "---") { out.push("<hr>"); i++; continue; }
    if (!line.trim()) { i++; continue; }

    /* paragraph */
    const buf = [];
    while (i < lines.length && lines[i].trim() &&
           !/^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\||:::|---$)/.test(lines[i]))
      buf.push(lines[i++]);
    if (buf.length) out.push(`<p${bidi(buf.join(" "))}>${inline(buf.join(" "), ctx)}</p>`);
    else i++;
  }
  return out.join("\n");
}

/* ----------------------------------------------------------- 4. DISCOVERY */
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

/* An unclosed ::: block is invisible in the output and expensive to find:
   readDirective simply consumes the rest of the file, so the note renders with
   its whole tail swallowed into one callout and no error anywhere. Notes now
   nest :::ar and :::q several deep, so this is checked like any broken link. */
function checkDirectives(body, file) {
  const stack = [];
  let inFence = false;
  body.split("\n").forEach((line, i) => {
    if (/^```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const open = line.match(/^:::\s*(\w+)/);
    if (open) {
      if (open[1] !== "q" && !CALLOUTS[open[1]])
        err(file, `line ${i + 1}: unknown directive :::${open[1]}`);
      else stack.push({ name: open[1], line: i + 1 });
      return;
    }
    if (/^:::\s*$/.test(line)) {
      if (!stack.length) err(file, `line ${i + 1}: closing ::: with nothing open`);
      else stack.pop();
    }
  });
  for (const s of stack)
    err(file, `line ${s.line}: :::${s.name} is never closed — it swallows the rest of the note`);
}

/* CONTRIBUTING.md forbids the U+25B6 triangle arrows in diagrams: they are
   absent from Consolas and Courier New, so the browser substitutes a glyph of
   a different advance width and every box in the diagram drifts apart. The
   rule was documented but not enforced, and 43 of them had accumulated. */
const BAD_GLYPHS = { "▶": "→", "▼": "↓", "◀": "←", "▲": "↑", "►": "→", "◄": "←", "╌": "─" };

function checkDiagrams(body, file) {
  let inDiagram = false;
  body.split("\n").forEach((line, i) => {
    if (/^```/.test(line)) { inDiagram = /^```diagram/.test(line); return; }
    if (!inDiagram) return;
    for (const [bad, good] of Object.entries(BAD_GLYPHS))
      if (line.includes(bad))
        err(file, `line ${i + 1}: diagram uses "${bad}" — use "${good}" (U+2190 block); ` +
                  `the triangles are missing from Consolas and break box alignment`);
  });
}

function loadNotes() {
  const notes = [];
  /* Notes live ONLY in the numbered domain directories, so tooling folders
     (deploy/, scripts/) can carry a README without failing the build — the
     deploy hook runs --check, and a false failure there blocks publishing. */
  const domains = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter(e => e.isDirectory() && /^\d{2}-/.test(e.name))
    .map(e => path.join(ROOT, e.name));

  for (const file of domains.flatMap(d => walk(d))) {
    const relFile = path.relative(ROOT, file).replace(/\\/g, "/");
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

    checkDirectives(body, relFile);
    checkDiagrams(body, relFile);

    /* The lede: first blockquote under the H1, promoted to the page subtitle
       and the INDEX entry. Stripped from the body so it never renders twice. */
    const lines = body.split("\n");
    let start = -1, end = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) break;
      if (start === -1 && /^>\s+\S/.test(lines[i])) start = i;
      if (start !== -1) { if (/^>/.test(lines[i])) end = i; else if (lines[i].trim()) break; }
    }
    let summary = "", bodyForRender = body;
    if (start !== -1) {
      summary = lines.slice(start, end + 1).map(l => l.replace(/^>\s?/, "").trim()).join(" ").trim();
      bodyForRender = [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
    }
    if (!summary) warn(relFile, "no one-line summary (a `> ...` line under the H1)");

    notes.push({
      file, relFile, data, body: bodyForRender, summary,
      slug: data.slug || expectedSlug,
      title: data.title || expectedSlug,
      level: lvl || 1,
      out: relFile.replace(/\.md$/, ".html"),
      keywords: [...(data.tags || []), ...(data.keywords || [])].join(" "),
    });
  }
  return notes;
}

/* -------------------------------------------------------- 5. NAV STRUCTURE */
function buildNav(notes) {
  const order = Object.keys(DOMAIN_NAMES);
  const groups = new Map();
  for (const n of notes) {
    if (!groups.has(n.data.domain)) groups.set(n.data.domain, []);
    groups.get(n.data.domain).push(n);
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([domain, list]) => ({
      id: domain,
      name: DOMAIN_NAMES[domain] || domain,
      notes: list.sort((a, b) => a.level - b.level || a.title.localeCompare(b.title)),
    }));
}

/* --------------------------------------------------- 6. ROOT DOCUMENT LINKS */
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
      if (!fs.existsSync(path.resolve(ROOT, target))) err(doc, `broken link: ${target}`);
      else if (/^\d{2}-/.test(target) && target.endsWith(".md") && !byPath.has(target))
        warn(doc, `links into a domain directory but is not an indexed note: ${target}`);
    }
  }
}

/* --------------------------------------------------------------- 7. BUILD */
function build() {
  const notes = loadNotes();

  const slugs = new Map();
  for (const n of notes) {
    if (slugs.has(n.slug)) err(n.relFile, `duplicate slug "${n.slug}" (also ${slugs.get(n.slug).relFile})`);
    slugs.set(n.slug, n);
  }
  for (const n of notes)
    for (const key of ["prerequisites", "related"])
      for (const ref of n.data[key] || [])
        if (!slugs.has(ref)) err(n.relFile, `${key} references unknown slug "${ref}"`);

  checkRootDocs(notes);
  if (CHECK_ONLY) return report(notes);

  const nav = buildNav(notes);
  const flat = nav.flatMap(g => g.notes);     // reading order for prev/next

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });
  for (const f of ["app.css", "app.js", "boot.js"])
    fs.copyFileSync(path.join(__dirname, "assets", f), path.join(DIST, "assets", f));

  notes.forEach(n => {
    const depth = n.out.split("/").length - 1;
    const up = depth ? "../".repeat(depth) : "";
    const ctx = { file: n.file, name: n.relFile, slugs, up };
    const toc = [];
    const bodyHtml = renderBody(n.body.replace(/^#\s+.*$/m, ""), ctx, toc);

    const idx = flat.indexOf(n);
    const resolve = list => (list || []).map(s => slugs.get(s)).filter(Boolean);

    fs.mkdirSync(path.dirname(path.join(DIST, n.out)), { recursive: true });
    fs.writeFileSync(path.join(DIST, n.out), notePage({
      note: n, bodyHtml, toc, nav, up,
      prev: flat[idx - 1] || null,
      next: flat[idx + 1] || null,
      prereqs: resolve(n.data.prerequisites),
      related: resolve(n.data.related),
    }), "utf8");
  });

  fs.writeFileSync(path.join(DIST, "index.html"), homePage({ nav, notes }), "utf8");
  writeIndexMd(notes, nav);
  return report(notes);
}

/* INDEX.md is regenerated between markers so hand-written prose survives. */
function writeIndexMd(notes, nav) {
  const idx = path.join(ROOT, "INDEX.md");
  if (!fs.existsSync(idx)) return;
  const cur = fs.readFileSync(idx, "utf8");
  const S = "<!-- AUTO-INDEX:START -->", E = "<!-- AUTO-INDEX:END -->";
  if (!cur.includes(S) || !cur.includes(E)) { warn("INDEX.md", "missing AUTO-INDEX markers"); return; }

  const body = nav.map(g => {
    const rows = g.notes.map(n =>
      `| L${n.level} | [${n.title}](${n.relFile}) | ${n.data.type} | ${n.summary} |`).join("\n");
    return `### ${g.name}\n\n| Lvl | Note | Type | Summary |\n|:---|:---|:---|:---|\n${rows}\n`;
  }).join("\n");

  const generated = `${S}\n<!-- Generated by \`node site/build.mjs\`. Do not edit by hand. -->\n\n` +
    `**${notes.length} notes.** Last generated ${new Date().toISOString().slice(0, 10)}.\n\n${body}\n${E}`;

  fs.writeFileSync(idx, cur.slice(0, cur.indexOf(S)) + generated + cur.slice(cur.indexOf(E) + E.length), "utf8");
}

/* -------------------------------------------------------------- 8. REPORT */
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
