const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Razorpay = require('razorpay');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: process.env.SMTP_PORT || 2525,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.logAudit = async (pool, userId, action, details) => {
  try {
    await pool.query(
      'INSERT INTO AuditLog (userId, action, details) VALUES (?, ?, ?)',
      [userId || null, action, details || null]
    );
  } catch (error) {
    console.error('AUDIT LOG ERROR:', error);
  }
};

exports.login = async (req, res, pool) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [rows] = await pool.query('SELECT * FROM User WHERE email = ?', [email]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, tenantId: user.tenantId } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.registerTenant = async (req, res, pool, logAudit) => {
  const { tenantName, subdomain, adminName, adminEmail, adminPassword } = req.body;
  if (!tenantName || !subdomain || !adminName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'All tenant and admin registration fields are required' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingTenant] = await connection.query('SELECT id FROM Tenant WHERE subdomain = ?', [subdomain]);
    if (existingTenant.length > 0) {
      await connection.release();
      return res.status(400).json({ error: 'Subdomain is already taken' });
    }

    const [existingUser] = await connection.query('SELECT id FROM User WHERE email = ?', [adminEmail]);
    if (existingUser.length > 0) {
      await connection.release();
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const [tenantResult] = await connection.query('INSERT INTO Tenant (name, subdomain) VALUES (?, ?)', [tenantName, subdomain]);
    const tenantId = tenantResult.insertId;

    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const [userResult] = await connection.query(
      'INSERT INTO User (email, password, name, role, tenantId) VALUES (?, ?, ?, ?, ?)',
      [adminEmail, hashedPassword, adminName, 'ADMIN', tenantId]
    );
    const userId = userResult.insertId;

    // Assign 'ADMIN' role to UserRoles table for multi-role architecture
    await connection.query('INSERT INTO UserRoles (userId, roleName) VALUES (?, ?)', [userId, 'ADMIN']);

    await connection.query('INSERT INTO Subscription (tenantId, planName, status) VALUES (?, ?, ?)', [tenantId, 'FREE', 'ACTIVE']);

    await connection.commit();
    connection.release();

    await logAudit(null, 'TENANT_REGISTERED', `New tenant '${tenantName}' (${subdomain}) registered with admin ${adminEmail}`);
    res.status(201).json({ message: 'Tenant and Admin user registered successfully', tenant: { id: tenantId, name: tenantName, subdomain } });
  } catch (error) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: error.message || 'Internal server error during registration' });
  }
};

