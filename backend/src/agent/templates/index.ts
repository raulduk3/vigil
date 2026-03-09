/**
 * Watcher Templates
 *
 * General is the base. Everything else extends it.
 * Templates are starting points, not constraints — users can edit
 * the system prompt after creation.
 */

export { GENERAL_TEMPLATE, createGeneralWatcher } from './general';

// Future templates extend the general prompt:
// export { VENDOR_TEMPLATE, createVendorWatcher } from './vendor';
// export { CLIENT_TEMPLATE, createClientWatcher } from './client';
// export { RECRUITER_TEMPLATE, createRecruiterWatcher } from './recruiter';

export const TEMPLATES = {
  general: () => import('./general').then(m => m.GENERAL_TEMPLATE),
  // vendor: () => import('./vendor').then(m => m.VENDOR_TEMPLATE),
  // client: () => import('./client').then(m => m.CLIENT_TEMPLATE),
  // recruiter: () => import('./recruiter').then(m => m.RECRUITER_TEMPLATE),
} as const;

export type TemplateId = keyof typeof TEMPLATES;
