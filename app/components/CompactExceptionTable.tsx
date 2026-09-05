'use client';

import React from 'react';
import { AuditRecord } from '@/lib/firebaseAdmin';
import { formatRupeesToINR } from '@/lib/financeUtils';
import { AlertTriangle, ShieldAlert, ArrowRight, Eye, Lock } from 'lucide-react';

interface CompactExceptionTableProps {
  exceptions: AuditRecord[];
  onSelectRecord: (rec: AuditRecord) => void;
}

export const CompactExceptionTable: React.FC<CompactExceptionTableProps> = ({
  exceptions,
  onSelectRecord,
}) => {
  if (!exceptions || exceptions.length === 0) {
    return (
      <div className="w-full p-4 mb-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-3 text-emerald-600 dark:text-emerald-400">
        <ShieldAlert className="w-5 h-5 flex-shrink-0" />
        <p className="text-xs font-semibold">
          Zero unmatched exceptions! All payments successfully authorized by Deterministic Policy Engine.
        </p>
      </div>
    );
  }

  const totalAtRisk = exceptions.reduce((acc, curr) => acc + curr.difference_amount, 0);

  const getSeverityBadge = (rec: AuditRecord) => {
    const diff = Math.abs(rec.internal_amount - rec.bank_amount);
    if (rec.urgency_category === 'CRITICAL' || diff >= 5000) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-500/20 text-rose-500 border border-rose-500/30">
          🔴 CRITICAL
        </span>
      );
    }
    if (rec.urgency_category === 'ATTENTION_REQUIRED' || rec.bank_date === 'PENDING') {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-500 border border-amber-500/30">
          🟠 ATTENTION
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-500/20 text-blue-500 border border-blue-500/30">
        LOW
      </span>
    );
  };

  return (
    <div className="w-full mb-6 bg-white dark:bg-[#131B2A] border border-amber-500/30 dark:border-amber-500/30 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border-b border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 border border-amber-500/30 animate-pulse">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                Controller Priority Exceptions & Fail-Closed Refusals
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-rose-500/20 text-rose-500 border border-rose-500/30 font-mono">
                {exceptions.length} Refused / Unresolved
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deterministic Policy Engine enforced fail-closed refusal. Requires controller human authorization.
            </p>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <span className="text-[10px] text-slate-400 font-medium uppercase block">Total At-Risk Exposure</span>
          <span className="text-lg font-mono font-extrabold text-rose-500">
            ₹{formatRupeesToINR(totalAtRisk)}
          </span>
        </div>
      </div>

      {/* Compact Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 font-medium uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4">Urgency</th>
              <th className="py-3 px-4">Razorpay Entity ID</th>
              <th className="py-3 px-4">Method</th>
              <th className="py-3 px-4 text-right">Ledger Gross</th>
              <th className="py-3 px-4 text-right">Bank Settlement</th>
              <th className="py-3 px-4 text-right">Discrepancy / Risk</th>
              <th className="py-3 px-4">Policy Rationale & Refusal Reason</th>
              <th className="py-3 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
            {exceptions.map((ex) => {
              const diff = Math.abs(ex.internal_amount - ex.bank_amount);
              const isCollision = ex.policyAuth?.policyRule === 'POLICY_FAIL_CLOSED_AMBIGUOUS_CANDIDATES' ||
                (ex.candidatesEvaluated && ex.candidatesEvaluated.length > 1);

              return (
                <tr
                  key={ex.id}
                  className="hover:bg-amber-500/5 transition-colors cursor-pointer"
                  onClick={() => onSelectRecord(ex)}
                >
                  <td className="py-3 px-4 font-sans">{getSeverityBadge(ex)}</td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-slate-900 dark:text-white block">
                      {ex.razorpay_payment_id || ex.txn_id}
                    </span>
                    {ex.razorpay_settlement_id && (
                      <span className="text-[10px] text-slate-400 block font-sans">
                        Setl: {ex.razorpay_settlement_id}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-sans">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px]">
                      {ex.payment_method}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-slate-900 dark:text-slate-100 font-medium">
                    ₹{formatRupeesToINR(ex.internal_amount)}
                  </td>
                  <td className="py-3 px-4 text-right text-rose-500 font-medium">
                    ₹{formatRupeesToINR(ex.bank_amount)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-500 font-bold">
                    ₹{formatRupeesToINR(diff)}
                  </td>
                  <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-sans max-w-sm">
                    {isCollision ? (
                      <div className="flex items-center space-x-1.5 text-rose-600 dark:text-rose-400 font-bold text-[11px]">
                        <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate font-mono">
                          Confidence insufficient. Multiple plausible candidates. DO NOT AUTO-RESOLVE.
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1 text-rose-600 dark:text-rose-400 font-semibold text-[11px]">
                          <Lock className="w-3 h-3 flex-shrink-0" />
                          <span>{ex.policyAuth?.policyLabel || 'Policy Refusal'}</span>
                        </div>
                        <p className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {ex.explanation}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center font-sans">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectRecord(ex);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold text-[11px] border border-amber-500/30 flex items-center space-x-1 mx-auto transition"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Review</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
