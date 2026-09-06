---
title: Kubernetes Services
slug: kubernetes-services
type: concept
domain: 03-kubernetes
tags: [kubernetes, services, kube-proxy, endpoints]
level: 3
status: stable
prerequisites: [kubernetes-networking]
related: [kubernetes-dns, kubernetes-networking-questions]
updated: 2026-09-05
---

# Kubernetes Services

> A Service is a stable name for an unstable set of Pods — and the set is defined by labels, not by intent.

## ① What is it?

A Service gives a group of Pods one **stable virtual IP** and DNS name. Pods
come and go with new IPs on every restart; the Service address never changes.

Two independent things happen under that one object:

- The **EndpointSlice controller** watches for Pods matching the selector *and
  passing their readiness probe*, and maintains the backend list.
- **kube-proxy** turns that list into kernel rules that rewrite the virtual IP
  to a real Pod IP.

Most Service bugs are in the first half while people debug the second.

## ② Why does it exist?

```diagram
  WITHOUT a Service              WITH a Service
  client ──▶ 10.2.1.3 ✗ gone    client ──▶ my-svc (10.96.0.10)
         ──▶ 10.2.1.9 ✗ gone                    │
         ──▶ 10.2.2.4 ✓ ...for now              ├──▶ 10.2.1.3
                                                ├──▶ 10.2.1.4
  Who tracks the current list?                  └──▶ 10.2.2.6
  Every client, forever.              Kubernetes tracks it. Once.
```

## ③ Mental Model

:::mental
A Service is a **hotel reception desk**. Guests change rooms constantly; you
always ask reception, and reception always knows the current room.

**Where it breaks down:** reception does not walk you to the room. Once you have
the address the connection is direct Pod-to-Pod — the Service is not in the data
path. This is why "the Service is slow" is never a meaningful statement.
:::

## ④ The Types

| Type | Gives you | Reachable from | Use when |
|:---|:---|:---|:---|
| `ClusterIP` (default) | Virtual IP inside the cluster | Inside only | Service-to-service |
| `NodePort` | A port on **every** node | Outside, if you can reach nodes | Rarely directly; it is a building block |
| `LoadBalancer` | Cloud LB → NodePort → Pods | Internet | Cloud-managed external entry |
| `ExternalName` | A `CNAME` — no proxying at all | Inside | Aliasing an external hostname |
| **Headless** (`clusterIP: None`) | DNS returns **Pod IPs directly** | Inside | StatefulSets, client-side LB, per-Pod addressing |

:::senior
**`LoadBalancer` is a superset, not an alternative.** A `LoadBalancer` Service
allocates a `NodePort`, which allocates a `ClusterIP`. All three exist
simultaneously. Understanding this explains why external traffic still passes
through kube-proxy's rules, and why `externalTrafficPolicy` affects a cloud LB
at all.

**Headless is the odd one out** — it is the only type with no virtual IP and no
kube-proxy involvement. DNS returns every Pod IP and the client chooses. This is
what StatefulSets use to give each Pod a stable, individually addressable name.
:::

## ⑤ How a request actually flows

```diagram
 client Pod
    │  ① resolve "my-svc" ──▶ CoreDNS ──▶ 10.96.0.10  (the ClusterIP)
    ▼
 connect to 10.96.0.10:80
    │  ② kernel netfilter: KUBE-SERVICES chain matches the VIP
    │  ③ DNAT to a randomly chosen ready endpoint  ──▶ 10.2.1.4:8080
    │  ④ conntrack records the choice, so the whole
    │     connection stays pinned to that one Pod
    ▼
 packet leaves with dst=10.2.1.4, src=<real client Pod IP>
    │  ⑤ CNI routes it — the Service is no longer involved
    ▼
 backend Pod
```

Two consequences worth internalising:

- **Balancing is per-connection, not per-request.** With HTTP keep-alive or
  gRPC, one long-lived connection pins to one Pod. Scaling from 3 to 30 Pods
  moves no existing traffic. This is the single most common reason "autoscaling
  did not help".
- **The ClusterIP is not pingable.** It exists only as DNAT rules. `ping`
  failing against a healthy Service means nothing.

## ⑥ Readiness is what actually controls routing

The selector decides *candidacy*. The **readiness probe** decides *membership*.

```diagram
Pod matches selector? ──no──▶ never an endpoint
        │ yes
        ▼
Readiness probe passing? ──no──▶ removed from EndpointSlice, no traffic
        │ yes
        ▼
    receives traffic
```

This is the useful lever: failing readiness takes a Pod out of rotation
*without* restarting it — unlike a liveness probe, which kills it.

## ⑦ Failure Modes

| What breaks | Signature | Check |
|:---|:---|:---|
| Selector typo | DNS resolves, connections time out | `kubectl get endpointslices` — empty |
| `targetPort` wrong | Connection refused | Compare Service `targetPort` to the container port |
| Readiness never passes | Endpoints empty, Pods `Running` | `kubectl describe pod` → probe failures |
| Keep-alive pinning | Load skewed after scale-up | Per-Pod request-rate metrics diverge |
| Deregistration race | 502s during every rolling deploy | See below |

:::failure
**The deregistration race — why every rolling deploy emits a few 502s.**

