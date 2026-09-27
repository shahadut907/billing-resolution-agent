import { createHash, timingSafeEqual } from 'node:crypto';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Reviewer identity for approval decisions.
 *
 * The shared reviewer passcode comes from the REVIEWER_PASSCODE environment
 * variable. There is deliberately NO default value: when the variable is not
 * configured, every decision and escalation endpoint answers 503
 * reviewer_auth_not_configured — the workflow is disabled, never open. The
 * passcode is compared in constant time (via SHA-256 digests, which also
 * removes length leakage) and is never logged, persisted, or echoed back.
 */
export const REVIEWER_NAME_MAX = 80;

export function reviewerAuthConfigured(): boolean {
  return !!process.env.REVIEWER_PASSCODE?.trim();
}

/** Throws the mapped HTTP error unless the supplied passcode is valid. */
export function assertReviewerPasscode(passcode: unknown): void {
  const expected = process.env.REVIEWER_PASSCODE?.trim();
  if (!expected) {
    throw new ServiceUnavailableException({
      code: 'reviewer_auth_not_configured',
      message:
        'Reviewer authentication is not configured (set REVIEWER_PASSCODE). ' +
        'Decision endpoints are disabled.',
    });
  }
  if (typeof passcode !== 'string' || passcode.length === 0 || passcode.length > 1024) {
    throw new UnauthorizedException({
      code: 'invalid_passcode',
      message: 'A reviewer passcode is required for this decision.',
    });
  }
  const supplied = sha256(passcode);
  const configured = sha256(expected);
  if (!timingSafeEqual(supplied, configured)) {
    throw new UnauthorizedException({
      code: 'invalid_passcode',
      message: 'The reviewer passcode is incorrect.',
    });
  }
}

/**
 * Validates and normalizes the reviewer display name. It is recorded in the
 * audit trail verbatim (identity comes from the passcode, not this name).
 */
export function assertReviewerName(reviewer: unknown): string {
  if (typeof reviewer !== 'string') {
    throw new UnauthorizedException({
      code: 'invalid_passcode',
      message: 'A reviewer name is required for this decision.',
    });
  }
  const name = reviewer.trim();
  if (name.length === 0 || name.length > REVIEWER_NAME_MAX) {
    throw new UnauthorizedException({
      code: 'invalid_passcode',
      message: `Reviewer name must be 1-${REVIEWER_NAME_MAX} characters.`,
    });
  }
  return name;
}

/** True when PUBLIC_READ_ONLY is enabled — public previews may not mutate anything. */
export function isPublicReadOnly(): boolean {
  const value = (process.env.PUBLIC_READ_ONLY ?? '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

export function assertNotPublicReadOnly(): void {
  if (isPublicReadOnly()) {
    throw new ForbiddenException({
      code: 'public_read_only',
      message:
        'This deployment is a public read-only preview: investigation runs, proposals, ' +
        'and decisions are disabled. Run the stack locally for the full journey.',
    });
  }
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
