/**
 * Runs before each test file. Ensures bounded-context modules resolve to
 * in-memory mode so tests do not require Postgres unless explicitly opted in.
 */
delete process.env.POSTGRES_HOST;
delete process.env.IAM_DB_HOST;
delete process.env.OPS_DB_HOST;
delete process.env.LEDGER_DB_HOST;
delete process.env.AI_DB_HOST;
