// api/generate-image.js
export default async function handler(req, res) {
  // Cambia esto por tu dominio real de GitHub Pages
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://softdoown.github.io";
  const ALLOWED_HOST = process.env.ALLOWED_HOST || "softdoown.github.io";

  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // Preflight OK
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Validación extra: comprobar el referer
  const referer = req.headers.referer || "";
  const refererHost = (() => {
    try { return new URL(referer).host; } catch { return ""; }
  })();

  if (refererHost !== ALLOWED_HOST) {
    return res.status(403).json({ error: "Forbidden: invalid referer" });
  }

  try {
    const { prompt, size = "1024x1024", model = "gpt-image-1" } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,   // "gpt-image-1" o "dall-e-3"
        prompt,
        size     // 256x256, 512x512, 1024x1024, etc.
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ error: "OpenAI error", details: txt });
    }

    const data = await r.json();
    const first = data?.data?.[0] || {};
    let image;

    if (first.b64_json) {
      image = `data:image/png;base64,${first.b64_json}`;
    } else if (first.url) {
      image = first.url;
    } else {
      return res.status(500).json({ error: "No image returned", raw: data });
    }

    return res.status(200).json({ image });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
