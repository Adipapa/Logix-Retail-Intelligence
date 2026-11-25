import { FileSpreadsheet, X } from 'lucide-react';
import { formatGmd, formatLitres, formatNumber, formatPercent } from '../lib/formatters';
import type { DailyReport } from '../types/logix';
import { StatusLabel } from './StatusLabel';

interface ReportDetailDrawerProps {
  report: DailyReport | null;
  onClose: () => void;
}

function SheetTable({ title, headers, children, className = '' }: {
  title: string;
  headers: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-2 border-slate-900 bg-white ${className}`}>
      <div className="border-b-2 border-slate-900 px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide text-slate-900">
        {title}
      </div>
      <table className="w-full table-fixed border-collapse text-[10px] leading-tight">
        <thead>
          <tr className="bg-slate-100">
            {headers.map((header) => (
              <th key={header} className="border border-slate-700 px-1.5 py-1 text-center font-bold text-slate-800">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

function SheetRow({ label, values, strong = false, alert = false }: {
  label: string;
  values: string[];
  strong?: boolean;
  alert?: boolean;
}) {
  return (
    <tr className={strong ? 'bg-slate-100 font-bold' : ''}>
      <td className="border border-slate-700 px-1.5 py-1 font-semibold text-slate-800">{label}</td>
      {values.map((value, index) => (
        <td key={index} className={`border border-slate-700 px-1.5 py-1 text-right font-mono tabular-nums ${alert ? 'bg-rose-100 text-rose-700 font-bold' : 'text-slate-900'}`}>
          {value}
        </td>
      ))}
    </tr>
  );
}

export function ReportDetailDrawer({ report, onClose }: ReportDetailDrawerProps) {
  if (!report) return null;

  const money = (value: number | null | undefined) => value == null ? '' : formatGmd(value);
  const litres = (value: number | null | undefined) => value == null ? '' : formatLitres(value);
  const pumpRows = report.pumpReadings ?? [];
  const deliveryPresent = [
    report.directDeliveryLitres, report.diversionLitres, report.shortageLitres,
    report.receivedLitres, report.deliveryOrigin, report.deliveryDestination,
  ].some((value) => value !== null && value !== undefined && value !== '');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Daily report source lineage and audit view">
      <div className="mx-auto flex h-full w-full max-w-[1800px] flex-col overflow-hidden border border-slate-300 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b-2 border-slate-900 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div className="text-xs"><span className="font-bold">Station:</span> <span className="ml-2 text-sm font-bold uppercase">{report.stationName}</span></div>
            <div className="text-xs"><span className="font-bold">Territory:</span> <span className="ml-1">{report.territory || '—'}</span></div>
            <div className="text-xs"><span className="font-bold">Date:</span> <span className="ml-2 font-mono font-bold">{report.reportDate}</span></div>
            <div className="text-xs"><span className="font-bold">Weekday:</span> <span className="ml-1">{report.weekday || '—'}</span></div>
            <div className="flex items-center gap-2"><StatusLabel status={report.completeness} /></div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-500 lg:inline">Daily Report Source Lineage & Audit View</span>
            <button type="button" onClick={onClose} className="rounded border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Close lineage view">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto bg-slate-100 p-2 sm:p-3">
          <div className="grid min-w-[1000px] grid-cols-[minmax(0,2.05fr)_minmax(190px,0.82fr)_minmax(260px,1.05fr)] items-start gap-3">
            <div className="space-y-3">
              <SheetTable title="Pump Meter Readings & Shift Sales" headers={['PUMP / ISLAND', 'PRODUCT', 'SHIFT', 'OPENING METER', 'CLOSING METER', 'THROUGHPUT']}>
                {pumpRows.length ? pumpRows.map((pump, index) => (
                  <tr key={`${pump.pumpId}-${pump.shift}-${index}`}>
                    <td className="border border-slate-700 px-1.5 py-1 font-semibold">{pump.pumpId} · {pump.island}</td>
                    <td className="border border-slate-700 px-1.5 py-1 text-center font-bold">{pump.product}</td>
                    <td className="border border-slate-700 px-1.5 py-1">{pump.shift}</td>
                    <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{pump.openingMeter == null ? '' : formatNumber(pump.openingMeter)}</td>
                    <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{pump.closingMeter == null ? '' : formatNumber(pump.closingMeter)}</td>
                    <td className={`border border-slate-700 px-1.5 py-1 text-right font-mono font-semibold ${pump.flag === 'negative_movement' ? 'text-rose-700' : ''}`}>{litres(pump.throughput)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="border border-slate-700 px-2 py-3 text-center text-slate-500">No pump-level meter rows were extracted from this report.</td></tr>
                )}
              </SheetTable>

              <SheetTable title="Product Sales by Shift" headers={['PRODUCT', 'MORNING (L)', 'AFTERNOON (L)', 'NIGHT (L)', 'TOTAL (L)', 'SALES (GMD)']}>
                <tr>
                  <td className="border border-slate-700 px-1.5 py-1 font-bold text-teal-800">PMS</td>
                  {[report.pmsMorningLitres, report.pmsAfternoonLitres, report.pmsNightLitres, report.pmsTotalLitres].map((v, i) => <td key={i} className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres(v)}</td>)}
                  <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{money(report.pmsSalesGmd)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-700 px-1.5 py-1 font-bold text-amber-800">AGO</td>
                  {[report.agoMorningLitres, report.agoAfternoonLitres, report.agoNightLitres, report.agoTotalLitres].map((v, i) => <td key={i} className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres(v)}</td>)}
                  <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{money(report.agoSalesGmd)}</td>
                </tr>
                <tr className="bg-slate-100 font-bold">
                  <td className="border border-slate-700 px-1.5 py-1">TOTAL</td>
                  <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres((report.pmsMorningLitres ?? 0) + (report.agoMorningLitres ?? 0))}</td>
                  <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres((report.pmsAfternoonLitres ?? 0) + (report.agoAfternoonLitres ?? 0))}</td>
                  <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres((report.pmsNightLitres ?? 0) + (report.agoNightLitres ?? 0))}</td>
                  <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres((report.pmsTotalLitres ?? 0) + (report.agoTotalLitres ?? 0))}</td>
                  <td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{money(report.totalFuelSalesGmd)}</td>
                </tr>
              </SheetTable>

              <SheetTable title="Deliveries & Transfers — PMS / AGO" headers={['PRODUCT', 'ORIGIN', 'DESTINATION', 'DIRECT (L)', 'DIVERSION (L)', 'SHORTAGE (L)', 'RECEIVED (L)']}>
                {deliveryPresent ? (
                  <tr>
                    <td className="border border-slate-700 px-1.5 py-1 font-bold">PMS / AGO</td>
                    <td className="border border-slate-700 px-1.5 py-1">{report.deliveryOrigin || ''}</td>
                    <td className="border border-slate-700 px-1.5 py-1">{report.deliveryDestination || ''}</td>
                    {[report.directDeliveryLitres, report.diversionLitres, report.shortageLitres, report.receivedLitres].map((v, i) => <td key={i} className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres(v)}</td>)}
                  </tr>
                ) : (
                  <tr><td colSpan={7} className="border border-slate-700 px-2 py-3 text-center text-slate-500">No delivery or transfer details recorded.</td></tr>
                )}
              </SheetTable>
            </div>

            <div className="space-y-3">
              <SheetTable title="Credit Sales" headers={['DETAIL', 'AMOUNT (GMD)']}>
                <SheetRow label="Credit Sales" values={[money(report.creditSalesGmd)]} />
                <SheetRow label="Total" values={[money(report.creditSalesGmd)]} strong />
              </SheetTable>

              <SheetTable title="Cheque" headers={['DETAIL', 'AMOUNT (GMD)']}>
                <SheetRow label="Cheques" values={[money(report.chequesGmd)]} />
                <SheetRow label="Total" values={[money(report.chequesGmd)]} strong />
              </SheetTable>

              <SheetTable title="Other Payment Channels" headers={['CHANNEL', 'AMOUNT (GMD)']}>
                <SheetRow label="Coupons" values={[money(report.couponsGmd)]} />
                <SheetRow label="QMoney" values={[money(report.qmoneyGmd)]} />
                <SheetRow label="Waychit" values={[money(report.waychitGmd)]} />
              </SheetTable>

              <SheetTable title="Pump Return to Tank" headers={['PRODUCT', 'RETURN (L)']}>
                <SheetRow label="PMS" values={[litres(report.pmsReturnToTankLitres)]} />
                <SheetRow label="AGO" values={[litres(report.agoReturnToTankLitres)]} />
              </SheetTable>
            </div>

            <div className="space-y-3">
              <SheetTable title="Stock Control" headers={['STOCK POSITION', 'PMS (L)', 'AGO (L)']}>
                <SheetRow label="Stock Opening (A)" values={[litres(report.pmsOpeningStock), litres(report.agoOpeningStock)]} />
                <SheetRow label="Receipts (B)" values={[litres(report.pmsReceipts), litres(report.agoReceipts)]} />
                <SheetRow label="Stock Total (C=A+B)" values={[litres(report.pmsOpeningStock == null && report.pmsReceipts == null ? null : (report.pmsOpeningStock ?? 0) + (report.pmsReceipts ?? 0)), litres(report.agoOpeningStock == null && report.agoReceipts == null ? null : (report.agoOpeningStock ?? 0) + (report.agoReceipts ?? 0))]} />
                <SheetRow label="Sales (D)" values={[litres(report.pmsTotalLitres), litres(report.agoTotalLitres)]} />
                <SheetRow label="Theoretical Stock (E=C-D)" values={[litres(report.pmsTheoreticalStock), litres(report.agoTheoreticalStock)]} />
                <SheetRow label="Closing Stock (F)" values={[litres(report.pmsClosingStock), litres(report.agoClosingStock)]} />
                <SheetRow label="Difference (F-E)" values={[litres(report.pmsStockDiff), litres(report.agoStockDiff)]} alert={(report.pmsStockDiff ?? 0) < 0 || (report.agoStockDiff ?? 0) < 0} />
                <SheetRow label="Control (%)" values={[formatPercent(report.pmsStockControlRatio), formatPercent(report.agoStockControlRatio)]} strong />
              </SheetTable>

              <SheetTable title="Sales Summary" headers={['PRODUCT', 'VOLUME (L)', 'AMOUNT (GMD)']}>
                <tr><td className="border border-slate-700 px-1.5 py-1 font-bold text-teal-800">PMS</td><td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres(report.pmsTotalLitres)}</td><td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{money(report.pmsSalesGmd)}</td></tr>
                <tr><td className="border border-slate-700 px-1.5 py-1 font-bold text-amber-800">AGO</td><td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{litres(report.agoTotalLitres)}</td><td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{money(report.agoSalesGmd)}</td></tr>
                <tr className="bg-slate-100 font-bold"><td colSpan={2} className="border border-slate-700 px-1.5 py-1">TOTAL</td><td className="border border-slate-700 px-1.5 py-1 text-right font-mono">{money(report.totalFuelSalesGmd)}</td></tr>
              </SheetTable>

              <SheetTable title="Utilities" headers={['ITEM', 'READING / AMOUNT']}>
                <SheetRow label="Generator Runtime (hrs)" values={[report.generatorRuntimeHrs == null ? '' : formatNumber(report.generatorRuntimeHrs)]} />
                <SheetRow label="Generator Refuel (L)" values={[litres(report.generatorRefuelLitres)]} />
                <SheetRow label="Cashpower (kWh)" values={[report.cashpowerKwh == null ? '' : formatNumber(report.cashpowerKwh)]} />
                <SheetRow label="Cashpower Purchase" values={[money(report.cashpowerPurchaseGmd)]} />
              </SheetTable>

              <SheetTable title="Cash Reconciliation" headers={['DESCRIPTION', 'AMOUNT (GMD)']}>
                <SheetRow label="Sales" values={[money(report.totalFuelSalesGmd)]} />
                <SheetRow label="Coupons" values={[money(report.couponsGmd)]} />
                <SheetRow label="QMoney" values={[money(report.qmoneyGmd)]} />
                <SheetRow label="Waychit" values={[money(report.waychitGmd)]} />
                <SheetRow label="Cheques" values={[money(report.chequesGmd)]} />
                <SheetRow label="Credit Sales" values={[money(report.creditSalesGmd)]} />
                <SheetRow label="Cash" values={[money(report.cashGmd)]} />
                <SheetRow label="Banked" values={[money(report.bankedGmd)]} strong />
                <SheetRow label="Difference" values={[money(report.reconciliationDiffGmd)]} alert={(report.reconciliationDiffGmd ?? 0) < 0} />
              </SheetTable>
            </div>
          </div>

          <section className="mt-3 border-2 border-slate-900 bg-white">
            <div className="border-b-2 border-slate-900 px-2 py-1 text-[11px] font-bold uppercase tracking-wide">Workbook Source Lineage & Audit Trail</div>
            <div className="grid grid-cols-1 gap-2 p-2 text-[10px] sm:grid-cols-2 xl:grid-cols-4">
              <div><div className="font-bold text-slate-500">DROPBOX SOURCE PATH</div><div className="break-all font-mono">{report.workbookPath || 'Not recorded'}</div></div>
              <div><div className="font-bold text-slate-500">WORKSHEET / SOURCE ROW</div><div className="font-mono">{report.worksheetName || '—'} · {report.sourceRowRef || 'Daily sheet'}</div></div>
              <div><div className="font-bold text-slate-500">WORKBOOK ID / REVISION</div><div className="break-all font-mono">{report.workbookId || '—'} · {report.workbookRevision || '—'}</div></div>
              <div><div className="font-bold text-slate-500">REPORT STATUS / UPDATED</div><div className="font-mono">{report.completeness} · {report.updatedAt || report.createdAt || '—'}</div></div>
            </div>
            {report.noteText && <div className="border-t border-slate-700 px-2 py-1.5 text-[10px]"><span className="font-bold">SOURCE NOTES: </span>{report.noteText}</div>}
          </section>
          <div className="pb-1 text-right text-[9px] text-slate-500">Displayed values are extracted report fields. Blank cells indicate that no value is available in the imported record.</div>
        </main>
      </div>
    </div>
  );
}
