import { useEffect } from "react";

const APP_NAME = "fin-dash";

export function usePageTitle(pageTitle: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${pageTitle} - ${APP_NAME}`;

    return () => {
      document.title = previousTitle;
    };
  }, [pageTitle]);
}
