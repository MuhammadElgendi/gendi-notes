---
title: "Worked Example — Cluster-Wide Timeouts After a Node Drain"
slug: worked-example-dns-cascade
type: incident
domain: 15-production
tags: [incident, postmortem, dns, kubernetes, worked-example]
level: 4
status: stable
prerequisites: [kubernetes-dns]
related: [high-latency-normal-cpu, kubernetes-control-plane]
updated: 2026-09-05
---

# Worked Example — Cluster-Wide Timeouts After a Node Drain

> When ten teams declare ten incidents in five minutes, you have one cause, and it is underneath all of them.

:::key
**This is a WORKED EXAMPLE, not a record of a real incident.** It is a
synthetic-but-realistic scenario built from a common failure pattern, written to
show what a filled-in postmortem looks like. Replace it with your own once you
have one; the value of a real postmortem is that the details are true.
:::

## ① Summary

A routine node drain during a cluster upgrade removed both CoreDNS replicas at
once. New name-based connections across the cluster failed for 11 minutes.
Established connections and the control plane were unaffected.

| | |
|:---|:---|
| **Impact** | ~40% of requests across 9 services failed or timed out |
| **Duration** | Detect: 6m · Mitigate: 11m · Resolve: 14m |
| **Severity** | SEV-2 |
| **User-visible** | Yes — checkout and search returned 503 |

## ② Timeline

All times UTC.

| Time | Event | How we knew |
|:---|:---|:---|
| T−9d | CoreDNS scaled 3→2 during a cost-reduction pass. No PDB, no anti-affinity | Git history, found during review |
| T−2h | Upgrade begins; nodes drained one at a time | Change log |
| **T+0** | `node-11` drained — it held **both** CoreDNS pods | Node events |
| T+0:20 | New pods `Pending` — no node had capacity for their resource requests | Scheduler events |
| T+1:00 | Service error rates begin climbing | Dashboards (unobserved at this point) |
| T+4:00 | First page — checkout SLO burn rate | Alertmanager |
| **T+6:00** | Four more teams page. Each investigating their own dependency | Incident channel |
| T+9:00 | Responder notices every failure is a *name resolution* timeout | Log inspection |
| T+11:00 | Cordon lifted on a drained node; CoreDNS schedules; recovery begins | Manual |
| T+14:00 | Error rates normal | Dashboards |

## ③ What Happened

```diagram
  cost pass: CoreDNS 3 → 2 replicas
        │        no PDB · no anti-affinity
        ▼
  scheduler happens to place BOTH on node-11
        │        (nothing prevented it — this was luck, not a decision)
        ▼
  upgrade drains node-11
        │
        ▼
  both replicas evicted simultaneously
        │
        ▼
  replacements Pending — cluster was near capacity mid-upgrade
        │
        ▼
  every NEW name-based connection times out (~5s, then retries)
        │
        ▼
  9 services degrade at once, each blaming its own dependency
```

The mechanism was not exotic. Every individual decision was locally reasonable;
the failure came from their combination.

## ④ Why the System Allowed It

Nothing enforced the invariant "**CoreDNS must not be fully evictable**".

- **No PodDisruptionBudget.** A drain will evict every replica if nothing forbids
  it. `minAvailable: 1` would have blocked the drain outright.
- **No anti-affinity.** Nothing stopped both replicas landing on one node, so a
  single-node event became a total outage.
- **No capacity headroom check** before draining. Replacements had nowhere to go.

The scale-down from 3 to 2 did not *cause* this — with a PDB, two replicas would
have been fine. The absence of the guardrail was the cause.

## ⑤ Contributing Factors

- The cluster was running near capacity, so evicted pods could not reschedule.
- CoreDNS had no dedicated alert. Its health was inferred from other services.
- Upgrade automation drains nodes without checking what is *on* them.

## ⑥ Why Detection Took 6 Minutes

:::failure
**The alert fired on the symptom's symptom.**

We paged on checkout's SLO burn rate — four minutes of degradation before the
window filled. Then two more minutes passed while five teams each investigated
their own service, because each team's evidence genuinely pointed at their own
dependency being down.

The signal that would have been unambiguous — "DNS resolution is failing" — did
not exist. We had no synthetic probe resolving a known name on a loop, so nothing
in the alert text named the actual cause.

**The detection gap here is worth more than the fix.** The mitigation took 2
minutes once someone understood the problem. The other 9 were spent not knowing.
:::

## ⑦ What Went Well

- The control plane was healthy throughout, so `kubectl` worked and mitigation
  was fast once diagnosed. The control-plane/data-plane separation held exactly
  as designed — see [[kubernetes-control-plane]].
- No data loss. Every failure was a timeout on a new connection, not a partial
  write.
- The incident channel had all nine teams in it, which is what eventually made
  the shared pattern visible.

## ⑧ Action Items

| # | Action | Type | Verifiable by |
|:--|:---|:---|:---|
| 1 | PDB `minAvailable: 1` on CoreDNS | Prevent | Drain a node in staging; it should block |
| 2 | `requiredDuringScheduling` anti-affinity across nodes | Prevent | Replicas land on different nodes |
| 3 | Synthetic DNS probe + dedicated alert | **Detect** | Kill one replica in staging; alert names DNS |
| 4 | Deploy NodeLocal DNSCache | Mitigate | Per-node cache absorbs a brief outage |
| 5 | Upgrade automation checks PDBs and headroom pre-drain | Prevent | Drain blocked when headroom is insufficient |
| 6 | Audit every `kube-system` workload for PDB + anti-affinity | Prevent | Written audit; CoreDNS was unlikely to be the only one |

Item 3 is the highest-value item on this list. Items 1 and 2 stop *this*
incident; item 3 shortens every future incident of this shape.

## ⑨ What We Are Explicitly Not Doing

- **Not reverting to 3 replicas as the "fix".** It would have masked the problem
  — the missing PDB is the cause, and it would still be missing at 3 replicas.
- **Not banning node drains.** Drains are correct. They need to respect
  disruption budgets, which is what they are for.
- **Not adding a "check CoreDNS" step to the upgrade runbook.** Humans remembering
  a checklist item is not a control. Item 5 makes it enforced.

## ★ Transferable Lesson

:::cloud
**Any dependency that every workload shares needs an explicit anti-eviction
invariant**, and that invariant must be enforced by the platform, not remembered
by an operator.

And the more general one: **when a failure's blast radius is total but its signal
is indirect, invest in detection, not just prevention.** We fixed this in 2
minutes and spent 9 not knowing what to fix.
:::
