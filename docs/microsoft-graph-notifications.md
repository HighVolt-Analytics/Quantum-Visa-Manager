# Quantum Visa Manager - Microsoft Graph deployment notifications

Reference architecture: verified Ledgerline Graph OIDC helpers in `HighVolt-Analytics/Ledgerline`
(`scripts/send_mail_graph.py`, `notification-smoke-test.yml`, Production `MAIL_*` settings).

This document is configuration guidance only. It does **not** authorize Entra, Exchange, GitHub secret,
or production-gate changes.

## Decision: reuse the existing notification application

**Appropriate choice:** explicitly approved **extension** of the existing HighVolt deployment-notification
Entra application already used by Ledgerline (not a second Mail.Send identity), by adding one QVM-scoped
federated credential.

| Item | Value |
|------|--------|
| Existing app (Application / client ID) | `df08aa1f-1ac0-4fd4-964e-aac37fc57bfc` |
| Directory (tenant) ID | `54904ca2-e5a0-481c-a10a-73242e6476ea` |
| Why reuse | Same sender mailbox, same Exchange application restriction, same Graph app permission already validated for Ledgerline smoke + production notify |
| Isolation boundary | GitHub OIDC subject limited to this repository + `Production` environment (immutable IDs) |
| When to create a dedicated app instead | Only if org policy forbids sharing the notification app across products |

Do **not** widen Exchange mailbox scope or grant tenant-wide mail as part of QVM enablement.

## Verified GitHub OIDC identity (immutable)

Repository OIDC customization (already opted in):

| Claim / field | Value |
|---------------|--------|
| `use_default` | `true` |
| `use_immutable_subject` | `true` |
| `sub_claim_prefix` | `repo:HighVolt-Analytics@285209801/Quantum-Visa-Manager@1420396513` |
| Organization ID | `285209801` |
| Repository ID | `1420396513` |
| Repository node ID | `R_kgDOVKmH4Q` |

### Federated credential subject (required)

Jobs that use `environment: Production` (deploy notify + notification smoke test) emit:

```text
repo:HighVolt-Analytics@285209801/Quantum-Visa-Manager@1420396513:environment:Production
```

Suggested Entra federated credential display name: `fic-github-qvm-production`

| Field | Value |
|-------|--------|
| Issuer | `https://token.actions.githubusercontent.com` |
| Audiences | `api://AzureADTokenExchange` |
| Subject | exact string above |

Optional hardening (flexible federated credential / claims-matching expression), in addition to `sub`:

- `repository_id` eq `1420396513`
- `repository_owner_id` eq `285209801`

Do **not** trust the name-only subject `repo:HighVolt-Analytics/Quantum-Visa-Manager:environment:Production`
while immutable subjects are enabled for this repository.

## Token audience and Graph scope

| Step | Value |
|------|--------|
| GitHub OIDC audience requested by helper | `api://AzureADTokenExchange` |
| Entra token endpoint | `https://login.microsoftonline.com/54904ca2-e5a0-481c-a10a-73242e6476ea/oauth2/v2.0/token` |
| Grant type | `client_credentials` with JWT client assertion (federated) |
| Scope | `https://graph.microsoft.com/.default` |
| Graph API | `POST /v1.0/users/{MAIL_FROM}/sendMail` |
| Accepted status | `202` |

## Exchange / application mail restriction

Ledgerline production docs state Graph application mail permission is **scoped to the approved sender mailbox**.
Preserve that Application Access Policy / Exchange Application RBAC restriction:

- Allowed sender mailbox: `support@highvolt.tech` only
- Do not add other mailboxes for QVM
- Recipient for alerts remains `alerts@highvolt.tech` (transport destination, not an Entra permission change)

No Entra permission or Exchange RBAC change is required for QVM if the existing app already has
application `Mail.Send` limited to `support@highvolt.tech`.

## GitHub Production configuration (apply only after approval)

### Environment variables (`Production`)

| Name | Value |
|------|--------|
| `MAIL_TENANT_ID` | `54904ca2-e5a0-481c-a10a-73242e6476ea` |
| `MAIL_CLIENT_ID` | `df08aa1f-1ac0-4fd4-964e-aac37fc57bfc` |

### Environment secrets (`Production`)

| Name | Required value |
|------|----------------|
| `MAIL_FROM` | `support@highvolt.tech` |
| `MAIL_TO` | `alerts@highvolt.tech` |

### Repository variables (gates - keep false until approved)

| Name | Required value until go-live |
|------|------------------------------|
| `GRAPH_NOTIFY_ENABLED` | `false` |
| `QVM_PRODUCTION_CUTOVER_ENABLED` | `false` (unchanged by Graph prep) |

Deprecated / unused after this workflow alignment: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
`GRAPH_SENDER_EMAIL`, `GRAPH_ALERT_EMAIL` (replaced by Ledgerline `MAIL_*` pattern).

## Workflow behavior

| Workflow | Purpose | Can deploy site files? |
|----------|---------|------------------------|
| `notification-smoke-test.yml` | Manual simulated success/failure Graph mail | **No** |
| `deploy.yml` notify job | One final-outcome email after deploy success/failure | Notify job does not SCP/SSH; still gated by cutover + `GRAPH_NOTIFY_ENABLED` |

Success and failure notification paths both send as `MAIL_FROM` to `MAIL_TO` (`support@` to `alerts@`).

## Error handling / secret-safe logging

`scripts/send_mail_graph.py` classifies failures into allowlisted stages/categories and never logs
tokens, assertion bodies, Graph response payloads, or mailbox addresses from error text.

Logged categories include: `federated_credential_mismatch`, `invalid_audience_or_issuer`,
`token_exchange_rejected`, `oidc_assertion_retrieval_failed`, `graph_permission_denied`,
`graph_request_validation_failed`, `network_or_timeout`, `missing_configuration`.

Deploy notify uses `continue-on-error: true` so mail failure does not rewrite deploy outcome.

## Manual smoke test (after Entra FIC + GitHub MAIL_* are configured)

1. Confirm `GRAPH_NOTIFY_ENABLED=false` and `QVM_PRODUCTION_CUTOVER_ENABLED=false`.
2. Confirm no deploy workflow is started.
3. Dispatch **only** `notification-smoke-test.yml` on `main` with `outcome=both`.
4. Expect two Graph-accepted simulated messages at `alerts@highvolt.tech` from `support@highvolt.tech`.
5. Do not enable `GRAPH_NOTIFY_ENABLED` until smoke succeeds and you explicitly approve production notify.

## Next manual step

**Entra admin:** add federated credential on app `df08aa1f-1ac0-4fd4-964e-aac37fc57bfc` for the immutable
QVM Production subject above (no permission widening).

Then, with separate approval: set Production `MAIL_*` vars/secrets on Quantum-Visa-Manager and run the
notification-only smoke workflow once.
