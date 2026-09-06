---
title: DNS
slug: dns
type: guide
domain: 00-foundations
tags: [networking, dns]
keywords: [domain, a record, cname, ttl, resolver, dig, nslookup, nameserver, mx]
level: 1
status: stable
prerequisites: [networking-basics]
related: [kubernetes-services, networking-basics]
updated: 2026-09-06
---

# DNS

> DNS turns a name into an address. Every answer is cached with an expiry, and there is no way to recall a cached answer early — which explains almost every DNS problem you will meet.

## What is it?

DNS (Domain Name System) is the internet's phone book. You type
`api.example.com`; DNS returns `93.184.216.34`; your browser connects to that
address.

It exists because addresses change and names should not. Move your service to a
new server and you update one DNS record instead of reconfiguring every client.

## How a lookup actually works

No single server knows every name. Each level only knows who to ask next.

```diagram
   your app
      │ getaddrinfo("api.example.com")
      ▼
   STUB RESOLVER          reads /etc/hosts, then /etc/resolv.conf
      │
      ▼
   RECURSIVE RESOLVER     your ISP, 8.8.8.8, or CoreDNS in a cluster
      │                   does the walking, caches every answer
      ├──→ ROOT servers            "who handles .com?"
      ├──→ .com servers            "who handles example.com?"
      └──→ example.com servers     "here is the A record"
      │
      ▼
   answer + TTL  ←── cached at every layer on the way back
```

The resolver does the work; your machine just asks it once.

## What it is made of

### Record types

| Type | Returns | When you use it |
|:---|:---|:---|
| **A** | An IPv4 address | The normal case |
| **AAAA** | An IPv6 address | IPv6. Requested even on IPv4-only hosts |
| **CNAME** | Another **name** | Alias. `www` → `myapp.cloudfront.net` |
| **MX** | Mail servers | Email delivery |
| **TXT** | Free text | SPF, DKIM, domain-ownership proofs |
| **NS** | Which nameservers own a zone | Delegation |

:::warn A CNAME cannot live at the domain root
`www.example.com` may be a CNAME. `example.com` itself may **not** — the spec
forbids a CNAME coexisting with the other records a zone apex must have (`SOA`,
`NS`).

This is why "point my bare domain at my load balancer" is awkward. The answers
are a provider-specific pseudo-record (Route 53 `ALIAS`, Cloudflare
`CNAME flattening`), or an `A` record with a static IP.

If your DNS provider rejects a CNAME on the root, this is why — not a bug.
:::

### TTL — the only control you get

Every record carries a **TTL** (time to live) in seconds: how long resolvers may
cache it.

```diagram
   you change the record
        │
        │  resolvers holding the OLD answer keep serving it
        │  for up to TTL seconds. There is no recall.
        ▼
   t=0 ──────────── TTL ────────────→ everyone converged (in theory)
```

| TTL | Meaning |
|:---|:---|
| 300 (5 min) | Sensible default |
| 60 | Use before a planned migration |
| 3600+ | Fine for records that never change |

:::key Lower the TTL *before* the migration, not during it
To move a service safely: drop the TTL to 60, then **wait for the old TTL to
fully expire**, then change the record.

Lowering it at cutover time achieves nothing — the resolvers that matter already
cached the record *with the old long TTL*, and they will keep using it for that
full duration.

The sequence is: lower TTL → wait one old-TTL period → change the record →
verify → raise the TTL back.
:::

## How to use it

### Look something up

```sh title="The three commands, and how they differ"
# 1. dig — asks the RESOLVER directly. Best for inspecting DNS itself.
dig +short api.example.com

# 2. getent hosts — goes through the SAME path your application uses,
#    including /etc/hosts and search domains.
getent hosts api.example.com

# 3. dig +trace — walk the delegation from the root. Use when you suspect
#    the zone itself is misconfigured.
dig +trace api.example.com
```

:::danger `dig` works but the app fails — that is a diagnosis, not a paradox
`dig` talks straight to the resolver. Your application goes through
`/etc/hosts`, `/etc/nsswitch.conf` and search-domain expansion first.

