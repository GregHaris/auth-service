import { Request, Response, NextFunction } from 'express';
import { ZodType } from 'zod';

import { ApiError } from '@/utils/ApiError';

export const validate = (schema: ZodType) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error: any) {
      const errors: Record<string, string[]> = {};

      if (error.errors) {
        for (const issue of error.errors) {
          const path = issue.path.join('.') || 'body';

          if (!errors[path]) {
            errors[path] = [];
          }

          errors[path].push(issue.message);
        }
      }

      next(ApiError.badRequest('Validation failed', errors));
    }
  };
};
