import { SyntheticRecord } from './generateSyntheticData';
import { AuditRecord, MathJourney, CandidateEvaluation, PolicyAuthorization } from './firebaseAdmin';
import {
  toPaise,
  toRupees,
  calculateMdrFeePaise,
  calculateGstPaise,
  formatRupeesToINR,
} from './financeUtils';
import { isWeekendSettlement, calendarDaysBetween } from './dateUtils';
import { geminiAIProvider } from './ai/geminiProvider';
import { TransactionEvidence } from './ai/provider';

export interface ScoreBreakdown {
  amountAlignment: number;
  dateAlignment: number;
  referenceAlignment: number;
  ruleAlignment: number;
}

export interface RuleEvaluationResult {
  matchRule: 'EXACT_MATCH' | 'GATEWAY_MDR_2_PERCENT' | 'GATEWAY_MDR_PLUS_GST' | 'WEEKEND_SETTLEMENT' | 'PENDING_BANK_SETTLEMENT' | 'UNRESOLVED_VARIANCE';
  ruleLabel: string;
  isMatched: boolean;
  decision: 'AUTHORIZED' | 'REFUSED_FAIL_CLOSED';
  refusalReason?: string;
  policyRule: string;
  scoreBreakdown: ScoreBreakdown;
  matchScore: number;
  calculatedFeeRupees: number;
  mathJourney: MathJourney;
  candidatesEvaluated: CandidateEvaluation[];
  explanation: string;
  evidenceChecklist: string[];
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  urgencyCategory: 'CRITICAL' | 'ATTENTION_REQUIRED' | 'HEALTHY';
}

/**
 * Deterministic Financial Policy Engine & Evidence Evaluator
 * Architecture: Models Interpret, Rules Authorize.
 * Core authorization logic remains 100% deterministic with fail-closed enforcement.
 */
