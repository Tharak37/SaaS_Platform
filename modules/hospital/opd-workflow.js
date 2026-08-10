let isCreatingNewPatient = false;
let activeAppointmentsList = [];
let fullAppointmentsCache = []; // Cache for local filtering

// Toggle Mode: Walk-in vs Existing Appointment
function toggleConsultationMode(mode) {
    const apptSection = document.getElementById('appointmentSection');
    const patientSection = document.getElementById('patientSelectionSection');

    if (mode === 'appointment') {
        apptSection.classList.remove('d-none');
        patientSection.classList.add('d-none');
        loadActiveAppointments();
    } else {
        apptSection.classList.add('d-none');
        patientSection.classList.remove('d-none');
    }
}

// Toggle between selecting existing patient or typing new patient details
function toggleNewPatientMode() {
    isCreatingNewPatient = !isCreatingNewPatient;
    const existingBox = document.getElementById('existingPatientBox');
    const newBox = document.getElementById('newPatientBox');
    const btn = document.getElementById('togglePatientModeBtn');

    if (isCreatingNewPatient) {
        existingBox.classList.add('d-none');
        newBox.classList.remove('d-none');
        btn.innerHTML = `<i class="bi bi-search me-1"></i> Select existing patient`;
    } else {
        existingBox.classList.remove('d-none');
        newBox.classList.add('d-none');
        btn.innerHTML = `<i class="bi bi-person-plus me-1"></i> Patient not found? Add New`;
    }
}

// Open modal and load initial dropdown data sorted newest first
async function openOpdQuickModal() {
    try {
        isCreatingNewPatient = false;
        document.getElementById('opdQuickForm').reset();
        document.getElementById('existingPatientBox').classList.remove('d-none');
        document.getElementById('newPatientBox').classList.add('d-none');
        document.getElementById('appointmentSection').classList.add('d-none');
        document.getElementById('patientSelectionSection').classList.remove('d-none');
        document.getElementById('modeWalkIn').checked = true;

        const [patRes, docRes] = await Promise.all([
            api.get('/patients').catch(() => ({ data: [] })),
            api.get('/doctors').catch(() => ({ data: [] }))
        ]);

        let patients = patRes.data || patRes;
        let doctors = docRes.data || docRes;

        // Sort descending by ID or creation date so latest added appears first
        if (Array.isArray(patients)) {
            patients.sort((a, b) => (b.id || 0) - (a.id || 0));
        }
        if (Array.isArray(doctors)) {
            doctors.sort((a, b) => (b.id || 0) - (a.id || 0));
        }

        // Store globally or bind search if needed for patients search input
        window._allPatientsCache = Array.isArray(patients) ? patients : [];

        // Populate Patient Dropdown
        renderPatientDropdown(window._allPatientsCache);

        // Populate Doctor Dropdown
        const docSelect = document.getElementById('opdDoctorSelect');
        docSelect.innerHTML = (Array.isArray(doctors) ? doctors : []).map(d => {
            const docName = (d.fullName || '').startsWith('Dr.') ? d.fullName : 'Dr. ' + d.fullName;
            return `<option value="${d.id}">${docName} — ${d.specialization || 'General'}</option>`;
        }).join('');

        const modalEl = new bootstrap.Modal(document.getElementById('opdQuickActionModal'));
        modalEl.show();
    } catch (err) {
        console.error('Failed to initialize OPD modal:', err);
        alert('Error loading clinic directories.');
    }
}

// Render patient options helper
function renderPatientDropdown(patientsList) {
    const patSelect = document.getElementById('opdPatientSelect');
    patSelect.innerHTML = patientsList.map(p => `
        <option value="${p.id}">${p.fullName} ${p.phone ? '(' + p.phone + ')' : ''}</option>
    `).join('');
}

// Filter patients dynamically as user types
function filterPatientDropdown(query) {
    const q = query.toLowerCase().trim();
    const filtered = (window._allPatientsCache || []).filter(p =>
        (p.fullName && p.fullName.toLowerCase().includes(q)) ||
        (p.phone && p.phone.toLowerCase().includes(q)) ||
        (p.abhaId && p.abhaId.toLowerCase().includes(q))
    );
    renderPatientDropdown(filtered);
}

