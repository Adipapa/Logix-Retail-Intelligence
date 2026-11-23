import { StatusLabel } from '../components/StatusLabel';
import { formatGmd, formatMonthName, formatNumber, sumNullable } from '../lib/formatters';
import type { DailyReport, SummaryReconciliation } from '../types/logix';

interface ReconciliationViewProps {
  reports: DailyReport[];
  reconciliations: SummaryReconciliation[];
  onInspectReport: (report: DailyReport) => void;
  supportedWorkbooks?: number;
  unsupportedWorkbooks?: number;
  page?: number;
  pageSize?: number;
  totalChecks?: number;
  hasMore?: boolean;
  onPageChange?: (page: number) => void;
}

export function ReconciliationView({
  reports,
  reconciliations,
  onInspectReport,
  supportedWorkbooks = 0,
  unsupportedWorkbooks = 0,
  page = 1,
  pageSize = 100,
  totalChecks = reconciliations.length,
  hasMore = false,
  onPageChange,
}: ReconciliationViewProps) {
  const totalSales = sumNullable(reports.map((r) => r.totalFuelSalesGmd));
  const totalCredit = sumNullable(reports.map((r) => r.creditSalesGmd));
  const totalQmoney = sumNullable(reports.map((r) => r.qmoneyGmd));
  const totalCoupons = sumNullable(reports.map((r) => r.couponsGmd));
  const totalWaychit = sumNullable(reports.map((r) => r.waychitGmd));
  const totalCheques = sumNullable(reports.map((r) => r.chequesGmd));
  const totalCash = sumNullable(reports.map((r) => r.cashGmd));
  const totalBanked = sumNullable(reports.map((r) => r.bankedGmd));
  const totalDiff = sumNullable(reports.map((r) => r.reconciliationDiffGmd));

  const channels = [
    { label: 'Cash Expected', value: totalCash },
    { label: 'Credit Sales', value: totalCredit },
    { label: 'Qmoney', value: totalQmoney },
    { label: 'Cheques', value: totalCheques },
    { label: 'Coupons', value: totalCoupons },
    { label: 'Waychit', value: totalWaychit },
  ];
  const maxChannel = Math.max(1, ...channels.map((c) => c.value));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Total Fuel Sales (GMD)</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
            {formatGmd(totalSales)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Cash Expected (GMD)</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
            {formatGmd(totalCash)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Total Banked (GMD)</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-teal-800">
            {formatGmd(totalBanked)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Net Banking Difference (GMD)</div>
          <div
            className={`mt-1 text-xl font-semibold font-mono tabular-nums ${
              totalDiff < -2500 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {formatGmd(totalDiff)}
          </div>
        </div>
      </section>

      {/* Payment Mix */}
      <section className="bg-white border border-slate-200 rounded-md p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Payment Channel Mix (GMD)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
          {channels.map((c) => (
            <div key={c.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-slate-700">{c.label}</span>
                <span className="font-mono tabular-nums text-slate-900">{formatGmd(c.value)}</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-xs overflow-hidden">
                <div
                  style={{ width: `${(c.value / maxChannel) * 100}%` }}
                  className="h-full bg-blue-700"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Daily-to-SUMMARY Reconciliation Layer */}
      <section className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Daily-Derived vs Workbook SUMMARY Sheet Reconciliation
            </h2>
            <p className="text-xs text-slate-500">
              Compares mapped daily-sheet values with cached values in the source workbook SUMMARY sheet
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              {supportedWorkbooks} workbooks supported · {unsupportedWorkbooks} SUMMARY layouts not yet mapped · volume tolerance ±1 L; financial tolerance ±D1
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">{reconciliations.length} checks</span>
        </div>

        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
              <tr>
                <th className="text-left py-2 pr-3 font-medium">Station</th>
                <th className="text-left py-2 px-3 font-medium">Period</th>
                <th className="text-left py-2 px-3 font-medium">Field</th>
                <th className="text-left py-2 px-3 font-medium">Product</th>
                <th className="text-right py-2 px-3 font-medium">Daily Derived</th>
                <th className="text-right py-2 px-3 font-medium">SUMMARY Value</th>
                <th className="text-right py-2 px-3 font-medium">Variance</th>
                <th className="text-left py-2 pl-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {reconciliations.map((rec) => (
                <tr key={rec.reconciliationId} className="hover:bg-slate-50">
                  <td className="py-2 pr-3 font-sans font-medium text-slate-900">{rec.stationName}</td>
                  <td className="py-2 px-3 font-sans text-slate-600">
                    {formatMonthName(rec.month)} {rec.year}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-800">{rec.fieldName}</td>
                  <td className="py-2 px-3 font-sans">{rec.product}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(rec.dailyDerivedValue)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(rec.summaryValue)}</td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      rec.result === 'variance_exceeded' ? 'text-amber-700' : 'text-slate-900'
                    }`}
                  >
                    {formatNumber(rec.variance)}
                  </td>
                  <td className="py-2 pl-3 font-sans">
                    <StatusLabel status={rec.result} />
                  </td>
                </tr>
              ))}
              {reconciliations.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center font-sans text-slate-500">
                  No comparable daily and SUMMARY values were found for this filter. The workbook may have an unsupported SUMMARY layout or unmapped daily sheets.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-600">
        <span>
          {totalChecks === 0 ? 'No reconciliation checks' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalChecks)} of ${totalChecks.toLocaleString()} checks`}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)} className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
          <span>Page {page}</span>
          <button type="button" disabled={!hasMore} onClick={() => onPageChange?.(page + 1)} className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      </div>

      {/* Daily Financial Ledger */}
      <section className="bg-white border border-slate-200 rounded-md p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Daily Banking & Settlement Ledger (GMD)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left py-2 pr-3 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Station</th>
                <th className="text-right py-2 px-2 font-medium">Credit</th>
                <th className="text-right py-2 px-2 font-medium">Qmoney</th>
                <th className="text-right py-2 px-2 font-medium">Coupons</th>
                <th className="text-right py-2 px-2 font-medium">Waychit</th>
                <th className="text-right py-2 px-2 font-medium">Cash</th>
                <th className="text-right py-2 px-2 font-medium">Banked</th>
                <th className="text-right py-2 pl-2 font-medium">Diff (GMD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {reports.slice(0, 40).map((r) => (
                <tr
                  key={r.reportId}
                  onClick={() => onInspectReport(r)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="py-2 pr-3 text-slate-900 whitespace-nowrap">{r.reportDate}</td>
                  <td className="py-2 px-2 font-sans text-slate-800 whitespace-nowrap">{r.stationName}</td>
                  <td className="py-2 px-2 text-right">{formatNumber(r.creditSalesGmd)}</td>
                  <td className="py-2 px-2 text-right">{formatNumber(r.qmoneyGmd)}</td>
                  <td className="py-2 px-2 text-right">{formatNumber(r.couponsGmd)}</td>
                  <td className="py-2 px-2 text-right">{formatNumber(r.waychitGmd)}</td>
                  <td className="py-2 px-2 text-right">{formatNumber(r.cashGmd)}</td>
                  <td className="py-2 px-2 text-right font-medium text-teal-800">
                    {formatNumber(r.bankedGmd)}
                  </td>
                  <td
                    className={`py-2 pl-2 text-right font-semibold ${
                      (r.reconciliationDiffGmd ?? 0) < -2500 ? 'text-amber-700' : 'text-slate-900'
                    }`}
                  >
                    {formatNumber(r.reconciliationDiffGmd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
