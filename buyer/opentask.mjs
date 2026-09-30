import { createHash, randomUUID, webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const BASE = 'https://opentask.ai';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function readPrivateJwk(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(name + ' missing');
  const jwk = JSON.parse(raw);
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y || !jwk.d) {
    throw new Error(name + ' must be a private P-256 JWK');
  }
  return jwk;
}

function publicJwk(jwk) {
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

async function signingKey(jwk) {
  return subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function signBytes(text, jwk) {
  const key = await signingKey(jwk);
  const sig = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(text)
  );
  return b64url(new Uint8Array(sig));
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('base64url');
}

async function dpopProof({ method, url, accessToken, jwk }) {
  const htu = new URL(url);
  htu.search = '';
  htu.hash = '';
  const header = {
    typ: 'dpop+jwt',
    alg: 'ES256',
    jwk: publicJwk(jwk)
  };
  const payload = {
    jti: randomUUID(),
    htm: method.toUpperCase(),
    htu: htu.toString(),
    iat: Math.floor(Date.now() / 1000),
    ath: tokenHash(accessToken)
  };
  const head = b64url(JSON.stringify(header));
  const body = b64url(JSON.stringify(payload));
  const signingInput = head + '.' + body;
  const signature = await signBytes(signingInput, jwk);
  return signingInput + '.' + signature;
}

async function apiRequest(path, { method = 'GET', accessToken, jwk, body, idempotencyKey } = {}) {
  const url = BASE + path;
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  if (accessToken) {
    headers.authorization = 'DPoP ' + accessToken;
    headers.dpop = await dpopProof({ method, url, accessToken, jwk });
  }
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  return { response, text, parsed };
}

function redactedError(result) {
  const p = result?.parsed;
  if (p && typeof p === 'object') {
    return {
      error: p.error || null,
      code: p.code || null,
      issues: Array.isArray(p.issues) ? p.issues : undefined,
      fieldErrors: p.fieldErrors && typeof p.fieldErrors === 'object' ? p.fieldErrors : undefined
    };
  }
  return { body: String(result?.text || '').slice(0, 1000) };
}

export async function registerOpenTaskAutonomousAgent() {
  if (process.env.OPENTASK_REGISTER !== '1') {
    return { skipped: true, reason: 'OPENTASK_REGISTER is not enabled' };
  }

  const operational = readPrivateJwk('OPENTASK_OPERATIONAL_JWK');
  const recovery = readPrivateJwk('OPENTASK_RECOVERY_JWK');
  const handle = process.env.OPENTASK_HANDLE || 'industrial_platform_x402';
  const displayName = process.env.OPENTASK_DISPLAY_NAME || 'Industrial Platform x402';

  const scopes = [
    'profile:read','profile:write','profiles:read',
    'capabilities:read','capabilities:write',
    'tasks:read',
    'bids:read','bids:write',
    'contracts:read','contracts:write',
    'payments:read',
    'submissions:read','submissions:write',
    'deliveries:read','deliveries:write',
    'reviews:read','reviews:write',
    'messages:read','messages:write',
    'comments:read','comments:write',
    'matching:write'
  ];

  const challenge = await apiRequest('/api/agent/auth/register/challenge', {
    method: 'POST',
    body: {
      handle,
      displayName,
      publicJwk: publicJwk(operational),
      recoveryPublicJwk: publicJwk(recovery),
      scopes
    }
  });

  if (challenge.response.status !== 201) {
    const result = {
      stage: 'challenge',
      httpStatus: challenge.response.status,
      ok: false,
      error: redactedError(challenge)
    };
    console.log('OpenTask autonomous registration:', JSON.stringify(result));
    return result;
  }

  const c = challenge.parsed || {};
  const registrationId = c.registration_id;
  const canonicalPayload = c.canonical_payload;
  if (!registrationId || typeof canonicalPayload !== 'string') {
    const result = {
      stage: 'challenge',
      httpStatus: 201,
      ok: false,
      error: { code: 'unexpected_challenge_shape', keys: Object.keys(c) }
    };
    console.log('OpenTask autonomous registration:', JSON.stringify(result));
    return result;
  }

  const [signature, recoverySignature] = await Promise.all([
    signBytes(canonicalPayload, operational),
    signBytes(canonicalPayload, recovery)
  ]);

  const complete = await apiRequest('/api/agent/auth/register/complete', {
    method: 'POST',
    body: {
      registration_id: registrationId,
      signature,
      recovery_signature: recoverySignature
    }
  });

  if (complete.response.status !== 201) {
    const result = {
      stage: 'complete',
      httpStatus: complete.response.status,
      ok: false,
      error: redactedError(complete)
    };
    console.log('OpenTask autonomous registration:', JSON.stringify(result));
    return result;
  }

  const data = complete.parsed || {};
  const accessToken = data.access_token;
  const credentialId = data.credential?.id || data.credential_id || null;
  const recoveryCredentialId = data.recovery_credential?.id || null;
  const profile = data.profile || {};

  const result = {
    stage: 'complete',
    httpStatus: 201,
    ok: true,
    profileId: profile.id || null,
    handle: profile.handle || handle,
    credentialId,
    recoveryCredentialId,
    scope: data.scope || null,
    expiresIn: data.expires_in || null,
    tokenType: data.token_type || null
  };
  console.log('OpenTask autonomous registration:', JSON.stringify(result));

  if (!accessToken) return result;

  const [me, onboarding] = await Promise.all([
    apiRequest('/api/agent/me', { accessToken, jwk: operational }),
    apiRequest('/api/agent/onboarding/status', { accessToken, jwk: operational })
  ]);

  console.log('OpenTask autonomous profile:', JSON.stringify({
    httpStatus: me.response.status,
    ok: me.response.ok,
    profile: me.response.ok ? {
      id: me.parsed?.profile?.id || me.parsed?.id || profile.id || null,
      handle: me.parsed?.profile?.handle || me.parsed?.handle || profile.handle || handle,
      activePayoutMethodCount: me.parsed?.activePayoutMethodCount ?? null,
      routerPayablePayoutMethodCount: me.parsed?.routerPayablePayoutMethodCount ?? null,
      serviceListingRequirements: me.parsed?.serviceListingRequirements ?? null
    } : undefined,
    error: me.response.ok ? undefined : redactedError(me)
  }));

  console.log('OpenTask autonomous onboarding:', JSON.stringify({
    httpStatus: onboarding.response.status,
    ok: onboarding.response.ok,
    checkpoint: onboarding.parsed?.checkpoint || null,
    progress: onboarding.parsed?.progress ?? onboarding.parsed?.progressPercent ?? null,
    actions: Array.isArray(onboarding.parsed?.actions)
      ? onboarding.parsed.actions.map(a => ({
          id: a.id || a.action || null,
          status: a.status || null,
          requiredScopes: a.requiredScopes || a.required_scopes || null,
          endpoint: a.rest?.path || a.endpoint || null
        }))
      : null,
    error: onboarding.response.ok ? undefined : redactedError(onboarding)
  }));

  return result;
}
