/**
 * Conjured-item blueprints — the CLOSED item templates spell programs create
 * through the mechanics kernel's `inventory-create` step, plus the canonical
 * consume program each conjured item grants its holder.
 *
 * The blueprint map is meant to ride `authority.snapshot.blueprints.items`
 * (the ONLY channel `compileMechanicsFrame` instantiates items from); the
 * consume program becomes an item-sourced authority
 * (`authority.source.kind === "inventory-item"`) whose payment debits the
 * instance's own quantity. Names localize at render time from the CREATING
 * spell's id (`goodberry-berry` → the `goodberry` catalogue name) — a
 * blueprint carries no display strings (golden rule 7).
 *
 * All entries here mirror SRD 5.2.1 spells only; pack-conjured items live in
 * the content pack.
 */

/** One creatable inventory-instance template, keyed by conjured item id, in
 *  the exact `NewInventoryInstance` shape `conformNewInventoryInstance`
 *  accepts (quantity `current` is replaced by the creating step's amount). */
export const CONJURED_ITEM_BLUEPRINTS: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  "goodberry-berry": {
    attuned: false,
    definition: { itemId: "goodberry-berry", kind: "catalogue" },
    disposition: "magical",
    enchantment: null,
    equipped: false,
    notes: "",
    overrides: {
      armorClass: null,
      attackBonus: null,
      damageFormula: null,
      damageType: null,
      name: null,
    },
    quantity: {
      capacity: { base: { kind: "unbounded" }, override: null },
      current: 1,
      disabled: false,
      kind: "count",
    },
    resources: {},
    tags: [],
  },
};

/**
 * The canonical consume program of each conjured item, in the durable
 * authored `MechanicsProgram` format (validated by `conformMechanicsProgram`
 * in the corpus tests). Goodberry's berry: a Bonus Action (table-spent
 * economy) feeds one creature, pays 1 from the instance's own quantity and
 * heals exactly 1 hit point.
 */
export const CONJURED_ITEM_PROGRAMS: Readonly<
  Record<string, Readonly<Record<string, unknown>>>
> = {
  "goodberry-berry": {
    id: "item:goodberry-berry",
    phases: [
      {
        inputs: [
          {
            eligibility: "creature",
            inputId: "targets",
            kind: "entities",
            maximum: { kind: "fixed", value: 1 },
            minimum: { kind: "fixed", value: 1 },
            multiplicity: "slots",
            when: null,
          },
          {
            inputId: "berry",
            kind: "resource",
            term: {
              amount: { kind: "fixed", value: 1 },
              selector: {
                item: { kind: "source-item" },
                kind: "item-quantity",
                owner: "owner",
              },
            },
            when: null,
          },
        ],
        phaseId: "resolve",
        steps: [
          {
            amount: { expression: { kind: "fixed", value: 1 }, kind: "integer" },
            kind: "heal",
            stepId: "berry-heal",
            target: { inputId: "targets", kind: "input" },
            when: null,
          },
        ],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  },
};
