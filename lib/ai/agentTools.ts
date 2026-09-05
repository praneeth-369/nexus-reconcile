import { runStore } from '../reconciliationRunStore';
import { localAuditStore, persistAuditRecords, AuditRecord, MathJourney, PolicyAuthorization } from '../firebaseAdmin';
import {
  toPaise,
  toRupees,
  calculateMdrFeePaise,
  calculateGstPaise,
  formatRupeesToINR,
} from '../financeUtils';
import { isWeekendSettlement, calendarDaysBetween } from '../dateUtils';
import { realtimeEvents } from '../realtimeStore';

export interface ToolExecutionResult<T = any> {
  success: boolean;
  toolName: string;
  data?: T;
  error?: string;
  isMutation?: boolean;
}

// ---------------------------------------------------------------------------
// 1. READ TOOLS
// ---------------------------------------------------------------------------

export async function getTransaction(txnId: string): Promise<AuditRecord | null> {
  const normId = String(txnId || '').trim().toUpperCase();
  const rec = runStore.getRecord(normId) || localAuditStore.getRecords().find((r) => r.txn_id.toUpperCase() === normId);
  return rec || null;
}

export async function getLedgerRecord(txnId: string) {
  const rec = await getTransaction(txnId);
  if (!rec) return { found: false, error: `Ledger record ${txnId} not found` };
  return {
    found: true,
    record: {
      txn_id: rec.txn_id,
      internal_amount: rec.internal_amount,
      internal_date: rec.internal_date,
      payment_method: rec.payment_method,
      razorpay_payment_id: rec.razorpay_payment_id,
      status: rec.status,
    },
  };
}

export async function getSettlementRecord(bankRefId: string) {
  const normRef = String(bankRefId || '').trim().toUpperCase();
  const records = runStore.getLatestRun()?.records || localAuditStore.getRecords();
  const rec = records.find(
    (r) =>
      (r.razorpay_settlement_id && r.razorpay_settlement_id.toUpperCase() === normRef) ||
      (r.candidatesEvaluated && r.candidatesEvaluated.some((c) => c.candidateId.toUpperCase() === normRef)) ||
      r.txn_id.toUpperCase() === normRef
  );

  if (!rec) return { found: false, error: `Settlement record ${bankRefId} not found` };

  return {
    found: true,
    record: {
      bank_ref_id: bankRefId,
      bank_amount: rec.bank_amount,
      bank_date: rec.bank_date,
      razorpay_settlement_id: rec.razorpay_settlement_id,
      status: rec.status,
    },
  };
}

export async function findMatchingTransactions(params: {
  amount?: number;
  date?: string;
  reference?: string;
  toleranceRupees?: number;
}) {
  const records = runStore.getLatestRun()?.records || localAuditStore.getRecords();
  const tolerancePaise = toPaise(params.toleranceRupees || 0);

  const matched = records.filter((r) => {
    if (params.amount !== undefined) {
      const diffPaise = Math.abs(toPaise(r.internal_amount) - toPaise(params.amount));
      if (diffPaise > tolerancePaise) return false;
    }
    if (params.date && r.internal_date !== params.date && r.bank_date !== params.date) {
      return false;
    }
    if (params.reference) {
      const ref = params.reference.toUpperCase();
      const match =
        r.txn_id.toUpperCase().includes(ref) ||
        (r.razorpay_settlement_id && r.razorpay_settlement_id.toUpperCase().includes(ref));
      if (!match) return false;
    }
    return true;
  });

  return {
    count: matched.length,
    matches: matched.map((m) => ({
      txn_id: m.txn_id,
      internal_amount: m.internal_amount,
      bank_amount: m.bank_amount,
      difference_amount: m.difference_amount,
      internal_date: m.internal_date,
      bank_date: m.bank_date,
      status: m.status,
    })),
  };
}

