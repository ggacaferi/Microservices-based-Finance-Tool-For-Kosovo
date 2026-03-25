import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DailyOpsPage } from './pages/DailyOpsPage';
import { CompliancePage } from './pages/CompliancePage';
import { LedgerPage } from './pages/LedgerPage';
import { AiPage } from './pages/AiPage';
import { IamPage } from './pages/IamPage';

type UserRole = 'admin' | 'accountant' | 'data_clerk' | 'auditor';

const getStoredUser = (): { role: UserRole } | null => {
  try {
    const raw = localStorage.getItem('guri_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const isAuthed = (): boolean => Boolean(localStorage.getItem('guri_token'));

const roleHome = (role?: UserRole): string => {
  switch (role) {
    case 'admin':
    case 'accountant':
    case 'data_clerk':
      return '/daily-ops';
    case 'auditor':
      return '/ledger';
    default:
      return '/auth';
  }
};

const RootRedirect: React.FC = () => {
  if (!isAuthed()) return <Navigate to="/auth" replace />;
  const user = getStoredUser();
  return <Navigate to={roleHome(user?.role)} replace />;
};

const Protected: React.FC<{ allowed: UserRole[]; children: React.ReactNode }> = ({ allowed, children }) => {
  if (!isAuthed()) return <Navigate to="/auth" replace />;
  const user = getStoredUser();
  if (!user || !allowed.includes(user.role)) return <Navigate to={roleHome(user?.role)} replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={<RootRedirect />}
      />
      <Route path="/auth" element={<IamPage />} />
      <Route
        path="/daily-ops"
        element={
          <Protected allowed={['admin', 'accountant', 'data_clerk']}>
            <Layout
              title="Daily Operations · Bills & Invoices"
              subtitle="Capture business intent (Fatura Dalëse/Hyrëse, Shpenzime, Inventory) before it flows into the Ledger."
            >
              <DailyOpsPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/compliance"
        element={
          <Protected allowed={['admin', 'accountant', 'auditor']}>
            <Layout
              title="Compliance Engine"
              subtitle="Kosovo Law 06/L-032 encoded as rules and taxonomies, consumed by all bounded contexts."
            >
              <CompliancePage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/ledger"
        element={
          <Protected allowed={['admin', 'accountant', 'auditor']}>
            <Layout
              title="General Ledger"
              subtitle="Financial truth built from journal entries emitted by operational contexts."
            >
              <LedgerPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/ai"
        element={
          <Protected allowed={['admin', 'accountant', 'auditor']}>
            <Layout
              title="AI Analyst"
              subtitle="RAG interface for natural language questions over compliant financial snapshots."
            >
              <AiPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/platform/iam"
        element={
          <Protected allowed={['admin']}>
            <Layout
              title="Identity & Access Management"
              subtitle="Central gatekeeper for tenants, users, and permissions."
            >
              <IamPage />
            </Layout>
          </Protected>
        }
      />
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
};

export default App;

