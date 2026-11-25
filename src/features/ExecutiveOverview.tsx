import { useMemo, useState } from 'react';
import { FuelComparisonChart, ShiftSplitBars, StationVolumeComparisonChart } from '../components/Charts';
import { formatGmd, formatLitres, formatNumber } from '../lib/formatters';
import type { DailyReport, RouteId } from '../types/logix';

type PeriodMode = 'daily' | 'weekly' | 'monthly';
type ShiftMode = 'all' | 'morning' | 'afternoon' | 'night';
type FuelMode = 'both' | 'pms' | 'ago';

interface ExecutiveOverviewProps {
  onNavigate: (route: RouteId) => void;
  reports: DailyReport[];
  allReports?: DailyReport[];
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isoWeekKey(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function bucketKey(value: string, mode: PeriodMode): string {
  if (mode === 'daily') return value;
  if (mode === 'weekly') return isoWeekKey(value);
  return value.slice(0, 7);
}

function bucketLabel(key: string, mode: PeriodMode): string {
  if (mode === 'weekly') return `W${key.slice(-2)} '${key.slice(2, 4)}`;
  if (mode === 'monthly') {
    const [year, month] = key.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  return key.slice(5);
}

function positive(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function shiftValue(report: DailyReport, product: 'pms' | 'ago', shift: ShiftMode): number {
  if (product === 'pms') {
    if (shift === 'morning') return positive(report.pmsMorningLitres);
    if (shift === 'afternoon') return positive(report.pmsAfternoonLitres);
    if (shift === 'night') return positive(report.pmsNightLitres);
    return positive(report.pmsTotalLitres);
  }
  if (shift === 'morning') return positive(report.agoMorningLitres);
  if (shift === 'afternoon') return positive(report.agoAfternoonLitres);
  if (shift === 'night') return positive(report.agoNightLitres);
  return positive(report.agoTotalLitres);
}

function weekdayIndex(report: DailyReport): number {
  const fromName = DAY_NAMES.findIndex((day) => day.toLowerCase() === (report.weekday || '').toLowerCase());
  if (fromName >= 0) return fromName;
  const day = new Date(`${report.reportDate}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="mb-4">
      <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
    </div>
    {children}
  </section>;
}

function SectionHeading({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="flex items-start gap-3 border-b border-slate-200 pb-3">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">{number}</span>
    <div><h2 className="text-base font-semibold text-slate-950">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div>
  </div>;
}

function SimpleBars({ items, valueFormat = 'number', color = 'bg-slate-700' }: {
  items: { label: string; value: number; secondary?: string }[];
  valueFormat?: 'number' | 'litres' | 'gmd' | 'percent';
  color?: string;
}) {
  if (!items.length) return <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-slate-200 text-xs text-slate-500">No data for this selection.</div>;
  const max = Math.max(1, ...items.map((item) => item.value));
  const format = (value: number) => valueFormat === 'gmd' ? formatGmd(value) : valueFormat === 'litres' ? formatLitres(value) : valueFormat === 'percent' ? `${value.toFixed(1)}%` : formatNumber(value);
  return <div className="space-y-3">
    {items.map((item) => <div key={item.label} className="grid grid-cols-[minmax(74px,100px)_1fr_auto] items-center gap-2 text-xs">
      <span className="truncate text-slate-600" title={item.label}>{item.label}</span>
      <div className="h-3 overflow-hidden rounded-sm bg-slate-100">
        <div className={`h-full rounded-sm ${color}`} style={{ width: `${Math.max(item.value > 0 ? 1 : 0, item.value / max * 100)}%` }} />
      </div>
      <span className="min-w-[72px] text-right font-mono tabular-nums text-slate-700">{format(item.value)}</span>
    </div>)}
  </div>;
}

function Heatmap({ rows, columns, values, format = 'litres' }: {
  rows: string[];
  columns: string[];
  values: number[][];
  format?: 'litres' | 'number';
}) {
  const max = Math.max(1, ...values.flat());
  if (!rows.length || !columns.length) return <div className="py-12 text-center text-xs text-slate-500">No data for this selection.</div>;
  return <div className="overflow-x-auto">
    <div className="min-w-[560px]">
      <div className="grid gap-1" style={{ gridTemplateColumns: `minmax(92px,1.2fr) repeat(${columns.length}, minmax(34px,1fr))` }}>
        <div />
        {columns.map((column) => <div key={column} className="pb-1 text-center text-[10px] font-medium text-slate-500">{column}</div>)}
        {rows.map((row, rowIndex) => <React.Fragment key={row}>
          <div className="flex items-center truncate pr-2 text-[11px] text-slate-600" title={row}>{row}</div>
          {columns.map((column, columnIndex) => {
            const value = values[rowIndex]?.[columnIndex] ?? 0;
            const intensity = value > 0 ? 0.12 + (value / max) * 0.82 : 0.035;
            return <div key={column} title={`${row} · ${column}: ${format === 'litres' ? formatLitres(value) : formatNumber(value)}`}
              className="flex h-9 items-center justify-center rounded-sm border border-white text-[9px] font-mono tabular-nums text-slate-800"
              style={{ backgroundColor: `rgba(13, 148, 136, ${intensity})` }}>
              {value > 0 ? (value >= 100000 ? `${(value / 1000).toFixed(0)}k` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : Math.round(value)) : '—'}
            </div>;
          })}
        </React.Fragment>)}
      </div>
    </div>
  </div>;
}

function Composition({ pms, ago }: { pms: number; ago: number }) {
  const total = pms + ago;
  if (!total) return <div className="py-12 text-center text-xs text-slate-500">No sales volume recorded.</div>;
  const pmsPct = pms / total * 100;
  const agoPct = ago / total * 100;
  return <div className="space-y-4">
    <div className="flex h-8 overflow-hidden rounded-md bg-slate-100">
      <div className="h-full bg-teal-700 transition-all" style={{ width: `${pmsPct}%` }} />
      <div className="h-full bg-amber-600 transition-all" style={{ width: `${agoPct}%` }} />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg bg-teal-50 p-3"><div className="text-[11px] font-medium text-teal-800">PMS · Petrol</div><div className="mt-1 text-lg font-semibold tabular-nums text-teal-950">{pmsPct.toFixed(1)}%</div><div className="mt-1 text-xs text-teal-800">{formatLitres(pms)}</div></div>
      <div className="rounded-lg bg-amber-50 p-3"><div className="text-[11px] font-medium text-amber-800">AGO · Diesel</div><div className="mt-1 text-lg font-semibold tabular-nums text-amber-950">{agoPct.toFixed(1)}%</div><div className="mt-1 text-xs text-amber-800">{formatLitres(ago)}</div></div>
    </div>
  </div>;
}

export function ExecutiveOverview({ reports, allReports }: ExecutiveOverviewProps) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
  const [shiftMode, setShiftMode] = useState<ShiftMode>('all');
  const [fuelMode, setFuelMode] = useState<FuelMode>('both');
  const [stationId, setStationId] = useState('ALL');

  const stations = useMemo(() => Array.from(new Map(reports.map((r) => [r.stationId, r.stationName])).entries())
    .filter(([id, name]) => Boolean(id && name)).sort((a, b) => a[1].localeCompare(b[1])), [reports]);
  const filtered = useMemo(() => reports.filter((r) => stationId === 'ALL' || r.stationId === stationId), [reports, stationId]);
  const historical = useMemo(() => (allReports ?? reports).filter((r) => stationId === 'ALL' || r.stationId === stationId), [allReports, reports, stationId]);

  const volumeTrend = useMemo(() => {
    const buckets = new Map<string, { pms: number; ago: number }>();
    for (const report of filtered) {
      const key = bucketKey(report.reportDate, periodMode);
      const value = buckets.get(key) ?? { pms: 0, ago: 0 };
      if (fuelMode !== 'ago') value.pms += shiftValue(report, 'pms', shiftMode);
      if (fuelMode !== 'pms') value.ago += shiftValue(report, 'ago', shiftMode);
      buckets.set(key, value);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ label: bucketLabel(key, periodMode), pmsValue: value.pms, agoValue: value.ago }));
  }, [filtered, periodMode, shiftMode, fuelMode]);

  const revenueTrend = useMemo(() => {
    const buckets = new Map<string, { pms: number; ago: number }>();
    for (const report of filtered) {
      const key = bucketKey(report.reportDate, periodMode);
      const value = buckets.get(key) ?? { pms: 0, ago: 0 };
      if (fuelMode !== 'ago') value.pms += positive(report.pmsSalesGmd);
      if (fuelMode !== 'pms') value.ago += positive(report.agoSalesGmd);
      buckets.set(key, value);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ label: bucketLabel(key, periodMode), pmsValue: value.pms, agoValue: value.ago }));
  }, [filtered, periodMode, fuelMode]);

  const totals = useMemo(() => filtered.reduce((sum, report) => ({
    pms: sum.pms + shiftValue(report, 'pms', shiftMode),
    ago: sum.ago + shiftValue(report, 'ago', shiftMode),
  }), { pms: 0, ago: 0 }), [filtered, shiftMode]);

  const stationVolumes = useMemo(() => {
    const result = new Map<string, { stationName: string; pmsLitres: number; agoLitres: number; reportCount: number }>();
    for (const report of filtered) {
      const pms = fuelMode === 'ago' ? 0 : shiftValue(report, 'pms', shiftMode);
      const ago = fuelMode === 'pms' ? 0 : shiftValue(report, 'ago', shiftMode);
      if (!pms && !ago) continue;
      const key = report.stationId || report.stationName.toLowerCase();
      const item = result.get(key) ?? { stationName: report.stationName, pmsLitres: 0, agoLitres: 0, reportCount: 0 };
      item.pmsLitres += pms; item.agoLitres += ago; item.reportCount += 1; result.set(key, item);
    }
    return Array.from(result.values()).sort((a, b) => (b.pmsLitres + b.agoLitres) - (a.pmsLitres + a.agoLitres));
  }, [filtered, fuelMode, shiftMode]);

  const stationHeatmap = useMemo(() => {
    const names = Array.from(new Set(filtered.map((r) => r.stationName))).sort((a, b) => a.localeCompare(b));
    const values = names.map((name) => Array.from({ length: 12 }, (_, month) => filtered.filter((r) => r.stationName === name && r.month === month + 1)
      .reduce((sum, r) => sum + (fuelMode === 'ago' ? 0 : shiftValue(r, 'pms', shiftMode)) + (fuelMode === 'pms' ? 0 : shiftValue(r, 'ago', shiftMode)), 0)));
    return { names, values };
  }, [filtered, fuelMode, shiftMode]);

  const shiftTotals = useMemo(() => {
    const sums = { pms: { morning: 0, afternoon: 0, night: 0 }, ago: { morning: 0, afternoon: 0, night: 0 } };
    for (const report of filtered) {
      if (fuelMode !== 'ago') { sums.pms.morning += positive(report.pmsMorningLitres); sums.pms.afternoon += positive(report.pmsAfternoonLitres); sums.pms.night += positive(report.pmsNightLitres); }
      if (fuelMode !== 'pms') { sums.ago.morning += positive(report.agoMorningLitres); sums.ago.afternoon += positive(report.agoAfternoonLitres); sums.ago.night += positive(report.agoNightLitres); }
    }
    return sums;
  }, [filtered, fuelMode]);

  const weekdayHeatmap = useMemo(() => {
    const shifts: ShiftMode[] = ['morning', 'afternoon', 'night'];
    const values = DAY_NAMES.map((_, dayIndex) => shifts.map((shift) => filtered.filter((r) => weekdayIndex(r) === dayIndex)
      .reduce((sum, r) => sum + (fuelMode === 'ago' ? 0 : shiftValue(r, 'pms', shift)) + (fuelMode === 'pms' ? 0 : shiftValue(r, 'ago', shift)), 0)));
    return values;
  }, [filtered, fuelMode]);

  const yearly = useMemo(() => {
    const sums = new Map<number, { pms: number; ago: number; revenue: number }>();
    for (const report of historical) {
      const item = sums.get(report.year) ?? { pms: 0, ago: 0, revenue: 0 };
      item.pms += positive(report.pmsTotalLitres); item.ago += positive(report.agoTotalLitres);
      item.revenue += positive(report.pmsSalesGmd) + positive(report.agoSalesGmd);
      sums.set(report.year, item);
    }
    return Array.from(sums.entries()).sort(([a], [b]) => a - b).map(([year, value]) => ({ year, ...value }));
  }, [historical]);

  const yearComparison = useMemo(() => {
    const years = yearly.map((item) => item.year);
    const currentYear = years[years.length - 1];
    const previousYear = years[years.length - 2];
    if (currentYear === undefined || previousYear === undefined) return { currentYear: null as number | null, previousYear: null as number | null, data: [] as { label: string; pmsValue: number; agoValue: number }[] };
    const monthly = (year: number) => Array.from({ length: 12 }, (_, month) => historical.filter((r) => r.year === year && r.month === month + 1)
      .reduce((sum, r) => sum + positive(r.pmsSalesGmd) + positive(r.agoSalesGmd), 0));
    const current = monthly(currentYear); const previous = monthly(previousYear);
    return { currentYear, previousYear, data: MONTH_NAMES.map((label, index) => ({ label, pmsValue: previous[index], agoValue: current[index] })) };
  }, [historical, yearly]);

  const yearlyGrowth = useMemo(() => yearly.map((item, index) => ({
    label: String(item.year),
    value: index > 0 && yearly[index - 1].revenue > 0 ? ((item.revenue - yearly[index - 1].revenue) / yearly[index - 1].revenue) * 100 : 0,
  })), [yearly]);

  const forecast = useMemo(() => {
    const monthTotals = new Map<string, number>();
    for (const report of historical) {
      const key = `${report.year}-${String(report.month).padStart(2, '0')}`;
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + positive(report.pmsSalesGmd) + positive(report.agoSalesGmd));
    }
    const actual = Array.from(monthTotals.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-12);
    if (!actual.length) return [];
    const lastThree = actual.slice(-3).map(([, value]) => value);
    const average = lastThree.reduce((sum, value) => sum + value, 0) / lastThree.length;
    const lastKey = actual[actual.length - 1][0];
    const [year, month] = lastKey.split('-').map(Number);
    const projected = Array.from({ length: 3 }, (_, index) => {
      const date = new Date(Date.UTC(year, month + index, 1));
      return { label: `${MONTH_NAMES[date.getUTCMonth()]} '${String(date.getUTCFullYear()).slice(-2)} est.`, value: average, estimated: true };
    });
    return [...actual.map(([key, value]) => {
      const [y, m] = key.split('-').map(Number);
      return { label: `${MONTH_NAMES[m - 1]} '${String(y).slice(-2)}`, value, estimated: false };
    }), ...projected];
  }, [historical]);

  const revenueGrowth = yearly.length > 1 && yearly[yearly.length - 2].revenue > 0
    ? ((yearly[yearly.length - 1].revenue - yearly[yearly.length - 2].revenue) / yearly[yearly.length - 2].revenue) * 100
    : null;

  return <div className="space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="text-xl font-semibold tracking-tight text-slate-950">Retail intelligence overview</h1><p className="mt-1 text-xs text-slate-500">Sales, station, shift and business performance analytics</p></div>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Period
          <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="min-w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs normal-case text-slate-800"><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Station
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-w-36 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs normal-case text-slate-800"><option value="ALL">All stations</option>{stations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Shift
          <select value={shiftMode} onChange={(e) => setShiftMode(e.target.value as ShiftMode)} className="min-w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs normal-case text-slate-800"><option value="all">All shifts</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Fuel
          <select value={fuelMode} onChange={(e) => setFuelMode(e.target.value as FuelMode)} className="min-w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs normal-case text-slate-800"><option value="both">PMS + AGO</option><option value="pms">PMS only</option><option value="ago">AGO only</option></select>
        </label>
      </div>
    </header>

    <div className="space-y-4"><SectionHeading number="01" title="Sales Overview" description="Volume, recorded revenue and the PMS/AGO sales mix." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Sales volume trend" subtitle={`Litres by ${periodMode}; selected shift and fuel filters apply.`}><FuelComparisonChart data={volumeTrend} unit="L" showPms={fuelMode !== 'ago'} showAgo={fuelMode !== 'pms'} height={260} /></Panel>
        <Panel title="Sales revenue trend" subtitle={`Recorded PMS and AGO revenue by ${periodMode}; shift filter does not apply to revenue.`}><FuelComparisonChart data={revenueTrend} unit="GMD" showPms={fuelMode !== 'ago'} showAgo={fuelMode !== 'pms'} height={260} /></Panel>
        <Panel title="Fuel sales composition" subtitle="Share of recorded PMS and AGO volume for the current selection."><Composition pms={fuelMode === 'ago' ? 0 : totals.pms} ago={fuelMode === 'pms' ? 0 : totals.ago} /></Panel>
        <Panel title="Revenue composition" subtitle="PMS and AGO share of recorded sales revenue."><Composition pms={fuelMode === 'ago' ? 0 : filtered.reduce((s, r) => s + positive(r.pmsSalesGmd), 0)} ago={fuelMode === 'pms' ? 0 : filtered.reduce((s, r) => s + positive(r.agoSalesGmd), 0)} /></Panel>
      </div>
    </div>

    <div className="space-y-4"><SectionHeading number="02" title="Station Intelligence" description="Compare station output and identify monthly performance patterns." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Station performance ranking" subtitle="Stations ranked by PMS and AGO litres for the selected filters."><StationVolumeComparisonChart items={stationVolumes} /></Panel>
        <Panel title="Station-by-month heatmap" subtitle="Volume intensity by station and calendar month; darker cells indicate higher throughput."><Heatmap rows={stationHeatmap.names} columns={MONTH_NAMES} values={stationHeatmap.values} /></Panel>
      </div>
      <Panel title="Station comparison" subtitle="Total litres by station, with PMS and AGO shown separately."><SimpleBars items={stationVolumes.map((item) => ({ label: item.stationName, value: item.pmsLitres + item.agoLitres, secondary: item.stationName }))} valueFormat="litres" color="bg-teal-700" /></Panel>
    </div>

    <div className="space-y-4"><SectionHeading number="03" title="Shift Intelligence" description="Understand when sales happen and how demand changes through the week." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Shift contribution" subtitle="Morning, afternoon and night volume by fuel type.">
          {fuelMode !== 'ago' && <ShiftSplitBars label="PMS" morning={shiftTotals.pms.morning} afternoon={shiftTotals.pms.afternoon} night={shiftTotals.pms.night} accentClass="bg-teal-700" />}
          {fuelMode !== 'pms' && <ShiftSplitBars label="AGO" morning={shiftTotals.ago.morning} afternoon={shiftTotals.ago.afternoon} night={shiftTotals.ago.night} accentClass="bg-amber-700" />}
        </Panel>
        <Panel title="Weekday demand heatmap" subtitle="Volume by weekday and shift. Hover over a cell to inspect the recorded litres."><Heatmap rows={DAY_NAMES} columns={['Morning', 'Afternoon', 'Night']} values={weekdayHeatmap} /></Panel>
      </div>
      <Panel title="Shift volume comparison" subtitle="Compare the total litres sold in each shift.">
        <SimpleBars items={['morning', 'afternoon', 'night'].map((shift) => ({ label: shift[0].toUpperCase() + shift.slice(1), value: filtered.reduce((sum, r) => sum + (fuelMode === 'ago' ? 0 : shiftValue(r, 'pms', shift as ShiftMode)) + (fuelMode === 'pms' ? 0 : shiftValue(r, 'ago', shift as ShiftMode)), 0) }))} valueFormat="litres" color="bg-indigo-700" />
      </Panel>
    </div>

    <div className="space-y-4"><SectionHeading number="04" title="Business Performance" description="Compare financial performance across years and review an indicative revenue outlook." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel title="Year-on-year monthly revenue" subtitle={yearComparison.currentYear && yearComparison.previousYear ? `Monthly recorded revenue: ${yearComparison.previousYear} vs ${yearComparison.currentYear}.` : 'At least two years of records are required for this comparison.'}>
          {yearComparison.data.length ? <FuelComparisonChart data={yearComparison.data} unit="GMD" height={260} /> : <div className="py-12 text-center text-xs text-slate-500">Not enough historical years to compare.</div>}
          {yearComparison.data.length > 0 && <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-slate-500"><span>Previous year: ${yearComparison.previousYear}</span><span>Latest year: ${yearComparison.currentYear}</span></div>}
        </Panel>
        <Panel title="Annual revenue growth" subtitle="Year-over-year change in recorded PMS and AGO revenue.">
          <SimpleBars items={yearlyGrowth.map((item) => ({ label: item.label, value: item.value }))} valueFormat="percent" color="bg-indigo-700" />
          {revenueGrowth !== null && <p className="mt-3 text-xs text-slate-600">Latest annual change: <span className={revenueGrowth >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>{revenueGrowth >= 0 ? '+' : ''}{revenueGrowth.toFixed(1)}%</span></p>}
        </Panel>
        <Panel title="Annual sales volume" subtitle="Total PMS and AGO litres recorded in each calendar year."><SimpleBars items={yearly.map((item) => ({ label: String(item.year), value: item.pms + item.ago }))} valueFormat="litres" color="bg-teal-700" /></Panel>
        <Panel title="Revenue outlook · next 3 months" subtitle="Estimate based on the average of the latest three available monthly revenue totals; not a guaranteed forecast.">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-700" /> Actual</span><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm border border-dashed border-indigo-700 bg-indigo-100" /> Estimate</span></div>
            {forecast.length ? <div className="space-y-3">{forecast.map((item) => {
              const max = Math.max(1, ...forecast.map((entry) => entry.value));
              return <div key={item.label} className="grid grid-cols-[90px_1fr_auto] items-center gap-2 text-xs">
                <span className="text-slate-600">{item.label}</span>
                <div className="h-3 overflow-hidden rounded-sm bg-slate-100"><div className={`h-full rounded-sm ${item.estimated ? 'border border-dashed border-indigo-700 bg-indigo-100' : 'bg-slate-700'}`} style={{ width: `${item.value / max * 100}%` }} /></div>
                <span className="min-w-[82px] text-right font-mono tabular-nums text-slate-700">{formatGmd(item.value)}</span>
              </div>;
            })}</div> : <div className="py-12 text-center text-xs text-slate-500">No monthly revenue history available.</div>}
          </div>
        </Panel>
      </div>
    </div>
  </div>;
}