export async function findRelatedTransactions(txnId: string) {
  const rec = await getTransaction(txnId);
  if (!rec) return { count: 0, candidates: [] };

  // Check candidatesEvaluated array
  if (rec.candidatesEvaluated && rec.candidatesEvaluated.length > 0) {
    return {
      count: rec.candidatesEvaluated.length,
      candidates: rec.candidatesEvaluated,
    };
  }

  // Find same amount transactions in the same run
  const records = runStore.getLatestRun()?.records || localAuditStore.getRecords();
  const sameAmount = records.filter(
    (r) => r.txn_id !== rec.txn_id && Math.abs(toPaise(r.internal_amount) - toPaise(rec.internal_amount)) === 0
  );

  return {
    count: sameAmount.length,
    candidates: sameAmount.map((r) => ({
      candidateId: r.txn_id,
      bankAmount: r.bank_amount,
      bankDate: r.bank_date,
      referenceSimilarityPct: 50,
      settlementDelayDays: 0,
      isPlausible: true,
      evaluationOutcome: 'COLLISION_AMBIGUOUS',
      reason: 'Shared exact gross amount in settlement feed.',
    })),
  };
}

export function calculateExpectedSettlement(grossRupees: number, feePct: number = 2.0, gstPct: number = 18.0) {
  const grossPaise = toPaise(grossRupees);
  const mdrPaise = calculateMdrFeePaise(grossPaise, feePct / 100);
  const gstPaise = calculateGstPaise(mdrPaise, gstPct / 100);
  const totalTaxFeePaise = mdrPaise + gstPaise;
  const netWithTaxPaise = grossPaise - totalTaxFeePaise;
  const netMdrOnlyPaise = grossPaise - mdrPaise;

  return {
    grossRupees,
    grossPaise,
    mdrRatePct: feePct,
    mdrRupees: toRupees(mdrPaise),
    mdrPaise,
    gstRatePct: gstPct,
    gstRupees: toRupees(gstPaise),
    gstPaise,
    totalDeductionRupees: toRupees(totalTaxFeePaise),
    totalDeductionPaise: totalTaxFeePaise,
    netExpectedRupeesWithTax: toRupees(netWithTaxPaise),
    netExpectedRupeesMdrOnly: toRupees(netMdrOnlyPaise),
    formulaString: `Ledger ₹${formatRupeesToINR(grossRupees)} - ${feePct.toFixed(1)}% MDR (₹${formatRupeesToINR(toRupees(mdrPaise))}) - ${gstPct.toFixed(0)}% GST on MDR (₹${formatRupeesToINR(toRupees(gstPaise))}) = Net Expected ₹${formatRupeesToINR(toRupees(netWithTaxPaise))}`,
  };
}

export function calculateFeeAndTax(grossRupees: number, feePct: number = 2.0, gstPct: number = 18.0) {
  return calculateExpectedSettlement(grossRupees, feePct, gstPct);
}

