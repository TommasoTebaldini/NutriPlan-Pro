// api/_fhir.js — carica js/fhir-terminology.js e js/fhir-export.js (pensati
// per il browser, window.FhirTerminology/window.FhirExport) in un vm
// context Node, stesso pattern già usato da _ragSearch.js per i dataset
// linee-guida/ricette. Prefisso `_`: non è una function Vercel a sé, non
// conta verso il limite di 12 function del piano Hobby.

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _cache = null; // { buildBundleForCartella, validateBundleStructure, findUnmapped }

function loadRaw(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

function loadFhirModules() {
  if (_cache) return _cache;

  const sandbox = { console };
  sandbox.window = sandbox; // window.X = ... nell'IIFE finisce direttamente sul sandbox
  vm.createContext(sandbox);

  vm.runInContext(loadRaw('js/fhir-terminology.js'), sandbox, { filename: 'fhir-terminology.js' });
  vm.runInContext(loadRaw('js/fhir-export.js'), sandbox, { filename: 'fhir-export.js' });

  const FhirTerminology = vm.runInContext('FhirTerminology', sandbox);
  const FhirExport = vm.runInContext('FhirExport', sandbox);
  if (!FhirTerminology || !FhirExport) {
    throw new Error('js/fhir-terminology.js o js/fhir-export.js non hanno esposto i globali attesi');
  }

  _cache = {
    buildBundleForCartella: FhirExport.buildBundleForCartella,
    validateBundleStructure: FhirExport.validateBundleStructure,
    findUnmapped: FhirTerminology.findUnmapped,
  };
  return _cache;
}

export { loadFhirModules };
