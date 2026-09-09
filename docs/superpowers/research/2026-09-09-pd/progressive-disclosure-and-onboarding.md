# Progressive Disclosure & Onboarding: Evidence Base for d20 Folio

Evidence-only; [OPINION] flags takes, not tested data.

## 1. Progressive disclosure: canon and variants

**Definition (NN/g).** "Show users only a few of the most important options... Offer a larger set upon request" — improves learnability, efficiency, error rate. [NN/g](https://www.nngroup.com/articles/progressive-disclosure/)

**Works** when a task splits into low-interaction steps, the initial/secondary split is right, and controls carry strong information scent. **Fails** when steps are interdependent; beyond 2 levels "users often get lost"; or the primary list hides needed items, merely relocating complexity. Hover-only tooltips as the _sole_ channel for needed info are a documented accessibility failure. [NN/g Tooltips](https://www.nngroup.com/articles/tooltip-guidelines/)

**Staged disclosure / wizards.** A wizard sequences input "in a prescribed order" where later steps depend on earlier ones; use for novices/setup tasks, plain forms for repeated expert entry needing cross-field comparison. Wizards "are not gracefully interruptible" — mitigate with step indicators, save/resume, self-sufficient steps, reused prior answers as defaults. [NN/g Wizards](https://www.nngroup.com/articles/wizards/)

**Empirically:** single-page beat multi-page on a _short_ task ([NCBI/PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8190652/)); for _long_ tasks, multi-step lifts conversion up to 300%, and 3–4 fields/step improves completion 30–40% (via [Baymard](https://baymard.com/blog/checkout-flow-average-form-fields)). Field count and task length decide, not step count.

**Tutorials vs. contextual help.** Tutorials "don't result in better task performance" and are routinely skipped (the "paradox of the active user"); up-front guidance is "hard to remember...when the user needs it." Pull-triggered help beats push tutorials in Chase/Figma/Photoshop cases; Clippy is the canonical push-help failure. [NN/g](https://www.nngroup.com/articles/onboarding-tutorials/)

**Recommended defaults.** "One 'good' choice automatically selected... fewer people will fail to make a choice," provided opt-out stays easy. [OPINION-leaning] [Choice Architecture](https://www.universityxp.com/blog/2023/6/27/what-is-choice-architecture)

## 2. "Expert fast / beginner curious" — game mechanisms

- **BG3 difficulty**: a rules preset, not a flag (Explorer: enemies −30% max HP, party +100% HP, +2 proficiency at lvl 1); switchable mid-run except Honour. [ScreenRant](https://screenrant.com/baldurs-gate-3-difficulty-settings-balanced-explorer-tactician/)
- **BG3 Origins**: pre-authored guided path; unchosen Origins become companions so a wrong pick never blocks; classes cheaply respec. [TheGamer](https://www.thegamer.com/baldurs-gate-3-choose-origin-character-or-create-your-own/)
- **Slay the Spire**: keywords gold with tap/hover tooltips, dynamic numbers blue — experts read instantly, beginners query any gold word in place. [STS Wiki](https://slaythespire.wiki.gg/wiki/Module:CardTooltip)
- **Hades Codex**: diegetic encyclopedia; entries auto-fill on encounter, deepen with interaction; opt-in, ignorable free. [Hades Wiki](https://hades.fandom.com/wiki/Codex)
- **Into the Breach**: enemies telegraph their next action before the player moves — "every death felt like your own fault." Preview replaces explanation. [Atomic Bob-Omb](https://atomicbobomb.home.blog/2020/05/17/into-the-breach-enemy-intentions/)
- **Fire Emblem forecast**: pre-commit panel shows hit%, damage, support bonus; target/weapon editable in the same panel. [Fire Emblem Wiki](https://fireemblemwiki.org/wiki/Combat_forecast)
- **Civilopedia**: persistent "?" icon, tabs pairing flavor with mechanics; minimal by default, self-teach-or-dive-in. [Civ6 Wiki](https://civ6.fandom.com/wiki/Civilopedia)

## 3. Onboarding a brand-new D&D player, digitally

**Hard parts** (community evidence): ability-score-to-modifier translation, proficiency stacking, spell-slot/long-rest pacing; new players "stare at their character sheet like it's a tax form"; creation is "overly involved and fiddly" once feats interact with race/class. [D&D for Beginners](https://dndforbeginners.substack.com/p/confusion-isnt-fun)

**Tools.** _D&D Beyond Quick Build_: 3 inputs (species, class, name) auto-fill the rest; deliberately the low-risk surface for onboarding tech since it "doesn't see much use" vs. the standard builder. [D&D Beyond](https://www.dndbeyond.com/posts/2135-behind-the-screen-the-new-quickbuilder-and-future) _Roll20 Charactermancer_: single-decision slides pairing choice UI with the rulebook passage — help beside the decision. [Roll20](https://bloghub.roll20.net/posts/meet-the-charactermancer-roll20s-new/) _Foundry builders_ converge on Identity → Species → Class → Background → Scores → Skills → Spells → Equipment → Review, "explained in plain language." [Character Forge](https://github.com/RafaelCSierra/character-forge) _Premades_ are widely cited as fastest-to-play, but no published completion/abandonment telemetry exists from WotC, Roll20, or Foundry. [OPINION/gap]

**Abandonment (general).** Multi-step forms: 32–34% starter abandonment overall, up to 80% for checkout flows; cutting fields 11→4 raised conversion 120% (via secondary source). No D&D-specific figure found. [CrazyEgg](https://www.crazyegg.com/blog/form-statistics/)

## 4. Showing consequences before commitment

Fire Emblem's forecast and Into the Breach's telegraphing (§2) are the sharpest examples: full outcome shown pre-click, editable in place. **Configurators**: "when a customer selects walnut over oak, they need to see the difference immediately"; real-time configurators reportedly lift conversion up to 40% (vendor-sourced). [WPConfigurator](https://wpconfigurator.com/blog/product-customizer-vs-live-preview-which-drives-more-sales-in-2026/) **Comparison pages**: sticky header while scrolling, features grouped into sections, checkmarks over prose, mobile swaps the grid for tabs/accordion — closest analogue to "this gives you X, Y, Z." [LogRocket](https://blog.logrocket.com/ux-design/ui-design-comparison-features/)

## 5. Engagement without decoration

**Narrative/identity-first framing**: users invested early in a persona are "up to three times more likely to adopt new tools" than with a plain instructional flow — vendor-sourced. [Chameleon](https://www.chameleon.io/blog/gamify-user-onboarding) No controlled study on name/portrait-first ordering was found; [OPINION, converged practice].

**Micro-feedback**: real-time validation "can dramatically improve form completion rates"; its function is "to close the loop between a user's action and the resulting confirmation" — its absence is a top cause of a product "feeling unreliable." Cited lifts are secondary synthesis, not primary study. [Userpilot](https://userpilot.com/blog/micro-interaction-examples/)

**Where it fails experts**: unskippable narrative beats reproduce the "push help nobody asked for" failure of tutorials (§1); a wizard "not gracefully interruptible" means a wrapper that can't be exited inherits that flaw. [NN/g Wizards](https://www.nngroup.com/articles/wizards/)

**In-domain corroboration**: "Originate" for Foundry VTT turns "a basic spreadsheet into a visual, cinematic experience" via a wizard "that feels like a modern video game" — market signal for the sheet-as-game thesis, not proof. [FoundryVTT](https://foundryvtt.com/packages/originate)

## 6. Length, structure, save/resume, error messaging — numbers

**Steps**: average checkout is 5.1–5.42 steps; usability "does seem to suffer" at 8+ steps; 14.88 fields present vs. 7–8 needed — field count, not step count, drives UX. [Baymard](https://baymard.com/blog/checkout-flow-average-form-fields) **Progress**: checkouts without progress indicators show 28% higher abandonment. [Vaimo](https://www.vaimo.com/blog/conversion-optimisation-checkout-length/) **Save/resume**: GOV.UK places "Save and complete later" under the primary action on every page; incomplete items marked "Incomplete"; resuming returns to the task list, not the form top. [GOV.UK](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/) **Errors**: the message "should relate specifically to that field... not a generic message" — e.g. "Enter your name," not "Field required." [UK Parliament DS](https://designsystem.parliament.uk/how-tos/writing-error-messages/) **Back nav**: wizards are "not gracefully interruptible" — fix is state-saving and step indicators. [NN/g Wizards](https://www.nngroup.com/articles/wizards/)

## Rules for d20 Folio's creation journey

1. Cap any disclosure hierarchy at 2 levels; a needed 3rd level becomes its own screen. — [NN/g](https://www.nngroup.com/articles/progressive-disclosure/)
2. Every step has one pre-selected recommended default, acceptable in one click, inline-overridable. — [Choice Architecture](https://www.universityxp.com/blog/2023/6/27/what-is-choice-architecture)
3. No task-required info lives only in a hover tooltip; tooltips are optional depth, reachable by tap/keyboard, dismissible and re-openable. — [NN/g Tooltips](https://www.nngroup.com/articles/tooltip-guidelines/)
4. Replace tutorial overlays with in-place contextual ("pull") help at the decision point; never memorize earlier help. — [NN/g](https://www.nngroup.com/articles/onboarding-tutorials/)
5. Every choice affecting derived stats shows a live pre-commit preview of exactly what changes, before the click. — [Fire Emblem forecast](https://fireemblemwiki.org/wiki/Combat_forecast)
6. Creation auto-saves every step and is never an uninterruptible wizard; resuming returns to exactly where the user left off. — [NN/g Wizards](https://www.nngroup.com/articles/wizards/)
7. Each step is a single decision-family (species, or class, or background — never mixed). — [Roll20](https://bloghub.roll20.net/posts/meet-the-charactermancer-roll20s-new/)
8. Validation messages name the field and the fix ("Choose a subclass," not "Required"). — [UK Parliament DS](https://designsystem.parliament.uk/how-tos/writing-error-messages/)
9. A glossary layer (AC, proficiency, spell slots) is reachable on demand, never auto-opened — modeled on Hades' Codex/Civilopedia. — [Hades Codex](https://hades.fandom.com/wiki/Codex)
10. Offer a pre-authored "quick" path producing a playable character in ≤3 inputs, alongside the full custom path. — [DDB Quick Build](https://www.dndbeyond.com/posts/2135-behind-the-screen-the-new-quickbuilder-and-future)
11. Any "explain everything" toggle stays changeable mid-session, not locked at creation. — [bg3.wiki](https://bg3.wiki/wiki/Difficulty)
12. Above 6–8 decision-steps, show a persistent step-progress indicator; its absence correlates with higher abandonment. — [Baymard](https://baymard.com/blog/checkout-flow-average-form-fields)

## Sources

1. [NN/g — Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
2. [NN/g — Tooltip Guidelines](https://www.nngroup.com/articles/tooltip-guidelines/)
3. [NN/g — Wizards](https://www.nngroup.com/articles/wizards/)
4. [NN/g — Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/)
5. [NCBI/PMC — Single/Multipage/Conversational Forms](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8190652/)
6. [Baymard — Checkout Optimization: Minimize Form Fields](https://baymard.com/blog/checkout-flow-average-form-fields)
7. [Vaimo — Checkout Conversion Optimisation](https://www.vaimo.com/blog/conversion-optimisation-checkout-length/)
8. [GOV.UK Design System — Complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/)
9. [UK Parliament Design System — Writing error messages](https://designsystem.parliament.uk/how-tos/writing-error-messages/)
10. [CrazyEgg — 75+ Online Form Statistics](https://www.crazyegg.com/blog/form-statistics/)
11. [ScreenRant — BG3 Difficulty Modes](https://screenrant.com/baldurs-gate-3-difficulty-settings-balanced-explorer-tactician/)
12. [bg3.wiki — Difficulty](https://bg3.wiki/wiki/Difficulty)
13. [TheGamer — Origin Character or Create Your Own](https://www.thegamer.com/baldurs-gate-3-choose-origin-character-or-create-your-own/)
14. [Slay the Spire Wiki — Module:CardTooltip](https://slaythespire.wiki.gg/wiki/Module:CardTooltip)
15. [Hades Wiki — Codex](https://hades.fandom.com/wiki/Codex)
16. [Atomic Bob-Omb — Into the Breach & Enemy Intentions](https://atomicbobomb.home.blog/2020/05/17/into-the-breach-enemy-intentions/)
17. [Fire Emblem Wiki — Combat forecast](https://fireemblemwiki.org/wiki/Combat_forecast)
18. [Civilization VI Wiki — Civilopedia](https://civ6.fandom.com/wiki/Civilopedia)
19. [D&D for Beginners — Confusion Isn't Fun](https://dndforbeginners.substack.com/p/confusion-isnt-fun)
20. [D&D Beyond — Behind the Screen: The New Quickbuilder](https://www.dndbeyond.com/posts/2135-behind-the-screen-the-new-quickbuilder-and-future)
21. [Roll20 — Meet the Charactermancer](https://bloghub.roll20.net/posts/meet-the-charactermancer-roll20s-new/)
22. [GitHub — RafaelCSierra/character-forge](https://github.com/RafaelCSierra/character-forge)
23. [FoundryVTT — Originate - Character Forge](https://foundryvtt.com/packages/originate)
24. [WPConfigurator — Customizer vs Live Preview](https://wpconfigurator.com/blog/product-customizer-vs-live-preview-which-drives-more-sales-in-2026/)
25. [LogRocket — Feature comparison tables](https://blog.logrocket.com/ux-design/ui-design-comparison-features/)
26. [Chameleon — Onboarding Gamification](https://www.chameleon.io/blog/gamify-user-onboarding)
27. [Userpilot — 12 Micro-Interaction Examples](https://userpilot.com/blog/micro-interaction-examples/)
28. [University XP — What is Choice Architecture?](https://www.universityxp.com/blog/2023/6/27/what-is-choice-architecture)
