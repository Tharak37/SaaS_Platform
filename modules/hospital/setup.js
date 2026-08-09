// modules/hospital/setup.js
/**
 * AA MediCare 360° - Enterprise Hospital & Clinic Database Schema & Seeding
 * Creates domain-specific clinical tables and seeds target scale demo data.
 */
const bcrypt = require('bcrypt');

async function setupEnterpriseHospital(db) {
  try {
    console.log('🏥 Setting up AA MediCare 360° Hospital Module Tables & Seeding...');

    // ==========================================
    // 1. HOSPITAL DOMAIN TABLES
    // ==========================================
    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        departmentName VARCHAR(150) NOT NULL,
        description TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_doctors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        userId INT NOT NULL,
        departmentId INT,
        specialization VARCHAR(150) NOT NULL,
        consultationFee DECIMAL(10,2) DEFAULT 500.00,
        signatureUrl TEXT,
        isActive TINYINT(1) DEFAULT 1,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
        FOREIGN KEY (departmentId) REFERENCES hosp_departments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        fullName VARCHAR(150) NOT NULL,
        gender VARCHAR(20),
        age INT,
        phone VARCHAR(30) NOT NULL,
        email VARCHAR(150),
        address TEXT,
        bloodGroup VARCHAR(10),
        abhaId VARCHAR(100),
        isActive TINYINT(1) DEFAULT 1,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_patient_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patientId INT NOT NULL,
        documentName VARCHAR(150) NOT NULL,
        fileUrl TEXT NOT NULL,
        uploadedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_patient_allergies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patientId INT NOT NULL,
        allergyDescription VARCHAR(255) NOT NULL,
        severity ENUM('MILD','MODERATE','SEVERE') DEFAULT 'MODERATE',
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_patient_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patientId INT NOT NULL,
        conditionName VARCHAR(150) NOT NULL,
        diagnosedDate DATE,
        notes TEXT,
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_patient_insurance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patientId INT NOT NULL,
        providerName VARCHAR(150) NOT NULL,
        policyNumber VARCHAR(100) NOT NULL,
        coverageLimit DECIMAL(12,2) DEFAULT 100000.00,
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_appointments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        patientId INT NOT NULL,
        doctorId INT NOT NULL,
        appointmentDate DATETIME NOT NULL,
        status ENUM('SCHEDULED','CHECKED_IN','IN_CONSULTATION','COMPLETED','CANCELLED') DEFAULT 'SCHEDULED',
        symptoms TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctorId) REFERENCES hosp_doctors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        appointmentId INT NOT NULL,
        tokenNumber INT NOT NULL,
        queueStatus ENUM('WAITING','SERVING','COMPLETED','SKIPPED') DEFAULT 'WAITING',
        issuedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (appointmentId) REFERENCES hosp_appointments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_vitals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        patientId INT NOT NULL,
        appointmentId INT,
        temperature VARCHAR(20),
        pulseRate VARCHAR(20),
        bpSystolic INT,
        bpDiastolic INT,
        weightKg DECIMAL(5,2),
        recordedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE,
        FOREIGN KEY (appointmentId) REFERENCES hosp_appointments(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_prescriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        patientId INT NOT NULL,
        doctorId INT NOT NULL,
        appointmentId INT,
        diagnosis TEXT,
        notes TEXT,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctorId) REFERENCES hosp_doctors(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_prescription_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prescriptionId INT NOT NULL,
        medicineName VARCHAR(150) NOT NULL,
        dosage VARCHAR(100) NOT NULL,
        frequency VARCHAR(50) NOT NULL,
        durationDays INT NOT NULL,
        instructions TEXT,
        FOREIGN KEY (prescriptionId) REFERENCES hosp_prescriptions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        roomNumber VARCHAR(50) NOT NULL,
        roomType ENUM('GENERAL','SEMI-PRIVATE','PRIVATE','ICU') DEFAULT 'GENERAL',
        dailyRate DECIMAL(10,2) DEFAULT 1500.00,
        isOccupied BOOLEAN DEFAULT FALSE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_beds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        roomId INT NOT NULL,
        bedNumber VARCHAR(30) NOT NULL,
        isOccupied BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (roomId) REFERENCES hosp_rooms(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_admissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        patientId INT NOT NULL,
        doctorId INT NOT NULL,
        bedId INT NOT NULL,
        admittedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        dischargeDate DATETIME,
        admissionStatus ENUM('ADMITTED','DISCHARGED','TRANSFERRED') DEFAULT 'ADMITTED',
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctorId) REFERENCES hosp_doctors(id) ON DELETE CASCADE,
        FOREIGN KEY (bedId) REFERENCES hosp_beds(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_medicines (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        brandName VARCHAR(150) NOT NULL,
        genericName VARCHAR(150),
        batchNumber VARCHAR(50) NOT NULL,
        expiryDate DATE NOT NULL,
        unitPrice DECIMAL(10,2) NOT NULL,
        stockQuantity INT DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_lab_tests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        testName VARCHAR(150) NOT NULL,
        category VARCHAR(100),
        price DECIMAL(10,2) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_lab_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        patientId INT NOT NULL,
        doctorId INT NOT NULL,
        testId INT NOT NULL,
        orderStatus ENUM('PENDING','SAMPLE_COLLECTED','PROCESSING','COMPLETED') DEFAULT 'PENDING',
        orderedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE,
        FOREIGN KEY (doctorId) REFERENCES hosp_doctors(id) ON DELETE CASCADE,
        FOREIGN KEY (testId) REFERENCES hosp_lab_tests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_lab_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        labOrderId INT NOT NULL,
        resultValuesJson TEXT NOT NULL,
        reportRemarks TEXT,
        generatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (labOrderId) REFERENCES hosp_lab_orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT DEFAULT 1,
        patientId INT NOT NULL,
        invoiceNumber VARCHAR(50) NOT NULL,
        subTotal DECIMAL(12,2) NOT NULL,
        taxAmount DECIMAL(12,2) NOT NULL,
        totalAmount DECIMAL(12,2) NOT NULL,
        paymentStatus ENUM('PENDING','PARTIAL','PAID') DEFAULT 'PENDING',
        dueDate DATE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (patientId) REFERENCES hosp_patients(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS hosp_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoiceId INT NOT NULL,
        amountPaid DECIMAL(12,2) NOT NULL,
        paymentMode ENUM('CASH','UPI','CARD','INSURANCE','ONLINE') DEFAULT 'CASH',
        transactionRef VARCHAR(100),
        paidAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoiceId) REFERENCES hosp_invoices(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ==========================================
    // 2. ENTERPRISE TARGET SCALE SEEDING
    // ==========================================
    console.log('🌱 Seeding Hospital Enterprise Target Scale Data...');

    const passwordHash = await bcrypt.hash('password123', 10);

    // Register Product Module Entry for Hospital
    await db.query(`
      INSERT INTO ProductModule (moduleKey, displayName, description, price) VALUES 
      ('HOSPITAL', 'MediCare 360 Suite', 'Complete clinic and hospital management solution, including patient registration, OPD, EMR, pharmacy, and billing.', 3500.00)
      ON DUPLICATE KEY UPDATE price = VALUES(price), description = VALUES(description), displayName = VALUES(displayName);
    `);

    // Seed Hospital Staff Users
    const hospitalStaff = [
      ['hosp_admin@aacrm.com', passwordHash, 'Hospital Administrator', 'HOSPITAL_ADMIN', 1],
      ['dr.sharma@aacrm.com', passwordHash, 'Dr. Rajesh Sharma', 'DOCTOR', 1],
      ['dr.rao@aacrm.com', passwordHash, 'Dr. Ananya Rao', 'DOCTOR', 1],
      ['dr.kumar@aacrm.com', passwordHash, 'Dr. Suresh Kumar', 'DOCTOR', 1],
      ['nurse.mary@aacrm.com', passwordHash, 'Nurse Mary Joseph', 'NURSE', 1],
      ['reception@aacrm.com', passwordHash, 'Front Desk Receptionist', 'RECEPTIONIST', 1],
      ['pharmacist@aacrm.com', passwordHash, 'Store Pharmacist', 'PHARMACIST', 1],
      ['labtech@aacrm.com', passwordHash, 'Chief Lab Technician', 'LAB_TECHNICIAN', 1],
      ['cashier@aacrm.com', passwordHash, 'Billing Cashier', 'CASHIER', 1]
    ];

    for (const staffVals of hospitalStaff) {
      const [res] = await db.query(
        'INSERT IGNORE INTO User (email, password, name, role, tenantId) VALUES (?, ?, ?, ?, ?)',
        staffVals
      );
      if (res.insertId) {
        await db.query('INSERT IGNORE INTO UserRoles (userId, roleName) VALUES (?, ?)', [res.insertId, staffVals[3]]);
      }
    }

    // Seed Clinical Departments
    const departments = [
      [1, 'General Medicine', 'Primary healthcare and general clinical consultations'],
      [2, 'Cardiology', 'Cardiovascular health, ECG and heart diagnostics'],
      [3, 'Pediatrics', 'Child healthcare, vaccinations and neonatal care'],
      [4, 'Orthopedics', 'Bone, joint trauma and surgical care'],
      [5, 'Emergency & Trauma', '24/7 critical care and immediate response']
    ];
    for (const [id, name, desc] of departments) {
      await db.query('INSERT IGNORE INTO hosp_departments (id, tenantId, departmentName, description) VALUES (?, 1, ?, ?)', [id, name, desc]);
    }

    // Seed Doctors (Linking to seeded User IDs: assuming user IDs for doctors)
    const [doctorUsers] = await db.query("SELECT id FROM User WHERE role = 'DOCTOR' LIMIT 3");
    if (doctorUsers.length >= 3) {
      const doctors = [
        [1, doctorUsers[0].id, 1, 'General Medicine', 500.00],
        [2, doctorUsers[1].id, 2, 'Cardiology', 1000.00],
        [3, doctorUsers[2].id, 3, 'Pediatrics', 600.00]
      ];
      for (const [id, userId, deptId, spec, fee] of doctors) {
        await db.query('INSERT IGNORE INTO hosp_doctors (id, tenantId, userId, departmentId, specialization, consultationFee) VALUES (?, 1, ?, ?, ?, ?)', [id, userId, deptId, spec, fee]);
      }
    }

    // Seed 250 Patients with ABHA IDs
    const patFirstNames = ['Venkat', 'Priya', 'Ramesh', 'Sita', 'Kiran', 'Anil', 'Sunita', 'Rajesh', 'Deepika', 'Arjun'];
    const patLastNames = ['Reddy', 'Swaminathan', 'Varma', 'Devi', 'Kumar', 'Rao', 'Murthy', 'Naidu', 'Prasad', 'Gupta'];
    const bloodGroups = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-'];

    for (let p = 1; p <= 250; p++) {
      const fName = patFirstNames[p % patFirstNames.length];
      const lName = patLastNames[(p * 2) % patLastNames.length];
      const bg = bloodGroups[p % bloodGroups.length];
      const age = 18 + (p % 60);
      const gender = p % 2 === 0 ? 'Female' : 'Male';
      const abha = `91-${(1000 + p)}-${(2000 + p)}-${(3000 + p)}`;

      await db.query(
        'INSERT INTO hosp_patients (tenantId, fullName, gender, age, phone, email, address, bloodGroup, abhaId) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)',
        [`${fName} ${lName} #${p}`, gender, age, `+91 99${p.toString().padStart(8, '0')}`, `patient${p}@medicare.com`, `Door #${p}, Main Road, Visakhapatnam`, bg, abha]
      );
    }

    // Seed Rooms & Beds
    const rooms = [
      [1, 'G-101', 'GENERAL', 1200.00],
      [2, 'G-102', 'GENERAL', 1200.00],
      [3, 'S-201', 'SEMI-PRIVATE', 2500.00],
      [4, 'P-301', 'PRIVATE', 5000.00],
      [5, 'ICU-01', 'ICU', 10000.00]
    ];
    for (const [roomId, roomNum, roomType, rate] of rooms) {
      await db.query('INSERT IGNORE INTO hosp_rooms (id, tenantId, roomNumber, roomType, dailyRate, isOccupied) VALUES (?, 1, ?, ?, ?, FALSE)', [roomId, roomNum, roomType, rate]);
      await db.query('INSERT IGNORE INTO hosp_beds (roomId, bedNumber, isOccupied) VALUES (?, ?, FALSE)', [roomId, `${roomNum}-B1`]);
      await db.query('INSERT IGNORE INTO hosp_beds (roomId, bedNumber, isOccupied) VALUES (?, ?, FALSE)', [roomId, `${roomNum}-B2`]);
    }

    // Seed 200 Appointments & OPD Tokens
    for (let a = 1; a <= 200; a++) {
      const patientId = 1 + (a % 250);
      const doctorId = 1 + (a % 3);
      const statusOpts = ['SCHEDULED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'];
      const status = statusOpts[a % statusOpts.length];

      const [appRes] = await db.query(
        'INSERT INTO hosp_appointments (tenantId, patientId, doctorId, appointmentDate, status, symptoms) VALUES (1, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?)',
        [patientId, doctorId, a % 5, status, 'Fever, cough and fatigue symptoms reported']
      );

      await db.query(
        'INSERT INTO hosp_tokens (appointmentId, tokenNumber, queueStatus) VALUES (?, ?, ?)',
        [appRes.insertId, a, status === 'COMPLETED' ? 'COMPLETED' : 'WAITING']
      );
    }

    // Seed 150 E-Prescriptions & Items
    const sampleMedicines = ['Paracetamol 650mg', 'Amoxicillin 500mg', 'Pantoprazole 40mg', 'Azithromycin 250mg', 'Cetirizine 10mg', 'Ibuprofen 400mg'];
    for (let pr = 1; pr <= 150; pr++) {
      const patientId = 1 + (pr % 250);
      const doctorId = 1 + (pr % 3);

      const [prRes] = await db.query(
        'INSERT INTO hosp_prescriptions (tenantId, patientId, doctorId, diagnosis, notes) VALUES (1, ?, ?, ?, ?)',
        [patientId, doctorId, 'Acute Upper Respiratory Tract Infection', 'Take medicines after food. Plenty of warm fluids recommended.']
      );

      await db.query(
        'INSERT INTO hosp_prescription_items (prescriptionId, medicineName, dosage, frequency, durationDays, instructions) VALUES (?, ?, ?, ?, ?, ?)',
        [prRes.insertId, sampleMedicines[pr % sampleMedicines.length], '1 Tablet', 'Twice daily', 5, 'After meals']
      );
    }

    // Seed 100 Hospital Invoices & Payments
    for (let inv = 1; inv <= 100; inv++) {
      const patientId = 1 + (inv % 250);
      const subTotal = 1500.00 + ((inv * 45) % 8000);
      const taxAmt = subTotal * 0.18;
      const total = subTotal + taxAmt;
      const status = inv % 2 === 0 ? 'PAID' : 'PENDING';

      const [invRes] = await db.query(
        'INSERT INTO hosp_invoices (tenantId, patientId, invoiceNumber, subTotal, taxAmount, totalAmount, paymentStatus, dueDate) VALUES (1, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))',
        [patientId, `HINV-2026-${inv.toString().padStart(3, '0')}`, subTotal, taxAmt, total, status]
      );

      if (status === 'PAID') {
        await db.query(
          'INSERT INTO hosp_payments (invoiceId, amountPaid, paymentMode, transactionRef) VALUES (?, ?, ?, ?)',
          [invRes.insertId, total, 'UPI', `TXN-REF-${inv}98765`]
        );
      }
    }

    // Seed Lab Tests & Orders
    const labTestsCatalog = [
      ['Complete Blood Count (CBC)', 'Pathology', 450.00],
      ['Random Blood Sugar (RBS)', 'Pathology', 150.00],
      ['Lipid Profile', 'Biochemistry', 900.00],
      ['Liver Function Test (LFT)', 'Biochemistry', 1100.00],
      ['Thyroid Profile (T3, T4, TSH)', 'Endocrinology', 800.00]
    ];

    for (const [tName, cat, price] of labTestsCatalog) {
      await db.query('INSERT IGNORE INTO hosp_lab_tests (tenantId, testName, category, price) VALUES (1, ?, ?, ?)', [tName, cat, price]);
    }

    for (let lo = 1; lo <= 80; lo++) {
      const [loRes] = await db.query(
        'INSERT INTO hosp_lab_orders (tenantId, patientId, doctorId, testId, orderStatus) VALUES (1, ?, ?, ?, ?)',
        [1 + (lo % 250), 1 + (lo % 3), 1 + (lo % 5), lo % 2 === 0 ? 'COMPLETED' : 'PENDING']
      );

      if (lo % 2 === 0) {
        await db.query(
          'INSERT INTO hosp_lab_reports (labOrderId, resultValuesJson, reportRemarks) VALUES (?, ?, ?)',
          [loRes.insertId, JSON.stringify({ hemoglobin: '14.2 g/dL', wbc: '7200 /uL', platelet: '2.5 lakhs' }), 'All parameters within normal clinical range.']
        );
      }
    }

    console.log('✅ Hospital enterprise target scale data seeded successfully (250 Patients, 200 Appointments, 150 Prescriptions, 100 Invoices).');
  } catch (error) {
    console.error('❌ Enterprise Hospital Setup & Seeding Error:', error.message);
    throw error;
  }
}

module.exports = setupEnterpriseHospital;