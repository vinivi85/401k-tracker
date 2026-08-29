// Associa uma conta Plaid a uma carteira do app
async function supa(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...(opts.headers||{}) }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  try {
    const { accountId, walletId } = req.body; // accountId = plaid_wallet_accounts.id
    await supa(`plaid_wallet_accounts?id=eq.${accountId}`, {
      method: 'PATCH',
      body: JSON.stringify({ wallet_id: walletId })
    });
    res.status(200).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
