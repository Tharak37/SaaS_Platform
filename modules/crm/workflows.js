// ==========================================
// 1. LEAD ACQUISITION & QUALIFICATION WORKFLOW
// ==========================================

// Open Lead Quick Modal with auto-generated reference and pre-filled defaults
async function openLeadQuickModal() {
    try {
        document.getElementById('leadQuickForm').reset();
        document.getElementById('leadRefCode').value = `LEAD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Auto-assign to current logged-in user if available
        const assigneeSelect = document.getElementById('leadAssigneeSelect');
        if (assigneeSelect) {
            assigneeSelect.value = currentUser?.id || '';
        }

        const modalEl = new bootstrap.Modal(document.getElementById('leadQuickActionModal'));
        modalEl.show();
    } catch (err) {
        console.error('Failed to open Lead modal:', err);
        alert('Error initializing lead capture form.');
    }
}

// Handle Lead Form Submission with zero manual friction
async function handleLeadQuickSubmit(event) {
    event.preventDefault();

    try {
        const payload = {
            referenceCode: document.getElementById('leadRefCode').value,
            companyName: document.getElementById('leadCompanyName').value.trim(),
            contactName: document.getElementById('leadContactName').value.trim(),
            email: document.getElementById('leadEmail').value.trim(),
            phone: document.getElementById('leadPhone').value.trim(),
            source: document.getElementById('leadSource').value,
            score: Number(document.getElementById('leadScore').value) || 50,
            status: document.getElementById('leadInitialStatus').value,
            notes: document.getElementById('leadNotes').value.trim(),
            createdAt: new Date().toISOString()
        };

        if (!payload.companyName || !payload.contactName) {
            alert('Company Name and Contact Name are required.');
            return;
        }

        await api.post('/leads', payload);
        alert('Lead captured, scored, and assigned successfully!');

        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('leadQuickActionModal'));
        modalInstance.hide();
        document.getElementById('leadQuickForm').reset();

        if (typeof loadLeadsView === 'function') loadLeadsView();
    } catch (err) {
        console.error('Error saving lead:', err);
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        alert('Failed to save lead: ' + errorMsg);
    }
}


// ==========================================
// 2. OPPORTUNITY & SALES PIPELINE WORKFLOW
// ==========================================

let fullLeadsCache = [];

// Open Opportunity Modal with auto-linked lead lookup
async function openOpportunityQuickModal() {
    try {
        document.getElementById('opportunityQuickForm').reset();
        document.getElementById('oppDealCode').value = `DEAL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Fetch leads to convert or link instantly without manual re-typing
        const leadRes = await api.get('/leads').catch(() => ({ data: [] }));
        let leads = leadRes.data || leadRes;
        fullLeadsCache = Array.isArray(leads) ? leads.sort((a, b) => (b.id || 0) - (a.id || 0)) : [];

        const leadSelect = document.getElementById('oppLeadSelect');
        leadSelect.innerHTML = `<option value="" disabled selected>Select or search lead...</option>` +
            fullLeadsCache.map(l => `<option value="${l.id}">${l.companyName} — ${l.contactName} (${l.phone || 'No phone'})</option>`).join('');

        const modalEl = new bootstrap.Modal(document.getElementById('opportunityQuickActionModal'));
        modalEl.show();
    } catch (err) {
        console.error('Failed to open Opportunity modal:', err);
        alert('Error loading lead records for pipeline.');
    }
}

// Auto-populate company name and contact details when a lead is selected
function onLeadSelectedForOpportunity(leadId) {
    const lead = fullLeadsCache.find(l => l.id == leadId);
    if (lead) {
        document.getElementById('oppDealTitle').value = `${lead.companyName} - Enterprise Deal`;
        document.getElementById('oppEstimatedValue').value = lead.estimatedValue || 50000;
    }
}

// Handle Opportunity Form Submission
async function handleOpportunityQuickSubmit(event) {
    event.preventDefault();

    try {
        const payload = {
            dealCode: document.getElementById('oppDealCode').value,
            leadId: Number(document.getElementById('oppLeadSelect').value) || null,
            dealTitle: document.getElementById('oppDealTitle').value.trim(),
            pipelineStage: document.getElementById('oppPipelineStage').value,
            estimatedValue: Number(document.getElementById('oppEstimatedValue').value) || 0,
            expectedCloseDate: document.getElementById('oppCloseDate').value,
            probability: Number(document.getElementById('oppProbability').value) || 50,
            nextActionNotes: document.getElementById('oppNextAction').value.trim()
        };

        if (!payload.dealTitle) {
            alert('Deal title is required.');
            return;
        }

        await api.post('/opportunities', payload);
        alert('Opportunity created and synced to pipeline successfully!');

        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('opportunityQuickActionModal'));
        modalInstance.hide();
        document.getElementById('opportunityQuickForm').reset();

        if (typeof loadOpportunitiesView === 'function') loadOpportunitiesView();
    } catch (err) {
        console.error('Error saving opportunity:', err);
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        alert('Failed to save opportunity: ' + errorMsg);
    }
}


// ==========================================
// 3. TASK & FOLLOW-UP AUTOMATION WORKFLOW
// ==========================================

// Open Task/Follow-up Modal with auto-scheduled due dates (default: tomorrow 10 AM)
async function openTaskQuickModal() {
    try {
        document.getElementById('taskQuickForm').reset();

        // Auto-set default reminder due date to tomorrow at 10:00 AM
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        document.getElementById('taskDueDate').value = tomorrow.toISOString().slice(0, 16);

        const modalEl = new bootstrap.Modal(document.getElementById('taskQuickActionModal'));
        modalEl.show();
    } catch (err) {
        console.error('Failed to open Task modal:', err);
        alert('Error initializing task creation form.');
    }
}

// Handle Task & Follow-up Submission with instant assignment
async function handleTaskQuickSubmit(event) {
    event.preventDefault();

    try {
        const payload = {
            taskTitle: document.getElementById('taskTitle').value.trim(),
            taskType: document.getElementById('taskType').value, // Follow-up, Call, Meeting, Email
            priority: document.getElementById('taskPriority').value, // High, Medium, Low
            dueDate: document.getElementById('taskDueDate').value,
            assignedTo: currentUser?.id || 1,
            description: document.getElementById('taskDescription').value.trim(),
            status: 'PENDING'
        };

        if (!payload.taskTitle) {
            alert('Task title is required.');
            return;
        }

        await api.post('/tasks', payload);
        alert('Task and automated follow-up scheduled successfully!');

        const modalInstance = bootstrap.Modal.getInstance(document.getElementById('taskQuickActionModal'));
        modalInstance.hide();
        document.getElementById('taskQuickForm').reset();

        if (typeof loadTasksView === 'function') loadTasksView();
    } catch (err) {
        console.error('Error saving task:', err);
        const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
        alert('Failed to schedule task: ' + errorMsg);
    }
}