When a Pod is deleted, two things happen **in parallel, not in order**:

```diagram
   Pod marked for deletion
        │
        ├──▶ kubelet sends SIGTERM ────────────▶ app starts shutting down
        │
        └──▶ EndpointSlice updated ──▶ kube-proxy on EVERY node
                                        rewrites its rules ── takes time
```

There is no coordination between the two. The application can finish shutting
down **before** the last node has removed it from its rules — so traffic keeps
arriving at a socket that is already closed.

The fix is not a longer `terminationGracePeriodSeconds`. It is a `preStop` hook
that sleeps, delaying SIGTERM long enough for endpoint propagation to win the
race:

```yaml
lifecycle:
  preStop:
    exec:
      # Do nothing for 5-10s. The Pod is already out of the EndpointSlice;
      # this window lets every node's kube-proxy catch up before the app dies.
      command: ["sh", "-c", "sleep 10"]
```

Combine with graceful shutdown in the application (stop accepting, drain
in-flight, then exit). Neither alone is sufficient.
:::

## ⑧ Troubleshooting

```sh
# 1. THE FIRST COMMAND. Empty endpoints explains almost every Service bug.
kubectl get endpointslices -l kubernetes.io/service-name=my-svc -o wide

# 2. If empty: do the labels actually match? Compare these two outputs
#    character by character — "app=api" vs "app: api" trips people constantly.
kubectl get svc my-svc -o jsonpath='{.spec.selector}{"\n"}'
kubectl get pods --show-labels

# 3. Endpoints exist but connections fail — is targetPort right?
#    Service port is what clients use; targetPort is the container's port.
kubectl get svc my-svc -o jsonpath='{.spec.ports[*]}{"\n"}'

# 4. Bypass the Service to isolate the layer. If this works, the Pod is fine
#    and the problem is Service/DNS.
kubectl run tmp --rm -it --image=nicolaka/netshoot --restart=Never -- \
  curl -sS --max-time 3 http://10.2.1.4:8080/healthz
```

## ⑨ Common Mistakes

- **Pinging a ClusterIP** to test a Service. It cannot work, and it tells you
  nothing about health.
- **Confusing `port` and `targetPort`.** `port` is the Service's; `targetPort`
  is the container's. Swapping them yields connection refused.
- **Expecting Service load balancing to rebalance existing connections.** It
  balances connections, not requests. Long-lived connections never move.
- **Using a liveness probe where readiness was meant.** A failing liveness probe
  restarts the Pod; a failing readiness probe just removes it from rotation.
  Under load, an aggressive liveness probe turns a slowdown into a restart loop.

## ⑩ Senior Engineer Notes

**Client-side load balancing exists because of the keep-alive problem.** gRPC
and HTTP/2 multiplex many requests over one connection, so per-connection DNAT
gives terrible distribution. The answers are a headless Service with a
client-side balancer, or a service mesh sidecar that balances per request. If an
interviewer asks how to load-balance gRPC in Kubernetes, "use a Service" is the
wrong answer.

**A Service without a selector is a legitimate and underused pattern.** Omit the
selector and write the EndpointSlice yourself, and you get a stable in-cluster
name for something outside the cluster — a managed database, a legacy VM. Your
application config then never has to know whether the backend was migrated in.

**`sessionAffinity: ClientIP` is coarse.** It pins on source IP, so every client
behind one NAT gateway lands on the same Pod. It is a blunt instrument; real
session handling belongs in the application or at an L7 proxy.

## ⑪ Interview Traps

:::trap
**"You scaled from 3 replicas to 30 and latency did not improve. Why?"**

The expected wrong answer is about resource limits or the HPA.

The mechanism: existing clients hold **keep-alive connections**, and kube-proxy
balances per connection. Those connections stay pinned to the original 3 Pods.
The 27 new Pods are ready, healthy, in the EndpointSlice — and idle.

Evidence: per-Pod request rate is wildly skewed while the Service looks
perfectly healthy. Fixes: connection max-lifetime on the client, client-side
balancing over a headless Service, or an L7 proxy that balances per request.
:::

:::trap
**"Why does a rolling deploy cause 502s when the app shuts down gracefully?"**

Because graceful shutdown solves the *wrong half*. The app draining cleanly does
not help if kube-proxy on some node still routes new connections to it. The race
is between endpoint propagation and process death — see ⑦. A candidate who
reaches for `terminationGracePeriodSeconds` has misdiagnosed which side is slow.
:::

## ★ Key Takeaway

:::cloud
**1.** Selector decides candidacy; **readiness decides membership**.
**2.** `kubectl get endpointslices` first, always. Empty endpoints explains most
Service bugs in one command.
**3.** Balancing is per **connection**. Keep-alive defeats it.
**4.** Rolling-deploy 502s come from the endpoint-propagation race — fix with a
`preStop` sleep, not a longer grace period.
**5.** The Service is not in the data path. "The Service is slow" is never a
diagnosis.
:::

---

**Version note:** EndpointSlices are the scalable backing store and have been GA
since 1.21; `kubectl get endpoints` still works but is the legacy view.
`trafficDistribution` (topology-aware routing) is newer and cloud-dependent —
verify behaviour on your platform before relying on it. Verified against 1.29–1.31.
