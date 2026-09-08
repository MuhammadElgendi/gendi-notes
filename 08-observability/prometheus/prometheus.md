---
title: Prometheus
slug: prometheus
type: guide
domain: 08-observability
tags: [prometheus, metrics, observability]
keywords: [promql, scrape, exporter, counter, gauge, histogram, rate,
           alertmanager, cardinality, service discovery, recording rule,
           بروميثيوس, مقاييس, مراقبة, تنبيهات]
level: 2
status: stable
prerequisites: [kubernetes-basics]
related: [slo-and-error-budgets, kubernetes-troubleshooting,
          devops-interview-questions]
updated: 2026-09-08
---

# Prometheus

> Prometheus does not receive metrics — it goes and fetches them, on a timer, and that one design decision explains almost everything else about it.

## What is it?

Prometheus is a metrics database with a query language. It periodically fetches
numbers from your applications over HTTP, stores them with a timestamp, and lets
you ask questions about how they change over time.

```diagram
   your app                    Prometheus                you
   ────────                    ──────────                ───
   exposes /metrics    scrape   stores samples   PromQL   "what is the
   as plain text       ←─────   as time series   ←─────   error rate?"
                       every
                       15s
```

:::ar
بروميثيوس **داتابيز للأرقام**، ومعاها لغة استعلام.

هو كل شوية (كل ١٥ ثانية مثلاً) بيروح **يجيب** أرقام من تطبيقاتك عن طريق
HTTP، بيخزّنها ومعاها **الوقت**، وبعد كده تقدر تسأله أسئلة عن **إزاي
الأرقام دي بتتغير مع الوقت**.

**وأهم كلمة في الجملة اللي فوق هي «بيجيب».**

بروميثيوس **مش بيستقبل** — هو **بيروح ياخد**. وده اسمه **pull**، والعكس
(إن التطبيق يبعت) اسمه **push**.

والقرار ده هو سبب **كل حاجة تانية** في بروميثيوس، حلوة وحشة. فخد بالك منه
من الأول وباقي الصفحة هتبقى منطقية.
:::

## Why it exists

Logs tell you what happened in **one** request. Metrics tell you what is
happening across **all** of them, cheaply enough to keep for a year.

| Question | Logs | Metrics |
|:---|:---|:---|
| "Why did *this* request fail?" | ✔ the right tool | ✘ |
| "What fraction of requests fail?" | expensive to compute | ✔ |
| "Is latency worse than last Tuesday?" | practically impossible | ✔ |
| "Alert me when errors exceed 1%" | fragile | ✔ |

A metric is a number with labels, sampled over time. That is a much smaller
thing to store than a log line, which is why you can afford to keep it long
enough to compare against last month.

:::ar بالمصري · الفرق بين اللوجز والمقاييس
دي نقطة الناس بتلخبط فيها، وبتحاول تستخدم واحدة مكان التانية.

**اللوجز** بيقولوك حصل إيه في **ريكوست واحد**. **والمقاييس** بيقولوك
إيه اللي بيحصل في **كل الريكوستات**، وبتكلفة رخيصة كفاية إنك تحتفظ
بيها سنة.

| السؤال | اللوجز | المقاييس |
|:---|:---|:---|
| «ليه **الريكوست ده** فشل؟» | ✔ **دي أداتها** | ✘ |
| «كام نسبة الريكوستات اللي بتفشل؟» | مكلّفة جداً تحسبها | ✔ |
| «الـ latency أوحش من الثلاتاء اللي فات؟» | **مستحيلة عملياً** | ✔ |
| «نبّهني لما الأخطاء تعدي ١٪» | هشّة | ✔ |

**فكّر فيها كده:** اللوجز زي **كاميرا مراقبة** — بتوريك حادثة معيّنة
بالتفصيل، بس مش هتقعد تتفرج على سنة تسجيل.

والمقاييس زي **عدّاد** — بيقولك «دخل ٤٠ ألف عربية النهاردة» في رقم
واحد، فتقدر تقارنه بأمبارح وبالشهر اللي فات.

**وإنت محتاج الاتنين.** المقاييس بتقولك **إن فيه مشكلة**، واللوجز بتقولك
**المشكلة إيه**.
:::

## What it is made of

| Piece | What it does |
|:---|:---|
| **Prometheus server** | Scrapes targets, stores samples, evaluates rules |
| **Exporter** | Translates something that does not speak Prometheus into `/metrics` |
| **`/metrics` endpoint** | Plain text your app exposes. That is the whole protocol |
| **Service discovery** | Finds what to scrape (Kubernetes API, DNS, files) |
| **PromQL** | The query language |
| **Alertmanager** | A separate process: deduplicates, groups and routes alerts |
| **Recording rule** | Precomputes an expensive query on a timer |

