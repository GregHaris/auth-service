import { Request, Response, NextFunction } from 'express';

/**
 * asyncHandler — wraps async route handlers to eliminate try/catch boilerplate
 *
 * Express does not natively catch errors thrown inside async functions.
 * If an async controller throws and you don't catch it, Express hangs
 * and the request never gets a response.
 *
 * This wrapper catches any thrown error (ApiError or otherwise) and
 * passes it to Express's next() which routes it to the global error handler.
 *
 * Without asyncHandler:
 *   export const login = async (req, res, next) => {
 *     try {
 *       const user = await findUser() // throws if not found
 *       res.json(user)
 *     } catch (err) {
 *       next(err) // manual every time
 *     }
 *   }
 *
 * With asyncHandler:
 *   export const login = asyncHandler(async (req, res) => {
 *     const user = await findUser() // throws → caught automatically
 *     res.json(user)
 *   })
 */
type AsyncController = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export const asyncHandler = (fn: AsyncController) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
};
