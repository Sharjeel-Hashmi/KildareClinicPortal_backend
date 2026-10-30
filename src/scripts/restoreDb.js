// Puts a backup made by backupDb.js into a database.
//
//   RESTORE_MONGODB_URI="mongodb+srv://.../kildare-restore-test" node src/scripts/restoreDb.js backups/2026-10-22T10-30-00Z
//
// Safety rules (so a restore can never overwrite the live data by accident):
//   - it uses RESTORE_MONGODB_URI only, never MONGODB_URI from .env
//   - it refuses to write into a collection that already contains documents
//   - it stops if RESTORE_MONGODB_URI is the same as MONGODB_URI
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import mongoose from 'mongoose';
import { fromLine } from './backupFormat.js';

async function main() {
  const folder = process.argv[2];
  const target = process.env.RESTORE_MONGODB_URI;
  if (!folder || !target) {
    throw new Error('Usage: RESTORE_MONGODB_URI="<empty target database>" node src/scripts/restoreDb.js <backup folder>');
  }
  if (process.env.MONGODB_URI && target === process.env.MONGODB_URI) {
    throw new Error('RESTORE_MONGODB_URI is the same as MONGODB_URI (the live database). Use a different, empty database.');
  }
  const dir = path.resolve(folder);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')) : [];
  if (!files.length) throw new Error(`No backup files found in ${dir}`);

  await mongoose.connect(target);
  const db = mongoose.connection.db;
  console.log(`Restoring ${files.length} collections into database "${db.databaseName}"`);

  for (const file of files) {
    const name = file.replace(/\.jsonl$/, '');
    const coll = db.collection(name);
    if ((await coll.estimatedDocumentCount()) > 0 || (await coll.findOne({}))) {
      throw new Error(`Collection "${name}" already has documents. Restore only into an empty database. Nothing more was written.`);
    }
    const lines = readline.createInterface({ input: fs.createReadStream(path.join(dir, file)), crlfDelay: Infinity });
    let batch = [];
    let n = 0;
    for await (const line of lines) {
      if (!line.trim()) continue;
      batch.push(fromLine(line));
      if (batch.length === 500) {
        await coll.insertMany(batch);
        n += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await coll.insertMany(batch);
      n += batch.length;
    }
    console.log(`  ${name}: ${n} documents`);
  }
  console.log('\nDone. Open the app against this database and check the data before relying on it.');
}

main()
  .catch((err) => {
    console.error('Restore failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
