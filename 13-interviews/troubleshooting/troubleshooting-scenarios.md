---
title: Troubleshooting Scenarios
slug: troubleshooting-scenarios
type: interview
domain: 13-interviews
tags: [interviews, troubleshooting, sre]
keywords: [scenario, live debugging, incident, whiteboard, war game, drill,
           blast radius, what changed, bisect the system,
           سيناريو, تشخيص, حل مشاكل, انترفيو]
level: 4
status: stable
prerequisites: [kubernetes-troubleshooting, networking-basics, linux-basics]
related: [devops-interview-questions, interview-tips-and-tricks,
          kubernetes-troubleshooting, dns]
updated: 2026-09-08
---

# Troubleshooting Scenarios

> The round that decides most offers, and the one people prepare least — because it is the only round where a confident guess scores worse than an honest method.

## What is it?

Nine scenarios of the kind handed to you in a live debugging round, each with
the investigation an interviewer wants to hear.

These are **not** knowledge questions. Every one is answerable by someone who
knows less than you and has a method, and failable by someone who knows more
and starts naming tools.

:::ar
تسع سيناريوهات من النوع اللي بيتسلّملك في راوند تشخيص مباشر، وكل واحد
معاه **التحقيق** اللي المُحاور عايز يسمعه.

**ودي مش أسئلة معلومات.** كل واحدة فيهم **يقدر يجاوبها** حد يعرف أقل منك
**ومعاه منهج**، **ويفشل فيها** حد يعرف أكتر منك **ويبدأ يسمّي أدوات**.

خد بالك من الجملة دي كويس، عشان دي كل الفرق في الراوند دي.
:::

## Why it exists

Because the failure mode is so consistent. Handed a broken system, most
candidates start executing:

```diagram
   WHAT MOST PEOPLE DO              WHAT SCORES
   ───────────────────              ───────────
   "I'd check the logs"             "First — what changed?"
   "I'd look at Grafana"            "How wide is it? One user or all?"
   "I'd restart it"                 "Which layer? Let me rule out DNS."
        │                                │
        ↓                                ↓
   runs commands until                each step eliminates a
   something looks wrong              class of cause, out loud
        │                                │
        ↓                                ↓
   finds a decoy, declares            narrows to the real cause,
   victory, is wrong                  and can say why
```

The interviewer is not checking whether you know `kubectl describe`. They are
checking whether, at 3am with incomplete information, you converge or thrash.

:::ar
عشان نمط الفشل **ثابت ومتكرر**. أول ما يسلّموك سيستم باظ، أغلب الناس
**بتبدأ تنفّذ**:

«هبص في اللوجز»، «هبص في الجرافانا»، «هعمله restart».

**والفرق:** اللي بينجح **بيضيّق دايرة الشك**، واللي بيرسب **بيشغّل أوامر
لحد ما يشوف حاجة شكلها غلط**.

بص على الرسمة فوق. الفرق مش في المعرفة — الفرق إن كل خطوة عند الناجح
**بتشيل نوع كامل من الأسباب**، وبيقولها **بصوت عالي**.

**والمُحاور مش بيتأكد إنك تعرف `kubectl describe`.** هو بيتأكد إنك الساعة
٣ الفجر ومعلوماتك ناقصة، **بتقرّب من الحل ولا بتلف في دواير**.
:::

## The method, before the scenarios

Learn this shape and every scenario below becomes an instance of it.

```diagram
   1. WHAT CHANGED?          deploys · config · certs · DNS · traffic · quota
           │                 ~70% of incidents end at this question
           ↓
   2. HOW WIDE?              one user / one pod / one node / one AZ / all
           │                 narrow  → client, or that instance
           │                 wide    → shared dependency, or config
           ↓
   3. WHICH LAYER?           DNS → TCP → TLS → HTTP → app → datastore
           │                 walk it in order. do not jump
           ↓
   4. PROVE IT               one command whose result halves the possibilities
           │
           ↓
   5. STOP THE BLEEDING      roll back first, understand second
                             — and say this part out loud
```

:::key
**Step 5 is the one that marks seniority.** Juniors debug while the site is
down. Seniors restore service, *then* investigate — and say so explicitly,
because it is a judgement call the interviewer is listening for.
:::

:::ar بالمصري · المنهج قبل السيناريوهات
اتعلّم الشكل ده، وكل سيناريو تحت بيبقى مجرد **حالة** منه.

**١. إيه اللي اتغير؟** ديبلوي؟ إعداد؟ شهادة؟ DNS؟ الترافيك؟ الـ quota؟
حوالي **٧٠٪** من المشاكل بتخلص عند السؤال ده لوحده.

