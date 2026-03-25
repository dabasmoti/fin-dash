/**
 * Shared category normalization utilities for the server.
 *
 * Maps Hebrew category names from Israeli bank scrapers to normalized
 * English category IDs, and provides keyword-based classification for
 * beinleumi transactions that lack a category.
 */

const HEBREW_TO_CATEGORY_ID: Record<string, string> = {
  'מזון וצריכה': 'food',
  'מזון': 'food',
  'סופרמרקטים': 'food',
  'מסעדות, קפה וברים': 'restaurants',
  'מסעדות קפה וברים': 'restaurants',
  'מסעדות': 'restaurants',
  'ביטוח': 'insurance',
  'ביטוח ופיננסים': 'insurance',
  'העברת כספים': 'transfer',
  'פנאי, בידור וספורט': 'entertainment',
  'פנאי בידור וספורט': 'entertainment',
  'בילוי ופנאי': 'entertainment',
  'דלק, חשמל וגז': 'fuel',
  'דלק חשמל וגז': 'fuel',
  'חשמל ומחשבים': 'electronics',
  'תחבורה ורכבים': 'transport',
  'תחבורה': 'transport',
  'שונות': 'other',
  'אופנה': 'clothing',
  'ביגוד והנעלה': 'clothing',
  'שירותי תקשורת': 'utilities',
  'תקשורת': 'utilities',
  'רפואה ובתי מרקחת': 'health',
  'רפואה ובריאות': 'health',
  'רפואה': 'health',
  'בריאות': 'health',
  'עיצוב הבית': 'home',
  'עירייה וממשלה': 'utilities',
  'קוסמטיקה וטיפוח': 'shopping',
  'ציוד ומשרד': 'shopping',
  'טיסות ותיירות': 'entertainment',
  'משיכת מזומן': 'cash',
  'חיות מחמד': 'other',
  'חינוך': 'education',
};

const VALID_CATEGORY_IDS = new Set([
  'mortgage', 'loan', 'pension', 'bank_fees', 'food', 'restaurants',
  'fuel', 'clothing', 'electronics', 'online', 'utilities', 'health',
  'transport', 'entertainment', 'insurance', 'education', 'shopping',
  'subscriptions', 'home', 'cash', 'salary', 'transfer', 'credit_card',
  'other',
]);

/**
 * Hebrew keyword-to-category mapping for beinleumi transactions whose
 * category is NULL in the database. Checked in order; first match wins.
 */
const DESCRIPTION_KEYWORDS: [string, string][] = [
  ['סופר', 'food'], ['מזון', 'food'], ['שופרסל', 'food'], ['רמי לוי', 'food'],
  ['מסעד', 'restaurants'], ['קפה', 'restaurants'],
  ['ביטוח', 'insurance'],
  ['דלק', 'fuel'], ['פז ', 'fuel'], ['סונול', 'fuel'],
  ['חשמל', 'utilities'], ['מים ', 'utilities'], ['בזק', 'utilities'],
  ['סלקום', 'utilities'], ['פלאפון', 'utilities'], ['פרטנר', 'utilities'], ['הוט ', 'utilities'],
  ['רפואה', 'health'], ['מרקח', 'health'], ['כללית', 'health'], ['מכבי', 'health'],
  ['חינוך', 'education'],
  ['גן ', 'education'],
  ['משכנ', 'mortgage'], ['שכר דירה', 'home'],
  ['הלוואה', 'loan'],
  ['משכורת', 'salary'],
  ['תחבור', 'transport'], ['חניה', 'transport'], ['רכב', 'transport'],
  ['גמל', 'pension'], ['פנסיה', 'pension'],
  ['קצבת', 'salary'],
];

/**
 * Classifies a beinleumi transaction description into a spending category
 * by scanning for Hebrew keyword matches. Returns 'other' when no keyword
 * matches.
 */
export function classifyDescription(desc: string): string {
  for (const [keyword, category] of DESCRIPTION_KEYWORDS) {
    if (desc.includes(keyword)) {
      return category;
    }
  }
  return 'other';
}

/**
 * Normalizes a raw category (Hebrew or English) to a valid English category ID.
 * Falls back to keyword matching on description if category is null.
 */
export function normalizeCategory(
  rawCategory: string | null | undefined,
  description?: string,
): string {
  if (!rawCategory) {
    return description ? classifyDescription(description) : 'other';
  }
  if (VALID_CATEGORY_IDS.has(rawCategory)) return rawCategory;
  return HEBREW_TO_CATEGORY_ID[rawCategory] ?? 'other';
}
