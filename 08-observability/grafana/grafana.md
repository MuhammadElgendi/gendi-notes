---
title: Grafana
slug: grafana
type: guide
domain: 08-observability
tags: [grafana, dashboards, observability]
keywords: [dashboard, panel, datasource, variable, promql, alerting, provisioning,
           json model, templating, unified alerting, contact point, RED, USE,
           جرافانا, لوحات, رسومات, تنبيهات]
level: 2
status: stable
prerequisites: [prometheus]
related: [prometheus, observability-fundamentals, slo-and-error-budgets,
          devops-interview-questions]
updated: 2026-09-13
---

# Grafana

> Grafana stores no data. It queries other systems and draws the answer — which is why "Grafana is broken" is almost always the datasource or the query.

## What is it?

A query and visualisation layer over many backends: Prometheus, Loki, Tempo,
SQL databases, cloud metrics. One UI, one login, one place to correlate.

```diagram
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │Prometheus│  │   Loki   │  │  Tempo   │  │ Postgres │   ← the data lives here
   └──────────┘  └──────────┘  └──────────┘  └──────────┘
        │             │             │             │
        └─────────────┴──────┬──────┴─────────────┘
                             ↓  queries, on every refresh
                      ┌──────────────┐
                      │   GRAFANA    │   ← stores dashboards and alert rules
                      │              │      in its OWN small database,
                      │              │      NOT your metrics
                      └──────────────┘
```

:::ar
Grafana **مش بيخزّن أي داتا مراقبة**. **وده أهم حاجة تفهمها عنه.**

هو **بيسأل** أنظمة تانية (Prometheus، Loki، Tempo، داتابيزات SQL)
**وبيرسم الإجابة**.

**وعشان كده «Grafana باظ» تقريباً دايماً معناها حاجة من اتنين:**

1. **الـ datasource** — يعني النظام اللي وراه، أو الاتصال بيه
2. **الاستعلام نفسه** — الـ PromQL اللي إنت كاتبه

**واللي Grafana بيخزّنه فعلاً حاجتين بس:** تعريفات الداشبوردات، وقواعد
التنبيه. ودول في **داتابيز صغيرة بتاعته هو** (SQLite افتراضياً، أو
Postgres في البرودكشن).

**فلو ضاعت داتابيز Grafana، إنت ضيّعت الداشبوردات — مش المقاييس.**
المقاييس لسه في Prometheus زي ما هي. ودي حاجة مريحة، **بس بتوري كمان
ليه لازم داشبورداتك تبقى في Git مش في الواجهة**.
:::

## What it is made of

| Piece | What it is |
|:---|:---|
| **Datasource** | A connection to a backend. Each has its own query language |
| **Dashboard** | A grid of panels, stored as **JSON** |
| **Panel** | One visualisation, driven by one or more queries |
| **Variable** | A dropdown that parametrises queries — `$namespace`, `$pod` |
| **Alert rule** | A query plus a condition, evaluated on a schedule |
| **Contact point** | Where a firing alert is sent |
| **Notification policy** | Routing tree: which alerts go to which contact point |

## How to use it

### Build a dashboard that is worth keeping

Most dashboards are abandoned because they answer no particular question.
Anchor them to a method instead:

| Method | Panels | For |
|:---|:---|:---|
| **RED** | **R**ate, **E**rrors, **D**uration | Request-driven services |
| **USE** | **U**tilisation, **S**aturation, **E**rrors | Resources: nodes, disks, queues |
| **Four Golden Signals** | Latency, traffic, errors, saturation | Google SRE's version of both |

```promql title="A RED dashboard, in four queries"
# Rate — requests per second by status
sum(rate(http_requests_total{service="$service"}[5m])) by (status)

# Errors — the ratio, which is what an SLO measures
sum(rate(http_requests_total{service="$service",status=~"5.."}[5m]))
  /
sum(rate(http_requests_total{service="$service"}[5m]))

# Duration — p99. rate() first, then sum by le, THEN the quantile
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket{service="$service"}[5m])) by (le))

# Saturation — how close to the limit
sum(rate(container_cpu_usage_seconds_total{pod=~"$service.*"}[5m]))
  /
sum(kube_pod_container_resource_limits{pod=~"$service.*",resource="cpu"})
```

