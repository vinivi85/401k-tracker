/* =========================================================
   LOCK SCREEN — protege o app com PIN numérico + Face/Touch ID
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  /* ---------- Teclado numérico reutilizável ---------- */
  function Keypad(props) {
    var onDigit = props.onDigit;
    var onDelete = props.onDelete;
    var onBiometric = props.onBiometric; // opcional

    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

    return h('div', { style: S.keypad },
      keys.map(function (k) {
        return h('button', { key: k, style: S.keypadBtn, onClick: function () { onDigit(k); } }, k);
      }),
      onBiometric
        ? h('button', { style: S.keypadBtnGhost, onClick: onBiometric }, h(Icon, { name: 'faceid', size: 22 }))
        : h('div', null),
      h('button', { style: S.keypadBtn, onClick: function () { onDigit('0'); } }, '0'),
      h('button', { style: S.keypadBtnGhost, onClick: onDelete }, h(Icon, { name: 'delete', size: 20 }))
    );
  }

  function PinDots(props) {
    var length = props.length, max = props.max, error = props.error;
    var dots = [];
    for (var i = 0; i < max; i++) {
      var style = i < length ? (error ? S.pinDotError : S.pinDotFilled) : S.pinDot;
      dots.push(h('div', { key: i, style: style }));
    }
    return h('div', { style: S.pinDots }, dots);
  }

  var PIN_LENGTH = 6;

  /* ---------- Tela de configuração inicial do PIN ---------- */
  function PinSetup(props) {
    var onDone = props.onDone; // chamado com (lockConfig) quando termina

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
            hashPin(next).then(function (h) {
              onDone({ pinHash: h, biometricEnabled: false, credentialId: null });
            });
          } else {
            setError(true);
            setTimeout(function () {
              setPin('');
              setFirstPin('');
              setStep('create');
              setError(false);
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
      h('div', { style: S.lockTitle }, step === 'create' ? 'CRIE UM PIN DE ACESSO' : 'CONFIRME O PIN'),
      h(PinDots, { length: pin.length, max: PIN_LENGTH, error: error }),
      error ? h('div', { style: S.lockError }, 'PINs não coincidem, tente de novo') : null,
      h(Keypad, { onDigit: handleDigit, onDelete: handleDelete })
    );
  }

  /* ---------- Tela de bloqueio (desbloquear app já configurado) ---------- */
  function LockScreen(props) {
    var lockConfig = props.lockConfig;
    var onUnlock = props.onUnlock;

    var pinState = React.useState('');
    var pin = pinState[0], setPin = pinState[1];

    var errorState = React.useState(false);
    var error = errorState[0], setError = errorState[1];

    var bioTriedState = React.useState(false);
    var bioTried = bioTriedState[0], setBioTried = bioTriedState[1];

    function tryBiometric() {
      verifyBiometric(lockConfig.credentialId).then(function () {
        onUnlock();
      }).catch(function (e) {
        console.error('Biometria falhou ou foi cancelada', e);
      });
    }

    // Tenta biometria automaticamente uma vez ao montar, se estiver habilitada
    React.useEffect(function () {
      if (lockConfig.biometricEnabled && WEBAUTHN_SUPPORTED && !bioTried) {
        setBioTried(true);
        tryBiometric();
      }
    }, []);

    function handleDigit(d) {
      if (pin.length >= PIN_LENGTH) return;
      var next = pin + d;
      setPin(next);
      if (next.length === PIN_LENGTH) {
        verifyPin(next, lockConfig.pinHash).then(function (ok) {
          if (ok) {
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
      h(Keypad, {
        onDigit: handleDigit,
        onDelete: handleDelete,
        onBiometric: (lockConfig.biometricEnabled && WEBAUTHN_SUPPORTED) ? tryBiometric : null
      })
    );
  }

  window.PinSetup = PinSetup;
  window.LockScreen = LockScreen;
  window.PIN_LENGTH = PIN_LENGTH;

  /* ---------- Painel de segurança (gerenciar PIN / Face ID) ---------- */
  function SecurityPanel(props) {
    var lockConfig = props.lockConfig;
    var onChange = props.onChange;
    var onClose = props.onClose;

    var modeState = React.useState('menu'); // 'menu' | 'changePin'
    var mode = modeState[0], setMode = modeState[1];

    var statusState = React.useState('');
    var status = statusState[0], setStatus = statusState[1];

    var savingState = React.useState(false);
    var saving = savingState[0], setSaving = savingState[1];

    function handleToggleBiometric() {
      if (lockConfig.biometricEnabled) {
        onChange(Object.assign({}, lockConfig, { biometricEnabled: false, credentialId: null }));
        setStatus('Face/Touch ID desativado.');
        return;
      }
      setSaving(true);
      setStatus('');
      enrollBiometric().then(function (credId) {
        onChange(Object.assign({}, lockConfig, { biometricEnabled: true, credentialId: credId }));
        setStatus('Face/Touch ID ativado com sucesso.');
        setSaving(false);
      }).catch(function (e) {
        console.error('Falha ao cadastrar biometria', e);
        setStatus('Não foi possível ativar — verifique se seu dispositivo tem Face ID/Touch ID configurado.');
        setSaving(false);
      });
    }

    if (mode === 'changePin') {
      return h(window.PinSetup, {
        onDone: function (newConfig) {
          onChange(Object.assign({}, newConfig, { biometricEnabled: lockConfig.biometricEnabled, credentialId: lockConfig.credentialId }));
          setMode('menu');
          setStatus('PIN atualizado.');
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
          h('div', { style: S.cardHeader },
            h('span', { style: S.cardTitle }, 'PIN DE ACESSO')
          ),
          h('button', { style: S.addBtn, onClick: function () { setMode('changePin'); } }, 'ALTERAR PIN')
        ),

        h('div', { style: S.card },
          h('div', { style: S.cardHeader },
            h('span', { style: S.cardTitle }, 'FACE ID / TOUCH ID'),
            h('span', { style: S.cardSub }, WEBAUTHN_SUPPORTED ? (lockConfig.biometricEnabled ? 'ATIVADO' : 'DESATIVADO') : 'INDISPONÍVEL')
          ),
          !WEBAUTHN_SUPPORTED ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6B7280' } }, 'Este navegador/dispositivo não suporta biometria web.')
            : h('button', {
                style: lockConfig.biometricEnabled ? Object.assign({}, S.addBtn, { color: '#FB7185', borderColor: '#7F1D1D', background: 'transparent' }) : S.addBtn,
                onClick: handleToggleBiometric,
                disabled: saving
              }, saving ? 'AGUARDANDO...' : (lockConfig.biometricEnabled ? 'DESATIVAR' : 'ATIVAR FACE/TOUCH ID')),
          status ? h('div', { style: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#5EEAD4', marginTop: 10 } }, status) : null
        ),

        h('div', { style: S.footer }, 'O PIN É ARMAZENADO COMO HASH, NUNCA EM TEXTO PURO')
      )
    );
  }

  window.SecurityPanel = SecurityPanel;
})();
