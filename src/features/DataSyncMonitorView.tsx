import { useRef, useState } from 'react';
import { Download, RefreshCw, Upload } from 'lucide-react';
import { StatusLabel } from '../components/StatusLabel';
import { formatDateTime, formatMonthName, formatNumber } from '../lib/formatters';
import { downloadSampleKotuWorkbook } from '../services/workbookEngine';
import type {
  AuditLog,
  ImportJob,
  ImportWarning,
  SourceWorkbook,
  SyncRun,
} from '../types/logix';

interface DataSyncMonitorViewProps {
  workbooks: SourceWorkbook[];
  importJobs: ImportJob[];
  importWarnings: ImportWarning[];
  syncRuns: SyncRun[];
  auditLogs: AuditLog[];
  syncStatus?: {
    configured: boolean;
    rootPath: string;
    lastSyncAt: string | null;
    lastStatus: string;
    lastError: string | null;
    trackedWorkbooks: number;
  };
  onTriggerManualSync: () => Promise<void>;
  onUploadWorkbook: (file: File) => Promise<void>;
}

export function DataSyncMonitorView({
  workbooks,
  importJobs,
  importWarnings,
  syncRuns,
  auditLogs,
  syncStatus,
  onTriggerManualSync,
  onUploadWorkbook,
}: DataSyncMonitorViewProps) {
  const [activeTab, setActiveTab] = useState<'workbooks' | 'jobs' | 'warnings' | 'syncs' | 'audit'>('workbooks');
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const latestSync = syncRuns[0];

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await onTriggerManualSync();
    } finally {
      setSyncing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadStatus(null);
    try {
      await onUploadWorkbook(file);
      setUploadStatus(`Ingested "${file.name}" and reconciled daily sheets against SUMMARY.`);
    } catch (err) {
      setUploadStatus(
        err instanceof Error ? `Import error: ${err.message}` : 'Failed to parse workbook.'
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Sync Schedule & Workbook Ingestion Controls */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Dropbox 15-Minute Synchronisation Engine
              </h2>
              {syncStatus ? <StatusLabel status={syncStatus.lastStatus === 'completed' ? 'imported' : syncStatus.lastStatus === 'failed' ? 'failed' : 'incomplete'} /> : latestSync && <StatusLabel status={latestSync.status} />}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Root path: <span className="font-mono">{syncStatus?.rootPath ?? '/Logix Retail'}</span> · Dropbox inventory and import status from production PostgreSQL
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs border-t border-slate-200 pt-4">
              <div>
                <dt className="text-slate-500">Latest Sync Completed</dt>
                <dd className="font-mono tabular-nums text-slate-900 mt-0.5">
                  {syncStatus?.lastSyncAt ? formatDateTime(syncStatus.lastSyncAt) : latestSync ? formatDateTime(latestSync.completedAt) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Active Dropbox Cursor</dt>
                <dd className="font-mono text-slate-900 mt-0.5">
                  {syncStatus ? syncStatus.lastStatus : latestSync?.cursorAfter ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Indexed Workbooks</dt>
                <dd className="font-mono tabular-nums text-slate-900 mt-0.5">{workbooks.length}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Open Warnings / Errors</dt>
                <dd className="font-mono tabular-nums text-amber-700 mt-0.5">
                  {importWarnings.filter((w) => w.severity !== 'info').length}
                </dd>
              </div>
            </dl>
            {syncStatus?.lastError && <p className="mt-3 text-xs text-red-700">Last sync error: {syncStatus.lastError}</p>}
          </div>
          <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">Source files in Dropbox remain read-only.</span>
            <button
              type="button"
              disabled={syncing}
              onClick={handleManualSync}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-md hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{syncing ? 'Scanning Dropbox...' : 'Run Manual Sync'}</span>
            </button>
          </div>
        </div>

        {/* Real .xlsm / .xlsx Workbook Upload & Sample Template */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-md p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Workbook Inspector & Manual Ingestion (.xlsm / .xlsx)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Upload any station Excel workbook to test sheet discovery, blank-vs-zero preservation, and daily-to-SUMMARY reconciliation in browser without executing VBA macros.
            </p>
            {uploadStatus && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800">
                {uploadStatus}
              </div>
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xlsm"
              onChange={handleFileChange}
              className="hidden"
              id="workbook-upload-input"
            />
            <label
              htmlFor="workbook-upload-input"
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap ${
                uploading ? 'opacity-60 pointer-events-none' : ''
              }`}
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{uploading ? 'Parsing Workbook...' : 'Upload .xlsm / .xlsx Workbook'}</span>
            </label>

            <button
              type="button"
              onClick={downloadSampleKotuWorkbook}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Download Sample Kotu Jan 2025 (.xlsx)</span>
            </button>
          </div>
        </div>
      </section>

      {/* Monitor Tabs */}
      <section className="bg-white border border-slate-200 rounded-md p-5">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-md w-fit mb-4">
          {(
            [
              { id: 'workbooks', label: `Workbooks (${workbooks.length})` },
              { id: 'warnings', label: `Warnings (${importWarnings.length})` },
              { id: 'jobs', label: `Import Jobs (${importJobs.length})` },
              { id: 'syncs', label: `Sync Runs (${syncRuns.length})` },
              { id: 'audit', label: `Audit Log (${auditLogs.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'workbooks' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Workbook File</th>
                  <th className="text-left py-2 px-3 font-medium">Station</th>
                  <th className="text-left py-2 px-3 font-medium">Period</th>
                  <th className="text-left py-2 px-3 font-medium">Dropbox Revision</th>
                  <th className="text-right py-2 px-3 font-medium">Daily Sheets</th>
                  <th className="text-left py-2 px-3 font-medium">Template</th>
                  <th className="text-left py-2 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                {workbooks.map((wb) => (
                  <tr key={wb.workbookId} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-sans font-medium text-slate-900">{wb.fileName}</td>
                    <td className="py-2 px-3 font-sans text-slate-700">{wb.stationName}</td>
                    <td className="py-2 px-3 font-sans text-slate-600">
                      {formatMonthName(wb.month)} {wb.year}
                    </td>
                    <td className="py-2 px-3 text-slate-600">{wb.revision}</td>
                    <td className="py-2 px-3 text-right">{wb.dailySheetsFound}</td>
                    <td className="py-2 px-3 text-slate-500">{wb.templateVersion}</td>
                    <td className="py-2 pl-3 font-sans">
                      <StatusLabel status={wb.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'warnings' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Severity</th>
                  <th className="text-left py-2 px-3 font-medium">Station</th>
                  <th className="text-left py-2 px-3 font-medium">Worksheet</th>
                  <th className="text-left py-2 px-3 font-medium">Field</th>
                  <th className="text-left py-2 px-3 font-medium">Message</th>
                  <th className="text-left py-2 pl-3 font-medium">Source Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {importWarnings.map((w) => (
                  <tr key={w.warningId} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3">
                      <StatusLabel status={w.severity} />
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{w.stationName}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{w.worksheet}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{w.field}</td>
                    <td className="py-2.5 px-3 text-slate-700">{w.message}</td>
                    <td className="py-2.5 pl-3 font-mono text-slate-500">{w.sourceReference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">File</th>
                  <th className="text-left py-2 px-3 font-medium">Station</th>
                  <th className="text-right py-2 px-3 font-medium">Records</th>
                  <th className="text-right py-2 px-3 font-medium">Warnings</th>
                  <th className="text-right py-2 px-3 font-medium">Errors</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-left py-2 pl-3 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                {importJobs.map((j) => (
                  <tr key={j.jobId} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-sans font-medium text-slate-900">{j.fileName}</td>
                    <td className="py-2 px-3 font-sans text-slate-700">{j.stationName}</td>
                    <td className="py-2 px-3 text-right">{j.recordsExtracted}</td>
                    <td className="py-2 px-3 text-right">{j.warningsCount}</td>
                    <td className="py-2 px-3 text-right">{j.errorsCount}</td>
                    <td className="py-2 px-3 font-sans">
                      <StatusLabel status={j.status} />
                    </td>
                    <td className="py-2 pl-3 font-sans text-slate-600">{j.errorSummary || 'Clean import'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'syncs' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Started</th>
                  <th className="text-left py-2 px-3 font-medium">Trigger</th>
                  <th className="text-left py-2 px-3 font-medium">Cursor Before</th>
                  <th className="text-left py-2 px-3 font-medium">Cursor After</th>
                  <th className="text-right py-2 px-3 font-medium">Seen</th>
                  <th className="text-right py-2 px-3 font-medium">Queued</th>
                  <th className="text-right py-2 px-3 font-medium">Duration</th>
                  <th className="text-left py-2 pl-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                {syncRuns.map((sr) => (
                  <tr key={sr.syncId} className="hover:bg-slate-50">
                    <td className="py-2 pr-3">{formatDateTime(sr.startedAt)}</td>
                    <td className="py-2 px-3 font-sans">{sr.triggerType}</td>
                    <td className="py-2 px-3 text-slate-500">{sr.cursorBefore}</td>
                    <td className="py-2 px-3 text-slate-800">{sr.cursorAfter}</td>
                    <td className="py-2 px-3 text-right">{formatNumber(sr.filesSeen)}</td>
                    <td className="py-2 px-3 text-right">{formatNumber(sr.filesQueued)}</td>
                    <td className="py-2 px-3 text-right">{sr.durationMs} ms</td>
                    <td className="py-2 pl-3 font-sans">
                      <StatusLabel status={sr.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="text-left py-2 pr-3 font-medium">Timestamp</th>
                  <th className="text-left py-2 px-3 font-medium">Actor</th>
                  <th className="text-left py-2 px-3 font-medium">Action</th>
                  <th className="text-left py-2 pl-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {auditLogs.map((al) => (
                  <tr key={al.auditId} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {formatDateTime(al.timestamp)}
                    </td>
                    <td className="py-2 px-3 text-slate-800">{al.actorEmail}</td>
                    <td className="py-2 px-3 font-mono text-slate-900">{al.action}</td>
                    <td className="py-2 pl-3 text-slate-600">{al.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
