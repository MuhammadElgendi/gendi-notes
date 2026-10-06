---
title: Envelope Encryption
slug: envelope-encryption
type: guide
domain: 04-cloud
tags: []
keywords: []
level: 2
status: stable
prerequisites: []
related: []
updated: 2026-10-06
---
# Envelope Encryption

Envelope Encryption is one of the most important concepts you need to understand when working with cloud encryption, especially **AWS KMS**.

The short version:

> **The Data Key encrypts the data, while the KMS Key encrypts the Data Key.**

<div dir="rtl">

## 💬 يعني إيه Envelope Encryption؟

ببساطة، الـ **Envelope Encryption** معناها إننا مش بنستخدم الـ **KMS Key** عشان نـencrypt الداتا نفسها.

بدل كده بنعمل:

```text
KMS Key
   ↓
يحمي الـ Data Key
   ↓
Data Key
   ↓
يشفّر الـ Data
```

يعني عندنا طبقتين:

- **KMS Key** → بيحمي الـ Data Key.
- **Data Key** → بيشفّر الـ actual data.

وده بالظبط سبب اسم **Envelope**: عندك مفتاح بيحمي مفتاح تاني، والمفتاح التاني بيحمي الداتا.

</div>

---

## The basic architecture

```text
                 KMS Key
                    │
                    │ encrypt / decrypt
                    ▼
              ┌─────────────┐
              │ Encrypted   │
              │ Data Key    │
              └─────────────┘
                    │
                    │ decrypt
                    ▼
              ┌─────────────┐
              │ Plaintext   │
              │ Data Key    │
              └─────────────┘
                    │
                    │ encrypt / decrypt
                    ▼
              ┌─────────────┐
              │    Data     │
              └─────────────┘
```

<div dir="rtl">

## 💬 الفكرة ببساطة

تخيل عندك ملف حجمه **10 GB**.

مش منطقي إنك تبعت الـ 10 GB كل مرة لـ AWS KMS عشان الـ KMS Key يعمل encryption عليها.

بدل كده:

1. KMS يولّد لك **Data Key**.
2. تستخدم الـ Data Key محليًا عشان تشفّر الـ 10 GB.
3. KMS يشفّر نسخة من الـ Data Key نفسه.
4. تخزن:
   - الـ encrypted data
   - الـ encrypted Data Key
5. الـ plaintext Data Key مايتخزنش.

يعني KMS بيحمي **المفتاح**، مش بيقعد يشفر كل byte في الداتا الكبيرة.

</div>

---

# Why not encrypt the data directly with KMS?

<div dir="rtl">

لو عندك:

```text
customer-data.csv
```

وحجمه:

```text
10 GB
```

مش التصميم المعتاد إنك تعمل:

```text
KMS Key
   ↓
Encrypt
   ↓
10 GB Data
```

التصميم الأفضل هو:

```text
KMS Key
   ↓
Data Key
   ↓
Encrypt 10 GB locally
```

السبب إن **AWS KMS** خدمة لإدارة وحماية مفاتيح التشفير، بينما الـ bulk data encryption بيتعمل باستخدام symmetric encryption keys زي AES.

</div>

---

# The two important keys

## 1. KMS Key

<div dir="rtl">

ده المفتاح اللي AWS KMS بيديره.

مثلاً:

```text
KMS Key
arn:aws:kms:eu-west-1:123456789012:key/abcd...
```

الـ application المفروض مايمسكش الـ KMS key نفسه كـ plaintext key.

هو بيطلب من KMS عمليات زي:

```text
kms:GenerateDataKey
kms:Decrypt
```

والـ KMS هو اللي بيدير المفتاح ويحكم مين مسموح له يستخدمه.

</div>

---

## 2. Data Key

<div dir="rtl">

ده المفتاح اللي بيستخدم فعليًا في تشفير الداتا.

مثلاً:

```text
Data Key
    ↓
AES-256
    ↓
Encrypt your data
```

والـ Data Key ممكن يكون مختلف لكل object أو encryption operation.

</div>

---

