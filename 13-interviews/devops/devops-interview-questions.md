---
title: DevOps Interview Questions
slug: devops-interview-questions
type: interview
domain: 13-interviews
tags: [interviews, devops, senior]
keywords: [interview, questions, senior, staff, behavioural, troubleshooting,
           whiteboard, انترفيو, اسئلة, مقابلة, تحضير]
level: 4
status: stable
prerequisites: [linux-basics, docker, kubernetes-basics]
related: [docker, kubernetes-troubleshooting, ci-cd, terraform, linux-commands]
updated: 2026-09-08
---

# DevOps Interview Questions

> Almost nobody is rejected for not knowing a command. They are rejected for not being able to say *why*, and for having no method when the question has no clean answer.

## What is it?

A worked set of the questions senior DevOps, SRE and Platform interviews
actually ask — with the answer, and with what the interviewer is really
listening for underneath it.

Every answer here is collapsed on purpose. Read the question, answer it out
loud, **then** open it. A question you have read the answer to feels known; a
question you have answered out loud *is* known. Those are very different things
in a room with a stranger.

:::ar
الصفحة دي فيها الأسئلة اللي بتتسأل فعلاً في انترفيوهات الـ DevOps والـ SRE
للمستويات المتقدمة — بالإجابة، وكمان **بالحاجة اللي المُحاور بيقيسها**
من ورا السؤال، وهي دي اللي بتفرق.

كل إجابة مقفولة عن قصد. اقرأ السؤال، جاوبه بصوت عالي، **وبعدين** افتح.

والفرق ده مهم جداً: السؤال اللي قرأت إجابته بتحس إنك عارفه. السؤال اللي
جاوبته بصوت عالي إنت **فعلاً** عارفه. والاتنين شكلهم مختلف تماماً وإنت
قاعد في أوضة مع حد مش عارفك.
:::

## Why it exists

Most preparation fails in the same way: you memorise definitions, the
interviewer asks "and why would you do that?", and there is nothing there.

Senior interviews are not knowledge tests. They are **judgement tests wearing
a knowledge costume**. The question is a pretext; the interviewer wants to hear
how you decide.

| What juniors prepare | What seniors are asked |
|:---|:---|
| "What is a Service?" | "Why is this Service returning 503 for 1% of requests?" |
| "What does `terraform apply` do?" | "Someone changed it in the console. Now what?" |
| "What is a container?" | "Why is this image 1.2 GB and how do you know?" |
| Definitions | Trade-offs, failure modes, and what you would measure |

:::ar
معظم الناس بتحضّر غلط بنفس الطريقة: بتحفظ تعريفات، والمُحاور يسأل «وليه
نعمل كده؟» ومفيش إجابة.

الانترفيوهات المتقدمة **مش اختبار معلومات**. دي اختبار **حكم وتقدير**
لابس هدوم اختبار معلومات. السؤال نفسه مجرد ذريعة — هو عايز يسمع إنت
**بتقرر إزاي**.

بصّ على الجدول اللي فوق. الفرق مش في الصعوبة، الفرق في **نوع** السؤال.
الجونيور بيتسأل «إيه هي»، والسينيور بيتسأل «ليه» و«لو باظت تعمل إيه»
و«هتقيس إيه».
:::

## What it is made of

A senior DevOps loop is usually five conversations, and they are scored
differently. Knowing which room you are in changes how you should answer.

| Round | What it looks like | What it actually scores |
|:---|:---|:---|
| **Screen** | Rapid-fire definitions | Can you speak the vocabulary fluently |
| **Troubleshooting** | "The site is slow. Go." | Method under uncertainty |
| **System design** | "Design a deploy pipeline for 200 services" | Trade-offs and scale reasoning |
| **Coding / scripting** | Parse logs, write a small tool | Can you actually build, not just configure |
| **Behavioural** | "Tell me about an outage you caused" | Honesty, ownership, whether you learn |

:::key
The troubleshooting round is the one that decides most offers, and it is the
one people prepare least. It is also the only round where **saying "I don't
know yet, here is how I would find out" scores higher than a confident guess.**
:::

:::ar إنت في أنهي أوضة؟
الانترفيو للمستوى المتقدم عادةً خمس مقابلات، وكل واحدة بتتقاس بمعيار مختلف.
وأهم حاجة إنك **تعرف إنت في أنهي واحدة**، عشان الإجابة الصح في أوضة تبقى
غلط في أوضة تانية.

| الراوند | شكلها | بتقيس إيه فعلاً |
|:---|:---|:---|
| **Screen** | أسئلة سريعة وتعريفات | بتتكلم المصطلحات بطلاقة ولا لأ |
| **Troubleshooting** | «الموقع بطيء، اتفضل» | عندك **منهج** في الغموض |
| **System design** | «صمّملي pipeline لـ ٢٠٠ سيرفيس» | بتفكر في التنازلات والحجم |
| **Coding** | اكتب سكريبت يقرأ لوجز | بتبني فعلاً ولا بتظبّط إعدادات بس |
| **Behavioural** | «حكيلي عن outage إنت سببته» | أمانة، ومسؤولية، وبتتعلم ولا لأ |

