# Quantum Visa Manager — GitHub Production checklist

Verified Hostinger (do not change without re-verification):

| Setting | Verified value |
|---------|----------------|
| SSH host | `92.113.28.62` |
| SSH port | `65002` |
| SSH username | `u359614291` |
| QVM document root | `/home/u359614291/domains/quantumvisamanager.com/public_html` |
| Ledgerline document root (FORBIDDEN for QVM) | `/home/u359614291/domains/quantumledgerline.com/public_html` |
| Dedicated public key name | `qvm-hostinger-production` |

Production cutover remains **disabled** until you set `QVM_PRODUCTION_CUTOVER_ENABLED=true`.

---

## A. Create GitHub Environments (this repo only)

Repository: `HighVolt-Analytics/Quantum-Visa-Manager`

1. **Hostinger-ReadOnly** — for diagnostic workflow only  
2. **Production** — for deploy/rollback (add required reviewers recommended)

Do not edit Ledgerline environments or secrets.

---

## B. Environment secrets — `Hostinger-ReadOnly`

Use the **dedicated** private key that pairs with `qvm-hostinger-production` (from your local Windows machine). Do **not** paste Ledgerline’s private key.

| Secret name | Exact value to set |
|-------------|--------------------|
| `HOSTINGER_HOST` | `92.113.28.62` |
| `HOSTINGER_PORT` | `65002` |
| `HOSTINGER_USERNAME` | `u359614291` |
| `HOSTINGER_SSH_KEY` | Full PEM private key for `qvm-hostinger-production` (including `-----BEGIN…-----` / `-----END…-----`) |

---

## C. Environment secrets — `Production`

| Secret name | Exact value to set |
|-------------|--------------------|
| `HOSTINGER_HOST` | `92.113.28.62` |
| `HOSTINGER_PORT` | `65002` |
| `HOSTINGER_USERNAME` | `u359614291` |
| `HOSTINGER_SSH_KEY` | Same dedicated QVM private key PEM |
| `HOSTINGER_KNOWN_HOSTS` | One or more pinned host-key lines for `92.113.28.62` (from verified `ssh-keyscan` / fingerprint match). Required for `StrictHostKeyChecking=yes`. |

Optional later (Graph notify — leave unset until OIDC is ready):

| Secret name | Purpose |
|-------------|---------|

---

## D. Environment / repository variables — `Production`

Prefer **Production environment variables** (same names work as repo vars; workflows read `vars.*`).

| Variable name | Exact value | Notes |
|---------------|-------------|--------|
| `QVM_PRODUCTION_CUTOVER_ENABLED` | `false` | **Keep false** until first controlled deploy is approved |
| `HOSTINGER_TARGET_PATH` | `/home/u359614291/domains/quantumvisamanager.com/public_html` | Workflow rejects any other path |
| `HOSTINGER_TARGET_SUFFIX` | `/domains/quantumvisamanager.com/public_html` | Must match `$HOME` + suffix |
| `HOSTINGER_PUBLIC_URL` | `https://quantumvisamanager.com` | Health checks after DNS/SSL |
| `GRAPH_NOTIFY_ENABLED` | `false` | Keep false until Graph OIDC approved |
| `GRAPH_SENDER_EMAIL` | `support@highvolt.tech` | Optional until Graph enabled |
| `GRAPH_ALERT_EMAIL` | `alerts@highvolt.tech` | Optional until Graph enabled |

---

## E. Isolation guarantees encoded in workflows

- Deploy/rollback/diagnostic pin host `92.113.28.62`, port `65002`, user `u359614291`.
- Canonical target must equal QVM `public_html` exactly.
- Paths containing `quantumledgerline.com` / `quantumledgerlink.com` are rejected.
- Backups use `$HOME/deployment_backups/qvm-production` only (not `ledgerline-production`).
- SSH uses `StrictHostKeyChecking=yes` + pinned `HOSTINGER_KNOWN_HOSTS` (Production) or fingerprint-gated keyscan (diagnostic).
- Deploy job runs only when `QVM_PRODUCTION_CUTOVER_ENABLED == 'true'`.

---

## F. Next manual step (do this next)

1. Open GitHub → `HighVolt-Analytics/Quantum-Visa-Manager` → **Settings → Environments**.
2. Create **Hostinger-ReadOnly** and add the four secrets in section B using the **qvm-hostinger-production** private key from your Windows machine.
3. On your PC, capture the host key fingerprint (do not commit the private key):

```powershell
ssh-keyscan -p 65002 92.113.28.62 | Out-File -Encoding ascii hostinger_scanned.txt
ssh-keygen -lf hostinger_scanned.txt -E sha256
```

4. After PR #1 is reviewed/merged (or from `main` once workflows exist), run **Read-only Hostinger path diagnostic (QVM)** with `expected_host_key_fingerprint` = the `SHA256:…` value from step 3.
5. Only after diagnostic succeeds: create **Production** environment and set section C + D (`QVM_PRODUCTION_CUTOVER_ENABLED=false`).

Do **not** enable cutover, merge without review, change DNS, or deploy yet.

Graph notify (set only after Entra FIC approval; see `docs/microsoft-graph-notifications.md`):

| Name | Scope | Value |
|------|-------|-------|
| `MAIL_TENANT_ID` | Production variable | `54904ca2-e5a0-481c-a10a-73242e6476ea` |
| `MAIL_CLIENT_ID` | Production variable | `df08aa1f-1ac0-4fd4-964e-aac37fc57bfc` |
| `MAIL_FROM` | Production secret | `support@highvolt.tech` |
| `MAIL_TO` | Production secret | `alerts@highvolt.tech` |
| `GRAPH_NOTIFY_ENABLED` | Repository variable | keep `false` until smoke test approved |

## Automatic deploy path allowlist

deploy.yml push triggers only when these website build inputs change on main:

- src/**
- public/**
- index.html
- package.json
- package-lock.json
- ite.config.js

Docs, tests, notification scripts, workflows, and legacy root HTML/assets do **not** auto-deploy. Manual workflow_dispatch remains available and is still gated by QVM_PRODUCTION_CUTOVER_ENABLED.

