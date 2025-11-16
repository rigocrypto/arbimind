"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token && process.env['NODE_ENV'] === 'production') {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }
    if (token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env['JWT_SECRET'] || 'dev-secret');
            req.user = decoded;
        }
        catch (error) {
            if (process.env['NODE_ENV'] === 'production') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token'
                });
            }
        }
    }
    next();
};
exports.authMiddleware = authMiddleware;
//# sourceMappingURL=auth.js.map