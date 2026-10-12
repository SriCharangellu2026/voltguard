import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, Plus, Trash2 } from 'lucide-react';
import { PHASE_STYLES, SEVERITY_STYLES } from './severity.js';

export default function SequenceEditor({ steps, actions, stepResults, risks, onChange }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const resultById = Object.fromEntries((stepResults ?? []).map((r) => [r.stepId, r]));
  const risksByStep = {};
  (risks ?? []).forEach((r) => {
    if (!r.stepId) return;
    (risksByStep[r.stepId] ??= []).push(r);
  });
  const actionKeys = Object.keys(actions);

  const update = (index, patch) => {
    onChange(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const move = (from, to) => {
    if (to < 0 || to >= steps.length || from === to) return;
    const next = [...steps];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const remove = (index) => onChange(steps.filter((_, i) => i !== index));

  const add = () => {
    const id = `ST-${Date.now().toString(36).toUpperCase()}`;
    onChange([...steps, { id, action: actionKeys[0] ?? 'obtain_authorization', equipment: '', description: '' }]);
  };

  const reorderStep = (event, index) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(index, index - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(index, index + 1);
    }
  };

  return (
    <section className="panel" role="region" aria-label="Switching procedure sequence">
      <div className="panel-header">
        <h2 className="panel-title" id="sequence-heading">
          <ListOrdered className="h-4 w-4 text-hazard-yellow" aria-hidden="true" /> Switching Procedure Sequence
        </h2>
        <button
          type="button"
          className="btn-ghost focus-visible:ring-2 focus-visible:ring-hazard-yellow"
          onClick={add}
          disabled={!actionKeys.length}
          aria-label="Add switching step"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add step
        </button>
      </div>
      <p className="sr-only">Tab through each step. When a step number is focused, Arrow Up and Arrow Down reorder that step.</p>

      {steps.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-500">
          No steps yet. Load a sample procedure or add a step to begin.
        </p>
      ) : (
        <ol className="divide-y divide-steel-800" aria-labelledby="sequence-heading">
          {steps.map((step, index) => {
            const result = resultById[step.id];
            const status = result?.status ?? 'ok';
            const sev = SEVERITY_STYLES[status];
            const phase = result?.phase ?? actions[step.action]?.phase;
            const stepRisks = risksByStep[step.id] ?? [];
            return (
              <li
                key={step.id}
                role="group"
                aria-label={`Step ${index + 1}`}
                draggable
                onDragStart={(e) => {
                  setDragIndex(index);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(index);
                }}
                onDragLeave={() => setOverIndex((o) => (o === index ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) move(dragIndex, index);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={`relative flex gap-3 border-l-4 px-3 py-3 transition-colors ${sev.row} ${
                  overIndex === index && dragIndex !== index ? 'ring-1 ring-inset ring-hazard-yellow' : ''
                } ${dragIndex === index ? 'opacity-40' : ''}`}
              >
                <div className="flex flex-col items-center gap-1 pt-1">
                  <GripVertical className="h-4 w-4 cursor-grab text-slate-600" aria-hidden="true" />
                  <button
                    type="button"
                    className="rounded font-mono text-lg font-bold leading-none text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hazard-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-steel-950"
                    aria-label={`Step ${index + 1} of ${steps.length}. Press Arrow Up or Arrow Down to reorder.`}
                    onKeyDown={(event) => reorderStep(event, index)}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </button>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`badge ${sev.badge}`}>{sev.label}</span>
                    {phase && (
                      <span className={`badge border bg-transparent ${PHASE_STYLES[phase] ?? ''}`}>{phase}</span>
                    )}
                    <span className="font-mono text-[10px] text-slate-500">{step.id}</span>
                  </div>

                  <div className="grid gap-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                    <select
                      className="field-input focus-visible:ring-2 focus-visible:ring-hazard-yellow"
                      value={step.action}
                      onChange={(e) => update(index, { action: e.target.value })}
                      aria-label={`Step ${index + 1} action`}
                    >
                      {actionKeys.map((key) => (
                        <option key={key} value={key}>
                          {actions[key].label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="field-input font-mono focus-visible:ring-2 focus-visible:ring-hazard-yellow"
                      value={step.equipment}
                      placeholder="Device / equipment ID"
                      onChange={(e) => update(index, { equipment: e.target.value })}
                      aria-label={`Step ${index + 1} equipment`}
                    />
                  </div>
                  <textarea
                    className="field-input min-h-[2.25rem] resize-y focus-visible:ring-2 focus-visible:ring-hazard-yellow"
                    rows={1}
                    value={step.description}
                    placeholder="Step instructions"
                    onChange={(e) => update(index, { description: e.target.value })}
                    aria-label={`Step ${index + 1} description`}
                  />

                  {stepRisks.length > 0 && (
                    <ul className="space-y-1">
                      {stepRisks.map((r) => (
                        <li key={r.id} className={`flex gap-2 text-xs ${SEVERITY_STYLES[r.severity].text}`}>
                          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_STYLES[r.severity].dot}`} />
                          <span>
                            <span className="font-mono font-semibold">[{r.code}]</span> {r.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <button type="button" className="icon-btn focus-visible:ring-2 focus-visible:ring-hazard-yellow" onClick={() => move(index, index - 1)} disabled={index === 0} title="Move up" aria-label={`Move step ${index + 1} up`}>
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-btn focus-visible:ring-2 focus-visible:ring-hazard-yellow" onClick={() => move(index, index + 1)} disabled={index === steps.length - 1} title="Move down" aria-label={`Move step ${index + 1} down`}>
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" className="icon-btn hover:!border-red-500 hover:!text-red-400 focus-visible:ring-2 focus-visible:ring-hazard-yellow" onClick={() => remove(index)} title="Delete step" aria-label={`Delete step ${index + 1}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
