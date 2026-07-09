/* =========================================================
   APP PRINCIPAL — navegação por abas no rodapé
   Aguarda o IndexedDB carregar antes de montar o app de fato,
   para garantir que os dados salvos estejam no cache em memória.
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  function Loading() {
    return h('div', {
      style: { minHeight: '100vh', background: '#0B1120', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5EEAD4', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, letterSpacing: 2 }
    }, 'CARREGANDO DADOS...');
  }

  function App() {
    /* ---------- Estado de autenticação (email/senha) ---------- */
    var authState = React.useState(SupabaseAuth.getSession());
    var session = authState[0], setSession = authState[1];

    function handleAuthenticated(newSession) {
      setSession(newSession);
    }

    function handleSignOut() {
      SupabaseAuth.signOut().then(function () {
        setSession(null);
      });
    }

    var savedTab = 'tracker';
    try {
      var rawTab = window.__dbCache[KEY_ACTIVE_TAB];
      if (rawTab === 'tracker' || rawTab === 'paycheck' || rawTab === 'projection' || rawTab === 'pay') {
        savedTab = rawTab;
      }
    } catch (e) {}

    var tabState = React.useState(savedTab);
    var activeTab = tabState[0], setActiveTab = tabState[1];

    /* ---------- Estado de bloqueio (PIN / biometria) ---------- */
    var rawLockConfig = loadLockConfig();

    // Migração: se o PIN foi criado com 6 dígitos (PIN_LENGTH antigo),
    // limpa o config e força o usuário a criar um PIN novo de 4 dígitos.
    if (rawLockConfig.pinHash && rawLockConfig.pinLength && rawLockConfig.pinLength !== PIN_LENGTH) {
      rawLockConfig = { pinHash: null, biometricEnabled: false, credentialId: null };
      saveLockConfig(rawLockConfig);
    }
    // Se não tem pinLength gravado, o PIN foi criado antes dessa flag existir (6 dígitos).
    // Força re-cadastro também.
    if (rawLockConfig.pinHash && !rawLockConfig.pinLength) {
      rawLockConfig = { pinHash: null, biometricEnabled: false, credentialId: null };
      saveLockConfig(rawLockConfig);
    }

    var lockConfigState = React.useState(rawLockConfig);
    var lockConfig = lockConfigState[0], setLockConfig = lockConfigState[1];

    var hasPin = !!lockConfig.pinHash;
    var unlockedState = React.useState(!hasPin);
    var unlocked = unlockedState[0], setUnlocked = unlockedState[1];

    var securityState = React.useState(false);
    var showSecurity = securityState[0], setShowSecurity = securityState[1];

    var INACTIVITY_LIMIT_MS = 60 * 1000; // 1 minuto sem atividade -> pede PIN de novo
    var LAST_ACTIVITY_KEY = '401k-last-activity';

    function markActivity() {
      try { localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())); } catch (e) {}
    }

    function getIdleMs() {
      try {
        var last = parseInt(localStorage.getItem(LAST_ACTIVITY_KEY), 10);
        if (!last) return Infinity;
        return Date.now() - last;
      } catch (e) {
        return Infinity;
      }
    }

    // Re-bloqueia se o app ficou 1+ minuto sem nenhuma interação do usuário,
    // seja porque foi pro background ou porque ficou aberto e esquecido na tela.
    React.useEffect(function () {
      if (!hasPin) return;

      function checkIdleAndLock() {
        if (getIdleMs() >= INACTIVITY_LIMIT_MS) {
          setUnlocked(false);
        }
      }

      function handleVisibility() {
        if (document.visibilityState === 'visible') {
          checkIdleAndLock();
          markActivity();
        }
      }

      function handleActivity() {
        markActivity();
      }

      // Verifica a cada 10s enquanto o app está em primeiro plano e desbloqueado
      var intervalId = setInterval(function () {
        if (document.visibilityState === 'visible') checkIdleAndLock();
      }, 10000);

      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('pointerdown', handleActivity);
      window.addEventListener('keydown', handleActivity);
      window.addEventListener('touchstart', handleActivity);

      markActivity(); // monta já contando a partir de agora

      return function () {
        clearInterval(intervalId);
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('pointerdown', handleActivity);
        window.removeEventListener('keydown', handleActivity);
        window.removeEventListener('touchstart', handleActivity);
      };
    }, [hasPin]);

    function handlePinSetupDone(newConfig) {
      var withLength = Object.assign({}, newConfig, { pinLength: PIN_LENGTH });
      setLockConfig(withLength);
      saveLockConfig(withLength);
      setUnlocked(true);
      markActivity();
    }

    function handleUnlock() {
      setUnlocked(true);
      markActivity();
    }

    function selectTab(tab) {
      setActiveTab(tab);
      window.__dbCache[KEY_ACTIVE_TAB] = tab;
      idbSet(KEY_ACTIVE_TAB, tab).catch(function () {});
      try { localStorage.setItem(KEY_ACTIVE_TAB, tab); } catch (e) {}
    }

    var TABS = [
      { id: 'tracker', label: 'TRACKER', icon: 'gauge' },
      { id: 'paycheck', label: 'PAYCHECK', icon: 'dollar' },
      { id: 'pay', label: 'PAY', icon: 'receipt' },
      { id: 'projection', label: 'PROJEÇÃO', icon: 'chart' }
    ];

    var content;
    if (activeTab === 'tracker') content = h(window.TrackerTab);
    else if (activeTab === 'paycheck') content = h(window.PaycheckTab);
    else if (activeTab === 'pay') content = h(window.PayTab);
    else content = h(window.ProjectionTab);

    /* ---------- Ordem das telas: Login -> PIN -> App ---------- */
    if (!session) {
      return h(window.AuthScreen, { onAuthenticated: handleAuthenticated });
    }
    if (!hasPin) {
      return h(window.PinSetup, { onDone: handlePinSetupDone });
    }
    if (!unlocked) {
      return h(window.LockScreen, { lockConfig: lockConfig, onUnlock: handleUnlock });
    }

    if (showSecurity) {
      return h(window.SecurityPanel, {
        lockConfig: lockConfig,
        onChange: function (cfg) { setLockConfig(cfg); saveLockConfig(cfg); },
        onClose: function () { setShowSecurity(false); },
        userEmail: session.user.email,
        onSignOut: handleSignOut
      });
    }

    return h('div', { style: S.app },
      h('div', { style: S.headerStrip },
        h('div', { style: S.headerLeft },
          h(Icon, { name: 'plane', size: 16, color: '#5EEAD4', style: { transform: 'rotate(45deg)' } }),
          h('span', { style: S.headerLabel }, 'AA 401(K) · FLIGHT DECK')
        ),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { style: S.headerRight }, 'OFFLINE-READY'),
          h('button', { style: { background: 'transparent', border: 'none', color: '#4B5563', cursor: 'pointer', display: 'flex', padding: 2 }, onClick: function () { setShowSecurity(true); } },
            h(Icon, { name: 'lock', size: 15 })
          )
        )
      ),

      h('div', { style: S.scrollArea }, content),

      h('div', { style: S.bottomNav },
        TABS.map(function (tab) {
          var isActive = activeTab === tab.id;
          return h('button', {
            key: tab.id,
            style: S.navBtn,
            onClick: function () { selectTab(tab.id); }
          },
            h(Icon, { name: tab.icon, size: 18, color: isActive ? '#5EEAD4' : '#4B5563' }),
            h('span', { style: Object.assign({}, S.navLabel, { color: isActive ? '#5EEAD4' : '#4B5563' }) }, tab.label)
          );
        })
      )
    );
  }

  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(h(Loading));

  initStorage().then(function () {
    root.render(h(App));
  }).catch(function (e) {
    console.error('Storage init failed completely', e);
    root.render(h(App)); // renderiza mesmo assim, com cache vazio (vai usar defaults)
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
