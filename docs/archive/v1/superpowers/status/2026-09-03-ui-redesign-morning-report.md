# Rapporto del mattino — redesign d20 Folio (notte 2026-09-03)

## 1. Dove siamo

- Metodo approvato: dossier componente per componente con riferimenti reali (BG3, D&D Beyond, Demiplane, Roll20, Foundry, Solasta, Divinity 2, Hades, Pathbuilder, PrismScroll, open5e, Kanka, LegendKeeper).
- Visione unica (spec nel repo): pannelli scuri quasi opachi con filetto d'oro e graffe agli angoli, serif avorio, titoli centrati tra filetti, glifi in tessere scure, ritratto in anello d'oro con vita sotto, ciano per «è il tuo turno», un solo pulsante d'oro per schermo. Codice BG3 per l'economia delle azioni.
- Componenti approvati: 8 (spiegazione a richiesta). Da giudicare: 1–7 (cockpit), 9–11 (incontro), 12 (posizione senza mappa, A raccomandata).

## 2. Schermi pronti (tutti nella stessa visione)

Telefono: personaggi, cockpit combatti, cockpit incantesimi, incontro con finestra di reazione, campagna/party, compendio, creazione (ingresso e registro). Desktop: cockpit completo, tabellone DM con registro, personaggi, compendio a tre colonne.

## 3. Raccomandazione sul VTT: B, «Owlbear come mappa, d20 Folio come cervello»

Tre opzioni, con l'evidenza raccolta (ricerca Owlbear: SDK, estensioni, prezzi, ToS, 2026):

