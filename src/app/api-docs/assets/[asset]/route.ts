import { readFile } from 'node:fs/promises'
import path from 'node:path'
export const runtime = 'nodejs'
const assets: Record<string, string> = {
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
  'swagger-ui.css': 'text/css; charset=utf-8',
}
export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const { asset } = await params
  if (!Object.hasOwn(assets, asset)) return new Response('Not found', { status: 404 })
  const data = await readFile(path.join(process.cwd(), 'node_modules', 'swagger-ui-dist', asset))
  return new Response(new Uint8Array(data), { headers: { 'Content-Type': assets[asset], 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } })
}
