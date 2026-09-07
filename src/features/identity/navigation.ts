export const accountSections = [
  "account",
  "preferences",
  "notifications",
  "privacy",
  "recovery",
  "offlineData",
  "support",
] as const;
export type AccountSection = (typeof accountSections)[number];
export const accountLabel = (section: AccountSection) =>
  section === "account" ? "profile" : section;
