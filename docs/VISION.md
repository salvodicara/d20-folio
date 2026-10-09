# d20 Folio — visione e scoping (8/10/2026)

Concordata con il proprietario. Ogni fase si dettaglia con `grill-with-docs`, poi spec e ticket. Regole di gusto e di lavoro:
[GOLDEN_RULES.md](GOLDEN_RULES.md).

## Cos'è Folio

Scheda digitale, compagno di sessione e memoria del gioco per due gruppi che giocano al tavolo o su
Owlbear e altri VTT. Folio non sostituisce il VTT (mappe, token, video): fa scheda, combattimento,
campagna e resoconto. Prodotto per noi, non commerciale. Dadi veri, l'app non tira.

**Obiettivo d'esperienza:** giocare senza pensare ai calcoli né prendere appunti, senza perdere la
libertà del tavolo (homebrew, override). Il DM si diverte come gli altri: la traccia di tutto si
crea da sola e diventa un resoconto deterministico, da dare a un'AI per il riassunto di sessione.

## Principio: dichiarazione minima

Ogni evento è valido con il minimo («-14 PF», «Ira»). Chi, su chi, da cosa e quanto sono
facoltativi: se ci sono il motore li usa, se mancano tutto funziona lo stesso e il resoconto dice
solo ciò che sa. Il dettaglio si può aggiungere anche dopo. Ogni azione ha tre velocità, tutte sempre disponibili.
Esempio, _Cura Ferite_: **precisa** (scegli chi curi e l'app aggiunge i PF), **salta** (un tocco:
scala lo slot e basta), **diretta** (scali lo slot dalla scheda, come oggi). Chi è preciso ottiene
più automazione; chi è pigro non viene mai bloccato. Il combattimento è concitato e deve scorrere.
Si parte da ciò che c'è oggi e funziona: si migliorano database, automazione e aspetto, copiando
gli schemi migliori (BG3, Foundry, D&D Beyond). Nessun flusso obbligatorio a più
schermate («200 schermate per un attacco» è il difetto da eliminare).

## Modello a strati

1. **Catalogo.** Regole 2024 come dati (SRD pubblico, il resto nel `content-pack/` privato):
   incantesimi, privilegi, oggetti, mostri, ognuno con Grant (cosa modifica) e Azioni (cosa si può
   fare: costo, bersagli, effetti, durata).
2. **Entità.** PG, mostri e PNG, anche improvvisati (solo nome e PF).
3. **Registro.** Uno per sessione, condiviso fra dispositivi; ogni gesto è un evento (combattimento,
   esplorazione, riposi, bottino, progressione). Uno scontro è un tratto del registro.
4. **Stato.** PF, risorse, condizioni e timer si ricavano dal registro.
5. **Viste.** Scheda, combattimento, campagna, resoconto deterministico, export.

Inserimento: sia ognuno dal proprio dispositivo, sia il DM per tutti; deve funzionare in entrambi i
modi.

## Fasi (ognuna rilasciata; l'app funziona sempre)

| #   | Fase                                                                                       | Valore al tavolo                                           |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1   | Registro unico di sessione condiviso, eventi con campi facoltativi (estende `CombatEvent`) | Niente più appunti; primo resoconto deterministico         |
| 2   | Stati e timer (Ira, concentrazione, durate)                                                | Un tocco per attivare, scadono da soli                     |
| 3   | Mostri e PNG nello scontro, da catalogo o improvvisati                                     | Il resoconto sa chi ha colpito chi                         |
| 4   | Riposi, risorse, fuori dallo scontro                                                       | Riposi in un tocco, incantesimi in esplorazione registrati |
| 5   | Bottino, economia, progressione                                                            | Resoconto di sessione completo                             |
| 6   | Homebrew con gli stessi Grant e Azioni                                                     | Le regole del gruppo funzionano come quelle ufficiali      |

