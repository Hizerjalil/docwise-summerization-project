const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

// 1. Connection Configuration
const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 50, // Increased for 100k+ users
            minPoolSize: 10,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB connected');
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        process.exit(1);
    }
};

// ============ USER SCHEMA ============
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true, minlength: 2, maxlength: 50, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    is_verified: { type: Boolean, default: true },
    is_admin: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Composite index for common queries
userSchema.index({ email: 1, is_verified: 1 });

const User = mongoose.model('User', userSchema);

// ============ SUMMARY SCHEMA ============
const summarySchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    text: { type: String, required: true },
    mode: { type: String, enum: ['text', 'upload'], default: 'text' },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

summarySchema.index({ title: 'text', text: 'text' }); // Full-text search

const Summary = mongoose.model('Summary', summarySchema);

// ============ QUERY ENGINE (Refactored) ============
const query = async (modelName, filters = {}, operation = 'find', options = {}) => {
    const Model = mongoose.model(modelName);
    
    // Auto-cast ID strings to ObjectIds for robustness
    if (filters && typeof filters === 'object') {
        if (filters._id && typeof filters._id === 'string' && mongoose.Types.ObjectId.isValid(filters._id)) {
            filters._id = new mongoose.Types.ObjectId(filters._id);
        }
        if (filters.user_id && typeof filters.user_id === 'string' && mongoose.Types.ObjectId.isValid(filters.user_id)) {
            filters.user_id = new mongoose.Types.ObjectId(filters.user_id);
        }
    }
    
    console.log(`[DB DEBUG] Model: ${modelName} | Op: ${operation} | Filters:`, JSON.stringify(filters));

    switch (operation) {
        case 'findOne':
            const found = await Model.findOne(filters).select(options.select || '').lean();
            console.log(`[DB DEBUG] FindOne Result: ${found ? 'FOUND' : 'NOT FOUND'}`);
            return { rows: found ? [found] : [] };
            
        case 'findById':
            if (!mongoose.Types.ObjectId.isValid(filters)) return { rows: [], rowCount: 0 };
            const doc = await Model.findById(filters).select(options.select || '').lean();
            return { rows: doc ? [doc] : [], rowCount: doc ? 1 : 0 };
            
        case 'find':
            const data = await Model.find(filters)
                .select(options.select || '')
                .sort(options.sort || { created_at: -1 })
                .limit(Math.min(options.limit || 100, 1000)) // Safety cap
                .lean();
            return { rows: data };
            
        case 'insertOne':
            const newDoc = await Model.create(filters);
            return { rows: [newDoc.toObject()], rowCount: 1 };
            
        case 'updateOne':
            const update = filters.$set || filters.$push || filters.$inc ? filters : { $set: filters };
            const updated = await Model.findOneAndUpdate(
                filters._id ? { _id: filters._id } : filters, 
                update, 
                { new: true, runValidators: true }
            ).lean();
            return { rows: updated ? [updated] : [], rowCount: updated ? 1 : 0 };
            
        case 'deleteOne':
            const delResult = await Model.deleteOne(filters);
            return { rowCount: delResult.deletedCount };
            
        case 'aggregate':
            const aggResult = await Model.aggregate(filters).allowDiskUse(true);
            return { rows: aggResult, rowCount: aggResult.length };
            
        default:
            throw new Error(`Invalid Operation: ${operation}`);
    }
};

// Helper tools
const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null);

const initDb = async () => {
    await connectDB();
    // Use createIndexes instead of syncIndexes for better performance in production
    await User.createIndexes();
    await Summary.createIndexes();
    console.log('🔍 Database Indexes Ready');
};

const getConnectionStatus = () => {
    return mongoose.connection.readyState === 1; // 1 = connected
};

const closeConnection = async () => {
    await mongoose.connection.close();
    console.log('📡 MongoDB Connection Closed');
};

module.exports = { 
    query, 
    toObjectId, 
    initDb, 
    getConnectionStatus,
    closeConnection,
    models: { User, Summary },
    db: mongoose.connection 
};