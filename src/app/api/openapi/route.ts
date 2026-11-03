import { openapi } from '@/backend/openapi'
export function GET() {
  return Response.json(openapi, { headers: { 'Cache-Control': 'no-cache' } })
}
