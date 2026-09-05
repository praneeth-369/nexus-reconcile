import { generateSyntheticBatch } from '../generateSyntheticData';
import { runAntigravityReconciliation, evaluateReconciliationRules } from '../antigravityEngine';
import { isWeekendSettlement, businessDaysBetween } from '../dateUtils';
import { toPaise, toRupees, calculateMdrFeePaise, calculateGstPaise } from '../financeUtils';

async function runUnitTests() {
  console.log('=== STARTING NEXUS RECONCILE UNIT & RECONCILIATION BENCHMARK TESTS ===\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  // TEST 1: Dynamic Demo Dataset Counts (50+ Total Records)
  const synthetic = generateSyntheticBatch('DEMO');
  assert(synthetic.records.length >= 50, `Demo Dataset contains 50+ transactions (Got ${synthetic.records.length})`);

  const result = await runAntigravityReconciliation(synthetic.records, 2.0);
  assert(result.summary.total >= 50, 'Engine processed 50+ total records');
  assert(result.summary.exactMatches > 0, 'Engine identified Exact 1:1 matches');
  assert(result.summary.agentMatches > 0, 'Engine identified Rule/AI resolved matches');
  assert(result.summary.exceptions > 0, 'Engine identified Unresolved Exceptions');
  assert(result.summary.exactMatches + result.summary.agentMatches + result.summary.exceptions === result.summary.total, 'Totals reconcile mathematically');
  assert(result.summary.matchRatePct > 0 && result.summary.matchRatePct <= 100, `Overall resolution rate is valid (${result.summary.matchRatePct}%)`);

  // TEST 2: Minor Unit Monetary Calculations
  const grossPaise = toPaise(10000);
  const mdrPaise = calculateMdrFeePaise(grossPaise, 0.02);
  const gstPaise = calculateGstPaise(mdrPaise, 0.18);

  assert(toRupees(mdrPaise) === 200, '2% MDR fee of ₹10,000 equals ₹200.00');
  assert(toRupees(gstPaise) === 36, '18% GST on ₹200 MDR fee equals ₹36.00');
  assert(toRupees(grossPaise - (mdrPaise + gstPaise)) === 9764, 'Net bank settlement after MDR+GST equals ₹9,764.00');

  // TEST 3: Business Day Settlement Reasoning
  const weekendAnalysis = isWeekendSettlement('2026-08-21', '2026-08-24');
  assert(weekendAnalysis.isWeekendDelay === true, 'Friday -> Monday delay recognized as legitimate weekend settlement');
  assert(businessDaysBetween('2026-08-21', '2026-08-24') === 1, 'Business days between Friday and Monday equals 1 day');

  const weekdayAnalysis = isWeekendSettlement('2026-08-25', '2026-08-27');
  assert(weekdayAnalysis.isWeekendDelay === false, 'Tuesday -> Thursday delay is NOT misclassified as weekend settlement');

  // TEST 4: Configurable Gateway Fee Rule Evaluation (e.g. 2.5% Fee)
  const ruleResult = evaluateReconciliationRules(
    'TXN_9999',
    'PG_9999',
    50000,
    48750, // 50000 - 2.5% (1250)
    '2026-08-25',
    '2026-08-25',
    'CREDIT_CARD',
    2.5
  );
  assert(ruleResult.matchRule === 'GATEWAY_MDR_2_PERCENT', 'Configured 2.5% MDR rule correctly triggered');
  assert(ruleResult.calculatedFeeRupees === 1250, 'Calculated 2.5% MDR fee equals ₹1,250.00');
  assert(ruleResult.matchScore >= 98, 'Match score is 98 or higher');

  // TEST 5: Human Resolution Matched vs Not Matched Store Updates
  const { runStore } = await import('../reconciliationRunStore');
  const mockRun = {
    runId: 'RUN-TEST-01',
    timestamp: new Date().toISOString(),
    datasetMode: 'DEMO' as const,
    datasetLabel: 'Test Run',
    totalRecords: 2,
    exactMatches: 0,
    ruleMatches: 0,
    exceptions: 2,
    resolutionRatePct: 0,
    totalLedgerRupees: 10000,
    totalBankRupees: 9000,
    totalFeesRupees: 0,
    unresolvedExposureRupees: 1000,
    rulesVersion: 'v2.4',
    aiModel: 'Deterministic',
    records: [
      {
        id: 'rec-1',
        txn_id: 'TXN_TEST_MATCH',
        internal_amount: 5000,
        bank_amount: 4500,
        internal_date: '2026-08-20',
        bank_date: '2026-08-20',
        payment_method: 'CREDIT_CARD',
        status: 'FLAGGED_EXCEPTION' as const,
        match_type: 'UNRESOLVED_DISCREPANCY' as const,
        explanation: 'Needs Review',
        confidence_score: 50,
        difference_amount: 500,
        timestamp: new Date().toISOString(),
      },
      {
        id: 'rec-2',
        txn_id: 'TXN_TEST_UNMATCH',
        internal_amount: 5000,
        bank_amount: 4500,
        internal_date: '2026-08-20',
        bank_date: '2026-08-20',
        payment_method: 'CREDIT_CARD',
        status: 'FLAGGED_EXCEPTION' as const,
        match_type: 'UNRESOLVED_DISCREPANCY' as const,
        explanation: 'Needs Review',
        confidence_score: 50,
        difference_amount: 500,
        timestamp: new Date().toISOString(),
      }
    ],
    actionLogs: [],
  };

  runStore.saveRun(mockRun);

  // Controller resolves rec-1 as MATCHED
  runStore.addActionLog('RUN-TEST-01', {
    actionId: 'ACT-1',
    runId: 'RUN-TEST-01',
    txnId: 'TXN_TEST_MATCH',
    reviewer: 'Finance Controller',
    timestamp: new Date().toISOString(),
    action: 'RESOLVE_MATCHED',
    reason: 'Verified discrepancy',
    note: 'Valid waiver',
    previousStatus: 'FLAGGED_EXCEPTION',
    newStatus: 'HUMAN_MATCHED',
  });

  const updatedTestRun1 = runStore.getRunById('RUN-TEST-01')!;
  assert(updatedTestRun1.records[0].status === 'HUMAN_MATCHED', 'Record 1 status updated to HUMAN_MATCHED');
  assert(updatedTestRun1.resolutionRatePct === 50, 'Resolution rate increases to 50% after human matched resolution');
  assert(updatedTestRun1.unresolvedExposureRupees === 500, 'Unresolved exposure drops from 1000 to 500');

  // Controller resolves rec-2 as NOT MATCHED
  runStore.addActionLog('RUN-TEST-01', {
    actionId: 'ACT-2',
    runId: 'RUN-TEST-01',
    txnId: 'TXN_TEST_UNMATCH',
    reviewer: 'Finance Controller',
    timestamp: new Date().toISOString(),
    action: 'RESOLVE_UNMATCHED',
    reason: 'Fraud / Disputed',
    note: 'Bank investigation opened',
    previousStatus: 'FLAGGED_EXCEPTION',
    newStatus: 'HUMAN_UNMATCHED',
  });

  const updatedTestRun2 = runStore.getRunById('RUN-TEST-01')!;
  assert(updatedTestRun2.records[1].status === 'HUMAN_UNMATCHED', 'Record 2 status updated to HUMAN_UNMATCHED');
  assert(updatedTestRun2.resolutionRatePct === 50, 'Resolution rate remains 50% when resolved as not matched');
  assert(updatedTestRun2.unresolvedExposureRupees === 500, 'Unresolved exposure accurately retains un-matched difference');

  // TEST 6: Fail-Closed Refusal on Ambiguous Candidate Collision (Directive 1)
  const collisionCandidatePool = [
    { candidate_id: 'setl_COLLISION_01', bank_amount: 1950, similarity: 92 },
    { candidate_id: 'setl_COLLISION_02', bank_amount: 1950, similarity: 89 },
  ];
  const collisionResult = evaluateReconciliationRules(
    'pay_COLLISION_TEST',
    'setl_COLLISION_01',
    2000,
    1950,
    '2026-08-25',
    '2026-08-26',
    'CREDIT_CARD',
    2.0,
    collisionCandidatePool
  );
  assert(collisionResult.isMatched === false, 'Collision record is NOT auto-resolved');
  assert(collisionResult.decision === 'REFUSED_FAIL_CLOSED', 'Collision decision is strictly REFUSED_FAIL_CLOSED');
  assert(
    collisionResult.refusalReason === 'Confidence insufficient. Multiple plausible candidates. DO NOT AUTO-RESOLVE.',
    'Collision returns exact required fail-closed refusal reason'
  );
  assert(
    collisionResult.policyRule === 'POLICY_FAIL_CLOSED_AMBIGUOUS_CANDIDATES',
    'Collision triggers POLICY_FAIL_CLOSED_AMBIGUOUS_CANDIDATES'
  );

  // TEST 7: Fail-Closed Refusal on Unexplained Variance (Directive 1)
  const unexplainedResult = evaluateReconciliationRules(
    'pay_UNEXPLAINED_TEST',
    'setl_UNEXPLAINED_TEST',
    5000,
    4820, // Arbitrary ₹180 variance that doesn't match 2% MDR or 2% + 18% GST
    '2026-08-25',
    '2026-08-25',
    'UPI',
    2.0
  );
  assert(unexplainedResult.isMatched === false, 'Unexplained variance is NOT auto-resolved');
  assert(unexplainedResult.decision === 'REFUSED_FAIL_CLOSED', 'Unexplained variance decision is REFUSED_FAIL_CLOSED');
  assert(
    unexplainedResult.policyRule === 'POLICY_FAIL_CLOSED_UNEXPLAINED_VARIANCE',
    'Triggers POLICY_FAIL_CLOSED_UNEXPLAINED_VARIANCE'
  );

  // TEST 8: Radical Audit Transparency - Explicit Math Journey (Directive 2)
  const mdrGstMathResult = evaluateReconciliationRules(
    'pay_MATH_JOURNEY_TEST',
    'setl_MATH_JOURNEY_TEST',
    1999.00,
    1951.82, // 1999 - (39.98 MDR + 7.20 GST) = 1951.82
    '2026-08-25',
    '2026-08-26',
    'CREDIT_CARD',
    2.0
  );
  assert(mdrGstMathResult.isMatched === true, 'MDR + GST payment is matched');
  assert(mdrGstMathResult.decision === 'AUTHORIZED', 'Policy authorizes exact MDR + GST settlement');
  assert(mdrGstMathResult.mathJourney.ledgerGrossRupees === 1999.00, 'Math journey records gross rupees');
  assert(mdrGstMathResult.mathJourney.mdrRupees === 39.98, 'Math journey records MDR fee: ₹39.98');
  assert(mdrGstMathResult.mathJourney.gstRupees === 7.20, 'Math journey records 18% GST on MDR: ₹7.20');
  assert(mdrGstMathResult.mathJourney.netExpectedRupees === 1951.82, 'Math journey net expected equals ₹1,951.82');
  assert(mdrGstMathResult.mathJourney.formulaString.includes('Net Expected ₹1,951.82'), 'Math formula string populated');

  // TEST 9: Batch Reconciliation Razorpay Nomenclature & Urgency Assignment
  const batchResult = await runAntigravityReconciliation(synthetic.records, 2.0);
  const sampleAudit = batchResult.audits[0];
  assert(sampleAudit.razorpay_payment_id?.startsWith('pay_') === true, 'Audit record contains Razorpay pay_ ID');
  assert(sampleAudit.policyAuth !== undefined, 'Audit record contains policyAuth object');
  assert(
    sampleAudit.urgency_category === 'CRITICAL' ||
    sampleAudit.urgency_category === 'ATTENTION_REQUIRED' ||
    sampleAudit.urgency_category === 'HEALTHY',
    'Audit record contains valid urgency_category'
  );

  console.log(`\n=== BENCHMARK SUMMARY: ${passed} PASSED, ${failed} FAILED ===\n`);
  if (failed > 0) process.exit(1);
}

runUnitTests();
