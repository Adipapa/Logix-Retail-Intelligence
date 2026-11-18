import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { FuelComparisonChart, StationComparisonBars, type StationBarDatum } from '../components/Charts';
import { StatusLabel } from '../components/StatusLabel';
import { formatGmd, formatLitres, formatNumber, sumNullable } from '../lib/formatters';
import type {
  DailyReport,
  ImportWarning,
  RouteId,
  SourceWorkbook,
  Station,
  SummaryReconciliation,
} from '../types/logix';

interface ExecutiveOverviewProps {
  reports: DailyReport[];
  stations: Station[];
  workbooks: SourceWorkbook[];
  warnings: ImportWarning[];
  reconciliations: SummaryReconciliation[];
  onInspectReport: (report: DailyReport) => void;
  onSelectStation: (stationId: string) => void;
  onNavigate: (route: RouteId) => void;
}

export function ExecutiveOverview({
  reports,
  stations,
  workbooks,
  warnings,
  reconciliations,
  onInspectReport,
  onSelectStation,
  onNavigate,
}: ExecutiveOverviewProps) {
  const totalSalesGmd = sumNullable(reports.map((r) => r.totalFuelSalesGmd));
  const totalPmsLitres = sumNullable(reports.map((r) => r.pmsTotalLitres));
  const totalAgoLitres = sumNullable(reports.map((r) => r.agoTotalLitres));
  const totalBankedGmd = sumNullable(reports.map((r) => r.bankedGmd));
  const reconDiffGmd = sumNullable(reports.map((r) => r.reconciliationDiffGmd));

  const importedCount = reports.filter((r) => r.completeness === 'imported').length;
  const coveragePct = reports.length > 0 ? (importedCount / reports.length) * 100 : 0;

  const activeExceptions = warnings.filter((w) => w.severity !== 'info');
  const summaryVariances = reconciliations.filter((r) => r.result === 'variance_exceeded');

  // Time-series aggregation sorted chronologically
  const byDateMap = new Map<string, { label: string; pms: number; ago: number }>();
  const sorted = [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const spanYears = new Set(sorted.map((r) => r.year)).size > 1;
  sorted.forEach((r) => {
    const key = spanYears ? `${r.year}-${String(r.month).padStart(2, '0')}` : r.reportDate;
    const prev = byDateMap.get(key) ?? { label: spanYears ? key : r.reportDate.slice(5), pms: 0, ago: 0 };
    prev.pms += r.pmsTotalLitres ?? 0;
    prev.ago += r.agoTotalLitres ?? 0;
    byDateMap.set(key, prev);
  });

  const chartData = Array.from(byDateMap.values()).map((d) => ({
    label: d.label,
    pmsValue: d.pms,
    agoValue: d.ago,
  }));

  // Station comparison
  const stationBars: StationBarDatum[] = stations.map((st) => {
    const stReports = reports.filter((r) => r.stationId === st.stationId);
    const stImported = stReports.filter((r) => r.completeness === 'imported').length;
    return {
      stationId: st.stationId,
      stationName: st.canonicalName,
      pmsLitres: sumNullable(stReports.map((r) => r.pmsTotalLitres)),
      agoLitres: sumNullable(stReports.map((r) => r.agoTotalLitres)),
      totalSalesGmd: sumNullable(stReports.map((r) => r.totalFuelSalesGmd)),
      coveragePct: stReports.length > 0 ? (stImported / stReports.length) * 100 : 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* KPI Summary Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Group Fuel Sales</div>
          <div className="mt-1.5 text-2xl font-display font-semibold font-mono tabular-nums text-slate-900">
            {formatGmd(totalSalesGmd)}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            Banked: {formatGmd(totalBankedGmd)} · Diff: {formatGmd(reconDiffGmd)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">PMS Volume (Petrol)</div>
          <div className="mt-1.5 text-2xl font-display font-semibold font-mono tabular-nums text-teal-800">
            {formatLitres(totalPmsLitres)}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            {formatNumber(reports.length)} daily sheets · PMS separated
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">AGO Volume (Diesel)</div>
          <div className="mt-1.5 text-2xl font-display font-semibold font-mono tabular-nums text-amber-800">
            {formatLitres(totalAgoLitres)}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
            Combined: {formatLitres(totalPmsLitres + totalAgoLitres)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Reporting Coverage & Exceptions</div>
          <div className="mt-1.5 text-2xl font-display font-semibold font-mono tabular-nums text-slate-900">
            {coveragePct.toFixed(1)}%
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <span>{workbooks.length} workbooks</span>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => onNavigate('data-monitor')}
              className="text-amber-700 hover:underline font-medium"
            >
              {activeExceptions.length + summaryVariances.length} exceptions
            </button>
          </div>
        </div>
      </section>

      {/* Main Analytics Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-md p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                PMS vs AGO Volume Trend (Litres)
              </h2>
              <p className="text-xs text-slate-500">
                Product throughput derived from daily operational worksheets
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('fuel-sales')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              <span>Fuel sales breakdown</span>
              <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
          <FuelComparisonChart data={chartData} unit="L" />
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-md p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Station Comparison</h2>
              <p className="text-xs text-slate-500">Click a station to inspect performance</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stations')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              All stations
            </button>
          </div>
          <StationComparisonBars items={stationBars} onSelectStation={onSelectStation} />
        </div>
      </section>

      {/* Exceptions & Recent Daily Reports */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-md p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-slate-900">Validation & Audit Exceptions</h2>
            <button
              type="button"
              onClick={() => onNavigate('data-monitor')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              Open monitor
            </button>
          </div>
          {activeExceptions.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No active warnings or missing-sheet errors recorded.
            </p>
          ) : (
            <div className="divide-y divide-slate-200">
              {activeExceptions.slice(0, 6).map((w) => (
                <div key={w.warningId} className="py-3 first:pt-1 last:pb-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      {w.stationName} · {w.worksheet}
                    </span>
                    <StatusLabel status={w.severity} />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{w.message}</p>
                  <div className="mt-1 text-[11px] font-mono text-slate-400">{w.sourceReference}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Daily Operational Ledger</h2>
              <p className="text-xs text-slate-500">Select any row to inspect source workbook lineage</p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              Showing {Math.min(12, reports.length)} of {reports.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Date</th>
                  <th className="text-left py-2 px-3 font-medium">Station</th>
                  <th className="text-right py-2 px-3 font-medium">PMS (L)</th>
                  <th className="text-right py-2 px-3 font-medium">AGO (L)</th>
                  <th className="text-right py-2 px-3 font-medium">Sales (GMD)</th>
                  <th className="text-left py-2 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {reports.slice(0, 12).map((r) => (
                  <tr
                    key={r.reportId}
                    onClick={() => onInspectReport(r)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                      {r.reportDate}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 whitespace-nowrap">
                      {r.stationName}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-teal-800">
                      {formatNumber(r.pmsTotalLitres)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-800">
                      {formatNumber(r.agoTotalLitres)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                      {formatGmd(r.totalFuelSalesGmd)}
                    </td>
                    <td className="py-2.5 pl-3">
                      <StatusLabel status={r.completeness} />
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      <AlertTriangle className="w-4 h-4 mx-auto mb-1 text-slate-400" />
                      No daily reports match the active filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
