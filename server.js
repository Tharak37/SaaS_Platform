const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO on the HTTP server instance
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Native connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// File upload folder setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));
app.use('/modules', express.static('modules'));
app.use(express.static('public'));
app.use("/assets", express.static(path.join(__dirname, "assets")));
// ==========================================
// SWAGGER CONFIGURATION
// ==========================================
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SaaS Starter Kit API Suite',
      version: '1.0.0',
      description: 'Complete high-performance Express & MySQL API backend',
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  // 🛠️ FIX: Change wildcard to strictly target .js files and avoid parsing json files
  apis: ['./server.js', './routes.js', './modules/**/*.js'],
};

const masterSwagger = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(masterSwagger));

// ==========================================
// MOUNT MAIN ROUTES
// ==========================================
const apiRoutes = require('./routes')(pool, io);
app.use('/api', apiRoutes);

// Mount external sub-modules

const crmRoutes = require('./modules/crm/crm.routes')(
  pool, 
  apiRoutes.authenticateToken, 
  apiRoutes.tenantIsolation, 
  apiRoutes.requireModuleAccess, 
  apiRoutes.checkPermission, 
  apiRoutes.logAudit
);

const hospitalRoutes = require('./modules/hospital/hospital.routes')(
  pool, 
  apiRoutes.authenticateToken, 
  apiRoutes.tenantIsolation, 
  apiRoutes.requireModuleAccess, 
  apiRoutes.checkPermission, 
  apiRoutes.logAudit
);

app.use('/api/crm', apiRoutes.authenticateToken, apiRoutes.tenantIsolation, apiRoutes.requireModuleAccess('CRM'), crmRoutes);
app.use('/api/hospital', apiRoutes.authenticateToken, apiRoutes.tenantIsolation, apiRoutes.requireModuleAccess('HOSPITAL'), hospitalRoutes);

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️ Slow Request: ${req.method} ${req.originalUrl} took ${duration}ms`);
    }
  });
  next();
});
// ==========================================
// SYSTEM HEALTH CHECK
// ==========================================
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1 as status');
    res.json({ status: 'UP', database: 'Connected', uptime: process.uptime() });
  } catch (error) {
    res.status(503).json({ status: 'DOWN', error: error.message });
  }
});

// ==========================================
// START SERVER
// ==========================================
server.listen(PORT, () => {
  console.log(`🚀 Fast Server running locally on http://localhost:${PORT}`);
  console.log(`📄 Swagger Docs available at http://localhost:${PORT}/api-docs`);
});