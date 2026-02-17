import { z } from "zod";

export const jdParsedSchema = z.object({
  title: z.string().default(""),
  company: z.string().default(""),
  location: z.string().default(""),
  skills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  normalizedText: z.string().min(1),
});

export const parsedExperienceSchema = z.object({
  summary: z.string().default(""),
  lines: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
});

export const bulletSchema = z.object({
  action: z.string(),
  impact: z.string(),
  scope: z.string(),
  skillTags: z.array(z.string()).default([]),
});

export const actionablePointsSchema = z.object({
  companies: z.array(
    z.object({
      company: z.string(),
      roles: z.array(z.object({ role: z.string(), bullets: z.array(bulletSchema).default([]) })).default([]),
    }),
  ),
});

export const cvSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  items: z.array(z.string()),
});

export const cvDraftSchema = z.object({
  candidateName: z.string().default("Candidate"),
  headline: z.string().default(""),
  sections: z.array(cvSectionSchema),
  updatedAt: z.string(),
});

export const skillScoreSchema = z.object({
  skillTag: z.string(),
  score: z.number().min(0).max(100),
  status: z.enum(["covered", "weak", "missing"]),
  evidenceCount: z.number().int().min(0),
});

export const skillScoresSchema = z.object({
  scores: z.array(skillScoreSchema),
});

export const cvRevisionSchema = z.object({
  revisionId: z.string(),
  skillTag: z.string(),
  userPrompt: z.string(),
  assistantResponse: z.string(),
  updatedAt: z.string(),
});

export const skillChatSchema = z.object({
  message: z.string().min(1).max(4000),
});
