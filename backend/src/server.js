/**
 * Docwise Backend Server - Enterprise Edition
 * Optimized for Scalability, Security, and 100k+ Users
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const pino = require('pino-http');
require('dotenv').config();

// Service Imports
const db = require('./db');
const authRoutes = require('./routes/auth');
const summaryRoutes = require('./routes/summaries');
const adminRoutes = require('./routes/admin');
const { authenticate } = require('./middleware/authenticate');
const errorHandler = require('./middleware/errorMiddleware');
const { AppError, asyncHandler } = errorHandler;

// 1. Optimized Logging Configuration
const logger = pino({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    // transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

const app = express();
const PORT = process.env.PORT || 5000;

// ============ INFRASTRUCTURE SETTINGS ============

// Necessary if you are behind a reverse proxy (Nginx, Heroku, AWS ELB, Cloudflare)
// This ensures 'req.ip' is correct for rate limiting.
app.set('trust proxy', 1);

// ============ SECURITY & PERFORMANCE ============

// 2. Hardened Security Headers
app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false, // Adjust CSP for production
    crossOriginEmbedderPolicy: false,
}));

// 3. Response Compression
app.use(compression());

// 4. Scalable Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, 
    standardHeaders: 'draft-7', // Modern industry standard
    legacyHeaders: false,
    message: { 
        error: 'Too many requests', 
        message: 'Rate limit exceeded. Please try again later.' 
    },
    // Use RedisStore here when scaling to multiple server instances
});
app.use('/api/', globalLimiter);

// 5. Async Logging
app.use(logger);

// ============ MIDDLEWARE ============

// 6. Hardened CORS Policy
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'];
app.use(cors({
    origin: (origin, callback) => {
        // Allow all in development if * is used
        if (process.env.CORS_ORIGIN === '*' || !origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('CORS Policy Violation'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '1mb' })); // Strict limit for JSON payloads
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ============ API ROUTES ============
app.use((req, res, next) => {
    if (req.url.includes('/api/summaries/')) {
        console.log(`[DEBUG] Summary Request: ${req.method} ${req.url}`);
    }
    next();
});

app.use('/api/auth', authRoutes);
app.use('/api/summaries', summaryRoutes);
app.use('/api/admin', adminRoutes);

// Health Check with Database Connectivity Verification
app.get('/health', async (req, res) => {
    try {
        const dbStatus = await db.getConnectionStatus(); 
        res.status(dbStatus ? 200 : 503).json({ 
            status: dbStatus ? 'healthy' : 'degraded',
            env: process.env.NODE_ENV,
            uptime: `${Math.round(process.uptime())}s`,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(503).json({ status: 'unhealthy', error: err.message });
    }
});

// Fallback for 404 - Handle non-existent routes
app.all('*', (req, res, next) => {
    next(AppError.notFound(`Cannot find ${req.originalUrl} on this server`));
});

// Global Error Handler
app.use(errorHandler);

// ============ BOOTSTRAP & GRACEFUL SHUTDOWN ============

let server;

const startServer = async () => {
    try {
        await db.initDb();
        server = app.listen(PORT, () => {
            console.log(`🚀 Docwise API [${process.env.NODE_ENV || 'development'}] running on port ${PORT}`);
        });
    } catch (err) {
        console.error('❌ Critical Startup Failure:', err.message);
        process.exit(1);
    }
};

// Error Handling for process-level events
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    if (server) server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
    console.info('SIGTERM received. Shutting down gracefully...');
    if (server) {
        server.close(() => {
            console.log('HTTP server closed.');
            db.closeConnection(); // Ensure this function exists in your db.js
        });
    }
});

startServer();