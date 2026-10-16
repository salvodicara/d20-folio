# Hero art — provenance and licence

Owner decision, 2026-10-16 (direction B): every realm opens on its own scene of
one keep, painted as a single series.

| File                 | Realm                                  | Subject          |
| -------------------- | -------------------------------------- | ---------------- |
| `study-hero.webp`    | Characters (roster, sheet default)     | the keep's study |
| `war-room-hero.webp` | Campaigns (list, default campaign art) | the war room     |
| `library-hero.webp`  | Compendium                             | the library      |
| `armoury-hero.webp`  | Creation and level-up                  | the armoury      |
| `sanctum-hero.webp`  | Sign-in                                | the sanctum      |

- **Made with:** OpenAI image generation through the owner's ChatGPT
  subscription (Codex CLI `image_gen`), 2026-10-16, for d20 Folio.
- **Prompting:** original subjects; every prompt forbade imitating any existing
  artwork, game, franchise or artist, and any text, people or logos. The study
  was generated first and passed as the style reference for the other four.
- **Rights:** OpenAI's terms assign the output to the user; the owner holds
  these images for use in d20 Folio. No third-party asset is included.
- **Processing:** PNG 1916×821 → WebP quality 82 (wide), plus a 700×900 phone cut
  (`*-hero-phone.webp`, WebP quality 78, subject kept) for viewports ≤720px.
- **Delivery:** never precached; the service worker caches each scene on first
  view (`scene-art` CacheFirst, vite.config.ts), and a realm only requests its own.
