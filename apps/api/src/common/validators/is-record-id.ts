import { Matches } from 'class-validator';

/**
 * Any well-formed id (8-4-4-4-12 hex). Stricter than @IsUUID(), which also checks the version and
 * variant digits: some older records (Nigeria's country row, 11111111-1111-…) were seeded by hand
 * and fail that, which blocked everyone who chose them.
 */
export const IsRecordId = (what: string) =>
  Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: `Choose your ${what} from the list` });
