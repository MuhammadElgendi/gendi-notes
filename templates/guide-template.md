---
title: <Tool or Technology>
slug: <must-match-filename-without-md>
type: guide
domain: <e.g. 08-observability>
tags: [<tag>, <tag>]
keywords: [<english search terms>,
           <مصطلحات عربية للبحث>]
level: <1-5>
status: seed
prerequisites: [<slug>]
related: [<slug>]
updated: <YYYY-MM-DD>
---

# <Tool or Technology>

> One sentence. A claim, not a definition. This becomes the page subtitle, the
> home-page card and the INDEX entry.

## What is it?

Two to four lines, plain language, no jargon. Someone who has only heard the
name should finish this paragraph knowing what the thing does.

:::ar
اشرحها من الأول خالص، وبالراحة. المفروض حد سامع الاسم بس، يخلّص الكلام ده
وهو عارف الحاجة دي بتعمل إيه.

**متترجمش الإنجليزي اللي فوق** — اشرحه **تاني**، بطريقة تانية، من ناحية
القارئ. والمصطلحات التقنية سيبها إنجليزي زي ما هي.
:::

## Why it exists

The problem that existed **before** this tool. A tool you cannot motivate is a
tool you have memorised rather than understood.

| Without it | With it |
|:---|:---|
| … | … |

:::ar
المشكلة اللي كانت موجودة **قبل** الأداة دي. والأداة اللي مش عارف تقول
هي بتحل إيه، دي أداة إنت **حافظها** مش **فاهمها**.

| من غيرها | معاها |
|:---|:---|
| … | … |
:::

## What it is made of

The components, as a table. The reader's real question is "the docs mention six
nouns — which one am I actually touching right now?"

| Piece | What it is | Think of it as |
|:---|:---|:---|
| … | … | … |

:::key
The single distinction that removes the most confusion about this tool.
:::

:::ar بالمصري · يعني إيه كل واحدة
| الحاجة | يعني إيه | تخيلها زي |
|:---|:---|:---|
| … | … | … |

وأهم فرق تفهمه من الجدول ده: …
:::

## How to use it

Start with the simplest thing that works, then build up. Real commands, real
files, real output.

```sh title="What this achieves"
# Say what the command does and what in the output matters.
<command>
```

### The commands you will use daily

```sh
<command>     # what it tells you
```

:::ar
لو مش هتحفظ غير أمرين من اللستة اللي فوق، خليهم …

والحاجة اللي بتوقّع الناس هنا: …
:::

## How it works underneath

Only if it changes how you *use* the tool. Otherwise delete this section.

```diagram
   ┌─────────────┐        ┌─────────────┐
   │  component  │ ─────→ │  component  │
   └─────────────┘        └─────────────┘
```

Arrows: use → ← ↑ ↓ only. Never ▶ ▼ ◀ ▲ — the build fails on them; see
CONTRIBUTING.md for why.

## What goes wrong

| Symptom | Cause | Fix |
|:---|:---|:---|
| … | … | … |

:::danger
A real failure people actually hit, with its signature and the fix. Reserve this
callout for genuine production problems.
:::

:::ar
والترتيب اللي تمشي عليه وإنت بتظبّط أي مشكلة:

```diagram
   ١. …
        ↓
   ٢. …
```
:::

## Interview corner · الأسئلة اللي بتتسأل

Three to six questions this topic is actually asked. Delete the section if you
have nothing beyond the note itself — a padded interview corner is worse than
none.

:::q <The question, as an interviewer would say it> · <والسؤال بالمصري>
The model answer. Lead with the claim, then the mechanism.

:::key What is really being tested
The signal underneath the question. This is usually the most valuable line in
the card.
:::

:::ar
الإجابة تاني بالمصري، وبنفس الترتيب: الخلاصة الأول، وبعدين الميكانيزم.

واللي بيتقاس عليه في السؤال ده: …
:::
:::

## Key takeaways

- Five to seven bullets that make sense on their own, six months later.
- Lead with the thing you would most want to be reminded of.

:::ar بالمصري · الخلاصة
1. …
2. …
:::
