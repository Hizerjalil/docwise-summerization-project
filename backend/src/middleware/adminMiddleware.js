const mongoose = require('mongoose');
const db = require('../db');

// --- Configuration ---
const CONFIG = {
    LOG_ENABLED: process.env.ADMIN_LOG_ENABLED !== 'false',
    STRICT_CHECK: process.env.STRICT_ADMIN_CHECK === 'true',
    ALLOW_UNVERIFIED: process.env.ALLOW_UNVERIFIED_ADMINS === 'true'
};

/**
 * Optimized Audit Logger
 * Uses process.nextTick to ensure it never blocks the Event Loop
 */
const logAdminAction = (userId, action, req) => {
    if (!CONFIG.LOG_ENABLED) return;

    process.nextTick(async () => {
        try {
            const logEntry = {
                admin_id: userId,
                action,
                path: req.originalUrl,
                method: req.method,
                ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
                timestamp: new Date()
            };
            // Standard Production Practice: Log to stdout for Logstash/Datadog/CloudWatch
            console.log(`[ADMIN_AUDIT] ${JSON.stringify(logEntry)}`);
        } catch (err) {
            console.error('📝 Audit Log Error:', err.message);
        }
    });
};

const adminMiddleware = async (req, res, next) => {
    try {
        // 1. Basic Auth Guard
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'Unauthorized', message: 'Auth token missing' });
        }

        // 2. Validate ObjectId (Prevent BSON injection/errors)
        if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden', message: 'Invalid identity format' });
        }

        let isAdmin = req.user.is_admin;
        let isVerified = req.user.is_verified;

        // 3. Strict DB Re-check (If high security is required)
        if (CONFIG.STRICT_CHECK) {
            const { rows } = await db.query('User', 
                { _id: req.user.id }, 
                'findOne', 
                { select: 'is_admin is_verified' }
            );
            
            const freshUser = rows[0];
            if (!freshUser) return res.status(403).json({ error: 'Forbidden', message: 'User no longer exists' });
            
            isAdmin = freshUser.is_admin;
            isVerified = freshUser.is_verified;
        }

        // 4. Final Permission Logic
        if (!isAdmin) {
            return res.status(403).json({ error: 'Forbidden', message: 'Admin privileges required' });
        }

        if (!CONFIG.ALLOW_UNVERIFIED && !isVerified) {
            return res.status(403).json({ error: 'Forbidden', message: 'Account must be verified' });
        }

        // 5. Context Injection
        req.admin = {
            id: req.user.id,
            level: 'root', // Future-proofing for multi-level admins
            timestamp: Date.now()
        };

        // 6. Non-blocking Audit
        logAdminAction(req.user.id, 'ACCESS_GRANTED', req);

        next();
        
    } catch (err) {
        console.error('🚨 Admin Middleware Failure:', err.stack);
        res.status(500).json({ error: 'Internal Server Error', message: 'Authorization service fault' });
    }
};

module.exports = adminMiddleware;