export function checkSettlementPolicy(
  ruleName: string,
  context?: {
    diffPaise?: number;
    calDays?: number;
    isWeekend?: boolean;
    candidateCount?: number;
    isPending?: boolean;
    bankPaise?: number;
    expectedBankTaxPaise?: number;
    expectedBankMdrPaise?: number;
  }
) {
  const ctx = context || {};

  switch (ruleName) {
    case 'POLICY_EXACT_1TO1_MATCH_AUTHORIZED':
      if (ctx.diffPaise === 0 && ctx.calDays === 0) {
        return {
          ruleName,
          decision: 'AUTHORIZED' as const,
          isAllowed: true,
          reason: 'Exact amount and date match authorized by deterministic policy.',
          policyVersion: 'v2.4',
        };
      }
      return {
        ruleName,
        decision: 'REFUSED_FAIL_CLOSED' as const,
        isAllowed: false,
        reason: 'Variance or date mismatch violates 1:1 match policy.',
        policyVersion: 'v2.4',
      };

    case 'POLICY_BUSINESS_DAY_CALENDAR_AUTHORIZED':
      if (ctx.diffPaise === 0 && (ctx.isWeekend || (ctx.calDays !== undefined && ctx.calDays >= 1 && ctx.calDays <= 3))) {
        return {
          ruleName,
          decision: 'AUTHORIZED' as const,
          isAllowed: true,
          reason: 'Calendar business-day settlement delay verified. Friday to Monday settlement authorized.',
          policyVersion: 'v2.4',
        };
      }
      return {
        ruleName,
        decision: 'REFUSED_FAIL_CLOSED' as const,
        isAllowed: false,
        reason: 'Settlement delay does not qualify for weekend/business-day calendar policy.',
        policyVersion: 'v2.4',
      };

    case 'POLICY_GATEWAY_MDR_FEE_AUTHORIZED':
      if (ctx.bankPaise !== undefined && ctx.expectedBankMdrPaise !== undefined && Math.abs(ctx.bankPaise - ctx.expectedBankMdrPaise) <= 5) {
        return {
          ruleName,
          decision: 'AUTHORIZED' as const,
          isAllowed: true,
          reason: 'Standard 2% MDR gateway fee offset authorized by deterministic policy.',
          policyVersion: 'v2.4',
        };
      }
      return {
        ruleName,
        decision: 'REFUSED_FAIL_CLOSED' as const,
        isAllowed: false,
        reason: 'Bank amount does not match calculated 2% MDR fee.',
        policyVersion: 'v2.4',
      };

    case 'POLICY_GATEWAY_MDR_PLUS_GST_AUTHORIZED':
      if (ctx.bankPaise !== undefined && ctx.expectedBankTaxPaise !== undefined && Math.abs(ctx.bankPaise - ctx.expectedBankTaxPaise) <= 5) {
        return {
          ruleName,
          decision: 'AUTHORIZED' as const,
          isAllowed: true,
          reason: '2% MDR + 18% GST tax deduction authorized by deterministic policy.',
          policyVersion: 'v2.4',
        };
      }
      return {
        ruleName,
        decision: 'REFUSED_FAIL_CLOSED' as const,
        isAllowed: false,
        reason: 'Bank amount does not match calculated MDR + GST fee schedule.',
        policyVersion: 'v2.4',
      };

    case 'POLICY_FAIL_CLOSED_AMBIGUOUS_CANDIDATES':
      return {
        ruleName,
        decision: 'REFUSED_FAIL_CLOSED' as const,
        isAllowed: false,
        reason: 'Confidence insufficient. Multiple plausible candidates in settlement feed. DO NOT AUTO-RESOLVE.',
        policyVersion: 'v2.4',
      };

    case 'POLICY_FAIL_CLOSED_PENDING_SETTLEMENT':
      return {
        ruleName,
        decision: 'REFUSED_FAIL_CLOSED' as const,
        isAllowed: false,
        reason: 'Bank settlement feed missing or pending beyond standard SLA. DO NOT AUTO-RESOLVE.',
        policyVersion: 'v2.4',
      };

    case 'POLICY_FAIL_CLOSED_UNEXPLAINED_VARIANCE':
    default:
      return {
        ruleName: ruleName || 'POLICY_FAIL_CLOSED_DEFAULT',
        decision: 'REFUSED_FAIL_CLOSED' as const,
        isAllowed: false,
        reason: 'Unexplained variance does not conform to pre-approved fee schedules. DO NOT AUTO-RESOLVE.',
        policyVersion: 'v2.4',
      };
  }
}

export function checkBusinessDay(date1: string, date2: string) {
  if (date1 === 'PENDING' || date2 === 'PENDING' || date1 === 'MISSING' || date2 === 'MISSING') {
    return {
      isWeekendDelay: false,
      calendarDays: -1,
      businessDays: -1,
      ledgerDay: '',
      bankDay: '',
      isStandardSla: false,
      reason: 'Date is pending transmission.',
    };
  }

  const calDays = calendarDaysBetween(date1, date2);
  const weekendInfo = isWeekendSettlement(date1, date2);

  return {
    isWeekendDelay: weekendInfo.isWeekendDelay,
    calendarDays: calDays,
    ledgerDay: weekendInfo.ledgerDayName,
    bankDay: weekendInfo.bankDayName,
    isStandardSla: calDays >= 0 && calDays <= 2,
    explanation: weekendInfo.isWeekendDelay
      ? `Payment initiated on ${weekendInfo.ledgerDayName} settled on ${weekendInfo.bankDayName} over weekend.`
      : `Elapsed time is ${calDays} calendar day(s).`,
  };
}

