'use client';

import React, { useState, useMemo } from 'react';
import { AuditRecord } from '@/lib/firebaseAdmin';
import { formatRupeesToINR } from '@/lib/financeUtils';
import {
  Search,
  Download,
  CheckCircle,
  Bot,
  AlertTriangle,
  Eye,
  UserCheck,
  UserX,
  Mail,
  Lock,
  CheckCircle2,
  Copy,
  Check
} from 'lucide-react';

interface AuditTableProps {
  records: AuditRecord[];
  isLoading?: boolean;
  onSelectRecord?: (rec: AuditRecord) => void;
  triageFilter?: 'ALL' | 'CRITICAL' | 'ATTENTION' | 'HEALTHY';
  onTriageFilterChange?: (filter: 'ALL' | 'CRITICAL' | 'ATTENTION' | 'HEALTHY') => void;
}

export const AuditTable: React.FC<AuditTableProps> = ({
  records,
  isLoading,
  onSelectRecord,
  triageFilter = 'ALL',
  onTriageFilterChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'EXACT' | 'AGENT' | 'HUMAN' | 'REFUSED'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (idText: string) => {
    navigator.clipboard.writeText(idText);
    setCopiedId(idText);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      // Apply external triageFilter if set
      if (triageFilter === 'CRITICAL') {
        if (rec.urgency_category !== 'CRITICAL' && rec.difference_amount < 5000) return false;
      } else if (triageFilter === 'ATTENTION') {
        if (rec.urgency_category !== 'ATTENTION_REQUIRED' && rec.bank_date !== 'PENDING') return false;
      } else if (triageFilter === 'HEALTHY') {
        if (rec.urgency_category !== 'HEALTHY' && rec.status !== 'EXACT_MATCH' && rec.status !== 'RESOLVED_BY_AGENT' && rec.status !== 'HUMAN_MATCHED') return false;
      }

      // Apply sub-tab
      if (activeTab === 'EXACT' && rec.status !== 'EXACT_MATCH') return false;
      if (activeTab === 'AGENT' && rec.status !== 'RESOLVED_BY_AGENT') return false;
      if (activeTab === 'HUMAN' && rec.status !== 'HUMAN_RESOLVED' && rec.status !== 'HUMAN_MATCHED' && rec.status !== 'HUMAN_UNMATCHED') return false;
      if (activeTab === 'REFUSED' && rec.policyAuth?.decision !== 'REFUSED_FAIL_CLOSED' && rec.status !== 'FLAGGED_EXCEPTION') return false;

      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        rec.txn_id.toLowerCase().includes(q) ||
        (rec.razorpay_payment_id && rec.razorpay_payment_id.toLowerCase().includes(q)) ||
        (rec.razorpay_settlement_id && rec.razorpay_settlement_id.toLowerCase().includes(q)) ||
        rec.payment_method.toLowerCase().includes(q) ||
        rec.explanation.toLowerCase().includes(q) ||
        rec.status.toLowerCase().includes(q) ||
        rec.match_type.toLowerCase().includes(q)
      );
    });
  }, [records, activeTab, triageFilter, searchTerm]);

  const handleExportCSV = () => {
    if (!filteredRecords.length) return;
    const headers = [
      'txn_id',
      'razorpay_payment_id',
      'razorpay_settlement_id',
      'internal_amount',
      'bank_amount',
      'internal_date',
      'bank_date',
      'payment_method',
      'status',
      'policy_decision',
      'match_score_100',
      'difference_amount',
      'explanation',
    ];
    const rows = filteredRecords.map((r) => [
      r.txn_id,
      r.razorpay_payment_id || r.txn_id,
      r.razorpay_settlement_id || '',
      r.internal_amount,
      r.bank_amount,
      r.internal_date,
      r.bank_date,
      r.payment_method,
      r.status,
      r.policyAuth?.decision || 'UNKNOWN',
      `${r.confidence_score} / 100`,
      r.difference_amount,
      `"${r.explanation.replace(/"/g, '""')}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nexus_reconcile_audit_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const refusedCount = records.filter(
    (r) => r.policyAuth?.decision === 'REFUSED_FAIL_CLOSED' || r.status === 'FLAGGED_EXCEPTION'
  ).length;

  return (
    <div className="w-full bg-white dark:bg-[#131B2A] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-8">
      {/* Table Action Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'ALL'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({records.length})
          </button>
          <button
            onClick={() => setActiveTab('EXACT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'EXACT'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-emerald-500'
            }`}
          >
            Exact Matches ({records.filter((r) => r.status === 'EXACT_MATCH').length})
          </button>
          <button
            onClick={() => setActiveTab('AGENT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'AGENT'
                ? 'bg-cyan-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-cyan-500'
            }`}
          >
            Rule / MDR ({records.filter((r) => r.status === 'RESOLVED_BY_AGENT').length})
          </button>
          <button
            onClick={() => setActiveTab('HUMAN')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'HUMAN'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-indigo-500'
            }`}
          >
            Human Reviewed (
            {
              records.filter(
                (r) =>
                  r.status === 'HUMAN_RESOLVED' ||
                  r.status === 'HUMAN_MATCHED' ||
                  r.status === 'HUMAN_UNMATCHED'
              ).length
            }
            )
          </button>
          <button
            onClick={() => setActiveTab('REFUSED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1 ${
              activeTab === 'REFUSED'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-rose-500 hover:bg-rose-500/10'
            }`}
          >
            <Lock className="w-3 h-3" />
            <span>Fail-Closed Refusals ({refusedCount})</span>
          </button>
        </div>

        {/* Search & Export Buttons */}
        <div className="flex items-center space-x-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search pay_, setl_, reason..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>

          <button
            onClick={handleExportCSV}
            disabled={!filteredRecords.length}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold transition disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Audit Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 font-medium uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="py-3.5 px-4">Razorpay Entity ID</th>
              <th className="py-3.5 px-4 text-center">Confidence</th>
              <th className="py-3.5 px-4 text-center">Policy Decision</th>
              <th className="py-3.5 px-4">Method</th>
              <th className="py-3.5 px-4 text-right">Ledger Gross</th>
              <th className="py-3.5 px-4 text-right">Bank Settlement</th>
              <th className="py-3.5 px-4">Timeline</th>
              <th className="py-3.5 px-4">Audit Rationale & Policy</th>
              <th className="py-3.5 px-4 text-center">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={9} className="py-4 px-4">
                    <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full"></div>
                  </td>
                </tr>
              ))
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500 dark:text-slate-400">
                  No matching records found.
                </td>
              </tr>
            ) : (
              filteredRecords.map((rec) => {
                const isFailClosed =
                  rec.policyAuth?.decision === 'REFUSED_FAIL_CLOSED' ||
                  (rec.status === 'FLAGGED_EXCEPTION' && !!rec.policyAuth?.refusalReason);

                let scoreTextClass = 'text-emerald-600 dark:text-emerald-400 font-bold';
                if (rec.confidence_score < 70) {
                  scoreTextClass = 'text-rose-500 font-bold';
                } else if (rec.confidence_score < 90) {
                  scoreTextClass = 'text-amber-500 font-bold';
                }

                return (
                  <tr
                    key={rec.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => onSelectRecord && onSelectRecord(rec)}
                  >
                    <td className="py-3.5 px-4 font-mono">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {rec.razorpay_payment_id || rec.txn_id}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(rec.razorpay_payment_id || rec.txn_id);
                          }}
                          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          {copiedId === (rec.razorpay_payment_id || rec.txn_id) ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                      {rec.razorpay_settlement_id && (
                        <span className="text-[10px] text-slate-400 block font-sans">
                          Setl: {rec.razorpay_settlement_id}
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${scoreTextClass}`}>
                        {rec.confidence_score}%
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {isFailClosed ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                          <Lock className="w-3 h-3" />
                          <span>REFUSED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>AUTHORIZED</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]">
                        {rec.payment_method}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-900 dark:text-slate-100">
                      ₹{formatRupeesToINR(rec.internal_amount)}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-900 dark:text-slate-100">
                      <span className={rec.bank_amount === 0 ? 'text-rose-500' : ''}>
                        ₹{formatRupeesToINR(rec.bank_amount)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {rec.internal_date} &rarr; {rec.bank_date}
                    </td>

                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 max-w-sm">
                      <p className="line-clamp-2 text-[11px] leading-relaxed">{rec.explanation}</p>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onSelectRecord) onSelectRecord(rec);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500 transition"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
        <span>
          Showing {filteredRecords.length} of {records.length} records
        </span>
        <span className="font-mono text-[11px]">Nexus Deterministic Policy Engine (Rules Authorize)</span>
      </div>
    </div>
  );
};
