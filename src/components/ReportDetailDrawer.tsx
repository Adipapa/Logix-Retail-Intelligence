import { FileSpreadsheet, X } from 'lucide-react';
import { formatGmd, formatLitres, formatNumber, formatPercent } from '../lib/formatters';
import type { DailyReport } from '../types/logix';
import { StatusLabel } from './StatusLabel';

interface ReportDetailDrawerProps {
  report: DailyReport | null;
  onClose: () => void;
}

export function ReportDetailDrawer({ report, onClose }: ReportDetailDrawerProps) {
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto border-l border-slate-200 flex flex-col">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{report.stationName}</span>
              <span aria-hidden="true">·</span>
              <span>{report.territory}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{report.reportDate}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-900 mt-0.5">
              Daily Report Source Lineage & Audit View
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
            aria-label="Close lineage drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 text-sm">
          {/* Source Lineage */}
          <section className="border border-slate-200 rounded-md p-4 bg-slate-50/70">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-semibold text-slate-900 text-xs uppercase tracking-wider">
                <FileSpreadsheet className="w-4 h-4 text-blue-700" aria-hidden="true" />
                <span>Workbook Traceability</span>
              </div>
              <StatusLabel status={report.completeness} />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-slate-500">Dropbox Path</dt>
                <dd className="font-mono text-slate-900 break-all mt-0.5">{report.workbookPath}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Worksheet & Range</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {report.worksheetName} · {report.sourceRowRef || 'Daily Sheet'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Dropbox Revision</dt>
                <dd className="font-mono text-slate-900 mt-0.5">{report.workbookRevision}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Workbook ID</dt>
                <dd className="font-mono text-slate-900 mt-0.5">{report.workbookId}</dd>
              </div>
            </dl>
          </section>

          {/* PMS vs AGO Sales */}
          <section>
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">
              Product Sales & Shifts
            </h3>
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Metric</th>
                    <th className="text-right py-2 px-3 font-medium text-teal-800">PMS (Petrol)</th>
                    <th className="text-right py-2 px-3 font-medium text-amber-800">AGO (Diesel)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Morning Shift</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsMorningLitres)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoMorningLitres)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Afternoon Shift</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsAfternoonLitres)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoAfternoonLitres)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Night Shift</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsNightLitres)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoNightLitres)}</td>
                  </tr>
                  <tr className="bg-slate-50/80 font-semibold">
                    <td className="py-2 px-3 font-sans text-slate-900">Total Volume</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsTotalLitres)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoTotalLitres)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Return to Tank</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsReturnToTankLitres)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoReturnToTankLitres)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Sales Value</td>
                    <td className="py-2 px-3 text-right">{formatGmd(report.pmsSalesGmd)}</td>
                    <td className="py-2 px-3 text-right">{formatGmd(report.agoSalesGmd)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Stock Control */}
          <section>
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">
              Stock Control
            </h3>
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Stock Position</th>
                    <th className="text-right py-2 px-3 font-medium">PMS</th>
                    <th className="text-right py-2 px-3 font-medium">AGO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Opening Stock</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsOpeningStock)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoOpeningStock)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Receipts</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsReceipts)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoReceipts)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Theoretical Stock</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsTheoreticalStock)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoTheoreticalStock)}</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-sans text-slate-700">Closing Stock</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.pmsClosingStock)}</td>
                    <td className="py-2 px-3 text-right">{formatLitres(report.agoClosingStock)}</td>
                  </tr>
                  <tr className="bg-slate-50/80">
                    <td className="py-2 px-3 font-sans font-medium text-slate-900">Stock Difference / Control</td>
                    <td className="py-2 px-3 text-right">
                      {formatLitres(report.pmsStockDiff)} ({formatPercent(report.pmsStockControlRatio)})
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatLitres(report.agoStockDiff)} ({formatPercent(report.agoStockControlRatio)})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Financial Reconciliation & Utilities */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-md p-4">
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2.5">
                Financial Settlement (GMD)
              </h4>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Total Fuel Sales</dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatGmd(report.totalFuelSalesGmd)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Credit Sales</dt>
                  <dd className="font-mono tabular-nums">{formatGmd(report.creditSalesGmd)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Qmoney / Waychit / Coupons</dt>
                  <dd className="font-mono tabular-nums">
                    {formatGmd(
                      (report.qmoneyGmd ?? 0) + (report.waychitGmd ?? 0) + (report.couponsGmd ?? 0)
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Cash Expected</dt>
                  <dd className="font-mono tabular-nums">{formatGmd(report.cashGmd)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Banked</dt>
                  <dd className="font-mono tabular-nums">{formatGmd(report.bankedGmd)}</dd>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-200 font-semibold">
                  <dt className="text-slate-900">Reconciliation Diff</dt>
                  <dd
                    className={`font-mono tabular-nums ${
                      (report.reconciliationDiffGmd ?? 0) < -2500 ? 'text-amber-700' : 'text-slate-900'
                    }`}
                  >
                    {formatGmd(report.reconciliationDiffGmd)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="border border-slate-200 rounded-md p-4">
              <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2.5">
                Utilities & Notes
              </h4>
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <dt className="text-slate-600">Generator Runtime</dt>
                  <dd className="font-mono tabular-nums">
                    {report.generatorRuntimeHrs !== null ? `${report.generatorRuntimeHrs} hrs` : '—'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Generator Refuel</dt>
                  <dd className="font-mono tabular-nums">{formatLitres(report.generatorRefuelLitres)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Cashpower (kWh)</dt>
                  <dd className="font-mono tabular-nums">
                    {report.cashpowerKwh !== null ? `${formatNumber(report.cashpowerKwh)} kWh` : '— (blank)'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-600">Cashpower Purchase</dt>
                  <dd className="font-mono tabular-nums">{formatGmd(report.cashpowerPurchaseGmd)}</dd>
                </div>
              </dl>
              <div className="mt-3 pt-2.5 border-t border-slate-200 text-xs text-slate-600">
                <span className="font-medium text-slate-800 block mb-0.5">Station Notes</span>
                <span>{report.noteText || 'No operational notes recorded on worksheet.'}</span>
              </div>
            </div>
          </section>

          {/* Pump Meter Readings */}
          {report.pumpReadings.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wider mb-2">
                Pump Meter Readings
              </h3>
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="text-left py-2 px-3 font-medium">Pump / Island</th>
                      <th className="text-left py-2 px-3 font-medium">Product</th>
                      <th className="text-right py-2 px-3 font-medium">Opening</th>
                      <th className="text-right py-2 px-3 font-medium">Closing</th>
                      <th className="text-right py-2 px-3 font-medium">Throughput</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                    {report.pumpReadings.map((p) => (
                      <tr key={p.pumpId}>
                        <td className="py-2 px-3 font-sans text-slate-800">
                          {p.pumpId} · {p.island}
                        </td>
                        <td className="py-2 px-3 font-sans">{p.product}</td>
                        <td className="py-2 px-3 text-right">{formatNumber(p.openingMeter)}</td>
                        <td className="py-2 px-3 text-right">{formatNumber(p.closingMeter)}</td>
                        <td
                          className={`py-2 px-3 text-right font-medium ${
                            p.flag === 'negative_movement' ? 'text-red-700' : 'text-slate-900'
                          }`}
                        >
                          {formatLitres(p.throughput)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
