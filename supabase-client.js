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
  }
};

window.SupabaseAPI = SupabaseAPI;
