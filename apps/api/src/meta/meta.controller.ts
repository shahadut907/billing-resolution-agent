import { Controller, Get } from '@nestjs/common';
import type { MetaView } from '@billing-resolution/types';
import { isPublicReadOnly, reviewerAuthConfigured } from '../proposals/reviewer-auth';

/**
 * Capability metadata the UI needs to render honest controls: whether the
 * reviewer workflow is configured and whether this deployment is a public
 * read-only preview.
 */
@Controller('meta')
export class MetaController {
  @Get()
  meta(): MetaView {
    return {
      reviewerAuthConfigured: reviewerAuthConfigured(),
      publicReadOnly: isPublicReadOnly(),
    };
  }
}
