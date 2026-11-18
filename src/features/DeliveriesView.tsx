import { formatLitres, formatNumber, sumNullable } from '../lib/formatters';
import type { DailyReport } from '../types/logix';

interface DeliveriesViewProps {
  reports: DailyReport[];
  onInspectReport: (report: DailyReport) => void;
}

export function DeliveriesView({ reports, onInspectReport }: DeliveriesViewProps) {
  const deliveryEvents = reports.filter(
    (r) =>
      (r.directDeliveryLitres ?? 0) > 0 ||
      (r.diversionLitres ?? 0) > 0 ||
      (r.shortageLitres ?? 0) > 0
  );

  const totalDirect = sumNullable(reports.map((r) => r.directDeliveryLitres));
  const totalDiverted = sumNullable(reports.map((r) => r.diversionLitres));
  const totalShortage = sumNullable(reports.map((r) => r.shortageLitres));
  const totalReceived = sumNullable(reports.map((r) => r.receivedLitres));

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Direct Dispatched Volume</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
            {formatLitres(totalDirect)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Net Received at Station</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-teal-800">
            {formatLitres(totalReceived)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Diverted Volume</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-amber-800">
            {formatLitres(totalDiverted)}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-md p-4">
          <div className="text-xs text-slate-500">Transit Shortages</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-red-700">
            {formatLitres(totalShortage)}
          </div>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Tanker Deliveries, Diversions & Shortages
            </h2>
            <p className="text-xs text-slate-500">
              Origin-to-destination tanker movement ledger extracted from daily sheets
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">{deliveryEvents.length} movements</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left py-2 pr-3 font-medium">Date</th>
                <th className="text-left py-2 px-3 font-medium">Station</th>
                <th className="text-left py-2 px-3 font-medium">Origin</th>
                <th className="text-left py-2 px-3 font-medium">Destination / Diversion</th>
                <th className="text-right py-2 px-3 font-medium">Direct (L)</th>
                <th className="text-right py-2 px-3 font-medium">Diverted (L)</th>
                <th className="text-right py-2 px-3 font-medium">Shortage (L)</th>
                <th className="text-right py-2 pl-3 font-medium">Received (L)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {deliveryEvents.map((r) => (
                <tr
                  key={r.reportId}
                  onClick={() => onInspectReport(r)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="py-2.5 pr-3 text-slate-900 whitespace-nowrap">{r.reportDate}</td>
                  <td className="py-2.5 px-3 font-sans font-medium text-slate-900 whitespace-nowrap">
                    {r.stationName}
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-600">{r.deliveryOrigin ?? '—'}</td>
                  <td className="py-2.5 px-3 font-sans text-slate-700">
                    {r.diversionDirection ? (
                      <span className="text-amber-800 font-medium">{r.diversionDirection}</span>
                    ) : (
                      r.deliveryDestination ?? '—'
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">{formatNumber(r.directDeliveryLitres)}</td>
                  <td className="py-2.5 px-3 text-right text-amber-800">
                    {formatNumber(r.diversionLitres)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-red-700">
                    {formatNumber(r.shortageLitres)}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-semibold text-teal-800">
                    {formatNumber(r.receivedLitres)}
                  </td>
                </tr>
              ))}
              {deliveryEvents.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center font-sans text-slate-500">
                    No tanker deliveries or diversions recorded in the selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
