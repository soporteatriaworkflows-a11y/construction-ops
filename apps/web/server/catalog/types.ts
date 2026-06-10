/**
 * types.ts — Tipos del modulo de catalogo de recursos (Bootstrap CTAs).
 * Propiedad: agent-frontend-boq.
 *
 * Reglas:
 *  - AuthenticatedViewer siempre resuelto server-side.
 *  - organization_id, created_by NUNCA del formData.
 */
import type { AuthenticatedViewer } from '@/server/auth/types';

export type { AuthenticatedViewer };

export type ResourceType =
  | 'material'
  | 'labor'
  | 'equipment'
  | 'tool'
  | 'subcontract'
  | 'other';

export interface ResourceView {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  resourceType: ResourceType;
  unit: string;
  active: boolean;
  createdAt: string;
}

export interface ResourceCreateInput {
  code: string;
  name: string;
  resourceType: ResourceType;
  unit: string;
}