# The Data Key has two forms

<div dir="rtl">

لما تطلب من KMS:

```text
GenerateDataKey
```

المفهوم الأساسي إنك تحصل على نسختين:

```text
Plaintext Data Key
Encrypted Data Key
```

الشكل:

```text
                 AWS KMS
                    │
             GenerateDataKey
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
   Plaintext Data Key   Encrypted Data Key
          │                   │
          │                   │
          ▼                   │
     Encrypt Data             │
                              │
                              │
                     Store with ciphertext
```

### Plaintext Data Key

ده المفتاح اللي الـ application بيستخدمه فعليًا عشان يعمل encryption للـ data.

### Encrypted Data Key

ده نسخة الـ Data Key بعد ما اتعملها encryption باستخدام الـ KMS Key.

النسخة دي هي اللي تقدر تخزنها مع الـ encrypted data.

</div>

---

# Encryption flow

<div dir="rtl">

خلينا نمشي بالعملية من الأول للآخر.

افترض إن عندنا:

```text
secret.txt
```

ومحتواه:

```text
AWS Secret Information
```

</div>

## Step 1 — Have a KMS Key

```text
KMS Key
```

<div dir="rtl">

الـ KMS Key موجود جوه AWS KMS.

الـ application عنده permissions لاستخدامه، لكنه مش محتاج يشوف الـ plaintext KMS key.

</div>

---

## Step 2 — Generate a Data Key

The application requests:

```text
GenerateDataKey
```

KMS generates a Data Key and returns:

```text
Plaintext Data Key
Encrypted Data Key
```

<div dir="rtl">

يعني تقريبًا:

```text
             AWS KMS
                │
                │ GenerateDataKey
                ▼
       ┌───────────────────┐
       │    Data Key       │
       └─────────┬─────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
 Plaintext            Encrypted
 Data Key               Data Key
```

</div>

---

# Step 3 — Encrypt the data

<div dir="rtl">

الـ application ياخد:

```text
Plaintext Data Key
```

ويستخدمه مع encryption algorithm، زي:

```text
AES-256-GCM
```

وبالتالي:

```text
Plaintext Data
      +
Plaintext Data Key
      ↓
AES-256-GCM
      ↓
Ciphertext
```

مثال:

```text
Plaintext:

AWS Secret Information

        ↓

Encrypted:

8A92F7C91A...
```

</div>

---

# Step 4 — Destroy the plaintext Data Key

<div dir="rtl">

دي نقطة أمنية مهمة جدًا.

بعد ما تخلص عملية الـ encryption، مش المفروض تخزن:

```text
Plaintext Data Key
```

في:

```text
S3
Database
File
Source Code
Environment Variable
```

المفروض يتم التخلص منه من الذاكرة بعد الانتهاء من استخدامه، حسب تصميم التطبيق وبيئة التشغيل.

اللي بيتخزن هو:

```text
Encrypted Data Key
```

مش الـ plaintext key.

</div>

---

# Step 5 — Store the encrypted data and encrypted Data Key

<div dir="rtl">

في النهاية ممكن يبقى عندك:

```text
S3 Object
│
├── Encrypted Data
│
└── Encrypted Data Key
```

أو conceptually:

```text
customer-data.enc
├── ciphertext
└── encrypted_data_key
```

الاتنين محتاجين بعض عشان تعمل decryption بعدين.

</div>

---

# Complete encryption flow

```text
                 ┌──────────────┐
                 │   KMS Key    │
                 └──────┬───────┘
                        │
                        │ GenerateDataKey
                        ▼
              ┌──────────────────┐
              │    Data Key      │
              └───────┬──────────┘
                      │
            ┌─────────┴──────────┐
            │                    │
            ▼                    ▼
     Plaintext Data Key    Encrypted Data Key
            │                    │
            │                    │
            ▼                    │
       Encrypt Data              │
            │                    │
            ▼                    │
     Encrypted Data              │
            │                    │
            └─────────┬──────────┘
                      ▼
                 Store both
```

<div dir="rtl">

الخلاصة:

