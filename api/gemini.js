// Proxy do Gemini — chamada sai do servidor, nao do navegador.
// Evita CORS/preflight no cliente e mantem a chave fora do codigo publico.

const MODELO = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY nao configurada no servidor' });
    return;
  }

  try {
    const { prompt, contents, generationConfig, inlineData } = req.body || {};

    // Aceita prompt simples (texto) ou contents completo (texto + imagem)
    let corpo;
    if (contents) {
      corpo = { contents, generationConfig: generationConfig || { temperature: 0, maxOutputTokens: 8192 } };
    } else if (inlineData) {
      corpo = {
        contents: [{ parts: [{ text: prompt || '' }, { inline_data: inlineData }] }],
        generationConfig: generationConfig || { temperature: 0, maxOutputTokens: 8192 }
      };
    } else if (prompt) {
      corpo = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: generationConfig || { temperature: 0, maxOutputTokens: 8192 }
      };
    } else {
      res.status(400).json({ error: 'prompt, contents ou inlineData obrigatorio' });
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${apiKey}`;

    // Uma tentativa extra em caso de limite ou indisponibilidade
    let r = null;
    for (let i = 0; i < 3; i++) {
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo)
      });
      if (r.status !== 429 && r.status !== 503) break;
      await new Promise(function (ok) { setTimeout(ok, 2000 * (i + 1)); });
    }

    const texto = await r.text();
    if (!r.ok) {
      res.status(r.status).json({ error: 'Gemini ' + r.status + ': ' + texto.slice(0, 300) });
      return;
    }

    let data;
    try { data = JSON.parse(texto); }
    catch (e) { res.status(502).json({ error: 'Resposta invalida do Gemini' }); return; }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