وراوند الـ **troubleshooting** هي اللي بتحدد أغلب القرارات، وهي بالظبط اللي
الناس بتحضّرلها أقل حاجة.

وهي كمان الراوند الوحيدة اللي فيها **«مش عارف لسه، بس هعرف بالطريقة دي»
بتاخد درجة أعلى من تخمين واثق**. في باقي الراوندز التخمين ممكن يعدّي. هنا لأ.
:::

## How to use it

### The method that works in every troubleshooting round

When you are handed a broken system, do not start naming tools. Narrow the
blast radius out loud, in this order:

```diagram
   1. WHAT CHANGED?            deploys · config · certs · DNS · traffic
            │                  (70% of incidents end here)
            ↓
   2. HOW WIDE IS IT?          one user / one pod / one AZ / everything
            │                  narrow = client or instance
            │                  wide   = dependency or config
            ↓
   3. WHICH LAYER?             DNS → TCP → TLS → HTTP → app → database
            │                  walk it in order, do not jump
            ↓
   4. PROVE IT                 one command whose result splits the
            │                  possibilities in half
            ↓
   5. STOP THE BLEEDING        roll back first, understand second
                               (say this part out loud — seniors do)
```

:::ar المنهج ده يشيلك في أي سؤال debugging
لما يسلّمك سيستم باظ، **متبدأش تسمّي أدوات**. أسوأ حاجة تعملها إنك تقول
«هبص في الـ Grafana» — دي إجابة فاضية.

اللي بيفرق إنك تضيّق دايرة الشك **بصوت عالي**، بالترتيب ده:

**١. إيه اللي اتغير؟** ديبلوي؟ إعداد؟ شهادة انتهت؟ DNS؟ الترافيك زاد؟
حوالي ٧٠٪ من المشاكل بتخلص عند السؤال ده. لو ما سألتوش، إنت بتخمّن.

**٢. المشكلة قد إيه؟** واقعة على يوزر واحد؟ بود واحد؟ منطقة كاملة؟ كل حاجة؟
ضيّقة = المشكلة في العميل نفسه أو في instance معيّنة.
واسعة = المشكلة في حاجة الكل بيعتمد عليها، أو في إعداد اتغير.

**٣. في أنهي طبقة؟** امشي بالترتيب: DNS ← TCP ← TLS ← HTTP ← التطبيق ←
الداتابيز. **ومتنططش.** اللي بينطط بيدور ساعة في حاجة كان يكشفها في دقيقة.

**٤. اثبتها.** أمر واحد نتيجته تقسّم الاحتمالات نصين. مش عشرة أوامر.

**٥. وقّف الدم الأول.** ارجع للنسخة القديمة، وبعدين افهم. وقول الجزئية دي
بصوت عالي في الانترفيو — عشان دي بالظبط اللي بتفرّق السينيور عن غيره:
السينيور بيرجّع الخدمة الأول وبيفهم بعدين، والجونيور بيقعد يفهم والموقع واقع.
:::

### Answering a design question without rambling

Four moves, in order. Most candidates skip the first and never recover.

1. **Ask about scale and constraints.** Requests per second? How many
   services? What is the team size? A design for 5 services and one for 500
   are different designs, and picking without asking is the actual mistake.
2. **State the trade-off you are optimising for.** "I will optimise for
   rollback speed over deploy speed, because…"
3. **Draw the boxes**, then the arrows, then *label the arrows*.
4. **Say what your design is bad at.** Volunteering this is the strongest
   single signal of seniority in the whole loop.

:::ar
أربع خطوات بالترتيب. ومعظم الناس بتنسى الأولى ومش بتعرف تلحق نفسها بعدها.

**١. اسأل عن الحجم والقيود.** كام request في الثانية؟ كام سيرفيس؟ الفريق
كام واحد؟ التصميم لـ ٥ سيرفيسات مختلف تماماً عن تصميم لـ ٥٠٠، وإنك تختار
من غير ما تسأل **دي هي الغلطة**، مش اختيارك.

**٢. قول إنت بتحسّن إيه على حساب إيه.** «أنا هركّز على سرعة الرجوع للخلف
أكتر من سرعة النشر، عشان...»

**٣. ارسم المربعات، وبعدين الأسهم، وبعدين اكتب على الأسهم.** سهم من غير
كلام مكتوب عليه معناه «الحاجتين دول ليهم علاقة»، وده الشخص اللي قصادك
عارفه أصلاً.

**٤. قول تصميمك ضعيف في إيه.** إنك تقول دي **من نفسك** من غير ما هو يسأل،
دي أقوى إشارة على إنك سينيور في الانترفيو كله. اللي بيقول «التصميم ده
مثالي» بيوري إنه ما شغّلوش في البرودكشن.
:::

## The questions

### Linux and troubleshooting

:::q A server is at 100% CPU. Walk me through it. · السيرفر معلّق على ١٠٠٪
Do not open `top` and stop there. `top` tells you *who*; it does not tell you
*why*.

