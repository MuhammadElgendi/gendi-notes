---
title: TCP Handshake and Connection State
slug: tcp-handshake
type: concept
domain: 00-foundations
tags: [networking, tcp, linux]
level: 2
status: stable
prerequisites: []
related: [dns-resolution, high-latency-normal-cpu, linux-network-namespaces]
updated: 2026-09-05
---

# TCP Handshake and Connection State

> A TCP connection is not a thing that exists — it is two machines that agree they are still talking.

## ① What is it?

Before any bytes flow, TCP performs a **three-way handshake** to agree on
initial sequence numbers and confirm both directions work. The connection is
then a **shared fiction**: two kernels each holding state, believing the other
still holds it too.

Almost every confusing TCP production bug comes from that fiction breaking on
one side and not the other.

## ② Why does it exist?

IP delivers packets that may be lost, duplicated, delayed, or reordered. TCP
promises an ordered, reliable byte stream on top of that. To do so it must:

- **Agree a starting sequence number**, so old duplicate packets from a
  previous connection are not mistaken for current data.
- **Confirm bidirectional reachability** before the application is told it has
  a connection. One-way reachability is a real and common failure.

## ③ The Handshake

```diagram
   CLIENT                                      SERVER
      │                                           │
      │  ── SYN, seq=x ─────────────────────────▶ │  socket enters SYN_RECV,
      │                                           │  goes on the SYN QUEUE
      │  ◀───────────── SYN-ACK, seq=y, ack=x+1 ─ │
      │                                           │
      │  ── ACK, ack=y+1 ───────────────────────▶ │  moves to the ACCEPT QUEUE
   ESTABLISHED                                    │
      │                                     accept() pops it ──▶ ESTABLISHED
      │                                           │
```

:::mental
Two people on a bad phone line:
"Can you hear me?" → "Yes, can you hear me?" → "Yes."
Three messages, because two is not enough to prove **both** directions work.
:::

## ④ The Two Queues — the part that matters in production

The server does not have one backlog. It has two, and they fail differently.

| Queue | Holds | Sized by | When it overflows |
|:---|:---|:---|:---|
| **SYN queue** | Half-open, awaiting final ACK | `net.ipv4.tcp_max_syn_backlog` | New SYNs dropped, or SYN cookies kick in |
| **Accept queue** | Complete, awaiting `accept()` | `min(backlog, net.core.somaxconn)` | New completions dropped — **client thinks it connected** |

:::failure
**Accept-queue overflow is the cruellest TCP failure.**

The handshake completed, so the *client* is `ESTABLISHED` and starts sending.
The server's kernel dropped the connection because the application was too slow
to call `accept()`. The client waits for a response that no application will
ever read.

Signature: rising latency with **normal CPU**, and a growing counter here:

```sh
# "times the listen queue of a socket overflowed" — if this climbs,
# your application is not accepting fast enough. Nothing else explains it.
nstat -az TcpExtListenOverflows TcpExtListenDrops
```

The fix is almost never a bigger backlog. A bigger queue buys milliseconds and
hides the real problem: the accept loop is blocked on something.
:::

```sh
# On a LISTENING socket these columns mean something unusual:
#   Recv-Q = connections waiting in the accept queue RIGHT NOW
#   Send-Q = the configured maximum (the backlog)
# Recv-Q approaching Send-Q means you are about to drop connections.
ss -lnt
```

## ⑤ Connection Teardown and TIME_WAIT

```diagram
  ACTIVE CLOSER                       PASSIVE CLOSER
      │ ── FIN ─────────────────────────▶ │  CLOSE_WAIT
      │ ◀──────────────────────── ACK ─── │
      │ ◀──────────────────────── FIN ─── │  (app finally closes)
      │ ── ACK ─────────────────────────▶ │
   TIME_WAIT (2×MSL = 60s on Linux)       CLOSED
```

**Whoever closes first pays.** The active closer holds `TIME_WAIT` for 60
seconds to absorb delayed duplicates and to guarantee the final ACK can be
retransmitted.

