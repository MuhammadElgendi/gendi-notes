---
title: SLOs and Error Budgets
slug: slo-and-error-budgets
type: concept
domain: 07-sre
tags: [sre, reliability, slo]
keywords: [sli, slo, sla, error budget, burn rate, availability, nines,
           percentile, p99, toil, alerting, reliability target,
           اتاحة, موثوقية, هدف, ميزانية اخطاء]
level: 3
status: stable
prerequisites: []
related: [devops-interview-questions, ci-cd, kubernetes-troubleshooting]
updated: 2026-09-08
---

# SLOs and Error Budgets

> An availability target is only useful if missing it *changes what the team does* — otherwise it is a number in a slide deck, and everyone already knows it.

## What is it?

Three terms, in increasing order of consequence:

| | Is a | Missing it costs you |
|:---|:---|:---|
| **SLI** | *measurement* — good events ÷ valid events | Nothing. It is just a number |
| **SLO** | internal *target* for that SLI | An engineering decision you agreed in advance |
| **SLA** | external *contract* with a customer | **Money** |

An **error budget** is the arithmetic remainder: `1 − SLO`, expressed as the
amount of failure you are *allowed*. At 99.9% monthly, that is about 43 minutes.

:::ar
تلات كلمات، مرتّبين على حسب **التكلفة** لما تكسرهم:

| | إيه هي | لو كسرتها تخسر إيه |
|:---|:---|:---|
| **SLI** | **قياس** — الأحداث الناجحة ÷ الأحداث الصحيحة | **مفيش**. دي مجرد رقم |
| **SLO** | **هدف داخلي** للقياس ده | **قرار هندسي** إنت اتفقت عليه بدري |
| **SLA** | **عقد** مع العميل | **فلوس** |

**والـ error budget** (ميزانية الأخطاء) هي الباقي بالحسبة: `١ − SLO`،
معبّر عنها كـ **قد إيه مسموحلك تفشل**.

يعني ٩٩.٩٪ في الشهر = حوالي **٤٣ دقيقة** توقف مسموح بيها.

**والترتيب ده مهم تحفظه** عشان الناس بتقول «SLA» وهي بتقصد «SLO» على طول،
وده مش تدقيق لغوي — **الفرق إن واحدة فيها غرامة والتانية لأ**.
:::

## Why it exists

Not to measure reliability. To **settle an argument before it happens.**

Every team has the same recurring fight: the product side wants to ship, the
operations side wants to be careful, and each round is re-argued from scratch
with no shared basis for deciding.

An error budget replaces opinion with arithmetic:

```diagram
   budget remaining?              →  ship. that is what it is for.
        │
        │  spent it?
        ↓
   reliability work becomes the priority, automatically
   — agreed in advance, by everyone, in writing
```

| Without an error budget | With one |
|:---|:---|
| "Is it safe to deploy?" — reargued weekly | Check the budget |
| Reliability work competes with features | Spending the budget *creates* the mandate |
| The careful engineer is "blocking" | The policy blocks, not a person |
| 100% is implicitly the target | The target is explicit and affordable |

:::ar بالمصري · دي موجودة عشان تحسم خلاف، مش عشان تقيس
الفكرة الحقيقية **مش القياس**. الفكرة إنك **تحسم خلاف قبل ما يحصل**.

كل فريق فيه نفس الخِلاف المتكرر: ناس عايزة تنشر بسرعة، وناس عايزة تاخد
بالها — وكل مرة النقاش بيبدأ من الأول ومفيش أساس مشترك للقرار.

**والـ error budget بتستبدل الرأي بالحسبة:**

```diagram
   الميزانية لسه فيها رصيد؟   →  انشر. **دي وظيفتها**.
        │
        │  خلصت؟
        ↓
   شغل الاعتمادية يبقى الأولوية، **تلقائياً**
   — متفق عليه بدري، من الكل، ومكتوب
```

**وأهم فايدة فيها، والناس مش واخدة بالها منها:**

من غيرها، المهندس اللي بياخد باله بيبقى «هو اللي بيعطّل». معاها،
**السياسة** هي اللي بتعطّل — مش شخص. وده بيغيّر جو الفريق كله.

**وحاجة تانية:** من غير هدف صريح، **الـ ١٠٠٪ بتبقى هي الهدف الضمني**.
ومحدش بيقولها بصوت عالي، بس الكل بيتصرّف على أساسها — وده بيخلي أي
انقطاع «فشل»، وده مش مستدام.
:::

