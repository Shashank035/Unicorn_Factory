import { useEffect, useMemo, useState } from 'react'

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'

// Debug: Log the API URL being used
console.log('API_URL configured as:', API_URL)
console.log('Environment variables:', import.meta.env)

type Project = {
  id: string
  founderId: string
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

type Holding = { userId: string; projectId: string; balance: number }

function useUserId() {
  const [id] = useState(() =>
    localStorage.getItem('uid') || (() => {
      const gen = 'u_' + Math.random().toString(36).slice(2, 10)
      localStorage.setItem('uid', gen)
      return gen
    })()
  )
  return id
}

async function api<T>(path: string, opts: RequestInit = {}, userId?: string): Promise<T> {
  try {
    console.log('Making API request to:', `${API_URL}${path}`)
    console.log('Request options:', { ...opts, headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '', ...(opts.headers || {}) } })
    
    const res = await fetch(`${API_URL}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId || '',
        ...(opts.headers || {}),
      },
    })
    
    console.log('Response status:', res.status)
    console.log('Response headers:', Object.fromEntries(res.headers.entries()))
    
    if (!res.ok) {
      const errorText = await res.text()
      console.error('API Error:', errorText)
      throw new Error(`HTTP ${res.status}: ${errorText}`)
    }
    
    const data = await res.json()
    console.log('API Response:', data)
    return data
  } catch (error) {
    console.error('API Request failed:', error)
    throw error
  }
}

function useWallet() {
  const [address, setAddress] = useState<string | null>(() => localStorage.getItem('wallet') )
  const [type, setType] = useState<string | null>(() => localStorage.getItem('wallet_type'))
  const [pickerOpen, setPickerOpen] = useState(false)
  const connect = async () => {
    setPickerOpen(true)
  }
  const disconnect = () => { localStorage.removeItem('wallet'); setAddress(null) }
  const choose = (w: string) => {
    const addr = `${w.toLowerCase()}_${Math.random().toString(36).slice(2,8)}`
    localStorage.setItem('wallet', addr)
    localStorage.setItem('wallet_type', w)
    setType(w)
    setAddress(addr)
    setPickerOpen(false)
  }
  return { address, type, connect, disconnect, pickerOpen, setPickerOpen, choose }
}

export function App() {
  const uid = useUserId()
  const wallet = useWallet()
  const [tab, setTab] = useState<'dashboard' | 'submit' | 'holdings' | 'launch'>('dashboard')
  const [showLanding, setShowLanding] = useState(true)
  return (
    <div className="container">
      <div className="header">
        <div className="logo">
          <span className="float-unicorn">🦄</span>
          <span className="logo-text">Unicorn Factory</span>
          <span className="brand-badge">Launchpad for AI Startups</span>
        </div>
        {!showLanding && (
        <nav className="nav">
          <button className="btn" onClick={() => setTab('dashboard')}>Dashboard</button>
          <button className="btn" onClick={() => setTab('submit')}>Submit Project</button>
          <button className="btn" onClick={() => setTab('holdings')}>My Holdings</button>
          <button className="btn btn-primary" onClick={() => setTab('launch')}>Launch Zone</button>
          {wallet.address ? (
            <button className="btn" onClick={wallet.disconnect}>{wallet.type || 'Wallet'} • {wallet.address.slice(0,6)}… (Disconnect)</button>
          ) : (
            <button className="btn btn-primary" onClick={wallet.connect}>Connect Wallet</button>
          )}
        </nav>
        )}
      </div>
      {wallet.pickerOpen && !showLanding && (
        <div className="wallet-modal" onClick={() => wallet.setPickerOpen(false)}>
          <div className="wallet-panel" onClick={e => e.stopPropagation()}>
            <div className="wallet-title">Choose a wallet</div>
            <div className="wallet-grid">
              {['Phantom','Solflare','Backpack','Ledger'].map(w => (
                <button key={w} className="wallet-item" onClick={() => wallet.choose(w)}>{w}</button>
              ))}
            </div>
            <button className="btn" onClick={() => wallet.setPickerOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {showLanding ? (
        <Landing onStart={() => setShowLanding(false)} />
      ) : (
        <>
          {tab === 'dashboard' && <Dashboard uid={uid} onBrowse={() => setTab('dashboard')} onGetStarted={() => setTab('submit')} />}
          {tab === 'submit' && <Submit uid={uid} onDone={() => setTab('dashboard')} />}
          {tab === 'holdings' && <Holdings uid={uid} />}
          {tab === 'launch' && <Launch uid={uid} />}
        </>
      )}
      <div className="footer-space" />
    </div>
  )
}

function Dashboard({ uid, onBrowse, onGetStarted }: { uid: string; onBrowse?: () => void; onGetStarted?: () => void }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [selected, setSelected] = useState<Project | null>(null)
  const [activity, setActivity] = useState<{ id: string; text: string; ts: number }[]>([])
  useEffect(() => {
    let mounted = true
    const load = () => api<Project[]>('/projects', {}, uid).then(r => { if (mounted) setProjects(r) })
    load().catch(console.error)
    const es = new EventSource(`${API_URL}/events`)
    const addAct = (text: string) => setActivity(prev => [{ id: Math.random().toString(36).slice(2), text, ts: Date.now() }, ...prev].slice(0, 20))
    const onCreated = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data)
        if (d?.project) {
          setProjects(prev => prev.some(p => p.id === d.project.id) ? prev : [d.project as Project, ...prev])
          addAct(`New project: ${d.project.name}`)
        } else { load().catch(() => {}) }
      } catch { load().catch(() => {}) }
    }
    const onBuy = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { projectId: string; amount?: number }
        if (d?.projectId) {
          const inc = typeof d.amount === 'number' ? d.amount : 0
          setProjects(prev => prev.map(p => p.id === d.projectId ? { ...p, reserve: p.reserve + inc } : p))
          const proj = projects.find(p => p.id === d.projectId)
          const incText = typeof d.amount === 'number' ? d.amount.toFixed(2) : '0.00'
          addAct(`Contribution: ${proj?.name || d.projectId} +${incText}`)
        } else { load().catch(() => {}) }
      } catch { load().catch(() => {}) }
    }
    const onSell = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { projectId: string; tokens?: number }
        const proj = projects.find(p => p.id === d?.projectId)
        addAct(`Sell: ${proj?.name || d?.projectId} ${d?.tokens || ''}t`)
      } catch {}
      load().catch(() => {})
    }
    es.addEventListener('project_created', onCreated as any)
    es.addEventListener('project_buy', onBuy as any)
    es.addEventListener('project_sell', onSell as any)
    const vis = () => { if (document.visibilityState === 'visible') load().catch(() => {}) }
    document.addEventListener('visibilitychange', vis)
    return () => {
      mounted = false
      es.close()
      document.removeEventListener('visibilitychange', vis)
    }
  }, [uid, projects])
  return (
    <div>
      {!selected && (
        <div className="hero hero-animate">
          <div className="aurora" aria-hidden="true"></div>
          <div className="headline">Back the next unicorns in AI</div>
          <div className="subheadline">Discover ambitious founders, fund them with test-crypto on a transparent bonding curve, and own early project tokens. When a raise hits the cap, projects launch to the world.</div>
          <div className="cta-row">
            <button className="btn btn-primary cta cta-gloss" onClick={() => (onGetStarted ? onGetStarted() : setSelected(null))}>Get Started</button>
            <button className="btn cta-outline cta-gloss" onClick={() => (onBrowse ? onBrowse() : setSelected(null))}>Browse Projects</button>
          </div>
        </div>
      )}
      {!selected && activity.length > 0 && (
        <ActivityTicker items={activity} />
      )}
      {!selected && (
        <div className="grid">
          {projects.map(p => (
            <div
              key={p.id}
              className="card card-clickable"
              role="button"
              tabIndex={0}
              onClick={() => setSelected(p)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p) } }}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>{p.name}</h3>
                <span className={"badge " + (p.capReached ? 'badge-green' : 'badge-blue')}>{p.capReached ? 'Cap reached' : 'Open'}</span>
              </div>
              <div className="muted" style={{ margin: '6px 0' }}>{p.summary}</div>
              <ProgressBar value={Math.min(100, Math.round((p.reserve / 100000) * 100))} />
              <div className="row small muted tags">
                <span className="tag">Raised: {p.reserve.toFixed(2)} / 100000</span>
                <span className="tag">Supply: {p.supply}</span>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn btn-primary">View</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {selected && <ProjectDetail uid={uid} projectId={selected.id} onBack={() => setSelected(null)} />}
    </div>
  )
}

function Submit({ uid, onDone }: { uid: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [summary, setSummary] = useState('')
  const [resumesUrl, setResumesUrl] = useState('')
  const [plan, setPlan] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [fundingGoal, setFundingGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async () => {
    try {
      setLoading(true)
      await api<Project>('/projects', { method: 'POST', body: JSON.stringify({ name, videoUrl, summary, resumesUrl, plan, tokenSymbol, fundingGoal: Number(fundingGoal) || undefined }) }, uid)
      onDone()
    } catch (e) {
      alert(String(e))
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className="card stack" style={{ maxWidth: 700 }}>
      <div className="section-title">Founder Submission</div>
      <input placeholder="Project name" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="Pitch video URL" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} />
      <textarea placeholder="1-2 paragraph summary" value={summary} onChange={e => setSummary(e.target.value)} />
      <input placeholder="Resumes / team URL" value={resumesUrl} onChange={e => setResumesUrl(e.target.value)} />
      <textarea placeholder="Plan / milestones" value={plan} onChange={e => setPlan(e.target.value)} />
      <div className="row">
        <input placeholder="Token symbol (e.g., UFAI)" value={tokenSymbol} onChange={e => setTokenSymbol(e.target.value)} />
        <input type="number" placeholder="Funding goal (test-crypto)" value={fundingGoal} onChange={e => setFundingGoal(e.target.value)} />
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={submit} disabled={loading || !name || !summary || !plan}>{loading ? 'Submitting...' : 'Submit'}</button>
      </div>
    </div>
  )
}

function ProjectDetail({ uid, projectId, onBack }: { uid: string; projectId: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null)
  const [amount, setAmount] = useState('10')
  const [tokens, setTokens] = useState('1')
  const [offers, setOffers] = useState<Offer[]>([])
  const [offerPrice, setOfferPrice] = useState('0.05')
  const [offerAmount, setOfferAmount] = useState('1')
  const [price, setPrice] = useState<number | null>(null)
  const [milestones, setMilestones] = useState<{ id: string; title: string; description?: string; amount: number; status: 'pending' | 'released'; createdAt: number }[]>([])
  const [proposals, setProposals] = useState<{ id: string; milestoneId: string; amount: number; approvals: number; rejections: number; released: boolean; createdAt: number }[]>([])
  const [msTitle, setMsTitle] = useState('')
  const [msAmount, setMsAmount] = useState('')
  const [prAmount, setPrAmount] = useState('')
  const reload = () => api<Project>(`/projects/${projectId}`, {}, uid).then(setProject)
  const loadOffers = () => api<Offer[]>(`/projects/${projectId}/offers`, {}, uid).then(setOffers)
  const loadPrice = () => api<{ price: number }>(`/projects/${projectId}/price`, {}, uid).then(r => setPrice(r.price))
  const loadMilestones = () => api<typeof milestones>(`/projects/${projectId}/milestones`, {}, uid).then(setMilestones)
  const loadProposals = () => api<any[]>(`/projects/${projectId}/proposals`, {}, uid).then(list => setProposals(list))
  useEffect(() => { reload().catch(console.error); loadOffers().catch(console.error) }, [projectId])
  useEffect(() => { loadPrice().catch(() => {}); loadMilestones().catch(() => {}); loadProposals().catch(() => {}) }, [projectId])
  const buy = async () => {
    try {
      const r = await api<{ project: Project; tokensOut: number }>(`/projects/${projectId}/buy`, { method: 'POST', body: JSON.stringify({ amount: Number(amount) }) }, uid)
      setProject(r.project)
      alert(`Bought ${r.tokensOut} tokens`)
    } catch (e) { alert(String(e)) }
  }
  const sell = async () => {
    try {
      const r = await api<{ project: Project; amountOut: number }>(`/projects/${projectId}/sell`, { method: 'POST', body: JSON.stringify({ tokens: Number(tokens) }) }, uid)
      setProject(r.project)
      alert(`Received ${r.amountOut.toFixed(2)} back`)
    } catch (e) { alert(String(e)) }
  }
  const createOffer = async () => {
    try {
      await api<Offer>(`/projects/${projectId}/offers`, { method: 'POST', body: JSON.stringify({ pricePerToken: Number(offerPrice), amount: Number(offerAmount) }) }, uid)
      await loadOffers()
      alert('Offer created')
    } catch (e) { alert(String(e)) }
  }
  const fillOffer = async (offerId: string, takeAmount: number) => {
    try {
      await api<{ offer: Offer }>(`/projects/${projectId}/offers/${offerId}/fill`, { method: 'POST', body: JSON.stringify({ amount: takeAmount }) }, uid)
      await loadOffers()
      alert('Offer filled')
    } catch (e) { alert(String(e)) }
  }
  const createMilestone = async () => {
    try {
      await api(`/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify({ title: msTitle, amount: Number(msAmount) }) }, uid)
      setMsTitle(''); setMsAmount(''); await loadMilestones()
    } catch (e) { alert(String(e)) }
  }
  const createProposal = async (milestoneId: string) => {
    try {
      await api(`/projects/${projectId}/proposals`, { method: 'POST', body: JSON.stringify({ milestoneId, amount: Number(prAmount) }) }, uid)
      setPrAmount(''); await loadProposals()
    } catch (e) { alert(String(e)) }
  }
  const voteProposal = async (proposalId: string, approve: boolean) => {
    try { await api(`/projects/${projectId}/proposals/${proposalId}/vote`, { method: 'POST', body: JSON.stringify({ approve }) }, uid); await loadProposals() } catch (e) { alert(String(e)) }
  }
  const releaseProposal = async (proposalId: string) => {
    try { const r = await api<{ project: Project }>(`/projects/${projectId}/proposals/${proposalId}/release`, { method: 'POST', body: JSON.stringify({}) }, uid); setProject(r.project); await Promise.all([loadProposals(), loadMilestones(), loadPrice()]) } catch (e) { alert(String(e)) }
  }
  if (!project) return (
    <div>
      <button onClick={onBack}>Back</button>
      <div>Loading...</div>
    </div>
  )
  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <button className="btn" onClick={onBack}>Back</button>
      </div>
      <h2>{project.name}</h2>
      {project.videoUrl && <VideoEmbed url={project.videoUrl} />}
      <p>{project.summary}</p>
      {project.resumesUrl && <div><a href={project.resumesUrl} target="_blank">Team</a></div>}
      <p>{project.plan}</p>
      <div className="row tags" style={{ marginTop: 12 }}>
        <span className="tag">{project.tokenSymbol ? project.tokenSymbol : 'TOK'}</span>
        <span className="tag">Raised: {project.reserve.toFixed(2)}{typeof project.fundingGoal === 'number' ? ` / ${project.fundingGoal}` : ''}</span>
        {price != null && <span className="tag">Current price: {price.toFixed(4)}</span>}
        <span className="tag">Supply: {project.supply}</span>
        <span className="tag">{project.capReached ? 'Cap reached' : 'Open'}</span>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-title">Milestones</div>
        {milestones.length === 0 && <div className="empty">No milestones yet</div>}
        <div className="stack">
          {milestones.map(m => (
            <div key={m.id} className="row" style={{ justifyContent: 'space-between' }}>
              <div>{m.title} • {m.amount} • {m.status}</div>
              <div className="row">
                <input style={{ width: 140 }} type="number" placeholder="Proposal amount" value={prAmount} onChange={e => setPrAmount(e.target.value)} />
                <button className="btn" onClick={() => createProposal(m.id)}>Create Proposal</button>
              </div>
            </div>
          ))}
          <div className="row">
            <input placeholder="Milestone title" value={msTitle} onChange={e => setMsTitle(e.target.value)} />
            <input type="number" placeholder="Amount" value={msAmount} onChange={e => setMsAmount(e.target.value)} />
            <button className="btn" onClick={createMilestone}>Add Milestone</button>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-title">Proposals</div>
        {proposals.length === 0 && <div className="empty">No proposals yet</div>}
        <div className="stack">
          {proposals.map(p => (
            <div key={p.id} className="row" style={{ justifyContent: 'space-between' }}>
              <div>Milestone {p.milestoneId} • {p.amount} • Approvals {p.approvals} / Rejections {p.rejections} {p.released ? '• Released' : ''}</div>
              <div className="row">
                <button className="btn" onClick={() => voteProposal(p.id, true)}>Approve</button>
                <button className="btn" onClick={() => voteProposal(p.id, false)}>Reject</button>
                <button className="btn btn-primary" disabled={p.released} onClick={() => releaseProposal(p.id)}>Release</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="buy-sell">
        <div className="section-title">Buy</div>
        <input type="number" min={0} value={amount} onChange={e => setAmount(e.target.value)} />
        <button className="btn btn-primary" onClick={buy} disabled={project.capReached}>Contribute (test)</button>
        <div className="section-title">Sell</div>
        <input type="number" min={0} value={tokens} onChange={e => setTokens(e.target.value)} />
        <button className="btn" onClick={sell}>Sell tokens</button>
        <div className="section-title">Secondary Market (Offers)</div>
        <div className="stack">
          <div>Create Sell Offer</div>
          <input type="number" min={0} step={0.0001} value={offerPrice} onChange={e => setOfferPrice(e.target.value)} placeholder="Price per token" />
          <input type="number" min={0} value={offerAmount} onChange={e => setOfferAmount(e.target.value)} placeholder="Amount" />
          <button className="btn" onClick={createOffer}>List Offer</button>
        </div>
        <div className="offers">
          <div className="section-title">Open Offers</div>
          {offers.length === 0 && <div className="empty">No open offers</div>}
          {offers.map(o => (
            <div key={o.id} className="card">
              <div>Seller: {o.sellerId}</div>
              <div>Price: {o.pricePerToken} • Amount: {o.amount}</div>
              <button className="btn btn-primary" onClick={() => fillOffer(o.id, 1)} disabled={o.amount <= 0}>Buy 1</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Holdings({ uid }: { uid: string }) {
  const [list, setList] = useState<Holding[]>([])
  const [projects, setProjects] = useState<Record<string, Project>>({})
  useEffect(() => {
    Promise.all([
      api<Holding[]>('/me/holdings', {}, uid),
      api<Project[]>('/projects', {}, uid),
    ]).then(([h, p]) => {
      setList(h)
      setProjects(Object.fromEntries(p.map(x => [x.id, x])))
    }).catch(console.error)
  }, [uid])
  return (
    <div className="grid">
      {list.length === 0 && <div className="empty">No holdings yet</div>}
      {list.map(h => (
        <div key={h.projectId} className="card">
          <div style={{ fontWeight: 600 }}>{projects[h.projectId]?.name || h.projectId}</div>
          <div className="muted">Balance: {h.balance}</div>
        </div>
      ))}
    </div>
  )
}

type Offer = { id: string; projectId: string; sellerId: string; pricePerToken: number; amount: number; createdAt: number; status: 'open' | 'filled' | 'cancelled' }

function Launch({ uid }: { uid: string }) {
  const [projects, setProjects] = useState<Project[]>([])
  useEffect(() => { api<Project[]>('/launch', {}, uid).then(setProjects).catch(console.error) }, [uid])
  return (
    <div>
      <h2>Launch Zone</h2>
      {projects.length === 0 && <div className="empty">No launched projects yet</div>}
      <div className="grid">
        {projects.map(p => (
          <div key={p.id} className="card">
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <div className="muted" style={{ margin: '6px 0' }}>{p.summary}</div>
            <div className="row small muted tags">
              <span className="tag">Supply: {p.supply}</span>
              <span className="tag">Raised: {p.reserve.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="landing">
      <div className="hero hero-animate landing-hero">
        <div className="aurora" aria-hidden="true"></div>
        <div className="headline" style={{ fontSize: 48 }}>Unicorn Factory</div>
        <div className="subheadline" style={{ fontSize: 18 }}>Welcome to the launchpad for AI & Deep‑Tech startups
        </div>
        <div className="cta-row" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary cta cta-gloss" onClick={onStart}>Start</button>
        </div>
      </div>
    </div>
  )
}

function ActivityTicker({ items }: { items: { id: string; text: string; ts: number }[] }) {
  return (
    <div className="ticker">
      <div className="ticker-title">Live activity</div>
      <div className="ticker-items">
        {items.map(i => (
          <div key={i.id} className="ticker-item">{i.text}</div>
        ))}
      </div>
    </div>
  )
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className="progress">
      <div className="progress-bar" style={{ width: `${v}%` }} />
    </div>
  )
}

function VideoEmbed({ url }: { url: string }) {
  const isYouTube = /youtu\.be|youtube\.com/.test(url)
  const isVimeo = /vimeo\.com/.test(url)
  if (isYouTube) {
    const idMatch = url.match(/(?:v=|youtu\.be\/)([\w-]+)/)
    const id = idMatch?.[1]
    if (id) {
      return (
        <div className="video-embed">
          <iframe
            src={`https://www.youtube.com/embed/${id}`}
            title="Pitch video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      )
    }
  }
  if (isVimeo) {
    const idMatch = url.match(/vimeo\.com\/(\d+)/)
    const id = idMatch?.[1]
    if (id) {
      return (
        <div className="video-embed">
          <iframe
            src={`https://player.vimeo.com/video/${id}`}
            title="Pitch video"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      )
    }
  }
  return (
    <div className="video-embed">
      <video controls src={url} />
    </div>
  )
}

