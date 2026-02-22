'use strict';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONTRACT_ADDRESS = '0xFbe9a33D316e6fAa0AD00756F60c18db39F9e339';
const ORACLE_URL       = 'http://172.16.0.190:3001';
const ZERO_ADDR        = '0x0000000000000000000000000000000000000000';

const MONAD_TESTNET = {
  chainId:           '0x279f',
  chainName:         'Monad Testnet',
  nativeCurrency:    { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls:           ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com'],
};

const ABI = [
  'function createPool(address token, uint256 stakePerPerson, uint256 dailyStepGoal, uint256 durationDays, uint8 mode, uint256 commissionBps, uint256 startDelay) payable returns (uint256)',
  'function joinPool(uint256 poolId) payable',
  'function submitSteps(uint256 poolId, uint256 steps, uint256 day, bytes calldata signature) external',
  'function finalize(uint256 poolId) external',
  'function withdraw(address token) external',
  'function getPoolDetails(uint256 poolId) view returns (address token, uint256 stakePerPerson, uint256 dailyStepGoal, uint256 durationDays, uint8 mode, bool finalized, uint256 memberCount, uint256 totalStaked, uint256 commissionBps, uint256 startTimestamp)',
  'function getMembers(uint256 poolId) view returns (address[])',
  'function getMemberProgress(uint256 poolId, address member) view returns (uint256 completedDays, bool forfeited, bool memberExists)',
  'function getMemberSteps(uint256 poolId, address member) view returns (uint256)',
  'function pendingWithdrawals(address) view returns (uint256)',
  'function getProfile(address user) view returns (uint256 wins, uint256 challenges)',
  'function badge(address) view returns (uint256)',
  'function isMember(uint256, address) view returns (bool)',
  'function owner() view returns (address)',
  'function poolCount() view returns (uint256)',
  'event PoolCreated(uint256 indexed poolId, address indexed creator, address token, uint256 stakePerPerson, uint256 dailyStepGoal, uint256 durationDays, uint8 mode)',
];

const BADGE_NAMES = {
  1: '⚡ Week Warrior',
  2: '🔩 Iron Strider',
  3: '👥 Squad Captain',
  4: '🏆 Perfect Month',
  5: '🏢 Corporate Champ',
};

const CHALLENGE_PRESETS = {
  '7day':   { label: '7-Day Sprint',     stepGoal: 10000, duration: 7,  mode: 0, stake: '0.05' },
  '1month': { label: '1-Month Marathon', stepGoal: 10000, duration: 30, mode: 1, stake: '0.05' },
};

// ─── STATE ────────────────────────────────────────────────────────────────────
let _provider        = null;
let _signer          = null;
let _contract        = null;
let _account         = null;
let _isOwner         = false;
let _healthConnected = false;
let _pendingTxFn     = null;
let _pendingSubmitPoolId = null;

// Motion sensor
let _stepCount    = 0;
let _lastMag      = 0;
let _lastStepTime = 0;
const STEP_THRESHOLD   = 1.2;
const STEP_COOLDOWN_MS = 300;

// ─── INIT ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Loader progress bar
  const bar    = document.getElementById('progress-bar');
  const loader = document.getElementById('loader');
  const appEl  = document.getElementById('app');
  let prog = 0;
  const iv = setInterval(() => {
    prog += Math.random() * 15 + 5;
    if (prog >= 100) {
      prog = 100;
      clearInterval(iv);
      setTimeout(() => {
        loader.classList.add('fade-out');
        appEl.classList.remove('hidden');
        setTimeout(() => loader.classList.add('hidden'), 1000);
      }, 300);
    }
    bar.style.width = Math.min(prog, 100) + '%';
  }, 100);

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + btn.dataset.target).classList.add('active');
      if (btn.dataset.target === 'dashboard' && _account) _refreshDashboard();
    });
  });

  // Auto-fill pool ID from share link
  const params = new URLSearchParams(window.location.search);
  const poolParam = params.get('pool');
  if (poolParam !== null) {
    ['input-7day-pool-id', 'input-1month-pool-id'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = poolParam;
    });
    setTimeout(() => {
      document.querySelector('.nav-btn[data-target="challenges"]')?.click();
    }, 600);
  }

  lucide.createIcons();
});

