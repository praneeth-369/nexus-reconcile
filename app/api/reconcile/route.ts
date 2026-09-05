import { NextResponse } from 'next/server';
import { generateSyntheticBatch } from '@/lib/generateSyntheticData';
import { runAntigravityReconciliation, runDualFileReconciliation } from '@/lib/antigravityEngine';
import { persistAuditRecords, fetchAuditRecords } from '@/lib/firebaseAdmin';
import { runStore, ReconciliationRun } from '@/lib/reconciliationRunStore';
import { geminiAIProvider } from '@/lib/ai/geminiProvider';
import { validateReconciliationCsvs } from '@/lib/csvValidator';
import { realtimeEvents } from '@/lib/realtimeStore';

export async function GET() {
  try {
    let run = runStore.getLatestRun();
    const prevRun = runStore.getPreviousRun();

    if (!run) {
      // Initialize with fixed Demo Dataset
      const synthetic = generateSyntheticBatch('DEMO');
      const result = await runAntigravityReconciliation(synthetic.records, 2.0);

      const totalLedgerRupees = synthetic.records.reduce((a, r) => a + r.internal_amount, 0);
      const totalBankRupees = synthetic.records.reduce((a, r) => a + r.bank_amount, 0);

      run = {
        runId: `RUN-00${Math.floor(Math.random() * 90) + 10}`,
        timestamp: new Date().toISOString(),
        datasetMode: 'DEMO',
        datasetLabel: synthetic.meta.datasetLabel,
        totalRecords: result.summary.total,
        exactMatches: result.summary.exactMatches,
        ruleMatches: result.summary.agentMatches,
        exceptions: result.summary.exceptions,
        resolutionRatePct: result.summary.matchRatePct,
        totalLedgerRupees,
        totalBankRupees,
        totalFeesRupees: result.summary.totalFeeDiscrepancy,
        unresolvedExposureRupees: result.summary.unresolvedDiscrepancyAmount,
        rulesVersion: 'v2.4 (2% MDR + 18% GST + Business Day)',
        aiModel: geminiAIProvider.isAvailable() ? 'Google Gemini 1.5/2.0' : 'Deterministic Rule Fallback',
        records: result.audits,
        actionLogs: [],
      };

      runStore.saveRun(run);
      await persistAuditRecords(result.audits);
    }

    const aiSummary = await geminiAIProvider.generateRunSummary({
      runId: run.runId,
      totalRecords: run.totalRecords,
      exactMatches: run.exactMatches,
      ruleMatches: run.ruleMatches,
      exceptions: run.exceptions,
      resolutionRatePct: run.resolutionRatePct,
      unresolvedExposureRupees: run.unresolvedExposureRupees,
      totalFeesRupees: run.totalFeesRupees,
      topExceptionIds: run.records.filter((r) => r.status === 'FLAGGED_EXCEPTION').map((r) => r.txn_id).slice(0, 3),
    });

    return NextResponse.json({
      success: true,
      run,
      prevRun: prevRun ? {
        runId: prevRun.runId,
        timestamp: prevRun.timestamp,
        resolutionRatePct: prevRun.resolutionRatePct,
        unresolvedExposureRupees: prevRun.unresolvedExposureRupees,
        totalRecords: prevRun.totalRecords,
        exceptions: prevRun.exceptions,
      } : null,
      aiSummary,
      pipeline: {
        ingestCount: run.totalRecords,
        validateCount: run.totalRecords,
        normalizeCount: run.totalRecords,
        exactMatchCount: run.exactMatches,
        ruleMatchCount: run.ruleMatches,
        aiControllerCount: run.exceptions,
        humanReviewCount: run.records.filter((r) => r.status === 'FLAGGED_EXCEPTION').length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch reconciliation run data' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode === 'SANDBOX' ? 'SANDBOX' : 'DEMO';
    const gatewayFeePct = typeof body.gatewayFeePct === 'number' ? body.gatewayFeePct : 2.0;

    let result;
    let datasetMode: 'DEMO' | 'SANDBOX' | 'DUAL_CSV' = mode;
    let datasetLabel = '';
    let validationResult = null;

    if (body.ledgerRows && body.bankRows && Array.isArray(body.ledgerRows) && Array.isArray(body.bankRows)) {
      datasetMode = 'DUAL_CSV';
      datasetLabel = `Custom Dual CSV Dataset (${body.ledgerRows.length} Ledger Records)`;

      // Validate uploaded CSV rows prior to running reconciliation
      validationResult = validateReconciliationCsvs(body.ledgerRows, body.bankRows);
      if (!validationResult.isValid) {
        return NextResponse.json({
          success: false,
          error: 'CSV Validation Failed. Fix critical errors before reconciling.',
          validationResult,
        }, { status: 400 });
      }

      result = await runDualFileReconciliation(body.ledgerRows, body.bankRows, gatewayFeePct);
    } else {
      const synthetic = generateSyntheticBatch(mode, gatewayFeePct);
      datasetLabel = synthetic.meta.datasetLabel;
      result = await runAntigravityReconciliation(synthetic.records, gatewayFeePct);
    }

    const prevRun = runStore.getLatestRun();

    const totalLedgerRupees = result.audits.reduce((a, r) => a + r.internal_amount, 0);
    const totalBankRupees = result.audits.reduce((a, r) => a + r.bank_amount, 0);

    const newRun: ReconciliationRun = {
      runId: `RUN-00${Math.floor(Math.random() * 900) + 100}`,
      timestamp: new Date().toISOString(),
      datasetMode,
      datasetLabel,
      totalRecords: result.summary.total,
      exactMatches: result.summary.exactMatches,
      ruleMatches: result.summary.agentMatches,
      exceptions: result.summary.exceptions,
      resolutionRatePct: result.summary.matchRatePct,
      totalLedgerRupees,
      totalBankRupees,
      totalFeesRupees: result.summary.totalFeeDiscrepancy,
      unresolvedExposureRupees: result.summary.unresolvedDiscrepancyAmount,
      rulesVersion: `v2.4 (${gatewayFeePct.toFixed(1)}% MDR + 18% GST + Business Day)`,
      aiModel: geminiAIProvider.isAvailable() ? 'Google Gemini 1.5/2.0' : 'Deterministic Rule Fallback',
      records: result.audits,
      actionLogs: [],
    };

    runStore.saveRun(newRun);
    await persistAuditRecords(result.audits);
    realtimeEvents.emit('RUN_UPDATED', newRun);

    const aiSummary = await geminiAIProvider.generateRunSummary({
      runId: newRun.runId,
      totalRecords: newRun.totalRecords,
      exactMatches: newRun.exactMatches,
      ruleMatches: newRun.ruleMatches,
      exceptions: newRun.exceptions,
      resolutionRatePct: newRun.resolutionRatePct,
      unresolvedExposureRupees: newRun.unresolvedExposureRupees,
      totalFeesRupees: newRun.totalFeesRupees,
      topExceptionIds: newRun.records.filter((r) => r.status === 'FLAGGED_EXCEPTION').map((r) => r.txn_id).slice(0, 3),
    });

    return NextResponse.json({
      success: true,
      message: 'Reconciliation run executed successfully.',
      run: newRun,
      prevRun: prevRun ? {
        runId: prevRun.runId,
        timestamp: prevRun.timestamp,
        resolutionRatePct: prevRun.resolutionRatePct,
        unresolvedExposureRupees: prevRun.unresolvedExposureRupees,
        totalRecords: prevRun.totalRecords,
        exceptions: prevRun.exceptions,
      } : null,
      aiSummary,
      validationResult,
      pipeline: {
        ingestCount: newRun.totalRecords,
        validateCount: newRun.totalRecords,
        normalizeCount: newRun.totalRecords,
        exactMatchCount: newRun.exactMatches,
        ruleMatchCount: newRun.ruleMatches,
        aiControllerCount: newRun.exceptions,
        humanReviewCount: newRun.records.filter((r) => r.status === 'FLAGGED_EXCEPTION').length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Reconciliation execution failed' },
      { status: 500 }
    );
  }
}
