export interface CategoryDefinition {
  id: string;
  labelHe: string;
  labelEn: string;
  icon: string;
  color: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  { id: 'mortgage', labelHe: 'משכנתא', labelEn: 'Mortgage', icon: 'Home', color: '#5c6bc0' },
  { id: 'loan', labelHe: 'הלוואה', labelEn: 'Loan', icon: 'Landmark', color: '#7986cb' },
  { id: 'pension', labelHe: 'פנסיה וגמל', labelEn: 'Pension', icon: 'PiggyBank', color: '#26a69a' },
  { id: 'bank_fees', labelHe: 'עמלות בנק', labelEn: 'Bank Fees', icon: 'Building', color: '#90a4ae' },
  { id: 'food', labelHe: 'מזון', labelEn: 'Groceries', icon: 'ShoppingCart', color: '#4caf50' },
  { id: 'restaurants', labelHe: 'מסעדות', labelEn: 'Restaurants', icon: 'UtensilsCrossed', color: '#ff9800' },
  { id: 'fuel', labelHe: 'דלק', labelEn: 'Fuel', icon: 'Fuel', color: '#795548' },
  { id: 'clothing', labelHe: 'ביגוד', labelEn: 'Clothing', icon: 'Shirt', color: '#e91e63' },
  { id: 'electronics', labelHe: 'אלקטרוניקה', labelEn: 'Electronics', icon: 'Laptop', color: '#2196f3' },
  { id: 'online', labelHe: 'קניות אונליין', labelEn: 'Online Shopping', icon: 'Globe', color: '#9c27b0' },
  { id: 'utilities', labelHe: 'חשבונות', labelEn: 'Utilities', icon: 'Zap', color: '#607d8b' },
  { id: 'health', labelHe: 'בריאות', labelEn: 'Health', icon: 'Heart', color: '#f44336' },
  { id: 'transport', labelHe: 'תחבורה', labelEn: 'Transportation', icon: 'Bus', color: '#00bcd4' },
  { id: 'entertainment', labelHe: 'בידור', labelEn: 'Entertainment', icon: 'Music', color: '#ff5722' },
  { id: 'insurance', labelHe: 'ביטוח', labelEn: 'Insurance', icon: 'Shield', color: '#3f51b5' },
  { id: 'education', labelHe: 'חינוך', labelEn: 'Education', icon: 'GraduationCap', color: '#009688' },
  { id: 'shopping', labelHe: 'קניות', labelEn: 'Shopping', icon: 'ShoppingBag', color: '#ab47bc' },
  { id: 'subscriptions', labelHe: 'מנויים', labelEn: 'Subscriptions', icon: 'Repeat', color: '#7e57c2' },
  { id: 'home', labelHe: 'בית', labelEn: 'Home', icon: 'Hammer', color: '#8d6e63' },
  { id: 'cash', labelHe: 'מזומן', labelEn: 'Cash', icon: 'Wallet', color: '#ffc107' },
  { id: 'salary', labelHe: 'משכורת', labelEn: 'Salary', icon: 'Banknote', color: '#8bc34a' },
  { id: 'transfer', labelHe: 'העברה', labelEn: 'Transfer', icon: 'ArrowRightLeft', color: '#78909c' },
  { id: 'credit_card', labelHe: 'חיובי אשראי', labelEn: 'Credit Card', icon: 'CreditCard', color: '#b0bec5' },
];

export const CATEGORY_HEBREW_MAP: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((cat) => [cat.id, cat.labelHe]),
);

export const CATEGORY_ENGLISH_MAP: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((cat) => [cat.id, cat.labelEn]),
);

export const CATEGORY_COLOR_MAP: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((cat) => [cat.id, cat.color]),
);

export function getCategoryLabel(categoryId: string, locale: 'he' | 'en' = 'he'): string {
  const category = CATEGORIES.find((cat) => cat.id === categoryId);
  if (!category) return categoryId;
  return locale === 'he' ? category.labelHe : category.labelEn;
}

export function getCategoryColor(categoryId: string): string {
  return CATEGORY_COLOR_MAP[categoryId] ?? '#9e9e9e';
}

/**
 * Maps Hebrew category names from Israeli bank scrapers to English category IDs.
 * Used to normalize raw Hebrew categories stored in the database.
 */
export const HEBREW_TO_CATEGORY_ID: Record<string, string> = {
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

const VALID_CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

/**
 * Normalizes a raw category (Hebrew or English) to a valid English category ID.
 * Reusable across any page or component.
 */
export function normalizeCategory(raw: string | null | undefined): string {
  if (!raw) return 'other';
  if (VALID_CATEGORY_IDS.has(raw)) return raw;
  return HEBREW_TO_CATEGORY_ID[raw] ?? 'other';
}