// ─── STEP COUNTER ─────────────────────────────────────────────────────────────
function _handleMotion(e) {
  const acc = e.accelerationIncludingGravity;
  if (!acc || acc.x == null) return;
  const mag  = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  const diff = Math.abs(mag - _lastMag);
  const now  = Date.now();
  if (diff > STEP_THRESHOLD && (now - _lastStepTime) > STEP_COOLDOWN_MS) {
    _stepCount++;
    _lastStepTime = now;
    _updateStepUI();
  }
  _lastMag = mag;
}

function _updateStepUI() {
  ['live-step-count', 'profile-steps'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = _stepCount.toLocaleString();
  });
}

async function _startMotionSensor() {
  if (typeof DeviceMotionEvent === 'undefined') {
    throw new Error('Motion sensor not supported. Open this page on a mobile device in Chrome.');
  }
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    const result = await DeviceMotionEvent.requestPermission();
    if (result !== 'granted') throw new Error('Motion sensor permission denied.');
  }
  _stepCount = 0; _lastMag = 0; _lastStepTime = 0;
  window.addEventListener('devicemotion', _handleMotion, { passive: true });
  _updateStepUI();
  const s = document.getElementById('step-counter-status');
  if (s) s.textContent = '🟢 Counting steps live...';
}

// ─── UI HELPERS ───────────────────────────────────────────────────────────────
function _showModal(id) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  lucide.createIcons();
}

function _showError(msg) {
  document.getElementById('error-message-text').textContent = msg;
  _showModal('modal-error');
}

function _setConnectedUI(addr) {
  document.getElementById('btn-connect-wallet').classList.add('hidden');
  document.getElementById('user-info').classList.remove('hidden');
  const short = addr.slice(0, 6) + '...' + addr.slice(-4);
  const navAddr = document.getElementById('nav-wallet-address');
  if (navAddr) navAddr.textContent = short;
  const profWallet = document.getElementById('profile-wallet');
  if (profWallet) profWallet.textContent = 'Connected: ' + short;
  const profUser = document.getElementById('profile-username');
  if (profUser) profUser.textContent = addr.slice(0, 8);
  document.querySelectorAll('.connected-only').forEach(el => el.classList.remove('hidden'));
  document.querySelectorAll('.disconnected-only').forEach(el => el.classList.add('hidden'));
}

function _setHealthConnectedUI() {
  document.querySelectorAll('.health-connected-only').forEach(el => el.classList.remove('hidden'));
  document.querySelectorAll('.health-disconnected-only').forEach(el => el.classList.add('hidden'));
  const btn = document.getElementById('btn-connect-health');
  if (btn) { btn.textContent = 'Connected ✓'; btn.disabled = true; }
}

function _showMonadBadge(seconds) {
  const badge = document.getElementById('monad-speed-badge');
  if (!badge) return;
  badge.textContent = '⚡ Monad: ' + seconds.toFixed(1) + 's';
  badge.classList.remove('hidden');
}

// ─── CHAIN HELPERS ────────────────────────────────────────────────────────────
async function _switchToMonad() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_TESTNET.chainId }],
    });
  } catch (e) {
    if (e.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [MONAD_TESTNET],
      });
    } else throw e;
  }
}

async function _getOracleSignature(poolId, steps) {
  const day = Math.floor(Date.now() / 86400000);
  const res = await fetch(ORACLE_URL + '/sign-steps', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: _account, poolId, steps, date: day }),
  });
  if (!res.ok) throw new Error('Oracle error: ' + (await res.text()));
  const { signature } = await res.json();
  return { signature, day };
}

