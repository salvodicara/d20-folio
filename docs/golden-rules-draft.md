# d20 Folio — regole d'oro (bozza da rifinire nell'intervista)

Bozza dell'8/10/2026. Riassume mesi di regole sparse in poche righe, da usare con Claude Code e con
Codex. Direzione di partenza: `main` è il prodotto, cioè una scheda digitale flessibile più il
tracker di combattimento e di campagna, per un gruppo che gioca dal vivo con dadi veri. L'obiettivo
di automatizzare tutte le regole è abbandonato. ❓ = fonti in contrasto o regola che il proprietario
potrebbe non volere più: ognuna diventa una domanda dell'intervista.

Abbreviazioni delle fonti. `GR#n @main` = `docs/GOLDEN_RULES.md` su `origin/main` (3282839a);
`@v2` = su `origin/v2` (2158b7f6); `@pre` = la versione lunga prima della semplificazione
(aa46a09e^); un altro `@sha` indica il commit che ha introdotto la regola. `COST §` =
`docs/PRODUCT_CONSTITUTION.md` su main. `PROD` = `PRODUCT.md` su main. `DEC aaaa-mm-gg` =
`docs/program/DECISIONS.md` su v2. `I-nnn` = decisioni dell'intervista di d20-studio.

## Gusto e prodotto

1. **Prima copia i migliori, poi falli meglio. Non inventare.** Per scheda e libreria il modello è
   D&D Beyond, per il combattimento BG3, per la campagna Kanka. Si copiano schemi e logiche, mai
   immagini o altri asset. _Perché:_ «ogni volta che fai a modo tuo, fai un casino». —
   GR#30 @2158b7f6, DEC 2026-09-03, DEC 2026-09-09, I-236, I-252
2. **Solo il necessario, e tutto il necessario.** Ogni elemento deve guadagnarsi il posto; nel
   dubbio si toglie. Una sola strada per fare ogni cosa. — GR#19 @main, COST §4.15, DEC 2026-09-06
3. **Le informazioni si aprono per gradi.** Le cose comuni si vedono a colpo d'occhio, i dettagli
   si aprono a richiesta, senza pagine in più. L'esperto va veloce e il principiante può imparare.
   — COST §2.3, PROD principio 1, DEC 2026-09-09
4. **Flessibilità manuale prima di tutto.** Quello che l'app calcola si può sempre sovrascrivere a
   mano. Il tavolo deve poter rappresentare qualsiasi cosa: contatori, stati, risorse
   personalizzate. ❓ GR#8 dice che una correzione manuale «non scusa un calcolo mancante»: vale
   ancora, o basta calcolare l'aritmetica ovvia? — GR#8 @main, I-086, I-160, direzione 2026-10-08
5. **Si può sempre correggere.** Annulla e correggi devono restare disponibili anche dopo altre
   azioni. Undo non ritira mai i dadi. _Perché:_ «gli umani sbagliano». — I-028, I-229,
   GR#21 @main
6. **Semplice anche per chi è pigro.** Per giocare non si compila niente di obbligatorio. Meglio un
   comando chiaro che un'istruzione in più. Gli strumenti del DM aiutano ma non sono mai
   obbligatori. — I-058, PROD 2026-09-22, COST §2.9, I-236
7. **Durante il gioco si modifica sul posto.** Al tavolo non si passa da una «modalità modifica»,
   e i campi non permettono di inserire valori sbagliati, invece di segnalarli dopo. — COST §2.8,
   GR#20 @main
8. **Numeri trasparenti.** Ogni totale mostra da dove viene, e il turno dice subito cosa puoi
   ancora fare: azioni, slot, cariche. — I-027 (Q058), COST §2.1, §2.6
9. **Scegliere è un momento importante.** Prima leggi, poi scegli: sfogliare non decide niente. Le
   opzioni non idonee vengono nascoste, non mostrate in grigio, e le scelte che ne derivano si
   aprono sotto la scelta che le ha causate. — COST §2.7
10. **Premium e un po' magico, stile BG3.** Mai l'aspetto di una dashboard, di un SaaS, di una
    pratica alle poste o di una pergamena ovunque. Lo sfarzo visivo va a ciò che il giocatore sta
    decidendo, non alla decorazione. ❓ Lo stile BG3 approvato in d20-studio vale anche per Folio
    (oggi «Tactical Codex»)? Tema solo scuro (DEC 2026-09-05) o scuro più chiaro (PROD, I-248)?
    — I-253, I-255, PROD Anti-references, COST §4.16, DEC 2026-09-09
11. **Il diavolo sta nei dettagli.** Un solo sistema coerente: margini, spaziature, posizione e
    misura dei comandi. Il testo che identifica qualcosa non si tronca mai a metà. _Perché:_ sono
    i difetti che fanno sembrare l'app «AI slop» o poco professionale. — I-250, I-255, COST §4.17,
    GR#27 @pre (2026-07-31)
