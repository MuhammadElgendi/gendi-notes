---
title: Networking Basics
slug: networking-basics
type: guide
domain: 00-foundations
tags: [networking, tcp, ip, ports]
keywords: [ip address, subnet, port, tcp, udp, firewall, nat, cidr, curl,
           connection refused, timeout, ss, netstat, security group, mtu,
           شبكات, بورت, فايروول, اتصال]
level: 1
status: stable
prerequisites: []
related: [dns, linux-basics, ssh, devops-interview-questions]
updated: 2026-09-08
---

# Networking Basics

> Every "it can't connect" problem is one of four things: wrong address, wrong port, a firewall, or nothing listening.

## What is it?

Networking is how one machine reaches another. To make a connection you need
exactly two pieces of information:

- an **IP address** — *which machine*
- a **port** — *which program on that machine*

Together they form a **socket**: `10.0.1.5:5432` means "the program listening on
port 5432 of the machine at 10.0.1.5".

:::ar
الشبكات كلها بتبدأ من حاجتين بس. حاجتين وخلاص:

```diagram
   10.0.1.5 : 5432
   ────┬───   ──┬─
       │        └── البورت  →  أنهي **برنامج** على الجهاز ده
       └─────────── العنوان  →  أنهي **جهاز**
```

- **الـ IP address** بيقولك **أنهي جهاز** — زي عنوان العمارة.
- **الـ port** بيقولك **أنهي برنامج جوه الجهاز** — زي رقم الشقة.

والاتنين مع بعض بيتسمّوا **socket**.

فـ `10.0.1.5:5432` معناها: «البرنامج اللي سامع على بورت ٥٤٣٢ في الجهاز
اللي عنوانه 10.0.1.5». والرقم ٥٤٣٢ ده بورت بوستجرس، فإحنا بنتكلم عن
داتابيز بوستجرس على الجهاز ده.

**وأهم حاجة في الصفحة دي كلها**، ولو حفظتها هتوفّر ساعات:

> أي مشكلة «مش بيتصل» هي **واحدة من أربعة** بس:
> **العنوان غلط**، ولا **البورت غلط**، ولا **فيه فايروول**، ولا
> **مفيش حاجة سامعة أصلاً**.

مفيش خيار خامس. وباقي الصفحة دي بتعلّمك تفرّق بين الأربعة دول في دقيقة.
:::

## Why the layers exist

Rather than one enormous protocol, networking is split into layers, each solving
one problem and trusting the layer below.

```diagram
   your app  (HTTP: "GET /users")
      │
      ↓  needs a reliable ordered stream
   TCP       (ports, retransmission, ordering)
      │
      ↓  needs to find the machine
   IP        (addresses, routing between networks)
      │
      ↓  needs to reach the next hop
   Ethernet / WiFi   (MAC addresses, one physical link)
```

The value of the split: your app never thinks about cables, and IP never thinks
about retransmitting lost data. When you debug, you work **down** this stack —
and each layer you rule out eliminates a whole class of cause.

## What it is made of

### IP addresses and subnets

An IPv4 address is four numbers, `0–255` each: `10.0.1.5`.

Some ranges are **private** — usable inside your own network, never routable on
the internet:

| Range | Written as | Where you meet it |
|:---|:---|:---|
| `10.0.0.0`–`10.255.255.255` | `10.0.0.0/8` | Cloud VPCs, Kubernetes pods |
| `172.16.0.0`–`172.31.255.255` | `172.16.0.0/12` | Docker's default bridge |
| `192.168.0.0`–`192.168.255.255` | `192.168.0.0/16` | Home routers |
| `127.0.0.1` | `127.0.0.0/8` | Loopback — this machine only |

The `/8` and `/24` suffix is **CIDR notation**: how many leading bits are fixed
as the network, leaving the rest for hosts.