```text
KMS Key
   ↓
يعمل protection للـ Data Key

Data Key
   ↓
يعمل encryption للـ Data
```

</div>

---

# Decryption flow

<div dir="rtl">

دلوقتي افترض إن عندنا:

```text
Encrypted Data
```

و:

```text
Encrypted Data Key
```

لكن محتاجين:

```text
Plaintext Data Key
```

عشان نقدر نفك تشفير الداتا.

</div>

## Step 1 — Get the encrypted Data Key

```text
Encrypted Data Key
```

<div dir="rtl">

التطبيق يقرأ الـ encrypted Data Key اللي كان متخزن مع الـ encrypted data.

</div>

---

## Step 2 — Ask KMS to decrypt the Data Key

The application calls:

```text
Decrypt
```

KMS uses the appropriate KMS Key to decrypt:

```text
Encrypted Data Key
        ↓
KMS Key
        ↓
Plaintext Data Key
```

---

## Step 3 — Decrypt the data

<div dir="rtl">

دلوقتي الـ application عنده:

```text
Plaintext Data Key
```

فيستخدمه عشان يفك تشفير:

```text
Encrypted Data
```

فتبقى:

```text
Encrypted Data
      +
Plaintext Data Key
      ↓
Decrypt
      ↓
Original Data
```

</div>

---

# Complete decryption flow

```text
Encrypted Data
      │
      │
      │      Encrypted Data Key
      │              │
      │              ▼
      │         ┌─────────┐
      │         │   KMS   │
      │         │   Key   │
      │         └────┬────┘
      │              │
      │           Decrypt
      │              │
      │              ▼
      │       Plaintext Data Key
      │              │
      └──────────────┤
                     │
                     ▼
               Decrypt Data
                     │
                     ▼
                  Plaintext
```

<div dir="rtl">

يعني:

```text
Encrypted Data Key
       ↓
      KMS
       ↓
Plaintext Data Key
       ↓
Decrypt
       ↓
Original Data
```

</div>

---

# Why is it called "Envelope Encryption"?

<div dir="rtl">

الاسم جاي من فكرة إن عندك key بيحمي key تاني.

```text
                KMS Key
                   │
                   ▼
          ┌─────────────────┐
          │ Encrypted Data  │
          │      Key        │
          └─────────────────┘
                   │
                   ▼
          ┌─────────────────┐
          │ Encrypted Data  │
          └─────────────────┘
```

يعني:

> **The KMS Key encrypts the Data Key, and the Data Key encrypts the data.**

ودي أهم جملة تحفظها في الموضوع كله.

</div>

---

# AWS example — S3 SSE-KMS

<div dir="rtl">

لو عندك S3 bucket وعملت:

```text
SSE-KMS
```

فأنت بتستخدم AWS KMS كجزء من تصميم حماية مفاتيح التشفير.

المفهوم العام:

```text
             AWS KMS
                │
             KMS Key
                │
                ▼
            Data Key
                │
                ▼
          S3 Object Data
```

المهم هنا إنك تفرق بين:

```text
KMS Key
```

و:

```text
Data Key
```

لأن الاتنين مش نفس الحاجة.

</div>

---

# Why use Envelope Encryption?

## 1. Efficient encryption

<div dir="rtl">

بدل ما KMS يتعامل مباشرة مع:

```text
10 GB
100 GB
1 TB
```

بيتم استخدام Data Key للـ bulk encryption.

وده أكثر كفاءة للتعامل مع البيانات الكبيرة.

</div>

---

## 2. Different Data Keys

<div dir="rtl">

ممكن يكون عندك:

```text
file1 → Data Key 1
file2 → Data Key 2
file3 → Data Key 3
```

وفي نفس الوقت ممكن كل الـ Data Keys دي تكون محمية بنفس KMS Key.

```text
              KMS Key
             /   |   \
            /    |    \
           ▼     ▼     ▼
        Data1  Data2  Data3
        Key    Key    Key
```

ده بيدي isolation أحسن بين البيانات.

</div>

---

## 3. Centralized key management

