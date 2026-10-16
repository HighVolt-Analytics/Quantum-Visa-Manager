# Quantum Visa Manager — Production Setup Guide

Domain: `quantumvisamanager.com`  
Repository: `HighVolt-Analytics/Quantum-Visa-Manager`  
Portal: `https://webdeployment.highvolt.tech`

## Isolation rules (mandatory)

Quantum Ledgerline and all other HighVolt production websites are **read-only** for this workstream.

- Use a **separate** Hostinger document root for `quantumvisamanager.com` only.
- Use **separate** GitHub Environments (`Hostinger-ReadOnly`, `Production`) on **this** repository.
- Use **separate** SSH credentials, known_hosts, backup directory (`~/deployment_backups/qvm-production`), and cutover gate (`QVM_PRODUCTION_CUTOVER_ENABLED`).
- Do **not** modify Ledgerline workflows, secrets, DNS, Vercel, or production files.
- Do **not** reuse Ledgerline’s private key or document root path.
- If a change could affect any existing production website, **stop and request approval**.

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

Ledgerline’s current `deploy.yml` in-repo does **not** contain a Graph notify job (as of prep). QVM includes an optional Graph job gated by `GRAPH_NOTIFY_ENABLED`.

### Preferred secure design

1. Create or reuse a narrowly scoped Entra application for GitHub Actions → Graph `sendMail` as `support@highvolt.tech`.
2. Add a **federated credential** for:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:HighVolt-Analytics/Quantum-Visa-Manager:environment:Production`  
     (or `ref:refs/heads/main` if environment binding is not used)
3. Grant **Application** permission `Mail.Send` **only if** org policy requires app-only mail; prefer **delegated** / limited mailbox access for `support@highvolt.tech` per your tenant design. Do **not** grant unrestricted tenant-wide mail without approval.
4. Set `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` on the Production environment.
5. Smoke-test with `GRAPH_NOTIFY_ENABLED=true` on a failed/success dry run after cutover, then leave enabled.

Do not store mailbox passwords in GitHub secrets.

---

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
