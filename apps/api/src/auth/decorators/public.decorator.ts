import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a controller method as publicly accessible (no JWT required).
 * The JwtAuthGuard checks for this metadata before verifying the token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