<div dir="rtl">

بدل ما application team تخزن master encryption keys بنفسها، AWS KMS يديك مكان مركزي لإدارة:

- Access control
- Key policies
- IAM permissions
- Auditing
- Key rotation capabilities

</div>

---

## 4. Fine-grained access control

<div dir="rtl">

تقدر تحدد مين مسموح له يستخدم الـ KMS Key.

مثلاً application role ممكن يكون عنده:

```text
kms:GenerateDataKey
kms:Decrypt
```

وممكن تمنع roles تانية من استخدام المفتاح.

مثال conceptual:

```text
Application Role
       │
       ├── s3:GetObject
       │
       └── kms:Decrypt
```

يعني الوصول للـ encrypted object لوحده مش كفاية؛ لازم كمان يكون عندك permission لاستخدام مفتاح التشفير المناسب.

</div>

---

# KMS Key vs Data Key

| Feature | KMS Key | Data Key |
|---|---|---|
| Managed by KMS | Yes | Generated by KMS |
| Used to encrypt bulk data | No, normally | Yes |
| Encrypts the Data Key | Yes | No |
| Usually stored as plaintext | No | No |
| Main purpose | Protect encryption keys | Encrypt application data |
| AWS API examples | `Encrypt`, `Decrypt`, `GenerateDataKey` | Used by the application for data encryption |

<div dir="rtl">

أهم فرق:

```text
KMS Key
→ بيحمي الـ Data Key

Data Key
→ بيحمي الـ Data
```

</div>

---

# `GenerateDataKey`

<div dir="rtl">

من أهم APIs اللي لازم تفهمها في AWS KMS:

```text
GenerateDataKey
```

الـ concept بتاعها:

```text
GenerateDataKey
       │
       ▼
Plaintext Data Key
+
Encrypted Data Key
```

الـ plaintext version تستخدمها للتشفير.

والـ encrypted version تخزنها مع الـ ciphertext.

</div>

---

# `Decrypt`

<div dir="rtl">

لما تيجي تفك تشفير الـ encrypted Data Key:

```text
Decrypt
```

KMS يعمل:

```text
Encrypted Data Key
       ↓
     KMS Key
       ↓
Plaintext Data Key
```

بعدها الـ application تستخدم الـ plaintext Data Key لفك تشفير الـ actual data.

</div>

---

# `GenerateDataKeyWithoutPlaintext`

<div dir="rtl">

دي نقطة متقدمة ومهمة.

في بعض designs ممكن تحتاج:

```text
GenerateDataKeyWithoutPlaintext
```

الفكرة إن KMS يولّد Data Key ويطلع لك **encrypted Data Key** من غير ما يرجع لك الـ plaintext Data Key.

```text
GenerateDataKeyWithoutPlaintext
              │
              ▼
       Encrypted Data Key
```

ده مفيد في scenarios معينة لما الـ plaintext key مش محتاج يكون موجود عند caller في نفس اللحظة.

لكن خليك فاكر:

> لو الـ application محتاجة تشفّر data locally، لازم في مرحلة ما يكون عندها plaintext key أو تستخدم خدمة بتعمل التشفير نيابة عنها.

</div>

---

# Envelope Encryption in one picture

```text
                  AWS KMS
                     │
                     │
                ┌────▼────┐
                │ KMS Key │
                └────┬────┘
                     │
              protects / encrypts
                     │
                     ▼
             ┌─────────────┐
             │  Data Key   │
             └──────┬──────┘
                    │
             encrypts / decrypts
                    │
                    ▼
             ┌─────────────┐
             │    Data     │
             └─────────────┘
```

---

# Real-world example

<div dir="rtl">

افترض عندك application على EC2:

```text
EC2
 │
 └── Application
```

والـ application محتاجة تشفّر customer data قبل ما تحطها في S3.

الـ flow:

```text
EC2 Application
      │
      │ GenerateDataKey
      ▼
AWS KMS
      │
      ├───────────────┐
      ▼               ▼
Plaintext         Encrypted
Data Key          Data Key
      │               │
      ▼               │
Encrypt Data           │
      │               │
      ▼               │
Encrypted Data          │
      │               │
      └───────┬────────┘
              ▼
             S3
```

