# Design system prototypes (owner approved 2026-10-16)

Standalone HTML prototypes of the new look. The app adopts them area by area (Play first),
replacing `src/styles/folio.css` per area and ticking `docs/design/SURFACES.md`.

**The rule (owner, 2026-10-16):** every element is copied from a named real product and none is
invented. `inventory.html` traces the Play screen element by element; each prototype names its
sources in comments.

| File                                                | Screen                                 | Copied from                         |
| --------------------------------------------------- | -------------------------------------- | ----------------------------------- |
| `play.html` (`?mode=explore`)                       | Play, in and out of combat             | BG3, D&D Beyond, Foundry            |
| `campaign.html` (`?tab=resoconto\|gruppo\|scontro`) | Campaign hub, journal, party, tracker  | Kanka, D&D Beyond, Foundry, Notion  |
| `compendium.html`                                   | Compendium                             | D&D Beyond, 5e.tools                |
| `create.html`                                       | Creation                               | BG3, D&D Beyond                     |
| `account.html` (`?view=login\|sent\|settings`)      | Login, link sent, settings             | Notion, Slack, GitHub               |
| `overlays.html`                                     | Dialogs, menus, toasts, banners, empty | BG3, D&D Beyond, Gmail, Google Docs |
| `nav.html`                                          | Navigation model                       | D&D Beyond                          |
| `logo.html`                                         | Logo options (owner chose A, the d20)  | —                                   |

Decisions: dark only; frames are 9-slice SVG borders in two tiers (`frames/`); turn resources are
shapes plus colours (BG3). Images are in `img/`, with provenance in `img/PROVENANCE.md`.
