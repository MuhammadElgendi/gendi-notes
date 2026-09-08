---
title: kubectl Cheat Sheet
slug: kubectl-commands
type: cheat-sheet
domain: 14-cheat-sheets
tags: [kubernetes, kubectl, cheatsheet]
keywords: [kubectl, commands, jsonpath, context, namespace, debug, port-forward,
           kubectx, kubens, events, rollout, describe,
           كيوبكتل, اوامر, كوبرنيتيس, شيت شيت]
level: 1
status: stable
prerequisites: [kubernetes-basics]
related: [kubernetes-troubleshooting, linux-commands]
updated: 2026-09-08
---

# kubectl Cheat Sheet

> Grouped by what you are trying to find out, not alphabetically — because at 3am you know the question, not the flag.

## Which command do I want?

```diagram
   What do I need to know?
      │
      ├─ "what is running?"        → kubectl get
      ├─ "why is it broken?"       → kubectl describe  →  kubectl logs
      ├─ "what is it using?"       → kubectl top
      ├─ "what changed?"           → kubectl get events / rollout history
      ├─ "can I get inside it?"    → kubectl exec / debug
      └─ "can I reach it locally?" → kubectl port-forward
```

:::ar بالمصري · اختار الأمر على أساس **سؤالك** مش على أساس حفظك
الصفحة دي مرتّبة على أساس **إنت عايز تعرف إيه**، مش أبجدي — عشان الساعة
٣ الفجر إنت عارف **السؤال**، مش عارف اسم الـ flag.

```diagram
   عايز تعرف إيه؟
      │
      ├─ "إيه اللي شغّال؟"           → kubectl get
      ├─ "ليه بايظ؟"                 → kubectl describe  →  kubectl logs
      ├─ "بياكل قد إيه؟"             → kubectl top
      ├─ "إيه اللي اتغير؟"           → kubectl get events / rollout history
      ├─ "أقدر أدخل جواه؟"           → kubectl exec / debug
      └─ "أقدر أوصله من اللاب؟"      → kubectl port-forward
```

**والقاعدة اللي تحفظها فوق أي حاجة:**

> **`describe` الأول، وبعدين `logs --previous`.**

الـ `describe` بيقولك **كوبرنيتيس** شايف إيه (الـ Events في الآخر بتكتب
المشكلة بالكلام)، والـ `logs` بيقولك **التطبيق** قال إيه.

والاتنين مع بعض بيحلوا أغلب المشاكل من غير أي أمر تالت.
:::

## Setup — do these once

```sh
# Shorten it. Everyone does this.
alias k=kubectl

# Tab completion (bash — use ~/.zshrc and zsh for zsh)
echo 'source <(kubectl completion bash)' >> ~/.bashrc
echo 'complete -o default -F __start_kubectl k' >> ~/.bashrc

# Stop typing -n every time
kubectl config set-context --current --namespace=production
```

## What is running?

| Command | Shows |
|:---|:---|
| `kubectl get pods` | Pods in the current namespace |
| `kubectl get pods -A` | **Every** namespace — use when you can't find something |
| `kubectl get pods -o wide` | Adds pod IP and node |
| `kubectl get pods -w` | Watch live as statuses change |
| `kubectl get pods -l app=web` | Only pods with that label |
| `kubectl get all` | Most object types here |
| `kubectl get nodes` | The machines. All should be `Ready` |
| `kubectl api-resources` | Every object type available, with short names |

```sh
# Sort by restarts — finds the unstable pod instantly
kubectl get pods --sort-by='.status.containerStatuses[0].restartCount'

# Sort by age, newest last
kubectl get pods --sort-by=.metadata.creationTimestamp

# Only pods that are NOT running
kubectl get pods --field-selector=status.phase!=Running -A
```

## Why is it broken?

```sh
kubectl describe pod <pod>          # THE first command. Read the Events at the bottom
kubectl logs <pod>                  # what the app printed
kubectl logs <pod> -f               # follow
kubectl logs <pod> --previous       # the CRASHED container — essential for CrashLoopBackOff
kubectl logs <pod> -c <container>   # multi-container pods
kubectl logs <pod> --tail=100
kubectl logs -l app=web --all-containers --tail=50   # across every matching pod
```

```sh
# Cluster-wide events, newest last. When several things break at once,
# this often reveals the single cause.
kubectl get events -A --sort-by=.lastTimestamp | tail -30

# Only warnings
kubectl get events -A --field-selector type=Warning
```

:::key The three that solve most problems
1. `kubectl describe pod <pod>` — the **Events** section usually names it.
2. `kubectl logs <pod> --previous` — what the app said before dying.
3. `kubectl get endpoints <svc>` — `<none>` means the Service has no backends.
:::

## Getting inside

```sh
kubectl exec -it <pod> -- sh                  # or bash, if the image has it
kubectl exec -it <pod> -c <container> -- sh
kubectl exec <pod> -- env                     # run one command, no shell
kubectl exec <pod> -- cat /etc/config/app.yaml

# Distroless / scratch image with no shell? Attach a debug container that
# shares the target's namespaces and brings its own tools.
kubectl debug -it <pod> --image=busybox --target=<container>

# Container crashes too fast to exec into? Copy it with the entrypoint replaced.
kubectl debug <pod> -it --copy-to=debug --container=<name> -- sh

# A throwaway pod for network testing
kubectl run tmp --rm -it --image=busybox --restart=Never -- sh
```

## Reaching things from your laptop

```sh
kubectl port-forward svc/web 8080:80      # then http://localhost:8080
kubectl port-forward pod/<pod> 5432:5432  # straight to one pod
kubectl port-forward deploy/web 8080:80
```

`port-forward` is how you test an internal Service without exposing it.

