
let token = localStorage.getItem('token');
if (!token) window.location.href = './index.html';

let api = axios.create({ baseURL: '/api/hospital', headers: { Authorization: `Bearer ${token}` } });
let currentUser = { name: 'Hospital Administrator', role: 'HOSPITAL_ADMIN' };
let activeRole = 'HOSPITAL_ADMIN';
let currentView = 'dashboard';
let cachedData = { patients: [], appointments: [], doctors: [], pharmacy: [], lab: [], rooms: [], invoices: [], liveOpd: { activeOPD: 0 } };

const VIEW_CONFIG = {
    patients: { label: 'Patient Registry', dataKey: 'patients', api: 'patients', primary: 'fullName', subtitle: i => [i.gender, i.age ? i.age + ' yrs' : ''].filter(Boolean).join(', '), badge: { f: 'bloodGroup', prefix: 'Blood: ' }, meta: [{ f: 'phone', icon: 'bi-telephone' }, { f: 'abhaId', icon: 'bi-shield-check', label: 'ABHA' }] },
    appointments: { label: 'OPD Queue & Tokens', dataKey: 'appointments', api: 'appointments', primary: 'patientName', subtitle: i => (i.doctorName || '').startsWith('Dr.') ? i.doctorName : 'Dr. ' + (i.doctorName || 'Unassigned'), badge: { f: 'status' }, meta: [{ f: 'appointmentDate', icon: 'bi-clock' }, { f: 'symptoms', icon: 'bi-card-text' }] },
    departments: { label: 'Hospital Departments', dataKey: 'departments', api: 'departments', primary: 'departmentName', subtitle: i => i.description || 'Hospital Department Unit', badge: { f: 'id', prefix: 'ID: ' }, meta: [{ f: 'createdAt', icon: 'bi-calendar', label: 'Created' }] },
    doctors: { label: 'Doctors Directory', dataKey: 'doctors', api: 'doctors', primary: 'fullName', subtitle: i => i.specialization, badge: { f: 'consultationFee', prefix: '₹' }, meta: [{ f: 'phone', icon: 'bi-telephone' }, { f: 'email', icon: 'bi-envelope' }] },
    pharmacy: { label: 'Pharmacy Inventory', dataKey: 'pharmacy', api: 'pharmacy/medicines', primary: 'brandName', subtitle: i => i.genericName, badge: { f: 'stockQuantity', prefix: 'Stock: ' }, meta: [{ f: 'unitPrice', icon: 'bi-currency-rupee', label: 'Price' }, { f: 'expiryDate', icon: 'bi-calendar-x', label: 'Exp' }] },
    lab: { label: 'Laboratory Tests', dataKey: 'lab', api: 'lab/tests', primary: 'testName', subtitle: i => i.category, badge: { f: 'price', prefix: '₹' }, meta: [{ f: 'createdAt', icon: 'bi-calendar' }] },
    rooms: { label: 'Wards & Beds', dataKey: 'rooms', api: 'rooms', primary: 'roomNumber', subtitle: i => i.roomType, badge: { f: 'dailyRate', prefix: '₹/day' }, meta: [{ f: 'isOccupied', icon: 'bi-door-closed', label: 'Occupied' }] },
    invoices: { label: 'Billing & Finance', dataKey: 'invoices', api: 'invoices', primary: 'invoiceNumber', subtitle: i => i.patientName, badge: { f: 'totalAmount', prefix: '₹' }, meta: [{ f: 'paymentStatus', icon: 'bi-flag' }] }
};

async function initDashboard() {
    try {
        const res = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        currentUser = res.data;
        activeRole = currentUser.role || 'ADMIN';
    } catch (e) { console.warn('Auth fallback active'); }
    document.getElementById('userAvatar').textContent = (currentUser.name || 'H A').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    document.getElementById('profileSheetName').textContent = currentUser.name || 'Hospital Administrator';

    await fetchAllData();
    switchView('dashboard');
}

function handleSignOut() {
    localStorage.removeItem('token');
    window.location.href = './index.html';
}

