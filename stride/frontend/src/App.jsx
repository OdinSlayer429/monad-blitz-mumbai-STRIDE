import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { CONTRACT_ADDRESS, ABI } from './contract.js'

const ORACLE_URL = 'http://172.16.0.190:3001'

const MONAD_TESTNET = {
  chainId: '0x279f',
  chainName: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com'],
}

const BADGE_NAMES = {
  1: '⚡ Week Warrior',
  2: '🔩 Iron Strider',
  3: '👥 Squad Captain',
  4: '🏆 Perfect Month',
  5: '🏢 Corporate Champ',
}

export default function App() {
  const [account, setAccount]       = useState(null)
  const [contract, setContract]     = useState(null)
  const [isOwner, setIsOwner]       = useState(false)
  const [view, setView]             = useState('home')
  const [activePoolId, setActivePoolId] = useState(null)
  const [txSpeed, setTxSpeed]       = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const pid = params.get('pool')
    if (pid !== null) { setActivePoolId(Number(pid)); setView('pool') }
  }, [])

  async function connectWallet() {
    if (!window.ethereum) return alert('MetaMask not found')
    try {
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_TESTNET.chainId }] })
      } catch {
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [MONAD_TESTNET] })
      }
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      await provider.send('eth_requestAccounts', [])
      const signer  = provider.getSigner()
      const addr    = await signer.getAddress()
      const c       = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer)
      const owner   = await c.owner()
      setAccount(addr)
      setContract(c)
      setIsOwner(addr.toLowerCase() === owner.toLowerCase())
    } catch (e) { console.error(e) }
  }

  async function sendTx(fn) {
    const start = Date.now()
    const tx = await fn()
    await tx.wait()
    setTxSpeed(((Date.now() - start) / 1000).toFixed(2))
    return tx
  }

  function openPool(id) { setActivePoolId(Number(id)); setView('pool') }

  return (
    <div className="min-h-screen bg-black text-white font-mono">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-green-400">STRIDE</span>
          <span className="text-zinc-500 text-sm hidden sm:block">Stake. Walk. Win.</span>
        </div>
        <div className="flex items-center gap-3">
          {txSpeed && (
            <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-1 rounded animate-pulse">
              ⚡ Monad: {txSpeed}s
            </span>
          )}
          {account ? (
            <div className="flex items-center gap-3">
              <button onClick={() => setView('home')}    className="text-sm text-zinc-400 hover:text-white">Home</button>
              <button onClick={() => setView('profile')} className="text-sm text-zinc-400 hover:text-white">Profile</button>
              <span className="bg-zinc-800 px-3 py-1 rounded text-xs text-green-400">
                {account.slice(0,6)}...{account.slice(-4)}
                {isOwner && <span className="ml-1 text-yellow-400">👑</span>}
              </span>
            </div>
          ) : (
            <button onClick={connectWallet}
              className="bg-green-500 hover:bg-green-400 text-black font-bold px-4 py-2 rounded transition-colors">
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {view === 'home'    && <HomeView account={account} contract={contract} sendTx={sendTx} onOpenPool={openPool} />}
        {view === 'pool'    && <PoolView account={account} contract={contract} poolId={activePoolId} sendTx={sendTx} isOwner={isOwner} onBack={() => setView('home')} />}
        {view === 'profile' && <ProfileView account={account} contract={contract} />}
      </main>
    </div>
  )
}

// ─── HOME ────────────────────────────────────────────────────────────────────

function HomeView({ account, contract, sendTx, onOpenPool }) {
  const [stepGoal,  setStepGoal]  = useState('10000')
  const [stake,     setStake]     = useState('0.01')
  const [duration,  setDuration]  = useState('1')
  const [mode,      setMode]      = useState(0)   // 0=STRICT, 1=FLEXIBLE
  const [joinId,    setJoinId]    = useState('')
  const [viewId,    setViewId]    = useState('')
  const [loading,   setLoading]   = useState('')
  const [shareLink, setShareLink] = useState(null)

  async function createPool() {
    if (!contract) return alert('Connect wallet first')
    setLoading('create')
    try {
      const stakeWei = ethers.utils.parseEther(stake)
      const tx = await sendTx(() =>
        contract.createPool(
          ethers.constants.AddressZero,  // native MON
          stakeWei,
          stepGoal,
          duration,
          mode,
          0,       // 0% commission
          0,       // start immediately
          { value: stakeWei }
        )
      )
      const receipt = await contract.provider.getTransactionReceipt(tx.hash)
      const iface   = new ethers.utils.Interface(ABI)
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log)
          if (parsed.name === 'PoolCreated') {
            const id   = parsed.args.poolId.toString()
            const link = `${window.location.origin}?pool=${id}`
            setShareLink({ id, link })
            window.history.pushState({}, '', `?pool=${id}`)
            break
          }
        } catch {}
      }
    } catch (e) { alert(e.reason || e.message) }
    setLoading('')
  }

  async function joinPool() {
    if (!contract) return alert('Connect wallet first')
    if (!joinId)   return alert('Enter a Pool ID')
    setLoading('join')
    try {
      const d = await contract.getPoolDetails(joinId)
      await sendTx(() => contract.joinPool(joinId, { value: d.stakePerPerson }))
      onOpenPool(joinId)
    } catch (e) { alert(e.reason || e.message) }
    setLoading('')
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2 py-4">
        <h1 className="text-5xl font-bold text-green-400">STRIDE</h1>
        <p className="text-zinc-400 text-sm">Zero-sum on-chain fitness accountability · Monad Testnet</p>
      </div>

      {/* Create Pool */}
      <div className="bg-zinc-900 rounded-xl p-6 space-y-4 border border-zinc-800">
        <h2 className="font-bold text-lg">Create Pool</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Daily Step Goal</label>
            <input className="w-full bg-zinc-800 rounded px-3 py-2 text-white border border-zinc-700 focus:border-green-500 outline-none"
              type="number" value={stepGoal} onChange={e => setStepGoal(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Stake (MON)</label>
            <input className="w-full bg-zinc-800 rounded px-3 py-2 text-white border border-zinc-700 focus:border-green-500 outline-none"
              type="number" step="0.001" value={stake} onChange={e => setStake(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Duration (days)</label>
            <input className="w-full bg-zinc-800 rounded px-3 py-2 text-white border border-zinc-700 focus:border-green-500 outline-none"
              type="number" min="1" max="365" value={duration} onChange={e => setDuration(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Mode</label>
            <div className="flex gap-2 mt-1">
              {[['STRICT', 0], ['FLEXIBLE', 1]].map(([label, val]) => (
                <button key={val} onClick={() => setMode(val)}
                  className={`flex-1 py-2 rounded text-xs font-bold border transition-colors ${mode === val ? 'border-green-500 bg-green-500/20 text-green-400' : 'border-zinc-600 text-zinc-400 hover:border-zinc-400'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="text-xs text-zinc-500 bg-zinc-800 rounded p-3">
          {mode === 0
            ? '⚠️ STRICT: Miss one day → forfeit entire stake'
            : '🔄 FLEXIBLE: Miss a day → lose only that day\'s share'}
        </div>
        <button onClick={createPool} disabled={loading === 'create' || !account}
          className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold py-3 rounded transition-colors">
          {loading === 'create' ? 'Creating...' : '+ Create Pool'}
        </button>
        {shareLink && (
          <div className="bg-zinc-800 rounded-lg p-4 space-y-1">
            <p className="text-xs text-zinc-400">Pool #{shareLink.id} created! Share link:</p>
            <div className="flex items-center gap-2">
              <p className="text-green-400 text-xs flex-1 break-all">{shareLink.link}</p>
              <button onClick={() => navigator.clipboard.writeText(shareLink.link)}
                className="text-zinc-400 hover:text-white shrink-0">📋</button>
            </div>
            <button onClick={() => onOpenPool(shareLink.id)}
              className="w-full mt-2 border border-green-500 text-green-400 text-sm py-1 rounded hover:bg-green-500/10 transition-colors">
              Open Pool →
            </button>
          </div>
        )}
      </div>

      {/* Join Pool */}
      <div className="bg-zinc-900 rounded-xl p-6 space-y-4 border border-zinc-800">
        <h2 className="font-bold text-lg">Join Pool</h2>
        <div className="flex gap-2">
          <input className="flex-1 bg-zinc-800 rounded px-3 py-2 text-white border border-zinc-700 focus:border-green-500 outline-none"
            type="number" placeholder="Pool ID" value={joinId} onChange={e => setJoinId(e.target.value)} />
          <button onClick={joinPool} disabled={loading === 'join' || !account}
            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold px-6 rounded transition-colors">
            {loading === 'join' ? '...' : 'Join'}
          </button>
        </div>
      </div>

      {/* View Pool */}
      <div className="bg-zinc-900 rounded-xl p-6 space-y-4 border border-zinc-800">
        <h2 className="font-bold text-lg">View Pool</h2>
        <div className="flex gap-2">
          <input className="flex-1 bg-zinc-800 rounded px-3 py-2 text-white border border-zinc-700 focus:border-green-500 outline-none"
            type="number" placeholder="Pool ID" value={viewId} onChange={e => setViewId(e.target.value)} />
          <button onClick={() => viewId && onOpenPool(viewId)}
            className="bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded transition-colors">
            View →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── POOL VIEW ───────────────────────────────────────────────────────────────

function PoolView({ account, contract, poolId, sendTx, isOwner, onBack }) {
  const [details,   setDetails]   = useState(null)
  const [members,   setMembers]   = useState([])
  const [progress,  setProgress]  = useState({})  // addr → { completedDays, forfeited, steps }
  const [pending,   setPending]   = useState('0')
  const [stepInput, setStepInput] = useState('8000')
  const [loading,   setLoading]   = useState('')

  async function load() {
    if (!contract || poolId === null) return
    try {
      const d = await contract.getPoolDetails(poolId)
      setDetails(d)
      const m = await contract.getMembers(poolId)
      setMembers(m)
      const map = {}
      for (const addr of m) {
        const [completedDays, forfeited] = await contract.getMemberProgress(poolId, addr)
        const steps = await contract.getMemberSteps(poolId, addr)
        map[addr] = { completedDays: completedDays.toNumber(), forfeited, steps: steps.toString() }
      }
      setProgress(map)
      if (account) {
        const p = await contract.pendingWithdrawals(account)
        setPending(ethers.utils.formatEther(p))
      }
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [contract, poolId, account])

  async function submitSteps() {
    if (!contract || !account) return alert('Connect wallet')
    setLoading('steps')
    try {
      const date = Math.floor(Date.now() / 86400000)
      const res = await fetch(`${ORACLE_URL}/sign-steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: account, poolId, steps: stepInput, date }),
      })
      if (!res.ok) throw new Error('Oracle signing failed — is node index.js running?')
      const { signature } = await res.json()
      await sendTx(() => contract.submitSteps(poolId, stepInput, date, signature))
      await load()
    } catch (e) { alert(e.reason || e.message) }
    setLoading('')
  }

  async function finalize(force = false) {
    setLoading(force ? 'force' : 'finalize')
    try {
      await sendTx(() => contract.finalize(poolId))
      await load()
    } catch (e) { alert(e.reason || e.message) }
    setLoading('')
  }

  async function withdraw() {
    setLoading('withdraw')
    try {
      await sendTx(() => contract.withdraw(ethers.constants.AddressZero))
      await load()
    } catch (e) { alert(e.reason || e.message) }
    setLoading('')
  }

  const goal   = details?.dailyStepGoal?.toNumber() || 0
  const sorted = [...members].sort((a,b) => (Number(progress[b]?.steps)||0) - (Number(progress[a]?.steps)||0))
  const MODE_LABELS = { 0: 'STRICT', 1: 'FLEXIBLE' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-zinc-400 hover:text-white text-sm">← Back</button>
        <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}?pool=${poolId}`)}
          className="text-xs text-zinc-400 hover:text-green-400 transition-colors">
          Share Pool #{poolId} 📋
        </button>
      </div>

      {/* Stats */}
      {details && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Step Goal',     value: Number(details.dailyStepGoal).toLocaleString(), color: 'text-green-400' },
              { label: 'Players',       value: details.memberCount.toString(),                  color: 'text-white' },
              { label: 'Total Staked',  value: `${parseFloat(ethers.utils.formatEther(details.totalStaked)).toFixed(3)} MON`, color: 'text-yellow-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 text-center">
                <p className="text-zinc-400 text-xs mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <span className={`text-xs px-2 py-1 rounded border ${details.mode === 0 ? 'border-red-700 text-red-400 bg-red-900/20' : 'border-blue-700 text-blue-400 bg-blue-900/20'}`}>
              {MODE_LABELS[details.mode]} mode
            </span>
            <span className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-400">
              {details.durationDays.toString()} day{details.durationDays > 1 ? 's' : ''}
            </span>
            {details.finalized && (
              <span className="text-xs px-2 py-1 rounded border border-green-700 text-green-400 bg-green-900/20">
                ✅ Finalized
              </span>
            )}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Leaderboard</h3>
          <span className="text-xs text-zinc-500">↻ Live · every 5s</span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-zinc-500 text-sm">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((addr, i) => {
              const p     = progress[addr] || {}
              const steps = Number(p.steps) || 0
              const isMe  = addr.toLowerCase() === account?.toLowerCase()
              return (
                <div key={addr} className={`flex items-center justify-between rounded px-4 py-3 ${isMe ? 'bg-green-900/30 border border-green-800' : 'bg-zinc-800'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 text-sm w-5">{i + 1}</span>
                    <div>
                      <span className="text-xs font-mono">
                        {addr.slice(0,6)}...{addr.slice(-4)}
                        {isMe && <span className="ml-1 text-green-400">(you)</span>}
                      </span>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {p.completedDays || 0} days completed
                        {p.forfeited && <span className="ml-2 text-red-400">❌ forfeited</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-sm">{steps.toLocaleString()}</span>
                    <span className="text-zinc-500 text-xs ml-1">steps</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Submit Steps */}
      {!details?.finalized && (
        <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800 space-y-4">
          <h3 className="font-bold">Log Steps</h3>
          <div className="flex gap-2">
            <input className="flex-1 bg-zinc-800 rounded px-3 py-2 text-white border border-zinc-700 focus:border-green-500 outline-none"
              type="number" value={stepInput} onChange={e => setStepInput(e.target.value)} placeholder="Steps today" />
            <button onClick={submitSteps} disabled={loading === 'steps' || !account}
              className="bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-bold px-6 rounded transition-colors">
              {loading === 'steps' ? '...' : 'Submit'}
            </button>
          </div>
          <p className="text-xs text-zinc-500">Signed by STRIDE oracle · oracle must be running on :3001</p>
        </div>
      )}

      {/* Actions */}
      {!details?.finalized && (
        <div className="space-y-3">
          <button onClick={() => finalize(false)} disabled={!!loading}
            className="w-full border border-red-500 hover:bg-red-500/10 text-red-400 font-bold py-3 rounded transition-colors disabled:opacity-50">
            {loading === 'finalize' ? 'Finalizing...' : 'Finalize Pool (after end)'}
          </button>
          {isOwner && (
            <button onClick={() => finalize(true)} disabled={!!loading}
              className="w-full border border-yellow-600 hover:bg-yellow-600/10 text-yellow-400 font-bold py-2 rounded transition-colors disabled:opacity-50 text-sm">
              {loading === 'force' ? 'Forcing...' : '👑 Force Finalize (demo only)'}
            </button>
          )}
        </div>
      )}

      {parseFloat(pending) > 0 && (
        <button onClick={withdraw} disabled={loading === 'withdraw'}
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 rounded transition-colors disabled:opacity-50">
          {loading === 'withdraw' ? '...' : `Claim ${parseFloat(pending).toFixed(4)} MON`}
        </button>
      )}
    </div>
  )
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────

function ProfileView({ account, contract }) {
  const [badgeLevel, setBadgeLevel] = useState(0)
  const [profile,    setProfile]    = useState({ wins: 0, challenges: 0 })
  const [pending,    setPending]    = useState('0')

  useEffect(() => {
    async function load() {
      if (!contract || !account) return
      const b = await contract.badge(account)
      setBadgeLevel(b.toNumber())
      const [wins, challenges] = await contract.getProfile(account)
      setProfile({ wins: wins.toNumber(), challenges: challenges.toNumber() })
      const p = await contract.pendingWithdrawals(account)
      setPending(ethers.utils.formatEther(p))
    }
    load()
  }, [contract, account])

  if (!account) return <div className="text-center py-20 text-zinc-400">Connect your wallet to view profile.</div>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Profile</h2>

      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <p className="text-xs text-zinc-400 mb-1">Address</p>
        <p className="font-mono text-green-400 break-all text-sm">{account}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 text-center">
          <p className="text-xs text-zinc-400 mb-1">Wins</p>
          <p className="text-2xl font-bold text-green-400">{profile.wins}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 text-center">
          <p className="text-xs text-zinc-400 mb-1">Challenges</p>
          <p className="text-2xl font-bold">{profile.challenges}</p>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
        <p className="text-xs text-zinc-400 mb-3">Soulbound Badge</p>
        {badgeLevel > 0 ? (
          <div className="space-y-2">
            <p className="text-2xl font-bold">{BADGE_NAMES[badgeLevel]}</p>
            <div className="flex gap-1 mt-2">
              {[1,2,3,4,5].map(l => (
                <div key={l} className={`h-2 flex-1 rounded ${l <= badgeLevel ? 'bg-green-400' : 'bg-zinc-700'}`} />
              ))}
            </div>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">No badge yet — win a pool to earn one.</p>
        )}
      </div>

      {parseFloat(pending) > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-600 rounded-xl p-6">
          <p className="text-yellow-400 font-bold text-lg">Unclaimed: {parseFloat(pending).toFixed(6)} MON</p>
          <p className="text-zinc-400 text-xs mt-1">Open your pool to claim winnings.</p>
        </div>
      )}
    </div>
  )
}
