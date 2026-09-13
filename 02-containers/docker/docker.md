---
title: Docker
slug: docker
type: guide
domain: 02-containers
tags: [docker, containers, images]
keywords: [dockerfile, container, image, registry, compose, build, volume,
           entrypoint, cmd, pid1, tini, multi-stage, dockerignore,
           دوكر, كونتينر, ايميج, حاويات]
level: 1
status: stable
prerequisites: []
related: [docker-images, kubernetes-basics, devops-interview-questions]
updated: 2026-09-08
---

# Docker

> Docker packages an application together with everything it needs to run, so the same package behaves identically on your laptop and in production.

## What is it?

Docker is a tool for building and running **containers**. A container is your
application plus its libraries, runtime and configuration, bundled into one
unit that runs the same way anywhere.

You use it in three steps that never really change:

```diagram
   Dockerfile          Image              Container
   ──────────          ─────              ─────────
   a recipe     build   a frozen    run    a running
   you write    ────→   snapshot    ────→  process
                        (read-only)        (has state)
```

:::ar
تعال نبدأ من الأول خالص.

إنت عندك برنامج على اللاب بتاعك، وشغّال تمام. لما تروح ترفعه على السيرفر
يقعد يضرب. ليه؟ عشان السيرفر عنده نُسخ تانية من كل حاجة — نسخة بايثون تانية،
مكتبات ناقصة، إعدادات مختلفة.

**دوكر بيحل ده بإنه يحزم البرنامج ومعاه كل اللي محتاجه في حاجة واحدة**، والحاجة
دي بتشتغل بنفس الشكل بالظبط في أي مكان.

التلات كلمات اللي فوق هي كل الحكاية، وعمرها ما بتتغير:

1. **Dockerfile** — ملف نصي إنت بتكتبه، جواه خطوات: ابدأ من كذا، نصّب كذا،
   شغّل كذا. زي الروشتة أو وصفة الأكل.
2. **Image** — لما تعمل `docker build`، دوكر بينفّذ الروشتة ويطلعلك حاجة
   *مجمّدة* وثابتة ومش بتتغير. زي صورة فوتوغرافية للنظام كله.
3. **Container** — لما تعمل `docker run`، الصورة المجمّدة دي بتقوم تشتغل
   وتبقى عملية حية بتاكل رام وبتاكل معالج.

خد بالك من الفرق ده من أول يوم: الـ Image ملف نايم على الديسك، والـ Container
حاجة شغالة. زي الفرق بين ملف الفيلم وبين إنك فاتح الفيلم ده بتتفرج عليه.
:::

## Why it exists

The problem was "it works on my machine". An app needs a specific Python
version, three system libraries and two environment variables — and the server
has different ones.

The old fixes were painful. Install everything on the server by hand and hope
nobody changes it. Or ship a whole virtual machine: a full guest operating
system, gigabytes in size, a minute to boot.

Docker's answer: package **only the application and its dependencies**, and
share the host's operating system kernel.

| | Virtual machine | Container |
|:---|:---|:---|
| Contains | A whole guest OS | Just the app and its libraries |
| Size | Gigabytes | Tens of megabytes |
| Start time | ~30–60 seconds | Under a second |
| Isolation | Very strong (own kernel) | Good (shared kernel) |

```diagram
   VIRTUAL MACHINES                    CONTAINERS
   ────────────────                    ──────────

   ┌──────┐┌──────┐┌──────┐            ┌──────┐┌──────┐┌──────┐
   │ app  ││ app  ││ app  │            │ app  ││ app  ││ app  │
   ├──────┤├──────┤├──────┤            └──────┘└──────┘└──────┘
   │guest ││guest ││guest │  ← the      ┌────────────────────┐
   │  OS  ││  OS  ││  OS  │    part     │  container engine  │
   └──────┘└──────┘└──────┘    that     └────────────────────┘
   ┌────────────────────┐      got      ┌────────────────────┐
   │     hypervisor     │      deleted  │   HOST KERNEL      │
   ├────────────────────┤               │  (shared by all)   │
   │    host kernel     │               ├────────────────────┤
   ├────────────────────┤               │     hardware       │
   │     hardware       │               └────────────────────┘
   └────────────────────┘
   3 kernels booting                    1 kernel, already booted
```

:::ar
الجدول والرسمة اللي فوق بيقولوا نفس الحاجة: **الـ container شال الـ guest OS
من النص**.

الـ VM بيشيل نظام تشغيل كامل جوّه — كيرنل، سيرفيسات، كل حاجة. فعشان كده حجمه
جيجابايتات وبياخد دقيقة يقوم.

الـ container مش بيشيل كيرنل خاص بيه. بيستعير كيرنل السيرفر اللي هو عليه.
وعشان كده حجمه ميجابايتات وبيقوم في أقل من ثانية.

بس خد بالك، ده مش ببلاش. عشان الكيرنل مشترك:

- **مش تقدر تشغّل نظام تشغيل مختلف.** كونتينر لينكس على ويندوز؟ ويندوز بيشغّل
  لك VM لينكس مخبّي جوّه وبيحط الكونتينر فيه. هي دي الحقيقة.
