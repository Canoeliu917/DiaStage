import { StageItemProposalSchema, StagePlanSchema } from '@pascal-app/core/stage'

// Contact meshes are measured locally; the model cannot author physical geometry.
export const StageModelPlanSchema = StagePlanSchema.extend({
  items: StageItemProposalSchema.omit({ collisionGeometry: true }).array().max(200),
})
