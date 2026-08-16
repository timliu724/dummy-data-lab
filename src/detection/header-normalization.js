export function normalizeHeader(columnName) {
  return String(columnName ?? '')
    .trim()
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const ORGANISATION_NAME_HEADER = /(^|_)(asc|service_(?:centre|center)|collection_point|supplier|vendor|dealer|business|company|organisation|organization|branch|store|shop|clinic|hospital|office)(?:_.*)?_name$/;
const NAME_OF_ORGANISATION_HEADER = /(^|_)name_(?:.*_)?(centre|center|supplier|vendor|dealer|business|company|organisation|organization|branch|store|shop|clinic|hospital|office)(_|$)/;

export function isOrganisationNameHeader(columnName) {
  const header = normalizeHeader(columnName);
  return ORGANISATION_NAME_HEADER.test(header) || NAME_OF_ORGANISATION_HEADER.test(header);
}
