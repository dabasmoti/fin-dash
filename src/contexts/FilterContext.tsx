import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import type { CurrencyCode, FilterState } from "@/types/bank";

const MONTHS_BACK = 1;

function createDefaultDateRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - MONTHS_BACK);
  return { from, to };
}

const INITIAL_STATE: FilterState = {
  selectedAccountIds: [],
  selectedCategories: [],
  dateRange: createDefaultDateRange(),
  selectedCurrency: "all",
  searchQuery: "",
};

type FilterAction =
  | { type: "SET_ACCOUNTS"; payload: string[] }
  | { type: "SET_CATEGORIES"; payload: string[] }
  | { type: "SET_DATE_RANGE"; payload: { from: Date; to: Date } }
  | { type: "SET_CURRENCY"; payload: CurrencyCode | "all" }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "RESET" };

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "SET_ACCOUNTS":
      return { ...state, selectedAccountIds: action.payload };
    case "SET_CATEGORIES":
      return { ...state, selectedCategories: action.payload };
    case "SET_DATE_RANGE":
      return { ...state, dateRange: action.payload };
    case "SET_CURRENCY":
      return { ...state, selectedCurrency: action.payload };
    case "SET_SEARCH":
      return { ...state, searchQuery: action.payload };
    case "RESET":
      return { ...INITIAL_STATE, dateRange: createDefaultDateRange() };
    default:
      return state;
  }
}

interface FilterContextValue {
  filters: FilterState;
  dispatch: Dispatch<FilterAction>;
}

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, dispatch] = useReducer(filterReducer, INITIAL_STATE);

  const value = useMemo(() => ({ filters, dispatch }), [filters, dispatch]);

  return (
    <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
  );
}

export function useFilters(): FilterContextValue {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return context;
}