- **العزل أضعف من الـ VM.** الكونتينر عزل *كفاية* إنك تفصل تطبيقات عن بعضها،
  لكنه مش حاجز أمني قوي زي الـ VM. لو حد خرج من الكونتينر، هو بقى على الكيرنل
  بتاع السيرفر كله.

السؤال ده بيتسأل في الانترفيوهات كتير أوي، وأغلب الناس بتقول «الكونتينر أخف»
وتسكت. الإجابة الكاملة هي **ليه** هو أخف: عشان مفيش كيرنل تاني بيقوم.
:::

## What it is made of

Five pieces. Knowing which one you are dealing with removes most Docker
confusion.

| Piece | What it is | Think of it as |
|:---|:---|:---|
| **Dockerfile** | A text file of build instructions | The recipe |
| **Image** | The built, read-only result | A frozen snapshot |
| **Container** | A running instance of an image | The live process |
| **Registry** | A server storing images (Docker Hub, ECR, ACR) | The app store |
| **Volume** | Storage that outlives the container | The external hard drive |

:::key
**Image versus container is the distinction that matters most.** An image is a
file — inert, read-only, shareable. A container is a *running process* started
from that image.

One image can start a hundred containers. Delete a container and the image is
untouched. Anything a container writes is lost when it is removed, unless it
was written to a volume.
:::

:::ar يعني إيه كل واحدة
خمس كلمات، وكل واحدة إنت بتلمسها في وقت مختلف. خلينا نمشي عليهم:

| الكلمة | يعني إيه | تخيلها زي |
|:---|:---|:---|
| **Dockerfile** | ملف نصي إنت اللي كاتبه، جواه الخطوات | الروشتة |
| **Image** | نتيجة الروشتة بعد ما تتنفّذ. مجمّدة ومش بتتغير | صورة فوتوغرافية |
| **Container** | الصورة دي وهي شغالة فعلاً | الفيلم وإنت بتتفرج عليه |
| **Registry** | سيرفر بيخزّن الصور عشان تشيلها وتنزّلها | جوجل درايف للصور |
| **Volume** | مكان تخزين بيعيش أطول من الكونتينر | هارد خارجي |

أهم حاجة تفهمها من الخمسة دول: **الـ Image واحدة، والـ Containers منها ميّة**.
تمسح كونتينر، الصورة زي ما هي. تمسح الصورة، الكونتينرات اللي شغالة مش بتموت.
:::

Behind the scenes there is also the **Docker daemon** (`dockerd`), the
background service that does the actual work, and the **CLI** (`docker`), which
just sends it instructions. When you see "Cannot connect to the Docker daemon",
the service is not running — your command was fine.

```diagram
   YOUR MACHINE                                      SOMEWHERE ELSE
   ─────────────────────────────────────────         ──────────────────

   ┌─────────────┐                 ┌──────────────────────────┐
   │   docker    │    the command  │  dockerd                 │
   │  (the CLI)  │ ──────────────→ │  the daemon              │
   │             │    as JSON      │                          │
   │ build  run  │    over a unix  │  · builds images         │
   │ ps     logs │    socket       │  · starts containers     │
   └─────────────┘                 │  · keeps volumes         │
    types nothing                  │  · wires up networks     │
    but requests                   └──────────────────────────┘
                                        │              ↑
                                 docker │              │ docker
                                 push   │              │ pull
                                        ↓              │
                                   ┌──────────────────────────┐
                                   │  Registry                │
                                   │  Docker Hub · ECR · ACR  │
                                   └──────────────────────────┘
```

:::ar
الرسمة دي بتفسّرلك أغلب رسايل الإيرور الغريبة اللي هتشوفها.

الـ `docker` اللي إنت بتكتبه في التيرمينال **مش بيعمل أي حاجة**. هو بس بيبعت
الطلب لبرنامج تاني شغّال في الخلفية اسمه `dockerd`. ده اللي بيبني وبيشغّل
ويعمل كل حاجة فعلاً.

يبقى لما تشوف:

- `Cannot connect to the Docker daemon` — الأمر بتاعك سليم مية في المية.
  المشكلة إن السيرفيس نفسه مش شغّال. شغّله: `sudo systemctl start docker`.
- `permission denied ... /var/run/docker.sock` — السيرفيس شغّال، بس إنت
  اليوزر بتاعك مش من حقه يكلّمه. ضيف نفسك لجروب دوكر:
  `sudo usermod -aG docker $USER` وبعدها اعمل لوج آوت ولوج إن.
:::

:::warn الـ socket ده هو الروت
`/var/run/docker.sock` مش ملف عادي. أي حد يقدر يكتب فيه، يقدر يشغّل كونتينر
`--privileged` ويوصل لكل حاجة على السيرفر.