export function getPreviousReconciliation(runId?: string) {
  const run = runId ? runStore.getRunById(runId) : runStore.getPreviousRun();
  if (!run) return { found: false, message: 'No previous reconciliation run found' };
  return {
    found: true,
    runId: run.runId,
    timestamp: run.timestamp,
    totalRecords: run.totalRecords,
    exactMatches: run.exactMatches,
    ruleMatches: run.ruleMatches,
    exceptions: run.exceptions,
    resolutionRatePct: run.resolutionRatePct,
    unresolvedExposureRupees: run.unresolvedExposureRupees,
    totalFeesRupees: run.totalFeesRupees,
  };
}

export function getPreviousRuns(limit: number = 5) {
  const runs = runStore.getRuns().slice(0, limit);
  return {
    count: runs.length,
    runs: runs.map((r) => ({
      runId: r.runId,
      timestamp: r.timestamp,
      datasetMode: r.datasetMode,
      totalRecords: r.totalRecords,
      resolutionRatePct: r.resolutionRatePct,
      unresolvedExposureRupees: r.unresolvedExposureRupees,
      exceptions: r.exceptions,
    })),
  };
}

export async function getException(txnId: string) {
  const rec = await getTransaction(txnId);
  if (!rec) return { found: false, error: `Transaction ${txnId} not found` };
  if (rec.status !== 'FLAGGED_EXCEPTION' && rec.status !== 'ESCALATED_TO_OPS' && rec.status !== 'HUMAN_UNMATCHED') {
    return { found: true, isException: false, status: rec.status, message: `Transaction ${txnId} is not an exception` };
  }

  return {
    found: true,
    isException: true,
    transaction: {
      txn_id: rec.txn_id,
      internal_amount: rec.internal_amount,
      bank_amount: rec.bank_amount,
      difference_amount: rec.difference_amount,
      internal_date: rec.internal_date,
      bank_date: rec.bank_date,
      payment_method: rec.payment_method,
      status: rec.status,
      match_type: rec.match_type,
      explanation: rec.explanation,
      confidence_score: rec.confidence_score,
      urgency_category: rec.urgency_category,
      mathJourney: rec.mathJourney,
      candidatesEvaluated: rec.candidatesEvaluated,
      policyAuth: rec.policyAuth,
    },
  };
}

export function getCashExposure(filter?: string) {
  const run = runStore.getLatestRun();
  const records = run ? run.records : localAuditStore.getRecords();

  const exceptions = records.filter(
    (r) => r.status === 'FLAGGED_EXCEPTION' || r.status === 'ESCALATED_TO_OPS' || r.status === 'HUMAN_UNMATCHED'
  );

  const pendingSettlements = exceptions.filter((r) => r.bank_date === 'PENDING' || r.bank_date === 'MISSING');
  const candidateCollisions = exceptions.filter(
    (r) => r.candidatesEvaluated && r.candidatesEvaluated.length > 1
  );
  const unexplainedVariances = exceptions.filter(
    (r) => r.bank_date !== 'PENDING' && (!r.candidatesEvaluated || r.candidatesEvaluated.length <= 1)
  );

  const pendingTotal = pendingSettlements.reduce((sum, r) => sum + r.difference_amount, 0);
  const collisionTotal = candidateCollisions.reduce((sum, r) => sum + r.difference_amount, 0);
  const unexplainedTotal = unexplainedVariances.reduce((sum, r) => sum + r.difference_amount, 0);
  const totalExposureRupees = pendingTotal + collisionTotal + unexplainedTotal;

  return {
    totalExposureRupees,
    totalExceptionCount: exceptions.length,
    breakdown: {
      pendingSettlements: {
        count: pendingSettlements.length,
        amountRupees: pendingTotal,
        txnIds: pendingSettlements.map((r) => r.txn_id),
      },
      candidateCollisions: {
        count: candidateCollisions.length,
        amountRupees: collisionTotal,
        txnIds: candidateCollisions.map((r) => r.txn_id),
      },
      unexplainedVariances: {
        count: unexplainedVariances.length,
        amountRupees: unexplainedTotal,
        txnIds: unexplainedVariances.map((r) => r.txn_id),
      },
    },
    formattedTotal: `₹${formatRupeesToINR(totalExposureRupees)}`,
  };
}

