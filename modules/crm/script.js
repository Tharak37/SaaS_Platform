
let token = localStorage.getItem('token');
if (!token) window.location.href = './index.html';

let api = axios.create({ baseURL: '/api/crm', headers: { Authorization: `Bearer ${token}` } });
let currentUser = { name: 'CRM Administrator', role: 'CRM_ADMIN' };
let activeRole = 'CRM_ADMIN';
let currentView = 'dashboard';
let cachedData = { regions: [], lists: [], leads: [], leadSources: [], leadStatuses: [], customers: [], customerContacts: [], opportunities: [], opportunityStages: [], quotations: [], salesOrders: [], invoices: [], tasks: [], followUps: [], chatMessages: [], campaigns: [] };

const VIEW_CONFIG = {
    regions: { label: 'Regions & Hubs', dataKey: 'regions', api: 'regions', primary: 'regionName', subtitle: i => [i.country, i.stateOrProvince].filter(Boolean).join(' · '), meta: [{ f: 'description', icon: 'bi-card-text' }] },
    lists: { label: 'Target Lists', dataKey: 'lists', api: 'lists', primary: 'listName', subtitle: i => i.regionName, meta: [{ f: 'description', icon: 'bi-card-text' }] },
    leads: { label: 'Leads Pipeline', dataKey: 'leads', api: 'leads', primary: 'fullName', subtitle: i => i.companyName, badge: { f: 'estimatedValue', prefix: '₹' }, meta: [{ f: 'phone', icon: 'bi-telephone' }, { f: 'email', icon: 'bi-envelope' }] },
    'lead-sources': { label: 'Lead Sources', dataKey: 'leadSources', api: 'lead-sources', primary: 'sourceName', meta: [{ f: 'description', icon: 'bi-card-text' }] },
    'lead-statuses': { label: 'Lead Statuses', dataKey: 'leadStatuses', api: 'lead-statuses', primary: 'statusName', meta: [{ f: 'displayOrder', icon: 'bi-sort-numeric-down', label: 'Order' }] },
    customers: { label: 'Customer Accounts', dataKey: 'customers', api: 'customers', primary: 'companyName', subtitle: i => i.industry, meta: [{ f: 'website', icon: 'bi-globe' }, { f: 'phone', icon: 'bi-telephone' }] },
    // 'customer-contacts': {label: 'Customer Contacts', dataKey: 'customerContacts', api: 'customer-contacts', primary: 'fullName', subtitle: i => i.companyName, meta: [{f: 'email', icon: 'bi-envelope' }, {f: 'phone', icon: 'bi-telephone' }, {f: 'designation', icon: 'bi-briefcase' }] },
    opportunities: { label: 'Deal Opportunities', dataKey: 'opportunities', api: 'opportunities', primary: 'opportunityName', badge: { f: 'dealValue', prefix: '₹' }, meta: [{ f: 'expectedCloseDate', icon: 'bi-calendar-event', label: 'Close' }] },
    'opportunity-stages': { label: 'Opportunity Stages', dataKey: 'opportunityStages', api: 'opportunity-stages', primary: 'stageName', meta: [{ f: 'probability', icon: 'bi-percent' }, { f: 'displayOrder', icon: 'bi-sort-numeric-down' }] },
    quotations: { label: 'Quotations', dataKey: 'quotations', api: 'quotations', primary: 'quotationNumber', badge: { f: 'totalAmount', prefix: '₹' }, meta: [{ f: 'status', icon: 'bi-flag' }] },
    'sales-orders': { label: 'Sales Orders', dataKey: 'salesOrders', api: 'sales-orders', primary: 'orderNumber', badge: { f: 'totalAmount', prefix: '₹' }, meta: [{ f: 'orderStatus', icon: 'bi-flag' }] },
    invoices: { label: 'Invoicing & Billing', dataKey: 'invoices', api: 'invoices', primary: 'invoiceNumber', badge: { f: 'totalAmount', prefix: '₹' }, meta: [{ f: 'paymentStatus', icon: 'bi-flag' }] },
    tasks: { label: 'Tasks', dataKey: 'tasks', api: 'tasks', primary: 'title', meta: [{ f: 'priority', icon: 'bi-flag' }, { f: 'status', icon: 'bi-flag2' }, { f: 'dueDate', icon: 'bi-calendar' }] },
    'follow-ups': { label: 'Follow-Up Alarms', dataKey: 'followUps', api: 'follow-ups', primary: 'note', meta: [{ f: 'reminderTime', icon: 'bi-clock' }, { f: 'status', icon: 'bi-flag' }] },
    'chat-messages': { label: 'WhatsApp & Chats', dataKey: 'chatMessages', api: 'chat-messages', primary: 'messageBody', meta: [{ f: 'channel', icon: 'bi-chat' }, { f: 'direction', icon: 'bi-arrow-left-right' }] },
    campaigns: { label: 'Marketing Campaigns', dataKey: 'campaigns', api: 'campaigns', primary: 'campaignName', subtitle: i => i.campaignType, badge: { f: 'budget', prefix: '₹' }, meta: [{ f: 'status', icon: 'bi-flag' }] }
};

