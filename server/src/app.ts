import express, { Request, Response } from 'express'
import cors from 'cors'
import compression from 'compression'
import morgan from 'morgan'
import { nanoid } from 'nanoid'

type UserId = string
type ProjectId = string

type Project = {
  id: ProjectId
  founderId: UserId
  name: string
  videoUrl?: string
  summary: string
  resumesUrl?: string
  plan: string
  createdAt: number
  supply: number
  reserve: number
  capReached: boolean
  tokenSymbol?: string
  fundingGoal?: number
}

type Holding = { userId: UserId; projectId: ProjectId; balance: number }
type Offer = { id: string; projectId: ProjectId; sellerId: UserId; pricePerToken: number; amount: number; createdAt: number; status: 'open' | 'filled' | 'cancelled' }
type Milestone = { id: string; projectId: ProjectId; title: string; description?: string; amount: number; status: 'pending' | 'released'; createdAt: number }
type Proposal = { id: string; projectId: ProjectId; milestoneId: string; amount: number; approvals: number; rejections: number; released: boolean; createdAt: number }

const BASE_PRICE = 0.01
const SLOPE = 0.0001
const FUNDING_CAP = 100_000

export const app = express()
app.use(cors())
app.use(compression())
app.use(express.json())
app.use(morgan('dev'))

// In-memory stores
const projects = new Map<ProjectId, Project>()
const holdings = new Map<string, Holding>()
const offers = new Map<string, Offer>()
const milestones = new Map<string, Milestone>()
const proposals = new Map<string, Proposal>()

function getUserId(req: Request): UserId { return req.header('x-user-id') || 'demo-user' }
function priceAtSupply(s: number) { return BASE_PRICE + SLOPE * s }
function buyTokensQuote(s: number, amount: number) { let t = 0, b = amount, i = 0; while (b > 0 && i < 5000) { const p = priceAtSupply(s); if (b >= p) { b -= p; t++; s++; } else break; i++; } return { tokensOut: t } }
function sellTokensQuote(s: number, tokens: number) { let out = 0, i = 0, ss = Math.max(0, s - 1), tt = tokens; while (tt > 0 && ss >= 0 && i < 5000) { out += priceAtSupply(ss); ss--; tt--; i++; } return { amountOut: out } }

// Health
app.get('/healthz', (_req: Request, res: Response) => { res.json({ status: 'ok', time: Date.now() }) })

// SSE keepalive
app.get('/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.write(`: ok\n\n`)
  const id = setInterval(() => { try { res.write(`event: ping\n` + `data: {"t":${Date.now()}}\n\n`) } catch {} }, 25000)
  req.on('close', () => clearInterval(id))
})

// Root
app.get('/', (_req: Request, res: Response) => { res.json({ name: 'Unicorn Factory API', version: '1.0.0' }) })

// Projects CRUD-lite
app.post('/projects', (req: Request, res: Response) => {
  const userId = getUserId(req)
  const { name, videoUrl, summary, resumesUrl, plan, tokenSymbol, fundingGoal } = req.body || {}
  if (!name || !summary || !plan) return res.status(400).json({ error: 'name, summary, plan required' })
  const id = nanoid(8)
  const project: Project = { id, founderId: userId, name, videoUrl, summary, resumesUrl, plan, createdAt: Date.now(), supply: 0, reserve: 0, capReached: false, tokenSymbol, fundingGoal: typeof fundingGoal === 'number' && fundingGoal > 0 ? fundingGoal : FUNDING_CAP }
  projects.set(id, project)
  const founderKey = `${userId}:${id}`
  const founderHolding = holdings.get(founderKey) || { userId, projectId: id, balance: 0 }
  founderHolding.balance += 100
  holdings.set(founderKey, founderHolding)
  project.supply += 100
  res.json(project)
})
app.get('/projects', (_req: Request, res: Response) => { res.json(Array.from(projects.values()).sort((a, b) => b.createdAt - a.createdAt)) })
app.get('/projects/:id', (req: Request, res: Response) => { const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); res.json(p) })

