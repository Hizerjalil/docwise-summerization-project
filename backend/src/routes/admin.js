const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate } = require('../middleware/authenticate');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');

// Middleware to ensure user is admin
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    next(AppError.unauthorized('Access denied. Admin privileges required.'));
};

router.use(authenticate);
router.use(isAdmin);

/**
 * GET /api/admin/users
 */
router.get('/users', asyncHandler(async (req, res) => {
    const { rows } = await db.query('User', {}, 'find', { select: '-password' });
    res.json(rows);
}));

/**
 * PUT /api/admin/users/:id
 */
router.put('/users/:id', asyncHandler(async (req, res) => {
    const { is_admin } = req.body;
    const { rows } = await db.query('User', { _id: req.params.id, is_admin }, 'updateOne');
    res.json({ success: true, user: rows[0] });
}));

/**
 * DELETE /api/admin/users/:id
 */
router.delete('/users/:id', asyncHandler(async (req, res) => {
    const { rowCount } = await db.query('User', { _id: req.params.id }, 'deleteOne');
    res.json({ success: true, count: rowCount });
}));

/**
 * GET /api/admin/summaries
 */
router.get('/summaries', asyncHandler(async (req, res) => {
    // Populate user names if possible
    const { rows } = await db.query('Summary', {}, 'find');
    res.json(rows);
}));

/**
 * DELETE /api/admin/summaries/:id
 */
router.delete('/summaries/:id', asyncHandler(async (req, res) => {
    const { rowCount } = await db.query('Summary', { _id: req.params.id }, 'deleteOne');
    res.json({ success: true, count: rowCount });
}));

module.exports = router;