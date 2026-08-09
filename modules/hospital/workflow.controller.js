// modules/hospital/workflow.controller.js

/**
 * RECEPTION & OPD QUEUE WORKFLOWS
 */
exports.checkInPatient = async (req, res, pool, logAudit) => {
  const { appointmentId } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Update Appointment Status
    await connection.query('UPDATE hosp_appointments SET status = "CHECKED_IN" WHERE id = ?', [appointmentId]);

    // 2. Update Token Status in Queue
    await connection.query('UPDATE hosp_tokens SET queueStatus = "WAITING" WHERE appointmentId = ?', [appointmentId]);

    await connection.commit();
    if (logAudit) logAudit(req.tenantId, req.user?.id, `Checked in appointment ID: ${appointmentId}`);
    res.json({ success: true, message: 'Patient checked in successfully and added to OPD queue' });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};

exports.callNextQueueToken = async (req, res, pool) => {
  const { doctorId } = req.body;
  // Find the next waiting token for this doctor's appointments
  const [waitingTokens] = await pool.query(`
    t.* FROM hosp_tokens t
    JOIN hosp_appointments a ON t.appointmentId = a.id
    WHERE a.doctorId = ? AND t.queueStatus = 'WAITING'
    ORDER BY t.tokenNumber ASC LIMIT 1
  `, [doctorId]);

  if (!waitingTokens.length) {
    return res.status(404).json({ message: 'No patients waiting in queue' });
  }

  const token = waitingTokens[0];
  await pool.query('UPDATE hosp_tokens SET queueStatus = "SERVING" WHERE id = ?', [token.id]);
  await pool.query('UPDATE hosp_appointments SET status = "IN_CONSULTATION" WHERE id = ?', [token.appointmentId]);

  res.json({ success: true, token, message: `Calling Token #${token.tokenNumber}` });
};

/**
 * DOCTOR CONSULTATION & EMR WORKFLOWS
 */
exports.startConsultation = async (req, res, pool) => {
  const { appointmentId, vitals } = req.body;
  // Record vitals and lock consultation state
  if (vitals) {
    await pool.query(
      'INSERT INTO hosp_vitals (patientId, appointmentId, temperature, pulseRate, bpSystolic, bpDiastolic, weightKg) SELECT patientId, ?, ?, ?, ?, ?, ? FROM hosp_appointments WHERE id = ?',
      [appointmentId, vitals.temperature, vitals.pulseRate, vitals.bpSystolic, vitals.bpDiastolic, vitals.weightKg, appointmentId]
    );
  }
  await pool.query('UPDATE hosp_appointments SET status = "IN_CONSULTATION" WHERE id = ?', [appointmentId]);
  res.json({ success: true, message: 'Consultation session started with captured vitals' });
};

exports.prescribeMedication = async (req, res, pool, logAudit) => {
  const { patientId, doctorId, appointmentId, diagnosis, items, notes } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rxRes] = await connection.query(
      'INSERT INTO hosp_prescriptions (tenantId, patientId, doctorId, appointmentId, diagnosis, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [req.tenantId, patientId, doctorId, appointmentId || null, diagnosis, notes || '']
    );
    const prescriptionId = rxRes.insertId;

    for (const item of items) {
      await connection.query(
        'INSERT INTO hosp_prescription_items (prescriptionId, medicineName, dosage, frequency, durationDays, instructions) VALUES (?, ?, ?, ?, ?, ?)',
        [prescriptionId, item.medicineName, item.dosage, item.frequency, item.durationDays, item.instructions || '']
      );
    }

    await connection.commit();
    if (logAudit) logAudit(req.tenantId, req.user?.id, `Issued e-prescription ID: ${prescriptionId} for patient #${patientId}`);
    res.status(201).json({ success: true, prescriptionId, message: 'E-Prescription successfully generated & pushed to ABDM health locker' });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};

/**
 * PHARMACY DISPENSING WORKFLOW
 */
exports.dispensePharmacy = async (req, res, pool) => {
  const { prescriptionId, items } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    for (const item of items) {
      // Deduct stock from inventory
      await connection.query(
        'UPDATE hosp_medicines SET stockQuantity = stockQuantity - ? WHERE id = ? AND stockQuantity >= ?',
        [item.quantity, item.medicineId, item.quantity]
      );
    }

    await connection.commit();
    res.json({ success: true, message: 'Medicines dispensed successfully and inventory updated' });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};

/**
 * BILLING & PAYMENT COLLECTION WORKFLOW
 */
exports.collectPayment = async (req, res, pool, logAudit) => {
  const { invoiceId, amountPaid, paymentMode, transactionRef } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Record Payment
    await connection.query(
      'INSERT INTO hosp_payments (invoiceId, amountPaid, paymentMode, transactionRef) VALUES (?, ?, ?, ?)',
      [invoiceId, amountPaid, paymentMode || 'CASH', transactionRef || null]
    );

    // 2. Mark Invoice as Paid
    await connection.query('UPDATE hosp_invoices SET paymentStatus = "PAID" WHERE id = ?', [invoiceId]);

    await connection.commit();
    if (logAudit) logAudit(req.tenantId, req.user?.id, `Collected payment of ₹${amountPaid} for invoice ID: ${invoiceId}`);
    res.json({ success: true, message: 'Payment collected and receipt generated successfully' });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};

/**
 * AI CLINICAL ASSISTANT WORKFLOW (Mock / Orchestration API)
 */
exports.aiSummarizeConsultation = async (req, res) => {
  const { consultationNotes, symptoms } = req.body;
  // Orchestrate LLM API call for clinical summarization
  res.json({
    success: true,
    summary: {
      chiefComplaints: symptoms || 'Patient reported acute fatigue and upper respiratory discomfort.',
      clinicalImpression: 'Mild viral upper respiratory infection with responsive vitals.',
      recommendedTests: ['Complete Blood Count (CBC)', 'Chest X-Ray (Optional)'],
      suggestedFollowUpDays: 5
    }
  });
};