```sh title="The order that actually narrows it"
# 1. Is it CPU-bound at all? Check load vs core count first.
uptime; nproc
# load 8.0 on 4 cores = genuinely saturated
# load 0.5 with "100% CPU" = you are misreading a single-core spike

# 2. WHERE is the time going? This is the question top answers badly.
vmstat 1 5
#   us high  → application code
#   sy high  → kernel: syscalls, network, often a container escaping cgroups
#   wa high  → NOT CPU. You are blocked on disk. Different problem entirely.
#   st high  → steal. The hypervisor is throttling you. Not your fault.

# 3. Now find the process.
top -o %CPU        # or: ps aux --sort=-%cpu | head

# 4. And what is it doing?
strace -c -p <pid>   # syscall counts — cheap and often decisive
```

:::key What is really being tested
That you distinguish `wa` (I/O wait) and `st` (steal) from real CPU load.
A candidate who treats all four columns as "CPU is busy" will spend a real
outage optimising code when the disk is dying or the hypervisor is
oversubscribed.
:::

:::ar
متفتحش `top` وتقف. `top` بيقولك **مين**، مش بيقولك **ليه**.

**١. هل هي أصلاً مشكلة معالج؟** `uptime` و `nproc`. لود ٨ على ٤ كورات =
مخنوق فعلاً. لود ٠.٥ وإنت شايف «١٠٠٪» = إنت بتقرأ سبايك على كور واحد وبتفهمها غلط.

**٢. الوقت رايح فين؟** `vmstat 1 5` — والأعمدة دي أهم حاجة في الإجابة كلها:

| العمود | معناه | يعني إيه |
|:---|:---|:---|
| `us` | user | الكود بتاع التطبيق |
| `sy` | system | الكيرنل: syscalls وشبكة |
| `wa` | I/O wait | **دي مش مشكلة معالج خالص!** إنت مستني الديسك |
| `st` | steal | الـ hypervisor بيخنقك. مش غلطتك أنت |

**٣. بعد كده** دوّر على العملية: `top -o %CPU`.
**٤. وهي بتعمل إيه؟** `strace -c -p <pid>`.

**والحاجة اللي بتتقاس:** إنك تفرّق بين `wa` و `st` وبين اللود الحقيقي.
اللي بيعتبر الأربع أعمدة كلهم «المعالج مشغول» هيقعد في مشكلة حقيقية
يظبّط كود، والمشكلة أصلاً إن الديسك بيموت أو السيرفر متشير عليه.
:::
:::

:::q `df` says the disk is full. `du` says there is plenty of space. Who is lying?
**Neither. A deleted file is still held open by a process.**

`du` walks the directory tree and adds up files it can see. `df` asks the
filesystem how many blocks are allocated. When a process has a file open and
someone `rm`s it, the directory entry is gone — so `du` cannot see it — but the
inode and its blocks are not freed until the last file descriptor closes.

Classic cause: log rotation that deletes the log instead of truncating it,
while the application keeps writing to the same open descriptor.

```sh
# Find the deleted-but-open files and who is holding them
lsof +L1
lsof -nP | grep '(deleted)'

# Fix: signal the app to reopen its logs, or restart it.
# Truncating via the descriptor also works and needs no restart:
: > /proc/<pid>/fd/<fd>
```

:::ar
**ولا واحد فيهم بيكدب.** فيه ملف اتمسح وعملية لسه ماسكاه مفتوح.

`du` بيمشي على الفولدرات ويجمع الملفات **اللي شايفها**. أما `df` بيسأل
الفايل سيستم نفسه: «كام بلوك محجوز؟».

ولما تعمل `rm` لملف وفيه برنامج لسه ماسكه مفتوح، الاسم بيتشال من الفولدر —
فـ `du` مش شايفه خلاص — لكن **البلوكات نفسها ما اتفكّتش** لحد ما آخر
عملية تسيب الملف.

والسبب الكلاسيكي: سكريبت بيلف اللوجز و **بيمسح** الملف بدل إنه **يفضّيه**،
والتطبيق لسه بيكتب على نفس الـ descriptor القديم.

الحل: `lsof +L1` تشوف مين ماسك إيه، وبعدها إما تعمل ريستارت، أو تفضّي
الملف من الـ descriptor نفسه من غير ريستارت خالص:
`: > /proc/<pid>/fd/<fd>`
:::
:::

:::q Your app can reach a service by IP but not by name. Where do you look?
Walk the resolution path in order; do not guess.

```sh
# 1. What does the app think the resolver is?
cat /etc/resolv.conf        # in a pod: is it the cluster DNS IP?

# 2. Does the resolver answer at all?
dig @<that-ip> myservice.default.svc.cluster.local

# 3. Does it answer for a public name? (separates "DNS is down"
#    from "this record is missing")
dig @<that-ip> example.com

# 4. Is something short-circuiting it before DNS is consulted?
cat /etc/hosts
cat /etc/nsswitch.conf      # order of hosts: files dns
```

Common causes, in the order they actually occur: `search` domain and `ndots`
making a short name expand wrongly; the DNS pods themselves being
unhealthy or rate-limited; a `NetworkPolicy` that forgot to allow egress to
port 53; and `/etc/hosts` overriding the name on one node only.