في S3 ممكن يبقى عندك conceptually:

```text
customer-data.enc
│
├── ciphertext
└── encrypted_data_key
```

</div>

---

# Security considerations

<div dir="rtl">

فيه شوية حاجات لازم تفضل فاكرها:

### 1. ما تخزنش الـ plaintext Data Key

الـ plaintext Data Key لازم يفضل في memory فقط للمدة المطلوبة.

### 2. ما تحطش الـ KMS Key في source code

متعملش حاجة بالشكل ده:

```text
KMS_KEY = "my-secret-key"
```

الـ KMS key managed by AWS KMS، والـ access بيتحكم فيه باستخدام IAM وKMS key policies.

### 3. الـ encrypted Data Key مش كفاية لوحده

لازم يكون عندك permission لاستخدام الـ KMS Key المناسب عشان تعمل decryption.

### 4. IAM و KMS Key Policy مهمين

الـ application role لازم يكون عنده permissions مناسبة.

مثلاً:

```text
kms:Decrypt
kms:GenerateDataKey
```

حسب الـ use case.

</div>

---

# AWS Security Specialty — Exam Mindset

<div dir="rtl">

لو شفت في السؤال حاجة بالشكل ده:

> You need to encrypt a large amount of data while using AWS KMS to protect the encryption key.

فكر فورًا:

```text
Envelope Encryption
```

والـ architecture:

```text
KMS Key
   ↓
Data Key
   ↓
Large Data
```

ولو السؤال بيتكلم عن API بتعمل generate للـ plaintext وencrypted versions من الـ data key:

```text
GenerateDataKey
```

ولو السؤال عن فك الـ encrypted data key:

```text
Decrypt
```

</div>

---

# Common confusion

<div dir="rtl">

### ❌ الغلط

الناس ساعات بتفتكر:

```text
KMS Key → Encrypt → S3 Object
```

### ✅ الصح conceptually

```text
KMS Key
   ↓
Encrypt / protect Data Key
   ↓
Data Key
   ↓
Encrypt S3 Object
```

وبرضه متلخبطش بين:

```text
KMS Key ≠ Data Key
```

الـ KMS Key هو طبقة حماية للمفاتيح.

الـ Data Key هو اللي بيستخدم فعليًا مع الـ data encryption.

</div>

---

# Interview question

## Why use Envelope Encryption?

<div dir="rtl">

إجابة كويسة في interview:

> بنستخدم Envelope Encryption عشان نقدر نشفّر كميات كبيرة من البيانات بكفاءة باستخدام Data Keys، وفي نفس الوقت نخلي AWS KMS مسؤول عن حماية وإدارة الـ Data Keys عن طريق KMS Keys.

ولو عايز تقولها بشكل أبسط:

> الـ Data Key بيشفّر الداتا، والـ KMS Key بيشفّر الـ Data Key.

</div>

---

# Key takeaways

<div dir="rtl">

1. **KMS Key مش هو Data Key.**
2. **Data Key هو اللي بيشفّر الـ actual data.**
3. **KMS Key بيحمي الـ Data Key.**
4. `GenerateDataKey` ممكن يرجّع:
   - Plaintext Data Key
   - Encrypted Data Key
5. الـ plaintext Data Key بيتستخدم للتشفير وبعدين يتم التخلص منه.
6. الـ encrypted Data Key بيتخزن مع الـ encrypted data.
7. في الـ decryption، KMS يفك تشفير الـ Data Key الأول.
8. بعد كده الـ application تستخدم الـ plaintext Data Key لفك تشفير الداتا.
9. Envelope Encryption مناسبة جدًا للـ large data workloads.
10. في AWS، اربط الموضوع دايمًا بـ **AWS KMS + Data Keys**.

وأهم جملة تحفظها:

> **The Data Key encrypts the data, while the KMS Key encrypts the Data Key.**

</div>
