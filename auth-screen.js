/* =========================================================
   AUTH SCREEN — login e cadastro por e-mail/senha (Supabase Auth)
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  function AuthScreen(props) {
    var onAuthenticated = props.onAuthenticated;

    var modeState = React.useState('signin'); // 'signin' | 'signup'
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

    function handleSubmit() {
      setError('');
      setInfo('');
      if (!email.trim() || !password) { setError('Preencha e-mail e senha.'); return; }
      if (mode === 'signup' && password.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return; }

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
          })
        ),

        error ? h('div', { style: S.errorText }, error) : null,
        info ? h('div', { style: { color: '#5EEAD4', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" } }, info) : null,

        h('button', { style: S.submitBtn, onClick: handleSubmit, disabled: loading },
          loading ? 'AGUARDE...' : (mode === 'signin' ? 'ENTRAR' : 'CRIAR CONTA')
        ),

        h('button', {
          style: { background: 'transparent', border: 'none', color: '#6B7280', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, cursor: 'pointer', marginTop: 4, padding: 8 },
          onClick: function () { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }
        }, mode === 'signin' ? 'NÃO TEM CONTA? CRIAR AGORA' : 'JÁ TEM CONTA? ENTRAR')
      )
    );
  }

  window.AuthScreen = AuthScreen;
})();
