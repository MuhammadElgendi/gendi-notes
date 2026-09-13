---
title: Observability Fundamentals
slug: observability-fundamentals
type: concept
domain: 08-observability
tags: [observability, metrics, logs, traces]
keywords: [three pillars, metrics, logs, traces, opentelemetry, loki, tempo,
           jaeger, elk, datadog, cardinality, sampling, correlation, exemplars,
           مراقبة, مقاييس, سجلات, تتبع]
level: 2
status: stable
prerequisites: []
related: [prometheus, grafana, slo-and-error-budgets,
          kubernetes-troubleshooting, devops-interview-questions]
updated: 2026-09-13
---

# Observability Fundamentals

> Monitoring tells you **that** something is wrong. Observability is whether you can work out **why** without shipping new code — and the difference is what you can ask, not how many dashboards you have.

## What is it?

Three kinds of telemetry, each answering a question the others cannot.

```diagram
   METRICS                  LOGS                     TRACES
   ───────                  ────                     ──────
   numbers over time        discrete events          one request's path
   "5% of requests fail"    "user 8821: timeout      "auth 3ms → db 1.9s
                             connecting to db"        → render 40ms"
   cheap, aggregated        expensive, detailed      sampled, structural

   ANSWERS                  ANSWERS                  ANSWERS
   is something wrong?      what exactly happened?   WHERE is the time going?
   is it worse than         to this one request      which service is at fault
   last week?
```

| | Metrics | Logs | Traces |
|:---|:---|:---|:---|
| Shape | Number + labels, sampled | Timestamped text/JSON | A tree of timed spans |
| Cost | Low, bounded | **High, grows with traffic** | Medium, usually sampled |
| Retention | Months to years | Days to weeks | Days |
| Good at | Trends, alerting, SLOs | Detail, forensics | Latency across services |
| Bad at | Explaining a single request | Aggregation, trends | Being complete (sampling) |

:::ar
تلات أنواع من البيانات، وكل واحد بيجاوب على سؤال **التانيين مش قادرين
يجاوبوه**.

| | المقاييس (Metrics) | السجلات (Logs) | التتبّع (Traces) |
|:---|:---|:---|:---|
| شكلها | **رقم** مع labels | **نص** بتوقيت | **شجرة** من الخطوات الموقوتة |
| التكلفة | **واطية ومحدودة** | **عالية، وبتكبر مع الترافيك** | متوسطة، وبعيّنات |
| الاحتفاظ | شهور لسنين | أيام لأسابيع | أيام |
| كويسة في | الاتجاهات والتنبيهات | **التفاصيل** | **الوقت رايح فين** |
| وحشة في | تفسير ريكوست واحد | التجميع والاتجاهات | الاكتمال (بتاخد عيّنات) |

**وأسهل طريقة تفتكرها:**

- **المقاييس** بتقولك **«فيه مشكلة»** — ٥٪ من الريكوستات بتفشل.
- **اللوجز** بتقولك **«المشكلة إيه»** — اليوزر ٨٨٢١ فشل يتصل بالداتابيز.
- **الـ Traces** بتقولك **«المشكلة فين»** — الوقت راح في سيرفيس الداتابيز.

**وإنت محتاج التلاتة.** واللي عنده مقاييس بس **بيعرف إن فيه مشكلة ومش
عارف يوصلها**. واللي عنده لوجز بس **بيدفع فلوس كتير ومش قادر يجاوب
«هل ده أوحش من الأسبوع اللي فات؟»**.
:::

## Monitoring versus observability

The distinction is often marketing, but there is a real idea underneath:

| Monitoring | Observability |
|:---|:---|
| Watches **known** failure modes | Lets you investigate **unknown** ones |
| "Is CPU above 80%?" | "Why are *Egyptian Android users on v2.3* slow?" |
| Dashboards you built in advance | Questions you did not anticipate |
| Fails on novel problems | Designed for novel problems |

:::key The practical test
**Can you answer a question you did not plan for, without deploying code?**

If diagnosing a new problem means adding a log line and waiting for a release,
you have monitoring. If you can slice existing telemetry by a dimension you
never charted before, you have observability.

The enabler is **high-cardinality, structured events** — and the constraint is
that metrics systems specifically cannot hold high cardinality, which is why
the pillars are separate rather than one tool.
:::

:::ar الفرق بين المراقبة والملاحظية
الفرق ده **نصه تسويق**، **بس تحته فكرة حقيقية**:

