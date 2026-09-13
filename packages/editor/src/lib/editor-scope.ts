/** Host UI restrictions only; never applied to scene parsing or history restore. */
type EditorScope = {
  creationTools: readonly string[]
  materialEditing: boolean
  firstPerson: boolean
  capture: boolean
}

let scope: EditorScope | null = null

export function configureEditorScope(next: EditorScope | null): void {
  scope = next
}

export function canCreateWithTool(tool: string): boolean {
  return scope === null || scope.creationTools.includes(tool)
}

export function editorFeatureEnabled(feature: 'materialEditing' | 'firstPerson' | 'capture') {
  return scope === null || scope[feature]
}
