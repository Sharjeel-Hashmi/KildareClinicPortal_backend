import dns from 'node:dns';
import mongoose from 'mongoose';

// Some ISPs/routers block MongoDB Atlas SRV DNS lookups (querySrv ECONNREFUSED).
// When running locally use public DNS servers; skipped on Vercel (VERCEL=1 is set
// automatically there, so a stray NODE_ENV in a local .env can't affect this).
if (!process.env.VERCEL) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

// Cache the connection on `global` so serverless invocations (Vercel) and
// nodemon reloads reuse one connection instead of opening a new one each time.
let cached = global.__kcMongoose;
if (!cached) cached = global.__kcMongoose = { conn: null, promise: null };

export default async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set');
  }

  if (!cached.promise) {
    mongoose.set('strictQuery', true);
    cached.promise = mongoose.connect(process.env.MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}