:::ar
امشي على مسار الترجمة بالترتيب، **ومتخمّنش**.

**١. التطبيق فاكر إن الـ resolver مين؟** `cat /etc/resolv.conf`. جوه بود،
اتأكد إن الـ IP ده هو DNS الكلاستر.

**٢. الـ resolver بيرد أصلاً؟** `dig @<الـ IP> اسم-السيرفيس`.

**٣. بيرد على اسم عام؟** `dig @<الـ IP> example.com`. الخطوة دي بتفصل بين
«الـ DNS واقع» و «الريكورد ده مش موجود» — وده فرق كبير.

**٤. فيه حاجة بتقطع الطريق قبل الـ DNS؟** `/etc/hosts` و `/etc/nsswitch.conf`.

وأشهر الأسباب بترتيب حدوثها الحقيقي: إعداد `search` و `ndots` بيوسّع الاسم
القصير بشكل غلط، أو بودات الـ DNS نفسها تعبانة، أو `NetworkPolicy` ناسية
تسمح بالخروج على بورت ٥٣، أو `/etc/hosts` بيغطّي على الاسم في نود واحدة بس.
:::
:::

### Kubernetes

:::q A Pod is `Running` but the Service returns 503. Where is the fault?
**`Running` is not `Ready`, and a Service only sends traffic to `Ready`.**

```sh
# The single most useful command here — is the endpoint list empty?
kubectl get endpointslices -l kubernetes.io/service-name=my-svc
# Empty endpoints = the Service is matching nothing that is Ready.
```

Then work through the four things that produce an empty endpoint list:

| Cause | How you confirm it |
|:---|:---|
| Selector does not match the Pod labels | `kubectl get pods --show-labels` vs the Service selector |
| Readiness probe failing | `kubectl describe pod` → probe events |
| `targetPort` names a port the container does not expose | Compare Service `targetPort` to the container's `containerPort` |
| Pod is `Terminating` and already de-registered | `kubectl get pods -w` during a deploy |

:::key
The mechanism worth stating: a Service is not a proxy in the request path
that "finds" pods. It is a set of rules programmed into every node from the
**EndpointSlice**, and the EndpointSlice only lists Ready pods. So "503 with a
Running pod" is nearly always "this pod never became Ready".
:::

:::ar
**`Running` مش معناها `Ready`**، والـ Service بيبعت ترافيك للـ Ready بس.

أنفع أمر في الحالة دي:
`kubectl get endpointslices -l kubernetes.io/service-name=my-svc`

لو اللستة **فاضية**، يبقى الـ Service مش لاقي أي بود جاهز. وفيه أربع
أسباب بس بيعملوا كده:

| السبب | تتأكد منه إزاي |
|:---|:---|
| الـ selector مش مطابق للـ labels | `kubectl get pods --show-labels` وقارن |
| الـ readiness probe بتفشل | `kubectl describe pod` وبصّ على الـ events |
| الـ `targetPort` بيشاور على بورت مش مفتوح | قارن `targetPort` بالـ `containerPort` |
| البود بيقفل و اتشال من اللستة | `kubectl get pods -w` وإنت بتعمل ديبلوي |

**والميكانيزم اللي لازم تقوله بصوت عالي:** الـ Service **مش** بروكسي واقف في
طريق الريكوست وبيدوّر على البودات. الـ Service مجموعة قواعد بتتكتب في كل نود،
والقواعد دي بتتبني من الـ **EndpointSlice**، والـ EndpointSlice مفيهاش غير
البودات الـ Ready.

فعشان كده «٥٠٣ والبود شغّال» معناها دايماً تقريباً «البود ده عمره ما بقى Ready».
:::
:::

:::q What actually happens between `kubectl apply` and a running container?
The answer they want is the control loop, not a list of nouns.

```diagram
   kubectl apply
        │  HTTP POST, authenticated
        ↓
   ┌──────────────────┐
   │   API server     │  authn → authz (RBAC) → admission → validate
   │                  │  writes the desired state to etcd. THAT IS ALL.
   └──────────────────┘  nothing has been scheduled yet
        │
        │  controllers are WATCHING etcd, not being called
        ↓
   ┌──────────────────┐
   │ Deployment ctrl  │  sees a Deployment with no ReplicaSet → creates one
   └──────────────────┘
        ↓
   ┌──────────────────┐
   │ ReplicaSet ctrl  │  sees 0/3 pods → creates 3 Pod objects
   └──────────────────┘  (still just rows in etcd — nodeName is empty)
        ↓
   ┌──────────────────┐
   │   Scheduler      │  sees pods with no nodeName
   │                  │  filters feasible nodes → scores them → binds
   └──────────────────┘  writes nodeName back. Still nothing running.
        ↓
   ┌──────────────────┐
   │ kubelet on node  │  sees a pod bound to ITSELF
   │                  │  calls the CRI runtime → pulls image → starts it
   └──────────────────┘  reports status back up
```

