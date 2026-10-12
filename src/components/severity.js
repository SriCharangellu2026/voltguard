export const SEVERITY_STYLES = {
  critical: {
    label: 'Critical',
    badge: 'bg-red-500 text-white',
    row: 'border-red-500/70 bg-red-950/40',
    text: 'text-red-300',
    dot: 'bg-red-500',
  },
  warning: {
    label: 'Warning',
    badge: 'bg-amber-400 text-steel-950',
    row: 'border-amber-500/60 bg-amber-950/30',
    text: 'text-amber-300',
    dot: 'bg-amber-400',
  },
  info: {
    label: 'Info',
    badge: 'bg-sky-500 text-white',
    row: 'border-sky-600/50 bg-sky-950/30',
    text: 'text-sky-300',
    dot: 'bg-sky-500',
  },
  ok: {
    label: 'OK',
    badge: 'bg-emerald-500 text-steel-950',
    row: 'border-steel-700 bg-steel-850',
    text: 'text-emerald-300',
    dot: 'bg-emerald-500',
  },
};

export const PHASE_STYLES = {
  planning: 'text-violet-300 border-violet-500/40',
  isolation: 'text-hazard-yellow border-yellow-500/40',
  verification: 'text-cyan-300 border-cyan-500/40',
  work: 'text-emerald-300 border-emerald-500/40',
  restoration: 'text-orange-300 border-orange-500/40',
};

export const VERDICT_STYLES = {
  CLEARED: { text: 'CLEARED', className: 'border-emerald-500 text-emerald-400', print: 'print:border-green-700 print:text-green-700' },
  CONDITIONAL: { text: 'CONDITIONAL', className: 'border-amber-400 text-amber-300', print: 'print:border-amber-700 print:text-amber-700' },
  HOLD: { text: 'HOLD', className: 'border-red-500 text-red-400', print: 'print:border-red-700 print:text-red-700' },
};
