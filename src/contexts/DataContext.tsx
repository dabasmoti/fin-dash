import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { BankScraperData, EnrichedTransaction } from "@/types/bank";
import { getAllEnrichedTransactions } from "@/lib/data-utils";
import {
  checkHealth,
  fetchAllBankData,
  fetchCategoryRules,
  setCategoryRule as apiSetCategoryRule,
  deleteCategoryRule as apiDeleteCategoryRule,
} from "@/services/api-client";

interface DataContextValue {
  bankData: BankScraperData[];
  enrichedTransactions: EnrichedTransaction[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  categoryRules: Map<string, string>;
  setCategoryRule: (description: string, categoryId: string) => Promise<void>;
  clearCategoryRule: (description: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [bankData, setBankData] = useState<BankScraperData[]>([]);
  const [enrichedTransactions, setEnrichedTransactions] = useState<
    EnrichedTransaction[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryRules, setCategoryRulesState] = useState<Map<string, string>>(
    new Map(),
  );

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log("[DataContext] Checking API health...");
      const health = await checkHealth();
      console.log("[DataContext] Health:", health);

      if (health.configuredBanks.length === 0) {
        setError("No banks configured. Add credentials to .env and restart the server.");
        setIsLoading(false);
        return;
      }

      console.log("[DataContext] Scraping banks:", health.configuredBanks.join(", "));
      const [apiData, rules] = await Promise.all([
        fetchAllBankData(),
        fetchCategoryRules(),
      ]);
      console.log("[DataContext] Received data for:", apiData.map(d => d.bankId));
      const transactions = getAllEnrichedTransactions(apiData);
      console.log("[DataContext] Transactions:", transactions.length);
      setBankData(apiData);
      setEnrichedTransactions(transactions);

      const rulesMap = new Map(rules.map(r => [r.description, r.category_id]));
      setCategoryRulesState(rulesMap);
      console.log("[DataContext] Category rules loaded:", rulesMap.size);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown API error";
      console.error("[DataContext] Error:", message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setCategoryRule = useCallback(async (description: string, categoryId: string) => {
    const previousValue = categoryRules.get(description);
    setCategoryRulesState(prev => {
      const next = new Map(prev);
      next.set(description, categoryId);
      return next;
    });

    try {
      await apiSetCategoryRule(description, categoryId);
    } catch (err) {
      setCategoryRulesState(prev => {
        const next = new Map(prev);
        if (previousValue) {
          next.set(description, previousValue);
        } else {
          next.delete(description);
        }
        return next;
      });
      throw err;
    }
  }, [categoryRules]);

  const clearCategoryRule = useCallback(async (description: string) => {
    const previousValue = categoryRules.get(description);
    setCategoryRulesState(prev => {
      const next = new Map(prev);
      next.delete(description);
      return next;
    });

    try {
      await apiDeleteCategoryRule(description);
    } catch (err) {
      if (previousValue) {
        setCategoryRulesState(prev => {
          const next = new Map(prev);
          next.set(description, previousValue);
          return next;
        });
      }
      throw err;
    }
  }, [categoryRules]);

  const value = useMemo(
    () => ({
      bankData,
      enrichedTransactions,
      isLoading,
      error,
      refresh: fetchData,
      categoryRules,
      setCategoryRule,
      clearCategoryRule,
    }),
    [bankData, enrichedTransactions, isLoading, error, fetchData, categoryRules, setCategoryRule, clearCategoryRule],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
