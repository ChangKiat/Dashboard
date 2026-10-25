# Dashboard SQL scripts

Database migrations do not live here. The bot and the Dashboard share one database, and its schema (`init-db.sql`) and every `migrate-*.sql` file live in [`AI Agent/scripts/`](../../AI%20Agent/scripts). The AI Agent `README.md` (step 3, "Upgrading an existing database") lists them in run order.

`migrate-fixed-expense-instrument.sql`, `migrate-body-weight-logs.sql`, `migrate-transfer-fee.sql`, `migrate-daily-activity.sql` and `migrate-car-service.sql` used to be here; they moved to `AI Agent/scripts/` in the 2026-10 sync. Add new migrations there, not here.

Only personal data stays in this folder:

- `seed-car-service-visits.sql`: optional seed of past car service visits for the Car tab. Run it once, after `AI Agent/scripts/migrate-car-service.sql`. A re-run skips visits that already exist.
