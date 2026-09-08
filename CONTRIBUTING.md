# How to add a note

The system exists so you never make style decisions. Copy the template, fill it
honestly, run the build. Navigation, indexing, styling and link checking are
handled for you.

---

## The five-minute version

```bash
# 1. Copy a template into the right directory, named after the slug
cp templates/guide-template.md 08-observability/prometheus/prometheus.md
#   ...or templates/interview-template.md for a note under 13-interviews/

# 2. Write it. Fill the frontmatter first — the linter checks it.
#    Both templates carry the :::ar and :::q scaffolding; fill it, do not
#    delete it. A note with no Arabic layer is half a note here.

# 3. Build: renders the site, regenerates INDEX.md, fails on broken links,
#    unbalanced ::: blocks and forbidden diagram glyphs
node site/build.mjs

# 4. Read it in the browser before calling it done
node site/serve.mjs        # → http://localhost:8080
```

---

## 1. The structure every note follows

This is the whole point of the collection. **A note that does not start with
the basics does not belong here.**

```markdown
# Topic Name

> One sentence. The insight, not a definition.

## What is it?            ← plain language, 2–4 lines, no jargon
## Why it exists          ← the problem that existed before it
## What it is made of     ← the components, as a table. Which one am I touching?
## How to use it          ← real commands, real files, real output
## How it works underneath ← optional; only if it changes how you use it
## What goes wrong        ← symptoms → cause → fix, as a table
## Key takeaways          ← 5–7 bullets that stand alone
```

Sections may be dropped if you have nothing true and specific to say. The first
four may **not** — they are the reason someone opens the note.

| Section | Answers |
|:---|:---|
| What is it? | "I have heard the name. What is it?" |
| Why it exists | "Why would I use this instead of nothing?" |
| What it is made of | "The docs mention five nouns. Which do I care about?" |
| How to use it | "Show me. Actual commands." |

---

## 2. Choose the directory

1. **A concept lives once**, in the domain that owns it. Everything else links
   to it.
2. **File by what it *is*,** not where you met it. You met conntrack while
   debugging Kubernetes; conntrack is Linux networking.
3. **Symptom-shaped notes** go in `*/troubleshooting/` or `15-production/`, named
   by what you can **observe** — at 3am you search for the symptom, not the
   cause you have not found yet.

---

## 3. Frontmatter

The build **fails** without this block.

```yaml
---
title: Prometheus                    # human title, becomes the H1
slug: prometheus                     # MUST equal the filename without .md
type: guide                          # see below
domain: 08-observability             # the top-level directory
tags: [prometheus, metrics]          # shown as badges on the page
keywords: [promql, scrape, alert]    # extra search terms for the sidebar filter
level: 2                             # 1–5
status: stable                       # seed | draft | stable
prerequisites: [kubernetes-basics]   # slugs — checked, must resolve
related: [grafana]                   # slugs — checked, must resolve
updated: 2026-09-06                  # YYYY-MM-DD
---
```

**Types:** `guide` (a tool or technology — most notes), `concept`,
`architecture`, `troubleshooting`, `interview`, `cheat-sheet`, `system-design`,
`incident`, `runbook`.

**`keywords`** matter: they feed the sidebar filter, so someone typing
"coredns" finds the DNS note even though the title does not say it.

| Enforced by the linter | |
|:---|:---|
| All seven required keys | error if missing |
| `slug` matches the filename | error if not |
| `type` / `status` from the allowed set | error if unknown |
| `level` between 1 and 5 | error if out of range |
| `prerequisites` / `related` resolve | error if dangling |
| No duplicate slugs | error |
| Every `:::` block is closed | error, with the line number |
| No `▶ ▼ ◀ ▲ ► ◄ ╌` inside a `diagram` fence | error, with the replacement |

---

## 4. The one-line summary

The first blockquote after the H1 becomes the page subtitle, the meta
description, the card on the home page **and** the INDEX entry. It is the
most-read line you will write.

Make it a claim, not a definition:

| Weak | Strong |
|:---|:---|
| "Docker is a containerisation platform." | "Docker packages an app with everything it needs, so the same package behaves identically on your laptop and in production." |
| "A Service exposes pods." | "Pods get a new IP every restart, so nothing can talk to them directly. A Service is the address that stays put." |

Do not repeat it in the body — the renderer lifts it out automatically.

---

## 5. Callouts

Six kinds. Two or three of the first five per note; a note that is half
callouts has no hierarchy left. `:::ar` is the exception — see below.

```markdown
:::tip      💡  a shortcut or a better way
:::key      ✓   the single most important thing here
:::warn     ⚠   a sharp edge that will bite you
:::danger   🚨  a real failure people actually hit
:::note     📘  extra depth, safely skippable
:::ar       💬  the same idea again, in Egyptian Arabic
:::
```

A custom title replaces the default label:

```markdown
:::danger Your data is deleted by default
Anything a container writes goes to a temporary layer…
:::
```

Reserve `:::danger` for genuine production failures. Using it for mild advice
trains the reader to skip them.

Callouts nest, and the closing `:::` must be balanced — **an unclosed one
swallows the rest of the note**, silently. The build now fails on it, with the
line number.

---

## 6. The Arabic layer — `:::ar`

These notes are **bilingual**. English carries the technical spine — headings,
commands, tables, output — and Egyptian Arabic (العامية المصرية) carries the
teaching. The reader gets the terms they will meet in documentation and in an
interview, explained in the language they think in.

```markdown
:::ar
الـ **Image** ملف نايم على الديسك. والـ **Container** هو لما تشغّله ويبقى حي.

تشوفهم بـ `docker images` و `docker ps`.
:::
```