### The four metric types

Choosing the wrong one is the most common modelling mistake.

| Type | Only goes | Use for | Query it with |
|:---|:---|:---|:---|
| **Counter** | Up (or resets to 0) | Requests, errors, bytes — things that *accumulate* | `rate()` |
| **Gauge** | Up and down | Temperature, queue depth, memory in use | directly |
| **Histogram** | Up (buckets) | Latency, request sizes | `histogram_quantile()` |
| **Summary** | Up | Latency, when you cannot aggregate | directly (avoid; see below) |

:::key A counter's value is meaningless. Its *rate* is the metric.
`http_requests_total` is 4,192,043 — a number that tells you nothing, because
it counts since the process started.

What you want is **how fast it is increasing**:

```promql
rate(http_requests_total[5m])     # requests per second, averaged over 5m
```

`rate()` also handles counter **resets** correctly: when a pod restarts, the
counter drops to 0, and `rate()` knows that is a restart rather than a
negative rate. Computing this yourself with subtraction does not.
:::

:::ar بالمصري · أنواع المقاييس، واختيار الغلط منهم
| النوع | بيتحرّك إزاي | بتستخدمه لإيه | بتسأله بإيه |
|:---|:---|:---|:---|
| **Counter** | **لفوق بس** (أو يرجع صفر) | ريكوستات، أخطاء، بايتات — حاجة **بتتراكم** | `rate()` |
| **Gauge** | فوق وتحت | حرارة، طول طابور، رام مستخدمة | مباشرة |
| **Histogram** | لفوق (في خزانات) | الـ latency، أحجام الريكوستات | `histogram_quantile()` |
| **Summary** | لفوق | نفس الـ histogram، بس **متجمّعهاش** | مباشرة (بلاش، شوف تحت) |

:::key وقيمة الـ counter نفسها **مالهاش أي معنى**
لو `http_requests_total` = ٤,١٩٢,٠٤٣ — الرقم ده **مش بيقولك حاجة**، عشان
هو بيعدّ **من أول ما العملية قامت**. ممكن يكون بقاله ٦ شهور.

**اللي إنت عايزه هو بيزيد بأي سرعة:**

```promql
rate(http_requests_total[5m])     # ريكوست في الثانية، متوسط على ٥ دقايق
```

**والـ `rate()` كمان بتتعامل مع الـ resets صح.** لما البود يعمل restart،
العدّاد بيرجع صفر — والـ `rate()` **فاهمة** إن ده restart مش معدّل سالب.

ولو حسبتها بإيدك بالطرح، هتطلّعلك أرقام سالبة غريبة كل مرة بود يقوم.

**فالقاعدة: مع أي `_total`، حُطّها جوه `rate()`. دايماً.**
:::
:::

## How to use it

### PromQL — the queries you will actually write

```promql
# Requests per second, by status code
sum(rate(http_requests_total[5m])) by (status)

# Error RATIO — the shape of almost every SLO query.
# Note both halves are rates, so the units cancel.
sum(rate(http_requests_total{status=~"5.."}[5m]))
  /
sum(rate(http_requests_total[5m]))

# p99 latency from a histogram.
# rate() first, then sum by the le label, THEN the quantile.
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# Memory per pod, top 5
topk(5, container_memory_working_set_bytes{namespace="prod"})

# A target that has stopped responding
up == 0
```

:::warn `rate()` before `sum()`, never the other way round
`sum(rate(x[5m]))` is correct. `rate(sum(x)[5m])` is wrong and will not even
parse in the way you expect.

`rate()` must see each individual time series so it can detect that series'
counter resets. Summing first merges several series into one, at which point a
single pod restarting looks like a global decrease — and the result is
silently, plausibly wrong, which is worse than an error.
:::

:::ar
| الاستعلام | بيجيب إيه |
|:---|:---|
| `sum(rate(x[5m])) by (status)` | ريكوست/ثانية مقسّم على كود الحالة |
| `sum(rate(errors[5m])) / sum(rate(total[5m]))` | **نسبة** الأخطاء — شكل أي SLO |
| `histogram_quantile(0.99, ...)` | الـ p99 |
| `up == 0` | هدف بطّل يرد |

