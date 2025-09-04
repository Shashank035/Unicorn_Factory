import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { nanoid } from 'nanoid';
// Simple linear bonding curve: price = a + b * supply
// We pick a = 0.01, b = 0.0001 for demo
const BASE_PRICE = 0.01; // in test-crypto units
const SLOPE = 0.0001;
const FUNDING_CAP = 100000; // 100k cap
const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(morgan('dev'));
// In-memory stores
const projects = new Map();
const holdings = new Map(); // key: `${userId}:${projectId}`
const offers = new Map();
function getUserId(req) {
    const userId = req.header('x-user-id') || 'demo-user';
    return userId;
}
function priceAtSupply(supply) {
    return BASE_PRICE + SLOPE * supply;
}
function buyTokensQuote(currentSupply, amountIn) {
    // Integrate inverse of price; for linear price p = a + bS, tokens from budget B approximately by small steps
    // For MVP simplicity, approximate using small steps of 1 token until budget spent or 5000 steps
    let tokens = 0;
    let budget = amountIn;
    let s = currentSupply;
    let steps = 0;
    while (budget > 0 && steps < 5000) {
        const p = priceAtSupply(s);
        if (budget >= p) {
            budget -= p;
            tokens += 1;
            s += 1;
        }
        else {
            break;
        }
        steps++;
    }
    return { tokensOut: tokens };
}
function sellTokensQuote(currentSupply, tokensIn) {
    // Symmetric linear curve: iterate tokens and sum prices backwards
    let s = Math.max(0, currentSupply - 1);
    let t = tokensIn;
    let out = 0;
    let steps = 0;
    while (t > 0 && s >= 0 && steps < 5000) {
        const p = priceAtSupply(s);
        out += p;
        s -= 1;
        t -= 1;
        steps++;
    }
    return { amountOut: out };
}
// Projects
app.post('/projects', (req, res) => {
    const userId = getUserId(req);
    const { name, videoUrl, summary, resumesUrl, plan } = req.body || {};
    if (!name || !summary || !plan) {
        return res.status(400).json({ error: 'name, summary, plan required' });
    }
    const id = nanoid(8);
    const project = {
        id,
        founderId: userId,
        name,
        videoUrl,
        summary,
        resumesUrl,
        plan,
        createdAt: Date.now(),
        supply: 0,
        reserve: 0,
        capReached: false,
    };
    projects.set(id, project);
    // Founder initial allocation (e.g., 100 tokens)
    const founderKey = `${userId}:${id}`;
    const founderHolding = holdings.get(founderKey) || { userId, projectId: id, balance: 0 };
    founderHolding.balance += 100;
    holdings.set(founderKey, founderHolding);
    project.supply += 100;
    res.json(project);
});
app.get('/projects', (_req, res) => {
    res.json(Array.from(projects.values()).sort((a, b) => b.createdAt - a.createdAt));
});
// Simple welcome + status
app.get('/', (_req, res) => {
    res.json({
        name: 'Unicorn Factory API',
        version: '1.0.0',
        endpoints: [
            'GET / - this message',
            'GET /projects',
            'POST /projects',
            'GET /projects/:id',
            'POST /projects/:id/buy',
            'POST /projects/:id/sell',
            'GET /projects/:id/price',
            'GET /launch',
            'GET /projects/:id/offers',
            'POST /projects/:id/offers',
            'POST /projects/:id/offers/:offerId/fill',
            'GET /me/holdings'
        ]
    });
});
app.get('/projects/:id', (req, res) => {
    const p = projects.get(req.params.id);
    if (!p)
        return res.status(404).json({ error: 'not found' });
    res.json(p);
});
// Buy on bonding curve
app.post('/projects/:id/buy', (req, res) => {
    const userId = getUserId(req);
    const p = projects.get(req.params.id);
    if (!p)
        return res.status(404).json({ error: 'not found' });
    if (p.capReached)
        return res.status(400).json({ error: 'funding cap reached' });
    const amount = Number(req.body?.amount || 0);
    if (amount <= 0)
        return res.status(400).json({ error: 'amount > 0 required' });
    const { tokensOut } = buyTokensQuote(p.supply, amount);
    if (tokensOut <= 0)
        return res.status(400).json({ error: 'amount too small for current price' });
    p.supply += tokensOut;
    p.reserve += amount;
    if (p.reserve >= FUNDING_CAP)
        p.capReached = true;
    const key = `${userId}:${p.id}`;
    const h = holdings.get(key) || { userId, projectId: p.id, balance: 0 };
    h.balance += tokensOut;
    holdings.set(key, h);
    res.json({ project: p, tokensOut });
});
// Sell tokens back to curve
app.post('/projects/:id/sell', (req, res) => {
    const userId = getUserId(req);
    const p = projects.get(req.params.id);
    if (!p)
        return res.status(404).json({ error: 'not found' });
    const tokens = Number(req.body?.tokens || 0);
    if (tokens <= 0)
        return res.status(400).json({ error: 'tokens > 0 required' });
    const key = `${userId}:${p.id}`;
    const h = holdings.get(key);
    if (!h || h.balance < tokens)
        return res.status(400).json({ error: 'insufficient balance' });
    const { amountOut } = sellTokensQuote(p.supply, tokens);
    p.supply = Math.max(0, p.supply - tokens);
    p.reserve = Math.max(0, p.reserve - amountOut);
    h.balance -= tokens;
    holdings.set(key, h);
    res.json({ project: p, amountOut });
});
// Holdings for current user
app.get('/me/holdings', (req, res) => {
    const userId = getUserId(req);
    const list = Array.from(holdings.values()).filter(h => h.userId === userId);
    res.json(list);
});
// Quote endpoints
app.get('/projects/:id/price', (req, res) => {
    const p = projects.get(req.params.id);
    if (!p)
        return res.status(404).json({ error: 'not found' });
    const price = priceAtSupply(p.supply);
    res.json({ price, supply: p.supply, reserve: p.reserve, capReached: p.capReached });
});
// Launch Zone: promoted projects (cap reached)
app.get('/launch', (_req, res) => {
    res.json(Array.from(projects.values()).filter(p => p.capReached).sort((a, b) => b.createdAt - a.createdAt));
});
// Basic secondary market: user sell offers
app.get('/projects/:id/offers', (req, res) => {
    const projectId = req.params.id;
    if (!projects.has(projectId))
        return res.status(404).json({ error: 'not found' });
    const list = Array.from(offers.values()).filter(o => o.projectId === projectId && o.status === 'open');
    res.json(list.sort((a, b) => a.pricePerToken - b.pricePerToken));
});
app.post('/projects/:id/offers', (req, res) => {
    const userId = getUserId(req);
    const p = projects.get(req.params.id);
    if (!p)
        return res.status(404).json({ error: 'not found' });
    const pricePerToken = Number(req.body?.pricePerToken || 0);
    const amount = Number(req.body?.amount || 0);
    if (pricePerToken <= 0 || amount <= 0)
        return res.status(400).json({ error: 'pricePerToken and amount > 0 required' });
    const key = `${userId}:${p.id}`;
    const h = holdings.get(key);
    if (!h || h.balance < amount)
        return res.status(400).json({ error: 'insufficient balance' });
    // Move tokens into offer escrow by deducting from holding
    h.balance -= amount;
    holdings.set(key, h);
    const offer = {
        id: nanoid(8),
        projectId: p.id,
        sellerId: userId,
        pricePerToken,
        amount,
        createdAt: Date.now(),
        status: 'open',
    };
    offers.set(offer.id, offer);
    res.json(offer);
});
app.post('/projects/:id/offers/:offerId/fill', (req, res) => {
    const buyerId = getUserId(req);
    const p = projects.get(req.params.id);
    if (!p)
        return res.status(404).json({ error: 'not found' });
    const offer = offers.get(req.params.offerId);
    if (!offer || offer.projectId !== p.id)
        return res.status(404).json({ error: 'offer not found' });
    if (offer.status !== 'open' || offer.amount <= 0)
        return res.status(400).json({ error: 'offer not open' });
    const take = Math.max(0, Math.min(offer.amount, Number(req.body?.amount || 0)));
    if (take <= 0)
        return res.status(400).json({ error: 'amount > 0 required' });
    // Transfer tokens from offer to buyer
    const buyerKey = `${buyerId}:${p.id}`;
    const buyerHolding = holdings.get(buyerKey) || { userId: buyerId, projectId: p.id, balance: 0 };
    buyerHolding.balance += take;
    holdings.set(buyerKey, buyerHolding);
    offer.amount -= take;
    if (offer.amount === 0)
        offer.status = 'filled';
    offers.set(offer.id, offer);
    // Note: payment is simulated in MVP; no currency ledger
    res.json({ offer });
});
// Dev seed: create a demo project and simulate contributions
app.post('/dev/seed', (req, res) => {
    const key = req.query.key || '';
    if (key !== 'demo')
        return res.status(403).json({ error: 'forbidden' });
    // If a demo exists, return it
    const existing = Array.from(projects.values()).find(p => p.name === 'Aurora AI Vision');
    if (existing)
        return res.json({ project: existing, note: 'already seeded' });
    const founder = 'founder_demo';
    const id = nanoid(8);
    const project = {
        id,
        founderId: founder,
        name: 'Aurora AI Vision',
        videoUrl: 'https://example.com/video',
        summary: 'Self-hosted multimodal vision stack for robotics with on-device inference.',
        resumesUrl: 'https://example.com/team',
        plan: 'MVP -> Pilots -> Open-source SDK -> Enterprise',
        createdAt: Date.now(),
        supply: 0,
        reserve: 0,
        capReached: false,
    };
    projects.set(id, project);
    // founder allocation
    const founderKey = `${founder}:${id}`;
    holdings.set(founderKey, { userId: founder, projectId: id, balance: 100 });
    project.supply += 100;
    // simulate backers
    const backers = [
        { user: 'u_alice', amount: 50 },
        { user: 'u_bob', amount: 120 },
        { user: 'u_cara', amount: 200 },
    ];
    for (const b of backers) {
        const { tokensOut } = buyTokensQuote(project.supply, b.amount);
        if (tokensOut > 0) {
            project.supply += tokensOut;
            project.reserve += b.amount;
            const hKey = `${b.user}:${project.id}`;
            const h = holdings.get(hKey) || { userId: b.user, projectId: project.id, balance: 0 };
            h.balance += tokensOut;
            holdings.set(hKey, h);
        }
    }
    res.json({ project });
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
