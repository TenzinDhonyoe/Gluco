export interface ParsedMealItem {
  name: string;
  quantity: number;
  unit: string | null;
  raw: string;
}

const UNIT_ALIASES: Record<string, string> = {
  cup: 'cup',
  cups: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  slice: 'slice',
  slices: 'slice',
  piece: 'piece',
  pieces: 'piece',
};

function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const mixedMatch = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = Number(mixedMatch[1]);
    const numerator = Number(mixedMatch[2]);
    const denominator = Number(mixedMatch[3]);
    if (denominator) {
      return whole + numerator / denominator;
    }
  }

  const fractionMatch = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator) {
      return numerator / denominator;
    }
  }

  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return numeric;
  }

  return null;
}

function normalizeUnit(rawUnit: string | undefined): string | null {
  if (!rawUnit) return null;
  const normalized = rawUnit.toLowerCase();
  return UNIT_ALIASES[normalized] || null;
}

// Build a regex pattern that only matches known units
const UNIT_PATTERN = Object.keys(UNIT_ALIASES).join('|');

export function parseMealDescription(text: string): ParsedMealItem[] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const normalizedPart = part
        .replace(/^(a|an)\s+/i, '1 ')
        .replace(/\btable\s+spoons?\b/gi, 'tablespoon')
        .replace(/\btea\s+spoons?\b/gi, 'teaspoon');

      // First try to match with a known unit
      // Pattern: quantity + optional unit (only known units) + optional "of" + food name
      const unitRegex = new RegExp(
        `^(\\d+(?:\\s+\\d+\\/\\d+)?|\\d+\\/\\d+|\\d*\\.\\d+)\\s*(${UNIT_PATTERN})\\s*(?:of\\s+)?(.+)$`,
        'i'
      );
      const matchWithUnit = normalizedPart.match(unitRegex);

      if (matchWithUnit) {
        const quantity = parseQuantity(matchWithUnit[1]) ?? 1;
        const unit = normalizeUnit(matchWithUnit[2]);
        const name = matchWithUnit[3].trim();

        return {
          name,
          quantity,
          unit,
          raw: part,
        };
      }

      // Try to match without a unit: quantity + optional "of" + food name
      const noUnitRegex = /^(\d+(?:\s+\d+\/\d+)?|\d+\/\d+|\d*\.\d+)\s*(?:of\s+)?(.+)$/i;
      const matchNoUnit = normalizedPart.match(noUnitRegex);

      if (matchNoUnit) {
        const quantity = parseQuantity(matchNoUnit[1]) ?? 1;
        const name = matchNoUnit[2].trim();

        return {
          name,
          quantity,
          unit: null,
          raw: part,
        };
      }

      // No quantity found - treat entire text as food name with quantity 1
      return {
        name: part,
        quantity: 1,
        unit: null,
        raw: part,
      };
    });
}
