import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DailyOpsPage } from './pages/DailyOpsPage';
import { CompliancePage } from './pages/CompliancePage';
import { LedgerPage } from './pages/LedgerPage';
import { AiPage } from './pages/AiPage';
import { IamPage } from './pages/IamPage';
import { useLanguage } from './useLanguage';

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
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
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
              title={tr('Daily Operations · Bills & Invoices', 'Operacionet Ditore · Faturat & Invoice-t')}
              subtitle={tr('Capture business intent (Fatura Dalëse/Hyrëse, Shpenzime, Inventory) before it flows into the Ledger.', 'Regjistro faturat, shpenzimet dhe inventarin para se të rrjedhin në Librin Kryesor.')}
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
              title={tr('Compliance Engine', 'Motori i Përputhshmërisë')}
              subtitle={tr('Kosovo Law 06/L-032 encoded as rules and taxonomies, consumed by all bounded contexts.', 'Ligji i Kosovës 06/L-032 i koduar si rregulla dhe taksonomi, i përdorur nga të gjitha kontekstet.')}
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
              title={tr('General Ledger', 'Libri Kryesor')}
              subtitle={tr('Financial truth built from journal entries emitted by operational contexts.', 'E vërteta financiare e ndërtuar nga regjistrimet kontabël të operacioneve.')}
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
              title={tr('AI Financial Analyst', 'Analisti Financiar AI')}
              contentFill
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
              title={tr('Identity & Access Management', 'Menaxhimi i Identitetit dhe Qasjes')}
              subtitle={tr('Central gatekeeper for tenants, users, and permissions.', 'Pika qendrore për tenantët, përdoruesit dhe lejet.')}
            >
              <IamPage />
            </Layout>
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected allowed={['admin', 'accountant', 'data_clerk', 'auditor']}>
            <Layout
              title={tr('Profile', 'Profili')}
              subtitle={tr('Manage your personal and company information.', 'Menaxhoni informacionin tuaj personal dhe të kompanisë.')}
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

