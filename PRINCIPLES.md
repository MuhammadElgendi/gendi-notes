# Principles

How these notes think. `CONTRIBUTING.md` covers mechanics; this covers judgement.

---

## ① Why over what

*What* is in the official documentation, is better maintained there, and will be
out of date here within a year.

*Why* is what makes the *what* memorable and lets you reason about cases nobody
documented. It also survives version changes: the reason Kubernetes needs
kube-proxy has not changed since 2015, while everything about how it works has.

> Do not write "a Service provides a stable IP." Write "Pod IPs are ephemeral, so
> something must translate a stable address into a live Pod IP **at packet
> time** — binding it at DNS time would cache a dead Pod's address."

---

## ② Mental models over memorisation

A fact answers one question. A model answers the questions you have not been
asked yet.

Every model must come with **where it breaks down**. A model presented without
its limits becomes a slogan, and slogans fail exactly when the problem is
interesting — which is the only time you needed the model.

> "Every Pod is a machine on a flat LAN" — *and* "there is no cluster-wide
> broadcast domain, so ARP-based discovery does not apply."

---

## ③ Failure modes over happy paths

The happy path is in the vendor's tutorial. Nobody has ever been paged because
the happy path happened.

For anything worth knowing, ask: how does this fail *partially*? How does it fail
*slowly*? Slow is worse than down — nothing trips, no alert fires, and the system
degrades while every dashboard stays green.

---

## ④ Trade-offs are mandatory above Level 3

Any recommendation without a cost is marketing.

"Use Redis for caching" is not an answer. The answer names the workload, the
consistency implications, what happens when Redis is unavailable, what happens
at TTL expiry, and when Redis is the *wrong* choice.

The strongest thing you can say about your own design is what it is bad at. That
single sentence is most of the distance between a senior answer and a staff one.

---

## ⑤ Production examples over toy examples

Toy examples teach toy intuitions. `foo`/`bar` with three rows never exhibits the
behaviour that matters — a query plan flips at scale, a cache stampede needs
concurrency, a connection pool needs contention.

Use real flags, real orders of magnitude, real failure signatures. If you have
not seen it in production, say so and cite where the claim comes from.

---

## ⑥ Diagrams over paragraphs

A paragraph running past three lines is usually a diagram, a table, or a list
that has not been converted yet.

A diagram must be readable in five seconds and must show the **mechanism**. If
the same diagram would serve a competing product with the labels swapped, it is
illustrating a marketing page, not teaching a system.

---

## ⑦ Name the trap

For anything with a plausible-but-wrong answer, write the wrong answer down and
explain precisely what it gets backwards.

Knowing the correct answer is not the same as recognising the incorrect one
under pressure — and interviews, like incidents, are conducted under pressure.
The wrong answer is what your brain reaches for first; naming it in advance is
what stops it.

---

## ⑧ Separate what, why, how, and trade-offs

Blending them produces text that reads fluently and teaches nothing. Keep them
in distinct sections so a reader revising at speed can take only the layer they
need.

---

## ⑨ Distinguish stable from version-specific

Three different lifetimes, and conflating them is how a note becomes quietly
wrong:

| | Example | Ages |
|:---|:---|:---|
| **Fundamentals** | The TCP three-way handshake | Decades |
| **Implementation** | kube-proxy uses iptables by default | Years |
| **Version-specific** | EndpointSlices GA in 1.21 | Months |

Every note ends with a **version note** stating what was verified against what.
A claim with no version is a claim you cannot re-check.

---

## ⑩ Every command explains its output

A command you cannot interpret is cargo cult. Say what it does, what in the
output matters, and what you conclude from each case.

Order investigation steps by **likelihood ÷ cost**. The cheapest check that
eliminates the most possibilities goes first — that ordering *is* the expertise.

---

## ⑪ Write for your worst moment

The reader is you, at 3am, with a dashboard on fire and no patience.

That reader needs the symptom in the title, the command near the top, and the
conclusion stated plainly. They do not need your preamble, your history of the
technology, or your enthusiasm.

---

## ⑫ Concision is a feature, not a constraint

A note you will not reread is a note that does not exist. Length is a cost paid
by every future reading.

Cut: restatements of the official docs, throat-clearing introductions, anything
you would skip yourself on a revision pass.

---

## ⑬ One concept, one home

The same idea explained in two places diverges — and then one of them is wrong
and you cannot tell which.

A concept lives once, in the domain that owns it. Everything else links to it.
The linter enforces that the links resolve; you have to enforce that the concept
is not duplicated.

---

## ⑭ Honesty about uncertainty

"I believe X but have not verified it" is useful. Confident wrongness is worse
than an admitted gap, because it removes the prompt to check.

Never invent behaviour. If a mechanism is unclear, say which part is unclear —
that sentence is itself a good note, and it is the one you will come back and
close.

---

## ⑮ Explain twice, in two languages

Every section is written once in English and once in Egyptian Arabic. This is
not a translation requirement — a literal translation would add nothing and
double the maintenance for no gain.

It is a **second pass at the explanation**, and that is the point. Saying the
same mechanism a second way exposes the part the first way left implicit:

| The English says | The Arabic has to answer |
|:---|:---|
| "`-p host:container`" | …so which number is which, and how do I remember? |
| "A Service routes to Ready pods" | …so what happens to the ones that are not Ready? |
| "Layers are append-only" | …so what does `rm` in a later layer actually do? |

If writing the Arabic version is easy, the English was probably complete. If it
is hard, the English was hiding a gap — go back and fix the English too.

**Technical terms stay in English.** `Pod`, `readiness probe`, `SIGTERM`,
`OOMKilled`. The reader has to recognise them in the official documentation and
say them out loud in an interview; translating them would teach a private
vocabulary that works nowhere else.

---

## ⑯ Say what the interviewer is testing

A question has two answers: the fact, and the reason the question exists. The
second is the one worth writing down, because a reader can know the fact and
still fail the question.

> "Why is this image 1.2 GB?" is not testing whether you know about
> multi-stage builds. It is testing whether you **measure before optimising** —
> which is why the answer starts with `docker history`, not with `alpine`.

Every `:::q` card should carry that line. Without it the card is a flashcard;
with it, it teaches judgement, which is the thing that actually transfers.

---

## The test

Before adding anything:

> **Would a senior engineer actually keep this note?**

Not "is it correct" — correct and useless is the most common failure mode. Would
someone who already knows the basics find something here they did not have?

If not, it is not ready. Ten shallow notes are worse than one good one: they
dilute search, and they teach you to distrust the collection.
