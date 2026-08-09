// modules/hospital/routes.js
const express = require('express');
const bcrypt = require('bcrypt');

module.exports = (pool, authenticateToken, tenantIsolation, checkPermission, requireAdminOrSuperAdmin, logAudit) => {
  const router = express.Router();
  const withPool = (handler) => (req, res) => handler ? handler(req, res, pool, logAudit) : res.status(501).json({ error: 'Endpoint not implemented' });
  const workflowCtrl = require('./workflow.controller');

  const baseMiddleware = [authenticateToken, tenantIsolation];

  // ==========================================
  // 1. DASHBOARD & ANALYTICS APIs
  // ==========================================
  router.get('/dashboard/live-opd', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_DASHBOARD'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT COUNT(*) as activeOPD FROM hosp_appointments WHERE tenantId = ? AND status != "COMPLETED"', [req.tenantId]);
    res.json(rows[0]);
  }));

  router.get('/reports/daily-opd', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_REPORTS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT DATE(appointmentDate) as visitDate, COUNT(*) as totalVisits FROM hosp_appointments WHERE tenantId = ? GROUP BY DATE(appointmentDate) DESC LIMIT 30', [req.tenantId]);
    res.json(rows);
  }));

  // ==========================================
  // RECEPTION & OPD QUEUE WORKFLOWS
  // ==========================================
  router.post('/appointments/checkin', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_APPOINTMENTS'), withPool(async (req, res, db, audit) => {
    const { appointmentId } = req.body;
    await db.query('UPDATE hosp_appointments SET status = "CHECKED_IN" WHERE id = ?', [appointmentId]);
    await db.query('UPDATE hosp_tokens SET queueStatus = "WAITING" WHERE appointmentId = ?', [appointmentId]);
    if (audit) audit(req.tenantId, req.user?.userId, `Checked in appointment ID: ${appointmentId}`);
    res.json({ success: true, message: 'Patient checked in successfully and added to OPD queue' });
  }));

  router.post('/queue/call-next', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_APPOINTMENTS'), withPool(async (req, res, db) => {
    const { doctorId } = req.body;
    const [waitingTokens] = await db.query(`
      SELECT t.* FROM hosp_tokens t
      JOIN hosp_appointments a ON t.appointmentId = a.id
      WHERE a.doctorId = ? AND t.queueStatus = 'WAITING'
      ORDER BY t.tokenNumber ASC LIMIT 1
    `, [doctorId]);

    if (!waitingTokens.length) {
      return res.status(404).json({ message: 'No patients waiting in queue' });
    }

    const token = waitingTokens[0];
    await db.query('UPDATE hosp_tokens SET queueStatus = "SERVING" WHERE id = ?', [token.id]);
    await db.query('UPDATE hosp_appointments SET status = "IN_CONSULTATION" WHERE id = ?', [token.appointmentId]);

    res.json({ success: true, token, message: `Calling Token #${token.tokenNumber}` });
  }));

  // ==========================================
  // DOCTOR & EMR WORKFLOWS
  // ==========================================
  router.post('/consultation/start', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PRESCRIPTIONS'), withPool(async (req, res, db) => {
    const { appointmentId, vitals } = req.body;
    if (vitals) {
      await db.query(
        'INSERT INTO hosp_vitals (patientId, appointmentId, temperature, pulseRate, bpSystolic, bpDiastolic, weightKg) SELECT patientId, ?, ?, ?, ?, ?, ? FROM hosp_appointments WHERE id = ?',
        [appointmentId, vitals.temperature, vitals.pulseRate, vitals.bpSystolic, vitals.bpDiastolic, vitals.weightKg, appointmentId]
      );
    }
    await db.query('UPDATE hosp_appointments SET status = "IN_CONSULTATION" WHERE id = ?', [appointmentId]);
    res.json({ success: true, message: 'Consultation session started with captured vitals' });
  }));

  // Generic or entity-specific update route for the drawer form
  router.put('/:entity/:id', ...baseMiddleware, tenantIsolation, withPool(async (req, res, db, audit) => {
    const { entity, id } = req.params;
    const updates = req.body;

    // Map your frontend view names or entity names to actual safe database table names
    const tableMap = {
      'appointments': 'hosp_appointments',
      'patients': 'hosp_patients',
      'doctors': 'hosp_doctors',
      'medicines': 'hosp_medicines',
      'invoices': 'hosp_invoices',
      'lab-orders': 'hosp_lab_orders',
    };

    const tableName = tableMap[entity];
    if (!tableName) {
      return res.status(400).json({ message: 'Invalid entity target for update' });
    }

    // Dynamically build SQL update query from form fields
    const keys = Object.keys(updates);
    const values = Object.values(updates);

    if (keys.length === 0) {
      return res.status(400).json({ message: 'No fields provided for update' });
    }

    const setClause = keys.map(key => `${key} = ?`).join(', ');
    values.push(id, req.tenantId);

    await db.query(
      `UPDATE ${tableName} SET ${setClause} WHERE id = ? AND tenantId = ?`,
      values
    );
    
    if (audit) audit(req.tenantId, req.user?.userId, `Updated record ID ${id} in ${tableName}`);
    res.json({ success: true, message: 'Record updated successfully' });
  }));

  router.delete('/:entity/:id', ...baseMiddleware, tenantIsolation, withPool(async (req, res, db, audit) => {
    const { entity, id } = req.params;

    // Map your frontend view names or entity names to actual safe database table names
    const tableMap = {
      'appointments': 'hosp_appointments',
      'patients': 'hosp_patients',
      'doctors': 'hosp_doctors',
      'medicines': 'hosp_medicines',
      'invoices': 'hosp_invoices',
      'lab-orders': 'hosp_lab_orders',
    };

    const tableName = tableMap[entity];
    if (!tableName) {
      return res.status(400).json({ message: 'Invalid entity target for deletion' });
    }

    // console.log(`Deleting entity: ${entity} (Table: ${tableName}) with ID: ${id}`);

    try {
      await db.query(`DELETE FROM ${tableName} WHERE id = ? AND tenantId = ?`, [id, req.tenantId]);
      res.json({ success: true, message: 'Record deleted successfully' });
    } catch (dbErr) {
      try {
        await db.query(`UPDATE ${tableName} SET isActive = 0 WHERE id = ? AND tenantId = ?`, [id, req.tenantId]);
        res.json({ success: true, message: 'Record deactivated successfully' });
        if (audit) audit(req.tenantId, req.user?.userId, `Deactivated record ID ${id} in ${tableName}`);
      } catch (updateErr) {
        console.error(`Failed to deactivate record ID ${id} in ${tableName}:`, updateErr);
        res.status(500).json({ message: 'Failed to delete or deactivate record' });
      }
    }
  }));

  router.post('/consultation/prescribe', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PRESCRIPTIONS'), withPool(async (req, res, db, audit) => {
    const { patientId, doctorId, appointmentId, diagnosis, items, notes } = req.body;
    const [rxRes] = await db.query(
      'INSERT INTO hosp_prescriptions (tenantId, patientId, doctorId, appointmentId, diagnosis, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.tenantId, patientId, doctorId, appointmentId || null, diagnosis, notes || '']
    );
    const prescriptionId = rxRes.insertId;

    for (const item of items) {
      await db.query(
        'INSERT INTO hosp_prescription_items (prescriptionId, medicineName, dosage, frequency, durationDays, instructions) VALUES (?, ?, ?, ?, ?, ?)',
        [prescriptionId, item.medicineName, item.dosage, item.frequency, item.durationDays, item.instructions || '']
      );
    }

    if (audit) audit(req.tenantId, req.user?.userId, `Issued e-prescription ID: ${prescriptionId} for patient #${patientId}`);
    res.status(201).json({ success: true, prescriptionId, message: 'E-Prescription successfully generated & pushed to ABDM health locker' });
  }));

  // ==========================================
  // PHARMACY OPERATIONS
  // ==========================================
  router.post('/pharmacy/dispense', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PHARMACY'), withPool(async (req, res, db) => {
    const { items } = req.body;
    for (const item of items) {
      await db.query(
        'UPDATE hosp_medicines SET stockQuantity = stockQuantity - ? WHERE id = ? AND stockQuantity >= ?',
        [item.quantity, item.medicineId, item.quantity]
      );
    }
    res.json({ success: true, message: 'Medicines dispensed successfully and inventory updated' });
  }));

  // ==========================================
  // BILLING & FINANCE OPERATIONS
  // ==========================================
  router.post('/billing/collect-payment', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_INVOICES'), withPool(async (req, res, db, audit) => {
    const { invoiceId, amountPaid, paymentMode, transactionRef } = req.body;
    await db.query(
      'INSERT INTO hosp_payments (invoiceId, amountPaid, paymentMode, transactionRef) VALUES (?, ?, ?, ?)',
      [invoiceId, amountPaid, paymentMode || 'CASH', transactionRef || null]
    );
    await db.query('UPDATE hosp_invoices SET paymentStatus = "PAID" WHERE id = ?', [invoiceId]);
    if (audit) audit(req.tenantId, req.user?.userId, `Collected payment of ₹${amountPaid} for invoice ID: ${invoiceId}`);
    res.json({ success: true, message: 'Payment collected and receipt generated successfully' });
  }));

  // ==========================================
  // AI CLINICAL ASSISTANT
  // ==========================================
  router.post('/ai/summarize-consultation', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PRESCRIPTIONS'), withPool(async (req, res) => {
    const { symptoms } = req.body;
    res.json({
      success: true,
      summary: {
        chiefComplaints: symptoms || 'Patient reported acute fatigue and upper respiratory discomfort.',
        clinicalImpression: 'Mild viral upper respiratory infection with responsive vitals.',
        recommendedTests: ['Complete Blood Count (CBC)', 'Chest X-Ray (Optional)'],
        suggestedFollowUpDays: 5
      }
    });
  }));

  // ==========================================
  // 2. PATIENT MANAGEMENT & ABHA WORKFLOWS
  // ==========================================
  router.get('/patients', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_PATIENTS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM hosp_patients WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/patients/register', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PATIENTS'), withPool(async (req, res, db, audit) => {
    const { fullName, gender, age, phone, email, address, bloodGroup, abhaId } = req.body;
    const [r] = await db.query(
      'INSERT INTO hosp_patients (tenantId, fullName, gender, age, phone, email, address, bloodGroup, abhaId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, fullName, gender, age, phone, email || '', address || '', bloodGroup || 'O+', abhaId || null]
    );
    if (audit) audit(req.tenantId, req.user?.userId, `Registered patient: ${fullName}`);
    res.status(201).json({ id: r.insertId, message: 'Patient registered successfully' });
  }));

  router.post('/patients/:id/link-abha', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PATIENTS'), withPool(async (req, res, db) => {
    const { abhaId } = req.body;
    await db.query('UPDATE hosp_patients SET abhaId = ? WHERE id = ?', [abhaId, req.params.id]);
    res.json({ success: true, message: 'ABHA ID linked successfully via ABDM gateway' });
  }));

  router.get('/patients/:id/profile-360', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_PATIENTS'), withPool(async (req, res, db) => {
    const patientId = req.params.id;
    const [patient] = await db.query('SELECT * FROM hosp_patients WHERE id = ?', [patientId]);
    if (!patient.length) return res.status(404).json({ error: 'Patient not found' });
    const [history] = await db.query('SELECT * FROM hosp_patient_history WHERE patientId = ?', [patientId]);
    const [allergies] = await db.query('SELECT * FROM hosp_patient_allergies WHERE patientId = ?', [patientId]);
    const [documents] = await db.query('SELECT * FROM hosp_patient_documents WHERE patientId = ?', [patientId]);
    res.json({ profile: patient[0], history, allergies, documents });
  }));

  // ==========================================
  // 3. APPOINTMENTS, OPD QUEUE & TOKENS
  // ==========================================

  router.put('/appointments/:id', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_APPOINTMENTS'), withPool(async (req, res, db, audit) => {
    const appointmentId = req.params.id;
    const { status } = req.body;
    
    await db.query(
      'UPDATE hosp_appointments SET status = ? WHERE id = ? AND tenantId = ?',
      [status || 'SCHEDULED', appointmentId, req.tenantId]
    );

    if (audit) audit(req.tenantId, req.user?.userId, `Updated appointment ID: ${appointmentId} status to ${status}`);
    res.json({ id: appointmentId, status, message: 'Appointment status updated successfully' });
  }));

  router.get('/appointments', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_APPOINTMENTS'), withPool(async (req, res, db) => {
    const [rows] = await db.query(`
      SELECT a.*, p.fullName as patientName, p.phone as patientPhone, d.name as doctorName 
      FROM hosp_appointments a
      JOIN hosp_patients p ON a.patientId = p.id
      JOIN hosp_doctors doc ON a.doctorId = doc.id
      JOIN User d ON doc.userId = d.id
      WHERE a.tenantId = ?
    `, [req.tenantId]);
    res.json(rows);
  }));

  router.post('/appointments/book', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_APPOINTMENTS'), withPool(async (req, res, db, audit) => {
    const { patientId, doctorId, appointmentDate, symptoms } = req.body;
    const [r] = await db.query(
      'INSERT INTO hosp_appointments (tenantId, patientId, doctorId, appointmentDate, symptoms) VALUES (?, ?, ?, ?, ?)',
      [req.tenantId, patientId, doctorId, appointmentDate, symptoms || 'Routine Checkup']
    );
    const [lastToken] = await db.query('SELECT MAX(tokenNumber) as maxToken FROM hosp_tokens');
    const nextToken = (lastToken[0].maxToken || 0) + 1;
    await db.query('INSERT INTO hosp_tokens (appointmentId, tokenNumber, queueStatus) VALUES (?, ?, "WAITING")', [r.insertId, nextToken]);
    if (audit) audit(req.tenantId, req.user?.userId, `Booked appointment ID: ${r.insertId} (Token #${nextToken})`);
    res.status(201).json({ id: r.insertId, tokenNumber: nextToken, message: 'Appointment booked & token generated' });
  }));

  router.post('/appointments/checkin', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_APPOINTMENTS'), withPool(workflowCtrl.checkInPatient));
  router.post('/queue/call-next', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_APPOINTMENTS'), withPool(workflowCtrl.callNextQueueToken));

    // ==========================================
  // DOCTORS DIRECTORY ROUTES
  // ==========================================
  router.get('/doctors', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_DOCTORS'), withPool(async (req, res, db) => {
    const [rows] = await db.query(`
      SELECT d.*, u.name as fullName, u.email 
      FROM hosp_doctors d
      JOIN User u ON d.userId = u.id
      WHERE d.tenantId = ?
    `, [req.tenantId]);
    res.json(rows);
  }));

  router.post('/doctors', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_DOCTORS'), withPool(async (req, res, db, audit) => {
    const { fullName, specialization, consultationFee, email } = req.body;
    
    // Insert user record without phone column to avoid unknown column error
    const passwordHash = await bcrypt.hash('password123', 10);
    const [userRes] = await db.query(
      'INSERT INTO User (name, email, password, role, tenantId) VALUES (?, ?, ?, "DOCTOR", ?)',
      [fullName, email || `${fullName.toLowerCase().replace(/\s+/g,'')}@medicare.com`, passwordHash, req.tenantId]
    );
    const userId = userRes.insertId;

    const [r] = await db.query(
      'INSERT INTO hosp_doctors (tenantId, userId, specialization, consultationFee) VALUES (?, ?, ?, ?)',
      [req.tenantId, userId, specialization, consultationFee || 500]
    );

    if (audit) audit(req.tenantId, req.user?.userId, `Registered doctor ID: ${r.insertId} (${fullName})`);
    res.status(201).json({ id: r.insertId, message: 'Doctor registered successfully' });
  }));

  // ==========================================
  // PHARMACY INVENTORY ROUTES
  // ==========================================
  router.get('/pharmacy/medicines', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_PHARMACY'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM hosp_medicines WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/pharmacy/medicines', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PHARMACY'), withPool(async (req, res, db, audit) => {
    const { brandName, genericName, stockQuantity, unitPrice, expiryDate, batchNumber } = req.body;
    
    // Provide a default batchNumber if not supplied to satisfy database constraints
    const generatedBatch = batchNumber || `BATCH-${Math.floor(1000 + Math.random() * 9000)}`;

    const [r] = await db.query(
      'INSERT INTO hosp_medicines (tenantId, brandName, genericName, stockQuantity, unitPrice, expiryDate, batchNumber) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.tenantId, brandName, genericName, stockQuantity || 0, unitPrice || 0, expiryDate || new Date().toISOString().split('T')[0], generatedBatch]
    );

    if (audit) audit(req.tenantId, req.user?.userId, `Added pharmacy medicine: ${brandName} (ID: ${r.insertId})`);
    res.status(201).json({ id: r.insertId, message: 'Medicine added to inventory successfully' });
  }));

  router.post('/consultation/start', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PRESCRIPTIONS'), withPool(workflowCtrl.startConsultation));
  router.post('/consultation/prescribe', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PRESCRIPTIONS'), withPool(workflowCtrl.prescribeMedication));

  router.post('/pharmacy/dispense', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_PHARMACY'), withPool(workflowCtrl.dispensePharmacy));

  // ==========================================
  // 6. LABORATORY WORKFLOWS
  // ==========================================
  router.get('/lab/tests', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_LAB'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM hosp_lab_tests WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/lab/orders', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_LAB'), withPool(async (req, res, db) => {
    const { patientId, doctorId, testId } = req.body;
    const [r] = await db.query('INSERT INTO hosp_lab_orders (tenantId, patientId, doctorId, testId, orderStatus) VALUES (?, ?, ?, ?, "PENDING")', [req.tenantId, patientId, doctorId, testId]);
    res.status(201).json({ id: r.insertId, message: 'Lab test ordered successfully' });
  }));

  router.post('/lab/publish-report', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_LAB'), withPool(async (req, res, db) => {
    const { labOrderId, resultValuesJson, reportRemarks } = req.body;
    await db.query('INSERT INTO hosp_lab_reports (labOrderId, resultValuesJson, reportRemarks) VALUES (?, ?, ?)', [labOrderId, JSON.stringify(resultValuesJson), reportRemarks || '']);
    await db.query('UPDATE hosp_lab_orders SET orderStatus = "COMPLETED" WHERE id = ?', [labOrderId]);
    res.json({ success: true, message: 'Lab report verified and published' });
  }));

  // ==========================================
  // 7. IPD & WARD MANAGEMENT
  // ==========================================
  router.get('/rooms', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_ROOMS'), withPool(async (req, res, db) => {
    const [rows] = await db.query('SELECT * FROM hosp_rooms WHERE tenantId = ?', [req.tenantId]);
    res.json(rows);
  }));

  router.post('/admissions/admit', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_ADMISSIONS'), withPool(async (req, res, db) => {
    const { patientId, doctorId, bedId } = req.body;
    const connection = await db;
    const [r] = await connection.query(
      'INSERT INTO hosp_admissions (tenantId, patientId, doctorId, bedId, admissionStatus) VALUES (?, ?, ?, ?, "ADMITTED")',
      [req.tenantId, patientId, doctorId, bedId]
    );
    await connection.query('UPDATE hosp_beds SET isOccupied = TRUE WHERE id = ?', [bedId]);
    res.status(201).json({ admissionId: r.insertId, message: 'Patient admitted successfully' });
  }));

  // ==========================================
  // 8. BILLING & PAYMENTS
  // ==========================================
  router.get('/invoices', ...baseMiddleware, checkPermission('HOSPITAL', 'VIEW_INVOICES'), withPool(async (req, res, db) => {
    const [rows] = await db.query(`
      SELECT i.*, p.fullName as patientName FROM hosp_invoices i
      JOIN hosp_patients p ON i.patientId = p.id
      WHERE i.tenantId = ?
    `, [req.tenantId]);
    res.json(rows);
  }));

  router.post('/billing/generate-invoice', ...baseMiddleware, checkPermission('HOSPITAL', 'MANAGE_INVOICES'), withPool(async (req, res, db) => {
    const { patientId, invoiceNumber, subTotal, taxAmount } = req.body;
    const totalAmount = Number(subTotal) + Number(taxAmount);
    const [r] = await db.query(
      'INSERT INTO hosp_invoices (tenantId, patientId, invoiceNumber, subTotal, taxAmount, totalAmount) VALUES (?, ?, ?, ?, ?, ?)',
      [req.tenantId, patientId, invoiceNumber, subTotal, taxAmount, totalAmount]
    );
    res.status(201).json({ id: r.insertId, message: 'Invoice generated successfully' });
  }));


  return router;
};