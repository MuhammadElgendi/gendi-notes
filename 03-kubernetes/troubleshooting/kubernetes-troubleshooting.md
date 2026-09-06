---
title: Kubernetes Troubleshooting
slug: kubernetes-troubleshooting
type: troubleshooting
domain: 03-kubernetes
tags: [kubernetes, troubleshooting, debugging]
keywords: [crashloopbackoff, imagepullbackoff, pending, oomkilled, evicted, describe, logs, events, exit code]
level: 2
status: stable
prerequisites: [kubernetes-basics]
related: [kubernetes-services, kubectl-commands]
updated: 2026-09-06
---

# Kubernetes Troubleshooting

> Three commands solve most problems: `describe` tells you what Kubernetes thinks, `logs` tells you what the app said, `get endpoints` tells you why traffic is not arriving.

## Start here, every time

Whatever the symptom, this order wastes the least time:

```diagram
   something is wrong
        │
        ▼
   ① kubectl get pods            what state is it in?
        │
        ▼
   ② kubectl describe pod <p>    read the EVENTS at the bottom.
        │                        They usually name the problem outright.
        ▼
   ③ kubectl logs <p> --previous what did the app say before it died?
        │
        ▼
   ④ kubectl get endpoints <svc> is traffic even reaching it?
```

```sh title="The four commands"
kubectl get pods -o wide
kubectl describe pod <pod>        # scroll to Events
kubectl logs <pod> --previous     # --previous = the crashed container
kubectl get endpoints <service>
```

:::key `--previous` is not optional for crashes
`kubectl logs <pod>` shows the **current** container — which just started and
has printed nothing. That is why people say "there are no logs".

The logs you want belong to the container that **died**:
`kubectl logs <pod> --previous`.
:::

## Diagnose by pod status

