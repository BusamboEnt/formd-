import { Injectable } from '@angular/core';
import { AgreementTemplate } from '../core/models/agreement.model';
import { SERVICE_AGREEMENT } from '../core/data/service-agreement';
import { ClientSource, SaveHandler } from '../core/config/formd.config';

/**
 * Mutable configuration backing the custom element.
 *
 * Angular consumers configure FormD through `provideFormd()`, which is
 * resolved once at injection time. A custom element cannot work that way: the
 * host sets `.agreement`, `.clientSource` and `.saveHandler` as DOM properties
 * *after* the element is constructed. This holder gives the injection tokens
 * something stable to read from, and the element re-creates the wizard when
 * any of it changes so nothing keeps a stale reference.
 */
@Injectable({ providedIn: 'root' })
export class FormdRuntime {
  agreement: AgreementTemplate = SERVICE_AGREEMENT;
  clientSource: ClientSource | null = null;
  saveHandler: SaveHandler | null = null;
}
