---
title: DNS
slug: dns
type: guide
domain: 00-foundations
tags: [networking, dns]
keywords: [domain, a record, cname, ttl, resolver, dig, nslookup, nameserver,
           mx, nxdomain, negative caching, coredns, ndots, search domain,
           دومين, نطاق, كاش, ترجمة اسماء]
level: 1
status: stable
prerequisites: [networking-basics]
related: [kubernetes-services, networking-basics, devops-interview-questions]
updated: 2026-09-08
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
      ↓
   STUB RESOLVER          reads /etc/hosts, then /etc/resolv.conf
      │
      ↓
   RECURSIVE RESOLVER     your ISP, 8.8.8.8, or CoreDNS in a cluster
      │                   does the walking, caches every answer
      ├──→ ROOT servers            "who handles .com?"
      ├──→ .com servers            "who handles example.com?"
      └──→ example.com servers     "here is the A record"
      │
      ↓
   answer + TTL  ←── cached at every layer on the way back
```

The resolver does the work; your machine just asks it once.

:::ar بالمصري · إيه هو الـ DNS، وإزاي بيشتغل
الـ DNS هو **دفتر التليفونات بتاع الإنترنت**. إنت بتكتب `api.example.com`،
وهو بيرجّعلك `93.184.216.34`، والبراوزر بيتصل على الرقم ده.

**وليه موجود؟** عشان **العناوين بتتغير والأسماء المفروض متتغيرش**. تنقل
سيرفيسك على سيرفر جديد، تعدّل ريكورد واحد في الـ DNS — بدل إنك تعدّل
الإعدادات في كل جهاز عند كل عميل.

**وإزاي بيشتغل؟** الفكرة الأساسية: **مفيش سيرفر واحد عارف كل الأسماء**.
كل مستوى عارف **مين يسأل بعده** وبس.

```diagram
   تطبيقك
      │  "هاتلي عنوان api.example.com"
      ↓
   STUB RESOLVER        بيقرأ /etc/hosts الأول، وبعدين /etc/resolv.conf
      │                 (ده جوه جهازك، وبيسأل مرة واحدة وبس)
      ↓
   RECURSIVE RESOLVER   بتاع شركة النت، أو 8.8.8.8، أو CoreDNS في الكلاستر
      │                 ده اللي **بيتعب**، وبيعمل كاش لكل إجابة
      │
      ├──→ سيرفرات الـ ROOT        "مين مسؤول عن .com؟"
      ├──→ سيرفرات .com            "مين مسؤول عن example.com؟"
      └──→ سيرفرات example.com     "اتفضل، ده العنوان"
      │
      ↓
   الإجابة + TTL  ←── وبتتخزّن كاش في **كل** طبقة على طريق الرجوع
```

**والحاجة اللي لازم تخرج بيها من هنا:** الـ DNS **هرم من الكاش، ومفيش
فيه أي طريقة تلغي الكاش**.

إنت تقدر تحط إجابة جديدة، **بس مش تقدر تسحب الإجابة القديمة** من الناس
اللي خزّنوها. لازم تستنى المدة تخلص.

**وده بيفسّر تقريباً كل مشكلة DNS هتشوفها في حياتك.**
:::

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
        ↓
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

:::ar بالمصري · الـ TTL هو التحكّم الوحيد اللي عندك
كل ريكورد معاه رقم بالثواني اسمه **TTL** (time to live)، ومعناه: **الـ
resolvers مسموحلهم يخزّنوا الإجابة دي كاش قد إيه**.

| TTL | معناه |
|:---|:---|
| ٣٠٠ (٥ دقايق) | افتراضي معقول |
| ٦٠ | قبل نقل مخطط له |
| ٣٦٠٠ أو أكتر | لريكوردات عمرها ما بتتغير |

:::danger نزّل الـ TTL **قبل** النقل، مش وقت النقل
دي أهم نقطة عملية في الصفحة، وناس كتير بتغلط فيها وبتقعد تستغرب.

**الغلطة:** إنت عايز تنقل سيرفيس. بتنزّل الـ TTL لـ ٦٠ **وبتغيّر الريكورد
في نفس اللحظة**. وبتقعد تستغرب إن نص الناس لسه على السيرفر القديم بعد ساعة.

**ليه؟** عشان الـ resolvers اللي بتفرق **خزّنوا الريكورد خلاص، ومعاه الـ
TTL القديم الطويل**. وهما هيكملوا على القيمة القديمة **المدة الطويلة
كلها** — تغييرك للـ TTL وصلهملهم بعد فوات الأوان.

```diagram
   الغلط                              الصح
   ─────                              ────
   t=0  نزّل TTL لـ ٦٠                t=0     نزّل TTL لـ ٦٠
        + غيّر الريكورد                       (بس! متغيرش حاجة تانية)
        │                                     │
        ↓                              استنى مدة الـ TTL القديم كلها
   الـ resolvers لسه شايلة               (مثلاً ساعة)
   الإجابة القديمة بـ TTL ساعة                │
        │                                     ↓
        ↓                              t=1h   دلوقتي كله عنده TTL=٦٠
   ساعة كاملة والترافيك متقسّم                 │
   والمشكلة مش باينة ليه                       ↓
                                       t=1h   غيّر الريكورد
                                              │
                                              ↓
                                       بعد ٦٠ ثانية بس، الكل اتحوّل
