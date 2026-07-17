/* =========================================================
   LOCK SCREEN — PIN de 4 dígitos com token de sessão local.
   Sem WebAuthn/Passkey — funciona nativamente em todos os
   navegadores e PWAs sem depender do iCloud Keychain do iOS.

   Fluxo:
   1. Usuário cria PIN de 4 dígitos (hash SHA-256, nunca em texto puro)
   2. Ao desbloquear corretamente, salva um token de sessão no
      localStorage com timestamp
   3. App verifica o token a cada abertura — se tiver menos de
      5 min desde a última atividade, abre direto sem pedir PIN
   4. Se passar 5 min de inatividade, pede PIN de novo
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  var PIN_LENGTH = 4;
  var SESSION_TOKEN_KEY = '401k-session-token';
  var INACTIVITY_MS = 10 * 60 * 1000; // 10 minutos

  /* ---------- Token de sessão simples (sem WebAuthn) ---------- */
  function generateSessionToken() {
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function saveSessionToken() {
    try {
      var token = { value: generateSessionToken(), ts: Date.now() };
      localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
    } catch (e) {}
  }

  function clearSessionToken() {
    try { localStorage.removeItem(SESSION_TOKEN_KEY); } catch (e) {}
  }

  function isSessionValid() {
    try {
      var raw = localStorage.getItem(SESSION_TOKEN_KEY);
      if (!raw) return false;
      var token = JSON.parse(raw);
      return token && token.ts && (Date.now() - token.ts) < INACTIVITY_MS;
    } catch (e) { return false; }
  }

  function touchSession() {
    try {
      var raw = localStorage.getItem(SESSION_TOKEN_KEY);
      if (!raw) return;
      var token = JSON.parse(raw);
      if (token && token.value) {
        token.ts = Date.now();
        localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(token));
      }
    } catch (e) {}
  }

  /* Expõe pra uso no app.js */
  window.isSessionValid = isSessionValid;
  window.saveSessionToken = saveSessionToken;
  window.clearSessionToken = clearSessionToken;
  window.touchSession = touchSession;

  /* ---------- Componentes visuais ---------- */
  function PinDots(props) {
    var length = props.length, max = props.max, error = props.error;
    var dots = [];
    for (var i = 0; i < max; i++) {
      var style = i < length ? (error ? S.pinDotError : S.pinDotFilled) : S.pinDot;
      dots.push(h('div', { key: i, style: style }));
    }
    return h('div', { style: S.pinDots }, dots);
  }

  function Keypad(props) {
    var onDigit = props.onDigit;
    var onDelete = props.onDelete;
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return h('div', { style: S.keypad },
      keys.map(function (k) {
        return h('button', { key: k, style: S.keypadBtn, onClick: function () { onDigit(k); } }, k);
      }),
      h('div', null), // espaço vazio onde ficava o Face ID
      h('button', { style: S.keypadBtn, onClick: function () { onDigit('0'); } }, '0'),
      h('button', { style: S.keypadBtnGhost, onClick: onDelete }, h(Icon, { name: 'delete', size: 20 }))
    );
  }

  /* ---------- Tela de criação do PIN ---------- */
  function PinSetup(props) {
    var onDone = props.onDone;

    var stepState = React.useState('create'); // 'create' | 'confirm'
    var step = stepState[0], setStep = stepState[1];

    var firstPinState = React.useState('');
    var firstPin = firstPinState[0], setFirstPin = firstPinState[1];

    var pinState = React.useState('');
    var pin = pinState[0], setPin = pinState[1];

    var errorState = React.useState(false);
    var error = errorState[0], setError = errorState[1];

    function handleDigit(d) {
      if (pin.length >= PIN_LENGTH) return;
      var next = pin + d;
      setPin(next);
      setError(false);
      if (next.length === PIN_LENGTH) {
        if (step === 'create') {
          setTimeout(function () {
            setFirstPin(next);
            setPin('');
            setStep('confirm');
          }, 150);
        } else {
          if (next === firstPin) {
            hashPin(next).then(function (hash) {
              onDone({ pinHash: hash, pinLength: PIN_LENGTH });
            });
          } else {
            setError(true);
            setTimeout(function () {
              setPin(''); setFirstPin(''); setStep('create'); setError(false);
            }, 600);
          }
        }
      }
    }

    function handleDelete() {
      setPin(pin.slice(0, -1));
      setError(false);
    }

    return h('div', { style: S.lockScreen },
      h(Icon, { name: 'lock', size: 28, color: '#5EEAD4' }),
      h('div', { style: S.lockTitle }, step === 'create' ? 'CRIE UM PIN DE 4 DÍGITOS' : 'CONFIRME O PIN'),
      h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4B5563', marginBottom: 20, textAlign: 'center' } },
        step === 'create' ? 'Digite 4 dígitos para proteger o app' : 'Digite o PIN novamente para confirmar'
      ),
      h(PinDots, { length: pin.length, max: PIN_LENGTH, error: error }),
      error ? h('div', { style: S.lockError }, 'PINs não coincidem — tente de novo') : null,
      h(Keypad, { onDigit: handleDigit, onDelete: handleDelete })
    );
  }

  /* ---------- Tela de desbloqueio ---------- */
  function LockScreen(props) {
    var lockConfig = props.lockConfig;
    var onUnlock = props.onUnlock;

    var pinState = React.useState('');
    var pin = pinState[0], setPin = pinState[1];

    var errorState = React.useState(false);
    var error = errorState[0], setError = errorState[1];

    function handleDigit(d) {
      if (pin.length >= PIN_LENGTH) return;
      var next = pin + d;
      setPin(next);
      if (next.length === PIN_LENGTH) {
        verifyPin(next, lockConfig.pinHash).then(function (ok) {
          if (ok) {
            saveSessionToken(); // salva token de sessão ao desbloquear
            onUnlock();
          } else {
            setError(true);
            setTimeout(function () { setPin(''); setError(false); }, 500);
          }
        });
      }
    }

    function handleDelete() {
      setPin(pin.slice(0, -1));
      setError(false);
    }

    return h('div', { style: S.lockScreen },
      h(Icon, { name: 'lock', size: 28, color: '#5EEAD4' }),
      h('div', { style: S.lockTitle }, 'DIGITE SEU PIN'),
      h(PinDots, { length: pin.length, max: PIN_LENGTH, error: error }),
      error ? h('div', { style: S.lockError }, 'PIN incorreto') : null,
      h(Keypad, { onDigit: handleDigit, onDelete: handleDelete })
    );
  }

  /* ---------- Componente de versão do app ---------- */
  function AppVersion() {
    var versionState = React.useState(null);
    var versionInfo = versionState[0], setVersionInfo = versionState[1];

    React.useEffect(function () {
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
        setVersionInfo({ version: 'v63', buildDate: '2026-07-17 08:46 UTC' });
        return;
      }
      var mc = new MessageChannel();
      mc.port1.onmessage = function (ev) {
        if (ev.data) setVersionInfo(ev.data);
      };
      navigator.serviceWorker.controller.postMessage({ type: 'GET_VERSION' }, [mc.port2]);
      /* Fallback após 1s se o SW não responder */
      setTimeout(function () {
        setVersionInfo(function (v) { return v || { version: 'v63', buildDate: '2026-07-17 08:46 UTC' }; });
      }, 1000);
    }, []);

    if (!versionInfo) return null;
    return h('span', null,
      'BUILD ' + versionInfo.version + ' · ' + versionInfo.buildDate
    );
  }

  /* ---------- Painel de segurança ---------- */
  function SecurityPanel(props) {
    var lockConfig = props.lockConfig;
    var onChange = props.onChange;
    var onClose = props.onClose;
    var userEmail = props.userEmail;
    var onSignOut = props.onSignOut;

    var modeState = React.useState('menu'); // 'menu' | 'changePin'
    var mode = modeState[0], setMode = modeState[1];

    var statusState = React.useState('');
    var status = statusState[0], setStatus = statusState[1];

    if (mode === 'changePin') {
      return h(window.PinSetup, {
        onDone: function (newConfig) {
          onChange(newConfig);
          setMode('menu');
          setStatus('PIN atualizado com sucesso.');
        }
      });
    }

    return h('div', { style: Object.assign({}, S.app, { justifyContent: 'flex-start' }) },
      h('div', { style: S.headerStrip },
        h('div', { style: S.headerLeft },
          h(Icon, { name: 'lock', size: 16, color: '#5EEAD4' }),
          h('span', { style: S.headerLabel }, 'SEGURANÇA')
        ),
        h('button', { style: { background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }, onClick: onClose }, 'FECHAR')
      ),

      h('div', { style: S.scrollArea },
        h('div', { style: S.card },
          h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'CONTA')),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#9CA3AF', marginBottom: 10 } }, userEmail || ''),
          h('button', { style: Object.assign({}, S.addBtn, { color: '#FB7185', borderColor: '#7F1D1D' }), onClick: onSignOut }, 'SAIR DA CONTA')
        ),

        h('div', { style: S.card },
          h('div', { style: S.cardHeader }, h('span', { style: S.cardTitle }, 'PIN DE ACESSO')),
          h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#4B5563', lineHeight: 1.6, marginBottom: 10 } },
            'O app pede o PIN após 5 minutos de inatividade. O PIN é armazenado como hash — nunca em texto puro.'
          ),
          h('button', { style: S.addBtn, onClick: function () { setMode('changePin'); } }, 'ALTERAR PIN'),
          status ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5EEAD4', marginTop: 10 } }, status) : null
        ),

        h('div', { style: { textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#F9FAFB', letterSpacing: 1, marginTop: 8 } },
          h(AppVersion, null)
        ),
        h('div', { style: { textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#9CA3AF', letterSpacing: 1, marginBottom: 8 } }, 'SESSÃO LOCAL · TIMEOUT 10 MINUTOS DE INATIVIDADE')
      )
    );
  }

  window.PinSetup = PinSetup;
  window.LockScreen = LockScreen;
  window.PIN_LENGTH = PIN_LENGTH;
  window.SecurityPanel = SecurityPanel;
})();