:::key The sentence that gets you the point
"Nothing in Kubernetes calls anything. Every component watches the API server
for a difference between desired and actual state, and acts to close the gap."
That is why it self-heals, and why a broken controller looks like *nothing
happening at all* rather than an error.
:::

:::ar
اللي هو عايز يسمعه هو **حلقة التحكّم**، مش لستة أسماء.

بص على الرسمة اللي فوق، بس الأهم هو الفكرة دي:

**مفيش حاجة في كوبرنيتيس بتنادي على حاجة.** الـ API server بيكتب في etcd
وبس، وبعد كده كل المكوّنات التانية **بتراقب** وبتشوف فرق بين اللي إنت
طلبته واللي موجود فعلاً، وبتتحرك تقفل الفرق ده.

الترتيب باختصار:

1. `kubectl apply` → الـ API server يتأكد من هويتك، يشوف صلاحياتك (RBAC)،
   يعدّي الطلب على الـ admission، ويكتب في etcd. **وخلاص، مفيش حاجة اتجدولت.**
2. الـ Deployment controller بيشوف deployment من غير ReplicaSet، فيعمل واحدة.
3. الـ ReplicaSet controller بيشوف ٠ من ٣ بودات، فيعمل ٣ Pod objects —
   ولسه مجرد صفوف في etcd، الـ `nodeName` فاضي.
4. الـ Scheduler بيشوف بودات من غير نود، بيفلتر النودات المناسبة، بيديهم
   نقط، وبيختار. **ولسه مفيش حاجة شغالة**، هو بس كتب اسم النود.
5. الـ kubelet على النود دي بيشوف بود متربط **بيه هو**، فبينادي على الـ
   runtime، بينزّل الصورة، وبيشغّلها.

**والجملة اللي هتجيبلك الدرجة:** «مفيش حاجة بتنادي حاجة، كله بيراقب ويقارن
ويتحرك». وعشان كده السيستم بيصلّح نفسه، **وعشان كده كمان** لما كنترولر
يبوظ، اللي بتشوفه مش error — اللي بتشوفه إن **مفيش حاجة بتحصل خالص**.
:::
:::

:::q Why did the OOM killer take my container when the node had free memory?
Because the limit that applied was **your** limit, not the node's.

A `resources.limits.memory` becomes a cgroup memory ceiling for that
container. Exceed it and the kernel OOM-kills the process inside the cgroup
regardless of how much RAM the node still has. `kubectl describe pod` shows
`OOMKilled` with exit code 137.

The follow-up is the real question — the difference between requests and
limits:

| | `requests` | `limits` |
|:---|:---|:---|
| Used by | the **scheduler**, to place the pod | the **kernel**, at runtime |
| Too low | pod is placed on a node that cannot really hold it | OOMKilled under normal load |
| Too high | wasted capacity, pods stay `Pending` | little effect on its own |

:::warn A CPU limit and a memory limit fail completely differently
Exceeding a memory limit **kills** the container — memory cannot be
throttled. Exceeding a CPU limit only **throttles** it: the app goes slow
and stays alive, which is far harder to notice. Aggressive CPU limits are a
common, invisible cause of latency that no dashboard attributes correctly.
:::

:::ar
عشان الحد اللي طبّق عليك هو **حدك إنت**، مش حد النود.

لما تكتب `resources.limits.memory`، الرقم ده بيتحول لسقف cgroup للكونتينر
ده. تعدّيه، الكيرنل بيقتل العملية جوه الـ cgroup **مهما كان النود فاضي**.
و `kubectl describe pod` بيوريك `OOMKilled` وكود خروج ١٣٧.

والسؤال اللي بيجي بعده هو السؤال الحقيقي — الفرق بين `requests` و `limits`:

| | `requests` | `limits` |
|:---|:---|:---|
| مين بيستخدمها | الـ **scheduler** عشان يحط البود | الـ **كيرنل** وقت التشغيل |
| لو قليلة | البود بيتحط على نود مش شايلاه | بيتقتل OOM في الشغل العادي |
| لو كبيرة | هدر في الموارد، والبودات تقعد `Pending` | مش بتأثر كتير لوحدها |

**وأهم حاجة تعرفها:** حد الرام وحد المعالج **بيفشلوا بشكل مختلف تماماً**.

تعدّي حد الرام؟ الكونتينر **بيموت**، عشان الرام مش بتتخنق. تعدّي حد
المعالج؟ الكونتينر **بيتخنق بس** — البرنامج بيبقى بطيء وعايش، وده أصعب
بكتير إنك تلاحظه. وحدود المعالج المتشددة دي سبب شائع ومخفي للـ latency،
ومفيش داشبورد بينسبه للسبب الصح.
:::
:::

### CI/CD, IaC and process

:::q Someone changed infrastructure in the cloud console. Terraform state is now wrong. What do you do?
Answer in two halves — the fix, then the reason it happened. Only giving the
first half reads as junior.

**The fix:**

```sh
terraform plan          # see the drift; do NOT apply blindly
terraform refresh       # or: terraform apply -refresh-only
                        # reconciles state with reality, changes nothing real
terraform import ...    # if they created something Terraform doesn't know about
```