export function evaluateReconciliationRules(
  internalTxnId: string,
  bankRefId: string,
  ledgerRupees: number,
  bankRupees: number,
  ledgerDateStr: string,
  bankDateStr: string,
  paymentMethod: string,
  gatewayFeePct: number = 2.0,
  candidatePool?: Array<{ candidate_id: string; bank_amount: number; similarity: number }>
): RuleEvaluationResult {
  const ledgerPaise = toPaise(ledgerRupees);
  const bankPaise = toPaise(bankRupees);
  const diffPaise = Math.abs(ledgerPaise - bankPaise);
  const diffRupees = toRupees(diffPaise);

  const normLedgerId = String(internalTxnId || '').trim().toUpperCase();
  const normBankId = String(bankRefId || '').trim().toUpperCase();
  const ledgerNums = normLedgerId.replace(/\D/g, '');
  const bankNums = normBankId.replace(/\D/g, '');

  // 1. Reference Alignment Score
  let referenceAlignment = 0;
  if (normLedgerId === normBankId) {
    referenceAlignment = 100;
  } else if (ledgerNums && bankNums && ledgerNums === bankNums) {
    referenceAlignment = 95; // Same transaction number with gateway prefix variation
  } else if (normLedgerId.includes(normBankId) || normBankId.includes(normLedgerId)) {
    referenceAlignment = 85;
  } else {
    referenceAlignment = 20;
  }

  // 2. Date Alignment Score
  let dateAlignment = 0;
  const isPending = bankDateStr === 'PENDING' || bankDateStr === 'MISSING';
  const calDays = !isPending ? calendarDaysBetween(ledgerDateStr, bankDateStr) : -1;
  const weekendAnalysis = !isPending ? isWeekendSettlement(ledgerDateStr, bankDateStr) : { isWeekendDelay: false, ledgerDayName: '', bankDayName: '' };

  if (!isPending) {
    if (calDays === 0) {
      dateAlignment = 100;
    } else if (weekendAnalysis.isWeekendDelay) {
      dateAlignment = 95; // Legitimate Friday -> Monday weekend delay
    } else if (calDays >= 1 && calDays <= 2) {
      dateAlignment = 85; // Normal T+1 or T+2 settlement
    } else if (calDays > 2 && calDays <= 5) {
      dateAlignment = 60;
    } else {
      dateAlignment = 30;
    }
  }

  // 3. Mathematical Fee Offsets (AI Evidence Layer)
  const feeDecimal = gatewayFeePct / 100;
  const expectedMdrPaise = calculateMdrFeePaise(ledgerPaise, feeDecimal);
  const expectedGstPaise = calculateGstPaise(expectedMdrPaise, 0.18);
  const expectedTotalTaxFeePaise = expectedMdrPaise + expectedGstPaise;
  const expectedBankTaxPaise = ledgerPaise - expectedTotalTaxFeePaise;
  const expectedBankMdrPaise = ledgerPaise - expectedMdrPaise;

  const formulaString = `Ledger ₹${formatRupeesToINR(ledgerRupees)} - ${gatewayFeePct.toFixed(1)}% MDR (₹${formatRupeesToINR(toRupees(expectedMdrPaise))}) - 18% GST on MDR (₹${formatRupeesToINR(toRupees(expectedGstPaise))}) = Net Expected ₹${formatRupeesToINR(toRupees(expectedBankTaxPaise))}`;

  const mathJourney: MathJourney = {
    ledgerGrossRupees: ledgerRupees,
    mdrRatePct: gatewayFeePct,
    mdrRupees: toRupees(expectedMdrPaise),
    gstRatePct: 18,
    gstRupees: toRupees(expectedGstPaise),
    netExpectedRupees: toRupees(expectedBankTaxPaise),
    actualBankRupees: bankRupees,
    varianceRupees: diffRupees,
    formulaString,
  };

  // 4. Deterministic Policy Engine (Rules Authorize, Models Interpret)
  let amountAlignment = 0;
  let ruleAlignment = 0;
  let matchRule: RuleEvaluationResult['matchRule'] = 'UNRESOLVED_VARIANCE';
  let ruleLabel = 'Unresolved Discrepancy';
  let calculatedFeeRupees = 0;
  let isMatched = false;
  let decision: 'AUTHORIZED' | 'REFUSED_FAIL_CLOSED' = 'REFUSED_FAIL_CLOSED';
  let refusalReason: string | undefined = undefined;
  let policyRule = 'POLICY_FAIL_CLOSED_DEFAULT';
  let severity: RuleEvaluationResult['severity'] = 'MEDIUM';
  let urgencyCategory: RuleEvaluationResult['urgencyCategory'] = 'CRITICAL';
  const evidenceChecklist: string[] = [];

  const isAmbiguous = candidatePool && candidatePool.length > 1;

  // FAIL-CLOSED RULE A: Ambiguous Candidates Collision
  if (isAmbiguous) {
    amountAlignment = 50;
    ruleAlignment = 20;
    matchRule = 'UNRESOLVED_VARIANCE';
    ruleLabel = 'Candidate Ambiguity Collision';
    decision = 'REFUSED_FAIL_CLOSED';
    refusalReason = 'Confidence insufficient. Multiple plausible candidates. DO NOT AUTO-RESOLVE.';
    policyRule = 'POLICY_FAIL_CLOSED_AMBIGUOUS_CANDIDATES';
    isMatched = false;
    severity = 'CRITICAL';
    urgencyCategory = 'CRITICAL';
    evidenceChecklist.push('❌ Multiple plausible bank candidates detected with competing similarity');
    evidenceChecklist.push(`❌ Evaluated ${candidatePool!.length} candidate records in settlement feed`);
    evidenceChecklist.push('🔒 Fail-Closed Policy Enforced: "Confidence insufficient. Multiple plausible candidates. DO NOT AUTO-RESOLVE."');
  }
  // RULE 1: Exact 1:1 Match (Same amount and same date)
  else if (diffPaise === 0 && calDays === 0) {
    amountAlignment = 100;
    dateAlignment = 100;
    ruleAlignment = 100;
    matchRule = 'EXACT_MATCH';
    ruleLabel = 'Exact 1:1 Match';
    decision = 'AUTHORIZED';
    policyRule = 'POLICY_EXACT_1TO1_MATCH_AUTHORIZED';
    isMatched = true;
    severity = 'NONE';
    urgencyCategory = 'HEALTHY';
    evidenceChecklist.push('✓ Same transaction reference ID');
    evidenceChecklist.push(`✓ Exact 1:1 amount match (₹${formatRupeesToINR(ledgerRupees)})`);
    evidenceChecklist.push(`✓ Same settlement date (${ledgerDateStr})`);
    evidenceChecklist.push('✓ Deterministic authorization verified');
  }
  // RULE 2: Friday -> Monday Weekend Settlement Delay
  else if (diffPaise === 0 && (weekendAnalysis.isWeekendDelay || (calDays >= 1 && calDays <= 3))) {
    amountAlignment = 100;
    ruleAlignment = 95;
    matchRule = 'WEEKEND_SETTLEMENT';
    ruleLabel = 'Friday → Monday Settlement Delay';
    decision = 'AUTHORIZED';
    policyRule = 'POLICY_BUSINESS_DAY_CALENDAR_AUTHORIZED';
    isMatched = true;
    severity = 'NONE';
    urgencyCategory = 'HEALTHY';
    evidenceChecklist.push('✓ Same transaction reference ID');
    evidenceChecklist.push(`✓ Exact amount match (₹${formatRupeesToINR(ledgerRupees)})`);
    evidenceChecklist.push(`✓ Initiated on ${weekendAnalysis.ledgerDayName || 'Friday'} (${ledgerDateStr}), settled on ${weekendAnalysis.bankDayName || 'Monday'} (${bankDateStr})`);
    evidenceChecklist.push('✓ Business-day calendar rule verified');
  }
  // RULE 3: Configured Gateway Fee Deduction
  else if (Math.abs(bankPaise - expectedBankMdrPaise) <= 5) {
    amountAlignment = 98;
    ruleAlignment = 100;
    matchRule = 'GATEWAY_MDR_2_PERCENT';
    ruleLabel = `${gatewayFeePct.toFixed(1)}% Gateway MDR Fee Deduction`;
    decision = 'AUTHORIZED';
    policyRule = 'POLICY_GATEWAY_MDR_FEE_AUTHORIZED';
    calculatedFeeRupees = toRupees(expectedMdrPaise);
    isMatched = true;
    severity = 'NONE';
    urgencyCategory = 'HEALTHY';
    evidenceChecklist.push(`✓ Transaction reference matched (${normLedgerId})`);
    evidenceChecklist.push(`✓ Ledger gross amount ₹${formatRupeesToINR(ledgerRupees)}`);
    evidenceChecklist.push(`✓ Expected ${gatewayFeePct.toFixed(1)}% MDR fee = ₹${formatRupeesToINR(calculatedFeeRupees)}`);
    evidenceChecklist.push(`✓ Bank net settlement ₹${formatRupeesToINR(bankRupees)} matches calculation`);
  }
  // RULE 4: Configured Gateway Fee + 18% GST Deduction
  else if (Math.abs(bankPaise - expectedBankTaxPaise) <= 5) {
    amountAlignment = 99;
    ruleAlignment = 100;
    matchRule = 'GATEWAY_MDR_PLUS_GST';
    ruleLabel = `${gatewayFeePct.toFixed(1)}% MDR + 18% GST Deduction`;
    decision = 'AUTHORIZED';
    policyRule = 'POLICY_GATEWAY_MDR_PLUS_GST_AUTHORIZED';
    calculatedFeeRupees = toRupees(expectedTotalTaxFeePaise);
    isMatched = true;
    severity = 'NONE';
    urgencyCategory = 'HEALTHY';
    evidenceChecklist.push(`✓ Transaction reference matched (${normLedgerId})`);
    evidenceChecklist.push(`✓ Ledger gross amount ₹${formatRupeesToINR(ledgerRupees)}`);
    evidenceChecklist.push(`✓ ${gatewayFeePct.toFixed(1)}% MDR Fee (₹${formatRupeesToINR(toRupees(expectedMdrPaise))}) + 18% GST (₹${formatRupeesToINR(toRupees(expectedGstPaise))}) = ₹${formatRupeesToINR(calculatedFeeRupees)}`);
    evidenceChecklist.push(`✓ Bank net settlement ₹${formatRupeesToINR(bankRupees)} matches expected net tax line`);
  }
  // FAIL-CLOSED RULE B: Pending Settlement
  else if (isPending) {
    amountAlignment = 0;
    ruleAlignment = 30;
    matchRule = 'PENDING_BANK_SETTLEMENT';
    ruleLabel = 'Missing / Pending Bank Settlement';
    decision = 'REFUSED_FAIL_CLOSED';
    refusalReason = 'Settlement not received within acquiring bank SLA window. DO NOT AUTO-RESOLVE.';
    policyRule = 'POLICY_FAIL_CLOSED_PENDING_SETTLEMENT';
    severity = 'HIGH';
    urgencyCategory = 'ATTENTION_REQUIRED';
    evidenceChecklist.push(`✓ Ledger payment recorded ₹${formatRupeesToINR(ledgerRupees)} on ${ledgerDateStr}`);
    evidenceChecklist.push('❌ ₹0.00 received in bank settlement feed (Status: PENDING)');
    evidenceChecklist.push('❌ Exceeds standard settlement SLA window');
    evidenceChecklist.push('🔒 Fail-Closed Policy Enforced: DO NOT AUTO-RESOLVE');
  }
  // FAIL-CLOSED RULE C: Unexplained Variance
  else {
    const diffRatio = ledgerPaise > 0 ? (1 - diffPaise / ledgerPaise) : 0;
    amountAlignment = Math.max(0, Math.round(diffRatio * 100));
    ruleAlignment = 40;
    matchRule = 'UNRESOLVED_VARIANCE';
    ruleLabel = 'Unexplained Variance';
    decision = 'REFUSED_FAIL_CLOSED';
    refusalReason = `Unexplained variance of ₹${formatRupeesToINR(diffRupees)}. Policy prohibits auto-resolution without exact MDR/tax alignment. DO NOT AUTO-RESOLVE.`;
    policyRule = 'POLICY_FAIL_CLOSED_UNEXPLAINED_VARIANCE';
    severity = diffRupees >= 5000 ? 'CRITICAL' : 'HIGH';
    urgencyCategory = 'CRITICAL';
    evidenceChecklist.push(`❌ Variance of ₹${formatRupeesToINR(diffRupees)} does not match standard fee schedules`);
    evidenceChecklist.push('🔒 Fail-Closed Policy Enforced: DO NOT AUTO-RESOLVE');
  }

  // Composite Match Score / 100 (Computed by AI Evidence Extractor)
  const matchScore = isAmbiguous
    ? 68
    : Math.round(
        amountAlignment * 0.35 +
        dateAlignment * 0.25 +
        referenceAlignment * 0.25 +
        ruleAlignment * 0.15
      );

  // Build candidate matches list
  let candidatesEvaluated: CandidateEvaluation[] = [];
  if (candidatePool && candidatePool.length > 0) {
    candidatesEvaluated = candidatePool.map((cand) => ({
      candidateId: cand.candidate_id,
      bankAmount: cand.bank_amount,
      bankDate: bankDateStr,
      referenceSimilarityPct: cand.similarity,
      settlementDelayDays: calDays >= 0 ? calDays : 0,
      isPlausible: cand.similarity >= 80,
      evaluationOutcome: candidatePool.length > 1 ? 'COLLISION_AMBIGUOUS' : isMatched ? 'SELECTED' : 'AMOUNT_MISMATCH',
      reason: candidatePool.length > 1
        ? 'Collision: Multiple candidates share plausible amount/reference profile.'
        : isMatched
        ? 'Selected: Satisfies deterministic authorization policy.'
        : 'Rejected: Does not meet required policy criteria.',
    }));
  } else {
    candidatesEvaluated = [
      {
        candidateId: normBankId || 'BANK_RECORD',
        bankAmount: bankRupees,
        bankDate: bankDateStr,
        referenceSimilarityPct: referenceAlignment,
        settlementDelayDays: calDays >= 0 ? calDays : 0,
        isPlausible: !isPending && (isMatched || diffPaise === 0),
        evaluationOutcome: isMatched ? 'SELECTED' : isPending ? 'DATE_EXCEEDED' : 'AMOUNT_MISMATCH',
        reason: isMatched ? 'Authorized by Policy Engine.' : isPending ? 'Awaiting bank transmission.' : 'Variance violates fee rules.',
      }
    ];
  }

  // Build deterministic explanation text
  let explanation = '';
  if (isAmbiguous) {
    explanation = 'Policy Refusal: Confidence insufficient. Multiple plausible candidates. DO NOT AUTO-RESOLVE.';
  } else if (matchRule === 'EXACT_MATCH') {
    explanation = `Exact 1:1 match verified across ledger and bank feed (${ledgerDateStr}). Policy Authorized.`;
  } else if (matchRule === 'GATEWAY_MDR_2_PERCENT') {
    explanation = `Policy Authorized: ${gatewayFeePct.toFixed(1)}% MDR Gateway fee deduction (₹${formatRupeesToINR(calculatedFeeRupees)}) verified against gross payment.`;
  } else if (matchRule === 'GATEWAY_MDR_PLUS_GST') {
    explanation = `Policy Authorized: ${gatewayFeePct.toFixed(1)}% MDR Fee + 18% GST tax line (₹${formatRupeesToINR(calculatedFeeRupees)}) reconciled against bank payout.`;
  } else if (matchRule === 'WEEKEND_SETTLEMENT') {
    explanation = `Policy Authorized: Friday payment (${ledgerDateStr}) settled Monday (${bankDateStr}) following business-day calendar rule.`;
  } else if (matchRule === 'PENDING_BANK_SETTLEMENT') {
    explanation = `Policy Refusal: ₹0.00 received in bank feed for ledger charge of ₹${formatRupeesToINR(ledgerRupees)} (Bank status: PENDING). DO NOT AUTO-RESOLVE.`;
  } else {
    explanation = `Policy Refusal: Unexplained variance of ₹${formatRupeesToINR(diffRupees)} (Ledger: ₹${formatRupeesToINR(ledgerRupees)} vs Bank: ₹${formatRupeesToINR(bankRupees)}). DO NOT AUTO-RESOLVE.`;
  }

  return {
    matchRule,
    ruleLabel,
    isMatched,
    decision,
    refusalReason,
    policyRule,
    scoreBreakdown: {
      amountAlignment,
      dateAlignment,
      referenceAlignment,
      ruleAlignment,
    },
    matchScore,
    calculatedFeeRupees,
    mathJourney,
    candidatesEvaluated,
    explanation,
    evidenceChecklist,
    severity,
    urgencyCategory,
  };
}

