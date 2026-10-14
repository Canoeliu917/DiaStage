import { parseArgs } from 'node:util'
import { bootstrapOwner } from '../apps/editor/lib/auth/bootstrap'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    'scene-ids': { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
})

if (!values.email || !values['scene-ids']) {
  throw new Error('Usage: bootstrap-owner --email owner@example.com --scene-ids exact-id-1,exact-id-2 [--apply]')
}

const result = await bootstrapOwner({
  email: values.email,
  sceneIds: values['scene-ids'].split(',').map((id) => id.trim()),
  apply: values.apply,
})
console.log(JSON.stringify(result, null, 2))
