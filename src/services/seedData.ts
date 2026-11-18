import type {
  AuditLog,
  DailyReport,
  ImportJob,
  ImportWarning,
  PumpReading,
  SourceWorkbook,
  Station,
  SummaryReconciliation,
  SyncRun,
} from '../types/logix';

const PMS_PRICE_GMD = 74.5;
const AGO_PRICE_GMD = 76.0;

function seededNumber(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  const frac = x - Math.floor(x);
  return Math.round(min + frac * (max - min));
}

function getWeekdayName(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function getIsoWeek(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export interface SeedDataset {
  stations: Station[];
  workbooks: SourceWorkbook[];
  dailyReports: DailyReport[];
  reconciliations: SummaryReconciliation[];
  importJobs: ImportJob[];
  importWarnings: ImportWarning[];
  syncRuns: SyncRun[];
  auditLogs: AuditLog[];
}

export function buildHistoricalSeedDataset(ownerUid: string, actorEmail: string): SeedDataset {
  const now = new Date().toISOString();

  const stations: Station[] = [
    {
      ownerUid,
      stationId: 'kotu',
      canonicalName: 'Kotu',
      territory: 'Greater Banjul',
      folderPath: '/Logix Retail/Kotu',
      aliases: ['Kotu Station', '1 KOTU'],
      activeStatus: 'active',
      pumpCount: 6,
      tankCapacityPms: 45000,
      tankCapacityAgo: 45000,
      createdAt: now,
      updatedAt: now,
    },
    {
      ownerUid,
      stationId: 'sukuta',
      canonicalName: 'Sukuta',
      territory: 'West Coast',
      folderPath: '/Logix Retail/Sukuta',
      aliases: ['Sukuta Station', '2 SUKUTA'],
      activeStatus: 'active',
      pumpCount: 4,
      tankCapacityPms: 35000,
      tankCapacityAgo: 35000,
      createdAt: now,
      updatedAt: now,
    },
    {
      ownerUid,
      stationId: 'brusubi',
      canonicalName: 'Brusubi',
      territory: 'Greater Banjul',
      folderPath: '/Logix Retail/Brusubi',
      aliases: ['Brusubi Turntable', '3 BRUSUBI'],
      activeStatus: 'active',
      pumpCount: 6,
      tankCapacityPms: 50000,
      tankCapacityAgo: 50000,
      createdAt: now,
      updatedAt: now,
    },
    {
      ownerUid,
      stationId: 'brikama',
      canonicalName: 'Brikama',
      territory: 'West Coast',
      folderPath: '/Logix Retail/Brikama',
      aliases: ['Brikama Highway', '4 BRIKAMA'],
      activeStatus: 'active',
      pumpCount: 4,
      tankCapacityPms: 40000,
      tankCapacityAgo: 40000,
      createdAt: now,
      updatedAt: now,
    },
    {
      ownerUid,
      stationId: 'banjul',
      canonicalName: 'Banjul Terminal',
      territory: 'Banjul',
      folderPath: '/Logix Retail/Banjul Terminal',
      aliases: ['Banjul', '5 BANJUL'],
      activeStatus: 'active',
      pumpCount: 4,
      tankCapacityPms: 60000,
      tankCapacityAgo: 60000,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const workbooks: SourceWorkbook[] = [];
  const dailyReports: DailyReport[] = [];
  const reconciliations: SummaryReconciliation[] = [];
  const importJobs: ImportJob[] = [];
  const importWarnings: ImportWarning[] = [];

  // Station volume multipliers
  const stationScale: Record<string, number> = {
    kotu: 1.15,
    sukuta: 0.92,
    brusubi: 1.28,
    brikama: 0.88,
    banjul: 1.04,
  };

  // Generate representative monthly workbooks from 2022 through 2026
  // For Kotu Jan 2025: generate full 31 daily sheets (1 JAN 25 .. 31 JAN 25) matching the spec sample!
  // For Sukuta Jan 2025 & Brusubi Jan 2025: generate representative daily reports (10 days each)
  // For 2022, 2023, 2024, 2025 (other months), and 2026: generate key monthly sample reports across stations
  const targetPeriods: Array<{ year: number; month: number; days: number[] }> = [
    { year: 2022, month: 6, days: [1, 15, 28] },
    { year: 2022, month: 12, days: [1, 15, 30] },
    { year: 2023, month: 3, days: [1, 15, 29] },
    { year: 2023, month: 9, days: [1, 15, 30] },
    { year: 2024, month: 1, days: [1, 15, 31] },
    { year: 2024, month: 6, days: [1, 15, 30] },
    { year: 2024, month: 12, days: [1, 15, 31] },
    {
      year: 2025,
      month: 1,
      days: Array.from({ length: 31 }, (_, i) => i + 1),
    },
    { year: 2025, month: 6, days: [1, 10, 20, 30] },
    { year: 2026, month: 1, days: [1, 8, 15, 22] },
    { year: 2026, month: 11, days: [1, 5, 10, 14, 17] },
  ];

  const shortMonths = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fullMonths = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
  ];

  stations.forEach((st, stIdx) => {
    let pmsStockCarry = Math.round(st.tankCapacityPms * 0.62);
    let agoStockCarry = Math.round(st.tankCapacityAgo * 0.58);
    let meterBasePms = 142000 + stIdx * 24000;
    let meterBaseAgo = 118000 + stIdx * 19500;

    targetPeriods.forEach((period, pIdx) => {
      // Only Kotu gets all 31 days in Jan 2025; other stations get 10 key days in Jan 2025 to keep Firestore fast & crisp
      const daysToEmit =
        period.year === 2025 && period.month === 1 && st.stationId !== 'kotu'
          ? [1, 3, 6, 9, 12, 15, 18, 22, 26, 30]
          : period.days;

      const yearGrowth = 1 + (period.year - 2022) * 0.065;
      const scale = stationScale[st.stationId] * yearGrowth;
      const workbookId = `wb_${st.stationId}_${period.year}_${String(period.month).padStart(2, '0')}`;
      const monthLabel = fullMonths[period.month - 1];
      const fileName =
        st.stationId === 'kotu' && period.year === 2025 && period.month === 1
          ? '1 KOTU JANUARY 2025.xlsm'
          : `${stIdx + 1} ${st.canonicalName.toUpperCase()} ${monthLabel} ${period.year}.xlsm`;
      const path = `${st.folderPath}/${period.year}/${monthLabel}/${fileName}`;
      const revision = `rev_${period.year}${String(period.month).padStart(2, '0')}_${stIdx + 1}a9f`;
      const jobId = `job_${workbookId}`;

      const hasIntentionalWarning =
        (st.stationId === 'kotu' && period.year === 2025 && period.month === 1) ||
        (st.stationId === 'sukuta' && period.year === 2025 && period.month === 1) ||
        (st.stationId === 'brikama' && period.year === 2026 && period.month === 11);

      const isIncompleteMonth = st.stationId === 'banjul' && period.year === 2026 && period.month === 11;

      workbooks.push({
        ownerUid,
        workbookId,
        stationId: st.stationId,
        stationName: st.canonicalName,
        year: period.year,
        month: period.month,
        dropboxFileId: `id:dbx_${st.stationId}_${period.year}_${period.month}`,
        path,
        revision,
        fileName,
        sizeBytes: 384000 + daysToEmit.length * 14200,
        sheetCount: daysToEmit.length + 2,
        dailySheetsFound: isIncompleteMonth ? daysToEmit.length - 1 : daysToEmit.length,
        hasSummarySheet: true,
        templateVersion: period.year <= 2023 ? 'v1.2-legacy' : 'v2.1-standard',
        calculationVersion: 'calc-2026.1',
        status: isIncompleteMonth ? 'incomplete' : hasIntentionalWarning ? 'warning' : 'imported',
        modifiedAt: `${period.year}-${String(period.month).padStart(2, '0')}-28T18:10:00.000Z`,
        importedAt: now,
      });

      let monthPmsDailySum = 0;
      let monthAgoDailySum = 0;
      let monthSalesDailySum = 0;
      let monthBankedSum = 0;
      let warningsForJob = 0;

      daysToEmit.forEach((day, dIdx) => {
        // Intentional incomplete missing sheet for Banjul Nov 2026 day 17
        if (isIncompleteMonth && day === 17) {
          warningsForJob += 1;
          importWarnings.push({
            ownerUid,
            warningId: `warn_${workbookId}_missing_17`,
            jobId,
            workbookId,
            stationId: st.stationId,
            stationName: st.canonicalName,
            reportDate: '2026-11-17',
            worksheet: '17 NOV 26',
            field: 'worksheet',
            severity: 'error',
            message: 'Expected daily worksheet "17 NOV 26" is missing or unpopulated in source workbook.',
            sourceReference: `${fileName} -> Missing Sheet`,
            createdAt: now,
          });
          return;
        }

        const seed = stIdx * 10000 + pIdx * 500 + day * 17;
        const reportDate = `${period.year}-${String(period.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const wsName = `${day} ${shortMonths[period.month - 1]} ${String(period.year).slice(2)}`;

        const pmsM = Math.round(seededNumber(seed + 1, 1650, 2650) * scale);
        const pmsA = Math.round(seededNumber(seed + 2, 1850, 2950) * scale);
        const pmsN = Math.round(seededNumber(seed + 3, 720, 1280) * scale);
        const pmsTotal = pmsM + pmsA + pmsN;

        const agoM = Math.round(seededNumber(seed + 4, 1450, 2400) * scale);
        const agoA = Math.round(seededNumber(seed + 5, 1620, 2700) * scale);
        const agoN = Math.round(seededNumber(seed + 6, 850, 1500) * scale);
        const agoTotal = agoM + agoA + agoN;

        const pmsReturn = day % 9 === 0 ? seededNumber(seed + 7, 15, 45) : 0;
        const agoReturn = day % 11 === 0 ? seededNumber(seed + 8, 10, 35) : 0;

        const pmsSales = Math.round(pmsTotal * PMS_PRICE_GMD);
        const agoSales = Math.round(agoTotal * AGO_PRICE_GMD);
        const totalFuelSales = pmsSales + agoSales;

        const pmsReceipts = pmsStockCarry < 14000 ? 15000 : 0;
        const agoReceipts = agoStockCarry < 14000 ? 15000 : 0;

        const pmsTheoretical = pmsStockCarry + pmsReceipts - pmsTotal + pmsReturn;
        const agoTheoretical = agoStockCarry + agoReceipts - agoTotal + agoReturn;

        const pmsDiff = seededNumber(seed + 9, -45, 38);
        const agoDiff = seededNumber(seed + 10, -40, 32);

        const pmsClosing = Math.max(2500, pmsTheoretical + pmsDiff);
        const agoClosing = Math.max(2500, agoTheoretical + agoDiff);

        const pmsControlRatio = Number(((pmsDiff / Math.max(1, pmsTotal)) * 100).toFixed(2));
        const agoControlRatio = Number(((agoDiff / Math.max(1, agoTotal)) * 100).toFixed(2));

        // Deliveries & diversions
        const directDelivery = pmsReceipts + agoReceipts;
        const isDiversionDay = st.stationId === 'kotu' && period.year === 2025 && period.month === 1 && day === 14;
        const diversionLitres = isDiversionDay ? 5000 : 0;
        const shortageLitres = directDelivery > 0 ? seededNumber(seed + 11, 20, 85) : 0;
        const receivedLitres = directDelivery > 0 ? directDelivery - shortageLitres - diversionLitres : 0;

        // Payment breakdown
        const creditSales = Math.round(totalFuelSales * 0.14);
        const coupons = Math.round(totalFuelSales * 0.04);
        const qmoney = Math.round(totalFuelSales * 0.11);
        const waychit = Math.round(totalFuelSales * 0.03);
        const cheques = day % 4 === 0 ? Math.round(totalFuelSales * 0.06) : 0;
        const cash = totalFuelSales - (creditSales + coupons + qmoney + waychit + cheques);
        const isReconWarningDay =
          st.stationId === 'kotu' && period.year === 2025 && period.month === 1 && day === 19;
        const reconDiff = isReconWarningDay ? -18500 : seededNumber(seed + 12, -350, 250);
        const banked = cash + reconDiff;

        // Build pump readings (4 key pump channels per daily sheet)
        const p1Open = meterBasePms;
        const p1Close = p1Open + Math.round(pmsTotal * 0.55);
        const p2Open = meterBasePms + 41200;
        const p2Close = p2Open + (pmsTotal - Math.round(pmsTotal * 0.55));
        const a1Open = meterBaseAgo;
        const a1Close = a1Open + Math.round(agoTotal * 0.52);
        const a2Open = meterBaseAgo + 33800;
        const isPumpAnomaly = st.stationId === 'sukuta' && period.year === 2025 && period.month === 1 && day === 12;
        const a2Throughput = agoTotal - Math.round(agoTotal * 0.52);
        const a2Close = isPumpAnomaly ? a2Open - 420 : a2Open + a2Throughput;

        const pumpReadings: PumpReading[] = [
          {
            pumpId: 'Pump 1A',
            island: 'Island 1',
            product: 'PMS',
            shift: 'Morning',
            openingMeter: p1Open,
            closingMeter: p1Close,
            throughput: p1Close - p1Open,
            flag: 'normal',
          },
          {
            pumpId: 'Pump 1B',
            island: 'Island 1',
            product: 'PMS',
            shift: 'Afternoon',
            openingMeter: p2Open,
            closingMeter: p2Close,
            throughput: p2Close - p2Open,
            flag: 'normal',
          },
          {
            pumpId: 'Pump 2A',
            island: 'Island 2',
            product: 'AGO',
            shift: 'Morning',
            openingMeter: a1Open,
            closingMeter: a1Close,
            throughput: a1Close - a1Open,
            flag: 'normal',
          },
          {
            pumpId: 'Pump 2B',
            island: 'Island 2',
            product: 'AGO',
            shift: 'Night',
            openingMeter: a2Open,
            closingMeter: a2Close,
            throughput: isPumpAnomaly ? a2Close - a2Open : a2Throughput,
            flag: isPumpAnomaly ? 'negative_movement' : 'normal',
          },
        ];

        const completeness: DailyReport['completeness'] =
          isReconWarningDay || isPumpAnomaly || isDiversionDay ? 'warning' : 'imported';

        if (isReconWarningDay) {
          warningsForJob += 1;
          importWarnings.push({
            ownerUid,
            warningId: `warn_${workbookId}_recon_19`,
            jobId,
            workbookId,
            stationId: st.stationId,
            stationName: st.canonicalName,
            reportDate,
            worksheet: wsName,
            field: 'reconciliationDiffGmd',
            severity: 'warning',
            message: 'Cash-to-banked variance of GMD -18,500 exceeds GMD 2,500 tolerance threshold.',
            sourceReference: `${fileName} [${wsName}] Cell N38`,
            createdAt: now,
          });
        }

        if (isPumpAnomaly) {
          warningsForJob += 1;
          importWarnings.push({
            ownerUid,
            warningId: `warn_${workbookId}_pump_12`,
            jobId,
            workbookId,
            stationId: st.stationId,
            stationName: st.canonicalName,
            reportDate,
            worksheet: wsName,
            field: 'pumpReadings.Pump 2B',
            severity: 'warning',
            message: 'Closing meter reading is lower than opening meter (-420 L); flagged for mechanical meter audit.',
            sourceReference: `${fileName} [${wsName}] Cell F14`,
            createdAt: now,
          });
        }

        const reportId = `rep_${st.stationId}_${reportDate.replace(/-/g, '')}`;
        dailyReports.push({
          ownerUid,
          reportId,
          stationId: st.stationId,
          stationName: st.canonicalName,
          territory: st.territory,
          workbookId,
          workbookPath: path,
          workbookRevision: revision,
          worksheetName: wsName,
          reportDate,
          year: period.year,
          month: period.month,
          weekNumber: getIsoWeek(reportDate),
          weekday: getWeekdayName(reportDate),
          completeness,
          pmsMorningLitres: pmsM,
          pmsAfternoonLitres: pmsA,
          pmsNightLitres: pmsN,
          pmsTotalLitres: pmsTotal,
          pmsSalesGmd: pmsSales,
          pmsReturnToTankLitres: pmsReturn,
          pmsCashFuelGmd: Math.round(pmsSales * 0.68),
          agoMorningLitres: agoM,
          agoAfternoonLitres: agoA,
          agoNightLitres: agoN,
          agoTotalLitres: agoTotal,
          agoSalesGmd: agoSales,
          agoReturnToTankLitres: agoReturn,
          agoCashFuelGmd: Math.round(agoSales * 0.65),
          totalFuelSalesGmd: totalFuelSales,
          pmsOpeningStock: pmsStockCarry,
          pmsReceipts,
          pmsTheoreticalStock: pmsTheoretical,
          pmsClosingStock: pmsClosing,
          pmsStockDiff: pmsDiff,
          pmsStockControlRatio: pmsControlRatio,
          agoOpeningStock: agoStockCarry,
          agoReceipts,
          agoTheoreticalStock: agoTheoretical,
          agoClosingStock: agoClosing,
          agoStockDiff: agoDiff,
          agoStockControlRatio: agoControlRatio,
          directDeliveryLitres: directDelivery,
          diversionLitres,
          diversionDirection: isDiversionDay ? 'Kotu -> Sukuta' : null,
          shortageLitres,
          receivedLitres,
          deliveryOrigin: directDelivery > 0 ? 'Banjul Depot (GamPetroleum)' : null,
          deliveryDestination: directDelivery > 0 ? st.canonicalName : null,
          creditSalesGmd: creditSales,
          couponsGmd: coupons,
          qmoneyGmd: qmoney,
          waychitGmd: waychit,
          chequesGmd: cheques,
          cashGmd: cash,
          bankedGmd: banked,
          reconciliationDiffGmd: reconDiff,
          generatorRuntimeHrs: Number((seededNumber(seed + 13, 1, 8) + 0.5).toFixed(1)),
          generatorRefuelLitres: day % 5 === 0 ? 45 : 0,
          // Keep Cashpower deliberately null on every 3rd day to demonstrate distinct missing-vs-zero fidelity
          cashpowerKwh: day % 3 === 0 ? null : seededNumber(seed + 14, 42, 95),
          cashpowerPurchaseGmd: day % 3 === 0 ? null : seededNumber(seed + 15, 650, 1400),
          noteText: isDiversionDay
            ? '5,000 L PMS tanker split diverted to Sukuta reserve tank per dispatch order.'
            : isReconWarningDay
            ? 'Delayed evening bank lodgement slip pending manager verification.'
            : day % 7 === 0
            ? 'Weekly dip-stick tank calibration verified by station supervisor.'
            : '',
          sourceRowRef: `Row ${dIdx + 2} (SUMMARY) · ${wsName}!A1:S44`,
          pumpReadings,
          createdAt: now,
          updatedAt: now,
        });

        pmsStockCarry = pmsClosing;
        agoStockCarry = agoClosing;
        meterBasePms = p2Close;
        meterBaseAgo = a1Close;
        monthPmsDailySum += pmsTotal;
        monthAgoDailySum += agoTotal;
        monthSalesDailySum += totalFuelSales;
        monthBankedSum += banked;
      });

      // Summary reconciliations for each workbook period
      const summaryPmsVariance =
        st.stationId === 'brikama' && period.year === 2026 && period.month === 11 ? 1420 : 0;
      const summarySalesVariance =
        st.stationId === 'kotu' && period.year === 2025 && period.month === 1 ? -1250 : 0;

      reconciliations.push(
        {
          ownerUid,
          reconciliationId: `rec_${workbookId}_pms`,
          workbookId,
          stationId: st.stationId,
          stationName: st.canonicalName,
          year: period.year,
          month: period.month,
          reportDate: `${period.year}-${String(period.month).padStart(2, '0')}`,
          fieldName: 'PMS Total Volume (L)',
          product: 'PMS',
          dailyDerivedValue: monthPmsDailySum,
          summaryValue: monthPmsDailySum + summaryPmsVariance,
          variance: summaryPmsVariance,
          tolerance: 100,
          result: Math.abs(summaryPmsVariance) > 100 ? 'variance_exceeded' : 'matched',
          createdAt: now,
        },
        {
          ownerUid,
          reconciliationId: `rec_${workbookId}_ago`,
          workbookId,
          stationId: st.stationId,
          stationName: st.canonicalName,
          year: period.year,
          month: period.month,
          reportDate: `${period.year}-${String(period.month).padStart(2, '0')}`,
          fieldName: 'AGO Total Volume (L)',
          product: 'AGO',
          dailyDerivedValue: monthAgoDailySum,
          summaryValue: monthAgoDailySum,
          variance: 0,
          tolerance: 100,
          result: 'matched',
          createdAt: now,
        },
        {
          ownerUid,
          reconciliationId: `rec_${workbookId}_sales`,
          workbookId,
          stationId: st.stationId,
          stationName: st.canonicalName,
          year: period.year,
          month: period.month,
          reportDate: `${period.year}-${String(period.month).padStart(2, '0')}`,
          fieldName: 'Total Fuel Sales (GMD)',
          product: 'GROUP',
          dailyDerivedValue: monthSalesDailySum,
          summaryValue: monthSalesDailySum + summarySalesVariance,
          variance: summarySalesVariance,
          tolerance: 2000,
          result:
            summarySalesVariance === 0
              ? 'matched'
              : Math.abs(summarySalesVariance) <= 2000
              ? 'within_tolerance'
              : 'variance_exceeded',
          createdAt: now,
        },
        {
          ownerUid,
          reconciliationId: `rec_${workbookId}_banked`,
          workbookId,
          stationId: st.stationId,
          stationName: st.canonicalName,
          year: period.year,
          month: period.month,
          reportDate: `${period.year}-${String(period.month).padStart(2, '0')}`,
          fieldName: 'Banked Deposits (GMD)',
          product: 'GROUP',
          dailyDerivedValue: monthBankedSum,
          summaryValue: monthBankedSum,
          variance: 0,
          tolerance: 1000,
          result: 'matched',
          createdAt: now,
        }
      );

      if (summaryPmsVariance !== 0) {
        warningsForJob += 1;
        importWarnings.push({
          ownerUid,
          warningId: `warn_${workbookId}_sum_pms`,
          jobId,
          workbookId,
          stationId: st.stationId,
          stationName: st.canonicalName,
          reportDate: `${period.year}-${String(period.month).padStart(2, '0')}-01`,
          worksheet: 'SUMMARY',
          field: 'PMS Total Volume (L)',
          severity: 'warning',
          message: `SUMMARY sheet PMS total differs from daily-derived sum by ${summaryPmsVariance} L (tolerance 100 L).`,
          sourceReference: `${fileName} [SUMMARY] Col K`,
          createdAt: now,
        });
      }

      importJobs.push({
        ownerUid,
        jobId,
        workbookId,
        fileName,
        stationName: st.canonicalName,
        year: period.year,
        month: period.month,
        status: warningsForJob > 0 ? 'completed_with_warnings' : 'completed',
        recordsExtracted: isIncompleteMonth ? daysToEmit.length - 1 : daysToEmit.length,
        warningsCount: warningsForJob,
        errorsCount: isIncompleteMonth ? 1 : 0,
        errorSummary: isIncompleteMonth
          ? '1 expected daily sheet missing in source workbook.'
          : warningsForJob > 0
          ? `${warningsForJob} validation/reconciliation notice(s) logged for management review.`
          : '',
        retryCount: 0,
        startedAt: now,
        completedAt: now,
      });
    });
  });

  const syncRuns: SyncRun[] = [
    {
      ownerUid,
      syncId: 'sync_20261118_0445',
      triggerType: 'scheduled_15m',
      cursorBefore: 'dbx_cur_9948102a',
      cursorAfter: 'dbx_cur_9948109f',
      filesSeen: 55,
      filesQueued: 2,
      filesSkipped: 53,
      status: 'completed',
      durationMs: 2840,
      startedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 15 * 60 * 1000 + 2840).toISOString(),
    },
    {
      ownerUid,
      syncId: 'sync_20261118_0430',
      triggerType: 'scheduled_15m',
      cursorBefore: 'dbx_cur_9948095c',
      cursorAfter: 'dbx_cur_9948102a',
      filesSeen: 55,
      filesQueued: 0,
      filesSkipped: 55,
      status: 'completed',
      durationMs: 920,
      startedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 30 * 60 * 1000 + 920).toISOString(),
    },
    {
      ownerUid,
      syncId: 'sync_20261118_0415',
      triggerType: 'scheduled_15m',
      cursorBefore: 'dbx_cur_9948081e',
      cursorAfter: 'dbx_cur_9948095c',
      filesSeen: 53,
      filesQueued: 3,
      filesSkipped: 50,
      status: 'completed',
      durationMs: 3610,
      startedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      completedAt: new Date(Date.now() - 45 * 60 * 1000 + 3610).toISOString(),
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      ownerUid,
      auditId: `aud_init_${Date.now()}`,
      actorEmail,
      action: 'HISTORICAL_ARCHIVE_IMPORTED',
      entityType: 'archive',
      entityId: '2022-2026',
      details: `Initialised ${stations.length} stations, ${workbooks.length} monthly workbooks, and ${dailyReports.length} daily operational records.`,
      timestamp: now,
    },
  ];

  return {
    stations,
    workbooks,
    dailyReports,
    reconciliations,
    importJobs,
    importWarnings,
    syncRuns,
    auditLogs,
  };
}
