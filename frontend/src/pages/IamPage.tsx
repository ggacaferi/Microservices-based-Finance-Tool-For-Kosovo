import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../useLanguage';
import { setLanguage } from '../language';

const roleColor: Record<string, string> = {
  admin: 'badge-blue',
  accountant: 'badge-green',
  data_clerk: 'badge-blue',
  auditor: 'badge-amber',
};

const roleHome = (role?: string): string => {
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

export const IamPage: React.FC = () => {
  const lang = useLanguage();
  const tr = (en: string, sq: string) => (lang === 'en' ? en : sq);
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';
  const [token, setToken] = useState(localStorage.getItem('guri_token') ?? '');
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const raw = localStorage.getItem('guri_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [users, setUsers] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [tab, setTab] = useState<'register' | 'login'>('register');

  const [regTenant, setRegTenant] = useState('');
  const [regNui, setRegNui] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regCode, setRegCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [forgotMode, setForgotMode] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [forceChangePassword, setForceChangePassword] = useState(false);
  const [currentPasswordForChange, setCurrentPasswordForChange] = useState('');
  const [newPasswordForChange, setNewPasswordForChange] = useState('');
  const [confirmPasswordForChange, setConfirmPasswordForChange] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('data_clerk');
  const [createdAdmin, setCreatedAdmin] = useState<{ email: string; password: string; role: string } | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [tenantNui, setTenantNui] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessNui, setBusinessNui] = useState('');

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const isProfilePage = location.pathname === '/profile';
  const isPlatformIamPage = location.pathname === '/platform/iam';

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleRegister = async () => {
    try {
      if (!/^8\d{8}$/.test(regNui.trim())) {
        flash('error', 'NUI is incorrect');
        return;
      }
      await axios.post('/api/v1/iam/register/request-code', {
        tenantName: regTenant, nui: regNui, email: regEmail, password: regPassword, fullName: regName,
      });
      setCodeSent(true);
      flash('success', tr('Verification code sent to your email.', 'Kodi i verifikimit u dërgua në emailin tuaj.'));
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
  };

  const handleVerifyCode = async () => {
    try {
      const res = await axios.post('/api/v1/iam/register/verify-code', {
        email: regEmail,
        code: regCode,
      });
      setToken(res.data.accessToken);
      setCurrentUser(res.data.user);
      localStorage.setItem('guri_token', res.data.accessToken);
      localStorage.setItem('guri_user', JSON.stringify(res.data.user));
      setCreatedAdmin({ email: regEmail, password: regPassword, role: 'admin' });
      flash('success', `${tr('Email verified. Tenant registered', 'Emaili u verifikua. Tenanti u regjistrua')}: ${regEmail}`);
      navigate(roleHome(res.data.user?.role));
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
  };

  const handleLogin = async () => {
    try {
      const res = await axios.post('/api/v1/iam/login', { email: loginEmail, password: loginPassword });
      setToken(res.data.accessToken);
      setCurrentUser(res.data.user);
      localStorage.setItem('guri_token', res.data.accessToken);
      localStorage.setItem('guri_user', JSON.stringify(res.data.user));
      if (res.data?.user?.mustChangePassword) {
        setForceChangePassword(true);
        setCurrentPasswordForChange(loginPassword);
        flash('success', tr('Login successful. Please change your temporary password.', 'Kyçja me sukses. Ju lutem ndryshoni fjalëkalimin e përkohshëm.'));
      } else {
        flash('success', `${tr('Logged in as', 'U kyçët si')} ${res.data.user.fullName} (${res.data.user.role})`);
        navigate(roleHome(res.data.user?.role));
      }
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
  };

  const handleForcePasswordChange = async () => {
    try {
      if (newPasswordForChange.length < 6) {
        flash('error', tr('New password must be at least 6 characters.', 'Fjalëkalimi i ri duhet të ketë të paktën 6 karaktere.'));
        return;
      }
      if (newPasswordForChange !== confirmPasswordForChange) {
        flash('error', tr('Password confirmation does not match.', 'Konfirmimi i fjalëkalimit nuk përputhet.'));
        return;
      }
      const res = await axios.post('/api/v1/iam/change-password', {
        currentPassword: currentPasswordForChange,
        newPassword: newPasswordForChange,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      setToken(res.data.accessToken);
      setCurrentUser(res.data.user);
      localStorage.setItem('guri_token', res.data.accessToken);
      localStorage.setItem('guri_user', JSON.stringify(res.data.user));
      setForceChangePassword(false);
      setCurrentPasswordForChange('');
      setNewPasswordForChange('');
      setConfirmPasswordForChange('');
      flash('success', tr('Password changed successfully.', 'Fjalëkalimi u ndryshua me sukses.'));
      navigate(roleHome(res.data.user?.role));
    } catch (e: any) {
      flash('error', e.response?.data?.message || e.message);
    }
  };

  const handleRequestResetCode = async () => {
    try {
      await axios.post('/api/v1/iam/forgot-password/request-code', { email: loginEmail });
      setResetCodeSent(true);
      flash('success', tr('Reset code sent to your email.', 'Kodi i rivendosjes u dërgua në emailin tuaj.'));
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
  };

  const handleVerifyResetCode = async () => {
    try {
      await axios.post('/api/v1/iam/forgot-password/verify-code', {
        email: loginEmail,
        code: resetCode,
        newPassword: resetNewPassword,
      });
      setForgotMode(false);
      setResetCodeSent(false);
      setResetCode('');
      setResetNewPassword('');
      flash('success', tr('Password reset successful. You can now login.', 'Fjalëkalimi u rivendos me sukses. Tani mund të kyçeni.'));
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
  };

  const handleCreateUser = async () => {
    try {
      const res = await axios.post('/api/v1/iam/users',
        { email: newEmail, password: newPassword, fullName: newName, role: newRole },
        { headers: authHeaders }
      );
      flash('success', `${tr('User created', 'Përdoruesi u krijua')}: ${res.data.email} (${res.data.role})`);
      loadUsers();
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
  };

  const loadProfile = async () => {
    if (!token) return;
    try {
      const me = await axios.get('/api/v1/iam/me', { headers: authHeaders });
      setProfileName(me.data.fullName || '');
      setProfileEmail(me.data.email || '');
      const rawNui = (me.data.nui || '').toString().trim().toUpperCase();
      setTenantNui(/^8\d{8}$/.test(rawNui) ? rawNui : '');
    } catch {
      // ignore
    }
  };

  const loadBusiness = async () => {
    if (!token || currentUser?.role !== 'admin') return;
    try {
      const tenants = await axios.get('/api/v1/iam/tenants', { headers: authHeaders });
      const t = Array.isArray(tenants.data) ? tenants.data[0] : null;
      if (t) {
        setBusinessName(t.name || '');
        const rawNui = (t.nui || '').toString().trim().toUpperCase();
        const validNui = /^8\d{8}$/.test(rawNui) ? rawNui : '';
        setBusinessNui(validNui);
        setTenantNui(validNui);
      }
    } catch {
      // ignore
    }
  };

  const handleUpdateProfile = async () => {
    try {
      const res = await axios.patch('/api/v1/iam/me', { fullName: profileName, email: profileEmail }, { headers: authHeaders });
      setToken(res.data.accessToken);
      setCurrentUser(res.data.user);
      localStorage.setItem('guri_token', res.data.accessToken);
      localStorage.setItem('guri_user', JSON.stringify(res.data.user));
      flash('success', tr('Profile updated successfully.', 'Profili u përditësua me sukses.'));
    } catch (e: any) {
      flash('error', e.response?.data?.message || e.message);
    }
  };

  const handleUpdateBusiness = async () => {
    const n = businessNui.trim();
    if (n && !/^8\d{8}$/.test(n)) {
      flash('error', tr('NUI is incorrect', 'NUI është e pasaktë'));
      return;
    }
    try {
      await axios.patch('/api/v1/iam/business', { tenantName: businessName, nui: n || undefined }, { headers: authHeaders });
      flash('success', tr('Business profile updated successfully.', 'Profili i biznesit u përditësua me sukses.'));
      await loadBusiness();
    } catch (e: any) {
      flash('error', e.response?.data?.message || e.message);
    }
  };

  const loadUsers = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/v1/iam/users', { headers: authHeaders });
      setUsers(res.data);
    } catch { /* ignore */ }
  };

  const loadAudit = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/v1/iam/audit?limit=20', { headers: authHeaders });
      setAuditLog(res.data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (token) { loadUsers(); loadAudit(); }
  }, [token]);

  useEffect(() => {
    if (token) {
      loadProfile();
      loadBusiness();
    }
  }, [token, currentUser?.role]);

  useEffect(() => {
    if (location.pathname === '/auth' && token && currentUser && !currentUser?.mustChangePassword) {
      navigate(roleHome(currentUser?.role));
    }
  }, [location.pathname, token, currentUser, navigate]);

  if (isAuthPage) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="mb-2 flex min-w-0 justify-end">
            <select
              className="select lang-select-compact"
              value={lang}
              onChange={(e) => setLanguage(e.target.value as 'en' | 'sq')}
            >
              <option value="en">EN</option>
              <option value="sq">SQ</option>
            </select>
          </div>
          <div className="auth-title">{tr('Welcome back', 'Mirë se u kthyet')}</div>
          <div className="auth-subtitle">{tr('Sign in to continue, or create a new account.', 'Kyçuni për të vazhduar, ose krijoni një llogari të re.')}</div>

          {message && (
            <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
              {message.text}
            </div>
          )}

          <div className="auth-tabs">
            <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>{tr('Login', 'Kyçu')}</button>
            <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>{tr('Sign up', 'Regjistrohu')}</button>
          </div>

          {tab === 'login' ? (
            <div className="auth-form">
              <div className="field-group">
                <label className="field-label">{tr('Email', 'Email')}</label>
                <input className="input" type="email" placeholder="you@company.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
              </div>
              {!forgotMode && !forceChangePassword ? (
                <>
                  <div className="field-group">
                    <label className="field-label">{tr('Password', 'Fjalëkalimi')}</label>
                    <input className="input" type="password" placeholder="Enter password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                  </div>
                  <button className="btn btn-primary auth-btn" onClick={handleLogin}>{tr('Login', 'Kyçu')}</button>
                  <button className="btn btn-secondary auth-btn" onClick={() => setForgotMode(true)}>{tr('Forgot password?', 'Keni harruar fjalëkalimin?')}</button>
                </>
              ) : forceChangePassword ? (
                <>
                  <div className="field-group">
                    <label className="field-label">{tr('Current password', 'Fjalëkalimi aktual')}</label>
                    <input className="input" type="password" value={currentPasswordForChange} onChange={e => setCurrentPasswordForChange(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">{tr('New password', 'Fjalëkalimi i ri')}</label>
                    <input className="input" type="password" value={newPasswordForChange} onChange={e => setNewPasswordForChange(e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">{tr('Confirm new password', 'Konfirmo fjalëkalimin e ri')}</label>
                    <input className="input" type="password" value={confirmPasswordForChange} onChange={e => setConfirmPasswordForChange(e.target.value)} />
                  </div>
                  <button className="btn btn-primary auth-btn" onClick={handleForcePasswordChange}>{tr('Change password', 'Ndrysho fjalëkalimin')}</button>
                </>
              ) : (
                <>
                  {resetCodeSent && (
                    <div className="field-group">
                      <label className="field-label">{tr('Reset code', 'Kodi i rivendosjes')}</label>
                      <input className="input" type="text" inputMode="numeric" maxLength={4} placeholder="4-digit code" value={resetCode} onChange={e => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                    </div>
                  )}
                  {resetCodeSent && (
                    <div className="field-group">
                      <label className="field-label">{tr('New password', 'Fjalëkalimi i ri')}</label>
                      <input className="input" type="password" placeholder="At least 6 characters" value={resetNewPassword} onChange={e => setResetNewPassword(e.target.value)} />
                    </div>
                  )}
                  {!resetCodeSent ? (
                    <button className="btn btn-primary auth-btn" onClick={handleRequestResetCode}>{tr('Send reset code', 'Dërgo kodin e rivendosjes')}</button>
                  ) : (
                    <div className="btn-group">
                      <button className="btn btn-secondary" onClick={handleRequestResetCode}>{tr('Resend code', 'Ridërgo kodin')}</button>
                      <button className="btn btn-primary" onClick={handleVerifyResetCode} disabled={resetCode.length !== 4 || resetNewPassword.length < 6}>{tr('Reset password', 'Rivendos fjalëkalimin')}</button>
                    </div>
                  )}
                  <button className="btn btn-secondary auth-btn" onClick={() => { setForgotMode(false); setResetCodeSent(false); }}>{tr('Back to login', 'Kthehu te kyçja')}</button>
                </>
              )}
            </div>
          ) : (
            <div className="auth-form">
              <div className="field-group">
                <label className="field-label">{tr('Organisation', 'Organizata')}</label>
                <input className="input" placeholder="Your Company" value={regTenant} onChange={e => setRegTenant(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">{tr('Full name', 'Emri i plotë')}</label>
                <input className="input" placeholder="Jane Doe" value={regName} onChange={e => setRegName(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">NUI</label>
                <input className="input" placeholder="e.g. 810123456" value={regNui} onChange={e => setRegNui(e.target.value.toUpperCase())} />
              </div>
              <div className="field-group">
                <label className="field-label">{tr('Email', 'Email')}</label>
                <input className="input" type="email" placeholder="admin@company.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">{tr('Password', 'Fjalëkalimi')}</label>
                <input className="input" type="password" placeholder="At least 6 characters" value={regPassword} onChange={e => setRegPassword(e.target.value)} />
              </div>
              {codeSent && (
                <div className="field-group">
                  <label className="field-label">{tr('Verification code', 'Kodi i verifikimit')}</label>
                  <input className="input" type="text" inputMode="numeric" maxLength={4} placeholder="4-digit code" value={regCode} onChange={e => setRegCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
                </div>
              )}

              {!codeSent ? (
                <button className="btn btn-primary auth-btn" onClick={handleRegister}>{tr('Send verification code', 'Dërgo kodin e verifikimit')}</button>
              ) : (
                <div className="btn-group">
                  <button className="btn btn-secondary" onClick={handleRegister}>{tr('Resend code', 'Ridërgo kodin')}</button>
                  <button className="btn btn-primary" onClick={handleVerifyCode} disabled={regCode.length !== 4}>{tr('Verify & Create account', 'Verifiko & Krijo llogari')}</button>
                </div>
              )}

              {createdAdmin && (
                <div className="auth-created">
                  <div><strong>{tr('Admin created', 'Admini u krijua')}</strong></div>
                  <div>{tr('Email', 'Email')}: {createdAdmin.email}</div>
                  <div>{tr('Password', 'Fjalëkalimi')}: {createdAdmin.password}</div>
                  <div>{tr('Role', 'Roli')}: {createdAdmin.role}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
        </div>
      )}

      {/* Active session (only in platform IAM page) */}
      {currentUser && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Active Session</div>
                <div className="card-subtitle">{tr('JWT-authenticated user', 'Përdorues i autentikuar me JWT')}</div>
              </div>
              <span className={`badge ${roleColor[currentUser.role] ?? 'badge-slate'}`}>{currentUser.role.toUpperCase()}</span>
            </div>
            <div className="card-body stack">
              <div className="grid-2">
                <div>
                  <div className="field-label">{tr('Full Name', 'Emri i Plotë')}</div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>{currentUser.fullName}</div>
                </div>
                <div>
                  <div className="field-label">{tr('Email', 'Email')}</div>
                  <div style={{ marginTop: 2 }}>{currentUser.email}</div>
                </div>
                <div>
                  <div className="field-label">Tenant ID</div>
                  <div className="text-mono" style={{ marginTop: 2, fontSize: 11 }}>{currentUser.tenantId}</div>
                </div>
                <div>
                  <div className="field-label">{tr('Role', 'Roli')}</div>
                  <div style={{ marginTop: 2 }}><span className={`badge ${roleColor[currentUser.role] ?? 'badge-slate'}`}>{currentUser.role}</span></div>
                </div>
                <div>
                  <div className="field-label">NUI</div>
                  <div className="text-mono" style={{ marginTop: 2, fontWeight: 600 }}>
                    {tenantNui || <span className="muted">{tr('Not set — update in Business Profile', 'Nuk është vendosur — përditëso në Profilin e Biznesit')}</span>}
                  </div>
                </div>
              </div>
              <div>
                <div className="field-label">{tr('JWT Token (preview)', 'JWT Token (parapamje)')}</div>
                <div className="code-block" style={{ maxHeight: 60, fontSize: 10, marginTop: 4 }}>{token.substring(0, 100)}…</div>
              </div>
            </div>
          </div>

          {/* Create user panel — admin only */}
          {currentUser.role === 'admin' && isPlatformIamPage && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">{tr('Invite User', 'Fto Përdorues')}</div>
                  <div className="card-subtitle">{tr('Add a user to your tenant', 'Shto një përdorues në tenantin tënd')}</div>
                </div>
              </div>
              <div className="card-body">
                <div className="form-section">
                  <div className="grid-2">
                    <div className="field-group">
                      <label className="field-label">{tr('Full Name', 'Emri i Plotë')}</label>
                      <input className="input" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">{tr('Role', 'Roli')}</label>
                      <select className="select" value={newRole} onChange={e => setNewRole(e.target.value)}>
                        <option value="admin">{tr('Admin', 'Admin')}</option>
                        <option value="accountant">{tr('Accountant', 'Kontabilist')}</option>
                        <option value="data_clerk">{tr('Data Clerk', 'Operator')}</option>
                        <option value="auditor">{tr('Auditor', 'Auditor')}</option>
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">{tr('Email', 'Email')}</label>
                      <input className="input" type="email" placeholder="user@company.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">{tr('Password', 'Fjalëkalimi')}</label>
                      <input className="input" type="password" placeholder="Min 6 chars" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    </div>
                  </div>
                  <div><button className="btn btn-primary" onClick={handleCreateUser}>{tr('Invite User', 'Fto Përdorues')}</button></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {isProfilePage && currentUser && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">{tr('My Profile', 'Profili Im')}</div>
                <div className="card-subtitle">{tr('Update your account information', 'Përditësoni informacionin e llogarisë suaj')}</div>
              </div>
            </div>
            <div className="card-body form-section">
              <div className="field-group">
                <label className="field-label">{tr('Full Name', 'Emri i Plotë')}</label>
                <input className="input" value={profileName} onChange={e => setProfileName(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">{tr('Email', 'Email')}</label>
                <input className="input" type="email" value={profileEmail} onChange={e => setProfileEmail(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">NUI {tr('(your company identifier for receiving invoices)', '(identifikuesi i kompanisë suaj për pranimin e faturave)')}</label>
                <div className="input" style={{ background: 'var(--surface-2, #f8fafc)', cursor: 'default', display: 'flex', alignItems: 'center' }}>
                  {tenantNui
                    ? <span className="text-mono" style={{ fontWeight: 700, letterSpacing: 1 }}>{tenantNui}</span>
                    : <span className="muted">{tr('Not set', 'Nuk është vendosur')}{currentUser.role === 'admin' ? tr(' — set it below', ' — vendoseni poshtë') : tr(' — ask your admin', ' — pyesni adminin')}</span>
                  }
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleUpdateProfile}>{tr('Save Profile', 'Ruaj Profilin')}</button>
            </div>
          </div>

          {currentUser.role === 'admin' && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">{tr('Business Profile', 'Profili i Biznesit')}</div>
                  <div className="card-subtitle">{tr('Admin-only company settings', 'Cilësime të kompanisë vetëm për admin')}</div>
                </div>
              </div>
              <div className="card-body form-section">
                <div className="field-group">
                  <label className="field-label">{tr('Company Name', 'Emri i Kompanisë')}</label>
                  <input className="input" value={businessName} onChange={e => setBusinessName(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">NUI</label>
                  <input className="input" value={businessNui} onChange={e => setBusinessNui(e.target.value.toUpperCase())} />
                </div>
                <button className="btn btn-primary" onClick={handleUpdateBusiness}>{tr('Save Business', 'Ruaj Biznesin')}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users table */}
      {isPlatformIamPage && users.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{tr('Tenant Users', 'Përdoruesit e Tenantit')}</div>
              <div className="card-subtitle">{users.length} {tr('user(s) in your organisation', 'përdorues në organizatën tuaj')}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadUsers}>{tr('↻ Refresh', '↻ Rifresko')}</button>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>{tr('Name', 'Emri')}</th>
                <th>{tr('Email', 'Email')}</th>
                <th>{tr('Role', 'Roli')}</th>
                <th>{tr('User ID', 'ID e Përdoruesit')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td><span className={`badge ${roleColor[u.role] ?? 'badge-slate'}`}>{u.role}</span></td>
                  <td className="text-mono muted">{u.id.substring(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit log */}
      {isPlatformIamPage && auditLog.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">{tr('Audit Trail', 'Gjurmë Auditimi')}</div>
              <div className="card-subtitle">{tr('Security events — last 20', 'Ngjarje sigurie — 20 të fundit')}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadAudit}>{tr('↻ Refresh', '↻ Rifresko')}</button>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>{tr('Action', 'Veprimi')}</th>
                <th>{tr('Email', 'Email')}</th>
                <th>{tr('Time', 'Koha')}</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((a: any) => (
                <tr key={a.id}>
                  <td>
                    <span className={`badge ${a.action.includes('FAIL') ? 'badge-red' : 'badge-green'}`}>
                      {a.action}
                    </span>
                  </td>
                  <td>{a.email}</td>
                  <td className="muted">{new Date(a.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