**واقرا استعلام النسبة تاني:** البسط والمقام **الاتنين** `rate()`. وعشان
كده الوحدات **بتلغي بعضها** وبتطلّع نسبة نضيفة من ٠ لـ ١.

:::danger و `rate()` **قبل** `sum()`، والعكس غلط
```promql
sum(rate(x[5m]))     ← صح ✔
rate(sum(x)[5m])     ← غلط ✘
```

**ليه؟** عشان `rate()` لازم تشوف **كل سلسلة زمنية لوحدها** عشان تكتشف
الـ counter resets بتاعتها.

ولو جمعت الأول، إنت دمجت كذا سلسلة في واحدة — وساعتها **بود واحد بيعمل
restart بيبان كإنه نقص عام في كل حاجة**.

**والنتيجة بتبقى غلط في سكوت، ومعقولة الشكل** — وده أسوأ بكتير من إيرور
واضح، عشان هتبني عليها تنبيهات وقرارات.
:::
:::

### Scraping in Kubernetes

You do not list targets by hand. Prometheus asks the Kubernetes API what
exists, and re-checks continuously.

```yaml title="A ServiceMonitor — the Operator way"
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app
  labels:
    release: prometheus     # must match the Prometheus instance's selector
spec:
  selector:
    matchLabels:
      app: my-app           # which SERVICE to scrape (not the pods directly)
  endpoints:
    - port: metrics         # the NAME of the port in the Service, not a number
      interval: 15s
      path: /metrics
```

:::warn Two label selectors have to line up, and neither errors if it does not
A `ServiceMonitor` is found by Prometheus via **its own labels** matching the
Prometheus resource's `serviceMonitorSelector`. It then finds pods via
`spec.selector` matching the **Service's** labels.

Get either wrong and nothing is scraped — with **no error anywhere**. Check
Prometheus's own *Targets* page: if your job is not listed at all, the first
selector is wrong; if it is listed as `0/0 up`, the second is.
:::

:::ar
إنت **مش بتكتب لستة أهداف بإيدك**. بروميثيوس بيسأل الـ API بتاع كوبرنيتيس
«فيه إيه؟» وبيعيد السؤال على طول.

وده معناه إن بود جديد يقوم، **يتم مراقبته تلقائياً**. وبود يموت، **يتشال**.

:::danger وفيه **اتنين selectors** لازم يتطابقوا، ومفيش إيرور لو ما اتطابقوش
دي أشهر مشكلة مع الـ Prometheus Operator، وبتضيّع وقت رهيب:

```diagram
   Prometheus resource
        │  serviceMonitorSelector: { release: prometheus }
        │
        ↓  ← selector رقم ١: لازم يطابق **labels الـ ServiceMonitor**
   ServiceMonitor  (labels: release: prometheus ✔)
        │  spec.selector: { app: my-app }
        │
        ↓  ← selector رقم ٢: لازم يطابق **labels الـ Service**
   Service  (labels: app: my-app ✔)
        │
        ↓
   Pods  ← دي اللي بتتسكرَب فعلاً
```

**وغلطة في أي واحد منهم = مفيش أي مقاييس، ومفيش أي رسالة إيرور في أي مكان.**

**وإزاي تعرف مين الغلطان؟** افتح صفحة **Targets** في بروميثيوس نفسه:

- الـ job بتاعك **مش موجود خالص** في اللستة → **selector رقم ١** غلط.
- موجود بس مكتوب جنبه **`0/0 up`** → **selector رقم ٢** غلط.

والتفرقة دي بتوفّر عليك نص ساعة في كل مرة.
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| Target not in the Targets page | `serviceMonitorSelector` mismatch | Compare the ServiceMonitor's labels |
| Target listed `0/0 up` | `spec.selector` does not match the Service | `kubectl get svc --show-labels` |
| `context deadline exceeded` | The app's `/metrics` is slower than the scrape timeout | Fix the endpoint, or raise `scrapeTimeout` |
| Prometheus OOMs, disk fills | **Cardinality explosion** | See below |
| Graph has gaps | Scrape failures, or the pod restarted | `up` over the same range |
| Negative or absurd rates | `sum()` applied before `rate()` | `rate()` innermost, always |
| Alerts fire in a storm | No grouping in Alertmanager | `group_by`, and alert on symptoms not causes |

:::danger Cardinality is the way Prometheus actually dies
Every unique **combination** of label values is a separate time series, held in
memory. So a label with unbounded values multiplies your series count without
limit.

