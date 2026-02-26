import test from "node:test";
import assert from "node:assert/strict";
import { loadResumeGuideline, collectCvFieldRefs } from "../server/config/resumeGuidelineLoader.js";
import { loadCvFieldRegistry } from "../server/config/cvFieldRegistry.js";

test("resume guideline loads and includes version", async () => {
  const guideline = await loadResumeGuideline();
  assert.equal(typeof guideline.version, "string");
  assert.ok(guideline.version.length > 0);
});

test("resume guideline defines all six required sections", async () => {
  const guideline = await loadResumeGuideline();
  const expectedSections = [
    "Personal_information",
    "Professional_summary",
    "Skills",
    "Work_experience",
    "Education",
    "Languages",
  ];
  for (const id of expectedSections) {
    assert.ok(guideline.sections[id], `Missing section '${id}'`);
  }
});

test("section_order matches section keys", async () => {
  const guideline = await loadResumeGuideline();
  const sectionKeys = Object.keys(guideline.sections);
  assert.deepEqual(
    guideline.section_order.slice().sort(),
    sectionKeys.slice().sort(),
  );
});

test("each section has required structure", async () => {
  const guideline = await loadResumeGuideline();
  for (const [id, section] of Object.entries(guideline.sections)) {
    assert.ok(section.section_label.length > 0, `${id} missing section_label`);
    assert.ok(section.order > 0, `${id} missing order`);
    assert.ok(section.description.length > 0, `${id} missing description`);
    assert.ok(Object.keys(section.fields).length > 0, `${id} has no fields`);
    assert.ok(section.rules.length > 0, `${id} has no rules`);
    assert.ok(section.keyword_rules.length > 0, `${id} has no keyword_rules`);
    assert.ok(section.formatting_constraints.length > 0, `${id} has no formatting_constraints`);
    assert.ok(section.prioritization_logic.length > 0, `${id} has no prioritization_logic`);
  }
});

test("sections are ordered sequentially from 1 to N", async () => {
  const guideline = await loadResumeGuideline();
  const orders = guideline.section_order.map((id) => guideline.sections[id].order);
  for (let i = 0; i < orders.length; i++) {
    assert.equal(orders[i], i + 1, `Expected order ${i + 1} for section at index ${i}`);
  }
});

test("cv_field_refs map to known cv_fields.json entries", async () => {
  const guideline = await loadResumeGuideline();
  const registry = await loadCvFieldRegistry();
  const knownFieldIds = new Set(registry.fields.map((f) => f.field_id));
  const refs = collectCvFieldRefs(guideline);
  assert.ok(refs.length > 0, "Should have at least one cv_field_ref");
  for (const ref of refs) {
    assert.ok(knownFieldIds.has(ref), `cv_field_ref '${ref}' not found in cv_fields.json`);
  }
});

test("global formatting rules include required properties", async () => {
  const guideline = await loadResumeGuideline();
  const fmt = guideline.global_formatting_rules;
  assert.equal(fmt.date_format, "YYYY-MM");
  assert.ok(fmt.prohibited_elements.length > 0);
  assert.ok(fmt.ats_compatibility.length > 0);
  assert.ok(fmt.layout.toLowerCase().includes("single-column"));
});

test("validation rules are present and non-empty", async () => {
  const guideline = await loadResumeGuideline();
  assert.ok(guideline.validation_rules.rules.length > 0);
});

test("keyword extraction rules define section mapping", async () => {
  const guideline = await loadResumeGuideline();
  const mapping = guideline.keyword_extraction_rules.section_mapping;
  assert.ok(Object.keys(mapping).length > 0);
  assert.ok("skill_keywords" in mapping);
});
