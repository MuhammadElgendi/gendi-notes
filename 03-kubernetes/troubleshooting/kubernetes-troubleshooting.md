---
title: Kubernetes Troubleshooting
slug: kubernetes-troubleshooting
type: troubleshooting
domain: 03-kubernetes
tags: [kubernetes, troubleshooting, debugging]
keywords: [crashloopbackoff, imagepullbackoff, pending, oomkilled, evicted,
           describe, logs, events, exit code, 137, 143, finalizer, kubectl debug,
           مشاكل, أعطال, تشخيص, إيرور, بيكراش]
level: 2
status: stable
prerequisites: [kubernetes-basics]
related: [kubernetes-services, kubectl-commands, devops-interview-questions]
updated: 2026-09-08
---

# Kubernetes Troubleshooting

> Three commands solve most problems: `describe` tells you what Kubernetes thinks, `logs` tells you what the app said, `get endpoints` tells you why traffic is not arriving.

## Start here, every time

Whatever the symptom, this order wastes the least time:

```diagram
   something is wrong
        │
        ↓
   ① kubectl get pods            what state is it in?
        │
        ↓
   ② kubectl describe pod <p>    read the EVENTS at the bottom.
        │                        They usually name the problem outright.
        ↓
   ③ kubectl logs <p> --previous what did the app say before it died?
        │
        ↓
   ④ kubectl get endpoints <svc> is traffic even reaching it?
```

```sh title="The four commands"
kubectl get pods -o wide
kubectl describe pod <pod>        # scroll to Events
kubectl logs <pod> --previous     # --previous = the crashed container
kubectl get endpoints <service>
```

:::key `--previous` is not optional for crashes
`kubectl logs <pod>` shows the **current** container — which just started and
has printed nothing. That is why people say "there are no logs".

The logs you want belong to the container that **died**:
`kubectl logs <pod> --previous`.
:::

:::ar الأربع أوامر دول بالترتيب، ومتقلبهمش
الصفحة دي للحظة اللي حاجة بايظة وإنت مش عارف تبدأ منين. **ابدأ من هنا،
وبنفس الترتيب ده كل مرة.**

```diagram
   فيه حاجة بايظة
        │
        ↓
   ① kubectl get pods              هو في أنهي حالة؟
        │
        ↓
   ② kubectl describe pod <p>      اقرأ الـ EVENTS في آخر الصفحة.
        │                          دي بتكتبلك المشكلة بالكلام العادي.
        ↓
   ③ kubectl logs <p> --previous   التطبيق قال إيه قبل ما يموت؟
        │
        ↓
   ④ kubectl get endpoints <svc>   الترافيك أصلاً بيوصله؟
```

**والـ `describe` هي كنز الصفحة دي.** انزل لآخرها على قسم **Events** —
كوبرنيتيس بيكتب هناك المشكلة بالكلام: «الصورة مش موجودة»، «مفيش نود
فيها رام»، «الـ probe فشلت»، «الـ ConfigMap مش موجودة».

:::danger و `--previous` **مش اختيارية** لو الكونتينر بيكراش
دي أهم تفصيلة في الصفحة كلها، وناس كتير بتضيّع ساعات عليها.

لما تكتب `kubectl logs <pod>` وهو في `CrashLoopBackOff`، إنت بتشوف لوجز
**الكونتينر الجديد** — اللي لسه قام دلوقتي **ولسه ما قالش حاجة**.

وعشان كده الناس بتقول «مفيش لوجز خالص!» — لأ، فيه لوجز، بس بتاعة اللي مات.

```diagram
   kubectl logs <pod>              →  الكونتينر الشغّال دلوقتي (فاضي)
   kubectl logs <pod> --previous   →  الكونتينر اللي مات (فيه السبب) ✔
```

احفظها كده: **بيكراش؟ حط `--previous`.**
:::
:::

## Diagnose by pod status

