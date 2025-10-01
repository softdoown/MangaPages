import crypto from 'crypto';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://manga-pages.vercel.app';

// ---- Helpers KV (Upstash REST) ----
async function kvFetch(path, init = {}) {
  const url = `${KV_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`KV error ${res.status}: ${txt}`);
  }
  return res.json();
}

async function kvGet(key) {
  // REST v2: POST /get { key }
  const data = await kvFetch('/get', { method: 'POST', body: JSON.stringify({ key }) });
  // Respuesta típica: { result: "valor" } o { result: null }
  return data?.result ?? null;
}

async function kvSetEx(key, value, ttlSeconds) {
  // REST v2: POST /set { key, value, ex: seconds }
  return kvFetch('/set', {
    method: 'POST',
    body: JSON.stringify({ key, value, ex: ttlSeconds }),
  });
}

// ---- Utils ----
function getClientIP(req) {
  const h = req.headers;
  const xfwd = h.get('x-forwarded-for') || h.get('X-Forwarded-For');
  if (xfwd) return xfwd.split(',')[0].trim();
  // Vercel: a veces llega "x-real-ip"
  const xreal = h.get('x-real-ip') || h.get('X-Real-IP');
  if (xreal) return xreal.trim();
  return '0.0.0.0';
}

function fingerprint(req) {
  const ip = getClientIP(req);
  const ua = req.headers.get('user-agent') || '';
  return crypto.createHash('sha1').update(ip + '|' + ua).digest('hex');
}

// ---- CORS preflight ----
function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export default async function handler(req, res) {
  // Manejo OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin || '';
    if (origin === ALLOWED_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS: solo tu web
  const origin = req.headers.origin || '';
  if (origin !== ALLOWED_ORIGIN) {
    return res.status(403).json({ error: 'Forbidden origin' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin);

  try {
    if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY env var');
    if (!KV_URL || !KV_TOKEN) throw new Error('Missing Upstash KV env vars');

    const { prompt } = req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    // ---- Rate limit: 1/24h por fingerprint (IP + UA)
    const fp = fingerprint(req);
    const limitKey = `img:used:${fp}`; // valor cualquiera; usamos TTL
    const already = await kvGet(limitKey);
    if (already) {
      return res.status(429).json({
        error: 'limit_reached',
        message: 'You have reached the free image generation limit for today.',
      });
    }

    // ---- Llamada a OpenAI (Images API: gpt-image-1 -> b64_json)
    const openaiRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        size: '1024x1024',
        response_format: 'b64_json',
      }),
    });

    if (!openaiRes.ok) {
      const errTxt = await openaiRes.text().catch(() => '');
      return res.status(502).json({ error: 'OpenAI error', details: errTxt });
    }

    const data = await openaiRes.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      return res.status(500).json({ error: 'No image returned from OpenAI' });
    }

    // Marca el uso durante 24h
    await kvSetEx(limitKey, '1', 60 * 60 * 24);

    // Devuelve como dataURL para embebido rápido
    const image = `data:image/png;base64,${b64}`;
    return res.status(200).json({ image });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
