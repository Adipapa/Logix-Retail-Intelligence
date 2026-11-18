import { useState } from 'react';
import { formatGmd, formatLitres, formatNumber } from '../lib/formatters';

export interface DualSeriesDatum {
  label: string;
  pmsValue: number;
  agoValue: number;
  secondaryNote?: string;
}

interface FuelComparisonChartProps {
  data: DualSeriesDatum[];
  unit: 'L' | 'GMD';
  showPms?: boolean;
  showAgo?: boolean;
  height?: number;
}

export function FuelComparisonChart({
  data,
  unit,
  showPms = true,
  showAgo = true,
  height = 240,
}: FuelComparisonChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center border border-dashed border-slate-200 rounded-md text-sm text-slate-500">
        No records match the current station and period filter.
      </div>
    );
  }

  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(showPms ? d.pmsValue : 0, showAgo ? d.agoValue : 0))
  );

  const svgWidth = Math.max(640, data.length * 36);
  const padLeft = 64;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 34;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const groupW = plotW / data.length;
  const barW = Math.min(18, Math.max(5, groupW * 0.34));

  const formatMetric = (val: number) =>
    unit === 'GMD' ? formatGmd(val) : formatLitres(val);

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-5 text-xs text-slate-600">
          {showPms && (
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-teal-700 inline-block" aria-hidden="true" />
              <span className="font-medium text-slate-800">PMS (Petrol)</span>
            </span>
          )}
          {showAgo && (
            <span className="inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-700 inline-block" aria-hidden="true" />
              <span className="font-medium text-slate-800">AGO (Diesel)</span>
            </span>
          )}
        </div>
        {hoveredIdx !== null && data[hoveredIdx] && (
          <div className="text-xs font-mono tabular-nums text-slate-700">
            <span className="font-semibold text-slate-900">{data[hoveredIdx].label}</span>
            {showPms && <span> · PMS: {formatMetric(data[hoveredIdx].pmsValue)}</span>}
            {showAgo && <span> · AGO: {formatMetric(data[hoveredIdx].agoValue)}</span>}
          </div>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${height}`}
          className="w-full min-w-[540px]"
          style={{ height: `${height}px` }}
          role="img"
          aria-label="PMS and AGO comparison bar chart"
        >
          {ticks.map((t) => {
            const y = padTop + plotH * (1 - t);
            const labelVal = Math.round(maxVal * t);
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {labelVal >= 1000000
                    ? `${(labelVal / 1000000).toFixed(1)}M`
                    : labelVal >= 1000
                    ? `${Math.round(labelVal / 1000)}k`
                    : labelVal}
                </text>
              </g>
            );
          })}

          {data.map((d, idx) => {
            const centerX = padLeft + idx * groupW + groupW / 2;
            const pmsH = (d.pmsValue / maxVal) * plotH;
            const agoH = (d.agoValue / maxVal) * plotH;
            const isHovered = hoveredIdx === idx;
            const showLabel = data.length <= 16 || idx % Math.ceil(data.length / 12) === 0;

            return (
              <g
                key={d.label}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="cursor-pointer"
              >
                {isHovered && (
                  <rect
                    x={padLeft + idx * groupW}
                    y={padTop}
                    width={groupW}
                    height={plotH}
                    fill="#f1f5f9"
                  />
                )}
                {showPms && (
                  <rect
                    x={showAgo ? centerX - barW - 1 : centerX - barW / 2}
                    y={padTop + plotH - pmsH}
                    width={barW}
                    height={Math.max(1, pmsH)}
                    rx={1.5}
                    fill="#0f766e"
                    opacity={hoveredIdx === null || isHovered ? 1 : 0.65}
                  />
                )}
                {showAgo && (
                  <rect
                    x={showPms ? centerX + 1 : centerX - barW / 2}
                    y={padTop + plotH - agoH}
                    width={barW}
                    height={Math.max(1, agoH)}
                    rx={1.5}
                    fill="#b45309"
                    opacity={hoveredIdx === null || isHovered ? 1 : 0.65}
                  />
                )}
                {showLabel && (
                  <text
                    x={centerX}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-mono"
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export interface StationBarDatum {
  stationId: string;
  stationName: string;
  pmsLitres: number;
  agoLitres: number;
  totalSalesGmd: number;
  coveragePct: number;
}

export function StationComparisonBars({
  items,
  onSelectStation,
}: {
  items: StationBarDatum[];
  onSelectStation?: (stationId: string) => void;
}) {
  const maxLitres = Math.max(1, ...items.map((i) => i.pmsLitres + i.agoLitres));

  return (
    <div className="space-y-3.5">
      {items.map((item) => {
        const total = item.pmsLitres + item.agoLitres;
        const pmsPct = (item.pmsLitres / maxLitres) * 100;
        const agoPct = (item.agoLitres / maxLitres) * 100;
        return (
          <div
            key={item.stationId}
            onClick={() => onSelectStation?.(item.stationId)}
            className={onSelectStation ? 'cursor-pointer group' : ''}
          >
            <div className="flex items-baseline justify-between text-xs mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                  {item.stationName}
                </span>
                <span className="text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  {item.coveragePct.toFixed(0)}% coverage
                </span>
              </div>
              <div className="font-mono tabular-nums text-slate-700">
                {formatLitres(total)} · {formatGmd(item.totalSalesGmd)}
              </div>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-xs overflow-hidden flex">
              <div
                style={{ width: `${pmsPct}%` }}
                className="bg-teal-700 h-full"
                title={`PMS: ${formatLitres(item.pmsLitres)}`}
              />
              <div
                style={{ width: `${agoPct}%` }}
                className="bg-amber-700 h-full"
                title={`AGO: ${formatLitres(item.agoLitres)}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ShiftSplitBars({
  label,
  morning,
  afternoon,
  night,
  accentClass,
}: {
  label: string;
  morning: number;
  afternoon: number;
  night: number;
  accentClass: string;
}) {
  const total = Math.max(1, morning + afternoon + night);
  const mPct = (morning / total) * 100;
  const aPct = (afternoon / total) * 100;
  const nPct = (night / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-slate-900">{label}</span>
        <span className="font-mono tabular-nums text-slate-600">{formatLitres(morning + afternoon + night)}</span>
      </div>
      <div className="w-full h-3 bg-slate-100 rounded-xs overflow-hidden flex">
        <div style={{ width: `${mPct}%` }} className={`${accentClass} opacity-100 h-full`} />
        <div style={{ width: `${aPct}%` }} className={`${accentClass} opacity-75 h-full`} />
        <div style={{ width: `${nPct}%` }} className={`${accentClass} opacity-45 h-full`} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums text-slate-600">
        <div>Morning: {formatNumber(morning)} L ({mPct.toFixed(1)}%)</div>
        <div>Afternoon: {formatNumber(afternoon)} L ({aPct.toFixed(1)}%)</div>
        <div>Night: {formatNumber(night)} L ({nPct.toFixed(1)}%)</div>
      </div>
    </div>
  );
}
