import { createGeneratedColumn } from '../schema/output-schema.js';

export const PERSONAL_FIELD_SETS_KEY = 'dummy-data-generator.personal-field-sets.v1';
const MAX_SETS = 20;
const MAX_COLUMNS = 100;

function cleanName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new RangeError('Enter a name for this personal field set.');
  if (name.length > 60) throw new RangeError('Personal field set names must be 60 characters or shorter.');
  return name;
}

function cloneColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) throw new RangeError('Add at least one generated column before saving a field set.');
  if (columns.length > MAX_COLUMNS) throw new RangeError(`A personal field set can contain at most ${MAX_COLUMNS} columns.`);
  return Object.freeze(columns.map((column, position) => createGeneratedColumn({
    ...column,
    position,
    settings: { ...column.settings },
  })));
}

export function createPersonalFieldSet({ name, columns, savedAt = new Date().toISOString() }) {
  return Object.freeze({
    id: `personal-${String(savedAt).replace(/[^0-9]/g, '')}-${cleanName(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'set'}`,
    name: cleanName(name),
    savedAt: String(savedAt),
    columns: cloneColumns(columns),
  });
}

export function serializePersonalFieldSets(sets) {
  if (!Array.isArray(sets) || sets.length > MAX_SETS) throw new RangeError(`Save at most ${MAX_SETS} personal field sets.`);
  return JSON.stringify({ schemaVersion: 1, sets }, null, 2);
}

export function parsePersonalFieldSets(text) {
  if (!text) return Object.freeze([]);
  const parsed = JSON.parse(text);
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.sets)) throw new TypeError('Unsupported personal field set data.');
  if (parsed.sets.length > MAX_SETS) throw new RangeError(`Stored data exceeds the ${MAX_SETS}-set limit.`);
  const ids = new Set();
  return Object.freeze(parsed.sets.map((set) => {
    const normalized = createPersonalFieldSet(set);
    const id = String(set.id ?? normalized.id);
    if (!id || ids.has(id)) throw new TypeError('Personal field set IDs must be unique.');
    ids.add(id);
    return Object.freeze({ ...normalized, id });
  }));
}

export function upsertPersonalFieldSet(sets, fieldSet) {
  const withoutSameName = sets.filter((set) => set.name.toLowerCase() !== fieldSet.name.toLowerCase());
  const next = [...withoutSameName, fieldSet];
  if (next.length > MAX_SETS) next.shift();
  return Object.freeze(next);
}

export function removePersonalFieldSet(sets, id) {
  return Object.freeze(sets.filter((set) => set.id !== id));
}
