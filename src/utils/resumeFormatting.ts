import { getVisibleEntries, type VisibilityState } from "./resumeVisibility";

type SkillWithLevel = {
  skillName: string;
  proficiency?: string | null;
};

type ExperienceWithVisibility = {
  description: string;
} & VisibilityState;

export function formatSkillWithLevel(skill: SkillWithLevel): string {
  const proficiency = skill.proficiency?.trim();
  return proficiency ? `${skill.skillName} (${proficiency})` : skill.skillName;
}

export function getPreviewExperienceEntries<T extends ExperienceWithVisibility>(entries: readonly T[]): T[] {
  return getVisibleEntries(entries);
}
