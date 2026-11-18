import { useState } from 'react';
import { BookmarkPlus, FileSpreadsheet, Printer, Trash2 } from 'lucide-react';
import { formatDateTime, formatGmd, formatLitres, formatMonthName, sanitizeId, sumNullable } from '../lib/formatters';
import { exportReportsToExcel } from '../services/workbookEngine';
import type { DailyReport, GlobalFilters, SavedReport, UserProfile } from '../types/logix';

interface ReportsExportViewProps {
  reports: DailyReport[];
  filters: GlobalFilters;
  onApplyFilters: (next: GlobalFilters) => void;
  savedReports: SavedReport[];
  user: UserProfile;
  onSavePreset: (preset: SavedReport) => Promise<void>;
  onDeletePreset: (id: string) => Promise<void>;
  onLogExport: (format: 'EXCEL' | 'PDF', rowCount: number) => Promise<void>;
}

export function ReportsExportView({
  reports,
  filters,
  onApplyFilters,
  savedReports,
  user,
  onSavePreset,
  onDeletePreset,
  onLogExport,
}: ReportsExportViewProps) {
  const [presetTitle, setPresetTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const totalSales = sumNullable(reports.map((r) => r.totalFuelSalesGmd));
  const totalPms = sumNullable(reports.map((r) => r.pmsTotalLitres));
  const totalAgo = sumNullable(reports.map((r) => r.agoTotalLitres));
  const totalBanked = sumNullable(reports.map((r) => r.bankedGmd));

  const handleExcelExport = async () => {
    const filePrefix = `Logix_Retail_Report_${filters.stationId}_${filters.year}_${filters.month}`;
    exportReportsToExcel(reports, filePrefix);
    await onLogExport('EXCEL', reports.length);
  };

  const handlePdfExport = async () => {
    await onLogExport('PDF', reports.length);
    window.print();
  };

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetTitle.trim()) return;
    setSaving(true);
    try {
      const preset: SavedReport = {
        ownerUid: user.uid,
        savedReportId: sanitizeId(`rpt_${Date.now()}`),
        title: presetTitle.trim().slice(0, 110),
        stationId: filters.stationId,
        year: filters.year,
        month: filters.month,
        fuelType: filters.fuelType,
        shift: filters.shift,
        statusFilter: filters.status,
        createdByEmail: user.email,
        createdAt: new Date().toISOString(),
      };
      await onSavePreset(preset);
      setPresetTitle('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export Actions */}
      <section className="bg-white border border-slate-200 rounded-md p-5 no-print">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Management Report Builder & Export
            </h2>
            <p className="text-xs text-slate-500">
              Exports reflect the currently filtered stations, years, months, and fuel products ({reports.length} rows)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleExcelExport}
              disabled={reports.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
              <span>Export Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={handlePdfExport}
              disabled={reports.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </button>
          </div>
        </div>

        {/* Save Filter Preset */}
        <form onSubmit={handleSavePreset} className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap gap-2.5">
          <input
            type="text"
            value={presetTitle}
            onChange={(e) => setPresetTitle(e.target.value)}
            placeholder="Name this filter preset (e.g., Kotu Q1 Audit)"
            className="h-9 px-3 text-xs border border-slate-200 rounded-md flex-1 min-w-[240px]"
          />
          <button
            type="submit"
            disabled={saving || !presetTitle.trim()}
            className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md disabled:opacity-50 transition-colors cursor-pointer"
          >
            <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{saving ? 'Saving...' : 'Save Filter View'}</span>
          </button>
        </form>
      </section>

      {/* Saved Presets */}
      {savedReports.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-md p-5 no-print">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Saved Management Views</h3>
          <div className="divide-y divide-slate-200 text-xs">
            {savedReports.map((preset) => (
              <div key={preset.savedReportId} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-900">{preset.title}</div>
                  <div className="text-slate-500 font-mono text-[11px]">
                    Station: {preset.stationId} · Year: {preset.year} · Month:{' '}
                    {preset.month === 'ALL' ? 'ALL' : formatMonthName(Number(preset.month))} · Fuel:{' '}
                    {preset.fuelType} · Saved {formatDateTime(preset.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onApplyFilters({
                        ...filters,
                        stationId: preset.stationId,
                        year: preset.year,
                        month: preset.month,
                        fuelType: preset.fuelType,
                        shift: preset.shift,
                        status: preset.statusFilter as GlobalFilters['status'],
                      })
                    }
                    className="px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePreset(preset.savedReportId)}
                    className="p-1.5 text-slate-400 hover:text-red-700"
                    aria-label="Delete saved preset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Printable Report Preview */}
      <section className="bg-white border border-slate-200 rounded-md p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-display font-semibold text-slate-900">
              Logix Retail — Management Operations Statement
            </h3>
            <p className="text-xs text-slate-500">
              Scope: Station={filters.stationId} · Year={filters.year} · Month={filters.month} · Fuel=
              {filters.fuelType}
            </p>
          </div>
          <div className="text-xs font-mono text-slate-500">Prepared by {user.email}</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-slate-200 text-xs">
          <div>
            <div className="text-slate-500">Total Fuel Sales</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
              {formatGmd(totalSales)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">PMS Volume</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-teal-800">
              {formatLitres(totalPms)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">AGO Volume</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-amber-800">
              {formatLitres(totalAgo)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Banked Deposits</div>
            <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
              {formatGmd(totalBanked)}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="text-left py-2 pr-2 font-medium">Date</th>
                <th className="text-left py-2 px-2 font-medium">Station</th>
                <th className="text-right py-2 px-2 font-medium">PMS (L)</th>
                <th className="text-right py-2 px-2 font-medium">AGO (L)</th>
                <th className="text-right py-2 px-2 font-medium">Sales (GMD)</th>
                <th className="text-right py-2 px-2 font-medium">Banked (GMD)</th>
                <th className="text-left py-2 pl-2 font-medium">Source Sheet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
              {reports.slice(0, 60).map((r) => (
                <tr key={r.reportId}>
                  <td className="py-1.5 pr-2">{r.reportDate}</td>
                  <td className="py-1.5 px-2 font-sans">{r.stationName}</td>
                  <td className="py-1.5 px-2 text-right">{r.pmsTotalLitres ?? '—'}</td>
                  <td className="py-1.5 px-2 text-right">{r.agoTotalLitres ?? '—'}</td>
                  <td className="py-1.5 px-2 text-right">{formatGmd(r.totalFuelSalesGmd)}</td>
                  <td className="py-1.5 px-2 text-right">{formatGmd(r.bankedGmd)}</td>
                  <td className="py-1.5 pl-2 text-slate-500">{r.worksheetName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
