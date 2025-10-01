// api/generate-image.js
export default async function handler(req, res) {
  // CORS (cambia "*" por tu dominio de prod, p.ej. https://softdoown.github.io)
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, size = "1024x1024", model = "gpt-image-1" } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    // Llamada al endpoint de imágenes (sin response_format)
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,        // "gpt-image-1" (puedes probar "dall-e-3" si lo prefieres)
        prompt,
        size          // 256x256, 512x512, 1024x1024, 1792x1024, etc. según soporte
        // quality, style... si tu cuenta lo soporta
      }),
    });

    // Manejo de errores con detalle
    if (!r.ok) {
      let details = await r.text();
      try { details = JSON.stringify(JSON.parse(details), null, 2); } catch {}
      return res.status(500).json({ error: "OpenAI error", details });
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

    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    return res.status(200).json({ image });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error", details: String(e) });
  }
}
