---
title: SLI, SLO, SLA and Error Budgets
slug: sli-slo-sla
type: concept
domain: 07-sre
tags: [sre, reliability, slo, error-budget, alerting]
level: 3
status: stable
prerequisites: []
related: [high-latency-normal-cpu]
updated: 2026-09-05
---

# SLI, SLO, SLA and Error Budgets

> An SLO is not a reliability target — it is a negotiated permission to ship features at a known risk.

## ① What is it?

Three distinct things that get used interchangeably, to everyone's cost:

| | What it is | Who it is for | Consequence of missing it |
|:---|:---|:---|:---|
| **SLI** | A *measurement* — "99.3% of requests succeeded" | Engineers | None. It is a number |
| **SLO** | An internal *target* — "99.9% will succeed" | Engineers | Engineering policy kicks in |
| **SLA** | An external *contract* — "99.5%, or you get credits" | Lawyers, customers | Money |

The rule of thumb: **your SLO must be stricter than your SLA**, with room to
notice and react before the contract is breached. If they are equal, you learn
about the problem from your customer's legal team.

## ② Why does it exist?

"Make it reliable" is not actionable and has no stopping condition. Every
increment of reliability costs more than the last, and past a point the user
cannot perceive it.

```diagram
  cost
    │                                          ╱  ← 99.999%
    │                                      ╱      (multi-region, huge
    │                              ╱             operational burden)
    │                   ╱
    │         ╱   ← 99.9% (achievable, mostly boring)
    │  ╱
    └────────────────────────────────────────▶ reliability
       the user's ISP is less reliable than
       the difference you are paying for  ────┘
```

An SLO makes the stopping point explicit, so "reliable enough" becomes a decision
rather than an argument.

## ③ Mental Model

:::mental
An SLO is a **budget**, not a promise. A 99.9% monthly SLO grants you ~43 minutes
of failure. Unspent budget is not virtue — it is evidence you are shipping too
slowly for the risk you are permitted to take.

**Where it breaks down:** budgets assume failures are fungible. Forty-three
minutes spread over the month is a fine month; forty-three consecutive minutes
during a customer's peak is an incident, regardless of what the arithmetic says.
:::

## ④ Choosing an SLI that means something

A good SLI measures **what the user experiences**, as a ratio of good events to
valid events.

```diagram
        good events
SLI = ─────────────── × 100
       valid events
```

| Bad SLI | Why | Better |
|:---|:---|:---|
| CPU utilisation | Users cannot perceive it | Request success rate |
| "Uptime" | Up from where? Measured by what? | Successful requests ÷ total |
| **Average latency** | Averages hide the tail entirely | % of requests under a threshold |
| Ping succeeds | The process answering ping can still be useless | An end-to-end request that does real work |

:::trap
**Never build an SLO on an average.**

If 95% of requests take 50ms and 5% take 10 seconds, the average is ~550ms — a
number describing no actual user. Every one of those 5% is a person watching a
spinner, and the average makes them statistically invisible.

State latency SLOs as a **threshold ratio**: "99% of requests complete in under
300ms". That form is meaningful, aggregatable across services, and impossible to
game.
:::

## ⑤ Error budgets

```diagram
   SLO 99.9% over 30 days
        │
        ▼
   error budget = 0.1% × 30d = 43m 12s of failure allowed
        │
   ┌────┴─────────────────────────────────┐
   │ budget REMAINING  →  ship. Take risk │
   │ budget EXHAUSTED  →  freeze features,│
   │                      fix reliability │
   └──────────────────────────────────────┘
```