async function initDashboard() {
    try {
        const res = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        currentUser = res.data;
        activeRole = currentUser.role || 'ADMIN';
    } catch (e) { console.warn('Auth fallback active'); }
    document.getElementById('userAvatar').textContent = (currentUser.name || 'T').split(' ').map(n => n[0]).join('');
    document.getElementById('profileSheetName').textContent = currentUser.name || 'Taraka Manikanta';

    await fetchAllData();
    switchView('dashboard');
}

function handleSignOut() {
    localStorage.removeItem('token');
    window.location.href = './index.html';
}

// Fetch all modules and sort newest records (highest ID) first
async function fetchAllData() {
    try {
        const results = await Promise.allSettled([
            api.get('/regions').catch(() => ({ data: [] })),
            api.get('/leads').catch(() => ({ data: [] })),
            api.get('/lead-sources').catch(() => ({ data: [] })),
            api.get('/lead-statuses').catch(() => ({ data: [] })),
            api.get('/customers').catch(() => ({ data: [] })),
            api.get('/opportunities').catch(() => ({ data: [] })),
            api.get('/opportunity-stages').catch(() => ({ data: [] })),
            api.get('/quotations').catch(() => ({ data: [] })),
            api.get('/sales-orders').catch(() => ({ data: [] })),
            api.get('/invoices').catch(() => ({ data: [] })),
            api.get('/tasks').catch(() => ({ data: [] })),
            api.get('/follow-ups').catch(() => ({ data: [] })),
            api.get('/chat-messages').catch(() => ({ data: [] })),
            api.get('/campaigns').catch(() => ({ data: [] }))
        ]);

        const sortNewestFirst = (arr) => Array.isArray(arr) ? [...arr].sort((a, b) => (b.id || 0) - (a.id || 0)) : [];
        const getData = (i, fb = []) => results[i].status === 'fulfilled' && results[i].value ? sortNewestFirst(results[i].value.data) : fb;

        cachedData.regions = getData(0, []);
        cachedData.leads = getData(1, []);
        cachedData.leadSources = getData(2, []);
        cachedData.leadStatuses = getData(3, []);
        cachedData.customers = getData(4, []);
        cachedData.opportunities = getData(5, []);
        cachedData.opportunityStages = getData(6, []);
        cachedData.quotations = getData(7, []);
        cachedData.salesOrders = getData(8, []);
        cachedData.invoices = getData(9, []);
        cachedData.tasks = getData(10, []);
        cachedData.followUps = getData(11, []);
        cachedData.chatMessages = getData(12, []);
        cachedData.campaigns = getData(13, []);
        cachedData.lists = [];
        for (const reg of cachedData.regions) {
            try {
                const listRes = await api.get(`/regions/${reg.id}/lists`);
                if (listRes && listRes.data) {
                    listRes.data.forEach(l => l.regionName = reg.regionName);
                    cachedData.lists.push(...sortNewestFirst(listRes.data));
                }
            } catch (e) { }
        }
    } catch (err) { console.error('Fetch error container', err); }
}

async function switchView(viewName, element) {
    currentView = viewName;
    closeAllSheets();

    // Highlight active link in both desktop sidebar & mobile bottom nav
    document.querySelectorAll('.sidebar-link, .bottom-nav .nav-item').forEach(el => el.classList.remove('active'));
    const navBtns = document.querySelectorAll(`[data-view="${viewName}"]`);
    navBtns.forEach(btn => btn.classList.add('active'));

    const container = document.getElementById('mainContainer');
    container.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner-border" style="color:var(--med-primary)"></div><p class="mt-2 small">Loading…</p></div>`;
    await fetchAllData();

    if (viewName === 'dashboard') renderDashboard(container);
    else renderCardListView(container, viewName);
}

