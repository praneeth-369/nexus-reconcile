import { AuditRecord } from './firebaseAdmin';

export interface ControllerActionLog {
  actionId: string;
  runId: string;
  txnId: string;
  reviewer: string;
  timestamp: string;
  action: 'ACCEPT' | 'OVERRIDE' | 'RESOLVE' | 'ESCALATE' | 'REJECT';
  reason: string;
  note?: string;
  previousStatus: string;
  newStatus: string;
}

export interface ReconciliationRun {
  runId: string;
  timestamp: string;
  datasetMode: 'DEMO' | 'SANDBOX' | 'DUAL_CSV';
  datasetLabel: string;
  totalRecords: number;
  exactMatches: number;
  ruleMatches: number;
  exceptions: number;
  resolutionRatePct: number;
  totalLedgerRupees: number;
  totalBankRupees: number;
  totalFeesRupees: number;
  unresolvedExposureRupees: number;
  rulesVersion: string;
  aiModel: string;
  records: AuditRecord[];
  actionLogs: ControllerActionLog[];
}

class ReconciliationRunStore {
  private static instance: ReconciliationRunStore;
  private runs: ReconciliationRun[] = [];

  private constructor() {}

  public static getInstance(): ReconciliationRunStore {
    if (!ReconciliationRunStore.instance) {
      ReconciliationRunStore.instance = new ReconciliationRunStore();
    }
    return ReconciliationRunStore.instance;
  }

  public saveRun(run: ReconciliationRun): void {
    // Keep last 20 runs
    this.runs = [run, ...this.runs].slice(0, 20);
  }

  public getRuns(): ReconciliationRun[] {
    return this.runs;
  }

  public getLatestRun(): ReconciliationRun | null {
    return this.runs.length > 0 ? this.runs[0] : null;
  }

  public getPreviousRun(): ReconciliationRun | null {
    return this.runs.length > 1 ? this.runs[1] : null;
  }

  public getRunById(runId: string): ReconciliationRun | null {
    return this.runs.find((r) => r.runId === runId) || null;
  }

  private agentLock: boolean = false;

  public acquireLock(): boolean {
    if (this.agentLock) return false;
    this.agentLock = true;
    return true;
  }

  public releaseLock(): void {
    this.agentLock = false;
  }

  public isLocked(): boolean {
    return this.agentLock;
  }

  public getRecord(txnId: string): AuditRecord | null {
    const run = this.getLatestRun();
    if (!run) return null;
    return run.records.find((r) => r.txn_id === txnId) || null;
  }

  public recalculateMetrics(runId?: string): void {
    const run = runId ? this.getRunById(runId) : this.getLatestRun();
    if (!run) return;

    run.exactMatches = run.records.filter((r) => r.status === 'EXACT_MATCH').length;
    run.ruleMatches = run.records.filter((r) => r.status === 'RESOLVED_BY_AGENT' || r.status === 'HUMAN_RESOLVED' || r.status === 'HUMAN_MATCHED').length;
    run.exceptions = run.records.filter((r) => r.status === 'FLAGGED_EXCEPTION' || r.status === 'ESCALATED_TO_OPS' || r.status === 'HUMAN_UNMATCHED').length;
    run.resolutionRatePct = run.totalRecords > 0 
      ? Math.round(((run.exactMatches + run.ruleMatches) / run.totalRecords) * 1000) / 10 
      : 0;
    run.unresolvedExposureRupees = run.records
      .filter((r) => r.status === 'FLAGGED_EXCEPTION' || r.status === 'ESCALATED_TO_OPS' || r.status === 'HUMAN_UNMATCHED')
      .reduce((a, r) => a + r.difference_amount, 0);
  }

  public updateRecord(txnId: string, updates: Partial<AuditRecord>, runId?: string): boolean {
    const run = runId ? this.getRunById(runId) : this.getLatestRun();
    if (!run) return false;

    const targetRec = run.records.find((r) => r.txn_id === txnId);
    if (!targetRec) return false;

    Object.assign(targetRec, updates);
    this.recalculateMetrics(run.runId);
    return true;
  }

  public addActionLog(runId: string, log: ControllerActionLog): boolean {
    const run = this.getRunById(runId) || this.getLatestRun();
    if (!run) return false;

    run.actionLogs = run.actionLogs || [];
    run.actionLogs.push(log);

    // Update target record status inside run
    const targetRec = run.records.find((r) => r.txn_id === log.txnId);
    if (targetRec) {
      targetRec.status = log.newStatus as any;
      targetRec.explanation = `Manual Action by ${log.reviewer}: ${log.action} (${log.reason}). Note: ${log.note || 'None'}`;
    }

    this.recalculateMetrics(run.runId);
    return true;
  }
}

export const runStore = ReconciliationRunStore.getInstance();
