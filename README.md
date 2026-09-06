# Gendi Notes

**A handwritten-style engineering second brain for DevOps, SRE and Platform Engineering.**

Not a documentation site. Not a wiki. A set of notes built to be *revised
quickly*, *trusted under pressure*, and *used to prepare for senior interviews*.

Every note answers the same twelve questions, uses the same visual language, and
links into the same knowledge graph — so the hundredth note reads like the first.

---

## Start here

| If you want to… | Go to |
|:---|:---|
| See every note, grouped and levelled | [INDEX.md](INDEX.md) |
| Follow a learning path from Linux → Senior | [ROADMAP.md](ROADMAP.md) |
| Add a note | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Understand *how* these notes are written | [PRINCIPLES.md](PRINCIPLES.md) |
| Look up a term | [GLOSSARY.md](GLOSSARY.md) |

**Two notes that show the quality bar:**
[Kubernetes Networking](03-kubernetes/networking/kubernetes-networking.md) ·
[High Latency with Normal CPU](15-production/troubleshooting-playbooks/high-latency-normal-cpu.md)

---

## Read them as a notebook

The notes are plain Markdown and read fine on GitHub. They were designed,
though, to be *rendered* — warm paper, blue ink, red underlines, circled section
numbers, hand-drawn boxes.

```bash
node site/build.mjs && node site/serve.mjs
```

Then open <http://localhost:8080>. No `npm install`, no dependencies, Node 18+.

The visual system itself is documented and inspectable at
<http://localhost:8080/styleguide.html>.

### Hosting them permanently

The build output is static HTML, so any web server can host it — no Node needed
on the server. [`deploy/README.md`](deploy/README.md) walks through an Ubuntu
setup with your own domain, automatic HTTPS, a password, and `git push` as the
deploy step.

---

## The build is also the linter

`site/build.mjs` does three jobs, and the second two are the reason it exists:

1. Renders every note into the notebook visual system.
2. **Regenerates `INDEX.md`** from the notes themselves — a hand-maintained index
   rots within a month; this one cannot.
3. **Fails on a broken cross-reference** — an unknown `[[wikilink]]`, a
   `related:` slug that does not resolve, a dead relative link, a duplicate slug,
   a missing frontmatter field.

```bash
node site/build.mjs --check     # lint only, no writes, exit 1 on error
```

Run it before you commit. If it passes, the index is accurate and every link in
the repository resolves.

---

## Repository structure

```
00-foundations/          Linux, networking, processes — everything else assumes these
01-devops/               Git, CI/CD, release engineering
02-containers/           What a container actually is, images, registries, security
03-kubernetes/           Architecture through troubleshooting, by subsystem
04-cloud/                AWS / Azure / GCP, plus cross-provider concepts
05-infrastructure-as-code/   Terraform, Terragrunt, patterns
06-platform-engineering/ IDPs, golden paths, developer experience
07-sre/                  SLOs, error budgets, incident management, DR
08-observability/        Metrics, logs, traces, alerting
09-databases/            Relational, NoSQL, replication, indexing, transactions
10-distributed-systems/  CAP, consensus, replication, failure modes
11-security/             Linux, Kubernetes, cloud, secrets, supply chain
12-system-design/        Building blocks, caching, messaging, complete designs
13-interviews/           By level and by discipline, with the traps named
14-cheat-sheets/         Optimised for revision and for 3am
15-production/           Incidents, postmortems, runbooks, playbooks

templates/               Seven note types. Always start from one
site/                    The visual system, the renderer, the linter
```

Two deliberate departures from the obvious layout, both to stop the same concept
being written twice:

- **`10-distributed-systems/cap-and-consistency/`** instead of three sibling
  directories for consistency, availability and partition tolerance. Those three
  cannot be studied apart, and separate directories would produce three notes
  each restating CAP.
- **`12-system-design/building-blocks/`** instead of `networking/`, `storage/`
  and `databases/`. Those would duplicate `00-foundations` and `09-databases`.
  System design needs *how to choose* a component; the concept itself lives once,
  in its own domain, and is linked to.

---

## What a note looks like

Every concept note answers, in order: what is it · why does it exist · mental
model · how it works · architecture · example · failure modes · troubleshooting ·
common mistakes · senior notes · interview traps · key takeaway.

Sections you cannot fill honestly get deleted. An honest six-section note beats a
padded eleven-section one.

Beyond that, five rules do most of the work:

- **Why over what.** Anything that only states *what* something is belongs in the
  official docs, not here.
- **Trade-offs are mandatory** at Level 4+. A note with no trade-off has not
  reached senior depth.
- **Every command explains its output.** A command you cannot interpret is cargo
  cult.
- **Failure modes over happy paths.** The happy path is in the vendor's tutorial.
- **Diagrams over paragraphs.** If a paragraph runs past three lines, it wants to
  be a diagram, a table, or a list.

---

## Levels

Notes are graded 1–5 and the level appears in `INDEX.md` and on every rendered
page.

| | Level | Means |
|:---|:---|:---|
| **L1** | Fundamentals | The mechanism, plainly |
| **L2** | Practical | You can use it correctly |
| **L3** | Production | You know how it breaks |
| **L4** | Senior | You can defend the trade-offs |
| **L5** | Staff | You can design the thing itself, and say what it is bad at |

---

## Status

**17 notes**, all linting clean. This is the foundation, not the finished
library — the architecture, the templates, the visual system and a representative
note in each of the seven types.

Deliberately not hundreds of shallow files. The bar for adding one is:

> *Would a senior engineer actually keep this note?*
