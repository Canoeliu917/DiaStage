import { SceneNotFoundError, type SceneStore } from '@pascal-app/mcp/storage'

export function createPrivateSceneStore(store: SceneStore, ownerId: string): SceneStore {
  if (!ownerId) throw new Error('A scene owner is required')
  if (!store.supportsOwnerChecks) throw new Error('Private scenes require atomic owner checks')

  const load: SceneStore['load'] = async (id) => {
    const scene = await store.load(id)
    return scene?.ownerId === ownerId ? scene : null
  }
  const requireOwned = async (id: string) => {
    const scene = await load(id)
    if (!scene) throw new SceneNotFoundError()
    return scene
  }
  const checkExistingOwner = async (id: string) => {
    const existing = store.getProjectStatus
      ? await store.getProjectStatus(id)
      : await store.load(id)
    if (existing && existing.ownerId !== ownerId) throw new SceneNotFoundError()
    return existing
  }

  return {
    backend: store.backend,
    supportsOwnerChecks: true,
    load,
    list: (options) => store.list({ ...options, ownerId }),
    async save(options) {
      const existing = options.id ? await checkExistingOwner(options.id) : null
      if (options.projectId) await checkExistingOwner(options.projectId)
      return store.save({
        ...options,
        expectedVersion: options.expectedVersion ?? (options.id && !existing ? 0 : undefined),
        ownerId,
        expectedOwnerId: ownerId,
      })
    },
    async delete(id, options) {
      const scene = await requireOwned(id)
      return store.delete(id, {
        expectedVersion: options?.expectedVersion ?? scene.version,
        expectedOwnerId: ownerId,
      })
    },
    async rename(id, name, options) {
      const scene = await requireOwned(id)
      return store.rename(id, name, {
        expectedVersion: options?.expectedVersion ?? scene.version,
        expectedOwnerId: ownerId,
      })
    },
    ...(store.updateThumbnail && {
      updateThumbnail: async (...args: Parameters<NonNullable<SceneStore['updateThumbnail']>>) => {
        await requireOwned(args[0])
        return store.updateThumbnail!(args[0], args[1], { ...args[2], expectedOwnerId: ownerId })
      },
    }),
    ...(store.createProject && {
      createProject: async (options: Parameters<NonNullable<SceneStore['createProject']>>[0]) => {
        if (options.id) await checkExistingOwner(options.id)
        return store.createProject!({
          ...options,
          ownerId,
          expectedOwnerId: ownerId,
          isPrivate: true,
        })
      },
    }),
    ...(store.getProjectStatus && {
      getProjectStatus: async (id: string) => {
        const project = await store.getProjectStatus!(id)
        return project?.ownerId === ownerId ? project : null
      },
    }),
    ...(store.appendSceneEvent && {
      appendSceneEvent: async (
        options: Parameters<NonNullable<SceneStore['appendSceneEvent']>>[0],
      ) => {
        await requireOwned(options.sceneId)
        return store.appendSceneEvent!({ ...options, expectedOwnerId: ownerId })
      },
    }),
    ...(store.listSceneEvents && {
      listSceneEvents: async (...args: Parameters<NonNullable<SceneStore['listSceneEvents']>>) => {
        await requireOwned(args[0])
        return store.listSceneEvents!(args[0], { ...args[1], expectedOwnerId: ownerId })
      },
    }),
  }
}