In parallelo e separati: rifacimento della Campagna (input: intervista di d20-studio,
`codex/visual-01:docs/interview/pages/campaign.md` e `CAMPAIGN_FLOW.md`), scelta dello stile visivo
vedendo esempi su schermate vere, immagini (ritratti; illustrazioni di incantesimi e azioni), export
alla scheda ufficiale 2024 (bassa priorità).

## Metodo

Nessuna riscrittura: ristrutturazione progressiva, un'area alla volta, blindata da test sul
comportamento attuale prima di semplificarla. Si parte da una mappa dell'architettura attuale
contro questo modello (`improve-codebase-architecture`), senza toccare codice. File da guardare
per primi: `src/lib/smart-tracker.ts`, `src/lib/mechanics-*.ts`, `src/lib/grants.ts`,
`src/stores/characterStore.ts`, `src/features/character/center/CombatResolver.tsx`,
`src/types/combat-log.ts`. Il ramo `v2` (tag `archive/2026-10-08-v2`) è una cava di pezzi: si
recupera solo ciò che serve, un pezzo alla volta.

**Da rivedere più avanti:** CI/CD (hook git, gate di pre-push, workflow GitHub, deploy) e i 40
avvisi Dependabot, in proporzione al progetto: veloci, affidabili, senza passaggi rituali.

**Al traguardo:** mappe dell'architettura navigabili, fatte con `archify`, più al massimo uno o
due strumenti di visualizzazione del codice scelti dopo una ricerca (solo i migliori), per capire e
navigare il sistema.

**Rischio principale:** ripetere `v2`, cioè modellare tutto prima di consegnare. Ogni fase deve
arrivare al tavolo prima di aprire la successiva.

## Decisioni di interazione (8/10/2026)

- **Azioni: il tocco registra subito, i dettagli sono una riga in linea facoltativa.** Esempio:
  tocco «Spada lunga» → registrato, Azione scalata; sotto compare una riga (bersaglio,
  colpito/mancato, danno) che si può ignorare o completare anche dopo dal registro. Mai finestre
  bloccanti. Stesso schema per cure, incantesimi ad area, pozioni.
  **Bersaglio (9/10, sostituisce la riga per il bersaglio):** fra la scelta dell'azione (e dello
  slot) e la registrazione c'è uno schermo «Su chi?» saltabile, come quando si sceglie il nemico
  da attaccare; quanti bersagli si possono scegliere dipende da ogni incantesimo o azione. Appare
  solo se la scelta cambia qualcosa (uno scontro con creature, o uno stato che si accende su di te).
  Mai scelte dentro il toast di Annulla.
- **Danni ai PG:** li può inserire sia il giocatore sulla propria scheda sia il DM dal suo
  pannello; l'altro vede l'aggiornamento.
- **Iniziativa:** in Folio ma facoltativa. Se il DM apre lo scontro, Folio gestisce turni e timer;
  altrimenti «nuovo round» a mano.
- **Resoconto:** cronaca per round.
- **PF dei mostri:** il DM sceglie per scontro se i giocatori vedono numeri, solo uno stato
  (illeso/ferito/sanguinante/quasi morto) o niente.
- **Correzioni:** ognuno corregge le proprie righe, il DM tutte; ogni correzione ricalcola stati e
  resoconto.
- **Sessione:** si apre da sola alla prima azione e si chiude dopo un periodo di inattività; il DM
  può anche aprirla, chiuderla, rinominarla o dividerla a mano.
- **Incantesimi che agiscono su chi li lancia (8/10):** il lancio attiva subito l'effetto con il
  suo contatore (Scudo +5 CA, Marchio del Cacciatore), dal libro come dal tasto reazione; annulla
  lo spegne. Quelli che possono andare su un alleato (Armatura Magica, Benedizione) aspettano la
  riga facoltativa del bersaglio.
- **Mostri:** scontri preparati prima dal catalogo, mostri aggiunti al volo (anche solo nome e PF)
  e mostri homebrew, tutti supportati.
