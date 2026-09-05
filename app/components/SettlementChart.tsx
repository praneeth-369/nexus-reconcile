'use client';

import React from 'react';
import { AuditRecord } from '@/lib/firebaseAdmin';

interface SettlementChartProps {
  records: AuditRecord[];
}

export const SettlementChart: React.FC<SettlementChartProps> = ({ records }) => {
  const total = records.length;

  if (!total) {
    return null;
  }

  const exactCount = records.filter((r) => r.status === 'EXACT_MATCH').length;
  const agentCount = records.filter((r) => r.status === 'RESOLVED_BY_AGENT').length;
  const exceptionCount = records.filter((r) => r.status === 'FLAGGED_EXCEPTION').length;

  const exactPct = Math.round((exactCount / total) * 100);
  const agentPct = Math.round((agentCount / total) * 100);
  const exceptionPct = Math.max(0, 100 - (exactPct + agentPct));

  return (
    <div className="w-full bg-white dark:bg-[#131B2A] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            Match Distribution Breakdown
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Categorized by deterministic exact match, rule/AI assistance, and controller exception
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-400 block font-medium">Total Processed</span>
          <span className="text-sm font-mono font-bold text-slate-900 dark:text-white">
            {total} Records
          </span>
        </div>
      </div>

      {/* Stacked Segment Bar */}
      <div className="w-full h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex mb-4 border border-slate-200 dark:border-slate-700/60">
        <div
          className="bg-emerald-500 h-full transition-all duration-500 relative group"
          style={{ width: `${exactPct}%` }}
          title={`Exact 1:1 Match: ${exactCount} (${exactPct}%)`}
        />
        <div
          className="bg-cyan-500 h-full transition-all duration-500 relative group"
          style={{ width: `${agentPct}%` }}
          title={`Rule / AI Resolution: ${agentCount} (${agentPct}%)`}
        />
        <div
          className="bg-red-500 h-full transition-all duration-500 relative group"
          style={{ width: `${exceptionPct}%` }}
          title={`Needs Controller Review: ${exceptionCount} (${exceptionPct}%)`}
        />
      </div>

      {/* Legend Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Exact 1:1 Match</span>
          </div>
          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
            {exactCount} <span className="text-slate-400 font-normal">({exactPct}%)</span>
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Rule / AI Resolution</span>
          </div>
          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
            {agentCount} <span className="text-slate-400 font-normal">({agentPct}%)</span>
          </span>
        </div>

        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Needs Controller Review</span>
          </div>
          <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
            {exceptionCount} <span className="text-slate-400 font-normal">({exceptionPct}%)</span>
          </span>
        </div>
      </div>
    </div>
  );
};
