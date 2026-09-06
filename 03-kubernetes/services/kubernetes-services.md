---
title: Kubernetes Services
slug: kubernetes-services
type: guide
domain: 03-kubernetes
tags: [kubernetes, services, networking]
keywords: [clusterip, nodeport, loadbalancer, ingress, endpoints, selector, dns, port, targetport]
level: 2
status: stable
prerequisites: [kubernetes-basics]
related: [kubernetes-deployments, dns, kubernetes-troubleshooting]
updated: 2026-09-06
---

# Kubernetes Services

> Pods get a new IP address every time they restart, so nothing can talk to them directly. A Service is the stable address that stays put.

## What is it?

A Service gives a group of pods one **fixed IP address and DNS name**. Clients
talk to the Service; it forwards to whichever pods are currently healthy.

```diagram
   without a Service              with a Service
   ─────────────────              ──────────────
   client → 10.1.0.4  ✗ gone      client → web (10.96.0.10)
          → 10.1.0.9  ✗ gone                    │
          → 10.1.2.3  ✓ for now                 ├→ 10.1.0.4
                                                ├→ 10.1.0.5
   who tracks the current list?                 └→ 10.1.2.6
   every client, forever.             Kubernetes tracks it. Once.
```

## Why it exists

Pod IPs are **ephemeral by design**. A pod that restarts, moves node, or scales
gets a different address. Hard-coding one guarantees breakage.

A Service solves two problems at once: a stable address, and load balancing
across whatever pods exist right now.

## What it is made of

Two things happen behind one object — and nearly all Service bugs are in the
first while people debug the second:

```diagram
   ① the ENDPOINT list          ② the ROUTING rules
   ─────────────────────        ───────────────────
   "which pods match my         "rewrite traffic for
    selector AND pass           10.96.0.10 to one of
    their readiness probe?"      those pod IPs"

   maintained by the            programmed into each node's
   endpoints controller         kernel by kube-proxy
```

### The four types

| Type | Gives you | Reachable from | Use when |
|:---|:---|:---|:---|
| **ClusterIP** (default) | Internal IP + DNS name | Inside the cluster only | Service-to-service. Most of the time |
| **NodePort** | A port on every node | Outside, if you can reach nodes | Rarely direct — it is a building block |
| **LoadBalancer** | A cloud load balancer | The internet | Cloud-managed external entry |
| **ExternalName** | A DNS CNAME, no proxying | Inside | Aliasing an external hostname |

:::note LoadBalancer is a superset, not an alternative
A `LoadBalancer` Service creates a `NodePort`, which creates a `ClusterIP`. All
three exist at once. This is why external traffic still goes through the same
in-cluster routing rules, and why the cloud LB's health checks matter.
:::

## How to use it

```yaml title="service.yaml"
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP
  selector:
    app: web          # MUST match the pods' labels exactly
  ports:
    - port: 80        # the port the Service listens on
      targetPort: 8080  # the port the CONTAINER listens on
```

:::warn `port` vs `targetPort` — swapped constantly
- **`port`** is what clients connect to on the Service.
- **`targetPort`** is the port inside the container.

They are often the same, which is why the distinction is easy to miss — and then
one day they differ and you get "connection refused" from a perfectly healthy
pod.
:::

### DNS names

Once a Service exists, it has a name:

```diagram
   web  .  production  .  svc  .  cluster.local
    │          │           │          │
    │          │           │          └─ cluster domain
    │          │           └─ "svc" for Services
    │          └─ namespace
    └─ Service name
```

| From | You can write |
|:---|:---|
| Same namespace | `web` |
| Another namespace | `web.production` |
| Anywhere (fully qualified) | `web.production.svc.cluster.local` |

So an app connects to `postgres://db:5432` where `db` is just the Service name.
You never handle IP addresses.

### Commands

```sh
kubectl get svc                      # all Services with their ClusterIPs
kubectl get endpoints web            # THE FIRST DEBUGGING COMMAND
kubectl describe svc web

# Test from inside the cluster — a Service is not reachable from your laptop
kubectl run tmp --rm -it --image=busybox --restart=Never -- sh
#   inside: wget -qO- http://web
#   inside: nslookup web

# Or reach it from your machine temporarily
kubectl port-forward svc/web 8080:80    # then open http://localhost:8080
```

`kubectl port-forward` is how you test an internal Service from your laptop
without exposing it to the internet.

## What goes wrong

:::danger `ENDPOINTS: <none>` — the most common Kubernetes bug by a wide margin
The Service exists, DNS resolves, connections are accepted — and everything
times out. Because the Service has **no backends**.

```sh
kubectl get endpoints web
# web    <none>    5m      ← this
```

Two possible causes:

**1. The selector does not match the pods' labels.** Compare them character by
character:

```sh
kubectl get svc web -o jsonpath='{.spec.selector}{"\n"}'
kubectl get pods --show-labels
```

**2. The pods are not Ready.** Only pods passing their readiness probe are
listed. `kubectl get pods` showing `0/1 READY` means the probe is failing — the
Service is behaving correctly by refusing to send traffic there.

There is no error message for either. Always check endpoints first.
:::

| Symptom | Cause | Fix |
|:---|:---|:---|
| `ENDPOINTS: <none>` | Selector mismatch, or pods not Ready | See above |
| Connection refused | `targetPort` wrong | Compare to the container's real port |
| `ping <ClusterIP>` fails | A ClusterIP is not pingable — it is a routing rule, not a host | Use `wget`/`curl`, not `ping` |
| Works from one pod, not another | NetworkPolicy blocking it | `kubectl get networkpolicy -A` |
| `LoadBalancer` stuck on `<pending>` | No cloud integration (e.g. plain minikube) | Use `port-forward` or NodePort locally |
| Scaled up, load still uneven | Keep-alive connections pinned to old pods | See below |

:::warn Scaling up did not spread the load
Kubernetes balances **connections**, not requests. With HTTP keep-alive or gRPC,
one long-lived connection stays pinned to one pod for its whole life.

So scaling from 3 to 30 pods moves **no existing traffic**. The 27 new pods are
Ready, in the endpoint list, and idle.

The tell: per-pod request rates are wildly uneven while the Service looks
perfectly healthy. Fixes are a maximum connection lifetime on the client, or an
L7 proxy / service mesh that balances per request.
:::

## Getting traffic in from outside

A `ClusterIP` Service is internal. For HTTP from the internet you normally want
an **Ingress** in front of it — one load balancer for many services, with
hostname and path routing and TLS.

```diagram
   internet
      │
      ▼
   Ingress          example.com/api  → api Service
      │             example.com/     → web Service
      ├──→ Service (api) ──→ pods
      └──→ Service (web) ──→ pods
```

```yaml title="ingress.yaml"
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: site
spec:
  ingressClassName: nginx      # which controller handles this
  rules:
    - host: example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port: { number: 80 }
```

An Ingress object does nothing on its own — a **controller** (ingress-nginx,
Traefik) must be installed in the cluster to act on it. An Ingress that appears
to be ignored usually means no controller, or the wrong `ingressClassName`.

## Key takeaways

- Pod IPs change; a Service is the **stable address**.
- **`kubectl get endpoints <svc>` first, always.** `<none>` means selector
  mismatch or pods not Ready.
- **`port`** is the Service's, **`targetPort`** is the container's.
- A ClusterIP is **not pingable** — that failing proves nothing.
- Services are reachable **from inside the cluster**; use `port-forward` from
  your laptop.
- Load balancing is **per connection**. Keep-alive defeats it.
- **Ingress** for HTTP from outside — and it needs a controller installed.
