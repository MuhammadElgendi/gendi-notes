---
title: Git
slug: git
type: guide
domain: 01-devops
tags: [git, version-control]
keywords: [commit, branch, merge, rebase, remote, staging, stash, reset, revert, pull request]
level: 1
status: stable
prerequisites: []
related: [ci-cd, linux-basics]
updated: 2026-09-06
---

# Git

> Git tracks snapshots of your whole project, not changes to individual files — once that clicks, most of Git stops being confusing.

## What is it?

Git is a version control system. It records **snapshots** of your project over
time, so you can see what changed, go back, and work on several things at once
without them interfering.

Every developer has a **complete copy** of the history. You can commit, branch
and search history with no network at all.

## The one model you need

Git has four places a file can be, and nearly every confusing Git moment comes
from not knowing which one you are in.

```diagram
   WORKING DIR        STAGING AREA       LOCAL REPO        REMOTE
   (your files)       (next commit)      (history)        (GitHub)
        │                   │                 │               │
        │──  git add  ─────→│                 │               │
        │                   │── git commit ──→│               │
        │                   │                 │── git push ──→│
        │←───────────  git checkout  ──────────│               │
        │←──────────────  git pull / fetch  ──────────────────│
```

| Place | What it holds | Command that moves things in |
|:---|:---|:---|
| **Working directory** | Files as they are right now | (you edit them) |
| **Staging area** (index) | What will go into the next commit | `git add` |
| **Local repository** | Committed history, on your machine | `git commit` |
| **Remote** | Shared history on a server | `git push` |

:::key Why a staging area exists at all
It lets you commit **part** of your work. You fixed a bug and also renamed a
variable — stage and commit just the bug fix, keeping the rename for a separate
commit.

That is the whole purpose. Without it, every commit would have to include
everything you had touched.
:::

## What it is made of

| Concept | What it is |
|:---|:---|
| **Commit** | A snapshot plus a message, author and parent. Identified by a hash |
| **Branch** | A movable pointer to a commit. Cheap — it is just a label |
| **HEAD** | Where you are right now, usually the tip of a branch |
| **Remote** | A named URL for another copy, usually `origin` |
| **Tag** | A fixed label on one commit, for releases (`v1.2.0`) |

Branches being **just pointers** is why creating one is instant and why having
twenty costs nothing.

## How to use it

### Starting out

```sh
git init                              # start tracking a project here
git clone https://github.com/u/r.git  # copy an existing one

# Set your identity once, globally — commits are stamped with it
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### The everyday loop

This is 90% of Git use:

```sh
git status              # WHAT STATE AM I IN? Run this constantly
git diff                # unstaged changes
git diff --staged       # what's staged, i.e. what will be committed

git add file.js         # stage one file
git add .               # stage everything changed here
git commit -m "Fix login redirect"

git pull                # get others' work
git push                # publish yours
```

`git status` is the most useful command in Git. It tells you which of the four
places your changes are in, and usually suggests the command you want next.

### Branching

```sh
git switch -c feature/login    # create a branch and move to it
git switch main                # move back
git branch                     # list local branches
git branch -d feature/login    # delete a merged branch
```

`git switch` is the modern command for changing branches. `git checkout` still
works but does several unrelated jobs, which is why it confused people for a
decade — `switch` (branches) and `restore` (files) split it up.

### Merging vs rebasing

Both bring another branch's work into yours. They produce different history.

```diagram
   MERGE — keeps what actually happened
   main     A───B───────────M      M is a merge commit with two parents
                 \         /
   feature        C───D───┘

   REBASE — replays your commits on top, as if written later
   main     A───B
                 \
   feature        C'──D'           C and D are NEW commits (different hashes)
