---
title: Kubernetes Deployments
slug: kubernetes-deployments
type: guide
domain: 03-kubernetes
tags: [kubernetes, deployments, rollout]
keywords: [replicaset, rolling update, rollback, scale, replicas, strategy, hpa, autoscaling]
level: 2
status: stable
prerequisites: [kubernetes-basics]
related: [kubernetes-services, kubernetes-troubleshooting]
updated: 2026-09-06
---

# Kubernetes Deployments

> A Deployment is how you get zero-downtime updates: it never edits a running pod, it creates new ones and removes old ones in a controlled order.

## What is it?

A Deployment keeps a set number of identical pods running, and manages the
transition when you change them. It is the object you use for any stateless
application — web servers, APIs, workers.

You do not create pods yourself. You create a Deployment; it does the rest.

## Why it exists

A bare pod has no safety net. Delete it and it is gone. A Deployment adds:

- **Self-healing** — a pod dies, a replacement appears
- **Scaling** — one command changes the replica count
- **Rolling updates** — new version phased in without dropping traffic
- **Rollback** — one command returns to the previous version

## What it is made of

Three layers, and knowing them makes rollbacks make sense:

```diagram
   Deployment  "run 3 pods of nginx:1.27, update them safely"
        │
        │ creates and owns one ReplicaSet per version
        ▼
   ReplicaSet (nginx:1.27)  "keep exactly 3 pods alive"
        │
        ▼
   Pod   Pod   Pod
```

When you change the image, the Deployment creates a **new** ReplicaSet and
shrinks the old one:

```diagram
   during a rolling update:

   ReplicaSet v1 (old)  ███░░░░  3 → 2 → 1 → 0
   ReplicaSet v2 (new)  ░░░████  0 → 1 → 2 → 3
                        └─ both exist at once, briefly
```

:::key Old ReplicaSets are kept deliberately
After a successful update the old ReplicaSet stays, scaled to 0. That is not
leftover rubbish — it is what makes `kubectl rollout undo` instant. Rolling back
just scales the old ReplicaSet up and the new one down.

`kubectl get rs` shows them. `revisionHistoryLimit` (default 10) controls how
many are kept.
:::

## How to use it

```yaml title="deployment.yaml"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1      # how many may be down during the update
      maxSurge: 1            # how many extra may exist temporarily
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          readinessProbe:              # "may I receive traffic?"
            httpGet: { path: /healthz, port: 80 }
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:               # "should I be restarted?"
            httpGet: { path: /healthz, port: 80 }
            initialDelaySeconds: 15
            periodSeconds: 20
          resources:
            requests: { memory: "64Mi", cpu: "100m" }
            limits:   { memory: "128Mi", cpu: "500m" }
```

### Commands

```sh
kubectl apply -f deployment.yaml

kubectl rollout status deploy/web        # watch the update; exits when done
kubectl get rs -l app=web                # the ReplicaSets, old and new
kubectl rollout history deploy/web       # revision list

kubectl set image deploy/web web=nginx:1.28-alpine   # trigger an update
kubectl scale deploy/web --replicas=5

kubectl rollout undo deploy/web              # back one revision
kubectl rollout undo deploy/web --to-revision=3

kubectl rollout restart deploy/web       # recreate all pods without changing the spec
```

`kubectl rollout restart` is the way to make pods pick up a changed ConfigMap or
Secret — it recreates them with no spec change.

### Probes are the part that actually matters

The two probes look similar and do very different things. Getting them wrong is
the most common cause of self-inflicted outages.

| | **readinessProbe** | **livenessProbe** |
|:---|:---|:---|
| Question | "Can I serve traffic?" | "Am I broken beyond recovery?" |
| On failure | Removed from the Service — **no restart** | **Container is restarted** |
| Use for | Warm-up, temporary overload | Deadlock, unrecoverable state |

:::danger A liveness probe turns a slowdown into an outage
Your service gets busy. Response times rise. The liveness probe times out.
Kubernetes restarts the container — removing capacity from an already-overloaded
service, which makes the remaining pods busier, which fails their probes too.

The cascade is entirely self-inflicted.

Two rules that prevent it:
- **Liveness endpoints must check only the process**, never a database or
  another service. A liveness check that pings the database restarts your app
  every time the database hiccups.
- Give liveness generous timeouts. Readiness is where you want to be strict.

If your app is simply slow to start, use a **startupProbe** — it suspends
liveness until the app is up, instead of you having to loosen liveness forever.
:::

### Rolling update knobs

```diagram
   replicas: 10, maxUnavailable: 1, maxSurge: 1

   ┌─ at most 11 pods exist at any moment  (10 + maxSurge)
   └─ at least 9 are serving               (10 − maxUnavailable)

   maxUnavailable: 0  → never lose capacity, but needs room for extra pods
   maxSurge: 0        → never exceed the count, but capacity dips during update
```

Setting both to 0 is invalid — nothing could ever change.

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| `rollout status` hangs forever | New pods never become Ready | `kubectl describe pod` on a new pod |
| Old pods never terminate | A `PodDisruptionBudget` blocks eviction | `kubectl get pdb` |
| Update did nothing | The spec did not actually change | Use `rollout restart`, or change the tag |
| Pods restart in a loop after deploy | Liveness probe failing | Check the probe path, port, and timing |
| A few 502s on every deploy | Endpoints not updated before the pod dies | See below |

:::warn A few errors on every rolling update — and how to stop them
When a pod is being removed, two things happen **in parallel, not in order**:
kubelet sends SIGTERM to your app, and the Service's endpoint list is updated
across every node.

There is no coordination. Your app can finish shutting down before the last node
stops sending it traffic — so requests arrive at a closed socket.

The fix is a `preStop` hook that delays the shutdown, giving endpoint removal
time to propagate:

```yaml
lifecycle:
  preStop:
    exec:
      # The pod is already out of the endpoint list; this pause lets every
      # node's networking catch up before the process exits.
      command: ["sh", "-c", "sleep 10"]
```

A longer `terminationGracePeriodSeconds` does **not** fix this — it extends how
long the app may take to exit, which is the wrong side of the race.
:::

## Scaling automatically

```sh
# Add and remove pods based on CPU. Requires resource requests to be set
# and the metrics-server add-on to be installed.
kubectl autoscale deploy/web --min=3 --max=10 --cpu-percent=70
kubectl get hpa
```

The HPA needs `resources.requests` — the target percentage is measured against
the request, so with no request there is nothing to compute against.

## Key takeaways

- **Deployment → ReplicaSet → Pods.** One ReplicaSet per version, which is what
  makes rollback instant.
- **Readiness removes from traffic; liveness restarts.** Confusing them causes
  restart cascades.
- **Liveness must never check dependencies**, and slow starters need a
  `startupProbe`.
- **`rollout undo`** is one command. Old ReplicaSets exist for exactly this.
- **`rollout restart`** to pick up new config without changing the spec.
- Deploy-time 502s are the endpoint-propagation race — fix with a `preStop`
  sleep.
