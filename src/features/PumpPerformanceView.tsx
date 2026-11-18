import { StatusLabel } from '../components/StatusLabel';
import { formatLitres, formatNumber } from '../lib/formatters';
import type { DailyReport, FuelFilter, PumpReading } from '../types/logix';

interface PumpPerformanceViewProps {
  reports: DailyReport[];
  fuelFilter: FuelFilter;
  onInspectReport: (report: DailyReport) => void;
}

interface FlattenedPumpRow {
  report: DailyReport;
  pump: PumpReading;
}

export function PumpPerformanceView({
  reports,
  fuelFilter,
  onInspectReport,
}: PumpPerformanceViewProps) {
  const rows: FlattenedPumpRow[] = [];
  reports.forEach((r) => {
    r.pumpReadings.forEach((p) => {
      if (fuelFilter === 'ALL' || p.product === fuelFilter) {
        rows.push({ report: r, pump: p });
      }
    });
  });

  const negativeMovements = rows.filter((x) => x.pump.flag === 'negative_movement');
  const totalPmsThroughput = rows
    .filter((x) => x.pump.product === 'PMS')
    .reduce((acc, x) => acc + (x.pump.throughput ?? 0), 0);
  const totalAgoThroughput = rows
    .filter((x) => x.pump.product === 'AGO')
    .reduce((acc, x) => acc + (x.pump.throughput ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">PMS Meter Throughput</div>
          <div className="mt-1 text-2xl font-display font-semibold font-mono tabular-nums text-teal-800">
            {formatLitres(totalPmsThroughput)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">AGO Meter Throughput</div>
          <div className="mt-1 text-2xl font-display font-semibold font-mono tabular-nums text-amber-800">
            {formatLitres(totalAgoThroughput)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Meter Exceptions Flagged</div>
          <div className="mt-1 text-2xl font-display font-semibold font-mono tabular-nums text-red-700">
            {negativeMovements.length}
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pump Opening & Closing Meter Readings
            </h2>
            <p className="text-xs text-slate-500">
              Negative or implausible meter movements are flagged automatically for mechanical audit
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">{rows.length} meter entries</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left py-2 pr-3 font-medium">Date</th>
                <th className="text-left py-2 px-3 font-medium">Station</th>
                <th className="text-left py-2 px-3 font-medium">Pump / Island</th>
                <th className="text-left py-2 px-3 font-medium">Product</th>
                <th className="text-left py-2 px-3 font-medium">Shift</th>
                <th className="text-right py-2 px-3 font-medium">Opening Meter</th>
                <th className="text-right py-2 px-3 font-medium">Closing Meter</th>
                <th className="text-right py-2 px-3 font-medium">Throughput (L)</th>
                <th className="text-left py-2 pl-3 font-medium">Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {rows.slice(0, 80).map((row, idx) => (
                <tr
                  key={`${row.report.reportId}_${row.pump.pumpId}_${idx}`}
                  onClick={() => onInspectReport(row.report)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="py-2 pr-3 text-slate-900 whitespace-nowrap">{row.report.reportDate}</td>
                  <td className="py-2 px-3 font-sans text-slate-800 whitespace-nowrap">
                    {row.report.stationName}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-700 whitespace-nowrap">
                    {row.pump.pumpId} · {row.pump.island}
                  </td>
                  <td className="py-2 px-3 font-sans font-medium">{row.pump.product}</td>
                  <td className="py-2 px-3 font-sans text-slate-600">{row.pump.shift}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(row.pump.openingMeter)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(row.pump.closingMeter)}</td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      row.pump.flag === 'negative_movement' ? 'text-red-700' : 'text-slate-900'
                    }`}
                  >
                    {formatLitres(row.pump.throughput)}
                  </td>
                  <td className="py-2 pl-3 font-sans">
                    <StatusLabel
                      status={
                        row.pump.flag === 'negative_movement'
                          ? 'error'
                          : row.pump.flag === 'missing_meter'
                          ? 'incomplete'
                          : 'imported'
                      }
                    />
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
