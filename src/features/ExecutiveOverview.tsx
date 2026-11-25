import { useMemo, useState } from 'react';
import { FuelComparisonChart, ShiftSplitBars, StationVolumeComparisonChart } from '../components/Charts';
import { formatLitres, formatNumber } from '../lib/formatters';
import type { LiveAnalyticsOverview } from '../services/api';
import type { DailyReport, RouteId } from '../types/logix';

type PeriodMode = 'daily' | 'weekly' | 'monthly';
type ShiftMode = 'all' | 'morning' | 'afternoon' | 'night';
type FuelMode = 'both' | 'pms' | 'ago';

interface ExecutiveOverviewProps {
  onNavigate: (route: RouteId) => void;
  liveAnalytics?: LiveAnalyticsOverview | null;
  liveAnalyticsError?: string | null;
  reports: DailyReport[];
}

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
  const prefix = product === 'pms' ? 'pms' : 'ago';
  if (shift === 'morning') return positive(report[`${prefix}MorningLitres`]);
  if (shift === 'afternoon') return positive(report[`${prefix}AfternoonLitres`]);
  if (shift === 'night') return positive(report[`${prefix}NightLitres`]);
  return positive(report[`${prefix}TotalLitres`]);
}

export function ExecutiveOverview({ reports }: ExecutiveOverviewProps) {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
  const [shiftMode, setShiftMode] = useState<ShiftMode>('all');
  const [fuelMode, setFuelMode] = useState<FuelMode>('both');
  const [stationId, setStationId] = useState('ALL');

  const stations = useMemo(() => Array.from(new Map(reports.map((r) => [r.stationId, r.stationName])).entries())
    .filter(([id, name]) => Boolean(id && name)).sort((a, b) => a[1].localeCompare(b[1])), [reports]);

  const filtered = useMemo(() => reports.filter((r) => stationId === 'ALL' || r.stationId === stationId), [reports, stationId]);

  const volumeTrend = useMemo(() => {
    const buckets = new Map<string, { pms: number; ago: number }>();
    for (const report of filtered) {
      const key = bucketKey(report.reportDate, periodMode);
      const value = buckets.get(key) ?? { pms: 0, ago: 0 };
      if (fuelMode !== 'ago') value.pms += shiftValue(report, 'pms', shiftMode);
      if (fuelMode !== 'pms') value.ago += shiftValue(report, 'ago', shiftMode);
      buckets.set(key, value);
    }
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({
      label: bucketLabel(key, periodMode), pmsValue: value.pms, agoValue: value.ago,
    }));
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
    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({
      label: bucketLabel(key, periodMode), pmsValue: value.pms, agoValue: value.ago,
    }));
  }, [filtered, periodMode, fuelMode]);

  const stationVolumes = useMemo(() => {
    const totals = new Map<string, { stationName: string; pmsLitres: number; agoLitres: number; reportCount: number }>();
    for (const report of filtered) {
      const pms = fuelMode === 'ago' ? 0 : shiftValue(report, 'pms', shiftMode);
      const ago = fuelMode === 'pms' ? 0 : shiftValue(report, 'ago', shiftMode);
      if (!pms && !ago) continue;
      const key = report.stationId || report.stationName.toLowerCase();
      const item = totals.get(key) ?? { stationName: report.stationName, pmsLitres: 0, agoLitres: 0, reportCount: 0 };
      item.pmsLitres += pms;
      item.agoLitres += ago;
      item.reportCount += 1;
      totals.set(key, item);
    }
    return Array.from(totals.values()).sort((a, b) => (b.pmsLitres + b.agoLitres) - (a.pmsLitres + a.agoLitres));
  }, [filtered, fuelMode, shiftMode]);

  const shiftTotals = useMemo(() => {
    const totals = { pms: { morning: 0, afternoon: 0, night: 0 }, ago: { morning: 0, afternoon: 0, night: 0 } };
    for (const report of filtered) {
      if (fuelMode !== 'ago') {
        totals.pms.morning += positive(report.pmsMorningLitres);
        totals.pms.afternoon += positive(report.pmsAfternoonLitres);
        totals.pms.night += positive(report.pmsNightLitres);
      }
      if (fuelMode !== 'pms') {
        totals.ago.morning += positive(report.agoMorningLitres);
        totals.ago.afternoon += positive(report.agoAfternoonLitres);
        totals.ago.night += positive(report.agoNightLitres);
      }
    }
    return totals;
  }, [filtered, fuelMode]);

  const totalLitres = stationVolumes.reduce((sum, item) => sum + item.pmsLitres + item.agoLitres, 0);

  return <div className="space-y-5">
    <section className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">Performance overview</h1>
        <p className="mt-1 text-xs text-slate-500">Interactive production, sales and station charts</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Period
          <select value={periodMode} onChange={(e) => setPeriodMode(e.target.value as PeriodMode)} className="min-w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs normal-case text-slate-800">
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Station
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} className="min-w-36 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs normal-case text-slate-800">
            <option value="ALL">All stations</option>
            {stations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Shift
          <select value={shiftMode} onChange={(e) => setShiftMode(e.target.value as ShiftMode)} className="min-w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs normal-case text-slate-800">
            <option value="all">All shifts</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">Fuel
          <select value={fuelMode} onChange={(e) => setFuelMode(e.target.value as FuelMode)} className="min-w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs normal-case text-slate-800">
            <option value="both">PMS + AGO</option><option value="pms">PMS only</option><option value="ago">AGO only</option>
          </select>
        </label>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-950">Fuel volume trend</h2>
        <p className="mt-1 text-xs text-slate-500">Litres sold by reporting {periodMode} and fuel type</p>
        <div className="mt-4"><FuelComparisonChart data={volumeTrend} unit="L" showPms={fuelMode !== 'ago'} showAgo={fuelMode !== 'pms'} height={260} /></div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-950">Sales revenue trend</h2>
        <p className="mt-1 text-xs text-slate-500">Recorded PMS and AGO sales revenue by reporting {periodMode}</p>
        <div className="mt-4"><FuelComparisonChart data={revenueTrend} unit="GMD" showPms={fuelMode !== 'ago'} showAgo={fuelMode !== 'pms'} height={260} /></div>
      </div>
    </section>

    <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-sm font-semibold text-slate-950">Station volume comparison</h2>
            <p className="mt-1 text-xs text-slate-500">PMS and AGO litres ranked by station</p></div>
          <span className="text-xs font-mono tabular-nums text-slate-600">{formatLitres(totalLitres)}</span>
        </div>
        <div className="mt-5"><StationVolumeComparisonChart items={stationVolumes} /></div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        <div><h2 className="text-sm font-semibold text-slate-950">Shift volume distribution</h2>
          <p className="mt-1 text-xs text-slate-500">Morning, afternoon and night sales for the selected station and fuel filter</p></div>
        {fuelMode !== 'ago' && <ShiftSplitBars label="PMS" morning={shiftTotals.pms.morning} afternoon={shiftTotals.pms.afternoon} night={shiftTotals.pms.night} accentClass="bg-teal-700" />}
        {fuelMode !== 'pms' && <ShiftSplitBars label="AGO" morning={shiftTotals.ago.morning} afternoon={shiftTotals.ago.afternoon} night={shiftTotals.ago.night} accentClass="bg-amber-700" />}
      </div>
    </section>
    <div className="text-right text-[10px] text-slate-400">{formatNumber(filtered.length)} daily reports in current chart selection</div>
  </div>;
}