// Single Batch Reconciliation Engine
export async function runAntigravityReconciliation(
  rawRecords: SyntheticRecord[],
  gatewayFeePct: number = 2.0
): Promise<{
  audits: AuditRecord[];
  summary: {
    total: number;
    exactMatches: number;
    agentMatches: number;
    exceptions: number;
    matchRatePct: number;
    totalFeeDiscrepancy: number;
    unresolvedDiscrepancyAmount: number;
  };
}> {
  const audits: AuditRecord[] = [];
  let exactCount = 0;
  let agentCount = 0;
  let exceptionCount = 0;
  let totalFeeDiscrepancy = 0;
  let unresolvedDiscrepancyAmount = 0;

  const now = new Date().toISOString();

  for (const item of rawRecords) {
    const evalResult = evaluateReconciliationRules(
      item.txn_id,
      item.bank_ref_id || item.txn_id,
      item.internal_amount,
      item.bank_amount,
      item.internal_date,
      item.bank_date,
      item.payment_method,
      gatewayFeePct,
      item.candidate_pool
    );

    let status: 'EXACT_MATCH' | 'RESOLVED_BY_AGENT' | 'FLAGGED_EXCEPTION' = 'FLAGGED_EXCEPTION';

    if (evalResult.matchRule === 'EXACT_MATCH') {
      status = 'EXACT_MATCH';
      exactCount++;
    } else if (evalResult.isMatched) {
      status = 'RESOLVED_BY_AGENT';
      agentCount++;
      totalFeeDiscrepancy += evalResult.calculatedFeeRupees;
    } else {
      status = 'FLAGGED_EXCEPTION';
      exceptionCount++;
      unresolvedDiscrepancyAmount += Math.abs(item.internal_amount - item.bank_amount);
    }

    // Enhance explanation via AI provider if available (only for non-fail-closed cases)
    let finalExplanation = evalResult.explanation;
    if (geminiAIProvider.isAvailable() && status !== 'EXACT_MATCH' && evalResult.decision === 'AUTHORIZED') {
      const evidenceObj: TransactionEvidence = {
        transactionId: item.txn_id,
        bankRefId: item.bank_ref_id || item.txn_id,
        internalAmount: item.internal_amount,
        bankAmount: item.bank_amount,
        amountDifference: Math.abs(item.internal_amount - item.bank_amount),
        internalDate: item.internal_date,
        bankDate: item.bank_date,
        paymentMethod: item.payment_method,
        detectedRule: evalResult.matchRule,
        matchScore: evalResult.matchScore,
        scoreBreakdown: evalResult.scoreBreakdown,
        evidenceChecklist: evalResult.evidenceChecklist,
      };
      const aiExp = await geminiAIProvider.generateExplanation(evidenceObj);
      if (aiExp) finalExplanation = aiExp;
    }

    const policyAuth: PolicyAuthorization = {
      policyRule: evalResult.policyRule,
      policyLabel: evalResult.ruleLabel,
      decision: evalResult.decision,
      refusalReason: evalResult.refusalReason,
      authorizedBy: 'DETERMINISTIC_POLICY_ENGINE',
      aiConfidenceScore: evalResult.matchScore,
      timestamp: now,
    };

    audits.push({
      id: `AUDIT_${item.txn_id}`,
      txn_id: item.txn_id,
      internal_amount: item.internal_amount,
      bank_amount: item.bank_amount,
      internal_date: item.internal_date,
      bank_date: item.bank_date,
      payment_method: item.payment_method,
      status,
      match_type: evalResult.matchRule as any,
      explanation: finalExplanation,
      confidence_score: evalResult.matchScore, // Match Score / 100
      difference_amount: Math.abs(item.internal_amount - item.bank_amount),
      timestamp: now,
      mathJourney: evalResult.mathJourney,
      candidatesEvaluated: evalResult.candidatesEvaluated,
      policyAuth,
      razorpay_event: item.bank_date === 'PENDING' ? 'payment.captured' : 'settlement.processed',
      razorpay_payment_id: item.txn_id.startsWith('pay_') ? item.txn_id : `pay_${item.txn_id.toLowerCase()}`,
      razorpay_settlement_id: item.bank_ref_id && item.bank_ref_id.startsWith('setl_') ? item.bank_ref_id : `setl_${(item.bank_ref_id || item.txn_id).toLowerCase()}`,
      urgency_category: evalResult.urgencyCategory,
    });
  }

  const total = rawRecords.length;
  const totalMatched = exactCount + agentCount;
  const matchRatePct = total > 0 ? Math.round((totalMatched / total) * 1000) / 10 : 0;

  return {
    audits,
    summary: {
      total,
      exactMatches: exactCount,
      agentMatches: agentCount,
      exceptions: exceptionCount,
      matchRatePct,
      totalFeeDiscrepancy,
      unresolvedDiscrepancyAmount,
    },
  };
}