**٢. المشكلة قد إيه؟** يوزر واحد؟ بود؟ نود؟ منطقة؟ كله؟
**ضيّقة** = العميل نفسه أو الـ instance دي. **واسعة** = حاجة مشتركة
أو إعداد اتغيّر.

**٣. أنهي طبقة؟** DNS ← TCP ← TLS ← HTTP ← التطبيق ← الداتابيز.
**بالترتيب، ومتنططش.**

**٤. اثبتها.** أمر واحد نتيجته **تقسّم الاحتمالات نصين**.

**٥. وقّف الدم الأول.** ارجع للنسخة القديمة، **وبعدين** افهم.

:::key والخطوة ٥ هي اللي بتفرّق السينيور
الجونيور بيقعد يشخّص **والموقع واقع**. والسينيور **بيرجّع الخدمة**،
**وبعدين** يحقّق.

**وقولها بصوت عالي في الانترفيو** — عشان دي قرار تقديري، والمُحاور
مستنيها بالتحديد.
:::
:::

## The scenarios

### Kubernetes

:::q The site returns 502 for about 1% of requests. Deploys happen four times a day. Go. · ٥٠٢ لـ ١٪ من الريكوستات
The two numbers in the question are the answer: **1%** and **four deploys a
day**. Intermittent, low-percentage errors that correlate with deploys are the
**endpoint de-registration race**.

```sh
# 1. Do the 502s cluster in time? Correlate with deploy timestamps.
kubectl rollout history deploy/web

# 2. During a deploy, watch pods leave and arrive
kubectl get pods -l app=web -w

# 3. The mechanism: is there a preStop hook and a SIGTERM handler?
kubectl get deploy web -o jsonpath='{.spec.template.spec.containers[0].lifecycle}{"\n"}'
kubectl get deploy web -o jsonpath='{.spec.template.spec.terminationGracePeriodSeconds}{"\n"}'
```

**The mechanism to explain:** when a pod is deleted, two things happen **in
parallel with no ordering guarantee** — the kubelet sends `SIGTERM`, and the
endpoints controller removes the pod, after which *every node* must reprogram
its rules. In that window the pod is shutting down while nodes still route to
it.

**The fix:**

```yaml
lifecycle:
  preStop:
    exec:
      command: ["sh", "-c", "sleep 10"]   # let endpoint removal propagate
```

Plus an application that drains on `SIGTERM` instead of exiting immediately.

:::key
The insight being tested is that **Kubernetes is eventually consistent** —
"removed from the Service" and "told to shut down" are two independent
reconciliation loops. Most real Kubernetes bugs are races like this one, and a
candidate who reaches for "add more replicas" has not understood the mechanism.
:::

:::ar
**الرقمين في السؤال هما الإجابة:** ١٪، وأربع ديبلويات في اليوم.

أخطاء متقطّعة بنسبة صغيرة **ومترابطة مع الديبلويات** = **سباق إلغاء تسجيل
الـ endpoints**.

**والميكانيزم اللي تشرحه:** لما بود يتمسح، حاجتين بيحصلوا **بالتوازي
ومفيش أي ضمان للترتيب** — الـ kubelet بيبعت `SIGTERM`، **و** الـ endpoints
controller بيشيل البود، **وبعدها كل نود** لازم تعيد كتابة قواعدها.

وفي الفتحة دي، البود **بيقفل** والنودات **لسه بتبعتله**. والريكوستات دي
بتبقى ٥٠٢.

**والحل:** `preStop` فيه `sleep 10`، مع تطبيق **بيصرّف** اللي عنده عند
`SIGTERM` مش بيقفل فوراً.

**واللي بيتقاس عليه:** إنك فاهم إن **كوبرنيتيس eventually consistent**.
واللي بيقول «نزوّد replicas» **ما فهمش الميكانيزم** — الزيادة مش هتحل
سباق.
:::
:::

:::q Half the pods in a Deployment are `Pending`. `kubectl top nodes` shows 30% utilisation. · نص البودات Pending والكلاستر فاضي
The scheduler does not read utilisation. It reads **requests** — reserved
capacity, used or not.

```sh
# The number that matters: reserved, not used
kubectl describe node <node> | grep -A8 "Allocated resources"

# And why THIS pod could not be placed — Events say it outright
kubectl describe pod <pending-pod> | tail -20
```

Read the Event message, because each one points somewhere different:

| Event | Cause | Fix |
|:---|:---|:---|
| `Insufficient cpu` / `memory` | Requests exceed free *reserved* capacity | Right-size requests; add nodes |
| `untolerated taint` | Nodes reserved for other workloads | Add a matching toleration |
| `didn't match Pod's node affinity` | Affinity excludes every node | Relax it |
| `unbound immediate PersistentVolumeClaims` | No matching PV / wrong AZ | `kubectl get pvc`, check zone |
| `too many pods` | Node's pod-count limit reached, not CPU/RAM | Larger nodes, or raise the kubelet limit |

The last row is the one people miss: a node has a **maximum pod count** (110 by
default, and much lower on some cloud node types by IP-per-ENI limits). A node
can be idle and still full.

:::ar
الـ Scheduler **مش بيقرأ الاستخدام**. هو بيقرأ **الـ requests** — القدرة
**المحجوزة**، مستخدمة ولا لأ.

```sh
kubectl describe node <node> | grep -A8 "Allocated resources"   # المحجوز
kubectl describe pod <pending-pod> | tail -20                    # الـ Events
```

**واقرا رسالة الـ Event، عشان كل واحدة بتشاور على حتة تانية:**

| الرسالة | السبب |
|:---|:---|
| `Insufficient cpu`/`memory` | الـ requests أكبر من المحجوز المتاح |
| `untolerated taint` | النودات محجوزة لشغل تاني |
| `node affinity` | قواعد الـ affinity مستبعدة كل النودات |
| `unbound ... PVC` | مفيش ستوريدج مطابق، أو منطقة غلط |
| **`too many pods`** | **حد عدد البودات على النود، مش الرام** |

**والسطر الأخير هو اللي الناس بتفوّته:** كل نود ليها **حد أقصى لعدد
البودات** (١١٠ افتراضياً، وأقل بكتير على بعض أنواع سيرفرات الكلاود بسبب
حدود عدد الـ IPs).

**فالنود ممكن تكون فاضية تماماً وبرضه "مليانة".**
:::
:::

:::q A pod restarts every few minutes. Logs show nothing wrong and the app team says the code is fine. · بود بيعمل restart كل شوية واللوجز نضيفة
"Logs show nothing wrong" plus "restarts regularly" points away from the
application. Get the **exit code**, which is the actual signal.

```sh
kubectl describe pod <pod> | grep -A6 "Last State"
```

| Exit code | Meaning | Where the fault is |
|:---|:---|:---|
| `137` | SIGKILL — almost always OOM | **Memory limit**, or an unhandled `SIGTERM` timing out |
| `143` | SIGTERM — something *asked* it to stop | **The liveness probe**, or an eviction |
| `0` | It completed successfully | Wrong `command`; this should be a Job |
| `139` | Segfault | Wrong CPU architecture (`amd64` image on `arm64`) |

`137` and `143` both mean **the platform killed it**, not that the app failed —
which is exactly why the logs are clean. The app never got to log an error.

```sh
# 137: was it OOM? Check the limit against real usage
kubectl get pod <pod> -o jsonpath='{.spec.containers[*].resources}{"\n"}'
kubectl top pod <pod>

# 143: is a probe killing it?
kubectl describe pod <pod> | grep -i -A3 probe
```

:::warn The runtime-sizing trap for a `137`
An older JVM or Node process reads the **host's** total memory and sizes its
heap to that, then exceeds a much smaller container limit. Metrics graphs will
look fine because the spike lasted milliseconds and metrics sample every
15–60 seconds. `kubectl describe` reports the kernel's account, which is
authoritative.
:::

:::ar
«اللوجز نضيفة» **زائد** «بيعمل restart بانتظام» = المشكلة **بره التطبيق**.

هات **كود الخروج**، ده الإشارة الحقيقية:

```sh
kubectl describe pod <pod> | grep -A6 "Last State"
```

| الكود | معناه | المشكلة فين |
|:---|:---|:---|
| **`137`** | SIGKILL — تقريباً دايماً OOM | **حد الرام** |
| **`143`** | SIGTERM — حد **طلب** منه يقفل | **الـ liveness probe** |
| `0` | خلص بنجاح | الـ `command` غلط، المفروض Job |
| `139` | segfault | معمارية معالج غلط |

**و `137` و `143` الاتنين معناهم إن المنصة قتلته**، مش إن التطبيق فشل —
**وده بالظبط سبب إن اللوجز نضيفة**. التطبيق **معرفش يكتب إيرور** أصلاً،
هو اتقتل.

**وفخ الـ `137`:** الـ JVM القديمة (أو Node) بتقرأ رام **السيرفر كله**
وبتحجز heap على أساسه، وبعدين تتعدى حد الكونتينر الأصغر بكتير.

