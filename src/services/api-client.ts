import type { BankScraperData } from '@/types/bank';

/**
 * Wrapper around fetch that throws on 401 responses.
 * AuthGuard handles the redirect to /login — no page reload needed.
 */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (res.status === 401 && !url.includes('/api/auth/')) {
    throw new Error('Session expired');
  }
  return res;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  configuredBanks: string[];
  cacheStatus: Record<string, { cached: boolean; ageMs?: number }>;
}

interface ScrapeAllResponse {
  success: boolean;
  data: BankScraperData[];
  cached: Record<string, boolean>;
  totalDurationMs: number;
}

interface ScrapeSingleResponse {
  success: boolean;
  data: BankScraperData;
  cached: boolean;
  scrapeDurationMs: number;
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await apiFetch('/api/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function fetchAllBankData(fresh = false): Promise<BankScraperData[]> {
  // Local dev: scrape live. Production (Cloud Run): read from DB.
  const isLocal = window.location.hostname === 'localhost';
  const url = (isLocal || fresh) ? '/api/scrape/all' + (fresh ? '?fresh=true' : '') : '/api/data/all';
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Data fetch failed: ${res.status}`);
  const json: ScrapeAllResponse = await res.json();
  return json.data;
}

export async function fetchSingleBankData(bankId: string, fresh = false): Promise<BankScraperData> {
  const url = fresh ? `/api/scrape/${bankId}?fresh=true` : `/api/scrape/${bankId}`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`Scrape ${bankId} failed: ${res.status}`);
  const json: ScrapeSingleResponse = await res.json();
  return json.data;
}

export async function clearCache(): Promise<void> {
  const res = await apiFetch('/api/cache/clear');
  if (!res.ok) throw new Error(`Cache clear failed: ${res.status}`);
}

export interface CategoryRule {
  description: string;
  category_id: string;
}

export async function fetchCategoryRules(): Promise<CategoryRule[]> {
  const res = await apiFetch('/api/category-rules');
  if (!res.ok) throw new Error(`Fetch category rules failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function setCategoryRule(description: string, categoryId: string): Promise<void> {
  const res = await apiFetch('/api/category-rules', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description, categoryId }),
  });
  if (!res.ok) throw new Error(`Set category rule failed: ${res.status}`);
}

export async function deleteCategoryRule(description: string): Promise<void> {
  const res = await apiFetch(`/api/category-rules/${encodeURIComponent(description)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Delete category rule failed: ${res.status}`);
}

export interface UpcomingCardBilling {
  bankId: string;
  accountNumber: string;
  bankDescription: string;
  chargeDay: number;
  chargeDate: string;
  amount: number;
  source: 'billing_cycle' | 'historical_avg';
}

export async function fetchUpcomingBillings(): Promise<UpcomingCardBilling[]> {
  const res = await apiFetch('/api/upcoming-billings');
  if (!res.ok) throw new Error(`Fetch upcoming billings failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}
