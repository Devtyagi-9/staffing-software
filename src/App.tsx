import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { LoginPage } from './components/LoginPage';
import { SchedulingCalendar } from './components/SchedulingCalendar';
import { RequirementApprovalQueue } from './components/RequirementApprovalQueue';
import { WorkerPortal } from './components/WorkerPortal';
import { WorkerManagement } from './components/WorkerManagement';
import { PayerManagement } from './components/PayerManagement';
import { ClientManagement } from './components/ClientManagement';
import { HoursDashboard } from './components/HoursDashboard';
import { BillingManager } from './components/BillingManager';
import { AuditLogInspector } from './components/AuditLogInspector';
import { LaborConfigEditor } from './components/LaborConfigEditor';

function MainContent() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('roster');

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: 'var(--text-main)', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading Apex Staffing Platform…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          flex: 1, padding: '20px 24px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          {activeTab === 'roster' && <SchedulingCalendar />}
          {activeTab === 'approval-queue' && <RequirementApprovalQueue />}
          {activeTab === 'worker-portal' && <WorkerPortal />}
          {activeTab === 'workers-management' && <WorkerManagement />}
          {activeTab === 'payer-management' && <PayerManagement />}
          {activeTab === 'client-profiles' && <ClientManagement />}
          {activeTab === 'hours-dashboard' && <HoursDashboard />}
          {activeTab === 'billing' && <BillingManager />}
          {activeTab === 'audit-logs' && <AuditLogInspector />}
          {activeTab === 'labor-config' && <LaborConfigEditor />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
