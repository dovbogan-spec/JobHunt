export type VisibilityState = {
  isHidden?: boolean;
  visible?: boolean;
};

export function isEntryVisible(entry: VisibilityState | null | undefined): boolean {
  if (!entry) return true;
  if (typeof entry.isHidden === "boolean") return !entry.isHidden;
  if (typeof entry.visible === "boolean") return entry.visible;
  return true;
}

export function normalizeEntryVisibility<T extends Record<string, unknown> & VisibilityState>(entry: T): T & Required<VisibilityState> {
  const visible = isEntryVisible(entry);
  return {
    ...entry,
    isHidden: !visible,
    visible,
  };
}

export function getVisibleEntries<T extends VisibilityState>(entries: readonly T[]): T[] {
  return entries.filter((entry) => isEntryVisible(entry));
}

export function buildResumeExportText(input: {
  profile: string;
  skills: Array<{ skillName: string; proficiency: string } & VisibilityState>;
  experience: Array<{ description: string } & VisibilityState>;
}): { profileText: string; skillsLine: string; experienceBullets: string[] } {
  return {
    profileText: input.profile,
    skillsLine: getVisibleEntries(input.skills)
      .map((skill) => `${skill.skillName} (${skill.proficiency})`)
      .join(", "),
    experienceBullets: getVisibleEntries(input.experience).map((item) => item.description),
  };
}
