const express = require('express');
const router = express.Router();
const summaryController = require('../controllers/summaryController');
const { authenticate } = require('../middleware/authenticate');
const { asyncHandler, AppError } = require('../middleware/errorMiddleware');
const db = require('../db');
const multer = require('multer');

// ============ FILE CONFIG ============
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB hard limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
            return cb(new AppError('Only text-based PDF files are supported', 400), false);
        }
        cb(null, true);
    }
});

// ============ ROUTES ============

router.use(authenticate); // Global auth for this router

// 1. GET /api/summaries (List)
router.get('/', asyncHandler(summaryController.getAllSummaries));

// 2. GET /api/summaries/:id (Details)
router.get('/:id', asyncHandler(async (req, res) => {
    const summaryId = req.params.id;
    
    // Direct lookup by ID
    const { rows } = await db.query('Summary', summaryId, 'findById');
    const summary = rows[0];
    
    if (!summary) {
        throw AppError.notFound('Summary not found');
    }

    // Manual security check: Ensure this summary belongs to the logged-in user
    if (summary.user_id.toString() !== req.user.id) {
        throw AppError.unauthorized('You do not have permission to view this summary');
    }
    
    res.json(summary);
}));

/**
 * DELETE /api/summaries/:id
 * Remove a summary
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { rowCount } = await db.query('Summary', { _id: req.params.id, user_id: req.user.id }, 'deleteOne');
    if (rowCount === 0) throw AppError.notFound('Summary not found or already deleted');
    res.json({ success: true });
}));

/**
 * POST /api/summaries/summarize
 */
router.post('/summarize', 
    upload.single('file'), 
    asyncHandler(async (req, res, next) => {
        const { text, detailLevel = 'concise' } = req.body;

        // 1. Structural Check
        if (!text && !req.file) {
            throw AppError.badRequest('No content provided for summarization');
        }

        // 2. Security: Prevent "Zip Bomb" or extremely long text
        if (text && text.length > 50000) {
            throw AppError.badRequest('Text exceeds maximum length (50k characters)');
        }

        // Forward to controller
        return summaryController.summarize(req, res, next);
    })
);

/**
 * GET /api/summaries/stats
 * Optimized Aggregation
 */
router.get('/stats', asyncHandler(async (req, res) => {
    const stats = await db.query('Summary', [
        { $match: { user_id: db.toObjectId(req.user.id) } },
        { 
            $group: {
                _id: '$mode',
                count: { $sum: 1 },
                avg_tokens: { $avg: '$token_count' }
            }
        }
    ], 'aggregate');

    res.json({
        success: true,
        data: stats.rows
    });
}));

module.exports = router;