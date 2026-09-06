---
title: Pod in CrashLoopBackOff
slug: pod-crashloopbackoff
type: troubleshooting
domain: 03-kubernetes
tags: [kubernetes, troubleshooting, pods, debugging]
level: 2
status: stable
prerequisites: [container-isolation, linux-processes]
related: [kubernetes-services, linux-performance-triage]
updated: 2026-09-05
---

# Pod in CrashLoopBackOff

> CrashLoopBackOff is not an error — it is Kubernetes telling you it has given up restarting something as fast as it used to.

## ① Symptom

```
NAME                     READY   STATUS             RESTARTS   AGE
api-7d9f8c6b4-x2klm      0/1     CrashLoopBackOff   6          8m
```

The container starts, exits, and kubelet restarts it — with an exponential
delay: 10s, 20s, 40s, 80s, 160s, capped at **5 minutes**.

:::key
**`CrashLoopBackOff` describes the restart *policy*, not the failure.** It tells
you nothing about *why* the container exited. The status is the symptom; the exit
code and the previous container's logs are the evidence.

The single most common mistake is reading the status and guessing, instead of
spending ten seconds getting the exit code.
:::

## ② What Could Cause It?

| # | Cause | Likelihood | Cost to check |
|:--|:---|:---|:---|
| 1 | App exits immediately (bad config, missing env var) | High | Seconds |
| 2 | Missing ConfigMap / Secret / volume | High | Seconds |
| 3 | OOMKilled — memory limit too low | High | Seconds |
| 4 | Liveness probe killing a healthy-but-slow app | Medium | Seconds |
| 5 | Wrong command/entrypoint; container exits 0 | Medium | Seconds |
| 6 | Dependency not reachable at startup | Medium | Minutes |
| 7 | Architecture mismatch (arm64 image on amd64) | Low | Seconds |

## ③ Decision Path

```diagram
              CrashLoopBackOff
                     │
                     ▼
        kubectl describe pod  → Last State: exit code?
                     │
   ┌─────────┬───────┴────────┬──────────────┐
   ▼         ▼                ▼              ▼
exit 137   exit 0        exit 1 / 2      exit 139
   │         │                │              │
OOMKilled?  app ran and    application    SIGSEGV —
   │        exited fine    error → LOGS   binary/arch
   │        → wrong cmd         │          mismatch
   ▼         │                  ▼
memory     ④              kubectl logs --previous
limit ⑤                          │
   │                             ▼
   └──────── or a LIVENESS PROBE killed it ⑥
```

## ④ First Check — the exit code and the reason

```sh
# The single highest-value command. Read the "Last State" block:
#   Reason (Error / OOMKilled / Completed) and Exit Code.
# Then read the Events at the bottom — they name missing ConfigMaps,
# image pull failures and probe failures outright.
kubectl describe pod <pod>
```

**What to look for:**

| Exit code | Meaning | Go to |
|:---|:---|:---|
| `0` | Exited **successfully** — the command finished | ⑦ (wrong command) |
| `1` / `2` | Application error | ⑤ (logs) |
| `137` | 128+9, SIGKILL — usually the OOM killer | ⑥ (memory) |
| `139` | 128+11, SIGSEGV — segfault, often wrong architecture | Check image arch |
| `143` | 128+15, SIGTERM — something asked it to stop | ⑥ (liveness probe) |

## ⑤ Second Check — the previous container's logs

```sh
# --previous is essential. Without it you get the CURRENT container, which
# has just started and has produced nothing. This is why people say
# "there are no logs" when the logs exist.
kubectl logs <pod> --previous

# Multi-container Pod: name the one that is crashing.
kubectl logs <pod> -c <container> --previous
```

**What to look for:** the last few lines before exit. Config parse errors,
"connection refused" to a dependency, missing environment variable, permission
denied on a mounted path.

## ⑥ Third Check — was it killed rather than crashed?

Two very different killers produce a crash loop, and both are invisible in the
application's own logs — because the application did not fail.

**OOMKilled (exit 137):**

```sh
# Reason: OOMKilled in the Last State block is definitive.
kubectl describe pod <pod> | grep -A3 'Last State'

# What limit was it actually given?
kubectl get pod <pod> -o jsonpath='{.spec.containers[*].resources}{"\n"}'
```