### Variables make one dashboard serve every service

```text
Name:   service
Type:   Query
Query:  label_values(http_requests_total, service)
Multi:  yes        Include All: yes
```

Then use `$service` in every panel. One dashboard, a dropdown, no copies to
maintain.

:::key Regex-safe variable interpolation
With **Multi-value** enabled, `$service` expands to `a|b|c`, so the query must
use a regex matcher:

```promql
{service=~"$service"}     # ✔ =~ handles one value or many
{service="$service"}      # ✘ breaks the moment two are selected
```

This is the most common reason a dashboard "works until someone selects All".
:::

:::ar داشبورد يستاهل تسيبه
**أغلب الداشبوردات بتتهجر عشان مش بتجاوب على سؤال محدد.**

**فاربطها بمنهج بدل ما تحطّ رسومات عشوائية:**

| المنهج | الرسومات | لإيه |
|:---|:---|:---|
| **RED** | المعدّل، الأخطاء، المدة | **السيرفيسات اللي بتستقبل ريكوستات** |
| **USE** | الاستخدام، الإشباع، الأخطاء | **الموارد**: نودات، ديساكات، طوابير |
| **الإشارات الذهبية الأربعة** | latency، ترافيك، أخطاء، إشباع | نسخة جوجل من الاتنين |

**والمتغيرات (Variables) بتخلي داشبورد واحد يخدم كل السيرفيسات** — قايمة
منسدلة، ومفيش نسخ تصيانها.

:::danger وفخ الـ Multi-value
لما تفعّل الاختيار المتعدد، الـ `$service` **بتتحوّل لـ `a|b|c`**.

فالاستعلام **لازم** يستخدم مطابقة regex:

```promql
{service=~"$service"}     # ✔ شغّالة مع واحد أو كتير
{service="$service"}      # ✘ بتبوظ أول ما تختار اتنين
```

**ودي أشهر سبب إن داشبورد «شغّال لحد ما حد يختار All»** — والفرق حرف
واحد: `~`.
:::
:::

### Dashboards as code

A dashboard edited in the browser exists only in Grafana's database. Provision
them from files instead:

```yaml title="/etc/grafana/provisioning/dashboards/main.yaml"
apiVersion: 1
providers:
  - name: 'platform'
    folder: 'Platform'
    type: file
    disableDeletion: true
    allowUiUpdates: false        # the UI becomes read-only for these
    options:
      path: /var/lib/grafana/dashboards
```

```yaml title="Or in Kubernetes — the sidecar picks up any labelled ConfigMap"
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-dashboard
  labels:
    grafana_dashboard: "1"        # the sidecar watches for this label
data:
  web.json: |
    { "title": "Web — RED", "panels": [ ... ] }
```

:::warn `allowUiUpdates: false` will annoy people, and it is correct
With provisioning on, edits in the UI are discarded on reload. That feels
hostile until the first time someone's careful dashboard is silently
overwritten — or until you need to know who changed a panel and why.

The workflow becomes: edit in the UI to experiment, **export the JSON**, commit
it, let provisioning apply it. Slower per change, and the dashboards survive the
Grafana instance.
:::

### Alerting

Grafana's unified alerting can evaluate rules against **any** datasource, which
is the reason to use it over Alertmanager alone.

```diagram
   Alert rule          query + condition + "for: 5m"
        │              (the `for` is what stops flapping)
        ↓
   Notification policy  routing tree, matched on labels
        │               severity=critical → PagerDuty
        │               severity=warning  → Slack
        ↓
   Contact point        the actual destination
        │
        └─ grouping · deduplication · silences · mute timings
```

:::key `for:` is the difference between an alert and a nuisance
A rule that fires the instant a query crosses a threshold will fire on every
transient blip — a single slow scrape, one pod restarting.

`for: 5m` requires the condition to hold continuously before firing. That single
field removes most false pages, and omitting it is the usual cause of an alert
channel nobody reads.
:::

