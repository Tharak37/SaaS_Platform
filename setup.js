const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const setupcrmModule = require('./modules/crm/setup');
const setupEnterpriseHospital = require('./modules/hospital/setup');
// const setupService360Module = require('./modules/service360/setup');


dotenv.config();

async function initializeDatabase() {
  // 1. Connect without the database name to create it if it doesn't exist
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    waitForConnections: true,
    connectionLimit: 1000,
    queueLimit: 100
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'saas'}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  await connection.end();

  // 2. Now reconnect WITH the database name to run your table creation queries
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'saas',
    waitForConnections: true,
    connectionLimit: 1000,
    queueLimit: 100
  });

  console.log('Connected to MySQL database. Rebuilding tables with proper collations and AUTO_INCREMENT...');

  // Temporarily disable foreign key checks to allow clean table dropping
  await db.query('SET FOREIGN_KEY_CHECKS = 0;');

  // Drop tables in reverse order of foreign key dependencies
  await db.query('DROP TABLE IF EXISTS Files;');
  await db.query('DROP TABLE IF EXISTS Settings;');
  await db.query('DROP TABLE IF EXISTS AuditLog;');
  await db.query('DROP TABLE IF EXISTS RolePermission;');
  await db.query('DROP TABLE IF EXISTS Subscription;');
  await db.query('DROP TABLE IF EXISTS TenantModule;');
  await db.query('DROP TABLE IF EXISTS ProductModule;');
  await db.query('DROP TABLE IF EXISTS User;');
  await db.query('DROP TABLE IF EXISTS Tenant;');
  await db.query('DROP TABLE IF EXISTS PasswordResets;');

  // Re-enable foreign key checks
  await db.query('SET FOREIGN_KEY_CHECKS = 1;');

  // Create Tenant Table
  await db.query(`
    CREATE TABLE Tenant (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subdomain VARCHAR(100) UNIQUE NOT NULL,
      status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create User Table
  await db.query(`
    CREATE TABLE User (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'USER', -- Changed from ENUM to VARCHAR for dynamic roles
      tenantId INT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS UserRoles (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      roleName VARCHAR(50) NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
      UNIQUE KEY unique_user_role (userId, roleName)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create TenantModule Table
  await db.query(`
    CREATE TABLE TenantModule (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenantId INT NOT NULL,
      moduleName VARCHAR(100) NOT NULL,
      status ENUM('ACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_tenant_module (tenantId, moduleName),
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create ProductModule Table
  await db.query(`
    CREATE TABLE ProductModule (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      moduleKey VARCHAR(100) UNIQUE NOT NULL,
      displayName VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      status ENUM('ACTIVE', 'DISCONTINUED') DEFAULT 'ACTIVE',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create Subscription Table
  await db.query(`
    CREATE TABLE Subscription (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenantId INT UNIQUE NOT NULL,
      planName VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL,
      razorpaySubscriptionId VARCHAR(255),
      currentPeriodEnd DATETIME,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create RolePermission Table
  await db.query(`
    CREATE TABLE RolePermission (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      moduleKey VARCHAR(50) DEFAULT 'CORE',
      role VARCHAR(50) NOT NULL,
      permission VARCHAR(100) NOT NULL,
      UNIQUE KEY unique_role_permission (moduleKey, role, permission)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create AuditLog Table
  await db.query(`
    CREATE TABLE AuditLog (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      userId INT,
      action VARCHAR(255) NOT NULL,
      details TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create Settings Table
  await db.query(`
    CREATE TABLE Settings (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenantId INT UNIQUE NOT NULL,
      theme VARCHAR(50) DEFAULT 'light',
      timezone VARCHAR(100) DEFAULT 'UTC',
      language VARCHAR(10) DEFAULT 'en',
      brandingJson TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create Files Table
  await db.query(`
    CREATE TABLE Files (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tenantId INT NOT NULL,
      userId INT,
      filename VARCHAR(255) NOT NULL,
      originalName VARCHAR(255) NOT NULL,
      fileUrl VARCHAR(255) NOT NULL,
      fileSize INT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Create Password Resets Table
  await db.query(`
    CREATE TABLE PasswordResets (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      token VARCHAR(255) NOT NULL,
      expiresAt DATETIME NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Seed Default Role Permissions
 const defaultPermissions = [
    // --- Core System ---
    ['CORE', 'ADMIN', 'MANAGE_USERS'],
    ['CORE', 'ADMIN', 'VIEW_BILLING'],
    ['CORE', 'ADMIN', 'MANAGE_SUBSCRIPTION'],
    ['CORE', 'USER', 'VIEW_DASHBOARD'],

    // --- CRM Module (Tea Time Franchise Network) ---
    ['CRM', 'CRM_ADMIN', 'VIEW_MASTERS'],
    ['CRM', 'CRM_ADMIN', 'MANAGE_MASTERS'],
    ['CRM', 'CRM_ADMIN', 'VIEW_LEADS'],
    ['CRM', 'CRM_ADMIN', 'MANAGE_LEADS'],
    ['CRM', 'CRM_ADMIN', 'VIEW_CUSTOMERS'],
    ['CRM', 'CRM_ADMIN', 'MANAGE_CUSTOMERS'],
    ['CRM', 'CRM_ADMIN', 'VIEW_DEALS'],
    ['CRM', 'CRM_ADMIN', 'MANAGE_DEALS'],
    ['CRM', 'CRM_ADMIN', 'VIEW_FINANCE'],
    ['CRM', 'CRM_ADMIN', 'MANAGE_FINANCE'],
    
    ['CRM', 'SALES_MANAGER', 'VIEW_MASTERS'],
    ['CRM', 'SALES_MANAGER', 'VIEW_LEADS'],
    ['CRM', 'SALES_MANAGER', 'MANAGE_LEADS'],
    ['CRM', 'SALES_MANAGER', 'VIEW_CUSTOMERS'],
    ['CRM', 'SALES_MANAGER', 'MANAGE_CUSTOMERS'],
    ['CRM', 'SALES_MANAGER', 'VIEW_DEALS'],
    ['CRM', 'SALES_MANAGER', 'MANAGE_DEALS'],
    ['CRM', 'SALES_MANAGER', 'VIEW_FINANCE'],

    ['CRM', 'SALES_REP', 'VIEW_LEADS'],
    ['CRM', 'SALES_REP', 'MANAGE_LEADS'],
    ['CRM', 'SALES_REP', 'VIEW_CUSTOMERS'],
    ['CRM', 'SALES_REP', 'VIEW_DEALS'],

    // --- Hospital Module (AA MediCare 360) ---
    ['HOSPITAL', 'HOSPITAL_ADMIN', 'VIEW_PATIENTS'],
    ['HOSPITAL', 'HOSPITAL_ADMIN', 'MANAGE_PATIENTS'],
    ['HOSPITAL', 'HOSPITAL_ADMIN', 'VIEW_APPOINTMENTS'],
    ['HOSPITAL', 'HOSPITAL_ADMIN', 'MANAGE_APPOINTMENTS'],
    ['HOSPITAL', 'HOSPITAL_ADMIN', 'VIEW_BILLING'],
    ['HOSPITAL', 'HOSPITAL_ADMIN', 'MANAGE_BILLING'],

    ['HOSPITAL', 'DOCTOR', 'VIEW_PATIENTS'],
    ['HOSPITAL', 'DOCTOR', 'VIEW_APPOINTMENTS'],
    ['HOSPITAL', 'DOCTOR', 'MANAGE_APPOINTMENTS'],

    ['HOSPITAL', 'RECEPTIONIST', 'VIEW_PATIENTS'],
    ['HOSPITAL', 'RECEPTIONIST', 'MANAGE_PATIENTS'],
    ['HOSPITAL', 'RECEPTIONIST', 'VIEW_APPOINTMENTS'],
    ['HOSPITAL', 'RECEPTIONIST', 'MANAGE_APPOINTMENTS']
  ];;

  for (const [moduleKey, role, permission] of defaultPermissions) {
    await db.query(
      'INSERT IGNORE INTO RolePermission (moduleKey, role, permission) VALUES (?, ?, ?)',
      [moduleKey, role, permission]
    );
  }
  console.log('🌱 Default role permissions seeded successfully.');

  // Seed Super Admin Account & Platform Tenant
  await db.query(
    'INSERT INTO Tenant (id, name, subdomain) VALUES (?, ?, ?)',
    [1, 'Platform Administration', 'platform-admin']
  );

  const hashedPassword = await bcrypt.hash('SuperAdmin@123', 10);
  // await db.query(
  //   'INSERT INTO User (email, password, name, role, tenantId) VALUES (?, ?, ?, ?, ?)',
  //   ['superadmin@saas.com', hashedPassword, 'Global Super Admin', 'SUPER_ADMIN', 1]
  // );
  // await db.query(
  //         'INSERT IGNORE INTO UserRoles (userId, roleName) VALUES (?, ?)',
  //         [userId, roleName]
  //       );
  const roleName = 'SUPER_ADMIN';

  const [result] = await db.query(
    `INSERT INTO User (email, password, name, role, tenantId)
   VALUES (?, ?, ?, ?, ?)`,
    [
      'superadmin@saas.com',
      hashedPassword,
      'Global Super Admin',
      roleName,
      1
    ]
  );

  const userId = result.insertId;

  await db.query(
    `INSERT IGNORE INTO UserRoles (userId, roleName)
   VALUES (?, ?)`,
    [userId, roleName]
  );

  console.log('🌱 Super Admin seeded: superadmin@saas.com / SuperAdmin@123');
  console.log('All tables recreated successfully with correct collations and AUTO_INCREMENT IDs.');

  async function loadModuleDatabases() {
    await setupcrmModule(db);
    await setupEnterpriseHospital(db);
    // await setupService360Module(db);
  }
  await loadModuleDatabases();
  await db.end();  
}

initializeDatabase().catch((err) => {
  console.error('Database setup failed:', err);
  process.exit(1);
});