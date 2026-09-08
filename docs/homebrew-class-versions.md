# Class and subclass immutable version verification

P08a uses the existing Library repository and its P03 envelope/receipt protocol. A class or
subclass has no separate persistence path. Subclasses carry their pinned parent and its flat
dependency closure inside the delivered root version; reading a legitimately received version
does not require later permission to read the author's private parent class.

`tests/rules/homebrew-class-versions.test.ts` verifies the actual repository against the explicit
`demo-d20folio` Firestore emulator with authenticated rules contexts:

- Class level declarations at 1/3/5 and a subclass publish and read back as immutable snapshots.
  A later class version leaves the original class, subclass and received copy unchanged.
- Conditional choices and level-bound resource/program declarations survive the parent closure
  and portable roundtrip. These are authoring facts, not character advancement or combat execution.
- Acceptance retries return the same receipt and materialize one copy; source revocation closes
  future access while the recipient's previously granted closure remains readable and conformant.
- Stale saves fail, preserve the winner and do not produce a receipt. Exact successful envelopes
  reconcile even after later writes. A real committed class save with its acknowledgement withheld
  enters unknown, reconciles its receipt and confirms the result with one SDK send.
- Wrong-parent subclasses remain recoverable drafts but cannot publish, including a modified
  publication envelope at the commit boundary.
- Unknown fields and future authoring versions preserve exact structured data in stored drafts;
  portable decoding separately retains original text, including whitespace. An incompatible
  portable wrapper retains its exact original without pretending to decode it.
- Twenty level rows roundtrip without truncation. Oversized definitions and conformant multibyte
  definitions whose complete operation exceeds its budget fail before persistence and retain
  their original input. Acceptance independently bounds the repeated offer and definition before
  producing an operation, without creating a copy or grant.

The definition's existing JSON depth and UTF16 limit and the complete class operation's UTF8/node
budget are separate constraints. The 180000 UTF8 origin-build aggregate limit continues to apply
to that character aggregate, not as a new class LibraryDefinition limit.

External evidence under `d20-folio-p08a-evidence/version-proof` records individual red/green runs.
Its `runtime-sdk.mjs` uses independent actual email/password Auth Emulator SDK clients and audits
persisted versions and receipts through server reads. Those SDK sign-ins are not Google login;
the optimized application's real emulated Google flow and visual consultation are verified in
the main P08a runtime evidence. Emulator evidence does not certify production provider, indexes,
App Check/IAM, hosting, installed PWA behavior or physical devices.

P08b/P08c own guided editors and subsequent integration; P10/P11 own creation/advancement. Future
engine/play blocks must still prove custom automation, editing in-use combat facts and causal
undo through the same engine, with ordinary, boundary and composition cases. No P08a stored
snapshot, reader preview or successful serialization substitutes for those exits.

## P08c composed authoring consultation

`class-composition.ts` exposes `composeSubclassCasting(definition, selectedParent?)`. Complete
root decoding validates the subclass and every included node before returning a composed result.
When a separately selected immutable parent is supplied, `conformClassPair` additionally checks
its exact version/content/provenance and closure. Consultation without that external selection
uses the already pinned parent node directly; it never fabricates a LibraryVersion or grants
source access. Invalid or unsupported declarations return diagnostics and the unchanged original,
not a partial apparent success.

The returned rows merge authored parent/subclass levels from the subclass's first acquisition.
Each side carries its last declared totals forward. Inherit preserves parent policy/counts;
augment adds cantrip/prepared/known counts while keeping parent slots and policy; replace uses
one subclass policy/count declaration for the owning class. Pact Magic remains outside ordinary
multiclass contribution. Returned structures are detached from the source. These are static
Library declarations, with no character slot calculator, advancement store or persisted preview.

ClassReader renders this effective policy once in its combined section, with the pinned parent
name/version and the combined level totals, separately from local declarations. Detail, offers and
print consume the same reader. Unsupported payloads remain visible through its preserved model.
Unit tests cover sparse carry-forward, intermediate casting-only rows, inherit/augment/replace,
Pact separation, wrong owner/version/changed copies, unchanged received provenance, exact original
preservation, output isolation and bilingual printable consultation. Current optimized runtime and
actual PDF acceptance belong to the integrating P08c evidence; these unit checks do not claim them.
