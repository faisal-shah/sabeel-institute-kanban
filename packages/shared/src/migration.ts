import { ALLOWED_EMAIL_DOMAIN } from './constants';
import type { Priority } from './types';

/**
 * ClickUp → Sabeel Kanban mapping logic.
 *
 * Pure, and tested, because this is the part of the migration that can quietly
 * do damage. A wrong guess here does not crash — it silently assigns Omar's work
 * to Omar-someone-else, or drops a status nobody notices is missing until a
 * board looks wrong weeks later.
 *
 * So the rule throughout: PROPOSE with a stated confidence, never decide. Only
 * exact, defensible matches are auto-accepted; everything else is handed back
 * for a human to resolve, and an unresolved entry is a hard error at apply time.
 */

export type MatchConfidence =
  /** Same email, or same local part on the org domain. Safe to auto-accept. */
  | 'exact'
  /** Name matches after normalisation. Likely right; still shown for review. */
  | 'likely'
  /** Something matched loosely. Never auto-accepted. */
  | 'weak'
  /** Nothing matched. Must be filled in by hand. */
  | 'none';

export interface PersonMapping {
  clickup: string;
  email: string | null;
  confidence: MatchConfidence;
  note?: string;
}

export interface OrgMember {
  email: string;
  displayName: string;
}

/** Strip punctuation and case so "Sara A." and "sara_a" compare equal. */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, '') // drop parenthetical asides: "Omar (Design)"
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function localPart(email: string): string {
  const at = email.indexOf('@');
  return (at === -1 ? email : email.slice(0, at)).toLowerCase();
}

/**
 * Propose an org account for a ClickUp identity.
 *
 * ClickUp exports give wildly inconsistent identities: sometimes an email,
 * sometimes a username, sometimes a display name with a department in brackets.
 * Each gets a different confidence, and only an exact match is auto-accepted.
 */
export function matchPerson(
  clickupIdentity: string,
  members: readonly OrgMember[],
): PersonMapping {
  const raw = clickupIdentity.trim();
  const lower = raw.toLowerCase();

  // 1. It IS an email we know.
  const byEmail = members.find((m) => m.email.toLowerCase() === lower);
  if (byEmail) {
    return { clickup: raw, email: byEmail.email, confidence: 'exact' };
  }

  // 2. An email on some other domain — never silently map it to an org account.
  if (lower.includes('@')) {
    return {
      clickup: raw,
      email: null,
      confidence: 'none',
      note: `${raw} is not an @${ALLOWED_EMAIL_DOMAIN} address — map it by hand`,
    };
  }

  // 3. Username equals the local part of exactly one org address.
  const byLocal = members.filter((m) => localPart(m.email) === lower);
  if (byLocal.length === 1) {
    return { clickup: raw, email: byLocal[0].email, confidence: 'exact' };
  }
  if (byLocal.length > 1) {
    return {
      clickup: raw,
      email: null,
      confidence: 'none',
      note: `"${raw}" matches ${byLocal.length} accounts — choose one`,
    };
  }

  // 4. Display name matches after normalisation.
  const target = normaliseName(raw);
  const byName = members.filter((m) => normaliseName(m.displayName) === target);
  if (byName.length === 1) {
    return {
      clickup: raw,
      email: byName[0].email,
      confidence: 'likely',
      note: 'matched on display name — confirm this is the right person',
    };
  }
  if (byName.length > 1) {
    return {
      clickup: raw,
      email: null,
      confidence: 'none',
      note: `"${raw}" matches ${byName.length} people by name — choose one`,
    };
  }

  // 5. A unique prefix match. Weak on purpose: "sam" prefix-matches "samir",
  //    and quietly assigning Samir's work to Sam is exactly the damage to avoid.
  const byPrefix = members.filter(
    (m) => target.length >= 3 && normaliseName(m.displayName).startsWith(target),
  );
  if (byPrefix.length === 1) {
    return {
      clickup: raw,
      email: null,
      confidence: 'weak',
      note: `possibly ${byPrefix[0].email} — NOT applied automatically, confirm or replace`,
    };
  }

  return {
    clickup: raw,
    email: null,
    confidence: 'none',
    note: 'no match — fill this in',
  };
}

/** Auto-accepted mappings are exact ones only. Everything else needs a human. */
export function isAutoAcceptable(m: { confidence: MatchConfidence }): boolean {
  return m.confidence === 'exact';
}

// ---- Statuses → columns ---------------------------------------------------