| المراقبة (Monitoring) | الملاحظية (Observability) |
|:---|:---|
| بتراقب **أعطال إنت عارفها** | بتخليك **تحقّق في أعطال جديدة** |
| «المعالج عدّى ٨٠٪؟» | «ليه مستخدمي أندرويد في مصر على نسخة ٢.٣ بطيئين؟» |
| داشبوردات **عملتها بدري** | **أسئلة ما توقعتهاش** |
| **بتفشل مع المشاكل الجديدة** | **متصمّمة للمشاكل الجديدة** |

:::key والاختبار العملي بسيط
> **تقدر تجاوب على سؤال ما كنتش مخطط ليه، من غير ما تنشر كود جديد؟**

لو تشخيص مشكلة جديدة معناه **تضيف سطر لوج وتستنى release** — يبقى عندك
**مراقبة**.

ولو تقدر **تقسّم البيانات الموجودة على بُعد عمرك ما رسمته قبل كده** —
يبقى عندك **ملاحظية**.

**واللي بيمكّن ده هو الأحداث المهيكلة عالية التنوّع.**

**والقيد** إن أنظمة المقاييس **بالذات مش قادرة تستحمل التنوّع العالي**
— وعشان كده الأنواع التلاتة **منفصلة** ومش أداة واحدة.
:::
:::

## The tool landscape

### The common open-source stack

```diagram
   YOUR APPLICATION
        │
        │  instrumented with OpenTelemetry SDKs
        ↓
   ┌─────────────────────────────────────────────┐
   │        OpenTelemetry Collector              │  receive → process → export
   └─────────────────────────────────────────────┘
        │                │                │
        ↓                ↓                ↓
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │Prometheus│    │   Loki   │    │  Tempo   │
   │ metrics  │    │   logs   │    │  traces  │
   └──────────┘    └──────────┘    └──────────┘
        │                │                │
        └────────────────┼────────────────┘
                         ↓
                   ┌──────────┐
                   │ Grafana  │  one UI over all three
                   └──────────┘
                         │
                   ┌──────────────┐
                   │ Alertmanager │  routing, grouping, silencing
                   └──────────────┘
```

| Layer | Options | Notes |
|:---|:---|:---|
| **Instrumentation** | **OpenTelemetry**, vendor SDKs | OTel is the standard; it ends vendor lock-in at the code level |
| **Metrics** | Prometheus, Thanos/Mimir/Cortex, VictoriaMetrics | Prometheus does not scale horizontally alone — the others add that |
| **Logs** | Loki, Elasticsearch/OpenSearch, ClickHouse | Loki indexes **labels only**, which is why it is cheap |
| **Traces** | Tempo, Jaeger, Zipkin | Tempo is object-storage backed, so retention is cheap |
| **Visualisation** | Grafana, Kibana | Grafana queries all of the above |
| **Alerting** | Alertmanager, Grafana Alerting | Routing and deduplication, not detection |
| **Commercial** | Datadog, New Relic, Honeycomb, Dynatrace | One integrated product; billed per host, per GB, or per event |

:::warn Build-versus-buy is a cost question, and the numbers surprise people
Self-hosting looks free and is not: you pay in storage, in the engineer-time to
run and upgrade it, and in being on call for your own monitoring.

Commercial tools look expensive and often are — **per-GB log ingestion is where
bills explode**, because log volume grows with traffic *and* with every debug
line someone leaves in.

The honest rule of thumb: below roughly 20–30 engineers, buy. The
platform-engineer salary to run a reliable observability stack usually exceeds
the licence. Above that, the economics can flip — and a hybrid (self-hosted
metrics, commercial traces) is common because metrics are cheap to store and
traces are not.
:::

:::ar منظر الأدوات
**الرسمة اللي فوق هي الستاك المفتوح الشائع.** والمهم فيها إن كل طبقة
**قابلة للاستبدال**:

| الطبقة | الاختيارات | ملاحظات |
|:---|:---|:---|
| **التجهيز** | **OpenTelemetry** | **هو المعيار**، وبينهي الارتباط بمورّد **على مستوى الكود** |
| **المقاييس** | Prometheus، Thanos، Mimir | **Prometheus لوحده مش بيتوسّع أفقياً** — دول بيضيفوا ده |
| **السجلات** | Loki، Elasticsearch | **Loki بيفهرس الـ labels بس**، وعشان كده رخيص |
| **التتبّع** | Tempo، Jaeger | Tempo بيخزّن على object storage، فالاحتفاظ رخيص |
| **العرض** | **Grafana** | بيستعلم من كل اللي فوق |
| **التنبيه** | Alertmanager | **توجيه وتجميع**، مش اكتشاف |
| **التجاري** | Datadog، New Relic | منتج متكامل، بفاتورة لكل سيرفر أو جيجا |

