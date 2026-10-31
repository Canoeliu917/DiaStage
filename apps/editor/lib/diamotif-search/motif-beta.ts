/** Closed-beta mark for the DiaMotif surface. Unset stays on; `0` / `false` / `off` hides it. */
export function motifClosedBetaEnabled(env: NodeJS.ProcessEnv = process.env) {
  const value = env.DIASTAGE_MOTIF_BETA?.trim().toLowerCase()
  return value !== '0' && value !== 'false' && value !== 'off'
}