// Ensure Most Recent Records (Highest ID) appear at the top for all data tables
async function fetchAllData() {
    try {
        const results = await Promise.allSettled([
            api.get('/patients').catch(() => ({ data: [] })),
            api.get('/appointments').catch(() => ({ data: [] })),
            api.get('/departments').catch(() => ({ data: [] })),
            api.get('/doctors').catch(() => ({ data: [] })),
            api.get('/pharmacy/medicines').catch(() => ({ data: [] })),
            api.get('/lab/tests').catch(() => ({ data: [] })),
            api.get('/rooms').catch(() => ({ data: [] })),
            api.get('/invoices').catch(() => ({ data: [] })),
            api.get('/dashboard/live-opd').catch(() => ({ data: { activeOPD: 0 } }))
        ]);
        const sortNewestFirst = (arr) => Array.isArray(arr) ? [...arr].sort((a, b) => (b.id || 0) - (a.id || 0)) : [];
        const getData = (i, fb = []) => results[i].status === 'fulfilled' && results[i].value ? sortNewestFirst(results[i].value.data) : fb;

        cachedData.patients = getData(0,[]);
        cachedData.appointments = getData(1, []);
        cachedData.departments = getData(2, []);
        cachedData.doctors = getData(3,[]);
        cachedData.pharmacy = getData(4,[]);
        cachedData.lab = getData(5,[]);
        cachedData.rooms = getData(6,[]);
        cachedData.invoices = getData(7,[]);
        cachedData.liveOpd = getData(8, { activeOPD: 0 });
    } catch (err) { console.error('Fetch error', err); }
}

async function switchView(viewName, element) {
    currentView = viewName;
    closeAllSheets();
    document.querySelectorAll('.desktop-sidebar .sidebar-link, .bottom-nav .nav-item').forEach(el => el.classList.remove('active'));
    const activeEls = document.querySelectorAll(`[data-view="${viewName}"]`);
    activeEls.forEach(el => el.classList.add('active'));

    const container = document.getElementById('mainContainer');
    container.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner-border" style="color:var(--med-primary)"></div><p class="mt-2 small">Loading...</p></div>`;
    await fetchAllData();

    if (viewName === 'dashboard') renderDashboard(container);
    else renderCardListView(container, viewName);
}