## Resource usage

```sh
kubectl top nodes                       # needs metrics-server installed
kubectl top pods -A --sort-by=memory
kubectl top pods -A --sort-by=cpu
kubectl top pod <pod> --containers      # per-container

# What is actually requested vs available on a node
kubectl describe node <node> | grep -A10 "Allocated resources"
```

## Changing things

```sh
kubectl apply -f manifest.yaml      # create OR update. Always use this
kubectl apply -f ./manifests/       # a whole directory
kubectl delete -f manifest.yaml
kubectl diff -f manifest.yaml       # what WOULD change. Run before apply

kubectl scale deploy/web --replicas=5
kubectl set image deploy/web web=myapp:2.0
kubectl rollout status deploy/web       # wait for the rollout
kubectl rollout restart deploy/web      # recreate pods, pick up new config
kubectl rollout undo deploy/web         # roll back
kubectl rollout history deploy/web

kubectl edit deploy/web                 # opens your editor, applies on save
```

:::warn `kubectl edit` and `kubectl scale` change the cluster, not your files
Your Git manifests are now out of date, and the next `apply` reverts your
change silently.

Fine for debugging. For anything permanent, change the file and `apply`.
:::

## Extracting specific values

```sh
# One field
kubectl get pod <pod> -o jsonpath='{.status.podIP}{"\n"}'

# All images in a namespace
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].image}{"\n"}{end}'

# Custom columns — much more readable than jsonpath for tables
kubectl get pods -o custom-columns=\
NAME:.metadata.name,STATUS:.status.phase,NODE:.spec.nodeName,IP:.status.podIP

# Full object, for reading or copying
kubectl get pod <pod> -o yaml
```

## Contexts and namespaces

```sh
kubectl config get-contexts             # every cluster you can reach
kubectl config current-context          # WHICH CLUSTER AM I ON?
kubectl config use-context staging
kubectl config set-context --current --namespace=production

kubectl get ns                          # list namespaces
```

:::danger Check your context before anything destructive
`kubectl config current-context` costs one second. Running `delete` against
production because your terminal was still pointed there is a genuinely common
and expensive mistake.

Put the context in your shell prompt (`kube-ps1`, or `starship`) so it is always
visible rather than something you have to remember to check.
:::

## Config and secrets

```sh
kubectl get configmap
kubectl get configmap app-config -o yaml

kubectl create secret generic db-creds \
  --from-literal=username=admin --from-literal=password='s3cret'

# Secrets are base64-encoded, NOT encrypted. This decodes one:
kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d; echo
```

:::warn Secrets are encoded, not encrypted
Anyone with read access to Secrets in a namespace can decode every value with
the command above. Base64 is not security.

Real protection needs RBAC restricting who can read Secrets, plus encryption at
rest on etcd, or an external store (Vault, cloud secret managers).
:::

## Cleaning up

```sh
kubectl delete pod <pod>                     # a Deployment will recreate it
kubectl delete pod -l app=web                # by label
kubectl delete pod <pod> --grace-period=0 --force   # stuck Terminating. Stateless only

# Everything created by a file
kubectl delete -f manifest.yaml

# Completed / failed pods left behind by Jobs
kubectl delete pod --field-selector=status.phase==Succeeded -A
```

## The ten you will actually use

:::key
```sh
kubectl get pods -o wide
kubectl describe pod <pod>
kubectl logs <pod> --previous
kubectl get endpoints <svc>
kubectl exec -it <pod> -- sh
kubectl apply -f .
kubectl rollout status deploy/<name>
kubectl rollout undo deploy/<name>
kubectl port-forward svc/<name> 8080:80
kubectl get events -A --sort-by=.lastTimestamp | tail -20
```
:::

:::ar بالمصري · العشرة دول لو حفظتهم، خلصت
| الأمر | بيعمل إيه | تستخدمه امتى |
|:---|:---|:---|
| `get pods -o wide` | البودات + الـ IP + النود | نظرة أولى |
| `describe pod <pod>` | الحالة والـ **Events** | **أول أمر في أي مشكلة** |
| `logs <pod> --previous` | لوجز الكونتينر **اللي مات** | `CrashLoopBackOff` |
| `get endpoints <svc>` | فيه بودات ورا الـ Service؟ | «شغّال بس مش بيرد» |
| `exec -it <pod> -- sh` | يدخّلك جوه البود | تبص بعينك |
| `apply -f .` | ينشر كل ملفات المجلد | نشر |
| `rollout status deploy/<n>` | يستنى التحديث ويفشل لو باظ | **بعد كل ديبلوي** |
| `rollout undo deploy/<n>` | يرجّع الإصدار السابق | **وقت الأزمة** |
| `port-forward svc/<n> 8080:80` | يوصّلك من اللاب | تجرّب سيرفيس داخلي |
| `get events -A --sort-by=...` | كل اللي حصل بالترتيب الزمني | **كل حاجة بايظة مع بعض** |

**وتلات حاجات عملية تفرق معاك كل يوم:**

**١. `--previous` مش اختيارية لو بيكراش.** من غيرها بتشوف لوجز الكونتينر
الجديد اللي لسه ما قالش حاجة، وبتقول «مفيش لوجز».

**٢. `rollout undo` هي أول حركة وقت الأزمة، مش آخر حركة.** رجّع الخدمة
الأول، وافهم بعدين. اللي بيقعد يفهم والموقع واقع ده بيطوّل الانقطاع.

**٣. نصّب `kubectx` و `kubens`.** بيخلوك تنقل بين الكلاسترات والـ
namespaces بكلمة واحدة بدل أوامر طويلة. أول حاجة أي حد بيشتغل على
كوبرنيتيس بجد بينصّبها.
:::
