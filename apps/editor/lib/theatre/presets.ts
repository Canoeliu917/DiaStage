import { createRehearsalScene, type RehearsalScene, type Role, theatreId } from './schema'

export function createEmptyTableRehearsalScene(): RehearsalScene {
  const scene = createRehearsalScene('空桌 · 送达与离开')
  const sender: Role = {
    id: theatreId('role'),
    name: '送信者',
    color: '#8ca6b8',
    height: 1.7,
    position: [2, 0, 1],
    facing: -Math.PI / 2,
    objective: '让对方收下信',
    entry: '台左入口 SL',
    exit: '',
  }
  const receiver: Role = {
    id: theatreId('role'),
    name: '离开者',
    color: '#c6aa86',
    height: 1.75,
    position: [-1.1, 0, 0],
    facing: Math.PI / 2,
    objective: '拒绝接收并离开',
    entry: '',
    exit: '台右后方 USR',
  }
  const marks: RehearsalScene['marks'] = [
    {
      id: theatreId('mark'),
      label: '送信者起点',
      position: [...sender.position],
      facing: sender.facing,
      pause: 1,
    },
    {
      id: theatreId('mark'),
      label: '圆桌 · 递信点',
      position: [0.8, 0, 0],
      facing: -Math.PI / 2,
      pause: 2,
    },
    {
      id: theatreId('mark'),
      label: '离开者起点',
      position: [...receiver.position],
      facing: receiver.facing,
      pause: 1,
    },
    {
      id: theatreId('mark'),
      label: '实用门 · 下场点',
      position: [-3, 0, -2],
      facing: Math.PI,
      pause: 2,
    },
    { id: theatreId('mark'), label: '台口中点 PL / CL', position: [0, 0, 3], facing: 0, pause: 0 },
    { id: theatreId('mark'), label: '中线 · 中区 C', position: [0, 0, 0], facing: 0, pause: 0 },
  ]
  const propId = theatreId('prop')
  const beatId = theatreId('beat')
  const departureId = theatreId('beat')
  return {
    ...scene,
    script: '一方试图送达，另一方拒绝留下。用走位、停顿和一封信记录行动的证据。',
    roles: [sender, receiver],
    marks,
    paths: [
      {
        id: theatreId('path'),
        roleId: sender.id,
        markIds: [marks[0]!.id, marks[1]!.id],
        startTime: 0,
        speed: 0.8,
        reason: '靠近对方，把信送达',
      },
      {
        id: theatreId('path'),
        roleId: receiver.id,
        markIds: [marks[2]!.id, marks[3]!.id],
        startTime: 10,
        speed: 0.7,
        reason: '结束接触，走向下场口',
      },
    ],
    props: [
      {
        id: propId,
        name: '未拆开的信',
        presetPosition: [0, 0.78, 0],
        initialHolderRoleId: null,
        transfers: [
          { id: theatreId('transfer'), time: 4, fromRoleId: null, toRoleId: sender.id },
          { id: theatreId('transfer'), time: 6, fromRoleId: sender.id, toRoleId: receiver.id },
          {
            id: theatreId('transfer'),
            time: 8,
            fromRoleId: receiver.id,
            toRoleId: null,
            position: [0, 0.78, 0],
          },
        ],
        resetNote: '信不拆开，回到圆桌中央；两人回到起点。',
      },
    ],
    beats: [
      {
        id: beatId,
        name: '递出与拒收',
        start: 0,
        end: 10,
        objective: '让信被留下',
        resistance: '对方将信放回',
      },
      {
        id: departureId,
        name: '走向门',
        start: 10,
        end: 20,
        objective: '离开当前关系',
        resistance: '送信者仍然等候回应',
      },
    ],
    actions: [
      {
        id: theatreId('action'),
        beatId,
        actorId: sender.id,
        targetRoleId: receiver.id,
        verb: '送达',
        desiredChange: '让对方收下信',
        resistance: '对方不愿留下',
        propId,
        start: 1,
        end: 7,
      },
      {
        id: theatreId('action'),
        beatId,
        actorId: receiver.id,
        targetRoleId: sender.id,
        verb: '拒收',
        desiredChange: '将信交还并终止接触',
        resistance: '送信者继续等待',
        propId,
        start: 7,
        end: 10,
      },
      {
        id: theatreId('action'),
        beatId: departureId,
        actorId: receiver.id,
        targetRoleId: sender.id,
        verb: '离开',
        desiredChange: '走到门边',
        resistance: '送信者的等待',
        start: 10,
        end: 20,
      },
    ],
  }
}