Decide deliberately: does the console change stay (import it and write the
code to match) or go (let `apply` revert it)? Reverting someone's emergency
fix without asking causes a second incident.

**The reason:** console write access existed at all. The durable fix is
process, not commands — remove human write permissions in production, make
the pipeline the only identity that can apply, and add drift detection on a
schedule so you find this in an hour rather than in six weeks.

:::key
Interviewers ask this to see whether you reach for `terraform state rm`.
That command deletes Terraform's knowledge of a real resource and orphans
it — it is occasionally correct and usually a disaster. Naming it *and*
saying when it is wrong scores very well.
:::

:::ar
جاوب على نصين: **الحل**، وبعدين **سبب حدوثها من الأصل**. اللي بيقول النص
الأول بس بيبان جونيور.

**الحل:**

`terraform plan` الأول تشوف الفرق — **ومتعملش apply على أعمى**. بعدين
`terraform apply -refresh-only` عشان توفّق الـ state مع الواقع من غير ما
تغيّر أي حاجة حقيقية. ولو هما عملوا حاجة جديدة تيرافورم مش عارفها،
`terraform import`.

وبعد كده **قرّر بوعي**: التغيير اللي اتعمل من الكونسول يفضل (تعمله import
وتكتب الكود بحيث يطابقه) ولا يروح (تسيب الـ apply يرجّعه)؟

وخد بالك — إنك ترجّع إصلاح طارئ عمله حد تاني من غير ما تسأله، ده بيعمل
**مشكلة تانية**.

**والسبب الحقيقي:** إن حد كان معاه صلاحية كتابة على الكونسول من الأساس.
الحل الدايم **عملية، مش أوامر**: اشيل صلاحيات الكتابة البشرية من
البرودكشن، خلّي الـ pipeline هي الهوية الوحيدة اللي تقدر تعمل apply،
وحطّ drift detection بيشتغل بجدول عشان تكتشف ده في ساعة مش في ٦ أسابيع.

**وسبب السؤال ده أصلاً:** هو عايز يشوف هل هتمد إيدك على `terraform state rm`.
الأمر ده بيمسح معرفة تيرافورم بمورد حقيقي **ويسيبه يتيم** — أحياناً بيكون
صح، وغالباً بيكون كارثة. إنك تسمّيه **وتقول امتى يبقى غلط**، دي بتاخد
درجة عالية جداً.
:::
:::

:::q Deploys are safe but take 40 minutes. The team wants them under 5. Where do you start?
**Measure the stages before you touch any of them.** Then attack in this
order, because the order reflects where the time usually is:

| Suspect | Typical fix |
|:---|:---|
| Tests run serially | Shard across parallel runners; split unit from integration |
| Dependencies re-downloaded each run | Cache the dependency directory, keyed on the lockfile hash |
| Docker layers rebuilt each run | Registry-backed layer cache; order the Dockerfile by change frequency |
| The whole monorepo rebuilds | Build only what changed, from the dependency graph |
| Sequential deploy to N environments | Promote the *same artefact*; never rebuild per environment |

:::key The trap in this question
The tempting answer is "run the tests in parallel and skip the slow ones."
Skipping tests trades the property they actually asked you to keep — deploys
are **safe** — for the one they asked you to improve. Say explicitly that
you are not going to reduce coverage, then find the time elsewhere.
:::

:::ar
**قيس المراحل قبل ما تلمس أي حاجة.** وبعدين هات المشاكل بالترتيب ده، عشان
الترتيب ده بيعكس الوقت بيروح فين فعلاً:

| المشتبه فيه | الحل المعتاد |
|:---|:---|
| التستات بتشتغل واحدة ورا التانية | وزّعها على runners متوازية، وافصل unit عن integration |
| الـ dependencies بتتنزّل كل مرة | كاش للفولدر، والمفتاح hash الـ lockfile |
| طبقات الدوكر بتتبني كل مرة | layer cache على الـ registry، ورتّب الـ Dockerfile |
| المونوريبو كله بيتبني | ابني اللي اتغير بس، من شجرة الاعتماديات |
| الديبلوي لكل بيئة على التوالي | رقّي **نفس الـ artifact**، ومتبنيش تاني لكل بيئة |

**والفخ في السؤال ده:** الإجابة المغرية هي «نشغّل التستات بالتوازي ونشيل
البطيئة منها».

إنك تشيل تستات معناه إنك **بعت الحاجة اللي هما طلبوا تحافظ عليها** —
إن الديبلوي **آمن** — عشان تحسّن الحاجة التانية. قول بصريح العبارة إنك
مش هتقلل التغطية، وبعدها دوّر على الوقت في حاجة تانية.
:::
:::

### The trap questions

:::q How do you achieve 100% uptime? · إزاي توصل ٩٩.٩٩٩٩٩٪؟
**You do not, and agreeing to try is the failed answer.**

100% is not a target, it is a category error. Your cloud provider will not
sell it to you, your upstream DNS does not have it, and the marginal cost of
each nine rises roughly tenfold while the marginal user benefit falls.

