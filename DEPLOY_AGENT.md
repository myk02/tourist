# Deploy Automation — Agent Instructions

This file tells any coding agent (or human) exactly how to deploy this project
to **GitHub → Convex → Vercel** using `deploy.py`.

> **If you are an AI agent:** when the user asks to "deploy", "ship changes",
> "push to prod", or similar, run the command in [Quick Start](#quick-start)
> below. Do not hand-roll separate `git push` / `convex deploy` / `vercel`
> commands unless `deploy.py` is missing or fails — see
> [Manual fallback](#manual-fallback-if-deploypy-is-unavailable).

---

## What this does

One command runs, in order:

1. **GitHub** — commits any pending changes and pushes to the target branch.
2. **Convex** — runs `npx convex deploy` using `CONVEX_DEPLOY_KEY`.
3. **Vercel** — polls the Vercel API to confirm the GitHub push triggered a
   new production deployment and that it reaches `READY`. If nothing shows
   up within the timeout window, it **automatically triggers a redeploy**
   (via the Vercel CLI) so GitHub/Convex and Vercel never drift out of sync.

---

## Prerequisites (one-time setup)

| Requirement | Notes |
|---|---|
| `git` installed, repo has a remote named `origin` | Standard |
| `node` + `npx` installed | Needed for `npx convex deploy` |
| `.env.local` present in the repo (or path passed via `--env-file`) | Must contain the variables below |
| `vercel` CLI installed globally (`npm i -g vercel`) | Only needed for the auto-redeploy fallback in Step 3 |
| Repo linked to a Vercel project (`vercel link`, once) | Lets the script auto-detect the project — see below |

### Required variables in `.env.local`

```
GITHUB_TOKEN=...        # GitHub personal access token, repo scope
CONVEX_DEPLOY_KEY=...   # From Convex dashboard → Settings → Deploy Keys
VERCEL_TOKEN=...        # From Vercel dashboard → Settings → Tokens
```

### Optional variables (only if you haven't run `vercel link`)

```
VERCEL_PROJECT_ID=...
VERCEL_TEAM_ID=...      # only if the project belongs to a team, not a personal account
```

If you skip `vercel link` and don't set these, Step 3 (Vercel verification)
is skipped with a warning — GitHub and Convex will still deploy fine.

---

## Quick Start

From the repo root:

```bash
python3 deploy.py "your commit message"
```

That's it. No commit message? One is auto-generated with a timestamp:

```bash
python3 deploy.py
```

### Useful flags

```bash
python3 deploy.py --dry-run "msg"            # preview every step, change nothing
python3 deploy.py --skip-convex "msg"        # only GitHub + Vercel
python3 deploy.py --skip-vercel "msg"        # only GitHub + Convex
python3 deploy.py --branch develop "msg"     # deploy a non-default branch
python3 deploy.py --vercel-timeout 600 "msg" # wait longer before giving up / redeploying
python3 deploy.py --no-fallback-deploy "msg" # verify only, never auto-trigger a redeploy
python3 deploy.py --env-file ../.env.local "msg"
```

Run `python3 deploy.py --help` for the full list.

---

## How to read the output

The script prints a banner for each of the 3 steps and a final
`DEPLOY COMPLETE` or `DEPLOY FAILED` banner. **Exit code 0 = success, exit
code 1 = failure** — check this if you're an agent scripting around it:

```bash
python3 deploy.py "msg" || echo "deploy failed, see log above"
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Env file not found` | Wrong working directory or path | Run from repo root, or pass `--env-file` |
| Git push fails with auth error | `GITHUB_TOKEN` expired/wrong scope | Regenerate token (needs `repo` scope), update `.env.local` |
| `npx convex deploy` fails | `CONVEX_DEPLOY_KEY` invalid/expired, or it's a dev key but you expected prod | Check Convex dashboard → Deploy Keys. Key prefix `dev:` deploys to a dev deployment, `prod:` deploys to production |
| "Could not determine Vercel project" | Repo never linked | Run `vercel link` once, or set `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` in `.env.local` |
| Vercel step times out with no `READY` deployment | Vercel's GitHub integration is disconnected, or build is genuinely slow | Check Vercel dashboard → Project → Git integration; increase `--vercel-timeout` |
| Redeploy fallback fails with "vercel: command not found" | Vercel CLI not installed | `npm i -g vercel` |

---

## Manual fallback (if `deploy.py` is unavailable)

Only use this if the script itself is missing, broken, or can't run in your
environment. Equivalent steps:

```bash
# 1. GitHub
git add -A
git commit -m "your message"
git push origin <branch>

# 2. Convex
CONVEX_DEPLOY_KEY=<key from .env.local> npx convex deploy

# 3. Vercel — check status
vercel ls --token=<VERCEL_TOKEN>

# 3b. Vercel — force a redeploy if the push didn't trigger one
vercel --prod --token=<VERCEL_TOKEN> --yes
```

---

## Security notes

- `.env.local` holds live credentials. Confirm it's listed in `.gitignore`
  before running anything — never let this script (or you) commit it.
- `deploy.py` reads secrets from the env file at runtime; it does not print
  full token values to the console.
- If any of these tokens are ever exposed (shared, pasted somewhere, committed
  by accident), rotate them immediately from the respective dashboard
  (GitHub → Settings → Developer settings; Vercel → Settings → Tokens;
  Convex → Settings → Deploy Keys).
