---
title: <Tool or Technology>
slug: <must-match-filename-without-md>
type: guide
domain: <e.g. 08-observability>
tags: [<tag>, <tag>]
keywords: [<extra search terms for the sidebar filter>]
level: <1-5>
status: seed
prerequisites: [<slug>]
related: [<slug>]
updated: <YYYY-MM-DD>
---

# <Tool or Technology>

> One sentence. A claim, not a definition. This becomes the page subtitle, the
> home-page card and the INDEX entry.

## What is it?

Two to four lines, plain language, no jargon. Someone who has only heard the
name should finish this paragraph knowing what the thing does.

## Why it exists

The problem that existed **before** this tool. A tool you cannot motivate is a
tool you have memorised rather than understood.

| Without it | With it |
|:---|:---|
| … | … |

## What it is made of

The components, as a table. The reader's real question is "the docs mention six
nouns — which one am I actually touching right now?"

| Piece | What it is | Think of it as |
|:---|:---|:---|
| … | … | … |

:::key
The single distinction that removes the most confusion about this tool.
:::

## How to use it

Start with the simplest thing that works, then build up. Real commands, real
files, real output.

```sh title="What this achieves"
# Say what the command does and what in the output matters.
<command>
```

### The commands you will use daily

```sh
<command>     # what it tells you
```

## How it works underneath

Only if it changes how you *use* the tool. Otherwise delete this section.

```diagram
   ┌─────────────┐        ┌─────────────┐
   │  component  │ ─────→ │  component  │
   └─────────────┘        └─────────────┘
```

Arrows: use → ← ↑ ↓ only. Never ▶ ▼ ◀ ▲ — see CONTRIBUTING.md.

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| … | … | … |

:::danger
A real failure people actually hit, with its signature and the fix. Reserve this
callout for genuine production problems.
:::

## Key takeaways

- Five to seven bullets that make sense on their own, six months later.
- Lead with the thing you would most want to be reminded of.
