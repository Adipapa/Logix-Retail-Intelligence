import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { FuelComparisonChart, StationComparisonBars, type StationBarDatum } from '../components/Charts';
import { StatusLabel } from '../components/StatusLabel';
import { formatGmd, formatLitres, formatNumber, sumNullable } from '../lib/formatters';
import type { LiveAnalyticsOverview } from '../services/api';
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
  liveAnalytics?: LiveAnalyticsOverview | null;
  liveAnalyticsError?: string | null;
}

function sumKnown(values: Array<number | null | undefined>): number | null {
  const present = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return present.length ? present.reduce((total, value) => total + value, 0) : null;
}

function KpiCard({ label, value, detail, tone = 'slate' }: {
  label: string; value: string; detail: string; tone?: 'slate' | 'teal' | 'amber' | 'red';
}) {
  const tones = {
    slate: 'text-slate-950',
    teal: 'text-teal-800',
    amber: 'text-amber-800',
    red: 'text-red-700',
  };
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 break-words text-2xl font-semibold font-mono tabular-nums ${tones[tone]}`}>{value}</div>
      <div className="mt-2 text-xs leading-5 text-slate-500">{detail}</div>
    </div>
  );
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
  liveAnalytics,
  liveAnalyticsError,
}: ExecutiveOverviewProps) {
  const totalSalesGmd = sumKnown(reports.map((r) => r.totalFuelSalesGmd));
  const totalPmsLitres = sumKnown(reports.map((r) => r.pmsTotalLitres));
  const totalAgoLitres = sumKnown(reports.map((r) => r.agoTotalLitres));
  const totalLitres = sumKnown([totalPmsLitres, totalAgoLitres]);
  const bankedGmd = sumKnown(reports.map((r) => r.bankedGmd));
  const cashVarianceExposure = sumKnown(reports.map((r) =>
    r.reconciliationDiffGmd == null ? null : Math.abs(r.reconciliationDiffGmd)
  ));
  const stockVarianceExposure = sumKnown(reports.flatMap((r) => [
    r.pmsStockDiff == null ? null : Math.abs(r.pmsStockDiff),
    r.agoStockDiff == null ? null : Math.abs(r.agoStockDiff),
  ]));
  const deliveryShortage = sumKnown(reports.map((r) => r.shortageLitres));
  const importedCount = reports.filter((r) => r.completeness === 'imported').length;
  const coveragePct = reports.length ? (importedCount / reports.length) * 100 : 0;
  const activeExceptions = warnings.filter((w) => w.severity !== 'info');
  const summaryVariances = reconciliations.filter((r) => r.result === 'variance_exceeded');
  const cashAlerts = reports.filter((r) => r.reconciliationDiffGmd != null && Math.abs(r.reconciliationDiffGmd) > 2500);
  const stockAlerts = reports.filter((r) =>
    (r.pmsStockDiff != null && Math.abs(r.pmsStockDiff) > 100) ||
    (r.agoStockDiff != null && Math.abs(r.agoStockDiff) > 100)
  );
  const sortedReports = [...reports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));

  const byDateMap = new Map<string, { label: string; pms: number; ago: number }>();
  const chronological = [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
  const spanYears = new Set(chronological.map((r) => r.year)).size > 1;
  chronological.forEach((r) => {
    const key = spanYears ? `${r.year}-${String(r.month).padStart(2, '0')}` : r.reportDate;
    const prev = byDateMap.get(key) ?? { label: spanYears ? key : r.reportDate.slice(5), pms: 0, ago: 0 };
    prev.pms += r.pmsTotalLitres ?? 0;
    prev.ago += r.agoTotalLitres ?? 0;
    byDateMap.set(key, prev);
  });
  const chartData = Array.from(byDateMap.values()).map((d) => ({
    label: d.label, pmsValue: d.pms, agoValue: d.ago,
  }));

  const stationBars: StationBarDatum[] = stations.map((st) => {
    const stationReports = reports.filter((r) => r.stationId === st.stationId);
    const imported = stationReports.filter((r) => r.completeness === 'imported').length;
    return {
      stationId: st.stationId,
      stationName: st.canonicalName,
      pmsLitres: sumNullable(stationReports.map((r) => r.pmsTotalLitres)),
      agoLitres: sumNullable(stationReports.map((r) => r.agoTotalLitres)),
      totalSalesGmd: sumNullable(stationReports.map((r) => r.totalFuelSalesGmd)),
      coveragePct: stationReports.length ? (imported / stationReports.length) * 100 : 0,
    };
  }).sort((a, b) => b.totalSalesGmd - a.totalSalesGmd);

  const controlItems = [
    ...activeExceptions.map((warning) => ({
      id: warning.warningId,
      date: warning.reportDate,
      station: warning.stationName,
      title: warning.message,
      source: warning.sourceReference,
      severity: warning.severity,
    })),
    ...cashAlerts.map((report) => ({
      id: `cash-${report.reportId}`,
      date: report.reportDate,
      station: report.stationName,
      title: `Cash-to-banked variance: ${formatGmd(report.reconciliationDiffGmd)}`,
      source: report.worksheetName,
      severity: 'warning' as const,
    })),
    ...stockAlerts.map((report) => ({
      id: `stock-${report.reportId}`,
      date: report.reportDate,
      station: report.stationName,
      title: `Stock movement variance — PMS: ${formatLitres(report.pmsStockDiff)}, AGO: ${formatLitres(report.agoStockDiff)}`,
      source: report.worksheetName,
      severity: 'warning' as const,
    })),
  ].slice(0, 8);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-950">Executive performance</h1>
          <p className="mt-1 text-xs text-slate-500">Group-level revenue, fuel movement and control exposure for the selected period.</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>{formatNumber(reports.length)} daily reports in view</div>
          <div>{stations.length} stations configured · {workbooks.length} workbooks</div>
        </div>
      </section>

      {liveAnalyticsError && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          Live PostgreSQL analytics could not be loaded: {liveAnalyticsError}
        </section>
      )}
      {liveAnalytics && (
        <section className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">Live PostgreSQL data</div>
              <p className="mt-1 text-xs text-slate-600">
                {liveAnalytics.data_status === 'verified_extraction_available'
                  ? 'Verified mapped workbook extraction is available. These figures are separate from the demonstration dashboard below.'
                  : 'No verified mapped workbook extraction is available yet. Raw workbook records are not presented as sales figures.'}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-700">
              {liveAnalytics.records.mapped} mapped / {liveAnalytics.records.total} records
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div><div className="text-[11px] text-slate-500">Verified revenue</div><div className="mt-1 text-base font-semibold font-mono text-slate-950">{formatGmd(liveAnalytics.kpis.revenue_gmd)}</div></div>
            <div><div className="text-[11px] text-slate-500">PMS volume</div><div className="mt-1 text-base font-semibold font-mono text-slate-950">{formatLitres(liveAnalytics.kpis.pms_litres)}</div></div>
            <div><div className="text-[11px] text-slate-500">AGO volume</div><div className="mt-1 text-base font-semibold font-mono text-slate-950">{formatLitres(liveAnalytics.kpis.ago_litres)}</div></div>
            <div><div className="text-[11px] text-slate-500">Raw / unmapped</div><div className="mt-1 text-base font-semibold font-mono text-slate-950">{formatNumber(liveAnalytics.records.raw_or_unmapped)}</div></div>
          </div>
          <div className="mt-3 text-[11px] text-slate-500">
            Database validation warnings: {liveAnalytics.validation_warning_count}. Live figures only include supported mapped templates.
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Fuel sales revenue" value={formatGmd(totalSalesGmd)}
          detail={`Banked: ${formatGmd(bankedGmd)} · ${formatNumber(reports.length)} daily reports`} />
        <KpiCard label="Total fuel volume" value={formatLitres(totalLitres)}
          detail={`PMS ${formatLitres(totalPmsLitres)} · AGO ${formatLitres(totalAgoLitres)}`} tone="teal" />
        <KpiCard label="Cash variance exposure" value={formatGmd(cashVarianceExposure)}
          detail={`${cashAlerts.length} daily reports exceed the GMD 2,500 review threshold`}
          tone={cashAlerts.length ? 'red' : 'slate'} />
        <KpiCard label="Stock variance exposure" value={formatLitres(stockVarianceExposure)}
          detail={`Delivery shortages recorded: ${formatLitres(deliveryShortage)}`}
          tone={stockAlerts.length || (deliveryShortage != null && deliveryShortage > 0) ? 'amber' : 'slate'} />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Fuel sales volume trend</h2>
              <p className="mt-1 text-xs text-slate-500">PMS and AGO litres from daily operational reports</p>
            </div>
            <button type="button" onClick={() => onNavigate('fuel-sales')}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900">
              View sales analysis <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <FuelComparisonChart data={chartData} unit="L" />
        </div>

        <div className="xl:col-span-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Station performance</h2>
              <p className="mt-1 text-xs text-slate-500">Ranked by reported fuel revenue</p>
            </div>
            <button type="button" onClick={() => onNavigate('stations')}
              className="text-xs font-medium text-blue-700 hover:text-blue-900">All stations</button>
          </div>
          <StationComparisonBars items={stationBars} onSelectStation={onSelectStation} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <div className="xl:col-span-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Control exceptions requiring review</h2>
              <p className="mt-1 text-xs text-slate-500">Cash, stock and import validation alerts</p>
            </div>
            <button type="button" onClick={() => onNavigate('data-monitor')}
              className="text-xs font-medium text-blue-700 hover:text-blue-900">Open monitor</button>
          </div>
          {controlItems.length === 0 ? (
            <div className="flex items-center gap-2 py-7 text-xs text-slate-500">
              <AlertTriangle className="h-4 w-4 text-slate-400" /> No control exceptions in the selected period.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {controlItems.map((item) => (
                <div key={item.id} className="py-3 first:pt-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">{item.station} · {item.date}</div>
                      <p className="mt-1 text-xs leading-5 text-slate-600">{item.title}</p>
                      <div className="mt-1 truncate text-[10px] text-slate-400">{item.source}</div>
                    </div>
                    <StatusLabel status={item.severity} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            {activeExceptions.length + summaryVariances.length + cashAlerts.length + stockAlerts.length} warning and control signals identified.
          </div>
        </div>

        <div className="xl:col-span-7 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Reporting integrity</h2>
              <p className="mt-1 text-xs text-slate-500">Coverage of daily records currently in the selected view</p>
            </div>
            <button type="button" onClick={() => onNavigate('data-monitor')}
              className="text-xs font-medium text-blue-700 hover:text-blue-900">Data monitor</button>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-3xl font-semibold font-mono tabular-nums text-slate-950">{coveragePct.toFixed(1)}%</div>
              <div className="mt-1 text-xs text-slate-500">Imported / complete daily records</div>
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>{formatNumber(importedCount)} complete</div>
              <div>{formatNumber(reports.length - importedCount)} require attention</div>
            </div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-teal-700" style={{ width: `${coveragePct}%` }} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">Import warnings</div>
              <div className="mt-1 text-lg font-semibold font-mono text-slate-900">{formatNumber(activeExceptions.length)}</div>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">Summary variances</div>
              <div className="mt-1 text-lg font-semibold font-mono text-slate-900">{formatNumber(summaryVariances.length)}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">Latest daily operations</h2>
            <p className="mt-1 text-xs text-slate-500">Open a record to trace its source workbook and underlying figures</p>
          </div>
          <span className="text-xs text-slate-500">Showing {Math.min(10, sortedReports.length)} of {sortedReports.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-3 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Station</th>
                <th className="px-3 py-2 text-right font-medium">Volume (L)</th>
                <th className="px-3 py-2 text-right font-medium">Revenue (GMD)</th>
                <th className="px-3 py-2 text-right font-medium">Cash variance</th>
                <th className="py-2 pl-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedReports.slice(0, 10).map((report) => (
                <tr key={report.reportId} onClick={() => onInspectReport(report)}
                  className="cursor-pointer transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap py-2.5 pr-3 font-mono text-slate-900">{report.reportDate}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">{report.stationName}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatNumber((report.pmsTotalLitres ?? 0) + (report.agoTotalLitres ?? 0))}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums font-medium">{formatGmd(report.totalFuelSalesGmd)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{formatGmd(report.reconciliationDiffGmd)}</td>
                  <td className="py-2.5 pl-3"><StatusLabel status={report.completeness} /></td>
                </tr>
              ))}
              {sortedReports.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">No daily reports match the active filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
