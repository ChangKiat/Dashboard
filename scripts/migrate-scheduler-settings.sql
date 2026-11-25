-- Dashboard scheduler preferences. Existing schedules are preserved by default.
CREATE TABLE IF NOT EXISTS scheduler_settings (
    name text PRIMARY KEY CHECK (name IN ('fixed-bills', 'interest', 'nightly-check-in')),
    enabled boolean NOT NULL,
    at_minutes integer NOT NULL CHECK (at_minutes BETWEEN 0 AND 1439)
);