والجرافات بتبان مرتاحة عشان القفزة **عدّت في مللي ثانية** والمقاييس
بتتقاس كل ١٥–٦٠ ثانية. **والحكم مع الكيرنل** — يعني `kubectl describe`.
:::
:::

### Networking and DNS

:::q One service cannot reach another. `dig` works from inside the pod. · `dig` شغّال والتطبيق مش بيوصل
`dig` succeeding while the application fails is a **diagnosis, not a paradox** —
they use different code paths.

```diagram
   dig            →  asks the resolver DIRECTLY
                     skips /etc/hosts, skips search-domain expansion

   your app       →  getaddrinfo()
                     /etc/hosts → /etc/nsswitch.conf → search domains → DNS
```

```sh
# Compare the two. The difference IS the answer.
dig myservice.default.svc.cluster.local +short
getent hosts myservice          # same path the app uses

cat /etc/resolv.conf            # search domains and ndots
cat /etc/hosts                  # a stale override wins over DNS
```

| `dig` | `getent` | Where the fault is |
|:---|:---|:---|
| ✔ | ✔ | Not name resolution. Look at the port, the Service, or a NetworkPolicy |
| ✔ | ✘ | The **system lookup chain** — `ndots`, search domains, `nsswitch` |
| ✘ | ✘ | Genuine DNS failure. Check CoreDNS pods and egress to port 53 |
| ✘ | ✔ | An `/etc/hosts` entry is shadowing the name |

Then, if resolution is fine, the layers below it:

```sh
nc -zv myservice 8080     # refused = nothing listening; timeout = blocked
kubectl get endpoints myservice   # <none> = selector mismatch or not Ready
kubectl get networkpolicy -A      # policies apply to the DESTINATION
```

:::key
Reaching for `dig` first and stopping there is the most common wasted hour in
DNS debugging. The scoring insight is that **`dig` tests DNS; `getent` tests
what your application actually does** — so you run both, and the disagreement
localises the fault immediately.
:::

:::ar
إن `dig` ينجح والتطبيق يفشل، دي **مش لُغز — دي تشخيص**. الاتنين بيمشوا
في طريقين مختلفين تماماً.

**`dig`** بيسأل الـ resolver **مباشرة**، وبيتخطّى `/etc/hosts` وبيتخطّى
توسيع الـ search domains.

**تطبيقك** بيمشي على السلسلة الكاملة: `/etc/hosts` ← `nsswitch.conf` ←
search domains ← DNS.

**فشغّل الاتنين وقارن. والفرق بينهم هو الإجابة:**

| `dig` | `getent` | المشكلة فين |
|:---|:---|:---|
| ✔ | ✔ | مش ترجمة أسماء. بصّ على البورت أو الـ Service أو NetworkPolicy |
| ✔ | ✘ | **سلسلة البحث بتاعة النظام** — `ndots`، search domains |
| ✘ | ✘ | فشل DNS حقيقي. شيك على بودات CoreDNS وعلى الخروج على ٥٣ |
| ✘ | ✔ | فيه سطر في `/etc/hosts` بيغطّي على الاسم |

وبعد ما تتأكد إن الترجمة تمام، انزل للطبقات اللي تحتها:
`nc -zv` (refused مقابل timeout)، و `get endpoints`، و `networkpolicy`.
:::
:::

:::q A file upload endpoint hangs at the same point every time. Small requests are fine. · الملفات الكبيرة بتتعلّق والصغيرة تمام
Same-point hangs with size dependence is **MTU / path MTU discovery**, not
bandwidth and not the application.

Small packets fit any link. Once a packet exceeds the smallest MTU on the path,
a router must fragment it or reply `ICMP fragmentation needed`. If a firewall
blocks that ICMP, the sender never learns and retransmits the oversized packet
forever — a **PMTUD black hole**.

```diagram
   client (MTU 1500) ──→ tunnel (MTU 1400) ──→ server
        │                      │
        │  handshake, small    │  fits — everything looks healthy
        │  1500-byte payload   │  too big
        │                      │
        │  ←── ICMP "frag needed, use 1400"
        │           ✘ dropped by a firewall
        │
        └── never learns. retransmits forever. hangs at the same offset.
```

```sh
# Find the real path MTU. -M do = do not fragment
ping -M do -s 1472 <host>     # 1472 + 28 bytes of header = 1500
ping -M do -s 1372 <host>     # step down until it succeeds

ip link show                  # what MTU is actually configured
```