function renderDashboard(container) {
    const qa = [
        { icon: 'bi-heart-pulse-fill', label: 'OPD Token', action: 'openOpdQuickModal()' },
        { icon: 'bi-hospital', label: 'IPD Admission', action: 'openAdmissionQuickModal()' },
        { icon: 'bi-receipt', label: 'Billing & Invoice', action: 'openInvoiceQuickModal()' }
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
        <div class="kpi-card"><div class="kpi-icon" style="background:#CCFBF1; color:var(--med-primary)"><i class="bi bi-people-fill"></i></div><div class="kpi-label">Registered Patients</div><div class="kpi-value">${cachedData.patients.length}</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#FEF3C7; color:#D97706"><i class="bi bi-activity"></i></div><div class="kpi-label">Active OPD Visits</div><div class="kpi-value">${cachedData.liveOpd.activeOPD || 0}</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#D1FAE5; color:var(--success)"><i class="bi bi-person-badge"></i></div><div class="kpi-label">Doctors</div><div class="kpi-value">${cachedData.doctors.length}</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="background:#FEE2E2; color:var(--danger)"><i class="bi bi-receipt"></i></div><div class="kpi-label">Invoices Issued</div><div class="kpi-value">${cachedData.invoices.length}</div></div>
    </div>

    <div class="section-title"><h2>Live OPD Queue & Appointments</h2></div>
    <div id="dashQueue"></div>
    `;
    const queueWrap = document.getElementById('dashQueue');
    const recentAppts = cachedData.appointments.slice(0, 10);
    queueWrap.innerHTML = recentAppts.length ? recentAppts.map(item => renderCard(item, VIEW_CONFIG.appointments, 'appointments')).join('')
        : `<div class="empty-state"><i class="bi bi-calendar-x"></i>No active appointments in queue.</div>`;
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
        : `<div class="empty-state"><i class="bi bi-inbox"></i>No records found.<br><span style="font-size:0.75rem">Click 'Add New' to register records.</span></div>`;
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

/* Open Record 360° Drawer with Full Clinical Workflow Actions & Entity Header */
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
    // const ignoreKeys = ['id', 'tenantId', 'userId', 'patientId', 'doctorId', 'wardId', 'roomId', 'bedId', 'status', 'password', 'passwordHash', 'token', 'deletedAt', 'isDeleted', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'];

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

/* Handler to update OPD Appointment Status via API and sync views */
async function handleOpdStatusUpdate(appointmentId) {
    const newStatus = document.getElementById('opdStatusDropdown').value;
    try {
        if (newStatus === 'CHECKED_IN') {
            await api.post('/appointments/checkin', { appointmentId });
        } else if (newStatus === 'IN_CONSULTATION') {
            await api.post('/consultation/start', { appointmentId });
        } else {
            await api.post('/appointments/update-status', { appointmentId, status: newStatus })
                .catch(async () => {
                    // Fallback update
                    await api.put(`/appointments/${appointmentId}`, { status: newStatus }).catch(() => { });
                });
        }

        // Refresh local cache and UI
        closeAllSheets();
        await fetchAllData();
        switchView(currentView);
    } catch (err) {
        console.error('Status update failed:', err);
        alert('Could not update status. Please try again.');
    }
}

function openDynamicAddModal() {
    const view = currentView === 'dashboard' ? 'patients' : currentView;
    const titleEl = document.getElementById('dynamicModalTitle');
    const fieldsEl = document.getElementById('dynamicFormFields');
    titleEl.textContent = `Register ${(VIEW_CONFIG[view] || { label: 'Record' }).label.replace(/s$/, '')}`;

    if (view === 'patients') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Full Name</label><input type="text" id="f_fullName" class="form-control" required placeholder="Venkat Reddy"></div>
      <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Gender</label><select id="f_gender" class="form-select"><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
        <div class="col-6"><label class="form-label">Age</label><input type="number" id="f_age" class="form-control" value="32"></div>
      </div>
      <div class="mb-2"><label class="form-label">Phone</label><input type="text" id="f_phone" class="form-control" required placeholder="+91 9876543210"></div>
      <div class="mb-2"><label class="form-label">ABHA ID (ABDM)</label><input type="text" id="f_abhaId" class="form-control" placeholder="91-9876-5432-1098"></div>
      <div class="mb-2"><label class="form-label">Blood Group</label><select id="f_bloodGroup" class="form-select"><option value="O+">O+</option><option value="A+">A+</option><option value="B+">B+</option><option value="AB+">AB+</option><option value="O-">O-</option><option value="A-">A-</option><option value="B-">B-</option><option value="AB-">AB-</option></select></div>
    `;
    } else if (view === 'appointments') {
        const patOpts = cachedData.patients.map(p => `<option value="${p.id}">${p.fullName}</option>`).join('');
        const docOpts = cachedData.doctors.map(d => `<option value="${d.id}">${(d.fullName || '').startsWith('Dr.') ? d.fullName : 'Dr. ' + d.fullName} (${d.specialization || 'General'})</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Patient</label><select id="f_patientId" class="form-select" required>${patOpts}</select></div>
    <div class="mb-2"><label class="form-label">Doctor</label><select id="f_doctorId" class="form-select" required>${docOpts}</select></div>
    <div class="mb-2"><label class="form-label">Appointment Date & Time</label><input type="datetime-local" id="f_appointmentDate" class="form-control" required></div>
    <div class="mb-2"><label class="form-label">Initial Status</label><select id="f_status" class="form-select"><option value="SCHEDULED">SCHEDULED</option><option value="CHECKED_IN">CHECKED_IN</option><option value="IN_CONSULTATION">IN_CONSULTATION</option><option value="COMPLETED">COMPLETED</option></select></div>
    <div class="mb-2"><label class="form-label">Symptoms / Complaint</label><textarea id="f_symptoms" class="form-control" rows="2" placeholder="Fever, cough, fatigue..."></textarea></div>
    `;
    } else if (view === 'departments') {
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Department Name</label><input type="text" id="f_departmentName" class="form-control" placeholder="Cardiology, Orthopedics..." required></div>
    <div class="mb-2"><label class="form-label">Description</label><textarea id="f_description" class="form-control" rows="3" placeholder="Department overview and details..."></textarea></div>
    `;
    } else if (view === 'doctors') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Doctor Full Name</label><input type="text" id="f_fullName" class="form-control" required placeholder="Dr. Ananya Rao"></div>
      <div class="mb-2"><label class="form-label">Specialization</label><input type="text" id="f_specialization" class="form-control" required placeholder="Cardiology"></div>
      <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Phone</label><input type="text" id="f_phone" class="form-control" required placeholder="+91 9876543210"></div>
        <div class="col-6"><label class="form-label">Consultation Fee (₹)</label><input type="number" id="f_consultationFee" class="form-control" value="500"></div>
      </div>
      <div class="mb-2"><label class="form-label">Email</label><input type="email" id="f_email" class="form-control" placeholder="doctor@medicare.com"></div>
    `;
    } else if (view === 'pharmacy') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Brand Name</label><input type="text" id="f_brandName" class="form-control" required placeholder="Dolo 650"></div>
      <div class="mb-2"><label class="form-label">Generic Name</label><input type="text" id="f_genericName" class="form-control" required placeholder="Paracetamol"></div>
      <div class="row g-2 mb-2">
        <div class="col-6"><label class="form-label">Stock Quantity</label><input type="number" id="f_stockQuantity" class="form-control" value="100"></div>
        <div class="col-6"><label class="form-label">Unit Price (₹)</label><input type="number" id="f_unitPrice" class="form-control" value="25"></div>
      </div>
      <div class="mb-2"><label class="form-label">Expiry Date</label><input type="date" id="f_expiryDate" class="form-control" required></div>
    `;
    } else if (view === 'lab') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Test Name</label><input type="text" id="f_testName" class="form-control" required placeholder="Complete Blood Picture (CBC)"></div>
      <div class="mb-2"><label class="form-label">Category</label><input type="text" id="f_category" class="form-control" required placeholder="Pathology"></div>
      <div class="mb-2"><label class="form-label">Price (₹)</label><input type="number" id="f_price" class="form-control" value="450"></div>
    `;
    } else if (view === 'rooms') {
        fieldsEl.innerHTML = `
      <div class="mb-2"><label class="form-label">Room Number</label><input type="text" id="f_roomNumber" class="form-control" required placeholder="G-103"></div>
      <div class="mb-2"><label class="form-label">Room Type</label><select id="f_roomType" class="form-select"><option value="GENERAL">GENERAL</option><option value="SEMI-PRIVATE">SEMI-PRIVATE</option><option value="PRIVATE">PRIVATE</option><option value="ICU">ICU</option></select></div>
      <div class="mb-2"><label class="form-label">Daily Rate (₹)</label><input type="number" id="f_dailyRate" class="form-control" value="1500"></div>
    `;
    } else if (view === 'invoices') {
        const patOpts = cachedData.patients.map(p => `<option value="${p.id}">${p.fullName}</option>`).join('');
        fieldsEl.innerHTML = `
    <div class="mb-2"><label class="form-label">Patient</label><select id="f_patientId" class="form-select" required>${patOpts}</select></div>
    <div class="mb-2"><label class="form-label">Invoice Number</label><input type="text" id="f_invoiceNumber" class="form-control" required value="HINV-2026-${Math.floor(100 + Math.random() * 900)}"></div>
    <div class="mb-2"><label class="form-label">SubTotal (₹)</label><input type="number" id="f_subTotal" class="form-control" value="1500"></div>
    <div class="mb-2"><label class="form-label">Tax Amount (₹)</label><input type="number" id="f_taxAmount" class="form-control" value="270"></div>
    <div class="mb-2"><label class="form-label">Payment Status</label><select id="f_paymentStatus" class="form-select"><option value="PENDING">PENDING</option><option value="PARTIAL">PARTIAL</option><option value="PAID">PAID</option></select></div>
    `;
    } else {
        fieldsEl.innerHTML = `<div class="mb-2"><label class="form-label">Record Name</label><input type="text" id="f_name" class="form-control" required></div>`;
    }
    new bootstrap.Modal(document.getElementById('dynamicModal')).show();
}

