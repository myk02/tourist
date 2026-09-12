#!/usr/bin/env python3
"""
deploy.py — One-command deploy automation for GitHub + Convex + Vercel.

WHAT IT DOES
------------
1. GIT      : commits any pending changes and pushes to the configured branch.
2. CONVEX   : runs `npx convex deploy` using CONVEX_DEPLOY_KEY from your env file.
3. VERCEL   : polls the Vercel API to confirm a new production deployment was
              triggered by the GitHub push and that it finishes READY. If no
              matching deployment shows up within the timeout window, it
              automatically triggers a redeploy so you never end up with
              GitHub/Convex updated but Vercel stale.

No third-party Python packages are required — only the stdlib, plus the
`git`, `node`/`npx`, and (optionally, for the auto-redeploy fallback) `vercel`
CLIs that you'd already have installed for a project like this.

USAGE
-----
    python3 deploy.py "commit message here"
    python3 deploy.py                      # auto-generates a commit message
    python3 deploy.py --dry-run "msg"      # show what would happen, do nothing
    python3 deploy.py --skip-convex "msg"
    python3 deploy.py --skip-vercel "msg"
    python3 deploy.py --branch develop "msg"
    python3 deploy.py --env-file ../.env.local "msg"

Full behavior, prerequisites, and troubleshooting are documented in
this file's header + .env.example — DEPLOY_AGENT.md was consolidated here.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


# --------------------------------------------------------------------------
# Small utilities
# --------------------------------------------------------------------------

class Step:
    """Pretty banners so log output is easy for a human OR an agent to parse."""

    @staticmethod
    def banner(text: str) -> None:
        print(f"\n{'=' * 60}\n{text}\n{'=' * 60}")

    @staticmethod
    def info(text: str) -> None:
        print(f"  -> {text}")

    @staticmethod
    def ok(text: str) -> None:
        print(f"  [OK] {text}")

    @staticmethod
    def warn(text: str) -> None:
        print(f"  [WARN] {text}")

    @staticmethod
    def fail(text: str) -> None:
        print(f"  [FAIL] {text}")


class DeployError(RuntimeError):
    """Raised for any unrecoverable failure; caught once in main()."""


def run(cmd: list[str], cwd: str | None = None, env: dict | None = None,
        check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    """Run a subprocess, streaming output live unless capture=True."""
    if os.name == "nt":
        # Windows ships `npx`/`vercel`/etc. as .cmd shims, which plain
        # CreateProcess cannot execute. Resolve to the real path (e.g.
        # npx.CMD) so subprocess can launch them via cmd.exe.
        resolved = shutil.which(cmd[0]) if os.path.splitext(cmd[0])[1] == "" else cmd[0]
        if resolved:
            cmd = [resolved, *cmd[1:]]
    Step.info(f"$ {' '.join(cmd)}")
    result = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        text=True,
        capture_output=capture,
    )
    if check and result.returncode != 0:
        stderr = result.stderr if capture else "(see output above)"
        raise DeployError(f"Command failed ({result.returncode}): {' '.join(cmd)}\n{stderr}")
    return result


# --------------------------------------------------------------------------
# Env file loading
# --------------------------------------------------------------------------

def load_env_file(path: Path) -> dict[str, str]:
    """Minimal .env parser: KEY=VALUE lines, '#' comments, blank lines ignored.
    Does NOT overwrite variables already set in the real environment, so you
    can still override anything at the shell level.
    """
    if not path.exists():
        raise DeployError(
            f"Env file not found: {path}\n"
            f"  Pass --env-file to point at your .env.local, or place one next to deploy.py."
        )

    loaded: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        loaded[key] = value
        os.environ.setdefault(key, value)
    return loaded


# --------------------------------------------------------------------------
# Git
# --------------------------------------------------------------------------

def git_current_branch() -> str:
    result = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], capture=True)
    return result.stdout.strip()


def git_has_changes() -> bool:
    result = run(["git", "status", "--porcelain"], capture=True)
    return bool(result.stdout.strip())


def git_remote_https_url() -> str | None:
    result = run(["git", "remote", "get-url", "origin"], capture=True, check=False)
    url = result.stdout.strip()
    if not url:
        return None
    if url.startswith("git@github.com:"):
        url = "https://github.com/" + url[len("git@github.com:"):]
    if url.endswith(".git"):
        url = url[:-4]
    return url


def git_commit_and_push(branch: str, message: str, github_token: str | None, dry_run: bool) -> str:
    Step.banner("STEP 1/3 — GITHUB (commit + push)")

    if git_has_changes():
        Step.info("Changes detected, staging + committing")
        if not dry_run:
            run(["git", "add", "-A"])
            run(["git", "commit", "-m", message])
        else:
            Step.info(f"(dry-run) would commit with message: {message!r}")
    else:
        Step.info("No local changes to commit — will still push in case local commits are ahead of origin")

    push_cmd = ["git", "push", "origin", branch]

    # If the remote is HTTPS and we have a token, authenticate the push
    # explicitly so this also works headlessly (e.g. invoked by an agent
    # with no cached git credentials), without touching .git/config.
    remote_url = git_remote_https_url()
    if github_token and remote_url and remote_url.startswith("https://github.com"):
        auth_header = f"AUTHORIZATION: basic {base64.b64encode(f'x-access-token:{github_token}'.encode()).decode()}"
        push_cmd = ["git", "-c", f"http.extraheader={auth_header}", "push", "origin", branch]

    if dry_run:
        Step.info(f"(dry-run) would run: git push origin {branch}")
    else:
        run(push_cmd)

    sha = run(["git", "rev-parse", "HEAD"], capture=True).stdout.strip()
    Step.ok(f"Pushed. HEAD is now {sha[:8]} on '{branch}'" + (" (dry-run, unverified)" if dry_run else ""))
    return sha


# --------------------------------------------------------------------------
# Convex
# --------------------------------------------------------------------------

def deploy_convex(deploy_key: str | None, dry_run: bool) -> None:
    Step.banner("STEP 2/3 — CONVEX")

    if not deploy_key:
        Step.warn("CONVEX_DEPLOY_KEY not found in env file — skipping Convex deploy")
        return

    if deploy_key.startswith("dev:"):
        Step.warn("CONVEX_DEPLOY_KEY targets a DEV deployment, not production. "
                   "This is expected for staging; swap in a prod deploy key when you're ready to ship.")

    env = os.environ.copy()
    env["CONVEX_DEPLOY_KEY"] = deploy_key

    if dry_run:
        Step.info("(dry-run) would run: npx convex deploy")
        return

    run(["npx", "convex", "deploy"], env=env)
    Step.ok("Convex deploy finished")


# --------------------------------------------------------------------------
# Vercel
# --------------------------------------------------------------------------

def vercel_api_get(path: str, token: str, params: dict[str, str] | None = None) -> dict:
    query = ""
    if params:
        query = "?" + "&".join(f"{k}={v}" for k, v in params.items() if v)
    url = f"https://api.vercel.com{path}{query}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")
        raise DeployError(f"Vercel API error {e.code} on {path}: {body}")
    except urllib.error.URLError as e:
        raise DeployError(f"Could not reach Vercel API: {e}")


def detect_vercel_project() -> tuple[str | None, str | None]:
    """Look for project/org id in .vercel/project.json (created by `vercel link`)."""
    project_file = Path(".vercel/project.json")
    if project_file.exists():
        data = json.loads(project_file.read_text())
        return data.get("projectId"), data.get("orgId")
    return None, None


def find_deployment_for_sha(deployments: list[dict], sha: str) -> dict | None:
    for d in deployments:
        meta = d.get("meta", {})
        if meta.get("githubCommitSha") == sha:
            return d
    return None


def trigger_vercel_redeploy(token: str, dry_run: bool) -> None:
    """Fallback trigger: force a fresh production deployment via the Vercel CLI.
    Requires `vercel` CLI installed (npm i -g vercel). This does NOT require
    project/org IDs since the CLI reads (or creates) .vercel/project.json itself.
    """
    Step.warn("No matching Vercel deployment appeared in time — triggering a redeploy now")
    if dry_run:
        Step.info("(dry-run) would run: vercel --prod --token=*** --yes")
        return
    run(["vercel", "--prod", f"--token={token}", "--yes"])
    Step.ok("Redeploy triggered via Vercel CLI")


def check_and_ensure_vercel_deployment(
    token: str | None,
    sha: str,
    timeout: int,
    poll_interval: int,
    dry_run: bool,
    allow_fallback: bool,
) -> None:
    Step.banner("STEP 3/3 — VERCEL (verify deploy, auto-redeploy if needed)")

    if not token:
        Step.warn("VERCEL_TOKEN not found in env file — skipping Vercel verification")
        return

    project_id, org_id = detect_vercel_project()
    if not project_id:
        project_id = os.environ.get("VERCEL_PROJECT_ID")
        org_id = os.environ.get("VERCEL_TEAM_ID") or os.environ.get("VERCEL_ORG_ID")

    if not project_id:
        Step.warn(
            "Could not determine Vercel project. Run `vercel link` once in this repo, "
            "or add VERCEL_PROJECT_ID (and VERCEL_TEAM_ID if it's a team project) to your env file. "
            "Skipping Vercel verification."
        )
        return

    if dry_run:
        Step.info(f"(dry-run) would poll Vercel deployments for project {project_id}, "
                   f"waiting up to {timeout}s for commit {sha[:8]}")
        return

    Step.info(f"Watching for a deployment of commit {sha[:8]} (timeout {timeout}s)")
    deadline = time.time() + timeout
    fallback_triggered = False

    while time.time() < deadline:
        api_params: dict[str, str] = {"projectId": project_id, "limit": "10"}
        if org_id:
            api_params["teamId"] = org_id
        data = vercel_api_get(
            "/v6/deployments", token,
            params=api_params,
        )
        deployments = data.get("deployments", [])
        match = find_deployment_for_sha(deployments, sha)

        if match:
            state = match.get("state") or match.get("readyState")
            url = match.get("url", "")
            if state == "READY":
                Step.ok(f"Vercel deployment READY: https://{url}")
                return
            if state == "ERROR":
                raise DeployError(f"Vercel deployment for {sha[:8]} failed (state=ERROR). Check the Vercel dashboard.")
            Step.info(f"Deployment found, state={state} — still waiting")
        else:
            Step.info("No deployment for this commit yet")
            if not fallback_triggered and allow_fallback and time.time() > deadline - timeout / 2:
                # We're past the halfway point with nothing showing up — nudge it along.
                trigger_vercel_redeploy(token, dry_run)
                fallback_triggered = True

        time.sleep(poll_interval)

    if allow_fallback and not fallback_triggered:
        trigger_vercel_redeploy(token, dry_run)
        Step.warn("Triggered a redeploy as a last resort — re-run with a longer --vercel-timeout to confirm READY state")
    else:
        Step.warn(f"Timed out after {timeout}s without confirming a READY deployment. Check the Vercel dashboard.")


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy to GitHub + Convex + Vercel in one shot.")
    parser.add_argument("message", nargs="?", default=None, help="Commit message")
    parser.add_argument("--branch", default=None, help="Branch to push (default: current branch)")
    parser.add_argument("--env-file", default=".env.local", help="Path to env file (default: .env.local)")
    parser.add_argument("--skip-git", action="store_true", help="Skip commit/push step")
    parser.add_argument("--skip-convex", action="store_true", help="Skip Convex deploy step")
    parser.add_argument("--skip-vercel", action="store_true", help="Skip Vercel verification step")
    parser.add_argument("--no-fallback-deploy", action="store_true",
                         help="Don't auto-trigger a Vercel redeploy if none is detected")
    parser.add_argument("--vercel-timeout", type=int, default=300, help="Seconds to wait for Vercel (default 300)")
    parser.add_argument("--vercel-poll-interval", type=int, default=10, help="Seconds between polls (default 10)")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen without doing it")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        env_vars = load_env_file(Path(args.env_file))
    except DeployError as e:
        Step.fail(str(e))
        return 1

    branch = args.branch or git_current_branch()
    message = args.message or f"chore: automated deploy ({time.strftime('%Y-%m-%d %H:%M:%S')})"

    Step.banner("DEPLOY START")
    Step.info(f"Branch: {branch}")
    Step.info(f"Env file: {args.env_file}")
    if args.dry_run:
        Step.info("DRY RUN — no changes will actually be made")

    try:
        if args.skip_git:
            Step.banner("STEP 1/3 — GITHUB (skipped)")
            sha = run(["git", "rev-parse", "HEAD"], capture=True).stdout.strip()
        else:
            sha = git_commit_and_push(
                branch=branch,
                message=message,
                github_token=env_vars.get("GITHUB_TOKEN"),
                dry_run=args.dry_run,
            )

        if args.skip_convex:
            Step.banner("STEP 2/3 — CONVEX (skipped)")
        else:
            deploy_convex(env_vars.get("CONVEX_DEPLOY_KEY"), dry_run=args.dry_run)

        if args.skip_vercel:
            Step.banner("STEP 3/3 — VERCEL (skipped)")
        else:
            check_and_ensure_vercel_deployment(
                token=env_vars.get("VERCEL_TOKEN"),
                sha=sha,
                timeout=args.vercel_timeout,
                poll_interval=args.vercel_poll_interval,
                dry_run=args.dry_run,
                allow_fallback=not args.no_fallback_deploy,
            )

    except DeployError as e:
        Step.fail(str(e))
        Step.banner("DEPLOY FAILED")
        return 1

    Step.banner("DEPLOY COMPLETE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
