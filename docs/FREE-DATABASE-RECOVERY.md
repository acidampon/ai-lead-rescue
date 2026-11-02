# AI Lead Rescue: free external PostgreSQL recovery

## Purpose

The current Render deployment is coupled to the expired Render-managed database `veridexa-db`. This alternative blueprint keeps the web service on Render's free web tier while allowing PostgreSQL to live with an independent provider. It does not change the existing production service or deploy anything.

## Recommended route

Evaluate **Neon Free** first. Its current official free-plan documentation lists 100 projects, 100 CU-hours per project per month, 1 GB storage per project, and 5 GB public transfer per project per month; compute scales to zero after five minutes. Use its pooled PostgreSQL connection string with the standard `pg` driver. These limits are suitable for a small recovery/staging workload, not a guarantee of uninterrupted production. Check the account dashboard before provisioning. A free Supabase PostgreSQL project is an alternative only if an eligible free project slot is available; the user's existing Supabase free projects already have an active-project cap constraint.

**Important hosting caveat:** Render's official free-service documentation says free web services have ephemeral filesystems, spin down after 15 minutes idle, and may be suspended for unusually high outbound traffic such as external database/API traffic. Render also describes free services as unsuitable for production. Therefore this external-DB blueprint is a no-cost recovery/staging route, not a durable production SLA. If Render suspends outbound DB access or the app needs reliable availability, the genuinely robust free option may be to host both the app and database on a provider with a compatible free allowance rather than split the service across Render and an external database.

## Recovery steps

1. Create a **new, independent** PostgreSQL database at a provider that offers a free tier. Do not delete or modify the old Render database.
2. Create a database role/password specifically for AI Lead Rescue. Do not reuse Uplift credentials or the Supabase service-role key.
3. Use the provider's pooled PostgreSQL connection string if offered. Ensure TLS is enabled and the provider documents compatibility with the standard PostgreSQL `pg` driver.
4. Keep the connection string private. Do not commit it to Git, paste it into source files, or put it in client-side environment variables.
5. Create a separate Render service from this recovery blueprint, or configure an isolated staging service. Set `DATABASE_URL` as a secret environment variable. The blueprint intentionally uses `sync: false` so the secret is supplied interactively rather than stored in source.
6. Confirm `NODE_ENV=production`, `AUTH_REQUIRED=true`, and `REQUIRE_PERSISTENCE=true`. Keep `DATABASE_SSL=true`.
7. Wait for the build and startup. Verify `/api/health` reports PostgreSQL with persistent storage, and `/api/ready` returns HTTP 200. A successful web build alone is not sufficient.
8. Register a fresh owner account and verify sign-in, workspace isolation, lead intake, duplicate idempotency, reply handling, and CSV export in the isolated service.
9. Configure a unique long random `ALR_BACKUP_TOKEN` and optional expiry. Test the protected database export endpoint and store exports outside the application database.
10. Only after validation should a deliberate production cutover be planned. Do not point the current production service at a new database until the user has reviewed the target, backup, and cutover plan.

## Existing data and restore limits

The available Library snapshot is a one-row logical `public.alr_state` snapshot containing demo workspace state, not verified production customer records. It is not a full historical backup. The restore script refuses non-empty targets and is designed for a separate empty recovery database. Do not restore this snapshot into a database that may contain valuable data.

Before treating old records as unrecoverable, inspect Render's dashboard for any available backup/recovery or support-assisted recovery options for the suspended `veridexa-db`. The hosted database query connector currently cannot connect because the instance has an empty IP allowlist; this is not evidence that the database contents are empty.

## Cost and operational trade-offs

- Render free web services can sleep, lose local files, and are explicitly not recommended for production; unusually high outbound database/API traffic can trigger suspension.
- Neon Free currently lists 100 CU-hours and 1 GB storage per project, with scale-to-zero after five minutes; free PostgreSQL plans commonly have compute, transfer, storage, connection, and inactivity limits.
- Supabase Free projects pause after one week of inactivity and have a two-active-project limit.
- A free setup is appropriate for recovery, validation, and early low-volume use, not a guarantee of uninterrupted production service.
- Keep independent encrypted exports. Test restores into a separate empty database periodically.
- Do not store credentials or real customer/payment data in the demo snapshot.

## Files

- `render.recovery.yaml`: alternative blueprint using an externally supplied PostgreSQL URL.
- `render.yaml`: existing production blueprint, intentionally untouched.