```diagram
   10.0.1.0/24
   └────┬───┘ └┬┘
        │      └── 24 bits fixed → 8 bits left → 256 addresses
        │          usable range 10.0.1.1 – 10.0.1.254
        │          (.0 is the network, .255 the broadcast)
        └───────── the network part

   /24 → 256 addresses      /16 → 65,536
   /28 → 16                 /8  → 16.7 million
   Rule of thumb: bigger number = smaller network.
```

:::ar الـ `/24` دي معناها إيه؟
الرقم اللي بعد الشلاطة اسمه **CIDR**، ومعناه: **كام bit ثابتين كعنوان
للشبكة**، والباقي للأجهزة.

الـ IP فيه ٣٢ bit. فلو قلت `/24`، يعني ٢٤ ثابتين و **٨ سايبينهم**،
و ٨ bits = ٢٥٦ احتمال.

```diagram
   10.0.1.0/24
   └────┬───┘└┬┘
        │     └── ٢٤ ثابتين → فاضل ٨ → ٢٥٦ عنوان
        │         والمتاح فعلاً: 10.0.1.1 لحد 10.0.1.254
        │         (الـ .0 للشبكة نفسها، والـ .255 للبث)
        └──────── جزء الشبكة
```

**والقاعدة اللي تحفظها:**

> **الرقم أكبر = الشبكة أصغر.**

وهي عكس اللي الدماغ بتتوقعه، فخد بالك. `/8` شبكة عملاقة، و `/28` شبكة
فيها ١٦ عنوان بس.

| CIDR | عدد العناوين | بتشوفها فين |
|:---|:---|:---|
| `/8` | ١٦.٧ مليون | شبكة كلاود كاملة |
| `/16` | ٦٥٥٣٦ | VPC |
| `/24` | ٢٥٦ | subnet عادية |
| `/28` | ١٦ | subnet صغيرة للـ load balancers |

**والنطاقات الخاصة** (اللي مينفعش تتراوت على الإنترنت) لازم تعرفهم عشان
بتشوفهم كل يوم:

| النطاق | بتشوفه فين |
|:---|:---|
| `10.x.x.x` | شبكات الكلاود، وبودات كوبرنيتيس |
| `172.16-31.x.x` | شبكة دوكر الافتراضية |
| `192.168.x.x` | راوتر البيت |
| `127.0.0.1` | **الجهاز ده هو بس** (loopback) |

ولو شوفت IP بيبدأ بـ `169.254`، دي معناها الجهاز **ما لقاش DHCP** وإدى
لنفسه عنوان عشوائي. يعني عندك مشكلة شبكة من الأساس.
:::

### Ports

Ports separate programs on one machine. The ones worth memorising:

| Port | Service |
|:---|:---|
| 22 | SSH |
| 53 | DNS |
| 80 | HTTP |
| 443 | HTTPS |
| 3306 | MySQL |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 27017 | MongoDB |

Ports below 1024 require root to bind. This is why a container listening on 80
often runs its app on 8080 internally and maps the port instead.

### TCP versus UDP

| | TCP | UDP |
|:---|:---|:---|
| Guarantees | Ordered, no loss, no duplicates | None |
| Setup | 3-way handshake first | Just send |
| Speed | Slower | Faster |
| Used by | HTTP, SSH, databases | DNS, video, metrics |

**TCP** is a phone call: you connect, confirm the other side can hear you, then
talk. **UDP** is a postcard: you send it and hope.

### The TCP handshake

Worth knowing because it explains what "connection refused" means:

```diagram
   client                          server
     │ ── SYN ────────────────────→ │  "can we talk?"
     │ ←──────────── SYN-ACK ────── │  "yes, can you hear me?"
     │ ── ACK ────────────────────→ │  "yes"
   connected — data can now flow
```

Three messages, because two cannot prove **both** directions work.

## How to use it

### Is it listening?

```sh title="On the server itself"
# -l listening  -n numeric (no DNS lookups)  -t TCP  -p which process
sudo ss -lntp

# Is anything on port 5432 specifically?
sudo ss -lntp | grep 5432
```