```promql
# One series per user. With 100k users, 100k series — from ONE metric.
http_requests_total{user_id="12345"}      ✘

# Never put these in a label:
#   user IDs · request IDs · session IDs · email addresses
#   full URL paths with IDs in them (/orders/8821)
#   timestamps · raw error messages
```

Keep labels to values from a **small, fixed set**: `method`, `status`,
`route` (the *template* `/orders/:id`, not the filled path), `service`.

**The rule of thumb:** if you cannot write down every possible value of a
label, it does not belong in a label. High-cardinality detail belongs in logs
or traces, which are built for it.

```promql
# Find your worst offenders
topk(10, count by (__name__)({__name__=~".+"}))
```
:::

:::ar بالمصري · الـ cardinality هي اللي بتقتل بروميثيوس فعلاً
دي أهم حاجة في الصفحة، وأشهر طريقة بروميثيوس بيموت بيها في الشغل.

**كل تركيبة مختلفة من قيم الـ labels = سلسلة زمنية منفصلة، متخزّنة في
الرام.**

فـ label قيمه **غير محدودة** بيضرب عدد السلاسل عندك **من غير أي سقف**:

```promql
http_requests_total{user_id="12345"}      ✘ سلسلة لكل يوزر!
```

**١٠٠ ألف يوزر = ١٠٠ ألف سلسلة، من مقياس واحد.** وبعدها بروميثيوس
بياكل الرام كلها ويموت، والديسك بيمتلي.

**متحطّش الحاجات دي في labels أبداً:**

| ممنوع | ليه |
|:---|:---|
| `user_id`، `request_id`، `session_id` | **بلا حدود** |
| إيميلات | بلا حدود، **وبيانات شخصية كمان** |
| المسار الكامل `/orders/8821` | كل أوردر سلسلة جديدة |
| الوقت، أو رسالة الإيرور الكاملة | بلا حدود |

**واللي ينفع:** قيم من **مجموعة صغيرة وثابتة** — `method` (٥ قيم)،
`status` (شوية أكواد)، `route` (**القالب** `/orders/:id` مش المسار
المليان)، `service`.

**والقاعدة اللي تحكم بيها:**

> **لو مش قادر تكتب كل القيم المحتملة للـ label ده على ورقة، يبقى
> مش مكانه label.**

والتفاصيل عالية التنوّع دي **مكانها اللوجز أو الـ traces** — دي مبنية
عشان كده أصلاً.

```promql
topk(10, count by (__name__)({__name__=~".+"}))   # هات أوحش المقاييس عندك
```
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q Why does Prometheus pull instead of push? What does that cost you?
Pull means Prometheus initiates the connection on a timer. The benefits fall
out of that directly:

| Pull gives you | Because |
|:---|:---|
| A free health signal (`up`) | Failing to scrape *is* the signal. No extra check needed |
| No client-side configuration | The app exposes text; it does not know Prometheus exists |
| No app-side buffering or backpressure | The app never queues metrics or blocks on a slow backend |
| Trivial local debugging | `curl localhost:9090/metrics` shows exactly what Prometheus sees |

**What it costs:**

- **Short-lived jobs** may finish between scrapes and never be seen. That is
  what the **Pushgateway** exists for — and it is the *only* correct use of
  it, because a Pushgateway holds values forever and destroys the `up` signal.
- **Targets must be reachable** from Prometheus. Behind NAT, in a customer's
  network, or on a serverless platform, that may be impossible.
- **Resolution is bounded by the scrape interval.** A 15-second interval
  cannot see a 2-second spike, which is why an OOM kill often does not appear
  on the graph at all.

:::key
That last point is the one worth volunteering: **metrics are sampled**, so
`kubectl describe` reporting `OOMKilled` while the memory graph looks
comfortable is not a contradiction — the spike happened between two scrapes.
The kernel's account is authoritative; the graph is a sample.
:::

:::ar
الـ pull معناها إن بروميثيوس هو اللي **بيفتح الاتصال** كل فترة. والفوايد
كلها بتطلع من ده مباشرة:

| الـ pull بتديك | ليه |
|:---|:---|
| **إشارة صحة مجانية** (`up`) | إن السكرَب **يفشل** هو نفسه الإشارة |
| مفيش إعدادات في التطبيق | التطبيق بيعرض نص، **ومش عارف إن بروميثيوس موجود** |
| مفيش تخزين مؤقت في التطبيق | التطبيق عمره ما بيقف مستني backend بطيء |
| تشخيص محلي سهل | `curl localhost:9090/metrics` بيوريك **بالظبط** اللي بروميثيوس شايفه |

