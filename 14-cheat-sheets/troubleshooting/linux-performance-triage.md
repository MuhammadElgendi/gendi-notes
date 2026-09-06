---
title: Linux Performance Triage
slug: linux-performance-triage
type: cheat-sheet
domain: 14-cheat-sheets
tags: [cheatsheet, linux, performance, troubleshooting]
level: 3
status: stable
prerequisites: [linux-processes]
related: [high-latency-normal-cpu, container-isolation]
updated: 2026-09-05
---

# Linux Performance Triage

> Sixty seconds to decide which of the four resources is the problem — then stop guessing and go deep on that one.

## ① The decision tree

Every performance problem is one of four resources. Identify which before
reaching for any deep tool.

```diagram
                     "the box is slow"
                            │
      ┌──────────┬──────────┴──────────┬──────────────┐
      ▼          ▼                     ▼              ▼
     CPU       MEMORY                DISK          NETWORK
      │          │                     │              │
  top, mpstat  free, vmstat        iostat -x     ss, nstat
  pidstat -u   pidstat -r          pidstat -d    tcpdump
      │          │                     │              │
  saturated?  swapping?            %util high?   retransmits?
  throttled?  OOM in dmesg?        await high?   queue full?
```

:::key
For each resource ask three questions — **Utilisation, Saturation, Errors**
(the USE method). Utilisation alone is the trap: a disk at 100% utilisation
serving fast is fine; a CPU at 40% that is *throttled* is not.
**Saturation is where the pain is. Utilisation is just where people look.**
:::

## ② The first 60 seconds

Run these in order. Each one either accuses a resource or clears it.

| Command | What it does | What matters in the output |
|:---|:---|:---|
| `uptime` | Load average, 1/5/15 min | Rising trend matters more than the value. On Linux load counts `D`-state (I/O) too, so high load ≠ CPU-bound |
| `dmesg -T \| tail -30` | Recent kernel messages | `Out of memory`, `nf_conntrack: table full`, disk errors. Free, and it names the cause outright when present |
| `vmstat 1 5` | System-wide, per second | `r` (runnable > cores = CPU saturated), `b` (blocked on I/O), `si/so` (swapping = trouble), `wa` (I/O wait) |
| `mpstat -P ALL 1 3` | Per-CPU breakdown | One core at 100% while others idle = single-threaded bottleneck, invisible in an average |
| `pidstat -u 1 3` | Per-process CPU, over time | Which process. Unlike `top`, it prints a rolling record you can read after the fact |
| `iostat -xz 1 3` | Per-device disk | `%util` (busy), `await` (latency), `aqu-sz` (queue). High `await` + low `%util` = the device is slow, not busy |
| `free -m` | Memory | **`available`, not `free`.** Linux uses spare RAM as page cache by design; low `free` is normal and healthy |
| `ss -s` and `ss -lnt` | Socket summary, listen queues | On listening sockets: `Recv-Q` = waiting to be accepted, `Send-Q` = backlog. Recv-Q climbing means the app is not accepting |
| `nstat -az` | Kernel network counters | `TcpExtListenOverflows`, `TcpRetransSegs`. Non-zero and rising is a real finding |

## ③ "Is it CPU?"

| Command | Reveals |
|:---|:---|
| `mpstat -P ALL 1` | Per-core skew — one hot core means one hot thread |
| `pidstat -t -u 1` | Per-**thread** CPU; finds the single busy thread in a big process |
| `perf top -p <pid>` | Which functions are actually burning cycles |
| `cat /sys/fs/cgroup/cpu.stat` | `nr_throttled` — **containers only, and decisive** |

:::trap
**High load average does not mean CPU-bound.** Linux includes uninterruptible
sleep (`D` state — usually disk I/O) in load. A load of 50 on 8 cores with `wa`
high and `r` low is an **I/O** problem; adding CPU changes nothing.