Look at the **Local Address** column carefully:

| Shown as | Means |
|:---|:---|
| `0.0.0.0:5432` | Listening on **all** interfaces — reachable from outside |
| `127.0.0.1:5432` | Loopback **only** — nothing outside the machine can connect |
| `[::]:5432` | All interfaces, IPv6 |

:::danger Bound to 127.0.0.1 — the most common "why can't I connect?"
The service is running, the port is right, the firewall is open — and remote
connections still fail. Because it is listening on loopback only, it will only
ever accept connections from the same machine.

`ss -lntp` shows this immediately. The fix is in the service's own config:
PostgreSQL's `listen_addresses`, Redis's `bind`, or your app's bind address.

In a container this bites differently: an app bound to `127.0.0.1` inside a
container is unreachable even with `-p` mapping, because the port mapping
arrives on the container's external interface. Bind to `0.0.0.0` in containers.
:::

:::ar دي أشهر «ليه مش بيتصل؟» في الدنيا
السيرفيس شغّال، والبورت صح، والفايروول مفتوح — **والاتصال من بره لسه بيفشل**.

السبب إن البرنامج سامع على **loopback بس**، يعني على نفسه، فهو **عمره ما
هيقبل اتصال من أي جهاز تاني**.

وأمر واحد بيكشفها فوراً:

```sh
sudo ss -lntp
```

**وبصّ على عمود `Local Address` بالتحديد**، ده بيت القصيد:

| اللي مكتوب | معناه |
|:---|:---|
| `0.0.0.0:5432` | سامع على **كل** الواجهات — يوصله أي حد ✔ |
| **`127.0.0.1:5432`** | **سامع على نفسه بس** — محدش من بره هيوصله ✘ |
| `[::]:5432` | كل الواجهات، بس IPv6 |

والحل مش في الفايروول ولا في الشبكة — **الحل في إعدادات البرنامج نفسه**:
`listen_addresses` في بوستجرس، `bind` في ريديس، أو عنوان الاستماع في
تطبيقك.

:::danger وفي الكونتينرات المشكلة دي بتلبس شكل تاني
لو تطبيقك سامع على `127.0.0.1` **جوه كونتينر**، مش هتوصله **حتى لو عملت
`-p 8080:80` صح**.

ليه؟ عشان الـ `127.0.0.1` جوه الكونتينر معناها **الكونتينر نفسه**، والـ
port mapping بيوصل على **الواجهة الخارجية** بتاعة الكونتينر — واللي
تطبيقك مش سامع عليها.

```diagram
   docker run -p 8080:80 myapp
                    │
                    ↓
   البورت بيوصل على واجهة الكونتينر الخارجية (eth0)
                    │
                    ↓
   التطبيق سامع على 127.0.0.1 بس  →  الطلب بيوصل ومحدش بيرد
```

**فالقاعدة القاطعة: جوه الكونتينرات، اسمع على `0.0.0.0` دايماً.**

ودي بالمناسبة نفس السبب اللي بيخلي حاجات زي `flask run` أو `rails s`
مش شغالة في دوكر بالإعدادات الافتراضية — عشان أغلبهم بيسمعوا على
localhost لوحده لأسباب أمنية على اللاب.
:::
:::

### Can I reach it?

Work through these in order — each one rules out a layer.

```sh
# 1. Does the name resolve? (rules out DNS)
getent hosts api.example.com

# 2. Does the machine respond at all? (rules out routing)
#    Note: many cloud hosts block ICMP, so a failed ping is not proof of a problem.
ping -c 3 10.0.1.5

# 3. Is the PORT open? This is the important one.
#    -z scan only, -v verbose, -w timeout in seconds
nc -zv 10.0.1.5 5432

# 4. Does the application actually answer?
curl -v https://api.example.com/health
```

Reading the result of step 3 is most of the skill:

