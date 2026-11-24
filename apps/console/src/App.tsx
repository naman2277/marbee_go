import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthGate } from '@/auth/AuthGate';
import { Layout } from '@/components/Layout';
import { TenantsPage } from '@/pages/TenantsPage';
import { TenantDetailPage } from '@/pages/TenantDetailPage';
import { RatesPage } from '@/pages/RatesPage';
import { AuditPage } from '@/pages/AuditPage';

export function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/tenants" element={<TenantsPage />} />
            <Route path="/tenants/:id" element={<TenantDetailPage />} />
            <Route path="/rates" element={<RatesPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="*" element={<Navigate to="/tenants" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
