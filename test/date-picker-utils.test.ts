import test from "node:test";
import assert from "node:assert/strict";
import {
  compareDateValues,
  formatMonthYear,
  isValueBeforeMin,
  normalizeDateValue,
  parseMonthYear,
  toReadableValue,
} from "../src/utils/datePicker";

test("parse and format month/year values", () => {
  assert.deepEqual(parseMonthYear("02/2024"), { month: 2, year: 2024 });
  assert.equal(formatMonthYear(2, 2024), "02/2024");
  assert.equal(normalizeDateValue("2/2024", "monthYear"), "");
  assert.equal(normalizeDateValue("02/2024", "monthYear"), "02/2024");
});

test("compares month/year range correctly", () => {
  assert.ok(compareDateValues("03/2024", "01/2024", "monthYear") > 0);
  assert.ok(compareDateValues("01/2023", "01/2024", "monthYear") < 0);
  assert.equal(isValueBeforeMin("12/2023", "01/2024", "monthYear"), true);
});

test("keeps present display text", () => {
  assert.equal(toReadableValue("Present", "monthYear"), "Present");
  assert.equal(toReadableValue("07/2025", "monthYear"), "Jul 2025");
});
