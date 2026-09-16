// Everything in the app is stored in inches. These helpers convert to and
// from the feet-and-inches notation people actually measure basements in.

export function formatFtIn(inches, { fractions = false } = {}) {
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  let ft = Math.floor(abs / 12);
  let rem = abs - ft * 12;

  if (fractions) {
    // Round to the nearest 1/8".
    rem = Math.round(rem * 8) / 8;
  } else {
    rem = Math.round(rem);
  }
  if (rem >= 12) {
    ft += 1;
    rem -= 12;
  }

  if (!fractions) return rem === 0 ? `${sign}${ft}'` : `${sign}${ft}'${rem}"`;

  const whole = Math.floor(rem);
  const frac = rem - whole;
  const eighths = Math.round(frac * 8);
  const fracStr = eighths === 0 ? '' : ` ${reduceEighths(eighths)}`;
  if (whole === 0 && !fracStr) return `${sign}${ft}'`;
  return `${sign}${ft}'${whole}${fracStr}"`;
}

function reduceEighths(eighths) {
  const map = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' };
  return map[eighths] || '';
}

export function formatInches(inches) {
  const rounded = Math.round(inches * 10) / 10;
  return `${rounded}"`;
}

export function formatFeetDecimal(inches, digits = 1) {
  return `${(inches / 12).toFixed(digits)} ft`;
}

export function formatArea(squareInches) {
  const sqft = squareInches / 144;
  return `${sqft.toFixed(sqft < 100 ? 1 : 0)} sq ft`;
}

// Accepts: 150, 150", 12', 12'6", 12' 6", 12-6, 12.5', 12 ft 6 in
export function parseLength(input, defaultUnit = 'in') {
  if (input == null) return null;
  const str = String(input).trim().toLowerCase();
  if (!str) return null;

  const plain = Number(str);
  if (Number.isFinite(plain)) return defaultUnit === 'ft' ? plain * 12 : plain;

  const normalized = str
    .replace(/feet|foot|ft\.?/g, "'")
    .replace(/inches|inch|in\.?/g, '"')
    .replace(/\s+/g, ' ');

  // 12'6" / 12' 6" / 12'
  const ftIn = normalized.match(/^(-?\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/);
  if (ftIn) {
    const feet = Number(ftIn[1]);
    const inch = ftIn[2] ? Number(ftIn[2]) : 0;
    return feet < 0 ? feet * 12 - inch : feet * 12 + inch;
  }

  // 150"
  const inchesOnly = normalized.match(/^(-?\d+(?:\.\d+)?)\s*"$/);
  if (inchesOnly) return Number(inchesOnly[1]);

  // 12-6 (feet-inches shorthand)
  const dash = normalized.match(/^(-?\d+)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (dash) {
    const feet = Number(dash[1]);
    const inch = Number(dash[2]);
    return feet < 0 ? feet * 12 - inch : feet * 12 + inch;
  }

  return null;
}
