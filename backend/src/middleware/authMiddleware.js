const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const db = require('../db');

// --- Configuration ---
const CONFIG = {
    SECRET: process.env.JWT_SECRET,
    ALGO: process.env.JWT_ALGORITHM || 'HS256',
    FRESH_USER: process.env.REQUIRE_FRESH_USER === 'true',
    BLACKLIST: process.env.ENABLE_TOKEN_BLACKLIST === 'true'
};

// Fail-fast on startup
if (!CONFIG.SECRET || CONFIG.SECRET.length < 32) {
    throw new Error('FATAL: JWT_SECRET is missing or too weak (min 32 chars).');
}

// ============ UTILS ============

const logAuth = (userId, success, reason, req) => {
    if (process.env.LOG_AUTH === 'false') return;
    
    // Fire-and-forget logging to avoid blocking response
    setImmediate(() => {
        console.log(`[AUTH_${success ? 'OK' : 'FAIL'}] User: ${userId || 'GUEST'} | Reason: ${reason} | IP: ${req.ip}`);
    });
};

// ============ MIDDLEWARE ============

const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication Required', message: 'Bearer token missing' });
        }

        const token = authHeader.split(' ')[1];

        // 1. Verify JWT Structure and Signature
        let decoded;
        try {
            decoded = jwt.verify(token, CONFIG.SECRET, { algorithms: [CONFIG.ALGO] });
        } catch (err) {
            const msg = err.name === 'TokenExpiredError' ? 'Session expired' : 'Invalid token';
            logAuth(null, false, err.name, req);
            return res.status(401).json({ error: 'Unauthorized', message: msg });
        }

        // 2. Blacklist Check (If enabled)
        if (CONFIG.BLACKLIST && decoded.jti) {
            // OPTIMIZATION: In 100k+ user apps, use Redis here: await redis.get(`bl_${decoded.jti}`)
            const { rows } = await db.query('TokenBlacklist', { token_id: decoded.jti }, 'findOne');
            if (rows.length > 0) {
                logAuth(decoded.id, false, 'TOKEN_REVOKED', req);
                return res.status(401).json({ error: 'Unauthorized', message: 'Token has been revoked' });
            }
        }

        // 3. User Resolution
        if (CONFIG.FRESH_USER) {
            const { rows } = await db.query('User', { _id: decoded.id }, 'findOne', {
                select: 'username email is_admin is_verified' 
            });
            
            if (!rows[0]) return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
            
            req.user = rows[0];
            req.user.id = rows[0]._id.toString();
        } else {
            req.user = { ...decoded, id: decoded.id };
        }

        // 4. Traceability
        req.token_id = decoded.jti;
        
        next();
    } catch (err) {
        console.error('Critical Auth Error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = authenticate;