# Windows split-stack operations

Use this guide when the **React app is on Vercel**, the **API runs on a Windows PC**, and **PostgreSQL** is hosted (Neon, Supabase, etc.). For the high-level split-stack picture, see the main [README](../README.md#production).

## Prerequisites

- `backend/.env` with production `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `ALLOWED_ORIGINS` (your Vercel URL), `COOKIE_SAME_SITE=none`, `SERVE_FRONTEND=false`
- Node.js on the PC (boot scripts in this repo assume `D:\Calvin\node\node.exe` — edit paths in scripts if yours differ)
- `cloudflared.exe` for tunneling (optional named tunnel for a stable hostname)
- Frontend: `cd frontend && npm install` once if you use the frontend boot task

Template: `backend/.env.production-local.example` and `deploy/split-stack.env.example`.

## Start the API manually

```powershell
.\scripts\start-local-api.ps1
```

Or:

```bash
cd backend && npm install && npm start
```

Expose port **5001** with [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or `ngrok http 5001`. Set Vercel **`VITE_API_BASE`** to `https://<public-host>/api` and redeploy.

## Auto-start after reboot (Task Scheduler)

Install all boot tasks (Administrator, from repo root):

```powershell
.\scripts\install-all-boot-tasks.ps1
```

Registers (in order): API, frontend dev server (optional), tunnel, Vercel sync, watchdog. Logs under `C:\Users\calvin\.pm2\logs\`. The API task retries remote Postgres (including Neon free-tier wake-up) for a long window after boot.

| Task | Purpose |
|------|---------|
| Attendance API Boot | `node server.js` on port 5001 |
| Attendance Frontend Boot | Vite on port 3000 (local admin UI) |
| Attendance Tunnel Boot | cloudflared to 5001 |
| Attendance Vercel Sync | Updates `VITE_API_BASE` when quick-tunnel URL changes |
| Attendance API Watchdog | Restarts dead processes |

Individual installers: `install-backend-boot-task.ps1`, `install-frontend-boot-task.ps1`, `install-tunnel-boot-task.ps1`.

**Stable tunnel URL:** `.\scripts\setup-named-tunnel.ps1` with your Cloudflare domain.

**Vercel token sync (quick tunnels):**

```powershell
.\scripts\install-vercel-sync.ps1
# Edit D:\Calvin\cloudflared\vercel-sync.env — VERCEL_TOKEN from https://vercel.com/account/tokens
.\scripts\install-vercel-sync-boot-task.ps1
.\scripts\sync-vercel-api-url.ps1 -Force
```

**Test without reboot (Administrator):**

```powershell
Start-ScheduledTask -TaskName "Attendance API Boot"
Start-ScheduledTask -TaskName "Attendance Tunnel Boot"
Get-Content C:\Users\calvin\.pm2\logs\boot-start.log -Tail 20
```

One-shot stack check: `.\scripts\ensure-stack.ps1`

## Deploy backend after `git pull`

```powershell
.\scripts\deploy-backend.ps1
```

GitHub Actions (`.github/workflows/deploy-backend.yml`) can run the same script over SSH when secrets are set — one-time: `.\scripts\setup-github-deploy.ps1`.

Migrations run on API startup; seed uses `ON CONFLICT DO NOTHING` so production data is preserved.

## Logs and tunnel URL

- Boot: `C:\Users\calvin\.pm2\logs\boot-*.log`, `stack-ensure.log`
- Vercel sync: `vercel-sync.log`
- Quick tunnel host: `D:\Calvin\cloudflared\tunnel-url.txt` (changes each restart unless named tunnel)
