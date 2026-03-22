import { lazy, Suspense } from "react"
import { createBrowserRouter } from "react-router-dom"
import MainLayout from "@/components/layout/MainLayout"
import AuthGuard from "@/components/auth/AuthGuard"
import {
  DashboardSkeleton,
  TransactionsSkeleton,
  AnalyticsSkeleton,
} from "@/components/shared/LoadingSkeleton"

const DashboardPage = lazy(() => import("@/pages/DashboardPage"))
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"))
const AnalyticsPage = lazy(() => import("@/pages/AnalyticsPage"))
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"))
const LoginPage = lazy(() => import("@/pages/LoginPage"))

export const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <Suspense fallback={null}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    element: <AuthGuard />,
    children: [
      {
        element: <MainLayout />,
        children: [
          {
            path: "/",
            element: (
              <Suspense fallback={<DashboardSkeleton />}>
                <DashboardPage />
              </Suspense>
            ),
          },
          {
            path: "/transactions",
            element: (
              <Suspense fallback={<TransactionsSkeleton />}>
                <TransactionsPage />
              </Suspense>
            ),
          },
          {
            path: "/analytics",
            element: (
              <Suspense fallback={<AnalyticsSkeleton />}>
                <AnalyticsPage />
              </Suspense>
            ),
          },
          {
            path: "*",
            element: (
              <Suspense fallback={null}>
                <NotFoundPage />
              </Suspense>
            ),
          },
        ],
      },
    ],
  },
])
