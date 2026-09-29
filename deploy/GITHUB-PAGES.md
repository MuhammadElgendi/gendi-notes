# Hosting on GitHub Pages

The whole site as a static GitHub Pages site, plus a **publishing dashboard** at
`/admin/`: drop a Markdown file, pick its section and folder, press Publish. No
server, no password, nothing to keep patched.

```diagram
   dashboard (/admin/)         GitHub                          GitHub Pages
   ───────────────────         ──────                          ────────────
   drop .md + category  ──→    commit on main  ──→  Actions:   ──→  live site
   frontmatter + checks        (or git push)        lint
                                                    build
                                                    deploy
```

The Actions workflow ([`.github/workflows/pages.yml`](../.github/workflows/pages.yml))
runs the same steps as the VM's [`post-receive`](post-receive) hook, in the same
order: **lint first**, so a broken link fails the deploy and the live site keeps
serving the previous version.

> [!WARNING]
> **The site is public.** GitHub Pages has no password. Anyone with the URL can
> read the notes, and the repository is public too. The dashboard page is also
> reachable by anyone, but it does nothing without *your* token.

---

## One-time setup

### 1. Create the repository

On GitHub: **New repository** → name it `gendi-notes` → **Public** → leave
*README*, *.gitignore* and *license* **unticked** (the repo must be empty) →
**Create repository**.

### 2. Push the notes

From the notes folder, in PowerShell or Git Bash:

```sh
git remote add github https://github.com/<you>/gendi-notes.git
git push -u github main
```

`production` (the VM) stays as it is — this adds a second remote beside it.

### 3. Turn on Pages

In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

The first run, started by the push in step 2, fails at *configure-pages* because
Pages was not on yet. Re-run it: **Actions → Deploy to GitHub Pages → Run
workflow**. When it goes green the site is at:

```text
https://<you>.github.io/gendi-notes/
```

### 4. Connect the dashboard

Open `https://<you>.github.io/gendi-notes/admin/`.

1. Click **Create a token on GitHub** — the form opens with the right
   permissions already filled in: **Contents: Read and write**, **Actions: Read**.
2. Under **Repository access** choose **Only select repositories →
   gendi-notes**. This is the one thing the link cannot prefill.
3. **Generate token**, copy it, paste it into the dashboard, **Connect**.

Bookmark the dashboard. The token is remembered in that browser until it
expires (90 days by default) or you press **Disconnect**.

---

## Publishing a note

1. **Note file** — drop the `.md` file, or paste the Markdown.
2. **Category** — the section (`03-kubernetes`…) and the folder inside it, or
   *New folder…*
3. **Publish to site.**

The dashboard then shows the commit, the lint, the build and the deploy as they
happen, and ends with a link to the live note.

What it does for you, so the build never rejects the file:

| You give it | It does |
|:---|:---|
| A file called `README.md` | Takes the slug and filename from the `# Title` inside |
| No frontmatter | Writes all of it — title, slug, type, domain, level, status, updated |
| Frontmatter | Keeps it as you wrote it; only fixes `domain`, `slug` and `updated` |
| No `# Title` heading | Adds one (the build strips the first H1 it finds — otherwise a `# comment` in your code) |
| A slug that already exists | Selects that note's category and **updates** it instead of duplicating it |

Before it lets you publish it runs the same checks as `node site/build.mjs --check`:
unknown `[[wikilinks]]`, dead relative links, `related:` / `prerequisites:` that
do not resolve, unclosed `:::` blocks, `▶`-style triangles in diagrams, duplicate
slugs. **Details** lets you change the title, slug, summary, type, level, status,
tags and commit message before publishing.

---

## Publishing with git still works

The push is the deploy, exactly as with the VM:

```sh
git pull --rebase github main    # the dashboard and the INDEX.md bot commit too
git push github main
```

Pull first. Notes published from the dashboard, and the `Regenerate INDEX.md`
commit the workflow makes after every deploy, exist only on GitHub until you do.

**The VM does not see dashboard publishes.** To bring it level:

```sh
git pull github main && git push production main
```

---

## Security

| Question | Answer |
|:---|:---|
| Where is the token? | In your browser only (localStorage, or sessionStorage with *Remember* off). It is sent to `api.github.com` and nowhere else |
| What can it do? | Write files in **this one repository** and read its Actions runs. Nothing else on your account |
| Someone opens `/admin/` | They see the connect screen. Without a token of their own that can write to your repo, it does nothing |
| Lost laptop / leaked token | GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens** → revoke it |
| Anything else? | All your project sites share the `<you>.github.io` origin, so another Pages site *of yours* could read that browser storage. Keep the token scoped to this repo, and short-lived |

---

## Troubleshooting

| What you see | Cause | Fix |
|:---|:---|:---|
| Dashboard: *GitHub rejected the token* | Mistyped, expired or revoked | Disconnect, create a new token |
| Dashboard: *can't find the repository* | Token's repository access does not include it | Edit the token → **Only select repositories** → add it |
| Dashboard: *not allowed to do this* | Token lacks **Contents: Read and write** | Edit the token's permissions |
| *No deploy started within two minutes* | Pages source is not *GitHub Actions*, or Actions are disabled | **Settings → Pages**; **Settings → Actions → General** |
| Deploy stops at **Lint** | The note has an error the build caught | Open the run — the summary lists the exact error. Fix, publish again |
| Run fails at *configure-pages* | Pages is not enabled yet | Step 3 above |
| `! [rejected] main -> main (fetch first)` on `git push github` | The dashboard or the bot committed since your last pull | `git pull --rebase github main`, then push |
| Live site 404 right after a green deploy | Pages CDN catching up | Wait a minute, hard-refresh |
| Dashboard lint and deploy lint disagree | `site/admin/note.js` drifted from `site/build.mjs` | `node site/admin/test.mjs` shows where; the deploy lint is the authority |

---

## Files

| File | Job |
|:---|:---|
| `.github/workflows/pages.yml` | Lint → build → add dashboard → commit `INDEX.md` → deploy |
| `site/admin/index.html` · `admin.css` · `admin.js` | The dashboard. Static; talks only to the GitHub API |
| `site/admin/note.js` | Frontmatter and the pre-flight lint — a port of `build.mjs`'s rules |
| `site/admin/test.mjs` | Parity check: every real note must pass `note.js` unchanged. Run after changing either linter |

The workflow writes `admin/config.json` (owner, repo, branch) at deploy time, so
the dashboard knows which repository to commit to on any domain, including a
custom one.