:::danger و«نبني ولا نشتري» سؤال تكلفة، **والأرقام بتفاجئ الناس**
**الاستضافة الذاتية شكلها مجانية وهي مش كده.** إنت بتدفع في: التخزين،
**ووقت المهندسين** اللي بيشغّلوها ويحدّثوها، **وإنك تبقى on-call
لنظام المراقبة نفسه**.

**والأدوات التجارية شكلها غالية وغالباً هي فعلاً كده** — **وفاتورة
اللوجز بالجيجا هي المكان اللي الفواتير بتنفجر فيه**، عشان حجم اللوجز
بيكبر **مع الترافيك** **وكمان** مع كل سطر debug حد نسيه.

**والقاعدة الأمينة:** تحت حوالي **٢٠–٣٠ مهندس، اشتري**. مرتّب مهندس
المنصة اللي هيشغّل ستاك مراقبة موثوق **غالباً أغلى من الرخصة**.

وفوق كده الحسبة ممكن تنقلب — **والمزج شائع**: مقاييس ذاتية (رخيصة
التخزين) وتتبّع تجاري (غالي التخزين).
:::
:::

## Pull versus push

```diagram
   PULL (Prometheus)                 PUSH (OTel, StatsD, Datadog agent)
   ─────────────────                 ─────────────────────────────────
   monitoring system scrapes         app sends to a collector
   /metrics on a timer                    │
        │                                 │
        ├─ failing to scrape IS           ├─ works behind NAT / firewalls
        │  the health signal (up)         ├─ works for short-lived jobs
        ├─ no client config               ├─ no service discovery needed
        └─ needs reachability             └─ you must detect silence yourself
```

Neither is better in the abstract. Pull gives you a free liveness signal;
push works where the monitoring system cannot reach in. Most real systems end
up with both — Prometheus scraping long-lived services, and a Pushgateway or
OTel collector for batch jobs and edge workloads.

## Correlation is the actual goal

Three signals in three tools is three investigations. The value appears when
you can move between them:

```diagram
   alert fires on the error-rate metric
        │  click through (exemplar links a metric sample to a trace ID)
        ↓
   trace shows the slow span is "checkout → payments"
        │  click through (trace ID is in the log labels)
        ↓
   logs for that trace ID show the exact error and the failing dependency
```

The mechanism that makes this work is a **shared trace ID** propagated through
every service and attached to logs, plus **exemplars** linking metric samples to
traces. That is a large part of why OpenTelemetry exists: one context
propagation standard across all three pillars.

:::key Structured logs, or correlation is impossible
```text
2026-09-13 14:22:01 ERROR failed to connect to db for user 8821
```
is unsearchable at scale. This is:
```json
{"ts":"2026-09-13T14:22:01Z","level":"error","msg":"db connect failed",
 "user_id":"8821","trace_id":"4bf92f...","service":"checkout"}
```

Structured logs are filterable by field, aggregatable, and — because of
`trace_id` — joinable to traces. Retrofitting this later means touching every
service, so it is worth enforcing on day one.
:::

:::ar الربط بين التلاتة هو الهدف الحقيقي
**تلات إشارات في تلات أدوات = تلات تحقيقات منفصلة.** والقيمة بتظهر لما
**تقدر تتنقل بينهم**:

```diagram
   تنبيه على مقياس نسبة الأخطاء
        │  تدوس (الـ exemplar بيربط عيّنة المقياس بـ trace)
        ↓
   الـ trace بتوري إن الخطوة البطيئة هي "checkout → payments"
        │  تدوس (الـ trace_id موجود في labels اللوج)
        ↓
   لوجز الـ trace دي بتوريك الخطأ بالظبط والـ dependency الفاشلة
```

**واللي بيخلي ده ممكن هو `trace_id` مشترك** بيتنقل بين كل السيرفيسات
وبيتحط على اللوجز، **مع exemplars** بتربط عيّنات المقاييس بالـ traces.

**ودي حتة كبيرة من سبب وجود OpenTelemetry**: معيار واحد لنقل السياق
عبر الأنواع التلاتة.

