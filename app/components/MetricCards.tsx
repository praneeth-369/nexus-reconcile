'use client';

import React from 'react';
import { CheckCircle2, Bot, AlertTriangle, FileSpreadsheet, Percent, DollarSign, Clock, HelpCircle } from 'lucide-react';
import { formatRupeesToINR, calculateEffortAvoidedHours } from '@/lib/financeUtils';

interface MetricCardsProps {
  summary: {
    total: number;
    exactMatches: number;
    agentMatches: number;
    exceptions: number;
    matchRatePct: number;
    totalFeeDiscrepancy: number;
    unresolvedDiscrepancyAmount: number;
  };
  isLoading?: boolean;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ summary, isLoading }) => {
  const resolvedCount = summary.exactMatches + summary.agentMatches;
  const effort = calculateEffortAvoidedHours(resolvedCount, 2);

  const cards = [
    {
      title: 'Resolution Rate',
      value: `${summary.matchRatePct}%`,
      subtitle: `${resolvedCount} of ${summary.total} resolved`,
      icon: Percent,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      progress: summary.matchRatePct,
    },
    {
      title: 'Automatically Resolved',
      value: `${resolvedCount} / ${summary.total}`,
      subtitle: `${summary.exactMatches} exact + ${summary.agentMatches} rule/AI`,
      icon: CheckCircle2,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Controller Exceptions',
      value: summary.exceptions.toString(),
      subtitle: 'Unmatched differences',
      icon: AlertTriangle,
      color: 'text-amber-500 dark:text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
    {
      title: 'Unresolved Exposure',
      value: `₹${formatRupeesToINR(summary.unresolvedDiscrepancyAmount)}`,
      subtitle: 'Total amount at risk',
      icon: DollarSign,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Gateway Fees Matched',
      value: `₹${formatRupeesToINR(summary.totalFeeDiscrepancy)}`,
      subtitle: '2% MDR + 18% GST matched',
      icon: FileSpreadsheet,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
    },
    {
      title: 'Manual Effort Avoided',
      value: effort.formattedText,
      subtitle: 'Assumes 2 min / review',
      icon: Clock,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
      hasTooltip: true,
      tooltipText: effort.assumptionNote,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {cards.map((card, idx) => {
        const IconComponent = card.icon;
        return (
          <div
            key={idx}
            className={`p-4 rounded-xl border bg-white dark:bg-[#131B2A] border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 relative ${
              isLoading ? 'animate-pulse opacity-70' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate flex items-center space-x-1">
                <span>{card.title}</span>
                {card.hasTooltip && (
                  <span className="group relative cursor-help">
                    <HelpCircle className="w-3 h-3 text-slate-400" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-48 p-2 text-[10px] bg-slate-900 text-white rounded-lg shadow-lg z-20">
                      {card.tooltipText}
                    </span>
                  </span>
                )}
              </span>
              <div className={`p-1.5 rounded-lg ${card.bgColor} ${card.color}`}>
                <IconComponent className="w-4 h-4" />
              </div>
            </div>

            <div className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-1">
              {card.value}
            </div>

            {card.progress !== undefined ? (
              <div className="w-full bg-slate-200 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, card.progress))}%` }}
                ></div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {card.subtitle}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
