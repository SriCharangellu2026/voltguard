import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const standards = JSON.parse(
  readFileSync(new URL('../standards/nfpa70e.json', import.meta.url), 'utf8'),
);

const SEVERITY_RANK = { critical: 3, warning: 2, info: 1, ok: 0 };
const ENGINE_VERSION = 'VG-ENGINE-1.0';

export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/* ------------------------------------------------------------------ */
/* Utilities                                                           */
/* ------------------------------------------------------------------ */

export function sha256(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Stable JSON serialization with sorted keys so hashes are deterministic. */
export function canonicalize(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
  return JSON.stringify(value);
}

const round = (n, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const mmToIn = (mm) => mm / 25.4;
const mmToFt = (mm) => mm / 304.8;
const mToFt = (m) => m * 3.28084;

function formatFtIn(feet) {
  const totalIn = Math.round(feet * 12);
  return `${Math.floor(totalIn / 12)} ft ${totalIn % 12} in`;
}

function conditionHolds(state, cond) {
  if ('eq' in cond) return state[cond.field] === cond.eq;
  if ('ne' in cond) return state[cond.field] !== cond.ne;
  return true;
}

function effectsSatisfy(effects, cond) {
  if (!(cond.field in effects)) return false;
  if ('eq' in cond) return effects[cond.field] === cond.eq;
  if ('ne' in cond) return effects[cond.field] !== cond.ne;
  return false;
}

/* ------------------------------------------------------------------ */
/* Input normalization                                                 */
/* ------------------------------------------------------------------ */

function toNumber(value, field, errors, { min = -Infinity, max = Infinity } = {}) {
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    errors.push(`${field} must be a finite number`);
    return NaN;
  }
  if (n < min || n > max) errors.push(`${field} must be between ${min} and ${max}`);
  return n;
}

export function normalizeEquipment(raw = {}) {
  const errors = [];
  const equipment = {
    name: String(raw.name ?? 'Unnamed equipment').slice(0, 120),
    systemVoltageKV: toNumber(raw.systemVoltageKV, 'systemVoltageKV', errors, { min: 0.05, max: 800 }),
    boltedFaultKA: toNumber(raw.boltedFaultKA, 'boltedFaultKA', errors, { min: 0.1, max: 200 }),
    clearingTimeCycles: toNumber(raw.clearingTimeCycles, 'clearingTimeCycles', errors, { min: 0.1, max: 600 }),
    frequencyHz: toNumber(raw.frequencyHz ?? 60, 'frequencyHz', errors, { min: 50, max: 60 }),
    workingDistanceIn: toNumber(raw.workingDistanceIn, 'workingDistanceIn', errors, { min: 6, max: 600 }),
    enclosure: raw.enclosure === 'box' ? 'box' : 'open',
  };
  if (errors.length) throw new ValidationError('Invalid equipment parameters', errors);
  return equipment;
}

export function normalizeSteps(raw) {
  if (!Array.isArray(raw)) throw new ValidationError('steps must be an array');
  if (raw.length > 200) throw new ValidationError('A procedure may contain at most 200 steps');
  const actions = standards.switching.actions;
  const errors = [];
  const steps = raw.map((s, i) => {
    const action = String(s?.action ?? '');
    if (!actions[action]) errors.push(`steps[${i}].action "${action}" is not a recognized switching action`);
    return {
      id: String(s?.id ?? `step-${i + 1}`).slice(0, 64),
      action,
      equipment: String(s?.equipment ?? '').slice(0, 120),
      description: String(s?.description ?? '').slice(0, 400),
    };
  });
  if (errors.length) throw new ValidationError('Invalid switching steps', errors);
  return steps;
}

function normalizeProcedure(raw = {}) {
  return {
    id: String(raw.id ?? 'PROC-UNSPECIFIED').slice(0, 64),
    title: String(raw.title ?? 'Untitled switching procedure').slice(0, 160),
    workOrder: String(raw.workOrder ?? '').slice(0, 64),
    crewLead: String(raw.crewLead ?? '').slice(0, 80),
    issuedAt: String(raw.issuedAt ?? '').slice(0, 40),
  };
}

/* ------------------------------------------------------------------ */
/* 1. Sequential interlock validator                                   */
/* ------------------------------------------------------------------ */

export function validateSequence(steps) {
  const { initialState, actions, endStateHazards } = standards.switching;
  let state = { ...initialState };
  const findings = [];
  const stepResults = [];

  steps.forEach((step, index) => {
    const def = actions[step.action];
    const before = { ...state };
    const stepFindings = [];

    for (const req of def.requires) {
      if (conditionHolds(state, req.when)) continue;

      // Look ahead: a later step that would have satisfied this precondition
      // means the operations are inverted rather than missing.
      const laterIndex = steps.findIndex(
        (s, j) => j > index && effectsSatisfy(actions[s.action].effects, req.when),
      );
      const inversion = laterIndex !== -1
        ? {
            moveStepId: steps[laterIndex].id,
            moveStepNumber: laterIndex + 1,
            beforeStepId: step.id,
            beforeStepNumber: index + 1,
            suggestion: `Move step ${laterIndex + 1} ("${actions[steps[laterIndex].action].label}") before step ${index + 1} ("${def.label}").`,
          }
        : null;

      const finding = {
        id: `${req.id}@${step.id}`,
        ruleId: req.id,
        source: 'sequence',
        severity: req.severity,
        code: req.code,
        title: inversion ? 'Sequence inversion' : 'Missing prerequisite',
        message: req.message,
        remedy: inversion ? `${req.remedy} ${inversion.suggestion}` : req.remedy,
        stepId: step.id,
        stepNumber: index + 1,
        action: step.action,
        inversion,
      };
      stepFindings.push(finding);
      findings.push(finding);
    }

    state = { ...state, ...def.effects };
    const worst = stepFindings.reduce(
      (acc, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc),
      'ok',
    );
    stepResults.push({
      stepId: step.id,
      stepNumber: index + 1,
      action: step.action,
      label: def.label,
      phase: def.phase,
      status: worst,
      stateBefore: before,
      stateAfter: { ...state },
      findingIds: stepFindings.map((f) => f.id),
    });
  });

  const presentActions = new Set(steps.map((s) => s.action));
  if (steps.length > 0) {
    for (const hazard of endStateHazards) {
      if (hazard.onlyIfAction && !presentActions.has(hazard.onlyIfAction)) continue;
      if (!conditionHolds(state, hazard.if)) continue;
      findings.push({
        id: `${hazard.id}@end`,
        ruleId: hazard.id,
        source: 'sequence',
        severity: hazard.severity,
        code: hazard.code,
        title: 'End-state hazard',
        message: hazard.message,
        remedy: hazard.remedy,
        stepId: null,
        stepNumber: null,
        action: null,
        inversion: null,
      });
    }
  }

  const counts = { critical: 0, warning: 0, info: 0 };
  findings.forEach((f) => { counts[f.severity] += 1; });

  return {
    findings,
    steps: stepResults,
    finalState: state,
    counts,
    inversions: findings.filter((f) => f.inversion).length,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Arc flash calculator                                             */
/* ------------------------------------------------------------------ */

function doughty(method, distanceIn, timeS, faultKA) {
  const [a, b, c] = method.poly;
  const poly = a * faultKA ** 2 + b * faultKA + c;
  const energy = method.k * distanceIn ** -method.exponent * timeS * poly;
  const threshold = standards.arcFlash.arcFlashBoundaryThresholdCal;
  const boundaryIn = ((method.k * timeS * poly) / threshold) ** (1 / method.exponent);
  return { energy, boundaryMm: boundaryIn * 25.4 };
}

function lee(kv, faultKA, timeS, distanceMm) {
  const { constantCal } = standards.arcFlash.methods.lee;
  const threshold = standards.arcFlash.arcFlashBoundaryThresholdCal;
  const energy = (constantCal * kv * faultKA * timeS) / distanceMm ** 2;
  const boundaryMm = Math.sqrt((constantCal * kv * faultKA * timeS) / threshold);
  return { energy, boundaryMm };
}

export function selectPPE(incidentEnergyCal) {
  const category = standards.ppeCategories.find((c) => incidentEnergyCal <= c.maxCal);
  if (category) {
    return {
      category: category.category,
      label: category.label,
      minArcRatingCal: category.category === 0 ? 0 : Math.max(category.minArcRatingCal, Math.ceil(incidentEnergyCal)),
      color: category.color,
      items: category.items,
      energizedWorkPermitted: true,
    };
  }
  const d = standards.dangerLevel;
  return {
    category: 'DANGER',
    label: d.label,
    minArcRatingCal: Math.ceil(incidentEnergyCal),
    color: d.color,
    items: d.items,
    energizedWorkPermitted: false,
  };
}

export function lookupApproachBoundaries(kv) {
  const ranges = standards.approachBoundaries.ranges;
  // Voltages that fall in a gap of the table round up to the next tabulated range.
  const range = ranges.find((r) => kv <= r.maxKV) ?? ranges[ranges.length - 1];
  const fmt = (m) => ({ m, ft: round(mToFt(m), 2), display: formatFtIn(mToFt(m)) });
  return {
    source: standards.approachBoundaries.source,
    range: range.label,
    limitedMovable: fmt(range.limitedMovableM),
    limitedFixed: fmt(range.limitedFixedM),
    restricted: range.restrictedM > 0 ? fmt(range.restrictedM) : { m: 0, ft: 0, display: range.restrictedNote ?? 'Avoid contact' },
  };
}

export function selectInsulatingGloves(kv) {
  const { classes, aboveMaxNote, source } = standards.insulatingGloves;
  const cls = classes.find((c) => kv <= c.maxUseKV);
  if (!cls) return { source, class: null, liveLineToolsRequired: true, note: aboveMaxNote };
  return {
    source,
    class: cls.class,
    maxUseKV: cls.maxUseKV,
    color: cls.color,
    liveLineToolsRequired: false,
    note: `ASTM D120 Class ${cls.class} (${cls.color} label) rubber insulating gloves with leather protectors, rated to ${cls.maxUseKV} kV AC max use.`,
  };
}

export function calculateArcFlash(equipment) {
  const {
    systemVoltageKV: kv,
    boltedFaultKA: faultKA,
    clearingTimeCycles,
    frequencyHz,
    workingDistanceIn,
    enclosure,
  } = equipment;
  const warnings = [];
  const { methods, maxClearingTimeCapS } = standards.arcFlash;

  const clearingTimeS = clearingTimeCycles / frequencyHz;
  if (clearingTimeS > maxClearingTimeCapS) {
    warnings.push(
      `Clearing time ${round(clearingTimeS, 3)} s exceeds ${maxClearingTimeCapS} s. IEEE 1584 permits a 2 s cap only where the worker can readily egress; no cap has been applied.`,
    );
  }

  const distanceMm = workingDistanceIn * 25.4;
  let methodKey = 'lee';
  let result;

  if (kv <= 0.6) {
    const m = enclosure === 'box' ? methods.doughtyBox : methods.doughtyOpenAir;
    const v = m.validity;
    const inRange = faultKA >= v.minKA && faultKA <= v.maxKA && workingDistanceIn >= v.minDistanceIn;
    if (inRange) {
      methodKey = enclosure === 'box' ? 'doughtyBox' : 'doughtyOpenAir';
      result = doughty(m, workingDistanceIn, clearingTimeS, faultKA);
    } else {
      warnings.push(
        `Doughty-Neal method valid only for ${v.minKA}-${v.maxKA} kA and >= ${v.minDistanceIn} in; falling back to the (highly conservative) Lee method.`,
      );
    }
  }
  if (!result) {
    result = lee(kv, faultKA, clearingTimeS, distanceMm);
    if (kv > 0.6 && enclosure === 'box') {
      warnings.push('Lee method models an open-air arc; arcs in enclosed medium-voltage switchgear can focus energy toward the opening. Verify against an IEEE 1584 study.');
    }
  }

  const incidentEnergyCal = round(result.energy, 2);
  const ppe = selectPPE(incidentEnergyCal);
  const boundaryMm = result.boundaryMm;

  if (!ppe.energizedWorkPermitted) {
    warnings.push('Incident energy exceeds 40 cal/cm². Switching must be performed remotely or from outside the arc flash boundary.');
  }

  const shock = lookupApproachBoundaries(kv);
  const arcBoundaryM = boundaryMm / 1000;
  if (arcBoundaryM > shock.limitedMovable.m) {
    warnings.push('Arc flash boundary extends beyond the limited approach boundary - the arc flash boundary governs unqualified-person exclusion.');
  }
  if (workingDistanceIn * 0.0254 < shock.restricted.m) {
    warnings.push('Working distance is inside the restricted approach boundary - shock protection and an energized work permit are required.');
  }

  return {
    method: methodKey,
    methodName: methods[methodKey].name,
    formula: methods[methodKey].formula,
    inputs: {
      systemVoltageKV: kv,
      boltedFaultKA: faultKA,
      clearingTimeCycles,
      clearingTimeS: round(clearingTimeS, 4),
      frequencyHz,
      workingDistanceIn,
      workingDistanceMm: round(distanceMm, 1),
      enclosure,
    },
    incidentEnergyCal,
    incidentEnergyJ: round(incidentEnergyCal * 4.184, 2),
    arcFlashBoundary: {
      mm: round(boundaryMm, 0),
      m: round(arcBoundaryM, 2),
      in: round(mmToIn(boundaryMm), 1),
      ft: round(mmToFt(boundaryMm), 2),
      display: formatFtIn(mmToFt(boundaryMm)),
    },
    ppe,
    shockBoundaries: shock,
    gloves: selectInsulatingGloves(kv),
    warnings,
  };
}

function arcFlashFindings(arc) {
  const out = [];
  if (!arc.ppe.energizedWorkPermitted) {
    out.push({
      id: 'ARC-EXCEEDS-CAT4@equipment',
      ruleId: 'ARC-EXCEEDS-CAT4',
      source: 'arc-flash',
      severity: 'critical',
      code: 'NFPA 70E 130.5 / 130.7(C)(15)',
      title: 'Incident energy exceeds PPE Category 4',
      message: `Estimated incident energy ${arc.incidentEnergyCal} cal/cm² exceeds 40 cal/cm². No PPE category is adequate for local operation.`,
      remedy: 'Operate devices remotely, reduce clearing time (maintenance mode / arc flash relay), or increase working distance.',
    });
  } else if (arc.ppe.category >= 3) {
    out.push({
      id: 'ARC-HIGH-ENERGY@equipment',
      ruleId: 'ARC-HIGH-ENERGY',
      source: 'arc-flash',
      severity: 'warning',
      code: 'NFPA 70E 130.5(G)',
      title: `High incident energy - ${arc.ppe.label}`,
      message: `Estimated ${arc.incidentEnergyCal} cal/cm² at ${arc.inputs.workingDistanceIn} in. Arc flash suit (min. ${arc.ppe.minArcRatingCal} cal/cm²) required for local switching.`,
      remedy: 'Consider remote operation or hot-stick operation from outside the arc flash boundary.',
    });
  }
  if (arc.gloves.liveLineToolsRequired) {
    out.push({
      id: 'SHOCK-LIVE-LINE-TOOLS@equipment',
      ruleId: 'SHOCK-LIVE-LINE-TOOLS',
      source: 'shock',
      severity: 'info',
      code: 'OSHA 1910.269(l) / Table R-6',
      title: 'Live-line tools required',
      message: arc.gloves.note,
      remedy: `Maintain the restricted approach boundary of ${arc.shockBoundaries.restricted.display} from exposed energized parts.`,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 3. LOTO clearance record with SHA-256 hash chain                    */
/* ------------------------------------------------------------------ */

function verificationStringFromSeal(seal) {
  const groups = seal.slice(0, 20).toUpperCase().match(/.{4}/g);
  return `VG1-${groups.join('-')}`;
}

function genesisPayload(procedure, equipment) {
  return {
    type: 'VOLTGUARD-LOTO-GENESIS',
    engine: ENGINE_VERSION,
    playbook: standards.meta.version,
    procedureId: procedure.id,
    workOrder: procedure.workOrder,
    equipment: equipment.name,
  };
}

function linkHash(prevHash, payload) {
  return sha256(`${prevHash}|${canonicalize(payload)}`);
}

export function buildClearanceRecord({ procedure, equipment, steps, sequence, arcFlash }) {
  const genesis = genesisPayload(procedure, equipment);
  const genesisHash = sha256(canonicalize(genesis));

  let prevHash = genesisHash;
  const chain = steps.map((step, i) => {
    const result = sequence.steps[i];
    const payload = {
      seq: i + 1,
      stepId: step.id,
      action: step.action,
      equipment: step.equipment,
      description: step.description,
      status: result.status,
    };
    const hash = linkHash(prevHash, payload);
    const link = { ...payload, label: result.label, prevHash, hash };
    prevHash = hash;
    return link;
  });
  const chainHead = prevHash;

  const pick = (action) => steps.filter((s) => s.action === action).map((s) => s.equipment || s.description);
  const isolationPoints = [...new Set([...pick('open_breaker'), ...pick('open_disconnect'), ...pick('rack_out_breaker')])];
  const lockPoints = [...new Set(pick('apply_loto'))];
  const groundPoints = [...new Set(pick('apply_grounds'))];

  const blocking = sequence.counts.critical > 0 || !arcFlash.ppe.energizedWorkPermitted;
  const status = blocking ? 'HOLD' : sequence.counts.warning > 0 ? 'CONDITIONAL' : 'CLEARED';

  const sealPayload = {
    type: 'VOLTGUARD-LOTO-SEAL',
    engine: ENGINE_VERSION,
    genesisHash,
    chainHead,
    stepCount: chain.length,
    procedure,
    equipment,
    incidentEnergyCal: arcFlash.incidentEnergyCal,
    ppeCategory: arcFlash.ppe.category,
    arcFlashBoundaryMm: arcFlash.arcFlashBoundary.mm,
    isolationPoints,
    lockPoints,
    groundPoints,
    findings: { critical: sequence.counts.critical, warning: sequence.counts.warning, info: sequence.counts.info },
    status,
  };
  const sealHash = sha256(canonicalize(sealPayload));

  return {
    clearanceId: `LOTO-${sealHash.slice(0, 8).toUpperCase()}`,
    status,
    statusText: {
      HOLD: 'HOLD - DO NOT ISSUE CLEARANCE. Critical hazards must be resolved.',
      CONDITIONAL: 'CONDITIONAL - Clearance may be issued after supervisor review of warnings.',
      CLEARED: 'CLEARED - Procedure satisfies the switching playbook.',
    }[status],
    procedure,
    equipment,
    isolationPoints,
    lockPoints,
    groundPoints,
    algorithm: 'SHA-256 hash chain: h0 = H(canonical(genesis)); hn = H(h(n-1) | canonical(step n)); seal = H(canonical(sealPayload))',
    genesis,
    genesisHash,
    chain,
    chainHead,
    sealPayload,
    sealHash,
    verificationString: verificationStringFromSeal(sealHash),
  };
}

/** Recomputes every link and the seal; reports the first point of tampering. */
export function verifyClearanceRecord(record) {
  if (!record || typeof record !== 'object' || !Array.isArray(record.chain)) {
    throw new ValidationError('record must be a VoltGuard clearance record with a chain array');
  }
  const problems = [];
  const genesisHash = sha256(canonicalize(record.genesis));
  if (genesisHash !== record.genesisHash) problems.push('Genesis block hash mismatch');

  let prev = record.genesisHash;
  let brokenAt = null;
  record.chain.forEach((link, i) => {
    const payload = {
      seq: link.seq,
      stepId: link.stepId,
      action: link.action,
      equipment: link.equipment,
      description: link.description,
      status: link.status,
    };
    const problem = link.prevHash !== prev
      ? `Chain link ${i + 1} does not reference the previous link`
      : link.hash !== linkHash(link.prevHash, payload)
        ? `Chain link ${i + 1} content does not match its hash`
        : null;
    if (problem) {
      if (brokenAt === null) brokenAt = i + 1;
      problems.push(problem);
    }
    prev = link.hash;
  });

  if (record.sealPayload?.chainHead !== prev) problems.push('Seal does not reference the recomputed chain head');
  const sealHash = sha256(canonicalize(record.sealPayload));
  if (sealHash !== record.sealHash) problems.push('Seal hash mismatch');
  if (verificationStringFromSeal(sealHash) !== record.verificationString) problems.push('Verification string mismatch');

  return {
    valid: problems.length === 0,
    brokenAt,
    problems,
    recomputedSeal: sealHash,
    verificationString: verificationStringFromSeal(sealHash),
  };
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

export function runAudit(payload = {}) {
  const procedure = normalizeProcedure(payload.procedure);
  const equipment = normalizeEquipment(payload.equipment);
  const steps = normalizeSteps(payload.steps ?? []);

  const sequence = validateSequence(steps);
  const arcFlash = calculateArcFlash(equipment);
  const risks = [...sequence.findings, ...arcFlashFindings(arcFlash)].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      || (a.stepNumber ?? Infinity) - (b.stepNumber ?? Infinity),
  );
  const clearance = buildClearanceRecord({ procedure, equipment, steps, sequence, arcFlash });

  const counts = { critical: 0, warning: 0, info: 0 };
  risks.forEach((r) => { counts[r.severity] += 1; });

  return {
    engine: ENGINE_VERSION,
    playbook: standards.meta.version,
    disclaimer: standards.meta.disclaimer,
    summary: {
      verdict: clearance.status,
      counts,
      inversions: sequence.inversions,
      stepCount: steps.length,
    },
    risks,
    sequence: { steps: sequence.steps, finalState: sequence.finalState },
    calculations: { arcFlash },
    clearance,
  };
}

export function getPublicStandards() {
  const actions = Object.fromEntries(
    Object.entries(standards.switching.actions).map(([key, a]) => [key, { label: a.label, phase: a.phase }]),
  );
  return {
    meta: standards.meta,
    ppeCategories: standards.ppeCategories,
    dangerLevel: standards.dangerLevel,
    approachBoundaries: standards.approachBoundaries,
    insulatingGloves: standards.insulatingGloves,
    arcFlash: standards.arcFlash,
    actions,
  };
}