يعني لما تحط يوزر في جروب `docker`، إنت فعلياً إديته صلاحيات روت. وكمان لما
تعمل mount للـ socket ده جوّه كونتينر (حاجة بتتعمل كتير مع أدوات الـ CI)،
إنت فتحت السيرفر كله للكونتينر ده. الاتنين دول بيتسألوا في انترفيوهات الأمن.
:::

## How to use it

### 1. Run something that already exists

You do not need a Dockerfile to start. Pull a published image and run it:

```sh title="Run nginx and reach it on localhost:8080"
# -d          run in the background (detached)
# -p 8080:80  map port 8080 on your machine to port 80 in the container
# --name      give it a name, so you don't have to use the random ID
docker run -d -p 8080:80 --name web nginx

# Confirm it is running, then open http://localhost:8080
docker ps
```

The `-p` flag is the one people get backwards. It is always
**`host:container`** — outside first, inside second.

:::ar
الـ `-p 8080:80` دي أكتر حاجة الناس بتعكسها، فخد بالك.

الترتيب دايماً **بره:جوه**.

```diagram
   docker run -p 8080:80 nginx
                  │    │
                  │    └── 80   = البورت اللي البرنامج سامع عليه جوه الكونتينر
                  └─────── 8080 = البورت اللي إنت هتفتحه في البراوزر
```

يعني إنت بتفتح `localhost:8080` وهو بيوصّلك على `80` اللي جوه.

**إزاي تفتكرها؟** إنت واقف بره، فبتبدأ بنفسك. الرقم الأول هو بتاعك، والتاني
بتاع الكونتينر.

ولو نسيت الـ `-p` خالص؟ الكونتينر هيشتغل تمام، ومش هتقدر توصله من البراوزر
لا هو ولا هي. ومش هتشوف أي إيرور — وده اللي بيلخبط الناس.
:::

### 2. Package your own app

Create a file called `Dockerfile` next to your code:

```dockerfile title="Dockerfile — a small Node app"
# Start from an existing image instead of building from nothing.
# "alpine" variants are much smaller; "22" pins the major version.
FROM node:22-alpine

# Everything after this runs inside /app in the image.
WORKDIR /app

# Copy the dependency manifest FIRST, on its own. This is the single most
# valuable line in the file — see the caching note below.
COPY package*.json ./
RUN npm ci --omit=dev

# Now copy the rest of the source.
COPY . .

# Documents which port the app listens on. Does not publish it by itself.
EXPOSE 3000

# The command that runs when a container starts. Use this array form, not a
# plain string, so your app receives shutdown signals properly.
CMD ["node", "server.js"]
```

Then build and run it:

```sh title="Build, then run"
# -t gives the image a name and tag. Without it you get an untagged image
# that is awkward to refer to later.
docker build -t my-app:1.0 .

docker run -d -p 3000:3000 --name my-app my-app:1.0
```

:::tip Why `COPY package*.json` comes before `COPY . .`
Docker caches each instruction as a layer. If a layer's inputs have not
changed, it is reused instead of re-run.

Dependencies change rarely; your source changes constantly. By copying the
manifest and installing dependencies **first**, the slow `npm ci` step stays
cached across every source-only edit.

Reverse those lines and every one-character code change re-installs every
dependency. This one ordering decision is often the difference between a
5-second and a 3-minute build.
:::

:::ar الكاش ده أهم سطر في الملف
دوكر بيبني الـ image **طبقة طبقة**، وكل سطر في الـ Dockerfile بيطلع طبقة.

الحكاية إن دوكر بيقول لنفسه: «السطر ده، مدخلاته اتغيرت؟ لو لأ، مش هعيد
تنفيذه — هستخدم اللي عندي من قبل». ودي حاجة حلوة جداً... لكن فيها شرط قاسي:

**أول طبقة تتغير، كل اللي بعديها بيتلغي كاشها كلها.** حتى لو هي نفسها ما
اتغيرتش.

بص على الفرق:

```diagram
   الترتيب الغلط                        الترتيب الصح
   ──────────────                        ────────────
   COPY . .          ← الكود            COPY package*.json ./
   RUN npm ci        ← التنصيب          RUN npm ci          ← نادراً بيتغير
                                        COPY . .            ← بيتغير كل شوية

   تغيّر حرف في الكود؟                  تغيّر حرف في الكود؟
   الـ COPY كاشها باظ                   الـ COPY الأخير بس اللي باظ
        ↓                                    ↓
   الـ npm ci كاشها باظ كمان            الـ npm ci لسه بالكاش
        ↓                                    ↓
   ٣ دقايق كل مرة                       ٥ ثواني
```

عشان كده بنحط ملف الـ dependencies **لوحده الأول**، وننصّب، وبعدين نجيب باقي
الكود. الحاجة اللي بتتغير كتير تحتها، والحاجة البطيئة اللي مش بتتغير فوقها.

القاعدة اللي تحفظها: **رتّب الـ Dockerfile من الأقل تغيّراً للأكتر تغيّراً.**
:::

### 3. The commands you will actually use daily

