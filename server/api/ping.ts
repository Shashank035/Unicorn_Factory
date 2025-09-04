export const config = { runtime: 'nodejs18.x' }

export default function handler(_req: Request, res: any) {
  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 200
  res.end(JSON.stringify({ ok: true, t: Date.now() }))
}