:::ar الداشبوردات ككود، والتنبيهات
**الداشبورد اللي اتعدّل في المتصفح موجود في داتابيز Grafana بس.** يعني
مفيش تاريخ، ومفيش مراجعة، **وبيضيع لو الـ instance ضاعت**.

**والـ provisioning بيحوّلهم لملفات** تتعمل commit زي أي كود.

:::warn و `allowUiUpdates: false` هتضايق الناس، **وهي صح**
مع الـ provisioning، أي تعديل من الواجهة **بيتلغي** عند إعادة التحميل.

**وده بيبان عدائي** — لحد أول مرة داشبورد حد تعب فيه **يتمسح في سكوت**،
أو لحد ما تحتاج تعرف **مين غيّر رسمة وليه**.

**وسير العمل بيبقى:** جرّب في الواجهة، **صدّر الـ JSON**، اعمله commit،
وسيب الـ provisioning ينشره.

**أبطأ في كل تغيير، والداشبوردات بتعيش بعد الـ instance نفسها.**

:::key والـ `for:` هي الفرق بين تنبيه ومصدر إزعاج
القاعدة اللي بتنطق **في نفس اللحظة** اللي الاستعلام يعدّي فيها الحد،
**هتنطق مع أي تعثّر مؤقت** — قياس واحد بطيء، بود واحد بيعمل restart.

**و `for: 5m` بتطلب إن الشرط يفضل محقّق باستمرار** قبل ما تنطق.

**والحقل الواحد ده بيشيل أغلب التنبيهات الكاذبة** — **ونسيانه هو السبب
المعتاد لقناة تنبيهات محدش بيقراها**.
:::
:::
:::

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| "No data" | Query returns nothing, or wrong time range | Run it in Explore; widen the range |
| Panel empty only for some values | `=` instead of `=~` with a multi-value variable | Use `=~` |
| Dashboard slow | Queries over months at high resolution | Shorter ranges; recording rules |
| `too many outstanding requests` | Panels hammering Prometheus | Fewer panels; increase `min interval` |
| Edits keep disappearing | Provisioning with `allowUiUpdates: false` | Working as configured — commit the JSON |
| Alerts flap | No `for:` duration | Add `for: 5m` |
| Alert storm in one incident | No grouping in the notification policy | `group_by` on cluster and alertname |
| Dashboards lost after restart | SQLite on ephemeral storage | Use a PVC, or an external database |

:::danger Grafana on ephemeral storage loses everything on restart
The default database is SQLite in `/var/lib/grafana`. In Kubernetes without a
PersistentVolume that directory is `emptyDir`, so **every dashboard, alert rule
and user is destroyed on pod restart**.

Two defences, and you want both:

- Mount a **PVC**, or use an external Postgres for anything shared.
- **Provision dashboards from Git**, so the pod's storage stops being the
  source of truth at all.

The second is what actually matters. With provisioning, losing the database is
an inconvenience; without it, it is unrecoverable.
:::

:::ar المشاكل الشائعة
| العَرَض | السبب | الحل |
|:---|:---|:---|
| "No data" | الاستعلام مش بيرجّع حاجة، أو المدى الزمني غلط | جرّبه في Explore ووسّع المدى |
| رسمة فاضية لبعض القيم بس | `=` بدل `=~` مع متغير متعدد | استخدم `=~` |
| الداشبورد بطيء | استعلامات على شهور بدقة عالية | مدى أقصر، و **recording rules** |
| التعديلات بتختفي | الـ provisioning بـ `allowUiUpdates: false` | **ده شغّال صح** — اعمل commit للـ JSON |
| التنبيهات بتنطق وتسكت | مفيش `for:` | ضيف `for: 5m` |
| عاصفة تنبيهات في حادثة واحدة | مفيش تجميع في سياسة التوجيه | `group_by` |

:::danger و Grafana على تخزين مؤقت **بيضيّع كل حاجة مع أول restart**
الداتابيز الافتراضية SQLite في `/var/lib/grafana`.