| Status | Meaning | Go to |
|:---|:---|:---|
| `Pending` | Not placed on a node yet | [Pending](#pending) |
| `ImagePullBackOff` | Cannot download the image | [ImagePullBackOff](#imagepullbackoff) |
| `CrashLoopBackOff` | Starts, exits, repeats | [CrashLoopBackOff](#crashloopbackoff) |
| `OOMKilled` | Exceeded its memory limit | [OOMKilled](#oomkilled) |
| `Running` but broken | Usually networking or config | [Running but not working](#running-but-not-working) |
| `Terminating` forever | Stuck finalizer or ignored SIGTERM | [Stuck terminating](#stuck-terminating) |
| `Evicted` | The node ran out of resources | [Evicted](#evicted) |

---

## Pending

The scheduler could not find a home for it. The Events say why.

```sh
kubectl describe pod <pod> | tail -20
```

| Event message | Cause | Fix |
|:---|:---|:---|
| `Insufficient cpu` / `Insufficient memory` | No node has room for the **requests** | Lower requests, or add nodes |
| `node(s) had untolerated taint` | Nodes are reserved | Add a matching `toleration` |
| `pod has unbound immediate PersistentVolumeClaims` | No storage available | `kubectl get pvc` |
| `didn't match Pod's node affinity` | Affinity rules exclude every node | Relax the affinity |
| No events at all | No scheduler running, or the cluster is very unwell | `kubectl get nodes` |

:::warn Requests are what the scheduler reads, not actual usage
A pod requesting `4Gi` will not schedule on a node with `2Gi` free — even if the
app only ever uses `200Mi`. The scheduler reserves based on what you *asked
for*, not what you use.

Oversized requests are the most common cause of `Pending` on a cluster that
looks half empty. Check what you actually consume, then request close to that.
:::

---

## ImagePullBackOff

```sh
kubectl describe pod <pod> | grep -A5 Events
```

| Message | Cause |
|:---|:---|
| `manifest unknown` / `not found` | The tag does not exist. Check for typos |
| `unauthorized` / `authentication required` | Private registry, no credentials |
| `no such host` | The node cannot reach the registry (DNS or firewall) |
| `toomanyrequests` | Docker Hub rate limit — authenticate or mirror |

For a private registry, create a pull secret and reference it:

```sh
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=USER --docker-password=PASS
```

```yaml
spec:
  imagePullSecrets:
    - name: regcred
```

---

## CrashLoopBackOff

This is not an error type. It means "the container keeps exiting, so I am
restarting it more slowly each time" — the delay grows 10s, 20s, 40s… capped at
5 minutes. It tells you nothing about the cause.

**The exit code does.**

```sh
kubectl describe pod <pod> | grep -A6 "Last State"
```

| Exit code | Meaning | Where to look |
|:---|:---|:---|
| `0` | Exited **successfully** — the command finished | Wrong `command`; use a Job for one-shot work |
| `1` / `2` | Application error | `kubectl logs --previous` |
| `137` | 128+9 = SIGKILL — usually OOM | Memory limit |
| `139` | 128+11 = segfault | Often a wrong-architecture image (arm64 vs amd64) |
| `143` | 128+15 = SIGTERM | Something asked it to stop — often a liveness probe |

Then the usual suspects:

```sh
kubectl logs <pod> --previous          # config errors, missing env vars, stack traces
kubectl describe pod <pod> | grep -i probe    # is a probe killing it?
kubectl get configmap,secret           # does everything it references exist?
```

:::danger Exit 143 with no application error = the liveness probe
The app is fine. Kubernetes is killing it because the liveness probe failed —
often because `initialDelaySeconds` is shorter than the app's startup time.

The app starts, takes 30 seconds to be ready, the probe checks at 10 seconds,
fails, and the container is restarted before it ever serves a request. Forever.

Use a **startupProbe** for slow starters; it holds liveness off until the app is
up, instead of you having to weaken liveness permanently.
:::

### Debugging a container that dies too fast to exec into

```sh
# Copy the pod with the entrypoint replaced by a shell. The copy does NOT
# crash, so you can inspect the config, env vars and mounts it really sees.
kubectl debug <pod> -it --copy-to=debug --container=<name> -- sh

# Distroless image with no shell? Attach a container that shares its namespaces.
kubectl debug -it <pod> --image=busybox --target=<container>
```

---

## OOMKilled

```sh
kubectl describe pod <pod> | grep -i -A3 "last state"
kubectl get pod <pod> -o jsonpath='{.spec.containers[*].resources}{"\n"}'
```

Either the limit is too low, or the app leaks. Two frequent traps:

- **A runtime sizing itself from the host.** Older JVMs and some Node
  configurations read the *machine's* total memory and size their heap to it,
  then get killed for exceeding a much smaller container limit. Modern JVMs are
  container-aware; older ones need `-XX:MaxRAMPercentage` set explicitly.
- **A monitoring graph showing headroom.** Metrics are sampled every 15–60
  seconds; the spike that triggered the kill lasted milliseconds.
  `kubectl describe` reports the **kernel's** account, which is authoritative.

---

## Running but not working

The pod is up. Traffic does not arrive, or the app misbehaves.

```sh
# 1. Does the Service have backends? This is the answer most of the time.
kubectl get endpoints <service>

# 2. Is the pod actually Ready? 0/1 means the readiness probe is failing,
#    so the Service is correctly refusing to route to it.
kubectl get pods

# 3. Bypass the Service — talk straight to a pod IP.
#    If this works, your problem is the Service or DNS, not the app.
kubectl get pod <pod> -o wide     # note the IP
kubectl run tmp --rm -it --image=busybox --restart=Never -- \
  wget -qO- --timeout=3 http://<pod-ip>:8080/healthz

# 4. Is DNS working inside the cluster?
kubectl run tmp --rm -it --image=busybox --restart=Never -- nslookup <service>

# 5. Is a NetworkPolicy blocking it? Policies apply to the DESTINATION.
kubectl get networkpolicy -A
```

---

## Stuck terminating

```sh
kubectl get pod <pod> -o yaml | grep -A5 finalizers
```

Two causes:

- **The app ignores SIGTERM**, so it waits out
  `terminationGracePeriodSeconds` (default 30) and is then killed. The tell is
  that termination always takes exactly the same number of seconds.
- **A finalizer** is waiting on something that will never complete — a volume
  detach, an external controller that has been removed.

```sh
kubectl delete pod <pod> --grace-period=0 --force   # last resort
```

:::warn `--force` does not clean up
It removes the object from the API without waiting for the node to confirm the
container is gone. With a StatefulSet or an attached volume this can leave two
copies believing they own the same storage.

Use it on stateless pods. For anything with state, find out what the finalizer
is waiting for.
:::

---

## Evicted

The node ran out of memory or disk and kubelet started removing pods.

```sh
kubectl get events -A --sort-by=.lastTimestamp | grep -i evict
kubectl describe node <node> | grep -A5 Conditions
```

Look for `DiskPressure` or `MemoryPressure`. Pods with **no resource requests**
are evicted first — that alone is a good reason to always set them.

---

## Cluster-wide checks

```sh
kubectl get nodes                 # all Ready?
kubectl describe node <node> | grep -A10 "Allocated resources"
kubectl top nodes                 # actual usage (needs metrics-server)
kubectl top pods -A --sort-by=memory

# Events across the whole cluster, newest last. Often shows the real story.
kubectl get events -A --sort-by=.lastTimestamp | tail -30

# Is the control plane healthy?
kubectl get pods -n kube-system
```

`kubectl get events -A --sort-by=.lastTimestamp` is underused. When several
things break at once it usually reveals the single underlying cause.

## Key takeaways

- **`describe` → `logs --previous` → `get endpoints`.** In that order.
- **The Events section of `describe`** names the problem most of the time.
- `CrashLoopBackOff` is a restart *policy*, not a cause. **Get the exit code.**
- **137 = OOM. 143 = something asked it to stop (usually a probe). 0 = it
  finished; wrong command.**
- `Pending` is almost always **requests too large**, not a full cluster.
- `<none>` endpoints = selector mismatch or pods not Ready.
- **`kubectl debug --copy-to`** inspects a pod that dies too fast to exec into.