:::key ولوجز مهيكلة، **وإلا الربط مستحيل**
السطر ده:
```text
2026-09-13 14:22:01 ERROR failed to connect to db for user 8821
```
**مش قابل للبحث** مع الحجم الكبير. أما ده:
```json
{"ts":"...","level":"error","msg":"db connect failed",
 "user_id":"8821","trace_id":"4bf92f...","service":"checkout"}
```

**قابل للفلترة بالحقل، وللتجميع، وكمان — بسبب `trace_id` — قابل للربط
بالـ traces.**

**وإنك تحوّل لده بعدين معناه إنك تلمس كل سيرفيس عندك.** فاتفق عليه
**من أول يوم**.
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| Prometheus OOMs | **Cardinality** — unbounded label values | Drop the label with `metric_relabel_configs` |
| Log bill triples in a month | Debug logging left on; no sampling | Sample, and set per-service quotas |
| Dashboards everywhere, nobody looks | Built per-tool, not per-question | Few dashboards, tied to SLOs |
| Alerts ignored | Too many, or none actionable | Alert on symptoms with a runbook; delete the rest |
| Traces show nothing useful | Sampling dropped the slow requests | **Tail-based** sampling keeps errors and slow traces |
| Cannot correlate | No shared `trace_id`, unstructured logs | OpenTelemetry context propagation |
| Metrics disagree with reality | Scrape interval hides short spikes | `describe` / kernel counters are authoritative |

:::danger Alert fatigue is the failure mode that makes everything else pointless
A team paged for things that need no action stops reading pages. Then a real
one arrives and is acknowledged and ignored, because that is now the habit.

This is the same mechanism as a flaky test in CI: the tool is not wrong, but
its signal has been trained out of the humans.

Two rules that prevent it:

- **Every alert must have an action.** If the response is "look, shrug, close",
  it is a dashboard, not an alert.
- **Alert on symptoms, not causes.** "Error ratio above 1%" is actionable; "CPU
  above 80%" may be entirely healthy.
:::

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| Prometheus بيعمل OOM | **التنوّع (cardinality)** | اشيل الـ label بـ relabelling |
| فاتورة اللوجز اتلتّت | debug متسابة شغالة | **عيّنات**، وحصص لكل سيرفيس |
| داشبوردات كتير ومحدش بيبص | اتعملت لكل أداة، مش لكل سؤال | **داشبوردات قليلة** مربوطة بالـ SLOs |
| التنبيهات بتتجاهل | كتير أوي، أو مفيش تصرّف | نبّه على الأعراض **ومعاها runbook** |
| الـ traces مش بتفيد | العيّنات **رمت الريكوستات البطيئة** | **tail-based sampling** |
| مش قادر تربط | مفيش `trace_id` مشترك | OpenTelemetry |

:::danger وإرهاق التنبيهات هو العطل اللي بيلغي قيمة كل حاجة تانية
الفريق اللي بيتصل بيه لحاجات **مالهاش تصرّف** بيبطّل يقرا التنبيهات.

**وبعدين ييجي تنبيه حقيقي، فيتقفل ويتجاهل** — عشان **دي بقت العادة**.

**ونفس ميكانيزم التست المتخبّط في الـ CI بالظبط:** الأداة مش غلطانة،
**بس الإشارة بتاعتها اتمسحت من دماغ البشر**.

**وقاعدتين بيمنعوا ده:**

1. **كل تنبيه لازم يكون له تصرّف.** لو الرد «تبص، تهزّ كتافك، تقفل» —
   **يبقى ده داشبورد مش تنبيه**.
2. **نبّه على الأعراض مش الأسباب.** «نسبة الأخطاء فوق ١٪» فيها تصرّف.
   **«المعالج فوق ٨٠٪» ممكن يكون وضع صحي تماماً.**
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What are the three pillars, and when does each one fail you?
Metrics, logs and traces — and the useful half of the answer is the failure
modes, because that is what shows you have used them.

| Pillar | Answers | Fails when |
|:---|:---|:---|
| **Metrics** | Is something wrong? Is it worse than before? | You need one specific request — and **high cardinality kills the system** |
| **Logs** | What exactly happened, in detail | Volume and cost; aggregation is slow; useless if unstructured |
| **Traces** | Where is the latency, across services | **Sampling** — the interesting request may not have been kept |

**The order you actually use them:** a metric alert says *that* something is
wrong, a trace says *where*, and logs say *what*. Skipping to logs first is the
common time-waster, because you are searching text for a problem you have not
localised.

