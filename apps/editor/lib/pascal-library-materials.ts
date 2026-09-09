import { MATERIAL_CATEGORIES, MaterialPresetPayloadSchema } from '@pascal-app/core'
import { z } from 'zod'
import catalog from './pascal-library-materials.json'

// Public Pascal catalog snapshot; the host owns registration, never core/viewer.
export const PASCAL_LIBRARY_MATERIALS = z
  .array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      description: z.string(),
      source: z.enum(['pascal', 'community']),
      category: z.enum(MATERIAL_CATEGORIES),
      previewThumbnailUrl: z.string().startsWith('/material/library/'),
      preset: MaterialPresetPayloadSchema,
    }),
  )
  .parse(catalog)
