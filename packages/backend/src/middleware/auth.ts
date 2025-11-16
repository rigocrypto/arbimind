import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): Response | void => {
  // For development, skip auth if no token is provided
  // In production, this should be enforced
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token && process.env['NODE_ENV'] === 'production') {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (token) {
    try {
  const decoded = jwt.verify(token, process.env['JWT_SECRET'] || 'dev-secret');
      (req as any).user = decoded;
    } catch (error) {
      // In development, continue without auth
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

