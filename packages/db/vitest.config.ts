import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Load the repo-root .env when present so DB-backed tests share the same
// DATABASE_URL as the rest of the workspace. A missing file is fine.
config({ path: '../../.env' });

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
