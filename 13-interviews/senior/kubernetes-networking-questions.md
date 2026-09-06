---
title: Kubernetes Networking — Interview Questions
slug: kubernetes-networking-questions
type: interview
domain: 13-interviews
tags: [interviews, kubernetes, networking, senior]
level: 4
status: stable
prerequisites: [kubernetes-networking, kubernetes-services, kubernetes-dns]
related: [container-isolation, high-latency-normal-cpu]
updated: 2026-09-05
---

# Kubernetes Networking — Interview Questions

> Every question here tests one thing: do you know where the abstraction ends and the kernel begins?

<!-- The mechanism lives in the concept notes. THIS note is about delivery:
     what to say, in what order, and what the interviewer is scoring. -->

## ① What happens when a Pod on Node 1 talks to a Pod on Node 2?

**Asked at:** mid → senior · **Probing for:** whether you know Kubernetes does
not route packets

**Short answer.** Pod A sends to Pod B's IP directly, with no NAT. How the packet
crosses between nodes is decided entirely by the CNI plugin — encapsulation,
BGP-learned routes, or native VPC routing.

### Deep answer

```diagram
 Pod A netns                 Node 1 host netns        Node 2        Pod B netns
 ┌──────────┐  veth pair  ┌──────────────────┐                    ┌──────────┐
 │eth0      │═════════════│vethXXXX → routing│                    │eth0      │
 │10.2.1.3  │             │  table decides   │                    │10.2.2.5  │
 └──────────┘             └────────┬─────────┘                    └──────────┘
                                   │                                    ▲
                        ┌──────────┴──────────┐                         │
                        │ THE CNI's CHOICE:   │                         │
                        │ · VXLAN encapsulate │                         │
                        │ · BGP route         │─────────────────────────┘
                        │ · native VPC route  │   src IP still 10.2.1.3
                        └─────────────────────┘   ← the guarantee
```

The load-bearing point is the last line: **Pod B sees Pod A's real IP.** That
identity preservation is the actual promise of the Kubernetes network model.

### Common wrong answer

> "It goes through kube-proxy, which routes it to the other node."

**Why it is wrong:** kube-proxy has nothing to do with Pod-to-Pod traffic. It
only implements Service virtual IPs. If both Pods talk by Pod IP, kube-proxy is
never involved at all. This answer reveals that the candidate has memorised a
component list without knowing what each component does.

### Senior follow-up

