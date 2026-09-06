---
title: DNS Resolution
slug: dns-resolution
type: concept
domain: 00-foundations
tags: [networking, dns, resolver]
level: 2
status: stable
prerequisites: []
related: [kubernetes-dns, tcp-handshake]
updated: 2026-09-05
---

# DNS Resolution

> DNS is a globally distributed cache with no invalidation — which is why it is fast, and why it lies.

## ① What is it?

DNS turns a name into an address. It does this through a **hierarchy of
delegation**: no single server knows every name; each level only knows who to
ask next.

## ② Why does it exist?

Addresses change; names should not. DNS is the indirection layer that lets you
move a service to a new IP without every client being reconfigured.

The cost of that indirection is **staleness**. Every answer is cached at
several layers with a TTL, and there is no mechanism to recall a cached answer
early. When you change a record, you are not making a change — you are starting
a countdown.

## ③ The Resolution Path

```diagram
  app ──▶ stub resolver (libc / getaddrinfo)
              │  reads /etc/nsswitch.conf, /etc/hosts, /etc/resolv.conf
              ▼
        RECURSIVE resolver  (your ISP, 8.8.8.8, CoreDNS)
              │   does the actual walking, caches everything
              │
              ├──▶ ROOT servers        "who handles .com?"
              ├──▶ TLD servers (.com)  "who handles example.com?"
              └──▶ AUTHORITATIVE       "here is the A record"
              │
              ▼
        answer + TTL ──▶ cached at every layer on the way back
```

:::mental
Asking for directions in a building you do not know.
Reception knows the floor. The floor desk knows the corridor. The corridor sign
knows the room. **Nobody knows the whole path** — and each one remembers their
last answer for a while, whether or not it is still true.
:::

## ④ Record Types That Matter Operationally

| Type | Returns | Operational note |
|:---|:---|:---|
| `A` / `AAAA` | IPv4 / IPv6 address | AAAA lookups happen even on IPv4-only hosts — a common hidden latency source |
| `CNAME` | Another **name** | Cannot coexist with other records at the same name; illegal at a zone apex |
| `SRV` | host **+ port** + priority | Used by Kubernetes headless Services, Consul, Kerberos |
| `NS` | Delegation | Where the hierarchy hands off |
| `TXT` | Arbitrary text | SPF/DKIM; also the usual ACME domain-validation channel |
| `PTR` | Reverse: IP → name | Often missing or wrong; never rely on it for authorisation |

## ⑤ TTL — the only control you have

```diagram
  change record ──┬── resolvers holding a cached answer keep serving it
                  │        for up to TTL seconds. No recall exists.
                  ▼
      t=0 ─────────── TTL ──────────▶ everyone converged (in theory)
```

:::senior
**Lower the TTL *before* you need it, not when you need it.**

To migrate safely you must drop the TTL to (say) 60s and then wait for the
**old** TTL to expire everywhere — because caches are still holding the old
record *with the old, long TTL*. Lowering it at cutover time achieves nothing:
the resolvers that matter already cached the long value.

The sequence is: lower TTL → wait one full old-TTL period → change the record →
wait one new-TTL period → raise the TTL back.
:::

:::trap
**"We changed DNS but traffic still goes to the old server."**

Blaming TTL is only half right. The other half is that **many clients ignore
TTL entirely**. JVMs historically cached DNS forever (`networkaddress.cache.ttl`
defaulted to -1 with a security manager installed); connection pools resolve
once at startup and hold the socket; some HTTP clients resolve per-pool, not
per-request.

So the honest answer is: DNS-based failover is best-effort at the client's
discretion. If you need deterministic failover, you need a load balancer with a
stable address — not a DNS change.
:::

## ⑥ Where lookups actually go wrong

```sh
# dig asks the RESOLVER directly — it does NOT use /etc/nsswitch.conf,
# /etc/hosts, or the search domains the way your application does.
dig +short example.com

# getent goes through the SAME path libc uses. When dig works and the app
# fails, this is the command that shows you why.
getent hosts example.com

# Watch the full delegation chain — useful when you suspect the zone itself.
dig +trace example.com
```

:::trap
**`dig` working while the application fails is not a contradiction — it is a
diagnosis.**

`dig` talks to the resolver. Your application goes through `nsswitch.conf`,
`/etc/hosts`, search-domain expansion and possibly an IPv6 attempt first. If
`dig` succeeds and `getent hosts` fails, the problem is in that chain, not in
DNS. Reaching for `dig` first is the single most common wasted hour in DNS
debugging.
:::

## ⑦ Failure Modes

| What breaks | You observe | Why it is confusing |
|:---|:---|:---|
| Resolver down | *Everything* fails at once, ~5s delay each | Looks like total network failure |
| Negative caching (`NXDOMAIN`) | New record not visible for minutes | The *absence* was cached, governed by the SOA minimum |
| Search-domain expansion | Extra queries per lookup; latency spike | Invisible unless you packet-capture |
| AAAA on IPv4-only host | +1 round trip per resolution | `dig A` alone looks perfectly healthy |
| Slow resolver | p99 latency spikes, p50 fine | DNS time is rarely in application traces |

:::failure
**DNS latency hides from your dashboards.**

`getaddrinfo()` is a blocking call inside the connect path. Most application
traces start the span *after* the connection is established, so a resolver
taking 400ms shows up as "slow upstream" with no attributable cause.

If p99 latency is bad while CPU, GC and database timings are all normal, DNS
belongs on the shortlist — see [[high-latency-normal-cpu]].
:::

## ⑧ Senior Engineer Notes

**DNS is UDP until it is not.** Responses over 512 bytes (or the EDNS0
advertised size) set the truncation bit, and the resolver retries over TCP. A
firewall that permits UDP/53 but blocks TCP/53 produces a system that works
perfectly until a response grows — typically when a service scales up and its
answer list gets longer. It then fails for exactly the records that matter most.

**Negative caching is governed by the SOA, not by your record's TTL.** If you
query a name before creating it, the `NXDOMAIN` is cached for the zone's SOA
minimum. Creating the record does not clear it. This is why "I created it but it
does not resolve" is so often self-inflicted — by the check performed just
beforehand.

## ★ Key Takeaway

:::cloud
**1.** DNS is a cache hierarchy with no invalidation. You cannot recall an
answer; you can only wait it out.
**2.** Lower the TTL one full old-TTL period *before* the migration.
**3.** `dig` bypasses the path your application uses. `getent hosts` does not —
use it to compare.
**4.** Clients may ignore TTL entirely. DNS failover is best-effort, never
deterministic.
:::

---

**Version note:** the protocol and hierarchy are stable (RFC 1034/1035, EDNS0 in
RFC 6891). Client caching behaviour is highly runtime-specific — verify your
JVM, Go, and Node resolver settings individually rather than assuming.
