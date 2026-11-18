import { FuelComparisonChart, ShiftSplitBars } from '../components/Charts';
import { StatusLabel } from '../components/StatusLabel';
import { formatGmd, formatLitres, formatNumber, sumNullable } from '../lib/formatters';
import type { DailyReport, FuelFilter } from '../types/logix';

interface FuelSalesViewProps {
  reports: DailyReport[];
  fuelFilter: FuelFilter;
  onInspectReport: (report: DailyReport) => void;
}

export function FuelSalesView({ reports, fuelFilter, onInspectReport }: FuelSalesViewProps) {
  const showPms = fuelFilter === 'ALL' || fuelFilter === 'PMS';
  const showAgo = fuelFilter === 'ALL' || fuelFilter === 'AGO';

  const pmsMorning = sumNullable(reports.map((r) => r.pmsMorningLitres));
  const pmsAfternoon = sumNullable(reports.map((r) => r.pmsAfternoonLitres));
  const pmsNight = sumNullable(reports.map((r) => r.pmsNightLitres));
  const pmsTotal = sumNullable(reports.map((r) => r.pmsTotalLitres));
  const pmsSales = sumNullable(reports.map((r) => r.pmsSalesGmd));
  const pmsReturn = sumNullable(reports.map((r) => r.pmsReturnToTankLitres));

  const agoMorning = sumNullable(reports.map((r) => r.agoMorningLitres));
  const agoAfternoon = sumNullable(reports.map((r) => r.agoAfternoonLitres));
  const agoNight = sumNullable(reports.map((r) => r.agoNightLitres));
  const agoTotal = sumNullable(reports.map((r) => r.agoTotalLitres));
  const agoSales = sumNullable(reports.map((r) => r.agoSalesGmd));
  const agoReturn = sumNullable(reports.map((r) => r.agoReturnToTankLitres));

  const byDateMap = new Map<string, { label: string; pms: number; ago: number }>();
  [...reports]
    .sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    .forEach((r) => {
      const prev = byDateMap.get(r.reportDate) ?? { label: r.reportDate.slice(5), pms: 0, ago: 0 };
      prev.pms += r.pmsSalesGmd ?? 0;
      prev.ago += r.agoSalesGmd ?? 0;
      byDateMap.set(r.reportDate, prev);
    });

  const salesChartData = Array.from(byDateMap.values()).map((d) => ({
    label: d.label,
    pmsValue: d.pms,
    agoValue: d.ago,
  }));

  return (
    <div className="space-y-6">
      {/* Product Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {showPms && (
          <div className="bg-white border border-slate-200 rounded-md p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-teal-800">PMS (Petrol) Sales Summary</h2>
              <span className="text-xs font-mono text-slate-500">Return to tank: {formatLitres(pmsReturn)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-4">
              <div className="text-2xl font-display font-semibold font-mono tabular-nums text-slate-900">
                {formatLitres(pmsTotal)}
              </div>
              <div className="text-sm font-mono tabular-nums text-slate-600">{formatGmd(pmsSales)}</div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <ShiftSplitBars
                label="PMS Shift Mix"
                morning={pmsMorning}
                afternoon={pmsAfternoon}
                night={pmsNight}
                accentClass="bg-teal-700"
              />
            </div>
          </div>
        )}

        {showAgo && (
          <div className="bg-white border border-slate-200 rounded-md p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-amber-800">AGO (Diesel) Sales Summary</h2>
              <span className="text-xs font-mono text-slate-500">Return to tank: {formatLitres(agoReturn)}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-4">
              <div className="text-2xl font-display font-semibold font-mono tabular-nums text-slate-900">
                {formatLitres(agoTotal)}
              </div>
              <div className="text-sm font-mono tabular-nums text-slate-600">{formatGmd(agoSales)}</div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <ShiftSplitBars
                label="AGO Shift Mix"
                morning={agoMorning}
                afternoon={agoAfternoon}
                night={agoNight}
                accentClass="bg-amber-700"
              />
            </div>
          </div>
        )}
      </section>

      {/* Revenue Chart */}
      <section className="bg-white border border-slate-200 rounded-md p-5">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">Daily Fuel Revenue (GMD)</h2>
          <p className="text-xs text-slate-500">PMS and AGO revenue tracked independently</p>
        </div>
        <FuelComparisonChart data={salesChartData} unit="GMD" showPms={showPms} showAgo={showAgo} />
      </section>

      {/* Daily Shift Table */}
      <section className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-slate-900">Shift & Fuel Sales Ledger</h2>
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
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS AM</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS PM</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS Night</th>
                    <th className="text-right py-2 px-2 font-medium text-teal-800">PMS Total (L)</th>
                  </>
                )}
                {showAgo && (
                  <>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO AM</th>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO PM</th>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO Night</th>
                    <th className="text-right py-2 px-2 font-medium text-amber-800">AGO Total (L)</th>
                  </>
                )}
                <th className="text-right py-2 px-2 font-medium">Total Sales (GMD)</th>
                <th className="text-left py-2 pl-2 font-medium">Status</th>
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
                      <td className="py-2 px-2 text-right">{formatNumber(r.pmsMorningLitres)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.pmsAfternoonLitres)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.pmsNightLitres)}</td>
                      <td className="py-2 px-2 text-right font-semibold text-teal-800">
                        {formatNumber(r.pmsTotalLitres)}
                      </td>
                    </>
                  )}
                  {showAgo && (
                    <>
                      <td className="py-2 px-2 text-right">{formatNumber(r.agoMorningLitres)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.agoAfternoonLitres)}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(r.agoNightLitres)}</td>
                      <td className="py-2 px-2 text-right font-semibold text-amber-800">
                        {formatNumber(r.agoTotalLitres)}
                      </td>
                    </>
                  )}
                  <td className="py-2 px-2 text-right font-semibold text-slate-900">
                    {formatGmd(r.totalFuelSalesGmd)}
                  </td>
                  <td className="py-2 pl-2 font-sans">
                    <StatusLabel status={r.completeness} />
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
