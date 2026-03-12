import React, { useState, useEffect } from 'react';
import axios from 'axios';

const roleColor: Record<string, string> = {
  admin: 'badge-blue',
  accountant: 'badge-green',
  auditor: 'badge-amber',
  viewer: 'badge-slate',
};

export const IamPage: React.FC = () => {
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [tab, setTab] = useState<'register' | 'login'>('register');

  const [regTenant, setRegTenant] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('accountant');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const flash = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleRegister = async () => {
    try {
      const res = await axios.post('/api/v1/iam/register', {
        tenantName: regTenant, email: regEmail, password: regPassword, fullName: regName,
      });
      setToken(res.data.accessToken);
      setCurrentUser(res.data.user);
      flash('success', `Tenant registered. Welcome, ${res.data.user.fullName}!`);
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
  };

  const handleLogin = async () => {
    try {
      const res = await axios.post('/api/v1/iam/login', { email: loginEmail, password: loginPassword });
      setToken(res.data.accessToken);
      setCurrentUser(res.data.user);
      flash('success', `Logged in as ${res.data.user.fullName} (${res.data.user.role})`);
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
  };

  const handleCreateUser = async () => {
    try {
      const res = await axios.post('/api/v1/iam/users',
        { email: newEmail, password: newPassword, fullName: newName, role: newRole },
        { headers: authHeaders }
      );
      flash('success', `User created: ${res.data.email} (${res.data.role})`);
      loadUsers();
    } catch (e: any) { flash('error', e.response?.data?.message || e.message); }
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

  return (
    <div className="stack-lg">
      {message && (
        <div className={`alert alert-${message.type === 'success' ? 'success' : 'error'}`}>
          {message.text}
        </div>
      )}

      {/* Auth card */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Authentication</div>
            <div className="card-subtitle">Register a new tenant or sign in to an existing account</div>
          </div>
        </div>
        <div className="card-body">
          <div className="tabs">
            <button className={`tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Register Tenant</button>
            <button className={`tab ${tab === 'login'    ? 'active' : ''}`} onClick={() => setTab('login')}>Sign In</button>
          </div>

          {tab === 'register' && (
            <div className="form-section">
              <div className="grid-2">
                <div className="field-group">
                  <label className="field-label">Organisation Name</label>
                  <input className="input" placeholder="e.g. Ardiani LLC" value={regTenant} onChange={e => setRegTenant(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Admin Full Name</label>
                  <input className="input" placeholder="e.g. Ardit Krasniqi" value={regName} onChange={e => setRegName(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Email Address</label>
                  <input className="input" type="email" placeholder="admin@company.com" value={regEmail} onChange={e => setRegEmail(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Password</label>
                  <input className="input" type="password" placeholder="Minimum 6 characters" value={regPassword} onChange={e => setRegPassword(e.target.value)} />
                </div>
              </div>
              <div>
                <button className="btn btn-primary" onClick={handleRegister}>Create Account & Tenant</button>
              </div>
            </div>
          )}

          {tab === 'login' && (
            <div className="form-section">
              <div className="grid-2">
                <div className="field-group">
                  <label className="field-label">Email Address</label>
                  <input className="input" type="email" placeholder="your@email.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">Password</label>
                  <input className="input" type="password" placeholder="Enter password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
                </div>
              </div>
              <div>
                <button className="btn btn-primary" onClick={handleLogin}>Sign In</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active session */}
      {currentUser && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Active Session</div>
                <div className="card-subtitle">JWT-authenticated user</div>
              </div>
              <span className={`badge ${roleColor[currentUser.role] ?? 'badge-slate'}`}>{currentUser.role.toUpperCase()}</span>
            </div>
            <div className="card-body stack">
              <div className="grid-2">
                <div>
                  <div className="field-label">Full Name</div>
                  <div style={{ fontWeight: 600, marginTop: 2 }}>{currentUser.fullName}</div>
                </div>
                <div>
                  <div className="field-label">Email</div>
                  <div style={{ marginTop: 2 }}>{currentUser.email}</div>
                </div>
                <div>
                  <div className="field-label">Tenant ID</div>
                  <div className="text-mono" style={{ marginTop: 2, fontSize: 11 }}>{currentUser.tenantId}</div>
                </div>
                <div>
                  <div className="field-label">Role</div>
                  <div style={{ marginTop: 2 }}><span className={`badge ${roleColor[currentUser.role] ?? 'badge-slate'}`}>{currentUser.role}</span></div>
                </div>
              </div>
              <div>
                <div className="field-label">JWT Token (preview)</div>
                <div className="code-block" style={{ maxHeight: 60, fontSize: 10, marginTop: 4 }}>{token.substring(0, 100)}…</div>
              </div>
            </div>
          </div>

          {/* Create user panel — admin only */}
          {currentUser.role === 'admin' && (
            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Invite User</div>
                  <div className="card-subtitle">Add a user to your tenant</div>
                </div>
              </div>
              <div className="card-body">
                <div className="form-section">
                  <div className="grid-2">
                    <div className="field-group">
                      <label className="field-label">Full Name</label>
                      <input className="input" placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Role</label>
                      <select className="select" value={newRole} onChange={e => setNewRole(e.target.value)}>
                        <option value="admin">Admin</option>
                        <option value="accountant">Accountant</option>
                        <option value="auditor">Auditor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Email</label>
                      <input className="input" type="email" placeholder="user@company.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">Password</label>
                      <input className="input" type="password" placeholder="Min 6 chars" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                    </div>
                  </div>
                  <div><button className="btn btn-primary" onClick={handleCreateUser}>Invite User</button></div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Users table */}
      {users.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Tenant Users</div>
              <div className="card-subtitle">{users.length} user(s) in your organisation</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadUsers}>↻ Refresh</button>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>User ID</th>
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
      {auditLog.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Audit Trail</div>
              <div className="card-subtitle">Security events — last 20</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadAudit}>↻ Refresh</button>
          </div>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Email</th>
                <th>Time</th>
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