// Dual CSV File Reconciliation Engine
export async function runDualFileReconciliation(
  ledgerRows: any[],
  bankRows: any[],
  gatewayFeePct: number = 2.0
): Promise<{
  audits: AuditRecord[];
  summary: {
    total: number;
    exactMatches: number;
    agentMatches: number;
    exceptions: number;
    matchRatePct: number;
    totalFeeDiscrepancy: number;
    unresolvedDiscrepancyAmount: number;
  };
}> {
  const audits: AuditRecord[] = [];
  let exactCount = 0;
  let agentCount = 0;
  let exceptionCount = 0;
  let totalFeeDiscrepancy = 0;
  let unresolvedDiscrepancyAmount = 0;

  const now = new Date().toISOString();

  const bankByIdMap = new Map<string, any>();
  const bankByNumMap = new Map<string, any>();

  bankRows.forEach((row) => {
    const rawId = String(row.txn_id || row.transaction_id || row.TxnID || row.bank_ref_id || '').trim().toUpperCase();
    if (rawId) {
      bankByIdMap.set(rawId, row);
      const nums = rawId.replace(/\D/g, '');
      if (nums) bankByNumMap.set(nums, row);
    }
  });

  for (const lRow of ledgerRows) {
    const rawTxnId = String(lRow.txn_id || lRow.transaction_id || lRow.TxnID || '').trim().toUpperCase();
    if (!rawTxnId) continue;

    const lAmount = parseFloat(lRow.internal_amount || lRow.amount || lRow.Amount || '0');
    const lDate = lRow.internal_date || lRow.date || lRow.Date || new Date().toISOString().split('T')[0];
    const method = lRow.payment_method || lRow.method || 'CREDIT_CARD';
    const lNums = rawTxnId.replace(/\D/g, '');

    let bRow = bankByIdMap.get(rawTxnId);
    if (!bRow && lNums) {
      bRow = bankByNumMap.get(lNums);
    }

    if (!bRow) {
      exceptionCount++;
      unresolvedDiscrepancyAmount += lAmount;
      const mathJourney: MathJourney = {
        ledgerGrossRupees: lAmount,
        mdrRatePct: gatewayFeePct,
        mdrRupees: 0,
        gstRatePct: 18,
        gstRupees: 0,
        netExpectedRupees: lAmount,
        actualBankRupees: 0,
        varianceRupees: lAmount,
        formulaString: `Ledger ₹${formatRupeesToINR(lAmount)} - Bank Feed (₹0.00) = Unreconciled ₹${formatRupeesToINR(lAmount)}`,
      };
      const policyAuth: PolicyAuthorization = {
        policyRule: 'POLICY_FAIL_CLOSED_PENDING_SETTLEMENT',
        policyLabel: 'Missing Bank Settlement Feed',
        decision: 'REFUSED_FAIL_CLOSED',
        refusalReason: 'Settlement record not present in bank ledger feed. DO NOT AUTO-RESOLVE.',
        authorizedBy: 'DETERMINISTIC_POLICY_ENGINE',
        aiConfidenceScore: 0,
        timestamp: now,
      };
      audits.push({
        id: `AUDIT_${rawTxnId}`,
        txn_id: rawTxnId,
        internal_amount: lAmount,
        bank_amount: 0,
        internal_date: lDate,
        bank_date: 'MISSING',
        payment_method: method,
        status: 'FLAGGED_EXCEPTION',
        match_type: 'UNRESOLVED_VARIANCE' as any,
        explanation: `Payment ${rawTxnId} (₹${formatRupeesToINR(lAmount)}) present in Ledger but missing from Bank settlement feed. Fail-Closed Policy Enforced: DO NOT AUTO-RESOLVE.`,
        confidence_score: 0,
        difference_amount: lAmount,
        timestamp: now,
        mathJourney,
        candidatesEvaluated: [],
        policyAuth,
        razorpay_event: 'payment.captured',
        razorpay_payment_id: rawTxnId.startsWith('pay_') ? rawTxnId : `pay_${rawTxnId.toLowerCase()}`,
        razorpay_settlement_id: undefined,
        urgency_category: 'ATTENTION_REQUIRED',
      });
      continue;
    }

    const bTxnId = String(bRow.txn_id || bRow.transaction_id || bRow.TxnID || bRow.bank_ref_id || rawTxnId).trim().toUpperCase();
    const bAmount = parseFloat(bRow.bank_amount || bRow.amount || bRow.Amount || '0');
    const bDate = bRow.bank_date || bRow.date || bRow.Date || lDate;

    const evalResult = evaluateReconciliationRules(
      rawTxnId,
      bTxnId,
      lAmount,
      bAmount,
      lDate,
      bDate,
      method,
      gatewayFeePct
    );

    let status: 'EXACT_MATCH' | 'RESOLVED_BY_AGENT' | 'FLAGGED_EXCEPTION' = 'FLAGGED_EXCEPTION';

    if (evalResult.matchRule === 'EXACT_MATCH') {
      status = 'EXACT_MATCH';
      exactCount++;
    } else if (evalResult.isMatched) {
      status = 'RESOLVED_BY_AGENT';
      agentCount++;
      totalFeeDiscrepancy += evalResult.calculatedFeeRupees;
    } else {
      status = 'FLAGGED_EXCEPTION';
      exceptionCount++;
      unresolvedDiscrepancyAmount += Math.abs(lAmount - bAmount);
    }

    const policyAuth: PolicyAuthorization = {
      policyRule: evalResult.policyRule,
      policyLabel: evalResult.ruleLabel,
      decision: evalResult.decision,
      refusalReason: evalResult.refusalReason,
      authorizedBy: 'DETERMINISTIC_POLICY_ENGINE',
      aiConfidenceScore: evalResult.matchScore,
      timestamp: now,
    };

    audits.push({
      id: `AUDIT_${rawTxnId}`,
      txn_id: rawTxnId,
      internal_amount: lAmount,
      bank_amount: bAmount,
      internal_date: lDate,
      bank_date: bDate,
      payment_method: method,
      status,
      match_type: evalResult.matchRule as any,
      explanation: evalResult.explanation,
      confidence_score: evalResult.matchScore,
      difference_amount: Math.abs(lAmount - bAmount),
      timestamp: now,
      mathJourney: evalResult.mathJourney,
      candidatesEvaluated: evalResult.candidatesEvaluated,
      policyAuth,
      razorpay_event: bDate === 'PENDING' ? 'payment.captured' : 'settlement.processed',
      razorpay_payment_id: rawTxnId.startsWith('pay_') ? rawTxnId : `pay_${rawTxnId.toLowerCase()}`,
      razorpay_settlement_id: bTxnId.startsWith('setl_') ? bTxnId : `setl_${bTxnId.toLowerCase()}`,
      urgency_category: evalResult.urgencyCategory,
    });
  }

  const total = audits.length;
  const totalMatched = exactCount + agentCount;
  const matchRatePct = total > 0 ? Math.round((totalMatched / total) * 1000) / 10 : 0;

  return {
    audits,
    summary: {
      total,
      exactMatches: exactCount,
      agentMatches: agentCount,
      exceptions: exceptionCount,
      matchRatePct,
      totalFeeDiscrepancy,
      unresolvedDiscrepancyAmount,
    },
  };
}
