import * as XLSX from 'xlsx';
import type {
  DailyReport,
  ImportJob,
  ImportWarning,
  PumpReading,
  SourceWorkbook,
  Station,
  SummaryReconciliation,
} from '../types/logix';
import { formatMonthName, formatShortMonth, sanitizeId } from '../lib/formatters';

const MONTH_MAP: Record<string, number> = {
  JAN: 1,
  JANUARY: 1,
  FEB: 2,
  FEBRUARY: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12,
};

function toNumberOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw).replace(/,/g, '').replace(/GMD/gi, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned.toUpperCase() === 'N/A') return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function getIsoWeek(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return 1;
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeekdayName(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return 'Mon';
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function resolveStationFromFilename(fileName: string, stations: Station[]): Station {
  const upper = fileName.toUpperCase();
  for (const st of stations) {
    if (upper.includes(st.canonicalName.toUpperCase())) return st;
    for (const alias of st.aliases) {
      if (upper.includes(alias.toUpperCase())) return st;
    }
  }
  return (
    stations[0] ?? {
      ownerUid: '',
      stationId: 'kotu',
      canonicalName: 'Kotu',
      territory: 'Greater Banjul',
      folderPath: '/Logix Retail/Kotu',
      aliases: ['Kotu'],
      activeStatus: 'active',
      pumpCount: 6,
      tankCapacityPms: 45000,
      tankCapacityAgo: 45000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  );
}

function resolvePeriodFromFilename(fileName: string): { year: number; month: number } {
  const upper = fileName.toUpperCase();
  const yearMatch = upper.match(/\b(202[0-9])\b/);
  const year = yearMatch ? Number(yearMatch[1]) : 2025;
  let month = 1;
  for (const [token, m] of Object.entries(MONTH_MAP)) {
    if (new RegExp(`\\b${token}\\b`).test(upper)) {
      month = m;
      break;
    }
  }
  return { year, month };
}

function parseDailySheetName(name: string, fallbackYear: number, fallbackMonth: number): string | null {
  const m = name.trim().toUpperCase().match(/^(\d{1,2})\s+([A-Z]{3,9})\s+(\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = MONTH_MAP[m[2]] ?? fallbackMonth;
  const yearRaw = Number(m[3]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw || fallbackYear;
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface ParsedWorkbookBundle {
  workbook: SourceWorkbook;
  dailyReports: DailyReport[];
  reconciliations: SummaryReconciliation[];
  importJob: ImportJob;
  warnings: ImportWarning[];
  skippedSheets: string[];
}

export async function parseExcelWorkbook(
  file: File,
  ownerUid: string,
  stations: Station[]
): Promise<ParsedWorkbookBundle> {
  const now = new Date().toISOString();
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellFormula: true, cellNF: true });

  const station = resolveStationFromFilename(file.name, stations);
  const { year, month } = resolvePeriodFromFilename(file.name);
  const workbookId = sanitizeId(`wb_${station.stationId}_${year}_${month}_${Date.now()}`);
  const jobId = sanitizeId(`job_${workbookId}`);
  const revision = `rev_upload_${Date.now().toString(36)}`;
  const path = `${station.folderPath}/${year}/${formatMonthName(month).toUpperCase()}/${file.name}`;

  const sheetNames = wb.SheetNames || [];
  const hasSummarySheet = sheetNames.some((s) => s.trim().toUpperCase() === 'SUMMARY');
  const skippedSheets: string[] = [];
  const warnings: ImportWarning[] = [];
  const dailyReports: DailyReport[] = [];

  // Parse SUMMARY rows if present for reconciliation comparison
  const summaryRowsByDate = new Map<string, Record<string, number | null>>();
  let summaryPmsSum = 0;
  let summaryAgoSum = 0;
  let summarySalesSum = 0;
  let summaryBankedSum = 0;

  if (hasSummarySheet) {
    const summarySheetName = sheetNames.find((s) => s.trim().toUpperCase() === 'SUMMARY')!;
    const summarySheet = wb.Sheets[summarySheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(summarySheet, { defval: null });
    rows.forEach((row) => {
      const dateRaw = row['Date'] ?? row['DATE'] ?? row['date'];
      const pmsTotal = toNumberOrNull(row['PMS Total'] ?? row['PMS TOTAL'] ?? row['PMS_TOTAL']);
      const agoTotal = toNumberOrNull(row['AGO Total'] ?? row['AGO TOTAL'] ?? row['AGO_TOTAL']);
      const fuelSales = toNumberOrNull(row['Fuel Sales'] ?? row['FUEL SALES'] ?? row['Total Fuel Sales']);
      const banked = toNumberOrNull(row['Banked'] ?? row['BANKED']);
      if (typeof pmsTotal === 'number') summaryPmsSum += pmsTotal;
      if (typeof agoTotal === 'number') summaryAgoSum += agoTotal;
      if (typeof fuelSales === 'number') summarySalesSum += fuelSales;
      if (typeof banked === 'number') summaryBankedSum += banked;
      if (dateRaw) {
        summaryRowsByDate.set(String(dateRaw), { pmsTotal, agoTotal, fuelSales, banked });
      }
    });
  } else {
    warnings.push({
      ownerUid,
      warningId: sanitizeId(`warn_${jobId}_nosummary`),
      jobId,
      workbookId,
      stationId: station.stationId,
      stationName: station.canonicalName,
      reportDate: `${year}-${String(month).padStart(2, '0')}-01`,
      worksheet: 'Workbook',
      field: 'SUMMARY',
      severity: 'warning',
      message: 'SUMMARY sheet not found; daily records extracted without SUMMARY cross-check.',
      sourceReference: file.name,
      createdAt: now,
    });
  }

  let dailySheetsFound = 0;

  sheetNames.forEach((wsName) => {
    const upperWs = wsName.trim().toUpperCase();
    if (upperWs === 'SUMMARY') return;

    const parsedDate = parseDailySheetName(wsName, year, month);
    const sheet = wb.Sheets[wsName];
    const matrix = XLSX.utils.sheet_to_json<Array<unknown>>(sheet, { header: 1, defval: null });

    if (!parsedDate || matrix.length < 2) {
      skippedSheets.push(wsName);
      warnings.push({
        ownerUid,
        warningId: sanitizeId(`warn_${jobId}_skip_${wsName}`),
        jobId,
        workbookId,
        stationId: station.stationId,
        stationName: station.canonicalName,
        reportDate: '',
        worksheet: wsName,
        field: 'worksheet',
        severity: 'info',
        message: `Non-reporting or unpopulated worksheet "${wsName}" skipped during ingestion.`,
        sourceReference: `${file.name} [${wsName}]`,
        createdAt: now,
      });
      return;
    }

    dailySheetsFound += 1;

    // Extract key labelled fields from standard daily worksheet grid (label in col A/B, value in col C/D or structured table)
    const kv = new Map<string, unknown>();
    matrix.forEach((row) => {
      for (let c = 0; c < row.length - 1; c++) {
        const keyCell = row[c];
        if (typeof keyCell === 'string' && keyCell.trim().length > 1) {
          kv.set(keyCell.trim().toLowerCase(), row[c + 1]);
        }
      }
    });

    const pmsM = toNumberOrNull(kv.get('pms morning (l)')) ?? toNumberOrNull(kv.get('pms morning'));
    const pmsA = toNumberOrNull(kv.get('pms afternoon (l)')) ?? toNumberOrNull(kv.get('pms afternoon'));
    const pmsN = toNumberOrNull(kv.get('pms night (l)')) ?? toNumberOrNull(kv.get('pms night'));
    const pmsTotal =
      toNumberOrNull(kv.get('pms total (l)')) ??
      (pmsM !== null || pmsA !== null || pmsN !== null ? (pmsM ?? 0) + (pmsA ?? 0) + (pmsN ?? 0) : null);

    const agoM = toNumberOrNull(kv.get('ago morning (l)')) ?? toNumberOrNull(kv.get('ago morning'));
    const agoA = toNumberOrNull(kv.get('ago afternoon (l)')) ?? toNumberOrNull(kv.get('ago afternoon'));
    const agoN = toNumberOrNull(kv.get('ago night (l)')) ?? toNumberOrNull(kv.get('ago night'));
    const agoTotal =
      toNumberOrNull(kv.get('ago total (l)')) ??
      (agoM !== null || agoA !== null || agoN !== null ? (agoM ?? 0) + (agoA ?? 0) + (agoN ?? 0) : null);

    const pmsSales = toNumberOrNull(kv.get('pms sales (gmd)')) ?? (pmsTotal !== null ? Math.round(pmsTotal * 74.5) : null);
    const agoSales = toNumberOrNull(kv.get('ago sales (gmd)')) ?? (agoTotal !== null ? Math.round(agoTotal * 76.0) : null);
    const totalFuelSales =
      toNumberOrNull(kv.get('total fuel sales (gmd)')) ??
      (pmsSales !== null || agoSales !== null ? (pmsSales ?? 0) + (agoSales ?? 0) : null);

    const pmsOpen = toNumberOrNull(kv.get('pms opening stock (l)'));
    const pmsReceipts = toNumberOrNull(kv.get('pms receipts (l)'));
    const pmsReturn = toNumberOrNull(kv.get('pms return to tank (l)'));
    const pmsTheoretical =
      pmsOpen !== null && pmsTotal !== null
        ? pmsOpen + (pmsReceipts ?? 0) - pmsTotal + (pmsReturn ?? 0)
        : toNumberOrNull(kv.get('pms theoretical stock (l)'));
    const pmsClosing = toNumberOrNull(kv.get('pms closing stock (l)'));
    const pmsDiff =
      pmsClosing !== null && pmsTheoretical !== null ? Number((pmsClosing - pmsTheoretical).toFixed(2)) : null;

    const agoOpen = toNumberOrNull(kv.get('ago opening stock (l)'));
    const agoReceipts = toNumberOrNull(kv.get('ago receipts (l)'));
    const agoReturn = toNumberOrNull(kv.get('ago return to tank (l)'));
    const agoTheoretical =
      agoOpen !== null && agoTotal !== null
        ? agoOpen + (agoReceipts ?? 0) - agoTotal + (agoReturn ?? 0)
        : toNumberOrNull(kv.get('ago theoretical stock (l)'));
    const agoClosing = toNumberOrNull(kv.get('ago closing stock (l)'));
    const agoDiff =
      agoClosing !== null && agoTheoretical !== null ? Number((agoClosing - agoTheoretical).toFixed(2)) : null;

    const creditSales = toNumberOrNull(kv.get('credit sales (gmd)'));
    const coupons = toNumberOrNull(kv.get('coupons (gmd)'));
    const qmoney = toNumberOrNull(kv.get('qmoney (gmd)'));
    const waychit = toNumberOrNull(kv.get('waychit (gmd)'));
    const cheques = toNumberOrNull(kv.get('cheques (gmd)'));
    const cash = toNumberOrNull(kv.get('cash (gmd)'));
    const banked = toNumberOrNull(kv.get('banked (gmd)'));
    const reconDiff =
      banked !== null && cash !== null
        ? Number((banked - cash).toFixed(2))
        : toNumberOrNull(kv.get('difference (gmd)'));

    const p1Open = toNumberOrNull(kv.get('pump 1a opening'));
    const p1Close = toNumberOrNull(kv.get('pump 1a closing'));
    const a1Open = toNumberOrNull(kv.get('pump 2a opening'));
    const a1Close = toNumberOrNull(kv.get('pump 2a closing'));

    const pumpReadings: PumpReading[] = [];
    if (p1Open !== null || p1Close !== null) {
      const tp = p1Open !== null && p1Close !== null ? p1Close - p1Open : null;
      pumpReadings.push({
        pumpId: 'Pump 1A',
        island: 'Island 1',
        product: 'PMS',
        shift: 'Morning',
        openingMeter: p1Open,
        closingMeter: p1Close,
        throughput: tp,
        flag: tp !== null && tp < 0 ? 'negative_movement' : tp === null ? 'missing_meter' : 'normal',
      });
    }
    if (a1Open !== null || a1Close !== null) {
      const tp = a1Open !== null && a1Close !== null ? a1Close - a1Open : null;
      pumpReadings.push({
        pumpId: 'Pump 2A',
        island: 'Island 2',
        product: 'AGO',
        shift: 'Morning',
        openingMeter: a1Open,
        closingMeter: a1Close,
        throughput: tp,
        flag: tp !== null && tp < 0 ? 'negative_movement' : tp === null ? 'missing_meter' : 'normal',
      });
    }

    const reportId = sanitizeId(`rep_${station.stationId}_${parsedDate.replace(/-/g, '')}`);
    const hasMissingCore = pmsTotal === null || agoTotal === null;

    if (hasMissingCore) {
      warnings.push({
        ownerUid,
        warningId: sanitizeId(`warn_${jobId}_${parsedDate}`),
        jobId,
        workbookId,
        stationId: station.stationId,
        stationName: station.canonicalName,
        reportDate: parsedDate,
        worksheet: wsName,
        field: 'pmsTotalLitres / agoTotalLitres',
        severity: 'warning',
        message: 'One or more product volume fields are blank; stored as missing (—) rather than zero.',
        sourceReference: `${file.name} [${wsName}]`,
        createdAt: now,
      });
    }

    dailyReports.push({
      ownerUid,
      reportId,
      stationId: station.stationId,
      stationName: station.canonicalName,
      territory: station.territory,
      workbookId,
      workbookPath: path,
      workbookRevision: revision,
      worksheetName: wsName,
      reportDate: parsedDate,
      year,
      month,
      weekNumber: getIsoWeek(parsedDate),
      weekday: getWeekdayName(parsedDate),
      completeness: hasMissingCore ? 'incomplete' : 'imported',
      pmsMorningLitres: pmsM,
      pmsAfternoonLitres: pmsA,
      pmsNightLitres: pmsN,
      pmsTotalLitres: pmsTotal,
      pmsSalesGmd: pmsSales,
      pmsReturnToTankLitres: pmsReturn,
      pmsCashFuelGmd: toNumberOrNull(kv.get('pms cash-fuel (gmd)')),
      agoMorningLitres: agoM,
      agoAfternoonLitres: agoA,
      agoNightLitres: agoN,
      agoTotalLitres: agoTotal,
      agoSalesGmd: agoSales,
      agoReturnToTankLitres: agoReturn,
      agoCashFuelGmd: toNumberOrNull(kv.get('ago cash-fuel (gmd)')),
      totalFuelSalesGmd: totalFuelSales,
      pmsOpeningStock: pmsOpen,
      pmsReceipts,
      pmsTheoreticalStock: pmsTheoretical,
      pmsClosingStock: pmsClosing,
      pmsStockDiff: pmsDiff,
      pmsStockControlRatio:
        pmsDiff !== null && pmsTotal ? Number(((pmsDiff / pmsTotal) * 100).toFixed(2)) : null,
      agoOpeningStock: agoOpen,
      agoReceipts,
      agoTheoreticalStock: agoTheoretical,
      agoClosingStock: agoClosing,
      agoStockDiff: agoDiff,
      agoStockControlRatio:
        agoDiff !== null && agoTotal ? Number(((agoDiff / agoTotal) * 100).toFixed(2)) : null,
      directDeliveryLitres: toNumberOrNull(kv.get('direct delivery (l)')),
      diversionLitres: toNumberOrNull(kv.get('diversion (l)')),
      diversionDirection: kv.get('diversion direction') ? String(kv.get('diversion direction')) : null,
      shortageLitres: toNumberOrNull(kv.get('shortage (l)')),
      receivedLitres: toNumberOrNull(kv.get('received (l)')),
      deliveryOrigin: kv.get('delivery origin') ? String(kv.get('delivery origin')) : null,
      deliveryDestination: kv.get('delivery destination') ? String(kv.get('delivery destination')) : null,
      creditSalesGmd: creditSales,
      couponsGmd: coupons,
      qmoneyGmd: qmoney,
      waychitGmd: waychit,
      chequesGmd: cheques,
      cashGmd: cash,
      bankedGmd: banked,
      reconciliationDiffGmd: reconDiff,
      generatorRuntimeHrs: toNumberOrNull(kv.get('generator runtime (hrs)')),
      generatorRefuelLitres: toNumberOrNull(kv.get('generator refuel (l)')),
      cashpowerKwh: toNumberOrNull(kv.get('cashpower (kwh)')),
      cashpowerPurchaseGmd: toNumberOrNull(kv.get('cashpower purchase (gmd)')),
      noteText: kv.get('notes') ? String(kv.get('notes')).slice(0, 580) : '',
      sourceRowRef: `${wsName}!A1:S44`,
      pumpReadings,
      createdAt: now,
      updatedAt: now,
    });
  });

  const dailyPmsSum = dailyReports.reduce((acc, r) => acc + (r.pmsTotalLitres ?? 0), 0);
  const dailyAgoSum = dailyReports.reduce((acc, r) => acc + (r.agoTotalLitres ?? 0), 0);
  const dailySalesSum = dailyReports.reduce((acc, r) => acc + (r.totalFuelSalesGmd ?? 0), 0);
  const dailyBankedSum = dailyReports.reduce((acc, r) => acc + (r.bankedGmd ?? 0), 0);

  const reconciliations: SummaryReconciliation[] = [
    {
      ownerUid,
      reconciliationId: sanitizeId(`rec_${workbookId}_pms`),
      workbookId,
      stationId: station.stationId,
      stationName: station.canonicalName,
      year,
      month,
      reportDate: `${year}-${String(month).padStart(2, '0')}`,
      fieldName: 'PMS Total Volume (L)',
      product: 'PMS',
      dailyDerivedValue: dailyPmsSum,
      summaryValue: hasSummarySheet ? summaryPmsSum : null,
      variance: hasSummarySheet ? summaryPmsSum - dailyPmsSum : null,
      tolerance: 100,
      result: !hasSummarySheet
        ? 'missing_summary'
        : summaryPmsSum === dailyPmsSum
        ? 'matched'
        : Math.abs(summaryPmsSum - dailyPmsSum) <= 100
        ? 'within_tolerance'
        : 'variance_exceeded',
      createdAt: now,
    },
    {
      ownerUid,
      reconciliationId: sanitizeId(`rec_${workbookId}_ago`),
      workbookId,
      stationId: station.stationId,
      stationName: station.canonicalName,
      year,
      month,
      reportDate: `${year}-${String(month).padStart(2, '0')}`,
      fieldName: 'AGO Total Volume (L)',
      product: 'AGO',
      dailyDerivedValue: dailyAgoSum,
      summaryValue: hasSummarySheet ? summaryAgoSum : null,
      variance: hasSummarySheet ? summaryAgoSum - dailyAgoSum : null,
      tolerance: 100,
      result: !hasSummarySheet
        ? 'missing_summary'
        : summaryAgoSum === dailyAgoSum
        ? 'matched'
        : Math.abs(summaryAgoSum - dailyAgoSum) <= 100
        ? 'within_tolerance'
        : 'variance_exceeded',
      createdAt: now,
    },
    {
      ownerUid,
      reconciliationId: sanitizeId(`rec_${workbookId}_sales`),
      workbookId,
      stationId: station.stationId,
      stationName: station.canonicalName,
      year,
      month,
      reportDate: `${year}-${String(month).padStart(2, '0')}`,
      fieldName: 'Total Fuel Sales (GMD)',
      product: 'GROUP',
      dailyDerivedValue: dailySalesSum,
      summaryValue: hasSummarySheet ? summarySalesSum : null,
      variance: hasSummarySheet ? summarySalesSum - dailySalesSum : null,
      tolerance: 2000,
      result: !hasSummarySheet
        ? 'missing_summary'
        : summarySalesSum === dailySalesSum
        ? 'matched'
        : Math.abs(summarySalesSum - dailySalesSum) <= 2000
        ? 'within_tolerance'
        : 'variance_exceeded',
      createdAt: now,
    },
    {
      ownerUid,
      reconciliationId: sanitizeId(`rec_${workbookId}_banked`),
      workbookId,
      stationId: station.stationId,
      stationName: station.canonicalName,
      year,
      month,
      reportDate: `${year}-${String(month).padStart(2, '0')}`,
      fieldName: 'Banked Deposits (GMD)',
      product: 'GROUP',
      dailyDerivedValue: dailyBankedSum,
      summaryValue: hasSummarySheet ? summaryBankedSum : null,
      variance: hasSummarySheet ? summaryBankedSum - dailyBankedSum : null,
      tolerance: 1000,
      result: !hasSummarySheet
        ? 'missing_summary'
        : summaryBankedSum === dailyBankedSum
        ? 'matched'
        : Math.abs(summaryBankedSum - dailyBankedSum) <= 1000
        ? 'within_tolerance'
        : 'variance_exceeded',
      createdAt: now,
    },
  ];

  const warningsCount = warnings.filter((w) => w.severity === 'warning').length;
  const errorsCount = warnings.filter((w) => w.severity === 'error').length;

  const workbook: SourceWorkbook = {
    ownerUid,
    workbookId,
    stationId: station.stationId,
    stationName: station.canonicalName,
    year,
    month,
    dropboxFileId: `id:upload_${Date.now().toString(36)}`,
    path,
    revision,
    fileName: file.name,
    sizeBytes: file.size,
    sheetCount: sheetNames.length,
    dailySheetsFound,
    hasSummarySheet,
    templateVersion: 'v2.1-standard',
    calculationVersion: 'calc-2026.1',
    status: errorsCount > 0 ? 'failed' : warningsCount > 0 ? 'warning' : 'imported',
    modifiedAt: new Date(file.lastModified || Date.now()).toISOString(),
    importedAt: now,
  };

  const importJob: ImportJob = {
    ownerUid,
    jobId,
    workbookId,
    fileName: file.name,
    stationName: station.canonicalName,
    year,
    month,
    status: errorsCount > 0 ? 'failed' : warnings.length > 0 ? 'completed_with_warnings' : 'completed',
    recordsExtracted: dailyReports.length,
    warningsCount: warnings.length,
    errorsCount,
    errorSummary:
      warnings.length > 0
        ? `${warnings.length} validation notice(s); ${skippedSheets.length} non-reporting sheet(s) skipped.`
        : '',
    retryCount: 0,
    startedAt: now,
    completedAt: now,
  };

  return {
    workbook,
    dailyReports,
    reconciliations,
    importJob,
    warnings,
    skippedSheets,
  };
}

export function downloadSampleKotuWorkbook() {
  const wb = XLSX.utils.book_new();
  const summaryRows: Array<Record<string, unknown>> = [];

  for (let day = 1; day <= 31; day++) {
    const pmsM = 2100 + day * 15;
    const pmsA = 2400 + day * 12;
    const pmsN = 980 + day * 6;
    const pmsTotal = pmsM + pmsA + pmsN;
    const agoM = 1800 + day * 10;
    const agoA = 2050 + day * 11;
    const agoN = 1120 + day * 7;
    const agoTotal = agoM + agoA + agoN;
    const pmsSales = Math.round(pmsTotal * 74.5);
    const agoSales = Math.round(agoTotal * 76.0);
    const fuelSales = pmsSales + agoSales;
    const credit = Math.round(fuelSales * 0.14);
    const qmoney = Math.round(fuelSales * 0.11);
    const coupons = Math.round(fuelSales * 0.04);
    const waychit = Math.round(fuelSales * 0.03);
    const cash = fuelSales - credit - qmoney - coupons - waychit;
    const banked = cash;

    const dateStr = `2025-01-${String(day).padStart(2, '0')}`;
    summaryRows.push({
      Year: 2025,
      Month: 'January',
      Week: Math.ceil(day / 7),
      Territory: 'Greater Banjul',
      Date: dateStr,
      Station: 'Kotu',
      'PMS Morning': pmsM,
      'PMS Afternoon': pmsA,
      'PMS Night': pmsN,
      'PMS Total': pmsTotal,
      'AGO Morning': agoM,
      'AGO Afternoon': agoA,
      'AGO Night': agoN,
      'AGO Total': agoTotal,
      'Fuel Sales': fuelSales,
      'Credit Sales': credit,
      Qmoney: qmoney,
      Coupons: coupons,
      Waychit: waychit,
      Cash: cash,
      Banked: banked,
      Difference: banked - cash,
    });
  }

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'SUMMARY');

  for (let day = 1; day <= 31; day++) {
    const row = summaryRows[day - 1];
    const sheetRows = [
      ['LOGIX RETAIL DAILY STATION REPORT', 'Kotu', 'Date', row.Date],
      ['PMS Morning (L)', row['PMS Morning'], 'AGO Morning (L)', row['AGO Morning']],
      ['PMS Afternoon (L)', row['PMS Afternoon'], 'AGO Afternoon (L)', row['AGO Afternoon']],
      ['PMS Night (L)', row['PMS Night'], 'AGO Night (L)', row['AGO Night']],
      ['PMS Total (L)', row['PMS Total'], 'AGO Total (L)', row['AGO Total']],
      ['PMS Opening Stock (L)', 28500, 'AGO Opening Stock (L)', 26400],
      ['PMS Receipts (L)', day === 10 ? 15000 : 0, 'AGO Receipts (L)', day === 15 ? 15000 : 0],
      ['PMS Closing Stock (L)', 28500 - Number(row['PMS Total']), 'AGO Closing Stock (L)', 26400 - Number(row['AGO Total'])],
      ['Credit Sales (GMD)', row['Credit Sales'], 'Qmoney (GMD)', row['Qmoney']],
      ['Coupons (GMD)', row['Coupons'], 'Waychit (GMD)', row['Waychit']],
      ['Cash (GMD)', row['Cash'], 'Banked (GMD)', row['Banked']],
      ['Pump 1A Opening', 142000 + day * 3000, 'Pump 1A Closing', 142000 + day * 3000 + Number(row['PMS Total'])],
      ['Pump 2A Opening', 118000 + day * 2800, 'Pump 2A Closing', 118000 + day * 2800 + Number(row['AGO Total'])],
      ['Generator Runtime (hrs)', 4.5, 'Cashpower (kWh)', day % 3 === 0 ? '' : 68],
      ['Notes', day === 14 ? 'Routine tanker inspection completed.' : ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws, `${day} ${formatShortMonth(1)} 25`);
  }

  // Include extra non-reporting Sheet1 matching Section 2
  const emptySheet = XLSX.utils.aoa_to_sheet([['Scratch / Unused Sheet']]);
  XLSX.utils.book_append_sheet(wb, emptySheet, 'Sheet1');

  XLSX.writeFile(wb, '1 KOTU JANUARY 2025.xlsx');
}

export function exportReportsToExcel(reports: DailyReport[], filePrefix: string) {
  const wb = XLSX.utils.book_new();

  const salesRows = reports.map((r) => ({
    Date: r.reportDate,
    Station: r.stationName,
    Territory: r.territory,
    Status: r.completeness,
    'PMS Morning (L)': r.pmsMorningLitres,
    'PMS Afternoon (L)': r.pmsAfternoonLitres,
    'PMS Night (L)': r.pmsNightLitres,
    'PMS Total (L)': r.pmsTotalLitres,
    'PMS Sales (GMD)': r.pmsSalesGmd,
    'AGO Morning (L)': r.agoMorningLitres,
    'AGO Afternoon (L)': r.agoAfternoonLitres,
    'AGO Night (L)': r.agoNightLitres,
    'AGO Total (L)': r.agoTotalLitres,
    'AGO Sales (GMD)': r.agoSalesGmd,
    'Total Fuel Sales (GMD)': r.totalFuelSalesGmd,
    'Source Workbook': r.workbookPath,
    'Source Worksheet': r.worksheetName,
    Revision: r.workbookRevision,
  }));

  const stockRows = reports.map((r) => ({
    Date: r.reportDate,
    Station: r.stationName,
    'PMS Opening (L)': r.pmsOpeningStock,
    'PMS Receipts (L)': r.pmsReceipts,
    'PMS Theoretical (L)': r.pmsTheoreticalStock,
    'PMS Closing (L)': r.pmsClosingStock,
    'PMS Diff (L)': r.pmsStockDiff,
    'PMS Control (%)': r.pmsStockControlRatio,
    'AGO Opening (L)': r.agoOpeningStock,
    'AGO Receipts (L)': r.agoReceipts,
    'AGO Theoretical (L)': r.agoTheoreticalStock,
    'AGO Closing (L)': r.agoClosingStock,
    'AGO Diff (L)': r.agoStockDiff,
    'AGO Control (%)': r.agoStockControlRatio,
  }));

  const reconRows = reports.map((r) => ({
    Date: r.reportDate,
    Station: r.stationName,
    'Total Sales (GMD)': r.totalFuelSalesGmd,
    'Credit (GMD)': r.creditSalesGmd,
    'Coupons (GMD)': r.couponsGmd,
    'Qmoney (GMD)': r.qmoneyGmd,
    'Waychit (GMD)': r.waychitGmd,
    'Cheques (GMD)': r.chequesGmd,
    'Cash (GMD)': r.cashGmd,
    'Banked (GMD)': r.bankedGmd,
    'Difference (GMD)': r.reconciliationDiffGmd,
    Notes: r.noteText,
  }));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), 'Fuel Sales');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockRows), 'Stock Control');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reconRows), 'Financial Recon');

  XLSX.writeFile(wb, `${filePrefix}.xlsx`);
}
