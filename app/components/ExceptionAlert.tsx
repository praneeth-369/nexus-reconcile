'use client';

import React, { useState } from 'react';
import { AuditRecord } from '@/lib/firebaseAdmin';
import { ShieldAlert, AlertTriangle, ArrowUpRight, Mail, X, Send } from 'lucide-react';

interface ExceptionAlertProps {
  exceptions: AuditRecord[];
}

interface ReviewEmailModalProps {
  exception: AuditRecord;
  onClose: () => void;
}

const ReviewEmailModal: React.FC<ReviewEmailModalProps> = ({ exception, onClose }) => {
  const [toEmail, setToEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendMail = () => {
    if (!toEmail.trim()) return;
    setSending(true);

    const subject = encodeURIComponent(
      `[Nexus Reconcile] Manual Review Required — ${exception.txn_id}`
    );

    const diff = Math.abs(exception.internal_amount - exception.bank_amount);
    const body = encodeURIComponent(
      `Hi,

A payment transaction has been flagged for manual review by Nexus Reconcile.

─────────────────────────────────────
TRANSACTION DETAILS
─────────────────────────────────────
Transaction ID   : ${exception.txn_id}
Payment Method   : ${exception.payment_method}
Match Score      : ${exception.confidence_score}%

Ledger Amount    : ₹${exception.internal_amount.toLocaleString('en-IN')}
Bank Amount      : ₹${exception.bank_amount.toLocaleString('en-IN')}
Difference       : ₹${diff.toLocaleString('en-IN')}

Ledger Date      : ${exception.internal_date}
Bank Date        : ${exception.bank_date}

─────────────────────────────────────
REASON FOR REVIEW
─────────────────────────────────────
${exception.explanation}

Please investigate this discrepancy and update the reconciliation record.

Flagged by Nexus Reconcile on ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
`
    );

    const mailtoLink = `mailto:${toEmail}?subject=${subject}&body=${body}`;
    window.open(mailtoLink, '_blank');

    setSending(false);
    setSent(true);

    // Auto close after 2 seconds
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#131B2A] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-red-50 dark:bg-red-500/5">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-red-500/15 text-red-500">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Send for Review</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Opens your email app with details pre-filled</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Transaction Summary */}
        <div className="px-6 pt-4 pb-3">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono font-bold text-sm text-red-500">{exception.txn_id}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/30">
                {exception.confidence_score}% Match
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <span className="text-slate-400 text-[10px] block">Ledger</span>
                <span className="font-semibold text-slate-900 dark:text-white">₹{exception.internal_amount.toLocaleString('en-IN')}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[10px] block">Bank</span>
                <span className="font-semibold text-red-500">₹{exception.bank_amount.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {exception.explanation}
            </p>
          </div>

          {/* Recipient Email Input */}
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Send to email address
          </label>
          <input
            type="email"
            placeholder="reviewer@yourcompany.com"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMail()}
            disabled={sent}
            className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-400 transition disabled:opacity-50"
          />
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
            This will open your email app (Gmail, Outlook, etc.) with all details pre-filled.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-5 pt-2 flex items-center space-x-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSendMail}
            disabled={!toEmail.trim() || sent}
            className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-xl text-xs font-bold transition shadow-md disabled:opacity-50 ${
              sent
                ? 'bg-emerald-500 text-white'
                : 'bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white shadow-red-500/20'
            }`}
          >
            {sent ? (
              <>
                <ShieldAlert className="w-4 h-4" />
                <span>Email app opened!</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>{sending ? 'Opening...' : 'Open Email & Send'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export const ExceptionAlert: React.FC<ExceptionAlertProps> = ({ exceptions }) => {
  const [reviewTarget, setReviewTarget] = useState<AuditRecord | null>(null);

  if (!exceptions || exceptions.length === 0) {
    return (
      <div className="w-full p-4 mb-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center space-x-3 text-emerald-600 dark:text-emerald-400">
        <ShieldAlert className="w-5 h-5 flex-shrink-0" />
        <p className="text-xs sm:text-sm font-medium">
          Zero unmatched exceptions! All payments successfully matched 1:1 or auto-matched by AI.
        </p>
      </div>
    );
  }

  const totalDiscrepancyVal = exceptions.reduce((acc, curr) => acc + curr.difference_amount, 0);

  return (
    <>
      <div className="w-full mb-8 rounded-2xl bg-gradient-to-r from-red-500/10 via-amber-500/10 to-orange-500/10 border border-red-500/30 dark:border-red-500/40 p-5 sm:p-6 shadow-lg shadow-red-500/5">
        
        {/* Alert Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-red-500/20">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-red-500/20 text-red-500 border border-red-500/30 animate-pulse">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                  Transactions Needing Manual Review
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-500 border border-red-500/30">
                  {exceptions.length} Unmatched
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Amounts differ beyond standard 2% fees or weekend delay rules.
              </p>
            </div>
          </div>

          {/* Discrepancy Total */}
          <div className="text-left sm:text-right">
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">Total Unmatched Difference</span>
            <span className="text-xl font-mono font-bold text-red-600 dark:text-red-400">
              ₹{totalDiscrepancyVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Exception Items List */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {exceptions.map((ex) => (
            <div
              key={ex.id}
              className="p-4 rounded-xl bg-white/80 dark:bg-slate-900/90 border border-red-200 dark:border-red-900/50 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono font-bold text-sm text-red-600 dark:text-red-400">
                    {ex.txn_id}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-500 border border-red-500/30">
                      {ex.confidence_score}% Match
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {ex.payment_method}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-baseline mb-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 text-[10px] block">Ledger Amount</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{ex.internal_amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 text-[10px] block">Bank Amount</span>
                    <span className="font-semibold text-red-500">
                      ₹{ex.bank_amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-3">
                  {ex.explanation}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-mono">Date: {ex.internal_date}</span>
                <button
                  onClick={() => setReviewTarget(ex)}
                  className="flex items-center space-x-1 text-red-500 hover:text-red-400 font-semibold transition group"
                >
                  <Mail className="w-3 h-3 group-hover:scale-110 transition-transform" />
                  <span>Review</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Email Review Modal */}
      {reviewTarget && (
        <ReviewEmailModal
          exception={reviewTarget}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </>
  );
};
