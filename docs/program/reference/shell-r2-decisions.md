# Shell and Account — owner corrections, 7 September 2026

<!-- source: shell-review-20260907/DECISIONS.md -->

The owner accepted the general direction of the shell and Account review and asked for the
corrections below, delegating the choice of the language control. The delta was applied to revision
**r2** of the mock copy; the approved full-lab 0.9.3 surfaces were not rewritten. Do not propose the
rejected options again.

- Account sits under the player's name. Global search is visible on desktop and becomes a lens on
  the phone. A `?` button opens help and shortcuts. The four main domains and the menu hierarchy
  stay coherent with the mock.
- **No switch to disable shortcuts or animations.** Shortcuts stay available with the normal
  protections while typing and inside dialogs; animations are part of the experience. Never
  reintroduce these controls in settings or in the help. The absence of a product control is not
  permission to remove the system or browser safeguards that already exist.
- Delegated to Astra: **direct IT ↔ EN switching**, with no dialog or menu; the button names the
  destination language and carries an explicit accessible label.
- Preferences are game-oriented: **digital or physical dice**, with short descriptions; the personal
  initial choice can also be changed at the table. Do not invent other options to fill the page.
  Shared campaign settings stay separate from personal preferences.
- Account navigation **persists** while moving between Profile, Preferences, Notifications, Privacy,
  Copies and recovery, Offline data and Support. On the phone the section selector persists. No
  implicit exit from the container, no vague titles, no buttons carrying paragraphs.
- Preserve fonts, palette, assets and the placement of icons outside the agreed delta. No arbitrary
  restyling.

Accepting the direction with corrections certifies neither pixels that were never shown nor the
React runtime. The mock keeps local simulations; it is not the source of a backend implementation
and it is not the proof of P15.