```

**الترتيب الصح:** نزّل الـ TTL ← **استنى مدة الـ TTL القديم كلها** ←
غيّر الريكورد ← اتأكد ← ورجّع الـ TTL لقيمته الطبيعية.
:::
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

:::ar بالمصري · `dig` بيشتغل والتطبيق بيفشل؟ دي مش لُغز، دي **تشخيص**
دي أهم حاجة عملية في الصفحة كلها. ركّز فيها.

**الأدوات التلاتة مش نفس الحاجة**، وده بيت القصيد:

```diagram
   dig api.example.com
        │
        └──→ بيروح **للـ resolver مباشرة**
              بيتخطّى /etc/hosts وبيتخطّى الـ search domains


   getent hosts api.example.com
        │
        └──→ بيمشي على **نفس الطريق اللي تطبيقك بيمشي عليه**
              /etc/hosts  →  /etc/nsswitch.conf  →  search domains  →  DNS
```

**يعني `dig` بيسأل الـ DNS. و `getent` بيسأل النظام.** والاتنين ممكن
يقولوا حاجتين مختلفين!

فلو حصل ده:

| `dig` | `getent hosts` | يبقى المشكلة فين |
|:---|:---|:---|
| ✔ نجح | ✔ نجح | مش مشكلة أسماء خالص. دوّر في الشبكة أو التطبيق |
| ✔ نجح | ✘ فشل | **في سلسلة البحث بتاعة النظام**، مش في الـ DNS |
| ✘ فشل | ✘ فشل | مشكلة DNS حقيقية |
| ✘ فشل | ✔ نجح | فيه سطر في `/etc/hosts` بيغطّي على الاسم |

**والسطر الأخير ده بيحصل كتير:** حد حاطط سطر في `/etc/hosts` على السيرفر
منذ سنة عشان يجرّب حاجة، ونسيه. والتطبيق بياخد العنوان القديم، والـ DNS
سليم تماماً.

**والقاعدة:** أول ما تشك في الأسماء، **شغّل الاتنين وقارن**. الفرق بينهم
هو الإجابة.

واللي بيبدأ بـ `dig` بس، ده أشهر ضياع ساعة في تشخيص الـ DNS.
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

:::ar بالمصري · الكاش السلبي — إنك تشيك بدري هو اللي **بيعمل** المشكلة
دي غريبة وبتوقّع كل الناس، وأنت اللي بتعمل المشكلة بإيدك من غير ما تعرف.

**اللي بيحصل:**

```diagram
   إنت:  dig new.example.com        ← لسه ما عملتهوش، بتشيك بس
         │
         ↓
   الـ resolver:  "مفيش. NXDOMAIN"
         │
         └──→ **وبيخزّن الـ «مفيش» دي كاش!**
              والمدة بتتحدد من الـ SOA بتاع الـ zone،
              مش من الـ TTL بتاع ريكوردك

   إنت:  تعمل الريكورد دلوقتي
         │
         ↓
   إنت:  dig new.example.com
         │
         ↓
   الـ resolver:  "مفيش" ← لسه بيرد من الكاش السلبي!
