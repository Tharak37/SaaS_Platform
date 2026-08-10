let isCreatingNewAdmissionPatient = false;
let fullRoomsCache = [];

// Toggle between selecting existing patient or registering new patient for admission
function toggleAdmissionNewPatientMode() {
    isCreatingNewAdmissionPatient = !isCreatingNewAdmissionPatient;
    const existingBox = document.getElementById('admissionExistingPatientBox');
    const newBox = document.getElementById('admissionNewPatientBox');
    const btn = document.getElementById('toggleAdmissionPatientBtn');

    if (isCreatingNewAdmissionPatient) {
        existingBox.classList.add('d-none');
        newBox.classList.remove('d-none');
        btn.innerHTML = `<i class="bi bi-search me-1"></i> Select existing patient`;
    } else {
        existingBox.classList.remove('d-none');
        newBox.classList.add('d-none');
        btn.innerHTML = `<i class="bi bi-person-plus me-1"></i> Patient not found? Add New`;
    }
}

// Open modal and load rooms, patients, and doctors sorted newest first
async function openAdmissionQuickModal() {
    try {
        isCreatingNewAdmissionPatient = false;
        document.getElementById('admissionQuickForm').reset();
        document.getElementById('admissionExistingPatientBox').classList.remove('d-none');
        document.getElementById('admissionNewPatientBox').classList.add('d-none');

        const [patRes, docRes, roomRes] = await Promise.all([
            api.get('/patients').catch(() => ({ data: [] })),
            api.get('/doctors').catch(() => ({ data: [] })),
            api.get('/rooms').catch(() => ({ data: [] }))
        ]);

        let patients = patRes.data || patRes;
        let doctors = docRes.data || docRes;
        let rooms = roomRes.data || roomRes;

        // Sort descending by ID so latest items appear first
        if (Array.isArray(patients)) patients.sort((a, b) => (b.id || 0) - (a.id || 0));
        if (Array.isArray(doctors)) doctors.sort((a, b) => (b.id || 0) - (a.id || 0));
        if (Array.isArray(rooms)) rooms.sort((a, b) => (b.id || 0) - (a.id || 0));

        fullRoomsCache = Array.isArray(rooms) ? rooms : [];

        // Populate Patient Dropdown
        const patSelect = document.getElementById('admissionPatientSelect');
        patSelect.innerHTML = (Array.isArray(patients) ? patients : []).map(p => `
            <option value="${p.id}">${p.fullName} ${p.phone ? '(' + p.phone + ')' : ''}</option>
        `).join('');

        // Populate Doctor Dropdown
        const docSelect = document.getElementById('admissionDoctorSelect');
        docSelect.innerHTML = (Array.isArray(doctors) ? doctors : []).map(d => {
            const docName = (d.fullName || '').startsWith('Dr.') ? d.fullName : 'Dr. ' + d.fullName;
            return `<option value="${d.id}">${docName} — ${d.specialization || 'General'}</option>`;
        }).join('');

        // Filter and Populate Available Rooms/Beds (where isOccupied is false or 0)
        const availableRooms = fullRoomsCache.filter(r => !r.isOccupied);
        const roomSelect = document.getElementById('admissionRoomSelect');
        roomSelect.innerHTML = availableRooms.length > 0
            ? availableRooms.map(r => `<option value="${r.id}">Room ${r.roomNumber} - ${r.roomType} (₹${r.dailyRate}/day)</option>`).join('')
            : `<option value="" disabled selected>No available beds/rooms found</option>`;

        const modalEl = new bootstrap.Modal(document.getElementById('admissionQuickActionModal'));
        modalEl.show();
    } catch (err) {
        console.error('Failed to initialize admission modal:', err);
        alert('Error loading hospital rooms and directories.');
    }
}

// Handle Form Submission: Register Patient (if new), Book Room, and Create Admission Record
async function handleAdmissionQuickSubmit(event) {
    event.preventDefault();

    try {
        let patientId = null;
        const roomId = Number(document.getElementById('admissionRoomSelect').value);
        const doctorId = Number(document.getElementById('admissionDoctorSelect').value);

        if (!roomId) {
            alert('Please select an available room or bed.');
            return;
        }

        // Step 1: Handle Patient creation if in new mode
        if (isCreatingNewAdmissionPatient) {
            const name = document.getElementById('admNewPatientName').value.trim();
            if (!name) {
                alert('Please enter the new patient full name.');
                return;
            }
            const newPatientPayload = {
                fullName: name,
                phone: document.getElementById('admNewPatientPhone').value.trim(),
                gender: document.getElementById('admNewPatientGender').value
            };
            const patRes = await api.post('/patients', newPatientPayload);
            patientId = patRes.id || patRes.data?.id;
        } else {
            patientId = Number(document.getElementById('admissionPatientSelect').value);
        }

        // Step 2: Create Admission Payload
        const admissionPayload = {
            patientId: patientId,
            doctorId: doctorId,
            roomId: roomId,
            admissionDiagnosis: document.getElementById('admissionDiagnosis').value,
            attenderName: document.getElementById('attenderName').value,
            attenderPhone: document.getElementById('attenderPhone').value,
            admissionDate: new Date().toISOString()
        };

        await api.post('/admissions', admissionPayload);

        // Step 3: Mark room as occupied
        await api.put(`/rooms/${roomId}`, { isOccupied: true, currentPatientId: patientId });

        alert('Patient admitted and bed allocated successfully!');

        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('admissionQuickActionModal'));
        modalInstance.hide();
        document.getElementById('admissionQuickForm').reset();

        if (typeof loadAdmissionView === 'function') {
            loadAdmissionView();
        }
    } catch (err) {
        console.error('Error saving patient admission:', err);
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        alert('Failed to admit patient: ' + errorMsg);
    }
}