The correct move is to reframe:

- Ask what the users actually notice. Availability of *what*, measured
  *where* — at the load balancer, or from the user's browser?
- Set an **SLO** below 100% and derive an **error budget** from it. 99.9%
  monthly is ~43 minutes of allowed downtime.
- Point out that the budget is a *feature*: with zero allowed downtime you
  can never deploy, patch, or migrate anything.

:::key
This question is a maturity test. The interviewer wants to know whether you
will nod along to an impossible commitment, or push back with numbers. Push
back with numbers.
:::

:::ar
**مش هتوصلها، وإنك توافق تجرّب دي هي الإجابة الفاشلة.**

الـ ١٠٠٪ مش هدف، دي غلطة في التفكير نفسه. مزوّد الكلاود بتاعك مش بيبيعها
لك في العقد، والـ DNS اللي فوقك مش عنده ١٠٠٪، وكل «تسعة» زيادة بتكلّف
حوالي عشرة أضعاف اللي قبلها والفايدة اللي اليوزر بيحسها بتقل.

الحركة الصح إنك **تعيد صياغة السؤال**:

- اسأل: اليوزر بيحس بإيه فعلاً؟ إتاحة **إيه** بالظبط، ومقيسة **فين** —
  عند الـ load balancer؟ ولا من براوزر اليوزر نفسه؟
- حدّد **SLO** أقل من ١٠٠٪، وطلّع منه **error budget**. مثلاً ٩٩.٩٪ في
  الشهر = حوالي ٤٣ دقيقة توقف مسموح بيها.
- ووضّح إن الميزانية دي **ميزة مش عيب**: لو مسموح بصفر توقف، يبقى إنت
  عمرك ما هتقدر تعمل ديبلوي ولا patch ولا migration لأي حاجة.

**والسؤال ده اختبار نضوج.** هو عايز يعرف: هتهزّ دماغك موافق على التزام
مستحيل، ولا هتعترض **بأرقام**؟ اعترض بأرقام.
:::
:::

:::q Should we move everything to Kubernetes? · نروّح كل حاجة على كوبرنيتيس؟
The expected answer is not yes or no. It is **"what problem are we solving?"**

Kubernetes buys you bin-packing across many services, a uniform deploy
interface, and self-healing. It costs you a control plane to operate, a
networking model to learn, and a permanent platform-shaped headcount.

| Kubernetes earns its cost when | Reach for something simpler when |
|:---|:---|
| Many services, many teams, one platform team | Three services and no platform team |
| Bin-packing genuinely saves money | A managed runtime already fits |
| You need uniform deploys across teams | One team ships one monolith |

Saying "it depends" and stopping is also a fail. Name the *specific*
condition that would decide it — team size, service count, whether anyone is
on call for the cluster.

:::ar
الإجابة المتوقعة مش «أيوه» ولا «لأ». الإجابة هي: **«إحنا بنحل مشكلة إيه؟»**

كوبرنيتيس بيديك: توزيع كفء للموارد على سيرفيسات كتير، وطريقة نشر موحّدة،
وسيستم بيصلّح نفسه. وبياخد منك: control plane لازم حد يشغّله، وموديل
شبكات لازم الفريق يتعلّمه، **وراس بشري دايم** شغلته المنصة دي.

| كوبرنيتيس يستاهل تكلفته لما | خُد حاجة أبسط لما |
|:---|:---|
| سيرفيسات كتير وفرق كتير وفريق منصة | تلات سيرفيسات ومفيش فريق منصة |
| توزيع الموارد بيوفّر فلوس فعلاً | فيه managed runtime كفاية |
| محتاج نشر موحّد بين الفرق | فريق واحد بيشيل مونوليث واحد |

وخد بالك: إنك تقول **«حسب الحالة»** وتسكت، دي كمان رسوب. سمّي **الشرط
المحدد** اللي هيحدد القرار: حجم الفريق، عدد السيرفيسات، فيه حد أصلاً
هيبقى on-call للكلاستر ولا لأ.
:::
:::

:::q Tell me about an outage you caused. · حكيلي عن مشكلة إنت سببتها
There is one wrong answer: "I can't think of one." It reads as either
inexperience or dishonesty, and it is the single most common way strong
candidates lose the behavioural round.

Structure it in four beats and keep it under two minutes:

1. **What broke, and the blast radius** — in user terms, not component terms.
   "Checkout failed for about 8% of users for 20 minutes."
2. **What you did to stop it** — and how long detection took. Be specific.
3. **The real root cause** — a missing guardrail, not a person. "The migration
   had no dry-run step" beats "I ran the wrong command."
4. **What you changed so the class of failure cannot recur** — and say whether
   it *has* recurred. That last part is what proves the story is real.

:::warn Do not pick a trivial outage to look safe
An interviewer hearing a five-minute staging blip concludes you have never
operated anything that mattered. Pick something real and own it. Ownership
without defensiveness is the entire signal being measured.
:::

:::ar
فيه إجابة واحدة غلط: **«مش فاكر حاجة».** دي بتتقرأ إما إن إنت معندكش خبرة،
أو إنك مش بتقول الحقيقة. ودي أشهر طريقة إن حد قوي يخسر الراوند دي.

