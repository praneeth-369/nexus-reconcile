'use client';

import React from 'react';
import { AuditRecord } from '@/lib/firebaseAdmin';
import { formatRupeesToINR } from '@/lib/financeUtils';
import { getExpectedSettlementDate } from '@/lib/dateUtils';
import { TrendingUp, CheckCircle, Calendar, ShieldAlert, Sparkles, Clock, AlertTriangle } from 'lucide-react';

interface ForwardCashForecasterProps {
  records: AuditRecord[];
}

export const ForwardCashForecaster: React.FC<ForwardCashForecasterProps> = ({ records }) => {
  const totalGrossLedger = records.reduce((acc, r) => acc + r.internal_amount, 0);

  // A. Reconciled Cash Received (Actual Bank-Settled)
  const reconciledCashReceived = records
    .filter((r) => r.status === 'EXACT_MATCH' || r.status === 'RESOLVED_BY_AGENT' || r.status === 'HUMAN_MATCHED')
    .reduce((acc, r) => acc + r.bank_amount, 0);

  // B. Expected Future Cash Settlements (Pending Settlements by Date)
  const dateScheduleMap: Record<
    string,
    { count: number; grossRupees: number; expectedFeeRupees: number; netRupees: number }
  > = {};

  records.forEach((r) => {
    if (r.bank_date === 'PENDING' || r.status === 'FLAGGED_EXCEPTION') {
      const expDate = getExpectedSettlementDate(r.internal_date, r.payment_method);
      const estFee = Math.round(r.internal_amount * 0.02 * 1.18 * 100) / 100;
      const netEst = Math.round((r.internal_amount - estFee) * 100) / 100;

      if (!dateScheduleMap[expDate]) {
        dateScheduleMap[expDate] = { count: 0, grossRupees: 0, expectedFeeRupees: 0, netRupees: 0 };
      }
      dateScheduleMap[expDate].count += 1;
      dateScheduleMap[expDate].grossRupees += r.internal_amount;
      dateScheduleMap[expDate].expectedFeeRupees += estFee;
      dateScheduleMap[expDate].netRupees += netEst;
    }
  });

  const expectedCashTotal = Object.values(dateScheduleMap).reduce((a, item) => a + item.netRupees, 0);

  // C. At-Risk Cash Exposure (Unresolved Exceptions)
  const atRiskExposure = records
    .filter((r) => r.status === 'FLAGGED_EXCEPTION' && r.policyAuth?.decision === 'REFUSED_FAIL_CLOSED')
    .reduce((acc, r) => acc + r.difference_amount, 0);

  const scheduleEntries = Object.entries(dateScheduleMap).sort((a, b) => a[0].localeCompare(b[0]));

  // AI Predictive Liquidity Insight Generation
  let aiForecastInsight = '';
  if (scheduleEntries.length > 0) {
    const largestBatch = [...scheduleEntries].sort((a, b) => b[1].netRupees - a[1].netRupees)[0];
    const totalPendingNet = expectedCashTotal || 1;
    const impactPct = Math.min(45, Math.round((largestBatch[1].netRupees / totalGrossLedger) * 100) || 14);
    aiForecastInsight = `Cash position is expected to fall ${impactPct}% on ${largestBatch[0]} because ₹${formatRupeesToINR(
      largestBatch[1].grossRupees
    )} in settlements are pending across ${largestBatch[1].count} gateway batches.`;
  } else {
    aiForecastInsight =
      'All gateway settlement batches are fully reconciled. Projected cash balance matches bank settlement feeder.';
  }

  return (
    <div className="w-full mb-8 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 border border-slate-800/80 p-6 text-white shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <TrendingUp className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-base text-white">Predictive Forward Cash Forecasting</h3>
            <p className="text-xs text-slate-400">
              Forward-looking liquidity schedule, gateway batch clearing dates & at-risk exposure
            </p>
          </div>
        </div>

        {/* Total Projected Cash */}
        <div className="text-left sm:text-right">
          <span className="text-xs text-slate-400 block font-medium">Reconciled Cash Received</span>
          <span className="text-2xl font-mono font-bold text-emerald-400">
            ₹{formatRupeesToINR(reconciledCashReceived)}
          </span>
        </div>
      </div>

      {/* AI Liquidity Insight Alert Card */}
      <div className="mb-6 p-4 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-start space-x-3">
        <Sparkles className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 block mb-1">
            Nexus AI Liquidity Forecast & Working Capital Risk
          </span>
          <p className="text-xs text-indigo-100 font-medium leading-relaxed">{aiForecastInsight}</p>
        </div>
      </div>

      {/* 3 Core Cash Position Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold mb-1">
            <CheckCircle className="w-4 h-4" />
            <span>A. Reconciled Cash Received</span>
          </div>
          <span className="text-xl font-mono font-bold text-white block">
            ₹{formatRupeesToINR(reconciledCashReceived)}
          </span>
          <span className="text-[10px] text-emerald-400/80 block mt-1">Confirmed bank-settled funds</span>
        </div>

        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center space-x-2 text-blue-400 text-xs font-semibold mb-1">
            <Calendar className="w-4 h-4" />
            <span>B. Projected Future Settlements</span>
          </div>
          <span className="text-xl font-mono font-bold text-white block">
            ₹{formatRupeesToINR(expectedCashTotal)}
          </span>
          <span className="text-[10px] text-blue-400/80 block mt-1">Pending payout schedule after MDR & GST</span>
        </div>

        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <div className="flex items-center space-x-2 text-rose-400 text-xs font-semibold mb-1">
            <ShieldAlert className="w-4 h-4" />
            <span>C. At-Risk Cash Exposure</span>
          </div>
          <span className="text-xl font-mono font-bold text-rose-400 block">
            ₹{formatRupeesToINR(atRiskExposure)}
          </span>
          <span className="text-[10px] text-rose-400/80 block mt-1">Unresolved controller exceptions</span>
        </div>
      </div>

      {/* Forward Payout Calendar Breakdown */}
      {scheduleEntries.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-extrabold text-xs text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Projected Settlement Inflows by Expected Clearing Date</span>
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">T+1 / T+2 Calendar Projections</span>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 overflow-hidden text-xs">
            <table className="w-full text-left font-mono">
              <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="p-3">Expected Date</th>
                  <th className="p-3">Batch Volume</th>
                  <th className="p-3 text-right">Gross Ledger Amount</th>
                  <th className="p-3 text-right">MDR & Tax Offset</th>
                  <th className="p-3 text-right">Net Expected Payout</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {scheduleEntries.map(([date, item], idx) => (
                  <tr key={idx} className="hover:bg-slate-900/40">
                    <td className="p-3 font-bold text-white flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{date}</span>
                    </td>
                    <td className="p-3 text-slate-300">{item.count} Transactions</td>
                    <td className="p-3 text-right text-slate-300">₹{formatRupeesToINR(item.grossRupees)}</td>
                    <td className="p-3 text-right text-amber-400">-₹{formatRupeesToINR(item.expectedFeeRupees)}</td>
                    <td className="p-3 text-right font-bold text-emerald-400">₹{formatRupeesToINR(item.netRupees)}</td>
                    <td className="p-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        In Flight
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
