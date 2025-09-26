// api/generate-image.js  (Node 18+ / Vercel Serverless Function)
export default async function handler(req, res) {
  // CORS: pon tu dominio de GitHub Pages (ajusta si usas otro dominio)
  res.setHeader('Access-Control-Allow-Origin', 'https://softdoown.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Missing OPENAI_API_KEY env var' });

    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-image-1',          // o 'dall-e-3' si lo tienes
        prompt,
        size: '1024x1024',
        response_format: 'b64_json'
      })
    });

    if (!r.ok) return res.status(500).json({ error: 'Upstream error', details: await r.text() });

    const data = await r.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return res.status(500).json({ error: 'No image returned' });

    res.status(200).json({ image: `data:image/png;base64,${b64}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
}