Check `r` (runnable) in `vmstat`: that is the CPU queue. `r` consistently above
core count is genuine CPU saturation.
:::

## ④ "Is it memory?"

| Command | Reveals |
|:---|:---|
| `free -m` | Look at `available`; ignore `free` |
| `vmstat 1` | `si`/`so` non-zero = swapping, which is catastrophic for latency |
| `pidstat -r 1` | Per-process RSS and fault rate |
| `dmesg -T \| grep -i oom` | The OOM killer's own account — authoritative |
| `smem -rs uss` | USS — memory that would actually be freed. RSS double-counts shared pages |

:::trap
**"Memory is 95% used" is almost always fine.** Linux fills unused RAM with page
cache and evicts it on demand. The `available` column already accounts for
reclaimable cache — that is the number to read.

Real memory pressure looks like: `si/so` non-zero, or OOM messages in `dmesg`,
or `pgscan`/`pgsteal` climbing in `/proc/vmstat`.
:::

## ⑤ "Is it disk?"

| Command | Reveals |
|:---|:---|
| `iostat -xz 1` | `await` (per-I/O latency), `%util`, `aqu-sz` (queue depth) |
| `pidstat -d 1` | Which process is doing the I/O |
| `iotop -o` | Live, only processes actually doing I/O |
| `df -h` / `df -i` | Space **and inodes** — inode exhaustion looks like a full disk with space free |

**Reading `iostat`:** `%util` near 100% with low `await` is a healthy busy device.
High `await` with modest `%util` means each operation is slow — a failing device,
a throttled cloud volume, or a noisy neighbour.

## ⑥ "Is it network?"

| Command | Reveals |
|:---|:---|
| `ss -lnt` | Accept-queue depth on listeners — see [[tcp-handshake]] |
| `ss -tan state time-wait \| wc -l` | Ephemeral port pressure |
| `nstat -az TcpExtListenOverflows` | Dropped completed connections |
| `ss -ti` | Per-connection RTT, cwnd, retransmits |
| `dmesg \| grep conntrack` | `table full` — kernel-wide, affects every container |
| `mtr -rwc 50 <host>` | Per-hop loss and latency; better than `ping` for intermittent loss |

## ⑦ Going deep — only after you know the resource

| Command | Use when | Caution |
|:---|:---|:---|
| `strace -c -f -p <pid>` | Which syscalls, and how long | **Slows the target substantially.** Never on a hot production process without accepting the impact |
| `perf record -g -p <pid>` | CPU profile with stacks | Low overhead; needs symbols to be readable |
| `bpftrace` / `bcc` | Custom kernel-level questions | Best tool available; needs a recent kernel and privileges |
| `lsof -p <pid>` | Open files, sockets, FD leaks | Slow on processes with many FDs |

## ⑧ Common mistakes

:::trap
- **`top` as the only tool.** It shows utilisation, never saturation, and it
  averages away the spike that caused the incident.
- **Reading `free` instead of `available`.** Guarantees a wrong conclusion.
- **`strace` on a busy production process.** It can slow the target by an order of
  magnitude and turn your investigation into the outage.
- **Trusting host metrics inside a container.** `top` and `free` in a container
  usually report the **host's** CPU and memory, not the cgroup's. Read
  `/sys/fs/cgroup/*` for the truth — see [[container-isolation]].
:::

## ★ The ones you actually use

:::cloud
1. `dmesg -T | tail -30` — free, and often names the cause outright
2. `vmstat 1 5` — which resource, in five seconds
3. `pidstat -u -r -d 1` — which process, across all three
4. `iostat -xz 1` — `await` is the number that matters
5. `ss -lnt` + `nstat -az` — the queue nobody thinks to check
:::

---

**Version note:** `pidstat`, `mpstat` and `iostat` come from `sysstat` (install
it before you need it). cgroup paths shown are v2. `ss` has replaced `netstat`;
`nstat` has replaced `netstat -s`.
