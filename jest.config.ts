import type { Config } from "jest";

// Force the test environment even if NODE_ENV is already set externally.
// React (and other libs) gate their dev-mode checks on NODE_ENV !== 'production',
// so we must ensure 'test' wins before any module is evaluated.
process.env["NODE_ENV"] = "test";

const config: Config = {
  testEnvironment: "jest-environment-jsdom",
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