**Where it actually happens:** VPNs and tunnels (WireGuard, IPsec), and overlay
networks — including several Kubernetes CNIs, which encapsulate packets and so
reduce the usable MTU below 1500. The signature never varies: handshakes and
small responses fine, large payloads hang.

:::ar
تعلّق **في نفس النقطة** + **معتمد على الحجم** = **MTU**. مش سرعة نت،
ومش التطبيق.

البكتات الصغيرة بتعدّي من أي وصلة. وأول ما البكت يتعدى أصغر MTU في
الطريق، الراوتر لازم يقسّمه أو يرد `ICMP fragmentation needed`.

**ولو فيه فايروول بيمنع الـ ICMP دي** (وناس كتير بتمنعها «للأمان»)،
المرسل **عمره ما هيعرف**، وبيقعد يعيد إرسال نفس البكت الكبير للأبد.

```sh
ping -M do -s 1472 <host>     # 1472 + 28 هيدر = 1500
ping -M do -s 1372 <host>     # نزّل لحد ما ينجح
```

**وبتحصل فين فعلاً؟** في الـ VPNs والـ tunnels، وفي الشبكات المتراكبة —
**وده بيشمل كذا CNI في كوبرنيتيس**، عشان بيلفّوا البكت في بكت تاني
فالمساحة المتاحة بتقل عن ١٥٠٠.

**والتوقيع عمره ما يتغير:** الـ handshake والردود الصغيرة تمام، والحمولات
الكبيرة بتتعلّق.
:::
:::

### Linux and hosts

:::q A server is at 100% CPU. The application team says their code did not change. · ١٠٠٪ معالج والكود ما اتغيرش
Do not open `top` and stop. `top` tells you **who**; it does not tell you
**why**, and the four `vmstat` columns are where the answer is.

```sh
# 1. Is it genuinely CPU-bound? Load must be read against core count.
uptime; nproc
#   load 8 on 4 cores  = saturated
#   load 0.5 with "100%" = you are reading a single-core spike

# 2. WHERE is the time going? This is the decisive command.
vmstat 1 5
```

| Column | High means | Which is a completely different problem |
|:---|:---|:---|
| `us` | User time | Application code. The usual assumption |
| `sy` | System time | Kernel: syscalls, network, sometimes a container escaping its cgroup |
| **`wa`** | **I/O wait** | **Not CPU at all.** You are blocked on disk |
| **`st`** | **Steal** | **The hypervisor is throttling you.** Not your fault, not fixable here |

```sh
# 3. Only now, find the process
ps aux --sort=-%cpu | head
# 4. And what it is doing
strace -c -p <pid>          # syscall counts. Cheap and often decisive
```

:::warn On Linux, load average includes disk wait
This is the trap in the question. High load with idle CPU and high `wa` is a
**storage** problem, and everyone who treats all four columns as "CPU is busy"
will spend the incident optimising code while a disk dies or a noisy neighbour
steals cycles.

"The code did not change" is consistent with `wa` or `st`, and inconsistent
with `us`. That is the sentence to say.
:::

:::ar
متفتحش `top` وتقف. `top` بيقولك **مين**، مش **ليه**. والإجابة في أعمدة
`vmstat`.

```sh
uptime; nproc     # ١. هي أصلاً مشكلة معالج؟ اللود مقابل عدد الكورات
vmstat 1 5        # ٢. الوقت رايح فين؟ ← الأمر الحاسم
```

| العمود | لو عالي معناه | وده مشكلة تانية خالص |
|:---|:---|:---|
| `us` | وقت المستخدم | كود التطبيق. الافتراض المعتاد |
| `sy` | وقت النظام | الكيرنل: syscalls وشبكة |
| **`wa`** | **انتظار I/O** | **دي مش معالج خالص.** إنت مستني الديسك |
| **`st`** | **steal** | **الـ hypervisor بيخنقك.** مش غلطتك ومش بإيدك |

**والفخ في السؤال:** في لينكس **اللود بيشمل انتظار الديسك**.

فلود عالي + معالج فاضي + `wa` عالي = مشكلة **ستوريدج**. واللي بيعتبر
الأربع أعمدة كلهم «المعالج مشغول» هيقعد يظبّط كود **والديسك بيموت**.

**والجملة اللي تقولها:** «الكود ما اتغيرش» **متوافقة** مع `wa` أو `st`،
**ومتعارضة** مع `us`. فالبيانات نفسها بتوجّهنا بعيد عن الكود.
:::
:::

:::q Disk is full. `df` says 95%, `du -sh /` says 40%. · `df` بيقول مليان و `du` بيقول فاضي
Neither is lying. A deleted file is still held open by a process.