function renderDashboard(container) {
    const qa = [
        { icon: 'bi-person-plus-fill', label: 'New Lead', action: 'openLeadQuickModal()' },
        { icon: 'bi-graph-up-arrow', label: 'Deal Pipeline', action: 'openOpportunityQuickModal()' },
        { icon: 'bi-check2-square', label: 'Schedule Task', action: 'openTaskQuickModal()' }
    ];
    container.innerHTML = `
    <div class="hero-banner">
        <h3>Welcome, ${(currentUser.name || 'Hospital').split(' ')[0]} 🩺</h3>
        <p>AA MediCare 360° · Unified Clinic Operating System</p>
        <span class="abha-pill"><i class="bi bi-shield-check"></i> ${activeRole} Gateway Live</span>
    </div>

    <div class="qa-row">
        ${qa.map(q => `<div class="qa-item" onclick="${q.action ? q.action : `switchView('${q.view}', null)`}"><div class="qa-icon"><i class="bi ${q.icon}"></i></div><div class="qa-label">${q.label}</div></div>`).join('')}
    </div>

    <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-icon" style="background:#FCEBD1; color:var(--med-primary)"><i class="bi bi-funnel-fill"></i></div><div class="kpi-label">Total Leads</div><div class="kpi-value">${cachedData.leads.length}</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#E5F3E4; color:#4C8C4A"><i class="bi bi-building"></i></div><div class="kpi-label">Customers</div><div class="kpi-value">${cachedData.customers.length}</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#FBEFD6; color:#B9782B"><i class="bi bi-graph-up-arrow"></i></div><div class="kpi-label">Opportunities</div><div class="kpi-value">${cachedData.opportunities.length}</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#F1E6F9; color:#8B5CF6"><i class="bi bi-alarm"></i></div><div class="kpi-label">Follow-Ups</div><div class="kpi-value">${cachedData.followUps.length}</div></div>
    </div>

    <div class="section-title"><h2>Recent Leads (Most Recent First)</h2></div>
    <div id="dashRecentLeads"></div>
    `;
    const recentWrap = document.getElementById('dashRecentLeads');
    const recent = cachedData.leads.slice(0, 5);
    recentWrap.innerHTML = recent.length ? recent.map(item => renderCard(item, VIEW_CONFIG.leads, 'leads')).join('')
        : `<div class="empty-state"><i class="bi bi-inbox"></i>No leads yet — tap + to add one.</div>`;
}

function initials(str) { return (str || '?').toString().trim().split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase(); }

