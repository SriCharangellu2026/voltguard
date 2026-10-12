import { useEffect, useState } from 'react';
import { Check, Copy, Download, Fingerprint, Lock, Printer, ShieldCheck, ShieldX } from 'lucide-react';
import { verifyRecord } from '../api.js';
import { VERDICT_STYLES } from './severity.js';

const short = (h) => `${h.slice(0, 10)}…${h.slice(-6)}`;

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1 text-sm">
      <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 print:text-gray-600">{label}</dt>
      <dd className="text-slate-100 print:text-black">{children || '—'}</dd>
    </div>
  );
}

function PointList({ items, empty }) {
  if (!items.length) return <span className="text-red-400 print:text-red-700">{empty}</span>;
  return (
    <ul className="space-y-0.5 font-mono text-xs">
      {items.map((i) => (
        <li key={i}>■ {i}</li>
      ))}
    </ul>
  );
}

export default function LotoCard({ clearance, arcFlash }) {
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setVerification(null);
  }, [clearance?.sealHash]);

  if (!clearance || !arcFlash) return null;

  const verdict = VERDICT_STYLES[clearance.status];
  const { procedure, equipment } = clearance;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      setVerification(await verifyRecord(clearance));
    } catch (err) {
      setVerification({ valid: false, problems: [err.message] });
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = () => {
    const blob = new Blob(
      [JSON.stringify({ exportedBy: 'VoltGuard', clearance, arcFlash }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${clearance.clearanceId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`${clearance.verificationString} ${clearance.sealHash}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      id="loto-card"
      role="region"
      aria-label="Lockout tagout clearance card"
      className="panel overflow-hidden border-2 border-hazard-yellow/70 print:rounded-none print:border-black print:bg-white print:text-black"
    >
      <div className="bg-hazard-stripes h-3 print:h-2" />

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-steel-700 px-5 py-4 print:border-black">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.25em] text-hazard-yellow print:text-black">
            <Lock className="h-4 w-4" /> Lockout / Tagout Clearance Card
          </p>
          <h2 className="mt-1 text-xl font-black text-white print:text-black">{procedure.title}</h2>
          <p className="font-mono text-xs text-slate-400 print:text-gray-700">
            {clearance.clearanceId} · Switching order {procedure.id}
            {procedure.workOrder && ` · ${procedure.workOrder}`}
          </p>
        </div>
        <div
          className={`-rotate-6 rounded border-4 border-double px-4 py-2 text-center font-black uppercase tracking-widest ${verdict.className} ${verdict.print}`}
        >
          <p className="text-2xl leading-none">{verdict.text}</p>
          <p className="mt-1 text-[9px] tracking-[0.2em]">VoltGuard audit</p>
        </div>
      </header>

      <div className="grid gap-x-6 px-5 py-4 md:grid-cols-2">
        <dl>
          <Row label="Equipment">{equipment.name}</Row>
          <Row label="Nominal voltage">{equipment.systemVoltageKV} kV AC, {equipment.frequencyHz} Hz</Row>
          <Row label="Person in charge">{procedure.crewLead}</Row>
          <Row label="Issued">{procedure.issuedAt ? procedure.issuedAt.replace('T', ' ') : ''}</Row>
          <Row label="Isolation points">
            <PointList items={clearance.isolationPoints} empty="NONE - no isolating device opened" />
          </Row>
          <Row label="Locks / tags">
            <PointList items={clearance.lockPoints} empty="NONE - no LOTO applied" />
          </Row>
          <Row label="Protective grounds">
            <PointList items={clearance.groundPoints} empty="NONE - no grounds installed" />
          </Row>
        </dl>
        <dl>
          <Row label="Incident energy">
            <span className="font-mono font-bold" style={{ color: arcFlash.ppe.color }}>
              {arcFlash.incidentEnergyCal} cal/cm²
            </span>{' '}
            @ {arcFlash.inputs.workingDistanceIn} in
          </Row>
          <Row label="PPE required">
            <span className="font-bold">{arcFlash.ppe.label}</span>
            {arcFlash.ppe.minArcRatingCal > 0 && ` (≥ ${arcFlash.ppe.minArcRatingCal} cal/cm²)`}
          </Row>
          <Row label="Arc flash boundary">{arcFlash.arcFlashBoundary.display} ({arcFlash.arcFlashBoundary.m} m)</Row>
          <Row label="Limited approach">{arcFlash.shockBoundaries.limitedMovable.display}</Row>
          <Row label="Restricted approach">{arcFlash.shockBoundaries.restricted.display}</Row>
          <Row label="Shock protection">
            {arcFlash.gloves.class ? `Class ${arcFlash.gloves.class} rubber gloves` : 'Live-line tools (hot sticks)'}
          </Row>
          <Row label="Clearance status">
            <span className="text-xs">{clearance.statusText}</span>
          </Row>
        </dl>
      </div>

      <div className="border-t border-steel-700 px-5 py-4 print:border-black">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 print:text-gray-700">
          <Fingerprint className="h-3.5 w-3.5" /> SHA-256 hash chain ({clearance.chain.length} links)
        </p>
        <ol className="max-h-56 space-y-0.5 overflow-y-auto font-mono text-[11px] print:max-h-none print:overflow-visible">
          <li className="flex justify-between gap-2 text-slate-500 print:text-gray-600">
            <span>00 GENESIS</span>
            <span>{short(clearance.genesisHash)}</span>
          </li>
          {clearance.chain.map((link) => (
            <li key={link.hash} className="flex justify-between gap-2">
              <span className="truncate text-slate-300 print:text-black">
                {String(link.seq).padStart(2, '0')} {link.label}
                {link.equipment && ` · ${link.equipment}`}
                {link.status !== 'ok' && (
                  <span className={link.status === 'critical' ? 'text-red-400 print:text-red-700' : 'text-amber-300 print:text-amber-700'}>
                    {' '}[{link.status.toUpperCase()}]
                  </span>
                )}
              </span>
              <span className="shrink-0 text-slate-500 print:text-gray-600">{short(link.hash)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-dashed border-hazard-yellow/50 bg-steel-950/80 px-5 py-4 print:border-black print:bg-white">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-double border-hazard-yellow text-hazard-yellow print:border-black print:text-black">
            <Fingerprint className="h-8 w-8" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 print:text-gray-600">Digital verification stamp</p>
            <p className="font-mono text-xl font-black tracking-wider text-hazard-yellow print:text-black">{clearance.verificationString}</p>
            <p className="break-all font-mono text-[10px] text-slate-500 print:text-gray-700">SEAL {clearance.sealHash}</p>
          </div>
        </div>

        <div className="no-print flex flex-wrap gap-2">
          <button type="button" className="btn-ghost focus-visible:ring-2 focus-visible:ring-hazard-yellow" aria-label="Copy verification stamp" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />} Copy
          </button>
          <button type="button" className="btn-ghost focus-visible:ring-2 focus-visible:ring-hazard-yellow" aria-label="Verify hash chain" onClick={handleVerify} disabled={verifying}>
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {verifying ? 'Verifying…' : 'Verify chain'}
          </button>
          <button type="button" className="btn-ghost focus-visible:ring-2 focus-visible:ring-hazard-yellow" aria-label="Export clearance JSON" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export JSON
          </button>
          <button type="button" className="btn-primary focus-visible:ring-2 focus-visible:ring-hazard-yellow" aria-label="Print lockout tagout card" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" aria-hidden="true" /> Print card
          </button>
        </div>
      </div>

      {verification && (
        <div
          className={`no-print flex items-start gap-2 border-t px-5 py-3 text-xs ${
            verification.valid ? 'border-emerald-600/50 bg-emerald-950/40 text-emerald-300' : 'border-red-600/50 bg-red-950/40 text-red-300'
          }`}
        >
          {verification.valid ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <ShieldX className="h-4 w-4 shrink-0" />}
          <span>
            {verification.valid
              ? `Chain intact - all ${clearance.chain.length} links and the seal recomputed server-side match ${verification.verificationString}.`
              : `Verification failed: ${verification.problems.join('; ')}`}
          </span>
        </div>
      )}

      <div className="hidden px-5 pb-5 pt-2 print:block">
        <div className="grid grid-cols-3 gap-6 pt-8 text-[10px] uppercase tracking-widest text-gray-600">
          <div className="border-t border-black pt-1">Person in charge signature</div>
          <div className="border-t border-black pt-1">System operator</div>
          <div className="border-t border-black pt-1">Date / time released</div>
        </div>
      </div>
    </section>
  );
}
