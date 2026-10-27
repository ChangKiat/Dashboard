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
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `AUTH_ALLOWED_EMAILS` — Google sign-in (below)
  - `AUTH_SESSION_SECRET` — long random string (cookie signing)

## Google sign-in

The dashboard opens only for the Google accounts listed in `AUTH_ALLOWED_EMAILS`. Anyone else who signs in with Google is sent back to the login screen. Sessions last 14 days, and removing an email from the list ends its sessions at once.

1. In [Google Cloud Console](https://console.cloud.google.com/), pick a project (the one with the bot's Calendar service account works) and open **Google Auth Platform** (search for it; **APIs & Services → OAuth consent screen** opens it too). If it isn't set up yet, click **Get started**, enter an app name and your email, and pick **External** for the audience. A personal Gmail account can only pick External.
2. **Branding**: the **App name** is what Google's sign-in page shows ("to continue to …"), so name it something like Personal Dashboard.
3. **Audience**: leave **Publishing status** on **Testing**, and add your Google account under **Test users → + Add users**. While it's in Testing, only test users get past Google, on top of the email list.
4. **Clients → + Create client**, application type **Web application**. Under **Authorized redirect URIs** add:
   - `http://localhost:5173/api/auth/google/callback` (development)
   - `https://<your-app>.onrender.com/api/auth/google/callback` (deployed)

   Click **Create** and copy the client secret right away: the console shows it only once. If you lose it, open the client and add a new secret.
5. Put the client ID and secret in `.env` and on Render as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `GOOGLE_REDIRECT_URI` to the redirect URI for that place: the localhost one in `.env`, the Render one on Render.
6. Set `AUTH_ALLOWED_EMAILS` to your Google email (comma-separated for more than one) and `AUTH_SESSION_SECRET` to the output of `openssl rand -hex 32`.

**Data Access** needs nothing added: sign-in asks Google only for your email (`openid email`).

Auth endpoints: `GET /api/auth/me`, `GET /api/auth/google` (starts sign-in), `GET /api/auth/google/callback` (Google returns here), `POST /api/auth/logout`.

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
- 21:30 check-in ([server/nightlyCheckIn.ts](server/nightlyCheckIn.ts)): today's calories and protein against your targets, spending by category (plus any category you spent in today that is at 80% of its monthly budget or more), workouts and steps. Nothing is sent on a day with nothing logged, and a missed evening is skipped, not sent the next day.

Nothing waits for an exact minute, because a free host may be asleep at 9:00. The server checks for due jobs when it starts, every 5 minutes while it's up, and on `POST /api/scheduler/run`. The `scheduled_job_runs` table (`AI Agent/scripts/migrate-scheduled-job-runs.sql`) keeps one row per job per day, so a day never runs twice. When the server was down, it catches up the bills and interest of up to 7 missed days, each dated on its own day. A failed day is retried twice, 30 minutes apart.

To turn it on:

1. Run `migrate-scheduled-job-runs.sql` once (the Supabase SQL editor works).
2. On the deployed server only, set `SCHEDULER_ENABLED=1`, `SCHEDULER_SECRET` (`openssl rand -hex 32`) and `TELEGRAM_BOT_TOKEN` (the same token as the AI Agent).
3. If the host sleeps when idle (Render free plan), have something wake it at 9:05 and 21:35. Waking it is enough: the server runs the due jobs as soon as it starts, so a plain `GET /api/health` will do, and the cron service never needs `SCHEDULER_SECRET`.
   - **Use [cron-job.org](https://cron-job.org)** (free, runs on the minute). Create a cron job with the URL `https://<your-app>.onrender.com/api/health`, a custom schedule of `5,35 9,21,22 * * *` and the time zone Asia/Kuala_Lumpur. That covers 9:05 and 21:35 with retries; the extra pings never run a day twice. If cron-job.org reports a timeout, that's fine: Render takes about 30 seconds to wake, longer than cron-job.org waits, and the request still wakes it.
   - **Keep GitHub Actions as a backup only.** With the repository secrets `DASHBOARD_URL` and `SCHEDULER_SECRET`, [.github/workflows/daily-jobs.yml](.github/workflows/daily-jobs.yml) calls `POST /api/scheduler/run` at 9:05, 10:35, 14:05, 21:35 and 22:35. GitHub starts scheduled runs late, often by hours (on 2026-10-27 the 9:05 run started around 14:00), and a check-in ping that lands after midnight skips that evening.
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