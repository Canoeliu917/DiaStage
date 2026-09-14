export type CameraIntent =
  | 'top_orthographic'
  | 'elevated_perspective'
  | 'tilt_down'
  | 'raise_camera'
  | 'audience_view'
  | 'front_view'
  | 'orbit_left'
  | 'orbit_right'
  | 'focus_selection'
  | 'clarify_vertical_view'

export type CameraIntentCommand = {
  type: 'CAMERA_INTENT'
  intents: CameraIntent[]
  projection?: 'perspective' | 'orthographic'
  target?: 'stage' | 'table' | 'selected_or_table' | 'selection'
  clarify: boolean
}

export const VERTICAL_VIEW_QUESTION = '你是想把镜头升高后往下看，还是切到正上方俯视图？'

export function parseCameraIntent(input: string): CameraIntentCommand | null {
  let text = input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s|[。!！]/g, '')
    .replace(/^请/, '')
  const noPlan = /[,，]?(?:但)?不要(?:切(?:换到)?|变成)(?:平面图|俯视图|顶视图)$/.test(text)
  if (noPlan)
    text = text.replace(/[,，]?(?:但)?不要(?:切(?:换到)?|变成)(?:平面图|俯视图|顶视图)$/, '')
  const clauses = text.split(/[,，](?:然后|再)?|然后|再把/).map((part) => part.replace(/^先/, ''))
  if (clauses.length > 1) {
    const commands = clauses.map(parseCameraIntent)
    if (commands.some((command) => !command)) return null
    const parts = commands as CameraIntentCommand[]
    if (parts.some((part) => part.clarify))
      return {
        type: 'CAMERA_INTENT',
        intents: ['clarify_vertical_view'],
        clarify: true,
      }
    const intents = parts.flatMap((part, index) =>
      part.intents.map((intent) =>
        intent === 'elevated_perspective' &&
        /^(?:把)?(?:镜头|视角)(?:抬)?高一点$/.test(clauses[index]!)
          ? ('raise_camera' as const)
          : intent,
      ),
    )
    const targets = [...new Set(parts.flatMap((part) => (part.target ? [part.target] : [])))]
    if (targets.length > 1 || (noPlan && intents.includes('top_orthographic'))) return null
    const projection = parts.map((part) => part.projection).filter(Boolean).at(-1)
    return {
      type: 'CAMERA_INTENT',
      intents,
      clarify: false,
      ...(targets[0] ? { target: targets[0] } : {}),
      ...(noPlan ? { projection: 'perspective' as const } : projection ? { projection } : {}),
    }
  }
  if (/^(?:上面看看|俯视一下|从高处|往上看看|看上面)$/.test(text))
    return {
      type: 'CAMERA_INTENT',
      intents: ['clarify_vertical_view'],
      clarify: true,
    }

  let target: CameraIntentCommand['target']
  if (/(?:整个)?舞台/.test(text)) target = 'stage'
  else if (/桌子/.test(text)) target = 'table'
  else if (/这个物件|(?:我)?选中的(?:物件|景片|物品)/.test(text)) target = 'selection'
  const action = text.replace(
    /(?:整个)?舞台|这张桌子|桌子|这个物件|(?:我)?选中的(?:物件|景片|物品)/g,
    '',
  )
  let intent: CameraIntent | undefined
  if (
    /^(?:(?:切(?:换)?到|看一下|从)?(?:俯视图|顶视图|平面图|正上方视图)(?:角度)?(?:看一下|看看|看)?|从正上方(?:看一下|看看|看)|topview|planview)$/.test(
      action,
    )
  )
    intent = 'top_orthographic'
  else if (
    /^(?:从(?:上面|高一点|观众席上方)(?:看一下|看看|看)|(?:把)?(?:镜头|视角)(?:抬)?高一点(?:看看)?|(?:把)?视角抬高|高一点(?:往下)?看)$/.test(
      action,
    )
  )
    intent = 'elevated_perspective'
  else if (/^(?:(?:镜头|视角)?(?:往|向)下(?:看|压|转)一点|再俯一点)$/.test(action))
    intent = 'tilt_down'
  else if (/^(?:(?:把)?(?:镜头|相机)(?:升高|抬高)(?:一点)?|高度加一点)$/.test(action))
    intent = 'raise_camera'
  else if (/^(?:从观众席(?:看|看看)|看看观众看到的效果|切到观众视角)$/.test(action))
    intent = 'audience_view'
  else if (/^从(?:台口)?正面(?:看|看看)$/.test(action)) intent = 'front_view'
  else if (/^(?:绕到左边看看|往左绕一点|从左侧看看)$/.test(action)) intent = 'orbit_left'
  else if (/^(?:绕到右边看看|往右绕一点|从右侧看看)$/.test(action)) intent = 'orbit_right'
  else if (/^(?:聚焦|对准|看一下)$/.test(action) && target) intent = 'focus_selection'
  if (!intent || (noPlan && intent === 'top_orthographic')) return null
  if (intent === 'elevated_perspective' && /这张桌子/.test(text)) target = 'selected_or_table'
  return {
    type: 'CAMERA_INTENT',
    intents: [intent],
    clarify: false,
    ...(target ? { target } : {}),
    ...(intent === 'top_orthographic'
      ? { projection: 'orthographic' as const }
      : ['elevated_perspective', 'tilt_down', 'raise_camera'].includes(intent) || noPlan
        ? { projection: 'perspective' as const }
        : {}),
  }
}
