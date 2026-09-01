// NutriPlan Pro — Lazy Data Loader
// Permette il caricamento differito e asincrono delle grandi basi dati JS/JSON
(function () {
  const loadedScripts = {};

  const DATA_MAP = {
    db: 'js/db.min.js?v=1',
    ricette: 'js/ricette-db.min.js?v=2080',
    'linee-guida': 'js/linee-guida-data.min.js',
    studi: 'js/studies-data.min.js',
    consigli: 'js/consigli-data.min.js',
  };

  // Variabile globale popolata da ciascuno script, usata per verificare che i
  // dati di QUEL tipo specifico siano davvero caricati (prima si controllava
  // un OR di tutte le variabili insieme, quindi il caricamento di un tipo
  // qualsiasi faceva risultare "già caricati" anche gli altri tipi mai
  // richiesti/falliti).
  const DATA_FLAG = {
    db: () => window.ALL_DB,
    ricette: () => window.RICETTE_DB,
    'linee-guida': () => window.LG_DATA,
    studi: () => window.STUDIES_DATA,
    consigli: () => window.CONSIGLI_DATA,
  };

  window.loadNutriData = function (type) {
    if (loadedScripts[type]) {
      return loadedScripts[type];
    }
    const src = DATA_MAP[type];
    if (!src) {
      return Promise.reject(new Error('Tipo di dati non riconosciuto: ' + type));
    }

    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      const flagFn = DATA_FLAG[type];
      if (existing && (existing.dataset.loaded === 'true' || (flagFn && flagFn()))) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = (err) => {
        delete loadedScripts[type];
        reject(err);
      };
      document.head.appendChild(script);
    });

    loadedScripts[type] = promise;
    return promise;
  };
})();
