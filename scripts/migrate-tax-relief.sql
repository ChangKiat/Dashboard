CREATE TABLE IF NOT EXISTS tax_relief_claims (
  id serial PRIMARY KEY,
  year integer NOT NULL,
  date text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(12, 2) NOT NULL,
  notes text,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_relief_receipts (
  id serial PRIMARY KEY,
  claim_id integer NOT NULL REFERENCES tax_relief_claims (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS tax_relief_claims_year_idx ON tax_relief_claims (year);
CREATE INDEX IF NOT EXISTS tax_relief_receipts_claim_id_idx ON tax_relief_receipts (claim_id);
