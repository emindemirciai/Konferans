CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE "Channel" SET id = 'c' || encode(gen_random_bytes(12), 'hex') WHERE id LIKE '%-%';
