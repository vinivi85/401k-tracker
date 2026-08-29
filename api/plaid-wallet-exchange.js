// Troca public_token, salva o item e retorna todas as contas para o usuário associar
function plaidBaseUrl() {
  const env = process.env.PLAID_ENV || 'sandbox';
  return env === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com';
}

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
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret   = process.env.PLAID_SECRET;

  try {
    const { public_token, institution_name, userId } = req.body;

    // Exchange token
    const exR = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, public_token })
    });
    const exData = await exR.json();
    if (!exR.ok) { res.status(exR.status).json({ error: exData.error_message }); return; }

    const accessToken = exData.access_token;
    const itemId      = exData.item_id;

    // Get accounts + balances
    const balR = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken })
    });
    const balData = await balR.json();
    const accounts = balData.accounts || [];

    // Also try investments
    let investAccounts = [];
    try {
      const invR = await fetch(`${plaidBaseUrl()}/investments/holdings/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken })
      });
      if (invR.ok) {
        const invData = await invR.json();
        investAccounts = invData.accounts || [];
      }
    } catch(e) {}

    // Merge: prefer investment data when available
    const allAccounts = accounts.map(a => {
      const inv = investAccounts.find(i => i.account_id === a.account_id);
      return {
        account_id: a.account_id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        balance: (inv ? inv.balances?.current : a.balances?.current) || 0,
        mask: a.mask
      };
    });

    // Save item
    const itemR = await supa('plaid_wallet_connections', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: userId, plaid_item_id: itemId, plaid_access_token: accessToken, institution_name: institution_name || null })
    });
    if (!itemR.ok) { res.status(500).json({ error: 'Error saving item: ' + await itemR.text() }); return; }
    const itemRow = (await itemR.json())[0];

    // Save accounts as pending (no wallet association yet)
    const accRows = allAccounts.map(a => ({
      item_id: itemRow.id,
      plaid_account_id: a.account_id,
      account_name: a.name + (a.mask ? ' ...' + a.mask : ''),
      account_type: a.type,
      account_subtype: a.subtype,
      current_balance: a.balance,
      wallet_id: null,
      last_synced_at: new Date().toISOString()
    }));

    await supa('plaid_wallet_accounts', {
      method: 'POST',
      body: JSON.stringify(accRows)
    });

    res.status(200).json({ ok: true, item_id: itemRow.id, institution_name, accounts: allAccounts });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
