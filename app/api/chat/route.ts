import { NextResponse } from 'next/server';
import { fetchAuditRecords } from '@/lib/firebaseAdmin';
import { geminiAIProvider } from '@/lib/ai/geminiProvider';
import { runStore } from '@/lib/reconciliationRunStore';
import { formatRupeesToINR } from '@/lib/financeUtils';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ success: false, error: 'Prompt is required' }, { status: 400 });
    }

    const records = await fetchAuditRecords();
    const currentRun = runStore.getLatestRun();

    if (!records || records.length === 0) {
      return NextResponse.json({
        success: true,
        response: 'No reconciliation audit data is available. Please click **Run Reconciliation** on the dashboard first.',
      });
    }

    // Prepare structured context string
    const total = records.length;
    const exact = records.filter((r) => r.status === 'EXACT_MATCH');
    const agent = records.filter((r) => r.status === 'RESOLVED_BY_AGENT');
    const exceptions = records.filter((r) => r.status === 'FLAGGED_EXCEPTION');
    const rate = total > 0 ? ((exact.length + agent.length) / total * 100).toFixed(1) : '0';
    const totalRisk = exceptions.reduce((a, r) => a + r.difference_amount, 0);

    const contextString = `
Active Run ID: ${currentRun?.runId || 'RUN-001'}
Total Records: ${total}
Exact Matches: ${exact.length}
Rule/AI Resolved: ${agent.length}
Exceptions Needing Review: ${exceptions.length}
Resolution Rate: ${rate}%
Total Unresolved Exposure: ₹${formatRupeesToINR(totalRisk)}

Key Exceptions:
${exceptions.slice(0, 5).map((e) => `- ${e.txn_id} (${e.payment_method}): Ledger ₹${e.internal_amount} vs Bank ₹${e.bank_amount}. Reason: ${e.explanation}`).join('\n')}
`;

    // Try Gemini AI Provider first
    if (geminiAIProvider.isAvailable()) {
      const aiResponse = await geminiAIProvider.answerControllerQuestion(prompt, contextString);
      if (aiResponse) {
        return NextResponse.json({ success: true, response: aiResponse });
      }
    }

    // Smart Deterministic Response Fallback
    const q = prompt.toLowerCase();
    const txnMatch = prompt.match(/\b(TXN_\d+|BANK_REF_\d+|PG_SETTLE_\d+)\b/i);

    if (txnMatch) {
      const targetId = txnMatch[0].toUpperCase();
      const rec = records.find((r) => r.txn_id.toUpperCase() === targetId);
      if (rec) {
        return NextResponse.json({
          success: true,
          response: `**${rec.txn_id} — ${rec.status}**\n\n` +
            `• **Ledger Amount:** ₹${formatRupeesToINR(rec.internal_amount)} (${rec.internal_date})\n` +
            `• **Bank Amount:** ₹${formatRupeesToINR(rec.bank_amount)} (${rec.bank_date})\n` +
            `• **Payment Method:** ${rec.payment_method}\n` +
            `• **Match Score:** ${rec.confidence_score} / 100\n` +
            `• **Explanation:** ${rec.explanation}\n\n` +
            (rec.status === 'FLAGGED_EXCEPTION' ? '⚠️ **Action:** Use the Review drawer to inspect evidence and log a resolution.' : '✅ **No action required.**'),
        });
      }
    }

    if (q.includes('exception') || q.includes('risk') || q.includes('unmatched')) {
      let resp = `⚠️ **${exceptions.length} Controller Exceptions** (Total At-Risk Exposure: **₹${formatRupeesToINR(totalRisk)}**):\n\n`;
      exceptions.forEach((e, i) => {
        resp += `${i + 1}. **${e.txn_id}** (${e.payment_method}) — Ledger ₹${formatRupeesToINR(e.internal_amount)} vs Bank ₹${formatRupeesToINR(e.bank_amount)}. *${e.explanation}*\n`;
      });
      return NextResponse.json({ success: true, response: resp });
    }

    if (q.includes('rate') || q.includes('accuracy') || q.includes('summary')) {
      return NextResponse.json({
        success: true,
        response: `📊 **Reconciliation Overview (${currentRun?.runId || 'RUN-001'})**:\n\n` +
          `• **Total Processed:** ${total} transactions\n` +
          `• **Exact Matches:** ${exact.length}\n` +
          `• **Rule / AI Resolved:** ${agent.length}\n` +
          `• **Needs Review:** ${exceptions.length}\n` +
          `• **Match / Resolution Rate:** **${rate}%**\n\n` +
          `Estimated manual effort avoided: **~${Math.round((exact.length + agent.length) * 2 / 60 * 10) / 10} hrs** (@ 2 min/review assumption).`,
      });
    }

    return NextResponse.json({
      success: true,
      response: `🤖 **Nexus Reconcile Assistant**\n\nI am monitoring **${total} transactions** in active run **${currentRun?.runId || 'RUN-001'}** with a **${rate}% resolution rate**.\n\nYou can ask me:\n• *"Show me all exceptions"*\n• *"Why was TXN_6358 flagged?"*\n• *"What is our current match rate?"*\n• *"How much is at risk?"*`,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
