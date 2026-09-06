---
title: Kubernetes Basics
slug: kubernetes-basics
type: guide
domain: 03-kubernetes
tags: [kubernetes, k8s, orchestration]
keywords: [k8s, kubectl, cluster, node, control plane, api server, etcd, scheduler, kubelet, manifest, yaml]
level: 1
status: stable
prerequisites: [docker]
related: [kubernetes-pods, kubernetes-deployments, kubectl-commands]
updated: 2026-09-06
---

# Kubernetes Basics

> You describe what you want running; Kubernetes keeps making reality match that description. Everything else is detail.

## What is it?

Kubernetes (often "K8s") runs containers across many machines for you. You hand
it a description — "I want 3 copies of this image, reachable on port 80" — and
it decides where they run, restarts them when they crash, and replaces them when
a machine dies.

Docker runs a container on **one** machine. Kubernetes runs containers across
**many**, and keeps them running without you watching.

## Why it exists

With a handful of containers on one server, `docker compose` is enough. The
problems appear at scale:

| Problem | What you'd do by hand | Kubernetes |
|:---|:---|:---|
| A container crashes at 3am | Get paged, SSH in, restart | Restarts it automatically |
| A whole server dies | Manually move everything | Reschedules onto healthy nodes |
| Traffic tripled | Manually start more copies | Autoscales |
| Deploy a new version | Stop old, start new, hope | Rolling update, automatic rollback |
| Where is there room for this? | Track capacity in a spreadsheet | The scheduler decides |

:::key The one idea underneath everything: reconciliation
You never tell Kubernetes to *do* something. You tell it what the world should
look like, and controllers continuously compare **desired state** against
**actual state** and close the gap.

```diagram
   you: "3 replicas"  →  DESIRED STATE (stored in etcd)
                                │
                                │  controllers compare, forever
                                ▼
                          ACTUAL STATE: 2 running
                                │
                                ▼
                          action: start 1 more
```

This is why deleting a pod does not remove it — a controller notices the gap and
makes a new one. To actually remove it you change the *desired state* (delete
the Deployment). Grasp this and Kubernetes stops feeling arbitrary.
:::

## What it is made of

A cluster has two halves.

```diagram
┌───────────────────── CONTROL PLANE (the brain) ──────────────────────┐
│                                                                      │
│   ┌────────┐   ┌──────────────┐   ┌───────────┐   ┌──────────────┐  │
│   │  etcd  │←→ │  API SERVER  │←→ │ Scheduler │   │ Controllers  │  │
│   └────────┘   └──────────────┘   └───────────┘   └──────────────┘  │
│    stores       the front door      picks a         keep desired    │
│    all state    for everything      node            = actual        │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   NODE 1     │   │   NODE 2     │   │   NODE 3     │   ← workers
│  kubelet     │   │  kubelet     │   │  kubelet     │
│  kube-proxy  │   │  kube-proxy  │   │  kube-proxy  │
│  [pods...]   │   │  [pods...]   │   │  [pods...]   │
└──────────────┘   └──────────────┘   └──────────────┘
```

### Control plane

| Component | Job | If it stops |
|:---|:---|:---|
| **API server** | The only way in. Everything talks to it | No changes possible; running pods keep running |
| **etcd** | Database holding all cluster state | The cluster loses its memory. Back this up |
| **Scheduler** | Chooses which node a new pod goes on | New pods stay `Pending`; existing ones fine |
| **Controllers** | Reconcile desired vs actual | Deploys stall silently |

### Worker nodes

| Component | Job |
|:---|:---|
| **kubelet** | The agent on each node. Starts and watches containers |
| **kube-proxy** | Sets up networking so Services work |
| **Container runtime** | Actually runs containers (containerd) |

:::note Control plane down does not mean your app is down
Running pods keep serving and Service traffic keeps flowing, because the rules
are already in place on each node. kubelet even restarts crashed containers
locally without asking anyone.

What you lose is the ability to **change** things: no deploys, no scaling, no
rescheduling if a node dies. The danger is not immediate downtime — it is that
your recovery mechanism is unavailable exactly when something else breaks.
:::

## The objects you will use

You describe everything in YAML. These are the ones you actually need:

| Object | What it is | Analogy |
|:---|:---|:---|
| **Pod** | One or more containers that run together | A single running instance |
| **Deployment** | Keeps N identical pods running; handles updates | A manager of pods |
| **Service** | A stable address for a group of pods | A receptionist |
| **Ingress** | Routes external HTTP traffic to Services | The front door |
| **ConfigMap** | Non-secret configuration | A settings file |
| **Secret** | Passwords, keys, tokens | A locked drawer |
| **Namespace** | A folder for grouping objects | A project folder |

```diagram
   internet
      │
      ▼
   Ingress          "example.com/api  →  the api Service"
      │
      ▼
   Service          stable IP + DNS name; picks a healthy pod
      │
      ├──→ Pod ─┐
      ├──→ Pod  ├─ all created and watched by one Deployment
      └──→ Pod ─┘
```

You almost never create a Pod directly. You create a **Deployment**, and it
creates the Pods.

## How to use it

### Talking to the cluster

`kubectl` is the command-line tool. Everything goes through it.

