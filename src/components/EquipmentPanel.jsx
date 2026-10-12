import { Cable, ClipboardList } from 'lucide-react';

function NumberField({ label, unit, value, onChange, step = 'any', min }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="flex">
        <input
          type="number"
          className="field-input rounded-r-none font-mono focus-visible:ring-2 focus-visible:ring-hazard-yellow"
          value={value}
          step={step}
          min={min}
          aria-label={`${label} (${unit})`}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
        <span className="flex items-center rounded-r border border-l-0 border-steel-600 bg-steel-800 px-2 font-mono text-[11px] text-slate-400">
          {unit}
        </span>
      </div>
    </label>
  );
}

function TextField({ label, value, onChange, type = 'text', mono = false }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        type={type}
        aria-label={label}
        className={`field-input focus-visible:ring-2 focus-visible:ring-hazard-yellow ${mono ? 'font-mono' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function EquipmentPanel({ procedure, equipment, onProcedureChange, onEquipmentChange }) {
  const setP = (key) => (v) => onProcedureChange({ ...procedure, [key]: v });
  const setE = (key) => (v) => onEquipmentChange({ ...equipment, [key]: v });

  return (
    <section className="panel" role="region" aria-label="Work order and equipment">
      <div className="panel-header">
        <h2 className="panel-title">
          <ClipboardList className="h-4 w-4 text-hazard-yellow" /> Work Order &amp; Equipment
        </h2>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Procedure title" value={procedure.title} onChange={setP('title')} />
          </div>
          <TextField label="Switching order #" value={procedure.id} onChange={setP('id')} mono />
          <TextField label="Work order #" value={procedure.workOrder} onChange={setP('workOrder')} mono />
          <TextField label="Crew lead / person in charge" value={procedure.crewLead} onChange={setP('crewLead')} />
          <TextField label="Clearance issued" type="datetime-local" value={procedure.issuedAt} onChange={setP('issuedAt')} mono />
        </div>

        <div className="border-t border-steel-700 pt-4">
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
            <Cable className="h-3.5 w-3.5" /> Equipment &amp; fault parameters
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField label="Equipment" value={equipment.name} onChange={setE('name')} />
            </div>
            <NumberField label="System voltage (L-L)" unit="kV" value={equipment.systemVoltageKV} onChange={setE('systemVoltageKV')} min={0.05} />
            <NumberField label="Bolted fault current" unit="kA" value={equipment.boltedFaultKA} onChange={setE('boltedFaultKA')} min={0.1} />
            <NumberField label="Protective clearing time" unit="cyc" value={equipment.clearingTimeCycles} onChange={setE('clearingTimeCycles')} min={0.1} />
            <NumberField label="Working distance" unit="in" value={equipment.workingDistanceIn} onChange={setE('workingDistanceIn')} min={6} />
            <label className="block">
              <span className="field-label">System frequency</span>
              <select className="field-input font-mono focus-visible:ring-2 focus-visible:ring-hazard-yellow" aria-label="System frequency" value={equipment.frequencyHz} onChange={(e) => setE('frequencyHz')(Number(e.target.value))}>
                <option value={60}>60 Hz</option>
                <option value={50}>50 Hz</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Arc configuration</span>
              <select className="field-input focus-visible:ring-2 focus-visible:ring-hazard-yellow" aria-label="Arc configuration" value={equipment.enclosure} onChange={(e) => setE('enclosure')(e.target.value)}>
                <option value="open">Open air (outdoor bus / switchyard)</option>
                <option value="box">Enclosed (switchgear / MCC)</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
