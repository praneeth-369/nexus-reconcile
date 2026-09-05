'use client';

import React from 'react';
import { CreditCard, Webhook, Cpu, ShieldCheck, Landmark, ArrowRight } from 'lucide-react';

interface PipelineProps {
  pipeline: {
    ingestCount: number;
    validateCount: number;
    normalizeCount: number;
    exactMatchCount: number;
    ruleMatchCount: number;
    aiControllerCount: number;
    humanReviewCount: number;
  };
}

export const ReconciliationPipeline: React.FC<PipelineProps> = ({ pipeline }) => {
  const stages = [
    {
      step: '1',
      name: 'Razorpay Payment',
      event: 'payment.captured',
      detail: `${pipeline.ingestCount} Gross Txns`,
      icon: CreditCard,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      step: '2',
      name: 'Webhook Trigger',
      event: 'settlement.processed',
      detail: 'Real-time Ingestion',
      icon: Webhook,
      color: 'text-purple-500',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
    {
      step: '3',
      name: 'Settlement Engine',
      event: 'MDR & Tax Offsets',
      detail: 'Fee Deduction Calc',
      icon: Cpu,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      step: '4',
      name: 'Nexus Policy Controller',
      event: 'Rules Authorize',
      detail: `${pipeline.exactMatchCount + pipeline.ruleMatchCount} Authorized`,
      icon: ShieldCheck,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
    },
    {
      step: '5',
      name: 'Bank Ledger',
      event: 'Settlement Feed',
      detail: 'Final Reconciled State',
      icon: Landmark,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
  ];

  return (
    <div className="w-full mb-6 p-4 rounded-2xl bg-white dark:bg-[#131B2A] border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-extrabold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
            Razorpay Native Webhook & Settlement Pipeline
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            payment.captured &rarr; settlement.processed &rarr; Nexus Controller &rarr; Bank Ledger
          </p>
        </div>
        <span className="text-[10px] text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded font-mono font-bold">
          Razorpay Webhook v2.0
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {stages.map((stg, i) => {
          const IconComp = stg.icon;
          return (
            <div
              key={i}
              className={`p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border ${stg.border} flex flex-col justify-between relative overflow-hidden`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono font-bold text-slate-400">STAGE {stg.step}</span>
                <div className={`p-1.5 rounded-lg ${stg.bg} ${stg.color}`}>
                  <IconComp className="w-3.5 h-3.5" />
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">{stg.name}</p>
                <p className="text-[10px] font-mono text-blue-600 dark:text-blue-400 font-semibold">{stg.event}</p>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
                <span>{stg.detail}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
