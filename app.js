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
    var savedTab = 'tracker';
    try {
      var rawTab = window.__dbCache[KEY_ACTIVE_TAB];
      if (rawTab === 'tracker' || rawTab === 'paycheck' || rawTab === 'projection' || rawTab === 'pay') {
        savedTab = rawTab;
      }
    } catch (e) {}

    var tabState = React.useState(savedTab);
    var activeTab = tabState[0], setActiveTab = tabState[1];

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

    return h('div', { style: S.app },
      h('div', { style: S.headerStrip },
        h('div', { style: S.headerLeft },
          h(Icon, { name: 'plane', size: 16, color: '#5EEAD4', style: { transform: 'rotate(45deg)' } }),
          h('span', { style: S.headerLabel }, 'AA 401(K) · FLIGHT DECK')
        ),
        h('div', { style: S.headerRight }, 'OFFLINE-READY')
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
