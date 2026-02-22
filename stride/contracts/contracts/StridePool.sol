// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * ███████╗████████╗██████╗ ██╗██████╗ ███████╗
 * STRIDE — Zero-sum fitness staking protocol.
 * Built for Monad Blitz Mumbai 2026.
 *
 * STRICT   mode: Miss any single day → forfeit ENTIRE stake
 * FLEXIBLE mode: Miss a day → forfeit only THAT day's share
 */
contract StridePool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ─────────────────────────────────────────────────────────────
    // ENUMS & STRUCTS
    // ─────────────────────────────────────────────────────────────

    enum PoolMode { STRICT, FLEXIBLE }

    struct Pool {
        address creator;
        address token;
        uint256 stakePerPerson;
        uint256 dailyStepGoal;
        uint256 startTimestamp;
        uint256 durationDays;
        PoolMode mode;
        uint256 commissionBps;
        bool    finalized;
        uint256 memberCount;
        uint256 totalStaked;
    }

    // ─────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────

    address public oracle;
    uint256 public poolCount;

    uint256 public constant MAX_COMMISSION_BPS = 500;
    uint256 public constant MAX_DURATION_DAYS  = 365;
    uint256 public constant MIN_STAKE_WEI      = 1000;

    mapping(uint256 => Pool)                                          public pools;
    mapping(uint256 => address[])                                     public poolMembers;
    mapping(uint256 => mapping(address => bool))                      public isMember;
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public dailySteps;
    mapping(uint256 => mapping(address => mapping(uint256 => bool)))  public daySubmitted;
    mapping(uint256 => mapping(address => uint256))                   public daysCompleted;
    mapping(uint256 => mapping(address => bool))                      public hasForfeited;

    mapping(address => uint256) public pendingNative;
    mapping(address => mapping(address => uint256)) public pendingTokens;

    mapping(address => uint256) public totalWins;
    mapping(address => uint256) public totalChallenges;

    // ── NEW: Soulbound badge level per address ──────────────────
    // 1 = Week Warrior  2 = Iron Strider  3 = Squad Captain
    // 4 = Perfect Month  5 = Corporate Champ
    mapping(address => uint256) public badge;

    // ─────────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────────

    event PoolCreated(uint256 indexed poolId, address indexed creator, address token, uint256 stakePerPerson, uint256 dailyStepGoal, uint256 durationDays, PoolMode mode);
    event MemberJoined(uint256 indexed poolId, address indexed member);
    event StepsSubmitted(uint256 indexed poolId, address indexed member, uint256 day, uint256 steps, bool goalHit);
    event MemberForfeited(uint256 indexed poolId, address indexed member, uint256 day);
    event PoolFinalized(uint256 indexed poolId, uint256 winnerCount, uint256 totalDistributed);
    event Withdrawn(address indexed user, address token, uint256 amount);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event BadgeAwarded(address indexed player, uint256 level);  // NEW

    // ─────────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────────

    constructor(address _oracle) Ownable(msg.sender) {
        require(_oracle != address(0), "STRIDE: zero oracle address");
        oracle = _oracle;
    }

    // ─────────────────────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────────────────────

    modifier poolExists(uint256 poolId) {
        require(poolId < poolCount, "STRIDE: pool does not exist");
        _;
    }

    modifier poolLive(uint256 poolId) {
        Pool storage p = pools[poolId];
        require(!p.finalized, "STRIDE: pool already finalized");
        require(block.timestamp >= p.startTimestamp, "STRIDE: pool not started yet");
        require(block.timestamp < p.startTimestamp + p.durationDays * 1 days, "STRIDE: pool has ended");
        _;
    }

    // ─────────────────────────────────────────────────────────────
    // CREATE POOL
    // ─────────────────────────────────────────────────────────────

    function createPool(
        address  token,
        uint256  stakePerPerson,
        uint256  dailyStepGoal,
        uint256  durationDays,
        PoolMode mode,
        uint256  commissionBps,
        uint256  startDelay
    ) external payable returns (uint256 poolId) {
        require(stakePerPerson >= MIN_STAKE_WEI,                       "STRIDE: stake too small");
        require(dailyStepGoal > 0,                                     "STRIDE: step goal must be > 0");
        require(durationDays > 0 && durationDays <= MAX_DURATION_DAYS, "STRIDE: invalid duration");
        require(commissionBps <= MAX_COMMISSION_BPS,                   "STRIDE: commission too high");

        _collectStake(token, stakePerPerson);

        poolId = poolCount++;
        pools[poolId] = Pool({
            creator:        msg.sender,
            token:          token,
            stakePerPerson: stakePerPerson,
            dailyStepGoal:  dailyStepGoal,
            startTimestamp: block.timestamp + startDelay,
            durationDays:   durationDays,
            mode:           mode,
            commissionBps:  commissionBps,
            finalized:      false,
            memberCount:    1,
            totalStaked:    stakePerPerson
        });

        poolMembers[poolId].push(msg.sender);
        isMember[poolId][msg.sender] = true;
        totalChallenges[msg.sender]++;

        emit PoolCreated(poolId, msg.sender, token, stakePerPerson, dailyStepGoal, durationDays, mode);
        emit MemberJoined(poolId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────
    // JOIN POOL
    // ─────────────────────────────────────────────────────────────

    function joinPool(uint256 poolId) external payable poolExists(poolId) {
        Pool storage p = pools[poolId];
        require(!p.finalized, "STRIDE: pool finalized");
        require(block.timestamp < p.startTimestamp + p.durationDays * 1 days, "STRIDE: pool has ended");
        require(!isMember[poolId][msg.sender], "STRIDE: already a member");

        _collectStake(p.token, p.stakePerPerson);

        p.memberCount++;
        p.totalStaked += p.stakePerPerson;
        poolMembers[poolId].push(msg.sender);
        isMember[poolId][msg.sender] = true;
        totalChallenges[msg.sender]++;

        emit MemberJoined(poolId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────
    // SUBMIT STEPS
    // ─────────────────────────────────────────────────────────────

    function submitSteps(
        uint256 poolId,
        uint256 steps,
        uint256 day,
        bytes calldata signature
    ) external poolExists(poolId) poolLive(poolId) {
        require(isMember[poolId][msg.sender],          "STRIDE: not a member");
        require(!daySubmitted[poolId][msg.sender][day], "STRIDE: already submitted today");

        uint256 today = block.timestamp / 86400;
        require(day == today, "STRIDE: wrong day");

        bytes32 msgHash = keccak256(abi.encodePacked(msg.sender, poolId, steps, day));
        bytes32 ethHash = MessageHashUtils.toEthSignedMessageHash(msgHash);
        address recovered = ECDSA.recover(ethHash, signature);
        require(recovered == oracle, "STRIDE: invalid oracle signature");

        if (pools[poolId].mode == PoolMode.STRICT) {
            require(!hasForfeited[poolId][msg.sender], "STRIDE: you have forfeited");
        }

        daySubmitted[poolId][msg.sender][day] = true;
        dailySteps[poolId][msg.sender][day]   = steps;

        bool goalHit = steps >= pools[poolId].dailyStepGoal;

        if (goalHit) {
            daysCompleted[poolId][msg.sender]++;
        } else if (pools[poolId].mode == PoolMode.STRICT) {
            hasForfeited[poolId][msg.sender] = true;
            emit MemberForfeited(poolId, msg.sender, day);
        }

        emit StepsSubmitted(poolId, msg.sender, day, steps, goalHit);
    }

    // ─────────────────────────────────────────────────────────────
    // FINALIZE
    // ─────────────────────────────────────────────────────────────

    function finalize(uint256 poolId) external poolExists(poolId) nonReentrant {
        Pool storage p = pools[poolId];
        require(!p.finalized, "STRIDE: already finalized");

        // Owner can force-finalize for demo purposes, others must wait
        if (msg.sender != owner()) {
            require(
                block.timestamp >= p.startTimestamp + p.durationDays * 1 days,
                "STRIDE: challenge not over yet"
            );
        }

        p.finalized = true;

        uint256 commission    = (p.totalStaked * p.commissionBps) / 10000;
        uint256 distributable = p.totalStaked - commission;

        if (p.mode == PoolMode.STRICT) {
            _finalizeStrict(poolId, p, distributable);
        } else {
            _finalizeFlexible(poolId, p, distributable);
        }

        if (commission > 0) _creditUser(p.token, owner(), commission);
    }

    // ─────────────────────────────────────────────────────────────
    // FINALIZE — STRICT
    // ─────────────────────────────────────────────────────────────

    function _finalizeStrict(uint256 poolId, Pool storage p, uint256 distributable) internal {
        address[] storage members = poolMembers[poolId];
        uint256 n        = members.length;
        uint256 startDay = p.startTimestamp / 86400;

        uint256 winnerCount      = 0;
        uint256 winnerStepsTotal = 0;
        uint256[] memory memberTotalSteps = new uint256[](n);

        for (uint256 i = 0; i < n; i++) {
            address m = members[i];
            if (!hasForfeited[poolId][m] && daysCompleted[poolId][m] == p.durationDays) {
                uint256 ts = 0;
                for (uint256 d = 0; d < p.durationDays; d++) {
                    ts += dailySteps[poolId][m][startDay + d];
                }
                memberTotalSteps[i] = ts;
                winnerStepsTotal   += ts;
                winnerCount++;
            }
        }

        if (winnerCount == 0) {
            uint256 refundEach = distributable / n;
            for (uint256 i = 0; i < n; i++) _creditUser(p.token, members[i], refundEach);
            emit PoolFinalized(poolId, 0, distributable);
            return;
        }

        uint256 distributed = 0;
        for (uint256 i = 0; i < n; i++) {
            address m = members[i];
            if (!hasForfeited[poolId][m] && daysCompleted[poolId][m] == p.durationDays) {
                uint256 share = winnerStepsTotal == 0
                    ? distributable / winnerCount
                    : (distributable * memberTotalSteps[i]) / winnerStepsTotal;
                _creditUser(p.token, m, share);
                distributed += share;
                totalWins[m]++;
                _assignBadge(m, p);  // NEW
            }
        }

        uint256 dust = distributable - distributed;
        if (dust > 0) _creditUser(p.token, owner(), dust);

        emit PoolFinalized(poolId, winnerCount, distributable);
    }

    // ─────────────────────────────────────────────────────────────
    // FINALIZE — FLEXIBLE
    // ─────────────────────────────────────────────────────────────

    function _finalizeFlexible(uint256 poolId, Pool storage p, uint256 distributable) internal {
        address[] storage members = poolMembers[poolId];
        uint256 n = members.length;

        uint256 totalDaysCompleted = 0;
        for (uint256 i = 0; i < n; i++) {
            totalDaysCompleted += daysCompleted[poolId][members[i]];
        }

        if (totalDaysCompleted == 0) {
            uint256 refundEach = distributable / n;
            for (uint256 i = 0; i < n; i++) _creditUser(p.token, members[i], refundEach);
            emit PoolFinalized(poolId, 0, distributable);
            return;
        }

        uint256 distributed = 0;
        uint256 winnerCount = 0;

        for (uint256 i = 0; i < n; i++) {
            address m = members[i];
            uint256 dc = daysCompleted[poolId][m];
            if (dc > 0) {
                uint256 share = (distributable * dc) / totalDaysCompleted;
                _creditUser(p.token, m, share);
                distributed += share;
                winnerCount++;
                if (dc == p.durationDays) {
                    totalWins[m]++;
                    _assignBadge(m, p);  // NEW
                }
            }
        }

        uint256 dust = distributable - distributed;
        if (dust > 0) _creditUser(p.token, owner(), dust);

        emit PoolFinalized(poolId, winnerCount, distributable);
    }

    // ─────────────────────────────────────────────────────────────
    // BADGE ASSIGNMENT  (NEW)
    // ─────────────────────────────────────────────────────────────

    function _assignBadge(address winner, Pool storage p) internal {
        uint256 current = badge[winner];
        uint256 wins    = totalWins[winner];  // already incremented before this call
        uint256 next    = current;

        if      (wins >= 5)              next = 5;  // Corporate Champ
        else if (p.durationDays >= 30 && next < 4) next = 4;  // Perfect Month
        else if (wins >= 3 && next < 3)  next = 3;  // Squad Captain
        else if (p.durationDays >= 14 && next < 2) next = 2;  // Iron Strider
        else if (wins >= 1 && next < 1)  next = 1;  // Week Warrior

        if (next > current) {
            badge[winner] = next;
            emit BadgeAwarded(winner, next);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // WITHDRAW
    // ─────────────────────────────────────────────────────────────

    function withdraw(address token) external nonReentrant {
        if (token == address(0)) {
            uint256 amount = pendingNative[msg.sender];
            require(amount > 0, "STRIDE: nothing to claim");
            pendingNative[msg.sender] = 0;
            (bool ok, ) = msg.sender.call{value: amount}("");
            require(ok, "STRIDE: native transfer failed");
            emit Withdrawn(msg.sender, address(0), amount);
        } else {
            uint256 amount = pendingTokens[msg.sender][token];
            require(amount > 0, "STRIDE: nothing to claim");
            pendingTokens[msg.sender][token] = 0;
            IERC20(token).safeTransfer(msg.sender, amount);
            emit Withdrawn(msg.sender, token, amount);
        }
    }

    // ─────────────────────────────────────────────────────────────
    // INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────

    function _collectStake(address token, uint256 amount) internal {
        if (token == address(0)) {
            require(msg.value == amount, "STRIDE: wrong native amount");
        } else {
            require(msg.value == 0, "STRIDE: don't send native for ERC20 pool");
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }
    }

    function _creditUser(address token, address user, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) pendingNative[user] += amount;
        else pendingTokens[user][token] += amount;
    }

    // ─────────────────────────────────────────────────────────────
    // ADMIN
    // ─────────────────────────────────────────────────────────────

    function setOracle(address _oracle) external onlyOwner {
        require(_oracle != address(0), "STRIDE: zero address");
        emit OracleUpdated(oracle, _oracle);
        oracle = _oracle;
    }

    // ─────────────────────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────────────────────

    function getPoolDetails(uint256 poolId) external view returns (
        address  token,
        uint256  stakePerPerson,
        uint256  dailyStepGoal,
        uint256  durationDays,
        PoolMode mode,
        bool     finalized,
        uint256  memberCount,
        uint256  totalStaked,
        uint256  commissionBps,
        uint256  startTimestamp
    ) {
        Pool storage p = pools[poolId];
        return (p.token, p.stakePerPerson, p.dailyStepGoal, p.durationDays,
                p.mode, p.finalized, p.memberCount, p.totalStaked,
                p.commissionBps, p.startTimestamp);
    }

    function getMembers(uint256 poolId) external view returns (address[] memory) {
        return poolMembers[poolId];
    }

    function getMemberProgress(uint256 poolId, address member) external view returns (
        uint256 completedDays,
        bool    forfeited,
        bool    memberExists
    ) {
        return (daysCompleted[poolId][member], hasForfeited[poolId][member], isMember[poolId][member]);
    }

    // NEW: Aggregate daily steps — used by leaderboard
    function getMemberSteps(uint256 poolId, address member) external view returns (uint256 totalSteps) {
        Pool storage p = pools[poolId];
        uint256 startDay = p.startTimestamp / 86400;
        for (uint256 d = 0; d < p.durationDays; d++) {
            totalSteps += dailySteps[poolId][member][startDay + d];
        }
    }

    function getPending(address user, address token) external view returns (uint256) {
        if (token == address(0)) return pendingNative[user];
        return pendingTokens[user][token];
    }

    // NEW: Backward-compatible alias (frontend uses this name)
    function pendingWithdrawals(address user) external view returns (uint256) {
        return pendingNative[user];
    }

    function getProfile(address user) external view returns (uint256 wins, uint256 challenges) {
        return (totalWins[user], totalChallenges[user]);
    }

    receive() external payable {}
}
