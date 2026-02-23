import test from "node:test";
import assert from "node:assert/strict";
import { extractAgent1ForAgent2 } from "../server/orchestrator/extractAgent1ForAgent2.js";

test("extractAgent1ForAgent2 returns only allowed fields when input is valid", () => {
  const result = extractAgent1ForAgent2({
    input: {
      company: "Acme",
      job_posting_url: "https://example.com/jobs/1",
      role_title_in_post: "Senior Engineer",
      location_in_post: "Remote",
      employment_type_in_post: "full-time",
      jd_text_hash: "hash123",
      extra_from_agent1: "keep-allowed-in-input",
    },
    job_identity: {
      official_title: "Software Engineer",
      department_or_function: "Engineering",
      seniority_level: "senior",
      years_experience: { min: 5, max: 8 },
      extra_from_agent1: "keep-allowed-in-job-identity",
    },
    mission: {
      one_sentence: "Build reliable systems",
    },
    handoff_to_agent_2: {
      company_research_brief: {
        culture_keywords_to_verify: ["ownership"],
      },
    },
    unrelated_top_level_data: "should-not-be-in-agent2-input",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.data, {
    input: {
      company: "Acme",
      job_posting_url: "https://example.com/jobs/1",
      role_title_in_post: "Senior Engineer",
      location_in_post: "Remote",
      employment_type_in_post: "full-time",
      jd_text_hash: "hash123",
      extra_from_agent1: "keep-allowed-in-input",
    },
    job_identity: {
      official_title: "Software Engineer",
      department_or_function: "Engineering",
      seniority_level: "senior",
      years_experience: { min: 5, max: 8 },
      extra_from_agent1: "keep-allowed-in-job-identity",
    },
    derived: {
      company_research_brief: {
        culture_keywords_to_verify: ["ownership"],
      },
      mission_statement: "Build reliable systems",
    },
  });
  assert.equal(Object.hasOwn(result.data as object, "unrelated_top_level_data"), false);
});

test("extractAgent1ForAgent2 fails when required agent1 fields are missing", () => {
  const result = extractAgent1ForAgent2({
    input: {
      company: "Acme",
    },
    job_identity: {
      official_title: "Software Engineer",
      department_or_function: "Engineering",
      seniority_level: "senior",
      years_experience: { min: 5, max: 8 },
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason.code, "agent1_output_invalid");
  assert.match(result.reason.message, /required contract/i);
});
