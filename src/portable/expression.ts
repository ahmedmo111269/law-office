/**
 * Tiny, dependency-free evaluator for the CHECK expressions used by schema v1.
 *
 * The IndexedDB profile cannot execute SQL, so table constraints are carried as
 * structured descriptors and evaluated here. This is deliberately a small
 * expression language (comparisons, boolean logic, IN, BETWEEN, length/trim,
 * CASE, integer arithmetic) — not a SQL parser. If the DDL grows a construct
 * this file does not understand, generation fails loudly instead of silently
 * dropping the constraint.
 */

export type ExprValue = string | number | null;

type Token =
  | { kind: 'ident'; value: string }
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: string }
  | { kind: 'eof' };

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'IS',
  'NULL',
  'IN',
  'BETWEEN',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'TRUE',
  'FALSE',
]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const char = input[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "'") {
      let value = '';
      index += 1;
      for (;;) {
        if (index >= input.length) throw new SyntaxError('unterminated string literal');
        const current = input[index]!;
        if (current === "'") {
          if (input[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        value += current;
        index += 1;
      }
      tokens.push({ kind: 'string', value });
      continue;
    }
    if (/[0-9]/.test(char)) {
      let value = '';
      while (index < input.length && /[0-9.]/.test(input[index]!)) {
        value += input[index];
        index += 1;
      }
      tokens.push({ kind: 'number', value: Number(value) });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let value = '';
      while (index < input.length && /[A-Za-z0-9_]/.test(input[index]!)) {
        value += input[index];
        index += 1;
      }
      const upper = value.toUpperCase();
      tokens.push(KEYWORDS.has(upper) ? { kind: 'op', value: upper } : { kind: 'ident', value });
      continue;
    }
    const two = input.slice(index, index + 2);
    if (['<=', '>=', '<>', '!=', '=='].includes(two)) {
      tokens.push({ kind: 'op', value: two === '!=' || two === '==' ? (two === '!=' ? '<>' : '=') : two });
      index += 2;
      continue;
    }
    if ('()+-*<>=,'.includes(char)) {
      tokens.push({ kind: 'op', value: char });
      index += 1;
      continue;
    }
    throw new SyntaxError(`unsupported character ${JSON.stringify(char)} in ${input}`);
  }
  tokens.push({ kind: 'eof' });
  return tokens;
}

type Node =
  | { kind: 'literal'; value: ExprValue }
  | { kind: 'column'; name: string }
  | { kind: 'unary'; op: 'NOT' | '-' | '+'; operand: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'between'; value: Node; low: Node; high: Node; negated: boolean }
  | { kind: 'in'; value: Node; list: Node[]; negated: boolean }
  | { kind: 'isNull'; value: Node; negated: boolean }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'case'; branches: Array<{ when: Node; then: Node }>; otherwise: Node | null };

class Parser {
  private readonly tokens: Token[];
  private index = 0;

  constructor(source: string) {
    this.tokens = tokenize(source);
  }

  parse(): Node {
    const node = this.parseOr();
    if (this.peek().kind !== 'eof') {
      throw new SyntaxError(`unexpected token ${JSON.stringify(this.peek())}`);
    }
    return node;
  }

  private peek(offset = 0): Token {
    return this.tokens[this.index + offset]!;
  }

  private next(): Token {
    return this.tokens[this.index++]!;
  }

