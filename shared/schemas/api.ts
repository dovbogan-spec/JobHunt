import { z } from "zod";

export const createRunSchema = z.object({
  title: z.string().min(1).max(160),
  userId: z.string().optional(),
  candidateName: z.string().optional(),
  jdSourceType: z.enum(["paste", "url"]),
  jdSourceUrl: z.string().url().optional(),
  jdText: z.string().min(1),
  selectedTemplate: z.string().default("modern_1"),
});

export const runStepSchema = z.object({
  index: z.coerce.number().int().min(1).max(6),
  force: z.coerce.boolean().optional(),
});

export const chatSchema = z.object({
  message: z.string().min(1).max(4000),
});

export const importJdSchema = z.object({
  url: z.string().url(),
});

export const companyInsightsSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  jdKeywords: z.array(z.string()).default([]),
});
