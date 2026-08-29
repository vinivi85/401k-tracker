// Vercel Serverless Function — 401K Tracker
// Cria link_token para inicializar o Plaid Link (conectar Fidelity)

function plaidBaseUrl() {
  const env = process.env.PLAID_ENV || 'sandbox';
  return env === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret   = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    res.status(500).json({ error: 'PLAID_CLIENT_ID/PLAID_SECRET not configured' });
    return;
  }

  try {
    const body = {
      client_id: clientId,
      secret,
      client_name: '401K Tracker',
      language: 'en',
      country_codes: ['US'],
      user: { client_user_id: req.body?.userId || '401k-user' },
      products: ['investments'],  // investments para 401k/brokerage
    };
    if (process.env.PLAID_REDIRECT_URI) body.redirect_uri = process.env.PLAID_REDIRECT_URI;

    const upstream = await fetch(`${plaidBaseUrl()}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: data.error_message || 'Error creating link_token', detail: data });
      return;
    }
    res.status(200).json({ link_token: data.link_token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