## What it is made of

### The nines, in time you can actually picture

| SLO | Downtime / month | Downtime / year | Feels like |
|:---|:---|:---|:---|
| 99% | 7.3 hours | 3.65 days | Noticeable weekly |
| 99.9% | 43.8 minutes | 8.8 hours | One bad deploy |
| 99.95% | 21.9 minutes | 4.4 hours | Tight for a small team |
| 99.99% | 4.4 minutes | 52.6 minutes | Needs multi-AZ and automation |
| 99.999% | 26 seconds | 5.3 minutes | No human can respond in time |

:::key
Read the last row again. At five nines, **a human being cannot participate in
recovery** — 26 seconds a month is less time than it takes to read a page and
open a terminal. Anyone promising five nines is promising full automation, or
has not done this arithmetic.
:::

### Choosing an SLI that means something

The SLI has to be measured **where the user is**, and count **what the user
notices**.

| Weak SLI | Why it lies | Better |
|:---|:---|:---|
| Server CPU < 80% | Users cannot feel CPU | Request success rate at the load balancer |
| Average latency | Averages erase the slow tail | p99 latency |
| Uptime of the VM | The VM is up, the app returns 500 | Successful requests ÷ valid requests |
| Ping succeeds | Proves routing, not service | An actual request to a real endpoint |

:::ar بالمصري · الأرقام دي بالوقت الحقيقي
| الـ SLO | التوقف في الشهر | في السنة | إحساسه |
|:---|:---|:---|:---|
| ٩٩٪ | ٧.٣ **ساعة** | ٣.٦٥ يوم | بتحس بيه كل أسبوع |
| ٩٩.٩٪ | ٤٣.٨ **دقيقة** | ٨.٨ ساعة | ديبلوي واحد وحش |
| ٩٩.٩٥٪ | ٢١.٩ دقيقة | ٤.٤ ساعة | ضيّقة على فريق صغير |
| ٩٩.٩٩٪ | ٤.٤ دقيقة | ٥٢.٦ دقيقة | محتاج مناطق متعددة وأتمتة |
| ٩٩.٩٩٩٪ | **٢٦ ثانية** | ٥.٣ دقيقة | **مفيش بني آدم يلحق** |

:::key اقرا السطر الأخير تاني
عند الخمس تسعات، **مستحيل يكون فيه بني آدم في عملية الإنقاذ**.

٢٦ ثانية في الشهر **أقل من الوقت اللي بتاخده تقرا التنبيه وتفتح تيرمينال**.

فأي حد بيوعدك بخمس تسعات، هو يا إما بيوعدك **بأتمتة كاملة**، يا إما
**ما عملش الحسبة دي**. والسؤال ده بيتسأل في الانترفيوهات عشان يشوف
إنت هتوافق ولا هتحسبها.
:::

**واختيار SLI ينفع:** لازم يتقاس **عند اليوزر**، ويعدّ **اللي اليوزر
بيحسه**.

| SLI ضعيف | بيكدب ليه | الأحسن |
|:---|:---|:---|
| المعالج أقل من ٨٠٪ | اليوزر مش بيحس بالمعالج | نسبة نجاح الريكوستات عند الـ LB |
| متوسط الـ latency | المتوسط **بيمسح** الذيل البطيء | p99 |
| السيرفر شغّال | السيرفر شغّال والتطبيق بيرجّع ٥٠٠ | ريكوستات ناجحة ÷ ريكوستات صحيحة |
| الـ `ping` بيرد | بيثبت الراوتنج، مش الخدمة | ريكوست حقيقي على endpoint حقيقي |
:::

## How to use it

### Define one, concretely

```text title="An SLO, written the way it has to be written"
SLI:      proportion of HTTP requests to /api/* returning < 500,
          measured at the load balancer
SLO:      99.9% over a rolling 28 days
Budget:   0.1% = ~43 minutes of failed requests per 28 days
Policy:   > 50% budget spent  →  no risky deploys, reliability work prioritised
          > 100% spent        →  feature freeze until back within budget
```

The **policy** line is the one that matters. An SLO with no policy attached
changes nothing, and is the most common way this whole practice fails.

### Burn rate: how to alert without being paged for nothing

Alerting on "the SLO was missed" is useless — by then it already happened.
Alert on the **rate** you are consuming budget.

Burn rate 1 = you will spend exactly the whole budget by the end of the window.
Burn rate 10 = you will spend it in a tenth of the time.

