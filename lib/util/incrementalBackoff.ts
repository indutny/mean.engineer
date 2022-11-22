import assert from 'assert';

const SECOND = 1000;

const FIBONACCI = [
  1,
  1,
  2,
  3,
  5,
  8,
  13,
  21,
  34,
  55,
];

const JITTER = 1 * SECOND;

export function incrementalBackoff(attempts: number): number {
  assert(attempts > 0, '"attempts" must be a positive number');
  const index = Math.max(0, Math.min(FIBONACCI.length - 1, attempts - 1));
  const result = FIBONACCI[index] * SECOND + (Math.random() - 0.5) * JITTER;
  assert(result > 0, 'incrementalBackoff must be positive');
  return result;
}
