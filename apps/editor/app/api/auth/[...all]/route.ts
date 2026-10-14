import { toNextJsHandler } from 'better-auth/next-js'
import { getAuth } from '@/lib/auth/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const { GET, POST } = toNextJsHandler(async (request) => (await getAuth()).handler(request))
