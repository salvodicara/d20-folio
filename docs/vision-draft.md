# d20 Folio — visione e scoping (bozza dell'8/10/2026)

Bozza concordata con il proprietario in chat. Base per la prossima sessione: si rifinisce con
`grill-with-docs`, poi si trasforma in spec e ticket. Regole di gusto e di lavoro:
[golden-rules-draft.md](golden-rules-draft.md).

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
solo ciò che sa. Il dettaglio si può aggiungere anche dopo. Nessun flusso obbligatorio a più
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

**Rischio principale:** ripetere `v2`, cioè modellare tutto prima di consegnare. Ogni fase deve
arrivare al tavolo prima di aprire la successiva.
