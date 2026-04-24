const mongoose = require('mongoose');

// --- Configuration ---
const CONFIG = {
    ENV: process.env.NODE_ENV || 'development',
    STACK: process.env.INCLUDE_STACK_IN_DEV !== 'false',
    REDACT: ['password', 'token', 'secret', 'key', 'otp', 'api_key'],
    REPORTING: process.env.ENABLE_ERROR_REPORTING === 'true'
};

// ============ UTILS ============

/**
 * Fast redaction to prevent leaking PII in logs
 */
const redact = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const sanitized = { ...obj };
    for (const key of Object.keys(sanitized)) {
        if (CONFIG.REDACT.some(r => key.toLowerCase().includes(r))) {
            sanitized[key] = '[REDACTED]';
        }
    }
    return sanitized;
};

// ============ CUSTOM ERROR CLASS ============

class AppError extends Error {
    constructor(message, statusCode, type = 'application', meta = null) {
        super(message);
        this.statusCode = statusCode || 500;
        this.type = type;
        this.meta = meta;
        this.isOperational = true; // Flag for known vs unknown errors
        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(msg, meta) { return new AppError(msg, 400, 'validation', meta); }
    static unauthorized(msg = 'Auth required') { return new AppError(msg, 401, 'auth'); }
    static notFound(msg = 'Resource not found') { return new AppError(msg, 404, 'not_found'); }
}

// ============ MAIN MIDDLEWARE ============

const errorMiddleware = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // 1. Mongoose / DB Error Handling
    if (err.name === 'CastError') {
        err = AppError.badRequest(`Invalid ${err.path}: ${err.value}`, { path: err.path });
    }
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        err = new AppError(`${field} already exists`, 409, 'duplicate', { field });
    }
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(el => el.message);
        err = AppError.badRequest(`Validation failed: ${errors.join('. ')}`, { errors });
    }

    // 2. Production vs Development Output
    if (CONFIG.ENV === 'development') {
        return res.status(err.statusCode).json({
            status: err.status,
            type: err.type,
            error: err,
            message: err.message,
            stack: err.stack
        });
    }

    // 3. Production Response (Secure & Concise)
    // Don't leak details for 500 errors
    const isOperational = err.isOperational || false;
    
    if (!isOperational) {
        console.error('🔥 CRITICAL_BUG:', err); // Log for internal tracking
    }

    return res.status(err.statusCode).json({
        status: err.status,
        error: isOperational ? err.message : 'Internal server error',
        type: err.type || 'unknown',
        ...(err.meta && { details: redact(err.meta) }),
        request_id: req.headers['x-request-id']
    });
};

// ============ ASYNC WRAPPER ============
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = errorMiddleware;
module.exports.AppError = AppError;
module.exports.asyncHandler = asyncHandler;