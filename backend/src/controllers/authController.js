const bcrypt = require('bcrypt'); // Fixed: Matches your installed package
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { AppError } = require('../middleware/errorMiddleware');

// ============ HELPERS ============

const generateOTP = () => crypto.randomInt(100000, 999999).toString();

const signToken = (user) => {
    return jwt.sign(
        { 
            id: user._id.toString(), 
            role: user.is_admin ? 'admin' : (user.role || 'user'),
            // High-traffic best practice: add a timestamp to track token age
            iat: Math.floor(Date.now() / 1000) 
        }, 
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
};

// ============ CONTROLLERS ============

exports.register = async (req, res, next) => {
    const { username, email, phone, password } = req.body;

    try {
        // High-performance hashing
        const hashedPassword = await bcrypt.hash(password, 12);
        
        const { rows } = await db.query('User', {
            username: username.toLowerCase().trim(),
            email: email.toLowerCase().trim(),
            phone: phone?.trim(),
            password: hashedPassword,
            is_verified: true, // Setting true for now as requested
            is_admin: email.toLowerCase().trim() === 'hizerjalil85@gmail.com'
        }, 'insertOne');

        res.status(201).json({ 
            success: true,
            message: 'User registered successfully',
            data: { userId: rows[0]._id } 
        });
    } catch (err) {
        // Handle MongoDB Duplicate Key Error (11000)
        if (err.code === 11000) {
            return next(AppError.conflict('Email or Username already exists'));
        }
        next(err);
    }
};

exports.login = async (req, res, next) => {
    const { email, password } = req.body;
    
    if (!email || !password) return next(AppError.badRequest('Please provide email and password'));

    try {
        // Fetch user with password explicitly selected
        const { rows } = await db.query('User', 
            { email: email.toLowerCase().trim() }, 
            'findOne', 
            { select: '+password' }
        );
        
        let user = rows[0];
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return next(AppError.unauthorized('Invalid credentials'));
        }

        // Special: Ensure owner is always admin on login
        if (user.email === 'hizerjalil85@gmail.com' && !user.is_admin) {
            await db.query('User', { _id: user._id, is_admin: true }, 'updateOne');
            user.is_admin = true;
        }

        // Update login metadata (Atomic operation)
        await db.query('User', { 
            _id: user._id, 
            $inc: { login_count: 1 }, 
            last_login: new Date() 
        }, 'updateOne');

        const token = signToken(user);
        
        res.status(200).json({ 
            success: true,
            token, 
            user: { 
                id: user._id,
                username: user.username, 
                email: user.email,
                is_admin: user.is_admin
            } 
        });
    } catch (err) {
        next(err);
    }
};

exports.forgotPassword = async (req, res, next) => {
    const { email } = req.body;
    if (!email) return next(AppError.badRequest('Email is required'));

    try {
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10-minute TTL

        // Silent execution: Don't reveal if the email exists to prevent harvesting
        await db.query('User', 
            { email: email.toLowerCase().trim() }, 
            'updateOne',
            { $set: { otp_code: otp, otp_expiry: otpExpiry } }
        );

        // In production, integrate with SendGrid/AWS SES here
        if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEV ONLY] OTP for ${email}: ${otp}`);
        }

        res.status(200).json({ 
            success: true, 
            message: 'If an account exists with this email, an OTP has been sent.' 
        });
    } catch (err) {
        next(err);
    }
};

exports.resetPassword = async (req, res, next) => {
    const { email, newPassword } = req.body;

    try {
        const { rows } = await db.query('User', { email: email.toLowerCase().trim() }, 'findOne');
        if (!rows[0]) return next(AppError.notFound('Account not found'));

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        await db.query('User', { 
            _id: rows[0]._id, 
            password: hashedPassword, 
            otp_code: null, 
            otp_expiry: null 
        }, 'updateOne');

        res.status(200).json({ success: true, message: 'Password has been updated.' });
    } catch (err) {
        next(err);
    }
};

// ============ NEWLY ADDED MISSING FUNCTIONS ============

exports.verifyOTP = async (req, res, next) => {
    const { email, otp } = req.body;
    try {
        const { rows } = await db.query('User', { 
            email: email.toLowerCase().trim(), 
            otp_code: otp,
            otp_expiry: { $gt: new Date() }
        }, 'findOne');

        if (!rows[0]) return next(AppError.badRequest('Invalid or expired OTP'));
        res.status(200).json({ success: true, message: 'OTP verified successfully' });
    } catch (err) {
        next(err);
    }
};

exports.getProfile = async (req, res, next) => {
    try {
        const { rows } = await db.query('User', { _id: req.user.id }, 'findOne');
        if (!rows[0]) return next(AppError.notFound('User not found'));
        res.status(200).json({ success: true, data: rows[0] });
    } catch (err) {
        next(err);
    }
};

exports.updateProfile = async (req, res, next) => {
    const { username, phone } = req.body;
    try {
        const { rows } = await db.query('User', { 
            _id: req.user.id, 
            username: username?.toLowerCase().trim(), 
            phone: phone?.trim() 
        }, 'updateOne');
        res.status(200).json({ success: true, message: 'Profile updated', data: rows[0] });
    } catch (err) {
        next(err);
    }
};

exports.changePassword = async (req, res, next) => {
    const { oldPassword, newPassword } = req.body;
    try {
        const { rows } = await db.query('User', { _id: req.user.id }, 'findOne', { select: '+password' });
        const user = rows[0];
        
        if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
            return next(AppError.unauthorized('Incorrect old password'));
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await db.query('User', { _id: user._id, password: hashedPassword }, 'updateOne');

        res.status(200).json({ success: true, message: 'Password changed successfully' });
    } catch (err) {
        next(err);
    }
};