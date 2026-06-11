// drug-interactions.js — Database interazioni farmaco-nutriente per NutriPlan Pro
// Ogni voce: farmaci (keyword da cercare nel testo, lowercase), nutriente, tipo ('warning'|'danger'),
// messaggio (testo clinico breve), cibi (alimenti correlati), fonte.
// Fonti indicative: AIFA, EMA, FDA, banche dati interazioni farmaco-nutriente.

const DRUG_INTERACTIONS = [
  { farmaci: ['warfarin', 'coumadin', 'acenocumarolo', 'sintrom', 'warfarina'], nutriente: 'Vitamina K', tipo: 'danger',
    messaggio: 'Mantenere apporto costante di vitamina K. Evitare variazioni brusche nel consumo di verdure a foglia verde (spinaci, cavolo, broccoli). Monitorare INR.',
    cibi: ['spinaci', 'cavolo', 'broccoli', 'lattuga', 'prezzemolo', 'cime di rapa', 'verza'], fonte: 'AIFA' },

  { farmaci: ['metformina', 'glucophage', 'metoformina'], nutriente: 'Vitamina B12', tipo: 'warning',
    messaggio: 'Uso prolungato può ridurre l\'assorbimento di vitamina B12. Monitorare i livelli e valutare supplementazione.',
    cibi: ['carne', 'pesce', 'uova', 'latticini'], fonte: 'AIFA' },

  { farmaci: ['metformina', 'glucophage'], nutriente: 'Alcol', tipo: 'warning',
    messaggio: 'L\'alcol aumenta il rischio di acidosi lattica e ipoglicemia. Limitare/evitare il consumo.',
    cibi: ['alcol', 'vino', 'birra', 'superalcolici'], fonte: 'AIFA' },

  { farmaci: ['atorvastatina', 'rosuvastatina', 'simvastatina', 'pravastatina', 'lovastatina', 'statina', 'statine', 'torvast', 'crestor'], nutriente: 'Succo di pompelmo', tipo: 'warning',
    messaggio: 'Il succo di pompelmo inibisce il CYP3A4 e aumenta i livelli ematici della statina (soprattutto simvastatina e atorvastatina), con rischio di miopatia.',
    cibi: ['pompelmo', 'succo di pompelmo'], fonte: 'EMA' },

  { farmaci: ['ramipril', 'enalapril', 'lisinopril', 'perindopril', 'captopril', 'quinapril', 'ace-inibitore', 'ace inibitore'], nutriente: 'Potassio', tipo: 'danger',
    messaggio: 'Rischio di iperkaliemia. Evitare integratori di potassio e sostituti del sale a base di KCl. Attenzione a cibi molto ricchi di potassio.',
    cibi: ['banana', 'sostituto del sale', 'integratori potassio', 'albicocche secche', 'patate'], fonte: 'AIFA' },

  { farmaci: ['losartan', 'valsartan', 'olmesartan', 'irbesartan', 'candesartan', 'telmisartan', 'sartano', 'sartani'], nutriente: 'Potassio', tipo: 'warning',
    messaggio: 'Rischio di iperkaliemia. Limitare integratori di potassio e sostituti del sale con KCl.',
    cibi: ['banana', 'sostituto del sale', 'integratori potassio'], fonte: 'AIFA' },

  { farmaci: ['idroclorotiazide', 'hctz', 'clortalidone', 'indapamide', 'tiazidico', 'tiazidici'], nutriente: 'Potassio, Sodio, Magnesio', tipo: 'warning',
    messaggio: 'I diuretici tiazidici possono causare ipokaliemia, iponatriemia e ipomagnesemia. Monitorare gli elettroliti; può servire integrazione di potassio.',
    cibi: ['banana', 'spinaci', 'legumi', 'frutta secca'], fonte: 'AIFA' },

  { farmaci: ['furosemide', 'lasix', 'torasemide'], nutriente: 'Potassio, Magnesio, Sodio, Calcio', tipo: 'warning',
    messaggio: 'I diuretici dell\'ansa aumentano l\'escrezione di potassio, magnesio, sodio e calcio. Monitorare elettroliti e valutare integrazione.',
    cibi: ['banana', 'spinaci', 'legumi', 'frutta secca', 'patate'], fonte: 'AIFA' },

  { farmaci: ['levotiroxina', 'eutirox', 'tirosint', 'tiroide', 'l-tiroxina'], nutriente: 'Calcio, Ferro, Soia, Fibre, Caffè', tipo: 'warning',
    messaggio: 'Assumere a stomaco vuoto, 30-60 min prima della colazione. Calcio, ferro, soia, fibre e caffè riducono l\'assorbimento.',
    cibi: ['latte', 'latticini', 'soia', 'caffè', 'integratori di ferro', 'integratori di calcio'], fonte: 'AIFA' },

  { farmaci: ['omeprazolo', 'pantoprazolo', 'lansoprazolo', 'esomeprazolo', 'rabeprazolo', 'inibitore di pompa', 'ppi', 'antiacido', 'antiacidi'], nutriente: 'Ferro, Vitamina B12, Magnesio, Calcio', tipo: 'warning',
    messaggio: 'Uso prolungato riduce l\'assorbimento di ferro, vitamina B12, magnesio e calcio. Monitorare in trattamenti cronici.',
    cibi: ['carne', 'legumi', 'latticini', 'frutta secca'], fonte: 'EMA' },

  { farmaci: ['sertralina', 'fluoxetina', 'paroxetina', 'citalopram', 'escitalopram', 'fluvoxamina', 'ssri', 'zoloft', 'prozac'], nutriente: 'Alcol', tipo: 'danger',
    messaggio: 'Evitare l\'alcol: potenzia sedazione e compromissione cognitiva, peggiora il quadro depressivo.',
    cibi: ['alcol', 'vino', 'birra', 'superalcolici'], fonte: 'AIFA' },

  { farmaci: ['fenelzina', 'tranilcipromina', 'moclobemide', 'maoi', 'i-mao', 'imao', 'selegilina'], nutriente: 'Tiramina', tipo: 'danger',
    messaggio: 'Rischio di crisi ipertensiva. Evitare alimenti ricchi di tiramina: formaggi stagionati, insaccati, vino rosso, prodotti fermentati.',
    cibi: ['formaggi stagionati', 'insaccati', 'vino rosso', 'salame', 'crauti', 'salsa di soia', 'birra'], fonte: 'AIFA' },

  { farmaci: ['prednisone', 'cortisone', 'metilprednisolone', 'desametasone', 'betametasone', 'corticosteroide', 'corticosteroidi', 'deltacortene'], nutriente: 'Calcio, Vitamina D, Potassio, Sodio', tipo: 'warning',
    messaggio: 'Uso prolungato favorisce osteoporosi (perdita calcio), ipokaliemia e ritenzione di sodio. Aumentare calcio/vitamina D, limitare il sodio.',
    cibi: ['latticini', 'sale', 'banana', 'verdure verdi'], fonte: 'AIFA' },

  { farmaci: ['ciclosporina', 'sandimmun', 'neoral'], nutriente: 'Succo di pompelmo, Potassio', tipo: 'danger',
    messaggio: 'Il pompelmo aumenta i livelli del farmaco (rischio tossicità renale). Rischio di iperkaliemia: evitare integratori di potassio.',
    cibi: ['pompelmo', 'succo di pompelmo', 'banana', 'sostituto del sale'], fonte: 'EMA' },

  { farmaci: ['metotrexato', 'methotrexate', 'mtx'], nutriente: 'Acido Folico, Alcol', tipo: 'danger',
    messaggio: 'Evitare l\'alcol (epatotossicità). La supplementazione di acido folico va gestita dal medico per ridurre la tossicità senza annullare l\'efficacia.',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'AIFA' },

  { farmaci: ['tetraciclina', 'doxiciclina', 'minociclina', 'limeciclina', 'tetracicline'], nutriente: 'Calcio, Ferro, Latticini, Antiacidi', tipo: 'warning',
    messaggio: 'Calcio, ferro, latticini e antiacidi formano chelati e riducono l\'assorbimento. Assumere lontano dai pasti a base di latticini (2-3 ore).',
    cibi: ['latte', 'latticini', 'integratori di ferro', 'integratori di calcio', 'antiacidi'], fonte: 'AIFA' },

  { farmaci: ['ciprofloxacina', 'levofloxacina', 'norfloxacina', 'moxifloxacina', 'fluorochinolone', 'fluorochinoloni'], nutriente: 'Calcio, Ferro, Latticini', tipo: 'warning',
    messaggio: 'Latticini, calcio e ferro riducono l\'assorbimento. Assumere 2 ore prima o 6 ore dopo prodotti caseari/integratori.',
    cibi: ['latte', 'latticini', 'integratori di ferro', 'integratori di calcio'], fonte: 'AIFA' },

  { farmaci: ['allopurinolo', 'zyloric'], nutriente: 'Fruttosio, Alcol, Purine', tipo: 'warning',
    messaggio: 'Limitare alcol e cibi ricchi di purine/fruttosio che aumentano l\'uricemia. Mantenere buona idratazione.',
    cibi: ['alcol', 'birra', 'frattaglie', 'frutti di mare', 'bevande zuccherate'], fonte: 'AIFA' },

  { farmaci: ['litio', 'carbolithium'], nutriente: 'Sodio, Caffeina', tipo: 'warning',
    messaggio: 'Variazioni nell\'apporto di sodio modificano la litiemia (dieta iposodica aumenta i livelli). La caffeina può alterare le concentrazioni. Mantenere apporto costante di sodio e idratazione.',
    cibi: ['sale', 'caffè', 'tè', 'bevande energetiche'], fonte: 'AIFA' },

  { farmaci: ['digossina', 'lanoxin', 'digitale'], nutriente: 'Potassio, Calcio, Magnesio, Fibre', tipo: 'danger',
    messaggio: 'Ipokaliemia e ipomagnesemia aumentano la tossicità; l\'ipercalcemia idem. Le fibre ne riducono l\'assorbimento. Monitorare elettroliti.',
    cibi: ['banana', 'spinaci', 'crusca', 'legumi'], fonte: 'AIFA' },

  { farmaci: ['fenitoina', 'dintoina'], nutriente: 'Vitamina D, Acido Folico, Calcio', tipo: 'warning',
    messaggio: 'Aumenta il metabolismo di vitamina D e folati; rischio di osteomalacia. Valutare supplementazione di vitamina D, calcio e folati. Distanziare dalla nutrizione enterale.',
    cibi: ['latticini', 'verdure verdi', 'legumi'], fonte: 'AIFA' },

  { farmaci: ['carbamazepina', 'tegretol'], nutriente: 'Sodio, Vitamina D, Acido Folico, Pompelmo', tipo: 'warning',
    messaggio: 'Può causare iponatriemia e ridurre vitamina D e folati. Il pompelmo aumenta i livelli del farmaco.',
    cibi: ['pompelmo', 'succo di pompelmo', 'verdure verdi'], fonte: 'AIFA' },

  { farmaci: ['clozapina', 'leponex'], nutriente: 'Caffeina', tipo: 'warning',
    messaggio: 'La caffeina aumenta i livelli plasmatici di clozapina. Mantenere apporto costante ed evitare eccessi.',
    cibi: ['caffè', 'tè', 'bevande energetiche', 'cola'], fonte: 'EMA' },

  { farmaci: ['ibuprofene', 'diclofenac', 'naprossene', 'ketoprofene', 'fans', 'nimesulide', 'aspirina', 'acido acetilsalicilico'], nutriente: 'Alcol, Sodio', tipo: 'warning',
    messaggio: 'L\'alcol aumenta il rischio di sanguinamento gastrico. Possono causare ritenzione di sodio/liquidi: limitare il sale, assumere a stomaco pieno.',
    cibi: ['alcol', 'vino', 'birra', 'sale'], fonte: 'AIFA' },

  { farmaci: ['insulina', 'lantus', 'humalog', 'novorapid', 'tresiba'], nutriente: 'Alcol, Carboidrati', tipo: 'warning',
    messaggio: 'L\'alcol può causare ipoglicemia ritardata. Coordinare il timing dei carboidrati con l\'insulina per evitare iper/ipoglicemie.',
    cibi: ['alcol', 'carboidrati', 'zuccheri'], fonte: 'AIFA' },

  { farmaci: ['glipizide', 'glibenclamide', 'gliclazide', 'glimepiride', 'sulfanilurea', 'sulfaniluree'], nutriente: 'Alcol', tipo: 'danger',
    messaggio: 'Rischio di ipoglicemia grave e reazione disulfiram-simile con l\'alcol. Evitare il consumo di alcolici.',
    cibi: ['alcol', 'vino', 'birra', 'superalcolici'], fonte: 'AIFA' },

  { farmaci: ['alendronato', 'risedronato', 'ibandronato', 'acido zoledronico', 'bisfosfonato', 'bisfosfonati', 'fosamax'], nutriente: 'Calcio, Latticini', tipo: 'warning',
    messaggio: 'Assumere a stomaco vuoto con sola acqua, restando in piedi 30 min. Calcio, latticini e integratori riducono drasticamente l\'assorbimento.',
    cibi: ['latte', 'latticini', 'integratori di calcio', 'acqua minerale calcica'], fonte: 'AIFA' },

  { farmaci: ['acido ursodesossicolico', 'ursodiol', 'deursil'], nutriente: 'Antiacidi con alluminio', tipo: 'warning',
    messaggio: 'Gli antiacidi a base di alluminio legano il farmaco e ne riducono l\'assorbimento. Distanziare l\'assunzione.',
    cibi: ['antiacidi', 'antiacidi con alluminio'], fonte: 'AIFA' },

  { farmaci: ['colchicina', 'colchicine'], nutriente: 'Vitamina B12, Pompelmo', tipo: 'warning',
    messaggio: 'Uso prolungato può ridurre l\'assorbimento di vitamina B12. Il pompelmo ne aumenta i livelli e la tossicità.',
    cibi: ['pompelmo', 'succo di pompelmo', 'carne', 'uova'], fonte: 'AIFA' },

  { farmaci: ['spironolattone', 'aldactone', 'eplerenone', 'canrenoato'], nutriente: 'Potassio', tipo: 'danger',
    messaggio: 'Diuretico risparmiatore di potassio: rischio di iperkaliemia. Evitare integratori di potassio e sostituti del sale con KCl.',
    cibi: ['banana', 'sostituto del sale', 'integratori potassio', 'albicocche secche'], fonte: 'AIFA' },

  { farmaci: ['amiodarone', 'cordarone'], nutriente: 'Succo di pompelmo, Iodio', tipo: 'warning',
    messaggio: 'Il pompelmo aumenta i livelli del farmaco. Attenzione all\'apporto di iodio (contenuto elevato di iodio nel farmaco): valutare con cautela alimenti molto iodati.',
    cibi: ['pompelmo', 'succo di pompelmo', 'alghe', 'pesce', 'sale iodato'], fonte: 'EMA' },

  { farmaci: ['tacrolimus', 'prograf', 'advagraf'], nutriente: 'Succo di pompelmo, Potassio', tipo: 'danger',
    messaggio: 'Il pompelmo aumenta i livelli del farmaco (nefrotossicità). Rischio di iperkaliemia: limitare integratori di potassio.',
    cibi: ['pompelmo', 'succo di pompelmo', 'banana', 'sostituto del sale'], fonte: 'EMA' },

  { farmaci: ['eritromicina', 'claritromicina', 'azitromicina', 'macrolide'], nutriente: 'Succo di pompelmo', tipo: 'warning',
    messaggio: 'Il pompelmo può aumentare i livelli plasmatici del macrolide. Evitarne il consumo durante la terapia.',
    cibi: ['pompelmo', 'succo di pompelmo'], fonte: 'EMA' },

  { farmaci: ['isoniazide', 'inh'], nutriente: 'Vitamina B6, Tiramina', tipo: 'warning',
    messaggio: 'Può causare deficit di vitamina B6 (neuropatia): supplementare piridossina. Evitare cibi ricchi di tiramina/istamina (formaggi stagionati, pesce).',
    cibi: ['formaggi stagionati', 'tonno', 'sgombro', 'vino rosso'], fonte: 'AIFA' },

  { farmaci: ['rifampicina', 'rifampin'], nutriente: 'Vitamina D, Vitamina K', tipo: 'warning',
    messaggio: 'Potente induttore enzimatico: riduce vitamina D e K. Valutare supplementazione nei trattamenti prolungati.',
    cibi: ['latticini', 'verdure verdi'], fonte: 'AIFA' },

  { farmaci: ['apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban', 'eliquis', 'xarelto'], nutriente: 'Succo di pompelmo, Alcol', tipo: 'warning',
    messaggio: 'Pompelmo e alcol possono aumentare il rischio di sanguinamento. A differenza del warfarin, la vitamina K non interferisce.',
    cibi: ['pompelmo', 'succo di pompelmo', 'alcol', 'vino', 'birra'], fonte: 'EMA' },

  { farmaci: ['sotalolo'], nutriente: 'Antiacidi con alluminio/magnesio', tipo: 'warning',
    messaggio: 'Gli antiacidi riducono l\'assorbimento del farmaco. Distanziare di almeno 2 ore.',
    cibi: ['antiacidi', 'latticini'], fonte: 'AIFA' },

  { farmaci: ['amlodipina', 'nifedipina', 'verapamil', 'felodipina', 'lacidipina', 'diltiazem', 'calcio-antagonista', 'calcioantagonista'], nutriente: 'Succo di pompelmo', tipo: 'warning',
    messaggio: 'Il pompelmo aumenta i livelli plasmatici (soprattutto felodipina/nifedipina) con rischio di ipotensione. Evitarne il consumo.',
    cibi: ['pompelmo', 'succo di pompelmo'], fonte: 'EMA' },

  { farmaci: ['sildenafil', 'tadalafil', 'vardenafil', 'viagra', 'cialis'], nutriente: 'Alcol, Pompelmo', tipo: 'warning',
    messaggio: 'Alcol e pompelmo aumentano il rischio di ipotensione. Limitarne il consumo.',
    cibi: ['alcol', 'vino', 'pompelmo', 'succo di pompelmo'], fonte: 'EMA' },

  { farmaci: ['orlistat', 'xenical', 'alli'], nutriente: 'Vitamine liposolubili A, D, E, K', tipo: 'warning',
    messaggio: 'Riduce l\'assorbimento di vitamine liposolubili. Assumere un multivitaminico ad almeno 2 ore di distanza (es. alla sera).',
    cibi: ['olio', 'burro', 'verdure verdi', 'frutta secca'], fonte: 'EMA' },

  { farmaci: ['acarbosio', 'glucobay'], nutriente: 'Saccarosio', tipo: 'warning',
    messaggio: 'Il saccarosio (zucchero da tavola) provoca flatulenza e dolori addominali. In caso di ipoglicemia usare glucosio, non saccarosio.',
    cibi: ['zucchero', 'saccarosio', 'dolci'], fonte: 'AIFA' },

  { farmaci: ['deferasirox', 'exjade', 'deferiprone', 'desferal', 'deferoxamina'], nutriente: 'Vitamina C', tipo: 'warning',
    messaggio: 'L\'assunzione di vitamina C va monitorata e gestita dal medico durante la chelazione del ferro. Assumere a stomaco vuoto.',
    cibi: ['agrumi', 'succo di arancia', 'integratori di vitamina C'], fonte: 'EMA' },

  { farmaci: ['azatioprina', 'imuran'], nutriente: 'Alcol, Pompelmo', tipo: 'warning',
    messaggio: 'Evitare alcol (epatotossicità). Mantenere apporto proteico adeguato; monitorare la funzionalità epatica.',
    cibi: ['alcol', 'vino', 'pompelmo'], fonte: 'AIFA' },

  // --- Ulteriori interazioni per raggiungere ~90 ---

  { farmaci: ['solfato ferroso', 'ferro', 'tardyferon', 'ferrograd', 'integratore di ferro'], nutriente: 'Vitamina C, Tè, Caffè, Calcio', tipo: 'warning',
    messaggio: 'Il tè, il caffè e il calcio riducono l\'assorbimento del ferro; la vitamina C lo aumenta. Assumere lontano da latticini e tè, eventualmente con succo d\'arancia.',
    cibi: ['tè', 'caffè', 'latte', 'latticini', 'agrumi'], fonte: 'AIFA' },

  { farmaci: ['propranololo', 'atenololo', 'bisoprololo', 'metoprololo', 'nebivololo', 'betabloccante', 'beta-bloccante'], nutriente: 'Sale, Caffeina', tipo: 'warning',
    messaggio: 'Limitare l\'eccesso di sale (controllo pressorio). La caffeina può ridurre parzialmente l\'effetto antipertensivo.',
    cibi: ['sale', 'caffè', 'bevande energetiche'], fonte: 'AIFA' },

  { farmaci: ['nitroglicerina', 'nitrati', 'isosorbide', 'mononitrato'], nutriente: 'Alcol', tipo: 'danger',
    messaggio: 'L\'alcol potenzia la vasodilatazione con rischio di ipotensione e sincope. Evitarne il consumo.',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'AIFA' },

  { farmaci: ['gabapentin', 'pregabalin', 'lyrica'], nutriente: 'Alcol', tipo: 'warning',
    messaggio: 'L\'alcol potenzia sedazione e capogiri. Evitare o limitare fortemente.',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'AIFA' },

  { farmaci: ['valproato', 'acido valproico', 'depakin'], nutriente: 'Alcol', tipo: 'warning',
    messaggio: 'L\'alcol aumenta sedazione ed epatotossicità. Monitorare peso (possibile aumento) e funzionalità epatica.',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'AIFA' },

  { farmaci: ['lamotrigina', 'lamictal'], nutriente: 'Alcol', tipo: 'warning',
    messaggio: 'L\'alcol può aumentare gli effetti sul SNC e abbassare la soglia convulsiva. Limitarne il consumo.',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'AIFA' },

  { farmaci: ['benzodiazepina', 'diazepam', 'lorazepam', 'alprazolam', 'xanax', 'lormetazepam', 'bromazepam', 'triazolam'], nutriente: 'Alcol, Pompelmo', tipo: 'danger',
    messaggio: 'L\'alcol potenzia gravemente la sedazione e la depressione respiratoria. Il pompelmo aumenta i livelli di alcune benzodiazepine.',
    cibi: ['alcol', 'vino', 'birra', 'pompelmo'], fonte: 'AIFA' },

  { farmaci: ['tramadolo', 'codeina', 'morfina', 'ossicodone', 'fentanil', 'oppioide', 'tapentadolo'], nutriente: 'Alcol', tipo: 'danger',
    messaggio: 'L\'alcol potenzia la depressione respiratoria e la sedazione, con rischio di overdose. Evitare assolutamente.',
    cibi: ['alcol', 'vino', 'birra', 'superalcolici'], fonte: 'AIFA' },

  { farmaci: ['paracetamolo', 'tachipirina', 'acetaminofene'], nutriente: 'Alcol', tipo: 'warning',
    messaggio: 'L\'alcol aumenta il rischio di epatotossicità, soprattutto a dosi elevate o con uso cronico. Limitare l\'alcol.',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'AIFA' },

  { farmaci: ['teofillina', 'aminofillina'], nutriente: 'Caffeina', tipo: 'warning',
    messaggio: 'La caffeina somma gli effetti (tachicardia, nervosismo, insonnia). Ridurre caffè e bevande contenenti caffeina.',
    cibi: ['caffè', 'tè', 'cola', 'cioccolato', 'bevande energetiche'], fonte: 'AIFA' },

  { farmaci: ['ranolazina', 'ranexa'], nutriente: 'Succo di pompelmo', tipo: 'warning',
    messaggio: 'Il pompelmo aumenta i livelli plasmatici del farmaco. Evitarne il consumo.',
    cibi: ['pompelmo', 'succo di pompelmo'], fonte: 'EMA' },

  { farmaci: ['dronedarone', 'multaq'], nutriente: 'Succo di pompelmo', tipo: 'danger',
    messaggio: 'Il pompelmo aumenta marcatamente i livelli del farmaco con rischio di aritmie. Evitarne il consumo.',
    cibi: ['pompelmo', 'succo di pompelmo'], fonte: 'EMA' },

  { farmaci: ['everolimus', 'sirolimus', 'rapamicina'], nutriente: 'Succo di pompelmo', tipo: 'danger',
    messaggio: 'Il pompelmo aumenta i livelli del farmaco immunosoppressore. Evitarne il consumo.',
    cibi: ['pompelmo', 'succo di pompelmo'], fonte: 'EMA' },

  { farmaci: ['nifedipina', 'nimodipina'], nutriente: 'Succo di pompelmo', tipo: 'warning',
    messaggio: 'Il pompelmo aumenta i livelli plasmatici con rischio di ipotensione. Evitarne il consumo.',
    cibi: ['pompelmo', 'succo di pompelmo'], fonte: 'EMA' },

  { farmaci: ['cabergolina', 'bromocriptina'], nutriente: 'Alcol', tipo: 'warning',
    messaggio: 'L\'alcol può ridurre la tolleranza al farmaco e aumentare nausea/ipotensione. Limitarne il consumo.',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'AIFA' },

  { farmaci: ['disulfiram', 'antabuse', 'etiltox'], nutriente: 'Alcol', tipo: 'danger',
    messaggio: 'Reazione grave con qualsiasi quantità di alcol (anche in salse, aceto, dolci, collutori). Evitare ogni forma di alcol.',
    cibi: ['alcol', 'vino', 'birra', 'aceto', 'salse con vino', 'collutori alcolici'], fonte: 'AIFA' },

  { farmaci: ['metronidazolo', 'flagyl', 'tinidazolo'], nutriente: 'Alcol', tipo: 'danger',
    messaggio: 'Reazione disulfiram-simile (nausea, vomito, tachicardia) con l\'alcol. Evitare alcol durante e fino a 48-72 ore dopo la terapia.',
    cibi: ['alcol', 'vino', 'birra', 'aceto'], fonte: 'AIFA' },

  { farmaci: ['linezolid', 'zyvoxid'], nutriente: 'Tiramina', tipo: 'danger',
    messaggio: 'Debole inibitore MAO: rischio di crisi ipertensiva con alimenti ricchi di tiramina. Evitare formaggi stagionati, insaccati, vino rosso.',
    cibi: ['formaggi stagionati', 'insaccati', 'vino rosso', 'salsa di soia', 'crauti'], fonte: 'EMA' },

  { farmaci: ['colestiramina', 'questran', 'colestipolo', 'colesevelam'], nutriente: 'Vitamine liposolubili, Acido Folico, Ferro', tipo: 'warning',
    messaggio: 'Le resine sequestranti riducono l\'assorbimento di vitamine A, D, E, K, folati e ferro. Distanziare gli altri farmaci/nutrienti di alcune ore.',
    cibi: ['olio', 'verdure verdi', 'frutta secca'], fonte: 'AIFA' },

  { farmaci: ['idralazina'], nutriente: 'Vitamina B6', tipo: 'warning',
    messaggio: 'Può aumentare il fabbisogno di vitamina B6 (rischio neuropatia). Valutare supplementazione di piridossina.',
    cibi: ['carne', 'banana', 'patate', 'legumi'], fonte: 'AIFA' },

  { farmaci: ['penicillamina'], nutriente: 'Vitamina B6, Ferro, Calcio, Zinco', tipo: 'warning',
    messaggio: 'Chela diversi minerali e aumenta il fabbisogno di B6. Assumere a stomaco vuoto, lontano da latticini, integratori di ferro/zinco e antiacidi.',
    cibi: ['latticini', 'integratori di ferro', 'integratori di zinco'], fonte: 'AIFA' },

  { farmaci: ['idrossiclorochina', 'plaquenil', 'clorochina'], nutriente: 'Alcol', tipo: 'warning',
    messaggio: 'L\'alcol aumenta il rischio di epatotossicità. Assumere con il cibo per ridurre i disturbi gastrointestinali.',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'AIFA' },

  { farmaci: ['sulfasalazina', 'salazopyrin'], nutriente: 'Acido Folico', tipo: 'warning',
    messaggio: 'Riduce l\'assorbimento di acido folico. Valutare supplementazione di folati.',
    cibi: ['verdure a foglia verde', 'legumi', 'agrumi'], fonte: 'AIFA' },

  { farmaci: ['trimetoprim', 'cotrimossazolo', 'bactrim', 'sulfametossazolo'], nutriente: 'Acido Folico, Potassio', tipo: 'warning',
    messaggio: 'Antagonizza i folati e può causare iperkaliemia. Monitorare potassio; valutare folati in trattamenti prolungati.',
    cibi: ['verdure verdi', 'banana', 'legumi'], fonte: 'AIFA' },

  { farmaci: ['pirimetamina', 'daraprim'], nutriente: 'Acido Folico', tipo: 'warning',
    messaggio: 'Antagonista dei folati: rischio di anemia megaloblastica. Supplementazione con acido folinico secondo indicazione medica.',
    cibi: ['verdure verdi', 'legumi'], fonte: 'AIFA' },

  { farmaci: ['acido folico', 'folati'], nutriente: 'Vitamina B12', tipo: 'warning',
    messaggio: 'Dosi elevate di folati possono mascherare un deficit di vitamina B12. Valutare contestualmente la B12.',
    cibi: ['carne', 'pesce', 'uova', 'latticini'], fonte: 'AIFA' },

  { farmaci: ['warfarin', 'coumadin', 'acenocumarolo'], nutriente: 'Vitamina E, Aglio, Ginkgo, Mirtillo', tipo: 'warning',
    messaggio: 'Integratori e alimenti ad azione antiaggregante (vitamina E ad alte dosi, aglio, ginkgo, mirtillo rosso) possono aumentare il rischio di sanguinamento.',
    cibi: ['aglio', 'ginkgo', 'mirtillo rosso', 'integratori di vitamina E', 'zenzero'], fonte: 'AIFA' },

  { farmaci: ['tiroxina', 'levotiroxina'], nutriente: 'Cavolo, Crucifere, Soia (gozzigeni)', tipo: 'warning',
    messaggio: 'Grandi quantità di alimenti gozzigeni (crucifere crude, soia) possono interferire con la funzione tiroidea. Mantenere un consumo moderato e costante.',
    cibi: ['cavolo', 'broccoli', 'cavolfiore', 'soia', 'rapa'], fonte: 'AIFA' },

  { farmaci: ['enoxaparina', 'eparina', 'fondaparinux'], nutriente: 'Integratori antiaggreganti', tipo: 'warning',
    messaggio: 'Evitare integratori ad azione antiaggregante (omega-3 ad alte dosi, aglio, ginkgo) per il rischio emorragico.',
    cibi: ['aglio', 'ginkgo', 'omega-3 alte dosi', 'zenzero'], fonte: 'AIFA' },

  { farmaci: ['clopidogrel', 'plavix', 'ticagrelor', 'prasugrel'], nutriente: 'Succo di pompelmo, Integratori antiaggreganti', tipo: 'warning',
    messaggio: 'Il pompelmo può alterare l\'efficacia; gli integratori antiaggreganti (aglio, ginkgo, omega-3) aumentano il rischio emorragico.',
    cibi: ['pompelmo', 'aglio', 'ginkgo', 'zenzero'], fonte: 'EMA' },

  { farmaci: ['dabigatran', 'pradaxa'], nutriente: 'Alcol', tipo: 'warning',
    messaggio: 'L\'alcol aumenta il rischio di sanguinamento. Conservare le capsule nella confezione originale (sensibili all\'umidità).',
    cibi: ['alcol', 'vino', 'birra'], fonte: 'EMA' },

  { farmaci: ['empagliflozin', 'dapagliflozin', 'canagliflozin', 'sglt2', 'jardiance', 'forxiga'], nutriente: 'Idratazione, Carboidrati', tipo: 'warning',
    messaggio: 'Aumentano la diuresi e la glicosuria: garantire idratazione adeguata. Rischio di chetoacidosi euglicemica con diete fortemente ipoglucidiche/chetogeniche.',
    cibi: ['acqua', 'carboidrati'], fonte: 'EMA' },

  { farmaci: ['liraglutide', 'semaglutide', 'dulaglutide', 'glp-1', 'ozempic', 'saxenda', 'wegovy'], nutriente: 'Pasti abbondanti/grassi', tipo: 'warning',
    messaggio: 'Rallentano lo svuotamento gastrico: pasti abbondanti o ricchi di grassi peggiorano nausea/sazietà. Preferire pasti piccoli e frazionati.',
    cibi: ['pasti grassi', 'fritti', 'pasti abbondanti'], fonte: 'EMA' },

  { farmaci: ['colestipolo'], nutriente: 'Vitamine liposolubili', tipo: 'warning',
    messaggio: 'Riduce l\'assorbimento di vitamine A, D, E, K. Distanziare l\'assunzione di vitamine e altri farmaci.',
    cibi: ['olio', 'verdure verdi'], fonte: 'AIFA' },

  { farmaci: ['acido tranexamico'], nutriente: 'Vitamina K (alte dosi)', tipo: 'warning',
    messaggio: 'Cautela con assunzioni elevate di vitamina K per il rischio trombotico in soggetti predisposti. Valutazione clinica.',
    cibi: ['verdure a foglia verde'], fonte: 'AIFA' },

  { farmaci: ['warfarin', 'acenocumarolo'], nutriente: 'Tè verde', tipo: 'warning',
    messaggio: 'Il tè verde contiene vitamina K: grandi quantità possono ridurre l\'effetto anticoagulante. Mantenere un consumo costante.',
    cibi: ['tè verde'], fonte: 'AIFA' },

  { farmaci: ['captopril'], nutriente: 'Cibo', tipo: 'warning',
    messaggio: 'Il cibo riduce l\'assorbimento del captopril: assumere preferibilmente 1 ora prima dei pasti.',
    cibi: ['pasti'], fonte: 'AIFA' },

  { farmaci: ['quetiapina', 'olanzapina', 'risperidone', 'aripiprazolo', 'antipsicotico'], nutriente: 'Alcol, Pompelmo', tipo: 'warning',
    messaggio: 'L\'alcol potenzia la sedazione; il pompelmo può aumentare i livelli di alcuni antipsicotici. Monitorare peso e glicemia (rischio metabolico).',
    cibi: ['alcol', 'pompelmo', 'succo di pompelmo'], fonte: 'AIFA' },

  { farmaci: ['warfarin', 'acenocumarolo'], nutriente: 'Avocado, Fegato', tipo: 'warning',
    messaggio: 'Avocado in grandi quantità può ridurre l\'effetto anticoagulante; il fegato è ricchissimo di vitamina K. Mantenere apporto costante.',
    cibi: ['avocado', 'fegato'], fonte: 'AIFA' },

  { farmaci: ['levodopa', 'sinemet', 'madopar', 'carbidopa'], nutriente: 'Proteine, Vitamina B6, Ferro', tipo: 'warning',
    messaggio: 'Le proteine competono con l\'assorbimento della levodopa: distanziare il farmaco dai pasti proteici. Ferro e B6 (senza carbidopa) possono ridurne l\'effetto.',
    cibi: ['carne', 'latticini', 'legumi', 'integratori di ferro'], fonte: 'AIFA' },

  { farmaci: ['acido valproico', 'valproato'], nutriente: 'Carnitina', tipo: 'warning',
    messaggio: 'Può ridurre i livelli di carnitina. Valutare supplementazione in casi selezionati (es. bambini, epatopatia).',
    cibi: ['carne', 'latticini'], fonte: 'AIFA' },

  { farmaci: ['estrogeni', 'estroprogestinico', 'pillola anticoncezionale', 'contraccettivo orale'], nutriente: 'Vitamina B6, Folati, Vitamina C', tipo: 'warning',
    messaggio: 'Possono ridurre i livelli di vitamina B6, folati, B12 e vitamina C. Valutare un\'alimentazione adeguata o supplementazione.',
    cibi: ['verdure verdi', 'agrumi', 'carne'], fonte: 'AIFA' },

  { farmaci: ['lassativi', 'lassativo', 'senna', 'bisacodile'], nutriente: 'Potassio, Calcio', tipo: 'warning',
    messaggio: 'L\'abuso di lassativi causa perdita di potassio e altri elettroliti e malassorbimento. Limitarne l\'uso e monitorare gli elettroliti.',
    cibi: ['banana', 'patate', 'verdure'], fonte: 'AIFA' },

  { farmaci: ['idrossido di magnesio', 'sali di magnesio', 'magnesio'], nutriente: 'Antibiotici, Bisfosfonati', tipo: 'warning',
    messaggio: 'Il magnesio chela diversi farmaci (chinoloni, tetracicline, bisfosfonati) riducendone l\'assorbimento. Distanziare l\'assunzione.',
    cibi: ['integratori di magnesio'], fonte: 'AIFA' },

  { farmaci: ['carbonato di calcio', 'sali di calcio', 'integratore di calcio'], nutriente: 'Ferro, Antibiotici, Levotiroxina', tipo: 'warning',
    messaggio: 'Il calcio riduce l\'assorbimento di ferro, alcuni antibiotici e levotiroxina. Distanziare di almeno 2-4 ore.',
    cibi: ['integratori di calcio', 'latticini'], fonte: 'AIFA' },

  { farmaci: ['zinco', 'solfato di zinco'], nutriente: 'Rame, Ferro, Antibiotici', tipo: 'warning',
    messaggio: 'Lo zinco ad alte dosi riduce l\'assorbimento di rame e ferro e interferisce con chinoloni/tetracicline. Distanziare l\'assunzione.',
    cibi: ['integratori di zinco'], fonte: 'AIFA' },

  { farmaci: ['atazanavir', 'rilpivirina', 'antiretrovirale'], nutriente: 'Antiacidi, PPI, Cibo', tipo: 'warning',
    messaggio: 'L\'assorbimento dipende dall\'acidità gastrica: antiacidi e PPI lo riducono. Alcuni vanno assunti con il cibo. Seguire le indicazioni specifiche.',
    cibi: ['antiacidi', 'pasti'], fonte: 'EMA' },

  { farmaci: ['ketoconazolo', 'itraconazolo', 'antifungino azolico'], nutriente: 'Acidità gastrica, Pompelmo', tipo: 'warning',
    messaggio: 'Necessitano di ambiente acido per l\'assorbimento (assumere con bevanda acida, evitare antiacidi/PPI). Il pompelmo ne altera i livelli.',
    cibi: ['antiacidi', 'pompelmo', 'cola'], fonte: 'EMA' },

  { farmaci: ['voriconazolo'], nutriente: 'Pasti ricchi di grassi', tipo: 'warning',
    messaggio: 'I pasti grassi riducono l\'assorbimento: assumere a stomaco vuoto, 1 ora prima o 2 ore dopo i pasti.',
    cibi: ['pasti grassi', 'fritti'], fonte: 'EMA' },

  { farmaci: ['mercaptopurina', '6-mp'], nutriente: 'Latte (xantina ossidasi)', tipo: 'warning',
    messaggio: 'Assumere a stomaco vuoto; il latte fresco contiene xantina ossidasi che può degradare il farmaco. Evitare assunzione con latticini.',
    cibi: ['latte', 'latticini'], fonte: 'AIFA' },

  { farmaci: ['warfarin', 'acenocumarolo', 'apixaban', 'rivaroxaban'], nutriente: 'Iperico (Erba di San Giovanni)', tipo: 'danger',
    messaggio: 'L\'iperico (integratori per l\'umore) riduce l\'efficacia degli anticoagulanti e di molti altri farmaci. Evitare.',
    cibi: ['iperico', 'erba di san giovanni'], fonte: 'EMA' }
];

if (typeof window !== 'undefined') window.DRUG_INTERACTIONS = DRUG_INTERACTIONS;
