// Local / traditional hosting entry. On Vercel, api/index.js is used instead.
import app from './app.js';
import connectDB from './config/db.js';

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`Kildare Clinic API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
