/**
 * Hebrew merchant category classifier for Israeli bank transactions.
 *
 * Uses keyword-based matching against transaction descriptions to classify
 * transactions into spending categories. Handles both Hebrew and English
 * merchant names commonly found in Israeli bank statements.
 */

export interface CategoryDefinitionEntry {
  label: string;
  hebrewLabel: string;
  color: string;
}

/**
 * Maps Hebrew category names from Israeli bank scrapers (e.g. Max) to our
 * internal English category IDs. The scrapers set txn.category to Hebrew
 * strings like "מזון וצריכה" which don't match our ID-based color lookup.
 */
const HEBREW_SCRAPER_CATEGORY_MAP: Record<string, string> = {
  'מזון וצריכה': 'food',
  'מסעדות, קפה וברים': 'restaurants',
  'מסעדות קפה וברים': 'restaurants',
  'ביטוח': 'insurance',
  'העברת כספים': 'transfer',
  'פנאי, בידור וספורט': 'entertainment',
  'פנאי בידור וספורט': 'entertainment',
  'דלק, חשמל וגז': 'fuel',
  'דלק חשמל וגז': 'fuel',
  'חשמל ומחשבים': 'electronics',
  'תחבורה ורכבים': 'transport',
  'תחבורה': 'transport',
  'שונות': 'other',
  'אופנה': 'clothing',
  'שירותי תקשורת': 'utilities',
  'רפואה ובתי מרקחת': 'health',
  'רפואה': 'health',
  'עיצוב הבית': 'home',
  'עירייה וממשלה': 'utilities',
  'קוסמטיקה וטיפוח': 'shopping',
  'טיסות ותיירות': 'entertainment',
  'משיכת מזומן': 'cash',
  'חיות מחמד': 'other',
  'חינוך': 'education',
  'סופרמרקטים': 'food',
  'מזון': 'food',
  'מסעדות': 'restaurants',
  'בילוי ופנאי': 'entertainment',
  'ביגוד והנעלה': 'clothing',
  'בריאות': 'health',
  'תקשורת': 'utilities',
};

