/**
 * The short save label on an action card: one ability («SAG»), or, when the target
 * picks (2024 Grapple and Shove: Strength or Dexterity), both («FOR/DES»).
 */
export function saveAbilityShort(
  ability: string,
  choice: readonly string[] | undefined,
  t: (key: string) => string
): string {
  return (choice?.length ? choice : [ability])
    .map((code) => t(`abilities.${code}_short`))
    .join("/");
}