```

**فالـ DNS مش بيخزّن الإجابات بس، هو بيخزّن الـ «مفيش إجابة» كمان.** ودي
اسمها **negative caching**.

وإنك تعمل الريكورد **مش بيلغي** الكاش السلبي ده.

**فعشان كده «أنا عملته وبرضه مش بيترجم» بتكون غلطتك** — من الشيكة المستعجلة
اللي عملتها قبل كده بدقيقة.

**القاعدة: اعمل الريكورد الأول، وبعدين بصّ.** ومتشيكش على حاجة قبل ما
تعملها.

ولو غلطت وشيكت بدري؟ استنى، أو اسأل resolver تاني ما شافش السؤال ده:

```sh
dig @1.1.1.1 new.example.com     # resolver تاني، كاش تاني
```
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
                              ↓
                        retry over TCP/53
```

A firewall that allows UDP/53 but blocks TCP/53 produces a system that works
perfectly until an answer grows — typically when a service scales up and its
address list gets longer. It then fails for exactly the records that matter
most, and the failure looks random.

**Allow both** UDP and TCP on port 53.

:::ar
الـ DNS بيستخدم **UDP على بورت ٥٣** في الاستعلامات العادية، عشان سريع
والأسئلة صغيرة.

**بس** لو الإجابة طلعت أكبر من الحد المسموح، السيرفر بيرفع علامة «الإجابة
مقطوعة»، والـ resolver **بيعيد السؤال على TCP بورت ٥٣**.

:::danger فايروول بيسمح UDP/53 وبيمنع TCP/53 = كارثة مؤجلة
دي واحدة من أخبث المشاكل، عشان **بتشتغل تمام لشهور** وبعدين بتضرب.

```diagram
   السؤال ──→ UDP/53 ──→ الإجابة صغيرة؟ ── أيوه ──→ خلاص، تمام
                              │
                              لأ (إجابة كبيرة)
                              ↓
                        يعيد المحاولة على TCP/53
                              │
                              ✘ الفايروول مانع
                              ↓
                        فشل. من غير أي رسالة مفيدة.
```

**وإمتى الإجابة بتكبر؟** لما السيرفيس يعمل **scale** وعناوينه تكتر!

يعني: كل حاجة شغالة تمام. تعمل scale من ٣ لـ ٣٠ نسخة. الإجابة بقت طويلة.
والـ DNS بيفشل **بالظبط للريكوردات الأهم عندك** — اللي عليها ترافيك كتير
فمعمولها scale.

والفشل بيبان **عشوائي**، عشان الريكوردات الصغيرة لسه شغالة عادي.

**فاسمح للاتنين: UDP و TCP على بورت ٥٣.** مفيش استثناءات.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q You changed a DNS record 30 minutes ago. Some users get the new server, some the old. Explain and fix.
This is normal, expected DNS behaviour, and saying so is the first half of
the answer.

**Why:** DNS is a cache hierarchy with **no invalidation**. Every resolver
that queried before your change holds the old answer for the remainder of
its TTL, and there is no protocol mechanism to recall it.

```sh
# What the authoritative server says now — the source of truth
dig @ns1.example.com api.example.com

# What a public resolver still has, and its remaining TTL
dig @8.8.8.8 api.example.com
```

**What you can do:** wait out the TTL. That is genuinely it, for DNS.

**What you should have done:** lowered the TTL a full old-TTL period *before*
the change.

:::key The senior half of this answer
Volunteer that **DNS is a poor failover mechanism** and say why:

- Older JVMs cached lookups **forever** by default (`networkaddress.cache.ttl`).
- Connection pools resolve once at startup and keep the socket open for hours.
- Some HTTP clients resolve per-pool rather than per-request.

So traffic may not move even after the TTL expires. If you need deterministic
cutover, put a **load balancer with a stable address** in front and change
its backends — the DNS name never changes at all. That reframes the question
from "how do I make DNS faster" to "why is DNS in my failover path".
:::

