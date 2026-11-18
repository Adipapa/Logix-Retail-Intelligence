import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { CompletenessStatus } from '../types/logix';

interface StatusLabelProps {
  status: CompletenessStatus | 'matched' | 'within_tolerance' | 'variance_exceeded' | 'missing_summary' | 'completed' | 'completed_with_warnings' | 'failed' | 'partial' | 'error' | 'warning' | 'info';
}

export function StatusLabel({ status }: StatusLabelProps) {
  switch (status) {
    case 'imported':
    case 'matched':
    case 'completed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{status === 'matched' ? 'Matched' : status === 'completed' ? 'Completed' : 'Imported'}</span>
        </span>
      );
    case 'within_tolerance':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Within tolerance</span>
        </span>
      );
    case 'warning':
    case 'completed_with_warnings':
    case 'variance_exceeded':
    case 'partial':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {status === 'variance_exceeded'
              ? 'Variance exceeded'
              : status === 'completed_with_warnings'
              ? 'Completed (warnings)'
              : status === 'partial'
              ? 'Partial'
              : 'Warning'}
          </span>
        </span>
      );
    case 'incomplete':
    case 'missing_summary':
    case 'info':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {status === 'missing_summary' ? 'Missing summary' : status === 'info' ? 'Notice' : 'Incomplete'}
          </span>
        </span>
      );
    case 'failed':
    case 'error':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{status === 'error' ? 'Error' : 'Failed'}</span>
        </span>
      );
    default:
      return <span className="text-xs text-slate-600">{status}</span>;
  }
}
