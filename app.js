/* =========================================================
   APP PRINCIPAL — navegação por abas no rodapé
   ========================================================= */
(function () {
  'use strict';
  var h = React.createElement;

  function App() {
    var savedTab = (function () {
      try { return localStorage.getItem(KEY_ACTIVE_TAB) || 'tracker'; } catch (e) { return 'tracker'; }
    })();

    var tabState = React.useState(savedTab);
    var activeTab = tabState[0], setActiveTab = tabState[1];

    function selectTab(tab) {
      setActiveTab(tab);
      try { localStorage.setItem(KEY_ACTIVE_TAB, tab); } catch (e) {}
    }

    var TABS = [
      { id: 'tracker', label: 'TRACKER', icon: 'gauge' },
      { id: 'paycheck', label: 'PAYCHECK', icon: 'dollar' },
      { id: 'projection', label: 'PROJEÇÃO', icon: 'chart' }
    ];

    var content;
    if (activeTab === 'tracker') content = h(window.TrackerTab);
    else if (activeTab === 'paycheck') content = h(window.PaycheckTab);
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
  root.render(h(App));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