| Result | Meaning | Next step |
|:---|:---|:---|
| `succeeded` / `open` | Something is listening and reachable | Problem is in the app or the protocol |
| `Connection refused` | Reached the machine, **nothing listening** on that port | Start the service, or check the port |
| **Timeout / hangs** | Packets are being **dropped** — a firewall | Check firewall rules and cloud security groups |

:::key Refused and timeout mean opposite things
**Connection refused** is a helpful answer. The machine received your packet and
actively replied "no program here". Networking and routing are fine — you have a
service or port problem.

**Timeout** means silence. Something is discarding packets without replying,
which is exactly what a firewall does. On a cloud VM this is usually a security
group or network ACL, not the server itself.

Getting these two backwards sends people to debug the wrong layer for hours.
:::

:::ar `refused` و `timeout` معناهم **العكس**
دي أهم تفصيلة في الصفحة، وأكتر حاجة بتضيّع وقت الناس لما تتلخبط.

```diagram
   nc -zv 10.0.1.5 5432
   ─────────────────────

   "succeeded"            →  فيه حاجة سامعة وواصلة
                              المشكلة في التطبيق أو البروتوكول

   "Connection refused"   →  الجهاز **رد عليك** وقالك "مفيش حد هنا"
                              يعني الشبكة والراوتنج تمام ١٠٠٪
                              المشكلة: السيرفيس واقف، أو البورت غلط

   يقعد يستنى (timeout)   →  **سكوت تام**. البكتات بتتاكل
                              يعني فيه فايروول
```

**افهمها كده:**

**`Connection refused` دي إجابة كريمة.** الجهاز استلم البكت بتاعك و **رد
عليك بالنفي**: «أنا موجود، بس مفيش برنامج على البورت ده». يعني الشبكة
والراوتنج والعنوان كلهم **صح**. المشكلة عندك في السيرفيس.

**`timeout` دي سكوت.** فيه حاجة بتاخد البكتات وبترميها **من غير ما ترد**
— وده بالظبط شغل الفايروول. الفايروول المحترم مش بيقولك «ممنوع»، هو
بيتجاهلك خالص عشان ميديكش أي معلومة.

| اللي شوفته | دوّر فين |
|:---|:---|
| `refused` | السيرفيس (شغّال؟ على البورت ده؟ على `0.0.0.0`؟) |
| `timeout` | الفايروول (security group في الكلاود، أو ufw على الجهاز) |

**واللي بيعكسهم بيدوّر في الطبقة الغلط لساعات.** حد بيشوف `refused`
وبيقعد يفتح فايروولات — والفايروول أصلاً مفتوح، دليل كده إنه **رد** عليه.
:::

### Which route does traffic take?

```sh
ip addr              # this machine's addresses (replaces ifconfig)
ip route             # the routing table. "default via ..." is your gateway
traceroute 8.8.8.8   # each hop along the way
mtr 8.8.8.8          # traceroute + live loss stats. Better for intermittent issues
```

### Reading `curl -v`

```sh
curl -v https://api.example.com/health
```

| Line in the output | Tells you |
|:---|:---|
| `Trying 10.0.1.5:443...` | DNS resolved — to this address |
| `Connected to ...` | TCP succeeded. Address and port are correct |
| `TLS handshake` / certificate lines | HTTPS negotiation; cert problems appear here |
| `> GET /health` | What was sent |
| `< HTTP/1.1 200` | The status the server returned |

If it stops after "Trying", it is a firewall. If it stops at TLS, it is a
certificate. If you get a 5xx, the network is fine and the application is not.

## Firewalls: two layers on any cloud VM

This catches almost everyone once.

```diagram
   internet
      │
      ↓
   ① CLOUD firewall   ← AWS security group / Azure NSG / OCI security list
      │                 configured in the web console, NOT over SSH
      ↓
   ② HOST firewall    ← ufw or iptables, on the machine itself
      │
      ↓
   ③ the service      ← and it must be bound to 0.0.0.0, not 127.0.0.1
```