/**
 * Maps each category ID to an array of keyword patterns (Hebrew and English).
 * Patterns are matched case-insensitively against transaction descriptions.
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  card_payment: [
    'מקס איט פיננסים',
    'ישראכרט בע"מ',
    'ישראכרט בע',
    'עפ"י הרשאה כאל',
    'כאל בע"מ',
    'ויזה כאל',
    'לאומי ויזה',
    'לאומי קארד',
    'אמריקן אקספרס',
  ],
  mortgage: [
    'משכנתא',
    'משכנתה',
    'פועלים-משכנתא',
    'MORTGAGE',
  ],
  loan: [
    'הלוואה',
    'תשלום קרן',
    'LOAN',
  ],
  pension: [
    'גמל ופנסיה',
    'מור גמל',
    'הפניקס גמל',
    'מגדל גמל',
    'הראל גמל',
    'מנורה גמל',
    'קרן השתלמות',
    'פנסיה',
    'PENSION',
  ],
  bank_fees: [
    'עמלת פעולה',
    'עמלת ניהול',
    'דמי ניהול חשבון',
    'עמלה בנקאית',
  ],
  food: [
    'סופר',
    'מרקט',
    'שופרסל',
    'רמי לוי',
    'מגה',
    'ויקטורי',
    'יוחננוף',
    'חצי חינם',
    'אושר עד',
    'קרפור',
    'מינימרקט',
    'מכולת',
    'פירות',
    'ירקות',
    'מאפייה',
    'בשר',
    'שוק',
    'טיב טעם',
    'ניו פארם',
    'פרש מרקט',
    'סופר דוש',
    'סופר יהודה',
    'AM:PM',
    'SHUFERSAL',
  ],
  restaurants: [
    'מסעדה',
    'קפה',
    'פיצה',
    'בורגר',
    'שווארמה',
    'פלאפל',
    'סושי',
    'מקדונלד',
    'ארומה',
    'קפה קפה',
    'גרג',
    'לנדוור',
    'דומינו',
    'מאפה נאמן',
    'רולדין',
    'קופי בין',
    'פאפא ג\'ונס',
    'בורגר קינג',
    'KFC',
    'MCDONALD',
    'PIZZA',
    'CAFE',
    'RESTAURANT',
    'BURGER',
    'WOLT',
    'וולט',
    'JAPANIKA',
    'ג\'פניקה',
    'BBB',
    'MOSES',
    'מוזס',
    'שיפודי',
    'גריל',
    'אגאדיר',
    'בנדיקט',
  ],
  insurance: [
    'ביטוח',
    'הפניקס',
    'מגדל',
    'הראל',
    'כלל',
    'מנורה',
    'איילון',
    'שלמה ביטוח',
    'ביט ביטוח',
    'רכב חובה',
    'PHOENIX',
    'MIGDAL',
    'HAREL',
    'CLAL',
    'פוליסה',
  ],
  transport: [
    'רכבת',
    'אגד',
    'דן',
    'מטרופולין',
    'אוטובוס',
    'מונית',
    'גט',
    'יאנגו',
    'רב קו',
    'GETT',
    'YANGO',
    'UBER',
    'סופרבוס',
    'קווים',
    'נתיב אקספרס',
    'רכבת ישראל',
    'ISRAEL RAILWAYS',
    'חניון',
    'חניה',
    'פנגו',
    'PANGO',
    'CELLOPARK',
    'סלופארק',
  ],
  fuel: [
    'דלק',
    'סונול',
    'פז',
    'דור אלון',
    'TEN',
    'אלון',
    'תחנת דלק',
    'SONOL',
    'PAZ',
    'DOR ALON',
    'DELEK',
    'Yellow',
    'ילו',
  ],
  utilities: [
    'חשמל',
    'מים',
    'גז',
    'בזק',
    'סלקום',
    'פרטנר',
    'HOT',
    'YES',
    'פלאפון',
    'גולן טלקום',
    '012',
    'אינטרנט',
    'חברת החשמל',
    'מקורות',
    'BEZEQ',
    'CELLCOM',
    'PARTNER',
    'PELEPHONE',
    'GOLAN TELECOM',
    'עיריית',
    'ארנונה',
    'ועד בית',
  ],
  health: [
    'מכבי',
    'כללית',
    'מאוחדת',
    'לאומית',
    'בריאות',
    'רפואה',
    'שיניים',
    'רופא',
    'בית מרקחת',
    'סופר פארם',
    'BE',
    'SUPER PHARM',
    'SUPERPHARM',
    'מרקחת',
    'אופטיקה',
    'עיניים',
    'פיזיותרפיה',
    'קופת חולים',
    'בית חולים',
  ],
  entertainment: [
    'סינמה',
    'קולנוע',
    'נטפליקס',
    'ספוטיפיי',
    'אפל מיוזיק',
    'הופעה',
    'הצגה',
    'תיאטרון',
    'יס פלאנט',
    'CINEMA',
    'NETFLIX',
    'SPOTIFY',
    'APPLE MUSIC',
    'סינמה סיטי',
    'לב',
    'גלובוס',
    'DISNEY',
    'HBO',
    'לונה פארק',
    'אטרקציה',
    'מוזיאון',
    'STEAM',
    'PLAYSTATION',
    'XBOX',
  ],
  shopping: [
    'קניון',
    'H&M',
    'ZARA',
    'FOX',
    'קסטרו',
    'גולף',
    'אמריקן איגל',
    'נעלי',
    'AMERICAN EAGLE',
    'IKEA',
    'איקאה',
    'עצמאות',
    'ACE',
    'הום סנטר',
    'HOME CENTER',
    'ALIEXPRESS',
    'אלי אקספרס',
    'SHEIN',
    'TEMU',
  ],
  clothing: [
    'ביגוד',
    'CASTRO',
    'GOLF',
    'RENUAR',
    'רנואר',
    'מנגו',
    'MANGO',
    'PULL&BEAR',
    'BERSHKA',
    'MASSIMO',
    'TNF',
    'ADIDAS',
    'אדידס',
    'NIKE',
    'נייקי',
    'PUMA',
    'פומה',
    'TERMINAL X',
    'טרמינל',
    'SHILAV',
    'שילב',
  ],
  electronics: [
    'אלקטרוניקה',
    'BUG',
    'באג',
    'KSP',
    'IVORY',
    'איבורי',
    'APPLE',
    'אפל',
    'SAMSUNG',
    'סמסונג',
    'מחשב',
    'טלפון',
    'MAHSANEI HASHMAL',
    'מחסני חשמל',
    'עולם המחשבים',
  ],
  education: [
    'חינוך',
    'אוניברסיטה',
    'מכללה',
    'קורס',
    'לימודים',
    'גן ילדים',
    'בית ספר',
    'UDEMY',
    'COURSERA',
    'שכר לימוד',
    'צהרון',
    'חוגים',
  ],
  online: [
    'קניות אונליין',
    'AMAZON',
    'EBAY',
    'PAYPAL',
    'אמזון',
    'WISH',
    'ASOS',
    'BOOKING',
    'AIRBNB',
  ],
  salary: [
    'משכורת',
    'שכר',
    'SALARY',
    'העברת שכר',
    'תלוש',
  ],
  transfer: [
    'העברה',
    'העברה בנקאית',
    'BIT',
    'PAYBOX',
    'ביט',
    'פייבוקס',
    'PEPPER',
    'פפר',
  ],
  cash: [
    'כספומט',
    'משיכת מזומן',
    'ATM',
    'מזומן',
    'משיכה',
    'CASH',
  ],
  subscriptions: [
    'מנוי',
    'חודשי',
    'APPLE',
    'GOOGLE',
    'AMAZON PRIME',
    'SPOTIFY',
    'NETFLIX',
    'MICROSOFT',
    'ADOBE',
    'DROPBOX',
    'ICLOUD',
  ],
  home: [
    'שיפוצים',
    'רהיטים',
    'ריהוט',
    'IKEA',
    'איקאה',
    'הום סנטר',
    'HOME CENTER',
    'ACE',
    'מטבח',
    'אינסטלציה',
    'חשמלאי',
    'שרברב',
    'ניקיון',
    'גינון',
    'משתלה',
    'טמבור',
  ],
};

/**
 * Full category definitions with English label, Hebrew label, and color.
 * Covers all categories supported by the keyword classifier.
 */
