/* =========================================================
   SUPABASE CLIENT — chamadas REST simples via fetch (PostgREST)
   Usa apenas a chave PUBLISHABLE (anon), segura para expor no
   front-end. A tabela pay_entries tem RLS liberando select/insert/
   delete público propositalmente (app pessoal, sem login).
   ========================================================= */
var SUPABASE_URL = 'https://mpnjdooyeiclahxramns.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_7ZhLyBeVJdXIXSpFnjD5_w_mSX0r5if';

var SupabaseAPI = {
  /* Busca todos os registros de pay_entries, ordenados por data de pagamento */
  fetchPayEntries: function () {
    return fetch(SUPABASE_URL + '/rest/v1/pay_entries?select=*&order=pay_date.asc', {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows.map(function (r) {
        return {
          id: r.id,
          date: r.pay_date,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          amount: parseFloat(r.amount),
          type: r.type
        };
      });
    });
  },

  /* Insere um novo registro. Retorna o registro criado (com id gerado pelo banco). */
  insertPayEntry: function (entry) {
    return fetch(SUPABASE_URL + '/rest/v1/pay_entries', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        pay_date: entry.date,
        period_start: entry.periodStart,
        period_end: entry.periodEnd,
        amount: entry.amount,
        type: entry.type
      })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase insert failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      var r = rows[0];
      return { id: r.id, date: r.pay_date, periodStart: r.period_start, periodEnd: r.period_end, amount: parseFloat(r.amount), type: r.type };
    });
  },

  /* Deleta um registro pelo id (uuid) */
  deletePayEntry: function (id) {
    return fetch(SUPABASE_URL + '/rest/v1/pay_entries?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase delete failed: ' + resp.status);
      return true;
    });
  },

  /* ---------- Carteiras de investimento ---------- */

  /* Busca todas as carteiras */
  fetchWallets: function () {
    return fetch(SUPABASE_URL + '/rest/v1/wallets?select=*&order=created_at.asc', {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch wallets failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows.map(function (r) { return { id: r.id, name: r.name }; });
    });
  },

  /* Cria uma nova carteira. Retorna o objeto criado. */
  insertWallet: function (name) {
    return fetch(SUPABASE_URL + '/rest/v1/wallets', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ name: name })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase insert wallet failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      var r = rows[0];
      return { id: r.id, name: r.name };
    });
  },

  /* Deleta uma carteira (e em cascata todas as leituras dela) */
  deleteWallet: function (id) {
    return fetch(SUPABASE_URL + '/rest/v1/wallets?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase delete wallet failed: ' + resp.status);
      return true;
    });
  },

  /* Busca todas as leituras de todas as carteiras */
  fetchWalletEntries: function () {
    return fetch(SUPABASE_URL + '/rest/v1/wallet_entries?select=*&order=entry_date.asc', {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch wallet_entries failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows.map(function (r) {
        return { id: r.id, walletId: r.wallet_id, date: r.entry_date, balance: parseFloat(r.balance) };
      });
    });
  },

  /* Insere uma leitura de saldo para uma carteira */
  insertWalletEntry: function (walletId, date, balance) {
    return fetch(SUPABASE_URL + '/rest/v1/wallet_entries', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ wallet_id: walletId, entry_date: date, balance: balance })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase insert wallet_entry failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      var r = rows[0];
      return { id: r.id, walletId: r.wallet_id, date: r.entry_date, balance: parseFloat(r.balance) };
    });
  },

  /* Deleta uma leitura de saldo */
  deleteWalletEntry: function (id) {
    return fetch(SUPABASE_URL + '/rest/v1/wallet_entries?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
      }
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase delete wallet_entry failed: ' + resp.status);
      return true;
    });
  }
};

window.SupabaseAPI = SupabaseAPI;