`du` walks the directory tree and sums files it can **see**. `df` asks the
filesystem how many blocks are **allocated**. When a process holds a file open
and someone `rm`s it, the directory entry is gone — so `du` cannot see it — but
the blocks are not freed until the last descriptor closes.

```sh
lsof +L1                       # files with link count 0, still open
lsof -nP | grep '(deleted)'

# Reclaim without a restart — truncate through the descriptor
: > /proc/<pid>/fd/<fd>
```

**The usual cause** is log rotation that `rm`s the log instead of truncating
it, while the application keeps writing to the same open descriptor. The fix
is `copytruncate`, or a `SIGHUP` to make the service reopen its files.

:::note And check inodes before you conclude anything
A second, separate failure looks identical from the application's side:

```sh
df -i     # IUse% at 100% with plenty of space = inodes exhausted
```

Each file consumes one inode regardless of size, so millions of tiny session
or cache files exhaust the table while using almost no space. `df -h` will
look healthy and writes will still fail with `No space left on device`.
:::

:::ar
**ولا واحد بيكدب.** فيه ملف اتمسح وعملية لسه ماسكاه مفتوح.

`du` بيمشي على الفولدرات ويجمع الملفات **اللي شايفها**. و `df` بيسأل
الفايل سيستم: **كام بلوك محجوز؟**

ولما تعمل `rm` وفيه برنامج ماسك الملف، الاسم بيتشال — فـ `du` مش شايفه —
**بس البلوكات ما اتفكّتش** لحد ما آخر عملية تسيبه.

```sh
lsof +L1                    # الملفات اللي اتمسحت ولسه مفتوحة
: > /proc/<pid>/fd/<fd>     # تفضّيها من غير ريستارت
```

**والسبب المعتاد:** سكريبت بيلف اللوجز **بيمسح** الملف بدل إنه **يفضّيه**،
والتطبيق لسه بيكتب على نفس الـ descriptor. والحل `copytruncate` أو
`SIGHUP`.

:::note واتأكد من الـ inodes قبل ما تحكم
فيه عطل تاني **مختلف تماماً** وشكله واحد من ناحية التطبيق:

```sh
df -i     # IUse% = ١٠٠٪ والمساحة موجودة  →  الـ inodes خلصت
```

كل ملف بياخد inode واحدة **مهما كان حجمه**. فمليون ملف صغير بيخلّصوا
الجدول وإنت مستخدم مساحة تقريباً صفر. و `df -h` هيبان سليم **والكتابة
هتفشل** بـ `No space left on device`.
:::
:::

### Cross-cutting

:::q Everything broke at 02:00 and nobody deployed. Where do you start? · كل حاجة باظت الساعة ٢ ومحدش نشر حاجة
"Nobody deployed" removes the most likely cause, so go to the things that
change **without** a deploy. A precise timestamp is a strong clue: it points
at something scheduled or something expiring.

```sh
# The single most valuable command when many things break at once —
# it orders everything by time and usually reveals ONE cause
kubectl get events -A --sort-by=.lastTimestamp | tail -40

journalctl --since "01:50" --until "02:20" -p warning
```

Then work the list of things that change on their own:

| Suspect | How to check | Why 02:00 |
|:---|:---|:---|
| **Certificate expiry** | `echo \| openssl s_client -connect host:443 2>/dev/null \| openssl x509 -noout -dates` | Certs expire at a precise time |
| **Cron / scheduled job** | `crontab -l`, `kubectl get cronjobs -A` | Backups and batch jobs run at night |
| **Log rotation** | `/etc/logrotate.d/`, plus the `df`/`du` case above | Runs nightly, can fill or free disk |
| **Token / secret rotation** | Cloud IAM logs, secret manager audit | Often scheduled |
| **Disk filling gradually** | `df -h`, `df -i` | Crosses the threshold at a random-looking time |
| **A dependency's deploy** | Their status page, upstream changelog | You did not deploy — *they* did |
| **DNS TTL expiry** | `dig` the record; compare to authoritative | A change hours earlier lands when caches expire |

:::key The reframe that scores
"Nobody deployed" is not "nothing changed". Certificates, cron, tokens, disk
and **other teams' deploys** all change state without anyone touching your
code. Saying that sentence explicitly shows you have run production, because
it is the lesson that only experience teaches.
:::

:::ar
«محدش نشر» بيشيل السبب الأكتر احتمالاً، فروح **للحاجات اللي بتتغير من
غير ديبلوي**.

