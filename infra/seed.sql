-- Doc365 Hermes Portal — minimal DB prep run on first postgres boot.
-- Real schema migrations are applied by Drizzle from web/src/db/migrations.
-- This file only ensures extensions exist.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";      -- case-insensitive emails
