'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Layers, Sparkles, SlidersHorizontal, Percent } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

interface NavbarProps {
  onRunReconciliation: (mode?: 'DEMO' | 'SANDBOX') => void;
  isLoading: boolean;
  datasetMode: 'DEMO' | 'SANDBOX' | 'DUAL_CSV';
  onModeChange: (mode: 'DEMO' | 'SANDBOX') => void;
  gatewayFeePct: number;
  onGatewayFeeChange: (fee: number) => void;
  runId?: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  onRunReconciliation,
  isLoading,
  datasetMode,
  onModeChange,
  gatewayFeePct,
  onGatewayFeeChange,
  runId,
}) => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0E1523]/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo & Title */}
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-emerald-500 text-white shadow-md shadow-blue-500/20">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">
              Nexus Reconcile
            </span>
          </div>
        </div>

        {/* Dataset Mode Switcher & Run Trigger */}
        <div className="flex items-center space-x-3">
          
          {/* Dataset Selector Toggle */}
          <div className="hidden md:flex items-center space-x-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
            <button
              onClick={() => onModeChange('DEMO')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                datasetMode === 'DEMO'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Demo (50+ Records)</span>
            </button>
            <button
              onClick={() => onModeChange('SANDBOX')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                datasetMode === 'SANDBOX'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Sandbox (Upload CSV)</span>
            </button>
          </div>

          {/* Run Pipeline Button */}
          <button
            onClick={() => onRunReconciliation(datasetMode === 'SANDBOX' ? 'SANDBOX' : 'DEMO')}
            disabled={isLoading}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 disabled:opacity-50 transition active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Running Engine...' : 'Run Reconciliation'}</span>
          </button>

          {/* Theme Toggle (mounted guard prevents React hydration error) */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 transition w-9 h-9 flex items-center justify-center"
            aria-label="Toggle theme"
          >
            {mounted ? (
              theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-600" />
            ) : (
              <span className="w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700 opacity-50" />
            )}
          </button>
        </div>

      </div>
    </header>
  );
};
