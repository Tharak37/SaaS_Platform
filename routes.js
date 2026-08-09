const express = require('express');
const multer = require('multer');
const path = require('path');
const controller = require('./controller');

const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = (pool, io) => {
  const router = express.Router();
  const bcrypt = require('bcryptjs');
  // ==========================================
  // MIDDLEWARES
  // ==========================================
  const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token missing' });

    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: 'Invalid or expired token' });
      req.user = user;
      next();
    });
  };

  const requireSuperAdmin = (req, res, next) => {
    if (req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Super Admin access required' });
    }
    next();
  };

const tenantIsolation = (req, res, next) => {
    // Gracefully handle if req or req.user is undefined
    if (!req || !req.user) return next();

    const isSuperAdmin = req.user.role === 'SUPER_ADMIN';
    const userTenantId = req.user.tenantId;

    req.tenantId = userTenantId;

    req.tenantFilter = (tableAlias = '') => {
      const prefix = tableAlias ? `${tableAlias}.` : '';
      if (isSuperAdmin) return { clause: '', params: [] };
      return { clause: `WHERE ${prefix}tenantId = ?`, params: [userTenantId] };
    };

    req.verifyTenantAccess = async (pool, tableName, resourceId) => {
      if (isSuperAdmin) return true;
      const [rows] = await pool.query(`SELECT tenantId FROM ?? WHERE id = ?`, [tableName, resourceId]);
      if (rows.length === 0 || rows[0].tenantId !== userTenantId) return false;
      return true;
    };

    req.injectTenant = (payload) => {
      if (isSuperAdmin) return payload;
      return { ...payload, tenantId: userTenantId };
    };

    next();
  };

  const checkPermission = (moduleKey, requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Super admins bypass all permission checks
      if (req.user && req.user.role === 'SUPER_ADMIN') {
        return next();
      }

      if (!req.user || !req.user.role) {
        return res.status(403).json({ error: 'Access denied: No role assigned' });
      }

      const userRole = req.user.role;
      const pool = req.app.locals.pool;

      // Query database dynamically for role permission mapping scoped by moduleKey
      const [rows] = await pool.query(
        `SELECT id FROM RolePermission WHERE moduleKey = ? AND role = ? AND permission = ?`,
        [moduleKey, userRole, requiredPermission]
      );

      if (rows.length === 0) {
        return res.status(403).json({ 
          error: `Access denied: Role '${userRole}' lacks permission '${requiredPermission}' for module '${moduleKey}'` 
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({ error: 'Permission check failed: ' + error.message });
    }
  };
  };

  const requireAdminOrSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const userRole = req.user.role;
  // Allow if user is Super Admin or Tenant Admin
  if (userRole === 'SUPER_ADMIN' || userRole === 'ADMIN') {
    return next();
  }

  return res.status(403).json({ error: 'Access denied: Administrator privileges required' });
};

  const requireModuleAccess = (requiredModule) => {
    return async (req, res, next) => {
      try {
        const tenantId = req.user.tenantId;
        const [rows] = await pool.query(
          'SELECT * FROM TenantModule WHERE tenantId = ? AND moduleName = ? AND status = "ACTIVE"',
          [tenantId, requiredModule.toUpperCase()]
        );
        if (rows.length === 0) {
          return res.status(403).json({ error: `Module '${requiredModule}' is not active or subscribed.` });
        }
        next();
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };
  };

  const logAudit = async (userId, action, details) => {
    await controller.logAudit(pool, userId, action, details);
  };

  // Expose middlewares for external modules
  router.authenticateToken = authenticateToken;
  router.tenantIsolation = tenantIsolation;
  router.requireModuleAccess = requireModuleAccess;
  router.checkPermission = checkPermission;
  router.logAudit = logAudit;

  // ==========================================
  // AUTHENTICATION & PROFILE ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/auth/login:
   *   post:
   *     summary: Authenticate user & return JWT
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 example: admin@tenant.com
   *               password:
   *                 type: string
   *                 example: Admin@123
   *     responses:
   *       200:
   *         description: Login successful
   */
  router.post('/auth/login', (req, res) => controller.login(req, res, pool));

  /**
   * @swagger
   * /api/auth/register:
   *   post:
   *     summary: Register a new tenant and their admin user
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenantName:
   *                 type: string
   *                 example: "InnoTech Solutions"
   *               subdomain:
   *                 type: string
   *                 example: "innotech"
   *               adminName:
   *                 type: string
   *                 example: "John Doe"
   *               adminEmail:
   *                 type: string
   *                 example: "john@innotech.com"
   *               adminPassword:
   *                 type: string
   *                 example: "Admin@123"
   *     responses:
   *       201:
   *         description: Tenant and Admin user created successfully
   */
  router.post('/auth/register', (req, res) => controller.registerTenant(req, res, pool, logAudit));

  /**
   * @swagger
   * /api/auth/forgot-password:
   *   post:
   *     summary: Request password reset token via email
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 example: user@tenant.com
   *     responses:
   *       200:
   *         description: Password reset link sent successfully
   */
  router.post('/auth/forgot-password', (req, res) => controller.forgotPassword(req, res, pool));

  /**
   * @swagger
   * /api/auth/reset-password:
   *   post:
   *     summary: Complete password reset using token
   *     tags: [Authentication]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               token:
   *                 type: string
   *               newPassword:
   *                 type: string
   *                 example: "NewPassword@123"
   *     responses:
   *       200:
   *       
   *         description: Password successfully reset
   */
  router.post('/api/auth/reset-password', (req, res) => controller.resetPassword(req, res, pool));

  /**
   * @swagger
   * /api/auth/me:
   *   get:
   *     summary: Get currently authenticated user profile and tenant information
   *     tags: [Authentication]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User profile retrieved successfully
   */
  router.get('/auth/me', authenticateToken, (req, res) => controller.getProfile(req, res, pool));


/**
   * @swagger
   * /api/roles:
   *   get:
   *     summary: Get all available system roles
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of available roles
   */
  router.get('/roles', authenticateToken, tenantIsolation, (req, res) => controller.getAvailableRoles(req, res, pool));

  /**
   * @swagger
   * /api/tenant/users/{id}/roles:
   *   get:
   *     summary: Get roles assigned to a user
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: List of assigned roles
   */
  router.get('/tenant/users/:id/roles', authenticateToken, tenantIsolation, (req, res) => controller.getUserRoles(req, res, pool));

  /**
   * @swagger
   * /api/tenant/users/{id}/roles:
   *   put:
   *     summary: Update roles for a user
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               roles:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["ADMIN", "TEACHER"]
   *     responses:
   *       200:
   *         description: Roles updated successfully
   */
  router.put('/tenant/users/:id/roles', authenticateToken, tenantIsolation, (req, res) => controller.updateUserRoles(req, res, pool));
  // ==========================================
  // FILE MANAGEMENT ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/files/upload:
   *   post:
   *     summary: Upload a multi-tenant file attachment
   *     tags: [Files]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               file:
   *                 type: string
   *                 format: binary
   *     responses:
   *       201:
   *         description: File uploaded successfully
   */
  router.post('/files/upload', authenticateToken, tenantIsolation, upload.single('file'), (req, res) => controller.uploadFile(req, res, pool));


  // ==========================================
  // TENANT SETTINGS ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/settings:
   *   get:
   *     summary: Get tenant configuration settings
   *     tags: [Settings]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Tenant settings retrieved successfully
   *   put:
   *     summary: Update tenant configuration settings
   *     tags: [Settings]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               theme:
   *                 type: string
   *                 example: "light"
   *               timezone:
   *                 type: string
   *                 example: "UTC"
   *               language:
   *                 type: string
   *                 example: "en"
   *     responses:
   *       200:
   *         description: Settings updated successfully
   */
  router.get('/settings', authenticateToken, tenantIsolation, (req, res) => controller.getSettings(req, res, pool));
  router.put('/settings', authenticateToken, tenantIsolation, (req, res) => controller.updateSettings(req, res, pool));


  // ==========================================
  // TENANT MANAGEMENT ROUTES (SUPER ADMIN)
  // ==========================================

  /**
   * @swagger
   * /api/tenants:
   *   get:
   *     summary: Get all tenants (Super Admin only)
   *     tags: [Tenants]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of tenants retrieved
   *   post:
   *     summary: Create a new tenant (Super Admin only)
   *     tags: [Tenants]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *                 example: "Acme Corp"
   *               subdomain:
   *                 type: string
   *                 example: "acme"
   *     responses:
   *       201:
   *         description: Tenant created successfully
   */
  router.get('/tenants', authenticateToken, requireSuperAdmin, (req, res) => controller.getTenants(req, res, pool));
  router.post('/tenants', authenticateToken, requireSuperAdmin, (req, res) => controller.createTenant(req, res, pool, logAudit));


  // ==========================================
  // USER MANAGEMENT ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/users:
   *   get:
   *     summary: Get users list (Tenant scoped)
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of users retrieved
   *   post:
   *     summary: Create a new user under tenant scope
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 example: "user@tenant.com"
   *               password:
   *                 type: string
   *                 example: "Password123"
   *               name:
   *                 type: string
   *                 example: "Jane Doe"
   *               role:
   *                 type: string
   *                 example: "EMPLOYEE"
   *     responses:
   *       201:
   *         description: User created successfully
   */
  router.get('/users', authenticateToken, tenantIsolation, (req, res) => controller.getUsers(req, res, pool));
  router.post('/users', authenticateToken, tenantIsolation, checkPermission('CORE','MANAGE_USERS'), (req, res) => controller.createUser(req, res, pool, logAudit));

  // ==========================================
  // TENANT MODULES ROUTES (SUPER ADMIN)
  // ==========================================

  /**
   * @swagger
   * /api/tenant-modules:
   *   get:
   *     summary: Get all tenants with their assigned modules (Super Admin only)
   *     tags: [Platform Administration]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of tenants with their modules retrieved successfully
   */
  router.get('/tenant-modules', authenticateToken, requireSuperAdmin, (req, res) => controller.getTenantModules(req, res, pool));

  /**
   * @swagger
   * /api/admin/tenant-modules:
   *   post:
   *     summary: Assign or activate a product module for a tenant (Super Admin only)
   *     tags: [Platform Administration]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - tenantId
   *               - moduleName
   *             properties:
   *               tenantId:
   *                 type: integer
   *                 example: 2
   *               moduleName:
   *                 type: string
   *                 example: "HRMS"
   *               status:
   *                 type: string
   *                 enum: [ACTIVE, SUSPENDED]
   *                 example: "ACTIVE"
   *     responses:
   *       200:
   *         description: Module updated successfully
   */
  router.post('/admin/tenant-modules', authenticateToken, requireSuperAdmin, (req, res) => controller.assignTenantModule(req, res, pool));


  // ==========================================
  // SUBSCRIPTIONS & RAZORPAY ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/subscriptions:
   *   get:
   *     summary: Get tenant subscription details
   *     tags: [Subscriptions]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Subscription info retrieved successfully
   *   post:
   *     summary: Create or update a subscription plan
   *     tags: [Subscriptions]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tenantId:
   *                 type: integer
   *                 example: 1
   *               planName:
   *                 type: string
   *                 example: "PRO"
   *               status:
   *                 type: string
   *                 example: "ACTIVE"
   *     responses:
   *       200:
   *         description: Subscription saved successfully
   */
  router.get('/subscriptions', authenticateToken, tenantIsolation, (req, res) => controller.getSubscriptions(req, res, pool));
  router.post('/subscriptions', authenticateToken, (req, res) => controller.saveSubscription(req, res, pool));

  /**
   * @swagger
   * /api/subscriptions/create-order:
   *   post:
   *     summary: Create a Razorpay checkout order for multi-module subscription
   *     tags: [Subscriptions]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - selectedModules
   *             properties:
   *               selectedModules:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["HRMS", "GATEPASS"]
   *     responses:
   *       200:
   *         description: Razorpay order created successfully
   */
  router.post('/subscriptions/create-order', authenticateToken, (req, res) => controller.createRazorpayOrder(req, res, pool));


  // ==========================================
  // ROLE PERMISSIONS ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/permissions:
   *   get:
   *     summary: Get role permission matrices
   *     tags: [Permissions]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of permissions retrieved successfully
   *   post:
   *     summary: Assign a permission to a role (Super Admin only)
   *     tags: [Permissions]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               role:
   *                 type: string
   *                 example: "ADMIN"
   *               permission:
   *                 type: string
   *                 example: "MANAGE_HRMS"
   *     responses:
   *       201:
   *         description: Permission assigned successfully
   */
  router.get('/permissions', authenticateToken, (req, res) => controller.getPermissions(req, res, pool));
  router.post('/permissions', authenticateToken, requireSuperAdmin, (req, res) => controller.assignPermission(req, res, pool));


  // ==========================================
  // AUDIT LOGS ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/audit-logs:
   *   get:
   *     summary: Get system audit logs (Super Admin only)
   *     tags: [AuditLogs]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of audit logs retrieved
   *   post:
   *     summary: Create an audit log entry
   *     tags: [AuditLogs]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               action:
   *                 type: string
   *                 example: "CUSTOM_ACTION"
   *               details:
   *                 type: string
   *                 example: "Detailed audit event string"
   *     responses:
   *       201:
   *         description: Audit log created successfully
   */
  router.get('/audit-logs', authenticateToken, requireSuperAdmin, (req, res) => controller.getAuditLogs(req, res, pool));
  router.post('/audit-logs', authenticateToken, (req, res) => controller.createAuditLog(req, res, pool));


  // ==========================================
  // PRODUCT MODULES CATALOG ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/modules:
   *   get:
   *     summary: Get all active product modules
   *     tags: [Product Modules]
   *     responses:
   *       200:
   *         description: List of active modules retrieved
   */
  router.get('/modules', (req, res) => controller.getActiveModules(req, res, pool));

  /**
   * @swagger
   * /api/tenant/my-modules:
   *   get:
   *     summary: Get active product modules for current tenant
   *     tags: [Product Modules]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of tenant modules retrieved
   */
  router.get('/tenant/my-modules', authenticateToken, (req, res) => controller.getMyTenantModules(req, res, pool));

  /**
   * @swagger
   * /api/admin/modules:
   *   get:
   *     summary: Get all modules including discontinued (Super Admin only)
   *     tags: [Product Modules]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Full list of modules retrieved
   *   post:
   *     summary: Create a new product module (Super Admin only)
   *     tags: [Product Modules]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - moduleKey
   *               - displayName
   *               - price
   *             properties:
   *               moduleKey:
   *                 type: string
   *                 example: "INVENTORY"
   *               displayName:
   *                 type: string
   *                 example: "Inventory Management"
   *               description:
   *                 type: string
   *                 example: "Stock tracking and warehouse control"
   *               price:
   *                 type: number
   *                 example: 750.00
   *     responses:
   *       201:
   *         description: Module created successfully
   */
  router.get('/admin/modules', authenticateToken, requireSuperAdmin, (req, res) => controller.getAllModules(req, res, pool));
  router.post('/admin/modules', authenticateToken, requireSuperAdmin, (req, res) => controller.createModule(req, res, pool));

  /**
   * @swagger
   * /api/admin/modules/{id}:
   *   put:
   *     summary: Update an existing product module price or status (Super Admin only)
   *     tags: [Product Modules]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               displayName:
   *                 type: string
   *               description:
   *                 type: string
   *               price:
   *                 type: number
   *               status:
   *                 type: string
   *                 enum: [ACTIVE, DISCONTINUED]
   *     responses:
   *       200:
   *         description: Module updated successfully
   */
  router.put('/admin/modules/:id', authenticateToken, requireSuperAdmin, (req, res) => controller.updateModule(req, res, pool));


  // ==========================================
  // WEBHOOKS ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/webhooks/razorpay:
   *   post:
   *     summary: Razorpay Webhook listener for automatic subscription activation
   *     tags: [Subscriptions]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     responses:
   *       200:
   *         description: Webhook received and processed successfully
   */
  router.post('/webhooks/razorpay', (req, res) => controller.razorpayWebhook(req, res, pool, logAudit));
  
  
  // ==========================================
  // TENANT USER & ROLE MANAGEMENT ROUTES
  // ==========================================

  /**
   * @swagger
   * /api/tenant/users:
   *   get:
   *     summary: Get all users belonging to the logged-in tenant organization
   *     tags: [Tenant User Management]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of tenant users retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: array
   *               items:
   *                 $ref: '#/components/schemas/TenantUser'
   *       401:
   *         description: Unauthorized token or missing credentials
   *   post:
   *     summary: Create a new employee/user account within the tenant organization
   *     tags: [Tenant User Management]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - name
   *               - email
   *               - password
   *               - role
   *             properties:
   *               name:
   *                 type: string
   *                 example: "Ramesh Naidu"
   *               email:
   *                 type: string
   *                 example: "ramesh@company.com"
   *               password:
   *                 type: string
   *                 example: "SecurePass123"
   *               role:
   *                 type: string
   *                 enum: [ADMIN, MANAGER, TECHNICIAN, CASHIER, STORE_KEEPER]
   *                 example: "TECHNICIAN"
   *     responses:
   *       201:
   *         description: Tenant user created successfully
   *       400:
   *         description: Missing fields or email already exists
   */
    // router.get('/tenant/users', authenticateToken, tenantIsolation, controller.getTenantUsers);
    router.get('/tenant/users', authenticateToken, tenantIsolation, (req, res) => controller.getTenantUsers(req, res, pool));
    router.post('/tenant/users', authenticateToken, tenantIsolation, requireAdminOrSuperAdmin, (req, res) => controller.createTenantUser(req, res, pool));

  /**
   * @swagger
   * /api/tenant/users/{id}:
   *   delete:
   *     summary: Delete a user account from the tenant organization
   *     tags: [Tenant User Management]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *         description: User ID to delete
   *     responses:
   *       200:
   *         description: User deleted successfully
   *       404:
   *         description: User not found
   */
  router.delete('/tenant/users/:id', authenticateToken, tenantIsolation, checkPermission('CORE', 'MANAGE_USERS'), (req, res) => controller.deleteTenantUser(req, res, pool));


  
  
  return router;
};