:::senior
**`CLOSE_WAIT` piling up is an application bug, always.**

`CLOSE_WAIT` means the peer sent FIN and your kernel acknowledged it — but your
application never called `close()`. The kernel cannot clear it for you. Thousands
of `CLOSE_WAIT` sockets is a leaked file descriptor, usually a connection pool
that does not close on an error path.

`TIME_WAIT` piling up is different and usually *not* a bug — it means you are
making many short-lived outbound connections. The fix is connection reuse
(keep-alive), not sysctl tuning.

Do **not** reach for `tcp_tw_recycle`: it was removed in Linux 4.12 because it
broke badly behind NAT. `tcp_tw_reuse` is safe and applies only to outbound
connections.
:::

## ⑥ Half-Open vs Half-Closed

These sound alike and are completely different. Interviewers use the confusion.

| | **Half-open** | **Half-closed** |
|:---|:---|:---|
| Cause | One side vanished (crash, power loss, NAT timeout) | One side called `shutdown(SHUT_WR)` deliberately |
| Protocol state | **Inconsistent** — one side thinks it is connected, the other has no record | **Legal** — a documented TCP state |
| Detection | Only on next write, or by keepalive | Peer reads EOF and knows |
| Danger | Silent. Can persist for hours | None; it is by design |

:::trap
**"How does TCP detect a half-open connection?"**

The tempting answer — "keepalives" — is technically true and practically
useless. Linux defaults are `tcp_keepalive_time = 7200` (2 hours) before the
*first* probe. No production system can wait two hours to notice a dead peer.

The real answer: **TCP mostly does not detect it.** An idle half-open connection
is indistinguishable from a healthy idle one. It is discovered when you write
and get RST or a timeout.

This is exactly why every RPC client needs **application-level timeouts**, and
why a connection pool that hands out sockets without health-checking them will
eventually hand out a dead one. "The connection was in the pool" is the root
cause behind an enormous number of intermittent production errors.
:::

## ⑦ Failure Modes

| What breaks | You observe | Cheapest check |
|:---|:---|:---|
| Accept queue overflow | Latency up, CPU normal, client timeouts | `nstat TcpExtListenOverflows` |
| SYN flood / SYN queue full | Connections refused under load | `nstat TcpExtTCPReqQFullDrop` |
| FD exhaustion via `CLOSE_WAIT` | "too many open files" | `ss -tan state close-wait \| wc -l` |
| Ephemeral port exhaustion | Outbound connects fail, inbound fine | `ss -tan state time-wait \| wc -l` |
| Half-open through a firewall | Works, then hangs after idle period | Compare idle time to firewall timeout |

## ⑧ Senior Engineer Notes

**Firewalls and NAT gateways silently kill idle connections.** A stateful
middlebox drops its table entry after an idle timeout (often 350s on cloud NAT
gateways) without telling either endpoint. Both sides remain `ESTABLISHED`
forever; the next write hangs until the application timeout.

This is the mechanism behind "the first request after a quiet period always
fails". The fix is a keepalive interval **below** the middlebox timeout, or an
idle-connection eviction policy in the pool that is more aggressive than it.

**Connection establishment is not free.** Three packets means one full round
trip before any data. Cross-region at 80ms RTT, that is 80ms before the first
byte — plus another 1–2 RTTs if TLS is involved. This is why connection pooling
and keep-alive matter far more than most micro-optimisations people reach for.

## ★ Key Takeaway

:::cloud
**1.** The handshake proves *both* directions work — that is why it is three.
**2.** Two queues, not one. Accept-queue overflow looks exactly like an
application performance problem, and is the more common of the two.
**3.** `CLOSE_WAIT` = your bug. `TIME_WAIT` = your traffic pattern.
**4.** Half-open connections are effectively undetectable by TCP alone. Every
timeout you rely on must live in the application.
:::

---

**Version note:** queue behaviour, `nstat` counters and default sysctls are
Linux-specific and verified against kernel 5.x/6.x. `tcp_tw_recycle` was removed
in 4.12. The handshake and state machine themselves are RFC 9293 and do not vary.
