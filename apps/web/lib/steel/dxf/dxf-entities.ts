/**
 * dxf-entities.ts — Tipos de entidad CAD que Steel Ops lee de un DXF (F8A).
 *
 * Subconjunto honesto del formato DXF ASCII (referencia pública de Autodesk):
 * lo que el motor estructural necesita — texto, bloques, trazos y cotas, con
 * capa, handle, coordenadas y rotación cuando existen. Todo lo demás se
 * ignora sin fallar. Ninguna entidad calcula nada (F1 única calculadora).
 */

export interface DxfEntityBase {
  /** Capa de origen ("0" cuando el dibujo no está organizado por capas). */
  layer: string;
  /** Identificador de entidad del DXF (código 5), si existe. */
  handle?: string;
  /** Color ACI (código 62): 1=rojo, 256=ByLayer, 0=ByBlock. */
  colorIndex?: number;
  /** True color RGB 24 bits (código 420), si existe. */
  trueColor?: number;
}

/** Rojo = señal estructural frecuente en planos reales (no verdad absoluta). */
export function isRedEntity(entity: Pick<DxfEntityBase, 'colorIndex' | 'trueColor'>): boolean {
  if (entity.colorIndex === 1) return true;
  if (entity.trueColor === undefined) return false;
  const r = (entity.trueColor >> 16) & 0xff;
  const g = (entity.trueColor >> 8) & 0xff;
  const b = entity.trueColor & 0xff;
  return r >= 180 && g <= 80 && b <= 80;
}

/** TEXT o MTEXT con su texto crudo y normalizado. */
export interface DxfTextEntity extends DxfEntityBase {
  type: 'TEXT' | 'MTEXT';
  /** Texto tal como viene en el DXF (tras decodificar códigos %%c/\\P). */
  rawText: string;
  /** Normalizado con la misma regla F7 (mayúsculas, Ø, espacios). */
  normalizedText: string;
  x?: number;
  y?: number;
  z?: number;
  /** Rotación en grados (código 50). */
  rotation?: number;
  /** Altura de texto (código 40). */
  height?: number;
}

/** Inserción de bloque — la unidad de conteo gráfico real del CAD. */
export interface DxfInsertEntity extends DxfEntityBase {
  type: 'INSERT';
  blockName: string;
  x?: number;
  y?: number;
  z?: number;
  rotation?: number;
}

/** LINE / LWPOLYLINE — hoy solo aportan densidad/estructura del dibujo. */
export interface DxfPathEntity extends DxfEntityBase {
  type: 'LINE' | 'LWPOLYLINE';
  /** Número de vértices declarado (LWPOLYLINE, código 90); LINE = 2. */
  vertexCount: number;
}

/** Cota. `overrideText` es el texto forzado (código 1, "<>" = medida real). */
export interface DxfDimensionEntity extends DxfEntityBase {
  type: 'DIMENSION';
  overrideText?: string;
  /** Medida real de la cota (código 42), si el archivo la trae. */
  measurement?: number;
}

/** Círculo — en cortes de viga suele representar una varilla (F8C). */
export interface DxfCircleEntity extends DxfEntityBase {
  type: 'CIRCLE';
  x?: number;
  y?: number;
  radius?: number;
}

export type DxfEntity =
  | DxfTextEntity
  | DxfInsertEntity
  | DxfPathEntity
  | DxfDimensionEntity
  | DxfCircleEntity;

/** Conteo por tipo para el resumen del intake. */
export interface DxfEntityStats {
  totalEntities: number;
  textCount: number;
  mtextCount: number;
  insertCount: number;
  pathCount: number;
  dimensionCount: number;
  circleCount: number;
}

export function isDxfTextEntity(entity: DxfEntity): entity is DxfTextEntity {
  return entity.type === 'TEXT' || entity.type === 'MTEXT';
}

export function computeDxfEntityStats(entities: readonly DxfEntity[]): DxfEntityStats {
  const stats: DxfEntityStats = {
    totalEntities: entities.length,
    textCount: 0,
    mtextCount: 0,
    insertCount: 0,
    pathCount: 0,
    dimensionCount: 0,
    circleCount: 0,
  };
  for (const entity of entities) {
    if (entity.type === 'TEXT') stats.textCount += 1;
    else if (entity.type === 'MTEXT') stats.mtextCount += 1;
    else if (entity.type === 'INSERT') stats.insertCount += 1;
    else if (entity.type === 'DIMENSION') stats.dimensionCount += 1;
    else if (entity.type === 'CIRCLE') stats.circleCount += 1;
    else stats.pathCount += 1;
  }
  return stats;
}
