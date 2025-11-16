import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
  points: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
  duration: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '900000') / 1000, // Convert to seconds
});

export const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const clientId = req.ip || req.socket.remoteAddress || 'unknown';
    await rateLimiter.consume(clientId as string);
    next();
  } catch (error) {
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later'
    });
  }
};

export { rateLimiter };