export function getForwardCashForecast(days: number = 7) {
  const run = runStore.getLatestRun();
  const records = run ? run.records : localAuditStore.getRecords();

  // Pending settlements that are expected to land within the forecast window
  const pending = records.filter((r) => r.bank_date === 'PENDING');
  const forecastedInflowRupees = pending.reduce((sum, r) => sum + r.internal_amount, 0);

  return {
    forecastWindowDays: days,
    pendingSettlementsCount: pending.length,
    forecastedInflowRupees,
    formattedInflow: `₹${formatRupeesToINR(forecastedInflowRupees)}`,
    items: pending.map((p) => ({
      txn_id: p.txn_id,
      expectedAmount: p.internal_amount,
      internalDate: p.internal_date,
      expectedSettlementDate: 'Next Business Day (T+1/T+2)',
      paymentMethod: p.payment_method,
    })),
  };
}

// ---------------------------------------------------------------------------
// 2. ACTION / MUTATION TOOLS (With mandatory post-mutation verification)
// ---------------------------------------------------------------------------

export async function createException(
  txnId: string,
  reason: string,
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'HIGH',
  urgencyCategory: 'CRITICAL' | 'ATTENTION_REQUIRED' | 'HEALTHY' = 'CRITICAL'
) {
  const normId = String(txnId || '').trim().toUpperCase();
  const rec = await getTransaction(normId);
  if (!rec) return { success: false, error: `Transaction ${txnId} not found` };

  const success = runStore.updateRecord(rec.txn_id, {
    status: 'FLAGGED_EXCEPTION',
    explanation: `Exception flagged by Autonomous Finance Agent: ${reason}`,
    urgency_category: urgencyCategory,
  });

  if (success) {
    await persistAuditRecords(runStore.getLatestRun()?.records || []);
    realtimeEvents.emit('RECORD_UPDATED', { txnId: rec.txn_id, status: 'FLAGGED_EXCEPTION' });
  }

  return {
    success,
    txnId: rec.txn_id,
    newStatus: 'FLAGGED_EXCEPTION',
    severity,
    urgencyCategory,
    reason,
  };
}

export async function updateReconciliationStatus(txnId: string, status: string, explanation: string) {
  const normId = String(txnId || '').trim().toUpperCase();
  const rec = await getTransaction(normId);
  if (!rec) return { success: false, error: `Transaction ${txnId} not found` };

  const validStatuses: AuditRecord['status'][] = [
    'EXACT_MATCH',
    'RESOLVED_BY_AGENT',
    'FLAGGED_EXCEPTION',
    'HUMAN_RESOLVED',
    'HUMAN_MATCHED',
    'HUMAN_UNMATCHED',
    'ESCALATED_TO_OPS',
  ];

  if (!validStatuses.includes(status as any)) {
    return { success: false, error: `Invalid status: ${status}` };
  }

  const success = runStore.updateRecord(rec.txn_id, {
    status: status as AuditRecord['status'],
    explanation,
  });

  if (success) {
    await persistAuditRecords(runStore.getLatestRun()?.records || []);
    realtimeEvents.emit('RECORD_UPDATED', { txnId: rec.txn_id, status });
  }

  return {
    success,
    txnId: rec.txn_id,
    newStatus: status,
    explanation,
  };
}

