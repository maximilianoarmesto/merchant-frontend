import type { Config } from "jest";

// Force the test environment even if NODE_ENV is already set externally.
// React (and other libs) gate their dev-mode checks on NODE_ENV !== 'production',
// so we must ensure 'test' wins before any module is evaluated.
process.env["NODE_ENV"] = "test";

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
  // setupFiles run before the test framework is installed in the environment.
  // jest-fetch-mock must be enabled here so that `global.fetch` is replaced
  // before any module under test (or its imports) evaluates.
  setupFiles: ["jest-fetch-mock/setupJest"],
  // setupFilesAfterEnv run after the test framework is installed.
  // This is the right place for @testing-library/jest-dom matchers and any
  // global beforeAll/afterAll hooks that rely on Jest globals.
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(t|j)sx?$": ["babel-jest", { configFile: "./babel.config.test.js" }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testMatch: ["**/__tests__/**/*.test.(ts|tsx)"],
};

export default config;
