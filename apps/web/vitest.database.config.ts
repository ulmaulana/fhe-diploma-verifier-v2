import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/integration/database.test.ts'], fileParallelism: false, testTimeout: 15_000, hookTimeout: 20_000 } });
