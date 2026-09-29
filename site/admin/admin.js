/* ============================================================================
 * GENDI NOTES DASHBOARD
 * ----------------------------------------------------------------------------
 * A static page — no server of its own. It talks straight to the GitHub API
 * with a fine-grained token that lives only in this browser:
 *
 *   1. read the repo tree            → sections, folders, existing slugs
 *   2. prepare + lint the note       → note.js (mirrors site/build.mjs)
 *   3. PUT /contents/<path>          → one commit on main
 *   4. poll the Actions run          → lint → build → deploy, live
 *
 * Every string that came from a file or from GitHub is written with
 * textContent, never innerHTML.
 * ========================================================================== */

import {
  DOMAIN_NAMES, VALID_TYPES, VALID_STATUS,
  analyze, buildNote, lint, indexTree, slugify,
} from "./note.js";

const $ = id => document.getElementById(id);
const API = "https://api.github.com";
const NEW = "__new__";
const KEY_TOKEN = "gendi-dashboard-token";
const KEY_REPO = "gendi-dashboard-repo";
const MAX_BYTES = 900 * 1024;

const state = {
  cfg: { owner: "", repo: "", branch: "", workflow: "pages.yml" },
  auto: null,              // cfg as detected, before any saved override
  token: null,
  user: null,
  index: null,
  analysis: null,
  built: null,
  errors: 0,
  touched: new Set(),      // Details fields edited by hand — never overwritten
  busy: false,
};

/* ------------------------------------------------------------- storage */
const store = {
  get(k) {
    try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; }
  },
  set(k, v, persist = true) {
    try {
      (persist ? localStorage : sessionStorage).setItem(k, v);
      (persist ? sessionStorage : localStorage).removeItem(k);
    } catch { /* private mode: works for this page load only */ }
  },
  del(k) {
    try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ }
  },
};

/* ------------------------------------------------------------- config */
async function loadConfig() {
  const cfg = { ...state.cfg };

  /* <owner>.github.io/<repo>/admin/  or  <owner>.github.io/admin/ */
  const gh = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  if (gh) {
    cfg.owner = gh[1];
    const seg = location.pathname.split("/").filter(Boolean);
    cfg.repo = seg.length >= 2 && seg[0] !== "admin" ? seg[0] : `${gh[1]}.github.io`;
  }
  /* Written by the deploy workflow — the reliable source, custom domains too. */
  try {
    const res = await fetch("config.json", { cache: "no-store" });
    if (res.ok) Object.assign(cfg, clean(await res.json()));
  } catch { /* local preview */ }

  state.auto = { ...cfg };
  try { Object.assign(cfg, clean(JSON.parse(store.get(KEY_REPO) || "null") || {})); } catch { /* ignore */ }
  state.cfg = cfg;
}

const clean = o => Object.fromEntries(
  ["owner", "repo", "branch", "workflow"].filter(k => typeof o?.[k] === "string" && o[k]).map(k => [k, o[k]]));

function siteBase() {
  const local = location.protocol === "file:" || /^(localhost|127\.|\[::1\])/.test(location.hostname);
  if (!local && /\/admin\/(index\.html)?$/.test(location.pathname)) return new URL("../", location.href).href;
  const { owner, repo } = state.cfg;
  if (!owner) return "../";
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io/` : `https://${owner}.github.io/${repo}/`;
}

/* ------------------------------------------------------------- GitHub */
const repoPath = () => `/repos/${encodeURIComponent(state.cfg.owner)}/${encodeURIComponent(state.cfg.repo)}`;
const encPath = p => p.split("/").map(encodeURIComponent).join("/");

async function gh(path, opts = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      ...opts,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${state.token}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch (cause) {
    const e = new Error("Could not reach GitHub — check your connection.");
    e.status = 0; e.cause = cause; throw e;
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const e = new Error(data?.message || `HTTP ${res.status}`);
    e.status = res.status; e.data = data; throw e;
  }
  return data;
}

