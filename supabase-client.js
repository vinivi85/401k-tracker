/* =========================================================
   SUPABASE CLIENT — Auth (email/senha) + REST de dados (PostgREST)
   Usa apenas a chave PUBLISHABLE (anon), segura para expor no
   front-end. Cada usuário loga e só vê/edita os próprios dados
   (garantido por RLS no banco, não apenas no front-end).
   ========================================================= */
var SUPABASE_URL = 'https://mpnjdooyeiclahxramns.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_7ZhLyBeVJdXIXSpFnjD5_w_mSX0r5if';

/* ---------- Sessão em memória + persistida localmente ---------- */
var _session = null; // { access_token, refresh_token, user: { id, email } }

function loadSession() {
  if (_session) return _session;
  try {
    var raw = window.__dbCache[KEY_AUTH_SESSION];
    if (raw) {
      _session = JSON.parse(raw);
      return _session;
    }
  } catch (e) {}
  return null;
}

function persistSession(session) {
  _session = session;
  saveJSON(KEY_AUTH_SESSION, session);
}

function authHeaders() {
  var s = loadSession();
  var token = (s && s.access_token) ? s.access_token : SUPABASE_ANON_KEY;
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + token
  };
}

function currentUserId() {
  var s = loadSession();
  return s && s.user ? s.user.id : null;
}

/* Renova o access_token usando o refresh_token, quando o token expira (~1h) */
function refreshSession() {
  var s = loadSession();
  if (!s || !s.refresh_token) return Promise.reject(new Error('Sem sessão para renovar.'));
  return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token })
  }).then(function (resp) {
    if (!resp.ok) throw new Error('Falha ao renovar sessão: ' + resp.status);
    return resp.json();
  }).then(function (data) {
    var newSession = { access_token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: data.user.email } };
    persistSession(newSession);
    return newSession;
  });
}

/* Faz um fetch autenticado; se receber 401, tenta renovar a sessão uma vez e refaz a chamada */
function authFetch(url, options) {
  options = options || {};
  options.headers = Object.assign({}, authHeaders(), options.headers || {});
  return fetch(url, options).then(function (resp) {
    if (resp.status === 401) {
      return refreshSession().then(function () {
        options.headers = Object.assign({}, authHeaders(), options.headers || {});
        return fetch(url, options);
      });
    }
    return resp;
  });
}

var SupabaseAuth = {
  getSession: function () { return loadSession(); },
  isLoggedIn: function () { return !!loadSession(); },

  signUp: function (email, password) {
    return fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(data.msg || data.error_description || data.error || 'Falha ao cadastrar.');
        return data;
      });
    }).then(function (data) {
      if (data.access_token) {
        var session = { access_token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: data.user.email } };
        persistSession(session);
        return session;
      }
      return null; // algumas configs exigem confirmação de e-mail antes de logar
    });
  },

  signIn: function (email, password) {
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(data.msg || data.error_description || data.error || 'Email ou senha incorretos.');
        return data;
      });
    }).then(function (data) {
      var session = { access_token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: data.user.email } };
      persistSession(session);
      return session;
    });
  },

  signOut: function () {
    var s = loadSession();
    persistSession(null);
    if (!s) return Promise.resolve();
    return fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + s.access_token }
    }).catch(function () {});
  },

  updatePassword: function (accessToken, newPassword) {
    return fetch(SUPABASE_URL + '/auth/v1/user', {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: newPassword })
    }).then(function (resp) {
      return resp.json().then(function (data) {
        if (!resp.ok) throw new Error(data.msg || data.error_description || data.error || 'Falha ao atualizar senha.');
        return data;
      });
    });
  }
};

