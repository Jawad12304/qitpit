// Loads .env into process.env.
//
// This must be imported BEFORE any module that reads process.env at load time
// (db.js resolves DATA_DIR, notify.js resolves SMTP settings). ES module
// imports are evaluated in order, so importing this first is what guarantees
// the file is read in time.
//
// process.loadEnvFile is native to Node 20.6+, so no dotenv dependency.

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = join(dirname(fileURLToPath(import.meta.url)), '.env');

if (existsSync(envPath)) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
    } catch (err) {
      console.error('[env] could not read .env:', err.message);
    }
  } else {
    console.warn('[env] .env found but this Node is older than 20.6 — ignoring it.');
  }
}
