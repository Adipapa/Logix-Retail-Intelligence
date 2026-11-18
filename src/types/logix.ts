export type RouteId =
  | 'dashboard'
  | 'stations'
  | 'station-detail'
  | 'fuel-sales'
  | 'pump-performance'
  | 'stock-control'
  | 'deliveries'
  | 'reconciliation'
  | 'historical'
  | 'reports'
  | 'data-monitor';

export type CompletenessStatus = 'imported' | 'warning' | 'incomplete' | 'failed';
export type FuelFilter = 'ALL' | 'PMS' | 'AGO';
export type ShiftFilter = 'ALL' | 'Morning' | 'Afternoon' | 'Night';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'management' | 'admin';
  createdAt: string;
}

export interface Station {
  ownerUid: string;
  stationId: string;
  canonicalName: string;
  territory: string;
  folderPath: string;
  aliases: string[];
  activeStatus: 'active' | 'inactive';
  pumpCount: number;
  tankCapacityPms: number;
  tankCapacityAgo: number;
  createdAt: string;
  updatedAt: string;
}

export interface SourceWorkbook {
  ownerUid: string;
  workbookId: string;
  stationId: string;
  stationName: string;
  year: number;
  month: number;
  dropboxFileId: string;
  path: string;
  revision: string;
  fileName: string;
  sizeBytes: number;
  sheetCount: number;
  dailySheetsFound: number;
  hasSummarySheet: boolean;
  templateVersion: string;
  calculationVersion: string;
  status: CompletenessStatus;
  modifiedAt: string;
  importedAt: string;
}

export interface PumpReading {
  pumpId: string;
  island: string;
  product: 'PMS' | 'AGO';
  shift: 'Morning' | 'Afternoon' | 'Night';
  openingMeter: number | null;
  closingMeter: number | null;
  throughput: number | null;
  flag: 'normal' | 'warning' | 'negative_movement' | 'missing_meter';
}

export interface DailyReport {
  ownerUid: string;
  reportId: string;
  stationId: string;
  stationName: string;
  territory: string;
  workbookId: string;
  workbookPath: string;
  workbookRevision: string;
  worksheetName: string;
  reportDate: string; // YYYY-MM-DD
  year: number;
  month: number;
  weekNumber: number;
  weekday: string;
  completeness: CompletenessStatus;
  // PMS Sales
  pmsMorningLitres: number | null;
  pmsAfternoonLitres: number | null;
  pmsNightLitres: number | null;
  pmsTotalLitres: number | null;
  pmsSalesGmd: number | null;
  pmsReturnToTankLitres: number | null;
  pmsCashFuelGmd: number | null;
  // AGO Sales
  agoMorningLitres: number | null;
  agoAfternoonLitres: number | null;
  agoNightLitres: number | null;
  agoTotalLitres: number | null;
  agoSalesGmd: number | null;
  agoReturnToTankLitres: number | null;
  agoCashFuelGmd: number | null;
  totalFuelSalesGmd: number | null;
  // Stock Balances
  pmsOpeningStock: number | null;
  pmsReceipts: number | null;
  pmsTheoreticalStock: number | null;
  pmsClosingStock: number | null;
  pmsStockDiff: number | null;
  pmsStockControlRatio: number | null;
  agoOpeningStock: number | null;
  agoReceipts: number | null;
  agoTheoreticalStock: number | null;
  agoClosingStock: number | null;
  agoStockDiff: number | null;
  agoStockControlRatio: number | null;
  // Deliveries & Transfers
  directDeliveryLitres: number | null;
  diversionLitres: number | null;
  diversionDirection: string | null;
  shortageLitres: number | null;
  receivedLitres: number | null;
  deliveryOrigin: string | null;
  deliveryDestination: string | null;
  // Financial Reconciliation
  creditSalesGmd: number | null;
  couponsGmd: number | null;
  qmoneyGmd: number | null;
  waychitGmd: number | null;
  chequesGmd: number | null;
  cashGmd: number | null;
  bankedGmd: number | null;
  reconciliationDiffGmd: number | null;
  // Utilities & Notes
  generatorRuntimeHrs: number | null;
  generatorRefuelLitres: number | null;
  cashpowerKwh: number | null;
  cashpowerPurchaseGmd: number | null;
  noteText: string;
  sourceRowRef: string;
  pumpReadings: PumpReading[];
  createdAt: string;
  updatedAt: string;
}

export interface SummaryReconciliation {
  ownerUid: string;
  reconciliationId: string;
  workbookId: string;
  stationId: string;
  stationName: string;
  year: number;
  month: number;
  reportDate: string;
  fieldName: string;
  product: 'PMS' | 'AGO' | 'GROUP';
  dailyDerivedValue: number | null;
  summaryValue: number | null;
  variance: number | null;
  tolerance: number;
  result: 'matched' | 'within_tolerance' | 'variance_exceeded' | 'missing_summary';
  createdAt: string;
}

export interface ImportJob {
  ownerUid: string;
  jobId: string;
  workbookId: string;
  fileName: string;
  stationName: string;
  year: number;
  month: number;
  status: 'completed' | 'completed_with_warnings' | 'failed';
  recordsExtracted: number;
  warningsCount: number;
  errorsCount: number;
  errorSummary: string;
  retryCount: number;
  startedAt: string;
  completedAt: string;
}

export interface ImportWarning {
  ownerUid: string;
  warningId: string;
  jobId: string;
  workbookId: string;
  stationId: string;
  stationName: string;
  reportDate: string;
  worksheet: string;
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sourceReference: string;
  createdAt: string;
}

export interface SyncRun {
  ownerUid: string;
  syncId: string;
  triggerType: 'scheduled_15m' | 'manual_admin' | 'workbook_upload';
  cursorBefore: string;
  cursorAfter: string;
  filesSeen: number;
  filesQueued: number;
  filesSkipped: number;
  status: 'completed' | 'partial' | 'failed';
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

export interface SavedReport {
  ownerUid: string;
  savedReportId: string;
  title: string;
  stationId: string;
  year: string;
  month: string;
  fuelType: FuelFilter;
  shift: ShiftFilter;
  statusFilter: string;
  createdByEmail: string;
  createdAt: string;
}

export interface AuditLog {
  ownerUid: string;
  auditId: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export interface GlobalFilters {
  stationId: string; // 'ALL' or stationId
  year: string;      // 'ALL' or '2025'
  month: string;     // 'ALL' or '1'..'12'
  fuelType: FuelFilter;
  shift: ShiftFilter;
  status: 'ALL' | CompletenessStatus;
  search: string;
}
