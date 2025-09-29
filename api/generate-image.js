// api/generate-image.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1", // también puedes usar "dall-e-3"
        prompt,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(500).json({ error: "OpenAI error", details: txt });
    }

    const data = await r.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return res.status(500).json({ error: "No image returned" });

    res.status(200).json({ image: `data:image/png;base64,${b64}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
}
