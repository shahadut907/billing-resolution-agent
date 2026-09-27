import {
  assertReviewerName,
  assertReviewerPasscode,
  isPublicReadOnly,
  reviewerAuthConfigured,
} from './reviewer-auth';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

/**
 * Unit tests for reviewer identity enforcement: no default passcode, disabled
 * when unconfigured, constant-time validation, strict name handling.
 */

const ENV = process.env;

describe('reviewer auth', () => {
  it('is disabled when REVIEWER_PASSCODE is unset — never a public default', () => {
    delete process.env.REVIEWER_PASSCODE;
    expect(reviewerAuthConfigured()).toBe(false);
    expect(() => assertReviewerPasscode('anything')).toThrow(ServiceUnavailableException);
  });

  it('accepts the configured passcode and rejects wrong ones', () => {
    process.env.REVIEWER_PASSCODE = 's3cret';
    expect(reviewerAuthConfigured()).toBe(true);
    expect(() => assertReviewerPasscode('s3cret')).not.toThrow();
    expect(() => assertReviewerPasscode('wrong')).toThrow(UnauthorizedException);
    expect(() => assertReviewerPasscode(undefined)).toThrow(UnauthorizedException);
    expect(() => assertReviewerPasscode('')).toThrow(UnauthorizedException);
  });

  it('rejects a whitespace-only or oversized reviewer name', () => {
    expect(() => assertReviewerName('Dana Reviewer')).not.toThrow();
    expect(() => assertReviewerName('   ')).toThrow(UnauthorizedException);
    expect(() => assertReviewerName('x'.repeat(200))).toThrow(UnauthorizedException);
    expect(() => assertReviewerName(42)).toThrow(UnauthorizedException);
  });

  it('parses PUBLIC_READ_ONLY strictly', () => {
    process.env.PUBLIC_READ_ONLY = '1';
    expect(isPublicReadOnly()).toBe(true);
    process.env.PUBLIC_READ_ONLY = 'true';
    expect(isPublicReadOnly()).toBe(true);
    process.env.PUBLIC_READ_ONLY = '0';
    expect(isPublicReadOnly()).toBe(false);
    delete process.env.PUBLIC_READ_ONLY;
    expect(isPublicReadOnly()).toBe(false);
  });

  afterAll(() => {
    process.env = ENV;
  });
});
