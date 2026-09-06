---
title: Kubernetes Control Plane
slug: kubernetes-control-plane
type: architecture
domain: 03-kubernetes
tags: [kubernetes, architecture, etcd, api-server, controllers]
level: 3
status: stable
prerequisites: [kubernetes-networking]
related: [kubernetes-services, pod-crashloopbackoff]
updated: 2026-09-05
---

# Kubernetes Control Plane

> Nothing in Kubernetes commands anything — every component watches the API server and reconciles the difference.

## ① The Whole Picture

```diagram
┌──────────────────────────── CONTROL PLANE ────────────────────────────┐
│                                                                       │
│   ┌────────┐   ┌────────────────────┐        ┌──────────────────┐     │
│   │  etcd  │◀─▶│    API SERVER      │◀──────▶│    Scheduler     │     │
│   └────────┘   │  the ONLY component│        │ (assigns a node) │     │
│   the only     │  that touches etcd │        └──────────────────┘     │
│   stateful     └─────────┬──────────┘                                 │
│   component              │  watch                                     │
│                          │        ┌────────────────────────────┐      │
│                          ├───────▶│  Controller Manager        │      │
│                          │        │  (Deployment, ReplicaSet,  │      │
│                          │        │   Node, EndpointSlice …)   │      │
│                          │        └────────────────────────────┘      │
└──────────────────────────┼────────────────────────────────────────────┘
                           │ watch (kubelet dials OUT; nothing dials in)
┌──────────────────────────┼──────────── NODE ──────────────────────────┐
│                          ▼                                            │
│   ┌──────────────┐   ┌────────────┐   ┌──────────────────────────┐    │
│   │  kube-proxy  │   │  kubelet   │──▶│ container runtime (CRI)  │    │
│   │ Service VIPs │   │ owns Pods  │   │      └─▶ CNI, containers │    │
│   └──────────────┘   └────────────┘   └──────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

The single most important structural fact: **every arrow points at the API
server, and none of them point at each other.** The scheduler does not tell
kubelet anything. The controller manager does not call the scheduler. They all
read and write one shared store, and react.

## ② Components

| Component | Owns | Talks to | If it dies |
|:---|:---|:---|:---|
| **etcd** | All cluster state. The source of truth | API server only | The cluster becomes read-only, then unavailable. **Nothing else can be lost this badly** |
| **API server** | Validation, admission, auth, the watch stream | etcd, everyone | No changes possible. Running workloads continue |
| **Scheduler** | Choosing a node for unbound Pods | API server | New Pods stay `Pending`. Existing Pods unaffected |
| **Controller manager** | Reconciling desired vs actual | API server | Deployments stop progressing, nodes stop being marked NotReady |
| **kubelet** | Pods on *its* node | API server, CRI | That node's Pods keep running but are unmanaged; node goes NotReady |
| **kube-proxy** | Service VIP rules on its node | API server | Existing rules persist; updates stop — see [[kubernetes-services]] |

:::senior
**Only the API server talks to etcd, and this is load-bearing.** It is the single
enforcement point for authentication, authorisation, admission control,
validation and audit. If any other component had a direct path to etcd, every one
of those guarantees would need reimplementing.

It is also why the API server is the scaling bottleneck: it is doing all that
work, plus fanning out watch events to every kubelet and controller in the
cluster.
:::

## ③ Control Plane vs Data Plane

The question worth being precise about: **what keeps working when the control
plane is down?**

```diagram
  CONTROL PLANE DOWN
        │
        ├─ Running Pods              ──▶ keep running. kubelet does not need
        │                                the API server to supervise them
        ├─ Service traffic           ──▶ keeps flowing. Rules are already in
        │                                the kernel on every node
        ├─ A Pod crashes             ──▶ kubelet still restarts it (local
        │                                restartPolicy, no API call needed)
        │
        ├─ A NODE dies               ──▶ its Pods are NOT rescheduled.
        │                                Nothing is watching
        ├─ Scaling, deploys          ──▶ impossible
        └─ New Pods                  ──▶ stay Pending
```

So a control-plane outage is not an immediate customer-facing outage. It is a
**loss of the ability to react**, and it becomes customer-facing the moment
anything else fails while you cannot respond.

:::failure
**Managed control planes make this trade-off invisible until it matters.**

On EKS/GKE/AKS the control plane is someone else's problem, so teams stop
thinking about it. Then a node dies during a control-plane incident and the Pods
are never rescheduled — because rescheduling requires a controller that is
currently unavailable.

The lesson is about **correlated failure**, not about managed services being bad:
your recovery mechanism and your failure detector live in the same place, so they
are down together exactly when you need them.
:::

## ④ The Critical Path — creating a Pod

Trace it once and most of Kubernetes stops being mysterious.

```diagram
① kubectl apply ──▶ API SERVER
                      │ authn → authz → admission → validate
                      ▼
② write to etcd (the Deployment object)
                      │
                      ▼  watch event
③ Deployment controller ──▶ creates a ReplicaSet ──▶ API server ──▶ etcd
                      │
                      ▼  watch event
④ ReplicaSet controller ──▶ creates Pod objects (spec.nodeName EMPTY)
                      │
                      ▼  watch event
⑤ SCHEDULER: filter feasible nodes → score them → pick one
                      │
                      ▼  it does NOT contact the node. It writes a BINDING:
