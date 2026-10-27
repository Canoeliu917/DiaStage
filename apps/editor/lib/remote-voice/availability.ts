export const VOICE_INPUT_ENABLED = false

export function isDeviceLinkEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DIASTAGE_DEVICE_LINK_ENABLED === 'true'
}