| Burn rate | Budget gone in | Response |
|:---|:---|:---|
| 1 | 28 days | Nothing. This is the design |
| 2 | 14 days | A ticket |
| 6 | ~5 days | Investigate today |
| 14 | 2 days | **Page someone** |

:::key Two windows, not one
Alert on a **fast** window and a **slow** window together — typically 5
minutes AND 1 hour, both at a high burn rate.

The short window makes it react quickly; the long window stops a 30-second
blip from paging anyone. Either alone is wrong: short-only pages constantly,
long-only sleeps through an outage.
:::

:::ar بالمصري · الـ burn rate — إزاي تعمل تنبيهات مش بتضايقك
**إنك تعمل تنبيه على «الـ SLO اتكسر» ده بلا فايدة** — عشان لما التنبيه
يوصلك، الحكاية خلصت خلاص.

**التنبيه بيبقى على *معدّل* استهلاك الميزانية.**

الـ burn rate = ١ معناها «هتستهلك الميزانية كلها بالظبط لما النافذة تخلص».
والـ burn rate = ١٠ معناها **هتستهلكها في عُشر الوقت**.

| Burn rate | الميزانية تخلص في | التصرّف |
|:---|:---|:---|
| ١ | ٢٨ يوم | **مفيش**. ده التصميم نفسه |
| ٢ | ١٤ يوم | تيكت |
| ٦ | ٥ أيام | حقّق النهاردة |
| ١٤ | يومين | **اتصل بحد** |

:::key نافذتين، مش واحدة
اعمل التنبيه على **نافذة سريعة** و **نافذة بطيئة** مع بعض — عادةً
٥ دقايق **و** ساعة، والاتنين على burn rate عالي.

**النافذة القصيرة** بتخليه يتحرّك بسرعة. **والنافذة الطويلة** بتمنع
إن تعثّر ٣٠ ثانية يصحّي حد من النوم.

**وأي واحدة لوحدها غلط:** القصيرة لوحدها بتنبّه على أي حاجة فالناس
بتبطّل تقرا التنبيهات. والطويلة لوحدها **بتنام على انقطاع حقيقي**.
:::
:::

## What goes wrong

| Mistake | Why it fails | Instead |
|:---|:---|:---|
| An SLO with no policy | Nothing changes when you miss it | Write the "then what" before the number |
| Setting the SLO at 100% | Removes the ability to deploy, patch or migrate | Pick a number you can afford to miss |
| Measuring on the server | The user is not on your server | Measure at the load balancer, or from the client |
| Averages instead of percentiles | The average hides the users who are leaving | p99, and watch p99.9 |
| SLO = SLA | You lose the safety margin | SLO **tighter** than the SLA, always |
| Too many SLOs | Twenty targets are zero targets | Two or three per user-facing journey |
| Alerting on budget *exhausted* | It is already too late | Alert on burn rate, on two windows |

:::danger An SLO tighter than you can afford is worse than none
Set 99.99% on a service that realistically achieves 99.9%, and the budget is
exhausted every month. The policy then demands a permanent feature freeze,
which nobody will honour — so the team learns to ignore the SLO, and you have
spent the credibility of the whole practice.

**Set the first SLO slightly *below* what you already achieve.** Measure for a
month, confirm the number is real, then tighten. An SLO you meet is a working
control; an SLO you always miss is decoration.
:::

:::ar
| الغلطة | بتفشل ليه | اعمل إيه |
|:---|:---|:---|
| SLO من غير سياسة | **مفيش حاجة بتتغير** لما تكسره | اكتب «وبعدين إيه؟» **قبل** الرقم |
| SLO = ١٠٠٪ | بيلغي قدرتك على النشر والتحديث | اختار رقم تقدر تتحمّل تكسره |
| القياس على السيرفر | **اليوزر مش قاعد على سيرفرك** | قيس عند الـ LB أو من العميل |
| متوسطات بدل percentiles | المتوسط بيخبّي اليوزرز اللي بيمشوا | p99، وبصّ على p99.9 |
| SLO = SLA | بتخسر هامش الأمان | الـ SLO **أضيق** من الـ SLA، دايماً |
| SLOs كتير | عشرين هدف = صفر أهداف | اتنين أو تلاتة لكل رحلة مستخدم |
| تنبيه على «الميزانية خلصت» | **فات الوقت** | تنبيه على الـ burn rate، بنافذتين |

