# Backups for the clinic database

Patient records only exist in the database (MongoDB Atlas). If the database is lost, damaged or wrongly edited and there is no backup, the data is gone. This page says what to switch on and how to check that it works.

## 1. What your Atlas plan gives you (check once)

Open MongoDB Atlas -> your cluster. Note the tier shown on the cluster card, then:

| Tier | Backups |
| --- | --- |
| **Free (M0)** | **No Atlas backups.** You must make your own (section 2). Free clusters are also paused after 30 days without use. |
| **Flex** | Daily snapshots, switched on automatically and cannot be switched off. Check the *Backup* tab for how long they are kept. |
| **M10 or bigger** | *Cloud Backup* - switch it on (cluster -> Edit configuration -> Turn on Cloud Backup). Optional: continuous backup (restore to any minute) and copies in a second region. |

For a clinic with real patient data, use **Flex or M10+**, not Free. (Atlas plans and prices change - check the Atlas pricing page before deciding.)

## 2. Your own copy (works on every tier, also on Free)

From the `kildare-clinic-backend` folder:

```bash
npm run backup
```

This reads the database named in `.env` and saves a folder `backups/<date-time>/` with one file per collection and a `manifest.json` that lists how many documents each had. It does not change the database.

- The backup contains **patient data and password hashes**. Keep it private: an encrypted drive or an encrypted cloud folder, never email, never git (`backups/` is already ignored by git).
- Do it **at least weekly**, and before any big change (a new version going live, a data clean-up).
- Keep several copies (for example the last 4 weeks), not only the newest.

## 3. Test a restore - a backup you have never restored is only a hope

Use a **new, empty** database (a different name on the same cluster is fine, e.g. `kildare-restore-test`):

```bash
RESTORE_MONGODB_URI="mongodb+srv://USER:PASS@CLUSTER.mongodb.net/kildare-restore-test" node src/scripts/restoreDb.js backups/2026-10-22T10-30-00Z
```

(Windows PowerShell: `$env:RESTORE_MONGODB_URI="..."; node src/scripts/restoreDb.js backups/<folder>`.)

The script refuses to touch a collection that already has data and refuses to run if the address is the live `MONGODB_URI`. When it finishes, point a local copy of the app at the restore database and check a few patients, reports and invoices. Then delete the test database.

## 4. If something goes wrong in the live system

1. Stop making changes (ask staff to stop entering data).
2. Atlas snapshot (Flex / M10+): Cluster -> *Backup* -> pick a snapshot -> *Restore*. Restoring overwrites the target cluster and writes are blocked while it runs, so restore into a **new** cluster first, check it, then switch the app's `MONGODB_URI` to it.
3. Own copy: restore into a new empty database (section 3) and switch `MONGODB_URI` to it.
4. Note what was lost between the backup time and now, and re-enter it.

## 5. Other things to keep safe

- The `.env` values (`MONGODB_URI`, `JWT_SECRET`) - store them in a password manager. Without `JWT_SECRET` nobody stays signed in.
- The audit log is part of the database and is included in every backup.
## 6. Vercel note

`npm run backup` runs on **your computer**, not on Vercel (Vercel cannot keep files). Run it from the `kildare-clinic-backend` folder with the live `MONGODB_URI` in your local `.env`.