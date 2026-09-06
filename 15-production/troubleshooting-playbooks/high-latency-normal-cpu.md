---
title: High Latency with Normal CPU
slug: high-latency-normal-cpu
type: runbook
domain: 15-production
tags: [troubleshooting, performance, latency, production]
level: 4
status: stable
prerequisites: [tcp-handshake, dns-resolution]
related: [kubernetes-dns, cache-stampede, linux-performance-triage]
updated: 2026-09-05
---

# High Latency with Normal CPU

> Normal CPU with high latency means the system is not computing — it is waiting. Your entire job is to find the queue.

## ① Symptom

p99 latency has risen sharply. CPU utilisation on the dashboard looks entirely
normal — often *lower* than usual. Nothing was deployed. The service is not
erroring, just slow.

## ② The Principle That Organises Everything

Latency is time spent in only two ways:

```diagram
   TOTAL LATENCY  =  time COMPUTING  +  time WAITING
                          │                  │
                    shows as CPU       shows as NOTHING
                                       on a CPU dashboard
```

Normal CPU therefore eliminates half the search space in one step. Every
remaining candidate is a **queue** or a **lock**. The rest of this playbook is
an ordered list of the places a queue can hide.

:::mental
A supermarket where every cashier is idle but the queue is out the door. Staring
at cashier utilisation will never explain it — the constraint is somewhere else
entirely (one blocked aisle, one price-check, one card reader). Find the thing
everyone is waiting *on*, not the thing that is busy.
:::

## ③ The Decision Path

Ordered by likelihood ÷ cost. Do not skip ahead — each step eliminates a whole
class of cause.

```diagram
                 p99 up, CPU normal
                         │
        ┌────────────────┴─────────────────┐
        │                                  │
  Is p50 also up?                    Only p99 up?
        │                                  │
   EVERY request is slow            SOME requests are slow
   → a shared dependency            → contention, GC, or an
     got slower                       unlucky subset
        │                                  │
        ▼                                  ▼
  ④ downstream / DNS / pool         ⑦ GC, locks, throttling,
     saturation                        cache misses, hot keys
```

The p50-versus-p99 split is the highest-value single question you can ask, and
most engineers skip it. It halves the search space before you run a command.

## ④ First Check — is the time actually yours?

```sh
# Are we slow, or is something we call slow? If your traces already break out
# client-side vs server-side duration, this is a five-second answer.
# Without tracing, compare your own histogram to your dependency's.
```

**What to look for:** if your service's *self time* is flat and total time is
up, stop investigating your service. You are the messenger.

**Rules out:** everything internal to your process.

## ⑤ Second Check — connection pools

The most common cause, and nearly invisible without the right metric.

```diagram
  pool size 10, each query now 50ms instead of 5ms
        │
        ▼
  throughput per connection drops 10×
        │
        ▼
  requests queue WAITING FOR A CONNECTION  ◀── this wait is your latency
        │
        ▼
  CPU is idle. The database is fine. Everything "looks healthy".
```

**What to look for:** `pool.wait_time` or `pool.pending` climbing while
`pool.active` sits pinned at max. If your pool exposes no such metric, that gap
is itself the finding — instrument it today, because you will need it again.

:::senior
**This is Little's Law doing its work:** `L = λW`. If service time `W` rises,
the number in the system `L` rises for the same arrival rate `λ`. Once `L`
exceeds the pool size, every additional request waits.

The trap is that a *small* upstream regression — a database going from 5ms to
50ms, which nobody would page on — produces a *large* latency increase in your
service, because the queue amplifies it. The magnitude of your symptom does not
match the magnitude of the cause, which is exactly why people look past it.
:::

## ⑥ Third Check — the accept queue

Your process may be too slow to *accept* connections, which manifests entirely
outside your application metrics.

```sh
# Recv-Q on a LISTENING socket = connections completed but not yet accepted.
# Approaching Send-Q (the backlog) means you are about to drop them.
ss -lnt

# The definitive counter. If this climbs, your accept loop is not keeping up.
nstat -az TcpExtListenOverflows TcpExtListenDrops
```

**What to look for:** any non-zero, *increasing* `ListenOverflows`. See
[[tcp-handshake]] for why the client believes it is connected while the server
has already dropped it.

## ⑦ Fourth Check — CPU throttling (the Kubernetes special)