**والتكلفة:**

**١. الـ jobs القصيرة** ممكن تخلص بين سكرَبتين ومحدش يشوفها. وعشان كده
الـ **Pushgateway** موجود — **ودي استخدامها الصح الوحيد**، عشان هي
بتمسك القيم للأبد وبتلغي إشارة الـ `up`.

**٢. الأهداف لازم بروميثيوس يوصلها.** ورا NAT، أو في شبكة عميل، أو على
منصة serverless — ممكن تكون مستحيلة.

**٣. الدقة محدودة بفترة السكرَب.** فترة ١٥ ثانية **مش هتشوف** قفزة ثانيتين.

**والنقطة التالتة دي قولها من نفسك في الانترفيو:**

**المقاييس بتتقاس بالعيّنة.** فإن `kubectl describe` يقول `OOMKilled`
وجراف الرام يبان مرتاح — **ده مش تعارض**. القفزة حصلت **بين سكرَبتين**.

**والحكم مع الكيرنل، والجراف مجرد عيّنة.**
:::
:::

:::q What is a cardinality explosion, and how would you find one?
Every unique combination of label values is one time series, held in memory.
A label whose values are unbounded therefore multiplies series without limit
until Prometheus exhausts RAM.

```promql
# Which metric names have the most series?
topk(10, count by (__name__)({__name__=~".+"}))

# Total series — the number to watch
prometheus_tsdb_head_series

# Which label is responsible, for one metric
count(count by (user_id) (http_requests_total))
```

**The usual culprits:** user IDs, request IDs, session IDs, email addresses,
full URL paths containing IDs, and raw error strings.

**The test to state:** *if you cannot enumerate every possible value of a
label, it does not belong in a label.* Route templates (`/orders/:id`) are
fine; filled paths (`/orders/8821`) are not.

High-cardinality detail belongs in **logs or traces**, which are designed for
exactly that and do not hold it in memory.

:::warn Metric relabelling is the containment tool
When a third-party exporter emits a bad label and you cannot change the
source, drop it at scrape time with `metric_relabel_configs`. That is the
correct fix — not raising Prometheus's memory limit, which only delays the
same failure.
:::

:::ar
كل تركيبة مختلفة من قيم الـ labels = **سلسلة زمنية واحدة، في الرام**.

فـ label قيمه بلا حدود بيضرب عدد السلاسل **من غير سقف** لحد ما بروميثيوس
يخلّص الرام.

```promql
topk(10, count by (__name__)({__name__=~".+"}))   # أنهي مقاييس فيها أكتر سلاسل
prometheus_tsdb_head_series                        # العدد الكلي — راقبه
count(count by (user_id) (http_requests_total))    # أنهي label هو السبب
```

**والمعتاد:** `user_id`، `request_id`، `session_id`، إيميلات، مسارات
كاملة فيها أرقام، ونصوص الأخطاء الخام.

**والاختبار اللي تقوله:** *لو مش قادر تعدّ كل القيم المحتملة للـ label،
يبقى مش مكانه label.* قوالب المسارات (`/orders/:id`) تمام. المسارات
المليانة (`/orders/8821`) لأ.

**والتفاصيل عالية التنوّع مكانها اللوجز أو الـ traces.**

:::warn وأداة الاحتواء هي الـ relabelling
لو exporter من طرف تالت بيطلّع label وحش وإنت مش قادر تغيّر المصدر،
**اشيله وقت السكرَب** بـ `metric_relabel_configs`.

**ده الحل الصح** — مش إنك ترفع حد الرام بتاع بروميثيوس، عشان ده بيأجّل
نفس الفشل بس.
:::
:::

:::q What should you alert on: CPU usage, or the error rate?
**The error rate — and more generally, symptoms rather than causes.**

Alert on what the *user* experiences: request failures, latency, and budget
burn rate. Alert on causes only when they are both actionable and not yet
visible as a symptom — a disk that will fill in four hours, a certificate
expiring in a week.

| Alert on | Why |
|:---|:---|
| Error ratio, latency, burn rate | The user feels these. They are the point |
| `up == 0` for a whole job | Nothing is being measured; you are blind |
| Disk filling within N hours | Actionable *before* it becomes a symptom |
| Certificate expiry | Predictable, and preventable |

| Do not alert on | Why |
|:---|:---|
| CPU at 80% | Users cannot feel utilisation. It may be perfectly healthy |
| Memory at 80% | Linux uses free memory as cache; this is normal |
| A single pod restarting | The system is *designed* to survive that |
| Anything with no runbook | If there is no action, it is not an alert |