```sh
docker ps                  # running containers
docker ps -a               # including stopped ones — where exited containers hide
docker images              # images on this machine
docker logs -f my-app      # follow the output. First stop for "why did it break?"
docker exec -it my-app sh  # get a shell INSIDE a running container
docker stop my-app         # graceful stop
docker rm my-app           # delete the (stopped) container
docker rmi my-app:1.0      # delete the image
docker system prune -a     # reclaim disk. Deletes unused images — read the prompt
```

`docker logs` and `docker exec` are where you will spend most of your
debugging time. `docker logs` shows what the app printed; `docker exec` puts
you inside the container to look around.

:::ar
لو مش هتحفظ غير أمرين من اللستة اللي فوق، خليهم دول:

- **`docker logs -f my-app`** — بيوريك البرنامج قال إيه. دي أول حاجة تعملها
  في أي مشكلة، مش تانية حاجة ولا تالتة. أول حاجة.
- **`docker exec -it my-app sh`** — بيدخّلك جوه الكونتينر وهو شغّال، تبص
  بعينك على الملفات والإعدادات.

وفي حاجة الناس بتقع فيها كتير: **الكونتينر بيقفل لوحده وإنت مش فاهم ليه**.

`docker ps` مش هيوريك حاجة، عشان هو بيوري الشغّال بس. اكتب `docker ps -a`
بالـ `-a` وهتلاقيه هناك مكتوب جنبه `Exited (1)`. وبعدها `docker logs` هيقولك
السبب.

القاعدة اللي لازم تفهمها: **الكونتينر عمره = عمر البرنامج اللي جواه.** البرنامج
خلص أو مات؟ الكونتينر يقفل في نفس اللحظة. مفيش حاجة اسمها كونتينر فاضي شغّال.
:::

### 4. Several containers at once: Compose

An app usually needs a database too. Writing three `docker run` commands with
the right flags in the right order gets old immediately. Compose puts it in
one file:

```yaml title="compose.yaml — app plus database"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://user:pass@db:5432/mydb
    depends_on:
      - db

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
      POSTGRES_DB: mydb
    # Without this volume, your data is deleted with the container.
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```sh
docker compose up -d      # start everything
docker compose logs -f    # follow all services' logs together
docker compose down       # stop and remove (volumes survive)
```

Note `postgres://user:pass@db:5432` — the hostname is `db`, the *service name*.
Compose puts the services on one network where each is reachable by its name.
You never need to know their IP addresses.

:::ar
ركّز في النقطة دي عشان هي أساس كل حاجة في كوبرنيتيس بعد كده.

شوف الرابط: `postgres://user:pass@db:5432`. اسم السيرفر مكتوب `db`. ومفيش
حاجة اسمها `db` في الـ DNS بتاع الإنترنت.

اللي بيحصل إن Compose بيعمل **شبكة خاصة** للمشروع بتاعك، وبيحط جواها كل
السيرفيسات، وكل سيرفيس بياخد اسمه اللي إنت كاتبه في الـ YAML كـ hostname.

```diagram
   ┌─────────────────────────────────────────────┐
   │   compose network (شبكة خاصة بالمشروع)      │
   │                                             │
   │   ┌──────────┐   يكلّمه بـ    ┌──────────┐  │
   │   │   app    │ ──────────────→│    db    │  │
   │   │          │  اسمه "db"     │          │  │
   │   └──────────┘   مش بـ IP     └──────────┘  │
   │                                             │
   └─────────────────────────────────────────────┘
              ↑
       بره الشبكة دي محدش يعرف "db" دي إيه
```

فايدة الحكاية دي إن **إنت عمرك ما بتكتب IP في أي إعداد**. الـ IP بيتغير كل
مرة الكونتينر يقوم، أما الاسم فثابت.

:::warn `depends_on` مش معناها إن الداتابيز جاهزة
دي غلطة كلاسيكية. `depends_on: db` معناها «استنى كونتينر الـ db **يقوم**»،
ومعناهاش «استنى بوستجرس تبقى مستعدة تستقبل كونيكشن».

بوستجرس بتاخد ثانيتين تلاتة بعد ما الكونتينر يقوم لحد ما تفتح البورت. فالتطبيق
بتاعك بيقوم قبلها، بيحاول يتصل، بيفشل، وبيقفل.

الحل الصح إن التطبيق نفسه يعيد المحاولة (retry) لما الكونيكشن يفشل — مش إنك
تحاول ترتّب من بره. وده بالمناسبة نفس السبب اللي عشانه بنكتب readiness probes
في كوبرنيتيس.
:::
:::

## How it works underneath

A container is not a small virtual machine. It is an **ordinary Linux process**
with two kernel features applied to it:

```diagram
        ┌──────────────────────────────────────────┐
        │  your app  (just a process on the host)  │
        └──────────────────────────────────────────┘
             │                          │
    ┌────────↓─────────┐      ┌─────────↓──────────┐
    │   NAMESPACES     │      │      CGROUPS       │
    │ what it can SEE  │      │ what it can USE    │
    ├──────────────────┤      ├────────────────────┤
    │ own process list │      │ CPU limit          │
    │ own network/IP   │      │ memory limit       │
    │ own filesystem   │      │ I/O limit          │
    │ own hostname     │      │                    │
    └──────────────────┘      └────────────────────┘
                    │
        ┌───────────↓────────────┐
        │  SHARED HOST KERNEL    │ ← the whole trade-off
        └────────────────────────┘
```

