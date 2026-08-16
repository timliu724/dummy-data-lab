import { createGeneratedColumn } from '../schema/output-schema.js';

function column(templateId, index, name, generatorType, settings = {}) {
  return createGeneratedColumn({
    id: `template-${templateId}-${index + 1}`,
    name,
    generatorType,
    position: index,
    settings: { nullRate: 0, unique: false, ...settings },
  });
}

const DEFINITIONS = Object.freeze({
  blank: Object.freeze({ id: 'blank', label: 'Blank', description: 'Start with no fields.', columns: Object.freeze([]) }),
  people: Object.freeze({
    id: 'people', label: 'People', description: 'IDs, names, contact details, and status.',
    columns: Object.freeze([
      column('people', 0, 'person_id', 'sequence', { prefix: 'PER-', start: 1, width: 5, unique: true }),
      column('people', 1, 'full_name', 'person-name'),
      column('people', 2, 'email', 'email', { unique: true }),
      column('people', 3, 'phone', 'phone'),
      column('people', 4, 'status', 'category', { values: ['Active', 'Pending', 'Inactive'], weights: [70, 20, 10] }),
    ]),
  }),
  orders: Object.freeze({
    id: 'orders', label: 'Orders', description: 'Order IDs, dates, status, and totals.',
    columns: Object.freeze([
      column('orders', 0, 'order_id', 'sequence', { prefix: 'ORD-', start: 1, width: 6, unique: true }),
      column('orders', 1, 'customer_id', 'sequence', { prefix: 'CUS-', start: 100, width: 5, unique: true }),
      column('orders', 2, 'order_date', 'date', { startDate: '2025-01-01', endDate: '2026-12-31' }),
      column('orders', 3, 'status', 'category', { values: ['Pending', 'Paid', 'Shipped', 'Cancelled'], weights: [20, 45, 30, 5] }),
      column('orders', 4, 'total', 'decimal', { minimum: 10, maximum: 2500, decimals: 2 }),
    ]),
  }),
  products: Object.freeze({
    id: 'products', label: 'Products', description: 'SKUs, readable labels, categories, and prices.',
    columns: Object.freeze([
      column('products', 0, 'sku', 'sequence', { prefix: 'SKU-', start: 1, width: 5, unique: true }),
      column('products', 1, 'product_name', 'template', { sourceColumnId: 'template-products-1', sourceColumnName: 'sku', prefix: 'Product ', suffix: '' }),
      column('products', 2, 'category', 'category', { values: ['Home', 'Office', 'Outdoor', 'Technology'], weights: [30, 25, 20, 25] }),
      column('products', 3, 'price', 'decimal', { minimum: 5, maximum: 999, decimals: 2 }),
      column('products', 4, 'in_stock', 'boolean'),
    ]),
  }),
  appointments: Object.freeze({
    id: 'appointments', label: 'Appointments', description: 'Bookings with a safe date dependency.',
    columns: Object.freeze([
      column('appointments', 0, 'appointment_id', 'sequence', { prefix: 'APT-', start: 1, width: 5, unique: true }),
      column('appointments', 1, 'person_name', 'person-name'),
      column('appointments', 2, 'appointment_date', 'date', { startDate: '2026-01-01', endDate: '2027-12-31' }),
      column('appointments', 3, 'follow_up_date', 'date-after', { sourceColumnId: 'template-appointments-3', sourceColumnName: 'appointment_date', minimumDays: 7, maximumDays: 30 }),
      column('appointments', 4, 'status', 'category', { values: ['Booked', 'Completed', 'Cancelled'], weights: [45, 45, 10] }),
    ]),
  }),
});

export function listDatasetTemplates() {
  return Object.freeze(Object.values(DEFINITIONS).map(({ id, label, description }) => Object.freeze({ id, label, description })));
}

export function getDatasetTemplate(id) {
  const template = DEFINITIONS[id];
  if (!template) throw new RangeError(`Unknown dataset template: ${id}`);
  return Object.freeze({
    id: template.id,
    label: template.label,
    description: template.description,
    columns: Object.freeze(template.columns.map((entry) => createGeneratedColumn({
      ...entry,
      settings: { ...entry.settings },
    }))),
  });
}

function uniqueColumnName(name, templateId, occupied) {
  const base = String(name).trim();
  if (!occupied.has(base.toLowerCase())) {
    occupied.add(base.toLowerCase());
    return base;
  }
  const prefixed = `${templateId.replace(/s$/, '')}_${base}`;
  let candidate = prefixed;
  let suffix = 2;
  while (occupied.has(candidate.toLowerCase())) {
    candidate = `${prefixed}_${suffix}`;
    suffix += 1;
  }
  occupied.add(candidate.toLowerCase());
  return candidate;
}

export function appendDatasetTemplateBlock({ existingColumns = [], templateId, blockSequence }) {
  if (!Number.isInteger(blockSequence) || blockSequence <= 0) throw new RangeError('blockSequence must be a positive integer.');
  if (templateId === 'blank') return Object.freeze([]);
  const template = getDatasetTemplate(templateId);
  const occupied = new Set(existingColumns.map((column) => String(column.name).trim().toLowerCase()));
  const idMap = new Map(template.columns.map((column) => [column.id, `block-${blockSequence}-${column.id}`]));
  const blockId = `block-${blockSequence}-${templateId}`;
  const offset = existingColumns.length;
  const appended = template.columns.map((column, index) => {
    const settings = { ...column.settings };
    if (settings.sourceColumnId && idMap.has(settings.sourceColumnId)) {
      settings.sourceColumnId = idMap.get(settings.sourceColumnId);
      const referenced = template.columns.find((entry) => entry.id === column.settings.sourceColumnId);
      if (referenced) settings.sourceColumnName = referenced.name;
    }
    return createGeneratedColumn({
      ...column,
      id: idMap.get(column.id),
      name: uniqueColumnName(column.name, templateId, occupied),
      position: offset + index,
      settings,
      blockId,
      blockLabel: template.label,
    });
  });
  const renamedByOldName = new Map(template.columns.map((column, index) => [column.name, appended[index].name]));
  return Object.freeze(appended.map((column) => column.settings.sourceColumnName && renamedByOldName.has(column.settings.sourceColumnName)
    ? createGeneratedColumn({ ...column, settings: { ...column.settings, sourceColumnName: renamedByOldName.get(column.settings.sourceColumnName) } })
    : column));
}
