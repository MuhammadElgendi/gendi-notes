/* ============================================================================
 * Page shell — the HTML chrome every note is rendered into.
 * Kept apart from build.mjs so markup and Markdown parsing stay separable.
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

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?' +
  'family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">';

/* The theme is applied before first paint by a separate file, not an inline
   script: the CSP is script-src 'self' with no 'unsafe-inline'. */
const THEME_BOOT = up => `<script src="${up}assets/boot.js"></script>`;

function head({ title, description, up }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || "")}">
<meta name="color-scheme" content="light dark">
${FONTS}
<link rel="stylesheet" href="${up}assets/app.css">
${THEME_BOOT(up)}`;
}

function header(up) {
  return `<input type="checkbox" id="nav-toggle" class="nav-toggle" hidden>
<header class="header">
  <label for="nav-toggle" class="icon-btn nav-toggle-label" aria-label="Toggle navigation"
         style="display:none">&#9776;</label>
  <a class="brand" href="${up}index.html">
    <span class="brand-mark" aria-hidden="true">G</span> Gendi Notes
  </a>
  <span class="header-spacer"></span>
  <div class="header-actions">
    <button type="button" id="theme-toggle" class="icon-btn" aria-label="Toggle theme">&#9680;</button>
  </div>
</header>
<label for="nav-toggle" class="scrim" aria-hidden="true"></label>`;
}

/* The sidebar lists every note, grouped by domain, on every page. */
function sidebar(nav, up, currentSlug) {
  const groups = nav.map(g => `
    <div class="nav-group">
      <span class="nav-group-title">${esc(g.name)}</span>
      <ul class="nav-list">
        ${g.notes.map(n => `<li><a href="${up}${n.out}"
            data-keywords="${esc(n.keywords)}"
            ${n.slug === currentSlug ? 'aria-current="page"' : ""}>${esc(n.title)}</a></li>`).join("")}
      </ul>
    </div>`).join("");

  return `<nav class="sidebar" aria-label="Notes">
  <input type="search" id="nav-search" class="nav-search" placeholder="Filter notes…  (press /)"
         autocomplete="off" aria-label="Filter notes">
  <p class="nav-empty" id="nav-empty" hidden>No notes match.</p>
  ${groups}
</nav>`;
}

function tocPanel(toc) {
  if (!toc.length) return "<div></div>";
  return `<aside class="toc" aria-label="On this page">
  <p class="toc-title">On this page</p>
  <ul>
    ${toc.map(h => `<li class="toc-h${h.level}"><a href="#${h.id}">${esc(h.text)}</a></li>`).join("")}
  </ul>
</aside>`;
}

function pageNav(prev, next, up) {
  if (!prev && !next) return "";
  return `<nav class="page-nav">
  ${prev ? `<a href="${up}${prev.out}"><span class="dir">← Previous</span><span class="ttl">${esc(prev.title)}</span></a>` : "<span></span>"}
  ${next ? `<a class="next" href="${up}${next.out}"><span class="dir">Next →</span><span class="ttl">${esc(next.title)}</span></a>` : "<span></span>"}
</nav>`;
}

/* --------------------------------------------------------------- NOTE PAGE */
export function notePage({ note, bodyHtml, toc, nav, prev, next, up, related, prereqs }) {
  const domain = DOMAIN_NAMES[note.data.domain] || note.data.domain;

  const chips = (list, label) => list.length ? `
    <div class="related-strip">
      <p class="label">${label}</p>
      <div class="chip-row">${list.map(t => `<a class="chip" href="${up}${t.out}">${esc(t.title)}</a>`).join("")}</div>
    </div>` : "";

  return `<!doctype html>
<html lang="en">
<head>
${head({ title: `${note.title} · Gendi Notes`, description: note.summary, up })}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${header(up)}
<div class="shell">
  ${sidebar(nav, up, note.slug)}
  <main class="content" id="main">
    <article class="prose">
      <div class="breadcrumb">
        <a href="${up}index.html">Home</a>
        <span class="sep">/</span>
        <span>${esc(domain)}</span>
      </div>

      <div class="page-head">
        <h1 class="page-title">${esc(note.title)}</h1>
        ${note.summary ? `<p class="page-lede">${esc(note.summary)}</p>` : ""}
        <div class="page-meta">
          <span class="badge badge-lvl-${note.level}">Level ${note.level}</span>
          <span class="badge">${esc(note.data.type)}</span>
          ${(note.data.tags || []).slice(0, 4).map(t => `<span class="badge">${esc(t)}</span>`).join("")}
        </div>
      </div>

      ${bodyHtml}

      ${chips(prereqs, "Read these first")}
      ${chips(related, "Related")}

      <p class="updated">Last updated ${esc(note.data.updated)}</p>
      ${pageNav(prev, next, up)}
    </article>
  </main>
  ${tocPanel(toc)}
</div>
<script src="${up}assets/app.js"></script>
</body>
</html>`;
}

/* --------------------------------------------------------------- HOME PAGE */
export function homePage({ nav, notes, up = "" }) {
  const cards = nav.map(g => `
  <h2 id="${g.id}">${esc(g.name)}</h2>
  <div class="card-grid">
    ${g.notes.map(n => `<a class="card" href="${n.out}">
      <span class="card-title">${esc(n.title)}
        <span class="badge badge-lvl-${n.level}">L${n.level}</span></span>
      <p class="card-desc">${esc(n.summary)}</p>
    </a>`).join("")}
  </div>`).join("");

  /* Only show a stat that has a number behind it. A hard-coded
     "Advanced: 0" reads as a broken page rather than an honest count. */
  const byType = t => notes.filter(n => n.data.type === t).length;
  const stats = [
    { n: notes.length, l: "Notes" },
    { n: nav.length, l: "Topics" },
    { n: notes.filter(n => n.level <= 2).length, l: "Beginner" },
    { n: notes.filter(n => n.level >= 3).length, l: "Advanced" },
    { n: byType("cheat-sheet"), l: "Cheat sheets" },
  ].filter(s => s.n > 0);

  return `<!doctype html>
<html lang="en">
<head>
${head({ title: "Gendi Notes · DevOps, SRE & Platform Engineering", description:
  "A practical engineering reference: what each technology is, what it is made of, and how to use it.", up })}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
${header(up)}
<div class="shell">
  ${sidebar(nav, up, null)}
  <main class="content" id="main">
    <div class="prose">
      <section class="hero">
        <h1>Engineering notes that start with the basics</h1>
        <p>Every topic answers the same three questions first — <strong>what is it</strong>,
        <strong>what is it made of</strong>, and <strong>how do you actually use it</strong> —
        before going near the advanced material.</p>
        <div class="btn-row">
          <a class="btn btn-primary" href="${nav[0]?.notes[0]?.out || "#"}">Start reading →</a>
          <a class="btn btn-ghost" href="#${nav[0]?.id || "top"}">Browse all topics</a>
        </div>
      </section>

      <div class="hero-stats" style="margin-bottom:2rem">
        ${stats.map(s => `<div class="stat"><div class="n">${s.n}</div><div class="l">${esc(s.l)}</div></div>`).join("")}
      </div>

      ${cards}
    </div>
  </main>
  <div></div>
</div>
<script src="${up}assets/app.js"></script>
</body>
</html>`;
}
