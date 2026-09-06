---
title: What a Container Actually Is
slug: container-isolation
type: concept
domain: 02-containers
tags: [docker, containers, linux, namespaces, cgroups]
level: 3
status: stable
prerequisites: [linux-network-namespaces]
related: [kubernetes-networking, high-latency-normal-cpu]
updated: 2026-09-05
---

# What a Container Actually Is

> There is no such thing as a container — there is a process, wearing namespaces for privacy and cgroups for restraint.

## ① What is it?

A container is an ordinary Linux process. `ps` on the host shows it. `kill`
stops it. What makes it feel like a machine is a combination of three
independent kernel features:

| Feature | Provides | Answers |
|:---|:---|:---|
| **Namespaces** | Isolation of *what it can see* | "What exists?" |
| **cgroups** | Limits on *what it can use* | "How much?" |
| **Union filesystem** | A composed root filesystem | "What is on disk?" |

Nothing else is required. There is no container object in the kernel.

## ② Why does it exist?

VMs isolate by emulating hardware and running a second kernel — strong isolation,
but seconds to boot and hundreds of MB of overhead. Most of the time the goal is
not "pretend to be a computer" but "stop these processes seeing each other".

Namespaces and cgroups give that at process cost: milliseconds to start, no
second kernel.

```diagram
   VM                              CONTAINER
   ┌──────────────┐                ┌──────────────┐
   │ app          │                │ app          │
   │ guest libs   │                │ libs (image) │
   │ GUEST KERNEL │  ◀── the cost  └──────┬───────┘
   ├──────────────┤                       │ syscalls
   │ hypervisor   │                ┌──────▼───────┐
   ├──────────────┤                │ HOST KERNEL  │ ◀── shared. this is
   │ host kernel  │                └──────────────┘     the whole trade-off
   └──────────────┘
```

## ③ Mental Model

:::mental
Namespaces are **one-way mirrors**: the process sees only its own room and
believes that is the whole building. cgroups are the **electricity meter**: it
can use the room however it likes, up to a quota.

**Where it breaks down:** everyone shares one building's foundation — the host
kernel. A kernel vulnerability, or a kernel-wide resource like the conntrack
table, is shared by every room. This is precisely why containers are an
isolation boundary but not a *security* boundary in the way a VM is.
:::

## ④ The Namespaces

| Namespace | Isolates | Consequence |
|:---|:---|:---|
| `pid` | Process IDs | Your app is PID 1 — see ⑥ |
| `net` | Interfaces, routes, ports | Own IP; see [[linux-network-namespaces]] |
| `mnt` | Mount points | Own filesystem view |
| `uts` | Hostname | `hostname` returns the container's |
| `ipc` | Shared memory, semaphores | No accidental IPC crosstalk |
| `user` | UID/GID mapping | Root inside ≠ root outside — the big one |
| `cgroup` | cgroup root | Hides the host's cgroup layout |

```sh
# A container is a process. Prove it — find it on the host and read its
# namespace links. Two containers sharing a namespace show the same inode.
docker run -d --name demo nginx
PID=$(docker inspect -f '{{.State.Pid}}' demo)
sudo ls -l /proc/$PID/ns/
```

## ⑤ cgroups — where production actually bites

Namespaces answer "what can I see". cgroups answer "how much can I take", and
that is where the operational pain lives.

:::failure
**Memory limits kill; CPU limits throttle. Confusing the two costs hours.**

A container exceeding its **memory** limit is killed by the kernel OOM killer —
instantly, with no chance to clean up. `kubectl describe pod` shows
`OOMKilled` and exit code 137.

A container exceeding its **CPU** limit is *not* killed. It is frozen for the
remainder of the 100ms CFS window. The result is latency, not death — and,
critically, **CPU utilisation appears LOW** because the frozen time is not
counted as usage. See [[high-latency-normal-cpu]].

The most common self-inflicted version: a JVM or Node process reading the
*host's* memory and sizing its heap accordingly, then being OOM-killed for
exceeding a much smaller container limit. Modern JVMs are container-aware
(`UseContainerSupport`, on by default since JDK 10); older ones and many runtimes
still are not.
:::

```sh
# cgroup v2, from inside the container. "max" means unlimited.
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/cpu.max          # "<quota> <period>", e.g. "100000 100000"

# The truth about throttling. nr_throttled climbing = you are paying
# latency that no CPU chart will show you.
cat /sys/fs/cgroup/cpu.stat
```

