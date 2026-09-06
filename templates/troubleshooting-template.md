---
title: <Symptom, stated as the user sees it>
slug: <must-match-filename-without-md>
type: troubleshooting
domain: <e.g. 03-kubernetes>
tags: [troubleshooting, <tech>]
level: <1-5>
status: seed
prerequisites: [<slug>]
related: [<slug>]
updated: <YYYY-MM-DD>
---

# <Symptom>

> The one-line diagnostic instinct: what this symptom usually means.

<!-- ─────────────────────────────────────────────────────────────────────────
  RULES FOR TROUBLESHOOTING NOTES
  · Title the note by the SYMPTOM, not the cause. At 3am you search for what
    you can see, not for what you have not diagnosed yet.
  · NEVER give a command without saying what its output tells you. A command
    you cannot interpret is cargo cult.
  · Order checks by (likelihood ÷ cost), cheapest first.
  · Every branch must terminate in a root cause or an explicit "rule this out".
────────────────────────────────────────────────────────────────────────── -->

## ① Symptom

What you actually observe. Exact error strings, exact status values — these
are what your future self will paste into a search box.

```
<verbatim error text / status output>
```

## ② What Could Cause It?

The full candidate list before narrowing. Writing it out stops you from
tunnelling on the first plausible cause.

| # | Candidate cause | Likelihood | Cost to check |
|:--|:---|:---|:---|
| 1 | … | High | Seconds |
| 2 | … | Medium | Minutes |

## ③ Decision Path

```diagram
                       SYMPTOM
                          │
                          ▼
                  ┌───────────────┐
                  │ FIRST CHECK   │
                  └───────────────┘
                    │           │
          expected ─┘           └─ unexpected
              │                       │
              ▼                       ▼
      ┌───────────────┐       ┌───────────────┐
      │ SECOND CHECK  │       │  ROOT CAUSE A │
      └───────────────┘       └───────────────┘
              │
              ▼
      ┌───────────────┐
      │  DEEPER CHECK │
      └───────────────┘
```

## ④ First Check — <what it rules out>

```sh
<command>
```

**What to look for:** the specific field or value that matters.
**If it looks like X:** conclusion, go to ⑤.
**If it looks like Y:** you have found it, go to ⑦.

## ⑤ Second Check — <what it rules out>

```sh
<command>
```

**What to look for:** …
**Why this is second, not first:** it costs more / it is less likely.

## ⑥ Deeper Check — <the expensive one>

Only reach for this once the cheap checks are exhausted. Say what makes it
expensive: it needs a privileged container, it perturbs the process, it needs
a maintenance window.

```sh
<command>
```

## ⑦ Root Cause

The mechanism, not the label. "OOMKilled" is a label; "the JVM heap was sized
above the container limit so the kernel killed it before the JVM could GC" is
a mechanism.

## ⑧ Fix

**Immediate (stop the bleeding):**

```sh
<command>
```

**Proper (fix the cause):**

```sh
<command>
```

:::trap
Say plainly when the immediate fix **hides** the problem rather than solving
it — restarting a pod that will OOM again in 40 minutes, for instance.
:::

## ⑨ Prevention

What change stops this recurring: a limit, an alert, a readiness probe, a test,
a default. If the answer is "be more careful", it is not prevention.

## ★ Key Takeaway

:::cloud
The one diagnostic principle this incident teaches, stated so it transfers to
a different technology.
:::
