let localAccountOwner: string | null = null

export function activateLocalAccount(ownerId: string): boolean {
  if (!ownerId) throw new Error('A local storage owner is required')
  if (localAccountOwner && localAccountOwner !== ownerId) return false
  localAccountOwner = ownerId
  return true
}

export function getLocalAccountOwner(): string | null {
  return localAccountOwner
}

export function localAccountStorageKey(base: string, ownerId = localAccountOwner): string {
  return ownerId ? `${base}:account:${encodeURIComponent(ownerId)}` : base
}
