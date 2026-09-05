export interface ValidationIssue {
  type: 'ERROR' | 'WARNING';
  rowNumber?: number;
  field?: string;
  message: string;
}

export interface CsvValidationResult {
  isValid: boolean;
  ledgerRecordCount: number;
  bankRecordCount: number;
  ledgerOnlyCount: number;
  bankOnlyCount: number;
  duplicateTxnIds: string[];
  issues: ValidationIssue[];
  warningsCount: number;
  errorsCount: number;
}

export function validateReconciliationCsvs(
  ledgerRows: any[],
  bankRows: any[]
): CsvValidationResult {
  const issues: ValidationIssue[] = [];
  const ledgerTxnIds = new Set<string>();
  const bankTxnIds = new Set<string>();
  const duplicateTxnIds: string[] = [];

  if (!Array.isArray(ledgerRows) || ledgerRows.length === 0) {
    issues.push({ type: 'ERROR', message: 'Ledger CSV contains no rows or is empty.' });
  }

  if (!Array.isArray(bankRows) || bankRows.length === 0) {
    issues.push({ type: 'ERROR', message: 'Bank Settlement CSV contains no rows or is empty.' });
  }

  // Validate Ledger Rows
  (ledgerRows || []).forEach((row, index) => {
    const rowNum = index + 1;
    const rawId = row.txn_id || row.transaction_id || row.TxnID;
    const rawAmt = row.internal_amount || row.amount || row.Amount;
    const rawDate = row.internal_date || row.date || row.Date;

    if (!rawId) {
      issues.push({ type: 'ERROR', rowNumber: rowNum, field: 'txn_id', message: `Ledger Row #${rowNum} missing transaction ID.` });
    } else {
      const idStr = String(rawId).trim().toUpperCase();
      if (ledgerTxnIds.has(idStr)) {
        duplicateTxnIds.push(idStr);
        issues.push({ type: 'WARNING', rowNumber: rowNum, field: 'txn_id', message: `Duplicate Ledger Transaction ID "${idStr}".` });
      }
      ledgerTxnIds.add(idStr);
    }

    if (rawAmt === undefined || rawAmt === null || rawAmt === '') {
      issues.push({ type: 'ERROR', rowNumber: rowNum, field: 'amount', message: `Ledger Row #${rowNum} missing amount.` });
    } else {
      const amtNum = parseFloat(String(rawAmt));
      if (isNaN(amtNum)) {
        issues.push({ type: 'ERROR', rowNumber: rowNum, field: 'amount', message: `Ledger Row #${rowNum} contains non-numeric amount "${rawAmt}".` });
      } else if (amtNum <= 0) {
        issues.push({ type: 'WARNING', rowNumber: rowNum, field: 'amount', message: `Ledger Row #${rowNum} has zero or negative amount ₹${amtNum}.` });
      }
    }

    if (!rawDate) {
      issues.push({ type: 'WARNING', rowNumber: rowNum, field: 'date', message: `Ledger Row #${rowNum} missing date string.` });
    } else {
      const d = new Date(String(rawDate));
      if (isNaN(d.getTime())) {
        issues.push({ type: 'ERROR', rowNumber: rowNum, field: 'date', message: `Ledger Row #${rowNum} has invalid date format "${rawDate}".` });
      }
    }
  });

  // Validate Bank Rows
  (bankRows || []).forEach((row, index) => {
    const rowNum = index + 1;
    const rawId = row.txn_id || row.transaction_id || row.TxnID || row.bank_ref_id;
    const rawAmt = row.bank_amount || row.amount || row.Amount;

    if (rawId) {
      bankTxnIds.add(String(rawId).trim().toUpperCase());
    }

    if (rawAmt !== undefined && rawAmt !== null && rawAmt !== '') {
      const amtNum = parseFloat(String(rawAmt));
      if (isNaN(amtNum)) {
        issues.push({ type: 'ERROR', rowNumber: rowNum, field: 'bank_amount', message: `Bank Row #${rowNum} contains non-numeric amount "${rawAmt}".` });
      }
    }
  });

  // Cross-file comparison counts
  let ledgerOnlyCount = 0;
  ledgerTxnIds.forEach((id) => {
    if (!bankTxnIds.has(id)) ledgerOnlyCount++;
  });

  let bankOnlyCount = 0;
  bankTxnIds.forEach((id) => {
    if (!ledgerTxnIds.has(id)) bankOnlyCount++;
  });

  if (ledgerOnlyCount > 0) {
    issues.push({ type: 'WARNING', message: `${ledgerOnlyCount} transactions present in Ledger but missing in Bank feed.` });
  }

  if (bankOnlyCount > 0) {
    issues.push({ type: 'WARNING', message: `${bankOnlyCount} transactions present in Bank feed but missing in Internal Ledger.` });
  }

  const errorsCount = issues.filter((i) => i.type === 'ERROR').length;
  const warningsCount = issues.filter((i) => i.type === 'WARNING').length;

  return {
    isValid: errorsCount === 0,
    ledgerRecordCount: ledgerRows ? ledgerRows.length : 0,
    bankRecordCount: bankRows ? bankRows.length : 0,
    ledgerOnlyCount,
    bankOnlyCount,
    duplicateTxnIds,
    issues,
    warningsCount,
    errorsCount,
  };
}