## ⑥ PID 1 — the surprise that breaks signal handling

Inside a PID namespace your application is PID 1, and the kernel treats PID 1
specially: **default signal handlers do not apply to it.**

```diagram
  docker stop
      │
      ▼
  SIGTERM ──▶ PID 1
                │
        ┌───────┴────────┐
        │                │
  handles SIGTERM   no handler installed
        │                │
  graceful exit ✓   SIGNAL IGNORED ✗
                         │
                    10s later: SIGKILL
                    → connections cut, work lost
```

Two further consequences: PID 1 must reap orphaned children or they accumulate
as zombies, and a shell-form `CMD` (`CMD npm start`) makes `/bin/sh` PID 1,
which does not forward signals to your application at all.

**Fixes:** use exec-form `CMD ["node", "server.js"]`, install a real signal
handler, or run a minimal init (`docker run --init`, or Tini) as PID 1.

## ⑦ Failure Modes

| What breaks | Signature | Cause |
|:---|:---|:---|
| `OOMKilled`, exit 137 | Sudden death, no logs | Memory limit exceeded |
| Latency, low CPU | p99 spikes, dashboards look fine | CFS throttling |
| Slow, ungraceful shutdown | Always exactly 10s to stop | PID 1 ignoring SIGTERM |
| Zombie processes | PID count grows steadily | PID 1 not reaping |
| Full disk on the host | Unrelated containers fail | Unbounded logs / image layers |
| Container root = host root | Escape via a mounted host path | No user namespace |

## ⑧ Senior Engineer Notes

**"Containers are not a security boundary" is a specific claim, not a slogan.**
Every container shares one kernel, so the attack surface is the entire syscall
interface. A kernel privilege-escalation bug is a container escape. Defence is
layered — seccomp to restrict syscalls, dropped capabilities, read-only root,
non-root user, user namespaces to map container-root to an unprivileged host
UID. For genuinely untrusted, multi-tenant workloads, the honest answer is a
stronger boundary: gVisor, Kata Containers, Firecracker.

**`--privileged` removes essentially all of it** — capabilities, device
restrictions, seccomp. Treat it as "run as root on the host", because that is
close to what it means.

**Images are layers, and layers are forever.** A secret added in one layer and
deleted in the next is still in the image; anyone can extract it. Use multi-stage
builds and build-time secret mounts, and never `COPY` a credential.

## ⑨ Interview Traps

:::trap
**"What is the difference between a container and a VM?"**

The weak answer is "containers are lighter". That is a consequence, not a
difference.

The difference: **a VM virtualises hardware and runs its own kernel; a container
is a host process with a restricted view of the host's kernel.** Everything
else — startup time, image size, density, and the weaker isolation — follows
from that one fact.

Then close the loop: this is why a container cannot run a different kernel
version, why Linux containers need a Linux kernel underneath even on macOS or
Windows, and why kernel-level resource exhaustion crosses container boundaries.
:::

:::trap
**"Your container is killed with exit code 137 but your monitoring shows memory
well under the limit. Explain."**

The trap is trusting a scraped average. Real causes:

- The memory metric is sampled every 15–60s; the spike that killed it lasted
  200ms and was never scraped.
- Page cache from heavy file I/O counts toward the cgroup limit in v1.
- A **child process** blew the limit; the cgroup accounts for the whole tree
  while your metric watched only the main process.
- The limit was hit by a `kubectl exec` debug session sharing the cgroup.

`kubectl describe pod` and `dmesg` on the node give the kernel's account, which
is authoritative in a way that a scraped gauge is not.
:::

## ★ Key Takeaway

:::cloud
**1.** A container is a **process**: namespaces (what it sees) + cgroups (what it
uses) + a layered filesystem.
**2.** Memory limits **kill**; CPU limits **throttle**. Completely different
symptoms, completely different fixes.
**3.** Your app is PID 1 — no default signal handlers, and it must reap children.
Use exec-form `CMD` or an init.
**4.** One shared kernel: an isolation boundary, not a security boundary.
**5.** Anything ever in an image layer is still in the image.
:::

---

**Version note:** paths shown are cgroup **v2**, the default on current
distributions (`/sys/fs/cgroup/cpu.max`); cgroup v1 uses
`/sys/fs/cgroup/cpu/cpu.cfs_quota_us` and accounts page cache differently.
JVM container awareness is on by default since JDK 10.
