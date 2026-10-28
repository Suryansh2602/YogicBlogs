import { ForeignKeyConstraintError } from 'sequelize';

// MySQL reports foreign-key violations with two generations of error codes. Sequelize only recognises
// 1451/1452; MySQL 8 returns 1216/1217 in some privilege setups (seen with our least-privilege users).
const NO_REFERENCED_ROW = new Set([1216, 1452]); // child points at a parent that doesn't exist
const ROW_IS_REFERENCED = new Set([1217, 1451]); // parent still has children

const errnoOf = (err) => err?.parent?.errno ?? err?.original?.errno ?? err?.errno;

/** e.g. creating an article for a condition that doesn't exist → 400 */
export const isMissingReferenceError = (err) => NO_REFERENCED_ROW.has(errnoOf(err));

/** e.g. deleting a condition that still has articles → 409 */
export const isInUseError = (err) => ROW_IS_REFERENCED.has(errnoOf(err));

export const isForeignKeyError = (err) =>
  err instanceof ForeignKeyConstraintError || isMissingReferenceError(err) || isInUseError(err);
