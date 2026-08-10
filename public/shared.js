/**
 * ============================================================
 * AA Enterprise SaaS Platform — Shared JS Utilities v2.0
 * Common SPA functions reused across all modules.
 * Import this file in every module dashboard.html
 * ============================================================
 */

// ─── Toast Notification System ───────────────────────────────
(function initToastContainer() {
  if (!document.getElementById('aaToastContainer')) {
    const el = document.createElement('div');
    el.id = 'aaToastContainer';
    el.className = 'toast-container-fixed';
    document.body.appendChild(el);
  }
})();

function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('aaToastContainer');
  const icons = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', info: 'bi-info-circle-fill', warning: 'bi-exclamation-triangle-fill' };
  const toast = document.createElement('div');
  toast.className = `aa-toast toast-${type}`;
  toast.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.4s ease forwards';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

// ─── Drawer Open/Close ───────────────────────────────────────
function showDrawer() {
  const drawer = document.getElementById('entityDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  if (drawer) drawer.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
}

function closeDrawer() {
  const drawer = document.getElementById('entityDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
}

function openDrawerLoader(title, subtitle = '') {
  const titleEl = document.getElementById('drawerEntityTitle');
  const subtitleEl = document.getElementById('drawerEntitySubtitle');
  const bodyEl = document.getElementById('drawerBodyContent');
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;
  if (bodyEl) bodyEl.innerHTML = `
    <div class="view-loader">
      <div class="spinner-border"></div>
      <p>Loading ${title}...</p>
    </div>`;
  showDrawer();
}

// ─── Role Switcher ───────────────────────────────────────────
function buildRoleSwitcher(assignedRoles, activeRole, onSwitch) {
  const dropdown = document.getElementById('roleDropdownMenu');
  const btn = document.getElementById('roleSwitcherBtn');
  if (!dropdown || !btn) return;

  btn.textContent = `Perspective: ${activeRole}`;
  dropdown.innerHTML = assignedRoles.map(role => `
    <li>
      <a class="dropdown-item ${role === activeRole ? 'active fw-bold' : ''}" href="#"
         onclick="event.preventDefault(); (${onSwitch.toString()})('${role}')">
        <i class="bi bi-person-badge me-2"></i>${role.replace(/_/g, ' ')}
      </a>
    </li>
  `).join('');
}

// ─── Sidebar Renderer ────────────────────────────────────────
function renderSidebarForRole(navMapping, activeRole, currentView, onSwitch) {
  const navUl = document.getElementById('sidebarNav');
  if (!navUl) return;
  const items = navMapping[activeRole] || navMapping[Object.keys(navMapping)[0]] || [];
  navUl.innerHTML = items.map((item, idx) => `
    <li class="nav-item">
      <button class="nav-link ${item.view === currentView || (idx === 0 && !currentView) ? 'active' : ''}"
              data-view="${item.view}"
              onclick="(${onSwitch.toString()})('${item.view}', this)">
        <i class="bi ${item.icon}"></i>
        <span class="nav-label">${item.label}</span>
        ${item.badge ? `<span class="badge bg-danger ms-auto" style="font-size:0.65rem">${item.badge}</span>` : ''}
      </button>
    </li>
  `).join('');
}

function setActiveSidebarItem(viewName) {
  document.querySelectorAll('.sidebar .nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewName);
  });
}

// ─── User Avatar Initials ────────────────────────────────────
function getInitials(name) {
  if (!name) return '??';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ─── CSV Export ──────────────────────────────────────────────
function exportToCSV(data, filename) {
  if (!data || !data.length) {
    showToast('No data available to export.', 'warning');
    return;
  }
  const keys = Object.keys(data[0]);
  let csv = keys.join(',') + '\n';
  data.forEach(row => {
    csv += keys.map(k => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${data.length} records to CSV.`, 'success');
}

// ─── Live Table Filter ───────────────────────────────────────
function filterTable(tableBodyId, query) {
  const q = (query || '').toLowerCase();
  const rows = document.querySelectorAll(`#${tableBodyId} tr`);
  let visible = 0;
  rows.forEach(r => {
    const match = r.textContent.toLowerCase().includes(q);
    r.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  return visible;
}

// ─── Bulk Selection ──────────────────────────────────────────
function toggleSelectAll(masterCheckbox, checkboxClass) {
  document.querySelectorAll(`.${checkboxClass}`).forEach(c => {
    c.checked = masterCheckbox.checked;
  });
  updateBulkActionBar(checkboxClass);
}

function updateBulkActionBar(checkboxClass) {
  const selected = document.querySelectorAll(`.${checkboxClass}:checked`);
  const bar = document.getElementById('bulkActionBar');
  const countEl = document.getElementById('bulkSelectedCount');
  if (bar) bar.classList.toggle('show', selected.length > 0);
  if (countEl) countEl.textContent = selected.length;
}

function getSelectedIds(checkboxClass) {
  return Array.from(document.querySelectorAll(`.${checkboxClass}:checked`)).map(c => c.value);
}

// ─── Date Formatting ─────────────────────────────────────────
function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', ...opts
    });
  } catch { return dateStr; }
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch { return dateStr; }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30)  return `${days}d ago`;
  return formatDate(dateStr);
}

// ─── Currency Formatting ──────────────────────────────────────
function formatCurrency(amount, symbol = '₹') {
  const n = parseFloat(amount) || 0;
  if (n >= 10000000) return `${symbol}${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000)   return `${symbol}${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)     return `${symbol}${(n / 1000).toFixed(1)}K`;
  return `${symbol}${n.toLocaleString('en-IN')}`;
}

// ─── Status Badge Helper ──────────────────────────────────────
function statusBadge(status) {
  const map = {
    'ACTIVE':    'status-active',
    'PENDING':   'status-pending',
    'APPROVED':  'status-approved',
    'REJECTED':  'status-rejected',
    'COMPLETED': 'status-completed',
    'CANCELLED': 'status-cancelled',
    'OVERDUE':   'status-overdue',
    'PAID':      'status-paid',
    'UNPAID':    'status-unpaid',
    'WON':       'status-won',
    'LOST':      'status-lost',
    'SCHEDULED': 'status-scheduled',
    'NEW':       'status-new',
  };
  const cls = map[(status || '').toUpperCase()] || 'status-pending';
  return `<span class="badge-status ${cls}">${status || 'N/A'}</span>`;
}

// ─── Empty State HTML ─────────────────────────────────────────
function emptyStateHTML(icon, title, message, actionBtn = '') {
  return `
    <div class="empty-state">
      <i class="bi ${icon}"></i>
      <h5>${title}</h5>
      <p class="text-muted">${message}</p>
      ${actionBtn}
    </div>`;
}

// ─── View Loader HTML ─────────────────────────────────────────
function viewLoaderHTML(text = 'Loading...') {
  return `<div class="view-loader"><div class="spinner-border"></div><p>${text}</p></div>`;
}

// ─── Module Init Helper ───────────────────────────────────────
async function initModuleDashboard(config) {
  /**
   * config = {
   *   moduleClass: 'module-crm',
   *   apiBase: '/api/crm',
   *   roleNavMapping: {...},
   *   fetchAllData: async fn,
   *   switchView: fn,
   *   defaultView: 'dashboard',
   *   defaultRole: 'ADMIN'
   * }
   */
  const { moduleClass, apiBase, roleNavMapping, fetchAllData, switchView, defaultView, defaultRole } = config;

  // Apply module body class for theme
  if (moduleClass) document.body.classList.add(moduleClass);

  const token = localStorage.getItem('token');
  if (!token) { window.location.href = './index.html'; return; }

  let currentUser = {};
  let assignedRoles = [defaultRole || 'ADMIN'];
  let activeRole = defaultRole || 'ADMIN';

  try {
    const res = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    currentUser = res.data;

    const nameEl = document.getElementById('userName');
    const avatarEl = document.getElementById('userAvatar');
    const roleEl = document.getElementById('userActiveRoleText');
    const tenantEl = document.getElementById('tenantName');

    if (nameEl) nameEl.textContent = currentUser.name || 'Admin';
    if (avatarEl) { avatarEl.textContent = getInitials(currentUser.name); }
    if (tenantEl) tenantEl.textContent = currentUser.tenantName || '';

    try {
      const roleRes = await axios.get(`/api/tenant/users/${currentUser.id}/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      assignedRoles = roleRes.data && roleRes.data.length ? roleRes.data : [currentUser.role || defaultRole];
    } catch {
      assignedRoles = [currentUser.role || defaultRole];
    }

    activeRole = assignedRoles[0];
    if (roleEl) roleEl.textContent = activeRole;
  } catch {
    activeRole = defaultRole;
    const nameEl = document.getElementById('userName');
    if (nameEl) nameEl.textContent = 'Admin';
  }

  return { currentUser, assignedRoles, activeRole };
}
