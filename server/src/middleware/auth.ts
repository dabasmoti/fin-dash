import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
// Read lazily so dotenv has time to load .env before the value is captured.
// ---------------------------------------------------------------------------

function getAuthToken(): string {
  return process.env.AUTH_TOKEN || '';
}

const MAX_LOGIN_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const PUBLIC_PATHS = new Set([
  '/api/health', '/health',
  '/api/auth/login', '/auth/login',
  '/api/auth/check', '/auth/check',
  '/api/auth/logout', '/auth/logout',
]);

// ---------------------------------------------------------------------------
// Rate limiter for login endpoint (in-memory, per-IP)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  attempts: number;
  windowStart: number;
}

const loginAttempts = new Map<string, RateLimitEntry>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    return false;
  }

  return entry.attempts >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.set(ip, { attempts: 1, windowStart: now });
    return;
  }

  entry.attempts += 1;
}

// Periodically clean stale entries to prevent memory leaks
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Auth middleware — protects all routes except PUBLIC_PATHS
// ---------------------------------------------------------------------------

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (PUBLIC_PATHS.has(req.path)) {
    next();
    return;
  }

  // Allow requests without auth when AUTH_TOKEN is not configured (local dev)
  if (!getAuthToken()) {
    next();
    return;
  }

  const bearerToken = req.headers.authorization?.replace('Bearer ', '');
  const cookieToken = req.cookies?.auth_token as string | undefined;
  const token = bearerToken || cookieToken || '';

  if (safeCompare(token, getAuthToken())) {
    next();
    return;
  }

  res.status(401).json({ success: false, error: 'Unauthorized' });
}

// ---------------------------------------------------------------------------
// Login handler — POST /api/auth/login
// ---------------------------------------------------------------------------

export function loginHandler(
  req: Request,
  res: Response,
): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts. Try again later.',
    });
    return;
  }

  const { password } = req.body as { password?: string };

  const authToken = getAuthToken();
  if (!password || !authToken || !safeCompare(password, authToken)) {
    recordLoginAttempt(ip);
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('auth_token', authToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });

  res.json({ success: true, message: 'Logged in' });
}

// ---------------------------------------------------------------------------
// Auth check handler — GET /api/auth/check
// ---------------------------------------------------------------------------

export function authCheckHandler(
  req: Request,
  res: Response,
): void {
  const authToken = getAuthToken();
  if (!authToken) {
    res.json({ success: true, authenticated: true });
    return;
  }

  const bearerToken = req.headers.authorization?.replace('Bearer ', '');
  const cookieToken = req.cookies?.auth_token as string | undefined;
  const token = bearerToken || cookieToken || '';

  const authenticated = safeCompare(token, authToken);
  res.json({ success: true, authenticated });
}

// ---------------------------------------------------------------------------
// Logout handler — POST /api/auth/logout
// ---------------------------------------------------------------------------

export function logoutHandler(
  _req: Request,
  res: Response,
): void {
  res.clearCookie('auth_token', { path: '/' });
  res.json({ success: true, message: 'Logged out' });
}
