import { createDatasetTable } from '../dataset/multi-table-dataset.js';
import { createGeneratedColumn } from '../schema/output-schema.js';

function field(id, name, generatorType, position, settings = {}) {
  return createGeneratedColumn({ id, name, generatorType, position, settings: { nullRate: 0, unique: false, ...settings } });
}

export function createConnectedCommerceScenario() {
  const peopleColumns = [
    field('people-person-id', 'person_id', 'sequence', 0, { prefix: 'PER-', start: 1, width: 6, unique: true }),
    field('people-full-name', 'full_name', 'person-name', 1),
    field('people-email', 'email', 'email', 2, { unique: true }),
    field('people-joined-date', 'joined_date', 'date', 3, { startDate: '2024-01-01', endDate: '2025-12-31' }),
    field('people-segment', 'customer_segment', 'category', 4, { values: ['Standard', 'Plus', 'Business'], weights: [65, 25, 10] }),
  ];
  const people = createDatasetTable({ id: 'scenario-people', name: 'People', columns: peopleColumns, primaryKeyColumnId: 'people-person-id' });

  const productColumns = [
    field('products-product-id', 'product_id', 'sequence', 0, { prefix: 'PRD-', start: 1, width: 5, unique: true }),
    field('products-name', 'product_name', 'template', 1, { sourceColumnId: 'products-product-id', sourceColumnName: 'product_id', prefix: 'Product ', suffix: '' }),
    field('products-category', 'category', 'category', 2, { values: ['Home', 'Office', 'Outdoor', 'Technology'], weights: [30, 25, 20, 25] }),
    field('products-price', 'price', 'decimal', 3, { minimum: 5, maximum: 999, decimals: 2 }),
  ];
  const products = createDatasetTable({ id: 'scenario-products', name: 'Products', columns: productColumns, rowCount: 50, primaryKeyColumnId: 'products-product-id' });

  const orderColumns = [
    field('orders-order-id', 'order_id', 'sequence', 0, { prefix: 'ORD-', start: 1, width: 7, unique: true }),
    field('orders-person-id', 'person_id', 'foreign-key', 1, {
      targetTableId: people.id, targetColumnId: people.primaryKeyColumnId, targetTableName: people.name, targetColumnName: 'person_id',
      cardinalityMode: 'DRIVER', minimumPerParent: 0, maximumPerParent: 5,
    }),
    field('orders-product-id', 'product_id', 'foreign-key', 2, {
      targetTableId: products.id, targetColumnId: products.primaryKeyColumnId, targetTableName: products.name, targetColumnName: 'product_id',
      cardinalityMode: 'SAMPLE', minimumPerParent: 0, maximumPerParent: 5,
    }),
    field('orders-segment', 'customer_segment', 'lookup-foreign', 3, {
      foreignKeyColumnId: 'orders-person-id', targetTableId: people.id, targetColumnId: 'people-segment', targetTableName: people.name, targetColumnName: 'customer_segment',
    }),
    field('orders-date', 'order_date', 'date-after-foreign', 4, {
      foreignKeyColumnId: 'orders-person-id', targetTableId: people.id, targetColumnId: 'people-joined-date', targetTableName: people.name, targetColumnName: 'joined_date',
      minimumDays: 0, maximumDays: 365,
    }),
    field('orders-status', 'status', 'category', 5, { values: ['Pending', 'Paid', 'Shipped', 'Cancelled'], weights: [20, 45, 30, 5] }),
    field('orders-quantity', 'quantity', 'integer', 6, { minimum: 1, maximum: 8 }),
    field('orders-unit-price', 'unit_price', 'lookup-foreign', 7, {
      foreignKeyColumnId: 'orders-product-id', targetTableId: products.id, targetColumnId: 'products-price', targetTableName: products.name, targetColumnName: 'price',
    }),
  ];
  const orders = createDatasetTable({ id: 'scenario-orders', name: 'Orders', columns: orderColumns, primaryKeyColumnId: 'orders-order-id' });

  const appointmentColumns = [
    field('appointments-id', 'appointment_id', 'sequence', 0, { prefix: 'APT-', start: 1, width: 6, unique: true }),
    field('appointments-person-id', 'person_id', 'foreign-key', 1, {
      targetTableId: people.id, targetColumnId: people.primaryKeyColumnId, targetTableName: people.name, targetColumnName: 'person_id',
      cardinalityMode: 'DRIVER', minimumPerParent: 0, maximumPerParent: 3,
    }),
    field('appointments-date', 'appointment_date', 'date-after-foreign', 2, {
      foreignKeyColumnId: 'appointments-person-id', targetTableId: people.id, targetColumnId: 'people-joined-date', targetTableName: people.name, targetColumnName: 'joined_date',
      minimumDays: 1, maximumDays: 730,
    }),
    field('appointments-follow-up', 'follow_up_date', 'date-after', 3, {
      sourceColumnId: 'appointments-date', sourceColumnName: 'appointment_date', minimumDays: 7, maximumDays: 30,
    }),
    field('appointments-status', 'status', 'category', 4, { values: ['Booked', 'Completed', 'Cancelled'], weights: [45, 45, 10] }),
  ];
  const appointments = createDatasetTable({ id: 'scenario-appointments', name: 'Appointments', columns: appointmentColumns, primaryKeyColumnId: 'appointments-id' });

  return Object.freeze({
    id: 'connected-commerce-appointments',
    name: 'Connected commerce & appointments',
    description: 'People, Products, Orders, and Appointments with valid keys, child counts, copied attributes, and linked dates.',
    activeTableId: people.id,
    tables: Object.freeze([people, products, orders, appointments]),
  });
}
