---
title: "Incident — <what broke, in user terms>"
slug: <must-match-filename-without-md>
type: incident
domain: 15-production
tags: [incident, postmortem, <tech>]
level: <1-5>
status: seed
prerequisites: [<slug>]
related: [<slug>]
updated: <YYYY-MM-DD>
---

# Incident — <what broke>

> The one-line lesson, written so it transfers to a system you have not built yet.

<!-- ─────────────────────────────────────────────────────────────────────────
  RULES FOR INCIDENT NOTES
  · BLAMELESS. Describe systems and decisions, never people. "The deploy was
    not gated" — not "X deployed without checking".
  · Write the TIMELINE from the logs, not from memory. Memory reorders events
    into a story that makes sense; the logs record what actually happened.
  · The most valuable section is ⑥ "Why it took so long to detect". Detection
    time is usually where the real engineering lesson is hiding.
  · Action items must have an owner and be verifiable. "Improve monitoring"
    is not an action item.
────────────────────────────────────────────────────────────────────────── -->

## ① Summary

Three lines: what users experienced, how long, and what the cause was.

| | |
|:---|:---|
| **Impact** | … |
| **Duration** | … (detect: … / mitigate: … / resolve: …) |
| **Severity** | … |
| **User-visible** | yes / no / partially |

## ② Timeline

All times UTC. Include the events *before* the incident that made it possible.

| Time | Event | How we knew |
|:---|:---|:---|
| T−3d | the change that planted the bomb | … |
| T+0 | trigger | … |
| T+? | first alert | … |
| T+? | first human aware | … |
| T+? | mitigated | … |
| T+? | resolved | … |

## ③ What Happened

The mechanism, in sequence.

```diagram
trigger ──▶ … ──▶ … ──▶ user-visible failure
```

## ④ Why the System Allowed It

Not "what broke" — why nothing *stopped* it. Missing limit, missing gate,
missing timeout, missing back-pressure, missing test.

## ⑤ Contributing Factors

- …

## ⑥ Why Detection Took <N> Minutes

:::failure
The gap between "system was broken" and "a human knew". This is usually the
cheapest thing to improve and the most often ignored.
:::

## ⑦ What Went Well

Genuinely — this is not filler. It tells you which investments paid off.

## ⑧ Action Items

| # | Action | Type | Owner | Verifiable by |
|:--|:---|:---|:---|:---|
| 1 | … | prevent / detect / mitigate | … | … |

## ⑨ What We Are Explicitly Not Doing

And why. Every incident generates over-corrections; naming the ones you
rejected stops them coming back next quarter.

## ★ Transferable Lesson

:::cloud
The principle, stated independently of this technology. If it only applies to
this one service, dig further — you have not found the real lesson yet.
:::
