import { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { DataProvider } from '@/contexts/DataContext';
import { FilterProvider } from '@/contexts/FilterContext';

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

export default function AuthGuard() {
  const [state, setState] = useState<AuthState>('loading');

  useEffect(() => {
    fetch('/api/auth/check')
      .then((res) => res.json())
      .then((data) => {
        setState(data.authenticated ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        setState('unauthenticated');
      });
  }, []);

  if (state === 'loading') {
    return null;
  }

  if (state === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  return (
    <DataProvider>
      <FilterProvider>
        <Outlet />
      </FilterProvider>
    </DataProvider>
  );
}
