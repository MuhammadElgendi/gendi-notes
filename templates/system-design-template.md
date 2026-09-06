---
title: Design — <System>
slug: <must-match-filename-without-md>
type: system-design
domain: 12-system-design
tags: [system-design, <domain>]
level: <1-5>
status: seed
prerequisites: [<slug>]
related: [<slug>]
updated: <YYYY-MM-DD>
---

# Design — <System>

> The one architectural decision that defines this design.

<!-- ─────────────────────────────────────────────────────────────────────────
  RULES FOR SYSTEM DESIGN NOTES
  · Numbers first. A design without an estimate is a diagram, not a design.
  · Every component must be justified by a requirement. If you cannot trace a
    box back to a requirement, delete the box.
  · The trade-offs section is the whole point. Anyone can draw the happy path.
────────────────────────────────────────────────────────────────────────── -->

## ① Requirements

**Functional**

- …

**Non-functional** — these are the ones that shape the architecture.

| Property | Target | Why this number |
|:---|:---|:---|
| Availability | … | … |
| p99 latency | … | … |
| Durability | … | … |
| Consistency | … | … |

**Explicitly out of scope:** … (naming this prevents scope drift mid-interview)

## ② Constraints and Back-of-Envelope

Do the arithmetic. It decides the architecture more than taste does.

```diagram
Writes:  … /s   ×  … bytes  =  … MB/s   →  … TB/year
Reads:   … /s   ×  … bytes  =  … MB/s
Read:Write ratio  =  … : 1     ← this ratio picks your caching strategy
Working set      =  …          ← does it fit in RAM? that picks your store
```

## ③ High-Level Architecture

```diagram
client ──▶ DNS ──▶ LB ──▶ API ──▶ cache ──▶ database
                            │
                            └──▶ queue ──▶ workers
```

## ④ Components — and why each exists

| Component | Exists because | What if we removed it |
|:---|:---|:---|
| … | requirement … | … |

## ⑤ Data Flow

Trace the primary write path and the primary read path separately, numbered.

## ⑥ Data Model and Storage Choice

Why this store and not the obvious alternative. Access patterns first, then
the store that serves them.

## ⑦ Scaling

Where it breaks as load grows 10×, and what you change at each step.

## ⑧ Caching

What is cached, where, invalidation strategy, TTL, and what happens on a miss
storm. See [[cache-stampede]] before answering "we cache it".

## ⑨ Consistency

Which operations are strongly consistent, which are eventual, and what a user
can actually observe when they read their own write.

## ⑩ Failure Handling

| Failure | Detected by | Behaviour | Recovery |
|:---|:---|:---|:---|
| … | … | degrade / fail / retry | … |

## ⑪ Observability

The three or four signals that tell you this system is healthy, and the one
alert you would actually page on.

## ⑫ Security

AuthN, authZ, data at rest, data in transit, secrets, blast radius of a
compromised component.

## ⑬ Disaster Recovery

RPO, RTO, and what you would actually do — not what the runbook aspires to.

## ⑭ Trade-offs

:::senior
State what this design is **bad** at. Every design sacrifices something; a
candidate who cannot name their own sacrifice has not understood the design.
:::

| Decision | Chose | Gave up | Would revisit when |
|:---|:---|:---|:---|
| … | … | … | … |

## ★ Key Takeaway

:::cloud
…
:::
