// THROWAWAY — Stage F merge-gate validation, 2026-09-09.
//
// This file exists ONLY to make the `checks` job fail on purpose, so we can
// observe the branch ruleset actually refuse a merge. It is deliberately
// revertible: nothing imports it, and the whole file is deleted with the
// branch. Two rule violations, both `error` in apps/web/.eslintrc.json:
//   - @typescript-eslint/no-explicit-any
//   - @typescript-eslint/no-unused-vars
// Neither is a type error, so `typecheck` passes and `lint` is what goes red.
export function gateValidationThrowaway(value: any) {
  const neverUsed = value;
  return 'this branch must never be merged';
}
