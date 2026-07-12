// js/fatturapa.js — Generatore XML FatturaPA (formato FPR12, fatture verso
// privati) per pagamenti.html. Pura generazione documento: QUESTA APP NON
// TRASMETTE ALLO SDI — serve un canale accreditato (PEC allo SDI, un
// intermediario, o un accreditamento diretto con certificato digitale) che
// il dietista deve avere per conto proprio. L'XML generato qui va scaricato
// e inviato tramite quel canale.
//
// Copre solo il caso comune "dietista libero professionista → paziente
// privato" (CessionarioCommittente = persona fisica, CodiceDestinatario
// "0000000" come da specifiche tecniche SDI per i privati):
//   - NIENTE ritenuta d'acconto: si applica solo quando il committente è un
//     sostituto d'imposta (aziende/PA), mai per un cliente privato — quindi
//     omessa sempre, a prescindere dal regime del dietista.
//   - NIENTE cassa previdenziale (es. contributo ENPAB 4% per i biologi
//     nutrizionisti iscritti): non gestita, se applicabile il dietista deve
//     aggiungerla a mano o rivolgersi al proprio commercialista.
//   - Regime forfettario (RF19): operazione esente IVA, Natura "N2.2",
//     marca da bollo virtuale automatica se l'importo supera 77,47€ (soglia
//     di legge per l'esenzione dal bollo sulle fatture senza IVA).
//   - Regime ordinario (RF01): IVA standard sull'aliquota scelta, nessuna
//     esenzione, nessun bollo.
//
// SEMPRE segnalare in UI che è una bozza da verificare col proprio
// commercialista prima dell'invio — non è un software di contabilità.

const BOLLO_SOGLIA = 77.47;
const BOLLO_IMPORTO = 2.00;

