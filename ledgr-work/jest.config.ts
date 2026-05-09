import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Include both src/__tests__ (integration with imports) and tests/ (self-contained)
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/*.test.ts",
    "**/tests/**/*.test.ts",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {
      tsconfig: {
        module: "commonjs",
        skipLibCheck: true,
        // Allow tests/ dir which is excluded from main tsconfig
        include: ["src/**/*", "tests/**/*"],
      }
    }],
  },
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "!src/lib/db/**",
    "!src/lib/utils/**",
  ],
  // Allow tests to use describe/test/expect without explicit imports
  globals: {
    "ts-jest": {
      tsconfig: {
        module: "commonjs",
        skipLibCheck: true,
      },
    },
  },
};

export default config;
