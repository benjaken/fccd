import { describe, expect, it } from "vitest";

import {
  evaluateSeasoningExpression,
  SeasoningExpressionError,
  tryEvaluateSeasoningExpression,
} from "@/lib/seasoning-expression";

describe("seasoning expression evaluator", () => {
  it("evaluates left-associative division formulas", () => {
    expect(evaluateSeasoningExpression("2.5/600")).toBeCloseTo(0.0041666667, 8);
    expect(evaluateSeasoningExpression("318/25/1000")).toBeCloseTo(0.01272, 8);
    expect(evaluateSeasoningExpression("178/50/453.6")).toBeCloseTo(
      0.0078483249,
      8,
    );
  });

  it("supports parentheses and mixed operators", () => {
    expect(evaluateSeasoningExpression("(8.3+1.7)/600")).toBeCloseTo(
      0.0166666667,
      8,
    );
    expect(evaluateSeasoningExpression("10*2+5")).toBe(25);
  });

  it("rejects unsafe or invalid input", () => {
    expect(() => evaluateSeasoningExpression("2/0")).toThrow(
      SeasoningExpressionError,
    );
    expect(() => evaluateSeasoningExpression("alert(1)")).toThrow(
      SeasoningExpressionError,
    );
    expect(tryEvaluateSeasoningExpression("")).toBeNull();
    expect(tryEvaluateSeasoningExpression("2+/2")).toBeNull();
    expect(tryEvaluateSeasoningExpression("()")).toBeNull();
  });
});