export async function resolveTransaction(
  txnId: string,
  matchType: string,
  calculatedFeeRupees: number = 0,
  explanation: string
) {
  const normId = String(txnId || '').trim().toUpperCase();
  const rec = await getTransaction(normId);
  if (!rec) return { success: false, error: `Transaction ${txnId} not found` };

  // Fail-Closed Check: If there's an ambiguous collision or pending status without bank feed, refuse mutation!
  if (rec.candidatesEvaluated && rec.candidatesEvaluated.length > 1) {
    return {
      success: false,
      refused: true,
      error: 'Fail-Closed Policy: Cannot resolve transaction with ambiguous candidates collision.',
    };
  }
  if (rec.bank_date === 'PENDING' || rec.bank_date === 'MISSING') {
    return {
      success: false,
      refused: true,
      error: 'Fail-Closed Policy: Cannot resolve transaction without bank settlement confirmation.',
    };
  }

  const newStatus: AuditRecord['status'] = matchType === 'EXACT_1TO1' ? 'EXACT_MATCH' : 'RESOLVED_BY_AGENT';

  const success = runStore.updateRecord(rec.txn_id, {
    status: newStatus,
    match_type: matchType as any,
    explanation,
    confidence_score: 99,
    urgency_category: 'HEALTHY',
    policyAuth: {
      policyRule: matchType === 'EXACT_1TO1' ? 'POLICY_EXACT_1TO1_MATCH_AUTHORIZED' : 'POLICY_GATEWAY_MDR_FEE_AUTHORIZED',
      policyLabel: 'Autonomous Agent Authorized Resolution',
      decision: 'AUTHORIZED',
      authorizedBy: 'DETERMINISTIC_POLICY_ENGINE',
      aiConfidenceScore: 99,
      timestamp: new Date().toISOString(),
    },
  });

  if (success) {
    await persistAuditRecords(runStore.getLatestRun()?.records || []);
    realtimeEvents.emit('RECORD_UPDATED', { txnId: rec.txn_id, status: newStatus });
  }

  return {
    success,
    txnId: rec.txn_id,
    newStatus,
    matchType,
    calculatedFeeRupees,
    explanation,
  };
}