// Buy/Sell
app.post('/projects/:id/buy', (req: Request, res: Response) => {
  const userId = getUserId(req); const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); if (p.capReached) return res.status(400).json({ error: 'funding cap reached' })
  const amount = Number(req.body?.amount || 0); if (amount <= 0) return res.status(400).json({ error: 'amount > 0 required' })
  const { tokensOut } = buyTokensQuote(p.supply, amount); if (tokensOut <= 0) return res.status(400).json({ error: 'amount too small for current price' })
  p.supply += tokensOut; p.reserve += amount; if (p.reserve >= FUNDING_CAP) p.capReached = true
  const key = `${userId}:${p.id}`; const h = holdings.get(key) || { userId, projectId: p.id, balance: 0 }; h.balance += tokensOut; holdings.set(key, h)
  res.json({ project: p, tokensOut })
})
app.post('/projects/:id/sell', (req: Request, res: Response) => {
  const userId = getUserId(req); const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' })
  const tokens = Number(req.body?.tokens || 0); if (tokens <= 0) return res.status(400).json({ error: 'tokens > 0 required' })
  const key = `${userId}:${p.id}`; const h = holdings.get(key); if (!h || h.balance < tokens) return res.status(400).json({ error: 'insufficient balance' })
  const { amountOut } = sellTokensQuote(p.supply, tokens); p.supply = Math.max(0, p.supply - tokens); p.reserve = Math.max(0, p.reserve - amountOut); h.balance -= tokens; holdings.set(key, h)
  res.json({ project: p, amountOut })
})

// Holdings & price
app.get('/me/holdings', (req: Request, res: Response) => { const userId = getUserId(req); const list = Array.from(holdings.values()).filter(h => h.userId === userId); res.json(list) })
app.get('/projects/:id/price', (req: Request, res: Response) => { const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); const price = priceAtSupply(p.supply); res.json({ price, supply: p.supply, reserve: p.reserve, capReached: p.capReached }) })
app.get('/launch', (_req: Request, res: Response) => { res.json(Array.from(projects.values()).filter(p => p.capReached).sort((a, b) => b.createdAt - a.createdAt)) })

// Offers
app.get('/projects/:id/offers', (req: Request, res: Response) => { const projectId = req.params.id; if (!projects.has(projectId)) return res.status(404).json({ error: 'not found' }); const list = Array.from(offers.values()).filter(o => o.projectId === projectId && o.status === 'open'); res.json(list.sort((a, b) => a.pricePerToken - b.pricePerToken)) })
app.post('/projects/:id/offers', (req: Request, res: Response) => {
  const userId = getUserId(req); const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' })
  const pricePerToken = Number(req.body?.pricePerToken || 0); const amount = Number(req.body?.amount || 0); if (pricePerToken <= 0 || amount <= 0) return res.status(400).json({ error: 'pricePerToken and amount > 0 required' })
  const key = `${userId}:${p.id}`; const h = holdings.get(key); if (!h || h.balance < amount) return res.status(400).json({ error: 'insufficient balance' })
  h.balance -= amount; holdings.set(key, h)
  const offer: Offer = { id: nanoid(8), projectId: p.id, sellerId: userId, pricePerToken, amount, createdAt: Date.now(), status: 'open' }
  offers.set(offer.id, offer)
  res.json(offer)
})
app.post('/projects/:id/offers/:offerId/fill', (req: Request, res: Response) => {
  const buyerId = getUserId(req); const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' })
  const offer = offers.get(req.params.offerId); if (!offer || offer.projectId !== p.id) return res.status(404).json({ error: 'offer not found' })
  if (offer.status !== 'open' || offer.amount <= 0) return res.status(400).json({ error: 'offer not open' })
  const take = Math.max(0, Math.min(offer.amount, Number(req.body?.amount || 0))); if (take <= 0) return res.status(400).json({ error: 'amount > 0 required' })
  const buyerKey = `${buyerId}:${p.id}`; const buyerHolding = holdings.get(buyerKey) || { userId: buyerId, projectId: p.id, balance: 0 }; buyerHolding.balance += take; holdings.set(buyerKey, buyerHolding)
  offer.amount -= take; if (offer.amount === 0) offer.status = 'filled'; offers.set(offer.id, offer)
  res.json({ offer })
})