The budget converts a values argument ("we should move faster" vs "we should be
more careful") into an agreed, pre-negotiated rule. **That is its entire
purpose** — not measurement, but conflict resolution decided in advance.

| SLO | Downtime per 30 days |
|:---|:---|
| 99% | 7h 12m |
| 99.5% | 3h 36m |
| 99.9% | 43m 12s |
| 99.95% | 21m 36s |
| 99.99% | 4m 19s |
| 99.999% | 26s |

:::senior
**A 99.99% SLO means a human cannot be in the recovery path.** Four minutes a
month is less than the time to page someone, have them wake, open a laptop and
reach a terminal. Anything above ~99.95% demands automated failover — the SLO is
therefore an *architecture* decision disguised as a number.

The corollary matters more: **you cannot have a stricter SLO than your
dependencies.** If your cloud database offers 99.9%, promising 99.99% is
arithmetic you cannot honour unless you architect around that dependency
(multi-region, degraded-mode reads). Anyone proposing a number without checking
their dependency floor has skipped the only calculation that matters.
:::

## ⑥ Alerting on the budget, not on the symptom

The traditional "alert when error rate > 1%" is either noisy or slow, and usually
both. Alert on **burn rate** — how fast the budget is being consumed relative to
its allowance.

```diagram
  burn rate = 1   →  budget lasts exactly the SLO window. Sustainable.
  burn rate = 14.4 →  the entire month's budget is gone in ~2 days. Page now.
```

| Burn rate | Budget consumed | Window | Action |
|:---|:---|:---|:---|
| 14.4× | 2% in 1 hour | 1h + 5m | **Page** |
| 6× | 5% in 6 hours | 6h + 30m | **Page** |
| 1× | 10% in 3 days | 3d + 6h | Ticket |

The two-window pairing (a long window for significance, a short one for
currentness) is what stops a resolved 3am blip paging you again at 9am.

## ⑦ Failure Modes

| What breaks | Why |
|:---|:---|
| SLO nobody acts on | No error-budget policy agreed *in advance*, so it is only a dashboard |
| SLO set at current performance | Bakes in today's reliability; measures nothing about what users need |
| Measured server-side only | Misses DNS, CDN, TLS, and every failure where the request never arrived |
| Too many SLOs | 40 SLOs = no SLOs. Three to five per user journey |
| Budget exhausted, nothing changes | The policy has no teeth; the whole framework becomes theatre |

:::failure
**Server-side measurement misses the outages that matter most.**

A load balancer misconfiguration means requests never reach your service. Your
server-side SLI: 100% of *received* requests succeeded. Your users: a total
outage.

Measure as close to the user as you can — client telemetry, synthetic probes from
outside your network, or CDN-edge logs. If you can only measure server-side, say
so explicitly, because it defines a blind spot exactly where your worst incidents
live.
:::

## ⑧ Common Mistakes

- **Confusing SLA and SLO.** The SLA is a contract with financial consequences;
  the SLO is stricter and internal. Setting them equal removes all reaction time.
- **Picking 99.99% because it sounds professional.** It is an architecture
  commitment and a large ongoing cost. Justify it with user need.
- **Averaging.** See ④. This one mistake invalidates the whole SLO.
- **No error-budget policy.** Without a pre-agreed consequence, the budget is
  decoration.
- **Counting all requests as valid.** A client sending malformed requests should
  not consume your budget — define "valid events" deliberately.

## ⑨ Interview Traps

:::trap
**"What SLO would you set for a new service?"**

The trap is answering with a number. Any number, offered immediately, is wrong.

Strong answer, in order: (1) What do users actually need — is this
payment-critical or a batch report? (2) What is the reliability floor of my
dependencies? I cannot exceed it. (3) What are we achieving now? (4) Start
achievable, measure, tighten deliberately.

Then add the part that shows real experience: "and I'd want the error-budget
policy agreed *before* we set the number — an SLO with no agreed consequence is
just a dashboard."
:::

:::trap
**"We hit 100% availability this quarter."**

This is not good news, and saying so is the point. It means either the SLO is too
loose to constrain anything, or the team is spending far more on reliability than
users require — capacity that could have gone to features.

The healthy pattern is **consuming most of the budget without exceeding it.**
Consistent underspend is a signal to loosen the target or ship faster.
:::

## ★ Key Takeaway

:::cloud
**1.** SLI = measurement. SLO = internal target. SLA = contract with money
attached. SLO must be stricter than SLA.
**2.** Never build an SLO on an average. Use a threshold ratio.
**3.** The error budget exists to settle the speed-vs-safety argument **before**
it happens.
**4.** You cannot promise more reliability than your dependencies provide.
**5.** Alert on **burn rate**, multi-window. Not on raw error rate.
:::

---

**Version note:** the definitions and burn-rate multipliers here follow Google's
SRE Workbook and are implementation-independent. Actual thresholds should be
derived from your own SLO window rather than copied.
