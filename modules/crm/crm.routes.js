// modules/crm/routes.js
const express = require('express');
const controller = require('./crm.controller');

/**
 * Complete Enterprise CRM Module Routes (HelloLeads / Freshsales Golden Path)
 * @param {Object} pool - MySQL database connection pool
 * @param {Function} authenticateToken - JWT verification middleware
 * @param {Function} tenantIsolation - Tenant scoping middleware
 * @param {Function} checkPermission - Dynamic role & permission checking middleware
 * @param {Function} requireAdminOrSuperAdmin - Admin privilege check middleware
 * @param {Function} logAudit - Audit logging helper function
 */
module.exports = (pool, authenticateToken, tenantIsolation, checkPermission, requireAdminOrSuperAdmin, logAudit) => {
  const router = express.Router();
  const withPool = (handler) => (req, res) => handler ? handler(req, res, pool, logAudit) : res.status(501).json({ error: 'Controller method not implemented' });

  // Common middleware stack for all CRM routes
  const baseMiddleware = [authenticateToken, tenantIsolation];

  // ==========================================
  // 1. DASHBOARD & GLOBAL SEARCH
  // ==========================================
  router.get('/dashboard/admin', ...baseMiddleware, checkPermission('CRM', 'VIEW_DASHBOARD'), withPool(controller.getAdminDashboard));
  router.get('/dashboard/sales-manager', ...baseMiddleware, checkPermission('CRM', 'VIEW_DASHBOARD'), withPool(controller.getSalesManagerDashboard));
  router.get('/dashboard/sales-rep', ...baseMiddleware, checkPermission('CRM', 'VIEW_DASHBOARD'), withPool(controller.getSalesRepDashboard));
  router.get('/search', ...baseMiddleware, checkPermission('CRM', 'VIEW_CRM'), withPool(controller.globalSearch));

  // ==========================================
  // 2. LEAD MANAGEMENT (CRUD + Workflows)
  // ==========================================

  // ==========================================
  // 1. REGIONS & TARGET LISTS
  // ==========================================
  router.get('/regions', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_regions WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/regions', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(async (req, res, db, audit) => {
    const { regionName, country, stateOrProvince, description } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_regions (tenantId, regionName, country, stateOrProvince, description) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, regionName, country || 'India', stateOrProvince || '', description || '']
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created region: ${regionName} (ID: ${r.insertId})`);
    res.status(201).json({ id: r.insertId, message: 'Region created successfully' });
  }));

  router.get('/regions/:regionId/lists', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_lists WHERE regionId = ? AND tenantId = ? ORDER BY id DESC', [req.params.regionId, req.tenantId]);
    res.json(rows);
  }));

  router.post('/lists', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(async (req, res, db, audit) => {
    const { regionId, listName, description } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_lists (tenantId, regionId, listName, description) VALUES (?, ?, ?, ?)',
      [req.tenantId, regionId, listName, description || '']
    );
   
    if (audit) audit(req.tenantId, req.user?.userId, `Created target list: ${listName} (ID: ${r.insertId})`);
    res.status(201).json({ id: r.insertId, message: 'Target list created successfully' });
  }));

  // ==========================================
  // 2. LEADS, SOURCES & STATUSES
  // ==========================================
  router.get('/lead-sources', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_lead_sources WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/lead-sources', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(async (req, res, db, audit) => {
    const { sourceName, description } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_lead_sources (tenantId, sourceName, description) VALUES (?, ?, ?)',
      [req.tenantId, sourceName, description || '']
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created lead source: ${sourceName}`);
    res.status(201).json({ id: r.insertId, message: 'Lead source created successfully' });
  }));

  router.get('/lead-statuses', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_lead_statuses WHERE tenantId = ? ORDER BY displayOrder ASC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/lead-statuses', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(async (req, res, db, audit) => {
    const { statusName, displayOrder } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_lead_statuses (tenantId, statusName, displayOrder) VALUES (?, ?, ?)',
      [req.tenantId, statusName, displayOrder || 1]
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created lead status: ${statusName}`);
    res.status(201).json({ id: r.insertId, message: 'Lead status created successfully' });
  }));

  router.get('/leads', ...baseMiddleware, checkPermission('CRM', 'VIEW_LEADS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_leads WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/leads', ...baseMiddleware, checkPermission('CRM', 'MANAGE_LEADS'), withPool(async (req, res, db, audit) => {
    
      const { fullName, companyName, phone, email, estimatedValue, priority, statusId, sourceId } = req.body;
      const [r] = await db.query(
        'INSERT INTO crm_leads (tenantId, fullName, companyName, phone, email, estimatedValue, priority, statusId, sourceId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.tenantId, fullName, companyName || '', phone, email || '', estimatedValue || 0, priority || 'MEDIUM', statusId || null, sourceId || null]
      );
      if (audit) audit(req.tenantId, req.user?.userId, `Created lead: ${fullName} (ID: ${r.insertId})`);
      res.status(201).json({ id: r.insertId, message: 'Lead created successfully' });
    
  }));

  // ==========================================
  // 3. CUSTOMERS & CONTACTS
  // ==========================================
  router.get('/customers', ...baseMiddleware, checkPermission('CRM', 'VIEW_CUSTOMERS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_customers WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/customers', ...baseMiddleware, checkPermission('CRM', 'MANAGE_CUSTOMERS'), withPool(async (req, res, db, audit) => {
    const { companyName, industry, website, phone } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_customers (tenantId, companyName, industry, website, phone) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, companyName, industry || '', website || '', phone || '']
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created customer: ${companyName}`);
    res.status(201).json({ id: r.insertId, message: 'Customer created successfully' });
  }));

  router.get('/customers/:customerId/contacts', ...baseMiddleware, checkPermission('CRM', 'VIEW_CUSTOMERS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_customer_contacts WHERE customerId = ? AND tenantId = ? ORDER BY id DESC', [req.params.customerId, req.tenantId]);
    res.json(rows);
  }));

  router.post('/customers/:customerId/contacts', ...baseMiddleware, checkPermission('CRM', 'MANAGE_CUSTOMERS'), withPool(async (req, res, db, audit) => {
    const customerId = req.params.customerId;
    const { fullName, email, phone, designation } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_customer_contacts (tenantId, customerId, fullName, email, phone, designation) VALUES (?, ?, ?, ?, ?, ?)',
      [req.tenantId, customerId, fullName, email || '', phone || '', designation || '']
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created contact: ${fullName}`);
    res.status(201).json({ id: r.insertId, message: 'Customer contact created successfully' });
  }));

  // ==========================================
  // 4. OPPORTUNITY STAGES & OPPORTUNITIES
  // ==========================================
  router.get('/opportunity-stages', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_opportunity_stages WHERE tenantId = ? ORDER BY displayOrder ASC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/opportunity-stages', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(async (req, res, db, audit) => {
    const { stageName, probability, displayOrder } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_opportunity_stages (tenantId, stageName, probability, displayOrder) VALUES (?, ?, ?, ?)',
      [req.tenantId, stageName, probability || 0, displayOrder || 1]
    );

    if (audit) audit(req.tenantId, req.user?.userId, `Created opportunity stage: ${stageName}`);
    res.status(201).json({ id: r.insertId, message: 'Stage created successfully' });
  }));

  router.get('/opportunities', ...baseMiddleware, checkPermission('CRM', 'VIEW_DEALS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_opportunities WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/opportunities', ...baseMiddleware, checkPermission('CRM', 'MANAGE_DEALS'), withPool(async (req, res, db, audit) => {
    const { customerId, opportunityName, stageId, dealValue, probability, expectedCloseDate } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_opportunities (tenantId, customerId, opportunityName, stageId, dealValue, probability, expectedCloseDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, customerId, opportunityName, stageId || null, dealValue || 0, probability || 50, expectedCloseDate || null]
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created opportunity: ${opportunityName} (ID: ${r.insertId})`);
    res.status(201).json({ id: r.insertId, message: 'Opportunity created successfully' });
  }));

  // ==========================================
  // 5. QUOTATIONS, SALES ORDERS & INVOICES
  // ==========================================
  router.get('/quotations', ...baseMiddleware, checkPermission('CRM', 'VIEW_FINANCE'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_quotations WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/quotations', ...baseMiddleware, checkPermission('CRM', 'MANAGE_FINANCE'), withPool(async (req, res, db, audit) => {
    const { customerId, opportunityId, quotationNumber, totalAmount, discount, gst, validUntil } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_quotations (tenantId, customerId, opportunityId, quotationNumber, totalAmount, discount, gst, validUntil) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, customerId, opportunityId || null, quotationNumber, totalAmount || 0, discount || 0, gst || 0, validUntil || null]
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created quotation: ${quotationNumber}`);
    res.status(201).json({ id: r.insertId, message: 'Quotation created successfully' });
  }));

  router.get('/sales-orders', ...baseMiddleware, checkPermission('CRM', 'VIEW_FINANCE'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_sales_orders WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/sales-orders', ...baseMiddleware, checkPermission('CRM', 'MANAGE_FINANCE'), withPool(async (req, res, db, audit) => {
    const { customerId, orderNumber, totalAmount } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_sales_orders (tenantId, customerId, orderNumber, totalAmount) VALUES (?, ?, ?, ?)',
      [req.tenantId, customerId, orderNumber, totalAmount || 0]
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created sales order: ${orderNumber}`);
    res.status(201).json({ id: r.insertId, message: 'Sales order created successfully' });
  }));

  router.get('/invoices', ...baseMiddleware, checkPermission('CRM', 'VIEW_FINANCE'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_invoices WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/invoices', ...baseMiddleware, checkPermission('CRM', 'MANAGE_FINANCE'), withPool(async (req, res, db, audit) => {
    const { customerId, invoiceNumber, totalAmount, taxAmount, dueDate } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_invoices (tenantId, customerId, invoiceNumber, totalAmount, taxAmount, dueDate) VALUES (?, ?, ?, ?, ?, ?)',
      [req.tenantId, customerId, invoiceNumber, totalAmount || 0, taxAmount || 0, dueDate || null]
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Created invoice: ${invoiceNumber}`);
    res.status(201).json({ id: r.insertId, message: 'Invoice created successfully' });
  }));

  // CRM Generic update route for the drawer form
  router.put('/:entity/:id', ...baseMiddleware, tenantIsolation, withPool(async (req, res, db, audit) => {
    const { entity, id } = req.params;
    const updates = req.body;

    // Map your CRM frontend view names to actual safe database table names
    const tableMap = {
      'regions': 'crm_regions',
      'lists': 'crm_lists',
      'lead-sources': 'crm_lead_sources',
      'lead-statuses': 'crm_lead_statuses',
      'leads': 'crm_leads',
      'customers': 'crm_customers',
      'customer-contacts': 'crm_customer_contacts',
      'opportunity-stages': 'crm_opportunity_stages',
      'opportunities': 'crm_opportunities',
      'quotations': 'crm_quotations',
      'sales-orders': 'crm_sales_orders',
      'invoices': 'crm_invoices',
      'tasks': 'crm_tasks',
      'follow-ups': 'crm_follow_ups',
      'campaigns': 'crm_campaigns'
    };

    const tableName = tableMap[entity];
    // console.log(`Updating entity: ${entity} (Table: ${tableName}) with ID: ${id} and updates:`, updates);
    if (!tableName) {
      return res.status(400).json({ message: 'Invalid CRM entity target for update' });
    }

    // Filter out restricted system keys if any leaked through
    const skipKeys = ['id', 'tenantId', 'createdAt', 'updatedAt'];
    const filteredKeys = Object.keys(updates).filter(key => !skipKeys.includes(key));
    const filteredValues = filteredKeys.map(key => {
      let val = updates[key];
      // Format ISO dates for MySQL if present
      if (val && typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
        return val.replace('T', ' ').substring(0, 19);
      }
      return val === '' ? null : val;
    });

    if (filteredKeys.length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    const setClause = filteredKeys.map(key => `${key} = ?`).join(', ');
    filteredValues.push(id, req.tenantId);

    await db.query(
      `UPDATE ${tableName} SET ${setClause} WHERE id = ? AND tenantId = ?`,
      filteredValues
    );

    if (audit) audit(req.tenantId, req.user?.userId, `Updated CRM record ID ${id} in ${tableName}`);
    res.json({ success: true, message: 'CRM record updated successfully' });
  }));

  router.delete('/:entity/:id', ...baseMiddleware, tenantIsolation, withPool(async (req, res, db, audit) => {
    const { entity, id } = req.params;
    // Map your CRM frontend view names to actual safe database table names
    const tableMap = {
      'regions': 'crm_regions',
      'lists': 'crm_lists',
      'lead-sources': 'crm_lead_sources',
      'lead-statuses': 'crm_lead_statuses',
      'leads': 'crm_leads',
      'customers': 'crm_customers',
      'customer-contacts': 'crm_customer_contacts',
      'opportunity-stages': 'crm_opportunity_stages',
      'opportunities': 'crm_opportunities',
      'quotations': 'crm_quotations',
      'sales-orders': 'crm_sales_orders',
      'invoices': 'crm_invoices',
      'tasks': 'crm_tasks',
      'follow-ups': 'crm_follow_ups',
      'campaigns': 'crm_campaigns'
    };
    const tableName = tableMap[entity];
    // console.log(`Deleting entity: ${entity} (Table: ${tableName}) with ID: ${id}`);

    try {
      await db.query(`DELETE FROM ${tableName} WHERE id = ? AND tenantId = ?`, [id, req.tenantId]);
      res.json({ success: true, message: 'Record deleted successfully' });
    } catch (dbErr) {
      // Catch MySQL Foreign Key Violation
      // if (dbErr.errno === 1451 || dbErr.code === 'ER_ROW_IS_REFERENCED_2') {
      //   return res.status(400).json({
      //     message: 'Cannot delete this record because it is currently assigned to active leads.'
      //   });
      // }
      // throw dbErr;
      try {
        await db.query(`UPDATE ${tableName} SET isActive = 0 WHERE id = ? AND tenantId = ?`, [id, req.tenantId]);
        res.json({ success: true, message: 'Record deactivated successfully' });
        if (audit) audit(req.tenantId, req.user?.userId, `Deactivated CRM record ID ${id} in ${tableName}`);
      } catch (updateErr) {
        return res.status(500).json({ message: 'Failed to deactivate the record. Please try again later.' });
      }
    }
  }));

  // router.get('/leads', ...baseMiddleware, checkPermission('CRM', 'VIEW_LEADS'), withPool(controller.getLeads));
  // router.post('/leads', ...baseMiddleware, checkPermission('CRM', 'MANAGE_LEADS'), withPool(controller.createLead));
  router.get('/leads/:id', ...baseMiddleware, checkPermission('CRM', 'VIEW_LEADS'), withPool(controller.getLeadById));
  router.put('/leads/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_LEADS'), withPool(controller.updateLead));
  router.delete('/leads/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_LEADS'), withPool(controller.deleteLead));

  router.patch('/leads/:id/status', ...baseMiddleware, checkPermission('CRM', 'MANAGE_LEADS'), withPool(controller.updateLeadStatus));
  router.patch('/leads/:id/assign', ...baseMiddleware, checkPermission('CRM', 'MANAGE_LEADS'), withPool(controller.assignLead));
  router.patch('/leads/:id/convert', ...baseMiddleware, checkPermission('CRM', 'MANAGE_LEADS'), withPool(controller.convertLead));
  router.get('/leads/:id/timeline', ...baseMiddleware, checkPermission('CRM', 'VIEW_LEADS'), withPool(controller.getLeadTimeline));
  router.post('/leads/:id/notes', ...baseMiddleware, checkPermission('CRM', 'MANAGE_LEADS'), withPool(controller.addLeadNote));

  // // ==========================================
  // // 3. CUSTOMER ACCOUNTS & CONTACTS
  // // ==========================================
  // router.get('/customers', ...baseMiddleware, checkPermission('CRM', 'VIEW_CUSTOMERS'), withPool(controller.getCustomers));
  // router.post('/customers', ...baseMiddleware, checkPermission('CRM', 'MANAGE_CUSTOMERS'), withPool(controller.createCustomer));
  router.get('/customers/:id', ...baseMiddleware, checkPermission('CRM', 'VIEW_CUSTOMERS'), withPool(controller.getCustomerById));
  router.put('/customers/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_CUSTOMERS'), withPool(controller.updateCustomer));
  router.delete('/customers/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_CUSTOMERS'), withPool(controller.deleteCustomer));

  // router.get('/customers/:id/contacts', ...baseMiddleware, checkPermission('CRM', 'VIEW_CUSTOMERS'), withPool(controller.getCustomerContacts));
  // router.post('/customers/:id/contacts', ...baseMiddleware, checkPermission('CRM', 'MANAGE_CUSTOMERS'), withPool(controller.createCustomerContact));

  // // ==========================================
  // // 4. OPPORTUNITIES & PIPELINE
  // // ==========================================
  // router.get('/opportunities', ...baseMiddleware, checkPermission('CRM', 'VIEW_DEALS'), withPool(controller.getOpportunities));
  // router.post('/opportunities', ...baseMiddleware, checkPermission('CRM', 'MANAGE_DEALS'), withPool(controller.createOpportunity));
  router.get('/opportunities/:id', ...baseMiddleware, checkPermission('CRM', 'VIEW_DEALS'), withPool(controller.getOpportunityById));
  router.put('/opportunities/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_DEALS'), withPool(controller.updateOpportunity));
  router.delete('/opportunities/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_DEALS'), withPool(controller.deleteOpportunity));

  router.patch('/opportunities/:id/stage', ...baseMiddleware, checkPermission('CRM', 'MANAGE_DEALS'), withPool(controller.updateOpportunityStage));
  router.patch('/opportunities/:id/won', ...baseMiddleware, checkPermission('CRM', 'MANAGE_DEALS'), withPool(controller.markOpportunityWon));
  router.patch('/opportunities/:id/lost', ...baseMiddleware, checkPermission('CRM', 'MANAGE_DEALS'), withPool(controller.markOpportunityLost));

  // // ==========================================
  // // 5. QUOTATIONS & APPROVALS
  // // ==========================================
  // router.get('/quotations', ...baseMiddleware, checkPermission('CRM', 'VIEW_QUOTATIONS'), withPool(controller.getQuotations));
  // router.post('/quotations', ...baseMiddleware, checkPermission('CRM', 'MANAGE_QUOTATIONS'), withPool(controller.createQuotation));
  router.get('/quotations/:id', ...baseMiddleware, checkPermission('CRM', 'VIEW_QUOTATIONS'), withPool(controller.getQuotationById));
  router.put('/quotations/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_QUOTATIONS'), withPool(controller.updateQuotation));
  router.delete('/quotations/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_QUOTATIONS'), withPool(controller.deleteQuotation));

  router.post('/quotations/:id/approve', ...baseMiddleware, checkPermission('CRM', 'APPROVE_QUOTATIONS'), withPool(controller.approveQuotation));
  router.post('/quotations/:id/reject', ...baseMiddleware, checkPermission('CRM', 'APPROVE_QUOTATIONS'), withPool(controller.rejectQuotation));

  // // ==========================================
  // // 6. SALES ORDERS & INVOICES
  // // ==========================================
  // router.get('/sales-orders', ...baseMiddleware, checkPermission('CRM', 'VIEW_ORDERS'), withPool(controller.getSalesOrders));
  // router.post('/sales-orders', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ORDERS'), withPool(controller.createSalesOrder));
  router.get('/sales-orders/:id', ...baseMiddleware, checkPermission('CRM', 'VIEW_ORDERS'), withPool(controller.getSalesOrderById));
  router.put('/sales-orders/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ORDERS'), withPool(controller.updateSalesOrder));
  router.patch('/sales-orders/:id/status', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ORDERS'), withPool(controller.updateSalesOrderStatus));

  // router.get('/invoices', ...baseMiddleware, checkPermission('CRM', 'VIEW_INVOICES'), withPool(controller.getInvoices));
  // router.post('/invoices', ...baseMiddleware, checkPermission('CRM', 'MANAGE_INVOICES'), withPool(controller.createInvoice));
  router.get('/invoices/:id', ...baseMiddleware, checkPermission('CRM', 'VIEW_INVOICES'), withPool(controller.getInvoiceById));
  router.put('/invoices/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_INVOICES'), withPool(controller.updateInvoice));
  router.post('/invoices/:id/payment', ...baseMiddleware, checkPermission('CRM', 'MANAGE_INVOICES'), withPool(controller.recordInvoicePayment));

  // ==========================================
  // 7. FOLLOW-UPS, TASKS & MEETINGS
  // ==========================================
  router.get('/follow-ups', ...baseMiddleware, checkPermission('CRM', 'VIEW_ACTIVITIES'), withPool(controller.getFollowUps));
  router.post('/follow-ups', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ACTIVITIES'), withPool(controller.createFollowUp));
  router.put('/follow-ups/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ACTIVITIES'), withPool(controller.updateFollowUp));
  router.delete('/follow-ups/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ACTIVITIES'), withPool(controller.deleteFollowUp));
  router.patch('/follow-ups/:id/complete', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ACTIVITIES'), withPool(controller.completeFollowUp));

  router.get('/tasks', ...baseMiddleware, checkPermission('CRM', 'VIEW_ACTIVITIES'), withPool(controller.getTasks));
  router.post('/tasks', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ACTIVITIES'), withPool(controller.createTask));
  router.patch('/tasks/:id/status', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ACTIVITIES'), withPool(controller.updateTaskStatus));

  router.get('/meetings', ...baseMiddleware, checkPermission('CRM', 'VIEW_ACTIVITIES'), withPool(controller.getMeetings));
  router.post('/meetings', ...baseMiddleware, checkPermission('CRM', 'MANAGE_ACTIVITIES'), withPool(controller.createMeeting));

  // ==========================================
  // 8. PRODUCTS, CAMPAIGNS & CHAT
  // ==========================================
  router.get('/products', ...baseMiddleware, checkPermission('CRM', 'VIEW_PRODUCTS'), withPool(controller.getProducts));
  router.post('/products', ...baseMiddleware, checkPermission('CRM', 'MANAGE_PRODUCTS'), withPool(controller.createProduct));
  router.delete('/products/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_PRODUCTS'), withPool(controller.deleteProduct));

  router.get('/campaigns', ...baseMiddleware, checkPermission('CRM', 'VIEW_CAMPAIGNS'), withPool(controller.getCampaigns));
  router.post('/campaigns', ...baseMiddleware, checkPermission('CRM', 'MANAGE_CAMPAIGNS'), withPool(controller.createCampaign));

  router.get('/chat-messages', ...baseMiddleware, checkPermission('CRM', 'VIEW_CHAT'), withPool(controller.getChatMessages));
  router.post('/chat-messages', ...baseMiddleware, checkPermission('CRM', 'MANAGE_CHAT'), withPool(controller.createChatMessage));

  // ==========================================
  // 9. ANALYTICS & RBAC USERS
  // ==========================================
  router.get('/analytics/revenue', ...baseMiddleware, checkPermission('CRM', 'VIEW_ANALYTICS'), withPool(controller.getAnalyticsRevenue));
  router.get('/analytics/pipeline', ...baseMiddleware, checkPermission('CRM', 'VIEW_ANALYTICS'), withPool(controller.getAnalyticsPipeline));
  router.get('/analytics/conversion', ...baseMiddleware, checkPermission('CRM', 'VIEW_ANALYTICS'), withPool(controller.getAnalyticsConversion));

  router.get('/users', ...baseMiddleware, checkPermission('CRM', 'VIEW_USERS'), withPool(controller.getUsers));

  // ==========================================
  // 10. MASTER DATA & REGIONS HIERARCHY
  // ==========================================
// ==========================================
  // REGIONS & HUBS ROUTES
  // ==========================================
  router.get('/regions', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM crm_regions WHERE tenantId = ? ORDER BY id DESC', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/regions', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(async (req, res, db, audit) => {
    const { regionName, country, stateOrProvince, description } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_regions (tenantId, regionName, country, stateOrProvince, description) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, regionName, country || 'India', stateOrProvince || '', description || '']
    );

    if (audit) audit(req.tenantId, req.user?.userId, `Created region: ${regionName} (ID: ${r.insertId})`);
    res.status(201).json({ id: r.insertId, message: 'Region created successfully' });
  }));

  router.delete('/regions/:id', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(async (req, res, db, audit) => {
    const regionId = req.params.id;
    await db.query('DELETE FROM crm_regions WHERE id = ? AND tenantId = ?', [regionId, req.tenantId]);
    if (audit) audit(req.tenantId, req.user?.userId, `Deleted region ID: ${regionId}`);
    res.json({ success: true, message: 'Region deleted successfully' });
  }));

  // ==========================================
  // TARGET LISTS ROUTES
  // ==========================================
  router.get('/regions/:regionId/lists', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(async (req, res, db) => {
    const regionId = req.params.regionId;
    const [rows] = await db.query('SELECT * FROM crm_lists WHERE regionId = ? AND tenantId = ? ORDER BY id DESC', [regionId, req.tenantId]);
    res.json(rows);
  }));

  router.post('/lists', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(async (req, res, db, audit) => {
    const { regionId, listName, description } = req.body;
    const [r] = await db.query(
      'INSERT INTO crm_lists (tenantId, regionId, listName, description) VALUES (?, ?, ?, ?)',
      [req.tenantId, regionId, listName, description || '']
    );

    if (audit) audit(req.tenantId, req.user?.userId, `Created target list: ${listName} (ID: ${r.insertId})`);
    res.status(201).json({ id: r.insertId, message: 'Target list created successfully' });
  }));
  router.get('/lead-sources', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(controller.getLeadSources));
  router.post('/lead-sources', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(controller.createLeadSource));

  router.get('/lead-statuses', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(controller.getLeadStatuses));
  router.post('/lead-statuses', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(controller.createLeadStatus));

  router.get('/opportunity-stages', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(controller.getOpportunityStages));
  router.post('/opportunity-stages', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(controller.createOpportunityStage));

  router.get('/industries', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(controller.getIndustries));
  router.post('/industries', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(controller.createIndustry));

  router.get('/branches', ...baseMiddleware, checkPermission('CRM', 'VIEW_MASTERS'), withPool(controller.getBranches));
  router.post('/branches', ...baseMiddleware, checkPermission('CRM', 'MANAGE_MASTERS'), withPool(controller.createBranch));

  return router;
};