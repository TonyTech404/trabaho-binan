-- bcrypt password hashing runs in the database (crypt/gen_salt) to keep
-- CPU-heavy work off the Workers Free 10 ms CPU budget.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
