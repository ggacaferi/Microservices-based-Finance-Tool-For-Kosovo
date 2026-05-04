import {
  getAiDatabaseConfig,
  getIamDatabaseConfig,
  getLedgerDatabaseConfig,
  getOperationsDatabaseConfig,
} from '../src/infrastructure/database/database.config';

describe('database.config', () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it('returns null when no host is configured', () => {
    delete process.env.POSTGRES_HOST;
    delete process.env.IAM_DB_HOST;
    delete process.env.OPS_DB_HOST;
    delete process.env.LEDGER_DB_HOST;
    delete process.env.AI_DB_HOST;
    expect(getIamDatabaseConfig()).toBeNull();
    expect(getOperationsDatabaseConfig()).toBeNull();
    expect(getLedgerDatabaseConfig()).toBeNull();
    expect(getAiDatabaseConfig()).toBeNull();
  });

  it('builds configs when specific hosts are set', () => {
    delete process.env.POSTGRES_HOST;
    process.env.IAM_DB_HOST = 'iam.example';
    process.env.OPS_DB_HOST = 'ops.example';
    process.env.LEDGER_DB_HOST = 'ledger.example';
    process.env.AI_DB_HOST = 'ai.example';

    const iam = getIamDatabaseConfig();
    expect(iam?.host).toBe('iam.example');

    const ops = getOperationsDatabaseConfig();
    expect(ops?.database).toBe('guri_operations');

    const led = getLedgerDatabaseConfig();
    expect(led?.entities?.length).toBe(1);

    const ai = getAiDatabaseConfig();
    expect(ai?.database).toBe('guri_ai');
  });

  it('respects POSTGRES_HOST fallback and overrides', () => {
    process.env.POSTGRES_HOST = 'pg.local';
    process.env.NODE_ENV = 'test';
    process.env.DB_LOGGING = 'true';
    process.env.POSTGRES_PORT = '5433';

    const ops = getOperationsDatabaseConfig();
    expect(ops?.host).toBe('pg.local');
    expect(ops?.port).toBe(5433);
    expect(ops?.logging).toBe(true);
  });
});
