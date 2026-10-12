import { CircleCheck, Info, ShieldAlert, TriangleAlert, WandSparkles } from 'lucide-react';
import { SEVERITY_STYLES } from './severity.js';

export default function HazardBanner({ audit, onApplyFix }) {
  if (!audit) return null;
  const { summary } = audit;
  const risks = audit.risks.filter((r) => r.source === 'sequence');
  const count = (sev) => risks.filter((r) => r.severity === sev).length;
  const critical = count('critical');
  const warning = count('warning');
  const info = count('info');

  if (summary.stepCount === 0) {
    return (
      <div className="panel flex items-center gap-3 px-4 py-3 text-sm text-slate-400">
        <Info className="h-5 w-5 text-sky-400" /> Add switching steps to run the sequential interlock validator.
      </div>
    );
  }

  if (critical === 0 && warning === 0) {
    return (
      <div className="panel flex items-center gap-3 border-emerald-600/60 bg-emerald-950/30 px-4 py-3">
        <CircleCheck className="h-6 w-6 shrink-0 text-emerald-400" />
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-emerald-300">Sequence verified - no interlock violations</p>
          <p className="text-xs text-emerald-200/70">
            All {summary.stepCount} steps satisfy OSHA 1910.269 / NFPA 70E 120.5 switching order.
            {info > 0 && ` ${info} informational note${info > 1 ? 's' : ''}.`}
          </p>
        </div>
      </div>
    );
  }

  const isCritical = critical > 0;
  const shown = risks.filter((r) => r.severity !== 'info');

  return (
    <div
      role="alert"
      className={`overflow-hidden rounded-lg border-2 ${
        isCritical ? 'animate-hazard border-red-500 bg-red-950/50' : 'border-amber-400 bg-amber-950/30'
      }`}
    >
      <div className={`h-2 ${isCritical ? 'bg-hazard-stripes' : 'bg-amber-400/70'}`} />
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {isCritical ? (
          <ShieldAlert className="h-8 w-8 shrink-0 text-red-400" />
        ) : (
          <TriangleAlert className="h-8 w-8 shrink-0 text-amber-300" />
        )}
        <div className="flex-1">
          <p className={`text-base font-black uppercase tracking-wider ${isCritical ? 'text-red-300' : 'text-amber-200'}`}>
            {isCritical ? 'Sequence hazard - stop work' : 'Sequence warnings - supervisor review required'}
          </p>
          <p className="text-xs text-slate-300">
            {critical} critical · {warning} warning · {summary.inversions} out-of-order operation
            {summary.inversions === 1 ? '' : 's'} detected
          </p>
        </div>
      </div>

      <ul className="max-h-80 space-y-2 overflow-y-auto px-4 pb-4">
        {shown.map((r) => {
          const sev = SEVERITY_STYLES[r.severity];
          return (
            <li key={r.id} className={`rounded border-l-4 px-3 py-2 ${sev.row}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${sev.badge}`}>{sev.label}</span>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-200">
                  {r.stepNumber ? `Step ${r.stepNumber} · ` : ''}
                  {r.title}
                </span>
                <span className="font-mono text-[10px] text-slate-400">{r.code}</span>
              </div>
              <p className="mt-1 text-sm text-slate-200">{r.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Remedy:</span> {r.remedy}
              </p>
              {r.inversion && (
                <button
                  type="button"
                  className="btn-ghost mt-2 !py-1 focus-visible:ring-2 focus-visible:ring-hazard-yellow"
                  aria-label={`Move step ${r.inversion.moveStepNumber} before step ${r.inversion.beforeStepNumber}`}
                  onClick={() => onApplyFix(r.inversion.moveStepId, r.inversion.beforeStepId)}
                >
                  <WandSparkles className="h-3.5 w-3.5 text-hazard-yellow" />
                  Move step {r.inversion.moveStepNumber} before step {r.inversion.beforeStepNumber}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
