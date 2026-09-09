import localThumbnails from './preset-thumbnails.json'

const thumbnails: Record<string, string> = localThumbnails

export function presetThumbnailUrl(id: string, remote: string | null): string {
  return thumbnails[id] ?? remote ?? '/icons/item.webp'
}