All three must allow the traffic. Opening only the host firewall and wondering
why the port is still closed is the single most common cloud networking mistake.

```sh
sudo ufw status                       # if ufw is installed
sudo iptables -L INPUT -n --line-numbers   # if it is not
```

:::ar على أي سيرفر كلاود فيه **فايروولين** مش واحد
دي بتوقّع كل حد مرة على الأقل في حياته، فخد بالك منها من الأول.

```diagram
   الإنترنت
      │
      ↓
   ① فايروول الكلاود      ← AWS security group / Azure NSG / OCI
      │                      بيتظبّط من **الموقع**، مش من SSH
      ↓
   ② فايروول الجهاز        ← ufw أو iptables، على السيرفر نفسه
      │
      ↓
   ③ السيرفيس              ← ولازم يكون سامع على 0.0.0.0 مش 127.0.0.1
```

**والتلاتة لازم يسمحوا.** لو واحد بس مانع، مفيش اتصال.

**والغلطة الشائعة:** حد بيفتح `ufw` على السيرفر، وبيقعد مستغرب إن البورت
لسه مقفول. عشان فايروول الكلاود **لسه مانع**، وده **مش بيتظبّط من على
السيرفر خالص** — إنت لازم تدخل على موقع الكلاود.

```sh
sudo ufw status                              # لو ufw منصّب
sudo iptables -L INPUT -n --line-numbers     # لو مش منصّب
```

**وإزاي تعرف الفايروول ده تحت ولا فوق؟** من مكان ما إنت فيه:

- لو إنت **جوه** السيرفر و `curl localhost:5432` شغّال، بس من بره timeout
  → المشكلة في واحد من الفايروولين.
- شغّل `sudo ufw status`. لو مكتوب `inactive` أو البورت مسموح → يبقى
  المشكلة في **فايروول الكلاود**، وروح للكونسول.
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q "The service is unreachable." Walk me through it. · «السيرفيس مش بيرد»
This is the most common troubleshooting question in DevOps interviews, and
the answer is a **method**, not a tool list. Narrow it one layer at a time,
out loud:

```sh
# 1. Does the name resolve, and to what?      (rules out DNS)
getent hosts api.example.com

# 2. Is the PORT open?                        (rules out firewall vs service)
nc -zv 10.0.1.5 5432

# 3. On the server: is anything listening, and on which interface?
sudo ss -lntp | grep 5432

# 4. Does the application answer?             (rules out app vs network)
curl -v https://api.example.com/health
```

Then read step 2's result, because it splits the problem in half:

| Result | Eliminated | Remaining |
|:---|:---|:---|
| `refused` | Firewall, routing, DNS — the machine replied | Service down, wrong port, or bound to `127.0.0.1` |
| `timeout` | Nothing — you got silence | Firewall: cloud security group, or host `ufw` |
| `succeeded` | The whole network stack | The application or the protocol above it |

:::key What is really being tested
Not whether you know `nc`. Whether **each command you run eliminates a class
of cause**. A candidate who runs seven commands in a row without saying what
each one rules out is guessing quickly, not debugging.
:::

:::ar
ده أشهر سؤال troubleshooting في انترفيوهات الـ DevOps، والإجابة
**منهج مش لستة أدوات**. ضيّق طبقة طبقة، **وبصوت عالي**:

```sh
getent hosts api.example.com    # ١. الاسم بيترجم؟ ولإيه؟  (يستبعد الـ DNS)
nc -zv 10.0.1.5 5432            # ٢. البورت مفتوح؟          (يفصل الفايروول عن السيرفيس)
sudo ss -lntp | grep 5432       # ٣. فيه حاجة سامعة؟ وعلى أنهي واجهة؟
curl -v https://.../health      # ٤. التطبيق بيرد؟          (يفصل التطبيق عن الشبكة)
```

**وخطوة ٢ هي اللي بتقسّم المشكلة نصين:**

