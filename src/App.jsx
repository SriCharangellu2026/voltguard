import { Component, useCallback, useEffect, useState } from 'react';
import { Activity, FilePlus2, LoaderCircle, ServerCrash, ShieldAlert, ShieldCheck, TriangleAlert, Zap } from 'lucide-react';
import { fetchStandards, runAudit } from './api.js';
import { BLANK_EQUIPMENT, SAMPLES } from './samples.js';
import EquipmentPanel from './components/EquipmentPanel.jsx';
import HazardBanner from './components/HazardBanner.jsx';
import SequenceEditor from './components/SequenceEditor.jsx';
import RiskGauge from './components/RiskGauge.jsx';
import LotoCard from './components/LotoCard.jsx';
import { VERDICT_STYLES } from './components/severity.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error stopped this view.',
    };
  }

  componentDidCatch(error, info) {
    console.error('VoltGuard UI error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-steel-950 px-4" role="alert">
        <div className="panel max-w-lg p-6">
          <div className="flex items-start gap-3">
            <ServerCrash className="mt-0.5 h-6 w-6 shrink-0 text-red-400" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-black uppercase tracking-wide text-white">VoltGuard stopped this view</h1>
              <p className="mt-2 text-sm text-slate-300">
                An unexpected error occurred. The auditor hid this screen so it would not show incomplete safety information. Reload the page to continue.
              </p>
              <p className="mt-2 text-xs text-slate-500">{this.state.message}</p>
              <button
                type="button"
                className="btn-primary mt-4 focus-visible:ring-2 focus-visible:ring-hazard-yellow"
                aria-label="Reload VoltGuard"
                onClick={() => window.location.reload()}
              >
                Reload VoltGuard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function equipmentIsComplete(eq) {
  return ['systemVoltageKV', 'boltedFaultKA', 'clearingTimeCycles', 'workingDistanceIn'].every(
    (k) => typeof eq[k] === 'number' && Number.isFinite(eq[k]),
  );
}

function reportFailure(err, setErrorTitle, setError) {
  if (!err || err.name === 'AbortError') return;
  if (err.code === 'BACKEND_OFFLINE') {
    setErrorTitle('Backend offline');
    setError(err.message);
    return;
  }
  setErrorTitle('Audit could not be completed');
  setError(err.message || 'The safety audit did not finish. Check the procedure and try again.');
}

function Auditor() {
  const initial = SAMPLES[0];
  const [activeSample, setActiveSample] = useState(initial.key);
  const [procedure, setProcedure] = useState(clone(initial.procedure));
  const [equipment, setEquipment] = useState(clone(initial.equipment));
  const [steps, setSteps] = useState(clone(initial.steps));

  const [actions, setActions] = useState({});
  const [meta, setMeta] = useState(null);
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [errorTitle, setErrorTitle] = useState('Audit error');

  useEffect(() => {
    const controller = new AbortController();
    fetchStandards(controller.signal)
      .then((s) => {
        setActions(s.actions);
        setMeta(s.meta);
      })
      .catch((err) => {
        reportFailure(err, setErrorTitle, setError);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!equipmentIsComplete(equipment)) {
      setErrorTitle('Equipment parameters needed');
      setError('Enter all numeric equipment parameters to run the audit.');
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      runAudit({ procedure, equipment, steps }, controller.signal)
        .then((result) => {
          setAudit(result);
          setError(null);
        })
        .catch((err) => {
          reportFailure(err, setErrorTitle, setError);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [procedure, equipment, steps]);

  const loadSample = (sample) => {
    setActiveSample(sample.key);
    setProcedure(clone(sample.procedure));
    setEquipment(clone(sample.equipment));
    setSteps(clone(sample.steps));
  };

  const newProcedure = () => {
    setActiveSample(null);
    setProcedure({ id: 'SO-NEW', title: 'New switching procedure', workOrder: '', crewLead: '', issuedAt: '' });
    setEquipment(clone(BLANK_EQUIPMENT));
    setSteps([]);
  };

  const editSteps = (next) => {
    setActiveSample(null);
    setSteps(next);
  };

  const applyFix = useCallback((moveStepId, beforeStepId) => {
    setActiveSample(null);
    setSteps((current) => {
      const from = current.findIndex((s) => s.id === moveStepId);
      if (from === -1) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      const to = next.findIndex((s) => s.id === beforeStepId);
      if (to === -1) return current;
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const verdict = audit ? VERDICT_STYLES[audit.summary.verdict] : null;
  const arcFlash = audit?.calculations.arcFlash;

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-steel-700 bg-steel-950/95 backdrop-blur">
        <div className="bg-hazard-stripes h-1.5" />
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded bg-hazard-yellow text-steel-950">
              <Zap className="h-6 w-6" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-[0.2em] text-white">VoltGuard</h1>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                HV Switching &amp; Safety Auditor · NFPA 70E · OSHA 1910.269
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {audit && (
              <div className="hidden items-center gap-3 font-mono text-xs sm:flex">
                <span className="text-red-400">{audit.summary.counts.critical} CRIT</span>
                <span className="text-amber-300">{audit.summary.counts.warning} WARN</span>
                <span className="text-sky-300">{audit.summary.counts.info} INFO</span>
              </div>
            )}
            {verdict && (
              <span
                role="status"
                aria-label={`Audit verdict ${verdict.text}`}
                className={`flex items-center gap-1.5 rounded border-2 px-3 py-1 text-xs font-black tracking-widest ${verdict.className}`}
              >
                {audit.summary.verdict === 'HOLD' ? (
                  <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                ) : audit.summary.verdict === 'CONDITIONAL' ? (
                  <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                {verdict.text}
              </span>
            )}
            <span
              role="status"
              aria-live="polite"
              aria-label={loading ? 'Auditing procedure' : error ? 'Audit fault' : 'Live audit connection'}
              className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500"
            >
              {loading ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-hazard-yellow" aria-hidden="true" />
              ) : (
                <Activity className={`h-3.5 w-3.5 ${error ? 'text-red-500' : 'text-emerald-400'}`} aria-hidden="true" />
              )}
              {loading ? 'Auditing' : error ? 'Fault' : 'Live'}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-5">
        <div role="region" aria-label="Sample procedures" className="no-print flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Load sample procedure:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Load sample procedure ${s.label}`}
              aria-pressed={activeSample === s.key}
              onClick={() => loadSample(s)}
              className={`btn border focus-visible:ring-2 focus-visible:ring-hazard-yellow ${
                s.tone === 'critical'
                  ? 'border-red-500/60 text-red-200 hover:bg-red-950/60'
                  : 'border-emerald-500/60 text-emerald-200 hover:bg-emerald-950/60'
              } ${activeSample === s.key ? (s.tone === 'critical' ? 'bg-red-950/70' : 'bg-emerald-950/70') : 'bg-steel-850'}`}
            >
              {s.tone === 'critical' ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              {s.label}
            </button>
          ))}
          <button
            type="button"
            className="btn-ghost focus-visible:ring-2 focus-visible:ring-hazard-yellow"
            aria-label="Start a new switching procedure"
            onClick={newProcedure}
          >
            <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" /> New procedure
          </button>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="no-print flex items-start gap-3 rounded-lg border border-red-500 bg-red-950/50 px-4 py-3 text-sm text-red-100"
          >
            <ServerCrash className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
            <div>
              <p className="font-bold uppercase tracking-wide text-red-200">{errorTitle}</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        <div className="no-print grid gap-4 lg:grid-cols-12">
          <div role="region" aria-label="Switching sequence and hazards" className="space-y-4 lg:col-span-7">
            <HazardBanner audit={audit} onApplyFix={applyFix} />
            <SequenceEditor
              steps={steps}
              actions={actions}
              stepResults={audit?.sequence.steps}
              risks={audit?.risks}
              onChange={editSteps}
            />
          </div>
          <div role="region" aria-label="Arc flash risk and equipment" className="space-y-4 lg:col-span-5">
            <RiskGauge arcFlash={arcFlash} />
            <EquipmentPanel
              procedure={procedure}
              equipment={equipment}
              onProcedureChange={setProcedure}
              onEquipmentChange={setEquipment}
            />
          </div>
        </div>

        <div role="region" aria-label="Lockout tagout clearance">
          <LotoCard clearance={audit?.clearance} arcFlash={arcFlash} />
        </div>

        {meta && (
          <footer className="no-print border-t border-steel-800 pt-4 text-[11px] text-slate-500">
            <p className="font-semibold text-slate-400">{meta.name} v{meta.version}</p>
            <p>{meta.references.join(' · ')}</p>
            <p className="mt-1 text-amber-300/70">{meta.disclaimer}</p>
          </footer>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <Auditor />
    </ErrorBoundary>
  );
}
