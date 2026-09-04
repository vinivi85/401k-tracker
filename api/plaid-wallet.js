// Consolidated: link-token, exchange, status, assign, disconnect, sync for wallets

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

async function saveToTracker(userId, walletId, balance, walletUuid = null) {
  const today = new Date().toISOString().split('T')[0];
  if (walletId === '401k') {
    /* Check last recorded balance — only save if value changed */
    const lastR = await supa(`tracker_entries?user_id=eq.${userId}&order=entry_date.desc&select=balance,date&limit=1`);
    const lastRows = lastR.ok ? await lastR.json() : [];
    const lastBalance = lastRows.length ? parseFloat(lastRows[0].balance) : null;
    if (lastBalance !== null && Math.abs(lastBalance - balance) < 0.01) {
      return { wallet: walletId, action: 'skipped', reason: 'no change', balance, lastBalance };
    }
    const ex = await supa(`tracker_entries?user_id=eq.${userId}&entry_date=eq.${today}&select=id&limit=1`);
    const existing = ex.ok ? await ex.json() : [];
    if (existing.length > 0) {
      const r = await supa(`tracker_entries?user_id=eq.${userId}&entry_date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance }) });
      return { wallet: walletId, action: 'updated', balance, ok: r.ok };
    } else {
      const r = await supa('tracker_entries', { method: 'POST', body: JSON.stringify({ user_id: userId, entry_date: today, balance }) });
      return { wallet: walletId, action: 'created', balance, ok: r.ok };
    }
  } else if (walletId) {
    /* Use pre-stored UUID if available, otherwise look up by name */
    let wId = walletUuid || null;
    if (!wId) {
      const walletR = await supa(`wallets?user_id=eq.${userId}&name=eq.${encodeURIComponent(walletId)}&select=id,name&limit=1`);
      const walletRows = walletR.ok ? await walletR.json() : [];
      if (!walletRows.length) {
        return { wallet: walletId, action: 'error', error: 'Wallet not found in DB: ' + walletId, balance };
      }
      wId = walletRows[0].id;
    }
    /* Check last recorded balance — only save if value changed */
    const lastR = await supa(`wallet_entries?wallet_id=eq.${wId}&order=entry_date.desc&select=balance,entry_date&limit=1`);
    const lastRows = lastR.ok ? await lastR.json() : [];
    const lastBalance = lastRows.length ? parseFloat(lastRows[0].balance) : null;
    if (lastBalance !== null && Math.abs(lastBalance - balance) < 0.01) {
      return { wallet: walletId, action: 'skipped', reason: 'no change', balance, lastBalance };
    }
    /* Check if entry exists for today */
    const ex = await supa(`wallet_entries?wallet_id=eq.${wId}&entry_date=eq.${today}&select=id&limit=1`);
    const existing = ex.ok ? await ex.json() : [];
    if (existing.length > 0) {
      const r = await supa(`wallet_entries?wallet_id=eq.${wId}&entry_date=eq.${today}`, { method: 'PATCH', body: JSON.stringify({ balance }) });
      return { wallet: walletId, action: 'updated', balance, ok: r.ok };
    } else {
      const r = await supa('wallet_entries', { method: 'POST', body: JSON.stringify({ wallet_id: wId, entry_date: today, balance }) });
      return { wallet: walletId, action: 'created', balance, ok: r.ok };
    }
  }
  return { wallet: walletId, action: 'skipped', balance };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = req.query.action || req.body?.action;
  const clientId = process.env.PLAID_CLIENT_ID, secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) { res.status(500).json({ error: 'Plaid not configured' }); return; }

  try {
    if (action === 'link-token') {
      const body = {
        client_id: clientId, secret, client_name: '401K Tracker',
        language: 'en', country_codes: ['US'],
        user: { client_user_id: req.body?.userId || '401k-user' },
        products: ['investments'],
      };
      const r = await fetch(`${plaidBaseUrl()}/link/token/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) { res.status(r.status).json({ error: data.error_message }); return; }
      res.status(200).json({ link_token: data.link_token });

    } else if (action === 'exchange') {
      const { public_token, institution_name, userId } = req.body;
      const exR = await fetch(`${plaidBaseUrl()}/item/public_token/exchange`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, public_token })
      });
      const exData = await exR.json();
      if (!exR.ok) { res.status(exR.status).json({ error: exData.error_message }); return; }
      const { access_token, item_id } = exData;

      // Get balances
      const balR = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token })
      });
      const balData = await balR.json();
      const accounts = (balData.accounts || []).map(a => ({
        account_id: a.account_id, name: a.name, type: a.type, subtype: a.subtype,
        balance: a.balances?.current || 0, mask: a.mask
      }));

      const itemR = await supa('plaid_wallet_connections', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ user_id: userId, plaid_item_id: item_id, plaid_access_token: access_token, institution_name: institution_name || null })
      });
      if (!itemR.ok) { res.status(500).json({ error: 'Error saving item' }); return; }
      const itemRow = (await itemR.json())[0];

      const accRows = accounts.map(a => ({
        item_id: itemRow.id, plaid_account_id: a.account_id,
        account_name: a.name + (a.mask ? ' ...' + a.mask : ''),
        account_type: a.type, account_subtype: a.subtype,
        current_balance: a.balance, wallet_id: null,
        last_synced_at: new Date().toISOString()
      }));
      await supa('plaid_wallet_accounts', { method: 'POST', body: JSON.stringify(accRows) });

      res.status(200).json({ ok: true, item_id: itemRow.id, institution_name, accounts });

    } else if (action === 'status') {
      const userId = req.query.userId || req.body?.userId;
      const itemsR = await supa(`plaid_wallet_connections?user_id=eq.${userId}&select=id,institution_name,created_at`);
      const items = itemsR.ok ? await itemsR.json() : [];
      const result = [];
      for (const item of items) {
        const accsR = await supa(`plaid_wallet_accounts?item_id=eq.${item.id}&select=id,account_name,account_type,current_balance,wallet_id,last_synced_at`);
        result.push({ ...item, accounts: accsR.ok ? await accsR.json() : [] });
      }
      res.status(200).json({ items: result });

    } else if (action === 'assign') {
      const { walletId, plaidAccountId, userId, itemId } = req.body;
      if (!plaidAccountId) { res.status(400).json({ error: 'plaidAccountId required' }); return; }

      /* Look up wallet UUID so we can store it directly */
      let walletUuid = null;
      if (walletId && walletId !== '401k' && userId) {
        const wR = await supa(`wallets?user_id=eq.${userId}&name=eq.${encodeURIComponent(walletId)}&select=id&limit=1`);
        const wRows = wR.ok ? await wR.json() : [];
        if (wRows.length) walletUuid = wRows[0].id;
      }

      /* Match by plaid_account_id — the app's local account id is NOT the table id */
      const patchR = await supa(`plaid_wallet_accounts?plaid_account_id=eq.${plaidAccountId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ wallet_id: walletId || null, wallet_uuid: walletUuid })
      });
      let rows = patchR.ok ? await patchR.json() : [];

      /* Row missing (account not captured on exchange) — insert it */
      if (!rows.length && itemId) {
        const insR = await supa('plaid_wallet_accounts', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            item_id: itemId,
            plaid_account_id: plaidAccountId,
            account_name: walletId || 'Conta Plaid',
            wallet_id: walletId || null,
            wallet_uuid: walletUuid,
            last_synced_at: new Date().toISOString()
          })
        });
        rows = insR.ok ? await insR.json() : [];
      }

      res.status(200).json({ ok: true, wallet_uuid: walletUuid, rows: rows.length });

    } else if (action === 'sync-one') {
      const { userId, itemId, walletId, plaidAccountId } = req.body;
      /* Try by plaid_item_id first, then by UUID id */
      let connR = await supa(`plaid_wallet_connections?plaid_item_id=eq.${itemId}&select=plaid_access_token,id&limit=1`);
      let conns = connR.ok ? await connR.json() : [];
      if (!conns.length) {
        connR = await supa(`plaid_wallet_connections?id=eq.${itemId}&select=plaid_access_token,id&limit=1`);
        conns = connR.ok ? await connR.json() : [];
      }
      if (!conns.length) { res.status(404).json({ error: 'Connection not found' }); return; }

      /* Get stored wallet_uuid from plaid_wallet_accounts */
      let walletUuid = null;
      if (plaidAccountId) {
        const accR = await supa(`plaid_wallet_accounts?plaid_account_id=eq.${plaidAccountId}&select=wallet_uuid&limit=1`);
        const accRows = accR.ok ? await accR.json() : [];
        if (accRows.length && accRows[0].wallet_uuid) walletUuid = accRows[0].wallet_uuid;
      }

      const balR = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token: conns[0].plaid_access_token })
      });
      const balData = await balR.json();
      if (!balR.ok) { res.status(balR.status).json({ error: balData.error_message }); return; }
      const accounts = balData.accounts || [];
      const acc = plaidAccountId ? accounts.find(a => a.account_id === plaidAccountId) : null;
      const balance = acc ? (acc.balances?.current || 0) : accounts.reduce((s,a)=>s+(a.balances?.current||0),0);

      const result = await saveToTracker(userId, walletId, balance, walletUuid);
      res.status(200).json({ ok: true, balance, result });

    } else if (action === 'sync-all') {
      const { userId } = req.body;
      const connsR = await supa(`plaid_wallet_connections?user_id=eq.${userId}&select=id,plaid_access_token`);
      const conns = connsR.ok ? await connsR.json() : [];
      const results = [];
      for (const conn of conns) {
        const accsR = await supa(`plaid_wallet_accounts?item_id=eq.${conn.id}&wallet_id=not.is.null&select=plaid_account_id,wallet_id`);
        const accs = accsR.ok ? await accsR.json() : [];
        if (!accs.length) continue;
        const balR = await fetch(`${plaidBaseUrl()}/accounts/balance/get`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: conn.plaid_access_token })
        });
        if (!balR.ok) continue;
        const balData = await balR.json();
        for (const acc of accs) {
          const plaidAcc = balData.accounts?.find(a => a.account_id === acc.plaid_account_id);
          const balance = plaidAcc ? (plaidAcc.balances?.current || 0) : 0;
          await saveToTracker(userId, acc.wallet_id, balance);
          results.push({ wallet: acc.wallet_id, balance });
        }
      }
      res.status(200).json({ ok: true, synced: results.length, results });

    } else if (action === 'reauth-token') {
      /* Create update mode link token for re-authentication */
      const { userId, itemId } = req.body;
      /* Get access token */
      let connR = await supa(`plaid_wallet_connections?plaid_item_id=eq.${itemId}&select=plaid_access_token&limit=1`);
      let conns = connR.ok ? await connR.json() : [];
      if (!conns.length) {
        connR = await supa(`plaid_wallet_connections?id=eq.${itemId}&select=plaid_access_token&limit=1`);
        conns = connR.ok ? await connR.json() : [];
      }
      if (!conns.length) { res.status(404).json({ error: 'Connection not found' }); return; }
      const body = {
        client_id: clientId, secret,
        client_name: '401K Tracker',
        language: 'en', country_codes: ['US'],
        user: { client_user_id: userId || '401k-user' },
        access_token: conns[0].plaid_access_token,
      };
      const r = await fetch(`${plaidBaseUrl()}/link/token/create`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) { res.status(r.status).json({ error: data.error_message }); return; }
      res.status(200).json({ link_token: data.link_token });

    } else if (action === 'disconnect') {
      const { itemId, userId } = req.body;
      if (itemId) {
        /* Try by plaid_item_id and by UUID */
        let r = await supa(`plaid_wallet_connections?plaid_item_id=eq.${itemId}&select=plaid_access_token,id&limit=1`);
        let rows = r.ok ? await r.json() : [];
        if (!rows.length) {
          r = await supa(`plaid_wallet_connections?id=eq.${itemId}&select=plaid_access_token,id&limit=1`);
          rows = r.ok ? await r.json() : [];
        }
        if (rows.length) {
          /* Remove from Plaid */
          try {
            await fetch(`${plaidBaseUrl()}/item/remove`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ client_id: clientId, secret, access_token: rows[0].plaid_access_token })
            });
          } catch(e) { console.error('Plaid item/remove error:', e.message); }
          /* Delete from Supabase by id */
          await supa(`plaid_wallet_connections?id=eq.${rows[0].id}`, { method: 'DELETE' });
        }
      }
      res.status(200).json({ ok: true });

    } else {
      res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
}