:::danger و SLO أضيق من قدرتك **أسوأ من إنه مش موجود**
حُط ٩٩.٩٩٪ على سيرفيس واقعياً بيوصل ٩٩.٩٪، والنتيجة إن **الميزانية
بتخلص كل شهر**.

والسياسة بعد كده بتطلب **تجميد دائم للفيتشرز** — ومحدش هيلتزم بده.

**فالفريق بيتعلّم يتجاهل الـ SLO**، وإنت خسرت **مصداقية الممارسة كلها**،
مش بس الرقم ده.

**حُط أول SLO أقل شوية من اللي إنت أصلاً بتحققه.** قيس شهر، اتأكد إن
الرقم حقيقي، وبعدين ضيّق.

**الـ SLO اللي بتحققه = أداة تحكّم شغالة. والـ SLO اللي بتكسره على طول =
ديكور.**
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

:::q What is the difference between an SLI, an SLO and an SLA? · إيه الفرق بينهم؟
Measurement, target, contract — in increasing order of consequence.

- **SLI** is a number: good events ÷ valid events. Missing it costs nothing
  because it is not a target.
- **SLO** is your internal target for that number. Missing it triggers an
  engineering policy you agreed in advance.
- **SLA** is a contract with a customer, with financial penalties.

**The relationship that matters:** your SLO must be **tighter** than your SLA,
so you notice and react before the customer's lawyer does. If SLO = SLA you
have no margin, and the first breach is a commercial event rather than an
engineering one.

:::ar
قياس، هدف، عقد — مرتّبين بالتكلفة.

- **SLI** رقم: الناجح ÷ الصحيح. كسره **مش بيكلّف حاجة** عشان هو مش هدف.
- **SLO** هدفك الداخلي للرقم ده. كسره **بيشغّل سياسة هندسية** اتفقت
  عليها بدري.
- **SLA** عقد مع عميل، **وفيه غرامات مالية**.

**والعلاقة المهمة:** الـ SLO لازم يكون **أضيق** من الـ SLA، عشان **إنت**
تلاحظ وتتحرّك **قبل** محامي العميل.

ولو الـ SLO = الـ SLA، يبقى **مفيش هامش**، وأول كسر بيبقى **حدث تجاري**
مش حدث هندسي.
:::
:::

:::q Your product manager asks for 100% uptime. What do you say? · المدير عايز ١٠٠٪ إتاحة
Do not agree, and do not simply refuse. **Reframe with numbers.**

1. **100% is not purchasable.** Your cloud provider will not sign it, your
   upstream DNS does not have it, and the marginal cost of each nine rises
   roughly tenfold while the marginal user benefit falls.
2. **Ask what the user actually notices.** Availability of *what*, measured
   *where*? Checkout at the load balancer is a different number from "the
   whole site from every country".
3. **Offer a real target with its price.** 99.9% is 43 minutes a month and
   affordable. 99.99% is 4.4 minutes and needs multi-AZ, automated failover
   and someone on call.
4. **Point out the budget is a feature.** With zero allowed downtime you can
   never deploy, patch a CVE, or migrate a database — so a 100% target makes
   the service *less* safe over time, not more.

:::key
This is a maturity test, not a knowledge test. The interviewer wants to know
whether you will nod along to an impossible commitment. Push back — with
arithmetic, not with attitude.
:::

:::ar
**متوافقش، وفي نفس الوقت متقولش «لأ» وتسكت. أعِد الصياغة بأرقام.**

**١. الـ ١٠٠٪ مش موجودة للبيع.** مزوّد الكلاود مش هيوقّع عليها، والـ DNS
اللي فوقك معندهوش ١٠٠٪، وكل «تسعة» بتكلّف عشرة أضعاف اللي قبلها والفايدة
اللي اليوزر بيحسها بتقل.

**٢. اسأل: اليوزر بيحس بإيه؟** إتاحة **إيه** بالظبط، ومقيسة **فين**؟
الـ checkout عند الـ load balancer رقم مختلف تماماً عن «الموقع كله من
كل بلد».

**٣. اعرض هدف حقيقي ومعاه سعره.** ٩٩.٩٪ = ٤٣ دقيقة في الشهر، ومعقولة.
٩٩.٩٩٪ = ٤.٤ دقيقة، ومحتاجة مناطق متعددة وتحويل آلي وحد on-call.

