---
title: <System> Architecture
slug: <must-match-filename-without-md>
type: architecture
domain: <e.g. 03-kubernetes>
tags: [architecture, <tech>]
level: <1-5>
status: seed
prerequisites: [<slug>]
related: [<slug>]
updated: <YYYY-MM-DD>
---

# <System> Architecture

> The one sentence that explains how the pieces relate.

<!-- ─────────────────────────────────────────────────────────────────────────
  RULES FOR ARCHITECTURE NOTES
  · Every component gets: what it owns, what it talks to, and what happens
    when it dies. A component without a failure story is undocumented.
  · Draw the CONTROL plane and the DATA plane separately. Conflating them is
    the single most common source of confusion in distributed systems.
  · State what is authoritative (source of truth) versus what is a cache.
────────────────────────────────────────────────────────────────────────── -->

## ① The Whole Picture

```diagram
┌──────────────────────────────────────────────────────────┐
│                      CONTROL PLANE                       │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐             │
│   │          │──▶│          │──▶│          │             │
│   └──────────┘   └──────────┘   └──────────┘             │
└───────────────────────────┬──────────────────────────────┘
                            │ desired state
                            ▼
┌──────────────────────────────────────────────────────────┐
│                       DATA PLANE                         │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐             │
│   └──────────┘   └──────────┘   └──────────┘             │
└──────────────────────────────────────────────────────────┘
```

## ② Components

| Component | Owns | Talks to | If it dies |
|:---|:---|:---|:---|
| … | … | … | … |

## ③ Control Plane vs Data Plane

What keeps working when the control plane is down? In a well-designed system
the answer is "the data plane" — say explicitly whether that holds here, and
for how long.

## ④ The Critical Path

Trace one real request end to end. Number each hop, and mark where it can
block, retry, or time out.

```diagram
① client ──▶ ② … ──▶ ③ … ──▶ ④ …
```

## ⑤ State and Source of Truth

| Data | Authoritative store | Cached where | Staleness window |
|:---|:---|:---|:---|
| … | … | … | … |

## ⑥ Failure Modes

For each component: partial failure, total failure, and — the one people
forget — **slow** failure. Slow is worse than down, because nothing trips.

## ⑦ Scaling Limits

What runs out first as this grows? Name the actual bottleneck and roughly
where it bites.

## ⑧ Senior Engineer Notes

:::senior
The design decision that looks wrong until you understand the constraint
behind it.
:::

## ★ Key Takeaway

:::cloud
…
:::
