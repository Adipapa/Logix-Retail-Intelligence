import { formatLitres, formatNumber, formatPercent, sumNullable } from '../lib/formatters';
import type { DailyReport, FuelFilter, Station } from '../types/logix';

interface StockControlViewProps {
  reports: DailyReport[];
  stations: Station[];
  fuelFilter: FuelFilter;
  onInspectReport: (report: DailyReport) => void;
}


function TankVisual({ label, litres, capacity, tone, source }: {
  label: string; litres: number | null; capacity: number;
  tone: 'pms' | 'ago'; source: string;
}) {
  const hasCapacity = Number.isFinite(capacity) && capacity > 0;
  const percent = hasCapacity && litres !== null ? (litres / capacity) * 100 : null;
  const fill = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const liquid = tone === 'pms' ? 'bg-sky-500' : 'bg-amber-500';
  const textTone = tone === 'pms' ? 'text-sky-800' : 'text-amber-800';
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 min-w-0">
      <div className="relative h-24 w-14 shrink-0 overflow-hidden rounded-t-xl rounded-b-lg border-[3px] border-slate-400 bg-white">
        <div className={`absolute inset-x-0 bottom-0 ${liquid} opacity-80 transition-[height] duration-1000 ease-in-out`} style={{ height: `${fill}%` }} />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-400/70" />
        <div className="absolute inset-x-0 top-1/4 border-t border-dashed border-slate-400/50" />
      </div>
      <div className="min-w-0">
        <div className={`text-xs font-semibold ${textTone}`}>{label}</div>
        <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">{litres === null ? '—' : `${Math.round(litres).toLocaleString()} L`}</div>
        <div className="mt-1 text-[11px] text-slate-500">{source}</div>
        <div className="mt-1 text-[10px] text-slate-500">
          {percent === null ? "Capacity not configured" : `${percent.toFixed(1)}% of ${Math.round(capacity).toLocaleString()} L`}
        </div>
      </div>
    </div>
  );
}

export function StockControlView({ reports, stations, fuelFilter, onInspectReport }: StockControlViewProps) {
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

      {(() => {
        const latestByStation = new Map<string, DailyReport>();
        for (const report of reports) {
          const key = report.stationName.trim().toLowerCase();
          const previous = latestByStation.get(key);
          if (!previous || report.reportDate > previous.reportDate) latestByStation.set(key, report);
        }
        const latest = [...latestByStation.values()].sort((a, b) => a.stationName.localeCompare(b.stationName));
        return (
          <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Station Tank Monitoring</h2>
                <p className="mt-1 text-xs text-slate-500">Latest stock-control reading in the selected period. Uses dip closing stock when available, otherwise theoretical closing stock.</p>
              </div>
              <span className="text-xs text-slate-500">{latest.length} stations</span>
            </div>
            {latest.length === 0 ? (
              <div className="rounded-md bg-slate-50 p-6 text-center text-sm text-slate-500">No stock-control readings are available for the selected filters.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {latest.map((report) => (
                  <div key={report.stationName} className="rounded-lg border border-slate-200 p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">{report.stationName}</h3>
                      <span className="text-[11px] text-slate-500">{report.reportDate}</span>
                    </div>
                    {showPms && <TankVisual label="PMS" litres={report.pmsClosingStock ?? report.pmsTheoreticalStock} capacity={stations.find((station) => station.stationId === report.stationId)?.tankCapacityPms ?? 0} tone="pms" source={report.pmsClosingStock !== null ? "Dip closing stock" : report.pmsTheoreticalStock !== null ? "Theoretical stock" : "No reading"} />}
                    {showAgo && <TankVisual label="AGO" litres={report.agoClosingStock ?? report.agoTheoreticalStock} capacity={stations.find((station) => station.stationId === report.stationId)?.tankCapacityAgo ?? 0} tone="ago" source={report.agoClosingStock !== null ? "Dip closing stock" : report.agoTheoreticalStock !== null ? "Theoretical stock" : "No reading"} />}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-slate-500">Fill percentages use each station's configured tank capacity. Where capacity is not configured, the stock volume is shown without a percentage. Readings are dip closing stock when available, otherwise theoretical stock.</p>
          </section>
        );
      })()}

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
