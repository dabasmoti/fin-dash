// ---------------------------------------------------------------------------
// Diagnostic test script for Beinleumi (First International Bank) scraper.
// Usage: cd server && npx tsx src/test-beinleumi.ts
// ---------------------------------------------------------------------------

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createScraper, CompanyTypes } from 'israeli-bank-scrapers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OVERALL_TIMEOUT_MS = 120_000;
const SCRAPER_DEFAULT_TIMEOUT_MS = 60_000;
const MONTHS_TO_SCRAPE = 6;
const SCREENSHOT_PATH = resolve(__dirname, '..', 'beinleumi-debug.png');

config({ path: resolve(__dirname, '..', '..', '.env') });

const envUsername = process.env.BEINLEUMI_USERNAME;
const envPassword = process.env.BEINLEUMI_PASSWORD;

if (!envUsername || !envPassword) {
  console.error('Missing BEINLEUMI_USERNAME or BEINLEUMI_PASSWORD in .env');
  process.exit(1);
}

const username: string = envUsername;
const password: string = envPassword;

function buildStartDate(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - MONTHS_TO_SCRAPE);
  return date;
}

async function main(): Promise<void> {
  const overallTimer = setTimeout(() => {
    console.error(`Overall timeout of ${OVERALL_TIMEOUT_MS}ms exceeded`);
    process.exit(2);
  }, OVERALL_TIMEOUT_MS);

  try {
    console.log('[test] Starting Beinleumi scraper diagnostic test...');
    console.log(`[test] Username: ${username}`);
    console.log(`[test] defaultTimeout: ${SCRAPER_DEFAULT_TIMEOUT_MS}ms`);

    const scraper = createScraper({
      companyId: CompanyTypes.beinleumi,
      startDate: buildStartDate(),
      combineInstallments: false,
      showBrowser: false,
      defaultTimeout: SCRAPER_DEFAULT_TIMEOUT_MS,
      preparePage: async (page) => {
        // Log all console messages from the browser
        page.on('console', (msg) => {
          console.log(`[browser] ${msg.type()}: ${msg.text()}`);
        });
        // Log navigation events
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) {
            console.log(`[nav] Navigated to: ${frame.url()}`);
          }
        });
        // Log dialog events (e.g., alerts, confirms)
        page.on('dialog', async (dialog) => {
          console.log(`[dialog] ${dialog.type()}: ${dialog.message()}`);
          await dialog.accept();
        });
        // Log request errors
        page.on('requestfailed', (req) => {
          console.log(`[req-fail] ${req.url()} - ${req.failure()?.errorText}`);
        });
      },
    });

    const startTime = Date.now();
    const result = await scraper.scrape({ username, password });
    const durationMs = Date.now() - startTime;

    const accountsCount = result.accounts?.length ?? 0;
    const transactionsCount =
      result.accounts?.reduce((sum, acct) => sum + (acct.txns?.length ?? 0), 0) ?? 0;

    console.log(JSON.stringify({
      success: result.success,
      errorType: result.errorType ?? null,
      errorMessage: result.errorMessage ?? null,
      accountsCount,
      transactionsCount,
      durationMs,
    }, null, 2));

    clearTimeout(overallTimer);
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    clearTimeout(overallTimer);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[test] Error: ${message}`);
    process.exit(1);
  }
}

main();