```sh title="Orientation — run these first on any new cluster"
kubectl cluster-info            # is the cluster reachable?
kubectl get nodes               # the machines. All should be Ready
kubectl get pods                # pods in the CURRENT namespace
kubectl get pods -A             # every namespace
kubectl get all                 # most object types in this namespace
```

:::warn Almost every command is namespace-scoped
`kubectl get pods` shows only the **current** namespace, which defaults to
`default`. Your pods are probably somewhere else — this is why beginners see an
empty list on a busy cluster.

```sh
kubectl get pods -A                        # look everywhere
kubectl get pods -n production             # a specific namespace
kubectl config set-context --current --namespace=production   # change the default
```
:::

### Deploying something

Write a manifest:

```yaml title="deployment.yaml"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3                  # desired state: three pods
  selector:
    matchLabels:
      app: web                 # which pods this Deployment owns
  template:                    # the recipe for each pod
    metadata:
      labels:
        app: web               # MUST match the selector above
    spec:
      containers:
        - name: web
          image: nginx:1.27-alpine
          ports:
            - containerPort: 80
          resources:
            requests:          # what it is guaranteed
              memory: "64Mi"
              cpu: "100m"      # 100m = 0.1 of a CPU core
            limits:            # what it may never exceed
              memory: "128Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web                   # sends traffic to pods with this label
  ports:
    - port: 80
      targetPort: 80
```

Apply it:

```sh
kubectl apply -f deployment.yaml     # create or update. Use this, not `create`
kubectl get pods -l app=web          # see the three pods
kubectl rollout status deploy/web    # wait for the rollout to finish
```

`kubectl apply` is **declarative** — run it repeatedly and you converge on the
file's contents. `kubectl create` fails if the object exists. Always use `apply`.

### Labels are the glue

Nothing in Kubernetes is linked by name. Objects find each other by **labels**.

```diagram
   Service  selector: app=web
                │
                │  "give me every pod labelled app=web"
                ▼
   Pod app=web ✓     Pod app=web ✓     Pod app=api ✗
```

:::danger A typo in a label breaks everything silently
If a Service's `selector` does not match the pods' `labels`, the Service is
created successfully, resolves in DNS, accepts connections — and times out,
because it has no backends.

There is no error message. One command tells you:

```sh
kubectl get endpoints web
# NAME   ENDPOINTS                          AGE
# web    10.1.0.4:80,10.1.0.5:80,...        2m     ← good
# web    <none>                             2m     ← the selector matches nothing
```

**`<none>` in ENDPOINTS is the single most common Kubernetes bug.** Check it
before anything else.
:::

### Day-to-day commands

```sh
kubectl describe pod <name>     # events + state. FIRST command when something is wrong
kubectl logs <pod>              # its output
kubectl logs <pod> -f           # follow
kubectl logs <pod> --previous   # the CRASHED container's logs, not the new one
kubectl exec -it <pod> -- sh    # shell inside the pod

kubectl scale deploy/web --replicas=5
kubectl rollout restart deploy/web    # restart all pods (picks up new config)
kubectl rollout undo deploy/web       # roll back to the previous version

kubectl delete -f deployment.yaml     # remove what the file created
```

`kubectl describe` is the most valuable debugging command. The **Events** at the
bottom usually name the problem outright: image pull failure, insufficient
memory, failing probe, missing ConfigMap.

### Requests and limits

These two numbers matter more than almost anything else:

| | Meaning | Effect |
|:---|:---|:---|
| **request** | Guaranteed minimum | Used by the scheduler to pick a node |
| **limit** | Hard ceiling | Exceeding memory → **killed**; exceeding CPU → **throttled** |

:::warn Memory limits kill, CPU limits slow down
Exceeding a **memory** limit means the kernel kills the container instantly —
`OOMKilled`, exit code 137, no cleanup.

Exceeding a **CPU** limit does not kill anything. The container is paused for
the rest of a 100ms window. The result is latency, and — the confusing part —
CPU usage graphs look **low**, because frozen time is not counted as usage.

So "the app is slow but CPU looks fine" is often a CPU limit set too low.
:::

Setting no requests at all means the scheduler is guessing, and your pods are
first to be evicted when a node runs short.

## What goes wrong first

| Pod status | Meaning | First command |
|:---|:---|:---|
| `Pending` | Not scheduled — no node has room, or a volume is missing | `kubectl describe pod` → Events |
| `ImagePullBackOff` | Cannot fetch the image: wrong name, tag, or no credentials | `kubectl describe pod` |
| `CrashLoopBackOff` | Starts, exits, restarts, repeatedly | `kubectl logs <pod> --previous` |
| `OOMKilled` | Exceeded its memory limit | Raise the limit, or fix the leak |
| `Running` but not working | Often a Service/label problem | `kubectl get endpoints` |

## Key takeaways

- **You declare desired state; controllers make reality match.** That is the
  whole model.
- **Deployment → Pods → Service.** You create Deployments, not Pods.
- **Labels connect everything.** `kubectl get endpoints` showing `<none>` means
  a selector typo.
- **`kubectl describe pod`** first, then **`kubectl logs --previous`** for
  crashes.
- **`apply`, never `create`.**
- **Memory limits kill; CPU limits throttle** and make CPU graphs look
  deceptively low.
- Everything is namespaced — `-A` when you cannot find something.
