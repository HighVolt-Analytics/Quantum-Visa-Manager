# Quantum Visa Manager — Production Setup Guide

Domain: `quantumvisamanager.com`  
Repository: `HighVolt-Analytics/Quantum-Visa-Manager`  
Portal: `https://webdeployment.highvolt.tech`

## Isolation rules (mandatory)

Quantum Ledgerline and all other HighVolt production websites are **read-only** for this workstream.

- Verified QVM root: `/home/u359614291/domains/quantumvisamanager.com/public_html`
- Forbidden Ledgerline root: `/home/u359614291/domains/quantumledgerline.com/public_html`
- Same Hostinger account may host both sites; workflows **pin and reject** non-QVM paths.
- Dedicated SSH key: `qvm-hostinger-production` (do not reuse Ledgerline’s private key).
- Separate GitHub Environments (`Hostinger-ReadOnly`, `Production`) on **this** repository.
- Separate backup directory: `$HOME/deployment_backups/qvm-production`.
- Cutover gate: `QVM_PRODUCTION_CUTOVER_ENABLED` (keep `false` until first approved deploy).
- See `docs/github-production-checklist.md` for the exact secret/variable table.

Production cutover remains **disabled** until `QVM_PRODUCTION_CUTOVER_ENABLED=true` is set after Hostinger + DNS + secrets are approved.

---

## 1. Hostinger (create website — manual)

1. In Hostinger, create a new website for **quantumvisamanager.com** (empty document root).
2. Note the account’s SSH host, port, username, and document root path. Typical layouts:
   - `/home/<user>/domains/quantumvisamanager.com/public_html`
   - or `/home/<user>/public_html` (only if this account is dedicated to QVM)
3. Install/enable SSL for the domain after DNS points here (Hostinger SSL / Let’s Encrypt).
4. Generate or assign a **dedicated** SSH deploy key for this site (or this Hostinger account). Do not paste Ledgerline’s private key.
5. Capture the SSH host key fingerprint from Hostinger (SHA256:…).

### Read-only discovery (after website exists)

1. Create GitHub Environment `Hostinger-ReadOnly` on this repo.
2. Add secrets: `HOSTINGER_HOST`, `HOSTINGER_PORT`, `HOSTINGER_USERNAME`, `HOSTINGER_SSH_KEY`.
3. Run workflow **Read-only Hostinger path diagnostic (QVM)** with:
   - `expected_host_key_fingerprint` = Hostinger SHA256 fingerprint
   - `expected_domain` = `quantumvisamanager.com`
4. Confirm one writable candidate root and set Production vars from that result.

---

## 2. GoDaddy DNS (propose only — do not apply without approval)

Before changing DNS, check for existing MX/TXT (email) records for `quantumvisamanager.com`.

### Recommended apex + www (Hostinger shared hosting)

Confirm Hostinger’s current A/CNAME targets in the Hostinger panel for this website, then typically:

| Type | Name | Value | Notes |
|------|------|-------|-------|
| A | `@` | *Hostinger IPv4 from panel* | Apex |
| CNAME | `www` | `quantumvisamanager.com` or Hostinger WWW target | Prefer Hostinger’s recommended WWW record |
| TXT | as needed | existing email/SPF | Do not remove mail records unless intentional |

Do **not** change `quantumledgerlink.com`, `quantumledgerline.com`, or other HighVolt domains.

After DNS propagates, enable HTTPS in Hostinger and verify:

- `https://quantumvisamanager.com/`
- `https://www.quantumvisamanager.com/` (redirect or serve)

---

## 3. GitHub repository configuration

### Environments

| Environment | Purpose |
|-------------|---------|
| `Hostinger-ReadOnly` | Diagnostic workflow only |
| `Production` | Deploy + rollback (add required reviewers recommended) |

### Repository variables

| Variable | Initial value | Purpose |
|----------|---------------|---------|
| `QVM_PRODUCTION_CUTOVER_ENABLED` | `false` | Master production gate |
| `HOSTINGER_TARGET_PATH` | *(set after discovery)* | Absolute document root |
| `HOSTINGER_TARGET_SUFFIX` | `/domains/quantumvisamanager.com/public_html` or `/public_html` | Home-relative suffix check |
| `HOSTINGER_PUBLIC_URL` | `https://quantumvisamanager.com` | Health checks |
| `GRAPH_NOTIFY_ENABLED` | `false` | Enable after Graph OIDC is ready |
| `GRAPH_SENDER_EMAIL` | `support@highvolt.tech` | Graph sendMail user |
| `GRAPH_ALERT_EMAIL` | `alerts@highvolt.tech` | Alert recipient |

### Repository / Environment secrets (Production)

| Secret | Purpose |
|--------|---------|
| `HOSTINGER_HOST` | SSH host |
| `HOSTINGER_PORT` | SSH port |
| `HOSTINGER_USERNAME` | SSH user |
| `HOSTINGER_SSH_KEY` | Private key (QVM-specific) |
| `HOSTINGER_KNOWN_HOSTS` | Pinned host key line(s) |
| `AZURE_CLIENT_ID` | Entra app for Graph OIDC (QVM-scoped) |
| `AZURE_TENANT_ID` | Entra tenant |

---

## 4. Microsoft Graph notifications (site-specific)

Authoritative checklist: [`docs/microsoft-graph-notifications.md`](./microsoft-graph-notifications.md).

QVM aligns with the verified Ledgerline Graph OIDC helpers (`MAIL_*` + federated credential), not mailbox passwords.

Until Entra FIC + Production `MAIL_*` are approved and the notification-only smoke test succeeds, keep:

- `GRAPH_NOTIFY_ENABLED=false`
- no `AZURE_*` Graph secrets

Preferred identity decision: **extend** existing app `df08aa1f-1ac0-4fd4-964e-aac37fc57bfc` with one QVM Production immutable OIDC federated credential. Preserve Exchange sender restriction to `support@highvolt.tech`; recipient `alerts@highvolt.tech`.

## 5. Branch protection (recommended before cutover)

On `main`:

- Require PR + CI (`CI / Lint and production build`)
- Restrict direct pushes if possible
- Require review for Production environment deployments

---

## 6. Deployment Portal

Portal repo: `Ramhighvolt/highvolt-deploy-portal`

- Website id: `quantum-visa-manager`
- `deployEnabled: false` until cutover
- When enabled, portal resolves `main` HEAD SHA and dispatches `release_commit`, `confirm_production=DEPLOY`, plus `deployer_*`

---

## 7. First controlled cutover sequence

1. Hostinger website + SSL ready  
2. GoDaddy DNS approved and applied  
3. Read-only diagnostic succeeds  
4. Production secrets/vars set; `QVM_PRODUCTION_CUTOVER_ENABLED` still `false`  
5. Merge prep PR; confirm CI green; confirm `deploy` job skipped  
6. Enable Production environment protection  
7. Set `QVM_PRODUCTION_CUTOVER_ENABLED=true`  
8. Manual `workflow_dispatch` with `confirm_production=DEPLOY` and exact `release_commit`  
9. Verify homepage + `/platform` + `deploy-info.txt`  
10. Enable portal `deployEnabled`  
11. Optionally enable `GRAPH_NOTIFY_ENABLED`
