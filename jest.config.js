/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.(test|spec).ts'],
  clearMocks: true,
  watchman: false,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
