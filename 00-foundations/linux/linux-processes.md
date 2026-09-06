---
title: Linux Processes and Signals
slug: linux-processes
type: concept
domain: 00-foundations
tags: [linux, processes, signals, scheduling]
level: 2
status: stable
prerequisites: []
related: [container-isolation, linux-performance-triage]
updated: 2026-09-05
---

# Linux Processes and Signals

> Every process on Linux is a copy of another process — there is exactly one exception, and it is PID 1.

## ① What is it?

A process is a running program plus its context: memory map, open file
descriptors, credentials, and its place in a tree. Every process except `init`
has a parent, and that parent relationship governs cleanup, signals and exit
status.

## ② Why fork/exec is two calls, not one

Creating a process and running a program are **separate operations**, and this
design is why Unix shells are simple.

```diagram
   fork()  ──▶ an identical copy of the caller (child)
                     │
                     │  ← the child is still the same program here.
                     │    This gap is where the shell does its work:
                     │    redirect stdout, close FDs, drop privileges,
                     │    set the cgroup, enter a namespace.
                     ▼
   exec()  ──▶ replace the program image, keep the PID and the setup
```

Because the child can be adjusted *between* the two calls, every kind of
process setup — shell redirection, container construction — uses the same
mechanism instead of needing a special API.

:::mental
`fork()` is photocopying yourself; `exec()` is the copy changing clothes. It is
still the same person (same PID), doing a different job. Everything arranged in
between — which doors are open, which room you stand in — carries over.
:::

## ③ Process states

`ps` shows a state letter. Two of them explain most production confusion.

| State | Means | Note |
|:---|:---|:---|
| `R` | Running or runnable | Counts toward load average |
| `S` | Interruptible sleep | Waiting on I/O or an event; normal and healthy |
| **`D`** | **Uninterruptible sleep** | Waiting on the kernel, usually disk. **Cannot be killed** |
| `Z` | Zombie — exited, not reaped | Holds only a PID entry, no memory |
| `T` | Stopped | `SIGSTOP`, or under a debugger |

:::failure
**`D` state is why `kill -9` sometimes does nothing.**

A process in uninterruptible sleep is inside a kernel call that cannot be
safely interrupted — typically a blocking read against a device. Signals are
delivered on the *return path* to userspace, and the process never gets there.

`kill -9 <pid>` appears to be ignored. The process is not stuck by choice; it is
waiting on the kernel. The usual real cause is a hung network filesystem (NFS) or
a failing disk. Fix the storage; the process exits on its own.

Many `D`-state processes also inflate the load average without using any CPU —
the classic "load 80, CPU idle" picture from [[linux-performance-triage]].
:::

## ④ Orphans and zombies — different, and often confused

```diagram
  PARENT DIES FIRST              CHILD DIES FIRST
  child becomes an ORPHAN        child becomes a ZOMBIE
        │                              │
  re-parented to PID 1           waits for the parent to call wait()
        │                              │
  PID 1 reaps it ✓                parent never calls wait() ✗
        │                              │
  harmless                       zombie accumulates until PID exhaustion
```

A zombie is not a leak of memory — it is a leak of a **PID table entry** holding
the exit status. Thousands of them exhaust the PID space and no new process can
start anywhere on the host.

**Diagnosis:** find the *parent*, not the zombie. Killing a zombie is meaningless
— it is already dead. Restarting or fixing the parent is the fix.

```sh
# List zombies with their parent PID — PPID is the column that matters.
ps -eo pid,ppid,stat,comm | awk '$3 ~ /^Z/'
```

## ⑤ Signals

| Signal | Number | Default | Catchable | Use |
|:---|:---|:---|:---|:---|
| `SIGTERM` | 15 | Terminate | **Yes** | Polite shutdown. What orchestrators send first |
| `SIGKILL` | 9 | Terminate | **No** | Last resort. No cleanup, no flush, no handler |
| `SIGINT` | 2 | Terminate | Yes | Ctrl-C |
| `SIGHUP` | 1 | Terminate | Yes | Conventionally "reload config" |
| `SIGSTOP` | 19 | Stop | **No** | Freeze |
| `SIGCHLD` | 17 | Ignore | Yes | A child exited — reap it here |

:::senior
**`kill -9` as a habit is a bug factory.** SIGKILL cannot be caught, so the
process never flushes buffers, never completes in-flight requests, never removes
its lock file, never deregisters from service discovery. You trade a clean
shutdown for a corrupted state file and a stale registry entry.

The correct sequence is SIGTERM, wait for the grace period, then SIGKILL only if
it has not exited. This is exactly what Kubernetes does with
`terminationGracePeriodSeconds` — and why an application that ignores SIGTERM
takes exactly the grace period to stop, every single time. That fixed, suspicious
delay is the diagnostic signature.
:::

**PID 1 is special:** the kernel applies no default handlers to it. A process
running as PID 1 with no explicit SIGTERM handler simply **ignores** it. See
[[container-isolation]] — this is the most common container shutdown bug.

## ⑥ Processes vs threads

Linux has one primitive underneath both: `clone()`. What differs is how much is
shared.

| | Process | Thread |
|:---|:---|:---|
| Memory | Private | **Shared** |
| File descriptors | Private copy | **Shared** |
| Crash blast radius | Itself | **The whole process** |
| Scheduled as | A task | A task — the kernel treats both the same |

A "thread" is a task sharing memory with its peers. This is why `top` can show a
process using 400% CPU on a 4-core box — it is aggregating threads.

```sh
# Per-thread CPU. Finds the one hot thread inside an otherwise idle process.
pidstat -t -u 1 5
top -H -p <pid>
```

## ⑦ Troubleshooting

```sh
# The process tree — shows who parented whom, which is what you need
# for zombie and orphan questions.
ps -ejH        # or: pstree -p

# What is a process actually waiting on right now?
cat /proc/<pid>/stack     # kernel stack (root; explains D state)
cat /proc/<pid>/wchan     # the kernel function it is sleeping in

# FD leak? Compare against the limit before concluding.
ls /proc/<pid>/fd | wc -l
cat /proc/<pid>/limits | grep 'open files'

# Why did it die? 128+N means it was killed by signal N.
# 137 = 128+9 (SIGKILL, usually the OOM killer)
# 143 = 128+15 (SIGTERM)
echo $?
```

## ⑧ Common Mistakes

- **Killing a zombie.** It is already dead; fix or restart its parent.
- **`kill -9` first.** Skips every cleanup path the application has.
- **Assuming high load means CPU pressure.** `D`-state processes count toward it.
- **Reading `top` inside a container** and believing the CPU count — it usually
  reports the host's.
- **Ignoring exit code 137.** It is not a crash, it is a kill: 128+9, almost
  always the OOM killer.

## ★ Key Takeaway

:::cloud
**1.** `fork()` then `exec()` — the gap between them is where all process setup
happens, containers included.
**2.** `D` state cannot be killed. It is waiting on the kernel; fix the storage.
**3.** Zombies leak **PIDs**, not memory. Fix the parent.
**4.** SIGKILL cannot be caught — no flush, no cleanup, no deregistration.
**5.** Exit code 137 = killed by SIGKILL, usually OOM. 143 = SIGTERM.
:::

---

**Version note:** state letters, `/proc` layout and signal numbers are stable
across modern Linux. `/proc/<pid>/stack` requires root and a kernel built with
`CONFIG_STACKTRACE`. Signal numbers differ on other Unixes; these are Linux x86-64.
