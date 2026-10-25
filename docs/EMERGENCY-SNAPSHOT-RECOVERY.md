# Emergency AI Lead Rescue snapshot recovery

This is a guarded recovery path for the JSON snapshot produced by `GET /api/admin/database-export`.

**Important:** this snapshot is not a native PostgreSQL `pg_dump` archive. The included restore script intentionally supports only the current single-table AI Lead Rescue state database (`public.alr_state`). If the snapshot contains other application tables, the script refuses to restore. For a complete database backup, use a native `pg_dump` archive and validate it with `pg_restore --list`.

## Restore only into a separate empty recovery database

1. Keep the downloaded JSON snapshot private. It contains application data and may contain customer contact details and integration settings.
2. Create or select a separate recovery database. Do not use the expiring production database as the restore target.
3. Set `DATABASE_URL` in a private terminal to the recovery database connection URL without putting the URL directly in a command-history line.
4. Confirm the recovery target is empty. Then set:
   ```bash
   export RESTORE_CONFIRM_TARGET=EMPTY_RECOVERY_DATABASE
   ```
5. Install this repository's production dependency:
   ```bash
   npm install --omit=dev --no-audit --no-fund
   ```
6. Run the restore script, replacing the file name with the downloaded snapshot:
   ```bash
   node scripts/restore-alr-state-snapshot.mjs ./veridexa-logical-snapshot-YYYY-MM-DD.json
   ```
7. The script checks the snapshot format, confirms it contains exactly one `public.alr_state` row, requires an explicit target confirmation, rejects other application tables, and refuses to overwrite any existing row. It uses a transaction and verified TLS.
8. Confirm the script reports success. Keep the snapshot file, its SHA-256 checksum shown by the download page, and export metadata in a separate safe location.
9. Clear connection secrets when finished:
   ```bash
   unset DATABASE_URL RESTORE_CONFIRM_TARGET
   ```

Do not remove the confirmation guard or point this script at production. A successful restore is not a substitute for a native PostgreSQL backup.
