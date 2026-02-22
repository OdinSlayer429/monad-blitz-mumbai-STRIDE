
export const CONTRACT_ADDRESS = "0xFbe9a33D316e6fAa0AD00756F60c18db39F9e339"

export const ABI = [
  // Write
  "function createPool(address token, uint256 stakePerPerson, uint256 dailyStepGoal, uint256 durationDays, uint8 mode, uint256 commissionBps, uint256 startDelay) payable returns (uint256)",
  "function joinPool(uint256 poolId) payable",
  "function submitSteps(uint256 poolId, uint256 steps, uint256 day, bytes calldata signature) external",
  "function finalize(uint256 poolId) external",
  "function withdraw(address token) external",
  "function setOracle(address _oracle) external",

  // Read
  "function getPoolDetails(uint256 poolId) view returns (address token, uint256 stakePerPerson, uint256 dailyStepGoal, uint256 durationDays, uint8 mode, bool finalized, uint256 memberCount, uint256 totalStaked, uint256 commissionBps, uint256 startTimestamp)",
  "function getMembers(uint256 poolId) view returns (address[])",
  "function getMemberProgress(uint256 poolId, address member) view returns (uint256 completedDays, bool forfeited, bool memberExists)",
  "function getMemberSteps(uint256 poolId, address member) view returns (uint256)",
  "function getPending(address user, address token) view returns (uint256)",
  "function pendingWithdrawals(address) view returns (uint256)",
  "function getProfile(address user) view returns (uint256 wins, uint256 challenges)",
  "function badge(address) view returns (uint256)",
  "function isMember(uint256, address) view returns (bool)",
  "function oracle() view returns (address)",
  "function owner() view returns (address)",
  "function poolCount() view returns (uint256)",

  // Events
  "event PoolCreated(uint256 indexed poolId, address indexed creator, address token, uint256 stakePerPerson, uint256 dailyStepGoal, uint256 durationDays, uint8 mode)",
  "event MemberJoined(uint256 indexed poolId, address indexed member)",
  "event StepsSubmitted(uint256 indexed poolId, address indexed member, uint256 day, uint256 steps, bool goalHit)",
  "event MemberForfeited(uint256 indexed poolId, address indexed member, uint256 day)",
  "event PoolFinalized(uint256 indexed poolId, uint256 winnerCount, uint256 totalDistributed)",
  "event Withdrawn(address indexed user, address token, uint256 amount)",
  "event BadgeAwarded(address indexed player, uint256 level)"
];
