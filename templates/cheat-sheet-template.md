---
title: <Tool> Cheat Sheet
slug: <must-match-filename-without-md>
type: cheat-sheet
domain: 14-cheat-sheets
tags: [cheatsheet, <tool>]
level: <1-5>
status: seed
prerequisites: [<slug>]
related: [<slug>]
updated: <YYYY-MM-DD>
---

# <Tool> Cheat Sheet

> When to reach for this sheet.

<!-- ─────────────────────────────────────────────────────────────────────────
  RULES FOR CHEAT SHEETS
  · Optimised for REVISION and for 3am, not for learning. Learning belongs in
    the concept note; link to it.
  · Every command needs a "what the output tells you" column. A list of
    commands with no interpretation is a man page you already have.
  · Group by INTENT ("I need to know why it is slow"), not alphabetically.
────────────────────────────────────────────────────────────────────────── -->

## ① Decision Tree — which command do I want?

```diagram
What do I actually need to know?
   │
   ├─ "is it running?"      ──▶ <cmd>
   ├─ "why did it stop?"    ──▶ <cmd>
   ├─ "what is it waiting on?" ─▶ <cmd>
   └─ "what changed?"       ──▶ <cmd>
```

## ② <Intent group, e.g. "Is it healthy?">

| Command | What it does | What in the output matters |
|:---|:---|:---|
| `<cmd>` | … | … |

## ③ <Intent group, e.g. "Why is it slow?">

| Command | What it does | What in the output matters |
|:---|:---|:---|
| `<cmd>` | … | … |

## ④ Flags Worth Memorising

| Flag | Effect | Why it matters |
|:---|:---|:---|
| `-x` | … | … |

## ⑤ Common Mistakes

:::trap
The command that looks like it does what you want but does something subtly
different — and what to use instead.
:::

## ★ The Five You Actually Use

:::cloud
1. `<cmd>`
2. `<cmd>`
3. `<cmd>`
4. `<cmd>`
5. `<cmd>`
:::
