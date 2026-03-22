// ---------------------------------------------------------------------------
// Scheduled scraping service using node-cron
// ---------------------------------------------------------------------------

import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';

import { scrapeAllBanks } from './scraper-service.js';
import type { SchedulerStatus } from '../types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MINUTES = 30;
const INITIAL_SCRAPE_DELAY_MS = 10_000;

const SCRAPE_INTERVAL_MINUTES = parseInt(
  process.env.SCRAPE_INTERVAL_MINUTES || String(DEFAULT_INTERVAL_MINUTES),
  10,
);

const SCHEDULER_ENABLED =
  (process.env.SCHEDULER_ENABLED ?? 'true').toLowerCase() === 'true';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts an interval in minutes to a cron expression.
 *
 * Examples:
 *  - 30  -> "every 30 minutes"  -> "0,30 * * * *" (simplified to "*​/30 * * * *")
 *  - 60  -> "every hour"        -> "0 * * * *" (simplified to "0 *​/1 * * *")
 *  - 120 -> "every 2 hours"     -> "0 *​/2 * * *"
 *
 * For sub-60-minute intervals we use the minute field.
 * For >= 60-minute intervals we use the hour field, running at minute 0.
 */
function intervalToCron(minutes: number): string {
  if (minutes < 1) {
    return '*/1 * * * *';
  }

  if (minutes < 60) {
    return `*/${minutes} * * * *`;
  }

  const hours = Math.floor(minutes / 60);
  return `0 */${hours} * * *`;
}

/**
 * Computes the approximate next run time given a cron expression and the
 * current time. This is a simple calculation, not a full cron parser --
 * it covers the minute-based and hour-based patterns produced by intervalToCron.
 */
function computeNextRunAt(cronExpression: string, fromDate: Date): Date {
  const parts = cronExpression.split(' ');
  const minutePart = parts[0];
  const hourPart = parts[1];

  const next = new Date(fromDate);

  if (minutePart.startsWith('*/')) {
    const interval = parseInt(minutePart.slice(2), 10);
    const currentMinute = next.getMinutes();
    const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;

    if (nextMinute >= 60) {
      next.setHours(next.getHours() + 1);
      next.setMinutes(nextMinute % 60);
    } else {
      next.setMinutes(nextMinute);
    }
    next.setSeconds(0, 0);
    return next;
  }

  if (hourPart.startsWith('*/')) {
    const interval = parseInt(hourPart.slice(2), 10);
    const currentHour = next.getHours();
    const nextHour = Math.ceil((currentHour + 1) / interval) * interval;

    next.setHours(nextHour);
    next.setMinutes(0, 0, 0);
    return next;
  }

  // Fallback: assume 30 minutes from now
  next.setMinutes(next.getMinutes() + DEFAULT_INTERVAL_MINUTES);
  next.setSeconds(0, 0);
  return next;
}

// ---------------------------------------------------------------------------
// SchedulerService
// ---------------------------------------------------------------------------

export class SchedulerService {
  private task: ScheduledTask | null = null;
  private initialTimeout: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private lastRunAt: Date | null = null;
  private lastError: string | null = null;
  private readonly cronExpression: string;
  private readonly enabled: boolean;

  constructor() {
    this.cronExpression = intervalToCron(SCRAPE_INTERVAL_MINUTES);
    this.enabled = SCHEDULER_ENABLED;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Starts the cron schedule and queues an initial scrape after a short delay.
   * Does nothing if the scheduler is disabled via SCHEDULER_ENABLED=false.
   */
  start(): void {
    if (!this.enabled) {
      console.log('[scheduler] Scheduler disabled via SCHEDULER_ENABLED=false');
      return;
    }

    console.log(
      `[scheduler] Starting with cron "${this.cronExpression}" (every ${SCRAPE_INTERVAL_MINUTES} min)`,
    );

    this.task = cron.schedule(this.cronExpression, () => {
      void this.executeScrape('scheduled');
    });

    // Run an initial scrape after a short delay so the server has time to
    // finish booting and log its startup messages first.
    this.initialTimeout = setTimeout(() => {
      void this.executeScrape('initial');
    }, INITIAL_SCRAPE_DELAY_MS);
  }

  /**
   * Stops the cron schedule and clears any pending initial scrape.
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[scheduler] Cron task stopped');
    }

    if (this.initialTimeout) {
      clearTimeout(this.initialTimeout);
      this.initialTimeout = null;
    }
  }

  /**
   * Manually triggers a scrape outside the normal schedule.
   * Returns false if a scrape is already in progress.
   */
  async trigger(): Promise<boolean> {
    if (this.isRunning) {
      console.log('[scheduler] Trigger rejected -- scrape already in progress');
      return false;
    }

    await this.executeScrape('manual');
    return true;
  }

  /**
   * Returns the current scheduler status.
   */
  getStatus(): SchedulerStatus {
    const now = new Date();
    const nextRunAt =
      this.enabled && this.task
        ? computeNextRunAt(this.cronExpression, now)
        : null;

    return {
      enabled: this.enabled,
      running: this.isRunning,
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
      cronExpression: this.cronExpression,
      lastError: this.lastError,
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  /**
   * Executes a full scrape of all configured banks with a mutex guard
   * to prevent overlapping runs. Errors are logged but never re-thrown
   * so the server stays running regardless of scraper failures.
   */
  private async executeScrape(
    trigger: 'initial' | 'scheduled' | 'manual',
  ): Promise<void> {
    if (this.isRunning) {
      console.log(
        `[scheduler] Skipping ${trigger} scrape -- already running`,
      );
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    console.log(`[scheduler] Starting ${trigger} scrape...`);

    try {
      const results = await scrapeAllBanks({ fresh: true, triggerType: trigger === 'manual' ? 'manual' : 'scheduled' });
      const durationMs = Date.now() - startTime;
      const successCount = results.filter((r) => r.result.success).length;
      const failCount = results.length - successCount;

      this.lastRunAt = new Date();
      this.lastError = null;

      console.log(
        `[scheduler] ${trigger} scrape completed in ${durationMs}ms ` +
          `(${successCount} ok, ${failCount} failed)`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      this.lastRunAt = new Date();
      this.lastError = message;

      console.error(`[scheduler] ${trigger} scrape failed: ${message}`);
    } finally {
      this.isRunning = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const schedulerService = new SchedulerService();
