/* ============================================================================
 * GENDI NOTES DASHBOARD — note preparation + pre-flight lint
 * ----------------------------------------------------------------------------
 * Pure functions, no DOM, no network: runs in the browser and under Node
 * (site/admin/test.mjs exercises it against every real note).
 *
 * The lint here MIRRORS site/build.mjs so a note that passes in the dashboard
 * also passes the deploy. build.mjs is still the authority — if the two ever
 * disagree, the GitHub Actions lint wins and the live site keeps serving the
 * previous version. When you change a rule in build.mjs, change it here too.
 * ========================================================================== */

export const DOMAIN_NAMES = {
  "00-foundations": "Foundations",
  "01-devops": "DevOps",
  "02-containers": "Containers",
  "03-kubernetes": "Kubernetes",
  "04-cloud": "Cloud",
  "05-infrastructure-as-code": "Infrastructure as Code",
  "06-platform-engineering": "Platform Engineering",
  "07-sre": "SRE",
  "08-observability": "Observability",
  "09-databases": "Databases",
  "10-distributed-systems": "Distributed Systems",
  "11-security": "Security",
  "12-system-design": "System Design",
  "13-interviews": "Interviews",
  "14-cheat-sheets": "Cheat Sheets",
  "15-production": "Production",
};

export const VALID_TYPES = ["guide", "concept", "architecture", "troubleshooting", "interview",
                            "cheat-sheet", "system-design", "incident", "runbook"];
export const VALID_STATUS = ["stable", "draft", "seed"];
export const REQUIRED = ["title", "slug", "type", "domain", "level", "status", "updated"];

/* The house order of frontmatter keys (templates/guide-template.md). */
const KEY_ORDER = ["title", "slug", "type", "domain", "tags", "keywords", "level",
                   "status", "prerequisites", "related", "updated"];
const LIST_KEYS = new Set(["tags", "keywords", "prerequisites", "related"]);

/* build.mjs CALLOUTS + the :::q interview card. */
const DIRECTIVES = new Set(["tip", "key", "warn", "danger", "note", "ar", "q"]);
const BAD_GLYPHS = { "▶": "→", "▼": "↓", "◀": "←", "▲": "↑", "►": "→", "◄": "←", "╌": "─" };

/* A file called README.md (or notes.md…) says nothing about its topic, so the
   slug comes from the title instead of the filename. */
const GENERIC_NAMES = new Set(["readme", "index", "notes", "note", "untitled", "document",
                               "draft", "new", "main", "doc", "file", "temp", "test"]);

/* ------------------------------------------------------------- utilities */
export const normalize = text => String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n");

export function slugify(s) {
  return String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80).replace(/-+$/, "");
}

export const today = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const humanize = s => String(s).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
  .replace(/^./, c => c.toUpperCase());

const unquote = s => s.replace(/^["']|["']$/g, "");

/* Lines outside ``` fences, with their 0-based index. */
function unfenced(lines) {
  const out = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) { inFence = !inFence; return; }
    if (!inFence) out.push({ line, i });
  });
  return out;
}

/* ----------------------------------------------------------- frontmatter */
/* Same detection as build.mjs parseFrontmatter(). */
function splitFrontmatter(raw) {
  if (!raw.startsWith("---")) return { has: false, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { has: false, broken: true, body: raw };
  const nl = raw.indexOf("\n", end + 1);
  return {
    has: true,
    block: raw.slice(3, end),                 // keeps the original formatting
    body: nl === -1 ? "" : raw.slice(nl + 1),
    lineCount: raw.slice(0, nl === -1 ? raw.length : nl + 1).split("\n").length - 1,
  };
}

/* A port of build.mjs's deliberately small YAML subset. */
export function parseBlock(block) {
  const data = {};
  const warnings = [];
  let key = null;
  const folded = block.trim().replace(/\[[^\]]*\]/g, m => m.replace(/\s*\n\s*/g, " "));
  for (const line of folded.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const bullet = line.match(/^\s*-\s+(.*)$/);
    if (bullet && key) { (data[key] ||= []).push(unquote(bullet[1])); continue; }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) { warnings.push(`unparsed frontmatter line: ${line.trim()}`); continue; }
    key = kv[1];
    const val = kv[2].trim();
    if (val === "") data[key] = [];
    else if (val.startsWith("[")) {
      data[key] = val.replace(/^\[|\]$/g, "").split(",").map(s => unquote(s.trim())).filter(Boolean);
    } else data[key] = unquote(val);
  }
  return { data, warnings };
}

/* Serialise one value so build.mjs reads back exactly what we meant, and
   GitHub's own frontmatter table still renders it. */
