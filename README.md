# Personal Dashboard

Charts for daily expenses, workouts, and meal macros. Reads data from your [AI Agent](../AI%20Agent) Supabase database via a local Express API.

For a fuller product/architecture summary, see [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md).

## Setup

1. Install dependencies:
  ```bash
   npm install
  ```
2. Copy environment variables:
  ```bash
   cp .env.example .env
  ```
3. Fill in `.env`:
  - `DATABASE_URL` — copy from your AI Agent `.env`
  - `TELEGRAM_USER_ID` — your Telegram user ID (`ctx.from.id` from the bot)
  - `AUTH_TOTP_SECRET` — base32 secret for your authenticator app
  - `AUTH_SESSION_SECRET` — long random string (cookie signing)

## Authenticator login (TOTP)

The dashboard is locked behind a 6-digit authenticator code (no password). Sessions last 14 days.

1. Generate secrets:

```bash
node -e "console.log(new (require('otpauth').Secret)().base32)"
openssl rand -hex 32
```

2. Put them in `.env` / Render as `AUTH_TOTP_SECRET` and `AUTH_SESSION_SECRET`.

3. One-time QR setup: set `AUTH_TOTP_SETUP=1`, restart, open `GET /api/auth/setup`, scan `qrDataUrl` (or add `otpauthUrl` manually) in Google Authenticator / Authy.

4. Unset `AUTH_TOTP_SETUP` and restart so `/api/auth/setup` returns 404.

Auth endpoints: `GET /api/auth/me`, `POST /api/auth/verify`, `POST /api/auth/logout`, `GET /api/auth/setup` (setup only).

## Run (development)

Start both API and frontend:

```bash
npm run dev
```

Or in separate terminals:

```bash
npm run dev:server   # http://localhost:3001
npm run dev:client   # http://localhost:5173 (proxies /api to server)
```