:::failure
**The single most misleading metric in a container platform: a throttled
container reports LOW CPU usage.**

CFS quota is enforced in 100ms windows. A container with `limits.cpu: "1"` that
burns its quota in the first 20ms is **frozen for the remaining 80ms**. Averaged
over a minute, utilisation reads ~20% — a dashboard showing an idle service.

Meanwhile every request that landed in the frozen window took an extra 80ms.

```sh
# The only metric that tells the truth here. Any sustained non-zero rate
# means requests are paying a latency tax that CPU utilisation will never show.
# (Prometheus)
#   rate(container_cpu_cfs_throttled_seconds_total[5m]) > 0
#
# From inside the container:
cat /sys/fs/cgroup/cpu.stat        # cgroup v2: nr_throttled, throttled_usec
```

The counter-intuitive fix is often to **raise or remove the CPU limit** while
keeping the request. Requests guarantee a floor; limits impose a ceiling that
converts a brief burst into a latency spike. Multi-threaded runtimes are hit
hardest, because they consume quota N× faster than wall-clock suggests.
:::

## ⑧ Fifth Check — garbage collection and locks

**GC:** stop-the-world pauses are pure waiting. A minute-averaged CPU chart
hides a 400ms pause completely. Look at pause-time percentiles, not GC CPU.

**Locks:** contention appears as high latency, normal CPU, and threads in
`futex`/`park`. Sample the stacks rather than guessing:

```sh
# What is the process actually doing? If threads sit in futex or epoll_wait
# rather than running, you are contended or blocked, not compute-bound.
sudo timeout 10 strace -c -f -p <pid>

# Where is the time going, on-CPU and off-CPU?
sudo perf top -p <pid>
```

## ⑨ Sixth Check — the ones people forget

| Candidate | Why it hides | How to confirm |
|:---|:---|:---|
| **DNS resolution** | Happens before the trace span starts | Compare short name vs FQDN timing — [[kubernetes-dns]] |
| **Cache stampede** | Cache looks "healthy", hit rate quietly collapsed | Hit-rate dip aligned to the latency spike — [[cache-stampede]] |
| **Disk I/O wait** | Iowait is not user CPU | `iostat -x 1` — look at `%util` and `await` |
| **conntrack full** | Kernel drops, no application log at all | `dmesg \| grep conntrack` |
| **Noisy neighbour** | Your metrics are all normal, because it is not you | Node-level CPU steal / pressure stall |
| **Retry storm** | Load rises *because* of the latency, not before it | Request rate rising with no traffic increase |

:::senior
**Retry storms invert cause and effect, which is why they fool experienced
people.** A small latency increase triggers client timeouts; clients retry;
retries multiply load; load increases latency. By the time you look, the traffic
graph is climbing and the obvious reading is "traffic spike caused the latency".

The tell: **request rate rose but unique-user or upstream rate did not.** You are
serving the same work several times. No amount of scaling fixes this — the fix
is a retry budget, jittered backoff, and a circuit breaker.
:::

## ⑩ Root Cause and Fix

State the mechanism, not the label. Compare:

| Label (useless) | Mechanism (actionable) |
|:---|:---|
| "The database was slow" | "Query time rose 5ms→50ms, exhausting a 10-connection pool, so requests queued 200ms for a connection" |
| "CPU throttling" | "The 1-core limit was consumed in 20ms of each 100ms window, freezing the container for the remainder" |

## ⑪ Prevention

- Instrument **queue depth and wait time**, not just utilisation. Utilisation
  cannot show saturation; that is the whole lesson of this playbook.
- Alert on **p99 and on throttling rate**, never on CPU alone.
- Give every outbound call a **timeout, a retry budget, and a circuit breaker**.
- Size pools deliberately and revisit them when dependency latency changes.
- Prefer CPU **requests** over hard limits for latency-sensitive services.

## ★ Key Takeaway

:::cloud
**1.** Normal CPU + high latency = **waiting, not computing**. Find the queue.
**2.** Ask "is p50 up too?" before running anything. It halves the search space.
**3.** Connection-pool exhaustion amplifies small upstream regressions into large
user-visible ones. Little's Law, doing its work.
**4.** In Kubernetes, a throttled container reports *low* CPU. Check
`container_cpu_cfs_throttled_seconds_total` before believing any CPU chart.
**5.** Utilisation cannot reveal saturation. Instrument the queue.
:::