function renderCard(item, cfg, viewName) {
    const title = item[cfg.primary] || `Record #${item.id}`;
    const subtitle = typeof cfg.subtitle === 'function' ? cfg.subtitle(item) : (cfg.subtitle ? item[cfg.subtitle] : '');
    const badgeVal = cfg.badge ? item[cfg.badge.f] : null;
    const metaHtml = (cfg.meta || []).filter(m => item[m.f]).map(m => `<span><i class="bi ${m.icon}"></i>${m.label ? m.label + ': ' : ''}${item[m.f]}</span>`).join('');
    const itemJson = JSON.stringify(item).replace(/"/g, '&quot;');

    // Custom status pill formatting for OPD Queue
    let badgeMarkup = '';
    if (badgeVal) {
        if (viewName === 'appointments' || cfg.badge.f === 'status') {
            badgeMarkup = `<span class="status-pill status-${badgeVal}">${badgeVal}</span>`;
        } else {
            badgeMarkup = `<div class="rec-badge">${cfg.badge.prefix || ''}${badgeVal}</div>`;
        }
    }

    return `
    <div class="rec-card" onclick='openDrawer(${itemJson})'>
        <div class="rec-avatar">${initials(title)}</div>
        <div class="rec-body">
            <div class="rec-top">
                <div class="rec-title">${title}</div>
                ${badgeMarkup}
            </div>
            ${subtitle ? `<div class="rec-subtitle">${subtitle}</div>` : ''}
            ${metaHtml ? `<div class="rec-meta">${metaHtml}</div>` : ''}
        </div>
    </div>
    `;
}

function renderCardListView(container, viewName) {
    const cfg = VIEW_CONFIG[viewName];
    if (!cfg) { renderDashboard(container); return; }
    const data = cachedData[cfg.dataKey] || [];
    container.innerHTML = `
    <div class="section-title">
        <div><h2>${cfg.label}</h2><div class="section-sub">${data.length} record${data.length === 1 ? '' : 's'} (Most recent first)</div></div>
        <button class="btn btn-sm btn-primary" onclick="openDynamicAddModal()"><i class="bi bi-plus-lg"></i> Add New</button>
    </div>
    <div id="cardListBody"></div>
    `;
    document.getElementById('cardListBody').innerHTML = data.length
        ? data.map(item => renderCard(item, cfg, viewName)).join('')
        : `<div class="empty-state"><i class="bi bi-inbox"></i>No records found.<br><span style="font-size:0.8rem">Tap the + button to add one.</span></div>`;
}

/* ---------- Sheets & Navigation Handlers ---------- */
function toggleSearch() { const s = document.getElementById('searchWrap'); s.style.maxHeight = s.style.maxHeight === '60px' ? '0px' : '60px'; }
function openMoreSheet() { document.getElementById('sheetOverlay').classList.add('open'); document.getElementById('moreSheet').classList.add('open'); }

function closeAllSheets() {
    document.getElementById('sheetOverlay').classList.remove('open');
    document.getElementById('moreSheet').classList.remove('open');
    document.getElementById('profileSheet').classList.remove('open');
    document.getElementById('entitySheet').classList.remove('open');
}

/* Open Record 360° Drawer with Interactive Workflow Controls */
function openDrawer(item) {
    // 1. Determine friendly Table / Module Name context
    let entityCategory = 'Record Details';
    if (typeof currentView !== 'undefined' && currentView) {
        entityCategory = currentView.replace(/[-_]/g, ' ').toUpperCase();
    } else {
        entityCategory = '';
    }

    // 2. Determine record title
    const title = item.regionName || item.listName || item.fullName || item.companyName || item.opportunityName || item.quotationNumber || item.orderNumber || item.invoiceNumber || item.campaignName || item.sourceName || item.statusName || item.stageName || item.title || `Record #${item.id}`;
    document.getElementById('drawerEntityTitle').textContent = title;

    let html = `<div style="max-height: 60vh; overflow-y: auto; padding-right: 4px;">`;

    // 3. Render Table Type Header Badge
    html += `
        <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
            <span class="badge px-2 py-1 text-uppercase fw-bold" style="font-size: 0.65rem; background-color: #E2E8F0; color: #475569; letter-spacing: 0.5px;">
                <i class="bi bi-database me-1"></i> ${entityCategory}
            </span>
            <span class="text-muted" style="font-size: 0.7rem;">ID: #${item.id || 'N/A'}</span>
        </div>
        `;
    const ignoreKeys = [];
    // const ignoreKeys = ['id', 'tenantId', 'userId', 'clientId', 'accountId', 'leadId', 'opportunityId', 'contactId', 'status', 'password', 'passwordHash', 'token', 'deletedAt', 'isDeleted', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];

    html += `<form id="drawerEditForm" onsubmit="handleDrawerFormSubmit(event, ${item.id})">`;

    Object.entries(item).filter(([k]) => !ignoreKeys.includes(k)).forEach(([key, val]) => {
        if (val !== null && val !== undefined) {
            const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

            // Determine input type and normalize value
            let inputType = 'text';
            let formattedVal = val;

            if (key.toLowerCase().includes('date') || key.toLowerCase().includes('datetime')) {
                inputType = 'datetime-local';
                if (typeof formattedVal === 'string' && formattedVal.includes('T')) {
                    formattedVal = formattedVal.slice(0, 16);
                }
            } else if (key.toLowerCase().includes('date')) {
                inputType = 'date';
                if (typeof formattedVal === 'string' && formattedVal.includes('T')) {
                    formattedVal = formattedVal.split('T')[0];
                }
            } else if (typeof val === 'number') {
                inputType = 'number';
            } else if (val.toString().length > 100) {
                html += `
                <div class="mb-3">
                    <label class="form-label text-xs fw-semibold text-muted">${formattedKey}</label>
                    <textarea name="${key}" class="form-control form-control-sm" rows="2">${val}</textarea>
                </div>`;
                return;
            }

            html += `
            <div class="mb-2">
                <label class="form-label text-xs fw-semibold text-muted">${formattedKey}</label>
                <input type="${inputType}" name="${key}" class="form-control form-control-sm" value="${formattedVal}">
            </div>`;
        }
    });

    html += `
            <div class="mt-4 pt-2 border-top">
                <button type="submit" class="btn w-100 py-2 text-white fw-semibold shadow-sm mb-2" style="background-color: var(--med-primary); border-color: var(--med-primary);">
                    <i class="bi bi-check-lg me-1"></i> Save Record Updates
                </button>
                <button type="button" class="btn btn-outline-danger w-100 py-2 fw-semibold shadow-sm mb-2" style="color: var(--bs-btn-hover-color); background-color: var(--bs-btn-hover-bg); border-color: var(--bs-btn-hover-border-color);" onclick="handleDrawerDelete(${item.id})">
                    <i class="bi bi-trash me-1"></i> Delete Record
                </button>
            </div>
        </form>`;

    html += `</div>`;

    document.getElementById('drawerBodyContent').innerHTML = html;
    document.getElementById('sheetOverlay').classList.add('open');
    document.getElementById('entitySheet').classList.add('open');
}

async function handleRecordStatusUpdate(viewName, recordId, fieldKey) {
    const newVal = document.getElementById('drawerStatusDropdown').value;
    const cfg = VIEW_CONFIG[viewName];
    if (!cfg) return;
    try {
        await api.put(`/${cfg.api}/${recordId}`, { [fieldKey]: newVal }).catch(async () => {
            await api.patch(`/${cfg.api}/${recordId}`, { [fieldKey]: newVal });
        });
        closeAllSheets();
        await fetchAllData();
        switchView(currentView);
    } catch (err) {
        console.error('Status update failed:', err);
        alert('Could not update record status.');
    }
}

/* ---------- Dynamic CRUD Modal Form Generator ---------- */
function openDynamicAddModal() {
    const view = currentView === 'dashboard' ? 'leads' : currentView;
    const titleEl = document.getElementById('dynamicModalTitle');
    const fieldsEl = document.getElementById('dynamicFormFields');
    titleEl.textContent = `Add ${(VIEW_CONFIG[view] || { label: 'Record' }).label.replace(/s$/, '')}`;

    if (view === 'regions') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Region Name</label><input type="text" id="f_regionName" class="form-control" required placeholder="Andhra Pradesh & Telangana Hub"></div>
      <div class="mb-2"><label class="form-label">Country</label><input type="text" id="f_country" class="form-control" value="India"></div>
      <div class="mb-2"><label class="form-label">State or Province</label><input type="text" id="f_stateOrProvince" class="form-control" placeholder="Andhra Pradesh"></div>
      <div class="mb-2"><label class="form-label">Description</label><textarea id="f_description" class="form-control" rows="2" placeholder="Primary franchise expansion zone..."></textarea></div>
    `;
    } else if (view === 'lists') {
        const regionOptions = cachedData.regions.map(r => `<option value="${r.id}">${r.regionName}</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Parent Region</label><select id="f_regionId" class="form-select" required>${regionOptions || '<option value="">Select Region</option>'}</select></div>
    <div class="mb-2"><label class="form-label">List Name</label><input type="text" id="f_listName" class="form-control" required placeholder="Vizag Franchise Expo 2026"></div>
    <div class="mb-2"><label class="form-label">Description</label><textarea id="f_description" class="form-control" rows="2"></textarea></div>
    `;
    } else if (view === 'leads') {
        const statusOptions = cachedData.leadStatuses.map(s => `<option value="${s.id}">${s.statusName}</option>`).join('');
        const sourceOptions = cachedData.leadSources.map(s => `<option value="${s.id}">${s.sourceName}</option>`).join('');

        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Full Name</label><input type="text" id="f_fullName" class="form-control" required placeholder="Ramesh Kumar"></div>
    <div class="mb-2"><label class="form-label">Company Name</label><input type="text" id="f_companyName" class="form-control" placeholder="Kumar Beverages"></div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Phone</label><input type="text" id="f_phone" class="form-control" required placeholder="+91 9848012345"></div>
        <div class="col-6"><label class="form-label">Email</label><input type="email" id="f_email" class="form-control" placeholder="ramesh@gmail.com"></div>
    </div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Estimated Value (₹)</label><input type="number" id="f_estimatedValue" class="form-control" value="350000"></div>
        <div class="col-6"><label class="form-label">Priority</label><select id="f_priority" class="form-select"><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="URGENT">URGENT</option><option value="LOW">LOW</option></select></div>
    </div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Lead Status</label><select id="f_statusId" class="form-select"><option value="">Select Status</option>${statusOptions}</select></div>
        <div class="col-6"><label class="form-label">Lead Source</label><select id="f_sourceId" class="form-select"><option value="">Select Source</option>${sourceOptions}</select></div>
    </div>
    `;
    } else if (view === 'lead-sources') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Source Name</label><input type="text" id="f_sourceName" class="form-control" required placeholder="Instagram Franchise Ad"></div>
      <div class="mb-2"><label class="form-label">Description</label><input type="text" id="f_description" class="form-control" placeholder="Social media campaign"></div>
    `;
    } else if (view === 'lead-statuses') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Status Name</label><input type="text" id="f_statusName" class="form-control" required placeholder="Agreement Signed"></div>
      <div class="mb-2"><label class="form-label">Display Order</label><input type="number" id="f_displayOrder" class="form-control" value="1"></div>
    `;
    } else if (view === 'customers') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Company Name</label><input type="text" id="f_companyName" class="form-control" required placeholder="Tea Time Central Supply"></div>
      <div class="mb-2"><label class="form-label">Industry</label><input type="text" id="f_industry" class="form-control" value="Beverage & Quick Service"></div>
      <div class="mb-2"><label class="form-label">Website</label><input type="text" id="f_website" class="form-control" placeholder="https://teatimegroup.com"></div>
      <div class="mb-2"><label class="form-label">Phone</label><input type="text" id="f_phone" class="form-control" placeholder="+91 40 23456789"></div>
    `;
    }
    //   else if (view === 'customer-contacts') {
    //     const customerOptions = cachedData.customers.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('');
    //     fieldsEl.innerHTML = `
    //   <div class="mb-2"><label class="form-label">Parent Customer Account</label><select id="f_customerId" class="form-select" required>${customerOptions || '<option value="">Select Customer</option>'}</select></div>
    //   <div class="mb-2"><label class="form-label">Full Name</label><input type="text" id="f_fullName" class="form-control" required placeholder="David Miller"></div>
    //   <div class="mb-2"><label class="form-label">Email</label><input type="email" id="f_email" class="form-control" required placeholder="david@acme.com"></div>
    //   <div class="mb-2"><label class="form-label">Phone</label><input type="text" id="f_phone" class="form-control" placeholder="+1 555-0192"></div>
    //   <div class="mb-2"><label class="form-label">Designation</label><input type="text" id="f_designation" class="form-control" placeholder="VP of Engineering"></div>
    // `;
    //   } 
    else if (view === 'opportunity-stages') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Stage Name</label><input type="text" id="f_stageName" class="form-control" required placeholder="Negotiation & Terms"></div>
      <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Probability (%)</label><input type="number" id="f_probability" class="form-control" value="75"></div>
        <div class="col-6"><label class="form-label">Display Order</label><input type="number" id="f_displayOrder" class="form-control" value="1"></div>
      </div>
    `;
    } else if (view === 'opportunities') {
        const custOptions = cachedData.customers.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('');
        const stageOptions = cachedData.opportunityStages.map(s => `<option value="${s.id}">${s.stageName}</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Customer Account</label><select id="f_customerId" class="form-select" required>${custOptions || '<option value="">Select Customer</option>'}</select></div>
    <div class="mb-2"><label class="form-label">Opportunity Name</label><input type="text" id="f_opportunityName" class="form-control" required placeholder="Master Franchise Kit - Vizag"></div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Deal Stage</label><select id="f_stageId" class="form-select"><option value="">Select Stage</option>${stageOptions}</select></div>
        <div class="col-6"><label class="form-label">Deal Value (₹)</label><input type="number" id="f_dealValue" class="form-control" value="450000"></div>
    </div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Probability (%)</label><input type="number" id="f_probability" class="form-control" value="50"></div>
        <div class="col-6"><label class="form-label">Expected Close Date</label><input type="date" id="f_expectedCloseDate" class="form-control" value="2026-09-15"></div>
    </div>
    `;
    } else if (view === 'quotations') {
        const custOptions = cachedData.customers.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('');
        const oppOptions = cachedData.opportunities.map(o => `<option value="${o.id}">${o.opportunityName}</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Customer Account</label><select id="f_customerId" class="form-select" required>${custOptions || '<option value="">Select Customer</option>'}</select></div>
    <div class="mb-2"><label class="form-label">Related Opportunity</label><select id="f_opportunityId" class="form-select"><option value="">None / Direct</option>${oppOptions}</select></div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Quotation Number</label><input type="text" id="f_quotationNumber" class="form-control" required placeholder="QT-2026-001"></div>
        <div class="col-6"><label class="form-label">Total Amount (₹)</label><input type="number" id="f_totalAmount" class="form-control" value="450000"></div>
    </div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Discount (₹)</label><input type="number" id="f_discount" class="form-control" value="0"></div>
        <div class="col-6"><label class="form-label">GST (₹)</label><input type="number" id="f_gst" class="form-control" value="81000"></div>
    </div>
    <div class="mb-2"><label class="form-label">Valid Until</label><input type="date" id="f_validUntil" class="form-control" value="2026-12-31"></div>
    `;
    } else if (view === 'sales-orders') {
        const custOptions = cachedData.customers.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Customer Account</label><select id="f_customerId" class="form-select" required>${custOptions || '<option value="">Select Customer</option>'}</select></div>
    <div class="mb-2"><label class="form-label">Order Number</label><input type="text" id="f_orderNumber" class="form-control" required placeholder="SO-2026-001"></div>
    <div class="mb-2"><label class="form-label">Total Amount (₹)</label><input type="number" id="f_totalAmount" class="form-control" value="450000"></div>
    `;
    } else if (view === 'invoices') {
        const custOptions = cachedData.customers.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Customer Account</label><select id="f_customerId" class="form-select" required>${custOptions || '<option value="">Select Customer</option>'}</select></div>
    <div class="mb-2"><label class="form-label">Invoice Number</label><input type="text" id="f_invoiceNumber" class="form-control" required placeholder="INV-2026-001"></div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Total Amount (₹)</label><input type="number" id="f_totalAmount" class="form-control" value="450000"></div>
        <div class="col-6"><label class="form-label">Tax Amount (₹)</label><input type="number" id="f_taxAmount" class="form-control" value="81000"></div>
    </div>
    <div class="mb-2"><label class="form-label">Due Date</label><input type="date" id="f_dueDate" class="form-control" value="2026-10-01"></div>
    `;
    } else if (view === 'tasks') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Task Title</label><input type="text" id="f_title" class="form-control" required placeholder="Finalize store layout"></div>
      <div class="mb-2"><label class="form-label">Priority</label><select id="f_priority" class="form-select"><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></div>
      <div class="mb-2"><label class="form-label">Due Date & Time</label><input type="datetime-local" id="f_dueDate" class="form-control"></div>
    `;
    } else if (view === 'follow-ups') {
        const custOptions = cachedData.customers.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Customer Account</label><select id="f_customerId" class="form-select" required>${custOptions || '<option value="">Select Customer</option>'}</select></div>
    <div class="mb-2"><label class="form-label">Reminder Time</label><input type="datetime-local" id="f_reminderTime" class="form-control" required></div>
    <div class="mb-2"><label class="form-label">Reminder Note</label><textarea id="f_note" class="form-control" rows="2" required placeholder="Call investor to finalize shipping..."></textarea></div>
    `;
    } else if (view === 'chat-messages') {
        const custOptions = cachedData.customers.map(c => `<option value="${c.id}">${c.companyName}</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Customer Account</label><select id="f_customerId" class="form-select" required>${custOptions || '<option value="">Select Customer</option>'}</select></div>
    <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Channel</label><select id="f_channel" class="form-select"><option>WHATSAPP</option><option>SMS</option></select></div>
        <div class="col-6"><label class="form-label">Direction</label><select id="f_direction" class="form-select"><option>INBOUND</option><option>OUTBOUND</option></select></div>
    </div>
    <div class="mb-2"><label class="form-label">Message Body</label><textarea id="f_messageBody" class="form-control" rows="2" required placeholder="What is the total investment required?"></textarea></div>
    `;
    } else if (view === 'campaigns') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Campaign Name</label><input type="text" id="f_campaignName" class="form-control" required placeholder="Monsoon Special Tea Drive"></div>
      <div class="mb-2"><label class="form-label">Campaign Type</label><input type="text" id="f_campaignType" class="form-control" value="Digital & Influencer"></div>
      <div class="mb-2"><label class="form-label">Budget (₹)</label><input type="number" id="f_budget" class="form-control" value="150000"></div>
      <div class="row g-2">
        <div class="col-6 mb-2"><label class="form-label">Start Date</label><input type="date" id="f_startDate" class="form-control"></div>
        <div class="col-6 mb-2"><label class="form-label">End Date</label><input type="date" id="f_endDate" class="form-control"></div>
      </div>
    `;
    } else {
        fieldsEl.innerHTML = `<div class="mb-2"><label class="form-label">Name / Title</label><input type="text" id="f_name" class="form-control" required></div>`;
    }
    new bootstrap.Modal(document.getElementById('dynamicModal')).show();
}