So if `dig` succeeds and `getent hosts` fails, the problem is in that lookup
chain — not in DNS. Reaching for `dig` first is the most common wasted hour in
DNS debugging. **Compare the two.**
:::

### Read the answer

```sh
dig api.example.com

# ;; ANSWER SECTION:
# api.example.com.   300   IN   A   93.184.216.34
#                    └┬┘         └┬┘  └─────┬────┘
#                     │           │         └── the address
#                     │           └── record type
#                     └── TTL remaining, in seconds
```

Watching the TTL count down on repeated queries tells you the answer is cached.
A TTL that resets to its full value means you reached the authoritative server.

### Check a specific resolver

Useful for confirming a change has propagated, and for ruling out your own
resolver's cache:

```sh
dig @8.8.8.8 api.example.com +short      # ask Google's resolver
dig @1.1.1.1 api.example.com +short      # ask Cloudflare's
```

If the authoritative answer is correct but yours is stale, you are looking at a
cache — wait out the TTL.

### Which resolver am I using?

```sh
cat /etc/resolv.conf         # nameserver lines = your resolvers
resolvectl status            # on systemd-resolved systems (most modern Ubuntu)
```

## Where DNS goes wrong

| Symptom | Cause | Check |
|:---|:---|:---|
| Nothing resolves at all | Resolver unreachable | `cat /etc/resolv.conf`, then `dig @8.8.8.8` |
| Changed a record, old value persists | TTL caching, or a client that ignores TTL | `dig` the authoritative server directly |
| New record not visible for minutes | The **absence** was cached (`NXDOMAIN`) | See below |
| Works from your laptop, not from the server | Different resolvers, or split-horizon DNS | Compare `dig` output from both |
| Slow first request, fast after | Resolution latency, then cached | Time it: `time dig name` |
| Works for short names, not long ones | Search-domain expansion | `cat /etc/resolv.conf` |

:::danger Negative caching: checking too early creates the problem
Query a name *before* you create it and the `NXDOMAIN` gets cached — governed by
the zone's SOA minimum, not by your record's TTL. Creating the record does not
clear it.

This is why "I created it but it still does not resolve" is so often
self-inflicted, by the impatient check you ran a minute earlier. Create the
record first, then look.
:::

:::warn Many clients ignore TTL completely
DNS failover is best-effort at the client's discretion:

- Older JVMs cached DNS results **forever** by default.
- Connection pools resolve once at startup and hold the socket for hours.
- Some HTTP clients resolve per-pool, not per-request.

So a DNS change may not move traffic even after the TTL expires. If you need
deterministic failover, put a load balancer with a stable address in front —
do not rely on a DNS change.
:::

## UDP, TCP, and a firewall trap

DNS uses **UDP port 53** for normal queries because it is fast and queries are
tiny. But if a response exceeds the advertised size limit, the server sets a
truncation flag and the resolver **retries over TCP port 53**.

```diagram
   query ──→ UDP/53 ──→ response fits?  ── yes ──→ done
                              │
                              no (large answer)
                              ▼
                        retry over TCP/53
```

A firewall that allows UDP/53 but blocks TCP/53 produces a system that works
perfectly until an answer grows — typically when a service scales up and its
address list gets longer. It then fails for exactly the records that matter
most, and the failure looks random.

**Allow both** UDP and TCP on port 53.

## Key takeaways

- DNS is a **cache hierarchy with no invalidation**. You cannot recall an
  answer; you can only wait out the TTL.
- **Lower the TTL one full old-TTL period before** you migrate.
- **`dig` inspects DNS; `getent hosts` follows your app's real path.** When they
  disagree, the answer is in the difference.
- A **CNAME cannot sit at the domain root** — use your provider's ALIAS
  equivalent.
- Querying a name before creating it caches the `NXDOMAIN`. Create first, check
  after.
- Allow **both UDP and TCP** on port 53.