| النتيجة | استبعدت إيه | فاضل إيه |
|:---|:---|:---|
| `refused` | الفايروول والراوتنج والـ DNS — **الجهاز رد** | السيرفيس واقف، أو بورت غلط، أو سامع على `127.0.0.1` |
| `timeout` | **ولا حاجة** — إنت خدت سكوت | فايروول: كلاود أو `ufw` |
| `succeeded` | الشبكة كلها | التطبيق أو البروتوكول اللي فوقه |

**واللي بيتقاس عليه مش إنك تعرف `nc`.**

اللي بيتقاس عليه إن **كل أمر بتشغّله بيشيل نوع كامل من الأسباب**.

اللي بيشغّل سبع أوامر ورا بعض من غير ما يقول كل واحد استبعد إيه — ده
**بيخمّن بسرعة، مش بيشخّص**.
:::
:::

:::q A large file transfer hangs at exactly the same point every time, but small requests work fine. What is it?
**Almost certainly MTU / path MTU discovery**, and this question exists to
find people who have debugged real networks.

Small packets fit anywhere. Once a packet exceeds the smallest MTU on the
path, the router must either fragment it or reply `ICMP fragmentation
needed`. If a firewall blocks that ICMP message, the sender never learns and
just retransmits the too-large packet forever — a **PMTUD black hole**.

```diagram
   client (MTU 1500) ──→ router (MTU 1400) ──→ server
        │                     │
        │  small packet       │  fits, fine
        │  1500-byte packet   │  too big
        │                     │
        │  ←── ICMP "frag needed, use 1400"
        │           ✘ BLOCKED by a firewall
        │
        └── never learns. retransmits 1500 forever. hangs.
```

```sh
# Find the real path MTU: -M do = do not fragment, -s = payload size
ping -M do -s 1472 8.8.8.8      # 1472 + 28 header = 1500
ping -M do -s 1372 8.8.8.8      # try lower until it succeeds
```

**Where it bites in practice:** VPNs and tunnels (WireGuard, IPsec) and
overlay networks — including several Kubernetes CNIs, which encapsulate
packets and so reduce the usable MTU. The signature is always the same:
handshakes and small responses fine, large payloads hang.

:::ar
**دي بنسبة كبيرة مشكلة MTU**، والسؤال ده موجود عشان يلاقي اللي ظبّط شبكات
حقيقية.

الـ **MTU** هو أكبر حجم بكت مسموح يمشي على الوصلة. البكتات الصغيرة بتعدّي
من أي حتة. لكن أول ما البكت يتعدى أصغر MTU في الطريق، الراوتر لازم يا إما
يقسّمه، يا إما يرد برسالة `ICMP fragmentation needed` يقول «صغّر».

**والمشكلة:** لو فيه فايروول بيمنع رسايل ICMP دي (وناس كتير بتمنعها
«للأمان»)، **الطرف المرسل عمره ما هيعرف**، وبيقعد يبعت نفس البكت الكبير
للأبد. ودي بتتسمى **PMTUD black hole**.

بص على الرسمة اللي فوق — الـ handshake بينجح (بكتات صغيرة)، وأول ما تيجي
الداتا الكبيرة بيتعلّق.

**إزاي تقيس الـ MTU الحقيقي؟**

```sh
ping -M do -s 1472 8.8.8.8    # 1472 + 28 هيدر = 1500
ping -M do -s 1372 8.8.8.8    # نزّل لحد ما ينجح
```

**وبتشوفها فين في الشغل؟** في الـ VPNs والـ tunnels (WireGuard، IPsec)،
وفي الشبكات المتراكبة (overlay) — **وده بيشمل كذا CNI في كوبرنيتيس**، عشان
بيلفّوا البكت في بكت تاني فبيقلّلوا الـ MTU المتاح.

**والتوقيع دايماً هو هو:** الـ handshake والردود الصغيرة تمام، والحمولات
الكبيرة بتتعلّق في نفس المكان بالظبط كل مرة.
:::
:::