**والتوقيت المحدد ده دليل قوي** — بيشاور على حاجة **مجدولة** أو حاجة
**بتنتهي**.

```sh
# أنفع أمر لما حاجات كتير تبوظ مع بعض:
# بيرتّب كل حاجة بالوقت، وغالباً بيكشف سبب **واحد**
kubectl get events -A --sort-by=.lastTimestamp | tail -40
journalctl --since "01:50" --until "02:20" -p warning
```

**وبعدين امشي على لستة اللي بيتغير لوحده:**

| المشتبه فيه | ليه الساعة ٢ بالتحديد |
|:---|:---|
| **شهادة انتهت** | الشهادات بتنتهي في **توقيت محدد بالثانية** |
| **cron أو job مجدولة** | الباك أب والشغل الليلي بيشتغلوا بالليل |
| **لف اللوجز** | بيشتغل بالليل، وبيملّي أو بيفضّي ديسك |
| **تجديد توكن أو سيكرت** | غالباً مجدول |
| **ديسك بيمتلي بالتدريج** | بيعدّي الحد في وقت شكله عشوائي |
| **ديبلوي حاجة إنت بتعتمد عليها** | **إنت** ما نشرتش... **هما** نشروا |
| **انتهاء TTL في الـ DNS** | تغيير حصل بالنهار بيوصل لما الكاش يخلص |

**والصياغة اللي بتاخد درجة:**

> **«محدش نشر» مش معناها «مفيش حاجة اتغيرت».**

الشهادات، والـ cron، والتوكنز، والديسك، **وديبلويات فرق تانية** — كلهم
بيغيّروا الحالة من غير ما حد يلمس كودك.

**وإنك تقول الجملة دي صريحة بتوري إنك شغّلت برودكشن فعلاً**، عشان دي
حاجة **الخبرة بس** هي اللي بتعلّمها.
:::
:::

:::q A database is slow. The team wants to add read replicas. What do you say? · الداتابيز بطيئة والفريق عايز replicas
**"Let's confirm the bottleneck is read capacity first."** Adding replicas is a
real fix for a real problem — but only for *read throughput*, and it makes
several other problems worse.

```diagram
   read replicas HELP                  read replicas DO NOT HELP
   ──────────────────                  ─────────────────────────
   too many concurrent reads           a missing index
   read-heavy analytics on the         write contention / lock waits
     primary                           a single slow query
   geographic read latency             connection-pool exhaustion
                                       N+1 queries from the app
                                            │
                                            └─ and replicas ADD
                                               replication lag, so
                                               reads can now be stale
```

Investigate in this order, because it is cheapest-first and each step can end
the conversation:

1. **Find the slow queries.** `pg_stat_statements` ordered by total time. One
   query is usually most of the load.
2. **Check for a missing index.** `EXPLAIN ANALYZE` on the worst one. A
   sequential scan on a large table is a five-minute fix, not a new server.
3. **Reads or writes?** If waits are on locks or write I/O, replicas change
   nothing.
4. **Connection pool.** Thousands of idle connections each cost memory; a
   pooler often fixes "slow" outright.
5. **Then**, if it is genuinely read throughput, add replicas — and say out
   loud that the application must now tolerate **replication lag**, so
   read-after-write flows need to go to the primary.

:::key
The signal here is whether you **measure before scaling**, and whether you
name the cost of the fix you are agreeing to. "Yes, and the trade-off is
stale reads" is a senior answer; "yes, let's add replicas" is not.
:::

:::ar
**«خلينا نتأكد الأول إن العُنق هو سعة القراءة».**

الـ read replicas **حل حقيقي لمشكلة حقيقية** — بس **لمعدّل القراءة بس**،
وبتزوّد مشاكل تانية.

بص على الرسمة: هي بتساعد في القراءات المتزامنة الكتير، **ومش بتساعد
خالص** في index ناقص، ولا في تنافس الكتابة، ولا في استعلام واحد بطيء،
ولا في connection pool مخنوق.

**وكمان بتضيف replication lag**، يعني القراءات بقت ممكن ترجّع داتا قديمة.

**والترتيب اللي تحقّق بيه — الأرخص الأول، وكل خطوة ممكن تقفل الموضوع:**

1. **هات الاستعلامات البطيئة.** `pg_stat_statements` مرتّبة بالوقت الكلي.
   غالباً **استعلام واحد** هو أغلب الحمل.
2. **شيك على index ناقص.** `EXPLAIN ANALYZE` على الأسوأ. الـ sequential
   scan على جدول كبير **إصلاح ٥ دقايق، مش سيرفر جديد**.
