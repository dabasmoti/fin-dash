// ---------------------------------------------------------------------------
// GCS Backup Service — persists SQLite DB to Cloud Storage for Cloud Run
// ---------------------------------------------------------------------------
// When GCS_BUCKET is not set (local dev), all operations are no-ops.
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const GCS_BUCKET = process.env.GCS_BUCKET || '';
const GCS_OBJECT = 'fin-dash.db';

const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'fin-dash.db');

// ---------------------------------------------------------------------------
// Lazy-load @google-cloud/storage only when GCS_BUCKET is configured.
// This avoids import errors in local dev where the package may not be installed.
// ---------------------------------------------------------------------------

async function getStorage() {
  const { Storage } = await import('@google-cloud/storage');
  return new Storage();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

class GcsBackupService {
  private get enabled(): boolean {
    return GCS_BUCKET.length > 0;
  }

  /**
   * Downloads the SQLite database from GCS to the local DB_PATH.
   * Called on server startup before databaseService.init().
   * No-op if GCS_BUCKET is not set or the file does not exist in GCS.
   */
  async downloadDb(): Promise<void> {
    if (!this.enabled) return;

    try {
      const storage = await getStorage();
      const bucket = storage.bucket(GCS_BUCKET);
      const file = bucket.file(GCS_OBJECT);

      const [exists] = await file.exists();
      if (!exists) {
        console.log('[gcs-backup] No existing backup found in GCS — starting fresh');
        return;
      }

      // Ensure the directory exists
      const dir = path.dirname(DB_PATH);
      fs.mkdirSync(dir, { recursive: true });

      await file.download({ destination: DB_PATH });
      console.log(`[gcs-backup] Downloaded database from gs://${GCS_BUCKET}/${GCS_OBJECT}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[gcs-backup] Download failed (will start with empty DB): ${message}`);
    }
  }

  /**
   * Uploads the local SQLite database to GCS.
   * Runs WAL checkpoint first to fold WAL into the main DB file.
   * Called after each successful scrape persist and on graceful shutdown.
   * No-op if GCS_BUCKET is not set or the DB file does not exist.
   */
  async uploadDb(): Promise<void> {
    if (!this.enabled) return;

    if (!fs.existsSync(DB_PATH)) {
      console.warn('[gcs-backup] Upload skipped — database file does not exist');
      return;
    }

    try {
      // Checkpoint WAL to produce a single clean .db file
      this.checkpointWal();

      const storage = await getStorage();
      const bucket = storage.bucket(GCS_BUCKET);

      await bucket.upload(DB_PATH, {
        destination: GCS_OBJECT,
        resumable: false,
      });

      console.log(`[gcs-backup] Uploaded database to gs://${GCS_BUCKET}/${GCS_OBJECT}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[gcs-backup] Upload failed: ${message}`);
    }
  }

  /**
   * Returns the last modified time of the GCS backup file.
   */
  async getLastUpdated(): Promise<string | null> {
    if (!this.enabled) return null;

    try {
      const storage = await getStorage();
      const bucket = storage.bucket(GCS_BUCKET);
      const file = bucket.file(GCS_OBJECT);
      const [metadata] = await file.getMetadata();
      return metadata.updated as string || null;
    } catch {
      return null;
    }
  }

  /**
   * Folds WAL journal back into the main database file.
   * Uses a separate connection to avoid interfering with the main db-service.
   */
  private checkpointWal(): void {
    try {
      const db = new Database(DB_PATH, { readonly: false });
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[gcs-backup] WAL checkpoint failed (non-fatal): ${message}`);
    }
  }
}

export const gcsBackupService = new GcsBackupService();
