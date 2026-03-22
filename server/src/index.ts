import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import scraperRoutes from './routes/scraper.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware, loginHandler, authCheckHandler, logoutHandler } from './middleware/auth.js';
import { securityHeaders } from './middleware/security-headers.js';
import { apiRateLimit } from './middleware/rate-limit.js';
import { getConfiguredBanks } from './config/credentials.js';
import { schedulerService } from './services/scheduler-service.js';
import { databaseService } from './services/db-service.js';
import { gcsBackupService } from './services/gcs-backup.js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SERVER_PORT = parseInt(process.env.PORT || process.env.SERVER_PORT || '3001', 10);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const STATIC_DIR = process.env.STATIC_DIR || path.resolve(__dirname, '../public');

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();

app.set('trust proxy', true);
app.use(securityHeaders);
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Static files (public — served before auth)
app.use(express.static(STATIC_DIR));

// Auth routes (public — before auth middleware)
app.post('/api/auth/login', loginHandler);
app.get('/api/auth/check', authCheckHandler);
app.post('/api/auth/logout', logoutHandler);

// Rate limiting + auth middleware (protects API routes)
app.use('/api', apiRateLimit);
app.use('/api', authMiddleware);

// API routes
app.use(scraperRoutes);

// SPA fallback — serves index.html for client-side routing
app.get('*', (_req, res, next) => {
  const indexPath = path.join(STATIC_DIR, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

// Error handler (must be registered last)
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Database (restore from GCS if configured, then init)
// ---------------------------------------------------------------------------
await gcsBackupService.downloadDb();
databaseService.init();

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const server = app.listen(SERVER_PORT, () => {
  const configuredBanks = getConfiguredBanks();
  console.log(`[fin-dash-server] Listening on http://localhost:${SERVER_PORT}`);
  console.log(`[fin-dash-server] CORS origin: ${CLIENT_ORIGIN}`);
  console.log(
    `[fin-dash-server] Configured banks (${configuredBanks.length}): ${configuredBanks.length > 0 ? configuredBanks.join(', ') : 'none'}`,
  );

  // Start the scheduled scraper
  const status = schedulerService.getStatus();
  console.log(
    `[fin-dash-server] Scheduler: enabled=${status.enabled}, cron="${status.cronExpression}"`,
  );
  schedulerService.start();
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
// Order: stop scheduler (no new scrape jobs) -> stop HTTP server (drain
// in-flight requests) -> close database (safe after all handlers finish).
function gracefulShutdown(signal: string): void {
  console.log(`[fin-dash-server] Received ${signal}, shutting down gracefully...`);
  schedulerService.stop();
  server.close(async () => {
    console.log('[fin-dash-server] HTTP server closed');
    await gcsBackupService.uploadDb();
    databaseService.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