12. **Laptop prima, telefono comodo.** ❓ PROD/COST chiedono tutte le funzioni anche sul telefono,
    ma il gruppo gioca dal laptop (I-101, I-129). Il telefono serve a tutto o al gioco rapido?
    — PROD principio 5, COST §3, I-129
13. **Dadi veri; l'app registra e fa le somme.** ❓ Su main l'app non tira mai i dadi (GR#21),
    mentre v2 e d20-studio li tirano in app per chi lo sceglie (DEC 2026-09-03, I-032). La nuova
    direzione indica i dadi veri: confermare? — GR#21 @main, COST §2.2
14. **Immagini curate al posto di icone generiche.** ❓ Il proprietario voleva illustrazioni ispirate
    a BG3, generate e mai copiate, per incantesimi e azioni. Vale anche per Folio adesso? —
    DEC 2026-09-09, I-253

## Modo di lavorare

1. **Una sessione = un branch con un nome chiaro, nel checkout principale.** I worktree servono
   solo quando lavorano davvero più sessioni in parallelo. Commit piccoli in stile Conventional
   Commits, con il proprietario come unico autore (niente righe co-author). — direzione
   2026-10-08 (sostituisce GR#11), GR#11 @main
2. **Decidi tu i dettagli tecnici e quelli di interfaccia ovvi.** Chiedi solo per gusto o direzione
   del prodotto, costi, privacy o azioni irreversibili. ❓ I-180/I-202 dicono «non chiedere le
   cose ordinarie», mentre I-253 dice «nel dubbio fermati e chiedi»: dove sta il confine?
   — GR @main «Decision boundary», I-180, I-190, I-202, I-253
3. **Quando chiedi, fai una domanda sola, chiara, con esempi e senza gergo.** _Perché:_ «il mio
   cervello ragiona per esempi». — I-248, I-253, I-202
4. **Se una richiesta di UX è ambigua, chiarisci prima di scrivere codice** (con grill-with-docs).
   _Perché:_ «se non capisci cosa intendo, fammi domande prima di toccare codice». —
   GR#26 @5102810d
5. **Ogni modifica visiva va mostrata con screenshot veri.** Ritagliati sulla zona cambiata, prima
   e dopo, mandati come immagini in chat (un percorso di file non basta). ❓ Il proprietario deve
   approvarli prima del merge su main? Oggi è un blocco (dopo un'ondata di grafica non approvata
   finita su main e tolta a mano); serve ancora per un progetto solo hobby? —
   GR#25 @d27eebca, GR#15 @378572e8, I-230, I-248
6. **Prima la stabilità, poi le funzioni nuove.** Si finisce il lavoro in corso, si sistemano i
   bug noti e solo dopo si apre altro. — GR#27 @main
7. **Cerca la causa vera e blindala con un test che prima fallisce** (tdd, diagnosing-bugs). Mai
   tappare il sintomo in un solo punto, mai saltare i controlli con `--no-verify`. — GR#2,
   GR#13, GR#14 @main
8. **Un controllo automatico prende i casi dalla cosa che controlla, non da una lista scritta a
   mano.** Dice cosa non vede e va provato rompendo apposta il codice. _Perché:_ quasi tutti i
   bug veri erano nascosti dietro controlli verdi che guardavano un caso scelto a mano. —
   GR#13 @6b0a984e
9. **Scegli la soluzione più semplice che funziona.** Prima togli o riusa, poi crea. Nessuna copia
   parallela di qualcosa che esiste già: ogni dato vive in un posto solo. — GR#1, GR#3, GR#6 @main
10. **Verifica dove il risultato si vede davvero.** L'interfaccia si controlla in un browser vero;
    jsdom non dimostra niente sull'aspetto. — GR#15 @main
11. **Il repository è la memoria, ma breve.** Le decisioni del proprietario vanno in un file con
    data. Niente catene di passaggi di consegne né documenti che duplicano fatti. Prima di
    fidarti di un «da fare» in un documento, controlla il codice. _Perché:_ è già successo di
    rifare lavoro già fatto. — GR#16 @pre (2026-07-07), DEC 2026-09-09
12. **Le stesse regole per Claude e per Codex.** Un solo file di istruzioni (`AGENTS.md` →
    `CLAUDE.md`). Si parla in italiano col proprietario, il codice è in inglese. — DEC 2026-09-09
    («imprescindibile»), I-008

## Vincoli di sicurezza

1. **Giocatori veri, dati veri.** I personaggi salvati non si perdono mai: niente downgrade dello
   schema e niente rollback totale. Una migrazione segue prova a secco → copia di sicurezza →
   applicazione ripetibile → verifica. ❓ Le migrazioni sono autonome dentro questo protocollo
   (GR#22 @main) o serve il via libera ogni volta (GR#33 @v2)? — PROD 2026-09-21, GR#10 @main
2. **Deploy e release solo con la parola esplicita del proprietario, per quella modifica.** Un OK
   non vale per sempre. Lo stesso per le operazioni distruttive e per qualsiasi spesa. —
   GR#22 @main, GR#33 @v2, I-180
3. **Licenze: il codice SRD è pubblico, il `content-pack/` è privato.** Nel repository pubblico non
   entrano mai contenuti non SRD; quando si tocca quel confine si esegue `just ci-srd-only`. Dai
   prodotti di riferimento si copiano schemi, mai asset. ❓ Va mantenuto anche l'obbligo di
   aggiornare il pack nello stesso lavoro (GR#28)? — GR#28 @main, CLAUDE main, DEC 2026-09-09
4. **I segreti non stanno mai** nel repository, nei log, nei documenti, nei prompt o nella memoria
   degli agenti. — GR#23 @main
5. **Bilingue EN + IT per ogni testo visibile.** Si salvano gli ID, non le etichette tradotte.
   L'italiano segue l'SRD 5.2.1 ufficiale in italiano. — GR#7, GR#9, D2 @main
6. **Soglie minime:** accessibilità WCAG AA, piano gratuito di Firebase (nessun listener inutile),
   l'app funziona offline, e ogni cambio alle regole di Firestore porta test sull'emulatore. —
   GR#22, GR#24 @main

## Scartate

| Regola (fonte)                                                                                 | Motivo                                                    |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Gerarchia delle fonti e riconciliazione fra documenti (GR @main «Authority»)                   | burocrazia                                                |
| Le «quattro biforcazioni» per cui fermarsi (GR @pre)                                           | assorbita in Modo #2                                      |
| Grant seam come confine rigido; D4–D6 regole 2024 (GR#5, D4–D6)                                | legata alla piena automazione                             |
| Un worktree per ogni attività, push diretto `HEAD:main` (GR#11)                                | superata dalla direzione del 2026-10-08                   |
| Revisione «avversaria» in più passaggi prima del merge (GR#12, @pre)                           | burocrazia; sostituita da Pocock                          |
| Corsie dei controlli: pre-commit, pre-push, CI, promozione di uno SHA (GR#14)                  | dettaglio da runbook (si tiene solo «mai `--no-verify`»)  |
| Documentazione con cinque ruoli (GR#16 @v2)                                                    | burocrazia                                                |
| Release in lockstep con changeset e changelog curato (GR#17)                                   | procedura, non regola: va in RELEASE.md                   |
| Elenco degli strumenti per ruolo; livelli Fable/Opus; due rifiuti → agente nuovo (GR#18, @pre) | superata da Pocock; costosa                               |
| Impeccable decide le scelte di design contestate (GR#19, GR#26)                                | legata a uno strumento; resta il principio                |
| Delega di consegna v2 senza approvazione degli screenshot (GR#25 @v2)                          | legata a v2                                               |
| Dossier di riferimento obbligatorio in ogni spec, verificato da test (GR#30 @2158b7f6)         | burocrazia; il principio resta (Gusto #1)                 |
| PRODUCT §Steering in cima a tutto (GR#31)                                                      | legata a v2                                               |
| Dadi 3D in app, tre livelli di automazione, log di ogni tiro (GR#32, PRODUCT v2)               | legata alla piena automazione / v2                        |
| Contratti solo in `docs/program/`, registro unico, handoff NEXT.md (GR#36, GR#37)              | burocrazia (catene di consegne)                           |
| Grafo graphify sempre aggiornato dal pre-commit (GR#38)                                        | strumento; recuperabile se utile                          |
| Diagrammi solo da sorgenti archify validate (GR#39)                                            | burocrazia                                                |
| Annotare subito ogni richiesta in PROGRESS.md (GR#4 @pre)                                      | burocrazia                                                |
| Copertura minima dei test 80/75% (GR#13 @pre)                                                  | soglia arbitraria; conta il test che blinda il fatto      |
| Invarianti D1, D3, D7–D10 (persistenza, unità, mock, sync, React)                              | regole tecniche: vanno nella doc di architettura          |
| «Il tool supremo»: autosufficiente, tutto Foundry/Owlbear/Beyond (PRODUCT v2, I-005, I-193)    | ambizione v2/Studio abbandonata                           |
| Ambiente di staging obbligatorio; CI sotto 15 minuti (PRODUCT v2, DEC 2026-09-03)              | legata a v2                                               |
| Astra fa la grafica, Claude il resto (DEC 2026-09-09 pomeriggio)                               | superata: le regole sono uguali per tutti gli agenti      |
| Mai riproporre l'opzione per disattivare scorciatoie e animazioni (DEC 2026-09-07)             | dettaglio specifico                                       |
| Contratto navigabile; scelte visive numerate con screenshot affiancati (I-218, I-248)          | processo di Studio; resta «mostra con esempi»             |
| Controllo automatico dei valori calcolati contro i token (I-250)                               | strumento pesante; resta il principio (Gusto #11)         |
| Massima automazione visibile (I-027)                                                           | legata alla piena automazione; resta «numeri trasparenti» |
| Prompt per la sessione successiva solo a lavoro finito (DEC 2026-09-07)                        | legata alle catene di consegne                            |
