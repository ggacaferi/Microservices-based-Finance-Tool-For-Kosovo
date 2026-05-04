/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '<rootDir>/frontend/'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        isolatedModules: true,
      },
    ],
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/jest-env.cjs'],
  moduleNameMapper: {
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.dto.ts',
    '!src/domain/services/**',
    '!src/application/events/domain-event.bus.ts',
    '!src/iam/infrastructure/user.repository.ts',
    '!src/iam/infrastructure/tenant.repository.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'json-summary', 'json'],
};
