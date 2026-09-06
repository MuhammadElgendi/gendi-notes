# How to add a note

The system exists so that you never have to make style decisions. Pick the
template, fill it honestly, run the build. Visual consistency, indexing and
link integrity are handled for you.

---

## The five-minute version

```bash
# 1. Copy the right template into the right directory, named after the slug
cp templates/concept-template.md 03-kubernetes/scheduling/kubernetes-scheduling.md

# 2. Write it. Fill the frontmatter first — the linter checks it.

# 3. Build: renders the site, regenerates INDEX.md, fails on broken links
node site/build.mjs

# 4. Read it as a notebook page before you call it done
node site/serve.mjs      # → http://localhost:8080
```

---

## ① Choose the template

| Template | Use when the note answers… |
|:---|:---|
| `concept-template.md` | "What is X and why does it work that way?" |
| `architecture-template.md` | "How do these components fit together?" |
| `troubleshooting-template.md` | "I can see symptom X. What now?" |
| `interview-template.md` | "How do I answer this out loud?" |
| `cheat-sheet-template.md` | "Which command, right now?" |
| `system-design-template.md` | "Design me a Y." |
| `production-incident-template.md` | "What happened, and what do we change?" |

If two seem to fit, you probably have two notes. Split them and link.

---

## ② Choose the directory

Three rules, in priority order:

1. **A concept lives once**, in the domain that owns it. Kubernetes DNS lives in
   `03-kubernetes/dns/`, not also in `08-observability/`. Everything else links
   to it.
2. **File by what it *is*, not by where you first met it.** You may have learned
   about conntrack while debugging Kubernetes; conntrack is Linux networking.
3. **Symptom-shaped notes go in `15-production/` or `*/troubleshooting/`.** Name
   them by the symptom you can *observe*, never by the cause you have not
   diagnosed yet — at 3am you search for what you can see.

---

## ③ Frontmatter

Every note needs this block. The build **fails** without it.

```yaml
---
title: Kubernetes Scheduling          # human title; becomes the page heading
slug: kubernetes-scheduling           # MUST equal the filename without .md
type: concept                         # see the table in ①
domain: 03-kubernetes                 # the top-level directory
tags: [kubernetes, scheduling]        # lowercase, for the #hashtag row
level: 3                              # 1-5, see README
status: seed                          # seed | draft | stable
prerequisites: [kubernetes-networking] # slugs — checked, must resolve
related: [kubernetes-services]        # slugs — checked, must resolve
updated: 2026-09-05                   # YYYY-MM-DD
---
```

| Field | Enforced by the linter |
|:---|:---|
| All seven required keys present | ✅ error if missing |
| `slug` matches the filename | ✅ error if not |
| `type` and `status` from the allowed set | ✅ error if unknown |
| `level` between 1 and 5 | ✅ error if out of range |
| `prerequisites` / `related` resolve to real notes | ✅ error if dangling |
| No two notes share a slug | ✅ error on duplicate |

**Status means:** `seed` = skeleton, not yet useful · `draft` = accurate but
sections ⑦–⑪ incomplete · `stable` = you would rely on it in an incident.

---

## ④ The one-line mental model

The first blockquote after the H1 becomes the page subtitle **and** the INDEX
entry. It is the most-read line you will write.

```markdown
# Kubernetes Scheduling

> The scheduler does not place Pods — it scores nodes and lets kubelet do the placing.
```

Make it a claim, not a definition. Compare:

| Weak | Strong |
|:---|:---|
| "The scheduler assigns Pods to nodes." | "The scheduler does not place Pods — it scores nodes and lets kubelet do the placing." |
| "DNS resolves names to addresses." | "DNS is a globally distributed cache with no invalidation — which is why it is fast, and why it lies." |

The build warns if it is missing. Do not repeat it in the body — the renderer
lifts it out automatically.

---

## ⑤ Writing the sections

`## ① Title` opens a numbered section — the circled number is rendered as the
blue circle automatically. Use `## ★ Key Takeaway` for the last one.

Delete any section you cannot fill with something true and specific. Padding is
worse than absence: it makes the reader distrust the sections that do have
content.

**Sections ⑦–⑪ (failure modes, troubleshooting, common mistakes, senior notes,
interview traps) are what make a note worth keeping.** If you only have ①–⑥, set
`status: draft` and come back.

---

## ⑥ Diagrams

Fence with `diagram` — this renders as a hand-drawn box in monospace:

````markdown
```diagram
┌─────────────┐      ┌─────────────┐
│   client    │ ───▶ │   service   │
└─────────────┘      └─────────────┘
```
````

**Rules:**

- Understandable in **five seconds**. If it needs study, split it into two.
- Box-drawing characters only: `┌ ┐ └ ┘ ─ │ ├ ┤ ┬ ┴ ┼` and arrows `→ ← ↑ ↓ ▶ ▼`.
- **Label the arrows.** An unlabelled arrow says two things are related, which
  the reader already assumed.
- Show the *mechanism*, not the logo layout. A diagram that would be identical
  for a competing product is not teaching anything.
- Draw the **before/why** state as well as the after. Section ② of most concept
  notes is a diagram of the problem.

Do not add a monospace webfont for these. Box-drawing glyphs are missing from
most webfonts, and the browser then substitutes them from a fallback with
different metrics — every box visibly breaks apart. The CSS uses the local
monospace stack deliberately.

---

## ⑦ Callouts

```markdown
:::mental     🧠  the analogy, and where it breaks down
:::trap       ⚠️  where the obvious answer is wrong
:::senior     🔥  the operational detail you only learn by running it
:::failure    🚨  a real failure mode and its signature
:::key        💡  a fact worth isolating mid-note
:::interview  🎯  interview-specific guidance
:::cloud          the closing takeaway — ONE per note
:::
```

Callouts are load-bearing, not decoration. Two or three per note. A note where
half the content is in callouts has no hierarchy left.

`:::cloud` appears **once**, at the end, under `## ★ Key Takeaway`.

---

## ⑧ Cross-linking

```markdown
[[kubernetes-services]]              → linked, titled automatically
[[kubernetes-services|Services]]     → linked with custom text
```

Wikilinks are **checked**. A link to a non-existent slug fails the build, so the
knowledge graph cannot silently rot.

Link when the other note explains a *mechanism* you are relying on. Do not link
the same target three times in one note — once, at the point of first reliance.

Set `prerequisites` honestly: what would leave a reader lost if they had not read
it? That field drives the "Needs first" chain at the bottom of the rendered page.

---

## ⑨ Commands

Every command explains what it tells you. This is not a style preference — a
command you cannot interpret is cargo cult, and it will fail you at 3am.

````markdown
```sh
# An empty ENDPOINTS column means the selector matches nothing —
# the single most common Service bug.
kubectl get endpointslices -l kubernetes.io/service-name=my-svc
```
````

Comment **above** the command with why you are running it and what in the output
matters. Prose after it for what to conclude. Order commands by
likelihood ÷ cost — cheapest and most likely first.

---

## ⑩ Senior-level content

Level 4+ notes must contain trade-offs. "Use X" is not senior content; "use X,
which costs you Y, and here is when that becomes unacceptable" is.

Concretely, a senior section should name at least one of:

- What this is **bad** at
- What it costs operationally, not just in latency
- The blast radius when it fails
- What you would choose differently at 10× scale
- The non-obvious detail from having actually run it

The test: **could a competent engineer have written this from the official docs?**
If yes, it is not senior content yet.

---

## ⑪ Interview questions

Never a one-line answer. Every question gets the full block: short answer, why,
deep answer, production example, common wrong answer, **why that answer is
wrong**, senior follow-up, trick variant, model answer.

The most valuable field is **common wrong answer** — fill it from answers you
have actually given or heard, not invented strawmen.

Mark the level a question is asked at. A staff question put to a mid candidate is
a bad question, not a hard one.

---

## ⑫ Before you commit

```bash
node site/build.mjs --check
```

Zero errors required. Then read it rendered — errors of *rhythm* (a wall of text,
three callouts in a row, a diagram that needs study) are only visible on the page.

**Quality bar:**

> Would a senior engineer actually keep this note?

If it restates the official documentation, it fails. One excellent note beats ten
shallow ones, and shallow notes actively cost you — they dilute search and make
the collection feel untrustworthy.

---

## Extending the visual system

Do not style a note individually. If a note needs something the system lacks:

1. Add the class to `site/assets/notebook.css`, in the right numbered section.
2. Add a specimen to `site/styleguide.html` so it is documented and inspectable.
3. If it needs Markdown syntax, add it to `renderBody()` in `site/build.mjs`.
4. Document it in this file.

That order matters: a class not in the styleguide will be forgotten and
reinvented inconsistently three notes later.
