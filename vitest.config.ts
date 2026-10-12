import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: { PERSISTENCE: 'off', FREELLMAPI_ENABLED: '0', GEMINI_API_KEY: '', API_RATE_LIMIT_PER_MIN: '100000', AI_RATE_LIMIT_PER_MIN: '100000' },
    testTimeout: 20000,
  },
});
