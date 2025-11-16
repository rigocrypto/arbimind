import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
declare const rateLimiter: RateLimiterMemory;
export declare const rateLimiterMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export { rateLimiter };
//# sourceMappingURL=rateLimiter.d.ts.map