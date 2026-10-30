// Security pieces for the public (website) API: CORS, rate limits, cache headers, bot check.
import cors from "cors";
import rateLimit from "express-rate-limit";

const clean = (x) => x.trim().replace(/\/$/, "");

// Website origin(s) from PUBLIC_SITE_ORIGINS (comma separated). Local development origins are always allowed.
const allowedOrigins = () =>
  [...(process.env.PUBLIC_SITE_ORIGINS || "").split(","), "http://localhost:3000", "http://localhost:3001", "http://localhost:5173"]
    .map(clean)
    .filter(Boolean);

const publicCors = cors({
  // no Origin header = curl / server-to-server; unknown website origins simply get no CORS headers
  origin: (origin, callback) => callback(null, !origin || allowedOrigins().includes(origin)),
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86400,
});

const tooMany = (req, res) =>
  res.status(429).json({ message: "Too many requests. Please wait a few minutes and try again.", code: "RATE_LIMITED" });

// Limits are per IP. NOTE: on serverless hosting each instance counts on its own, so treat this as a
// speed bump; the real bot protection is Turnstile (below) and the per-email booking cap.
const limiter = (windowMs, limit) => rateLimit({ windowMs, limit, standardHeaders: "draft-7", legacyHeaders: false, handler: tooMany });

const number = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const bookingLimiter = () => limiter(60 * 60 * 1000, number(process.env.PUBLIC_BOOKING_LIMIT_PER_HOUR, 10)); // creating bookings
const tokenLimiter = () => limiter(15 * 60 * 1000, number(process.env.PUBLIC_TOKEN_LIMIT_PER_15MIN, 30)); // view / cancel by link

const noStore = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};
// Lists that rarely change can be cached briefly by the website / CDN
const cacheShort = (req, res, next) => {
  res.set("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  next();
};

// ---- Cloudflare Turnstile (off unless TURNSTILE_ENABLED=true) ----
const turnstileEnabled = () => String(process.env.TURNSTILE_ENABLED || "").toLowerCase() === "true";

async function verifyTurnstile(token, ip) {
  if (!token) return false;
  try {
    const params = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET || "", response: token });
    if (ip) params.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: params,
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("[turnstile] check failed:", err.name);
    return false; // when the check is switched on, a failed check does not let the booking through
  }
}

export { publicCors, bookingLimiter, tokenLimiter, noStore, cacheShort, turnstileEnabled, verifyTurnstile, allowedOrigins };
