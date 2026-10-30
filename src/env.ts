// Load .env from the project root (Node >= 20.12 built-in, no dependency).
// Real environment variables (e.g. on Render) always win over the file.
import fs from 'node:fs';

if (fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch (err) {
    console.warn('[env] could not read .env:', (err as Error).message);
  }
}
