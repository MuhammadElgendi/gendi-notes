---
title: <Topic Name>
slug: <must-match-filename-without-md>
type: concept
domain: <e.g. 03-kubernetes>
tags: [<tag>, <tag>]
level: <1-5>
status: seed
prerequisites: [<slug-of-note-to-read-first>]
related: [<slug>, <slug>]
updated: <YYYY-MM-DD>
---

# <Topic Name>

> One sentence. The mental model, not the definition. This line becomes the
> page subtitle and the INDEX entry, so make it earn its place.

<!-- ─────────────────────────────────────────────────────────────────────────
  HOW TO USE THIS TEMPLATE
  · Delete every section you cannot fill with something true and specific.
    An honest 6-section note beats a padded 11-section one.
  · Sections ⑦–⑪ are what separate a note worth keeping from a blog post.
    If you only have ①–⑥, mark status: draft and come back to it.
  · Keep prose short. If a paragraph exceeds 3 lines, it wants to be a
    diagram, a table, or a list.
  · ==red== is for terms of art only, never whole sentences.
  Delete this comment block when you start writing.
────────────────────────────────────────────────────────────────────────── -->

## ① What is it?

Two or three lines. Plain language. No marketing words.

## ② Why does it exist?

State the problem that existed **before** this thing. A concept you cannot
motivate is a concept you have memorised rather than understood.

Before:

```diagram
┌──────────┐        ??? the gap        ┌──────────┐
│ Thing A  │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ▶ │ Thing B  │
└──────────┘   (what hurt here?)       └──────────┘
```

## ③ Mental Model

:::mental
One analogy. It must survive being pushed on — if the analogy breaks under
the first follow-up question, it is a slogan, not a model. Say where it
breaks down.
:::

## ④ How It Works

The internal flow, step by step. Number the steps so they can be referenced.

1. …
2. …
3. …

## ⑤ Architecture

```diagram
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Component  │ ───▶ │  Component  │ ───▶ │  Component  │
└─────────────┘      └─────────────┘      └─────────────┘
       │                    │
       ▼                    ▼
  what it owns         what it owns
```

Say **why each box exists**. A box with no justification is decoration.

## ⑥ Example

A realistic production example — real flags, real names, real numbers.
Toy examples teach toy intuitions.

```sh
# what this command does, and what in the output actually matters
<command>
```

## ⑦ Failure Modes

| What breaks | Why | What you observe | Blast radius |
|:---|:---|:---|:---|
| … | … | … | … |

## ⑧ Troubleshooting

The investigation path, in the order a senior engineer would actually take it —
cheapest and most likely first.

```diagram
SYMPTOM
   │
   ▼
FIRST CHECK  ──▶ rules out …
   │
   ▼
SECOND CHECK ──▶ rules out …
   │
   ▼
ROOT CAUSE
```

## ⑨ Common Mistakes

- **Mistake** — why it is tempting, and what it actually causes.

## ⑩ Senior Engineer Notes

Trade-offs, cost, blast radius, operational burden, what you would choose at
10× scale and why. This section is where seniority actually lives.

:::senior
The non-obvious operational detail. Something you would only know from having
run this in production or read the source.
:::

## ⑪ Interview Traps

:::trap
**Q:** The question whose obvious answer is incomplete.
**Obvious answer:** …
**Why it is wrong / incomplete:** …
**What a strong answer adds:** …
:::

## ★ Key Takeaway

:::cloud
Three to five lines. If you reread only this box in six months, you should be
able to reconstruct the rest.
:::

---

**Version note:** state anything that is implementation- or version-specific,
and say which release you verified it against. Fundamentals age slowly;
implementation details do not.