async function handleDynamicSubmit(e) {
    e.preventDefault();
    const view = currentView === 'dashboard' ? 'leads' : currentView;
    try {
        let payload = {};
        let endpoint = view;

        if (view === 'regions') {
            payload = { regionName: document.getElementById('f_regionName').value, country: document.getElementById('f_country').value, stateOrProvince: document.getElementById('f_stateOrProvince').value, description: document.getElementById('f_description').value };
        } else if (view === 'lists') {
            payload = {
                regionId: Number(document.getElementById('f_regionId').value),
                listName: document.getElementById('f_listName').value,
                description: document.getElementById('f_description').value
            };
            endpoint = 'lists';
        } else if (view === 'leads') {
            payload = { fullName: document.getElementById('f_fullName').value, companyName: document.getElementById('f_companyName').value, phone: document.getElementById('f_phone').value, email: document.getElementById('f_email').value, estimatedValue: Number(document.getElementById('f_estimatedValue').value || 0) };
        } else if (view === 'lead-sources') {
            payload = { sourceName: document.getElementById('f_sourceName').value, description: document.getElementById('f_description').value }; endpoint = 'lead-sources';
        } else if (view === 'lead-statuses') {
            payload = { statusName: document.getElementById('f_statusName').value, displayOrder: Number(document.getElementById('f_displayOrder').value || 1) }; endpoint = 'lead-statuses';
        } else if (view === 'customers') {
            payload = { companyName: document.getElementById('f_companyName').value, industry: document.getElementById('f_industry').value, website: document.getElementById('f_website').value, phone: document.getElementById('f_phone').value };
        } else if (view === 'customer-contacts') {
            const custId = document.getElementById('f_customerId').value;
            payload = { fullName: document.getElementById('f_fullName').value, email: document.getElementById('f_email').value, phone: document.getElementById('f_phone').value, designation: document.getElementById('f_designation').value };
            endpoint = `customers/${custId}/contacts`;
        } else if (view === 'opportunities') {
            payload = { opportunityName: document.getElementById('f_opportunityName').value, dealValue: Number(document.getElementById('f_dealValue').value || 0), expectedCloseDate: document.getElementById('f_expectedCloseDate').value, customerId: Number(document.getElementById('f_customerId').value || 1) };
        } else if (view === 'opportunity-stages') {
            payload = { stageName: document.getElementById('f_stageName').value, probability: Number(document.getElementById('f_probability').value || 100), displayOrder: Number(document.getElementById('f_displayOrder').value || 1) }; endpoint = 'opportunity-stages';
        } else if (view === 'quotations') {
            payload = { quotationNumber: document.getElementById('f_quotationNumber').value, totalAmount: Number(document.getElementById('f_totalAmount').value || 0), validUntil: document.getElementById('f_validUntil').value, customerId: Number(document.getElementById('f_customerId').value || 1) };
        } else if (view === 'sales-orders') {
            payload = { orderNumber: document.getElementById('f_orderNumber').value, totalAmount: Number(document.getElementById('f_totalAmount').value || 0), customerId: Number(document.getElementById('f_customerId').value || 1) }; endpoint = 'sales-orders';
        } else if (view === 'invoices') {
            payload = { invoiceNumber: document.getElementById('f_invoiceNumber').value, totalAmount: Number(document.getElementById('f_totalAmount').value || 0), taxAmount: Number(document.getElementById('f_taxAmount').value || 0), dueDate: document.getElementById('f_dueDate').value, customerId: Number(document.getElementById('f_customerId').value || 1) };
        } else if (view === 'tasks') {
            payload = { title: document.getElementById('f_title').value, priority: document.getElementById('f_priority').value, dueDate: document.getElementById('f_dueDate').value || null };
        } else if (view === 'follow-ups') {
            payload = { reminderTime: document.getElementById('f_reminderTime').value, note: document.getElementById('f_note').value, customerId: Number(document.getElementById('f_customerId').value || 1) }; endpoint = 'follow-ups';
        } else if (view === 'chat-messages') {
            payload = { channel: document.getElementById('f_channel').value, direction: document.getElementById('f_direction').value, messageBody: document.getElementById('f_messageBody').value, customerId: Number(document.getElementById('f_customerId').value || 1) }; endpoint = 'chat-messages';
        } else if (view === 'campaigns') {
            payload = { campaignName: document.getElementById('f_campaignName').value, campaignType: document.getElementById('f_campaignType').value, budget: Number(document.getElementById('f_budget').value || 0), startDate: document.getElementById('f_startDate').value || null, endDate: document.getElementById('f_endDate').value || null };
        }

        await api.post(`/${endpoint}`, payload);
        const modalEl = document.getElementById('dynamicModal');
        const modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (modalInstance) modalInstance.hide();

        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        await fetchAllData();
        switchView(currentView);
    } catch (err) {
        console.error('Submission failed:', err.response?.data || err.message);
        alert('Could not save record: ' + (err.response?.data?.error || err.message));
    }
}

