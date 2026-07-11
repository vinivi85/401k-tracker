/* =========================================================
   AUTH SCREEN — login e cadastro por e-mail/senha (Supabase Auth)
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  function parseHashParams() {
    try {
      var hash = window.location.hash.slice(1);
      var params = {};
      hash.split('&').forEach(function (part) {
        var kv = part.split('=');
        if (kv.length === 2) params[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
      });
      // Se o token está aqui mas estamos na raiz (não no /401k-tracker),
      // redireciona pro app com o hash inteiro preservado
      if (params.access_token && params.type === 'recovery') {
        var appBase = 'https://vinivi85.github.io/401k-tracker/';
        if (window.location.pathname === '/' || window.location.pathname === '') {
          window.location.replace(appBase + window.location.hash);
          return {};
        }
      }
      return params;
    } catch (e) { return {}; }
  }

  function ResetPasswordScreen(props) {
    var accessToken = props.accessToken;
    var onDone = props.onDone;

    var pw1State = React.useState('');
    var pw1 = pw1State[0], setPw1 = pw1State[1];

    var pw2State = React.useState('');
    var pw2 = pw2State[0], setPw2 = pw2State[1];

    var errState = React.useState('');
    var error = errState[0], setError = errState[1];

    var loadingState = React.useState(false);
    var loading = loadingState[0], setLoading = loadingState[1];

    var doneState = React.useState(false);
    var done = doneState[0], setDone = doneState[1];

    function validatePassword(pwd) {
      if (pwd.length < 8) return 'Mínimo 8 caracteres.';
      if (!/[A-Z]/.test(pwd)) return 'Precisa ter pelo menos 1 letra maiúscula.';
      if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\\/;']/.test(pwd)) return 'Precisa ter pelo menos 1 caractere especial.';
      return null;
    }

    function handleSubmit() {
      setError('');
      var err = validatePassword(pw1);
      if (err) { setError(err); return; }
      if (pw1 !== pw2) { setError('As senhas não coincidem.'); return; }
      setLoading(true);
      SupabaseAuth.updatePassword(accessToken, pw1).then(function () {
        setDone(true);
        setLoading(false);
        // limpa o hash da URL
        try { window.history.replaceState(null, '', window.location.pathname); } catch (e) {}
        setTimeout(function () { onDone(); }, 2000);
      }).catch(function (e) {
        setError(e.message || 'Falha ao atualizar a senha.');
        setLoading(false);
      });
    }

    if (done) {
      return h('div', { style: S.lockScreen },
        h(Icon, { name: 'lock', size: 28, color: '#5EEAD4' }),
        h('div', { style: S.lockTitle }, 'SENHA ATUALIZADA!'),
        h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5EEAD4', textAlign: 'center' } }, 'Redirecionando para o login...')
      );
    }

    return h('div', { style: S.lockScreen },
      h(Icon, { name: 'lock', size: 28, color: '#5EEAD4' }),
      h('div', { style: S.lockTitle }, 'CRIAR NOVA SENHA'),
      h('div', { style: { width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'NOVA SENHA'),
          h('input', { type: 'password', value: pw1, style: S.input, onChange: function (ev) { setPw1(ev.target.value); } }),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6B7280', marginTop: 4 } },
            'Mínimo 8 caracteres, 1 maiúscula e 1 caractere especial'
          )
        ),
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'CONFIRME A NOVA SENHA'),
          h('input', { type: 'password', value: pw2, style: S.input, onChange: function (ev) { setPw2(ev.target.value); } })
        ),
        error ? h('div', { style: S.errorText }, error) : null,
        h('button', { style: S.submitBtn, onClick: handleSubmit, disabled: loading },
          loading ? 'SALVANDO...' : 'SALVAR NOVA SENHA'
        )
      )
    );
  }

  function AuthScreen(props) {
    var onAuthenticated = props.onAuthenticated;

    // Detecta token de recovery na URL (vindo do email de reset)
    var hashParams = parseHashParams();
    var recoveryTokenState = React.useState(
      hashParams.type === 'recovery' && hashParams.access_token ? hashParams.access_token : null
    );
    var recoveryToken = recoveryTokenState[0], setRecoveryToken = recoveryTokenState[1];

    var modeState = React.useState('signin');
    var mode = modeState[0], setMode = modeState[1];

    var emailState = React.useState('');
    var email = emailState[0], setEmail = emailState[1];

    var passwordState = React.useState('');
    var password = passwordState[0], setPassword = passwordState[1];

    var errorState = React.useState('');
    var error = errorState[0], setError = errorState[1];

    var loadingState = React.useState(false);
    var loading = loadingState[0], setLoading = loadingState[1];

    var infoState = React.useState('');
    var info = infoState[0], setInfo = infoState[1];

    // Se tem token de recovery na URL, mostra tela de nova senha
    if (recoveryToken) {
      return h(ResetPasswordScreen, {
        accessToken: recoveryToken,
        onDone: function () { setRecoveryToken(null); }
      });
    }

    function validatePassword(pwd) {
      if (pwd.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
      if (!/[A-Z]/.test(pwd)) return 'A senha precisa ter pelo menos 1 letra maiúscula.';
      if (!/[!@#$%^&*(),.?":{}|<>_\-+=~`[\]\\\/;']/.test(pwd)) return 'A senha precisa ter pelo menos 1 caractere especial.';
      return null;
    }

    function sendRecoveryEmail() {
      setError('');
      if (!email.trim()) { setError('Digite seu e-mail primeiro.'); return; }
      setLoading(true);
      fetch(SUPABASE_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      }).then(function () {
        setLoading(false);
        setInfo('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
      }).catch(function () {
        setLoading(false);
        setError('Falha ao enviar e-mail. Tente de novo.');
      });
    }

    function handleSubmit() {
      setError('');
      setInfo('');
      if (!email.trim() || !password) { setError('Preencha e-mail e senha.'); return; }
      if (mode === 'signup') {
        var pwdError = validatePassword(password);
        if (pwdError) { setError(pwdError); return; }
      }

      setLoading(true);
      var action = mode === 'signin' ? SupabaseAuth.signIn(email.trim(), password) : SupabaseAuth.signUp(email.trim(), password);

      action.then(function (session) {
        setLoading(false);
        if (session) {
          onAuthenticated(session);
        } else {
          // signUp sem retorno de sessão = precisa confirmar e-mail antes de logar
          setInfo('Conta criada! Verifique seu e-mail para confirmar antes de entrar.');
          setMode('signin');
        }
      }).catch(function (e) {
        setLoading(false);
        setError(e.message || 'Algo deu errado. Tente de novo.');
      });
    }

    return h('div', { style: S.lockScreen },
      h(Icon, { name: 'plane', size: 26, color: '#5EEAD4', style: { transform: 'rotate(45deg)' } }),
      h('div', { style: S.lockTitle }, mode === 'signin' ? 'ENTRAR' : 'CRIAR CONTA'),

      h('div', { style: { width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 } },
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'E-MAIL'),
          h('input', {
            type: 'email', value: email, style: S.input, autoCapitalize: 'none', autoCorrect: 'off',
            onChange: function (ev) { setEmail(ev.target.value); }
          })
        ),
        h('div', { style: S.formRow },
          h('label', { style: S.formLabel }, 'SENHA'),
          h('input', {
            type: 'password', value: password, style: S.input,
            onChange: function (ev) { setPassword(ev.target.value); },
            onKeyDown: function (ev) { if (ev.key === 'Enter') handleSubmit(); }
          }),
          mode === 'signup' ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6B7280', marginTop: 4, lineHeight: 1.5 } },
            'Mínimo 8 caracteres, 1 letra maiúscula e 1 caractere especial (ex: !@#$%)'
          ) : null
        ),

        error ? h('div', { style: S.errorText }, error) : null,
        info ? h('div', { style: { color: '#5EEAD4', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" } }, info) : null,

        h('button', { style: S.submitBtn, onClick: handleSubmit, disabled: loading },
          loading ? 'AGUARDE...' : (mode === 'signin' ? 'ENTRAR' : 'CRIAR CONTA')
        ),

        mode === 'signin' ? h('button', {
          style: { background: 'transparent', border: 'none', color: '#4B5563', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: 'pointer', padding: '4px 8px' },
          onClick: sendRecoveryEmail,
          disabled: loading
        }, 'ESQUECI A SENHA') : null,

        h('button', {
          style: { background: 'transparent', border: 'none', color: '#6B7280', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: 'pointer', marginTop: 4, padding: 8 },
          onClick: function () { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }
        }, mode === 'signin' ? 'NÃO TEM CONTA? CRIAR AGORA' : 'JÁ TEM CONTA? ENTRAR')
      )
    );
  }

  window.AuthScreen = AuthScreen;
})();
