import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  runAudit,
  verifyClearanceRecord,
  getPublicStandards,
  ValidationError,
} from './lib/safetyEngine.js';

const HOST = '0.0.0.0';
const PORT = Number(process.env.PORT) || 8787;

function finiteNumber(value) {
  if (typeof value === 'string' && value.trim() !== '') return Number(value.trim());
  return value;
}

/** Reject unsafe audit payloads before they reach the calculation engine. */
function sanitizeAuditRequest(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Audit request must be a JSON object');
  }

  const equipment = body.equipment;
  if (equipment === null || typeof equipment !== 'object' || Array.isArray(equipment)) {
    throw new ValidationError('Equipment parameters are required', ['equipment must be an object']);
  }

  const voltage = finiteNumber(equipment.systemVoltageKV);
  if (typeof voltage !== 'number' || !Number.isFinite(voltage)) {
    throw new ValidationError('Invalid equipment parameters', ['systemVoltageKV must be a finite number']);
  }
  if (voltage < 0) {
    throw new ValidationError('Negative voltages are not allowed', ['systemVoltageKV cannot be negative']);
  }

  const workingDistance = finiteNumber(equipment.workingDistanceIn);
  if (typeof workingDistance !== 'number' || !Number.isFinite(workingDistance)) {
    throw new ValidationError('Invalid equipment parameters', ['workingDistanceIn must be a finite number']);
  }
  if (workingDistance <= 0) {
    throw new ValidationError('Working distance cannot be zero', ['workingDistanceIn must be greater than zero']);
  }

  if (!Array.isArray(body.steps)) {
    throw new ValidationError('Steps must be an array', ['steps must be an array of switching operations']);
  }

  return body;
}

const app = express();
app.disable('x-powered-by');
// One proxy hop (App Runner) so client IPs are real and X-Forwarded-For is accepted.
app.set('trust proxy', 1);
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. VoltGuard allows 100 requests per 15 minutes.' },
}));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'voltguard-api', time: new Date().toISOString() });
});

app.get('/api/standards', (_req, res) => {
  res.json(getPublicStandards());
});

app.post('/api/audit', (req, res, next) => {
  try {
    res.json(runAudit(sanitizeAuditRequest(req.body)));
  } catch (err) {
    next(err);
  }
});

app.post('/api/verify', (req, res, next) => {
  try {
    res.json(verifyClearanceRecord(req.body?.record ?? req.body));
  } catch (err) {
    next(err);
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
} else if (process.env.NODE_ENV === 'production') {
  console.error('Production client build is missing. Run npm run build before npm start.');
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, details: err.details });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, HOST, () => {
  console.log(`VoltGuard API listening on http://${HOST}:${PORT}`);
});
