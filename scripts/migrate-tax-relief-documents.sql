CREATE TABLE IF NOT EXISTS tax_relief_documents (
    id serial PRIMARY KEY,
    owner_email text NOT NULL,
    year integer NOT NULL CHECK (year BETWEEN 2000 AND 2100),
    kind text NOT NULL CHECK (kind IN ('ea', 'lhdn')),
    file_name text NOT NULL,
    data bytea NOT NULL
);

CREATE INDEX IF NOT EXISTS tax_relief_documents_owner_year_idx ON tax_relief_documents (owner_email, year);
