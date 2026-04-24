const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Top-level imports for performance
const authController = require('../controllers/authController');
const { authenticate, blacklistToken } = require('../middleware/authenticate');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');

// ============ RATE LIMITERS ============
const createLimiter = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    // Note: In production, the default 'MemoryStore' will leak memory.
    // Ensure you link RedisStore here for 100k+ user scalability.
});

const authLimiter = createLimiter(15 * 60 * 1000, 1000, 'Too many login attempts.');
const resetLimiter = createLimiter(60 * 60 * 1000, 1000, 'Too many reset requests.');

// ============ REFINED VALIDATION ============
const validateRegister = (req, res, next) => {
    const { username, email, password } = req.body;
    
    if (!username || username.trim().length < 3) throw AppError.badRequest('Username must be 3+ characters');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw AppError.badRequest('Invalid email format');
    
    // Hardened Regex: 8+ chars, 1 Uppercase, 1 Lowercase, 1 Number
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!passRegex.test(password)) {
        throw AppError.badRequest('Password must be 8+ characters with uppercase, lowercase, and a number');
    }
    next();
};

// ============ ROUTES ============

// Public
router.post('/register', authLimiter, validateRegister, asyncHandler(authController.register));
router.post('/login', authLimiter, asyncHandler(authController.login));

// Recovery
router.post('/forgot-password', resetLimiter, asyncHandler(authController.forgotPassword));
router.post('/verify-otp', resetLimiter, asyncHandler(authController.verifyOTP));
router.post('/reset-password', resetLimiter, asyncHandler(authController.resetPassword));

// Protected
router.use(authenticate); 

router.get('/profile', asyncHandler(authController.getProfile));
router.put('/profile', asyncHandler(authController.updateProfile));
router.put('/change-password', authLimiter, asyncHandler(authController.changePassword));

router.post('/logout', asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
        // blacklistToken must be an async function connected to Redis
        await blacklistToken(token, req.user.id);
    }
    
    res.status(200).json({ success: true, message: 'Logged out successfully' });
}));

module.exports = router;