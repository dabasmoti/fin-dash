import type { Request, Response, NextFunction } from 'express';

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60; // 60 requests per minute per IP
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const requestCounts = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts) {
    if (now - entry.windowStart > WINDOW_MS) {
      requestCounts.delete(ip);
    }
  }
  // Hard cap to prevent memory exhaustion
  if (requestCounts.size > 10000) {
    requestCounts.clear();
  }
}, CLEANUP_INTERVAL_MS).unref();

export function apiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = requestCounts.get(ip);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    requestCounts.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({ success: false, error: 'Too many requests' });
    return;
  }

  next();
}