  private matchOp(value: string): boolean {
    const token = this.peek();
    if (token.kind === 'op' && token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private expectOp(value: string): void {
    if (!this.matchOp(value)) throw new SyntaxError(`expected ${value}`);
  }

  private parseOr(): Node {
    let node = this.parseAnd();
    while (this.matchOp('OR')) node = { kind: 'binary', op: 'OR', left: node, right: this.parseAnd() };
    return node;
  }

  private parseAnd(): Node {
    let node = this.parseNot();
    while (this.matchOp('AND')) node = { kind: 'binary', op: 'AND', left: node, right: this.parseNot() };
    return node;
  }

  private parseNot(): Node {
    if (this.matchOp('NOT')) return { kind: 'unary', op: 'NOT', operand: this.parseNot() };
    return this.parseComparison();
  }

  private parseComparison(): Node {
    const left = this.parseAdditive();
    const token = this.peek();
    if (token.kind !== 'op') return left;
    if (['=', '<>', '<', '<=', '>', '>='].includes(token.value)) {
      this.next();
      return { kind: 'binary', op: token.value, left, right: this.parseAdditive() };
    }
    if (token.value === 'IS') {
      this.next();
      const negated = this.matchOp('NOT');
      if (!this.matchOp('NULL')) throw new SyntaxError('only IS [NOT] NULL is supported');
      return { kind: 'isNull', value: left, negated };
    }
    if (token.value === 'NOT' && this.peek(1).kind === 'op' && ['IN', 'BETWEEN'].includes((this.peek(1) as { value: string }).value)) {
      this.next();
      return this.parseMembership(left, true);
    }
    if (token.value === 'IN' || token.value === 'BETWEEN') return this.parseMembership(left, false);
    return left;
  }

  private parseMembership(value: Node, negated: boolean): Node {
    if (this.matchOp('IN')) {
      this.expectOp('(');
      const list: Node[] = [];
      if (!this.matchOp(')')) {
        do {
          list.push(this.parseOr());
        } while (this.matchOp(','));
        this.expectOp(')');
      }
      return { kind: 'in', value, list, negated };
    }
    if (this.matchOp('BETWEEN')) {
      const low = this.parseAdditive();
      if (!this.matchOp('AND')) throw new SyntaxError('BETWEEN requires AND');
      const high = this.parseAdditive();
      return { kind: 'between', value, low, high, negated };
    }
    throw new SyntaxError('expected IN or BETWEEN');
  }

  private parseAdditive(): Node {
    let node = this.parseMultiplicative();
    for (;;) {
      const token = this.peek();
      if (token.kind === 'op' && (token.value === '+' || token.value === '-')) {
        this.next();
        node = { kind: 'binary', op: token.value, left: node, right: this.parseMultiplicative() };
        continue;
      }
      return node;
    }
  }

  private parseMultiplicative(): Node {
    let node = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.kind === 'op' && token.value === '*') {
        this.next();
        node = { kind: 'binary', op: '*', left: node, right: this.parseUnary() };
        continue;
      }
      return node;
    }
  }

  private parseUnary(): Node {
    if (this.matchOp('-')) return { kind: 'unary', op: '-', operand: this.parseUnary() };
    if (this.matchOp('+')) return { kind: 'unary', op: '+', operand: this.parseUnary() };
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const token = this.next();
    if (token.kind === 'number' || token.kind === 'string') return { kind: 'literal', value: token.value };
    if (token.kind === 'op') {
      if (token.value === 'NULL') return { kind: 'literal', value: null };
      if (token.value === 'TRUE') return { kind: 'literal', value: 1 };
      if (token.value === 'FALSE') return { kind: 'literal', value: 0 };
      if (token.value === '(') {
        const node = this.parseOr();
        this.expectOp(')');
        return node;
      }
      if (token.value === 'CASE') return this.parseCase();
      throw new SyntaxError(`unexpected token ${token.value}`);
    }
    if (token.kind === 'eof') throw new SyntaxError('unexpected end of expression');
    if (this.matchOp('(')) {
      const args: Node[] = [];
      if (!this.matchOp(')')) {
        do {
          args.push(this.parseOr());
        } while (this.matchOp(','));
        this.expectOp(')');
      }
      return { kind: 'call', name: token.value.toLowerCase(), args };
    }
    return { kind: 'column', name: token.value };
  }

  private parseCase(): Node {
    const branches: Array<{ when: Node; then: Node }> = [];
    while (this.matchOp('WHEN')) {
      const when = this.parseOr();
      if (!this.matchOp('THEN')) throw new SyntaxError('CASE WHEN requires THEN');
      branches.push({ when, then: this.parseOr() });
    }
    let otherwise: Node | null = null;
    if (this.matchOp('ELSE')) otherwise = this.parseOr();
    if (!this.matchOp('END')) throw new SyntaxError('CASE requires END');
    return { kind: 'case', branches, otherwise };
  }
}

export type Row = Readonly<Record<string, ExprValue>>;