*"What if they cannot reach each other?"* — walk the layers in cost order: same
node or cross-node (narrows it to the CNI's inter-node path), NetworkPolicy,
routes, then MTU. Mentioning MTU unprompted signals real operational experience,
because the symptom (handshake fine, large payloads hang) is so distinctive.

### Model answer

> "Pod A sends straight to Pod B's IP — no NAT, so Pod B sees Pod A's real
> address. The packet leaves Pod A through a veth pair into the node's routing
> table, and from there what happens is the CNI plugin's decision: Flannel might
> VXLAN-encapsulate it, Calico might have a BGP route, and the AWS VPC CNI needs
> no encapsulation at all because Pod IPs are real VPC addresses. Kubernetes
> itself doesn't route anything — it specifies the contract and the plugin
> implements it."

---

## ② Why does Kubernetes need kube-proxy?

**Asked at:** senior · **Probing for:** *why* the component exists, not what it does

**Short answer.** Pod IPs are ephemeral, so clients need a stable address.
Something must translate that stable virtual IP into a live Pod IP at packet
time — and it must stay current as Pods come and go.

### Why not just use DNS?

This is the real question behind the question.

```diagram
  DNS-only approach:              Why it fails:
  client resolves my-svc          · clients cache the A record
      → 10.2.1.4                  · the Pod dies 5 seconds later
      → connects directly         · the client keeps using a dead IP
                                  · TTL cannot be short enough to fix it
```

DNS binds the name at *resolution* time. Pod membership changes continuously
after that. The translation has to happen per connection, in the kernel — which
is exactly what kube-proxy's rules do.

### Common wrong answer

> "For load balancing."

**Why it is incomplete:** that is *what* it does, not why it is necessary. An L7
proxy also load balances. The reason kube-proxy specifically exists is the
**staleness** problem above — binding at packet time rather than resolution time.

### Senior follow-up

*"Could you remove it?"* — Yes. Cilium's kube-proxy replacement moves the
translation into eBPF programs attached at the socket layer, so the rewrite
happens at `connect()` and no iptables rules exist. Then name the reason people
do it: iptables rule *programming* degrades at thousands of Services, causing
stale routing during deploys — see [[kubernetes-services]].

### Trick variant

:::trap
**"kube-proxy is down. Is Service traffic broken?"**

The instinct is yes. The answer is **no, not immediately** — in iptables mode
kube-proxy writes kernel rules and steps aside. Existing rules stay; existing and
new connections keep working.

What breaks is *updates*. Scale a Deployment, roll a release, or lose a Pod, and
the rules no longer match reality — traffic goes to Pods that no longer exist.
The failure is silent and delayed, which makes it far more dangerous than an
outright outage.
:::

---

## ③ What happens if CoreDNS goes down?

**Asked at:** senior · **Probing for:** blast-radius reasoning; control vs data plane

**Short answer.** The cluster keeps running. Existing connections are unaffected
and the control plane does not care. What fails is any *new* connection made by
name — after a multi-second timeout.

### Deep answer

Separate the planes explicitly; this is what the question is really testing.

| Still works | Breaks |
|:---|:---|
| kubelet, kube-proxy, CNI (they use the API server) | New name-based connections |
| `kubectl`, scheduling, controllers | Anything reconnecting after a restart |
| Established connections | Health checks that use hostnames |
| Anything connecting by IP | — |

### The operational insight that scores points

The blast radius is total but the **signal is indirect**. Every team sees their
own service failing to reach its dependency, and each reasonably concludes the
dependency is down. One root cause, ten simultaneous incident declarations.

### Senior follow-up

*"How would you make it not happen?"* — PodDisruptionBudget and anti-affinity so
a node drain cannot take every replica; NodeLocal DNSCache so a brief outage is
absorbed per node; and a synthetic probe that resolves a known name continuously,
so the alert names the actual cause instead of ten downstream symptoms.

---

## ④ Why is Service traffic described as "no NAT" when the packet is clearly rewritten?

**Asked at:** senior → staff · **Probing for:** whether you can hold a model and
its implementation apart

**Short answer.** The no-NAT guarantee is about **Pod-to-Pod identity**, not about
the absence of packet rewriting anywhere in the system. Pod→Pod genuinely has no
NAT. Pod→Service is DNAT'd by kube-proxy.

### Deep answer

```diagram
  CONCEPTUAL MODEL              WHAT THE KERNEL DOES
  client ──▶ Service ──▶ Pod    dst=10.96.0.10 (VIP)
             (an abstraction)       │ DNAT in netfilter
                                    ▼
                                dst=10.2.1.4 (real Pod)
                                src UNCHANGED  ◀── the actual guarantee
```

The model's promise is that **the source address is preserved end to end**, so
the destination always knows who is really calling. The destination address being
rewritten is an implementation detail of resolving a virtual IP.

### Where it visibly breaks — and why that matters

Source IP *is* rewritten in specific cases, and knowing them proves you have run
this rather than read it:

- **NodePort / LoadBalancer with `externalTrafficPolicy: Cluster`** — SNAT is
  applied so the reply can route back through the entry node. The backend sees a
  node IP, not the client.
- Setting `externalTrafficPolicy: Local` preserves the client IP, at the cost of
  uneven balancing and blackholing on nodes with no local Pod.

### Model answer

> "Pod-to-Pod really is NAT-free — that's the model's core guarantee, and it's
> about preserving source identity. Service traffic is different: the ClusterIP
> is virtual, so kube-proxy DNATs the destination to a real Pod IP in the kernel.
> The source stays intact, so the guarantee holds. The place it genuinely breaks
> is external traffic with `externalTrafficPolicy: Cluster`, where you get SNAT
> and lose the client IP — which is why you switch to `Local` when you need real
> client addresses for rate limiting or audit."

---

## ⑤ You scaled from 3 replicas to 30 and latency did not improve. Why?

**Asked at:** senior → staff · **Probing for:** debugging instinct under a
misleading premise

**Short answer.** Existing clients hold keep-alive connections, and kube-proxy
balances per *connection*, not per request. Those connections stay pinned to the
original Pods.

### How to answer well

Do not jump to the cause. Say what you would **check** — that is what is being
scored:

```diagram
  ① Are the new Pods actually receiving traffic?
        per-Pod request rate  ──▶ skewed? → connection pinning
                              ──▶ even?   → not a balancing problem
  ② Are they Ready and in the EndpointSlice?
  ③ Is the bottleneck even in this service?
        → a shared database, a lock, a downstream dependency
        → scaling the wrong tier changes nothing
  ④ Are the Pods CPU-throttled?
        → more replicas, same per-Pod limit, same per-request latency
```

### Common wrong answer

> "The HPA needs tuning" / "they need more CPU."

**Why it is wrong:** it assumes the new Pods are working and merely
under-resourced. The diagnostic finding is that they are *idle*. Any answer that
does not first establish whether traffic reached them is guessing.

### Trick variant

:::trap
**"Why can adding replicas make a system *slower*?"**

Because replicas are not free to the things behind them:

- **Connection multiplication** — 30 Pods × a 10-connection pool = 300 database
  connections. Past the database's optimum, more concurrency means more lock
  contention and context switching, and total throughput *falls*.
- **Cache dilution** — each replica has its own in-process cache, so per-replica
  hit rate drops and origin load rises.
- **Coordination overhead** — leader election, gossip, rebalancing all grow with
  membership.

The general principle worth stating: **scaling a stateless tier moves the
bottleneck; it does not remove it.** Naming that is the staff-level answer.
:::

## ★ What This Area Is Really Testing

:::cloud
Whether you can say **which component does what**, and where the abstraction stops
and the kernel starts. Almost every wrong answer above is a component doing a job
that belongs to a different component — kube-proxy routing Pod traffic, DNS
providing load balancing, replicas fixing a downstream bottleneck.

Know the boundaries and most of these answer themselves.
:::
