/**
 * category.ts — Clasificación VISUAL derivada de APU por palabras clave
 * (APU_LIBRARY_REUSABLE_ACTIVITIES_UX_V1). PURA, sin DB, sin migración.
 *
 * Fallback temporal: el esquema no tiene campo categoría. Se infiere de
 * nombre/descripción por palabras clave. Si no hay match ⇒ "Sin categoría".
 * Cuando exista un campo real de categoría/tag, esta capa se reemplaza.
 */

/** Categorías de actividad (orden de presentación en filtros). */
export const APU_CATEGORIES = [
  'Civil',
  'Acabados',
  'Drywall / board',
  'Microcemento',
  'Enchapes',
  'Pisos',
  'Pintura',
  'Instalaciones',
  'Carpintería',
  'Estructura metálica',
  'Cubiertas',
  'Equipos',
  'Otros',
  'Sin categoría',
] as const;

export type ApuCategory = (typeof APU_CATEGORIES)[number];

/** Palabras clave por categoría (es-CO), evaluadas en orden de especificidad. */
const KEYWORDS: { category: ApuCategory; words: string[] }[] = [
  { category: 'Microcemento', words: ['microcemento', 'micro cemento'] },
  { category: 'Drywall / board', words: ['drywall', 'superboard', 'super board', 'fibrocemento', 'panel yeso', 'placa yeso', 'gyplac', 'durock'] },
  { category: 'Enchapes', words: ['enchape', 'cerámic', 'porcelanato', 'baldosa', 'gres', 'azulejo'] },
  { category: 'Pisos', words: ['piso', 'guardaescoba', 'alfombra', 'laminado', 'vinílic', 'vinilic', 'tableta'] },
  { category: 'Pintura', words: ['pintura', 'estuco', 'vinilo', 'esmalte', 'anticorrosiv', 'recubrimiento'] },
  { category: 'Cubiertas', words: ['cubierta', 'teja', 'canal', 'bajante', 'impermeabiliz', 'manto'] },
  { category: 'Estructura metálica', words: ['estructura metál', 'metalic', 'metálic', 'perfil', 'viga', 'cercha', 'soldadura', 'acero estructural'] },
  { category: 'Carpintería', words: ['carpinter', 'puerta', 'ventana', 'mueble', 'closet', 'madera', 'mdf', 'aglomerado'] },
  { category: 'Instalaciones', words: ['instalaci', 'hidrosanitar', 'eléctric', 'electric', 'tubería', 'tuberia', 'punto', 'sanitari', 'acometida', 'tablero', 'luminar'] },
  { category: 'Acabados', words: ['acabado', 'pañet', 'panet', 'revoque', 'friso', 'cielo raso', 'cieloraso', 'mortero', 'repello'] },
  { category: 'Equipos', words: ['equipo', 'alquiler', 'andamio', 'formaleta', 'grúa', 'grua', 'maquinaria', 'retroexcavadora', 'vibrocompactador'] },
  { category: 'Civil', words: ['excavaci', 'relleno', 'concreto', 'hormig', 'cimentaci', 'zapata', 'columna', 'placa', 'muro', 'demoli', 'mamposter', 'ladrillo', 'bloque', 'viga de'] },
];

/**
 * Deriva la categoría de un APU por palabras clave de su nombre/descripción.
 * PURA. Devuelve "Sin categoría" si no hay coincidencia.
 *
 * @param name - Nombre/descripción del APU.
 */
export function deriveApuCategory(name: string | null | undefined): ApuCategory {
  const text = (name ?? '').toLowerCase();
  if (text.trim() === '') return 'Sin categoría';
  for (const { category, words } of KEYWORDS) {
    if (words.some((w) => text.includes(w))) return category;
  }
  return 'Sin categoría';
}