:::key The addition that scores
Name **cardinality** as the specific limit on metrics, and **sampling** as the
specific limit on traces — then say tail-based sampling fixes the second by
deciding *after* the request completes, so errors and slow traces are always
kept. That is a concrete answer rather than a taxonomy.
:::

:::ar
المقاييس واللوجز والـ traces — **والنص المفيد من الإجابة هو أعطال كل
واحد**، عشان ده اللي بيوري إنك استخدمتهم فعلاً.

| النوع | بيجاوب على | بيفشل لما |
|:---|:---|:---|
| **المقاييس** | فيه مشكلة؟ أوحش من قبل؟ | تحتاج ريكوست معيّن — **والتنوّع العالي بيقتل النظام** |
| **اللوجز** | حصل إيه بالظبط | **الحجم والتكلفة**، والتجميع بطيء |
| **الـ Traces** | الوقت راح فين | **العيّنات** — الريكوست المهم ممكن ما اتحفظش |

**والترتيب اللي بتستخدمهم بيه فعلاً:** المقياس بيقولك **إن فيه مشكلة**،
والـ trace بتقولك **فين**، واللوجز بتقولك **إيه**.

**واللي بيبدأ باللوجز بيضيّع وقته** — عشان بيدوّر في نص على مشكلة
**لسه ما حددش مكانها**.

**والإضافة اللي بتاخد درجة:** سمّي **الـ cardinality** كحد للمقاييس،
**والـ sampling** كحد للـ traces — وبعدين قول إن **tail-based sampling**
بيحل التانية عشان **بيقرر بعد ما الريكوست يخلص**، فالأخطاء والبطيء
**بيتحفظوا دايماً**.
:::
:::

:::q A service is slow. Walk me through using telemetry to find out why.
Go top-down, and say what each step eliminates:

```diagram
   ① METRICS   is it actually slow, and for whom?
      │        p99 by endpoint, by version, by region.
      │        → narrow: one endpoint? one deploy? one AZ?
      ↓
   ② COMPARE   what changed? overlay a deploy marker
      │        → "it started at 14:02, which is when v2.3 rolled out"
      ↓
   ③ TRACES    where does the time go inside a slow request?
      │        find a p99 exemplar, read the span breakdown
      │        → "1.9s of 2.0s is in the payments call"
      ↓
   ④ LOGS      what is that service actually saying?
      │        filter by trace_id, not by free text
      ↓
   ⑤ CONFIRM   fix, and watch the same p99 metric recover
```

**What each step rules out:** metrics eliminate "it is not actually slow" and
narrow the blast radius; the change correlation eliminates most causes
outright; traces eliminate "which service"; logs give the specific error.

:::warn Two traps worth naming
**Averages hide it.** A p50 that looks fine with a terrible p99 is the normal
shape of a latency problem — always look at percentiles.

**The dashboard may lie about spikes.** A 15-second scrape interval cannot see
a 2-second stall, so a graph showing comfortable CPU is not evidence that
nothing spiked. Kernel counters and `kubectl describe` are authoritative.
:::

:::ar
امشي من فوق لتحت، **وقول كل خطوة بتستبعد إيه**:

**١. المقاييس** — هو بطيء فعلاً؟ ولمين؟ (p99 لكل endpoint ولكل نسخة
ولكل منطقة) ← بتضيّق الدايرة.

**٢. المقارنة** — **إيه اللي اتغير؟** حط علامة الديبلويات على الجراف.
← «بدأ ٢:٠٢، وده وقت نزول نسخة ٢.٣».

**٣. الـ Traces** — الوقت رايح فين **جوه** الريكوست البطيء؟
← «١.٩ ثانية من ٢ في نداء الـ payments».

**٤. اللوجز** — السيرفيس ده بيقول إيه؟ **فلتر بالـ `trace_id`**، مش بنص حر.

**٥. التأكيد** — صلّح، **واتفرج على نفس المقياس وهو بيرجع**.

:::warn وفخين لازم تسمّيهم
**١. المتوسطات بتخبّي المشكلة.** p50 كويس مع p99 زفت **ده الشكل
الطبيعي** لمشكلة latency. **بصّ على الـ percentiles دايماً.**

**٢. الداشبورد ممكن تكدب عن القفزات.** فاصل قياس ١٥ ثانية **مش هيشوف**
توقف ثانيتين.

فجراف بيوري معالج مرتاح **ده مش دليل** إن مفيش قفزة حصلت. **وعدّادات
الكيرنل و `kubectl describe` هما المصدر الموثوق.**
:::
:::

