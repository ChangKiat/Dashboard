BEGIN;
ALTER TABLE fixed_expenses ADD COLUMN IF NOT EXISTS billing_price jsonb;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_id integer REFERENCES fixed_expenses(id), ADD COLUMN IF NOT EXISTS charge_confirmed boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_recurring_date ON expenses(recurring_id, date);
COMMIT;
