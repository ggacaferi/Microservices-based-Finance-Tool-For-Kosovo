import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DailyOpsPage } from './pages/DailyOpsPage';
import { CompliancePage } from './pages/CompliancePage';
import { LedgerPage } from './pages/LedgerPage';
import { AiPage } from './pages/AiPage';
import { IamPage } from './pages/IamPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to="/daily-ops" replace />}
      />
      <Route
        path="/daily-ops"
        element={
          <Layout
            title="Daily Operations · Bills & Invoices"
            subtitle="Capture business intent (Fatura Dalëse/Hyrëse, Shpenzime, Inventory) before it flows into the Ledger."
          >
            <DailyOpsPage />
          </Layout>
        }
      />
      <Route
        path="/compliance"
        element={
          <Layout
            title="Compliance Engine"
            subtitle="Kosovo Law 06/L-032 encoded as rules and taxonomies, consumed by all bounded contexts."
          >
            <CompliancePage />
          </Layout>
        }
      />
      <Route
        path="/ledger"
        element={
          <Layout
            title="General Ledger"
            subtitle="Financial truth built from journal entries emitted by operational contexts."
          >
            <LedgerPage />
          </Layout>
        }
      />
      <Route
        path="/ai"
        element={
          <Layout
            title="AI Analyst"
            subtitle="RAG interface for natural language questions over compliant financial snapshots."
          >
            <AiPage />
          </Layout>
        }
      />
      <Route
        path="/iam"
        element={
          <Layout
            title="Identity & Access Management"
            subtitle="Central gatekeeper for tenants, users, and permissions."
          >
            <IamPage />
          </Layout>
        }
      />
    </Routes>
  );
};

export default App;