:::key The principle to name
**Every page must have an action.** An alert that a human looks at, shrugs at,
and closes has trained the team to ignore alerts — and it will do that to the
real ones too. The same reasoning as a flaky test in CI, and worth saying out
loud because it connects two areas.
:::

:::ar
**نسبة الأخطاء. وبشكل عام: نبّه على الأعراض، مش على الأسباب.**

نبّه على اللي **اليوزر بيحسه**: فشل الريكوستات، والـ latency، ومعدّل
استهلاك الميزانية.

ونبّه على الأسباب **بس** لما تكون قابلة للتصرّف **ولسه مش ظاهرة كعَرَض** —
ديسك هيمتلي بعد ٤ ساعات، شهادة هتنتهي بعد أسبوع.

| نبّه على | ليه |
|:---|:---|
| نسبة الأخطاء، الـ latency، الـ burn rate | **اليوزر بيحسها.** دي المهمة |
| `up == 0` لـ job كامل | **مفيش حاجة بتتقاس، إنت أعمى** |
| ديسك هيمتلي في ساعات | قابل للتصرّف **قبل** ما يبقى عَرَض |
| انتهاء الشهادات | متوقّع، **وممكن تمنعه** |

| **متنبّهش** على | ليه |
|:---|:---|
| المعالج ٨٠٪ | **اليوزر مش بيحس بالاستخدام.** ممكن يكون كله تمام |
| الرام ٨٠٪ | لينكس بياخد الفاضي كـ cache. **ده طبيعي** |
| بود واحد بيعمل restart | **السيستم متصمّم** إنه يستحمل ده |
| أي حاجة **مفيش لها runbook** | لو مفيش تصرّف، **يبقى دي مش تنبيه** |

**والمبدأ اللي تسمّيه بالاسم:**

> **كل تنبيه لازم يكون له تصرّف.**

التنبيه اللي بني آدم يبصّ عليه، يهزّ كتافه، ويقفله — **ده علّم الفريق
يتجاهل التنبيهات**. وهو هيعمل كده **مع التنبيهات الحقيقية كمان**.

**ونفس منطق التست المتخبّط في الـ CI بالظبط** — وإنك تربط الاتنين
دول بصوت عالي بيوري إنك فاهم المبدأ مش حافظ قاعدة.
:::
:::
:::

## Key takeaways

- **Prometheus pulls.** That gives you `up` for free, and it is why short-lived
  jobs need a Pushgateway.
- **A counter's value is meaningless — its `rate()` is the metric.** And
  `rate()` goes *innermost*, before `sum()`.
- **Metrics are sampled.** A millisecond spike between scrapes is invisible,
  which is why `OOMKilled` can coexist with a healthy-looking graph.
- **Cardinality is how Prometheus dies.** If you cannot enumerate a label's
  values, it does not belong in a label.
- **Two selectors must line up** for a `ServiceMonitor`, and neither errors —
  check the Targets page to tell which one is wrong.
- **Alert on symptoms, not causes**, and never on anything without an action.
- **Metrics say *that* something is wrong; logs and traces say *what*.** Use
  all three for what each is good at.

:::ar بالمصري · الخلاصة
1. **بروميثيوس بيجيب (pull) مش بيستقبل.** وده بيديك `up` مجاناً، وده
   سبب إن الـ jobs القصيرة محتاجة Pushgateway.
2. **قيمة الـ counter مالهاش معنى — الـ `rate()` بتاعته هو المقياس.**
   والـ `rate()` بتيجي **جوه**، **قبل** الـ `sum()`.
3. **المقاييس بتتقاس بالعيّنة.** قفزة مللي ثانية بين سكرَبتين **مش
   بتبان** — وعشان كده `OOMKilled` والجراف المرتاح **مش تعارض**.
4. **الـ cardinality هي اللي بتقتل بروميثيوس.** مش قادر تعدّ قيم الـ
   label؟ **يبقى مش مكانه label.**
5. **اتنين selectors لازم يتطابقوا** في الـ ServiceMonitor، **ومفيش
   إيرور** لو ما اتطابقوش — صفحة Targets بتقولك مين الغلطان.
6. **نبّه على الأعراض مش الأسباب**، **وعمرك ما تنبّه على حاجة مفيش
   لها تصرّف**.
7. **المقاييس بتقولك إن فيه مشكلة، واللوجز بيقولوك المشكلة إيه.**
   استخدم كل واحدة في اللي هي كويسة فيه.
:::
