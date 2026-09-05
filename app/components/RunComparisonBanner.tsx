'use client';

import React from 'react';
import { ArrowUpRight, ArrowDownRight, GitCompare, History } from 'lucide-react';
import { formatRupeesToINR } from '@/lib/financeUtils';

interface RunComparisonBannerProps {
  currentRun: {
    runId: string;
    resolutionRatePct: number;
    unresolvedExposureRupees: number;
    totalRecords: number;
    exceptions: number;
  };
  prevRun: {
    runId: string;
    resolutionRatePct: number;
    unresolvedExposureRupees: number;
    totalRecords: number;
    exceptions: number;
  } | null;
}

export const RunComparisonBanner: React.FC<RunComparisonBannerProps> = ({ currentRun, prevRun }) => {
  if (!prevRun) {
    return null;
  }

  const rateDelta = Math.round((currentRun.resolutionRatePct - prevRun.resolutionRatePct) * 10) / 10;
  const exposureDelta = currentRun.unresolvedExposureRupees - prevRun.unresolvedExposureRupees;

  return (
    <div className="w-full mb-6 p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
          <GitCompare className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-extrabold text-xs text-indigo-400 uppercase tracking-wider">Run Comparison</span>
            <span className="text-xs text-slate-400 font-mono">
              {prevRun.runId} → {currentRun.runId}
            </span>
          </div>
          <p className="text-xs text-slate-300">
            Comparing resolution efficiency and exposure against prior reconciliation run
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-4 font-mono text-xs">
        {/* Rate Delta */}
        <div className="p-2 px-3 rounded-xl bg-slate-800 border border-slate-700/60">
          <span className="text-[10px] text-slate-400 block font-sans">Resolution Rate</span>
          <div className="flex items-center space-x-1 font-bold">
            <span>{prevRun.resolutionRatePct}% → {currentRun.resolutionRatePct}%</span>
            {rateDelta >= 0 ? (
              <span className="text-emerald-400 flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5" />+{rateDelta} pp
              </span>
            ) : (
              <span className="text-red-400 flex items-center">
                <ArrowDownRight className="w-3.5 h-3.5" />{rateDelta} pp
              </span>
            )}
          </div>
        </div>

        {/* Exposure Delta */}
        <div className="p-2 px-3 rounded-xl bg-slate-800 border border-slate-700/60">
          <span className="text-[10px] text-slate-400 block font-sans">Unresolved Exposure</span>
          <div className="flex items-center space-x-1 font-bold">
            <span>₹{formatRupeesToINR(currentRun.unresolvedExposureRupees)}</span>
            {exposureDelta <= 0 ? (
              <span className="text-emerald-400 flex items-center">
                <ArrowDownRight className="w-3.5 h-3.5" />-₹{formatRupeesToINR(Math.abs(exposureDelta))}
              </span>
            ) : (
              <span className="text-red-400 flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5" />+₹{formatRupeesToINR(exposureDelta)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
