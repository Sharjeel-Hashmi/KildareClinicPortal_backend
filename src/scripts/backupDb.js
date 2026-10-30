// Saves a copy of the whole database to a folder on this computer.
//
//   npm run backup        -> backups/2026-10-22T10-30-00Z/  (one .jsonl file per collection + manifest.json)
//
// Uses MONGODB_URI from .env and only READS from the database. The backup contains patient data and password
// hashes: keep it somewhere private and encrypted, never in git (backups/ is in .gitignore).
// Restore: src/scripts/restoreDb.js - see BACKUP.md.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import connectDB from '../config/db.js';
import { toLine } from './backupFormat.js';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  await connectDB(); // throws a clear error when MONGODB_URI is missing or wrong

  const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  const dir = path.join(here, '..', '..', 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });

  const db = mongoose.connection.db;
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'));
  const counts = {};

  for (const name of collections) {
    const out = fs.createWriteStream(path.join(dir, `${name}.jsonl`));
    let n = 0;
    for await (const doc of db.collection(name).find({})) {
      if (!out.write(`${toLine(doc)}\n`)) await new Promise((resolve) => out.once('drain', resolve));
      n += 1;
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
    counts[name] = n;
    console.log(`  ${name}: ${n} documents`);
  }

  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), database: db.databaseName, collections: counts }, null, 2)
  );
  console.log(`\nBackup saved to: ${dir}`);
  console.log('It contains patient data. Keep it private and encrypted, and do not put it in git.');
}

main()
  .catch((err) => {
    console.error('Backup failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
