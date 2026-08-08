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
      if (existing && (existing.dataset.loaded === 'true' || window.ALL_DB || window.LG_DATA || window.STUDIES_DATA || window.CONSIGLI_DATA)) {
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