// ─── DATA LOADERS ─────────────────────────────────────────────────────────────
async function _loadProfile() {
  if (!_account || !_contract) return;
  try {
    // Badge
    const badgeLevel = (await _contract.badge(_account)).toNumber();
    if (badgeLevel > 0) {
      const sec = document.getElementById('badge-section');
      if (sec) sec.classList.remove('hidden');
      const bd = document.getElementById('badge-display');
      if (bd) bd.textContent = BADGE_NAMES[badgeLevel] || 'Level ' + badgeLevel;
      for (let i = 1; i <= 5; i++) {
        const pip = document.getElementById('pip-' + i);
        if (pip) Object.assign(pip.style, {
          width: '24px', height: '24px', borderRadius: '50%',
          background: i <= badgeLevel ? 'var(--deep-red)' : 'var(--border-color)',
        });
      }
    }

    // W/L stats
    const [wins, challenges] = await _contract.getProfile(_account);
    const wEl = document.getElementById('profile-wins');
    const wlEl = document.getElementById('profile-wl');
    const scEl = document.getElementById('stat-challenges');
    if (wEl) wEl.textContent = wins.toString();
    if (wlEl) wlEl.textContent = wins.toString() + ' / ' + (challenges.toNumber() - wins.toNumber());
    if (scEl) scEl.textContent = challenges.toString();

    // Pending withdrawals
    const pending    = await _contract.pendingWithdrawals(_account);
    const pendingMon = parseFloat(ethers.utils.formatEther(pending));
    const spEl = document.getElementById('stat-pending');
    if (spEl) spEl.textContent = pendingMon.toFixed(4) + ' MON';
    if (pendingMon > 0) {
      const ws = document.getElementById('withdraw-section');
      const wa = document.getElementById('withdraw-amount');
      if (ws) ws.classList.remove('hidden');
      if (wa) wa.textContent = pendingMon.toFixed(4) + ' MON';
    }

    // Owner check
    const ownerAddr = await _contract.owner();
    _isOwner = ownerAddr.toLowerCase() === _account.toLowerCase();

  } catch (e) { console.error('Profile load error:', e); }
}

async function _refreshDashboard() {
  if (!_account || !_contract) return;
  const list = document.getElementById('ongoing-challenges-list');
  if (!list) return;
  list.innerHTML = '<p style="color:var(--text-muted);">Loading...</p>';
  try {
    const count = (await _contract.poolCount()).toNumber();
    list.innerHTML = '';
    let found = 0;
    for (let i = 0; i < count; i++) {
      const member = await _contract.isMember(i, _account);
      if (!member) continue;
      found++;
      const d = await _contract.getPoolDetails(i);
      const [completedDays, forfeited] = await _contract.getMemberProgress(i, _account);
      const steps   = await _contract.getMemberSteps(i, _account);
      const goalPct = Math.min(100, (_stepCount / d[2].toNumber()) * 100);
      const card    = document.createElement('div');
      card.className = 'challenge-card card';
      card.innerHTML = `
        <div class="card-header">
          <h4>Pool #${i}</h4>
          <span class="badge ${forfeited ? 'loss' : 'win'}">${forfeited ? 'Forfeited' : 'Active'}</span>
        </div>
        <div class="card-body">
          <p>Daily Goal: ${d[2].toLocaleString()} steps &middot; Duration: ${d[3]} days</p>
          <p>Days Completed: ${completedDays.toString()} &middot; Steps Submitted: ${steps.toLocaleString()}</p>
          <div class="lb-progress"><div class="lb-progress-fill" style="width:${goalPct}%"></div></div>
          <button class="btn btn-outline btn-small mt-1" onclick="app.openSubmitSteps(${i})">
            Submit Today's Steps
          </button>
          ${_isOwner ? `<button class="btn btn-ghost btn-small mt-1" onclick="app.forceFinalize(${i})">👑 Force Finalize</button>` : ''}
        </div>`;
      list.appendChild(card);
    }
    if (found === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);">No active challenges. Join one from the Challenges tab.</p>';
    }
  } catch (e) {
    list.innerHTML = '<p style="color:var(--deep-red);">Error loading challenges.</p>';
    console.error(e);
  }
}