`:::ar` renders right-to-left in an Arabic face. Code, diagrams and command
tables inside it are forced back to left-to-right, because mirrored box art is
unreadable and a shell command is not prose.

**A custom title is often worth it** — it becomes the block's one-line promise:

```markdown
:::ar بالمصري · ليه بيتشاركوا localhost؟
```

### The rules that keep it useful

| Rule | Why |
|:---|:---|
| **Re-explain, do not translate** | A literal translation of the English adds nothing. Explain it *again*, differently, from the reader's side |
| **Keep technical terms in English** | `Pod`, `readiness probe`, `SIGTERM`. The reader must recognise them in the docs and say them in an interview |
| Write real Egyptian, not MSA | «يعني إيه» not «ما معنى». «إزاي» not «كيف». «عشان» not «لأن» |
| One `:::ar` per section, after the English | It answers "…but what does that actually mean?" — so it has to come second |
| Baby steps, and say the *why* | Motivate before mechanism. The reader can already see the mechanism above |
| Commands, paths and output stay verbatim | Never translate a flag or a log line |

Long Arabic keyword lists in the frontmatter may wrap — the parser folds a
bracketed list back onto one line:

```yaml
keywords: [dockerfile, container, image, registry,
           دوكر, كونتينر, ايميج, حاويات]
```

Arabic in tables, lists and headings needs no markup at all: the renderer marks
any block containing an Arabic letter `dir="auto"`, so a mixed cell aligns
itself.

---

## 7. Interview questions — `:::q`

Any note may end with an **Interview corner**: the questions this topic is
actually asked, and what the interviewer is listening for underneath them.

```markdown
:::q Is a container just a lightweight VM? · الكونتينر مجرد VM صغير؟
**No, and the reason matters more than the answer.**

A VM virtualises hardware and boots its own kernel…

:::key What is really being tested
Whether you can name the *consequence*, not just the difference.
:::

:::ar
الإجابة القصيرة: لأ. والسبب هو اللي بيفرق…
:::
:::
```

It renders as a collapsed `<details>`, so the page works as a quiz on the first
pass and a reference on the second. No JavaScript — the answer is always in the
DOM, so it prints and Ctrl-F finds it while closed.

| Rule | Why |
|:---|:---|
| The question is the summary | It is all the reader sees before deciding to open |
| Answer the question **asked** | Explaining what a Service *is* when asked why it returns 503 is the classic fail |
| Include **what is being tested** | A `:::key` or `:::warn` naming the real signal is the most valuable part |
| Give the failure mode, not just the happy path | This is what separates levels |
| 3–6 per topic note | More belongs in `13-interviews/` |

Bilingual question text is fine and reads well: English question, `·`, then the
Arabic. Both halves are searchable.

---

## 8. Code and diagrams

Fence code with a language, and optionally a title bar:

````markdown
```sh title="Build, then run"
# Say WHY above the command and what matters in the output.
docker build -t my-app:1.0 .
```
````

Comment **above** the command with what it does and what to look for. A command
you cannot interpret is cargo cult.

Diagrams use the `diagram` fence:

````markdown
```diagram
   Dockerfile        Image           Container
   ──────────        ─────           ─────────
   a recipe   build   a frozen  run   a running
              ────→   snapshot  ────→ process
```
````

:::danger Diagram character rules — these were learned the hard way
**Use the arrows `→ ← ↑ ↓` (U+2190 block).**
**Never use `▶ ▼ ◀ ▲` (U+25B6).** Those glyphs are missing from Consolas and
Courier New, so the browser substitutes a wider one and every box drifts out of
alignment. The U+2190 arrows are present in every common monospace font.

Also avoid `╌` (dashed box-drawing) — missing from Courier New.

And **do not add a monospace webfont** to `--font-diagram` in the CSS. Google
Fonts subsets JetBrains Mono to Latin, dropping the U+2500 box-drawing block —
measured at 7.8px for Latin vs 7.617px for box characters, which visibly breaks
every diagram. Diagrams deliberately use the local monospace stack.
:::

Other diagram rules:

- Understandable in **five seconds**. If it needs study, split it in two.
- **Label the arrows.** An unlabelled arrow says two things are related, which
  the reader already assumed.
- Show the **mechanism**. A diagram that would look identical for a competing
  product teaches nothing.

---

## 9. Cross-linking

```markdown
[[kubernetes-services]]              → linked, titled automatically
[[kubernetes-services|Services]]     → custom link text
```

Wikilinks are **checked** — an unknown slug fails the build, so the graph cannot
silently rot.

Link where the other note explains a mechanism you rely on. Once, at the point
of first reliance — not three times in one note.

---

## 10. Tables over prose

Anything comparative belongs in a table. If a paragraph runs past three lines,
it usually wants to be a table, a list, or a diagram.

Every table should answer **one** question, and the header should make that
question obvious.

---

## 11. Before you commit

```bash
node site/build.mjs --check
```

Zero errors required. Then read it rendered — problems of *rhythm* (a wall of
text, three callouts in a row, a diagram that needs study) are only visible on
the page.

**The bar:**

> Would someone who already knows the basics find something here they did not
> have?

If it restates the official documentation, it fails. One good note beats ten
shallow ones, and shallow notes actively cost you — they dilute search and make
the collection feel untrustworthy.

---

## Extending the design system

Never style a note individually. If a note needs something the system lacks:

1. Add the class to `site/assets/app.css`, in the right numbered section.
2. If it needs Markdown syntax, extend `renderBody()` in `site/build.mjs`.
3. If it needs markup, edit `site/shell.mjs`.
4. Document it here.

The stylesheet is organised in numbered sections with the tokens at the top.
Change a token, not a rule, when you want a different colour or spacing —
that is what they are for.