:::q Self-host Prometheus/Grafana/Loki, or buy Datadog?
It is a cost and focus question, not a technical one — say that first.

| | Self-hosted | Commercial |
|:---|:---|:---|
| Licence cost | None | Per host / per GB / per event |
| Real cost | **Engineer time + storage + being on call for it** | The bill |
| Scaling | Prometheus does not scale horizontally alone — you add Thanos or Mimir | Their problem |
| Data control | Yours; required in some regulated environments | Leaves your network |
| Time to value | Weeks | Days |

**A defensible default:** below roughly 20–30 engineers, **buy**. The salary
cost of operating a reliable observability stack exceeds most licences, and
observability is infrastructure that produces no product.

**Reasons to self-host anyway:** regulatory or data-residency constraints; a
log volume where per-GB pricing is genuinely prohibitive; or you already have a
platform team running it well.

**And the hedge:** instrument with **OpenTelemetry** regardless. It decouples
your code from the backend, so the decision becomes a collector configuration
change rather than touching every service — which turns a one-way door into a
reversible one.

:::ar
ده سؤال **تكلفة وتركيز**، مش سؤال تقني — **وقول كده من الأول**.

| | ذاتي | تجاري |
|:---|:---|:---|
| الرخصة | **مجاني** | بالسيرفر أو الجيجا |
| **التكلفة الحقيقية** | **وقت المهندسين + التخزين + إنك on-call ليه** | الفاتورة |
| التوسّع | **Prometheus لوحده مش بيتوسّع أفقياً** | **مشكلتهم هما** |
| التحكّم في الداتا | **بتاعك** — مطلوب في بيئات فيها رقابة | بتخرج من شبكتك |

**والافتراضي المحترم:** تحت **٢٠–٣٠ مهندس، اشتري**.

مرتّب اللي هيشغّل ستاك موثوق **أغلى من أغلب الرخص**، **والمراقبة بنية
تحتية مش بتطلّع منتج**.

**وأسباب تستضيف بنفسك برضه:** قيود رقابية أو قيود على مكان الداتا،
أو حجم لوجز بيخلي السعر بالجيجا **مستحيل**، أو **عندك فريق منصة
بيشغّلها كويس خلاص**.

**والتحوّط المهم:** جهّز كودك بـ **OpenTelemetry** في كل الحالات.

هو **بيفصل كودك عن الـ backend**، فالقرار بيبقى **تغيير إعدادات في
الـ collector** بدل ما تلمس كل سيرفيس.

**وكده حوّلت باب في اتجاه واحد لباب بيفتح في الاتجاهين.**
:::
:::
:::

## Key takeaways

- **Metrics say *that*, traces say *where*, logs say *what*.** Use them in that
  order.
- **Cardinality is the hard limit on metrics; sampling is the hard limit on
  traces.** Tail-based sampling fixes the second.
- **Structured logs with a `trace_id`** are what make correlation possible —
  retrofitting is expensive.
- **OpenTelemetry decouples instrumentation from backend**, which keeps the
  build-versus-buy decision reversible.
- **Alert on symptoms with an action.** Alert fatigue destroys the value of
  everything else.
- **Buy below ~20–30 engineers.** Self-hosting is engineer-time, not free.
- **Sampled metrics can miss short spikes** — the kernel's account is
  authoritative.

:::ar الخلاصة
1. **المقاييس بتقول «فيه مشكلة»، والـ traces «فين»، واللوجز «إيه».**
   استخدمهم بالترتيب ده.
2. **الـ cardinality هي الحد الصلب للمقاييس، والـ sampling للـ traces.**
   و **tail-based sampling** بيحل التانية.
3. **لوجز مهيكلة فيها `trace_id`** هي اللي بتخلي الربط ممكن —
   **والتحويل بعدين غالي**.
4. **OpenTelemetry بيفصل التجهيز عن الـ backend**، فبيخلي قرار
   «نبني ولا نشتري» **قابل للرجوع**.
5. **نبّه على الأعراض، ومعاها تصرّف.** **إرهاق التنبيهات بيلغي قيمة
   كل حاجة تانية.**
6. **تحت ٢٠–٣٠ مهندس، اشتري.** الاستضافة الذاتية **وقت مهندسين**،
   مش مجانية.
7. **المقاييس بالعيّنة ممكن تفوّت قفزات قصيرة** — **وحساب الكيرنل هو
   الموثوق**.
:::