function numeric(value: ExprValue): number {
  if (value === null) throw new TypeError('NULL in numeric expression');
  if (typeof value === 'number') return value;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new TypeError(`not numeric: ${value}`);
  return parsed;
}

function truthy(value: ExprValue): boolean | null {
  if (value === null) return null;
  return typeof value === 'number' ? value !== 0 : value.length > 0;
}

function evaluate(node: Node, row: Row): ExprValue {
  switch (node.kind) {
    case 'literal':
      return node.value;
    case 'column':
      return row[node.name] ?? null;
    case 'unary': {
      if (node.op === 'NOT') {
        const value = truthy(evaluate(node.operand, row));
        return value === null ? null : value ? 0 : 1;
      }
      const value = numeric(evaluate(node.operand, row));
      return node.op === '-' ? -value : value;
    }
    case 'binary': {
      if (node.op === 'AND' || node.op === 'OR') {
        const left = truthy(evaluate(node.left, row));
        const right = truthy(evaluate(node.right, row));
        if (node.op === 'AND') {
          if (left === false || right === false) return 0;
          if (left === null || right === null) return null;
          return 1;
        }
        if (left === true || right === true) return 1;
        if (left === null || right === null) return null;
        return 0;
      }
      const left = evaluate(node.left, row);
      const right = evaluate(node.right, row);
      if (node.op === '+' || node.op === '-' || node.op === '*') {
        const a = numeric(left);
        const b = numeric(right);
        return node.op === '+' ? a + b : node.op === '-' ? a - b : a * b;
      }
      if (left === null || right === null) return null;
      switch (node.op) {
        case '=':
          return left === right ? 1 : 0;
        case '<>':
          return left !== right ? 1 : 0;
        case '<':
          return left < right ? 1 : 0;
        case '<=':
          return left <= right ? 1 : 0;
        case '>':
          return left > right ? 1 : 0;
        case '>=':
          return left >= right ? 1 : 0;
        default:
          throw new SyntaxError(`unsupported operator ${node.op}`);
      }
    }
    case 'between': {
      const value = evaluate(node.value, row);
      if (value === null) return null;
      const low = evaluate(node.low, row);
      const high = evaluate(node.high, row);
      if (low === null || high === null) return null;
      const inside = value >= low && value <= high;
      return (node.negated ? !inside : inside) ? 1 : 0;
    }
    case 'in': {
      const value = evaluate(node.value, row);
      if (value === null) return null;
      let found = false;
      for (const item of node.list) {
        if (evaluate(item, row) === value) {
          found = true;
          break;
        }
      }
      return (node.negated ? !found : found) ? 1 : 0;
    }
    case 'isNull': {
      const value = evaluate(node.value, row);
      const isNull = value === null;
      return (node.negated ? !isNull : isNull) ? 1 : 0;
    }
    case 'call': {
      const args = node.args.map((arg) => evaluate(arg, row));
      if (node.name === 'length') {
        const value = args[0];
        return value === null || value === undefined ? null : String(value).length;
      }
      if (node.name === 'trim') {
        const value = args[0];
        return value === null || value === undefined ? null : String(value).trim();
      }
      if (node.name === 'lower') return args[0] === null ? null : String(args[0]).toLowerCase();
      if (node.name === 'upper') return args[0] === null ? null : String(args[0]).toUpperCase();
      if (node.name === 'abs') return args[0] === null || args[0] === undefined ? null : Math.abs(numeric(args[0]));
      throw new SyntaxError(`unsupported function ${node.name}`);
    }
    case 'case': {
      for (const branch of node.branches) {
        if (truthy(evaluate(branch.when, row)) === true) return evaluate(branch.then, row);
      }
      return node.otherwise === null ? null : evaluate(node.otherwise, row);
    }
  }
}

export interface CompiledCheck {
  readonly source: string;
  /** True when the row satisfies the CHECK (SQLite semantics: NULL passes). */
  test(row: Row): boolean;
}

export function compileCheck(source: string): CompiledCheck {
  let ast: Node;
  try {
    ast = new Parser(source).parse();
  } catch (error) {
    throw new Error(
      `portable schema cannot translate CHECK (${source}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    source,
    test(row: Row): boolean {
      const value = evaluate(ast, row);
      if (value === null) return true;
      return truthy(value) === true;
    },
  };
}
