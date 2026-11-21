import { useState } from 'react';
import { BarChart3, Lock, ShieldCheck } from 'lucide-react';

interface LoginViewProps {
  onSignIn: (email: string, password: string) => Promise<void>;
  error: string | null;
}

export function LoginView({ onSignIn, error }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSigningIn(true);
    try {
      await onSignIn(email.trim(), password);
    } catch {
      // The parent stores and displays the authentication error.
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-8">
      <div className="max-w-5xl w-full mx-auto bg-white border border-slate-200 rounded-lg overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch shadow-sm">
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
              Secure central management access to operational reporting, fuel performance, stock control, and business intelligence across the Logix Retail network.
            </p>
            <div className="mt-8 space-y-3 border-t border-slate-200 pt-6 text-xs text-slate-600">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-slate-900 block">Authorised Management Access</span>
                  <span>Only registered central management accounts can access the workspace.</span>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Lock className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <span className="font-semibold text-slate-900 block">Protected Operational Data</span>
                  <span>Sign in to access reporting, analytics, workbook lineage, and data monitoring.</span>
                </div>
              </div>
            </div>
          </div>
          <form onSubmit={handleSignIn} className="mt-10 pt-6 border-t border-slate-200 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Sign in to your account</h2>
              <p className="mt-1 text-xs text-slate-500">Enter your central management credentials.</p>
            </div>
            <label className="block text-xs font-medium text-slate-700">
              Email address
              <input required type="email" autoComplete="username" value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full h-11 px-3 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="name@company.com" />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Password
              <input required type="password" autoComplete="current-password" value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full h-11 px-3 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Enter your password" />
            </label>
            {error && <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-800">{error}</div>}
            <button type="submit" disabled={signingIn}
              className="w-full h-11 px-4 flex items-center justify-center gap-2.5 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-60 transition-colors cursor-pointer">
              {signingIn ? 'Signing in...' : 'Sign in'}
            </button>
            <p className="text-xs text-slate-500">Authorised central management accounts only.</p>
          </form>
        </div>
        <div className="lg:col-span-6 relative min-h-[260px] lg:min-h-[600px] bg-slate-900">
          {!imgFailed ? (
            <img src="/src/assets/images/logix_station_hero_1795006666528.jpg"
              alt="Logix Retail commercial fuel station forecourt" referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)} className="w-full h-full lg:h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-8 bg-gradient-to-br from-slate-800 to-slate-950 text-slate-300 text-sm">
              Logix Retail Network Infrastructure
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/25 to-transparent flex flex-col justify-end p-6 sm:p-8">
            <div className="text-xs text-slate-300">The Gambia Retail Fuel Network · GMD & Litre Standardised Reporting</div>
            <div className="mt-1 text-base font-display font-semibold text-white">
              PMS & AGO Throughput, Stock Control, and Financial Reconciliation
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