/**
 * Common ClickUp statuses that map cleanly onto the default columns. Anything
 * outside this list is proposed as a NEW column rather than forced into an
 * existing one — inventing a mapping loses information silently, whereas an
 * extra column is visible and one click to merge.
 */
const STATUS_SYNONYMS: Record<string, string> = {
  'to do': 'To Do',
  todo: 'To Do',
  open: 'To Do',
  backlog: 'To Do',
  new: 'To Do',
  'in progress': 'In Progress',
  doing: 'In Progress',
  active: 'In Progress',
  started: 'In Progress',
  done: 'Done',
  complete: 'Done',
  completed: 'Done',
  closed: 'Done',
};

export interface ColumnMapping {
  clickupStatus: string;
  column: string | null;
  confidence: MatchConfidence;
  note?: string;
}

export function matchStatus(
  status: string,
  existingColumns: readonly string[],
): ColumnMapping {
  const raw = status.trim();
  const lower = raw.toLowerCase();

  const exact = existingColumns.find((c) => c.toLowerCase() === lower);
  if (exact) return { clickupStatus: raw, column: exact, confidence: 'exact' };

  const synonym = STATUS_SYNONYMS[lower];
  if (synonym && existingColumns.some((c) => c.toLowerCase() === synonym.toLowerCase())) {
    return { clickupStatus: raw, column: synonym, confidence: 'likely' };
  }

  // Not a known synonym: propose keeping it as its own column, preserving the
  // team's own vocabulary rather than flattening it into ours.
  return {
    clickupStatus: raw,
    column: raw,
    confidence: 'weak',
    note: 'no equivalent column — will be created as a new column unless you change it',
  };
}

// ---- Priorities -----------------------------------------------------------

/** ClickUp priorities are urgent/high/normal/low, or numbers 1..4. */
export function mapPriority(value: string | number | null | undefined): Priority {
  if (value === null || value === undefined || value === '') return 'none';

  const s = String(value).trim().toLowerCase();
  switch (s) {
    case '1':
    case 'urgent':
      return 'urgent';
    case '2':
    case 'high':
      return 'high';
    case '3':
    case 'normal':
    case 'medium':
      return 'medium';
    case '4':
    case 'low':
      return 'low';
    default:
      return 'none';
  }
}

// ---- Dates ----------------------------------------------------------------

/**
 * ClickUp exports dates as epoch milliseconds, ISO strings, or localised text
 * depending on where they came from. Cards store all-day `YYYY-MM-DD` strings.
 *
 * Anything unparseable returns null rather than guessing: a card with no due
 * date is obviously missing one, whereas a card with the WRONG due date looks
 * authoritative and misleads people.
 */
export function mapDueDate(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;

  const s = String(value).trim();

  // Already a day key.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Epoch milliseconds.
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length === 10 ? Number(s) * 1000 : Number(s);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

// ---- Idempotency ----------------------------------------------------------

/**
 * A stable id derived from the ClickUp task id, so re-running the import updates
 * rather than duplicates. An interrupted import can simply be run again — which
 * matters, because the alternative is hand-deleting hundreds of cards.
 */
export function sourceIdFor(clickupTaskId: string): string {
  return `clickup:${clickupTaskId.trim()}`;
}

// ---- Validation -----------------------------------------------------------

export interface MappingFile {
  people: PersonMapping[];
  boards: { clickupList: string; boardName: string | null }[];
  columns: ColumnMapping[];
}

export interface MappingProblem {
  kind: 'person' | 'board' | 'column';
  subject: string;
  message: string;
}

/**
 * Everything still unresolved. The importer refuses to apply while this is
 * non-empty — a half-mapped import is worse than no import, because it looks
 * finished.
 */
export function validateMapping(m: MappingFile): MappingProblem[] {
  const problems: MappingProblem[] = [];

  for (const p of m.people) {
    if (!p.email) {
      problems.push({
        kind: 'person',
        subject: p.clickup,
        message: p.note ?? 'no account chosen',
      });
    } else if (!p.email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      problems.push({
        kind: 'person',
        subject: p.clickup,
        message: `${p.email} is not an @${ALLOWED_EMAIL_DOMAIN} address`,
      });
    }
  }

  for (const b of m.boards) {
    if (!b.boardName || !b.boardName.trim()) {
      problems.push({
        kind: 'board',
        subject: b.clickupList,
        message: 'no board name chosen',
      });
    }
  }

  for (const c of m.columns) {
    if (!c.column || !c.column.trim()) {
      problems.push({
        kind: 'column',
        subject: c.clickupStatus,
        message: 'no column chosen',
      });
    }
  }

  return problems;
}
