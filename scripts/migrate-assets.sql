-- Personal belongings (computer, accessories, car...) with a sticker picture.
-- Pictures are kept in the DB so they stay private and survive redeploys.
CREATE TABLE IF NOT EXISTS assets (
    id serial PRIMARY KEY,
    name text NOT NULL,
    category text NOT NULL,
    purchase_date text NOT NULL,
    purchase_value numeric(12, 2) NOT NULL CHECK (purchase_value >= 0),
    current_value numeric(12, 2) CHECK (current_value >= 0),
    notes text,
    image bytea,
    image_mime text,
    image_version integer NOT NULL DEFAULT 0,
    created_at timestamp DEFAULT now() NOT NULL
);