async function deleteRecord(endpoint, id) {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
        await api.delete(`/${endpoint}/${id}`);
        switchView(currentView);
    } catch (err) {
        console.error('Delete failed:', err);
        alert('Could not delete record.');
    }
}

function handleGlobalSearch(q) {
    if (!q) return;
    const match = cachedData.leads.find(l => l.fullName?.toLowerCase().includes(q.toLowerCase()))
        || cachedData.customers.find(c => c.companyName?.toLowerCase().includes(q.toLowerCase()))
        || cachedData.tasks.find(t => t.title?.toLowerCase().includes(q.toLowerCase()));
    if (match) openDrawer(match);
}

function openProfileSheet() {
    const p = document.getElementById('profileSheet');
    p.classList.toggle('open');
}



async function handleDrawerFormSubmit(event, recordId) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const payload = {};

    // Ignore system/read-only keys that shouldn't be manually overwritten from the form
    const skipKeys = ['id', 'createdAt', 'updatedAt', 'tenantId'];

    formData.forEach((value, key) => {
        if (!skipKeys.includes(key)) {
            // If it's an ISO date string from a date picker, convert it to MySQL format (YYYY-MM-DD HH:MM:SS) if needed
            if (value && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
                payload[key] = value.replace('T', ' ').substring(0, 19);
            } else {
                payload[key] = value === '' ? null : value;
            }
        }
    });

    try {
        await api.put(`/${currentView}/${recordId}`, payload);

        alert('Changes saved successfully!');
        closeAllSheets();

        if (typeof fetchAllData === 'function') await fetchAllData();
        if (typeof switchView === 'function') switchView(currentView);
    } catch (err) {
        console.error('Failed to save record:', err);
        alert('Could not save changes. Please check your server connection.');
    }
}

async function handleDrawerDelete(recordId) {
    // Confirm deletion to prevent accidental clicks
    if (!confirm('Are you sure you want to delete this record? This action cannot be undone.')) {
        return;
    }

    try {
        // Sends a DELETE request to the backend using the current active view and record ID
        await api.delete(`/${currentView}/${recordId}`);

        alert('Record deleted successfully.');
        closeAllSheets();

        // Refresh application state and view data
        if (typeof fetchAllData === 'function') await fetchAllData();
        if (typeof switchView === 'function') switchView(currentView);

    } catch (err) {
        console.error('Failed to delete record:', err);
        alert('Could not delete record. Please check server connection.');
    }
}

function navigateToDetail(entityType, id) {
    const targetUrl = getDetailUrl(entityType, id);
    window.location.href = targetUrl;
}

initDashboard();
