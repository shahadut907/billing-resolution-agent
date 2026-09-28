import { Controller, Get } from '@nestjs/common';
import type { MetaView } from '@billing-resolution/types';
import { requestedProviderId } from '../investigation/agent/providers/provider';
import { isPublicReadOnly, reviewerAuthConfigured } from '../proposals/reviewer-auth';

/**
 * Capability metadata the UI needs to render honest controls: whether the
 * reviewer workflow is configured, whether this deployment is a public
 * read-only preview, and which investigation provider is configured (the
 * provider id is configuration, not a credential).
 */
@Controller('meta')
export class MetaController {
  @Get()
  meta(): MetaView {
    return {
      reviewerAuthConfigured: reviewerAuthConfigured(),
      publicReadOnly: isPublicReadOnly(),
      aiProvider: requestedProviderId(),
    };
  }
}