:::q Why does a TCP connection need three messages and not two?
Because two messages can only prove **one** direction works.

```diagram
   client                          server
     │ ── SYN ────────────────────→ │  "can you hear me?"
     │ ←──────────── SYN-ACK ────── │  "yes — can you hear me?"
     │ ── ACK ────────────────────→ │  "yes"
   both directions now proven
```

After SYN → SYN-ACK, the *client* knows both directions work — it sent and
it received. But the **server** has only proved that its own send worked; it
has no evidence the client received anything. The third message supplies
that. Each side also uses the exchange to communicate its initial sequence
number, which is what makes ordering and retransmission possible at all.

:::note Where this shows up in practice
This is why `SYN_RECV` connections pile up in a SYN-flood attack: the server
has allocated state for half-open connections whose third message never
arrives. It is also why a `refused` is *fast* — the server replies `RST`
immediately instead of completing the handshake.
:::

:::ar
عشان **رسالتين بيقدروا يثبتوا اتجاه واحد بس**.

بعد `SYN` و `SYN-ACK`، **العميل** بقى عارف إن الاتجاهين شغالين — هو بعت
واستلم. **لكن السيرفر** لسه ما اتأكدش من حاجة غير إن الإرسال بتاعه اشتغل؛
هو معندهوش أي دليل إن العميل استلم أصلاً.

**والرسالة التالتة هي اللي بتديه الدليل ده.**

وكمان كل طرف بيستغل التبادل ده إنه يبلّغ التاني بـ **رقم التسلسل الأولي**
بتاعه، وده اللي بيخلي الترتيب وإعادة الإرسال ممكنين من الأصل.

:::note وبتشوف ده فين في الشغل؟
عشان كده في هجوم `SYN flood` بتلاقي كونيكشنز كتير واقفة على `SYN_RECV`:
السيرفر حجز مساحة لكونيكشنز نصف مفتوحة، **والرسالة التالتة عمرها ما جيت**.

وعشان كده كمان الـ `refused` **بيجي سريع جداً**: السيرفر بيرد `RST`
على طول، مش بيكمّل الـ handshake أصلاً.
:::
:::
:::

## Key takeaways

- A connection is **address + port**. Get either wrong and nothing works.
- **Refused = nothing listening. Timeout = firewall.** Opposite problems.
- **`ss -lntp`** answers "is it listening, and on which interface?" — and
  `127.0.0.1` there means local-only.
- In containers, bind to **`0.0.0.0`**, never `127.0.0.1`.
- On a cloud VM there are **two firewalls**. The cloud one is not editable over
  SSH.
- Debug **downward**: name → route → port → application. Each step eliminates a
  layer.
- Large transfers hanging while small ones work is **MTU**, not bandwidth.

:::ar الخلاصة
1. **الاتصال = عنوان + بورت.** غلط في واحد منهم، مفيش حاجة تشتغل.
2. **`refused` = مفيش حاجة سامعة. `timeout` = فايروول.** **مشكلتين
   مختلفتين تماماً**، واللي بيعكسهم بيضيّع ساعات.
3. **`ss -lntp`** بيجاوب على «فيه حاجة سامعة؟ وعلى أنهي واجهة؟» —
   و `127.0.0.1` هناك معناها **محلي بس**.
4. **جوه الكونتينرات اسمع على `0.0.0.0`**، عمرك ما تسمع على `127.0.0.1`.
5. **على سيرفر كلاود فيه فايروولين.** بتاع الكلاود **مش** بيتظبّط من SSH.
6. **شخّص من فوق لتحت:** الاسم ← الراوت ← البورت ← التطبيق. كل خطوة
   بتشيل طبقة كاملة من الاحتمالات.
7. **الملفات الكبيرة بتتعلّق والصغيرة شغالة؟** دي **MTU**، مش سرعة نت.
:::