**وفي كوبرنيتيس من غير PersistentVolume، الفولدر ده `emptyDir`** — يعني
**كل داشبورد وكل قاعدة تنبيه وكل مستخدم بيتدمّروا مع إعادة تشغيل البود**.

**ودفاعين، وإنت عايز الاتنين:**

1. **ركّب PVC**، أو استخدم Postgres خارجية لأي حاجة مشتركة.
2. **وفّر الداشبوردات من Git** — عشان تخزين البود **يبطّل يكون مصدر
   الحقيقة من الأصل**.

**والتاني هو المهم فعلاً.** مع الـ provisioning، ضياع الداتابيز
**إزعاج**. من غيره، **مالوش رجعة**.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q A Grafana panel shows "No data". How do you debug it?
Grafana stores nothing, so the fault is in the **datasource**, the **query**,
or the **time range** — check them in that order, cheapest first.

```text
1. Time range      — is there data in this window at all? Widen to 24h
2. Datasource      — Settings → Save & test. Is it reachable?
3. The query       — run it in Explore, stripped of variables
4. Variables       — do they resolve? Try a literal value first
5. The metric      — does it exist upstream?
                     In Prometheus: does the series appear at all?
```

| Finding | Cause |
|:---|:---|
| Works in Explore, fails in the panel | A variable is unresolved or wrongly interpolated |
| Works with a literal, fails with `$var` | Multi-value with `=` instead of `=~` |
| No data anywhere, including Prometheus | The target is not being scraped |
| Data exists but stops at a point in time | The exporter or target died then |

:::key The reframe that scores
"Grafana is a window, not a store — so I would first establish whether the data
exists upstream, because that splits the problem in half." Debugging Grafana
itself when the metric was never scraped is the common wasted hour.
:::

:::ar
Grafana **مش بيخزّن حاجة**، فالعطل في **الـ datasource** أو **الاستعلام**
أو **المدى الزمني** — **شيكهم بالترتيب ده، الأرخص الأول**:

```text
١. المدى الزمني  — فيه داتا في الفترة دي أصلاً؟ وسّعه لـ ٢٤ ساعة
٢. الـ datasource — Settings ← Save & test. بيوصل؟
٣. الاستعلام      — جرّبه في Explore **من غير متغيرات**
٤. المتغيرات      — بتتحل؟ جرّب قيمة صريحة الأول
٥. المقياس نفسه   — موجود في Prometheus أصلاً؟
```

| اللي لقيته | السبب |
|:---|:---|
| شغّال في Explore وفاشل في الرسمة | **متغير** مش بيتحل صح |
| شغّال بقيمة صريحة وفاشل بـ `$var` | multi-value بـ `=` بدل `=~` |
| مفيش داتا خالص حتى في Prometheus | **الهدف مش بيتقرا أصلاً** |
| فيه داتا وواقفة عند وقت معيّن | الـ exporter مات وقتها |

**والصياغة اللي بتاخد درجة:**

> **«Grafana شبّاك مش مخزن — فأنا هتأكد الأول إن الداتا موجودة في
> المصدر، عشان دي بتقسّم المشكلة نصين.»**

**وإنك تظبّط Grafana والمقياس أصلاً عمره ما اتقرا — دي الساعة الضايعة
المعتادة.**
:::
:::

:::q How do you design a dashboard people will actually use?
Start from the **question**, not the data. Most dashboards fail because they
show everything available rather than what someone needs during an incident.

**A structure that works:**

| Row | Contains | Answers |
|:---|:---|:---|
| Top | **SLO / error budget burn** | Are we breaking our promise right now? |
| 2nd | **RED**: rate, errors, p99 | Is this service the problem? |
| 3rd | **Dependencies**: downstream latency and errors | Or is it something we call? |
| 4th | **Saturation**: CPU/memory vs limits, queue depth | Are we running out of something? |
| Bottom | Links to logs and traces, pre-filtered | Where do I go next? |

**Rules that keep it useful:**

- **One dashboard per service**, parametrised by variables — not one per
  environment.