| Status | Meaning | Go to |
|:---|:---|:---|
| `Pending` | Not placed on a node yet | [Pending](#pending) |
| `ImagePullBackOff` | Cannot download the image | [ImagePullBackOff](#imagepullbackoff) |
| `CrashLoopBackOff` | Starts, exits, repeats | [CrashLoopBackOff](#crashloopbackoff) |
| `OOMKilled` | Exceeded its memory limit | [OOMKilled](#oomkilled) |
| `Running` but broken | Usually networking or config | [Running but not working](#running-but-not-working) |
| `Terminating` forever | Stuck finalizer or ignored SIGTERM | [Stuck terminating](#stuck-terminating) |
| `Evicted` | The node ran out of resources | [Evicted](#evicted) |

---

## Pending

The scheduler could not find a home for it. The Events say why.

```sh
kubectl describe pod <pod> | tail -20
```

| Event message | Cause | Fix |
|:---|:---|:---|
| `Insufficient cpu` / `Insufficient memory` | No node has room for the **requests** | Lower requests, or add nodes |
| `node(s) had untolerated taint` | Nodes are reserved | Add a matching `toleration` |
| `pod has unbound immediate PersistentVolumeClaims` | No storage available | `kubectl get pvc` |
| `didn't match Pod's node affinity` | Affinity rules exclude every node | Relax the affinity |
| No events at all | No scheduler running, or the cluster is very unwell | `kubectl get nodes` |

:::warn Requests are what the scheduler reads, not actual usage
A pod requesting `4Gi` will not schedule on a node with `2Gi` free — even if the
app only ever uses `200Mi`. The scheduler reserves based on what you *asked
for*, not what you use.

Oversized requests are the most common cause of `Pending` on a cluster that
looks half empty. Check what you actually consume, then request close to that.
:::

:::ar
`Pending` معناها **الـ Scheduler ما لقاش للبود ده مكان**. وخلاص، مفيش
حاجة تانية. والـ Events بتقولك السبب.

| الرسالة في الـ Events | السبب | الحل |
|:---|:---|:---|
| `Insufficient cpu` / `memory` | مفيش نود فيها مكان للـ **requests** | نزّل الـ requests أو زوّد نودات |
| `untolerated taint` | النودات محجوزة لحاجة تانية | ضيف `toleration` مطابق |
| `unbound immediate PersistentVolumeClaims` | مفيش ستوريدج جاهز | `kubectl get pvc` |
| `didn't match Pod's node affinity` | قواعد الـ affinity مستبعدة كل النودات | خفّف الـ affinity |
| **مفيش events خالص** | مفيش Scheduler شغّال، أو الكلاستر تعبان جداً | `kubectl get nodes` |

:::warn الـ Scheduler بيقرأ الـ **requests**، مش الاستخدام الحقيقي
دي أهم نقطة في القسم ده.

بود كاتب `requests: 4Gi` **مش هيتحط** على نود فيها ٢ جيجا فاضية — **حتى لو
التطبيق عمره ما استخدم أكتر من ٢٠٠ ميجا**.

الـ Scheduler بيحجز على أساس اللي **إنت طلبته**، مش اللي بتستخدمه فعلاً.
هو مش بيعرف ولا بيهمه إنت هتستخدم قد إيه.

```diagram
   النود: ٤ جيجا كلها، مستخدم منها ٥٠٠ ميجا فعلاً
   ─────────────────────────────────────────────────

   بس البودات اللي عليها كاتبة  requests: 3.5Gi
                                          │
                                          ↓
   الـ Scheduler شايف:  ٤ − ٣.٥ = ٥٠٠ ميجا متاحة بس
                                          │
                                          ↓
   بودك اللي عايز ١ جيجا  →  Pending، والنود «فاضية» ٨٧٪
```

**وعشان كده الـ requests المتضخّمة هي أشهر سبب لـ `Pending` على كلاستر
شكله نصه فاضي.**

الحل: بصّ على الاستخدام الحقيقي بـ `kubectl top pods`، واكتب `requests`
قريبة منه (مع هامش معقول). ومتكتبش أرقام كبيرة «للاحتياط» — دي بتاكل
الكلاستر من غير فايدة.
:::
:::

---

## ImagePullBackOff

```sh
kubectl describe pod <pod> | grep -A5 Events
```

| Message | Cause |
|:---|:---|
| `manifest unknown` / `not found` | The tag does not exist. Check for typos |
| `unauthorized` / `authentication required` | Private registry, no credentials |
| `no such host` | The node cannot reach the registry (DNS or firewall) |
| `toomanyrequests` | Docker Hub rate limit — authenticate or mirror |

For a private registry, create a pull secret and reference it:

```sh
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=USER --docker-password=PASS
```

```yaml
spec:
  imagePullSecrets:
    - name: regcred
```

---

## CrashLoopBackOff

This is not an error type. It means "the container keeps exiting, so I am
restarting it more slowly each time" — the delay grows 10s, 20s, 40s… capped at
5 minutes. It tells you nothing about the cause.

**The exit code does.**

```sh
kubectl describe pod <pod> | grep -A6 "Last State"
```

| Exit code | Meaning | Where to look |
|:---|:---|:---|
| `0` | Exited **successfully** — the command finished | Wrong `command`; use a Job for one-shot work |
| `1` / `2` | Application error | `kubectl logs --previous` |
| `137` | 128+9 = SIGKILL — usually OOM | Memory limit |
| `139` | 128+11 = segfault | Often a wrong-architecture image (arm64 vs amd64) |
| `143` | 128+15 = SIGTERM | Something asked it to stop — often a liveness probe |

Then the usual suspects:

```sh
kubectl logs <pod> --previous          # config errors, missing env vars, stack traces
kubectl describe pod <pod> | grep -i probe    # is a probe killing it?
kubectl get configmap,secret           # does everything it references exist?
```

:::danger Exit 143 with no application error = the liveness probe
The app is fine. Kubernetes is killing it because the liveness probe failed —
often because `initialDelaySeconds` is shorter than the app's startup time.

The app starts, takes 30 seconds to be ready, the probe checks at 10 seconds,
fails, and the container is restarted before it ever serves a request. Forever.

Use a **startupProbe** for slow starters; it holds liveness off until the app is
up, instead of you having to weaken liveness permanently.
:::

:::ar `CrashLoopBackOff` **مش** نوع مشكلة
دي أول حاجة لازم تصححها في دماغك. `CrashLoopBackOff` **مش خطأ**.

معناها حرفياً: **«الكونتينر بيقفل على طول، فأنا بأبطّأ في إعادة تشغيله»**.
والتأخير بيزيد: ١٠ ثواني، ٢٠، ٤٠، ٨٠... لحد ٥ دقايق كحد أقصى.

يعني هي بتقولك إن فيه مشكلة، **بس مش بتقولك المشكلة إيه خالص.**

**اللي بيقولك هو كود الخروج (exit code):**

```sh
kubectl describe pod <pod> | grep -A6 "Last State"
```

| الكود | معناه | دوّر فين |
|:---|:---|:---|
| **`0`** | خرج **بنجاح**! الأمر خلص شغله | الـ `command` غلط. لو شغل لمرة واحدة استخدم **Job** |
| `1` / `2` | خطأ في التطبيق | `kubectl logs --previous` |
| **`137`** | 128+9 = SIGKILL — **غالباً OOM** | حد الرام |
| `139` | 128+11 = segfault | **غالباً صورة معمارية غلط** (arm64 مقابل amd64) |
| **`143`** | 128+15 = SIGTERM — **حد طلب منه يقفل** | غالباً الـ liveness probe |

**والحسبة بسيطة:** الأكواد اللي فوق ١٢٨ معناها البرنامج مات بإشارة، والإشارة
= الكود ناقص ١٢٨. فـ ١٣٧ − ١٢٨ = ٩ = `SIGKILL`. و ١٤٣ − ١٢٨ = ١٥ = `SIGTERM`.

:::danger `143` من غير أي خطأ في التطبيق = الـ liveness probe
دي حالة بتخلي الناس تدوّر في الكود ساعات، والكود سليم تماماً.

**التطبيق مش باظ. كوبرنيتيس هو اللي بيقتله.**

والسبب الشائع إن `initialDelaySeconds` أقصر من وقت إقلاع التطبيق:

```diagram
   التطبيق محتاج ٣٠ ثانية يبقى جاهز
   الـ probe بتشيك عند الثانية ١٠
   ──────────────────────────────────

   ثانية 0    التطبيق يبدأ يقوم
   ثانية 10   الـ probe تشيك  →  فشلت (طبيعي، هو لسه بيقوم!)
   ثانية 10   كوبرنيتيس يقتله ويرجّعه
   ثانية 0    التطبيق يبدأ يقوم من الأول...
              │
              └─── وللأبد. التطبيق عمره ما خدم ريكوست واحد.
```

**والحل مش إنك توسّع الـ liveness.** لو وسّعتها، خسرت الحماية للأبد.

الحل هو **`startupProbe`** — بتقول لكوبرنيتيس «متسألني بالـ liveness خالص
لحد ما دي تنجح». وبعد ما التطبيق يقوم، الـ liveness ترجع بشدّتها الطبيعية.
:::
:::

### Debugging a container that dies too fast to exec into

```sh
# Copy the pod with the entrypoint replaced by a shell. The copy does NOT
# crash, so you can inspect the config, env vars and mounts it really sees.
kubectl debug <pod> -it --copy-to=debug --container=<name> -- sh

# Distroless image with no shell? Attach a container that shares its namespaces.
kubectl debug -it <pod> --image=busybox --target=<container>
```

:::ar الكونتينر بيموت بسرعة ومش لاحق تدخله
مشكلة كلاسيكية: عايز تعمل `kubectl exec` وتبص جوه، بس الكونتينر بيموت في
ثانية فمش لاحق.

**الحل: `kubectl debug`** — وده أنفع أمر مش معروف في كوبرنيتيس.

```sh
# بياخد نسخة من البود، بس بيستبدل أمر التشغيل بـ shell.
# النسخة دي مش بتكراش، فتقدر تبص على راحتك:
# الإعدادات، متغيرات البيئة، الملفات المركّبة — كل اللي البود الحقيقي شايفه.
kubectl debug <pod> -it --copy-to=debug --container=<name> -- sh
```

وجوّه، شيك على الحاجات اللي بتوقّع التطبيقات:

```sh
env | sort                 # متغيرات البيئة موجودة؟ وقيمها صح؟
ls -la /etc/config         # الـ ConfigMap مركّبة فعلاً؟
cat /var/run/secrets/...   # السيكرت موجود؟
nc -zv db 5432             # بيوصل للداتابيز؟
```

**ولو الصورة `distroless` ومفيهاش shell أصلاً؟** فيه طريقة تانية —
بتلزق كونتينر تاني فيه أدوات جوه **نفس** البود:

```sh
kubectl debug -it <pod> --image=busybox --target=<container>
```

الـ `--target` دي بتخليه يشارك نفس الـ namespaces، فتشوف عمليات وشبكة
الكونتينر الأصلي من جوه busybox.
:::

---

## OOMKilled

```sh
kubectl describe pod <pod> | grep -i -A3 "last state"
kubectl get pod <pod> -o jsonpath='{.spec.containers[*].resources}{"\n"}'
```

Either the limit is too low, or the app leaks. Two frequent traps:

- **A runtime sizing itself from the host.** Older JVMs and some Node
  configurations read the *machine's* total memory and size their heap to it,
  then get killed for exceeding a much smaller container limit. Modern JVMs are
  container-aware; older ones need `-XX:MaxRAMPercentage` set explicitly.
- **A monitoring graph showing headroom.** Metrics are sampled every 15–60
  seconds; the spike that triggered the kill lasted milliseconds.
  `kubectl describe` reports the **kernel's** account, which is authoritative.

:::ar
`OOMKilled` معناها الكونتينر **عدّى حد الرام والكيرنل قتله**. وكود
الخروج ١٣٧.

يا إما الحد واطي، يا إما التطبيق فيه leak. **وفيه فخّين بيوقّعوا الناس:**

**١. الـ runtime بيقيس نفسه على السيرفر مش على الكونتينر**

دي أشهر مشكلة مع جافا، وبتحصل مع Node كمان.

```diagram
   السيرفر:      ٦٤ جيجا رام
   الكونتينر:    limits.memory = 512Mi
                       │
   الـ JVM القديمة بتبص على الرام بتاعة **السيرفر**
                       │
                       ↓
   بتقول: "٦٤ جيجا؟ يبقى أنا آخد ١٦ جيجا heap"
                       │
                       ↓
   أول ما تحاول تعدّي ٥١٢ ميجا  →  OOMKilled فوراً
```

الـ JVMs الحديثة بقت بتفهم الكونتينرات، بس القديمة محتاجة تقولها بإيدك:
`-XX:MaxRAMPercentage=75`.

**٢. الجراف بيوري إن فيه رام فاضية**

بتبص على Grafana وتشوف الاستخدام ٦٠٪، وبتقول «إزاي يتقتل؟».

عشان **المقاييس بتتقاس كل ١٥ لـ ٦٠ ثانية**، والقفزة اللي قتلته
**عدّت في مللي ثانية** ومحدش صوّرها.

**والحكم النهائي مع الكيرنل، مش مع الجراف.** فـ `kubectl describe` هو
المصدر الموثوق هنا، عشان هو بينقل حساب الكيرنل نفسه.
:::

---

## Running but not working

The pod is up. Traffic does not arrive, or the app misbehaves.

```sh
# 1. Does the Service have backends? This is the answer most of the time.
kubectl get endpoints <service>

# 2. Is the pod actually Ready? 0/1 means the readiness probe is failing,
#    so the Service is correctly refusing to route to it.
kubectl get pods

# 3. Bypass the Service — talk straight to a pod IP.
#    If this works, your problem is the Service or DNS, not the app.
kubectl get pod <pod> -o wide     # note the IP
kubectl run tmp --rm -it --image=busybox --restart=Never -- \
  wget -qO- --timeout=3 http://<pod-ip>:8080/healthz

# 4. Is DNS working inside the cluster?
kubectl run tmp --rm -it --image=busybox --restart=Never -- nslookup <service>

# 5. Is a NetworkPolicy blocking it? Policies apply to the DESTINATION.
kubectl get networkpolicy -A
```

:::ar «شغّال» بس مش شغّال
البود قايم، والترافيك مش بيوصل. **الترتيب ده بيقسّم المشكلة نصين في كل خطوة:**

```diagram
   ① get endpoints <svc>       فيه بودات ورا الـ Service؟
        │                       <none>؟  →  مشكلة labels أو readiness. خلاص.
        ↓ فيه
   ② get pods                  البود Ready؟
        │                       0/1؟  →  الـ readiness بتفشل. الـ Service صح.
        ↓ Ready
   ③ كلّم الـ Pod IP مباشرة     شغّال من غير الـ Service؟
        │                       شغّال؟  →  المشكلة في الـ Service أو الـ DNS
        │                       مشغّالش؟ →  المشكلة في التطبيق نفسه
        ↓
   ④ nslookup <service>        الـ DNS بيترجم؟
        ↓
   ⑤ get networkpolicy -A      فيه سياسة مانعة؟
```

**والخطوة ③ هي أهم خطوة**، عشان هي اللي بتفصل «التطبيق باظ» عن «الشبكة
باظت». اتعلمها:

```sh
kubectl get pod <pod> -o wide      # خد الـ IP
kubectl run tmp --rm -it --image=busybox --restart=Never -- \
  wget -qO- --timeout=3 http://<pod-ip>:8080/healthz
```

- **نجح؟** التطبيق سليم. المشكلة في الـ Service أو الـ DNS أو الـ NetworkPolicy.
- **فشل؟** التطبيق نفسه. سيبك من الشبكة خالص وروح للـ logs.

:::warn والـ NetworkPolicy بتتطبّق على **جهة الوصول** مش جهة الإرسال
دي بتلخبط الناس. لو بود A مش قادر يوصل بود B، السياسة اللي مانعة هي
السياسة اللي على **B** (الـ ingress بتاعته)، مش اللي على A.

وحاجة تانية: **أول ما تحط أي NetworkPolicy على namespace، كل حاجة مش
مسموحة صريحاً بتتمنع.** يعني السياسة مش بتضيف منع، هي بتقلب الافتراضي
من «كله مسموح» لـ «كله ممنوع إلا اللي كتبته».

وأشهر حاجة الناس بتنساها بعد كده: **يسمحوا بالـ DNS**. من غير `egress`
على بورت ٥٣، مفيش أي حاجة هتعرف تترجم أي اسم.
:::
:::

---

## Stuck terminating

```sh
kubectl get pod <pod> -o yaml | grep -A5 finalizers
```

Two causes:

- **The app ignores SIGTERM**, so it waits out
  `terminationGracePeriodSeconds` (default 30) and is then killed. The tell is
  that termination always takes exactly the same number of seconds.
- **A finalizer** is waiting on something that will never complete — a volume
  detach, an external controller that has been removed.

```sh
kubectl delete pod <pod> --grace-period=0 --force   # last resort
```

:::warn `--force` does not clean up
It removes the object from the API without waiting for the node to confirm the
container is gone. With a StatefulSet or an attached volume this can leave two
copies believing they own the same storage.

Use it on stateless pods. For anything with state, find out what the finalizer
is waiting for.
:::

---

## Evicted

The node ran out of memory or disk and kubelet started removing pods.

```sh
kubectl get events -A --sort-by=.lastTimestamp | grep -i evict
kubectl describe node <node> | grep -A5 Conditions
```

Look for `DiskPressure` or `MemoryPressure`. Pods with **no resource requests**
are evicted first — that alone is a good reason to always set them.

---

## Cluster-wide checks

```sh
kubectl get nodes                 # all Ready?
kubectl describe node <node> | grep -A10 "Allocated resources"
kubectl top nodes                 # actual usage (needs metrics-server)
kubectl top pods -A --sort-by=memory

# Events across the whole cluster, newest last. Often shows the real story.
kubectl get events -A --sort-by=.lastTimestamp | tail -30

# Is the control plane healthy?
kubectl get pods -n kube-system
```

`kubectl get events -A --sort-by=.lastTimestamp` is underused. When several
things break at once it usually reveals the single underlying cause.

:::ar
الأمر ده تحت مستخدم جداً، وهو أنفع حاجة لما **كل حاجة تبوظ في نفس الوقت**:

```sh
kubectl get events -A --sort-by=.lastTimestamp | tail -30
```

هو بيرتّبلك كل اللي حصل في الكلاستر كله بالوقت، الأحدث في الآخر.

**وليه ده مهم؟** عشان لما ٥ حاجات يبوظوا مع بعض، إنت بتفتكر إن فيه ٥
مشاكل. والحقيقة إن فيه **مشكلة واحدة** والباقي نتايجها.

والترتيب الزمني بيوريك **مين بدأ**. مثلاً هتلاقي: نود دخلت في
`DiskPressure` الأول، وبعدها ٤ بودات اتشالوا، وبعدها السيرفيسات وقعت.
فالمشكلة واحدة: النود.

**نصيحة عملية للحظة الأزمة:** لو الكلاستر كله ملخبط، ابدأ بالأمر ده مش
بالبودات. هو بيوفّرلك نص ساعة دوران.
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q A pod is in `CrashLoopBackOff`. Take me through your process.
The trap is answering with a *cause*. `CrashLoopBackOff` is a **restart
policy**, not a diagnosis — it means "this keeps exiting so I am backing off"
and carries no information about why.

```sh
# 1. Get the exit code. This is the actual diagnostic signal.
kubectl describe pod <pod> | grep -A6 "Last State"

# 2. Read the DEAD container's logs, not the new one's.
kubectl logs <pod> --previous

# 3. If it dies too fast to inspect, copy it with the entrypoint replaced.
kubectl debug <pod> -it --copy-to=dbg --container=app -- sh
```

Then the exit code tells you which direction to go:

| Code | Where the fault is |
|:---|:---|
| `0` | **Not a crash.** The command completed. Wrong `command`, or it should be a Job |
| `1`/`2` | Application. Logs will have a stack trace or config error |
| `137` | Memory limit (SIGKILL/OOM), or an unhandled `SIGTERM` timing out |
| `139` | Segfault — very often an `amd64` image on `arm64` hardware |
| `143` | Something **asked** it to stop. Usually the liveness probe |

:::key What separates a good answer here
Volunteering that **`0` is not a crash** and that **`143` means the platform
killed it, not the app failing**. Both redirect the investigation away from
the application code, which is where most people waste their time.
:::

:::ar
الفخ إنك تجاوب بـ **سبب**. `CrashLoopBackOff` **سياسة إعادة تشغيل**، مش
تشخيص — معناها «ده بيقفل على طول فأنا بأبطّأ»، ومفيهاش أي معلومة عن السبب.

```sh
kubectl describe pod <pod> | grep -A6 "Last State"   # ١. كود الخروج
kubectl logs <pod> --previous                         # ٢. لوجز اللي مات
kubectl debug <pod> -it --copy-to=dbg -- sh           # ٣. لو بيموت بسرعة
```

وكود الخروج بيقولك تدوّر فين:

| الكود | المشكلة فين |
|:---|:---|
| `0` | **دي مش كراشة!** الأمر خلص. الـ `command` غلط، أو المفروض تبقى Job |
| `1`/`2` | التطبيق. اللوجز فيها stack trace أو خطأ إعدادات |
| `137` | حد الرام (OOM)، أو `SIGTERM` مش متعامل معاها وخلصت المهلة |
| `139` | segfault — **غالباً صورة amd64 على هاردوير arm64** |
| `143` | حد **طلب منه** يقفل. غالباً الـ liveness probe |

**واللي يخلي إجابتك متميزة:** إنك تقول من نفسك إن **`0` مش كراشة**،
وإن **`143` معناها المنصة قتلته مش التطبيق فشل**.

الاتنين دول بيحوّلوا التحقيق **بعيد عن كود التطبيق** — وده بالظبط المكان
اللي أغلب الناس بتضيّع فيه وقتها.
:::
:::

:::q Pods are `Pending` but `kubectl top nodes` shows the cluster is only 30% used. Explain.
Because the scheduler does not look at usage at all. It looks at
**requests** — capacity you have already reserved whether you use it or not.

```diagram
   Node: 8 CPU total
   ─────────────────────────────────────────────

   Actual usage (what `top` shows):    ██░░░░░░  2 CPU  = 25%
   Sum of requests (what the
   scheduler counts):                  ███████░  7 CPU  = 87% reserved

   Your pod requests 2 CPU  →  8 − 7 = 1 available  →  Pending
```

```sh
# The number that actually matters — reserved, not used
kubectl describe node <node> | grep -A8 "Allocated resources"
```

The fix is almost never "add nodes". It is to right-size requests: measure
real consumption with `kubectl top pods`, then set requests near that plus a
margin. Inflated "just to be safe" requests are how clusters end up 80%
reserved and 25% used.

:::ar
عشان الـ Scheduler **مش بيبص على الاستخدام خالص**. هو بيبص على
**الـ requests** — يعني القدرة اللي إنت **حجزتها**، سواء بتستخدمها ولا لأ.

بص على الرسمة: النود فيها ٨ معالجات، مستخدم فعلياً ٢، **بس محجوز ٧**.
فبودك اللي عايز ٢ مش هيلاقي مكان.

**والرقم اللي يهم فعلاً:**

```sh
kubectl describe node <node> | grep -A8 "Allocated resources"
```

ده بيوريك **المحجوز**، وهو اللي الـ Scheduler بيحسب عليه — مش `kubectl top`.

**والحل تقريباً عمره ما يكون «نزوّد نودات».** الحل إنك تظبّط الـ requests:
قيس الاستخدام الحقيقي بـ `kubectl top pods`، واكتب requests قريبة منه
مع هامش.

والـ requests المتضخّمة «عشان نبقى في أمان» هي بالظبط اللي بتخلي كلاسترات
محجوزة ٨٠٪ ومستخدمة ٢٥٪ — وبتدفع فيها فلوس على الفاضي.
:::
:::

:::q A pod has been `Terminating` for 20 minutes. What is holding it, and is `--force` safe?
Two causes, and they need different responses.

**1. The app ignores `SIGTERM`.** It waits out
`terminationGracePeriodSeconds` (30 by default) and is then `SIGKILL`ed. The
tell is that deletion always takes *exactly* the same number of seconds. Fix
the app, not the deletion.

**2. A finalizer.** A finalizer is a "do not delete until I say so" marker.
The object stays until whatever owns that finalizer removes it — and if that
controller has been uninstalled, it never will.

```sh
kubectl get pod <pod> -o yaml | grep -A5 finalizers
kubectl describe pod <pod> | tail -20      # volume detach errors?
```

**Is `--force` safe? For a stateless pod, yes. For anything with state, no.**

```sh
kubectl delete pod <pod> --grace-period=0 --force
```

It deletes the API object **without waiting for the node to confirm the
container is gone**. With a StatefulSet or an attached ReadWriteOnce volume,
Kubernetes will now happily start a replacement while the original process
may still be running and holding that disk — two writers on one filesystem,
which is how you corrupt a database.

:::key
The senior instinct being tested: `--force` does not fix anything, it just
stops you from *seeing* the problem. Find out what the finalizer waits for.
:::

:::ar
سببين، وكل واحد له تصرّف مختلف.

**١. التطبيق بيتجاهل `SIGTERM`.** بيستنفد المهلة (٣٠ ثانية افتراضياً)
وبعدين بيتقتل. **والعلامة إن المسح بياخد نفس عدد الثواني بالظبط كل مرة.**
والحل هنا إنك تظبّط التطبيق، مش إنك تظبّط المسح.

**٢. فيه finalizer.** الـ finalizer علامة معناها «متمسحوش لحد ما أقولك».
والأوبجكت بيفضل موجود لحد ما الحاجة اللي حاطة العلامة تشيلها — **ولو
الكنترولر ده اتشال من الكلاستر، العلامة عمرها ما هتتشال.**

```sh
kubectl get pod <pod> -o yaml | grep -A5 finalizers
```

**والـ `--force` آمنة؟ للبود العادي أيوه. لأي حاجة فيها داتا، لأ خالص.**

```sh
kubectl delete pod <pod> --grace-period=0 --force
```

هي بتمسح الأوبجكت من الـ API **من غير ما تستنى النود تأكد إن الكونتينر
مات فعلاً**.

ومع StatefulSet أو volume من نوع ReadWriteOnce، كوبرنيتيس هيقوم يعمل
بود بديل **والعملية الأصلية ممكن تكون لسه شغالة وماسكة نفس الديسك**.

يعني **كاتبين اتنين على فايل سيستم واحد** — وده بالظبط إزاي تخرّب داتابيز.

**والحس اللي بيتقاس عليه هنا:** إن `--force` **مش بتصلّح حاجة**، هي بس
بتمنعك إنك **تشوف** المشكلة. اعرف الـ finalizer مستني إيه.
:::
:::

## Key takeaways

- **`describe` → `logs --previous` → `get endpoints`.** In that order.
- **The Events section of `describe`** names the problem most of the time.
- `CrashLoopBackOff` is a restart *policy*, not a cause. **Get the exit code.**
- **137 = OOM. 143 = something asked it to stop (usually a probe). 0 = it
  finished; wrong command.**
- `Pending` is almost always **requests too large**, not a full cluster.
- `<none>` endpoints = selector mismatch or pods not Ready.
- **`kubectl debug --copy-to`** inspects a pod that dies too fast to exec into.

:::ar الخلاصة (دي اللي تقراها الساعة ٣ الفجر)
1. **`describe` ← `logs --previous` ← `get endpoints`.** بالترتيب ده.
2. **قسم Events في الـ `describe`** بيكتبلك المشكلة بالكلام في أغلب الحالات.
3. **`CrashLoopBackOff` سياسة مش سبب.** هات **كود الخروج**.
4. **`137` = رام. `143` = حد طلب منه يقفل (غالباً probe). `0` = خلص شغله،
   يعني الـ command غلط.**
5. **`Pending` تقريباً دايماً requests كبيرة**، مش كلاستر مليان. بصّ على
   `Allocated resources` مش على `top`.
6. **`<none>` في الـ endpoints** = selector غلط أو بودات مش Ready.
7. **`kubectl debug --copy-to`** لما الكونتينر يموت بسرعة ومش لاحق تدخله.
8. **كل حاجة بايظة مع بعض؟** ابدأ بـ
   `kubectl get events -A --sort-by=.lastTimestamp` — بيوريك **مين بدأ**.
:::
