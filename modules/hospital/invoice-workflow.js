let fullPatientsCache = [];

// Open modal and initialize invoice number and patient directory
async function openInvoiceQuickModal() {
    try {
        document.getElementById('invoiceQuickForm').reset();
        document.getElementById('invoiceNumberInput').value = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const patRes = await api.get('/patients').catch(() => ({ data: [] }));
        let patients = patRes.data || patRes;

        fullPatientsCache = Array.isArray(patients) ? patients.sort((a, b) => (b.id || 0) - (a.id || 0)) : [];

        // Populate Patient Dropdown
        const patSelect = document.getElementById('invoicePatientSelect');
        patSelect.innerHTML = `<option value="" disabled selected>Select patient for billing...</option>` +
            fullPatientsCache.map(p => `
                <option value="${p.id}">${p.fullName} ${p.phone ? '(' + p.phone + ')' : ''}</option>
            `).join('');

        // Initialize with one default line item (e.g., OPD Consultation Fee)
        document.getElementById('invoiceItemsContainer').innerHTML = '';
        addInvoiceItemRow('OPD Consultation Fee', 1, 500);

        const modalEl = new bootstrap.Modal(document.getElementById('invoiceQuickActionModal'));
        modalEl.show();
    } catch (err) {
        console.error('Failed to initialize invoice modal:', err);
        alert('Error loading patient directory.');
    }
}

// Add a dynamic line item row
function addInvoiceItemRow(desc = '', qty = 1, price = 0) {
    const container = document.getElementById('invoiceItemsContainer');
    const rowId = 'item_row_' + Date.now() + Math.floor(Math.random() * 100);

    const rowHTML = `
        <div class="row g-2 align-items-center mb-2 invoice-item-row" id="${rowId}">
            <div class="col-12 col-md-5">
                <input type="text" class="form-control form-control-sm item-desc" placeholder="Item description..." value="${desc}" required>
            </div>
            <div class="col-4 col-md-2">
                <input type="number" class="form-control form-control-sm item-qty" placeholder="Qty" min="1" value="${qty}" oninput="calculateInvoiceTotal()" required>
            </div>
            <div class="col-7 col-md-4">
                <input type="number" step="0.01" class="form-control form-control-sm item-price" placeholder="Unit Price (₹)" value="${price}" oninput="calculateInvoiceTotal()" required>
            </div>
            <div class="col-1 text-end">
                <button type="button" class="btn btn-outline-danger btn-sm p-1" onclick="document.getElementById('${rowId}').remove(); calculateInvoiceTotal();">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', rowHTML);
    calculateInvoiceTotal();
}

// Automatically calculate grand total across all line items
function calculateInvoiceTotal() {
    let grandTotal = 0;
    const rows = document.querySelectorAll('.invoice-item-row');

    rows.forEach(row => {
        const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
        const price = parseFloat(row.querySelector('.item-price').value) || 0;
        grandTotal += qty * price;
    });

    document.getElementById('invoiceGrandTotalDisplay').textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

// Auto-populate standard charges based on patient selection (Optional hook)
function onInvoicePatientSelected(patientId) {
    const patient = fullPatientsCache.find(p => p.id == patientId);
    if (patient) {
        // You can attach specific patient lookup metadata here if needed
    }
}

// Handle Form Submission: Create Invoice and Line Items
async function handleInvoiceQuickSubmit(event) {
    event.preventDefault();

    try {
        const patientId = Number(document.getElementById('invoicePatientSelect').value);
        const invoiceNumber = document.getElementById('invoiceNumberInput').value;
        const paymentStatus = document.getElementById('invoicePaymentStatus').value;
        const paymentMode = document.getElementById('invoicePaymentMode').value;

        // Gather Line Items
        const items = [];
        let grandTotal = 0;
        const rows = document.querySelectorAll('.invoice-item-row');

        rows.forEach(row => {
            const desc = row.querySelector('.item-desc').value.trim();
            const qty = parseInt(row.querySelector('.item-qty').value) || 1;
            const unitPrice = parseFloat(row.querySelector('.item-price').value) || 0;
            const totalPrice = qty * unitPrice;

            grandTotal += totalPrice;
            items.push({ description: desc, quantity: qty, unitPrice: unitPrice, totalPrice: totalPrice });
        });

        if (items.length === 0) {
            alert('Please add at least one billing item.');
            return;
        }

        const payload = {
            invoiceNumber: invoiceNumber,
            patientId: patientId,
            totalAmount: grandTotal,
            paymentStatus: paymentStatus,
            paymentMode: paymentMode,
            paidAt: paymentStatus === 'PAID' ? new Date().toISOString() : null,
            items: items
        };

        await api.post('/invoices', payload);

        alert('Invoice generated and saved successfully!');

        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('invoiceQuickActionModal'));
        modalInstance.hide();
        document.getElementById('invoiceQuickForm').reset();

        if (typeof loadInvoiceView === 'function') {
            loadInvoiceView();
        }
    } catch (err) {
        console.error('Error saving invoice:', err);
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        alert('Failed to generate invoice: ' + errorMsg);
    }
}