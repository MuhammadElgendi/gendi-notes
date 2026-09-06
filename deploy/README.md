# Deploying to your own Ubuntu server

Target setup: **your domain, HTTPS, password-protected, and `git push` deploys.**

**How it works.** The notes build into static HTML. Caddy serves that HTML and
handles certificates and the password. A bare git repo on the server has a
`post-receive` hook, so pushing *is* deploying — no CI service, no secrets in a
pipeline, no Node process running permanently.

```
your machine                          server
────────────                          ──────
git push production main  ──────────▶ repo.git (bare)
                                          │ post-receive hook fires
                                          ▼
                                      checkout → lint → build
                                          │
                                          ▼
                                      rsync to /var/www/gendi-notes
                                          │
                                      Caddy serves it ──▶ https://notes.you.com
                                      (auto HTTPS + basic auth)
```

Replace `notes.example.com` with your domain and `youruser` with your SSH user
throughout.

---

## Part A — DNS first

**Do this before anything else.** Caddy requests a certificate the moment it
starts, and Let's Encrypt validates by connecting to your domain. If DNS is not
pointing at the server yet, the request fails and Caddy backs off.

Create an **A record**: `notes.example.com` → your server's public IP.

Verify it has propagated before continuing:

```bash
dig +short notes.example.com
```

That must print your server's IP. If it prints nothing, wait and retry.

---

## Part B — server, one-time setup

SSH in, then work through these in order.

### B1. Node 18+

Ubuntu's own `nodejs` package is too old on some releases (22.04 ships Node 12).
Use NodeSource so the version is certain:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git rsync
node --version
```

`node --version` must print v18 or higher.

### B2. Caddy

From the official repository — the version in Ubuntu's archive lags badly:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

### B3. Open the firewall

Both ports are required — 80 for the ACME challenge and the HTTPS redirect,
443 for the site itself.

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

### B4. Create the directories

```bash
sudo mkdir -p /srv/gendi-notes/src /var/www/gendi-notes
sudo git init --bare /srv/gendi-notes/repo.git

# The hook runs as the user who pushes, so that user must own both trees.
sudo chown -R "$USER":"$USER" /srv/gendi-notes /var/www/gendi-notes
chmod 755 /var/www/gendi-notes
```

`755` matters: Caddy runs as its own user and needs read access to the webroot.

### B5. Generate the password hash

```bash
caddy hash-password
```

It prompts for the password (twice) and prints a bcrypt hash starting with
`$2a$`. **Copy it.** Using the prompt rather than `--plaintext` keeps the
password out of your shell history.

### B6. Configure Caddy

```bash
sudo nano /etc/caddy/Caddyfile
```

Paste the contents of [`Caddyfile`](Caddyfile) from this directory, then change
exactly three things:

| Change | To |
|:---|:---|
| `notes.example.com` | your domain |
| `PASTE_YOUR_BCRYPT_HASH_HERE` | the hash from B5 |
| `gendi` (the username) | whatever username you want, if not `gendi` |

Validate before reloading — a syntax error would take the site down:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Caddy is enabled on boot by its package, so it comes back after a reboot on its
own.

### B7. Install the deploy hook

```bash
nano /srv/gendi-notes/repo.git/hooks/post-receive
```

Paste the contents of [`post-receive`](post-receive) from this directory, save,
then make it executable — **this step is easy to forget and the symptom is a
push that succeeds and changes nothing:**

```bash
chmod +x /srv/gendi-notes/repo.git/hooks/post-receive
```

---

## Part C — your machine, one-time setup

The repository is not yet under git. From the notes directory:

```bash
git init -b main
git add -A
git commit -m "Gendi Notes: initial import"
```

Add the server as a remote and push:

```bash
git remote add production youruser@notes.example.com:/srv/gendi-notes/repo.git
git push production main
```

You should see the hook's output inline — `→ linting`, `→ building`,
`→ publishing`, then `✓ deployed 21 pages`.

Open **https://notes.example.com**, enter the username and password, and the
notes are live.

---

## Part D — daily use

From then on, adding a note is:

```bash
git add -A && git commit -m "Add kubernetes scheduling note" && git push production main
```

The hook lints, builds and publishes. **If a cross-link is broken the deploy
fails and nothing is published** — the currently live version stays up. That is
deliberate: `node site/build.mjs --check` runs before the build, so a broken
`[[wikilink]]` cannot reach the site.

You do not need to run the build locally before pushing, though it is faster to
catch mistakes yourself:

```bash
node site/build.mjs --check
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|:---|:---|:---|
| Push succeeds, site unchanged | Hook not executable | `chmod +x /srv/gendi-notes/repo.git/hooks/post-receive` |
| Push succeeds, hook silent | Pushed a branch other than `main` | The hook only deploys `main` |
| `node: command not found` in hook output | Non-interactive SSH has a minimal `PATH` | Add `export PATH=/usr/bin:/usr/local/bin:$PATH` near the top of the hook |
| No certificate / HTTPS fails | DNS not pointing at the server yet, or port 80 blocked | Recheck Part A, then `sudo journalctl -u caddy -n 50` |
| 403 Forbidden | Caddy cannot read the webroot | `chmod 755 /var/www/gendi-notes` |
| Password prompt loops | Hash pasted with a line break, or `$` mangled | Re-run `caddy hash-password`, paste as one line |
| Styling missing, text plain | `assets/notebook.css` did not publish | Check `ls /var/www/gendi-notes/assets/` |

Server-side logs:

```bash
sudo journalctl -u caddy -f              # certificates, startup, errors
sudo tail -f /var/log/caddy/gendi-notes.log   # requests
```

---

## Two things to know

**Basic auth over HTTPS is adequate for personal notes, and no more than that.**
There is one shared password, no rate limiting on guesses, and no session — the
browser resends the credentials on every request. It is genuinely fine for
keeping your notes off search engines and away from casual visitors. It is not
what you would put in front of anything confidential.

If you later want per-person logins, Caddy pairs cleanly with an auth proxy
(`caddy-security`, or Authelia in front) — but for one person and one password,
that is complexity you do not need yet.

**Git inside OneDrive is a known source of corruption.** OneDrive syncs the
`.git` directory while git is writing to it, which can damage the object store.
Options, best first:

1. Move the repository out of OneDrive — the server is now your backup, so
   OneDrive is no longer doing anything for you.
2. Exclude the folder from syncing in OneDrive settings.
3. Leave it and accept the risk (low per-operation, non-zero over months).

The failure looks like `error: object file ... is empty` and is annoying to
recover from, so option 1 is worth the ten minutes.
