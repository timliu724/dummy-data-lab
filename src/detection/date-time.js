import { inspectTemporalValue, parseTemporal } from '../temporal/temporal-value.js';

/** @param {string} value */
export function parseTemporalValue(value) {
  return parseTemporal(value);
}

/** @param {import('../core/contracts.js').ColumnProfile} profile */
export function detectDateTime(profile) {
  const values = (profile.sampleValues ?? []).map(String);
  if (values.length === 0) return null;

  const inspections = values.map((value) => inspectTemporalValue(value));
  const recognized = inspections.map((entry) => entry.parsed).filter(Boolean);
  const temporalLookingCount = inspections.filter((entry) => entry.temporalLike).length;
  const invalidCount = inspections.filter((entry) => entry.status === 'INVALID').length;
  const unsupportedCount = inspections.filter((entry) => entry.status === 'UNSUPPORTED').length;
  const twoDigitYearCount = recognized.filter((entry) => entry.twoDigitYear).length;

  if (recognized.length !== values.length) {
    if (temporalLookingCount === values.length) {
      const onlyUnsupported = invalidCount === 0 && unsupportedCount > 0;
      return Object.freeze({
        detector: 'date-time',
        type: 'UNKNOWN',
        score: 94,
        confidence: 'LOW',
        evidence: Object.freeze([
          `${recognized.length} of ${values.length} date-like samples matched a supported calendar and clock format.`,
          onlyUnsupported
            ? 'The remaining values still look temporal, but their representation is not safely supported yet.'
            : 'At least one date-like value failed calendar or clock validation.',
        ]),
        warnings: Object.freeze([Object.freeze({
          code: onlyUnsupported ? 'UNSUPPORTED_TEMPORAL_FORMAT' : 'INVALID_DATE_LIKE_VALUES',
          message: onlyUnsupported
            ? 'Date-like values used an unsupported representation and require review before transformation.'
            : 'Date-like values failed validation and were not accepted as dates.',
          details: Object.freeze({
            sampleSize: values.length,
            validCount: recognized.length,
            invalidCount,
            unsupportedCount,
          }),
        })]),
        reviewRequired: true,
        details: Object.freeze({
          temporalLike: true,
          unsupportedTemporal: onlyUnsupported,
          invalidTemporal: invalidCount > 0,
        }),
      });
    }
    return null;
  }

  const kinds = new Set(recognized.map((entry) => entry.kind));
  if (kinds.size !== 1) {
    return Object.freeze({
      detector: 'date-time',
      type: 'UNKNOWN',
      score: 90,
      confidence: 'LOW',
      evidence: Object.freeze([`The bounded sample mixed temporal kinds: ${[...kinds].join(', ')}.`]),
      warnings: Object.freeze([Object.freeze({
        code: 'MIXED_TEMPORAL_KINDS',
        message: 'Dates, times, and date-times were mixed in one column.',
        details: Object.freeze({ kinds: Object.freeze([...kinds]) }),
      })]),
      reviewRequired: true,
      details: Object.freeze({ temporalLike: true }),
    });
  }

  const kind = recognized[0].kind;
  const dateBearing = kind === 'DATE' || kind === 'DATETIME';
  if (dateBearing) {
    const orientations = new Set(recognized.map((entry) => entry.orientation).filter(Boolean));
    const ambiguousCount = recognized.filter((entry) => entry.ambiguous).length;
    const conflictingNumericOrientation = orientations.has('DMY') && orientations.has('MDY');
    if (conflictingNumericOrientation || (ambiguousCount > 0 && orientations.size === 0)) {
      return Object.freeze({
        detector: 'date-time',
        type: 'AMBIGUOUS_DATE',
        score: 99,
        confidence: 'LOW',
        evidence: Object.freeze([
          `${ambiguousCount} of ${values.length} bounded samples could be read as either day/month or month/day.`,
          `Observed unambiguous orientations: ${orientations.size ? [...orientations].join(', ') : 'none'}.`,
        ]),
        warnings: Object.freeze([Object.freeze({
          code: 'AMBIGUOUS_DATE_ORDER',
          message: 'Day/month order cannot be selected reliably without user review.',
          details: Object.freeze({ sampleSize: values.length, ambiguousCount, temporalKind: kind }),
        })]),
        reviewRequired: true,
        details: Object.freeze({
          formats: Object.freeze([...new Set(recognized.map((entry) => entry.format))]),
          temporalKind: kind,
          temporalLike: true,
        }),
      });
    }

    const inferredFromOtherRows = ambiguousCount > 0;
    const centuryAssumed = twoDigitYearCount > 0;
    return Object.freeze({
      detector: 'date-time',
      type: kind,
      score: 93,
      confidence: inferredFromOtherRows || centuryAssumed ? 'MEDIUM' : values.length >= 3 ? 'HIGH' : 'MEDIUM',
      evidence: Object.freeze([
        `All ${values.length} bounded samples were valid ${kind === 'DATE' ? 'dates' : 'date-times'}.`,
        `Formats observed: ${[...new Set(recognized.map((entry) => entry.format))].join(', ')}.`,
        inferredFromOtherRows
          ? 'Ambiguous numeric dates were interpreted only because other rows established an orientation.'
          : 'No unresolved numeric date-order ambiguity remained.',
        ...(centuryAssumed ? ['Two-digit years use the explicit 00-69 to 2000-2069 and 70-99 to 1970-1999 assumption.'] : []),
      ]),
      warnings: Object.freeze([
        ...(inferredFromOtherRows ? [Object.freeze({
          code: 'DATE_ORDER_INFERRED_FROM_SAMPLE',
          message: 'Some numeric date values depend on the orientation inferred from other sampled rows.',
          details: Object.freeze({ ambiguousCount }),
        })] : []),
        ...(centuryAssumed ? [Object.freeze({
          code: 'TWO_DIGIT_YEAR_ASSUMED',
          message: 'Two-digit years require a century assumption; review the detected date range.',
          details: Object.freeze({ sampleSize: values.length, twoDigitYearCount }),
        })] : []),
      ]),
      reviewRequired: inferredFromOtherRows || centuryAssumed,
      details: Object.freeze({ orientations: Object.freeze([...orientations]), twoDigitYearCount, temporalLike: true }),
    });
  }

  return Object.freeze({
    detector: 'date-time',
    type: kind,
    score: 93,
    confidence: values.length >= 3 ? 'HIGH' : 'MEDIUM',
    evidence: Object.freeze([
      `All ${values.length} bounded samples matched valid time values.`,
      `Formats observed: ${[...new Set(recognized.map((entry) => entry.format))].join(', ')}.`,
    ]),
    warnings: Object.freeze([]),
    reviewRequired: values.length < 3,
    details: Object.freeze({ temporalLike: true }),
  });
}