Run `ps aux` on the host and you will see your containerised process listed
like any other. That is the entire trick: the process is real, but its *view*
of the system is restricted.

This also explains the limits. Containers cannot run a different kernel, which
is why Linux containers on Windows or macOS run inside a hidden Linux VM. And
because the kernel is shared, containers are a good isolation boundary but a
weaker security boundary than a VM.

:::ar الكونتينر مش صندوق سحري
دي أهم فكرة في الصفحة كلها، ولو فهمتها هتفهم كل حاجة بعدها.

**الكونتينر مش ماكينة صغيرة. الكونتينر عملية لينكس عادية خالص**، بس اتعمللها
حاجتين:

| الحاجة | بتعمل إيه | ترجمتها |
|:---|:---|:---|
| **Namespaces** | بتحدد هو **يشوف** إيه | «إنت مش شايف غير حجرتك» |
| **cgroups** | بتحدد هو **ياخد** قد إيه | «مش هتاخد أكتر من ٢ جيجا رام» |

يعني الـ namespaces بتكدب عليه، وبتخليه يفتكر إنه لوحده على السيرفر: عنده
قايمة عمليات خاصة بيه، وشبكة خاصة، وملفات خاصة. والـ cgroups بتلجمه، تمنعه
إنه ياكل المعالج والرام كلهم ويوقّع السيرفر.

**عايز تتأكد بنفسك؟** شغّل كونتينر، وبعدين على السيرفر نفسه (مش جوه
الكونتينر) اكتب `ps aux` — هتلاقي العملية بتاعتك مكتوبة هناك زي أي برنامج
تاني. مفيش أي حاجة سحرية.

وده بالظبط اللي بيفسّر التلات حدود:

1. **مفيش كيرنل تاني** — فمش تقدر تشغّل كونتينر ويندوز على لينكس، ولا العكس.
2. **الأمن أضعف من الـ VM** — كلكم قاعدين على نفس الكيرنل. ثغرة في الكيرنل
   تبقى ثغرة في كل الكونتينرات.
3. **بيقوم في ثانية** — طبعاً، مفيش نظام تشغيل بيقوم. إنت بتشغّل عملية وخلاص.
:::

## What goes wrong

| Symptom | Usual cause | Fix |
|:---|:---|:---|
| `Cannot connect to the Docker daemon` | Docker service not running | Start Docker Desktop / `sudo systemctl start docker` |
| Container exits immediately | The main process finished | `docker logs`. A container lives only as long as its main process |
| `port is already allocated` | Something else has that host port | Change the left side of `-p`, or stop the other container |
| Changes to code not appearing | You rebuilt nothing, or ran the old image | `docker build` again; check the tag you ran |
| Data disappeared after restart | Written to the container filesystem, not a volume | Mount a volume |
| Image is enormous (1GB+) | Build tools left in the final image | Use a multi-stage build and an `alpine` or `slim` base |
| Disk full | Old images and build cache accumulate | `docker system prune -a` |

:::ar خد الترتيب ده وإنت بتظبّط أي مشكلة
مش مهم المشكلة إيه، امشي على الترتيب ده بالظبط ومتقلبهوش:

```diagram
   ١. هو شغّال أصلاً؟          docker ps -a
                                 (بالـ -a! عشان تشوف اللي قفل)
              ↓
   ٢. قال إيه قبل ما يموت؟     docker logs my-app
                                 (هنا بتلاقي الجواب ٨ مرات من ١٠)
              ↓
   ٣. جوّه شكله إيه؟           docker exec -it my-app sh
                                 (لو لسه شغّال)
              ↓
   ٤. بُني بإيه؟                docker inspect my-app
                                 (الإعدادات والبورتات والـ mounts)
```

وأشهر تلات حالات وإنت بتتعلم:

- **`port is already allocated`** — حاجة تانية ماسكة البورت. غيّر **الرقم
  الشمال** في الـ `-p`، أو قفل اللي شغّال. الرقم اليمين متلمسهوش، ده بتاع
  البرنامج نفسه.
- **«عدّلت في الكود ومش بيبان»** — إنت شغّال الـ image القديمة. الكونتينر
  مش بيشوف الملفات بتاعتك، هو شايف نسخة متصوّرة جوه الـ image.
  اعمل `docker build` تاني، وبصّ على التاج اللي بتشغّله.
- **«الديسك فضي»** — الصور القديمة والكاش بيتراكموا بالجيجا.
  `docker system prune -a` بس **اقرأ اللي بيسألك عليه** قبل ما تدوس Enter،
  عشان بيمسح كل صورة مش مستخدمة حالياً.
:::

:::danger Your data is deleted by default
Anything a container writes goes to a temporary layer that is destroyed with
the container. `docker rm` on a database container with no volume deletes the
database.

