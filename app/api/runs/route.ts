import { NextResponse } from 'next/server';
import { runStore } from '@/lib/reconciliationRunStore';
import { persistAuditRecords } from '@/lib/firebaseAdmin';
import { realtimeEvents } from '@/lib/realtimeStore';

export async function GET() {
  try {
    const runs = runStore.getRuns();
    return NextResponse.json({
      success: true,
      count: runs.length,
      runs: runs.map((r) => ({
        runId: r.runId,
        timestamp: r.timestamp,
        datasetMode: r.datasetMode,
        datasetLabel: r.datasetLabel,
        totalRecords: r.totalRecords,
        exactMatches: r.exactMatches,
        ruleMatches: r.ruleMatches,
        exceptions: r.exceptions,
        resolutionRatePct: r.resolutionRatePct,
        unresolvedExposureRupees: r.unresolvedExposureRupees,
        totalFeesRupees: r.totalFeesRupees,
        actionLogsCount: r.actionLogs ? r.actionLogs.length : 0,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { runId, txnId, action, reviewer, reason, note } = body;

    if (!txnId || !action) {
      return NextResponse.json({ success: false, error: 'txnId and action are required' }, { status: 400 });
    }

    const currentRun = runId ? runStore.getRunById(runId) : runStore.getLatestRun();
    if (!currentRun) {
      return NextResponse.json({ success: false, error: 'No active reconciliation run found' }, { status: 404 });
    }

    const targetRec = currentRun.records.find((r) => r.txn_id === txnId);
    if (!targetRec) {
      return NextResponse.json({ success: false, error: `Transaction ${txnId} not found in run ${currentRun.runId}` }, { status: 404 });
    }

    const previousStatus = targetRec.status;
    let newStatus = targetRec.status;

    if (action === 'RESOLVE_MATCHED' || action === 'RESOLVE' || action === 'ACCEPT' || action === 'OVERRIDE') {
      newStatus = 'HUMAN_MATCHED';
    } else if (action === 'RESOLVE_UNMATCHED' || action === 'REJECT') {
      newStatus = 'HUMAN_UNMATCHED';
    } else if (action === 'ESCALATE') {
      newStatus = 'ESCALATED_TO_OPS';
    }

    const actionLog = {
      actionId: `LOG_${Date.now()}`,
      runId: currentRun.runId,
      txnId,
      reviewer: reviewer || 'Finance Controller',
      timestamp: new Date().toISOString(),
      action,
      reason: reason || 'Controller manual decision',
      note: note || '',
      previousStatus,
      newStatus,
    };

    const success = runStore.addActionLog(currentRun.runId, actionLog);
    if (success) {
      await persistAuditRecords(currentRun.records);
      realtimeEvents.emit('RUN_UPDATED', currentRun);
    }

    return NextResponse.json({
      success: true,
      message: `Action ${action} logged for transaction ${txnId}.`,
      run: currentRun,
      actionLog,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
