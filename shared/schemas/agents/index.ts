import { z } from "zod";

const AgentStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "skipped"]);

export const AgentEnvelopeSchema = z
  .object({
    run_id: z.string().min(1),
    user_id: z.string().min(1),
    agent_id: z.string().min(1),
    schema_version: z.string().min(1),
    input: z.unknown(),
    output: z.unknown(),
    status: AgentStatusSchema,
    timing: z
      .object({
        started_at: z.string().optional(),
        finished_at: z.string().optional(),
        duration_ms: z.number().nonnegative().optional(),
      })
      .strict(),
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
        details: z.unknown().optional(),
      })
      .nullable(),
    artifacts: z.array(
      z
        .object({
          type: z.string().min(1),
          data: z.unknown(),
        })
        .strict(),
    ),
  })
  .strict();

export const Agent1OutputSchema = z
  .object({
    input: z
      .object({
        company: z.string().min(1),
        job_posting_url: z.string().min(1),
        role_title_in_post: z.string().min(1),
        location_in_post: z.string().min(1),
        employment_type_in_post: z.string().min(1),
        jd_text_hash: z.string().min(1),
      })
      .passthrough(),
    job_identity: z
      .object({
        official_title: z.string().min(1),
        department_or_function: z.string().min(1),
        seniority_level: z.string().min(1),
        years_experience: z
          .object({
            min: z.number().int().nonnegative().nullable(),
            max: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      })
      .passthrough(),
    handoff_to_agent_2: z
      .object({
        company_research_brief: z.unknown(),
      })
      .partial()
      .optional(),
    mission: z
      .object({
        one_sentence: z.string(),
      })
      .partial()
      .optional(),
  })
  .passthrough();

const Agent2DerivedSchema = z
  .object({
    company_research_brief: z.unknown().optional(),
    mission_statement: z.string().optional(),
  })
  .strict();

export const Agent2InputSchema = z
  .object({
    input: Agent1OutputSchema.shape.input,
    job_identity: Agent1OutputSchema.shape.job_identity,
    derived: Agent2DerivedSchema.optional(),
  })
  .strict();

export type Agent1Output = z.infer<typeof Agent1OutputSchema>;
export type Agent2Input = z.infer<typeof Agent2InputSchema>;