:::ar
ده سلوك **طبيعي ومتوقّع** من الـ DNS، وإنك تقول كده هو **نص الإجابة**.

**ليه بيحصل:** الـ DNS هرم كاش **مفيهوش إلغاء**. أي resolver سأل قبل
تغييرك، شايل الإجابة القديمة لباقي مدة الـ TTL بتاعها، **ومفيش أي
ميكانيزم في البروتوكول يسحبها منه**.

```sh
dig @ns1.example.com api.example.com   # السيرفر الرسمي بيقول إيه (الحقيقة)
dig @8.8.8.8 api.example.com           # resolver عام لسه شايل إيه، وفاضله قد إيه
```

**تعمل إيه دلوقتي؟** تستنى الـ TTL يخلص. وبجد، **دي هي**، مفيش حل تاني
في الـ DNS.

**واللي كان المفروض تعمله؟** تنزّل الـ TTL **مدة TTL قديم كاملة قبل**
التغيير.

**والنص التاني من الإجابة — اللي بيبيّن السينيورتي:**

قول من نفسك إن **الـ DNS وسيلة فاشلة للـ failover**، واشرح ليه:

- الـ JVMs القديمة كانت بتخزّن الترجمة **للأبد** افتراضياً.
- الـ connection pools بتترجم **مرة واحدة وقت البداية** وبتقعد ماسكة
  الـ socket ساعات.
- بعض الـ HTTP clients بيترجموا لكل pool مش لكل ريكوست.

**فالترافيك ممكن ميتحركش حتى بعد ما الـ TTL يخلص.**

ولو محتاج تحويل مضمون، حُط **load balancer بعنوان ثابت** قصاده وغيّر
الـ backends بتاعته — **واسم الـ DNS ما يتغيرش أصلاً**.

وكده إنت حوّلت السؤال من «إزاي أخلّي الـ DNS أسرع» لـ **«ليه الـ DNS
في مسار الـ failover بتاعي من الأصل؟»** — وده اللي هو عايز يسمعه.
:::
:::

:::q In a Kubernetes cluster, DNS lookups are slow and CoreDNS CPU is high. Where do you look?
Almost always **`ndots` and search-domain expansion**.

A pod's `/etc/resolv.conf` contains `options ndots:5` and several search
domains. `ndots:5` means: any name with fewer than 5 dots is tried against
**every search domain first**, before being tried as-is.

```diagram
   your app connects to  "api.example.com"   (2 dots, under ndots:5)

   the resolver tries, in order:
     api.example.com.default.svc.cluster.local   ✘ NXDOMAIN
     api.example.com.svc.cluster.local           ✘ NXDOMAIN
     api.example.com.cluster.local               ✘ NXDOMAIN
     api.example.com                             ✔ finally

   4 queries instead of 1 — and each ✘ is also an IPv6 (AAAA)
   query, so realistically 8 round trips for one connection
```

Multiply by every connection from every pod and CoreDNS is doing an order of
magnitude more work than it should.

**Fixes, in order of preference:**

| Fix | How |
|:---|:---|
| Fully qualify external names | Use `api.example.com.` with a **trailing dot** — no expansion |
| Lower `ndots` for that pod | `dnsConfig: { options: [{ name: ndots, value: "2" }] }` |
| Cache on the node | NodeLocal DNSCache — a per-node resolver, removes most cluster-wide traffic |

:::ar
دي بنسبة كبيرة مشكلة **`ndots` وتوسيع الـ search domains**.

ملف `/etc/resolv.conf` جوه البود فيه `options ndots:5` وكذا search domain.
و `ndots:5` معناها: **أي اسم فيه أقل من ٥ نقط، جرّبه على كل الـ search
domains الأول**، وبعدين جرّبه زي ما هو.

بص على الرسمة اللي فوق: اسم فيه نقطتين بس بياخد **٤ استعلامات**، وكل
واحدة فاشلة بتتكرر لـ IPv6 كمان — يعني **٨ رحلات** لكونيكشن واحد!

اضرب ده في كل كونيكشن من كل بود، تلاقي CoreDNS شغّال أضعاف اللي المفروض
يشتغله.

**والحلول بالترتيب:**

