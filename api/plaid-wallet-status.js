// Retorna todas as conexões e contas, com associação às carteiras
async function supa(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}`, ...(opts.headers||{}) }
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  try {
    const userId = req.method === 'GET' ? req.query.userId : req.body?.userId;
    
    const itemsR = await supa(`plaid_wallet_connections?user_id=eq.${userId}&select=id,institution_name,created_at`);
    const items = itemsR.ok ? await itemsR.json() : [];

    const result = [];
    for (const item of items) {
      const accsR = await supa(`plaid_wallet_accounts?item_id=eq.${item.id}&select=id,account_name,account_type,account_subtype,current_balance,wallet_id,last_synced_at`);
      const accounts = accsR.ok ? await accsR.json() : [];
      result.push({ ...item, accounts });
    }

    res.status(200).json({ items: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
