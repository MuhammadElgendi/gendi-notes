---
title: Kubernetes DNS and CoreDNS
slug: kubernetes-dns
type: concept
domain: 03-kubernetes
tags: [kubernetes, dns, coredns, service-discovery]
level: 3
status: stable
prerequisites: [dns-resolution, kubernetes-services]
related: [kubernetes-networking, high-latency-normal-cpu]
updated: 2026-09-05
---

# Kubernetes DNS and CoreDNS

> DNS is the only cluster component every single workload depends on — and the only one whose failure looks like everything else breaking.

## ① What is it?

CoreDNS runs as a Deployment in `kube-system` and is fronted by a Service
(conventionally `kube-dns`, for backwards compatibility) at a fixed ClusterIP.
kubelet writes that IP into every Pod's `/etc/resolv.conf`.

It answers names for Services, Pods and — by forwarding upstream — the rest of
the internet.

## ② Why does it exist?

Service ClusterIPs are stable, but they are still allocated at creation time and
differ per cluster. Hard-coding them would make manifests non-portable. DNS is
the indirection that lets `postgres.data.svc.cluster.local` mean the right thing
in dev, staging and production without changing a single config value.

## ③ The Name Structure

```diagram
     my-svc  .  data  .  svc  .  cluster.local
        │        │        │           │
        │        │        │           └── cluster domain (configurable)
        │        │        └────────────── "svc" for Services, "pod" for Pods
        │        └─────────────────────── namespace
        └──────────────────────────────── Service name
```

| You write | It resolves if | Returns |
|:---|:---|:---|
| `my-svc` | caller is in the same namespace | ClusterIP |
| `my-svc.data` | from any namespace | ClusterIP |
| `my-svc.data.svc.cluster.local` | always — fully qualified | ClusterIP |
| `my-svc` (headless) | — | **all ready Pod IPs** |
| `_http._tcp.my-svc.data.svc.cluster.local` | SRV query | port + target |

## ④ The ndots:5 Trap

This is the most consequential line in a Pod's `/etc/resolv.conf`, and almost
nobody reads it.

```
search  data.svc.cluster.local svc.cluster.local cluster.local ec2.internal
nameserver 10.96.0.10
options ndots:5
```

`ndots:5` means: **if a name has fewer than 5 dots, try every search domain
first** before trying the name as written.

```diagram
  Pod resolves "api.github.com"  (2 dots — fewer than 5)

  ① api.github.com.data.svc.cluster.local   ✗ NXDOMAIN
  ② api.github.com.svc.cluster.local        ✗ NXDOMAIN
  ③ api.github.com.cluster.local            ✗ NXDOMAIN
  ④ api.github.com.ec2.internal             ✗ NXDOMAIN
  ⑤ api.github.com                          ✓ finally

  ...and each of those is asked TWICE (A and AAAA).
  10 queries to resolve one external name.
```

:::failure
**Symptom: external API calls are slow, internal ones are fine, and CoreDNS CPU
is unexplainably high.**

Cause: every Pod is generating 8 wasted DNS queries per external lookup. At a few
thousand requests per second this saturates CoreDNS, and the queueing delay then
slows down *internal* resolution too — so the whole cluster degrades from what
looks like an application-level change.

Fixes, in order of preference:
1. **Fully qualify external names with a trailing dot** — `api.github.com.` —
   which skips the search list entirely. Zero infrastructure change.
2. **Per-Pod `dnsConfig`** with `ndots: 1` for workloads that mostly talk
   outward.
3. **NodeLocal DNSCache** — a per-node caching DaemonSet that absorbs the
   repetition and converts the UDP hop to a local TCP connection.
:::

## ⑤ What happens if CoreDNS goes down?

A question worth answering precisely, because the answer is counter-intuitive.

```diagram
CoreDNS unavailable
   │
   ├─ EXISTING connections          ──▶ unaffected. Already resolved.
   │
   ├─ NEW connections by DNS name   ──▶ fail after ~5s timeout, then retry
   │                                    the whole search list → ~15-25s hangs
   │
   ├─ NEW connections by IP         ──▶ fine. Never touched DNS.
   │
   └─ kubelet, kube-proxy, CNI      ──▶ unaffected. They use the API server,
                                        not DNS.
```

So the cluster does **not** stop. The control plane is healthy, Pods keep
running, `kubectl` works perfectly. What breaks is every application's ability to
find anything new — presenting as a cluster-wide cascade of timeouts with no
obvious common cause.

:::senior
**This is why DNS failures are so hard to diagnose: the blast radius is total
but the signal is indirect.** Every team sees their own service failing to reach
its dependency and reasonably concludes the dependency is down. Ten teams
declare ten incidents for one root cause.