| الحل | إزاي |
|:---|:---|
| اكتب الأسماء الخارجية كاملة | `api.example.com.` **بنقطة في الآخر** — مفيش توسيع خالص |
| نزّل `ndots` للبود ده | `dnsConfig` مع `ndots: "2"` |
| كاش على كل نود | **NodeLocal DNSCache** — resolver على كل نود، بيشيل أغلب الترافيك |

**والنقطة في آخر الاسم دي حاجة قليل اللي يعرفها**، وهي أرخص حل: النقطة
معناها «ده اسم كامل، متوسّعوش»، فالـ resolver بيسأل مرة واحدة وخلاص.
:::
:::

:::q Why can a CNAME not exist at the domain apex, and what do you use instead?
Because the spec forbids a CNAME from coexisting with any other record for
the same name — and a zone apex is **required** to have `SOA` and `NS`
records. So `example.com` can never be a CNAME, while `www.example.com`
can.

**What to use instead:** a provider-specific pseudo-record that behaves like
a CNAME but returns an address:

| Provider | Mechanism |
|:---|:---|
| Route 53 | `ALIAS` record |
| Cloudflare | `CNAME flattening` |
| Azure DNS | `ALIAS` record |
| Generic fallback | An `A` record with a static IP — only if the target IP is genuinely stable |

:::note Why this matters operationally
This is why "point the bare domain at my load balancer" is awkward, and why
hard-coding an `A` record to a load balancer's current IP is a trap — cloud
load balancer addresses can change, and then your apex silently points at
nothing while `www` keeps working.
:::

:::ar
عشان المواصفة **بتمنع** إن الـ CNAME يتواجد مع أي ريكورد تاني لنفس الاسم
— وجذر الـ zone **مُلزم** إن يكون عنده ريكوردات `SOA` و `NS`.

فـ `example.com` **عمره ما يبقى CNAME**، بينما `www.example.com` يقدر.

**والبديل:** ريكورد خاص بكل مزوّد، بيتصرّف زي الـ CNAME بس بيرجّع عنوان:

| المزوّد | الحل |
|:---|:---|
| Route 53 | ريكورد `ALIAS` |
| Cloudflare | `CNAME flattening` |
| Azure DNS | ريكورد `ALIAS` |
| لو مفيش | ريكورد `A` بعنوان ثابت — **بس لو العنوان فعلاً ثابت** |

**وليه ده مهم في الشغل؟** عشان الحل الأخير ده فخ: إنك تكتب `A` بعنوان
الـ load balancer الحالي **حاجة خطيرة**، عشان عناوين الـ load balancers
في الكلاود **بتتغير**.

ولما تتغير، الجذر بيشاور على العدم **في سكوت**، و `www` بيفضل شغّال —
فالمشكلة بتبان عشوائية ومحدش فاهم ليه نص الناس بتوصل ونص لأ.
:::
:::

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
- **DNS is a poor failover mechanism.** Many clients ignore the TTL entirely;
  put a load balancer with a stable address in front instead.

:::ar بالمصري · الخلاصة
1. **الـ DNS هرم كاش مفيهوش إلغاء.** مش تقدر تسحب إجابة، تقدر بس تستنى
   الـ TTL يخلص.
2. **نزّل الـ TTL مدة TTL قديم كاملة قبل** ما تنقل أي حاجة.
3. **`dig` بيسأل الـ DNS، و `getent hosts` بيمشي على طريق تطبيقك الحقيقي.**
   لما يختلفوا، **الإجابة في الفرق بينهم**.
4. **الـ CNAME مينفعش على جذر الدومين** — استخدم `ALIAS` بتاع مزوّدك.
5. **تسأل عن اسم قبل ما تعمله؟** الـ `NXDOMAIN` بيتخزّن كاش. **اعمل الأول،
   وبعدين بصّ.**
6. **اسمح للـ UDP والـ TCP على بورت ٥٣.** الفايروول اللي بيسمح لواحد بس
   بيضرب لما الإجابات تكبر.
7. **الـ DNS وسيلة فاشلة للـ failover.** عملاء كتير بيتجاهلوا الـ TTL
   خالص — حُط load balancer بعنوان ثابت بدالها.
:::
