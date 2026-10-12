import { useState } from 'react';
import { Flame, Gauge, Hand, HardHat, Ruler, ShieldCheck } from 'lucide-react';

const BANDS = [
  { from: 0, to: 1.2, color: '#22c55e', label: '<1.2' },
  { from: 1.2, to: 4, color: '#eab308', label: 'CAT 1' },
  { from: 4, to: 8, color: '#f59e0b', label: 'CAT 2' },
  { from: 8, to: 25, color: '#f97316', label: 'CAT 3' },
  { from: 25, to: 40, color: '#ef4444', label: 'CAT 4' },
  { from: 40, to: 80, color: '#a21caf', label: 'DANGER' },
];

const CX = 160;
const CY = 160;
const R = 120;

/** Each band takes an equal slice of the dial so the low categories stay readable. */
function valueToFraction(value) {
  const slice = 1 / BANDS.length;
  for (let i = 0; i < BANDS.length; i += 1) {
    const b = BANDS[i];
    if (value <= b.to) {
      return i * slice + (Math.max(0, value - b.from) / (b.to - b.from)) * slice;
    }
  }
  return 1;
}

function point(fraction, radius = R) {
  const angle = Math.PI * (1 - fraction);
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function arcPath(f1, f2, radius = R) {
  const [x1, y1] = point(f1, radius);
  const [x2, y2] = point(f2, radius);
  return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`;
}

function Dial({ energy, color }) {
  const fraction = valueToFraction(energy);
  const [nx, ny] = point(fraction, R - 28);
  const slice = 1 / BANDS.length;
  return (
    <svg viewBox="0 0 320 190" className="w-full max-w-sm" role="img" aria-label={`Incident energy ${energy} cal per square centimeter`}>
      {BANDS.map((b, i) => (
        <path key={b.label} d={arcPath(i * slice + 0.004, (i + 1) * slice - 0.004)} stroke={b.color} strokeWidth="22" fill="none" opacity={fraction >= i * slice ? 1 : 0.25} />
      ))}
      {BANDS.map((b, i) => {
        const [lx, ly] = point(i * slice + slice / 2, R + 24);
        return (
          <text key={`l-${b.label}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-slate-400" fontSize="9" fontWeight="700">
            {b.label}
          </text>
        );
      })}
      {[1.2, 4, 8, 25, 40].map((v, i) => {
        const [tx, ty] = point((i + 1) * slice, R - 18);
        return (
          <text key={v} x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" className="fill-slate-500" fontSize="8">
            {v}
          </text>
        );
      })}
      <line x1={CX} y1={CY} x2={nx} y2={ny} stroke={color} strokeWidth="4" strokeLinecap="round" style={{ transition: 'all 0.5s ease' }} />
      <circle cx={CX} cy={CY} r="9" fill="#0d1117" stroke={color} strokeWidth="3" />
      <text x={CX} y={CY + 26} textAnchor="middle" className="fill-slate-500" fontSize="9" letterSpacing="2">
        CAL/CM²
      </text>
    </svg>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded border border-steel-700 bg-steel-950/70 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className="mt-1 font-mono text-lg font-bold text-slate-100">{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

export default function RiskGauge({ arcFlash }) {
  const [checked, setChecked] = useState({});

  if (!arcFlash) {
    return (
      <section className="panel p-6 text-center text-sm text-slate-500" role="region" aria-label="Arc flash and PPE risk">
        Enter equipment parameters to calculate arc flash risk.
      </section>
    );
  }

  const { ppe, arcFlashBoundary, shockBoundaries, gloves, incidentEnergyCal, warnings } = arcFlash;
  const isDanger = ppe.category === 'DANGER';
  const items = [...ppe.items, gloves.note];
  const checkKey = (i) => `${ppe.category}-${i}`;
  const doneCount = items.filter((_, i) => checked[checkKey(i)]).length;

  return (
    <section className="panel" role="region" aria-label="Arc flash and PPE risk">
      <div className="panel-header">
        <h2 className="panel-title">
          <Gauge className="h-4 w-4 text-hazard-yellow" aria-hidden="true" /> Arc Flash &amp; PPE Risk Gauge
        </h2>
        <span className="font-mono text-[10px] text-slate-500" title={arcFlash.formula}>{arcFlash.methodName}</span>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-col items-center">
          <Dial energy={incidentEnergyCal} color={ppe.color} />
          <p className="-mt-3 font-mono text-5xl font-black tabular-nums" style={{ color: ppe.color }}>
            {incidentEnergyCal.toFixed(2)}
          </p>
          <p
            className={`mt-2 rounded px-3 py-1 text-sm font-black uppercase tracking-widest ${isDanger ? 'animate-hazard' : ''}`}
            style={{ backgroundColor: `${ppe.color}22`, color: ppe.color, border: `1px solid ${ppe.color}` }}
          >
            {ppe.label}
          </p>
          {ppe.minArcRatingCal > 0 && (
            <p className="mt-1 text-xs text-slate-400">Minimum PPE arc rating: {ppe.minArcRatingCal} cal/cm²</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat icon={Flame} label="Arc flash boundary" value={arcFlashBoundary.display} sub={`${arcFlashBoundary.m} m · 1.2 cal/cm² threshold`} />
          <Stat icon={Ruler} label="Working distance" value={`${arcFlash.inputs.workingDistanceIn} in`} sub={`${arcFlash.inputs.clearingTimeS} s clearing`} />
          <Stat icon={ShieldCheck} label="Limited approach" value={shockBoundaries.limitedMovable.display} sub={`Fixed part: ${shockBoundaries.limitedFixed.display}`} />
          <Stat icon={ShieldCheck} label="Restricted approach" value={shockBoundaries.restricted.display} sub={shockBoundaries.range} />
        </div>

        {warnings.length > 0 && (
          <ul className="space-y-1 rounded border border-amber-500/40 bg-amber-950/20 p-3 text-xs text-amber-200">
            {warnings.map((w) => (
              <li key={w}>⚠ {w}</li>
            ))}
          </ul>
        )}

        <div role="region" aria-label="Required PPE checklist">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-300" id="ppe-checklist-heading">
              <HardHat className="h-4 w-4 text-hazard-yellow" aria-hidden="true" /> Required PPE checklist
            </h3>
            <span className={`font-mono text-xs ${doneCount === items.length ? 'text-emerald-400' : 'text-slate-500'}`}>
              {doneCount}/{items.length} donned
            </span>
          </div>
          <p className="sr-only">Tab to each PPE item and press Space to mark it donned.</p>
          <ul className="space-y-1" aria-labelledby="ppe-checklist-heading">
            {items.map((item, i) => {
              const key = checkKey(i);
              const isGlove = i === items.length - 1;
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-steel-800">
                    <input
                      type="checkbox"
                      className="check-input focus-visible:ring-2 focus-visible:ring-hazard-yellow"
                      checked={!!checked[key]}
                      aria-label={item}
                      onChange={(e) => setChecked((c) => ({ ...c, [key]: e.target.checked }))}
                    />
                    <span className={checked[key] ? 'text-slate-500 line-through' : 'text-slate-200'}>
                      {isGlove && <Hand className="mr-1 inline h-3.5 w-3.5 text-cyan-400" aria-hidden="true" />}
                      {item}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
