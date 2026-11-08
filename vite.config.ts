import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { intentApiPlugin } from './server/plugin';

export default defineConfig(({ mode }) => {
  // Load .env into the Node process only. Nothing here is exposed to the browser
  // (no VITE_ prefix), so the API key stays on the server.
  const env = loadEnv(mode, process.cwd(), '');
  if (env.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;
  return {
    plugins: [react(), intentApiPlugin()],
    test: { globals: true, environment: 'node' },
  };
});