- **Percentiles, never averages.** An average hides exactly the users who are
  leaving.
- **Annotate deploys.** "What changed?" is the first incident question, and an
  overlay answers it instantly.
- **Delete unused dashboards.** A directory of 200 is the same as none, because
  nobody can find the right one.

:::warn The anti-pattern: the wall of graphs
Forty panels of everything Prometheus exports looks thorough and is useless
under pressure — nobody can scan it while a service is down.

Aim for one screen that answers "is it us, and what changed?" Everything else
belongs in a second, deliberately separate, deep-dive dashboard.
:::

:::ar
**ابدأ من السؤال، مش من الداتا.**

أغلب الداشبوردات بتفشل عشان بتعرض **كل اللي متاح**، مش **اللي حد
محتاجه وقت الحادثة**.

**هيكل بيشتغل:**

| الصف | فيه إيه | بيجاوب على |
|:---|:---|:---|
| فوق | **الـ SLO واستهلاك الميزانية** | إحنا بنكسر وعدنا دلوقتي؟ |
| ٢ | **RED**: معدّل، أخطاء، p99 | السيرفيس ده هو المشكلة؟ |
| ٣ | **الاعتماديات** | ولا حاجة إحنا بنناديها؟ |
| ٤ | **الإشباع** مقابل الحدود | فيه حاجة بتخلص؟ |
| تحت | **روابط للوجز والـ traces** مفلترة | أروح فين بعد كده؟ |

**وقواعد بتخليه مفيد:**

1. **داشبورد واحد لكل سيرفيس** بمتغيرات — **مش واحد لكل بيئة**.
2. **percentiles، مش متوسطات أبداً.** المتوسط **بيخبّي بالظبط اليوزرز
   اللي بيمشوا**.
3. **حط علامات الديبلويات.** «إيه اللي اتغير؟» أول سؤال في أي حادثة،
   **والعلامة دي بتجاوبه فوراً**.
4. **امسح الداشبوردات اللي محدش بيستخدمها.** ٢٠٠ داشبورد = صفر
   داشبورد، عشان **محدش بيلاقي الصح**.

:::warn والنمط السيء: **حيطة الرسومات**
أربعين رسمة لكل حاجة Prometheus بيطلّعها **شكلها شامل وهي بلا فايدة
تحت الضغط** — **محدش يقدر يقراها والخدمة واقعة**.

**استهدف شاشة واحدة بتجاوب: «هو إحنا؟ وإيه اللي اتغير؟»**

وأي حاجة تانية مكانها داشبورد **تاني منفصل بقصد** للتعمّق.
:::
:::
:::

## Key takeaways

- **Grafana stores no metrics.** "Grafana is broken" is the datasource, the
  query, or the time range.
- **Anchor dashboards to RED or USE**, and start from the question someone asks
  during an incident.
- **Use `=~` with multi-value variables**, or the panel breaks on "All".
- **Percentiles, not averages**, and annotate deploys.
- **Provision dashboards from Git.** The UI is for experimenting; the repo is
  the source of truth.
- **`for:` on every alert rule**, or you train people to ignore the channel.
- **Grafana needs persistent storage** — or it loses every dashboard on
  restart.

:::ar الخلاصة
1. **Grafana مش بيخزّن مقاييس.** «Grafana باظ» معناها **الـ datasource**
   أو **الاستعلام** أو **المدى الزمني**.
2. **اربط داشبوردك بـ RED أو USE**، **وابدأ من السؤال** اللي حد بيسأله
   وقت الحادثة.
3. **استخدم `=~` مع المتغيرات المتعددة**، وإلا الرسمة بتبوظ عند "All".
4. **percentiles مش متوسطات**، **وحط علامات الديبلويات**.
5. **وفّر الداشبوردات من Git.** الواجهة للتجريب، **والريبو هو مصدر الحقيقة**.
6. **`for:` على كل قاعدة تنبيه**، وإلا بتعلّم الناس يتجاهلوا القناة.
7. **Grafana محتاج تخزين دائم** — وإلا بيضيّع كل داشبورد مع أول restart.
:::
