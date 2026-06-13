/**
 * index.ts — Superficie pública del constructor manual de APU + BOQ-add.
 * Contrato: docs/APU_MANUAL_BUILDER_AND_BOQ_ADD_V1_CONTRACT.md.
 */
export {
  createManualApu,
  loadApuBuilderData,
  previewManualApu,
} from './service';
export { listApusForBoqAdd, addApuToBoq } from './boq-add';
export type { ApuAddOption, AddApuToBoqResult } from './boq-add';
export { DbApuBuilderRepository } from './db-repository';
export type { ManualApuPayload, ManualApuComponentPayload } from './db-repository';
export {
  ApuBuilderValidationError,
  ApuBuilderWriteNotSupportedError,
  ResourceWithoutApprovedPriceError,
  BoqAddGuardError,
} from './errors';
