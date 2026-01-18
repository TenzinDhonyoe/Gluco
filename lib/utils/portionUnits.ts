export type FoodCategory = 'protein' | 'grain' | 'liquid' | 'powder' | 'produce' | 'default';

const CATEGORY_KEYWORDS: Record<FoodCategory, string[]> = {
  protein: [
    'chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'steak', 'meat', 'lamb', 'turkey',
    'shrimp', 'egg', 'eggs', 'tofu', 'tempeh', 'sausage', 'bacon', 'ham',
  ],
  liquid: [
    'milk', 'juice', 'water', 'coffee', 'tea', 'soda', 'broth', 'sauce', 'soy sauce',
    'oil', 'olive oil', 'cream', 'soup', 'smoothie', 'shake', 'yogurt drink',
  ],
  powder: [
    'sugar', 'flour', 'salt', 'powder', 'protein powder', 'spice', 'seasoning',
    'cinnamon', 'cocoa', 'paprika', 'garlic powder', 'onion powder',
  ],
  grain: [
    'rice', 'pasta', 'oatmeal', 'cereal', 'bread', 'noodle', 'tortilla', 'wrap',
    'quinoa', 'barley', 'granola',
  ],
  produce: [
    'apple', 'banana', 'orange', 'carrot', 'tomato', 'onion', 'potato', 'lettuce',
    'spinach', 'kale', 'berries', 'strawberry', 'blueberry', 'broccoli',
  ],
  default: [],
};

const CATEGORY_UNITS: Record<FoodCategory, string[]> = {
  protein: ['serving', 'oz', 'g', 'lb'],
  liquid: ['cup', 'ml', 'oz', 'tbsp', 'tsp'],
  powder: ['tbsp', 'tsp', 'cup', 'g'],
  grain: ['cup', 'serving', 'g', 'oz'],
  produce: ['serving', 'cup', 'g', 'slice', 'whole'],
  default: ['serving', 'cup', 'tbsp', 'tsp', 'oz', 'g'],
};

const SAFE_UNITS = ['serving', 'g', 'oz'];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(token: string) {
  if (token.endsWith('ies') && token.length > 3) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith('s') && token.length > 2) {
    return token.slice(0, -1);
  }
  return token;
}

function matchesKeyword(normalizedName: string, tokens: Set<string>, keyword: string) {
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return false;

  if (normalizedKeyword.includes(' ')) {
    return normalizedName.includes(normalizedKeyword);
  }

  return tokens.has(normalizedKeyword) || tokens.has(singularize(normalizedKeyword));
}

function getCategory(foodName: string): FoodCategory {
  const normalizedName = normalize(foodName);
  if (!normalizedName) return 'default';

  const tokens = new Set(normalizedName.split(' ').map(singularize));
  const scores: Record<FoodCategory, number> = {
    protein: 0,
    grain: 0,
    liquid: 0,
    powder: 0,
    produce: 0,
    default: 0,
  };

  (Object.keys(CATEGORY_KEYWORDS) as FoodCategory[]).forEach((category) => {
    CATEGORY_KEYWORDS[category].forEach((keyword) => {
      if (matchesKeyword(normalizedName, tokens, keyword)) {
        scores[category] += 1;
      }
    });
  });

  const best = (Object.keys(scores) as FoodCategory[])
    .filter((category) => category !== 'default')
    .sort((a, b) => scores[b] - scores[a])[0];

  if (!best || scores[best] === 0) return 'default';
  return best;
}

function uniqUnits(units: string[]) {
  const seen = new Set<string>();
  return units.filter((unit) => {
    const key = unit.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getSmartUnitOptions(foodName: string, existingUnit?: string): string[] {
  const category = getCategory(foodName);
  let units = CATEGORY_UNITS[category] || CATEGORY_UNITS.default;

  if (!units || units.length === 0) {
    units = CATEGORY_UNITS.default;
  }

  const normalizedExisting = existingUnit?.trim().toLowerCase();
  if (normalizedExisting && !units.includes(normalizedExisting)) {
    units = [normalizedExisting, ...units];
  }

  const baseUnits = uniqUnits(units);
  if (baseUnits.length === 0) {
    return CATEGORY_UNITS.default;
  }

  const failSafeUnits = uniqUnits([...baseUnits, ...SAFE_UNITS]);
  return failSafeUnits;
}
