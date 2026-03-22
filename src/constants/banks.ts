import type { BankMetadata } from '@/types/bank';

export const BANK_METADATA: BankMetadata[] = [
  { id: 'hapoalim', displayName: 'בנק הפועלים', color: '#e31e24', accountType: 'bank_account' },
  { id: 'leumi', displayName: 'בנק לאומי', color: '#00529b', accountType: 'bank_account' },
  { id: 'mizrahi', displayName: 'מזרחי טפחות', color: '#009639', accountType: 'bank_account' },
  { id: 'discount', displayName: 'בנק דיסקונט', color: '#ff6600', accountType: 'bank_account' },
  { id: 'mercantile', displayName: 'בנק מרכנתיל', color: '#003366', accountType: 'bank_account' },
  { id: 'otsarHahayal', displayName: 'אוצר החייל', color: '#004d40', accountType: 'bank_account' },
  { id: 'visaCal', displayName: 'ויזה כאל', color: '#1a1f71', accountType: 'credit_card' },
  { id: 'max', displayName: 'מקס', color: '#ff0066', accountType: 'credit_card' },
  { id: 'isracard', displayName: 'ישראכרט', color: '#0066cc', accountType: 'credit_card' },
  { id: 'amex', displayName: 'אמריקן אקספרס', color: '#006fcf', accountType: 'credit_card' },
  { id: 'union', displayName: 'בנק איגוד', color: '#7b1fa2', accountType: 'bank_account' },
  { id: 'beinleumi', displayName: 'הבינלאומי', color: '#00695c', accountType: 'bank_account' },
  { id: 'massad', displayName: 'בנק מסד', color: '#5d4037', accountType: 'bank_account' },
  { id: 'yahav', displayName: 'בנק יהב', color: '#1565c0', accountType: 'bank_account' },
  { id: 'behatsdaa', displayName: 'בהצדעה', color: '#2e7d32', accountType: 'bank_account' },
  { id: 'beyahadBishvilha', displayName: 'ביחד בשבילך', color: '#c62828', accountType: 'bank_account' },
  { id: 'oneZero', displayName: 'וואן זירו', color: '#000000', accountType: 'bank_account' },
  { id: 'pagi', displayName: 'פאגי', color: '#f57c00', accountType: 'bank_account' },
];

export function getBankMetadata(bankId: string): BankMetadata | undefined {
  return BANK_METADATA.find((bank) => bank.id === bankId);
}

export function getBankDisplayName(bankId: string): string {
  return getBankMetadata(bankId)?.displayName ?? bankId;
}

export function getBankColor(bankId: string): string {
  return getBankMetadata(bankId)?.color ?? '#6b7280';
}

export function getBankAccountType(bankId: string): 'bank_account' | 'credit_card' {
  return getBankMetadata(bankId)?.accountType ?? 'credit_card';
}
