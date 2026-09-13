# Gendi Notes

**A practical engineering reference for DevOps, SRE and Platform Engineering —
bilingual, English and العامية المصرية.**

Every topic answers the same three questions before anything else:

1. **What is it?** — in plain language, no jargon
2. **What is it made of?** — the components, and which one you are dealing with
3. **How do you actually use it?** — real commands, real files, real output

Then, and only then, how it works underneath and what goes wrong in production.

---

## Bilingual, on purpose

English carries the **technical spine** — headings, commands, tables, output,
the terms you will meet in the documentation and have to say in an interview.
Egyptian Arabic carries the **teaching**: every section is explained again, from
the beginning, in the language you think in.

```markdown
## What it is made of

| Piece | What it is |
|:---|:---|
| Image | The built, read-only result |

:::ar يعني إيه كل واحدة
الـ **Image** ملف نايم على الديسك — مجمّد ومش بيتغير.
والـ **Container** هو لما تشغّل الملف ده ويبقى عملية حية.
:::
```

The Arabic is not a translation. It explains the same idea *again*, differently,
and says the part the English left implicit — which is why both are worth
reading. Technical terms stay in English throughout, deliberately.

Every note also ends with an **Interview corner**: the questions that topic is
actually asked, collapsed so the page works as a quiz before it works as a
reference, and each answer says **what the interviewer is really testing**.

---

## Read it

The notes are Markdown and read fine on GitHub. They are designed to be
*rendered*, though — sidebar navigation, search, on-page contents, light and
dark themes.

```bash
node site/build.mjs && node site/serve.mjs
```

Open <http://localhost:8080>. No `npm install`, no dependencies, Node 18+.

Hosting it permanently on your own server — domain, HTTPS, password,
`git push` to deploy — is covered in [deploy/README.md](deploy/README.md).

---

## Start here

| If you want to… | Go to |
|:---|:---|
| Every note, grouped and levelled | [INDEX.md](INDEX.md) |
| A learning path, in order | [ROADMAP.md](ROADMAP.md) |
| Look up a term | [GLOSSARY.md](GLOSSARY.md) |
| Add a note | [CONTRIBUTING.md](CONTRIBUTING.md) |
| **Get a note live** | [PUBLISHING.md](PUBLISHING.md) |
| How these notes are written | [PRINCIPLES.md](PRINCIPLES.md) |
| Build the server from scratch | [deploy/README.md](deploy/README.md) |

**If you are new,** read in this order:

[Linux Basics](00-foundations/linux/linux-basics.md) →
[Networking Basics](00-foundations/networking/networking-basics.md) →
[Git](01-devops/git/git.md) →
[Docker](02-containers/docker/docker.md) →
[Kubernetes Basics](03-kubernetes/fundamentals/kubernetes-basics.md)

**If something is broken right now:**
[Kubernetes Troubleshooting](03-kubernetes/troubleshooting/kubernetes-troubleshooting.md) ·
[Linux Commands](14-cheat-sheets/linux/linux-commands.md) ·
[kubectl Cheat Sheet](14-cheat-sheets/kubernetes/kubectl-commands.md)

---

## The build is also the linter

`site/build.mjs` does three jobs, and the last two are why it exists:

1. Renders every note into the site.
2. **Regenerates `INDEX.md`** from the notes themselves — a hand-maintained
   index goes stale within a month; this one cannot.
3. **Fails on anything that would rot silently** — an unknown `[[wikilink]]`, a
   `related:` slug that does not resolve, a dead link, a duplicate slug, a
   missing frontmatter field, an **unclosed `:::` block** (it swallows the rest
   of the note, invisibly), or a **forbidden glyph in a diagram** (the U+25B6
   triangles are missing from Consolas, so every box drifts out of alignment).

```bash
node site/build.mjs --check     # lint only, no writes, exit 1 on error
```

The deploy hook runs this before publishing, so a broken link fails the deploy
and the live site keeps serving the previous version.

---

## Repository structure

```
00-foundations/          Linux, networking, DNS, SSH — everything assumes these
01-devops/               Git, CI/CD
02-containers/           Docker, images and registries
03-kubernetes/           Basics, pods, deployments, services, troubleshooting
04-cloud/                AWS / Azure / GCP
05-infrastructure-as-code/   Terraform
06-platform-engineering/ Internal platforms, developer experience
07-sre/                  SLOs, error budgets, incidents
08-observability/        Metrics, logs, traces, alerting
09-databases/            Relational, NoSQL, indexing, replication
10-distributed-systems/  CAP, consensus, failure modes
11-security/             Linux, Kubernetes, cloud, secrets
12-system-design/        Building blocks, caching, complete designs
13-interviews/           By level and discipline
14-cheat-sheets/         Optimised for revision and for 3am
15-production/           Incidents, postmortems, runbooks

templates/               Note types. Always start from one
site/                    Design system, renderer, linter
deploy/                  Server setup and the git deploy hook
```

Directories with no notes yet are placeholders — the structure is deliberate, so
a new note always has an obvious home.

---

## Levels

Every note is graded, and the level shows in the index and on the page.

| | Level | Means |
|:---|:---|:---|
| **L1** | Beginner | You have not used this before |
| **L2** | Practical | You can use it correctly day to day |
| **L3** | Production | You know how it fails and how to debug it |
| **L4** | Senior | You can defend the trade-offs |
| **L5** | Staff | You can design it, and say what it is bad at |

Every note starts at L1 comprehension regardless of its level. The level says
how far it goes, not where it begins.

---

## The quality bar

> Would someone who already knows the basics find something here they did not
> have?

Deliberately not hundreds of shallow files. A note that restates the official
documentation does not go in — it dilutes search and makes the collection feel
untrustworthy.