var SupabaseAPI = {
  /* ---------- Pay (holerites) ---------- */

  fetchPayEntries: function () {
    return authFetch(SUPABASE_URL + '/rest/v1/pay_entries?select=*&order=pay_date.asc').then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows.map(function (r) {
        return {
          id: r.id, date: r.pay_date, periodStart: r.period_start, periodEnd: r.period_end,
          amount: parseFloat(r.amount), type: r.type,
          gross: r.gross != null ? parseFloat(r.gross) : null,
          contrib401k: r.contrib401k != null ? parseFloat(r.contrib401k) : null,
          profitSharing: r.profit_sharing != null ? parseFloat(r.profit_sharing) : null
        };
      });
    });
  },

  insertPayEntry: function (entry) {
    return authFetch(SUPABASE_URL + '/rest/v1/pay_entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({
        pay_date: entry.date, period_start: entry.periodStart, period_end: entry.periodEnd,
        amount: entry.amount, type: entry.type, user_id: currentUserId(),
        gross: entry.gross != null ? entry.gross : null,
        contrib401k: entry.contrib401k != null ? entry.contrib401k : null,
        profit_sharing: entry.profitSharing != null ? entry.profitSharing : null
      })
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error('insert failed ' + resp.status + ': ' + t.slice(0,100)); });
      return resp.json();
    }).then(function (rows) {
      var r = rows[0];
      return {
        id: r.id, date: r.pay_date, periodStart: r.period_start, periodEnd: r.period_end,
        amount: parseFloat(r.amount), type: r.type,
        gross: r.gross != null ? parseFloat(r.gross) : null,
        contrib401k: r.contrib401k != null ? parseFloat(r.contrib401k) : null,
        profitSharing: r.profit_sharing != null ? parseFloat(r.profit_sharing) : null
      };
    });
  },

  deletePayEntry: function (id) {
    return authFetch(SUPABASE_URL + '/rest/v1/pay_entries?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Supabase delete failed: ' + resp.status);
        return true;
      });
  },

  updatePayEntry: function (id, fields) {
    var dbFields = {};
    if (fields.date          != null) dbFields.pay_date      = fields.date;
    if (fields.type          != null) dbFields.type           = fields.type;
    if (fields.amount        != null) dbFields.amount         = fields.amount;
    if (fields.gross         != null) dbFields.gross          = fields.gross;
    if (fields.contrib401k   != null) dbFields.contrib401k    = fields.contrib401k;
    if (fields.profitSharing != null) dbFields.profit_sharing = fields.profitSharing;
    if (fields.profit_sharing != null) dbFields.profit_sharing = fields.profit_sharing;

    return authFetch(SUPABASE_URL + '/rest/v1/pay_entries?id=eq.' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(dbFields)
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (txt) {
          throw new Error('HTTP ' + resp.status + ': ' + txt.slice(0, 120));
        });
      }
      return resp.json();
    }).then(function (rows) {
      function mapRow(r) {
        return {
          id: r.id, date: r.pay_date, periodStart: r.period_start, periodEnd: r.period_end,
          amount: parseFloat(r.amount),
          gross: r.gross != null ? parseFloat(r.gross) : null,
          contrib401k: r.contrib401k != null ? parseFloat(r.contrib401k) : null,
          profitSharing: r.profit_sharing != null ? parseFloat(r.profit_sharing) : null,
          type: r.type
        };
      }
      if (!rows || rows.length === 0) {
        return authFetch(SUPABASE_URL + '/rest/v1/pay_entries?id=eq.' + encodeURIComponent(id) + '&select=*')
          .then(function (r2) { return r2.json(); })
          .then(function (r2rows) {
            if (!r2rows || r2rows.length === 0) throw new Error('Registro não encontrado (id: ' + id + ')');
            return mapRow(r2rows[0]);
          });
      }
      return mapRow(rows[0]);
    });
  },

  /* ---------- Carteiras de investimento ---------- */

  fetchWallets: function () {
    return authFetch(SUPABASE_URL + '/rest/v1/wallets?select=*&order=created_at.asc').then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch wallets failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows.map(function (r) { return { id: r.id, name: r.name }; });
    });
  },

  insertWallet: function (name) {
    return authFetch(SUPABASE_URL + '/rest/v1/wallets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ name: name, user_id: currentUserId() })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase insert wallet failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      var r = rows[0];
      return { id: r.id, name: r.name };
    });
  },

  deleteWallet: function (id) {
    return authFetch(SUPABASE_URL + '/rest/v1/wallets?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Supabase delete wallet failed: ' + resp.status);
        return true;
      });
  },

  fetchWalletEntries: function () {
    return authFetch(SUPABASE_URL + '/rest/v1/wallet_entries?select=*&order=entry_date.asc').then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch wallet_entries failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows.map(function (r) { return { id: r.id, walletId: r.wallet_id, date: r.entry_date, balance: parseFloat(r.balance) }; });
    });
  },

  insertWalletEntry: function (walletId, date, balance) {
    return authFetch(SUPABASE_URL + '/rest/v1/wallet_entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ wallet_id: walletId, entry_date: date, balance: balance })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase insert wallet_entry failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      var r = rows[0];
      return { id: r.id, walletId: r.wallet_id, date: r.entry_date, balance: parseFloat(r.balance) };
    });
  },

  deleteWalletEntry: function (id) {
    return authFetch(SUPABASE_URL + '/rest/v1/wallet_entries?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Supabase delete wallet_entry failed: ' + resp.status);
        return true;
      });
  },

  /* ---------- Tracker (saldo 401k) ---------- */

  fetchTrackerEntries: function () {
    return authFetch(SUPABASE_URL + '/rest/v1/tracker_entries?select=*&order=entry_date.asc').then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch tracker_entries failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows.map(function (r) { return { id: r.id, date: r.entry_date, balance: parseFloat(r.balance) }; });
    });
  },

  insertTrackerEntry: function (date, balance) {
    return authFetch(SUPABASE_URL + '/rest/v1/tracker_entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ entry_date: date, balance: balance, user_id: currentUserId() })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase insert tracker_entry failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      var r = rows[0];
      return { id: r.id, date: r.entry_date, balance: parseFloat(r.balance) };
    });
  },

  deleteTrackerEntry: function (id) {
    return authFetch(SUPABASE_URL + '/rest/v1/tracker_entries?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('Supabase delete tracker_entry failed: ' + resp.status);
        return true;
      });
  },

  /* ---------- Config centralizada do usuário ---------- */

  fetchUserConfig: function () {
    return authFetch(SUPABASE_URL + '/rest/v1/user_configs?select=config').then(function (resp) {
      if (!resp.ok) throw new Error('Supabase fetch user_config failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows.length ? rows[0].config : null;
    });
  },

  saveUserConfig: function (config) {
    return authFetch(SUPABASE_URL + '/rest/v1/user_configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ user_id: currentUserId(), config: config, updated_at: new Date().toISOString() })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Supabase save user_config failed: ' + resp.status);
      return resp.json();
    });
  },

  /* ---------- Storage — Pay Stubs ---------- */

  checkPayEntryExists: function (date) {
    /* Verifica direto no banco se existe pagamento com essa data — sem cache */
    return authFetch(SUPABASE_URL + '/rest/v1/pay_entries?select=id&pay_date=eq.' + date, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }).then(function (resp) {
      if (!resp.ok) throw new Error('Check failed: ' + resp.status);
      return resp.json();
    }).then(function (rows) {
      return rows && rows.length > 0;
    });
  },

  uploadPayStub: function (file, fileName) {
    var uid = currentUserId();
    var path = uid + '/' + fileName;
    var encodedPath = encodeURIComponent(uid) + '/' + encodeURIComponent(fileName);
    return authFetch(SUPABASE_URL + '/storage/v1/object/paystubs/' + encodedPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
      body: file
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error('Upload failed ' + resp.status + ': ' + t.slice(0, 80)); });
      return path;
    });
  },

  listPayStubs: function () {
    var uid = currentUserId();
    return authFetch(SUPABASE_URL + '/storage/v1/object/list/paystubs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: uid + '/', limit: 100, sortBy: { column: 'name', order: 'desc' } })
    }).then(function (resp) {
      if (!resp.ok) throw new Error('List failed: ' + resp.status);
      return resp.json();
    }).then(function (items) {
      return (items || []).filter(function (i) { return i.name && i.name.endsWith('.pdf'); }).map(function (i) {
        /* i.name returned by list API is just the filename without the prefix folder */
        var fileName = i.name.replace(uid + '/', '').replace(/^\/+/, '');
        var fullPath = uid + '/' + fileName;
        return { name: fileName, path: fullPath };
      });
    });
  },

  getPayStubUrl: function (path) {
    /* path = uid/filename — não encode a barra */
    var parts = path.split('/');
    var encodedPath = parts.map(encodeURIComponent).join('/');
    return authFetch(SUPABASE_URL + '/storage/v1/object/sign/paystubs/' + encodedPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: 3600 })
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error('Sign failed ' + resp.status + ': ' + t.slice(0, 100)); });
      return resp.json();
    }).then(function (data) {
      return SUPABASE_URL + data.signedURL;
    });
  },

  deletePayStub: function (path) {
    var parts = path.split('/');
    var encodedPath = parts.map(encodeURIComponent).join('/');
    return authFetch(SUPABASE_URL + '/storage/v1/object/paystubs/' + encodedPath, {
      method: 'DELETE'
    }).then(function (resp) {
      if (!resp.ok) return resp.text().then(function (t) { throw new Error('Delete failed ' + resp.status + ': ' + t.slice(0, 80)); });
      return true;
    });
  },

  downloadPayStub: function (signedUrl) {
    /* Baixa PDF usando authFetch que inclui headers corretos — evita CORS no iOS PWA */
    return authFetch(signedUrl, { method: 'GET' }).then(function (resp) {
      if (!resp.ok) throw new Error('Download failed: ' + resp.status);
      return resp.arrayBuffer();
    });
  }
};

window.SupabaseAuth = SupabaseAuth;
window.SupabaseAPI = SupabaseAPI;
window.currentUserId = currentUserId;
