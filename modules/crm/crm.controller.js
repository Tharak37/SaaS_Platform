// modules/crm/crm.controller.js

// ==========================================
// 1. DASHBOARD CONTROLLERS
// ==========================================
exports.getAdminDashboard = async (req, res, pool) => {
  try {
    const [leads] = await pool.query('SELECT COUNT(*) as total FROM crm_leads WHERE tenantId = ?', [req.tenantId]);
    const [customers] = await pool.query('SELECT COUNT(*) as total FROM crm_customers WHERE tenantId = ?', [req.tenantId]);
    const [pipeline] = await pool.query('SELECT SUM(dealValue) as totalValue FROM crm_opportunities WHERE tenantId = ?', [req.tenantId]);
    const [revenue] = await pool.query('SELECT SUM(netAmount) as totalRevenue FROM crm_invoices WHERE tenantId = ? AND paymentStatus = "PAID"', [req.tenantId]);
    res.json({ 
      totalLeads: leads[0].total, 
      totalCustomers: customers[0].total, 
      pipelineValue: pipeline[0].totalValue || 0, 
      totalRevenue: revenue[0].totalRevenue || 0 
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getSalesManagerDashboard = async (req, res, pool) => {
  try {
    const [overdue] = await pool.query('SELECT COUNT(*) as total FROM crm_follow_ups WHERE tenantId = ? AND reminderTime < NOW() AND status = "PENDING"', [req.tenantId]);
    const [todayLeads] = await pool.query('SELECT COUNT(*) as total FROM crm_leads WHERE tenantId = ? AND DATE(createdAt) = CURDATE()', [req.tenantId]);
    res.json({ todayLeads: todayLeads[0].total, overdueFollowups: overdue[0].total, targetAchievement: '78%' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getSalesRepDashboard = async (req, res, pool) => {
  try {
    const userId = req.user?.id || 5;
    const [myLeads] = await pool.query('SELECT COUNT(*) as total FROM crm_leads WHERE tenantId = ? AND assignedUserId = ?', [req.tenantId, userId]);
    const [todayFollowups] = await pool.query('SELECT COUNT(*) as total FROM crm_follow_ups WHERE tenantId = ? AND assignedUserId = ? AND DATE(reminderTime) = CURDATE()', [req.tenantId, userId]);
    res.json({ assignedLeads: myLeads[0].total, todaysFollowups: todayFollowups[0].total });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 2. SEARCH CONTROLLERS
// ==========================================
exports.globalSearch = async (req, res, pool) => {
  try {
    const q = `%${req.query.q || ''}%`;
    const [leads] = await pool.query('SELECT id, fullName as name, "Lead" as type FROM crm_leads WHERE tenantId = ? AND (fullName LIKE ? OR companyName LIKE ?)', [req.tenantId, q, q]);
    const [customers] = await pool.query('SELECT id, companyName as name, "Customer" as type FROM crm_customers WHERE tenantId = ? AND companyName LIKE ?', [req.tenantId, q]);
    res.json({ results: [...leads, ...customers] });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 3. LEAD CONTROLLERS
// ==========================================
exports.getLeads = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_leads WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getLeadById = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_leads WHERE id = ? AND tenantId = ?', [req.params.id, req.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createLead = async (req, res, pool, logAudit) => {
  try {
    const { fullName, email, phone, companyName, estimatedValue, assignedUserId } = req.body;
    const [result] = await pool.query(
      'INSERT INTO crm_leads (tenantId, fullName, email, phone, companyName, estimatedValue, assignedUserId) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, fullName || '', email || '', phone || '', companyName || '', estimatedValue || 0, assignedUserId || null]
    );
    // Safely get the user ID with fallbacks if req.user?.id is empty
    const userId = req.user?.id || req.userId || req.body.userId || 1;
    if (logAudit) logAudit(req.tenantId, userId, `Created lead: ${fullName}`);
    res.status(201).json({ id: result.insertId, message: 'Lead created successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateLead = async (req, res, pool, logAudit) => {
  try {
    const { fullName, email, phone, companyName, estimatedValue } = req.body;
    await pool.query('UPDATE crm_leads SET fullName = ?, email = ?, phone = ?, companyName = ?, estimatedValue = ? WHERE id = ? AND tenantId = ?', [fullName, email, phone, companyName, estimatedValue, req.params.id, req.tenantId]);
    if (logAudit) logAudit(req.tenantId, req.user?.id, `Updated lead ID: ${req.params.id}`);
    res.json({ message: 'Lead updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteLead = async (req, res, pool, logAudit) => {
  try {
    await pool.query('DELETE FROM crm_leads WHERE id = ? AND tenantId = ?', [req.params.id, req.tenantId]);
    if (logAudit) logAudit(req.tenantId, req.user?.id, `Deleted lead ID: ${req.params.id}`);
    res.json({ message: 'Lead deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateLeadStatus = async (req, res, pool) => {
  try {
    const { statusId, status } = req.body;
    await pool.query('UPDATE crm_leads SET statusId = ?, status = ? WHERE id = ? AND tenantId = ?', [statusId, status, req.params.id, req.tenantId]);
    res.json({ message: 'Lead status updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.assignLead = async (req, res, pool) => {
  try {
    const { assignedUserId } = req.body;
    await pool.query('UPDATE crm_leads SET assignedUserId = ? WHERE id = ? AND tenantId = ?', [assignedUserId, req.params.id, req.tenantId]);
    res.json({ message: 'Lead assigned successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.convertLead = async (req, res, pool) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [lead] = await conn.query('SELECT * FROM crm_leads WHERE id = ? AND tenantId = ?', [req.params.id, req.tenantId]);
    if (!lead.length) return res.status(404).json({ error: 'Lead not found' });
    const l = lead[0];
    const [cust] = await conn.query('INSERT INTO crm_customers (tenantId, companyName, website, phone, assignedUserId) VALUES (?, ?, ?, ?, ?)', [req.tenantId, l.companyName || l.fullName, l.website, l.phone, l.assignedUserId]);
    await conn.query('UPDATE crm_leads SET isConverted = TRUE, convertedCustomerId = ? WHERE id = ?', [cust.insertId, l.id]);
    await conn.commit();
    res.json({ message: 'Lead converted successfully', customerId: cust.insertId });
  } catch (err) { await conn.rollback(); res.status(500).json({ error: err.message }); } finally { conn.release(); }
};

exports.getLeadTimeline = async (req, res, pool) => {
  try {
    const [notes] = await pool.query('SELECT id, noteContent as title, createdAt, "NOTE" as type FROM crm_lead_notes WHERE leadId = ?', [req.params.id]);
    res.json(notes);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.addLeadNote = async (req, res, pool) => {
  try {
    const { noteContent } = req.body;
    await pool.query('INSERT INTO crm_lead_notes (tenantId, leadId, userId, noteContent) VALUES (?, ?, ?, ?)', [req.tenantId, req.params.id, req.user?.id || null, noteContent]);
    res.status(201).json({ message: 'Note added' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 4. CUSTOMER CONTROLLERS
// ==========================================
exports.getCustomers = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_customers WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getCustomerById = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_customers WHERE id = ? AND tenantId = ?', [req.params.id, req.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createCustomer = async (req, res, pool) => {
  try {
    const { companyName, industry, website, phone } = req.body;
    const [result] = await pool.query('INSERT INTO crm_customers (tenantId, companyName, industry, website, phone) VALUES (?, ?, ?, ?, ?)', [req.tenantId, companyName || '', industry || '', website || '', phone || '']);
    res.status(201).json({ id: result.insertId, message: 'Customer created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateCustomer = async (req, res, pool) => {
  try {
    const { companyName, industry, website, phone } = req.body;
    await pool.query('UPDATE crm_customers SET companyName = ?, industry = ?, website = ?, phone = ? WHERE id = ? AND tenantId = ?', [companyName, industry, website, phone, req.params.id, req.tenantId]);
    res.json({ message: 'Customer updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteCustomer = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_customers WHERE id = ? AND tenantId = ?', [req.params.id, req.tenantId]);
    res.json({ message: 'Customer deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getCustomerContacts = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_customer_contacts WHERE customerId = ?', [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createCustomerContact = async (req, res, pool) => {
  try {
    const { fullName, email, phone, designation } = req.body;
    const [result] = await pool.query('INSERT INTO crm_customer_contacts (tenantId, customerId, fullName, email, phone, designation) VALUES (?, ?, ?, ?, ?, ?)', [req.tenantId, req.params.id, fullName, email, phone, designation]);
    res.status(201).json({ id: result.insertId, message: 'Contact created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 5. OPPORTUNITY CONTROLLERS
// ==========================================
exports.getOpportunities = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_opportunities WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getOpportunityById = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_opportunities WHERE id = ? AND tenantId = ?', [req.params.id, req.tenantId]);
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createOpportunity = async (req, res, pool) => {
  try {
    const { customerId, opportunityName, dealValue, expectedCloseDate } = req.body;
    const [result] = await pool.query('INSERT INTO crm_opportunities (tenantId, customerId, opportunityName, dealValue, expectedCloseDate) VALUES (?, ?, ?, ?, ?)', [req.tenantId, customerId || 1, opportunityName, dealValue || 0, expectedCloseDate || null]);
    res.status(201).json({ id: result.insertId, message: 'Opportunity created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateOpportunity = async (req, res, pool) => {
  try {
    const { opportunityName, dealValue } = req.body;
    await pool.query('UPDATE crm_opportunities SET opportunityName = ?, dealValue = ? WHERE id = ?', [opportunityName, dealValue, req.params.id]);
    res.json({ message: 'Opportunity updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteOpportunity = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_opportunities WHERE id = ?', [req.params.id]);
    res.json({ message: 'Opportunity deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateOpportunityStage = async (req, res, pool) => {
  try {
    const { stageId } = req.body;
    await pool.query('UPDATE crm_opportunities SET stageId = ? WHERE id = ?', [stageId, req.params.id]);
    res.json({ message: 'Stage updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.markOpportunityWon = async (req, res, pool) => {
  try {
    await pool.query('UPDATE crm_opportunities SET status = "WON" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Opportunity won' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.markOpportunityLost = async (req, res, pool) => {
  try {
    await pool.query('UPDATE crm_opportunities SET status = "LOST" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Opportunity lost' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 6. QUOTATION CONTROLLERS
// ==========================================
exports.getQuotations = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_quotations WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getQuotationById = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_quotations WHERE id = ?', [req.params.id]);
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createQuotation = async (req, res, pool) => {
  try {
    const { customerId, quotationNumber, totalAmount, validUntil } = req.body;
    const [result] = await pool.query('INSERT INTO crm_quotations (tenantId, customerId, quotationNumber, totalAmount, validUntil) VALUES (?, ?, ?, ?, ?)', [req.tenantId, customerId || 1, quotationNumber, totalAmount || 0, validUntil || null]);
    res.status(201).json({ id: result.insertId, message: 'Quotation created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateQuotation = async (req, res, pool) => {
  try {
    const { totalAmount } = req.body;
    await pool.query('UPDATE crm_quotations SET totalAmount = ? WHERE id = ?', [totalAmount, req.params.id]);
    res.json({ message: 'Quotation updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteQuotation = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_quotations WHERE id = ?', [req.params.id]);
    res.json({ message: 'Quotation deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.approveQuotation = async (req, res, pool) => {
  try {
    await pool.query('UPDATE crm_quotations SET approvalStatus = "APPROVED", status = "ACCEPTED" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Quotation approved' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.rejectQuotation = async (req, res, pool) => {
  try {
    await pool.query('UPDATE crm_quotations SET approvalStatus = "REJECTED", status = "REJECTED" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Quotation rejected' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 7. SALES ORDER CONTROLLERS
// ==========================================
exports.getSalesOrders = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_sales_orders WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getSalesOrderById = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_sales_orders WHERE id = ?', [req.params.id]);
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createSalesOrder = async (req, res, pool) => {
  try {
    const { customerId, orderNumber, totalAmount } = req.body;
    const [result] = await pool.query('INSERT INTO crm_sales_orders (tenantId, customerId, orderNumber, totalAmount) VALUES (?, ?, ?, ?)', [req.tenantId, customerId || 1, orderNumber, totalAmount || 0]);
    res.status(201).json({ id: result.insertId, message: 'Sales order created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateSalesOrder = async (req, res, pool) => {
  try {
    const { totalAmount } = req.body;
    await pool.query('UPDATE crm_sales_orders SET totalAmount = ? WHERE id = ?', [totalAmount, req.params.id]);
    res.json({ message: 'Sales order updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateSalesOrderStatus = async (req, res, pool) => {
  try {
    const { deliveryStatus } = req.body;
    await pool.query('UPDATE crm_sales_orders SET deliveryStatus = ? WHERE id = ?', [deliveryStatus, req.params.id]);
    res.json({ message: 'Status updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteSalesOrder = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_sales_orders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Sales order deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 8. INVOICE CONTROLLERS
// ==========================================
exports.getInvoices = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_invoices WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getInvoiceById = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_invoices WHERE id = ?', [req.params.id]);
    res.json(rows[0] || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createInvoice = async (req, res, pool) => {
  try {
    const { customerId, invoiceNumber, totalAmount, taxAmount, dueDate } = req.body;
    const net = (Number(totalAmount) || 0) + (Number(taxAmount) || 0);
    const [result] = await pool.query('INSERT INTO crm_invoices (tenantId, customerId, invoiceNumber, totalAmount, taxAmount, netAmount, dueDate) VALUES (?, ?, ?, ?, ?, ?, ?)', [req.tenantId, customerId || 1, invoiceNumber, totalAmount || 0, taxAmount || 0, net, dueDate || null]);
    res.status(201).json({ id: result.insertId, message: 'Invoice created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateInvoice = async (req, res, pool) => {
  try {
    const { totalAmount } = req.body;
    await pool.query('UPDATE crm_invoices SET totalAmount = ? WHERE id = ?', [totalAmount, req.params.id]);
    res.json({ message: 'Invoice updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteInvoice = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_invoices WHERE id = ?', [req.params.id]);
    res.json({ message: 'Invoice deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.recordInvoicePayment = async (req, res, pool) => {
  try {
    await pool.query('UPDATE crm_invoices SET paymentStatus = "PAID", outstandingAmount = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Payment recorded' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 9. FOLLOW-UP CONTROLLERS
// ==========================================
exports.getFollowUps = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_follow_ups WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createFollowUp = async (req, res, pool) => {
  try {
    const { reminderTime, note, customerId } = req.body;
    const [result] = await pool.query('INSERT INTO crm_follow_ups (tenantId, reminderTime, note, customerId) VALUES (?, ?, ?, ?)', [req.tenantId, reminderTime, note, customerId || 1]);
    res.status(201).json({ id: result.insertId, message: 'Follow-up created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateFollowUp = async (req, res, pool) => {
  try {
    const { note } = req.body;
    await pool.query('UPDATE crm_follow_ups SET note = ? WHERE id = ?', [note, req.params.id]);
    res.json({ message: 'Follow-up updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteFollowUp = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_follow_ups WHERE id = ?', [req.params.id]);
    res.json({ message: 'Follow-up deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.completeFollowUp = async (req, res, pool) => {
  try {
    await pool.query('UPDATE crm_follow_ups SET status = "COMPLETED" WHERE id = ?', [req.params.id]);
    res.json({ message: 'Follow-up completed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 10. TASK CONTROLLERS
// ==========================================
exports.getTasks = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_tasks WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createTask = async (req, res, pool) => {
  try {
    const { title, priority, dueDate } = req.body;
    const [result] = await pool.query('INSERT INTO crm_tasks (tenantId, title, priority, dueDate) VALUES (?, ?, ?, ?)', [req.tenantId, title, priority || 'MEDIUM', dueDate || null]);
    res.status(201).json({ id: result.insertId, message: 'Task created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteTask = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_tasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Task deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateTaskStatus = async (req, res, pool) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE crm_tasks SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Task status updated' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 11. MEETING CONTROLLERS
// ==========================================
exports.getMeetings = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_events WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createMeeting = async (req, res, pool) => {
  try {
    const { title, eventTime } = req.body;
    const [result] = await pool.query('INSERT INTO crm_events (tenantId, title, eventTime) VALUES (?, ?, ?)', [req.tenantId, title, eventTime]);
    res.status(201).json({ id: result.insertId, message: 'Meeting scheduled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteMeeting = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_events WHERE id = ?', [req.params.id]);
    res.json({ message: 'Meeting deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 12. PRODUCT CONTROLLERS
// ==========================================
exports.getProducts = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_products WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createProduct = async (req, res, pool) => {
  try {
    const { productName, productCode, unitPrice } = req.body;
    const [result] = await pool.query('INSERT INTO crm_products (tenantId, productName, productCode, unitPrice) VALUES (?, ?, ?, ?)', [req.tenantId, productName, productCode || '', unitPrice || 0]);
    res.status(201).json({ id: result.insertId, message: 'Product created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteProduct = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_products WHERE id = ?', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 13. CAMPAIGN CONTROLLERS
// ==========================================
exports.getCampaigns = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_campaigns WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createCampaign = async (req, res, pool) => {
  try {
    const { campaignName, campaignType, budget, startDate, endDate } = req.body;
    const [result] = await pool.query('INSERT INTO crm_campaigns (tenantId, campaignName, campaignType, budget, startDate, endDate) VALUES (?, ?, ?, ?, ?, ?)', [req.tenantId, campaignName, campaignType || 'Digital', budget || 0, startDate || null, endDate || null]);
    res.status(201).json({ id: result.insertId, message: 'Campaign created' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteCampaign = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_campaigns WHERE id = ?', [req.params.id]);
    res.json({ message: 'Campaign deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 14. CHAT CONTROLLERS
// ==========================================
exports.getChatMessages = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT * FROM crm_chat_messages WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.createChatMessage = async (req, res, pool) => {
  try {
    const { channel, direction, messageBody, customerId } = req.body;
    const [result] = await pool.query('INSERT INTO crm_chat_messages (tenantId, channel, direction, messageBody, customerId) VALUES (?, ?, ?, ?, ?)', [req.tenantId, channel || 'WHATSAPP', direction || 'OUTBOUND', messageBody, customerId || 1]);
    res.status(201).json({ id: result.insertId, message: 'Message logged' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.deleteChatMessage = async (req, res, pool) => {
  try {
    await pool.query('DELETE FROM crm_chat_messages WHERE id = ?', [req.params.id]);
    res.json({ message: 'Message deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 15. ANALYTICS CONTROLLERS
// ==========================================
exports.getAnalyticsRevenue = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT SUM(netAmount) as revenue FROM crm_invoices WHERE tenantId = ? AND paymentStatus = "PAID"', [req.tenantId]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAnalyticsPipeline = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT SUM(dealValue) as pipelineValue FROM crm_opportunities WHERE tenantId = ?', [req.tenantId]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAnalyticsConversion = async (req, res, pool) => {
  try { res.json({ conversionRate: '24.5%' }); } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 16. USER CONTROLLERS
// ==========================================
exports.getUsers = async (req, res, pool) => {
  try {
    const [rows] = await pool.query('SELECT id, name, email, role FROM User WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ==========================================
// 17. MASTER CONTROLLERS & HIERARCHY
// ==========================================
exports.getRegions = async (req, res, pool) => {
  const [rows] = await pool.query('SELECT * FROM crm_regions WHERE tenantId = ?', [req.tenantId]);
  res.json(rows);
};
exports.createRegion = async (req, res, pool) => {
  try {
    const { regionName, country, stateOrProvince, description } = req.body;
    
    const [r] = await pool.query(
      'INSERT INTO crm_regions (tenantId, regionName, country, stateOrProvince, description) VALUES (?, ?, ?, ?, ?)', 
      [req.tenantId, regionName, country || 'India', stateOrProvince || '', description || '']
    );

    return res.status(201).json({ id: r.insertId, message: 'Region created successfully' });
  } catch (err) {
    console.error('Create Region Error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message });
    }
  }
};
exports.deleteRegion = async (req, res, pool) => {
  await pool.query('DELETE FROM crm_regions WHERE id = ?', [req.params.id]);
  res.json({ message: 'Deleted' });
};

exports.getListsByRegion = async (req, res, pool) => {
  const [rows] = await pool.query('SELECT * FROM crm_lists WHERE regionId = ?', [req.params.regionId]);
  res.json(rows);
};
exports.createList = async (req, res, pool) => {
  const { regionId, listName, description } = req.body;
  const [r] = await pool.query('INSERT INTO crm_lists (tenantId, regionId, listName, description) VALUES (?, ?, ?, ?)', [req.tenantId, regionId, listName, description || '']);
  res.status(201).json({ id: r.insertId });
};

exports.getLeadSources = async (req, res, pool) => {
  const [rows] = await pool.query('SELECT * FROM crm_lead_sources WHERE tenantId = ?', [req.tenantId]);
  res.json(rows);
};
exports.createLeadSource = async (req, res, pool) => {
  const { sourceName, description } = req.body;
  const [r] = await pool.query('INSERT INTO crm_lead_sources (tenantId, sourceName, description) VALUES (?, ?, ?)', [req.tenantId, sourceName, description || '']);
  res.status(201).json({ id: r.insertId });
};

exports.getLeadStatuses = async (req, res, pool) => {
  const [rows] = await pool.query('SELECT * FROM crm_lead_statuses WHERE tenantId = ?', [req.tenantId]);
  res.json(rows);
};
exports.createLeadStatus = async (req, res, pool) => {
  const { statusName, displayOrder } = req.body;
  const [r] = await pool.query('INSERT INTO crm_lead_statuses (tenantId, statusName, displayOrder) VALUES (?, ?, ?)', [req.tenantId, statusName, displayOrder || 1]);
  res.status(201).json({ id: r.insertId });
};

exports.getOpportunityStages = async (req, res, pool) => {
  const [rows] = await pool.query('SELECT * FROM crm_opportunity_stages WHERE tenantId = ?', [req.tenantId]);
  res.json(rows);
};
exports.createOpportunityStage = async (req, res, pool) => {
  const { stageName, probability, displayOrder } = req.body;
  const [r] = await pool.query('INSERT INTO crm_opportunity_stages (tenantId, stageName, probability, displayOrder) VALUES (?, ?, ?, ?)', [req.tenantId, stageName, probability || 50, displayOrder || 1]);
  res.status(201).json({ id: r.insertId });
};

exports.getIndustries = async (req, res, pool) => {
  const [rows] = await pool.query('SELECT * FROM crm_industries WHERE tenantId = ?', [req.tenantId]);
  res.json(rows);
};
exports.createIndustry = async (req, res, pool) => {
  const { industryName } = req.body;
  const [r] = await pool.query('INSERT INTO crm_industries (tenantId, industryName) VALUES (?, ?)', [req.tenantId, industryName]);
  res.status(201).json({ id: r.insertId });
};

exports.getBranches = async (req, res, pool) => {
  const [rows] = await pool.query('SELECT * FROM crm_branches WHERE tenantId = ?', [req.tenantId]);
  res.json(rows);
};
exports.createBranch = async (req, res, pool) => {
  const { branchName } = req.body;
  const [r] = await pool.query('INSERT INTO crm_branches (tenantId, branchName) VALUES (?, ?)', [req.tenantId, branchName]);
  res.status(201).json({ id: r.insertId });
};