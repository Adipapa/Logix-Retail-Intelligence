import { formatLitres, formatNumber, formatPercent, sumNullable } from '../lib/formatters';
import type { DailyReport, FuelFilter } from '../types/logix';

interface StockControlViewProps {
  reports: DailyReport[];
  fuelFilter: FuelFilter;
  onInspectReport: (report: DailyReport) => void;
}

export function StockControlView({ reports, fuelFilter, onInspectReport }: StockControlViewProps) {
  const showPms = fuelFilter === 'ALL' || fuelFilter === 'PMS';
  const showAgo = fuelFilter === 'ALL' || fuelFilter === 'AGO';

  const pmsReceipts = sumNullable(reports.map((r) => r.pmsReceipts));
  const pmsNetDiff = sumNullable(reports.map((r) => r.pmsStockDiff));
  const agoReceipts = sumNullable(reports.map((r) => r.agoReceipts));
  const agoNetDiff = sumNullable(reports.map((r) => r.agoStockDiff));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {showPms && (
          <>
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs text-slate-500">PMS Receipts (Filtered)</div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-teal-800">
                {formatLitres(pmsReceipts)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs text-slate-500">PMS Cumulative Stock Diff</div>
              <div
                className={`mt-1 text-xl font-semibold font-mono tabular-nums ${
                  pmsNetDiff < -500 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {formatLitres(pmsNetDiff)}
              </div>
            </div>
          </>
        )}
        {showAgo && (
          <>
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs text-slate-500">AGO Receipts (Filtered)</div>
              <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-amber-800">
                {formatLitres(agoReceipts)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-4">
              <div className="text-xs text-slate-500">AGO Cumulative Stock Diff</div>
              <div
                className={`mt-1 text-xl font-semibold font-mono tabular-nums ${
                  agoNetDiff < -500 ? 'text-amber-700' : 'text-slate-900'
                }`}
              >
                {formatLitres(agoNetDiff)}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Daily Tank Stock Control & Variance Register
            </h2>
            <p className="text-xs text-slate-500">
              Theoretical stock = Opening + Receipts - Sales + Return-to-Tank; compared against dip closing stock
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">{reports.length} records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left py-2 pr-3 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Station</th>
                {showPms && (
                  <>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS Open</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS Rec</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS Theor</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS Close</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS Diff</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">Ctrl %</th>
                  </>
                )}
                {showAgo && (
                  <>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO Open</th>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO Rec</th>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO Theor</th>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO Close</th>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO Diff</th>
                    <th className="text-right py-2 pl-2 font-medium text-amber-800">Ctrl %</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {reports.slice(0, 50).map((r) => (
                <tr
                  key={r.reportId}
                  onClick={() => onInspectReport(r)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="py-2 pr-3 text-slate-900 whitespace-nowrap">{r.reportDate}</td>
                  <td className="py-2 px-2 font-sans text-slate-800 whitespace-nowrap">{r.stationName}</td>
                  {showPms && (
                    <>
                      <td className="py-2 px-2 text-right">{formatNumber(r.pmsOpeningStock)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.pmsReceipts)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.pmsTheoreticalStock)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.pmsClosingStock)}</td>
                      <td
                        className={`py-2 px-2 text-right font-medium ${
                          (r.pmsStockDiff ?? 0) < -35 ? 'text-amber-700' : 'text-slate-900'
                        }`}
                      >
                        {formatNumber(r.pmsStockDiff)}
                      </td>
                      <td className="py-2 px-2 text-right">{formatPercent(r.pmsStockControlRatio)}</td>
                    </>
                  )}
                  {showAgo && (
                    <>
                      <td className="py-2 px-2 text-right">{formatNumber(r.agoOpeningStock)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.agoReceipts)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.agoTheoreticalStock)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.agoClosingStock)}</td>
                      <td
                        className={`py-2 px-2 text-right font-medium ${
                          (r.agoStockDiff ?? 0) < -35 ? 'text-amber-700' : 'text-slate-900'
                        }`}
                      >
                        {formatNumber(r.agoStockDiff)}
                      </td>
                      <td className="py-2 pl-2 text-right">{formatPercent(r.agoStockControlRatio)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