function fmValue(key, v) {
  if (LIST_KEYS.has(key) || Array.isArray(v)) {
    const items = (Array.isArray(v) ? v : String(v).split(","))
      .map(x => String(x).replace(/[\[\],]/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return `[${items.join(", ")}]`;
  }
  const s = String(v).replace(/\s*\n\s*/g, " ").trim();
  const risky = /^[\[\]{}>|*&!%@`'"#-]|:\s|\s#|:$/.test(s);
  if (!risky) return s;
  if (!s.includes('"')) return `"${s}"`;
  if (!s.includes("'")) return `'${s}'`;
  return s;
}

/* Replace (or add) one key in the original frontmatter text, leaving every
   other line — comments, wrapped keyword lists — exactly as the author wrote. */
function patchKey(lines, key, value) {
  const line = `${key}: ${fmValue(key, value)}`;
  const re = new RegExp(`^${key}\\s*:`);
  const i = lines.findIndex(l => re.test(l));
  if (i === -1) {
    /* Insert after the nearest key that precedes it in the house order. */
    const order = KEY_ORDER.indexOf(key);
    let at = lines.length;
    if (order !== -1) {
      for (let k = order + 1; k < KEY_ORDER.length; k++) {
        const j = lines.findIndex(l => new RegExp(`^${KEY_ORDER[k]}\\s*:`).test(l));
        if (j !== -1) { at = j; break; }
      }
    }
    lines.splice(at, 0, line);
    return;
  }
  let j = i + 1;
  const rest = lines[i].replace(/^[^:]*:\s*/, "");
  if (rest.startsWith("[") && !rest.includes("]")) {
    while (j < lines.length && !lines[j].includes("]")) j++;
    j = Math.min(j + 1, lines.length);
  } else if (rest === "") {
    while (j < lines.length && /^\s*-\s+/.test(lines[j])) j++;
  }
  lines.splice(i, j - i, line);
}

function sameValue(key, a, b) {
  return fmValue(key, a ?? "") === fmValue(key, b ?? "");
}

/* ------------------------------------------------------------ body parts */
function findH1(lines) {
  for (const { line, i } of unfenced(lines)) {
    const m = line.match(/^#\s+(.*)$/);
    if (m) return { i, text: m[1].trim() };
  }
  return null;
}

/* The lede: build.mjs lifts the first blockquote above the first ## out as the
   page subtitle and the INDEX entry. Same scan. */
function findLede(lines) {
  let start = -1, end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    if (start === -1 && /^>\s+\S/.test(lines[i])) start = i;
    if (start !== -1) { if (/^>/.test(lines[i])) end = i; else if (lines[i].trim()) break; }
  }
  if (start === -1) return null;
  const text = lines.slice(start, end + 1).map(l => l.replace(/^>\s?/, "").trim()).join(" ").trim();
  return { start, end, text };
}

/* --------------------------------------------------------------- analyse */
/* Read an uploaded file and work out everything the form can prefill. */
export function analyze(rawText, fileName = "") {
  const raw = normalize(rawText);
  const fm = splitFrontmatter(raw);
  const parsed = fm.has ? parseBlock(fm.block) : { data: {}, warnings: [] };
  const data = parsed.data;
  const lines = fm.body.split("\n");
  const h1 = findH1(lines);
  const lede = findLede(lines);

  const base = fileName.replace(/\.(md|markdown|txt)$/i, "");
  const generic = !base || GENERIC_NAMES.has(slugify(base));
  const title = (typeof data.title === "string" && data.title) || h1?.text ||
                (generic ? "" : humanize(base));
  const slug = (typeof data.slug === "string" && slugify(data.slug)) ||
               (generic ? slugify(title) : slugify(base)) || slugify(title) || "";

  const list = k => Array.isArray(data[k]) ? data[k] : (data[k] ? [data[k]] : []);
  const lvl = Number(data.level);

  /* Invalid values would fail the deploy; the form starts from a valid one
     and says so, rather than silently rewriting the author's choice. */
  const corrections = [];
  if (data.type && !VALID_TYPES.includes(data.type)) corrections.push(`type "${data.type}" is not a valid type — set to guide. Change it under Details.`);
  if (data.level && !(lvl >= 1 && lvl <= 5)) corrections.push(`level "${data.level}" is not 1–5 — set to 2. Change it under Details.`);
  if (data.status && !VALID_STATUS.includes(data.status)) corrections.push(`status "${data.status}" is not valid — set to stable. Change it under Details.`);

  return {
    raw, fileName,
    hasFrontmatter: fm.has,
    brokenFrontmatter: !!fm.broken,
    fmWarnings: parsed.warnings,
    fmLineCount: fm.has ? fm.lineCount : 0,
    block: fm.block, body: fm.body, data,
    h1, lede,
    title, slug,
    type: VALID_TYPES.includes(data.type) ? data.type : "guide",
    level: lvl >= 1 && lvl <= 5 ? lvl : 2,
    status: VALID_STATUS.includes(data.status) ? data.status : "stable",
    tags: list("tags"),
    keywords: list("keywords"),
    prerequisites: list("prerequisites"),
    related: list("related"),
    summary: lede?.text || "",
    corrections,
    binary: /\u0000/.test(raw),
  };
}

/* ----------------------------------------------------------------- build */
/* Produce the exact file that will be committed.
   form = { domain, folder, slug, title, type, level, status, tags, summary, updated } */
export function buildNote(a, form) {
  const slug = slugify(form.slug) || "note";
  const folder = form.folder ? form.folder.replace(/^\/+|\/+$/g, "") : "";
  const path = [form.domain, folder, `${slug}.md`].filter(Boolean).join("/");
  const notes = [...(a.corrections || [])];

  const want = {
    title: form.title.trim() || humanize(slug),
    slug,
    type: form.type,
    domain: form.domain,
    tags: form.tags,
    keywords: a.keywords,
    level: String(form.level),
    status: form.status,
    prerequisites: a.prerequisites,
    related: a.related,
    updated: form.updated || today(),
  };

  /* Frontmatter: patch the author's block, or write a fresh one. */
  let block;
  if (a.hasFrontmatter) {
    const lines = a.block.split("\n");
    const head = lines.shift();              // remainder of the opening --- line
    for (const k of KEY_ORDER) {
      if (!sameValue(k, a.data[k], want[k]) || a.data[k] === undefined) {
        if (LIST_KEYS.has(k) && a.data[k] === undefined && !want[k].length && k !== "tags") continue;
        patchKey(lines, k, want[k]);
      }
    }
    block = [head, ...lines].join("\n");
  } else {
    block = "\n" + KEY_ORDER.map(k => `${k}: ${fmValue(k, want[k])}`).join("\n");
    notes.push("Frontmatter added — the build requires it.");
  }

  /* Body: an H1 at the top, and the one-line summary under it. */
  let lines = a.body.split("\n");
  let h1 = findH1(lines);
  if (!h1) {
    let at = 0;
    while (at < lines.length && !lines[at].trim()) at++;
    lines.splice(at, 0, `# ${want.title}`, "");
    h1 = { i: at, text: want.title };
    notes.push("Added a `# Title` heading — the build removes the first H1 it finds, which would otherwise be a line of your code.");
  } else if (form.title.trim() && form.title.trim() !== a.title && h1.text === a.title) {
    lines[h1.i] = `# ${want.title}`;
  }

  const summary = (form.summary || "").replace(/\s*\n\s*/g, " ").trim();
  const lede = findLede(lines);
  if (summary && summary !== (lede?.text || "")) {
    if (lede) lines.splice(lede.start, lede.end - lede.start + 1, `> ${summary}`);
    else {
      let at = h1.i + 1;
      lines.splice(at, 0, "", `> ${summary}`);
      if (lines[at + 2] !== undefined && lines[at + 2].trim()) lines.splice(at + 2, 0, "");
    }
  }

  let body = lines.join("\n");
  if (!body.endsWith("\n")) body += "\n";
  const content = `---${block}\n---\n${body}`;

  /* Parse our own output back: what build.mjs will see, not what we hoped. */
  const round = splitFrontmatter(content);
  const back = parseBlock(round.block);
  return { path, slug, content, data: back.data, body: round.body, fmWarnings: back.warnings, notes };
}

/* ------------------------------------------------------------------ lint */
/* index = { slugs: Map<slug, path>, paths: Set<path> } from the repo tree.
   Content checks run on the ORIGINAL upload so line numbers match the file
   in your editor. Frontmatter checks run on the file that will be committed. */
export function lint(a, built, index) {
  const problems = [];
  const E = msg => problems.push({ sev: "error", msg });
  const W = msg => problems.push({ sev: "warn", msg });
  const { data, path, slug } = built;
  const off = a.fmLineCount;

  if (a.binary) E("This does not look like a UTF-8 text file. Save it as UTF-8 Markdown and try again.");
  if (a.brokenFrontmatter) E("The file starts with --- but the frontmatter is never closed with a second ---.");
  for (const w of built.fmWarnings) W(w);

  for (const k of REQUIRED) if (!data[k]) E(`frontmatter missing required key: ${k}`);
  if (data.type && !VALID_TYPES.includes(data.type)) E(`unknown type "${data.type}"`);
  if (data.status && !VALID_STATUS.includes(data.status)) E(`unknown status "${data.status}"`);
  const lvl = Number(data.level);
  if (data.level && !(lvl >= 1 && lvl <= 5)) E(`level must be 1..5, got "${data.level}"`);

  const expected = path.split("/").pop().replace(/\.md$/, "");
  if (data.slug && data.slug !== expected) E(`slug "${data.slug}" must match the filename "${expected}"`);

  const owner = index.slugs.get(slug);
  if (owner && owner !== path)
    E(`slug "${slug}" is already used by ${owner}. Pick that category to update it, or change the slug.`);

  const known = s => index.slugs.has(s) || s === slug;
  for (const key of ["prerequisites", "related"])
    for (const ref of Array.isArray(data[key]) ? data[key] : [])
      if (!known(ref)) E(`${key} references unknown slug "${ref}"`);

  /* ::: blocks — build.mjs checkDirectives() */
  const lines = a.body.split("\n");
  const stack = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    const open = line.match(/^:::\s*(\w+)/);
    if (open) {
      if (!DIRECTIVES.has(open[1])) E(`line ${i + 1 + off}: unknown directive :::${open[1]}`);
      else stack.push({ name: open[1], line: i + 1 + off });
      return;
    }
    if (/^:::\s*$/.test(line)) {
      if (!stack.length) E(`line ${i + 1 + off}: closing ::: with nothing open`);
      else stack.pop();
    }
  });
  for (const s of stack) E(`line ${s.line}: :::${s.name} is never closed — it swallows the rest of the note`);

  /* diagrams — build.mjs checkDiagrams() */
  let inDiagram = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) { inDiagram = /^```diagram/.test(line); return; }
    if (!inDiagram) return;
    for (const [bad, good] of Object.entries(BAD_GLYPHS))
      if (line.includes(bad)) E(`line ${i + 1 + off}: diagram uses "${bad}" — use "${good}" (the triangles break box alignment)`);
  });

  /* [[wikilinks]] and relative .md links — build.mjs inline() */
  const dir = path.split("/").slice(0, -1);
  for (const { line, i } of unfenced(lines)) {
    const text = line.replace(/`[^`]+`/g, "");
    for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g))
      if (!known(m[1].trim())) E(`line ${i + 1 + off}: wikilink to unknown slug: [[${m[1].trim()}]]`);
    for (const m of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
      const href = m[2];
      if (/^(https?:|mailto:|#)/.test(href) || !href.endsWith(".md")) continue;
      /* build.mjs resolves on the filesystem, so a leading / means the disk root */
      if (href.startsWith("/")) { E(`line ${i + 1 + off}: broken link: ${href} (use a relative path)`); continue; }
      const target = resolve(dir, href.split("#")[0]);
      if (target !== path && !index.paths.has(target)) E(`line ${i + 1 + off}: broken link: ${href}`);
    }
  }

  if (!findLede(built.body.split("\n"))) W("no one-line summary — add one under Details (it becomes the page subtitle and the index entry)");
  if (!/[؀-ۿ]/.test(a.body)) W("no Arabic in this note — the house style re-explains every section in a :::ar block");

  return problems;
}

