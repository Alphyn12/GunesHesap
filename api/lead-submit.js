import { createHmac, randomUUID } from 'node:crypto';

// ─── Sabitler ──────────────────────────────────────────────────────────────────
const CONSENT_VERSION = '2026-05-v1';

// ─── Saf fonksiyonlar (test edilebilirlik için export) ─────────────────────────

export function systemTypeToEnum(scenarioKey) {
  if (scenarioKey === 'off-grid' || scenarioKey === 'mobile-offgrid') return 'off_grid';
  return 'on_grid';
}

export function buildAdminPayload(formData) {
  const {
    firstName = '',
    lastName = '',
    phone,
    email,
    address,
    consentMarketing,
    consentThirdParty,
    proposalSnapshot,
  } = formData;

  const fullName = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
  const province = String(proposalSnapshot?.cityName || '').trim() || 'Belirtilmedi';
  const systemType = systemTypeToEnum(proposalSnapshot?.scenarioKey);

  const payload = {
    requestId: randomUUID(),
    fullName,
    province,
    systemType,
    source: 'solar-rota-main-site',
    formSource: 'quote-form',
    consent: {
      kvkkAccepted: true,
      explicitConsentAccepted: true,
      marketingConsent: !!consentMarketing,
      transferPermissionToEpc: !!consentThirdParty,
      consentTextVersion: CONSENT_VERSION,
      explicitConsentTextVersion: CONSENT_VERSION,
      privacyPolicyVersion: CONSENT_VERSION,
      acceptedAt: new Date().toISOString(),
    },
  };

  if (email) payload.email = String(email).trim();
  if (phone) payload.phone = String(phone).trim();
  if (address) payload.district = String(address).trim().slice(0, 500);

  const ps = proposalSnapshot;

  // calculationResult
  const cr = {};
  if (ps?.annualEnergy != null && isFinite(ps.annualEnergy)) cr.estimatedAnnualProductionKwh = Number(ps.annualEnergy);
  if (ps?.systemPower != null && isFinite(ps.systemPower)) cr.estimatedKwp = Number(ps.systemPower);
  if (ps?.totalCost != null && isFinite(ps.totalCost)) cr.estimatedInvestmentAmount = Number(ps.totalCost);
  if (Object.keys(cr).length > 0) payload.calculationResult = cr;

  // roof
  const roof = {};
  if (ps?.roofArea != null && isFinite(ps.roofArea) && ps.roofArea > 0) roof.areaM2 = Number(ps.roofArea);
  if (ps?.tilt != null && isFinite(ps.tilt)) roof.tiltDegrees = Number(ps.tilt);
  if (ps?.azimuthName) roof.direction = String(ps.azimuthName).slice(0, 500);
  if (Object.keys(roof).length > 0) payload.roof = roof;

  // equipmentPreferences
  const eq = {};
  if (ps?.panelType) eq.panel = String(ps.panelType).slice(0, 500);
  if (ps?.inverterType) eq.inverter = String(ps.inverterType).slice(0, 500);
  if (Object.keys(eq).length > 0) payload.equipmentPreferences = eq;

  // consumption
  const cons = {};
  if (ps?.annualConsumptionKwh != null && isFinite(ps.annualConsumptionKwh)) cons.annualConsumptionKwh = Number(ps.annualConsumptionKwh);
  if (ps?.monthlyBillAmount != null && isFinite(ps.monthlyBillAmount)) cons.monthlyBillAmount = Number(ps.monthlyBillAmount);
  if (Object.keys(cons).length > 0) payload.consumption = cons;

  // expertModules
  if (ps?.expertModules && typeof ps.expertModules === 'object') {
    payload.expertModules = {
      evCharging: !!ps.expertModules.evCharging,
      heatingCooling: !!ps.expertModules.heatingCooling,
      batteryBackup: !!ps.expertModules.batteryBackup,
      generatorIntegration: !!ps.expertModules.generatorIntegration,
    };
  }

  if (ps?.designMode) payload.designMode = String(ps.designMode).slice(0, 500);

  return payload;
}

export function createSignature(secret, timestamp, bodyString) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${bodyString}`, 'utf8')
    .digest('hex');
}

// ─── Vercel Serverless Function handler ────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const adminEndpoint = process.env.ADMIN_LEAD_ENDPOINT;
  const secret = process.env.LEAD_INGEST_SECRET;

  if (!adminEndpoint || !secret) {
    console.error('[lead-submit] ADMIN_LEAD_ENDPOINT veya LEAD_INGEST_SECRET yapılandırılmamış');
    return res.status(503).json({ ok: false, error: 'proxy_not_configured' });
  }

  const formData = req.body;
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    return res.status(400).json({ ok: false, error: 'invalid_json' });
  }

  // Temel validasyon — admin API'ye göndermeden önce
  const { firstName, lastName, phone, email, consentDataProcessing, consentThirdParty } = formData;

  if (!String(firstName || '').trim() || !String(lastName || '').trim()) {
    return res.status(400).json({ ok: false, error: 'validation_failed', field: 'name' });
  }
  if (!email && !phone) {
    return res.status(400).json({ ok: false, error: 'validation_failed', field: 'contact' });
  }
  if (!consentDataProcessing || !consentThirdParty) {
    return res.status(400).json({ ok: false, error: 'validation_failed', field: 'consent' });
  }

  const adminPayload = buildAdminPayload(formData);
  const bodyString = JSON.stringify(adminPayload);
  const timestamp = new Date().toISOString();
  const signature = createSignature(secret, timestamp, bodyString);

  try {
    const upstream = await fetch(adminEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sr-timestamp': timestamp,
        'x-sr-signature': signature,
      },
      body: bodyString,
    });

    let upstreamBody;
    try { upstreamBody = await upstream.json(); }
    catch { upstreamBody = {}; }

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return res.status(429).json({ ok: false, error: 'rate_limited' });
      }
      if (upstream.status === 400) {
        return res.status(400).json({ ok: false, error: upstreamBody?.error?.code || 'validation_failed' });
      }
      // 401 = HMAC config hatası (sunucu tarafı), 5xx = upstream sorunu
      return res.status(502).json({ ok: false, error: 'upstream_error' });
    }

    return res.status(201).json({
      ok: true,
      leadId: upstreamBody.leadId,
      requestId: upstreamBody.requestId,
    });
  } catch {
    console.error('[lead-submit] upstream isteği başarısız');
    return res.status(502).json({ ok: false, error: 'upstream_unavailable' });
  }
}
