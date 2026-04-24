const jwt = require('jsonwebtoken');

/**
 * Middleware to protect routes.
 * Decodes the JWT from the Authorization header.
 */
const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                error: 'Unauthorized', 
                message: 'No token provided.' 
            });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        req.user = decoded; 
        next();
    } catch (err) {
        return res.status(403).json({ 
            error: 'Forbidden', 
            message: 'Invalid or expired token.' 
        });
    }
};

const blacklistToken = async (token, userId) => {
    // TODO: Implement Redis-based token blacklisting
    console.log(`Token blacklisted for user ${userId}`);
    return true;
};

module.exports = { 
    authenticate, 
    blacklistToken 
};