```

| | Merge | Rebase |
|:---|:---|:---|
| History | Truthful, shows the branch | Linear, easier to read |
| Commit hashes | Unchanged | **Rewritten** |
| Safe on shared branches | Yes | **No** |

```sh
git switch main && git merge feature/login    # merge
git switch feature/login && git rebase main   # rebase onto latest main
```

:::danger Never rebase a branch someone else is using
Rebase **creates new commits** with new hashes and abandons the old ones. If a
colleague has the old commits, your histories have diverged and their next pull
produces conflicts or duplicated commits.

The rule: rebase your **own unpushed** work freely, to tidy it before sharing.
Once it is pushed and others may have pulled it, merge instead.
:::

### Undoing things — pick by what you want to undo

This table is worth memorising; the wrong choice here is how work gets lost.

| Goal | Command | Destroys work? |
|:---|:---|:---|
| Unstage a file, keep the edits | `git restore --staged file` | No |
| Throw away edits to a file | `git restore file` | **Yes** |
| Fix the last commit's message | `git commit --amend` | No |
| Undo last commit, keep changes staged | `git reset --soft HEAD~1` | No |
| Undo last commit, keep changes unstaged | `git reset HEAD~1` | No |
| Undo last commit and **delete** the changes | `git reset --hard HEAD~1` | **Yes** |
| Undo a commit that is already pushed | `git revert <hash>` | No |

:::warn `reset` versus `revert` — the pushed/not-pushed rule
**`git reset`** rewrites history by moving the branch pointer. Fine for local
commits nobody has seen.

**`git revert`** creates a *new* commit that undoes an old one. History is
preserved, so it is safe on shared branches.

If the commit is already pushed, use `revert`. Using `reset` then forcing a push
rewrites history under your colleagues' feet.
:::

### Stashing

You are mid-change and need to switch branches urgently:

```sh
git stash               # put changes aside, clean the working directory
git stash list          # see what you stashed
git stash pop           # bring the most recent back and remove it from the stash
git stash apply         # bring it back but KEEP it in the stash
```

### Looking at history

```sh
git log --oneline --graph --decorate -20   # compact visual history
git log -p file.js                          # how one file changed over time
git log --author="Ahmed"
git blame file.js                           # who last changed each line, and when
git show <hash>                             # everything about one commit
```

## When things go wrong

### Merge conflicts

Git stops and marks the file when both sides changed the same lines:

```text
<<<<<<< HEAD
const timeout = 3000;        ← your version
=======
const timeout = 5000;        ← incoming version
>>>>>>> feature/login
```

Edit the file to what it should be, **delete all three marker lines**, then:

```sh
git add file.js       # marks the conflict resolved
git commit            # (during a merge) or: git rebase --continue
```

To back out entirely: `git merge --abort` or `git rebase --abort`.

:::tip Almost nothing in Git is truly lost
`git reflog` records every position `HEAD` has been in, including commits you
"deleted" with a bad `reset`:

```sh
git reflog                    # find the hash you were on before the mistake
git reset --hard <that-hash>  # go back to it
```

Reflog entries persist for ~90 days by default. Before panicking about lost
commits, look here first — the answer is usually one line up.
:::

### Other common situations

| Situation | Fix |
|:---|:---|
| `rejected — non-fast-forward` on push | Someone pushed first. `git pull --rebase`, then push |
| Committed a secret | Rotate the secret immediately, **then** clean history. It is in the remote already |
| Committed to the wrong branch | `git reset --soft HEAD~1`, switch branch, commit again |
| Accidentally committed a huge file | Remove and amend if unpushed; otherwise `git filter-repo` |
| Detached HEAD | You are on a commit, not a branch. `git switch -c fix` to keep the work |

## Two files that save you trouble

**`.gitignore`** — never commit generated files, dependencies or secrets:

```text title=".gitignore"
node_modules/
dist/
.env
*.log
.DS_Store
```

**`.gitattributes`** — normalise line endings across Windows/Linux teams:

```text title=".gitattributes"
* text=auto
*.sh text eol=lf
```

Without the second one, a shell script committed on Windows gets CRLF line
endings and fails on Linux with `\r: command not found` — an error that names
the wrong problem entirely.

## Key takeaways

- **Four places:** working dir → staging → local repo → remote. `git status`
  tells you which one you are in.
- **Branches are pointers.** Creating them is free.
- **Merge keeps history, rebase rewrites it.** Only rebase your own unpushed
  work.
- **`reset` for local commits, `revert` for pushed ones.**
- `--hard` and `git restore <file>` are the only two commands here that
  **delete** work. Everything else is recoverable.
- **`git reflog`** finds commits you thought you destroyed.