// Milestones & proposals
app.get('/projects/:id/milestones', (req: Request, res: Response) => { const projectId = req.params.id; if (!projects.has(projectId)) return res.status(404).json({ error: 'not found' }); const list = Array.from(milestones.values()).filter(m => m.projectId === projectId); res.json(list.sort((a, b) => a.createdAt - b.createdAt)) })
app.post('/projects/:id/milestones', (req: Request, res: Response) => {
  const userId = getUserId(req); const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); if (p.founderId !== userId) return res.status(403).json({ error: 'only founder can create milestones' })
  const title = String(req.body?.title || '').trim(); const amount = Number(req.body?.amount || 0); const description = String(req.body?.description || '').trim(); if (!title || amount <= 0) return res.status(400).json({ error: 'title and amount > 0 required' })
  const m: Milestone = { id: nanoid(8), projectId: p.id, title, description, amount, status: 'pending', createdAt: Date.now() }
  milestones.set(m.id, m)
  res.json(m)
})
app.get('/projects/:id/proposals', (req: Request, res: Response) => { const projectId = req.params.id; if (!projects.has(projectId)) return res.status(404).json({ error: 'not found' }); const list = Array.from(proposals.values()).filter(pr => pr.projectId === projectId); res.json(list.sort((a, b) => b.createdAt - a.createdAt)) })
app.post('/projects/:id/proposals', (req: Request, res: Response) => {
  const userId = getUserId(req); const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); if (p.founderId !== userId) return res.status(403).json({ error: 'only founder can create proposals' })
  const milestoneId = String(req.body?.milestoneId || ''); const amount = Number(req.body?.amount || 0); const m = milestones.get(milestoneId); if (!m || m.projectId !== p.id) return res.status(400).json({ error: 'invalid milestone' }); if (amount <= 0 || amount > m.amount) return res.status(400).json({ error: 'invalid amount' })
  const pr: Proposal = { id: nanoid(8), projectId: p.id, milestoneId, amount, approvals: 0, rejections: 0, released: false, createdAt: Date.now() }
  proposals.set(pr.id, pr)
  res.json(pr)
})
app.post('/projects/:id/proposals/:proposalId/vote', (req: Request, res: Response) => { const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); const pr = proposals.get(req.params.proposalId); if (!pr || pr.projectId !== p.id) return res.status(404).json({ error: 'proposal not found' }); const approve = !!req.body?.approve; if (approve) pr.approvals += 1; else pr.rejections += 1; proposals.set(pr.id, pr); res.json(pr) })
app.post('/projects/:id/proposals/:proposalId/release', (req: Request, res: Response) => {
  const userId = getUserId(req); const p = projects.get(req.params.id); if (!p) return res.status(404).json({ error: 'not found' }); if (p.founderId !== userId) return res.status(403).json({ error: 'only founder can release' })
  const pr = proposals.get(req.params.proposalId); if (!pr || pr.projectId !== p.id) return res.status(404).json({ error: 'proposal not found' })
  const m = milestones.get(pr.milestoneId); if (!m) return res.status(404).json({ error: 'milestone not found' }); if (pr.released) return res.status(400).json({ error: 'already released' })
  if (pr.approvals < 1 || pr.approvals <= pr.rejections) return res.status(400).json({ error: 'not approved yet' })
  const amount = Math.min(pr.amount, p.reserve); p.reserve = Math.max(0, p.reserve - amount); if (p.reserve < FUNDING_CAP) p.capReached = false
  pr.released = true; m.status = 'released'; proposals.set(pr.id, pr); milestones.set(m.id, m)
  res.json({ project: p, proposal: pr, milestone: m, amount })
})