Two defences worth having in place before you need them: run CoreDNS with a
`PodDisruptionBudget` and anti-affinity so upgrades cannot take all replicas at
once, and deploy NodeLocal DNSCache so a brief CoreDNS outage is absorbed by
per-node caches instead of hitting every workload immediately.
:::

## ⑥ Troubleshooting

```sh
# 1. Is CoreDNS itself healthy and are there enough replicas?
kubectl -n kube-system get pods -l k8s-app=kube-dns -o wide

# 2. Resolve from INSIDE a Pod, not from your laptop. The search domains and
#    ndots that cause the problem only exist inside the Pod.
kubectl run tmp --rm -it --image=nicolaka/netshoot --restart=Never -- \
  sh -c 'cat /etc/resolv.conf; echo ---; getent hosts my-svc.data'

# 3. Compare short vs fully qualified. If the FQDN is fast and the short name
#    is slow, you are paying the search-domain tax from ④.
kubectl exec -it <pod> -- sh -c \
  'time nslookup api.github.com; time nslookup api.github.com.'

# 4. Is CoreDNS refusing or erroring? Look for SERVFAIL and for the
#    "Loop ... detected" message, which means it is forwarding to itself.
kubectl -n kube-system logs -l k8s-app=kube-dns --tail=100

# 5. Is it a capacity problem? Sustained high CPU on CoreDNS with normal
#    request volume almost always means the search-domain amplification.
kubectl -n kube-system top pods -l k8s-app=kube-dns
```

## ⑦ Common Mistakes

- **Testing DNS from outside the Pod.** Your laptop has none of the search
  domains or the `ndots` setting. It proves nothing about the Pod's experience.
- **Assuming the cluster is down** when only DNS is. Check whether IP-based
  connections still work — that one test separates DNS from networking instantly.
- **Running CoreDNS with 2 replicas and no anti-affinity.** Both land on one
  node; that node drains during an upgrade; cluster-wide DNS outage.
- **Adding search domains casually.** Every additional entry multiplies the
  query amplification in ④.

## ⑧ Senior Engineer Notes

**The 5-second DNS timeout has a specific and famous cause.** glibc sends the A
and AAAA queries in parallel from the same source port. In some kernels, the two
conntrack entries for those parallel UDP flows can race and one reply gets
dropped — the resolver then waits out its 5-second timeout before retrying.

The signature is unmistakable: latency histograms with a hard spike at exactly
5s, 10s, 15s — never in between. The mitigations are `single-request-reopen` in
`dnsConfig`, or NodeLocal DNSCache (which uses TCP upstream and sidesteps it
entirely). Kernel-level conntrack fixes have landed, but managed node images lag,
so this still appears in the field.

**CoreDNS caching is a trade-off you own.** The default `cache 30` means an
endpoint change can take up to 30 seconds to be visible. Lowering it improves
failover responsiveness and increases load proportionally. There is no correct
value — only the one matching your failover requirements.

## ⑨ Interview Traps

:::trap
**"What happens if CoreDNS goes down?"**

Weak answer: "the cluster stops working."

Strong answer: separate the planes. The control plane is unaffected — kubelet,
kube-proxy and the CNI all use the API server, not DNS. Running Pods with
established connections keep working. What fails is *new* name-based connections,
after a multi-second timeout per attempt. Then add the operational insight: the
blast radius is total but the signal is indirect, so it presents as many
unrelated services failing simultaneously.
:::

:::trap
**"An external API call from a Pod takes 4 seconds. DNS looks healthy. Why?"**

The trap is that DNS *is* healthy — CoreDNS is answering correctly and fast. The
problem is that it is being asked 10 times instead of once, because `ndots:5`
expands the name against four search domains before trying it literally.

The give-away in an interview is that internal Service names are fast while
external names are slow. Nothing about a broken resolver produces that pattern.
:::

## ★ Key Takeaway

:::cloud
**1.** Every Pod resolves through CoreDNS via a ClusterIP in `/etc/resolv.conf`.
**2.** `ndots:5` turns one external lookup into up to 10 queries. Trailing dot,
`dnsConfig`, or NodeLocal DNSCache.
**3.** CoreDNS down ≠ cluster down. Existing connections and the control plane
are unaffected; new name lookups are not.
**4.** Always test resolution *from inside a Pod*.
**5.** Latency spikes at exactly 5s/10s are the conntrack A+AAAA race, not slow DNS.
:::

---

**Version note:** CoreDNS replaced kube-dns as the default in 1.13. `ndots:5` is
the kubelet default and is configurable per Pod via `dnsConfig`. NodeLocal
DNSCache is a stable add-on but not installed by default on most distributions.
Verified against 1.29–1.31.