This surprises people because it works fine until the first restart. Any
container that holds data you care about needs a volume:

```sh
# -v <volume-name>:<path-inside-container>
docker run -d -v pgdata:/var/lib/postgresql/data postgres:17
```
:::

:::warn `latest` does not mean newest
`nginx:latest` is just a tag someone chose to move. It is not resolved
dynamically, and it can point at a different build tomorrow than it does today.

Using it means two builds of the same Dockerfile can produce different images —
which makes "works on my machine" possible again, this time inside Docker. Pin a
real version: `nginx:1.27-alpine`.
:::

## Two habits worth forming early

**Multi-stage builds.** Compile with a big toolchain, then copy only the result
into a small final image:

```dockerfile title="Build tools stay out of the shipped image"
# Stage 1 — has the full toolchain
FROM node:22 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — only the built output and runtime dependencies
FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/server.js"]
```

Nothing from stage 1 exists in the final image. It is routinely a 10× size
reduction, and it removes compilers from your production image.

**A `.dockerignore` file.** Without it, `COPY . .` sends your entire directory —
including `node_modules`, `.git` and any local secrets — into the build:

```text title=".dockerignore"
node_modules
.git
.env
*.log
dist
```

:::note Anything ever in an image layer stays in the image
Adding a secret in one layer and deleting it in the next does **not** remove
it. The earlier layer is still there and anyone with the image can extract it.

Never `COPY` a credential. Pass secrets as environment variables at run time,
or use build-time secret mounts.
:::

:::ar
الـ multi-stage build بسيطة أكتر ما هي مبيّنة. إنت بتقول لدوكر:

«ابنيلي في مطبخ فيه كل العُدة، وبعد ما تخلص، **شيل الطبق بس** وسيب المطبخ».

الكومبايلر والـ dev dependencies وأدوات البناء — كل دي كانت موجودة في
Stage 1، ومحدش منها بيوصل للـ image النهائية. إنت بتنقل الناتج بس بـ
`COPY --from=build`.

الفايدة مش الحجم بس. الفايدة الأمنية أكبر: **مفيش كومبايلر في البرودكشن**،
يعني لو حد دخل الكونتينر مش هيلاقي أدوات يبني بيها حاجة.

:::danger السيكرت اللي مسحته لسه موجود
دي أخطر غلطة في الصفحة كلها، وناس كبيرة بتقع فيها.

لو عملت كده:

```dockerfile
COPY id_rsa /root/.ssh/id_rsa     ← طبقة ١
RUN git clone ... && rm /root/.ssh/id_rsa   ← طبقة ٢
```

إنت **ما مسحتش حاجة**. طبقة ١ لسه موجودة جوه الـ image، وأي حد معاه الصورة
يقدر يطلّع المفتاح منها بـ `docker save` وفك الأرشيف.

الطبقات في دوكر بتتراكم فوق بعضها، والمسح في طبقة جديدة بيخبّي الملف بس
ما بيحذفوش. زي ما تحط ورقة فوق ورقة — الورقة اللي تحت لسه مكتوب فيها.

الصح: `--mount=type=secret` وقت البناء، أو environment variable وقت التشغيل.
:::
:::

## Interview corner · الأسئلة اللي بتتسأل

The questions below are the ones that actually separate candidates. Each answer
is collapsed — read the question, answer it in your head, *then* open it.

:::q Is a container just a lightweight VM? · الكونتينر مجرد VM صغير؟
**No, and the reason matters more than the answer.**

A VM virtualises *hardware* and boots its own kernel. A container is an
ordinary host process with `namespaces` restricting what it can see and
`cgroups` restricting what it can consume. There is no second kernel.

Three consequences you should volunteer without being asked:

- You cannot run a Windows container on a Linux host, or vice versa. Docker
  Desktop runs a hidden Linux VM to make this look seamless.
- Isolation is good, but it is a weaker *security* boundary than a VM,
  because a kernel vulnerability is shared by every container on the host.
- Startup is sub-second precisely because nothing boots.

:::ar
الإجابة القصيرة: لأ.

والسبب هو اللي بيفرق. الـ VM بيعمل محاكاة للهاردوير وبيقوم بكيرنل خاص بيه.
الكونتينر عملية عادية على السيرفر، اتحطّت عليها حاجتين: `namespaces` بتحدد
هي تشوف إيه، و `cgroups` بتحدد هي تاخد قد إيه. **مفيش كيرنل تاني.**

ولو عايز تبيّن إنك فاهم فعلاً، قول التلات نتايج دول من نفسك قبل ما هو
يسألك عليهم: مش ينفع كونتينر ويندوز على لينكس، والعزل الأمني أضعف من الـ VM
عشان الكيرنل مشترك، وبيقوم في أقل من ثانية عشان مفيش نظام بيقوم.
:::
:::

:::q CMD versus ENTRYPOINT — and what does `docker run my-app echo hi` do to each?
`ENTRYPOINT` is the command that always runs. `CMD` is the *default arguments*,
and anything you type after the image name replaces it.

