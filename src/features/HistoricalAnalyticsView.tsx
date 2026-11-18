import { FuelComparisonChart } from '../components/Charts';
import { formatGmd, formatLitres, formatNumber, sumNullable } from '../lib/formatters';
import type { DailyReport, Station } from '../types/logix';

interface HistoricalAnalyticsViewProps {
  allReports: DailyReport[];
  stations: Station[];
  selectedStationId: string;
}

export function HistoricalAnalyticsView({
  allReports,
  stations,
  selectedStationId,
}: HistoricalAnalyticsViewProps) {
  const scopedReports =
    selectedStationId === 'ALL'
      ? allReports
      : allReports.filter((r) => r.stationId === selectedStationId);

  const years = Array.from(new Set(scopedReports.map((r) => r.year))).sort((a, b) => a - b);

  const annualRows = years.map((yr, idx) => {
    const yrReports = scopedReports.filter((r) => r.year === yr);
    const pms = sumNullable(yrReports.map((r) => r.pmsTotalLitres));
    const ago = sumNullable(yrReports.map((r) => r.agoTotalLitres));
    const sales = sumNullable(yrReports.map((r) => r.totalFuelSalesGmd));
    const avgDailySales = yrReports.length > 0 ? sales / yrReports.length : 0;

    let yoyChangePct: number | null = null;
    if (idx > 0) {
      const prevYearReports = scopedReports.filter((r) => r.year === years[idx - 1]);
      const prevAvg =
        prevYearReports.length > 0
          ? sumNullable(prevYearReports.map((r) => r.totalFuelSalesGmd)) / prevYearReports.length
          : 0;
      if (prevAvg > 0) {
        yoyChangePct = ((avgDailySales - prevAvg) / prevAvg) * 100;
      }
    }

    return {
      year: yr,
      reportCount: yrReports.length,
      pms,
      ago,
      sales,
      avgDailySales,
      yoyChangePct,
    };
  });

  const chartData = annualRows.map((row) => ({
    label: String(row.year),
    pmsValue: row.pms,
    agoValue: row.ago,
  }));

  // Station x Year Avg Daily Volume matrix
  const stationNames = stations.map((s) => s.canonicalName).join(', ');

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-md p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">
            Multi-Year Historical Throughput (2022–2026)
          </h2>
          <p className="text-xs text-slate-500">
            All historical years consolidated across {selectedStationId === 'ALL' ? stationNames : selectedStationId}
          </p>
        </div>
        <FuelComparisonChart data={chartData} unit="L" />
      </section>

      <section className="bg-white border border-slate-200 rounded-md p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Year-on-Year Average Daily & Period Summary
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left py-2 pr-3 font-medium">Year</th>
                <th className="text-right py-2 px-3 font-medium">Sampled Daily Sheets</th>
                <th className="text-right py-2 px-3 font-medium text-teal-800">PMS Volume (L)</th>
                <th className="text-right py-2 px-3 font-medium text-amber-800">AGO Volume (L)</th>
                <th className="text-right py-2 px-3 font-medium">Total Fuel Sales (GMD)</th>
                <th className="text-right py-2 px-3 font-medium">Avg Daily Sales (GMD)</th>
                <th className="text-right py-2 pl-3 font-medium">YoY Avg Daily Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {annualRows.map((row) => (
                <tr key={row.year} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-semibold text-slate-900">{row.year}</td>
                  <td className="py-2.5 px-3 text-right">{formatNumber(row.reportCount)}</td>
                  <td className="py-2.5 px-3 text-right text-teal-800">{formatLitres(row.pms)}</td>
                  <td className="py-2.5 px-3 text-right text-amber-800">{formatLitres(row.ago)}</td>
                  <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                    {formatGmd(row.sales)}
                  </td>
                  <td className="py-2.5 px-3 text-right">{formatGmd(Math.round(row.avgDailySales))}</td>
                  <td
                    className={`py-2.5 pl-3 text-right font-semibold ${
                      row.yoyChangePct === null
                        ? 'text-slate-400'
                        : row.yoyChangePct >= 0
                        ? 'text-emerald-700'
                        : 'text-red-700'
                    }`}
                  >
                    {row.yoyChangePct === null
                      ? '—'
                      : `${row.yoyChangePct >= 0 ? '+' : ''}${row.yoyChangePct.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-md p-5">
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Station-to-Station Annual Daily Average (Litres / Day)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left py-2 pr-3 font-medium">Station</th>
                {years.map((y) => (
                  <th key={y} className="text-right py-2 px-3 font-medium font-mono">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {stations.map((st) => (
                <tr key={st.stationId} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-sans font-semibold text-slate-900">
                    {st.canonicalName}
                  </td>
                  {years.map((y) => {
                    const list = allReports.filter((r) => r.stationId === st.stationId && r.year === y);
                    const totalL = sumNullable(
                      list.map((r) => (r.pmsTotalLitres ?? 0) + (r.agoTotalLitres ?? 0))
                    );
                    const avgL = list.length > 0 ? Math.round(totalL / list.length) : null;
                    return (
                      <td key={y} className="py-2.5 px-3 text-right text-slate-800">
                        {formatLitres(avgL)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
