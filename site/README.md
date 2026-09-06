# The visual system

Everything that makes a note look handwritten lives here. Notes themselves are
plain Markdown and carry no styling.

```
site/
├── assets/notebook.css   the design system — ONE stylesheet for every note
├── build.mjs             Markdown → notebook HTML, + INDEX.md, + the linter
├── serve.mjs             static server for site/dist
├── styleguide.html       living specimen of every component
└── dist/                 generated output (safe to delete)
```

---

## Commands

```bash
node site/build.mjs           # build dist/, regenerate INDEX.md, lint
node site/build.mjs --check   # lint only, no writes, exit 1 on error
node site/build.mjs --quiet   # build, print only problems
node site/serve.mjs [port]    # serve dist/ (default 8080)
```

Zero dependencies, Node 18+. Nothing to install.

`--check` is what you want in a pre-commit hook or CI: it fails on a dangling
`[[wikilink]]`, an unresolvable `related:` slug, a dead relative link, a
duplicate slug, or missing frontmatter.

---

## What the build does with your Markdown

| You write | You get |
|:---|:---|
| `## ① What is it?` | A numbered section with the blue circled number |
| `## ★ Key Takeaway` | Same, with a star |
| ` ```diagram ` | A hand-drawn box, monospace, alignment preserved |
| ` ```sh ` | A command block |
| `:::key` … `:::` | A callout (`key`, `mental`, `trap`, `senior`, `failure`, `interview`, `cloud`) |
| `==term==` | Red emphasis |
| `[[slug]]` | A checked cross-reference, titled automatically |
| `- [x] item` | A checklist item with a green tick |
| `<!-- grid -->` … `<!-- /grid -->` | Two columns with a hand-drawn divider |
| The first `> …` line | The page subtitle **and** the INDEX entry |

The H1 and that first blockquote are lifted out of the body automatically — do
not repeat them.

---

## Design decisions worth knowing

**The baseline grid.** `--rule: 30px` is both the body `line-height` and the
period of the ruled-paper gradient, so text sits *on* the lines like a real
notebook. Keep vertical margins in multiples of `--rule` (or half) or the
alignment drifts.

**Hand-drawn borders are asymmetric `border-radius`, not SVG filters.** A
displacement filter on a bordered element distorts its text too; putting it on a
pseudo-element works but is expensive and prints badly. Four mismatched corner
radii, alternated between adjacent boxes, reads as "drawn by a person" and
survives printing.

**Diagrams deliberately use no webfont.** Box-drawing characters (U+2500 block)
are missing from most webfonts. The browser then substitutes them from a fallback
with different metrics and every box visibly breaks apart — this was caught and
fixed during the initial build. `--font-mono` is a local stack for that reason;
please do not add a webfont to it.

**Red is rationed.** The title underline, terms of art, `:::trap`, and
`:::failure`. Nothing else. Emphasis that is everywhere is emphasis nowhere —
this is the rule most likely to erode as the collection grows.

**Night paper exists** because notes get read at 1am. Same ink relationships,
inverted; it follows `prefers-color-scheme` and can be forced with
`data-theme="dark"` on `<html>`.

**Print is a first-class target.** `@media print` drops the paper texture and
shadows, keeps the ink, and prevents callouts, diagrams and tables from breaking
across pages.

**Accessibility.** Handwriting fonts are lower-contrast than system fonts by
nature. `<html data-font="plain">` swaps them for the system stack while keeping
every other rule identical.

---

## Fonts

| Font | Used for | Licence |
|:---|:---|:---|
| [Caveat](https://fonts.google.com/specimen/Caveat) | Titles, section headings | SIL OFL 1.1 |
| [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) | Body | SIL OFL 1.1 |
| *local monospace stack* | Diagrams, code | n/a — no webfont |

Both webfonts are OFL 1.1: free for any use, embeddable, redistributable.

Loaded from Google Fonts by default. Every stack has a system fallback, so the
notes stay readable with **no network at all** — you lose the handwriting, not
the content.

### Vendoring them for offline use

```bash
mkdir -p site/assets/fonts
# Download the woff2 files from the specimen pages above into that directory,
# then add @font-face rules at the top of notebook.css:
#
#   @font-face { font-family: "Caveat"; src: url("fonts/Caveat.woff2") format("woff2");
#                font-weight: 600 700; font-display: swap; }
#
# and delete the <link> to fonts.googleapis.com in build.mjs (FONTS) and
# styleguide.html.
```

Worth doing if you work air-gapped or want the notes fully self-contained.

---

## Extending it

In this order:

1. Add the class to `notebook.css`, in the right numbered section.
2. Add a specimen to `styleguide.html`.
3. If it needs Markdown syntax, extend `renderBody()` in `build.mjs`.
4. Document it in `CONTRIBUTING.md`.

Step 2 is the one people skip. A class that is not in the styleguide gets
forgotten and reinvented inconsistently a few notes later — which is exactly the
drift this whole system exists to prevent.

**Never style a note individually.** If a note needs bespoke CSS, the system is
missing something; add it here so every future note gets it too.