exports.forgotPassword = async (req, res, pool) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const [users] = await pool.query('SELECT * FROM User WHERE email = ?', [email]);
    if (users.length === 0) return res.json({ message: 'If the email exists, a password reset link has been sent.' });

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000);

    await pool.query('INSERT INTO PasswordResets (email, token, expiresAt) VALUES (?, ?, ?)', [email, resetToken, expiresAt]);
    const resetLink = `http://localhost:5000/reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: '"SaaS Starter Kit" <no-reply@saas.com>',
      to: email,
      subject: 'Password Reset Request',
      text: `Click the link to reset your password: ${resetLink}`
    });

    res.json({ message: 'Password reset link sent successfully', debugToken: resetToken });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.resetPassword = async (req, res, pool) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });

  try {
    const [records] = await pool.query('SELECT * FROM PasswordResets WHERE token = ? AND expiresAt > NOW()', [token]);
    if (records.length === 0) return res.status(400).json({ error: 'Invalid or expired password reset token' });

    const record = records[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE User SET password = ? WHERE email = ?', [hashedPassword, record.email]);
    await pool.query('DELETE FROM PasswordResets WHERE email = ?', [record.email]);

    res.json({ message: 'Password has been successfully reset' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getProfile = async (req, res, pool) => {
  try {
    const userId = req.user.id || req.user.userId;
    if (!userId) return res.status(400).json({ error: 'Token payload missing user identifier.' });

    const [users] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.tenantId, t.name as tenantName, t.subdomain FROM User u LEFT JOIN Tenant t ON u.tenantId = t.id WHERE u.id = ?`,
      [userId]
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found in database.' });
    
    const user = users[0];

    // 2. Fetch active modules assigned to this tenant using 'moduleName'
    const [modules] = await pool.query(
      `SELECT moduleName FROM TenantModule WHERE tenantId = ? AND status = 'ACTIVE'`,
      [user.tenantId]
    );

    // Map to array of strings (e.g., ['SERVICE360', 'CRM'])
    user.modules = modules.map(m => m.moduleName);

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.uploadFile = async (req, res, pool) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { filename, originalname, size } = req.file;
    const fileUrl = `/uploads/${filename}`;

    const [result] = await pool.query(
      'INSERT INTO Files (tenantId, userId, filename, originalName, fileUrl, fileSize) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.tenantId, req.user.userId, filename, originalname, fileUrl, size]
    );

    res.status(201).json({ id: result.insertId, filename, originalName: originalname, fileUrl, size });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSettings = async (req, res, pool) => {
  try {
    const [settings] = await pool.query('SELECT * FROM Settings WHERE tenantId = ?', [req.user.tenantId]);
    if (settings.length === 0) return res.json({ tenantId: req.user.tenantId, theme: 'light', timezone: 'UTC', language: 'en' });
    res.json(settings[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateSettings = async (req, res, pool) => {
  const { theme, timezone, language, brandingJson } = req.body;
  try {
    await pool.query(
      `INSERT INTO Settings (tenantId, theme, timezone, language, brandingJson) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE theme = VALUES(theme), timezone = VALUES(timezone), language = VALUES(language), brandingJson = VALUES(brandingJson)`,
      [req.user.tenantId, theme || 'light', timezone || 'UTC', language || 'en', brandingJson ? JSON.stringify(brandingJson) : null]
    );
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTenants = async (req, res, pool) => {
  try {
    const [tenants] = await pool.query('SELECT id, name, subdomain, createdAt FROM Tenant');
    for (let tenant of tenants) {
      const [modules] = await pool.query('SELECT moduleName, status FROM TenantModule WHERE tenantId = ?', [tenant.id]);
      tenant.modules = modules;
    }
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createTenant = async (req, res, pool, logAudit) => {
  const { name, subdomain } = req.body;
  if (!name || !subdomain) return res.status(400).json({ error: 'Name and subdomain required' });
  try {
    const [result] = await pool.query('INSERT INTO Tenant (name, subdomain) VALUES (?, ?)', [name, subdomain]);
    await logAudit(req.user.userId, 'TENANT_CREATED', `Super admin created tenant '${name}' (${subdomain})`);
    res.status(201).json({ id: result.insertId, name, subdomain });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUsers = async (req, res, pool) => {
  try {
    let query = 'SELECT id, email, name, role, tenantId, createdAt FROM User';
    let params = [];
    if (req.user.role !== 'SUPER_ADMIN') {
      query += ' WHERE tenantId = ?';
      params.push(req.user.tenantId);
    }
    const [users] = await pool.query(query, params);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createUser = async (req, res, pool, logAudit) => {
  const { email, password, name, role, tenantId } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Missing required fields' });
  const assignedTenant = req.user.role === 'SUPER_ADMIN' ? (tenantId || req.user.tenantId) : req.user.tenantId;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO User (email, password, name, role, tenantId) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, name, role || 'USER', assignedTenant]
    );
    await logAudit(req.user.userId, 'USER_CREATED', `Created user account for ${email} with role ${role || 'USER'}`);
    res.status(201).json({ id: result.insertId, email, name, role: role || 'USER', tenantId: assignedTenant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTenantModules = async (req, res, pool) => {
  try {
    const [tenants] = await pool.query('SELECT id, name, subdomain, createdAt FROM Tenant');
    for (let tenant of tenants) {
      const [modules] = await pool.query('SELECT moduleName, status FROM TenantModule WHERE tenantId = ?', [tenant.id]);
      tenant.modules = modules;
    }
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.assignTenantModule = async (req, res, pool) => {
  const { tenantId, moduleName, status } = req.body;
  if (!tenantId || !moduleName) return res.status(400).json({ error: 'tenantId and moduleName are required' });
  try {
    await pool.query(
      `INSERT INTO TenantModule (tenantId, moduleName, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [tenantId, moduleName.toUpperCase(), status || 'ACTIVE']
    );
    res.json({ message: `Module '${moduleName.toUpperCase()}' successfully updated for Tenant ID ${tenantId}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSubscriptions = async (req, res, pool) => {
  try {
    let query = 'SELECT * FROM Subscription';
    let params = [];
    if (req.user.role !== 'SUPER_ADMIN') {
      query += ' WHERE tenantId = ?';
      params.push(req.user.tenantId);
    }
    const [subs] = await pool.query(query, params);
    res.json(subs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.saveSubscription = async (req, res, pool) => {
  const { tenantId, planName, status, razorpaySubscriptionId, currentPeriodEnd } = req.body;
  const targetTenant = req.user.role === 'SUPER_ADMIN' ? tenantId : req.user.tenantId;
  if (!targetTenant || !planName || !status) return res.status(400).json({ error: 'Missing required fields' });

  try {
    await pool.query(
      `INSERT INTO Subscription (tenantId, planName, status, razorpaySubscriptionId, currentPeriodEnd) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE planName = VALUES(planName), status = VALUES(status), currentPeriodEnd = VALUES(currentPeriodEnd)`,
      [targetTenant, planName, status, razorpaySubscriptionId || null, currentPeriodEnd || null]
    );
    res.json({ message: 'Subscription saved successfully', tenantId: targetTenant, planName, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createRazorpayOrder = async (req, res, pool) => {
  const { selectedModules } = req.body;
  if (!selectedModules || selectedModules.length === 0) return res.status(400).json({ error: 'Please select at least one module.' });

  try {
    const [dbModules] = await pool.query('SELECT moduleKey, price FROM ProductModule WHERE moduleKey IN (?) AND status = "ACTIVE"', [selectedModules]);
    if (dbModules.length === 0) return res.status(400).json({ error: 'Invalid modules selected.' });

    let totalAmount = 0;
    dbModules.forEach(mod => { totalAmount += parseFloat(mod.price); });

    const options = {
      amount: totalAmount * 100,
      currency: 'INR',
      receipt: `receipt_tenant_${req.user.tenantId}_${Date.now()}`,
      notes: { tenantId: req.user.tenantId, modules: JSON.stringify(selectedModules) }
    };

    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPermissions = async (req, res, pool) => {
  try {
    const [perms] = await pool.query('SELECT * FROM RolePermission');
    res.json(perms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.assignPermission = async (req, res, pool) => {
  const { role, permission } = req.body;
  if (!role || !permission) return res.status(400).json({ error: 'Role and permission required' });
  try {
    const [result] = await pool.query('INSERT INTO RolePermission (role, permission) VALUES (?, ?)', [role, permission]);
    res.status(201).json({ id: result.insertId, role, permission });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAuditLogs = async (req, res, pool) => {
  try {
    const [logs] = await pool.query('SELECT * FROM AuditLog ORDER BY createdAt DESC LIMIT 100');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createAuditLog = async (req, res, pool) => {
  const { action, details } = req.body;
  if (!action) return res.status(400).json({ error: 'Action is required' });
  try {
    const [result] = await pool.query('INSERT INTO AuditLog (userId, action, details) VALUES (?, ?, ?)', [req.user.userId, action, details || null]);
    res.status(201).json({ id: result.insertId, userId: req.user.userId, action, details });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getActiveModules = async (req, res, pool) => {
  try {
    const [modules] = await pool.query('SELECT id, moduleKey, displayName, description, price, status FROM ProductModule WHERE status = "ACTIVE"');
    res.json(modules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getMyTenantModules = async (req, res, pool) => {
  try {
    const tenantId = req.user.tenantId;
    const [modules] = await pool.query(
      `SELECT m.moduleKey, m.displayName, m.description, tm.status FROM TenantModule tm JOIN ProductModule m ON tm.moduleName = m.moduleKey WHERE tm.tenantId = ? AND tm.status = 'ACTIVE'`,
      [tenantId]
    );
    res.json(modules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllModules = async (req, res, pool) => {
  try {
    const [modules] = await pool.query('SELECT * FROM ProductModule');
    res.json(modules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createModule = async (req, res, pool) => {
  const { moduleKey, displayName, description, price } = req.body;
  if (!moduleKey || !displayName || price === undefined) return res.status(400).json({ error: 'moduleKey, displayName, and price are required.' });

  try {
    const [result] = await pool.query(
      'INSERT INTO ProductModule (moduleKey, displayName, description, price, status) VALUES (?, ?, ?, ?, "ACTIVE")',
      [moduleKey.toUpperCase(), displayName, description || '', price]
    );
    res.status(201).json({ message: 'Product module created successfully', moduleId: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'A module with this key already exists.' });
    res.status(500).json({ error: error.message });
  }
};

exports.updateModule = async (req, res, pool) => {
  const { id } = req.params;
  const { displayName, description, price, status } = req.body;
  try {
    await pool.query(
      `UPDATE ProductModule SET displayName = COALESCE(?, displayName), description = COALESCE(?, description), price = COALESCE(?, price), status = COALESCE(?, status) WHERE id = ?`,
      [displayName, description, price, status, id]
    );
    res.json({ message: 'Product module updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.razorpayWebhook = async (req, res, pool, logAudit) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (webhookSecret) {
    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');
    if (digest !== signature) return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body.event;
  const payload = req.body.payload;

  try {
    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payment.entity;
      const notes = paymentEntity.notes || {};
      const tenantId = notes.tenantId;
      const planName = notes.planName || 'PRO';

      if (tenantId) {
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + 30);

        await pool.query(
          `INSERT INTO Subscription (tenantId, planName, status, razorpaySubscriptionId, currentPeriodEnd) VALUES (?, ?, 'ACTIVE', ?, ?) ON DUPLICATE KEY UPDATE planName = VALUES(planName), status = 'ACTIVE', razorpaySubscriptionId = VALUES(razorpaySubscriptionId), currentPeriodEnd = VALUES(currentPeriodEnd)`,
          [tenantId, planName, paymentEntity.order_id, periodEnd]
        );

        await logAudit(null, 'SUBSCRIPTION_ACTIVATED', `Tenant ID ${tenantId} activated on plan ${planName} via Razorpay order ${paymentEntity.order_id}`);
      }
    }
    res.json({ status: 'ok' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 1. Get all users belonging to the current tenant
exports.getTenantUsers = async (req, res, pool) => {
  try {
    const tenantId = req.user.tenantId;
    const [users] = await pool.query(
      `SELECT id, name, email, role, createdAt FROM User WHERE tenantId = ? ORDER BY createdAt DESC`,
      [tenantId]
    );
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 2. Create a new user inside the tenant organization
exports.createTenantUser = async (req, res, pool) => {
  const { name, email, password, roles } = req.body;
  
  // If Super Admin, they might pass a tenantId; otherwise, enforce the requester's tenantId
  const tenantId = req.user.role === 'SUPER_ADMIN' && req.body.tenantId ? req.body.tenantId : req.user.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: 'Tenant context is required to create a user' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingUser] = await connection.query('SELECT id FROM User WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      connection.release();
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const primaryRole = roles && roles.length ? roles[0] : 'USER';
    
    const [userResult] = await connection.query(
      'INSERT INTO User (name, email, password, role, tenantId) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, primaryRole, tenantId]
    );
    const userId = userResult.insertId;

    // Insert all selected roles into UserRoles junction table
    if (roles && roles.length > 0) {
      for (const roleName of roles) {
        await connection.query(
          'INSERT IGNORE INTO UserRoles (userId, roleName) VALUES (?, ?)',
          [userId, roleName]
        );
      }
    }

    await connection.commit();
    connection.release();
    res.status(201).json({ message: 'User created successfully', userId });
  } catch (error) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: error.message });
  }
};

// 3. Delete a tenant user
exports.deleteTenantUser = async (req, res, pool) => {
  const userId = req.params.id;
  const tenantId = req.user.tenantId;

  try {
    await pool.query(`DELETE FROM User WHERE id = ? AND tenantId = ?`, [userId, tenantId]);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 1. Get unique system roles from RolePermission filtered by tenant's active module keys
exports.getAvailableRoles = async (req, res, pool) => {
  try {
    const { moduleKeys } = req.query;
    let query = 'SELECT DISTINCT role FROM RolePermission';
    let params = [];

    if (moduleKeys) {
      // Split comma-separated module keys into an array
      const keysArray = moduleKeys.split(',').map(k => k.trim()).filter(Boolean);

      if (keysArray.length > 0) {
        // Construct parameterized IN clause safely
        query += ` WHERE moduleKey IN (${keysArray.map(() => '?').join(',')})`;
        params = keysArray;
      }
    }

    query += ' ORDER BY role ASC';

    const [roles] = await pool.query(query, params);
    res.json(roles.map(r => r.role));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 2. Get roles assigned to a specific user
exports.getUserRoles = async (req, res, pool) => {
  try {
    const userId = req.params.id;
    const [roles] = await pool.query('SELECT roleName FROM UserRoles WHERE userId = ?', [userId]);
    res.json(roles.map(r => r.roleName));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 3. Update roles for a specific user
exports.updateUserRoles = async (req, res, pool) => {
  const userId = req.params.id;
  const { roles } = req.body; // Expects an array of role strings e.g. ['TEACHER', 'ADMIN']
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Clear existing roles
    await connection.query('DELETE FROM UserRoles WHERE userId = ?', [userId]);
    
    // Insert new roles
    if (roles && roles.length > 0) {
      for (const role of roles) {
        await connection.query('INSERT INTO UserRoles (userId, roleName) VALUES (?, ?)', [userId, role]);
      }
    }
    
    await connection.commit();
    connection.release();
    res.json({ message: 'User roles updated successfully' });
  } catch (error) {
    await connection.rollback();
    connection.release();
    res.status(500).json({ error: error.message });
  }
};