// ─── APP ──────────────────────────────────────────────────────────────────────
const app = {

  async connectWallet() {
    if (!window.ethereum) return _showError('MetaMask not found. Please install MetaMask.');
    try {
      await _switchToMonad();
      _provider = new ethers.providers.Web3Provider(window.ethereum);
      await _provider.send('eth_requestAccounts', []);
      _signer   = _provider.getSigner();
      _contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, _signer);
      _account  = await _signer.getAddress();
      _setConnectedUI(_account);
      await _loadProfile();
    } catch (e) { _showError(e.message || 'Failed to connect wallet.'); }
  },

  connectHealth() {
    if (!_account) { _showModal('modal-connect'); return; }
    document.getElementById('fit-auth-actions').classList.remove('hidden');
    document.getElementById('fit-auth-loader').classList.add('hidden');
    _showModal('modal-google-fit');
  },

  async simulateGoogleFitAuth() {
    document.getElementById('fit-auth-actions').classList.add('hidden');
    document.getElementById('fit-auth-loader').classList.remove('hidden');
    try {
      await _startMotionSensor();
      _healthConnected = true;
      _setHealthConnectedUI();
      app.closeModal();
      await _loadProfile();
    } catch (e) {
      document.getElementById('fit-auth-actions').classList.remove('hidden');
      document.getElementById('fit-auth-loader').classList.add('hidden');
      _showError(e.message);
    }
  },

  openCreateChallengeModal() {
    if (!_account) { _showModal('modal-connect'); return; }
    document.getElementById('create-share-link').classList.add('hidden');
    document.getElementById('btn-create-confirm').classList.remove('hidden');
    _showModal('modal-create');
  },

  async confirmCreatePool() {
    const stepGoal = parseInt(document.getElementById('create-step-goal').value);
    const duration = parseInt(document.getElementById('create-duration').value);
    const stake    = document.getElementById('create-stake').value;
    const mode     = parseInt(document.getElementById('create-mode').value);
    if (!stepGoal || !duration || !stake) return _showError('Please fill in all fields.');
    const btn = document.getElementById('btn-create-confirm');
    btn.textContent = 'Creating...'; btn.disabled = true;
    try {
      const stakeWei = ethers.utils.parseEther(stake);
      const t0 = Date.now();
      const tx = await _contract.createPool(ZERO_ADDR, stakeWei, stepGoal, duration, mode, 0, 0, { value: stakeWei });
      const receipt = await tx.wait();
      _showMonadBadge((Date.now() - t0) / 1000);
      const event  = receipt.events?.find(e => e.event === 'PoolCreated');
      const poolId = event ? event.args.poolId.toNumber() : '?';
      const shareUrl = window.location.origin + window.location.pathname + '?pool=' + poolId;
      document.getElementById('create-share-link').classList.remove('hidden');
      document.getElementById('create-share-url').textContent = shareUrl;
      document.getElementById('created-pool-id').textContent  = poolId;
      document.getElementById('pool-share-url').textContent   = shareUrl;
      btn.textContent = 'Created ✓'; btn.disabled = true;
    } catch (e) {
      btn.textContent = 'Create & Stake'; btn.disabled = false;
      _showError(e.reason || e.message || 'Transaction failed.');
    }
  },

  async joinChallenge(type) {
    if (!_account) { _showModal('modal-connect'); return; }
    const preset   = CHALLENGE_PRESETS[type];
    const inputId  = type === '7day' ? 'input-7day-pool-id' : 'input-1month-pool-id';
    const rawInput = document.getElementById(inputId)?.value?.trim();
    const hasPoolId = rawInput !== '' && rawInput !== undefined;

    if (hasPoolId) {
      const poolId = parseInt(rawInput);
      _pendingTxFn = async () => {
        const stakeWei = ethers.utils.parseEther(preset.stake);
        const t0 = Date.now();
        const tx = await _contract.joinPool(poolId, { value: stakeWei });
        await tx.wait();
        _showMonadBadge((Date.now() - t0) / 1000);
        await _refreshDashboard();
        await _loadProfile();
      };
      document.getElementById('tx-action').textContent = 'Join Pool #' + poolId;
    } else {
      _pendingTxFn = async () => {
        const stakeWei = ethers.utils.parseEther(preset.stake);
        const t0 = Date.now();
        const tx = await _contract.createPool(ZERO_ADDR, stakeWei, preset.stepGoal, preset.duration, preset.mode, 0, 0, { value: stakeWei });
        const receipt = await tx.wait();
        _showMonadBadge((Date.now() - t0) / 1000);
        const event  = receipt.events?.find(e => e.event === 'PoolCreated');
        const poolId = event ? event.args.poolId.toNumber() : null;
        if (poolId !== null) {
          const shareUrl = window.location.origin + window.location.pathname + '?pool=' + poolId;
          document.getElementById('created-pool-id').textContent = poolId;
          document.getElementById('pool-share-url').textContent  = shareUrl;
          setTimeout(() => _showModal('modal-pool-created'), 500);
        }
        await _refreshDashboard();
        await _loadProfile();
      };
      document.getElementById('tx-action').textContent = 'Create ' + preset.label;
    }

    document.getElementById('tx-amount').textContent = preset.stake + ' MON';
    document.querySelector('#modal-transaction .tx-loader')?.classList.add('hidden');
    document.getElementById('tx-success')?.classList.add('hidden');
    document.getElementById('tx-actions')?.classList.remove('hidden');
    _showModal('modal-transaction');
  },

  async executeTransaction() {
    if (!_pendingTxFn) { app.closeModal(); return; }
    const txLoader  = document.querySelector('#modal-transaction .tx-loader');
    const txSuccess = document.getElementById('tx-success');
    const txActions = document.getElementById('tx-actions');
    txActions?.classList.add('hidden');
    txLoader?.classList.remove('hidden');
    try {
      await _pendingTxFn();
      _pendingTxFn = null;
      txLoader?.classList.add('hidden');
      if (txSuccess) {
        txSuccess.classList.remove('hidden');
        const badge = document.getElementById('monad-speed-badge');
        const speedEl = document.getElementById('tx-speed-display');
        if (speedEl && badge) speedEl.textContent = 'Confirmed ' + badge.textContent;
      }
      setTimeout(() => app.closeModal(), 2000);
    } catch (e) {
      _pendingTxFn = null;
      txLoader?.classList.add('hidden');
      txActions?.classList.remove('hidden');
      _showError(e.reason || e.message || 'Transaction failed.');
    }
  },

  openSubmitSteps(poolId) {
    if (!_healthConnected) { app.connectHealth(); return; }
    _pendingSubmitPoolId = poolId;
    document.getElementById('submit-pool-id-display').textContent    = poolId;
    document.getElementById('submit-step-count-display').textContent = _stepCount.toLocaleString();
    document.getElementById('submit-loader')?.classList.add('hidden');
    document.getElementById('btn-submit-steps-confirm')?.classList.remove('hidden');
    _showModal('modal-submit-steps');
  },

  async executeSubmitSteps() {
    if (_pendingSubmitPoolId === null) return;
    if (_stepCount === 0) return _showError('No steps counted yet. Walk around with your phone first.');
    const btn    = document.getElementById('btn-submit-steps-confirm');
    const loader = document.getElementById('submit-loader');
    btn?.classList.add('hidden');
    loader?.classList.remove('hidden');
    try {
      const { signature, day } = await _getOracleSignature(_pendingSubmitPoolId, _stepCount);
      const t0 = Date.now();
      const tx = await _contract.submitSteps(_pendingSubmitPoolId, _stepCount, day, signature);
      await tx.wait();
      _showMonadBadge((Date.now() - t0) / 1000);
      app.closeModal();
      await _refreshDashboard();
    } catch (e) {
      loader?.classList.add('hidden');
      btn?.classList.remove('hidden');
      _showError(e.reason || e.message || 'Submit failed.');
    }
  },

  async forceFinalize(poolId) {
    if (!_isOwner) return;
    try {
      const t0 = Date.now();
      const tx = await _contract.finalize(poolId);
      await tx.wait();
      _showMonadBadge((Date.now() - t0) / 1000);
      await _refreshDashboard();
      await _loadProfile();
    } catch (e) { _showError(e.reason || e.message || 'Finalize failed.'); }
  },

  async withdraw() {
    if (!_account) return;
    try {
      const t0 = Date.now();
      const tx = await _contract.withdraw(ZERO_ADDR);
      await tx.wait();
      _showMonadBadge((Date.now() - t0) / 1000);
      await _loadProfile();
      document.getElementById('withdraw-section')?.classList.add('hidden');
    } catch (e) { _showError(e.reason || e.message || 'Withdraw failed.'); }
  },

  copyShareLink() {
    const url = document.getElementById('create-share-url')?.textContent;
    if (url) navigator.clipboard.writeText(url).then(() => alert('Link copied!'));
  },

  copyPoolShareLink() {
    const url = document.getElementById('pool-share-url')?.textContent;
    if (url) navigator.clipboard.writeText(url).then(() => alert('Link copied!'));
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  },
};