⑥ API server: Pod.spec.nodeName = "node-7"  ──▶ etcd
                      │
                      ▼  watch event (kubelet on node-7 is watching for
                         Pods bound to ITSELF)
⑦ kubelet ──▶ CRI: create sandbox ──▶ CNI: attach network ──▶ start containers
                      │
                      ▼
⑧ kubelet reports status back ──▶ API server ──▶ etcd
```

:::key
**Step ⑤→⑥ is the one that surprises people.** The scheduler never contacts the
node. It only writes a name into a field. kubelet is *watching* for Pods assigned
to it and pulls the work.

This is why a scheduler outage leaves Pods `Pending` rather than failing, and why
you can schedule a Pod onto a node that is already unreachable — nobody checked.
:::

## ⑤ State and Source of Truth

| Data | Authoritative store | Cached where | Staleness |
|:---|:---|:---|:---|
| All API objects | **etcd** | API server watch cache; every controller's informer | Milliseconds normally |
| Pod status | kubelet → etcd | Same | Up to the status update interval |
| Service endpoints | etcd | kube-proxy's kernel rules on every node | Seconds; longer under load |
| Container state | The node's runtime | Reported to etcd | Node is authoritative, not etcd |

**Everything except container state is etcd.** Containers are the exception: the
node knows the truth and reports upward, which is why a partitioned node's Pods
keep running while the control plane believes they are gone.

## ⑥ Failure Modes

| Failure | Symptom | Note |
|:---|:---|:---|
| etcd loses quorum | API server read-only, then failing | Needs ⌈(n+1)/2⌉ members. **3 or 5 nodes, never even numbers** |
| etcd disk slow | Everything slow, no obvious CPU cause | etcd is fsync-bound; it needs fast disks more than fast CPUs |
| API server overloaded | Timeouts, watch events lagging | Often one badly-behaved controller polling instead of watching |
| Controller manager down | Deploys stall silently | No error — things simply stop progressing |
| Scheduler down | Pods `Pending`, no events | Existing workloads entirely unaffected |
| Certificate expiry | Total control-plane outage | Kubernetes is mutual-TLS throughout; a **calendar-driven** outage |

:::senior
**etcd is a write-latency-bound system, and this is the most misdiagnosed
control-plane problem.** Every write is fsynced to disk and replicated to a
quorum. Put etcd on network storage with 10ms fsync and the whole cluster feels
broken while CPU and memory look fine — the same "high latency, normal CPU"
signature as [[high-latency-normal-cpu]], one layer down.

Watch `etcd_disk_wal_fsync_duration_seconds` and
`etcd_server_leader_changes_seen_total`. Frequent leader changes almost always
mean slow disks or a saturated network, not an etcd bug.

**Even-numbered etcd clusters are strictly worse than odd.** Four nodes tolerate
the same single failure as three, while adding a member that must be written to.
There is no configuration in which four is the right answer.
:::

## ⑦ Scaling Limits

What runs out first, roughly in the order you meet it:

1. **etcd write throughput** — high-churn objects (Events, frequently updated
   status) dominate long before your Deployments do.
2. **API server watch fan-out** — every kubelet and controller holds watches;
   cost grows with nodes × objects.
3. **kube-proxy rule programming** — thousands of Services degrade update
   latency, not packet latency. See [[kubernetes-networking]].
4. **Scheduler throughput** — matters for batch workloads creating thousands of
   Pods at once, rarely for services.

The standard mitigation for all of these is **more clusters**, not a bigger
cluster. That is a blast-radius decision as much as a scaling one.

## ⑧ Interview Traps

:::trap
**"What happens if the API server goes down?"**

Weak answer: "the cluster stops."

Strong answer: separate the planes, then give the timeline. Running Pods keep
running; Service traffic keeps flowing because the rules are already in each
node's kernel; kubelet keeps restarting crashed containers locally. What stops is
*change*: no deploys, no scaling, no rescheduling, no `kubectl`.

Then the insight that scores: the danger is **correlated failure** — you have
lost your ability to respond at exactly the moment you might need it.
:::

:::trap
**"Why is the scheduler a separate component from kubelet?"**

Not "for modularity". Because scheduling requires a **global** view — every
node's capacity, every affinity rule, every taint. A kubelet only knows its own
node and could never make that decision.

Follow-up they will ask: *"So why does kubelet do the placing?"* Because
execution requires local knowledge — image state, device plugins, actual
allocatable capacity. The split is global decision, local execution, and it is
the same split that appears throughout the system.
:::

## ★ Key Takeaway

:::cloud
**1.** Everything watches the API server. Nothing commands anything else.
**2.** Only the API server touches etcd — that is where authn, authz, admission
and audit are enforced.
**3.** Control plane down ≠ workloads down. You lose the ability to **react**, not
the ability to serve.
**4.** The scheduler writes a node name; kubelet pulls the work. It never contacts
the node.
**5.** etcd is fsync-bound. Slow disks look like a broken cluster with idle CPUs.
Odd numbers only.
:::

---

**Version note:** the reconciliation architecture and the watch model are stable
and long-standing. Component packaging varies by distribution (managed control
planes hide etcd entirely; some distributions co-locate components), and
`ControllerManager` leader election details differ between releases. Verified
against 1.29–1.31.
