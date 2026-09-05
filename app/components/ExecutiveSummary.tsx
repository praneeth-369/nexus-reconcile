'use client';

import React from 'react';
import { Sparkles, ShieldCheck, AlertTriangle, ArrowRight } from 'lucide-react';
import { formatRupeesToINR } from '@/lib/financeUtils';

interface ExecutiveSummaryProps {
  summary: {
    total: number;
    exactMatches: number;
    agentMatches: number;
    exceptions: number;
    matchRatePct: number;
    totalFeeDiscrepancy: number;
    unresolvedDiscrepancyAmount: number;
  };
  aiSummary?: {
    headline: string;
    executiveSummary: string;
    controllerInsight: string;
    recommendedNextStep: string;
  } | null;
  datasetLabel?: string;
  onViewExceptions?: () => void;
}

export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  summary,
  aiSummary,
  datasetLabel,
  onViewExceptions,
}) => {
  const resolvedCount = summary.exactMatches + summary.agentMatches;
  const execText = aiSummary?.executiveSummary ||
    `Reconciliation complete. ${resolvedCount} of ${summary.total} payments were automatically resolved (${summary.matchRatePct}%). ${summary.exceptions} exceptions totaling ₹${formatRupeesToINR(summary.unresolvedDiscrepancyAmount)} require controller review. ₹${formatRupeesToINR(summary.totalFeeDiscrepancy)} in gateway fees and taxes were identified.`;

  const insightText = aiSummary?.controllerInsight ||
    `${summary.exceptions} transactions represent ₹${formatRupeesToINR(summary.unresolvedDiscrepancyAmount)} in unresolved risk. ${summary.agentMatches} transactions were auto-matched using 2.0% MDR fee and business-day settlement rules.`;

  const nextStepText = aiSummary?.recommendedNextStep ||
    (summary.exceptions > 0
      ? `Review the ${Math.min(3, summary.exceptions)} highest-value unresolved exceptions first.`
      : 'All transactions resolved cleanly. No manual action required.');

  return (
    <div className="w-full mb-6 space-y-4">
      {/* 5-Second Executive Banner */}
      <div className="w-full p-5 rounded-2xl bg-gradient-to-r from-blue-900/90 via-indigo-900/90 to-slate-900 border border-blue-500/30 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30 flex-shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="font-extrabold text-sm text-blue-300 uppercase tracking-wider">Executive Overview</span>
              {datasetLabel && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-slate-300 border border-white/10">
                  {datasetLabel}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-100 leading-relaxed max-w-3xl">
              {execText}
            </p>
          </div>
        </div>

        {summary.exceptions > 0 && onViewExceptions && (
          <button
            onClick={onViewExceptions}
            className="flex-shrink-0 flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition active:scale-95"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Review {summary.exceptions} Exceptions</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Controller Insight Block */}
      <div className="w-full p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131B2A] border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex-shrink-0">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider mb-0.5">
              Controller Operational Insight
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {insightText}
            </p>
          </div>
        </div>

        <div className="md:text-right flex-shrink-0 pl-4 border-l border-slate-200 dark:border-slate-800">
          <span className="text-[10px] text-slate-400 uppercase font-bold block mb-0.5">Recommended Next Action</span>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
            {nextStepText}
          </span>
        </div>
      </div>
    </div>
  );
};
