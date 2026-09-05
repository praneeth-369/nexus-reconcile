'use client';

import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle2, AlertCircle, X, Download, RefreshCw, ArrowRight } from 'lucide-react';

interface DualFileUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onReconcileCustom: (ledgerData: any[], bankData: any[]) => Promise<void>;
  isLoading: boolean;
}

export const DualFileUpload: React.FC<DualFileUploadProps> = ({
  isOpen,
  onClose,
  onReconcileCustom,
  isLoading,
}) => {
  const [ledgerFile, setLedgerFile] = useState<File | null>(null);
  const [bankFile, setBankFile] = useState<File | null>(null);
  const [ledgerParsed, setLedgerParsed] = useState<any[] | null>(null);
  const [bankParsed, setBankParsed] = useState<any[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (
    file: File | null,
    type: 'ledger' | 'bank'
  ) => {
    if (!file) return;
    setErrorMsg(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setErrorMsg(`Error parsing ${type} CSV: ${results.errors[0].message}`);
          return;
        }
        if (type === 'ledger') {
          setLedgerFile(file);
          setLedgerParsed(results.data);
        } else {
          setBankFile(file);
          setBankParsed(results.data);
        }
      },
    });
  };

  const handleStartComparison = async () => {
    if (!ledgerParsed || !bankParsed) {
      setErrorMsg('Please upload both Internal Ledger CSV and Bank Settlement Feed CSV before running reconciliation.');
      return;
    }
    await onReconcileCustom(ledgerParsed, bankParsed);
    onClose();
  };

  // Sample CSV generators for test downloads
  const downloadSampleLedger = () => {
    const content = `txn_id,internal_amount,internal_date,payment_method\nTXN_201,15000,2026-08-01,CREDIT_CARD\nTXN_202,8500,2026-08-01,UPI\nTXN_203,50000,2026-08-02,CREDIT_CARD\nTXN_204,12000,2026-08-07,NET_BANKING\nTXN_205,30000,2026-08-10,UPI`;
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_internal_ledger.csv';
    a.click();
  };

  const downloadSampleBank = () => {
    const content = `txn_id,bank_amount,bank_date\nTXN_201,14700,2026-08-01\nTXN_202,8500,2026-08-01\nTXN_203,49000,2026-08-02\nTXN_204,12000,2026-08-10\nTXN_205,18000,2026-08-10`;
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_bank_settlement.csv';
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-[#131B2A] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Upload & Compare Dual Ledger Files
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload your Internal Ledger CSV and Bank Settlement Feed CSV for 1:1 cross comparison.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* File 1: Internal Ledger */}
            <div className="p-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center text-center">
              <FileText className="w-8 h-8 text-blue-500 mb-2" />
              <h4 className="font-bold text-xs text-slate-900 dark:text-white mb-1">
                1. Internal Ledger CSV
              </h4>
              <p className="text-[11px] text-slate-500 mb-3">
                Expected columns: <code className="text-blue-500 font-mono">txn_id, internal_amount, internal_date</code>
              </p>

              {ledgerParsed ? (
                <div className="w-full p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
                  <span className="truncate font-semibold">{ledgerFile?.name}</span>
                  <span className="font-mono text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded">
                    {ledgerParsed.length} rows
                  </span>
                </div>
              ) : (
                <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition shadow-sm">
                  Choose Ledger CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null, 'ledger')}
                  />
                </label>
              )}
            </div>

            {/* File 2: Bank Settlement Feed */}
            <div className="p-4 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center text-center">
              <FileText className="w-8 h-8 text-emerald-500 mb-2" />
              <h4 className="font-bold text-xs text-slate-900 dark:text-white mb-1">
                2. Bank Settlement Feed CSV
              </h4>
              <p className="text-[11px] text-slate-500 mb-3">
                Expected columns: <code className="text-emerald-500 font-mono">txn_id, bank_amount, bank_date</code>
              </p>

              {bankParsed ? (
                <div className="w-full p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between">
                  <span className="truncate font-semibold">{bankFile?.name}</span>
                  <span className="font-mono text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded">
                    {bankParsed.length} rows
                  </span>
                </div>
              ) : (
                <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-sm">
                  Choose Bank CSV
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleFileChange(e.target.files?.[0] || null, 'bank')}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Sample CSV Downloads */}
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>Need sample CSV files to test?</span>
            <div className="flex space-x-2">
              <button
                onClick={downloadSampleLedger}
                className="flex items-center space-x-1 text-blue-500 hover:underline text-[11px] font-medium"
              >
                <Download className="w-3 h-3" />
                <span>Sample Ledger</span>
              </button>
              <button
                onClick={downloadSampleBank}
                className="flex items-center space-x-1 text-emerald-500 hover:underline text-[11px] font-medium"
              >
                <Download className="w-3 h-3" />
                <span>Sample Bank Feed</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleStartComparison}
            disabled={!ledgerParsed || !bankParsed || isLoading}
            className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-semibold text-xs shadow-md shadow-blue-500/20 disabled:opacity-40 transition"
          >
            {isLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Compare & Reconcile Files</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