| Dockerfile | `docker run img` | `docker run img echo hi` |
|:---|:---|:---|
| `CMD ["node","a.js"]` | `node a.js` | `echo hi` |
| `ENTRYPOINT ["node","a.js"]` | `node a.js` | `node a.js echo hi` |
| `ENTRYPOINT ["node"]` + `CMD ["a.js"]` | `node a.js` | `node echo hi` |

The third row is the pattern you want in production: `ENTRYPOINT` fixes the
binary, `CMD` supplies overridable defaults.

:::warn The shell form breaks signal handling
`CMD node server.js` (no brackets) runs as `/bin/sh -c "node server.js"`.
The shell becomes PID 1, and it does **not** forward `SIGTERM` to your app.
`docker stop` then waits 10 seconds and kills the container outright — every
in-flight request dropped, every clean-up handler skipped.

Always use the array (exec) form: `CMD ["node","server.js"]`.
:::

:::ar
`ENTRYPOINT` هو الأمر اللي **بيتنفّذ دايماً**. و `CMD` هي الـ **arguments
الافتراضية** اللي أي حاجة تكتبها بعد اسم الـ image بتستبدلها.

الشكل الصح في البرودكشن هو التالت: `ENTRYPOINT` بيثبّت البرنامج، و `CMD`
بيحط قيم تقدر تغيّرها من بره.

وأهم حاجة هنا — **متكتبهم من غير أقواس مربعة**. لما تكتب
`CMD node server.js` دوكر بيشغّلها جوه `sh -c`، فالشِل بيبقى هو PID 1،
والشِل **مش بيوصّل** إشارة `SIGTERM` لبرنامجك. النتيجة إن `docker stop`
بيستنى ١٠ ثواني وبعدين بيقتل الكونتينر بالعنف، وكل الريكوستات اللي كانت
شغالة بتضيع.
:::
:::

:::q Your container has a zombie process problem and `docker stop` takes 10 seconds every time. Why?
**Your application is PID 1, and PID 1 has responsibilities it was not
written for.**

In Linux, PID 1 is the init process. It has two special duties: reaping
orphaned child processes, and it does **not** get default signal handlers.
A normal app made PID 1 therefore:

- never reaps children, so dead subprocesses pile up as zombies;
- ignores `SIGTERM` unless it explicitly installs a handler, so `docker stop`
  falls through to the 10-second timeout and `SIGKILL`.

```diagram
   docker stop
        │
        │  SIGTERM  →  PID 1 (your app, no handler)  →  ignored
        │
        │  ... waits --time=10 (the default) ...
        ↓
      SIGKILL     →  killed dead, no clean-up, connections dropped
```

**Fixes, in order of preference:** handle `SIGTERM` in the app; or run
`docker run --init` / add `tini` as the entrypoint so a real init sits at
PID 1; in Kubernetes, `shareProcessNamespace` and a proper `preStop` hook.

:::ar
السبب إن **برنامجك بقى PID 1**، و PID 1 في لينكس له مهام برنامجك مش متكتب
عشانها.

الـ PID 1 هو الـ init، وله حاجتين مميزين:

1. **بيلمّ العمليات اليتيمة** (reaping). برنامجك مش بيعمل كده، فالعمليات
   الميتة بتتكوّم كـ zombies.
2. **مش بياخد معالجات إشارات افتراضية.** يعني لو برنامجك ما عملش handler
   لـ `SIGTERM` بنفسه، الإشارة بتتجاهل تماماً.

وعشان كده `docker stop` بياخد ١٠ ثواني كل مرة: بيبعت `SIGTERM`، محدش بيرد،
بيستنى المهلة، وبعدين بيبعت `SIGKILL` اللي مفيش حد يقدر يتجاهله.

الحل بالترتيب: الأحسن إن البرنامج نفسه يسمع `SIGTERM` ويقفل بالراحة. ولو
مش قادر، شغّله بـ `--init` أو حط `tini` كـ entrypoint، فيبقى فيه init
حقيقي في PID 1 بيعمل الشغل ده.
:::
:::

:::q An image is 1.2 GB. Walk me through getting it to under 100 MB.
Answer as an ordered investigation, not a list of tricks:

1. **Look first.** `docker history --no-trunc my-app:1.0` shows the size of
   every layer. Fix the biggest one, not the easiest one.
2. **Multi-stage build.** Compile in a fat stage, `COPY --from=build` only
   the artefact. This is usually the single biggest win.
3. **Smaller base.** `node:22` is ~1.1 GB; `node:22-alpine` is ~130 MB.
   Check your dependencies tolerate musl libc first — native modules
   sometimes do not.
4. **`.dockerignore`.** `COPY . .` with no ignore file ships `node_modules`,
   `.git` and local `.env` files into the image.
5. **Combine `RUN` layers that create then delete.** `apt-get install`
   followed by `rm -rf /var/lib/apt/lists/*` must be in the *same* `RUN`, or
   the deletion just adds a layer and the files stay in the earlier one.

