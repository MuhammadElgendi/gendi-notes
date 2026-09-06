---
title: Kubernetes Networking
slug: kubernetes-networking
type: concept
domain: 03-kubernetes
tags: [kubernetes, networking, cni, kube-proxy]
level: 3
status: stable
prerequisites: [tcp-handshake, dns-resolution, linux-network-namespaces]
related: [kubernetes-services, kubernetes-dns, kubernetes-networking-questions]
updated: 2026-09-05
---

# Kubernetes Networking

> Kubernetes does not give you a network — it gives you a set of promises, and makes someone else keep them.

## ① What is it?

Kubernetes networking is a **contract**, not an implementation. The Kubernetes
project specifies four rules that any network must satisfy, then delegates the
actual packet plumbing to a ==CNI plugin== (Calico, Cilium, Flannel, or your
cloud's own).

This is why "how does Kubernetes networking work?" has no single answer. The
model is fixed; the mechanism underneath is pluggable.

## ② Why does it exist?

Before Kubernetes, container networking meant **port mapping**. Every container
on a host shared the host's IP, so you mapped `hostPort:containerPort` by hand.

```diagram
   THE OLD WAY — port mapping hell
   ┌────────────────────────────────────┐
   │ Host 10.0.0.4                      │
   │   :8081 ──▶ container A :8080      │   Who owns :8081?
   │   :8082 ──▶ container B :8080      │   A central registry.
   │   :8083 ──▶ container C :8080      │   Who updates it?
   └────────────────────────────────────┘   You do. Forever.
```

Two containers wanting port 8080 could not both have it. Service discovery
meant tracking *which host, which port* — a tuple that changed on every
reschedule. Configuration became a distributed-state problem.

Kubernetes' answer: **give every Pod its own IP address**. Then a Pod's address
is the same from the inside and the outside, ports stop colliding, and an
application can be moved without rewriting anyone's config.

## ③ Mental Model

:::mental
Every Pod is a **separate machine on one flat LAN**. If two Pods can see each
other's real IP, unchanged in both directions, the model holds — regardless of
whether they are on the same node, different nodes, or different racks.

**Where the analogy breaks:** on a real LAN, machines are found by broadcast
(ARP). In Kubernetes there is no cluster-wide broadcast domain — discovery is
DNS, and reachability is routing that some plugin configured for you.
:::

## ④ The Four Rules

Everything else follows from these. This is the whole model.

- Every Pod gets its own **unique, cluster-wide IP address**.
- Pods can reach **all other Pods** without NAT — the destination sees the
  sender's real Pod IP.
- **Agents on a node** (kubelet, node daemons) can reach all Pods on that node.
- Pods see **their own IP** as the same address others use to reach them.

That last rule is the one people skip, and it is the one that matters most.
It means an application that registers itself with a service registry can
report `$(hostname -i)` and be correct. Break it, and every self-registering
system — Kafka, Zookeeper, Elasticsearch, Consul — breaks in confusing ways.

:::trap
**"Pods talk to Services without NAT" — this is stated in most diagrams, and
it is wrong at the packet level.**

Pod→Pod is genuinely NAT-free. Pod→Service is **not**: the ClusterIP is a
virtual IP that no interface owns, and kube-proxy DNATs it to a real Pod IP in
the kernel before the packet leaves the node.

The model's no-NAT guarantee is about **identity preservation between Pods** —
the destination always sees the sender's true address. It was never a promise
that no packet rewriting happens anywhere. Saying "Services need no NAT" in an
interview signals you have read the diagram but never run `conntrack -L`.
:::

## ⑤ Architecture — who does what

```diagram
  CONTROL PLANE                        NODE
  ┌───────────────┐        ┌──────────────────────────────┐
  │  API Server   │        │  kubelet                     │
  └───────┬───────┘        │     │ (1) CRI: create sandbox │
          │  watch          │     ▼                        │
          │                │  containerd ──(2) CNI ADD──▶ │
          │                │                     │        │
          ▼                │                     ▼        │
  ┌───────────────┐        │            ┌─────────────┐   │
  │  EndpointSlice│        │            │ CNI plugin  │   │
  │  controller   │        │            │ veth + IPAM │   │
  └───────┬───────┘        │            └──────┬──────┘   │
          │                │                   │          │
          │ watch          │   ┌───────────────▼──────┐   │
          └───────────────▶│   │ Pod netns: eth0, IP  │   │
                           │   └──────────────────────┘   │
                           │  kube-proxy                  │
                           │     writes iptables/IPVS ────┼──▶ Service VIPs
                           └──────────────────────────────┘
```

| Component | Owns | Does **not** do |
|:---|:---|:---|
| **CNI plugin** | Pod IPs, veth pairs, routes between nodes, NetworkPolicy | Anything about Services |
| **kube-proxy** | Service VIP → Pod IP rewriting | Pod-to-Pod connectivity |
| **CoreDNS** | Name → ClusterIP resolution | Any packet forwarding |
| **kubelet** | Asking the runtime for a sandbox | Configuring the network itself |

:::senior
**kube-proxy is not a proxy.** Since Kubernetes 1.2 the default mode has been
`iptables`, where kube-proxy is a *control-loop that writes kernel rules* and
then gets out of the way. No Service traffic passes through the kube-proxy
process. Kill it and existing connections keep working — the rules stay in the
kernel; only *updates* to Service membership stop.

That is why "CoreDNS is down" and "kube-proxy is down" have completely
different signatures: DNS failure is immediate and total, kube-proxy failure is
silent until something scales or restarts.
:::

## ⑥ How a Pod actually gets an IP

1. Scheduler binds the Pod to a node; kubelet notices via its watch.
2. kubelet calls the runtime (CRI) to create the **pause container** — this
   container exists only to hold the network namespace open while application
   containers come and go.
3. The runtime invokes the **CNI plugin** with `ADD`.
4. The plugin creates a `veth` pair: one end in the Pod's netns as `eth0`, the
   other on the host bridge or routed directly.
5. **IPAM** allocates an address from the node's Pod CIDR and writes routes.
6. All containers in the Pod join that same namespace — which is why they share
   `localhost` and cannot both bind port 8080.

```sh
# Prove the pause container owns the namespace: every container in the Pod
# reports the same network namespace inode.
lsns -t net
```

## ⑦ Pod-to-Pod across nodes

The rules say Pod A on Node 1 reaches Pod B on Node 2 by Pod IP, unchanged.
*How* depends entirely on your CNI plugin:

| Approach | Mechanism | Cost | Used by |
|:---|:---|:---|:---|
| **Layer 2** | Nodes share a broadcast domain; ARP finds the destination | Fast, but needs flat L2 | Flannel host-gw |
| **Overlay** | Encapsulate in VXLAN/Geneve; the underlay never sees Pod IPs | ~50 bytes/packet, MTU pain | Flannel VXLAN, Calico IPIP |
| **Native routing** | BGP advertises Pod CIDRs to the physical fabric | Fastest; needs network team buy-in | Calico BGP, Cilium |
| **Cloud-native** | Pod IPs are real VPC IPs on ENIs | No encapsulation; limited IPs per node | AWS VPC CNI |

:::failure
**The MTU bug that looks like an application bug.**

Overlay encapsulation adds header bytes. If Pod MTU stays 1500 while the
underlay is also 1500, large packets fragment or get dropped — but the TCP
handshake (tiny packets) succeeds fine. So connections *establish*, then hang
the moment a real payload flows.

The signature: small requests work, large responses hang, `curl` stalls after
printing headers. Confirm with `ping -M do -s 1472` between Pods. Almost
everyone diagnoses this as "the application is slow" first.
:::

## ⑧ Troubleshooting path

```diagram
Pod A cannot reach Pod B
   │
   ▼
Is it DNS or is it the network?        ◀── settle this FIRST
   │   getent hosts svc  /  dig +short
   │
   ├─ name fails    ──▶ CoreDNS, ndots, search domains  ─▶ [[kubernetes-dns]]
   │
   └─ name resolves ──▶ curl the POD IP directly
                            │
              ┌─────────────┴─────────────┐
              │                           │
        Pod IP works               Pod IP fails
              │                           │
              ▼                           ▼
      Service layer problem:      Network layer problem:
      · EndpointSlice empty?      · same node or cross-node?
      · selector mismatch?        · NetworkPolicy denying?
      · kube-proxy rules stale?   · MTU? routes? CNI healthy?
```

```sh
# 1. Does the Service have any backends at all?
#    An empty ENDPOINTS column means the selector matches nothing —
#    this is the single most common Service bug.
kubectl get endpointslices -l kubernetes.io/service-name=my-svc

# 2. Bypass DNS and the Service entirely — talk to a Pod IP.
#    If this works, your problem is Service or DNS, not the network.
kubectl exec -it pod-a -- curl -sS --max-time 3 http://10.2.2.5:8080/healthz

# 3. Is a NetworkPolicy silently dropping it?
#    Note the direction: a policy on the DESTINATION namespace blocks ingress.
kubectl get networkpolicy -A

# 4. MTU check — the "large payloads hang" signature above.
#    -M do forbids fragmentation, so this fails loudly instead of silently.
kubectl exec -it pod-a -- ping -M do -s 1472 -c 2 10.2.2.5
```

## ⑨ Common Mistakes

- **Assuming kube-proxy does Pod-to-Pod routing.** It does not. Pod-to-Pod is
  entirely the CNI plugin's job; kube-proxy only implements Service VIPs.
- **Debugging Services before checking EndpointSlices.** A selector typo
  produces a Service that resolves in DNS, accepts connections, and times out.
  One `kubectl get endpointslices` would have ended it.
- **Treating a `ClusterIP` as pingable.** It is a DNAT target, not an interface.
  `ping` fails against a healthy Service; that tells you nothing.
- **Ignoring conntrack.** Every Service connection consumes a conntrack entry.
  On a busy node, `nf_conntrack: table full, dropping packet` in dmesg presents
  as random, unattributable connection failures across unrelated workloads.

## ⑩ Senior Engineer Notes

:::senior
**iptables mode does not scale linearly, and the failure is in the control
plane, not the data plane.**

In iptables mode, kube-proxy rewrites rules when Service membership changes.
The *packet matching* is fine — it is the *rule programming* that degrades.
At several thousand Services, a single endpoint change can mean rewriting a
very large ruleset, and updates start lagging by seconds or minutes.

The symptom is not slowness. It is **stale routing**: traffic sent to Pods that
were deleted a minute ago. During a rolling deploy this looks like random 502s
that "fix themselves" — the classic reason to move to IPVS (hash lookup) or
Cilium's eBPF kube-proxy replacement (per-socket map lookup, no rule rewriting).
:::

**`externalTrafficPolicy` is a genuine trade-off, not a best practice.**

| | `Cluster` (default) | `Local` |
|:---|:---|:---|
| Source IP | SNAT'd — you lose the client IP | Preserved |
| Extra hop | Yes, may forward to another node | No |
| Load balance | Even across all Pods | Even across *nodes*, not Pods |
| Failure mode | — | Nodes with no local Pod blackhole traffic unless health checks exclude them |

Choose `Local` when you need the real client IP (rate limiting, geo, audit) and
you accept the imbalance. Choose `Cluster` otherwise.

**Dual-stack and IP exhaustion.** The AWS VPC CNI gives Pods real VPC IPs — no
encapsulation, excellent performance, and a hard ceiling on Pods per node set by
ENI limits. Teams hit this at scale and misread it as a scheduler problem: Pods
stay `Pending` with no obvious resource pressure, because the exhausted resource
is IP addresses, not CPU or memory.

## ⑪ Interview Traps

:::trap
**"What happens when a Pod on Node 1 talks to a Pod on Node 2?"**

The weak answer stops at "they use their Pod IPs, Kubernetes handles it."

A strong answer names the layers: the Pod's `eth0` is one end of a veth pair;
the packet leaves via the host's routing table; **what happens next is the CNI
plugin's decision** — VXLAN encapsulation, a BGP-learned route, or a native VPC
route. Then note that no NAT occurs, so Node 2 delivers to Pod B with Pod A's
real source IP intact.

The interviewer is checking whether you know that Kubernetes itself does not
route packets. It specifies; the plugin implements.
:::

:::trap
**"Why does Kubernetes need kube-proxy at all?"**

Trap: candidates answer "for load balancing." That is *what* it does, not *why*
it must exist.

Why: Pod IPs are ephemeral, so clients need a stable address. Something must
translate that stable virtual address into a live Pod IP **at packet time**,
because doing it at DNS time would cache a dead Pod's address. kube-proxy is the
component that keeps that translation current in the kernel.

Follow-up they will ask: *"Could you remove it?"* Yes — Cilium's eBPF
replacement does exactly that, moving the translation into a socket-level eBPF
map and skipping iptables entirely.
:::

## ★ Key Takeaway

:::cloud
**1.** Kubernetes networking is a contract; the CNI plugin is the implementation.
**2.** Pod→Pod is NAT-free. Pod→Service is DNAT. These are different guarantees.
**3.** CNI owns Pod IPs. kube-proxy owns Service VIPs. They never overlap.
**4.** Check EndpointSlices before anything else — the empty-selector bug is the
most common Service failure by a wide margin.
**5.** At scale the network breaks in the control plane (stale rules), not the
data plane (slow packets).
:::

---

**Version note:** the four-rule model is stable and has not changed since the
early releases. Implementation details that *do* move: EndpointSlices replaced
Endpoints as the scalable backing store (GA in 1.21), and eBPF-based kube-proxy
replacement is production-viable but still opt-in. Verified against Kubernetes
1.29–1.31 behaviour.
