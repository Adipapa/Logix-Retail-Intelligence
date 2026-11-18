import { useState } from 'react';
import { BarChart3, Lock, ShieldCheck } from 'lucide-react';

interface LoginViewProps {
  onSignIn: () => Promise<void>;
  error: string | null;
}

export function LoginView({ onSignIn, error }: LoginViewProps) {
  const [signingIn, setSigningIn] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await onSignIn();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-8">
      <div className="max-w-5xl w-full mx-auto bg-white border border-slate-200 rounded-lg overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left: Executive Sign-In Panel */}
        <div className="lg:col-span-6 p-8 sm:p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 text-slate-900">
              <BarChart3 className="w-5 h-5 text-blue-700" aria-hidden="true" />
              <span className="font-display text-lg font-bold tracking-tight">Logix Retail</span>
            </div>

            <h1 className="mt-8 font-display text-2xl sm:text-3xl font-semibold text-slate-900 tracking-tight">
              Centralised Fuel Operations & Business Intelligence
            </h1>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              Consolidated executive analytics across Kotu, Sukuta, Brusubi, Brikama, and Banjul Terminal. Source station Excel workbooks remain unchanged in Dropbox and are validated every 15 minutes.
            </p>

            <div className="mt-8 space-y-3 border-t border-slate-200 pt-6 text-xs text-slate-600">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-slate-900 block">Read-Only Management Governance</span>
                  <span>Central management access only; no station-level logins or workbook edits.</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-slate-900 block">Full Workbook Lineage & Reconciliation</span>
                  <span>Every dashboard metric traces directly to its source workbook, revision, and worksheet.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-200">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">
                {error}
              </div>
            )}
            <button
              type="button"
              disabled={signingIn}
              onClick={handleSignIn}
              className="w-full h-11 px-4 flex items-center justify-center gap-2.5 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
            <p className="mt-3 text-xs text-slate-500">
              Authorised central management accounts only · Historical archive 2022–2026
            </p>
          </div>
        </div>

        {/* Right: Architectural Photography */}
        <div className="lg:col-span-6 relative min-h-[260px] lg:min-h-[520px] bg-slate-900">
          {!imgFailed ? (
            <img
              src="/src/assets/images/logix_station_hero_1795006666528.jpg"
              alt="Logix Retail commercial fuel station forecourt at dawn"
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
              className="w-full h-full lg:h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-8 bg-gradient-to-br from-slate-800 to-slate-950 text-slate-300 text-sm">
              Logix Retail Network Infrastructure
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent flex flex-col justify-end p-6 sm:p-8">
            <div className="text-xs text-slate-300">
              The Gambia Retail Fuel Network · GMD & Litre Standardised Reporting
            </div>
            <div className="mt-1 text-base font-display font-semibold text-white">
              PMS & AGO Throughput, Stock Control, and Financial Reconciliation
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
