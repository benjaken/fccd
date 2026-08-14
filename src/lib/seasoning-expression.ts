/** Safe arithmetic evaluator for seasoning formulas like `2.5/600` or `318/25/1000`. */

const EXPRESSION_PATTERN = /^[0-9+\-*/().\s]+$/;

export class SeasoningExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeasoningExpressionError";
  }
}

function tokenize(expression: string): string[] {
  const cleaned = expression.replace(/\s+/g, "");
  if (!cleaned) {
    throw new SeasoningExpressionError("empty_expression");
  }
  if (!EXPRESSION_PATTERN.test(cleaned)) {
    throw new SeasoningExpressionError("invalid_characters");
  }

  const tokens: string[] = [];
  let index = 0;
  while (index < cleaned.length) {
    const char = cleaned[index]!;
    if ("+-*/()".includes(char)) {
      tokens.push(char);
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < cleaned.length && /[0-9.]/.test(cleaned[end]!)) end += 1;
      const number = cleaned.slice(index, end);
      if (!/^\d+(\.\d+)?$/.test(number) && !/^\.\d+$/.test(number)) {
        throw new SeasoningExpressionError("invalid_number");
      }
      tokens.push(number);
      index = end;
      continue;
    }
    throw new SeasoningExpressionError("invalid_characters");
  }
  return tokens;
}

function parseExpression(tokens: string[], cursor: { index: number }): number {
  let value = parseTerm(tokens, cursor);
  while (cursor.index < tokens.length) {
    const op = tokens[cursor.index];
    if (op !== "+" && op !== "-") break;
    cursor.index += 1;
    const right = parseTerm(tokens, cursor);
    value = op === "+" ? value + right : value - right;
  }
  return value;
}

function parseTerm(tokens: string[], cursor: { index: number }): number {
  let value = parseFactor(tokens, cursor);
  while (cursor.index < tokens.length) {
    const op = tokens[cursor.index];
    if (op !== "*" && op !== "/") break;
    cursor.index += 1;
    const right = parseFactor(tokens, cursor);
    if (op === "/") {
      if (right === 0) throw new SeasoningExpressionError("division_by_zero");
      value = value / right;
    } else {
      value = value * right;
    }
  }
  return value;
}

function parseFactor(tokens: string[], cursor: { index: number }): number {
  const token = tokens[cursor.index];
  if (token === undefined) {
    throw new SeasoningExpressionError("unexpected_end");
  }

  if (token === "+") {
    cursor.index += 1;
    return parseFactor(tokens, cursor);
  }
  if (token === "-") {
    cursor.index += 1;
    return -parseFactor(tokens, cursor);
  }
  if (token === "(") {
    cursor.index += 1;
    const value = parseExpression(tokens, cursor);
    if (tokens[cursor.index] !== ")") {
      throw new SeasoningExpressionError("missing_paren");
    }
    cursor.index += 1;
    return value;
  }

  cursor.index += 1;
  const value = Number.parseFloat(token);
  if (!Number.isFinite(value)) {
    throw new SeasoningExpressionError("invalid_number");
  }
  return value;
}

/** Evaluate a seasoning calculation expression. Returns cost per gram. */
export function evaluateSeasoningExpression(expression: string): number {
  const tokens = tokenize(expression);
  const cursor = { index: 0 };
  const value = parseExpression(tokens, cursor);
  if (cursor.index !== tokens.length) {
    throw new SeasoningExpressionError("unexpected_token");
  }
  if (!Number.isFinite(value)) {
    throw new SeasoningExpressionError("invalid_result");
  }
  return value;
}

export function tryEvaluateSeasoningExpression(expression: string): number | null {
  try {
    return evaluateSeasoningExpression(expression);
  } catch {
    return null;
  }
}