// Load active appointments sorted latest first
async function loadActiveAppointments() {
    try {
        const res = await api.get('/appointments').catch(() => ({ data: [] }));
        let list = res.data || res;

        if (Array.isArray(list)) {
            // Sort latest appointment / token first
            list.sort((a, b) => (b.id || 0) - (a.id || 0));
        }

        fullAppointmentsCache = Array.isArray(list) ? list : [];
        renderAppointmentsDropdown(fullAppointmentsCache);
    } catch (err) {
        console.error('Failed to load appointments:', err);
    }
}

// Render appointments select options
function renderAppointmentsDropdown(list) {
    const apptSelect = document.getElementById('opdAppointmentSelect');
    apptSelect.innerHTML = `<option value="" disabled selected>Select or search appointment...</option>` +
        list.map(a => `
            <option value="${a.id}">Token #${a.id} — ${a.patientName || 'Patient'} (Dr. ${a.doctorName || 'Assigned'})</option>
        `).join('');
}

// Filter active appointments dynamically
function filterAppointmentDropdown(query) {
    const q = query.toLowerCase().trim();
    const filtered = fullAppointmentsCache.filter(a =>
        (a.patientName && a.patientName.toLowerCase().includes(q)) ||
        (a.id && a.id.toString().includes(q)) ||
        (a.doctorName && a.doctorName.toLowerCase().includes(q))
    );
    renderAppointmentsDropdown(filtered);
}

// Auto-fill doctor when an appointment is selected
function onAppointmentSelected(appointmentId) {
    const selectedAppt = fullAppointmentsCache.find(a => a.id == appointmentId);
    if (selectedAppt && selectedAppt.doctorId) {
        const docSelect = document.getElementById('opdDoctorSelect');
        docSelect.value = selectedAppt.doctorId;
    }
}

// Handle Form Submission
async function handleOpdQuickSubmit(event) {
    event.preventDefault();

    try {
        let patientId = null;
        const isAppointmentMode = document.getElementById('modeExisting').checked;
        const appointmentId = document.getElementById('opdAppointmentSelect').value;
        const doctorId = Number(document.getElementById('opdDoctorSelect').value);

        if (isAppointmentMode && appointmentId) {
            const appt = fullAppointmentsCache.find(a => a.id == appointmentId);
            patientId = appt ? appt.patientId : null;
        } else {
            if (isCreatingNewPatient) {
                const name = document.getElementById('newPatientName').value.trim();
                if (!name) {
                    alert('Please enter the new patient full name.');
                    return;
                }
                const newPatientPayload = {
                    fullName: name,
                    phone: document.getElementById('newPatientPhone').value.trim(),
                    gender: document.getElementById('newPatientGender').value
                };
                const patRes = await api.post('/patients', newPatientPayload);
                patientId = patRes.id || patRes.data?.id;
            } else {
                patientId = Number(document.getElementById('opdPatientSelect').value);
            }

            const newApptPayload = {
                patientId: patientId,
                doctorId: doctorId,
                appointmentDate: new Date().toISOString(),
                status: document.getElementById('opdStatus').value,
                symptoms: document.getElementById('opdSymptoms').value
            };
            await api.post('/appointments', newApptPayload);
        }

        const clinicalPayload = {
            doctorId: doctorId,
            vitals: {
                bp: document.getElementById('opdBp').value,
                pulse: document.getElementById('opdPulse').value,
                temperature: document.getElementById('opdTemp').value,
                weight: document.getElementById('opdWeight').value
            },
            symptoms: document.getElementById('opdSymptoms').value,
            diagnosis: document.getElementById('opdDiagnosis').value,
            prescription: document.getElementById('opdPrescription').value,
            status: document.getElementById('opdStatus').value
        };

        if (isAppointmentMode && appointmentId) {
            await api.put(`/appointments/${appointmentId}`, clinicalPayload);
        }

        alert('Consultation, Vitals, and Prescription saved successfully!');

        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('opdQuickActionModal'));
        modalInstance.hide();
        document.getElementById('opdQuickForm').reset();

        if (typeof loadOpdQueueView === 'function') {
            loadOpdQueueView();
        }
    } catch (err) {
        console.error('Error saving OPD consultation:', err);
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        alert('Failed to save consultation: ' + errorMsg);
    }
}