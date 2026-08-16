export const OUTPUT_SCHEMA_VERSION = 1;

export const OUTPUT_COLUMN_ORIGINS = Object.freeze({
  SOURCE: 'SOURCE',
  GENERATED: 'GENERATED',
});

function slugify(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'column';
}

function createUniqueId(prefix, name, index, occupied) {
  const base = `${prefix}-${slugify(name)}-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (occupied.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  occupied.add(candidate);
  return candidate;
}

function freezeColumn(column) {
  return Object.freeze({
    id: String(column.id),
    name: String(column.name),
    origin: column.origin,
    enabled: column.enabled !== false,
    position: Number(column.position),
    sourceColumnIndex: column.sourceColumnIndex ?? null,
    sourceColumnName: column.sourceColumnName ?? null,
    detectedType: column.detectedType ?? null,
    generatorType: column.generatorType ?? null,
    blockId: column.blockId ?? null,
    blockLabel: column.blockLabel ?? null,
    settings: Object.freeze({ ...(column.settings ?? {}) }),
  });
}

export function createGeneratedColumn({
  id,
  name = 'New column',
  generatorType = 'person-name',
  position = 0,
  enabled = true,
  settings = {},
  blockId = null,
  blockLabel = null,
} = {}) {
  const resolvedId = id ?? `generated-${slugify(name)}-${position + 1}`;
  return freezeColumn({
    id: resolvedId,
    name,
    origin: OUTPUT_COLUMN_ORIGINS.GENERATED,
    enabled,
    position,
    generatorType,
    settings,
    blockId,
    blockLabel,
  });
}

export function combineOutputSchema(sourceSchema, generatedColumns = []) {
  const sourceColumns = sourceSchema?.columns ?? [];
  const occupiedIds = new Set();
  const columns = [...sourceColumns, ...generatedColumns].map((column, position) => {
    let id = String(column.id ?? `${column.origin === OUTPUT_COLUMN_ORIGINS.SOURCE ? 'source' : 'generated'}-${position + 1}`);
    const base = id;
    let suffix = 2;
    while (occupiedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    occupiedIds.add(id);
    return freezeColumn({ ...column, id, position });
  });
  return Object.freeze({ schemaVersion: OUTPUT_SCHEMA_VERSION, columns: Object.freeze(columns) });
}

export function createSourceOutputSchema({ headers = [], detections = [] } = {}) {
  if (!Array.isArray(headers)) throw new TypeError('headers must be an array.');
  if (!Array.isArray(detections)) throw new TypeError('detections must be an array.');
  const occupied = new Set();
  const columns = headers.map((name, index) => freezeColumn({
    id: createUniqueId('source', name, index, occupied),
    name,
    origin: OUTPUT_COLUMN_ORIGINS.SOURCE,
    enabled: true,
    position: index,
    sourceColumnIndex: index,
    sourceColumnName: name,
    detectedType: detections[index]?.type ?? detections[index]?.primaryType ?? null,
  }));

  return Object.freeze({
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    columns: Object.freeze(columns),
  });
}

export function activeOutputColumns(schema) {
  if (!schema || schema.schemaVersion !== OUTPUT_SCHEMA_VERSION || !Array.isArray(schema.columns)) {
    throw new TypeError('A supported output schema is required.');
  }
  return Object.freeze(
    schema.columns
      .filter((column) => column.enabled !== false)
      .slice()
      .sort((left, right) => left.position - right.position),
  );
}

export function validateOutputSchema(schema) {
  const issues = [];
  if (!schema || schema.schemaVersion !== OUTPUT_SCHEMA_VERSION || !Array.isArray(schema.columns)) {
    return Object.freeze([{ code: 'INVALID_SCHEMA', message: 'The output schema is missing or unsupported.' }]);
  }
  const ids = new Set();
  const names = new Set();
  for (const column of schema.columns) {
    if (!column.id || ids.has(column.id)) issues.push({ code: 'DUPLICATE_COLUMN_ID', columnId: column.id });
    ids.add(column.id);
    const normalizedName = String(column.name ?? '').trim().toLowerCase();
    if (!normalizedName || names.has(normalizedName)) issues.push({ code: 'DUPLICATE_COLUMN_NAME', columnName: column.name });
    names.add(normalizedName);
    if (!Object.values(OUTPUT_COLUMN_ORIGINS).includes(column.origin)) {
      issues.push({ code: 'INVALID_COLUMN_ORIGIN', columnId: column.id });
    }
  }
  return Object.freeze(issues.map((issue) => Object.freeze(issue)));
}
