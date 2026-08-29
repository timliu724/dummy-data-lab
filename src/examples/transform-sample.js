const SAMPLE_LINES = Object.freeze([
  'order_id,customer_name,email,phone,order_placed,delivery_due,product,quantity,unit_price,status,delivery_address,customer_note',
  'ORD-AU-10481,Ava Morgan,ava.morgan@example.test,0400 555 014,2026-07-02 09:15,2026-07-04 13:00,Ceramic travel mug,2,34.95,Delivered,18 Wattle Lane Carlton VIC 3053,Leave at reception',
  'ORD-AU-10482,Lucas Chen,lucas.chen@example.test,0400 555 027,2026-07-02 10:42,2026-07-05 16:00,Desk cable organiser,3,18.50,Delivered,7 Harbour View Pyrmont NSW 2009,Call on arrival',
  'ORD-AU-10483,Mia Bennett,mia.bennett@example.test,0400 555 031,2026-07-02 13:08,2026-07-06 12:00,Linen notebook set,1,27.00,Delivered,42 Banksia Road New Farm QLD 4005,Gift order',
  'ORD-AU-10484,Noah Williams,noah.williams@example.test,0400 555 046,2026-07-03 08:37,2026-07-06 17:00,Portable reading light,2,42.75,Delivered,9 Jacaranda Street Norwood SA 5067,Safe to leave',
  'ORD-AU-10485,Sophie Patel,sophie.patel@example.test,0400 555 052,2026-07-03 11:24,2026-07-07 14:00,Insulated lunch bag,1,39.90,Packed,26 Paperbark Avenue Subiaco WA 6008,Please avoid plastic packaging',
  'ORD-AU-10486,Ethan Clarke,ethan.clarke@example.test,0400 555 068,2026-07-03 15:51,2026-07-08 11:00,Wireless charging stand,2,64.00,Processing,11 Market Lane Hobart TAS 7000,',
  'ORD-AU-10487,Ava Morgan,ava.morgan@example.test,0400 555 014,2026-07-04 09:05,2026-07-08 13:00,Desk cable organiser,1,18.50,Processing,18 Wattle Lane Carlton VIC 3053,Add to previous delivery if possible',
  'ORD-AU-10488,Grace Kim,grace.kim@example.test,0400 555 073,2026-07-04 12:18,2026-07-09 15:00,Reusable produce bags,4,15.25,Packed,5 Acacia Court Braddon ACT 2612,Deliver after midday',
  'ORD-AU-10489,Jack Thompson,jack.thompson@example.test,0400 555 089,2026-07-04 16:40,2026-07-10 10:00,Stoneware coffee cup,2,31.80,Processing,31 River Walk Darwin NT 0800,Office delivery',
  'ORD-AU-10490,Isla Robinson,isla.robinson@example.test,0400 555 094,2026-07-05 10:11,2026-07-09 17:00,Canvas market tote,1,29.95,Cancelled,14 Seabreeze Road Geelong VIC 3220,Ordered the wrong colour',
  'ORD-AU-10491,Lucas Chen,lucas.chen@example.test,0400 555 027,2026-07-05 14:26,2026-07-10 16:00,Portable reading light,1,42.75,Packed,7 Harbour View Pyrmont NSW 2009,Leave with concierge',
  'ORD-AU-10492,Olivia Fraser,olivia.fraser@example.test,0400 555 108,2026-07-06 08:49,2026-07-11 12:00,Glass water bottle,3,24.40,Processing,22 Federation Street Richmond VIC 3121,No weekend delivery',
  'ORD-AU-10493,Liam Nguyen,liam.nguyen@example.test,0400 555 116,2026-07-06 11:33,2026-07-12 14:00,Linen notebook set,2,27.00,Packed,6 Fig Tree Crescent West End QLD 4101,Include a printed receipt',
  'ORD-AU-10494,Chloe Evans,chloe.evans@example.test,0400 555 121,2026-07-06 15:07,2026-07-13 13:00,Insulated lunch bag,2,39.90,Processing,83 Lake Street Northbridge WA 6003,Reception closes at five',
  'ORD-AU-10495,Sophie Patel,sophie.patel@example.test,0400 555 052,2026-07-07 09:28,2026-07-12 16:00,Ceramic travel mug,1,34.95,Processing,26 Paperbark Avenue Subiaco WA 6008,Combine with order ORD-AU-10485',
  'ORD-AU-10496,Hugo Martin,hugo.martin@example.test,0400 555 137,2026-07-07 13:46,2026-07-14 11:00,Wireless charging stand,1,64.00,Packed,17 Kingfisher Way Launceston TAS 7250,Signature required',
]);

export const TRANSFORM_SAMPLE = Object.freeze({
  id: 'fictional-retail-orders',
  name: 'Fictional retail orders',
  description: 'A realistic one-table order flow with repeat customers, patterned IDs, dates, categories, amounts, addresses, and free text.',
  rowCount: SAMPLE_LINES.length - 1,
  columnCount: SAMPLE_LINES[0].split(',').length,
  text: SAMPLE_LINES.join('\n'),
});

function normaliseSampleText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

export function isTransformSampleText(value) {
  return normaliseSampleText(value) === normaliseSampleText(TRANSFORM_SAMPLE.text);
}
