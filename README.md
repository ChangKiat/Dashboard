# Personal Dashboard

Charts for daily expenses, workouts, and meal macros. Reads data from your [AI Agent](../AI%20Agent) Supabase database via a local Express API.

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

## API endpoints


| Endpoint                                   | Description                                         |
| ------------------------------------------ | --------------------------------------------------- |
| `GET /api/health`                          | Config status                                       |
| `GET /api/expenses/daily?start=&end=`      | Daily spending series                               |
| `GET /api/expenses/categories?start=&end=` | Category breakdown                                  |
| `GET /api/expenses/overview?month=`        | Monthly budget overview (tables, charts, totals)    |
| `GET /api/expenses/transactions?month=`    | Transaction log for the selected month              |
| `POST /api/expenses/transactions`          | Create a variable expense transaction               |
| `PATCH /api/expenses/transactions/:id`     | Update a variable expense transaction               |
| `DELETE /api/expenses/transactions/:id`    | Delete a variable expense transaction               |
| `GET /api/expenses/fixed`                  | Active fixed/recurring expenses                     |
| `POST /api/expenses/fixed`                 | Create a fixed expense                              |
| `PATCH /api/expenses/fixed/:id`            | Update a fixed expense                              |
| `DELETE /api/expenses/fixed/:id`           | Deactivate a fixed expense                          |
| `GET /api/workouts/daily?start=&end=`      | Sessions and sets per day                           |
| `GET /api/workouts/exercises?start=&end=`  | Top exercises and weight trend                      |
| `GET /api/workouts/prs`                    | All-time personal records (max weight per exercise) |
| `GET /api/workouts/history?start=&end=`    | Detailed workout log for date range                 |
| `POST /api/workouts`                       | Create a workout entry                              |
| `PATCH /api/workouts/:id`                  | Update a workout entry                              |
| `DELETE /api/workouts/:id`                 | Delete a workout entry                              |
| `GET /api/nutrition/daily?start=&end=`     | Daily macros vs targets                             |
| `GET /api/nutrition/meals?start=&end=`     | Meal log for date range                             |
| `POST /api/nutrition/meals`                | Create a meal entry                                 |
| `PATCH /api/nutrition/meals/:id`           | Update a meal entry                                 |
| `DELETE /api/nutrition/meals/:id`          | Delete a meal entry                                 |


Date params use `YYYY-MM-DD`. Defaults to the last 30 days (Asia/Kuala_Lumpur).

## Expenses tab layout

Top to bottom:

1. Summary cards — salary, amount can use, fixed total, budget, actual spend
2. Variable budget cards with totals summary (full width, responsive grid)
3. Spending calendar + day detail panel (selected day's total, category breakdown, paginated transactions; add/edit/delete per day)
4. Fixed expenses table (add/edit/delete)

Transactions are viewed, added, and edited per day via the spending calendar day panel.

Variable expense categories and salary come from the AI Agent database (`budgets` table and `user_settings.salary_after_tax`). The API loads categories at startup via `loadExpenseCategories()`.

## Health tab

- Activity calendar with inline day summary panel; add workouts and meals per day; click workout/meal badges to open detail popouts
- Workout analytics: volume, top exercises, weight trend, and personal records (no monthly log table)
- Daily macros chart (no monthly meal log table)
- Workout entries include `caloriesBurned` and `fatBurnG` when set via the bot
- Nutrition targets include `bodyWeightKg` from `user_settings`