function explain(e) {
  switch (e.status) {
    case 0:   return e.message;
    case 401: return "GitHub rejected the token — it is mistyped, expired or revoked. Disconnect and connect with a new one.";
    case 403: return /rate limit/i.test(e.message)
      ? "GitHub's rate limit was hit. Wait a minute and try again."
      : `The token is not allowed to do this. It needs Contents: Read and write on ${state.cfg.owner}/${state.cfg.repo}. (GitHub: ${e.message})`;
    case 404: return `GitHub can't find ${state.cfg.owner}/${state.cfg.repo} (branch ${state.cfg.branch}) with this token. Check the name, and that the token's Repository access includes it.`;
    case 409:
    case 422: return `GitHub refused the commit: ${e.message}. If the file changed on GitHub a moment ago, publish again.`;
    default:  return `GitHub said: ${e.message} (HTTP ${e.status})`;
  }
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* The git blob id of some text — to spot "nothing changed" before committing. */
async function blobSha(str) {
  if (!crypto?.subtle) return null;
  const body = new TextEncoder().encode(str);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head); all.set(body, head.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", all));
  return [...hash].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------ connect */
async function connect(token, persist) {
  state.token = token;
  const user = await gh("/user");
  const repo = await gh(repoPath());
  state.user = user.login;
  if (!state.cfg.branch) state.cfg.branch = repo.default_branch || "main";
  store.set(KEY_TOKEN, token, persist);
  await loadTree();
  showConnected(repo.html_url);
  loadRuns();
}

async function loadTree() {
  const branch = state.cfg.branch.split("/").map(encodeURIComponent).join("/");
  const t = await gh(`${repoPath()}/git/trees/${branch}?recursive=1`);
  state.index = indexTree(t.tree || []);
  fillDomains();
  update();
}

function showConnect(message) {
  $("connect").hidden = false;
  $("status-bar").hidden = $("publish").hidden = $("recent").hidden = true;
  $("progress").hidden = true;
  const { owner, repo, branch } = state.cfg;
  $("repo-input").value = owner && repo ? `${owner}/${repo}` : "";
  $("branch-input").value = branch || "";
  document.querySelectorAll("[data-repo-label]").forEach(n => { n.textContent = owner ? `${owner}/${repo}` : "your repository"; });
  document.querySelectorAll("[data-repo-name]").forEach(n => { n.textContent = repo || "the notes repo"; });
  $("token-link").href = tokenUrl();
  $("connect-error").hidden = !message;
  $("connect-error").textContent = message || "";
  if (!owner) $("connect").querySelector(".dash-advanced").open = true;
}

function tokenUrl() {
  const q = new URLSearchParams({
    name: `Gendi Notes dashboard`,
    description: `Publish notes to ${state.cfg.owner}/${state.cfg.repo} from the dashboard.`,
    expires_in: "90",
    contents: "write",
    actions: "read",
  });
  if (state.cfg.owner) q.set("target_name", state.cfg.owner);
  return `https://github.com/settings/personal-access-tokens/new?${q}`;
}

function showConnected(repoUrl) {
  $("connect").hidden = true;
  $("status-bar").hidden = $("publish").hidden = $("recent").hidden = false;
  $("status-user").textContent = `@${state.user}`;
  $("status-repo").textContent = `${state.cfg.owner}/${state.cfg.repo}`;
  $("status-repo").href = repoUrl || `https://github.com/${state.cfg.owner}/${state.cfg.repo}`;
  $("status-branch").textContent = state.cfg.branch;
}

function parseRepo(v) {
  const m = v.trim().replace(/\.git$/, "").match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/* --------------------------------------------------------------- form */
const opt = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });

function fillDomains() {
  const sel = $("domain");
  const keep = sel.value;
  sel.replaceChildren(opt("", "Choose a section…"),
    ...state.index.domains.map(d => opt(d, `${DOMAIN_NAMES[d] || d}  —  ${d}`)));
  sel.value = state.index.domains.includes(keep) ? keep : "";
  fillFolders();
}

function fillFolders(select) {
  const d = $("domain").value;
  const sel = $("folder");
  const keep = select ?? sel.value;
  const map = state.index?.folders.get(d) || new Map();
  const count = n => (n ? ` · ${n} note${n > 1 ? "s" : ""}` : " · empty");
  sel.replaceChildren(
    opt("", d ? "Choose a folder…" : "Choose a section first"),
    ...[...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([f, n]) => opt(f, f + count(n))),
    ...(d ? [opt(NEW, "＋ New folder…")] : []));
  sel.disabled = !d;
  if (keep && ![...sel.options].some(o => o.value === keep) && keep !== NEW) sel.insertBefore(opt(keep, keep), sel.lastChild);
  sel.value = [...sel.options].some(o => o.value === keep) ? keep : "";
  $("new-folder-wrap").hidden = sel.value !== NEW;
}

function currentFolder() {
  const v = $("folder").value;
  return v === NEW ? slugify($("new-folder").value) : v;
}

const FIELDS = ["title", "slug", "tags", "summary", "type", "level", "status"];

function prefill() {
  const a = state.analysis;
  const values = {
    title: a.title, slug: a.slug, tags: a.tags.join(", "), summary: a.summary,
    type: a.type, level: String(a.level), status: a.status,
  };
  for (const f of FIELDS) if (!state.touched.has(f)) $(f).value = values[f];
  if (!a.title || !a.slug) $("details").open = true;
}

/* Put a note back where it already lives; otherwise guess from its frontmatter. */
function autoLocate() {
  const a = state.analysis;
  const idx = state.index;
  const existing = idx.slugs.get(slugify($("slug").value));
  if (existing) {
    const parts = existing.split("/");
    $("domain").value = parts[0];
    fillFolders(parts.slice(1, -1).join("/"));
    return;
  }
  const fromFm = typeof a.data.domain === "string" && idx.domains.includes(a.data.domain) ? a.data.domain : "";
  if (fromFm && fromFm !== $("domain").value) { $("domain").value = fromFm; fillFolders(""); }
  guessFolder();
}

/* A folder named after the note or one of its tags is almost always right. */
function guessFolder() {
  const a = state.analysis;
  const folders = state.index.folders.get($("domain").value);
  if (!a || !folders || $("folder").value) return;
  const guess = [slugify($("slug").value), ...list($("tags").value).map(slugify)].find(f => folders.has(f));
  if (guess) fillFolders(guess);
}

const list = v => v.split(",").map(s => s.trim()).filter(Boolean);

function update() {
  const a = state.analysis;
  const checks = [];
  state.built = null;

  if (!state.index) return;
  if (!a) {
    renderChecks([]);
    setPublish(false, "Add a note file first.");
    $("path-row").hidden = true;
    $("preview-wrap").hidden = true;
    return;
  }

  const domain = $("domain").value;
  const folder = currentFolder();
  const form = {
    domain, folder,
    slug: $("slug").value, title: $("title").value,
    type: $("type").value, level: $("level").value, status: $("status").value,
    tags: list($("tags").value), summary: $("summary").value,
  };

  if (!form.title.trim()) checks.push({ sev: "error", msg: "Add a title under Details — the file has no `# heading` or `title:` to take one from." });
  if (!slugify(form.slug)) checks.push({ sev: "error", msg: "Add a slug under Details (letters, numbers and dashes — it becomes the filename and the URL)." });
  if (!domain) checks.push({ sev: "error", msg: "Choose a section." });
  else if (!folder) checks.push({ sev: "error", msg: $("folder").value === NEW ? "Name the new folder." : "Choose a folder, or make a new one." });

  if (domain && folder && slugify(form.slug)) {
    const b = buildNote(a, form);
    state.built = b;
    checks.push(...lint(a, b, state.index));
    checks.push(...b.notes.map(msg => ({ sev: "info", msg })));

    const exists = state.index.shas.has(b.path);
    $("path").textContent = b.path;
    $("path-badge").textContent = exists ? "Updates the existing note" : "New note";
    $("path-badge").className = `badge ${exists ? "badge-lvl-3" : "badge-lvl-1"}`;
    $("path-row").hidden = false;

    if (!state.touched.has("message")) $("message").value = `${exists ? "Update" : "Add"} ${b.data.title || b.slug} note`;
    $("preview").textContent = b.content;
    $("preview-wrap").hidden = false;
  } else {
    $("path-row").hidden = true;
    $("preview-wrap").hidden = true;
  }

  const inFolder = domain && folder
    ? [...state.index.slugs.values()].filter(p => p.startsWith(`${domain}/${folder}/`)).map(p => p.split("/").pop())
    : [];
  $("folder-hint").textContent = inFolder.length ? `Already in this folder: ${inFolder.join(", ")}` : "";

  state.errors = checks.filter(c => c.sev === "error").length;
  renderChecks(checks);
  setPublish(!state.errors && !!state.built && !state.busy,
    state.errors ? `Fix ${state.errors} problem${state.errors > 1 ? "s" : ""} first.` : "");
}

/* Render `code` spans in a message without ever using innerHTML. */
function rich(node, text) {
  node.replaceChildren(...String(text).split("`").map((part, i) =>
    i % 2 ? Object.assign(document.createElement("code"), { textContent: part }) : document.createTextNode(part)));
  return node;
}

function renderChecks(checks) {
  const ul = $("checks");
  if (!state.analysis) { ul.replaceChildren(); return; }
  const order = { error: 0, warn: 1, info: 2 };
  const icon = { error: "✗", warn: "!", info: "i", ok: "✓" };
  const items = [...checks].sort((x, y) => order[x.sev] - order[y.sev]);
  if (!items.some(c => c.sev === "error" || c.sev === "warn"))
    items.unshift({ sev: "ok", msg: "All checks pass — the deploy lint will accept this note." });
  ul.replaceChildren(...items.map(c => {
    const li = document.createElement("li");
    li.className = `is-${c.sev}`;
    li.append(Object.assign(document.createElement("span"), { className: "dash-check-icon", textContent: icon[c.sev] }));
    li.append(rich(document.createElement("span"), c.msg));
    return li;
  }));
}

function setPublish(enabled, why) {
  $("publish-btn").disabled = !enabled;
  $("publish-why").textContent = why || "";
}

/* -------------------------------------------------------------- input */
async function readFile(file) {
  if (file.size > MAX_BYTES) { flashDrop(`That file is ${(file.size / 1024).toFixed(0)} KB — notes are Markdown, well under 900 KB.`); return; }
  if (!/\.(md|markdown|txt)$/i.test(file.name) && file.type && !/^text\//.test(file.type)) {
    flashDrop(`${file.name} is not a Markdown file.`); return;
  }
  const text = await file.text();
  $("paste-wrap").hidden = true;
  $("paste").value = "";
  load(text, file.name, file.size);
}

function load(text, name, size) {
  state.analysis = analyze(text, name);
  state.touched.clear();
  prefill();
  autoLocate();
  const a = state.analysis;
  $("drop").hidden = !!name;
  $("file-chip").hidden = !name;
  if (name) {
    $("file-name").textContent = name;
    const lines = a.raw.split("\n").length;
    $("file-info").textContent = ` · ${(size / 1024).toFixed(1)} KB · ${lines} lines · ` +
      (a.hasFrontmatter ? "has frontmatter" : "no frontmatter — it will be added");
  }
  update();
}

function flashDrop(msg) {
  const hint = $("drop-hint");
  hint.textContent = msg;
  hint.classList.add("dash-error-text");
}

function resetNote() {
  state.analysis = null;
  state.built = null;
  state.touched.clear();
  $("drop").hidden = false;
  $("file-chip").hidden = true;
  $("paste-wrap").hidden = true;
  $("paste").value = "";
  for (const f of [...FIELDS, "message"]) if ($(f).tagName === "INPUT") $(f).value = "";
  $("details").open = false;
  update();
}

/* ------------------------------------------------------------ publish */
const STEPS = ["commit", "lint", "build", "deploy"];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function setStep(name, st, link) {
  const li = document.querySelector(`#steps [data-step="${name}"]`);
  li.dataset.state = st;
  const a = li.querySelector("a");
  if (a && link) { a.href = link; a.hidden = false; }
}

function result(kind, parts) {
  const box = $("result");
  box.className = `dash-result is-${kind}`;
  box.replaceChildren(...parts.map(p => {
    if (typeof p === "string") return rich(document.createElement("span"), p);
    const a = Object.assign(document.createElement("a"), { href: p.href, textContent: p.text, target: "_blank", rel: "noopener" });
    return a;
  }));
  box.hidden = false;
}

function done(success) {
  state.busy = false;
  const again = $("again");
  again.textContent = success ? "Publish another note" : "Back to the note";
  again.dataset.reset = success ? "1" : "";
  again.hidden = false;
  loadRuns();
  loadTree().catch(() => {});
}

async function publish() {
  const b = state.built;
  if (!b || state.errors || state.busy) return;
  state.busy = true;

  $("publish").hidden = true;
  $("progress").hidden = false;
  $("result").hidden = true;
  $("again").hidden = true;
  $("progress-path").textContent = b.path;
  for (const s of STEPS) setStep(s, "wait");
  document.querySelectorAll("#steps a").forEach(a => { a.hidden = true; });
  $("progress").scrollIntoView({ behavior: "smooth", block: "start" });

  const branch = state.cfg.branch;
  const noteUrl = siteBase() + b.path.replace(/\.md$/, ".html");
  setStep("commit", "run");

  let commit;
  try {
    let sha;
    try {
      const cur = await gh(`${repoPath()}/contents/${encPath(b.path)}?ref=${encodeURIComponent(branch)}`);
      sha = cur.sha;
    } catch (e) { if (e.status !== 404) throw e; }

    if (sha && sha === await blobSha(b.content)) {
      for (const s of STEPS) setStep(s, "skip");
      setStep("commit", "ok");
      result("ok", ["Nothing to publish — this exact file is already on GitHub. ", { href: noteUrl, text: "Open the note ↗" }]);
      return done(true);
    }

    const res = await gh(`${repoPath()}/contents/${encPath(b.path)}`, {
      method: "PUT",
      body: JSON.stringify({
        message: $("message").value.trim() || `Publish ${b.slug}`,
        content: b64(b.content),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
    commit = res.commit;
    setStep("commit", "ok", commit.html_url);
  } catch (e) {
    setStep("commit", "fail");
    result("fail", [explain(e)]);
    return done(false);
  }

  await track(commit.sha, noteUrl);
}

const stateOf = x => !x ? "wait"
  : x.status !== "completed" ? (x.status === "in_progress" ? "run" : "wait")
  : x.conclusion === "success" ? "ok" : x.conclusion === "skipped" ? "skip" : "fail";

async function track(sha, noteUrl) {
  const wf = encodeURIComponent(state.cfg.workflow);
  const runsUrl = `https://github.com/${state.cfg.owner}/${state.cfg.repo}/actions`;
  const t0 = Date.now();
  let run = null;

  setStep("lint", "wait");
  while (!run) {
    if (Date.now() - t0 > 120000) {
      result("warn", ["Committed, but no deploy started within two minutes. Check that Settings → Pages → Source is set to `GitHub Actions` and that Actions are enabled. ",
        { href: runsUrl, text: "Open Actions ↗" }]);
      return done(true);
    }
    await sleep(3000);
    try {
      const r = await gh(`${repoPath()}/actions/workflows/${wf}/runs?head_sha=${sha}&per_page=1`);
      run = r.workflow_runs?.[0] || null;
    } catch (e) {
      if (e.status === 403 || e.status === 404) {
        result("warn", [`Committed. This token can't see the deploy (it needs Actions: Read, and the workflow must be \`${state.cfg.workflow}\`). The note will be at `,
          { href: noteUrl, text: noteUrl }, " in a minute or two."]);
        return done(true);
      }
    }
  }
  setStep("deploy", "wait", run.html_url);

  for (;;) {
    let r, jobs;
    try {
      [r, { jobs }] = await Promise.all([
        gh(`${repoPath()}/actions/runs/${run.id}`),
        gh(`${repoPath()}/actions/runs/${run.id}/jobs`),
      ]);
    } catch { await sleep(5000); continue; }

    const buildJob = jobs.find(j => j.name === "build");
    const deployJob = jobs.find(j => j.name === "deploy");
    const lintStep = buildJob?.steps?.find(s => s.name === "Lint notes");
    const lintState = stateOf(lintStep);
    const buildState = lintState === "fail" ? "skip"
      : lintState !== "ok" ? "wait"
      : buildJob.status === "completed" ? stateOf(buildJob) : "run";
    const deployState = ["fail", "skip"].includes(buildState) ? "skip" : stateOf(deployJob);

    setStep("lint", lintState === "wait" && buildJob?.status === "in_progress" ? "run" : lintState);
    setStep("build", buildState);
    setStep("deploy", deployState);

    if (r.status === "completed") {
      if (r.conclusion === "success") {
        result("ok", ["Live. ", { href: noteUrl, text: "Open the note ↗" },
          " — GitHub Pages can take a minute to show the new version."]);
        return done(true);
      }
      if (lintState === "fail") {
        result("fail", ["The deploy lint rejected the note. It is committed to GitHub but nothing was published — the site still shows the previous version, and later deploys stop here too until the note is fixed. The exact error is in the run summary: ",
          { href: r.html_url, text: "view run ↗" }, ". Fix the file and publish it again."]);
      } else {
        result("fail", [`The deploy ${r.conclusion === "cancelled" ? "was cancelled" : "failed"}. Your note is committed; the site still shows the previous version. `,
          { href: r.html_url, text: "view run ↗" }]);
      }
      return done(false);
    }
    if (Date.now() - t0 > 15 * 60000) {
      result("warn", ["Still running after 15 minutes. ", { href: r.html_url, text: "Follow it on GitHub ↗" }]);
      return done(true);
    }
    await sleep(4000);
  }
}

/* ------------------------------------------------------------- recent */
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
function ago(iso) {
  const s = (new Date(iso) - Date.now()) / 1000;
  for (const [u, n] of [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]])
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return "just now";
}

async function loadRuns() {
  const ul = $("runs");
  try {
    const r = await gh(`${repoPath()}/actions/workflows/${encodeURIComponent(state.cfg.workflow)}/runs?per_page=6`);
    const runs = r.workflow_runs || [];
    if (!runs.length) { ul.replaceChildren(Object.assign(document.createElement("li"), { className: "dash-muted", textContent: "No deploys yet." })); return; }
    ul.replaceChildren(...runs.map(run => {
      const li = document.createElement("li");
      li.dataset.state = stateOf(run);
      const dot = Object.assign(document.createElement("span"), { className: "dash-state" });
      const a = Object.assign(document.createElement("a"), {
        href: run.html_url, target: "_blank", rel: "noopener",
        textContent: (run.display_title || run.head_commit?.message || "").split("\n")[0],
      });
      const meta = Object.assign(document.createElement("span"), {
        className: "dash-muted dash-small",
        textContent: `#${run.run_number} · ${ago(run.created_at)}`,
      });
      li.append(dot, a, meta);
      return li;
    }));
  } catch (e) {
    ul.replaceChildren(Object.assign(document.createElement("li"), {
      className: "dash-muted",
      textContent: e.status === 403 || e.status === 404
        ? `Deploy history needs a token with Actions: Read, and the workflow ${state.cfg.workflow} in the repo.`
        : explain(e),
    }));
  }
}

/* -------------------------------------------------------------- wiring */
function wire() {
  $("type").replaceChildren(...VALID_TYPES.map(t => opt(t, t)));
  $("status").replaceChildren(...VALID_STATUS.map(s => opt(s, s)));

  $("connect-form").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("connect-btn");
    const parsed = parseRepo($("repo-input").value);
    if (!parsed) { showConnect("Enter the repository as owner/repo."); return; }
    Object.assign(state.cfg, parsed, { branch: $("branch-input").value.trim() || state.auto.branch || "" });
    const { owner, repo, branch } = state.cfg;
    if (owner !== state.auto.owner || repo !== state.auto.repo || (branch && branch !== state.auto.branch))
      store.set(KEY_REPO, JSON.stringify({ owner, repo, branch }));
    else store.del(KEY_REPO);

    btn.disabled = true; btn.textContent = "Connecting…";
    try {
      await connect($("token").value.trim(), $("remember").checked);
      $("token").value = "";
    } catch (err) {
      state.token = null;
      showConnect(explain(err));
    } finally {
      btn.disabled = false; btn.textContent = "Connect";
    }
  });

  $("disconnect").addEventListener("click", () => {
    store.del(KEY_TOKEN);
    state.token = state.user = null;
    showConnect();
  });

  const drop = $("drop");
  drop.addEventListener("click", () => $("file").click());
  drop.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); }
  });
  $("file").addEventListener("change", () => {
    const f = $("file").files[0];
    if (f) readFile(f);
    $("file").value = "";
  });
  $("file-change").addEventListener("click", () => $("file").click());

  const hasFiles = e => [...(e.dataTransfer?.types || [])].includes("Files");
  let depth = 0;
  document.addEventListener("dragenter", e => { if (hasFiles(e)) { depth++; drop.classList.add("is-over"); } });
  document.addEventListener("dragleave", e => { if (hasFiles(e) && --depth <= 0) { depth = 0; drop.classList.remove("is-over"); } });
  document.addEventListener("dragover", e => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener("drop", e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0; drop.classList.remove("is-over");
    const f = e.dataTransfer.files[0];
    if (f && !$("publish").hidden) readFile(f);
  });

  $("paste-toggle").addEventListener("click", () => {
    $("paste-wrap").hidden = !$("paste-wrap").hidden;
    if (!$("paste-wrap").hidden) $("paste").focus();
  });
  let timer;
  $("paste").addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const text = $("paste").value;
      if (!text.trim()) { resetNote(); return; }
      const keep = new Set(state.touched);
      state.analysis = analyze(text, "");
      state.touched = keep;
      $("drop").hidden = false;
      $("file-chip").hidden = true;
      prefill();
      autoLocate();
      update();
    }, 250);
  });

  $("domain").addEventListener("change", () => { fillFolders(""); guessFolder(); update(); });
  $("folder").addEventListener("change", () => {
    const isNew = $("folder").value === NEW;
    $("new-folder-wrap").hidden = !isNew;
    if (isNew && !$("new-folder").value) $("new-folder").value = slugify($("slug").value);
    if (isNew) $("new-folder").focus();
    update();
  });
  $("new-folder").addEventListener("input", update);

  for (const f of [...FIELDS, "message"]) {
    $(f).addEventListener("input", () => { state.touched.add(f); update(); });
    $(f).addEventListener("change", () => { state.touched.add(f); update(); });
  }
  $("slug").addEventListener("change", () => {
    if (!state.analysis) return;
    $("slug").value = slugify($("slug").value);
    autoLocate(); update();
  });

  $("publish-btn").addEventListener("click", publish);
  $("again").addEventListener("click", () => {
    $("progress").hidden = true;
    $("publish").hidden = false;
    if ($("again").dataset.reset) resetNote();
    else update();
    $("publish").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("recent-refresh").addEventListener("click", loadRuns);
}

/* --------------------------------------------------------------- start */
(async function start() {
  wire();
  await loadConfig();
  $("site-link").href = siteBase();
  const saved = store.get(KEY_TOKEN);
  if (!saved) return showConnect();
  let persisted = true;
  try { persisted = localStorage.getItem(KEY_TOKEN) !== null; } catch { /* ignore */ }
  try {
    await connect(saved, persisted);
  } catch (e) {
    state.token = null;
    if (e.status === 401) store.del(KEY_TOKEN);
    showConnect(explain(e));
  }
})();