رتّبها في أربع نقط، وخليها أقل من دقيقتين:

**١. إيه اللي باظ، وقد إيه.** بلغة اليوزر مش بلغة المكوّنات. «الـ checkout
فشل لحوالي ٨٪ من اليوزرز لمدة ٢٠ دقيقة».

**٢. عملت إيه توقّفها**، وأخدت قد إيه لحد ما اكتشفتوها. كن محدد.

**٣. السبب الجذري الحقيقي** — وده **حاجة ناقصة في النظام، مش شخص**.
«الـ migration ما كانش فيها خطوة تجريبية» أحسن بكتير من «أنا كتبت أمر غلط».

**٤. غيّرت إيه بحيث النوع ده من الأعطال ما يتكررش** — وقول هل **اتكرر**
بعد كده ولا لأ. الجزئية الأخيرة دي هي اللي بتثبت إن الحكاية حقيقية.

**وخد بالك:** متختارش مشكلة تافهة عشان تبان في أمان. لو حكيت عن مشكلة ٥
دقايق في staging، هو هيستنتج إنك عمرك ما شغّلت حاجة ليها قيمة. اختار حاجة
حقيقية واتحمّل مسؤوليتها.

**والمقياس كله** هو: مسؤولية من غير دفاع عن النفس.
:::
:::

## What goes wrong

| Mistake | Why it costs you the offer | Instead |
|:---|:---|:---|
| Naming tools before asking questions | Reads as pattern-matching, not diagnosis | Ask about scale, blast radius, what changed |
| Confident guessing in a debugging round | The one round where guessing is scored *down* | "I don't know yet. Here is how I'd find out." |
| Answering "it depends" and stopping | True but empty | Name the condition that decides it |
| Only describing the happy path | Suggests you have never operated it | Volunteer the failure mode unprompted |
| Blaming a person in a postmortem story | Signals a culture problem you would bring | Blame the missing guardrail |
| Claiming you have caused no outages | Reads as inexperience or dishonesty | Pick a real one and own it |

:::danger The most expensive habit: answering the question you wish you were asked
You are asked "why is this Service returning 503?" and you deliver a clear
explanation of what a Service *is*.

It feels like a good answer. It is a **wrong** answer, and interviewers read
it as either not listening or not knowing. If you need to establish the
mechanism first, say so out loud in one sentence — "let me state the
mechanism, then use it" — and then actually answer the question asked.
:::

:::ar
**وأغلى غلطة على الإطلاق:** إنك تجاوب على السؤال اللي **كنت متمنى** يسألك
عليه.

هو سألك: «ليه الـ Service ده بيرجّع ٥٠٣؟» وإنت شرحتله شرح جميل ومترابط
عن **إيه هو الـ Service**.

الإجابة دي **بتحس** إنها إجابة كويسة. وهي **غلط**، والمُحاور بيقراها على
إنك يا إما مش بتسمع، يا إما مش عارف.

ولو فعلاً محتاج توضّح الميكانيزم الأول عشان تبني عليه، **قول كده بصوت
عالي في جملة واحدة**: «خليني أوضّح إزاي بيشتغل الأول وبعدين أجاوب» —
وبعدها **جاوب على السؤال اللي هو سأله فعلاً**.
:::

## Key takeaways

- **The question is a pretext.** Every senior question is really "how do you
  decide?" Answer that and you have answered the question.
- **Ask before you design.** Scale and constraints change the answer, and
  choosing without asking is the actual mistake being tested.
- **In a debugging round, method beats knowledge.** What changed → how wide →
  which layer → prove it → stop the bleeding.
- **Volunteer the weakness of your own answer.** It is the strongest single
  signal of seniority available to you.
- **Blame the missing guardrail, never the person.** In a postmortem story
  this is the whole test.
- **Rehearse out loud.** Reading an answer and being able to say it are
  different skills, and only one of them is in the room with you.

:::ar الخلاصة
- **السؤال مجرد ذريعة.** كل سؤال متقدم معناه الحقيقي «إنت بتقرر إزاي؟».
  جاوب على ده تبقى جاوبت على السؤال.
- **اسأل قبل ما تصمّم.** الحجم والقيود بيغيّروا الإجابة، وإنك تختار من غير
  ما تسأل دي هي الغلطة اللي بيتقاس عليها.
- **في راوند الـ debugging، المنهج أهم من المعلومة.** إيه اللي اتغير ←
  المشكلة قد إيه ← أنهي طبقة ← اثبتها ← وقّف الدم.
- **قول ضعف إجابتك بنفسك.** دي أقوى إشارة على السينيورتي متاحة لك.
- **لُم على الحاجة الناقصة في النظام، مش على شخص.** في حكاية أي مشكلة
  إنتاج، دي هي كل الاختبار.
- **تمرّن بصوت عالي.** إنك تقرأ إجابة وإنك تعرف تقولها حاجتين مختلفين،
  وواحدة بس منهم هي اللي بتبقى معاك في الأوضة.
:::
