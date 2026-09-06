---
title: Kubernetes Pods
slug: kubernetes-pods
type: guide
domain: 03-kubernetes
tags: [kubernetes, pods, containers]
keywords: [sidecar, init container, pause container, localhost, shared volume, ephemeral, restart policy]
level: 2
status: stable
prerequisites: [kubernetes-basics, docker]
related: [kubernetes-deployments, kubernetes-troubleshooting]
updated: 2026-09-06
---

# Kubernetes Pods

> A pod is not "a container" — it is a small group of containers that share an IP address and a filesystem, and always live and die together.

## What is it?

A pod is the smallest thing Kubernetes can schedule. It wraps **one or more**
containers that:

- share **one IP address** (they reach each other on `localhost`)
- can share **volumes**
- are always placed on the **same node**
- start and stop **together**

Most pods contain exactly one container. The ability to hold more exists for a
specific pattern, not as a way to bundle unrelated services.

## Why it exists

Some helpers only make sense right next to the application — a log shipper
reading the app's files, a proxy handling its network traffic. They need the
same filesystem and the same network as the app.

Rather than complicate the container model, Kubernetes added a wrapper: the pod
is the unit of scheduling, and containers inside it are as close together as two
processes on one machine.

```diagram
   ┌──────────── POD (one IP: 10.1.0.4) ────────────┐
   │                                                 │
   │  ┌───────────┐        ┌──────────────┐          │
   │  │  app      │◄─────► │  log shipper │          │
   │  │  :8080    │ localhost              │          │
   │  └─────┬─────┘        └──────┬───────┘          │
   │        │   shared volume     │                  │
   │        └──────── /logs ──────┘                  │
   └─────────────────────────────────────────────────┘
```

## What it is made of

| Part | Purpose |
|:---|:---|
| **App container** | Your program. Usually the only one |
| **Init containers** | Run to completion **before** app containers start |
| **Sidecar containers** | Run alongside the app (proxy, log shipper, agent) |
| **Volumes** | Storage shared between the containers in the pod |
| **Pause container** | Hidden. Holds the network namespace open so containers keep one IP |

:::key Why containers in a pod share `localhost`
The pod's network belongs to a hidden "pause" container that starts first and
outlives the others. Every container in the pod joins **its** network namespace.

Two consequences:
- They reach each other on `localhost` — no service discovery needed.
- They **cannot both bind the same port**. Two containers on 8080 in one pod is
  a conflict, exactly as it would be on one machine.
:::

## How to use it

You rarely write a Pod manifest directly — you write a Deployment, and the pod
spec lives inside its `template`. But you need to read it:

```yaml title="A pod spec with an init container and a sidecar"
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  # Run first, to completion, in order. The app does not start until all pass.
  initContainers:
    - name: wait-for-db
      image: busybox:1.36
      command: ['sh', '-c', 'until nc -z db 5432; do sleep 2; done']

  containers:
    - name: app
      image: myapp:1.0
      ports:
        - containerPort: 8080
      volumeMounts:
        - name: logs
          mountPath: /var/log/app

    - name: log-shipper            # sidecar: reads what the app writes
      image: fluent-bit:3.1
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true

  volumes:
    - name: logs
      emptyDir: {}                 # lives and dies with the pod

  restartPolicy: Always
```

### Init containers are the right tool for ordering

An init container must **exit 0** before the next one starts, and all must
finish before app containers begin. Use them for:

- waiting for a dependency to be reachable
- running a database migration
- fetching config or a secret into a shared volume

```sh
kubectl get pods
# NAME   READY   STATUS      RESTARTS   AGE
# web    0/2     Init:0/1    0          10s    ← still in the init container
```

`Init:0/1` means the first of one init container has not finished. If it stays
there, `kubectl logs <pod> -c wait-for-db` tells you what it is waiting for.

### Useful commands

```sh
kubectl get pods -o wide                  # includes pod IP and node
kubectl describe pod <pod>                # events, state, probe results
kubectl logs <pod>                        # single-container pod
kubectl logs <pod> -c app                 # name the container when there are several
kubectl logs <pod> -c app --previous      # the crashed instance
kubectl exec -it <pod> -c app -- sh       # shell inside a specific container
kubectl port-forward pod/<pod> 8080:8080  # reach it from your laptop
```

:::warn With more than one container, `-c` is mandatory
`kubectl logs <pod>` on a multi-container pod errors with "a container name must
be specified". The same applies to `exec`. `kubectl get pod <pod> -o
jsonpath='{.spec.containers[*].name}'` lists the names.
:::

## Pods are disposable — design for it

```diagram
   pod restarts  →  SAME pod, containers restarted, IP KEPT
   pod deleted   →  GONE. A new pod: new name, NEW IP, empty filesystem
```

Three rules follow:

- **Never store data in a container's filesystem.** It is wiped on restart. Use
  a PersistentVolume for anything that must survive.
- **Never rely on a pod's IP.** Use a Service.
- **Handle SIGTERM.** Kubernetes sends it, waits
  `terminationGracePeriodSeconds` (30 by default), then SIGKILLs. An app that
  ignores it loses in-flight requests on every deploy.

:::danger `emptyDir` is not persistent storage
`emptyDir` is often mistaken for a disk. It is created when the pod starts and
**deleted when the pod is removed**. Fine for sharing files between containers
in the same pod; useless for data you care about.

For real storage you need a PersistentVolumeClaim:

```yaml
volumes:
  - name: data
    persistentVolumeClaim:
      claimName: my-data
```
:::

## Common problems

| Symptom | Cause | Fix |
|:---|:---|:---|
| Stuck at `Init:0/1` | Init container waiting or failing | `kubectl logs <pod> -c <init-name>` |
| `0/2 READY` but Running | One container's readiness probe failing | `kubectl describe pod` |
| One container restarts, others do not | Only that container is failing | `kubectl logs <pod> -c <name> --previous` |
| "container name must be specified" | Multi-container pod | Add `-c <name>` |
| Both containers want port 8080 | They share one network namespace | Change one of them |
| Data gone after restart | `emptyDir` or the container filesystem | Use a PVC |

## When a second container is justified

| Pattern | Example | Is it right? |
|:---|:---|:---|
| **Sidecar** | Log shipper, service-mesh proxy | Yes — needs the same net/fs |
| **Init** | Wait for a dependency, run a migration | Yes |
| **Adapter** | Reformat the app's metrics for a scraper | Yes |
| Two unrelated services | An API and a worker | **No** — separate Deployments |

The test: **would you ever want to scale them separately?** If yes, they belong
in different pods. A pod scales as one unit; bundling an API with a worker means
you can never have 10 of one and 2 of the other.

## Key takeaways

- A pod is **one or more containers sharing an IP and volumes**, always on one
  node.
- They talk over **`localhost`** and cannot reuse the same port.
- **Init containers run to completion first** — the right tool for ordering.
- Pods are **disposable**: new pod means new IP and empty filesystem.
- **`emptyDir` dies with the pod.** Use a PVC for real data.
- With multiple containers, `logs` and `exec` need **`-c <name>`**.
- Second container only if it must share the pod's network or filesystem.
