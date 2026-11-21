import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { formatGmd, formatLitres, formatNumber } from '../lib/formatters';
import type { LiveAnalyticsOverview } from '../services/api';
import type { DailyReport, ImportWarning, RouteId, SourceWorkbook, Station, SummaryReconciliation } from '../types/logix';

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

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-2 break-words text-2xl font-semibold font-mono tabular-nums text-slate-950">{value}</div>
    <div className="mt-2 text-xs text-slate-500">{detail}</div>
  </div>;
}

export function ExecutiveOverview({ liveAnalytics, liveAnalyticsError, onNavigate }: ExecutiveOverviewProps) {
  const latestDate = liveAnalytics?.recent_reports?.[0]?.report_date ?? 'Not available';
  const dataReady = Boolean(liveAnalytics);
  return <div className="space-y-5">
    <section className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">Executive performance</h1>
        <p className="mt-1 text-xs text-slate-500">Production reporting from the connected PostgreSQL database.</p>
      </div>
      <div className="text-right text-xs text-slate-500">
        <div>{dataReady ? formatNumber(liveAnalytics.records.total) : '—'} daily reports in database</div>
        <div>Latest report: {latestDate}</div>
      </div>
    </section>

    {liveAnalyticsError && <section role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      Live PostgreSQL analytics could not be loaded: {liveAnalyticsError}
    </section>}

    {!dataReady && !liveAnalyticsError && <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
      Loading production analytics…
    </section>}

    {liveAnalytics && <>
      <section className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">Live PostgreSQL data</div>
            <p className="mt-1 text-xs text-slate-600">
              These figures are calculated from records in the production database. Only records with supported workbook mappings contribute to the financial and volume totals.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-medium text-slate-700">
            {formatNumber(liveAnalytics.records.mapped)} mapped / {formatNumber(liveAnalytics.records.total)} total
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Mapped fuel revenue" value={formatGmd(liveAnalytics.kpis.revenue_gmd)} detail="GMD · supported mapped records" />
          <Metric label="PMS volume" value={formatLitres(liveAnalytics.kpis.pms_litres)} detail="Litres · mapped records" />
          <Metric label="AGO volume" value={formatLitres(liveAnalytics.kpis.ago_litres)} detail="Litres · mapped records" />
          <Metric label="Validation warnings" value={formatNumber(liveAnalytics.validation_warning_count)} detail="Warnings recorded in PostgreSQL" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div><h2 className="text-sm font-semibold text-slate-950">Station performance</h2>
              <p className="mt-1 text-xs text-slate-500">Totals from supported mapped reports only</p></div>
            <button type="button" onClick={() => onNavigate('stations')} className="text-xs font-medium text-blue-700 hover:text-blue-900">Stations <ArrowUpRight className="inline h-3.5 w-3.5" /></button>
          </div>
          {liveAnalytics.stations.length ? <div className="divide-y divide-slate-100">
            {liveAnalytics.stations.map((station) => <div key={station.station_name} className="grid grid-cols-2 gap-2 py-3 text-xs">
              <div className="font-semibold text-slate-800">{station.station_name}<div className="mt-1 font-normal text-slate-500">{formatNumber(station.report_count)} reports</div></div>
              <div className="text-right font-mono tabular-nums text-slate-800">{formatGmd(station.revenue_gmd)}<div className="mt-1 text-slate-500">{formatLitres((station.pms_litres ?? 0) + (station.ago_litres ?? 0))}</div></div>
            </div>)}
          </div> : <p className="py-6 text-xs text-slate-500">No mapped station totals are available for this period.</p>}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4"><h2 className="text-sm font-semibold text-slate-950">Latest daily reports</h2>
            <p className="mt-1 text-xs text-slate-500">Most recent records returned by the production API</p></div>
          {liveAnalytics.recent_reports.length ? <div className="divide-y divide-slate-100">
            {liveAnalytics.recent_reports.map((report, index) => <div key={report.source_reference + report.report_date + index} className="flex items-start justify-between gap-3 py-2.5 text-xs">
              <div className="min-w-0"><div className="font-semibold text-slate-800">{report.station_name || 'Unresolved station'} · {report.report_date}</div>
                <div className="mt-1 truncate text-slate-500">{report.worksheet_name || report.source_reference}</div></div>
              <span className={report.mapped ? 'text-teal-700' : 'text-amber-700'}>{report.mapped ? 'Mapped' : 'Unmapped'}</span>
            </div>)}
          </div> : <p className="py-6 text-xs text-slate-500">No report records returned.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><strong>Data coverage limitation.</strong> {formatNumber(liveAnalytics.records.raw_or_unmapped)} records are not included in mapped sales totals. Do not interpret missing mapped totals as zero sales. The workbook mapping and remaining reporting modules still require validation before financial sign-off.</div>
        </div>
      </section>
    </>}
  </div>;
}
