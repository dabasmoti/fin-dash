import { CompanyTypes } from 'israeli-bank-scrapers';
import type { SupportedBankId, BankRegistryEntry } from '../types.js';

// ---------------------------------------------------------------------------
// Maps each supported bank ID to its israeli-bank-scrapers CompanyTypes enum
// value, the env vars required for authentication, and a display name.
// ---------------------------------------------------------------------------
export const BANK_REGISTRY: Record<SupportedBankId, BankRegistryEntry> = {
  beinleumi: {
    companyId: CompanyTypes.beinleumi,
    displayName: 'Beinleumi (First International)',
    requiredEnvVars: ['BEINLEUMI_USERNAME', 'BEINLEUMI_PASSWORD'],
  },
  max: {
    companyId: CompanyTypes.max,
    displayName: 'Max',
    requiredEnvVars: ['MAX_USERNAME', 'MAX_PASSWORD'],
  },
  isracard: {
    companyId: CompanyTypes.isracard,
    displayName: 'Isracard',
    requiredEnvVars: ['ISRACARD_ID', 'ISRACARD_CARD6DIGITS', 'ISRACARD_PASSWORD'],
  },
  visaCal: {
    companyId: CompanyTypes.visaCal,
    displayName: 'CAL (Visa Cal)',
    requiredEnvVars: ['VISACAL_USERNAME', 'VISACAL_PASSWORD'],
  },
};

export const SUPPORTED_BANK_IDS = Object.keys(BANK_REGISTRY) as SupportedBankId[];

export function isSupportedBankId(id: string): id is SupportedBankId {
  return id in BANK_REGISTRY;
}
