import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { FuelComparisonChart, ShiftSplitBars } from '../components/Charts';
import { formatGmd, formatLitres, formatNumber } from '../lib/formatters';
import type { LiveAnalyticsOverview } from '../services/api';
import type { RouteId } from '../types/logix';

interface ExecutiveOverviewProps {
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
            {formatNumber(liveAnalytics.records.included_in_kpis)} completed reports included / {formatNumber(liveAnalytics.records.total)} records
          </span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Mapped fuel revenue" value={formatGmd(liveAnalytics.kpis.revenue_gmd)} detail="GMD · completed days only" />
          <Metric label="PMS volume" value={formatLitres(liveAnalytics.kpis.pms_litres)} detail="Litres · completed days only" />
          <Metric label="AGO volume" value={formatLitres(liveAnalytics.kpis.ago_litres)} detail="Litres · completed reports only" />
          <Metric
            label="Coupon sales"
            value={formatGmd(liveAnalytics.kpis.coupon_sales_gmd)}
            detail={
              liveAnalytics.kpis.coupon_sales_gmd === null || !liveAnalytics.kpis.revenue_gmd
                ? "Contribution unavailable"
                : `${((liveAnalytics.kpis.coupon_sales_gmd / liveAnalytics.kpis.revenue_gmd) * 100).toFixed(1)}% of mapped revenue`
            }
          />
          <Metric label="Validation warnings" value={formatNumber(liveAnalytics.validation_warning_count)} detail="Warnings recorded in PostgreSQL" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Average revenue per report" value={formatGmd(liveAnalytics.kpis.average_revenue_per_completed_report_gmd)} detail="GMD per completed station report with revenue" />
          <Metric label="Average selling price" value={liveAnalytics.kpis.average_selling_price_gmd_per_litre === null ? '—' : `D${liveAnalytics.kpis.average_selling_price_gmd_per_litre.toFixed(2)} / L`} detail="Mapped fuel revenue ÷ mapped litres" />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">Monthly fuel volume</h2>
            <p className="mt-1 text-xs text-slate-500">AGO and PMS totals for completed reports in the selected period</p>
            <div className="mt-4">
              <FuelComparisonChart
                data={liveAnalytics.monthly_trends.map((item) => ({ label: item.month, pmsValue: item.pms_litres, agoValue: item.ago_litres }))}
                unit="L"
              />
            </div>
            <div className="mt-3 divide-y divide-slate-100">
              {liveAnalytics.monthly_trends.map((item) => <div key={item.month} className="flex justify-between gap-3 py-2 text-xs">
                <span className="font-medium text-slate-700">{item.month} · {item.completed_reports} completed reports</span>
                <span className="text-right font-mono tabular-nums text-slate-900">{formatGmd(item.revenue_gmd)}<span className="block text-[10px] text-slate-500">Coupons {formatGmd(item.coupon_sales_gmd)}</span></span>
              </div>)}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">Shift volume distribution</h2>
              <p className="mt-1 text-xs text-slate-500">Aggregated recorded shift litres across included completed reports</p>
            </div>
            <ShiftSplitBars label="PMS" morning={liveAnalytics.shift_totals.pms.morning} afternoon={liveAnalytics.shift_totals.pms.afternoon} night={liveAnalytics.shift_totals.pms.night} accentClass="bg-teal-700" />
            <ShiftSplitBars label="AGO" morning={liveAnalytics.shift_totals.ago.morning} afternoon={liveAnalytics.shift_totals.ago.afternoon} night={liveAnalytics.shift_totals.ago.night} accentClass="bg-amber-700" />
            <div className="border-t border-slate-100 pt-3">
              <div className="text-xs font-semibold text-slate-800">Missing shift entries in mapped reports</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>Morning: <strong className="font-mono tabular-nums text-slate-900">{formatNumber(liveAnalytics.missing_shift_entries.morning)}</strong></div>
                <div>Afternoon: <strong className="font-mono tabular-nums text-slate-900">{formatNumber(liveAnalytics.missing_shift_entries.afternoon)}</strong></div>
                <div>Night: <strong className="font-mono tabular-nums text-slate-900">{formatNumber(liveAnalytics.missing_shift_entries.night)}</strong></div>
              </div>
            </div>
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
              <div className="text-right font-mono tabular-nums text-slate-800">
                {formatGmd(station.revenue_gmd)}
                <div className="mt-1 text-slate-500">{formatLitres((station.pms_litres ?? 0) + (station.ago_litres ?? 0))}</div>
                <div className="mt-1 text-[10px] text-slate-500">PMS {formatGmd(station.pms_revenue_gmd)} · AGO {formatGmd(station.ago_revenue_gmd)}</div>
              </div>
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
              <span className={report.mapped ? 'text-teal-700' : 'text-amber-700'}>{report.report_status === 'complete' ? 'Complete' : report.report_status === 'pending' ? 'Pending shifts' : 'Unmapped'}</span>
            </div>)}
          </div> : <p className="py-6 text-xs text-slate-500">No report records returned.</p>}
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
        <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><strong>Reporting completeness.</strong> {formatNumber(liveAnalytics.records.pending)} mapped day sheets are excluded because at least one of the morning, afternoon or night fuel-entry shifts is missing. A numeric zero entered in the source sheet counts as an entry; blank cells and formula-only results do not. {formatNumber(liveAnalytics.records.excluded_anomalies)} completed days with negative fuel or revenue values are also excluded pending source correction. {formatNumber(liveAnalytics.records.raw_or_unmapped)} records remain unmapped. Original records are preserved; excluded figures are not treated as zero. Validate source data before financial sign-off.</div>
        </div>
      </section>
    </>}
  </div>;
}
