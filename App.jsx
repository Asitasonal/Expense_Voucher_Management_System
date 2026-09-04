import { useEffect, useMemo, useState } from 'react';

const API = '/api';
const requestJson = async (url, options = {}) => {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: 'The server returned an invalid response.' };
      }
    }

    return { response, data };
  } catch {
    return {
      response: { ok: false, status: 0 },
      data: { message: 'Unable to connect to the server. Please try again.' }
    };
  }
};

const ROLE_LABELS = {
  EMPLOYEE: 'Employee',
  DIRECTOR: 'Director',
  ACCOUNTS: 'Accounts Team'
};

const ROLE_VIEWS = {
  EMPLOYEE: ['home', 'dashboard', 'create', 'my-vouchers', 'details', 'help'],
  DIRECTOR: ['home', 'dashboard', 'pending', 'all-vouchers', 'details', 'help'],
  ACCOUNTS: ['home', 'dashboard', 'all-vouchers', 'details', 'help']
};

const initialVoucherForm = {
  voucherDate: '',
  expenseDate: '',
  departmentName: '',
  expenseTitle: '',
  expenseCategory: '',
  expenseDescription: '',
  amount: '',
  status: 'DRAFT'
};

function App() {
  const [token, setToken] = useState(localStorage.getItem('voucher-token') || '');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState({ login: false, register: false, reset: false, confirmReset: false });
  const [loginData, setLoginData] = useState({ email: 'employee@abc.com', password: 'employee123' });
  const [resetData, setResetData] = useState({ email: '', password: '', confirmPassword: '' });
  const [registerData, setRegisterData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'EMPLOYEE',
    department: '',
    employee_id: ''
  });
  const [vouchers, setVouchers] = useState([]);
  const [form, setForm] = useState(initialVoucherForm);
  const [selectedVoucherId, setSelectedVoucherId] = useState(null);
  const [editingVoucherId, setEditingVoucherId] = useState(null);
  const [activeView, setActiveView] = useState('home');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [signatureFile, setSignatureFile] = useState(null);
  const [directorSignatureFile, setDirectorSignatureFile] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [voucherFilters, setVoucherFilters] = useState({ search: '', department: '', category: '', status: '', fromDate: '', toDate: '', minAmount: '', maxAmount: '', sort: 'newest' });

  const refreshVouchers = async () => {
    if (!user || !token) return;

    try {
      const { response: res, data } = await requestJson(`${API}/vouchers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) setVouchers(data.vouchers || []);
    } catch (error) {
      setMessage({ type: 'error', text: 'Unable to load vouchers.' });
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const { response: res, data } = await requestJson(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Session invalid');
        setUser(data.user);
      } catch (error) {
        setToken('');
        localStorage.removeItem('voucher-token');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token]);

  useEffect(() => {
    if (!user || !token) return;
    refreshVouchers();
  }, [user, token]);

  useEffect(() => {
    if (user && !ROLE_VIEWS[user.role]?.includes(activeView)) {
      setActiveView('home');
      setSelectedVoucherId(null);
    }
  }, [user, activeView]);

  const employeeVouchers = useMemo(
    () => vouchers.filter((voucher) => String(voucher.employee_id) === String(user?.id || '')),
    [vouchers, user]
  );

  const pendingVouchers = useMemo(
    () => vouchers.filter((voucher) => ['PENDING_APPROVAL', 'SUBMITTED'].includes(voucher.status)),
    [vouchers]
  );

  const stats = useMemo(() => {
    const source = user?.role === 'EMPLOYEE' ? employeeVouchers : vouchers;

    if (!source.length) {
      return {
        total: 0,
        draft: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        totalAmount: 0,
        pendingAmount: 0
      };
    }

    const totalAmount = source.reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0);
    const pendingAmount = source.filter((voucher) => ['PENDING_APPROVAL', 'SUBMITTED'].includes(voucher.status)).reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0);

    return {
      total: source.length,
      draft: source.filter((voucher) => voucher.status === 'DRAFT').length,
      pending: source.filter((voucher) => ['PENDING_APPROVAL', 'SUBMITTED'].includes(voucher.status)).length,
      approved: source.filter((voucher) => voucher.status === 'APPROVED').length,
      rejected: source.filter((voucher) => voucher.status === 'REJECTED').length,
      totalAmount,
      pendingAmount
    };
  }, [vouchers, employeeVouchers, user]);

  const statusBreakdown = useMemo(() => {
    const statuses = [
      { key: 'DRAFT', label: 'Draft', color: '#4f46e5' },
      { key: 'PENDING_APPROVAL', label: 'Pending', color: '#d89b21' },
      { key: 'SUBMITTED', label: 'Submitted', color: '#e4b84a' },
      { key: 'APPROVED', label: 'Approved', color: '#1f8f5f' },
      { key: 'REJECTED', label: 'Rejected', color: '#b42318' }
    ];

    return statuses
      .map((status) => ({
        ...status,
        count: vouchers.filter((voucher) => voucher.status === status.key).length
      }))
      .filter((status) => status.count > 0);
  }, [vouchers]);

  const categoryBreakdown = useMemo(() => {
    const totals = vouchers.reduce((result, voucher) => {
      const category = voucher.expense_category || 'Other';
      result[category] = (result[category] || 0) + Number(voucher.amount || 0);
      return result;
    }, {});

    return Object.entries(totals)
      .map(([label, amount]) => ({ label, amount }))
      .sort((first, second) => second.amount - first.amount)
      .slice(0, 5);
  }, [vouchers]);

  const monthlyTrend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString('en-US', { month: 'short' }),
        amount: 0
      };
    });

    vouchers.forEach((voucher) => {
      const date = new Date(voucher.expense_date || voucher.created_at);
      if (Number.isNaN(date.getTime())) return;
      const month = months.find((item) => item.key === `${date.getFullYear()}-${date.getMonth()}`);
      if (month) month.amount += Number(voucher.amount || 0);
    });

    return months;
  }, [vouchers]);

  const recentVouchers = useMemo(
    () => [...vouchers].sort((first, second) => new Date(second.created_at || 0) - new Date(first.created_at || 0)).slice(0, 4),
    [vouchers]
  );

  const getNavItems = () => {
    if (user?.role === 'EMPLOYEE') {
      return [
        { key: 'home', label: 'Home' },
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'create', label: 'Create Voucher' },
        { key: 'my-vouchers', label: 'My Vouchers' },
        { key: 'details', label: 'Voucher Details' }
      ];
    }

    if (user?.role === 'DIRECTOR') {
      return [
        { key: 'home', label: 'Home' },
        { key: 'dashboard', label: 'Dashboard' },
        { key: 'pending', label: 'Pending Approvals' },
        { key: 'all-vouchers', label: 'All Vouchers' },
        { key: 'details', label: 'Voucher Details' }
      ];
    }

    return [
      { key: 'home', label: 'Home' },
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'all-vouchers', label: 'All Vouchers' },
      { key: 'details', label: 'Voucher Details' }
    ];
  };

  const visibleVouchers = useMemo(() => {
    if (!user) return [];

    if (user.role === 'EMPLOYEE') {
      return employeeVouchers;
    }

    if (user.role === 'DIRECTOR' && activeView === 'pending') {
      return pendingVouchers;
    }

    return vouchers;
  }, [user, activeView, employeeVouchers, pendingVouchers, vouchers]);

  const selectedVoucher = visibleVouchers.find((voucher) => voucher.id === selectedVoucherId) || vouchers.find((voucher) => voucher.id === selectedVoucherId) || null;

  const filteredVouchers = (list) => {
    const filters = voucherFilters;
    const search = filters.search.trim().toLowerCase();
    return [...list]
      .filter((voucher) => {
        const searchable = [voucher.voucher_number, voucher.employee_name, voucher.department_name, voucher.expense_title].join(' ').toLowerCase();
        const expenseDate = voucher.expense_date || '';
        const amount = Number(voucher.amount || 0);
        return (!search || searchable.includes(search))
          && (!filters.department || voucher.department_name === filters.department)
          && (!filters.category || voucher.expense_category === filters.category)
          && (!filters.status || voucher.status === filters.status)
          && (!filters.fromDate || expenseDate >= filters.fromDate)
          && (!filters.toDate || expenseDate <= filters.toDate)
          && (!filters.minAmount || amount >= Number(filters.minAmount))
          && (!filters.maxAmount || amount <= Number(filters.maxAmount));
      })
      .sort((first, second) => {
        if (filters.sort === 'amount-high') return Number(second.amount || 0) - Number(first.amount || 0);
        if (filters.sort === 'amount-low') return Number(first.amount || 0) - Number(second.amount || 0);
        if (filters.sort === 'oldest') return new Date(first.created_at || 0) - new Date(second.created_at || 0);
        return new Date(second.created_at || 0) - new Date(first.created_at || 0);
      });
  };

  const updateVoucherFilter = (key, value) => setVoucherFilters((current) => ({ ...current, [key]: value }));

  const login = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    const { response: res, data } = await requestJson(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginData)
    });

    if (!res.ok) {
      setMessage({ type: 'error', text: data.message || 'Login failed.' });
      return;
    }

    localStorage.setItem('voucher-token', data.token);
    setToken(data.token);
    setUser(data.user);
    setActiveView('home');
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (resetData.password !== resetData.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }

    const { response: res, data } = await requestJson(`${API}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetData.email, password: resetData.password })
    });

    if (!res.ok) {
      setMessage({ type: 'error', text: data.message || 'Unable to reset password.' });
      return;
    }

    setLoginData({ email: resetData.email, password: '' });
    setResetData({ email: '', password: '', confirmPassword: '' });
    setIsResettingPassword(false);
    setMessage({ type: 'success', text: data.message });
  };

  const togglePasswordVisibility = (field) => {
    setVisiblePasswords((current) => ({ ...current, [field]: !current[field] }));
  };

  const register = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    const { response: res, data } = await requestJson(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerData)
    });

    if (!res.ok) {
      setMessage({ type: 'error', text: data.message || 'Registration failed.' });
      return;
    }

    localStorage.setItem('voucher-token', data.token);
    setToken(data.token);
    setUser(data.user);
    setActiveView('home');
    setMessage({ type: 'success', text: data.message || 'Account created successfully.' });
  };

  const logout = () => {
    localStorage.removeItem('voucher-token');
    setToken('');
    setUser(null);
    setVouchers([]);
    setActiveView('home');
    setSelectedVoucherId(null);
  };

  const saveVoucher = async (status = 'DRAFT') => {
    if (!user || user.role !== 'EMPLOYEE') return;

    const payload = new FormData();
    Object.entries({ ...form, status }).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') payload.append(key, value);
    });

    if (signatureFile) payload.append('employeeSignature', signatureFile);

    const { response: res, data } = await requestJson(editingVoucherId ? `${API}/vouchers/${editingVoucherId}` : `${API}/vouchers`, {
      method: editingVoucherId ? 'PUT' : 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: payload
    });

    if (!res.ok) {
      setMessage({ type: 'error', text: data.message || 'Voucher creation failed.' });
      return;
    }

    setMessage({ type: 'success', text: data.message || 'Voucher saved!' });
    setForm(initialVoucherForm);
    setSignatureFile(null);
    setEditingVoucherId(null);
    await refreshVouchers();
    setActiveView('my-vouchers');
  };

  const submitVoucher = async (id) => {
    const { response: res, data } = await requestJson(`${API}/vouchers/${id}/submit`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      setMessage({ type: 'error', text: data.message || 'Unable to submit voucher.' });
      return;
    }
    setMessage({ type: 'success', text: data.message || 'Voucher submitted.' });
    await refreshVouchers();
  };

  const approveVoucher = async (id) => {
    const payload = new FormData();
    if (directorSignatureFile) payload.append('directorSignature', directorSignatureFile);

    const { response: res, data } = await requestJson(`${API}/vouchers/${id}/approve`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: payload
    });

    if (!res.ok) {
      setMessage({ type: 'error', text: data.message || 'Unable to approve voucher.' });
      return;
    }

    setMessage({ type: 'success', text: data.message || 'Voucher approved.' });
    setDirectorSignatureFile(null);
    setRejectionReason('');
    await refreshVouchers();
  };

  const rejectVoucher = async (id) => {
    const { response: res, data } = await requestJson(`${API}/vouchers/${id}/reject`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ rejectionReason })
    });

    if (!res.ok) {
      setMessage({ type: 'error', text: data.message || 'Unable to reject voucher.' });
      return;
    }

    setMessage({ type: 'success', text: data.message || 'Voucher rejected.' });
    setRejectionReason('');
    setDirectorSignatureFile(null);
    await refreshVouchers();
  };

  const deleteVoucher = async (id) => {
    const { response: res, data } = await requestJson(`${API}/vouchers/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      setMessage({ type: 'error', text: data.message || 'Unable to delete voucher.' });
      return;
    }
    setMessage({ type: 'success', text: data.message || 'Voucher deleted.' });
    await refreshVouchers();
  };

  const openVoucherDetails = (voucherId) => {
    setSelectedVoucherId(voucherId);
    setActiveView('details');
  };

  const renderLogin = () => (
    <div className="login-shell">
      <div className="login-card">
        <h1>Expense Voucher Management</h1>
        <p>Secure voucher submission and approval workflow</p>

        {!isResettingPassword && <div className="auth-toggle">
          <button type="button" className={!isRegistering ? 'active' : ''} onClick={() => setIsRegistering(false)}>Login</button>
          <button type="button" className={isRegistering ? 'active' : ''} onClick={() => setIsRegistering(true)}>Register</button>
        </div>}

        {isResettingPassword ? (
          <form onSubmit={resetPassword} className="login-form">
            <label>
              Account Email
              <input type="email" value={resetData.email} onChange={(e) => setResetData({ ...resetData, email: e.target.value })} required />
            </label>
            <label>
              New Password
              <span className="password-input">
                <input type={visiblePasswords.reset ? 'text' : 'password'} value={resetData.password} onChange={(e) => setResetData({ ...resetData, password: e.target.value })} minLength="6" required />
                <button type="button" className={`password-toggle ${visiblePasswords.reset ? 'is-visible' : ''}`} onClick={() => togglePasswordVisibility('reset')} aria-label={visiblePasswords.reset ? 'Hide password' : 'Show password'}><span className="eye-icon" /></button>
              </span>
            </label>
            <label>
              Confirm New Password
              <span className="password-input">
                <input type={visiblePasswords.confirmReset ? 'text' : 'password'} value={resetData.confirmPassword} onChange={(e) => setResetData({ ...resetData, confirmPassword: e.target.value })} minLength="6" required />
                <button type="button" className={`password-toggle ${visiblePasswords.confirmReset ? 'is-visible' : ''}`} onClick={() => togglePasswordVisibility('confirmReset')} aria-label={visiblePasswords.confirmReset ? 'Hide password' : 'Show password'}><span className="eye-icon" /></button>
              </span>
            </label>
            <button type="submit">Reset Password</button>
            <button type="button" className="secondary" onClick={() => { setIsResettingPassword(false); setMessage({ type: '', text: '' }); }}>Back to Login</button>
          </form>
        ) : isRegistering ? (
          <form onSubmit={register} className="login-form">
            <label>
              Full Name
              <input value={registerData.name} onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })} />
            </label>
            <label>
              Email
              <input value={registerData.email} onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} />
            </label>
            <label>
              Password
              <span className="password-input">
                <input type={visiblePasswords.register ? 'text' : 'password'} value={registerData.password} onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })} />
                <button type="button" className={`password-toggle ${visiblePasswords.register ? 'is-visible' : ''}`} onClick={() => togglePasswordVisibility('register')} aria-label={visiblePasswords.register ? 'Hide password' : 'Show password'}><span className="eye-icon" /></button>
              </span>
            </label>
            <label>
              Role
              <select value={registerData.role} onChange={(e) => setRegisterData({ ...registerData, role: e.target.value })}>
                <option value="EMPLOYEE">Employee</option>
                <option value="DIRECTOR">Director</option>
                <option value="ACCOUNTS">Accounts</option>
              </select>
            </label>
            <label>
              Department
              <input value={registerData.department} onChange={(e) => setRegisterData({ ...registerData, department: e.target.value })} />
            </label>
            <label>
              Employee ID (Optional)
              <input value={registerData.employee_id} onChange={(e) => setRegisterData({ ...registerData, employee_id: e.target.value })} />
            </label>
            <button type="submit">Create Account</button>
          </form>
        ) : (
          <form onSubmit={login} className="login-form">
            <label>
              Email
              <input value={loginData.email} onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} />
            </label>
            <label>
              Password
              <span className="password-input">
                <input type={visiblePasswords.login ? 'text' : 'password'} value={loginData.password} onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} />
                <button type="button" className={`password-toggle ${visiblePasswords.login ? 'is-visible' : ''}`} onClick={() => togglePasswordVisibility('login')} aria-label={visiblePasswords.login ? 'Hide password' : 'Show password'}><span className="eye-icon" /></button>
              </span>
            </label>
            <button type="submit">Login</button>
            <button type="button" className="text-button" onClick={() => { setIsResettingPassword(true); setResetData({ ...resetData, email: loginData.email }); setMessage({ type: '', text: '' }); }}>Forgot password?</button>
          </form>
        )}

        <div className="demo-credentials">
          <strong>Demo accounts:</strong>
          <ul>
            <li>Employee: employee@abc.com / employee123</li>
            <li>Director: director@abc.com / director123</li>
            <li>Accounts: accounts@abc.com / accounts123</li>
          </ul>
        </div>
        {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}
      </div>
    </div>
  );

  const renderHome = () => {
    const guideSteps = user.role === 'EMPLOYEE'
      ? [
        { number: '01', title: 'Create a voucher', text: 'Enter the expense details and attach your signature.', view: 'create', action: 'Create voucher' },
        { number: '02', title: 'Submit for approval', text: 'Review your draft, then submit it to your director.', view: 'my-vouchers', action: 'View my vouchers' },
        { number: '03', title: 'Track the status', text: 'Use the dashboard to follow approval and payment progress.', view: 'dashboard', action: 'Open dashboard' }
      ]
      : user.role === 'DIRECTOR'
        ? [
          { number: '01', title: 'Open approvals', text: 'Review submitted expense vouchers waiting for your decision.', view: 'pending', action: 'Review approvals' },
          { number: '02', title: 'Check the details', text: 'Open a voucher to verify its expense information and signature.', view: 'details', action: 'Open details' },
          { number: '03', title: 'Approve or reject', text: 'Add your signature to approve or provide a reason to reject.', view: 'pending', action: 'Go to approvals' }
        ]
        : [
          { number: '01', title: 'Browse vouchers', text: 'View submitted and approved expense records across the company.', view: 'all-vouchers', action: 'View all vouchers' },
          { number: '02', title: 'Inspect a record', text: 'Open voucher details to review the complete expense information.', view: 'details', action: 'Open details' },
          { number: '03', title: 'Monitor reports', text: 'Use the dashboard to track status, categories, and spending trends.', view: 'dashboard', action: 'Open dashboard' }
        ];

    return (
      <div className="home-view">
      <section className="home-hero">
        <div>
          <span className="eyebrow">Voucher workspace</span>
          <h1>Welcome, {user.name}</h1>
          <p>Keep expense requests moving with a clear view of your work.</p>
          <div className="home-actions">
            {user.role === 'EMPLOYEE' && <button onClick={() => setActiveView('create')}>Create Voucher</button>}
            {user.role === 'DIRECTOR' && <button onClick={() => setActiveView('pending')}>Review Approvals</button>}
            <button className="secondary" onClick={() => setActiveView('dashboard')}>Open Dashboard</button>
            <button className="secondary" onClick={() => setActiveView('help')}>Help Guide</button>
          </div>
        </div>
        <div className="home-summary">
          <span className="summary-label">Total value</span>
          <strong>₹{(user.role === 'DIRECTOR' ? stats.pendingAmount : stats.totalAmount).toLocaleString()}</strong>
          <small>{user.role === 'DIRECTOR' ? `${stats.pending} requests awaiting review` : `${stats.total} vouchers in your workspace`}</small>
        </div>
      </section>

      <section className="home-section">
        <div className="section-header">
          <span className="eyebrow">At a glance</span>
          <h2>What needs your attention</h2>
        </div>
        <div className="home-cards">
          <button className="home-card" onClick={() => setActiveView(user.role === 'EMPLOYEE' ? 'my-vouchers' : user.role === 'DIRECTOR' ? 'pending' : 'all-vouchers')}>
            <span className="home-card-icon">{user.role === 'DIRECTOR' ? stats.pending : stats.total}</span>
            <span><strong>{user.role === 'DIRECTOR' ? 'Pending approvals' : 'Total vouchers'}</strong><small>{user.role === 'DIRECTOR' ? 'Open the review queue' : 'Browse your voucher history'}</small></span>
          </button>
          <button className="home-card" onClick={() => setActiveView('dashboard')}>
            <span className="home-card-icon accent">{user.role === 'DIRECTOR' ? stats.approved : stats.pending}</span>
            <span><strong>{user.role === 'DIRECTOR' ? 'Approved vouchers' : 'Pending approval'}</strong><small>See the latest workflow status</small></span>
          </button>
          <button className="home-card" onClick={() => setActiveView('details')}>
            <span className="home-card-icon neutral">→</span>
            <span><strong>Voucher details</strong><small>Select a voucher for the full record</small></span>
          </button>
        </div>
      </section>

    </div>
    );
  };

  const renderHelpGuide = () => (
    <div className="screen-section help-page">
      <div className="section-header">
        <span className="eyebrow">New here?</span>
        <h2>Help Guide</h2>
        <p>Follow these steps to use the voucher workspace.</p>
      </div>
      <div className="guide-grid">
        <article className="guide-step">
          <span className="guide-number">01</span>
          <div><h3>{user.role === 'EMPLOYEE' ? 'Create a voucher' : 'Find a voucher'}</h3><p>{user.role === 'EMPLOYEE' ? 'Open Create Voucher, enter the expense information, and attach your signature.' : 'Use All Vouchers or Pending Approvals to find the record you need.'}</p></div>
        </article>
        <article className="guide-step">
          <span className="guide-number">02</span>
          <div><h3>{user.role === 'EMPLOYEE' ? 'Submit for approval' : 'Review the details'}</h3><p>{user.role === 'EMPLOYEE' ? 'Open My Vouchers, check your draft, and submit it to your director.' : 'Open Voucher Details to check the expense, employee, and signature information.'}</p></div>
        </article>
        <article className="guide-step">
          <span className="guide-number">03</span>
          <div><h3>{user.role === 'DIRECTOR' ? 'Approve or reject' : 'Track progress'}</h3><p>{user.role === 'DIRECTOR' ? 'Add your signature to approve, or enter a reason when rejecting.' : 'Use Dashboard to monitor voucher status, totals, and spending activity.'}</p></div>
        </article>
      </div>
      <button className="secondary help-back" onClick={() => setActiveView('home')}>Back to Home</button>
    </div>
  );

  const renderDashboard = () => (
    <div className="screen-section">
      <div className="section-header">
        <h2>{user.role === 'EMPLOYEE' ? 'Employee Dashboard' : user.role === 'DIRECTOR' ? 'Director Dashboard' : 'Accounts Dashboard'}</h2>
      </div>

      <div className="dashboard-grid">
        <div className="stat-card">
          <span>{user.role === 'ACCOUNTS' ? 'Total Vouchers' : user.role === 'DIRECTOR' ? 'Pending Approval' : 'Total Vouchers'}</span>
          <strong>{user.role === 'DIRECTOR' ? stats.pending : stats.total}</strong>
        </div>
        <div className="stat-card">
          <span>{user.role === 'ACCOUNTS' ? 'Pending Approval' : user.role === 'DIRECTOR' ? 'Approved Today' : 'Draft'}</span>
          <strong>{user.role === 'ACCOUNTS' ? stats.pending : user.role === 'DIRECTOR' ? vouchers.filter((voucher) => voucher.status === 'APPROVED' && String(voucher.approval_date || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length : stats.draft}</strong>
        </div>
        <div className="stat-card">
          <span>{user.role === 'ACCOUNTS' ? 'Approved Vouchers' : user.role === 'DIRECTOR' ? 'Rejected Today' : 'Pending Approval'}</span>
          <strong>{user.role === 'DIRECTOR' ? vouchers.filter((voucher) => voucher.status === 'REJECTED' && String(voucher.updated_at || '').slice(0, 10) === new Date().toISOString().slice(0, 10)).length : user.role === 'ACCOUNTS' ? stats.approved : stats.pending}</strong>
        </div>
        <div className="stat-card">
          <span>{user.role === 'ACCOUNTS' ? 'Rejected Vouchers' : user.role === 'DIRECTOR' ? 'Total Pending Amount' : 'Approved'}</span>
          <strong>{user.role === 'DIRECTOR' ? `₹${stats.pendingAmount.toLocaleString()}` : user.role === 'ACCOUNTS' ? stats.rejected : stats.approved}</strong>
        </div>
        {user.role !== 'DIRECTOR' && <div className="stat-card">
          <span>{user.role === 'ACCOUNTS' ? 'Total Approved Expense' : 'Rejected'}</span>
          <strong>{user.role === 'ACCOUNTS' ? `₹${vouchers.filter((voucher) => voucher.status === 'APPROVED').reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0).toLocaleString()}` : stats.rejected}</strong>
        </div>}
        {user.role === 'EMPLOYEE' && <div className="stat-card amount">
          <span>Total Amount Claimed</span>
          <strong>₹{stats.totalAmount.toLocaleString()}</strong>
        </div>}
      </div>

      <div className="analytics-grid">
        <section className="panel chart-panel status-panel">
          <div className="panel-header">
            <div>
              <h3>Voucher Status</h3>
              <span className="panel-caption">Current workflow distribution</span>
            </div>
            <strong>{stats.total} total</strong>
          </div>
          {statusBreakdown.length ? (
            <>
              <div className="status-bars" aria-label="Voucher status distribution">
                {statusBreakdown.map((status) => (
                  <span
                    key={status.key}
                    title={`${status.label}: ${status.count}`}
                    style={{ backgroundColor: status.color, flex: status.count }}
                  />
                ))}
              </div>
              <div className="legend-list">
                {statusBreakdown.map((status) => (
                  <div key={status.key} className="legend-item">
                    <span className="legend-dot" style={{ backgroundColor: status.color }} />
                    <span>{status.label}</span>
                    <strong>{status.count}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="empty-chart">No voucher activity yet.</p>}
        </section>

        <section className="panel chart-panel">
          <div className="panel-header">
            <div>
              <h3>Spend By Category</h3>
              <span className="panel-caption">Top expense categories</span>
            </div>
          </div>
          {categoryBreakdown.length ? (
            <div className="category-list">
              {categoryBreakdown.map((category) => {
                const largestAmount = categoryBreakdown[0].amount || 1;
                return (
                  <div key={category.label} className="category-row">
                    <div className="category-label"><span>{category.label}</span><strong>₹{category.amount.toLocaleString()}</strong></div>
                    <div className="category-track"><span style={{ width: `${Math.max(8, (category.amount / largestAmount) * 100)}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ) : <p className="empty-chart">No spending data yet.</p>}
        </section>

        <section className="panel chart-panel trend-panel">
          <div className="panel-header">
            <div>
              <h3>Six-Month Trend</h3>
              <span className="panel-caption">Expense amount by month</span>
            </div>
          </div>
          <div className="trend-chart" aria-label="Six month expense trend">
            {monthlyTrend.map((month) => {
              const highestAmount = Math.max(...monthlyTrend.map((item) => item.amount), 1);
              const height = month.amount ? Math.max(10, (month.amount / highestAmount) * 100) : 4;
              return (
                <div key={month.key} className="trend-column" title={`${month.label}: ₹${month.amount.toLocaleString()}`}>
                  <div className="trend-value">{month.amount ? `₹${month.amount.toLocaleString()}` : ''}</div>
                  <div className="trend-bar-wrap"><span style={{ height: `${height}%` }} /></div>
                  <span className="trend-label">{month.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel chart-panel recent-panel">
          <div className="panel-header">
            <div>
              <h3>Recent Activity</h3>
              <span className="panel-caption">Latest voucher updates</span>
            </div>
            <button className="small secondary" onClick={() => setActiveView(user.role === 'EMPLOYEE' ? 'my-vouchers' : 'all-vouchers')}>View all</button>
          </div>
          {recentVouchers.length ? (
            <div className="recent-list">
              {recentVouchers.map((voucher) => (
                <button key={voucher.id} className="recent-item" onClick={() => openVoucherDetails(voucher.id)}>
                  <span className="recent-icon">{(voucher.expense_title || 'V').charAt(0).toUpperCase()}</span>
                  <span className="recent-copy"><strong>{voucher.expense_title || 'Untitled voucher'}</strong><small>{voucher.voucher_number}</small></span>
                  <span className={`badge ${voucher.status.toLowerCase()}`}>{voucher.status.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          ) : <p className="empty-chart">No recent activity.</p>}
        </section>
      </div>
    </div>
  );

  const renderCreateVoucher = () => (
    <section className="panel">
      <div className="panel-header">
        <h2>Create Voucher</h2>
      </div>
      <div className="voucher-form-grid">
        <label>
          Voucher Date
          <input type="date" value={form.voucherDate} onChange={(e) => setForm({ ...form, voucherDate: e.target.value })} />
        </label>
        <label>
          Expense Date
          <input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
        </label>
        <label>
          Department Name
          <input value={form.departmentName} onChange={(e) => setForm({ ...form, departmentName: e.target.value })} />
        </label>
        <label>
          Expense Title
          <input value={form.expenseTitle} onChange={(e) => setForm({ ...form, expenseTitle: e.target.value })} />
        </label>
        <label>
          Expense Category
          <select value={form.expenseCategory} onChange={(e) => setForm({ ...form, expenseCategory: e.target.value })}>
            <option value="">Select category</option>
            <option value="Travel">Travel</option>
            <option value="Meals">Meals</option>
            <option value="Office">Office</option>
            <option value="Medical">Medical</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label>
          Amount
          <input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </label>
        <label className="full-width">
          Description
          <textarea value={form.expenseDescription} onChange={(e) => setForm({ ...form, expenseDescription: e.target.value })} />
        </label>
        <label className="full-width">
          Employee Signature (Image Upload)
          <input type="file" accept="image/*" onChange={(e) => setSignatureFile(e.target.files[0])} />
        </label>
      </div>
      <div className="action-row">
        <button className="secondary" onClick={() => saveVoucher('DRAFT')}>{editingVoucherId ? 'Update Draft' : 'Save as Draft'}</button>
      </div>
    </section>
  );

  const renderApprovalActions = () => (
    <section className="panel">
      <div className="panel-header">
        <h2>Approval Actions</h2>
      </div>
      <div className="approval-box">
        <label>
          Director Signature
          <input type="file" accept="image/*" onChange={(e) => setDirectorSignatureFile(e.target.files[0])} />
        </label>
        <label>
          Rejection Reason
          <input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Reason for rejection" />
        </label>
      </div>
    </section>
  );

  const renderVoucherTable = (list) => (
    <section className="panel">
      <div className="panel-header">
        <h2>{user.role === 'EMPLOYEE' ? 'My Vouchers' : user.role === 'DIRECTOR' ? activeView === 'pending' ? 'Pending Approvals' : 'All Vouchers' : 'All Vouchers'}</h2>
      </div>
      <div className="filter-bar">
        <input placeholder="Search voucher, employee, department..." value={voucherFilters.search} onChange={(e) => updateVoucherFilter('search', e.target.value)} />
        <select value={voucherFilters.department} onChange={(e) => updateVoucherFilter('department', e.target.value)}>
          <option value="">All departments</option>
          {[...new Set(list.map((voucher) => voucher.department_name).filter(Boolean))].sort().map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
        <select value={voucherFilters.category} onChange={(e) => updateVoucherFilter('category', e.target.value)}>
          <option value="">All categories</option>
          {[...new Set(list.map((voucher) => voucher.expense_category).filter(Boolean))].sort().map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={voucherFilters.status} onChange={(e) => updateVoucherFilter('status', e.target.value)}>
          <option value="">All statuses</option>
          {['DRAFT', 'PENDING_APPROVAL', 'SUBMITTED', 'APPROVED', 'REJECTED'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
        </select>
        <input type="date" aria-label="From date" value={voucherFilters.fromDate} onChange={(e) => updateVoucherFilter('fromDate', e.target.value)} />
        <input type="date" aria-label="To date" value={voucherFilters.toDate} onChange={(e) => updateVoucherFilter('toDate', e.target.value)} />
        <input type="number" min="0" aria-label="Minimum amount" placeholder="Min amount" value={voucherFilters.minAmount} onChange={(e) => updateVoucherFilter('minAmount', e.target.value)} />
        <input type="number" min="0" aria-label="Maximum amount" placeholder="Max amount" value={voucherFilters.maxAmount} onChange={(e) => updateVoucherFilter('maxAmount', e.target.value)} />
        <select value={voucherFilters.sort} onChange={(e) => updateVoucherFilter('sort', e.target.value)} aria-label="Sort vouchers">
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="amount-high">Amount high to low</option><option value="amount-low">Amount low to high</option>
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Voucher #</th>
              <th>{user.role === 'EMPLOYEE' ? 'Title' : 'Employee'}</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredVouchers(list).map((voucher) => (
              <tr key={voucher.id}>
                <td>{voucher.voucher_number}</td>
                <td>{user.role === 'EMPLOYEE' ? voucher.expense_title : voucher.employee_name}</td>
                <td>{voucher.expense_category}</td>
                <td>₹{Number(voucher.amount || 0).toLocaleString()}</td>
                <td><span className={`badge ${voucher.status.toLowerCase()}`}>{voucher.status}</span></td>
                <td className="action-stack">
                  <button className="small" onClick={() => openVoucherDetails(voucher.id)}>View</button>

                  {user?.role === 'EMPLOYEE' && voucher.status === 'DRAFT' && (
                    <>
                      <button className="small secondary" onClick={() => {
                        setForm({
                          voucherDate: voucher.voucher_date || '',
                          expenseDate: voucher.expense_date || '',
                          departmentName: voucher.department_name || '',
                          expenseTitle: voucher.expense_title || '',
                          expenseCategory: voucher.expense_category || '',
                          expenseDescription: voucher.expense_description || '',
                          amount: voucher.amount || '',
                          status: 'DRAFT'
                        });
                        setEditingVoucherId(voucher.id);
                        setActiveView('create');
                      }}>Edit</button>
                      <button className="small danger" onClick={() => deleteVoucher(voucher.id)}>Delete</button>
                      <button className="small" onClick={() => submitVoucher(voucher.id)}>Submit</button>
                    </>
                  )}

                  {user?.role === 'DIRECTOR' && (voucher.status === 'PENDING_APPROVAL' || voucher.status === 'SUBMITTED') && (
                    <>
                      <button className="small" onClick={() => {
                        setSelectedVoucherId(voucher.id);
                        setActiveView('details');
                      }}>Review</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderDetails = () => {
    if (!selectedVoucher) {
      return (
        <section className="panel">
          <div className="panel-header">
            <h2>Voucher Details</h2>
          </div>
          <p>Select a voucher to view the full details.</p>
        </section>
      );
    }

    return (
      <section className="panel detail-panel">
        <div className="panel-header">
          <h2>Voucher Details</h2>
        </div>
        <div className="voucher-details-grid">
          <h3 className="details-group-title">Basic Information</h3>
          <div><strong>Voucher Number:</strong> {selectedVoucher.voucher_number}</div>
          <div><strong>Voucher Date:</strong> {selectedVoucher.voucher_date}</div>
          <div><strong>Expense Date:</strong> {selectedVoucher.expense_date}</div>
          <div><strong>Department Name:</strong> {selectedVoucher.department_name}</div>
          <div><strong>Expense Title:</strong> {selectedVoucher.expense_title}</div>
          <div><strong>Expense Category:</strong> {selectedVoucher.expense_category}</div>
          <div><strong>Amount:</strong> ₹{Number(selectedVoucher.amount || 0).toLocaleString()}</div>
          <div><strong>Status:</strong> {selectedVoucher.status}</div>
          <div className="full-width"><strong>Expense Description:</strong> {selectedVoucher.expense_description || 'Not provided'}</div>

          <h3 className="details-group-title">Employee Information</h3>
          <div><strong>Employee Name:</strong> {selectedVoucher.employee_name}</div>
          <div><strong>Employee ID:</strong> {selectedVoucher.employee_code || 'Optional - not provided'}</div>
          <div><strong>Employee Signature:</strong> {selectedVoucher.employee_signature ? <img src={selectedVoucher.employee_signature} alt="Employee signature" className="signature" /> : 'Image not uploaded'}</div>

          <h3 className="details-group-title">Approval Information</h3>
          <div><strong>Director Signature:</strong> {selectedVoucher.director_signature ? <img src={selectedVoucher.director_signature} alt="Director signature" className="signature" /> : 'Pending'}</div>
          <div><strong>Approval Date:</strong> {selectedVoucher.approval_date || 'Not available'}</div>
          <div className="full-width"><strong>Rejection Reason:</strong> {selectedVoucher.rejection_reason || 'Not applicable'}</div>

          <h3 className="details-group-title">Audit Information</h3>
          <div><strong>Created Date:</strong> {selectedVoucher.created_at || 'Not available'}</div>
          <div><strong>Last Updated Date:</strong> {selectedVoucher.updated_at || 'Not available'}</div>
        </div>

        {user?.role === 'DIRECTOR' && (selectedVoucher.status === 'PENDING_APPROVAL' || selectedVoucher.status === 'SUBMITTED') && (
          <div className="approval-controls">
            <label>
              Director Signature
              <input type="file" accept="image/*" onChange={(e) => setDirectorSignatureFile(e.target.files[0])} />
            </label>
            <label>
              Rejection Reason
              <input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="Enter rejection reason" />
            </label>
            <div className="action-row">
              <button onClick={() => approveVoucher(selectedVoucher.id)}>Approve</button>
              <button className="danger" onClick={() => rejectVoucher(selectedVoucher.id)}>Reject</button>
            </div>
          </div>
        )}
      </section>
    );
  };

  if (loading) {
    return <div className="loading">Loading portal...</div>;
  }

  return (
    <div className="app-shell">
      {!user ? (
        renderLogin()
      ) : (
        <>
          <header className="topbar">
            <div>
              <h2>{ROLE_LABELS[user.role]} Portal</h2>
              <p>Welcome, {user.name}</p>
            </div>
            <div className="top-actions">
              <div className="nav-pills">
                {getNavItems().map((item) => (
                  <button
                    key={item.key}
                    className={`nav-pill ${activeView === item.key ? 'active' : ''}`}
                    onClick={() => {
                      setActiveView(item.key);
                      if (item.key !== 'details') setSelectedVoucherId(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button className="logout-btn" onClick={logout}>Logout</button>
            </div>
          </header>

          {message.text && <div className={`alert ${message.type}`}>{message.text}</div>}

          {activeView === 'home' && renderHome()}
          {activeView === 'dashboard' && renderDashboard()}
          {activeView === 'create' && renderCreateVoucher()}
          {activeView === 'my-vouchers' && renderVoucherTable(employeeVouchers)}
          {activeView === 'pending' && renderVoucherTable(pendingVouchers)}
          {activeView === 'all-vouchers' && renderVoucherTable(vouchers)}
          {activeView === 'details' && renderDetails()}
          {activeView === 'help' && renderHelpGuide()}
        </>
      )}
    </div>
  );
}

export default App;
