import { format, parseISO } from 'date-fns';
import type { EnrichedTransaction } from '@/types/bank';

const CSV_COLUMNS = [
  'Date',
  'Description',
  'Category',
  'Amount',
  'Currency',
  'Status',
  'Type',
  'Installment',
  'Account',
  'Bank',
] as const;

const UTF8_BOM = '\uFEFF';

function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatTransactionDate(isoDate: string): string {
  return format(parseISO(isoDate), 'dd/MM/yyyy');
}

function formatInstallmentLabel(txn: EnrichedTransaction): string {
  if (txn.type === 'installments' && txn.installments) {
    return `${txn.installments.number}/${txn.installments.total}`;
  }
  return '';
}

function transactionToRow(txn: EnrichedTransaction): string {
  const fields = [
    formatTransactionDate(txn.date),
    txn.description,
    txn.category ?? '',
    String(txn.originalAmount),
    txn.originalCurrency,
    txn.status,
    txn.type,
    formatInstallmentLabel(txn),
    txn.accountNumber,
    txn.bankDisplayName,
  ];

  return fields.map(escapeCSVField).join(',');
}

function buildDefaultFilename(): string {
  const dateStamp = format(new Date(), 'yyyy-MM-dd');
  return `fin-dash-transactions-${dateStamp}.csv`;
}

/**
 * Export an array of enriched transactions to a CSV file and trigger a download.
 * Includes a UTF-8 BOM prefix for proper Hebrew display in Excel.
 */
export function exportToCSV(
  transactions: EnrichedTransaction[],
  filename?: string,
): void {
  const headerRow = CSV_COLUMNS.join(',');
  const dataRows = transactions.map(transactionToRow);
  const csvContent = UTF8_BOM + [headerRow, ...dataRows].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename ?? buildDefaultFilename();
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();

  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
