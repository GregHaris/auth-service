import { Router } from 'express';

import { authenticate } from '@/middleware/authenticate';
import {
  forgotPasswordHandler,
  resendOtpHandler,
  resetPasswordHandler,
  verifyEmailHandler,
} from '@/controllers/auth.controller';
import {
  forgotPasswordSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '@/utils/validator';
import { validate } from '@/middleware/validate';

const router = Router();

router.post('/verify-email', authenticate, validate(verifyEmailSchema), verifyEmailHandler);
router.post('/resend-otp', validate(resendOtpSchema), resendOtpHandler);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPasswordHandler);
router.post('/reset-password', validate(resetPasswordSchema), resetPasswordHandler);

export default router;