export const CATEGORY_DEFINITIONS: Record<string, CategoryDefinitionEntry> = {
  card_payment:   { label: 'Card Payment',   hebrewLabel: 'תשלום כרטיס',       color: '#b0bec5' },
  mortgage:       { label: 'Mortgage',        hebrewLabel: 'משכנתא',            color: '#5c6bc0' },
  loan:           { label: 'Loan',            hebrewLabel: 'הלוואה',            color: '#7986cb' },
  pension:        { label: 'Pension',         hebrewLabel: 'פנסיה וגמל',        color: '#26a69a' },
  bank_fees:      { label: 'Bank Fees',       hebrewLabel: 'עמלות בנק',         color: '#90a4ae' },
  food:           { label: 'Groceries',      hebrewLabel: 'מזון',              color: '#4caf50' },
  restaurants:    { label: 'Restaurants',     hebrewLabel: 'מסעדות',            color: '#ff9800' },
  insurance:      { label: 'Insurance',       hebrewLabel: 'ביטוח',             color: '#3f51b5' },
  transport:      { label: 'Transportation',  hebrewLabel: 'תחבורה',            color: '#00bcd4' },
  fuel:           { label: 'Fuel',            hebrewLabel: 'דלק',              color: '#795548' },
  utilities:      { label: 'Utilities',       hebrewLabel: 'חשבונות',           color: '#607d8b' },
  health:         { label: 'Health',          hebrewLabel: 'בריאות',            color: '#f44336' },
  entertainment:  { label: 'Entertainment',   hebrewLabel: 'בידור',             color: '#ff5722' },
  shopping:       { label: 'Shopping',        hebrewLabel: 'קניות',             color: '#ab47bc' },
  clothing:       { label: 'Clothing',        hebrewLabel: 'ביגוד',             color: '#e91e63' },
  electronics:    { label: 'Electronics',     hebrewLabel: 'אלקטרוניקה',       color: '#2196f3' },
  education:      { label: 'Education',       hebrewLabel: 'חינוך',             color: '#009688' },
  online:         { label: 'Online Shopping', hebrewLabel: 'קניות אונליין',     color: '#9c27b0' },
  salary:         { label: 'Salary',          hebrewLabel: 'משכורת',            color: '#8bc34a' },
  transfer:       { label: 'Transfer',        hebrewLabel: 'העברה',             color: '#78909c' },
  cash:           { label: 'Cash',            hebrewLabel: 'מזומן',             color: '#ffc107' },
  subscriptions:  { label: 'Subscriptions',   hebrewLabel: 'מנויים',            color: '#7e57c2' },
  home:           { label: 'Home',            hebrewLabel: 'בית',              color: '#8d6e63' },
  other:          { label: 'Other',           hebrewLabel: 'אחר',              color: '#9e9e9e' },
};

/**
 * Classify a transaction description into a category ID using keyword matching.
 *
 * Performs case-insensitive substring matching against all keyword patterns.
 * Returns the first matching category ID, or undefined if no match is found.
 *
 * Keyword order in CATEGORY_KEYWORDS determines priority when multiple
 * categories could match (first match wins).
 */
export function classifyTransaction(description: string): string | undefined {
  const normalizedDescription = description.toLowerCase();

  for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalizedDescription.includes(keyword.toLowerCase())) {
        return categoryId;
      }
    }
  }

  return undefined;
}

/**
 * Returns the effective category for a transaction.
 *
 * Priority order:
 * 1. If the scraper provided a Hebrew category, map it to our English ID
 * 2. If the scraper provided an English category matching our IDs, use it
 * 3. Attempt keyword-based classification from the description
 * 4. Fall back to 'other'
 */
export function getEffectiveCategory(
  txn: { category?: string; description: string },
  userRules?: Map<string, string>,
): string {
  if (userRules) {
    const userCategory = userRules.get(txn.description);
    if (userCategory) return userCategory;
  }

  if (txn.category && txn.category.trim().length > 0) {
    const mapped = HEBREW_SCRAPER_CATEGORY_MAP[txn.category.trim()];
    if (mapped) return mapped;

    if (txn.category in CATEGORY_DEFINITIONS) return txn.category;
  }

  return classifyTransaction(txn.description) ?? 'other';
}