:::failure
**A memory metric showing headroom does not exonerate the limit.** Metrics are
scraped every 15–60s; the allocation spike that triggered the kill lasted
milliseconds. `describe` reports the **kernel's** account, which is authoritative.

The common self-inflicted version: a JVM or Node runtime sizing its heap from the
*host's* memory rather than the cgroup limit. See [[container-isolation]].
:::

**Liveness probe (exit 143, and restarts with no application error):**

```sh
# Events will say: "Liveness probe failed: ..."
kubectl describe pod <pod> | grep -i 'liveness\|probe'
```

:::trap
**The liveness-probe death spiral — the crash loop where nothing is broken.**

A slow-starting application does not answer `/healthz` within
`initialDelaySeconds`. The liveness probe fails, kubelet kills it, it restarts,
and it is slow to start again. Forever.

Worse under load: the app is merely *saturated*, the probe times out, and
Kubernetes restarts it — removing capacity from an already-overloaded service and
guaranteeing the next instance is saturated too. **A liveness probe turns a
slowdown into an outage.**

Fixes: use `startupProbe` for slow starts (it suspends liveness until the app is
up), set generous liveness timeouts, and make the liveness endpoint check only
*liveness* — never dependencies. A liveness check that pings the database
restarts your app every time the database hiccups.
:::

## ⑦ Fourth Check — did it just finish?

Exit code `0` means the process ran and exited cleanly. Kubernetes restarts it
because `restartPolicy: Always` is the default for Deployments.

Nearly always one of:

- The image's entrypoint runs a one-shot command (a migration, a script).
- `command`/`args` in the manifest override the image's entrypoint incorrectly.
- The main process daemonises into the background, so PID 1 exits immediately.

```sh
# What is the container actually being told to run?
kubectl get pod <pod> -o jsonpath='{.spec.containers[0].command} {.spec.containers[0].args}{"\n"}'
```

If the work genuinely is one-shot, it belongs in a `Job`, not a `Deployment`.

## ⑧ Deeper Check — when the container dies too fast to inspect

```sh
# Copy the Pod with the entrypoint replaced by a shell. The copy does NOT
# crash, so you can inspect the mounted config, env vars and filesystem
# that the real container sees.
kubectl debug <pod> -it --copy-to=debug-pod --container=<name> -- sh

# Distroless image with no shell? Attach a debug container that shares the
# target's namespaces and bring your own tools.
kubectl debug -it <pod> --image=nicolaka/netshoot --target=<container>

# Are the referenced ConfigMaps and Secrets actually present?
# A missing one keeps the Pod out of Running entirely — check Events.
kubectl get configmap,secret
```

## ⑨ Root Cause and Fix

State the mechanism, not the status:

| Weak | Actionable |
|:---|:---|
| "The pod was crash looping" | "The container exited 137: the JVM sized a 2GB heap from host memory against a 512Mi limit, so the kernel OOM-killed it on first load" |
| "The probe was failing" | "Startup took 40s; `initialDelaySeconds` was 10, so liveness killed it before it ever served" |

## ⑩ Prevention

- Set a **`startupProbe`** on anything slow to start; it removes the entire class
  of failure in ⑥.
- Liveness endpoints check **only the process**, never dependencies.
- Set memory `requests` **equal to** `limits` for JVM-style runtimes, and tell
  the runtime the limit explicitly.
- Fail fast and loudly at startup on missing config — an explicit "MISSING
  DATABASE_URL" beats a stack trace.
- Use a `Job` for one-shot work.

## ★ Key Takeaway

:::cloud
**1.** `CrashLoopBackOff` is a restart policy, not a diagnosis. Get the **exit
code** first.
**2.** `kubectl logs --previous` — without it you are reading an empty container.
**3.** 137 = OOMKilled. 143 = something asked it to stop (usually a probe). 0 =
it finished; you have the wrong command.
**4.** A liveness probe turns a slowdown into an outage. Use `startupProbe`, and
never check dependencies in a liveness endpoint.
**5.** `kubectl debug --copy-to` inspects a Pod that dies too fast to exec into.
:::

---

**Version note:** the backoff schedule (10s doubling to a 5-minute cap) and exit
code semantics are stable. `kubectl debug` requires 1.20+ (`--profile` options
came later). `startupProbe` has been GA since 1.20.