Open [http://localhost:5173](http://localhost:5173)

## Daily jobs (scheduler)

The server runs the jobs the Telegram bot used to run with node-cron ([server/dailyJobs.ts](server/dailyJobs.ts)), all in Asia/Kuala_Lumpur time, and reports to you through the bot:

- 9:00 fixed bills, with unit trust buys, funding transfers and loan payments
- 9:00 interest accrual

Nothing waits for an exact minute, because a free host may be asleep at 9:00. The server checks for due jobs when it starts, every 5 minutes while it's up, and on `POST /api/scheduler/run`. The `scheduled_job_runs` table (`AI Agent/scripts/migrate-scheduled-job-runs.sql`) keeps one row per job per day, so a day never runs twice. When the server was down, it catches up the bills and interest of up to 7 missed days, each dated on its own day. A failed day is retried twice, 30 minutes apart.

To turn it on:

1. Run `migrate-scheduled-job-runs.sql` once (the Supabase SQL editor works).
2. On the deployed server only, set `SCHEDULER_ENABLED=1`, `SCHEDULER_SECRET` (`openssl rand -hex 32`) and `TELEGRAM_BOT_TOKEN` (the same token as the AI Agent).
3. If the host sleeps when idle (Render free plan), add the GitHub repository secrets `DASHBOARD_URL` and `SCHEDULER_SECRET`. [.github/workflows/daily-jobs.yml](.github/workflows/daily-jobs.yml) then wakes the server at 9:05, with retries at 10:35 and 14:05. Any cron service that can send `POST /api/scheduler/run` with `Authorization: Bearer <SCHEDULER_SECRET>` works too.
4. Check that `GET /api/health` shows `"scheduler": "on"`.

## API endpoints


| Endpoint                                   | Description                                         |
| ------------------------------------------ | --------------------------------------------------- |
| `GET /api/health`                          | Config status                                       |
| `POST /api/scheduler/run`                  | Run the due daily jobs (`Authorization: Bearer <SCHEDULER_SECRET>`) |
| `GET /api/expenses/daily?start=&end=`      | Daily spending series                               |
| `GET /api/expenses/categories?start=&end=` | Category breakdown                                  |
| `GET /api/expenses/overview?month=`        | Monthly budget overview (tables, charts, totals)    |
| `GET /api/expenses/transactions?month=`    | Transaction log for the selected month              |
| `POST /api/expenses/transactions`          | Create a variable expense transaction (optional `reimbursements` for shared bills) |
| `PATCH /api/expenses/transactions/:id`     | Update a variable expense transaction               |
| `DELETE /api/expenses/transactions/:id`    | Delete a variable expense transaction               |
| `GET /api/expenses/fixed`                  | Active fixed/recurring expenses                     |
| `POST /api/expenses/fixed`                 | Create a fixed expense                              |
| `PATCH /api/expenses/fixed/:id`            | Update a fixed expense                              |
| `DELETE /api/expenses/fixed/:id`           | Deactivate a fixed expense                          |
| `GET /api/incomes/transactions?month=`   | Income log for the selected month                   |
| `GET /api/incomes/daily?start=&end=`       | Daily income series                                 |
| `POST /api/incomes/transactions`           | Create an income entry (claim, transfer, etc.)      |
| `PATCH /api/incomes/transactions/:id`    | Update an income entry                              |
| `DELETE /api/incomes/transactions/:id`   | Delete an income entry                              |
| `GET /api/workouts/daily?start=&end=`      | Sessions and sets per day                           |
| `GET /api/workouts/exercises?start=&end=`  | Top exercises and weight trend                      |
| `GET /api/workouts/prs`                    | All-time personal records (max weight per exercise) |
| `GET /api/workouts/history?start=&end=`    | Detailed workout log for date range                 |
| `POST /api/workouts`                       | Create a workout entry (optional `sessionId`, `sessionLabel`; label alone creates a new session) |
| `PATCH /api/workouts/:id`                  | Update a workout entry (including session fields) |
| `DELETE /api/workouts/:id`                 | Delete a workout entry                              |
| `GET /api/nutrition/daily?start=&end=`     | Daily macros vs targets                             |
| `GET /api/nutrition/settings`              | Nutrition targets + body weight                     |
| `PATCH /api/nutrition/settings`            | Update nutrition targets / body weight              |
| `GET /api/nutrition/meals?start=&end=`     | Meal log for date range                             |
| `POST /api/nutrition/meals`                | Create a meal entry                                 |
| `PATCH /api/nutrition/meals/:id`           | Update a meal entry                                 |
| `DELETE /api/nutrition/meals/:id`          | Delete a meal entry                                 |
| `GET /api/investments/accounts/:id/portfolio` | Holdings, events, cost/NAV summary for an investment account |
| `POST /api/investments/instruments`        | Create instrument (equity / fund / fd / other)      |
| `PATCH /api/investments/instruments/:id`   | Update instrument metadata / price / FD fields      |
| `DELETE /api/investments/instruments/:id`  | Soft-deactivate an instrument                       |
| `POST /api/investments/events/buy`         | Record buy + open lot (optional cash sync expense)  |
| `POST /api/investments/events/sell`        | Record sell FIFO (optional cash sync income)        |
| `POST /api/investments/events/dividend`    | Record dividend (credits income)                    |
| `POST /api/investments/events/interest`    | Record interest (optional cash sync)                |
| `POST /api/investments/events/price-mark`  | Set last price for unrealized P&L                   |
| `POST /api/investments/instruments/:id/accrue-fd` | Accrue FD interest from rate (or amount override) |


Date params use `YYYY-MM-DD`. Defaults to the last 30 days (Asia/Kuala_Lumpur).

The bot and the Dashboard share one database, and its schema and every migration live in [`AI Agent/scripts/`](../AI%20Agent/scripts). A new database runs `init-db.sql`; an existing one runs the missing `migrate-*.sql` files in the order listed in the AI Agent README (step 3, "Upgrading an existing database"). The Car tab requires `AI Agent/scripts/migrate-car-service.sql`. [`scripts/seed-car-service-visits.sql`](scripts/seed-car-service-visits.sql) is an optional seed of past car service visits: run it once, after that migration (a re-run skips visits that already exist).

## Expenses tab layout

Top to bottom:

1. Summary cards — salary, amount can use, fixed total, budget, actual spend
2. Variable budget cards with totals summary (full width, responsive grid)
3. Spending calendar + day detail panel (combined net spend / income stat, side-by-side expense and income tables with per-day CRUD)
4. Fixed expenses table (add/edit/delete)

Transactions and income are viewed, added, and edited per day via the spending calendar day panel. Expense create supports optional shared-bill reimbursements (`reimbursements: [{ source, amount }]`), which create linked `Transfer` income rows and reduce your net cost. Income categories: Claim (medical/OT), Transfer (bill share), Salary, Other.

Variable expense categories and salary come from the AI Agent database (`budgets` table and `user_settings.salary_after_tax`). The API loads categories at startup via `loadExpenseCategories()`.

## Health tab

- Activity calendar with inline day summary panel; workouts grouped by session in the day panel (e.g. Shoulder + Abs day with exercises listed underneath); add workouts per day with optional session label or join an existing same-day session
- Workout entries use `session_id` and `session_label` in the database — run `AI Agent/scripts/migrate-workout-sessions.sql` on older DBs
- Workout analytics: volume, top exercises, weight trend, and personal records (no monthly log table)
- Daily macros chart (no monthly meal log table)
- Workout entries include `caloriesBurned` and `fatBurnG` when set via the bot
- Nutrition targets include `bodyWeightKg` from `user_settings`