function xmlEscape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtImporto(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function splitNomeCognome(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return { nome: parts[0] || 'Paziente', cognome: '-' };
  return { cognome: parts.pop(), nome: parts.join(' ') };
}

// Valida i campi minimi indispensabili perché l'XML sia strutturalmente
// completo — ritorna un array di messaggi di errore (vuoto = tutto ok).
function validaDatiFatturaPA({ fiscal, fattura }) {
  const errs = [];
  if (!fiscal?.fiscal_partita_iva) errs.push('Partita IVA del dietista mancante (Impostazioni → Dati fiscali)');
  if (!fiscal?.fiscal_codice_fiscale) errs.push('Codice fiscale del dietista mancante (Impostazioni → Dati fiscali)');
  if (!fiscal?.fiscal_ragione_sociale) errs.push('Nome/ragione sociale del dietista mancante (Impostazioni → Dati fiscali)');
  if (!fiscal?.fiscal_indirizzo || !fiscal?.fiscal_cap || !fiscal?.fiscal_comune || !fiscal?.fiscal_provincia) {
    errs.push('Indirizzo dello studio incompleto (Impostazioni → Dati fiscali)');
  }
  if (!fattura?.codice_fiscale_paziente) errs.push('Codice fiscale del paziente mancante (obbligatorio per la fattura elettronica)');
  if (!fattura?.indirizzo_paziente || !fattura?.cap_paziente || !fattura?.comune_paziente || !fattura?.provincia_paziente) {
    errs.push('Indirizzo del paziente incompleto');
  }
  if (!fattura?.numero_fattura) errs.push('Numero fattura mancante');
  if (!fattura?.importo || fattura.importo <= 0) errs.push('Importo non valido');
  return errs;
}

// Genera il nome file secondo la convenzione SDI: IT<PIVA><progressivo a 5 cifre>.xml
function nomeFileFatturaPA(fiscal, progressivo) {
  const piva = String(fiscal.fiscal_partita_iva || '').replace(/\D/g, '');
  return `IT${piva}_${String(progressivo).padStart(5, '0')}.xml`;
}

// fiscal: riga profiles del dietista (fiscal_*)
// fattura: riga fatture (+ campi paziente)
// progressivo: intero, da fiscal_progressivo_invio + 1 (il chiamante lo persiste dopo)
function generaXmlFatturaPA({ fiscal, fattura, progressivo }) {
  const errs = validaDatiFatturaPA({ fiscal, fattura });
  if (errs.length) throw new Error(errs.join(' • '));

  const isForfettario = fiscal.fiscal_regime === 'RF19';
  const aliquota = isForfettario ? 0 : (Number(fattura.aliquota_iva) || 22);
  const natura = isForfettario ? 'N2.2' : (fattura.natura_iva || null);
  const imponibile = Number(fattura.importo);
  const imposta = isForfettario ? 0 : fmtImporto(imponibile * (aliquota / 100));
  const bolloNecessario = isForfettario && imponibile > BOLLO_SOGLIA;
  const totale = fmtImporto(imponibile + Number(isForfettario ? 0 : imposta) + (bolloNecessario ? BOLLO_IMPORTO : 0));

  const { nome: nomePaz, cognome: cognomePaz } = splitNomeCognome(fattura.patient_name);
  const progNum = String(progressivo).padStart(5, '0');
  const dataFattura = String(fattura.data_fattura).slice(0, 10);

  const causaleNote = isForfettario
    ? 'Operazione effettuata ai sensi dell\'art. 1, commi 54-89, L. 190/2014 (regime forfettario) - operazione non soggetta a ritenuta d\'acconto ai sensi dell\'art. 1 comma 67 L. 190/2014'
    : (fattura.note || fattura.tipo_visita || 'Prestazione professionale');

  const bolloXml = bolloNecessario
    ? `        <DatiBollo>\n          <BolloVirtuale>SI</BolloVirtuale>\n          <ImportoBollo>${fmtImporto(BOLLO_IMPORTO)}</ImportoBollo>\n        </DatiBollo>\n`
    : '';

  const naturaLineaXml = natura ? `          <Natura>${xmlEscape(natura)}</Natura>\n` : '';
  const naturaRiepilogoXml = natura ? `          <Natura>${xmlEscape(natura)}</Natura>\n` : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${xmlEscape(fiscal.fiscal_partita_iva)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${progNum}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>0000000</CodiceDestinatario>
    </DatiTrasmissione>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${xmlEscape(fiscal.fiscal_partita_iva)}</IdCodice>
        </IdFiscaleIVA>
        <CodiceFiscale>${xmlEscape(fiscal.fiscal_codice_fiscale)}</CodiceFiscale>
        <Anagrafica>
          <Denominazione>${xmlEscape(fiscal.fiscal_ragione_sociale)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${xmlEscape(fiscal.fiscal_regime || 'RF19')}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${xmlEscape(fiscal.fiscal_indirizzo)}</Indirizzo>
        <CAP>${xmlEscape(fiscal.fiscal_cap)}</CAP>
        <Comune>${xmlEscape(fiscal.fiscal_comune)}</Comune>
        <Provincia>${xmlEscape(fiscal.fiscal_provincia)}</Provincia>
        <Nazione>IT</Nazione>
      </Sede>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <CodiceFiscale>${xmlEscape(fattura.codice_fiscale_paziente)}</CodiceFiscale>
        <Anagrafica>
          <Nome>${xmlEscape(nomePaz)}</Nome>
          <Cognome>${xmlEscape(cognomePaz)}</Cognome>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${xmlEscape(fattura.indirizzo_paziente)}</Indirizzo>
        <CAP>${xmlEscape(fattura.cap_paziente)}</CAP>
        <Comune>${xmlEscape(fattura.comune_paziente)}</Comune>
        <Provincia>${xmlEscape(fattura.provincia_paziente)}</Provincia>
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${dataFattura}</Data>
        <Numero>${xmlEscape(fattura.numero_fattura)}</Numero>
${bolloXml}        <ImportoTotaleDocumento>${totale}</ImportoTotaleDocumento>
        <Causale>${xmlEscape(causaleNote)}</Causale>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>${xmlEscape(fattura.tipo_visita || 'Prestazione professionale')}</Descrizione>
        <Quantita>1.00</Quantita>
        <PrezzoUnitario>${fmtImporto(imponibile)}</PrezzoUnitario>
        <PrezzoTotale>${fmtImporto(imponibile)}</PrezzoTotale>
        <AliquotaIVA>${fmtImporto(aliquota)}</AliquotaIVA>
${naturaLineaXml}      </DettaglioLinee>
      <DatiRiepilogo>
        <AliquotaIVA>${fmtImporto(aliquota)}</AliquotaIVA>
${naturaRiepilogoXml}        <ImponibileImporto>${fmtImporto(imponibile)}</ImponibileImporto>
        <Imposta>${fmtImporto(Number(imposta))}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>
`;
}

function scaricaXmlFatturaPA(xmlString, filename) {
  const blob = new Blob([xmlString], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
