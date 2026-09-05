import {
  AIProvider,
  TransactionEvidence,
  ExceptionAnalysis,
  RunSummary,
} from './provider';
import { formatRupeesToINR } from '../financeUtils';

export class GeminiAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || process.env.ANTIGRAVITY_API_KEY || '';
    this.model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  }

  public isAvailable(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 5);
  }

  private async callGeminiApi(prompt: string, jsonMode: boolean = false): Promise<string | null> {
    if (!this.isAvailable()) {
      return null;
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        this.model
      )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

      const body: any = {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      };

      if (jsonMode) {
        body.generationConfig = {
          responseMimeType: 'application/json',
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.warn(`[GeminiAIProvider] Gemini API error status ${res.status}`);
        return null;
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return text || null;
    } catch (err) {
      console.warn('[GeminiAIProvider] Exception calling Gemini API:', err);
      return null;
    }
  }

  public async generateExplanation(evidence: TransactionEvidence): Promise<string> {
    if (!this.isAvailable()) {
      return this.getFallbackExplanation(evidence);
    }

    const prompt = `
You are an expert enterprise AI Finance Controller. Explain why this payment transaction was reconciled or flagged.

Structured Evidence:
- Transaction ID: ${evidence.transactionId}
- Bank Ref ID: ${evidence.bankRefId}
- Ledger Amount: ₹${evidence.internalAmount}
- Bank Amount: ₹${evidence.bankAmount}
- Difference: ₹${evidence.amountDifference}
- Ledger Date: ${evidence.internalDate}
- Bank Date: ${evidence.bankDate}
- Payment Method: ${evidence.paymentMethod}
- Detected Rule: ${evidence.detectedRule}
- Overall Match Score: ${evidence.matchScore} / 100

Instructions:
Write a concise 2-sentence financial explanation for a Finance Controller. State what rule triggered, what amount was deducted/settled, and whether action is needed. Do NOT invent numbers not in the evidence.
`;

    const result = await this.callGeminiApi(prompt, false);
    return result ? result.trim() : this.getFallbackExplanation(evidence);
  }

  public async analyzeException(evidence: TransactionEvidence): Promise<ExceptionAnalysis> {
    if (!this.isAvailable()) {
      return this.getFallbackExceptionAnalysis(evidence);
    }

    const prompt = `
You are an enterprise AI Finance Controller analyzing an unresolved payment discrepancy.

Evidence:
- Transaction ID: ${evidence.transactionId}
- Ledger Amount: ₹${evidence.internalAmount}
- Bank Amount: ₹${evidence.bankAmount}
- Difference: ₹${evidence.amountDifference}
- Ledger Date: ${evidence.internalDate}
- Bank Date: ${evidence.bankDate}
- Payment Method: ${evidence.paymentMethod}
- Detected Rule: ${evidence.detectedRule}
- Match Score: ${evidence.matchScore} / 100

Return ONLY valid JSON matching this exact structure:
{
  "transactionId": "${evidence.transactionId}",
  "riskLevel": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "decision": "review",
  "reason": "Clear explanation of financial discrepancy",
  "recommendedAction": "Actionable step for controller",
  "evidenceSummary": ["bullet 1", "bullet 2"]
}
`;

    const rawJson = await this.callGeminiApi(prompt, true);
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        return {
          transactionId: evidence.transactionId,
          riskLevel: parsed.riskLevel || this.getSeverityFromDiff(evidence.amountDifference, evidence.bankDate),
          decision: 'review',
          reason: parsed.reason || `Difference of ₹${evidence.amountDifference} requires manual review.`,
          recommendedAction: parsed.recommendedAction || 'Verify settlement statement with payment gateway provider.',
          evidenceSummary: Array.isArray(parsed.evidenceSummary) ? parsed.evidenceSummary : evidence.evidenceChecklist,
        };
      } catch (e) {
        // Parse error fallback
      }
    }

    return this.getFallbackExceptionAnalysis(evidence);
  }

  public async prioritizeExceptions(exceptions: TransactionEvidence[]): Promise<ExceptionAnalysis[]> {
    const sorted = [...exceptions].sort((a, b) => b.amountDifference - a.amountDifference);
    const results: ExceptionAnalysis[] = [];

    for (const ex of sorted) {
      results.push(await this.analyzeException(ex));
    }

    return results;
  }

  public async answerControllerQuestion(prompt: string, contextString: string): Promise<string> {
    if (!this.isAvailable()) {
      return ''; // Route handler will use smart deterministic context generator
    }

    const fullPrompt = `
You are Nexus Reconcile Controller, an enterprise AI assistant for financial settlement operations.
Answer the user's question using ONLY the provided audit trail data. Do NOT fabricate numbers, dates, or transactions.

Current Application State & Audit Context:
${contextString}

User Question: "${prompt}"

Instructions:
- Provide a clear, professional answer formatted with markdown headers and bullet points.
- Quote exact rupee amounts (₹) and transaction IDs.
- Give actionable recommendations for exceptions.
`;

    const res = await this.callGeminiApi(fullPrompt, false);
    return res ? res.trim() : '';
  }

  public async generateRunSummary(run: RunSummary): Promise<{
    headline: string;
    executiveSummary: string;
    controllerInsight: string;
    recommendedNextStep: string;
  }> {
    const fallback = {
      headline: `Reconciliation Run Complete — ${run.resolutionRatePct}% Resolution Rate`,
      executiveSummary: `${run.exactMatches + run.ruleMatches} of ${run.totalRecords} payments automatically resolved (${run.resolutionRatePct}%). ${run.exceptions} exceptions totaling ₹${formatRupeesToINR(run.unresolvedExposureRupees)} require controller review. ₹${formatRupeesToINR(run.totalFeesRupees)} in gateway fees & taxes identified.`,
      controllerInsight: `${run.exceptions} transactions represent ₹${formatRupeesToINR(run.unresolvedExposureRupees)} in unresolved risk. ${run.ruleMatches} transactions were auto-matched using 2% MDR fee and business-day settlement rules.`,
      recommendedNextStep: run.exceptions > 0
        ? `Review the ${Math.min(3, run.exceptions)} highest-value unresolved exceptions first.`
        : 'All transactions resolved cleanly. No manual action required.',
    };

    if (!this.isAvailable()) {
      return fallback;
    }

    const prompt = `
You are an enterprise AI Finance Controller. Summarize this reconciliation run:

Run Data:
- Total Records: ${run.totalRecords}
- Exact Matches: ${run.exactMatches}
- Rule/AI Resolved: ${run.ruleMatches}
- Exceptions: ${run.exceptions}
- Resolution Rate: ${run.resolutionRatePct}%
- Unresolved Exposure: ₹${run.unresolvedExposureRupees}
- Identified Fees: ₹${run.totalFeesRupees}

Return ONLY valid JSON:
{
  "headline": "...",
  "executiveSummary": "...",
  "controllerInsight": "...",
  "recommendedNextStep": "..."
}
`;

    const raw = await this.callGeminiApi(prompt, true);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return {
          headline: parsed.headline || fallback.headline,
          executiveSummary: parsed.executiveSummary || fallback.executiveSummary,
          controllerInsight: parsed.controllerInsight || fallback.controllerInsight,
          recommendedNextStep: parsed.recommendedNextStep || fallback.recommendedNextStep,
        };
      } catch (e) {}
    }

    return fallback;
  }

  // Helper Fallbacks
  private getFallbackExplanation(evidence: TransactionEvidence): string {
    if (evidence.detectedRule === 'EXACT_MATCH') {
      return `Ledger and bank amounts match 1:1 at ₹${formatRupeesToINR(evidence.internalAmount)} on ${evidence.internalDate}.`;
    }
    if (evidence.detectedRule === 'GATEWAY_MDR_2_PERCENT') {
      return `Rule Match: Standard 2.0% gateway fee (₹${formatRupeesToINR(evidence.amountDifference)}) deducted automatically.`;
    }
    if (evidence.detectedRule === 'GATEWAY_MDR_PLUS_GST') {
      return `Rule Match: 2.0% gateway fee + 18% GST (total ₹${formatRupeesToINR(evidence.amountDifference)}) verified.`;
    }
    if (evidence.detectedRule === 'WEEKEND_SETTLEMENT') {
      return `Rule Match: Friday payment (${evidence.internalDate}) settled Monday (${evidence.bankDate}) following business-day calendar rule.`;
    }
    return `Unresolved Discrepancy: Difference of ₹${formatRupeesToINR(evidence.amountDifference)} exceeds all standard 2% fee and weekend delay rules.`;
  }

  private getFallbackExceptionAnalysis(evidence: TransactionEvidence): ExceptionAnalysis {
    const severity = this.getSeverityFromDiff(evidence.amountDifference, evidence.bankDate);
    let reason = `Difference of ₹${formatRupeesToINR(evidence.amountDifference)} requires controller review.`;
    let action = 'Verify settlement report with payment gateway.';

    if (evidence.bankDate === 'PENDING' || evidence.bankAmount === 0) {
      reason = `Ledger payment of ₹${formatRupeesToINR(evidence.internalAmount)} shows ₹0.00 received in bank feed (Status: PENDING).`;
      action = 'Confirm payout status with bank acquiring team.';
    } else if (evidence.bankAmount > evidence.internalAmount) {
      reason = `Bank feed shows overpayment of ₹${formatRupeesToINR(evidence.amountDifference)}.`;
      action = 'Verify duplicate deposit entry in bank statement.';
    }

    return {
      transactionId: evidence.transactionId,
      riskLevel: severity,
      decision: 'review',
      reason,
      recommendedAction: action,
      evidenceSummary: evidence.evidenceChecklist,
    };
  }

  private getSeverityFromDiff(diff: number, bankDate: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    if (bankDate === 'PENDING' || diff >= 8000) return 'CRITICAL';
    if (diff >= 4000) return 'HIGH';
    if (diff >= 1500) return 'MEDIUM';
    return 'LOW';
  }
}

export const geminiAIProvider = new GeminiAIProvider();