- **A · Solo dichiarazioni, senza mappa.** È quello che fanno oggi le app senza mappa di maggior successo (Shieldmaiden, Improved Initiative, l'Encounter Builder di D&D Beyond): nessuna posizione. Con le nostre cinque fasce dichiarate una volta siamo già più avanti. Funziona sempre, anche senza wifi. Resta la base in ogni caso.
- **B · A più un'estensione per Owlbear Rodeo 2 (raccomandata).** Le estensioni di Owlbear sono siti statici caricati in un riquadro dentro Owlbear; l'SDK (MIT, stabile, gratuito su ogni piano, anche quello gratuito) espone posizioni dei gettoni, griglia con scala «5 ft» e metrica a scacchiera (la diagonale del 2024), eventi di spostamento, muri della nebbia dinamica, metadati per gettone (dove «Bubbles» già salva PF e CA), messaggi tra client. Da lì si derivano da soli: distanza, adiacenza e portata, fasce, «X esce dalla portata di Y» (attacco di opportunità), chi è dentro un'area disegnata, e una stima della linea di vista dai muri. Restano dichiarate: copertura, gran parte della visibilità, elevazione. L'estensione proietta i nostri PF e stati sui gettoni e riceve i movimenti come **proposte** al registro dell'incontro, che il DM accetta o corregge; il registro resta la verità, la mappa un'ombra. Costo per noi: zero (piani Owlbear gratuiti, nessun costo server nostro). Stime: ponte in sola lettura 2–3 settimane; PF e stati proiettati 1–2 settimane; poi la pubblicazione nel negozio delle estensioni. Rischi noti e gestiti: nessuna identità utente in Owlbear (si accoppia con un codice dall'app), Owlbear non funziona offline (quindi la mappa è sempre opzionale), dipendenza da un team di tre persone (ma SDK MIT e piano gratuito dichiarato pubblicamente).
- **C · Mappa leggera dentro l'app** (griglia, gettoni, righello, niente nebbia). 7–13 settimane di lavoro senior, automatizza esattamente quello che fa B, ma aggiunge costi di archiviazione immagini e sincronizzazione ad alta frequenza su Firebase (posture a costo zero a rischio), prestazioni su telefono, e una superficie in più da mantenere sotto il gate degli screenshot. Da considerare solo se B si dimostra insufficiente all'uso.

**Cosa dice il panorama (61 fonti, 2025–2026):** nel mercato **un solo** assetto rileva gli attacchi di opportunità dalla geometria: Foundry con i moduli midi-qol e Gambit's Premades, e chi lo usa loda l'automazione ma lamenta manutenzione e «tempeste di prompt» (da cui i timer sulle reazioni). Tutti gli altri (Fantasy Grounds, Shard, Roll20, D&D Beyond Maps, Owlbear, Avrae, Shieldmaiden) trattano «chi è in portata» come un fatto umano. La linea tra cervello e mappa si è spostata verso il cervello: le schede 2024 di Roll20, Foundry v4, le schede dentro Maps di D&D Beyond (aprile 2026) e la sincronizzazione delle condizioni (luglio 2026) mettono condizioni, effetti, concentrazione e risorse nella scheda e riducono la mappa a un oracolo di distanze più PF e stati sui gettoni. Chi elogia le mappe leggere dice sempre «punta e clicca»; chi si lamenta chiede la colla con le regole (anelli PF, aree, dadi → danni), mai l'automazione degli attacchi di opportunità. Sigil è morto (server spenti a ottobre 2026); la roadmap di Maps è in ritardo. La raccomandazione del report: restare companion, aggiungere il grafo di ingaggio a coppie più le fasce e gli insiemi di bersagli d'area, cioè esattamente il componente 12; coordinate, griglia, nebbia, luci e geometria della copertura non servono all'automazione.

**In pratica:** oggi giochi già con Owlbear per la mappa e l'app per i dati; B rende quel binomio automatico senza costruire un VTT e senza toccare la costituzione del prodotto. Ogni fatto di posizione avrà una provenienza («dichiarato» o «derivato dalla mappa»), e l'app resta completa anche senza mappa.

## 3b. Analisi elemento per elemento (catalogo dei pattern)

Da circa 180 catture aperte una per una: 23 elementi (shell, riga personaggio, intestazione, editor PF, caratteristiche, abilità, valori vitali, condizioni, economia, riga attacco, incantesimi, inventario, privilegi, blocco statistiche, compendio, campagna, iniziativa, creazione, level-up, tooltip, finestre modali, stati vuoti, impostazioni), ognuno con il pattern dominante, l'esecuzione migliore, le misure lette dalle catture, la variante telefono e gli anti-pattern, più una «lista da copiare» di 23 righe. Le regole nuove che ne derivano (editor PF di Roll20 con «Danno ◄ importo ► Cura» e tiri salvezza contro morte a caselle, righe abilità con scomposizione, caselle di colpire e danno come bersagli, righe incantesimo con V/S/M, inventario con interruttore di equipaggiamento e slot di sintonia, grammatica delle modali, stati vuoti a slot tratteggiato con il verbo dentro, riga impostazione = interruttore più una frase) sono nella spec come componenti 17–27.

## 4. Cosa serve da te

1. Verdetto sul componente 12 (A + B opzionale).
2. Verdetto sulla raccomandazione VTT.
3. Un giro di "cosa stona" sui dossier 1–7 e 9–11, se qualcosa stona.
   Poi si costruisce nell'app, uno schermo alla volta, con screenshot reali.

## Mid-morning update (2026-09-03, after the owner's review)

The owner rejected recommendation B (Owlbear bridge). A grill of ten scenario questions produced
the decisions now recorded in the design spec §1 (items 7–17) and ratified in the constitution
v2.1, golden rule 21, `PRODUCT.md`, `CLAUDE.md` and the `ARCHITECTURE.md` summary:

- The stated end state is "Baldur's Gate 3, but for playing D&D". Online play is the primary
  use case (each player on their own computer with voice chat); the physical table is the
  extension; phones are second screens.
- Built-in map at Owlbear level (image, tokens, grid, ruler, simple fog, scenes, hidden tokens,
  drawing, pointer; no walls, dynamic vision or lighting); the DM can do everything Owlbear does.
- In-app dice by default with a shared 3D animation; manual entry and hidden DM rolls allowed;
  every roll logged with formula and provenance. The "never rolls dice" rule is reversed.
- Total automation with audit: consequences apply automatically; the DM or anyone undoes or
  corrects afterwards; the log records who.
- Homebrew through enforced typed forms and campaign rule toggles.
- Play screen = BG3 HUD over the map; the DM uses the same screen and selecting a creature swaps
  the hotbar. Map storage copies Owlbear's free tier with per-campaign quotas. Staged rollout:
  new sheet and look first, then the play screen.

Delivered after the decisions: dossier 14 (play screen: player view `v8-play.png`, DM view
`v8-play-dm.png`, `dossier6.png`) with spec rules 28–33 (§5f). A reference capture of VTT play
screens (Foundry v13, Roll20 Jumpgate, D&D Beyond Maps, Owlbear 2, Alchemy, Talespire, Fantasy
Grounds, dice systems) and an Owlbear parity checklist are in progress and will extend dossier 14.

Open for the owner: the verdict on dossier 14 and on the components still unjudged (1–7, 9–12).
Owner-only decisions remaining: none blocking; table-play shared display and `DESIGN.md`
replacement follow the first approved surface.