async function handleDynamicSubmit(e) {
    e.preventDefault();
    const view = currentView === 'dashboard' ? 'patients' : currentView;
    try {
        let endpoint = view;
        let payload = {};

        if (view === 'patients') {
            endpoint = 'patients/register';
            payload = {
                fullName: document.getElementById('f_fullName').value,
                gender: document.getElementById('f_gender').value,
                age: Number(document.getElementById('f_age').value || 0),
                phone: document.getElementById('f_phone').value,
                abhaId: document.getElementById('f_abhaId').value,
                bloodGroup: document.getElementById('f_bloodGroup').value
            };
        } else if (view === 'appointments') {
            endpoint = 'appointments/book';
            payload = {
                patientId: Number(document.getElementById('f_patientId').value),
                doctorId: Number(document.getElementById('f_doctorId').value),
                appointmentDate: document.getElementById('f_appointmentDate').value,
                status: document.getElementById('f_status') ? document.getElementById('f_status').value : 'SCHEDULED',
                symptoms: document.getElementById('f_symptoms').value
            };
        } else if (view === 'departments') {
            endpoint = 'departments';
            payload = {
                departmentName: document.getElementById('f_departmentName').value,
                description: document.getElementById('f_description').value
            };
        } else if (view === 'doctors') {
            endpoint = 'doctors';
            payload = {
                fullName: document.getElementById('f_fullName').value,
                specialization: document.getElementById('f_specialization').value,
                phone: document.getElementById('f_phone').value,
                consultationFee: Number(document.getElementById('f_consultationFee').value || 500),
                email: document.getElementById('f_email').value
            };
        } else if (view === 'pharmacy') {
            endpoint = 'pharmacy/medicines';
            payload = {
                brandName: document.getElementById('f_brandName').value,
                genericName: document.getElementById('f_genericName').value,
                stockQuantity: Number(document.getElementById('f_stockQuantity').value || 0),
                unitPrice: Number(document.getElementById('f_unitPrice').value || 0),
                expiryDate: document.getElementById('f_expiryDate').value
            };
        } else if (view === 'rooms') {
            payload = {
                roomNumber: document.getElementById('f_roomNumber').value,
                roomType: document.getElementById('f_roomType').value,
                dailyRate: Number(document.getElementById('f_dailyRate').value || 1500)
            };
        } else if (view === 'invoices') {
            endpoint = 'billing/generate-invoice';
            payload = {
                patientId: Number(document.getElementById('f_patientId').value),
                invoiceNumber: document.getElementById('f_invoiceNumber').value,
                subTotal: Number(document.getElementById('f_subTotal').value || 0),
                taxAmount: Number(document.getElementById('f_taxAmount').value || 0),
                paymentStatus: document.getElementById('f_paymentStatus') ? document.getElementById('f_paymentStatus').value : 'PENDING'
            };
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
        console.error('Submission failed:', err);
        alert('Could not save record.');
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
    const match = cachedData.patients.find(p => p.fullName?.toLowerCase().includes(q.toLowerCase()))
        || cachedData.appointments.find(a => a.patientName?.toLowerCase().includes(q.toLowerCase()))
        || cachedData.invoices.find(i => i.invoiceNumber?.toLowerCase().includes(q.toLowerCase()));
    if (match) openDrawer(match);
}

/* Execute Specific Backend Workflow Endpoints */
// Updated executeWorkflow to open the modal instead of browser prompts
async function executeWorkflow(action, appointmentId) {
    try {
        if (action === 'checkin') {
            const res = await api.post('/appointments/checkin', { appointmentId });
            alert(res.data.message || 'Patient checked in successfully!');
            closeAllSheets();
            await fetchAllData();
            switchView(currentView);
        } else if (action === 'startConsultation') {
            // Find current appointment data from cache to pre-fill patient and doctor IDs
            const appt = (cachedData.appointments || []).find(a => a.id === appointmentId) || {};

            document.getElementById('emr_appointmentId').value = appointmentId;
            document.getElementById('emr_patientId').value = appt.patientId || 1;
            document.getElementById('emr_doctorId').value = appt.doctorId || 1;

            // Close the side drawer first
            closeAllSheets();

            // Show the Bootstrap EMR modal
            const emrModal = new bootstrap.Modal(document.getElementById('emrPrescriptionModal'));
            emrModal.show();
        }
    } catch (err) {
        console.error('Workflow execution failed:', err);
        alert('Action failed. Please check server connection.');
    }
}

// Helper to add dynamic medicine rows inside the modal
function addMedicineRow() {
    const container = document.getElementById('medicineRowsContainer');
    const row = document.createElement('div');
    row.className = 'row g-1 align-items-center med-row';
    row.innerHTML = `
    <div class="col-4"><input type="text" class="form-control form-control-sm med-name" placeholder="Medicine Name" required></div>
    <div class="col-2"><input type="text" class="form-control form-control-sm med-dosage" placeholder="1-0-1" required></div>
    <div class="col-2"><input type="text" class="form-control form-control-sm med-freq" placeholder="After Food" required></div>
    <div class="col-3"><input type="number" class="form-control form-control-sm med-duration" placeholder="Days (5)" required></div>
    <div class="col-1 text-center"><button type="button" class="btn btn-sm btn-outline-danger px-1" onclick="this.closest('.med-row').remove()"><i class="bi bi-trash"></i></button></div>
    `;
    container.appendChild(row);
}

// Handle submission of Vitals + Consultation Start + Prescription Items in one go
async function handleEmrSubmit(event) {
    event.preventDefault();
    const appointmentId = document.getElementById('emr_appointmentId').value;
    const patientId = document.getElementById('emr_patientId').value;
    const doctorId = document.getElementById('emr_doctorId').value;

    const vitals = {
        temperature: document.getElementById('v_temp').value,
        pulseRate: document.getElementById('v_pulse').value,
        bpSystolic: parseInt(document.getElementById('v_bpSys').value) || 120,
        bpDiastolic: parseInt(document.getElementById('v_bpDia').value) || 80,
        weightKg: parseFloat(document.getElementById('v_weight').value) || 70
    };

    const diagnosis = document.getElementById('emr_diagnosis').value;
    const notes = document.getElementById('emr_notes').value;

    // Collect all added medicine rows
    const items = [];
    document.querySelectorAll('.med-row').forEach(row => {
        items.push({
            medicineName: row.querySelector('.med-name').value,
            dosage: row.querySelector('.med-dosage').value,
            frequency: row.querySelector('.med-freq').value,
            durationDays: parseInt(row.querySelector('.med-duration').value) || 5,
            instructions: 'Take as directed'
        });
    });

    try {
        // 1. Start Consultation & Record Vitals
        await api.post('/consultation/start', { appointmentId, vitals });

        // 2. Submit Prescription and Items
        const res = await api.post('/consultation/prescribe', {
            patientId: parseInt(patientId),
            doctorId: parseInt(doctorId),
            appointmentId: parseInt(appointmentId),
            diagnosis,
            notes,
            items
        });

        alert(res.data.message || 'EMR saved and prescription successfully issued!');

        // Close modal and refresh view
        bootstrap.Modal.getInstance(document.getElementById('emrPrescriptionModal')).hide();
        await fetchAllData();
        switchView(currentView);
    } catch (err) {
        console.error('Failed to submit EMR & Prescription:', err);
        alert('Could not save prescription. Please check fields.');
    }
}
/* Quick E-Prescription Prompt */
async function openPrescriptionPrompt(patientId, doctorId, appointmentId) {
    try {
        // 1. Set hidden identifiers in the prescription/EMR modal
        document.getElementById('emr_appointmentId').value = appointmentId || '';
        document.getElementById('emr_patientId').value = patientId || 1;
        document.getElementById('emr_doctorId').value = doctorId || 1;

        // 2. Pre-fill sensible default diagnosis or clear fields if desired
        document.getElementById('emr_diagnosis').value = 'Acute Viral Upper Respiratory Infection';
        document.getElementById('emr_notes').value = 'Take medicines after food. Stay hydrated.';

        // 3. Close the side drawer first
        closeAllSheets();

        // 4. Open the robust Bootstrap EMR Prescription Modal
        const emrModalElement = document.getElementById('emrPrescriptionModal');
        if (emrModalElement) {
            const emrModal = new bootstrap.Modal(emrModalElement);
            emrModal.show();
        } else {
            console.error('EMR Prescription Modal element not found in DOM.');
            alert('Prescription modal template is missing from the page layout.');
        }
    } catch (err) {
        console.error('Failed to open prescription prompt modal:', err);
        alert('Could not open the prescription interface.');
    }
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



initDashboard();
