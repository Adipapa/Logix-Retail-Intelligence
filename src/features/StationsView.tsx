import { useState } from 'react';
import { ArrowLeft, ArrowUpRight, FolderOpen } from 'lucide-react';
import { FuelComparisonChart } from '../components/Charts';
import { StatusLabel } from '../components/StatusLabel';
import { formatGmd, formatLitres, formatMonthName, formatNumber, sumNullable } from '../lib/formatters';
import type { DailyReport, SourceWorkbook, Station } from '../types/logix';

interface StationsViewProps {
  stations: Station[];
  reports: DailyReport[];
  workbooks: SourceWorkbook[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string | null) => void;
  onInspectReport: (report: DailyReport) => void;
  canManageStations: boolean;
  onSaveTankCapacities: (stationName: string, pmsCapacityLitres: number | null, agoCapacityLitres: number | null) => Promise<void>;
}

function TankCapacityEditor({
  station,
  onSave,
}: {
  station: Station;
  onSave: (stationName: string, pmsCapacityLitres: number | null, agoCapacityLitres: number | null) => Promise<void>;
}) {
  const [pms, setPms] = useState(station.tankCapacityPms > 0 ? String(station.tankCapacityPms) : "");
  const [ago, setAgo] = useState(station.tankCapacityAgo > 0 ? String(station.tankCapacityAgo) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const pmsValue = pms.trim() ? Number(pms) : null;
    const agoValue = ago.trim() ? Number(ago) : null;
    if ((pmsValue !== null && (!Number.isFinite(pmsValue) || pmsValue <= 0)) ||
        (agoValue !== null && (!Number.isFinite(agoValue) || agoValue <= 0))) {
      setError("Enter positive capacity values in litres, or leave a field blank.");
      return;
    }
    if (pmsValue === null && agoValue === null) {
      setError("Enter at least one tank capacity.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(station.canonicalName, pmsValue, agoValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save tank capacities.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Configure tank capacities</h3>
        <p className="mt-1 text-xs text-slate-500">Enter the actual installed tank capacities. These values determine tank-level percentages; they are not estimated from sales data.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-600">
          PMS capacity (litres)
          <input type="number" min="1" step="any" value={pms} onChange={(event) => setPms(event.target.value)} placeholder="e.g. 30000" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="text-xs text-slate-600">
          AGO capacity (litres)
          <input type="number" min="1" step="any" value={ago} onChange={(event) => setAgo(event.target.value)} placeholder="e.g. 25000" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <button type="submit" disabled={saving} className="rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save tank capacities"}
      </button>
    </form>
  );
}

export function StationsView({
  stations,
  reports,
  workbooks,
  selectedStationId,
  onSelectStation,
  onInspectReport,
  canManageStations,
  onSaveTankCapacities,
}: StationsViewProps) {
  if (selectedStationId) {
    const station = stations.find((s) => s.stationId === selectedStationId);
    if (!station) {
      return (
        <div className="bg-white border border-slate-200 rounded-md p-6">
          <p className="text-sm text-slate-600">Station not found.</p>
          <button
            type="button"
            onClick={() => onSelectStation(null)}
            className="mt-3 text-xs font-medium text-blue-700 hover:underline"
          >
            Back to all stations
          </button>
        </div>
      );
    }

    const stReports = reports
      .filter((r) => r.stationId === station.stationId)
      .sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    const stWorkbooks = workbooks
      .filter((w) => w.stationId === station.stationId)
      .sort((a, b) => b.year - a.year || b.month - a.month);

    const pmsVol = sumNullable(stReports.map((r) => r.pmsTotalLitres));
    const agoVol = sumNullable(stReports.map((r) => r.agoTotalLitres));
    const totalSales = sumNullable(stReports.map((r) => r.totalFuelSalesGmd));
    const latestReport = stReports[stReports.length - 1];

    const chartData = stReports.map((r) => ({
      label: r.reportDate.slice(5),
      pmsValue: r.pmsTotalLitres ?? 0,
      agoValue: r.agoTotalLitres ?? 0,
    }));

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => onSelectStation(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>All Stations</span>
            </button>
            <h2 className="text-xl font-display font-semibold text-slate-900">
              {station.canonicalName} · {station.territory}
            </h2>
            <div className="mt-1 text-xs text-slate-500 font-mono">
              Dropbox folder: {station.folderPath} · Aliases: {station.aliases.join(', ')}
            </div>
          </div>
          <div className="text-xs text-slate-600 font-mono tabular-nums">
            {station.pumpCount} pumps · PMS Tank {station.tankCapacityPms > 0 ? formatLitres(station.tankCapacityPms) : "Not configured"} · AGO Tank {station.tankCapacityAgo > 0 ? formatLitres(station.tankCapacityAgo) : "Not configured"}
          </div>
        </div>

        {canManageStations && (
          <TankCapacityEditor
            key={station.stationId}
            station={station}
            onSave={onSaveTankCapacities}
          />
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <div className="text-xs text-slate-500">Station Sales (Filtered)</div>
            <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-slate-900">
              {formatGmd(totalSales)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <div className="text-xs text-slate-500">PMS Volume</div>
            <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-teal-800">
              {formatLitres(pmsVol)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <div className="text-xs text-slate-500">AGO Volume</div>
            <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-amber-800">
              {formatLitres(agoVol)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-md p-4">
            <div className="text-xs text-slate-500">Latest Closing Stock (PMS / AGO)</div>
            <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-slate-900">
              {latestReport
                ? `${formatLitres(latestReport.pmsClosingStock)} / ${formatLitres(latestReport.agoClosingStock)}`
                : '—'}
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-md p-5">
          <h3 className="text-base font-semibold text-slate-900 mb-3">
            Daily Volume Performance (PMS vs AGO)
          </h3>
          <FuelComparisonChart data={chartData} unit="L" />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-md p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-3">
              Ingested Workbooks ({stWorkbooks.length})
            </h3>
            <div className="divide-y divide-slate-200 text-xs">
              {stWorkbooks.map((wb) => (
                <div key={wb.workbookId} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{wb.fileName}</div>
                    <div className="text-[11px] font-mono text-slate-500">
                      {formatMonthName(wb.month)} {wb.year} · {wb.dailySheetsFound} daily sheets · {wb.revision}
                    </div>
                  </div>
                  <StatusLabel status={wb.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-md p-5">
            <h3 className="text-base font-semibold text-slate-900 mb-3">
              Daily Reports ({stReports.length})
            </h3>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 text-slate-500 sticky top-0 bg-white">
                  <tr>
                    <th className="text-left py-2 pr-3 font-medium">Date</th>
                    <th className="text-left py-2 px-3 font-medium">Sheet</th>
                    <th className="text-right py-2 px-3 font-medium">PMS (L)</th>
                    <th className="text-right py-2 px-3 font-medium">AGO (L)</th>
                    <th className="text-right py-2 px-3 font-medium">Sales (GMD)</th>
                    <th className="text-left py-2 pl-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[...stReports].reverse().map((r) => (
                    <tr
                      key={r.reportId}
                      onClick={() => onInspectReport(r)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2 pr-3 font-mono tabular-nums text-slate-900">{r.reportDate}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{r.worksheetName}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-teal-800">
                        {formatNumber(r.pmsTotalLitres)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-800">
                        {formatNumber(r.agoTotalLitres)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-medium">
                        {formatGmd(r.totalFuelSalesGmd)}
                      </td>
                      <td className="py-2 pl-3">
                        <StatusLabel status={r.completeness} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Logix Retail Station Register & Reporting Coverage
            </h2>
            <p className="text-xs text-slate-500">
              Select a station to review daily, monthly, and annual performance and source Dropbox workbooks
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500">{stations.length} active stations</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left py-2.5 pr-3 font-medium">Station</th>
                <th className="text-left py-2.5 px-3 font-medium">Territory</th>
                <th className="text-left py-2.5 px-3 font-medium">Dropbox Folder</th>
                <th className="text-right py-2.5 px-3 font-medium">Workbooks</th>
                <th className="text-right py-2.5 px-3 font-medium">Daily Sheets</th>
                <th className="text-right py-2.5 px-3 font-medium">PMS (L)</th>
                <th className="text-right py-2.5 px-3 font-medium">AGO (L)</th>
                <th className="text-right py-2.5 px-3 font-medium">Total Sales (GMD)</th>
                <th className="text-right py-2.5 pl-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {stations.map((st) => {
                const stReports = reports.filter((r) => r.stationId === st.stationId);
                const stWorkbooks = workbooks.filter((w) => w.stationId === st.stationId);
                const pms = sumNullable(stReports.map((r) => r.pmsTotalLitres));
                const ago = sumNullable(stReports.map((r) => r.agoTotalLitres));
                const sales = sumNullable(stReports.map((r) => r.totalFuelSalesGmd));
                return (
                  <tr
                    key={st.stationId}
                    onClick={() => onSelectStation(st.stationId)}
                    className="hover:bg-slate-50 cursor-pointer"
                  >
                    <td className="py-3 pr-3 font-semibold text-slate-900">{st.canonicalName}</td>
                    <td className="py-3 px-3 text-slate-600">{st.territory}</td>
                    <td className="py-3 px-3 font-mono text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <FolderOpen className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        {st.folderPath}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{stWorkbooks.length}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{stReports.length}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-teal-800">
                      {formatNumber(pms)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-800">
                      {formatNumber(ago)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-900">
                      {formatGmd(sales)}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                        <span>Inspect</span>
                        <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