function resolve(dirParts, href) {
  const parts = href.startsWith("/") ? [] : [...dirParts];
  for (const seg of href.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop(); else parts.push(seg);
  }
  return parts.join("/");
}

/* ----------------------------------------------------------- repo index */
/* From GET /git/trees/<branch>?recursive=1 → what the form and lint need. */
export function indexTree(entries) {
  const paths = new Set();
  const slugs = new Map();
  const shas = new Map();
  const folders = new Map();          // domain → Map<folder, noteCount>
  const domains = new Set(Object.keys(DOMAIN_NAMES));

  for (const e of entries) {
    paths.add(e.path);
    const parts = e.path.split("/");
    if (!/^\d{2}-/.test(parts[0])) continue;
    if (parts.some(p => p.startsWith("."))) {
      if (e.type === "blob" && parts.length === 3 && parts[2] === ".gitkeep") ensure(parts[0], parts[1]);
      continue;
    }
    domains.add(parts[0]);
    if (e.type === "tree" && parts.length === 2) ensure(parts[0], parts[1]);
    if (e.type === "blob" && e.path.endsWith(".md")) {
      slugs.set(parts[parts.length - 1].replace(/\.md$/, ""), e.path);
      shas.set(e.path, e.sha);
      if (parts.length >= 3) {
        ensure(parts[0], parts[1]);
        const m = folders.get(parts[0]);
        m.set(parts[1], m.get(parts[1]) + 1);
      }
    }
  }
  function ensure(d, f) {
    domains.add(d);
    if (!folders.has(d)) folders.set(d, new Map());
    if (!folders.get(d).has(f)) folders.get(d).set(f, 0);
  }
  return { paths, slugs, shas, folders, domains: [...domains].sort() };
}
