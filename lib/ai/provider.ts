export interface TransactionEvidence {
  transactionId: string;
  bankRefId: string;
  internalAmount: number;
  bankAmount: number;
  amountDifference: number;
  internalDate: string;
  bankDate: string;
  paymentMethod: string;
  detectedRule: string;
  matchScore: number;
  scoreBreakdown: {
    amountAlignment: number;
    dateAlignment: number;
    referenceAlignment: number;
    ruleAlignment: number;
  };
  evidenceChecklist: string[];
}

export interface ExceptionAnalysis {
  transactionId: string;
  riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  decision: 'resolved' | 'review' | 'unresolved';
  reason: string;
  recommendedAction: string;
  evidenceSummary: string[];
}

export interface RunSummary {
  runId: string;
  totalRecords: number;
  exactMatches: number;
  ruleMatches: number;
  exceptions: number;
  resolutionRatePct: number;
  unresolvedExposureRupees: number;
  totalFeesRupees: number;
  topExceptionIds: string[];
}

export interface AIProvider {
  isAvailable(): boolean;
  generateExplanation(evidence: TransactionEvidence): Promise<string>;
  analyzeException(evidence: TransactionEvidence): Promise<ExceptionAnalysis>;
  prioritizeExceptions(exceptions: TransactionEvidence[]): Promise<ExceptionAnalysis[]>;
  answerControllerQuestion(prompt: string, contextString: string): Promise<string>;
  generateRunSummary(run: RunSummary): Promise<{
    headline: string;
    executiveSummary: string;
    controllerInsight: string;
    recommendedNextStep: string;
  }>;
}