:::key What is really being tested
Whether you *measure before optimising*. A candidate who opens with
"switch to alpine" is guessing. A candidate who opens with `docker history`
is engineering.
:::

:::ar
جاوب على الترتيب ده، مش كلستة نصايح:

**١. بصّ الأول.** `docker history --no-trunc my-app:1.0` بيوريك حجم كل طبقة
لوحدها. ظبّط أكبر طبقة، مش أسهل طبقة.

**٢. multi-stage build.** ابني في stage كبيرة، وانقل الناتج بس. دي عادةً
أكبر توفير هتشوفه.

**٣. base أصغر.** `node:22` حجمها حوالي ١.١ جيجا، و `node:22-alpine` حوالي
١٣٠ ميجا. بس اتأكد الأول إن المكتبات بتاعتك بتشتغل على musl، عشان أحياناً
المكتبات اللي فيها كود native بتضرب على alpine.

**٤. ملف `.dockerignore`.** من غيره `COPY . .` بيشيل معاه `node_modules`
و `.git` وملفات `.env` بتاعتك جوه الصورة.

**٥. اجمع الـ RUN اللي بينصّب واللي بيمسح في سطر واحد.** لو نصّبت في `RUN`
ومسحت في `RUN` تانية، إنت ما وفّرتش حاجة — الملفات لسه في الطبقة الأولى.

**والحاجة اللي بيتقاس عليها في السؤال ده:** إنك **بتقيس قبل ما تظبّط**.
اللي بيبدأ كلامه بـ «نستخدم alpine» بيخمّن. واللي بيبدأ بـ `docker history`
بيهندس.
:::
:::

:::q We mount `/var/run/docker.sock` into our CI container so it can build images. What did we just do?
**You gave that container root on the host.**

Anything that can write to the Docker socket can ask the daemon to start a
new container with `--privileged`, mounting `/` from the host. That is a
complete, trivial escape. The same is true of adding a user to the `docker`
group — it is equivalent to granting passwordless `sudo`.

**Alternatives:** a rootless builder such as BuildKit in rootless mode,
Kaniko, or Buildah; or a dedicated build service the CI job calls rather
than a socket it controls.

:::ar
إنت للأسف إديت الكونتينر ده **صلاحيات روت على السيرفر كله**.

أي حاجة تقدر تكتب على الـ socket بتاع دوكر، تقدر تطلب من الـ daemon إنه
يشغّل كونتينر جديد بـ `--privileged` ويعمل mount للـ `/` بتاع السيرفر
نفسه. وبكده يبقى خرج من الكونتينر خروج كامل، وبأبسط طريقة ممكنة.

ونفس الكلام ينطبق على إنك تحط يوزر في جروب `docker` — ده معناه حرفياً إنك
إديته `sudo` من غير باسورد.

**البدايل:** تستخدم builder مش محتاج روت زي BuildKit في وضع rootless، أو
Kaniko، أو Buildah. أو يكون فيه سيرفيس مخصوص للبناء بتنادي عليه، بدل إنك
تسلّم السوكيت نفسه.
:::
:::

## Key takeaways

- **Dockerfile → image → container.** Recipe, snapshot, running process.
- **`-p host:container`** — outside first. This is the most-reversed flag.
- **Copy dependency manifests before source code.** It keeps the slow install
  step cached and is the biggest single build-speed win.
- **No volume means no data.** Container filesystems are temporary by design.
- **Pin versions.** `latest` is a moving label, not a version.
- A container is a **process with a restricted view**, not a small VM — which is
  why it starts instantly and why it shares your kernel.
- **Use the array form of `CMD`/`ENTRYPOINT`.** The shell form makes `sh` PID 1,
  which swallows `SIGTERM` and turns every stop into a 10-second kill.

:::ar الخلاصة في ٨ نقط
لو مش فاضي تقرأ الصفحة كلها تاني بعد ٦ شهور، اقرأ دي:

1. **Dockerfile → Image → Container.** روشتة، صورة مجمّدة، عملية شغالة.
2. **`-p 8080:80` بره الأول.** أكتر فلاج بيتعكس.
3. **ملف الـ dependencies قبل الكود** في الـ Dockerfile. ده أكبر توفير في
   وقت البناء، ومجاني.
4. **من غير volume مفيش داتا.** أي حاجة الكونتينر يكتبها بتموت معاه.
5. **متستخدمش `latest`.** ده مش «الأحدث»، ده تاج حد بيحرّكه بإيده. ثبّت
   نسخة حقيقية.
6. **الكونتينر عملية، مش ماكينة.** عشان كده بيقوم في ثانية، وعشان كده
   الكيرنل مشترك.
7. **اكتب `CMD` بأقواس مربعة.** من غيرهم الشِل بيبقى PID 1 وبياكل الـ
   `SIGTERM`، وكل `docker stop` بياخد ١٠ ثواني وبيقتل الريكوستات.
8. **السيكرت اللي دخل طبقة مبيخرجش.** المسح في طبقة بعديها بيخبّي بس.
:::
