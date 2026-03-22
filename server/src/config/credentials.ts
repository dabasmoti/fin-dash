import type { SupportedBankId, BankCredentials } from '../types.js';
import { BANK_REGISTRY, SUPPORTED_BANK_IDS } from './bank-registry.js';

// ---------------------------------------------------------------------------
// Credential resolution from environment variables
// ---------------------------------------------------------------------------

/**
 * Returns the credential object for the given bank, reading values from
 * process.env. Throws if any required env var is missing.
 */
export function getCredentials(bankId: SupportedBankId): BankCredentials {
  switch (bankId) {
    case 'beinleumi':
      return {
        username: requireEnv('BEINLEUMI_USERNAME'),
        password: requireEnv('BEINLEUMI_PASSWORD'),
      };
    case 'max':
      return {
        username: requireEnv('MAX_USERNAME'),
        password: requireEnv('MAX_PASSWORD'),
      };
    case 'isracard':
      return {
        id: requireEnv('ISRACARD_ID'),
        card6Digits: requireEnv('ISRACARD_CARD6DIGITS'),
        password: requireEnv('ISRACARD_PASSWORD'),
      };
    case 'visaCal':
      return {
        username: requireEnv('VISACAL_USERNAME'),
        password: requireEnv('VISACAL_PASSWORD'),
      };
  }
}

/**
 * Returns an array of bank IDs whose required env vars are all present.
 */
export function getConfiguredBanks(): SupportedBankId[] {
  return SUPPORTED_BANK_IDS.filter((bankId) => validateCredentials(bankId));
}

/**
 * Checks whether all required environment variables for a bank are set
 * (non-empty).
 */
export function validateCredentials(bankId: SupportedBankId): boolean {
  const entry = BANK_REGISTRY[bankId];
  return entry.requiredEnvVars.every(
    (varName) => typeof process.env[varName] === 'string' && process.env[varName]!.length > 0,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