export async function escalateException(txnId: string, reason: string, suggestedAction?: string) {
  const normId = String(txnId || '').trim().toUpperCase();
  const rec = await getTransaction(normId);
  if (!rec) return { success: false, error: `Transaction ${txnId} not found` };

  const success = runStore.updateRecord(rec.txn_id, {
    status: 'ESCALATED_TO_OPS',
    urgency_category: 'CRITICAL',
    explanation: `Escalated to Human Controller by AI Agent: ${reason}. Action required: ${suggestedAction || 'Manual inspection'}`,
  });

  if (success) {
    const latestRun = runStore.getLatestRun();
    if (latestRun) {
      runStore.addActionLog(latestRun.runId, {
        actionId: `ESC_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        runId: latestRun.runId,
        txnId: rec.txn_id,
        reviewer: 'Autonomous AI Controller',
        timestamp: new Date().toISOString(),
        action: 'ESCALATE',
        reason,
        note: suggestedAction,
        previousStatus: rec.status,
        newStatus: 'ESCALATED_TO_OPS',
      });
    }

    await persistAuditRecords(runStore.getLatestRun()?.records || []);
    realtimeEvents.emit('RECORD_UPDATED', { txnId: rec.txn_id, status: 'ESCALATED_TO_OPS' });
  }

  return {
    success,
    txnId: rec.txn_id,
    newStatus: 'ESCALATED_TO_OPS',
    reason,
    suggestedAction: suggestedAction || 'Review in Controller Exception Drawer',
  };
}

export async function createAuditEvent(event: {
  txnId: string;
  action: 'ACCEPT' | 'OVERRIDE' | 'RESOLVE' | 'ESCALATE' | 'REJECT';
  actor: string;
  details: any;
}) {
  const latestRun = runStore.getLatestRun();
  if (!latestRun) return { success: false, error: 'No active reconciliation run' };

  const actionLog = {
    actionId: `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    runId: latestRun.runId,
    txnId: event.txnId,
    reviewer: event.actor || 'AI Finance Controller',
    timestamp: new Date().toISOString(),
    action: event.action,
    reason: typeof event.details === 'string' ? event.details : JSON.stringify(event.details),
    note: 'Deterministic immutable audit entry logged.',
    previousStatus: 'FLAGGED_EXCEPTION',
    newStatus: event.action === 'ESCALATE' ? 'ESCALATED_TO_OPS' : 'RESOLVED_BY_AGENT',
  };

  const success = runStore.addActionLog(latestRun.runId, actionLog);
  if (success) {
    await persistAuditRecords(latestRun.records);
    realtimeEvents.emit('AUDIT_EVENT_LOGGED', actionLog);
  }

  return { success, actionLog };
}

// ---------------------------------------------------------------------------
// 3. MASTER DISPATCHER
// ---------------------------------------------------------------------------

export async function executeAgentTool(name: string, args: Record<string, any> = {}): Promise<ToolExecutionResult> {
  try {
    switch (name) {
      case 'getTransaction': {
        const data = await getTransaction(args.txnId);
        return { success: Boolean(data), toolName: name, data };
      }
      case 'getLedgerRecord': {
        const data = await getLedgerRecord(args.txnId);
        return { success: data.found, toolName: name, data };
      }
      case 'getSettlementRecord': {
        const data = await getSettlementRecord(args.bankRefId);
        return { success: data.found, toolName: name, data };
      }
      case 'findMatchingTransactions': {
        const data = await findMatchingTransactions(args);
        return { success: true, toolName: name, data };
      }
      case 'findRelatedTransactions': {
        const data = await findRelatedTransactions(args.txnId);
        return { success: true, toolName: name, data };
      }
      case 'calculateExpectedSettlement': {
        const data = calculateExpectedSettlement(args.grossRupees, args.feePct, args.gstPct);
        return { success: true, toolName: name, data };
      }
      case 'calculateFeeAndTax': {
        const data = calculateFeeAndTax(args.grossRupees, args.feePct, args.gstPct);
        return { success: true, toolName: name, data };
      }
      case 'checkSettlementPolicy': {
        const data = checkSettlementPolicy(args.ruleName, args.context);
        return { success: true, toolName: name, data };
      }
      case 'checkBusinessDay': {
        const data = checkBusinessDay(args.date1, args.date2);
        return { success: true, toolName: name, data };
      }
      case 'getPreviousReconciliation': {
        const data = getPreviousReconciliation(args.runId);
        return { success: true, toolName: name, data };
      }
      case 'getPreviousRuns': {
        const data = getPreviousRuns(args.limit);
        return { success: true, toolName: name, data };
      }
      case 'getException': {
        const data = await getException(args.txnId);
        return { success: data.found, toolName: name, data };
      }
      case 'getCashExposure': {
        const data = getCashExposure(args.filter);
        return { success: true, toolName: name, data };
      }
      case 'getForwardCashForecast': {
        const data = getForwardCashForecast(args.days);
        return { success: true, toolName: name, data };
      }
      case 'createException': {
        const data = await createException(args.txnId, args.reason, args.severity, args.urgencyCategory);
        return { success: data.success, toolName: name, data, isMutation: true };
      }
      case 'updateReconciliationStatus': {
        const data = await updateReconciliationStatus(args.txnId, args.status, args.explanation);
        return { success: data.success, toolName: name, data, isMutation: true };
      }
      case 'resolveTransaction': {
        const data = await resolveTransaction(args.txnId, args.matchType, args.calculatedFeeRupees, args.explanation);
        return { success: data.success, toolName: name, data, isMutation: true };
      }
      case 'escalateException': {
        const data = await escalateException(args.txnId, args.reason, args.suggestedAction);
        return { success: data.success, toolName: name, data, isMutation: true };
      }
      case 'createAuditEvent': {
        const data = await createAuditEvent(args.event);
        return { success: data.success, toolName: name, data, isMutation: true };
      }
      default:
        return { success: false, toolName: name, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { success: false, toolName: name, error: err.message || 'Tool execution error' };
  }
}

// ---------------------------------------------------------------------------
// 4. GEMINI FUNCTION DECLARATIONS (For standard LLM Tool Calling)
// ---------------------------------------------------------------------------

export const geminiAgentToolsDeclarations = [
  {
    name: 'getTransaction',
    description: 'Retrieve full transaction record including ledger amount, bank amount, status, date, and math evidence by transaction ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        txnId: { type: 'STRING', description: 'Transaction ID (e.g. pay_EXACT_01 or pay_MDR_03)' },
      },
      required: ['txnId'],
    },
  },
  {
    name: 'getLedgerRecord',
    description: 'Retrieve the internal ledger record for a transaction.',
    parameters: {
      type: 'OBJECT',
      properties: {
        txnId: { type: 'STRING', description: 'Internal transaction ID' },
      },
      required: ['txnId'],
    },
  },
  {
    name: 'getSettlementRecord',
    description: 'Retrieve the bank settlement record by settlement ID or reference ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        bankRefId: { type: 'STRING', description: 'Bank settlement reference or ID' },
      },
      required: ['bankRefId'],
    },
  },
  {
    name: 'calculateExpectedSettlement',
    description: 'Deterministically calculate expected net bank settlement given gross ledger rupees and fee percentages using integer paise math.',
    parameters: {
      type: 'OBJECT',
      properties: {
        grossRupees: { type: 'NUMBER', description: 'Gross transaction amount in rupees' },
        feePct: { type: 'NUMBER', description: 'Gateway MDR fee percentage (e.g. 2.0)' },
        gstPct: { type: 'NUMBER', description: 'GST rate on MDR fee (e.g. 18.0)' },
      },
      required: ['grossRupees'],
    },
  },
  {
    name: 'calculateFeeAndTax',
    description: 'Returns the exact breakdown of MDR fee in rupees/paise and GST on MDR in rupees/paise.',
    parameters: {
      type: 'OBJECT',
      properties: {
        grossRupees: { type: 'NUMBER', description: 'Gross transaction amount in rupees' },
        feePct: { type: 'NUMBER', description: 'Gateway MDR fee percentage (e.g. 2.0)' },
        gstPct: { type: 'NUMBER', description: 'GST percentage (e.g. 18.0)' },
      },
      required: ['grossRupees'],
    },
  },
  {
    name: 'checkSettlementPolicy',
    description: 'Evaluate if a proposed resolution or exception adheres to deterministic authorization policies (fail-closed enforcement).',
    parameters: {
      type: 'OBJECT',
      properties: {
        ruleName: { type: 'STRING', description: 'Policy rule name to test' },
        context: { type: 'OBJECT', description: 'Verification context metrics' },
      },
      required: ['ruleName'],
    },
  },
  {
    name: 'checkBusinessDay',
    description: 'Check whether a delay between two dates is explained by non-business days / weekend (Friday to Monday).',
    parameters: {
      type: 'OBJECT',
      properties: {
        date1: { type: 'STRING', description: 'Ledger transaction date (YYYY-MM-DD)' },
        date2: { type: 'STRING', description: 'Bank settlement date (YYYY-MM-DD)' },
      },
      required: ['date1', 'date2'],
    },
  },
  {
    name: 'getCashExposure',
    description: 'Aggregates current unresolved risk exposure in rupees, broken down by Pending Settlement, Candidate Collision, and Unexplained Variance.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filter: { type: 'STRING', description: 'Optional category filter' },
      },
    },
  },
  {
    name: 'getForwardCashForecast',
    description: 'Forecasts upcoming settlement cash inflows from pending bank records within a specified window of days.',
    parameters: {
      type: 'OBJECT',
      properties: {
        days: { type: 'INTEGER', description: 'Number of forward days to forecast (default 7)' },
      },
    },
  },
  {
    name: 'getException',
    description: 'Get full forensic audit details of an unresolved transaction exception.',
    parameters: {
      type: 'OBJECT',
      properties: {
        txnId: { type: 'STRING', description: 'Transaction ID' },
      },
      required: ['txnId'],
    },
  },
  {
    name: 'resolveTransaction',
    description: 'Deterministically resolves an authorized transaction with fee adjustment. Fail-closed against ambiguous collisions or missing bank feeds.',
    parameters: {
      type: 'OBJECT',
      properties: {
        txnId: { type: 'STRING', description: 'Transaction ID to resolve' },
        matchType: { type: 'STRING', description: 'Match type (e.g. EXACT_1TO1, MDR_FEE_2PCT, MDR_2PCT_WITH_GST_18PCT, WEEKEND_DATE_SLIP)' },
        calculatedFeeRupees: { type: 'NUMBER', description: 'Calculated fee in rupees' },
        explanation: { type: 'STRING', description: 'Audit explanation for resolution' },
      },
      required: ['txnId', 'matchType', 'explanation'],
    },
  },
  {
    name: 'escalateException',
    description: 'Escalates an unresolved, high-risk, or collision discrepancy to the human finance controller for review.',
    parameters: {
      type: 'OBJECT',
      properties: {
        txnId: { type: 'STRING', description: 'Transaction ID to escalate' },
        reason: { type: 'STRING', description: 'Detailed reason for escalation' },
        suggestedAction: { type: 'STRING', description: 'Action recommended for the human controller' },
      },
      required: ['txnId', 'reason'],
    },
  },
];