**٤. ووضّح إن الميزانية دي *ميزة*.** لو مسموح بصفر توقف، إنت **عمرك ما**
هتقدر تعمل ديبلوي، ولا تسدّ ثغرة أمنية، ولا تنقل داتابيز.

**فهدف الـ ١٠٠٪ بيخلي الخدمة أقل أماناً مع الوقت، مش أكتر.** ودي الجملة
اللي بتقلب النقاش.

**والسؤال ده اختبار نضوج مش اختبار معلومات.** هو عايز يعرف هتهزّ دماغك
موافق على التزام مستحيل ولا لأ. **اعترض — بحسابات، مش بعصبية.**
:::
:::

:::q How would you alert on an SLO without waking people up for nothing?
Alert on **burn rate**, not on the SLO being missed, and use **two windows
together**.

Missing the SLO is a lagging indicator — by the time it fires, the month is
already spent. Burn rate is leading: it says how fast the budget is going.

```diagram
   fast window (5 min)  AND  slow window (1 hour)   both burning hot
        │                         │
        │  reacts in minutes      │  proves it is sustained,
        │                         │  not a 30-second blip
        └────────────┬────────────┘
                     ↓
                  page someone
```

| Alert on | Result |
|:---|:---|
| Short window only | Pages on every transient blip; people stop reading alerts |
| Long window only | Sleeps through a real outage for an hour |
| **Both, ANDed** | Fast *and* trustworthy |

Then tier by severity: a high burn rate pages, a moderate one opens a ticket,
and burn rate 1 does nothing at all — because burn rate 1 is exactly what the
budget was designed to absorb.

:::ar
اعمل التنبيه على **الـ burn rate**، مش على «الـ SLO اتكسر»، **وباستخدام
نافذتين مع بعض**.

كسر الـ SLO **مؤشر متأخر** — لما ينطق، الشهر خلص خلاص. أما الـ burn rate
**مؤشر متقدّم**: بيقولك الميزانية بتروح **بأي سرعة**.

| التنبيه على | النتيجة |
|:---|:---|
| النافذة القصيرة لوحدها | بينبّه على أي تعثّر، **فالناس بتبطّل تقرا** |
| النافذة الطويلة لوحدها | **بتنام على انقطاع حقيقي** ساعة كاملة |
| **الاتنين، بشرط "و"** | سريع **وموثوق** |

وبعدين درّج على حسب الخطورة: burn rate عالي **بيتصل بحد**، ومتوسط
**بيفتح تيكت**، و burn rate = ١ **مش بيعمل حاجة خالص** — عشان ده بالظبط
اللي الميزانية اتعملت عشان تستحمله.
:::
:::

## Key takeaways

- **SLI measures, SLO targets, SLA costs money.** And your SLO must be tighter
  than your SLA.
- **An SLO with no policy attached changes nothing.** Write the "then what"
  before you argue about the number.
- **The error budget exists to settle an argument**, not to measure — it makes
  reliability work a mandate instead of a preference.
- **Measure where the user is**, and use percentiles, not averages.
- **Set the first SLO slightly below what you already achieve.** One you always
  miss teaches the team to ignore it.
- **Alert on burn rate over two windows**, never on the budget being exhausted.
- **100% is a category error.** With no allowed downtime you can never deploy
  or patch, which makes the service less safe.

:::ar بالمصري · الخلاصة
1. **الـ SLI بيقيس، والـ SLO هدف، والـ SLA بيكلّف فلوس.** والـ SLO لازم
   يكون **أضيق** من الـ SLA.
2. **SLO من غير سياسة مش بيغيّر حاجة.** اكتب «وبعدين إيه؟» **قبل** ما
   تتخانقوا على الرقم.
3. **الميزانية موجودة عشان تحسم خلاف**، مش عشان تقيس — بتحوّل شغل
   الاعتمادية من **رغبة** لـ **تكليف**.
4. **قيس عند اليوزر**، واستخدم percentiles مش متوسطات.
5. **أول SLO خليه أقل شوية من اللي إنت بتحققه أصلاً.** اللي بتكسره على
   طول **بيعلّم الفريق يتجاهله**.
6. **نبّه على الـ burn rate بنافذتين**، وعمرك ما تنبّه على «الميزانية خلصت».
7. **الـ ١٠٠٪ غلطة في التفكير نفسه.** من غير توقف مسموح، إنت مش هتقدر
   تنشر ولا تسدّ ثغرة — **فالخدمة بتبقى أقل أماناً**.
:::