3. **قراءة ولا كتابة؟** لو الانتظار على locks أو على كتابة، **الـ replicas
   مش هتغيّر حاجة**.
4. **الـ connection pool.** آلاف كونيكشنز فاضية كل واحدة بتاكل رام —
   وحل الـ pooler لوحده بيصلّح «البطء» في حالات كتير.
5. **وبعدين**، لو فعلاً معدّل قراءة، ضيف replicas — **وقول بصوت عالي**
   إن التطبيق لازم يتحمّل **الـ lag**، فأي قراءة بعد كتابة لازم تروح
   للـ primary.

**والإشارة هنا:** إنك **بتقيس قبل ما تكبّر**، وإنك **بتسمّي تكلفة الحل
اللي بتوافق عليه**.

«أيوه، والتنازل إن القراءات ممكن تبقى قديمة» → إجابة سينيور.
«أيوه، يلا نضيف replicas» → لأ.
:::
:::
:::

## What goes wrong

| Mistake | Why it costs you | Instead |
|:---|:---|:---|
| Naming a tool before asking a question | Reads as pattern-matching | "What changed?" then "how wide?" |
| Fixing the first suspicious thing | This is the behaviour that extends outages | "Suspicious, but it does not explain the symptom" |
| Jumping layers | You miss the cheap answer and look unsystematic | DNS → TCP → TLS → HTTP → app → data |
| Guessing confidently | The one round where guessing is scored **down** | "I don't know yet. Here's how I'd find out" |
| Debugging while the site is down | Misses the actual priority | "First I'd roll back, then investigate" |
| Silence while typing | The interviewer cannot score what they cannot hear | Narrate what each command rules out |

:::ar
| الغلطة | بتضرّك ليه | اعمل إيه بدالها |
|:---|:---|:---|
| تسمّي أداة قبل ما تسأل سؤال | بيتقرأ إنك بتطابق أنماط | «إيه اللي اتغير؟» وبعدها «قد إيه؟» |
| تصلّح أول حاجة مريبة | **ده السلوك اللي بيطوّل الانقطاعات** | «مريبة، بس مش بتفسّر العَرَض» |
| تنطّط بين الطبقات | بتفوّت الإجابة الرخيصة وتبان مش منظّم | DNS ← TCP ← TLS ← HTTP ← تطبيق ← داتا |
| تخمّن بثقة | **الراوند الوحيدة اللي التخمين بيتحسب فيها ضدك** | «مش عارف لسه. بس هعرف كده» |
| تشخّص والموقع واقع | بتفوّت الأولوية الحقيقية | «الأول هرجّع النسخة القديمة، وبعدين أحقّق» |
| تسكت وإنت بتكتب | **المُحاور مش بيقدر يقيس حاجة مش سامعها** | قول كل أمر بيستبعد إيه |
:::

## Key takeaways

- **What changed → how wide → which layer → prove it → stop the bleeding.**
  Every scenario is an instance of this.
- **"Nobody deployed" is not "nothing changed."** Certificates, cron, tokens,
  disk, and other teams' deploys all change state on their own.
- **Restore service before you understand it**, and say that out loud.
- **Narrate what each command eliminates.** Seven commands with no narration is
  fast guessing, not debugging.
- **Never fix the first suspicious thing** — say why it does not explain the
  symptom and keep going.
- **`137` and `143` mean the platform killed it**, which is why the application
  logs are clean.
- **Measure before scaling.** "Add replicas" and "add nodes" are answers to
  specific measurements, not to slowness.

:::ar بالمصري · الخلاصة
1. **إيه اللي اتغير ← قد إيه ← أنهي طبقة ← اثبتها ← وقّف الدم.**
   كل سيناريو فوق مجرد حالة من ده.
2. **«محدش نشر» مش «مفيش حاجة اتغيرت».** الشهادات والـ cron والتوكنز
   والديسك وديبلويات الفرق التانية كلهم بيتغيروا لوحدهم.
3. **رجّع الخدمة قبل ما تفهمها**، **وقول كده بصوت عالي**.
4. **قول كل أمر بيستبعد إيه.** سبع أوامر من غير كلام = تخمين سريع،
   مش تشخيص.
5. **متصلّحش أول حاجة مريبة** — قول ليه هي مش بتفسّر العَرَض وكمّل.
6. **`137` و `143` معناهم المنصة قتلته** — وعشان كده لوجز التطبيق نضيفة.
7. **قيس قبل ما تكبّر.** «نضيف replicas» و «نضيف نودات» إجابات لقياسات
   محددة، **مش إجابات للبطء**.
:::
