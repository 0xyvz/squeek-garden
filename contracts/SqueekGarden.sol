// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Subset of SqueekCore's interface; struct layouts must match the deployed contract exactly.
interface ISqueekCore {
    struct CoreState {
        uint64 settledThroughRound;
        uint64 cumulativeWork;
        uint96 cumulativeBlockUnits;
        uint64 blockHeight;
        uint96 blockProgress;
        uint32 workPerThousandBlocks;
        uint256 authorizationNonce;
        bool paused;
    }

    struct Checkpoint {
        uint64 cumulativeWork;
        uint96 cumulativeBlockUnits;
        uint32 workPerThousandBlocks;
    }

    struct RoundRecord {
        uint64 roundId;
        uint64 cumulativeWork;
        uint96 cumulativeBlockUnits;
        uint32 workPerThousandBlocks;
        bytes32 dataHash;
    }

    struct RoundPage {
        uint64 certifiedThroughRound;
        Checkpoint start;
        Checkpoint end;
        RoundRecord[] rounds;
    }

    function state() external view returns (CoreState memory);

    function roundPage(uint64 afterRound, uint64 throughRound, uint256 maxRecords)
        external
        view
        returns (RoundPage memory);
}

interface ISqueekNft {
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @title Squeek Garden
/// @notice Squeektoshi's garden: hamster snacks that grow only from what the real Squeekchain hamster does.
///         Every reading comes straight from SqueekCore, so no oracle is involved and nobody can speed a plant up.
///         - Work plants grow with the hamster's settled wheel work.
///         - Block plants grow with completed Squeekchain blocks.
///         - Nap plants grow with settled rounds and wilt if the hamster runs too much while they grow.
///         - Fresh-run plants can only be harvested right after the hamster has run.
///         Harvests fill a shared pantry that unlocks new seeds for everyone, and points raise the player's level,
///         which opens new seeds for that player.
contract SqueekGarden is Ownable {
    using SafeERC20 for IERC20;

    uint8 public constant BASE_PLOTS = 9;
    uint8 public constant MAX_PLOTS = 12; // plots 9..11 need a Squeek bound to this garden and still in the wallet
    uint8 public constant MAX_WATERINGS = 3;
    uint32 public constant WATER_BONUS_PCT = 10;
    uint64 public constant WATER_COOLDOWN = 1 hours;
    uint8 public constant MAX_HELPS = 3;
    uint32 public constant HELP_BONUS_PCT = 5;
    uint32 public constant HELP_POINTS = 2;
    /// Share of every harvest that the player who invited the harvester gets on top, as bonus points.
    uint32 public constant REFERRAL_PCT = 10;
    uint8 public constant HELPS_PER_DAY = 10;
    uint64 public constant FRESH_RUN_ROUNDS = 3; // "just ran" = some work in the last 3 settled rounds (30 min)
    /// A Squeek serves one garden at a time and can move to another garden only this long after its last binding,
    /// so one NFT passed from wallet to wallet cannot open holder plots in many gardens.
    uint64 public constant SQUEEK_MOVE_COOLDOWN = 7 days;
    /// Past the last listed level, every this many points is one more level.
    uint64 public constant POINTS_PER_LATE_LEVEL = 8_000;

    enum GrowMode {
        Work,
        Blocks,
        Nap
    }

    struct Seed {
        string name;
        GrowMode mode;
        uint64 growAmount; // work units, blocks or settled rounds, depending on mode
        uint64 napWorkLimit; // Nap only: work the hamster may do before the plant wilts
        uint32 basePoints;
        uint32 unlockSnacks; // pantry size needed before anyone can plant it
        uint8 level; // player level needed to plant it; 0 or 1 means from the start
        uint128 price; // SQK base units; 0 means free
        uint16 dailyLimit; // plantings per player per UTC day; 0 means no limit
        bool needsFreshRun;
        bool rare;
        bool active;
    }

    struct Plot {
        uint32 seedId; // 1-based; 0 = empty
        uint64 plantedWork;
        uint64 plantedBlock;
        uint64 plantedRound;
        uint8 waterings;
        uint64 lastWateredAt;
        uint8 helps;
        uint32 lastHelpDay;
    }

    struct Readings {
        uint64 work;
        uint64 blockHeight;
        uint64 settledRound;
    }

    struct PlotStatus {
        uint64 progress;
        uint64 needed;
        bool ripe;
        bool overripe;
        bool wilted;
        uint256 value;
    }

    struct PlayerStats {
        uint64 points; // everything: harvests, helps and invite bonuses
        uint32 harvests;
        uint32 rareHarvests;
        uint32 helps;
        uint32 referrals; // gardeners who joined through this player's invite
        uint64 referralPoints; // bonus points earned from those gardeners' harvests
    }

    struct PlayerView {
        address player;
        string nickname;
        uint64 points;
        uint32 harvests;
        uint32 rareHarvests;
        uint32 helps;
        uint32 referrals;
        uint64 referralPoints;
    }

    /// Both can be switched by the owner, because a Squeekchain testnet reinstall redeploys them.
    ISqueekCore public core;
    IERC20 public sqk;
    ISqueekNft public squeekNft; // address(0) = holder plots switched off
    address public treasury;

    Seed[] private _seeds;
    mapping(address => Plot[MAX_PLOTS]) private _gardens;
    mapping(address => PlayerStats) public stats;
    mapping(address => string) public nicknameOf;
    mapping(bytes32 => address) public nicknameOwner;
    mapping(bytes32 => bool) public nicknameBanned; // names the owner took down; nobody can pick them again
    mapping(address => mapping(uint32 => uint8)) public helpsOnDay;
    mapping(address => mapping(uint32 => mapping(uint32 => uint16))) private _plantedOnDay; // player => seed => day
    address[] private _players;
    mapping(address => bool) public isPlayer;
    mapping(address => address) public referrerOf; // player => who invited them
    mapping(address => uint64) private _referralDust; // referrer => bonus hundredths not yet a whole point

    struct SqueekBinding {
        address garden; // the player this Squeek currently serves
        uint64 since; // when it was bound there; it can move again after SQUEEK_MOVE_COOLDOWN
    }

    struct BoundSqueek {
        address nft; // collection it was bound under; a new collection needs a new binding
        uint256 tokenId;
    }

    mapping(address => mapping(uint256 => SqueekBinding)) public squeekBinding; // collection => tokenId => binding
    mapping(address => BoundSqueek) public boundSqueekOf; // player => their Squeek
    uint64 public pantrySnacks;

    /// Garden readings stay continuous when the owner switches to a new SqueekCore:
    /// reading = carried + (core counter - base), where base is the new core's counter at the switch and carried is
    /// the garden reading the old core had reached. Plants keep their progress across a reinstall.
    Readings private _base;
    Readings private _carried;

    event SeedAdded(uint32 indexed seedId, string name, GrowMode mode, uint64 growAmount, uint32 basePoints, uint128 price);
    event SeedActiveSet(uint32 indexed seedId, bool active);
    event SeedLevelSet(uint32 indexed seedId, uint8 level);
    event TreasurySet(address treasury);
    event SqueekNftSet(address squeekNft);
    event CoreSet(address core, uint64 work, uint64 blockHeight, uint64 settledRound);
    event SqkSet(address sqk);
    event SqueekBound(address indexed player, uint256 indexed tokenId);
    event NicknameSet(address indexed player, string nickname);
    event NicknameBanned(string nickname, bool banned);
    event Planted(address indexed player, uint8 plot, uint32 indexed seedId, uint64 atWork, uint128 paid);
    event Watered(address indexed player, uint8 plot, uint8 waterings);
    event Helped(address indexed helper, address indexed owner, uint8 plot);
    event ReferrerSet(address indexed player, address indexed referrer);
    event ReferralBonus(address indexed referrer, address indexed player, uint64 points);
    event Harvested(address indexed player, uint8 plot, uint32 indexed seedId, uint256 points, bool overripe, uint64 pantrySnacks);
    event Uprooted(address indexed player, uint8 plot, uint32 indexed seedId);

    error BadPlot(uint8 plot);
    error NeedsSqueek(uint8 plot);
    error PlotOccupied(uint8 plot);
    error PlotEmpty(uint8 plot);
    error UnknownSeed(uint32 seedId);
    error SeedInactive(uint32 seedId);
    error SeedLocked(uint32 seedId, uint64 pantrySnacks, uint32 unlockSnacks);
    error SeedDailyLimit(uint32 seedId, uint16 dailyLimit);
    error LevelTooLow(uint32 seedId, uint8 needed, uint256 level);
    error NotRipe(uint8 plot, uint64 progress, uint64 needed);
    error Wilted(uint8 plot);
    error NeedsFreshRun(uint8 plot);
    error TooManyWaterings(uint8 plot);
    error WaterCooldown(uint8 plot, uint64 readyAt);
    error OwnGarden();
    error HelpLimit(uint8 plot);
    error HelperDailyLimit();
    error BadNickname();
    error BadReferrer();
    error ReferrerAlreadySet();
    error ReferrerTooLate();
    error NicknameTaken();
    error ZeroAddress();
    error ZeroGrowAmount();
    error HolderPlotsOff();
    error NotSqueekOwner(uint256 tokenId);
    error SqueekMoveCooldown(uint256 tokenId, uint64 readyAt);
    error OldCoreUnreadable();
    error ReadingsGoBack();
    error RenounceDisabled();

    /// @param squeekNft_ Squeek NFT collection whose holders get three extra plots; address(0) starts with them off.
    constructor(ISqueekCore core_, IERC20 sqk_, ISqueekNft squeekNft_, address treasury_) Ownable(msg.sender) {
        if (address(core_) == address(0) || address(sqk_) == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        core = core_;
        sqk = sqk_;
        squeekNft = squeekNft_;
        treasury = treasury_;
        _addDefaultSeeds();
    }

    // ---------------------------------------------------------------- player actions

    function setNickname(string calldata nickname) external {
        bytes memory b = bytes(nickname);
        if (b.length < 3 || b.length > 16) revert BadNickname();
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f; // a-z 0-9 _
            if (!ok) revert BadNickname();
        }
        bytes32 key = keccak256(b);
        address holder = nicknameOwner[key];
        if ((holder != address(0) && holder != msg.sender) || nicknameBanned[key]) revert NicknameTaken();
        _releaseNickname(msg.sender);
        nicknameOwner[key] = msg.sender;
        nicknameOf[msg.sender] = nickname;
        _register(msg.sender);
        emit NicknameSet(msg.sender, nickname);
    }

    /// @notice Binds a Squeek you hold to your garden, opening plots 10-12 for as long as it stays in your wallet.
    ///         A Squeek serves one garden at a time; moving it to another garden is possible 7 days after its last
    ///         binding, so passing one NFT around cannot open holder plots in many gardens.
    function bindSqueek(uint256 tokenId) external {
        address nft = address(squeekNft);
        if (nft == address(0)) revert HolderPlotsOff();
        if (!_ownsSqueek(msg.sender, tokenId)) revert NotSqueekOwner(tokenId);
        SqueekBinding storage s = squeekBinding[nft][tokenId];
        if (s.garden != msg.sender) {
            if (s.garden != address(0) && block.timestamp < s.since + SQUEEK_MOVE_COOLDOWN) {
                revert SqueekMoveCooldown(tokenId, s.since + SQUEEK_MOVE_COOLDOWN);
            }
            s.garden = msg.sender;
            s.since = uint64(block.timestamp);
        }
        boundSqueekOf[msg.sender] = BoundSqueek(nft, tokenId);
        _register(msg.sender);
        emit SqueekBound(msg.sender, tokenId);
    }

    /// @notice Records who invited you. Once only, before your first harvest; the inviter must already be a gardener
    ///         and cannot be someone you invited. From then on they get 10% of each of your harvests on top.
    function setReferrer(address referrer) external {
        if (referrerOf[msg.sender] != address(0)) revert ReferrerAlreadySet();
        if (stats[msg.sender].harvests > 0) revert ReferrerTooLate();
        if (referrer == address(0) || referrer == msg.sender || !isPlayer[referrer] || referrerOf[referrer] == msg.sender) {
            revert BadReferrer();
        }
        referrerOf[msg.sender] = referrer;
        stats[referrer].referrals += 1;
        _register(msg.sender);
        emit ReferrerSet(msg.sender, referrer);
    }

    function plant(uint8 plot, uint32 seedId) external {
        _plant(plot, seedId, _readings());
    }

    function plantMany(uint8[] calldata plots, uint32 seedId) external {
        Readings memory r = _readings();
        for (uint256 i = 0; i < plots.length; i++) {
            _plant(plots[i], seedId, r);
        }
    }

    function water(uint8 plot) external {
        _water(plot);
    }

    function waterMany(uint8[] calldata plots) external {
        for (uint256 i = 0; i < plots.length; i++) {
            _water(plots[i]);
        }
    }

    /// @notice Water a neighbour's plant: +5% for their crop, +2 points for you. Once per plant per day, three per plant.
    function helpWater(address owner_, uint8 plot) external {
        if (owner_ == msg.sender) revert OwnGarden();
        Plot storage p = _plotOf(owner_, plot);
        if (p.seedId == 0) revert PlotEmpty(plot);
        uint32 day = uint32(block.timestamp / 1 days);
        if (p.helps >= MAX_HELPS || p.lastHelpDay == day) revert HelpLimit(plot);
        if (helpsOnDay[msg.sender][day] >= HELPS_PER_DAY) revert HelperDailyLimit();

        p.helps += 1;
        p.lastHelpDay = day;
        helpsOnDay[msg.sender][day] += 1;
        PlayerStats storage s = stats[msg.sender];
        s.points += HELP_POINTS;
        s.helps += 1;
        _register(msg.sender);
        emit Helped(msg.sender, owner_, plot);
    }

    function harvest(uint8 plot) external {
        _harvest(plot, _readings());
    }

    function harvestMany(uint8[] calldata plots) external {
        Readings memory r = _readings();
        for (uint256 i = 0; i < plots.length; i++) {
            _harvest(plots[i], r);
        }
    }

    /// @notice Pull up a plant, wilted or not. Nothing is refunded.
    function uproot(uint8 plot) external {
        Plot storage p = _plotOf(msg.sender, plot);
        uint32 seedId = p.seedId;
        if (seedId == 0) revert PlotEmpty(plot);
        delete _gardens[msg.sender][plot];
        emit Uprooted(msg.sender, plot, seedId);
    }

    // ---------------------------------------------------------------- views

    function readings() external view returns (Readings memory r, uint64 recentWork) {
        r = _readings();
        recentWork = _recentWork();
    }

    /// @notice How raw SqueekCore counters map to garden readings: reading = carried + (counter - base).
    ///         Both are zero until the owner first switches cores, so readings equal the core's counters.
    function coreMapping() external view returns (Readings memory base, Readings memory carried) {
        return (_base, _carried);
    }

    function seedCount() external view returns (uint256) {
        return _seeds.length;
    }

    function seed(uint32 seedId) external view returns (Seed memory) {
        return _seedOf(seedId);
    }

    function seeds() external view returns (Seed[] memory) {
        return _seeds;
    }

    /// @notice How many of a seed the player has planted today (UTC); compare with the seed's dailyLimit.
    function plantedToday(address player, uint32 seedId) external view returns (uint16) {
        return _plantedOnDay[player][seedId][uint32(block.timestamp / 1 days)];
    }

    function garden(address player) external view returns (Plot[MAX_PLOTS] memory) {
        return _gardens[player];
    }

    function plotCount(address player) public view returns (uint8) {
        return hasSqueek(player) ? MAX_PLOTS : BASE_PLOTS;
    }

    /// @notice True while the player's bound Squeek is still in their wallet and still bound to their garden.
    function hasSqueek(address player) public view returns (bool) {
        address nft = address(squeekNft);
        BoundSqueek storage b = boundSqueekOf[player];
        if (nft == address(0) || b.nft != nft || squeekBinding[nft][b.tokenId].garden != player) return false;
        return _ownsSqueek(player, b.tokenId);
    }

    /// @notice When a Squeek can next be bound to a different garden (0 if it is free now).
    function squeekMovableAt(uint256 tokenId) external view returns (uint64) {
        SqueekBinding storage s = squeekBinding[address(squeekNft)][tokenId];
        if (s.garden == address(0)) return 0;
        uint64 readyAt = s.since + SQUEEK_MOVE_COOLDOWN;
        return block.timestamp >= readyAt ? 0 : readyAt;
    }

    function _ownsSqueek(address player, uint256 tokenId) private view returns (bool) {
        try squeekNft.ownerOf(tokenId) returns (address holder) {
            return holder == player;
        } catch {
            return false;
        }
    }

    function plotStatus(address player, uint8 plot) external view returns (PlotStatus memory) {
        Plot storage p = _plotOf(player, plot);
        if (p.seedId == 0) return PlotStatus(0, 0, false, false, false, 0);
        return _status(_seeds[p.seedId - 1], p, _readings());
    }

    function playerCount() external view returns (uint256) {
        return _players.length;
    }

    /// @notice A page of players with their nickname and stats, for the leaderboard.
    function playersPage(uint256 offset, uint256 limit) external view returns (PlayerView[] memory page) {
        uint256 n = _players.length;
        if (offset >= n) return new PlayerView[](0);
        uint256 end = limit > n - offset ? n : offset + limit; // no overflow on a huge limit
        page = new PlayerView[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            address a = _players[i];
            PlayerStats storage s = stats[a];
            page[i - offset] = PlayerView(a, nicknameOf[a], s.points, s.harvests, s.rareHarvests, s.helps, s.referrals, s.referralPoints);
        }
    }

    function points(address player) external view returns (uint256) {
        return stats[player].points;
    }

    /// @notice Points needed to reach a level. The first levels come within a day or two of play; each later one asks
    ///         for a little more, and past level 10 every POINTS_PER_LATE_LEVEL points is another level.
    function pointsForLevel(uint256 level) public pure returns (uint256) {
        if (level <= 1) return 0;
        uint32[9] memory steps = [uint32(30), 100, 250, 600, 1_800, 4_000, 7_500, 12_000, 18_000];
        if (level <= 10) return steps[level - 2];
        return 18_000 + (level - 10) * POINTS_PER_LATE_LEVEL;
    }

    function levelFor(uint256 pts) public pure returns (uint256 level) {
        if (pts >= 18_000) return 10 + (pts - 18_000) / POINTS_PER_LATE_LEVEL;
        level = 1;
        while (pts >= pointsForLevel(level + 1)) level++;
    }

    function levelOf(address player) public view returns (uint256) {
        return levelFor(stats[player].points);
    }

    // ---------------------------------------------------------------- admin

    function addSeed(Seed calldata s) external onlyOwner returns (uint32) {
        return _addSeed(s);
    }

    function setSeedActive(uint32 seedId, bool active) external onlyOwner {
        _seedOf(seedId);
        _seeds[seedId - 1].active = active;
        emit SeedActiveSet(seedId, active);
    }

    /// @notice Tunes which level a seed opens at. A plant already growing is not affected.
    function setSeedLevel(uint32 seedId, uint8 level) external onlyOwner {
        _seedOf(seedId);
        _seeds[seedId - 1].level = level;
        emit SeedLevelSet(seedId, level);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    /// @notice Switches the holder plots (10-12) on with a collection, or off with address(0). Plants already growing
    /// there stay; they can be harvested again once holder plots are on and the player's bound Squeek is back.
    function setSqueekNft(ISqueekNft squeekNft_) external onlyOwner {
        squeekNft = squeekNft_;
        emit SqueekNftSet(address(squeekNft_));
    }

    /// @notice Moves the garden to a new SqueekCore (after a Squeekchain reinstall). Growing plants keep the progress
    ///         they had; from here on they grow with the new core. Needs the old core to still answer; if it does not,
    ///         use setCoreFrom.
    function setCore(ISqueekCore core_) external onlyOwner {
        (bool ok, Readings memory carried) = _tryReadings();
        if (!ok) revert OldCoreUnreadable();
        _switchCore(core_, carried);
    }

    /// @notice Rescue for when the old core no longer answers, answers garbage, or reset its counters in place: carries
    ///         the garden on from readings the owner read before that happened (readings() called at an earlier
    ///         block). They may not go below what was already carried. Also works with the same core, as a rebase.
    function setCoreFrom(ISqueekCore core_, Readings calldata last) external onlyOwner {
        Readings memory c = _carried;
        if (last.work < c.work || last.blockHeight < c.blockHeight || last.settledRound < c.settledRound) revert ReadingsGoBack();
        _switchCore(core_, last);
    }

    /// @notice Switches the token paid seeds are bought with (after a Squeekchain reinstall).
    function setSqk(IERC20 sqk_) external onlyOwner {
        if (address(sqk_) == address(0)) revert ZeroAddress();
        sqk = sqk_;
        emit SqkSet(address(sqk_));
    }

    /// @notice Moderation: frees an offensive nickname and bans it, so it cannot simply be picked again.
    function clearNickname(address player) external onlyOwner {
        bytes memory old = bytes(nicknameOf[player]);
        if (old.length == 0) return;
        nicknameBanned[keccak256(old)] = true;
        emit NicknameBanned(nicknameOf[player], true);
        _releaseNickname(player);
        emit NicknameSet(player, "");
    }

    /// @notice Bans a nickname ahead of time, or lifts a ban. A player already using it keeps it until cleared.
    function setNicknameBanned(string calldata nickname, bool banned) external onlyOwner {
        nicknameBanned[keccak256(bytes(nickname))] = banned;
        emit NicknameBanned(nickname, banned);
    }

    /// @notice Disabled: without an owner the garden could never follow a Squeekchain reinstall (setCore).
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ---------------------------------------------------------------- internals

    function _addDefaultSeeds() private {
        uint128 sqkUnit = 1e18;
        // Calibrated on Oct 2026 Sepolia data: ~10-13k work and ~1,000 blocks on an active night, 144 rounds a day.
        // Paid seeds are capped per day so SQK cannot simply buy the leaderboard. Each seed opens at a player level:
        // a new one per level up to Hamster Berry at level 8.
        _addSeed(Seed("Timothy Hay", GrowMode.Work, 800, 0, 8, 0, 1, 0, 0, false, false, true));
        _addSeed(Seed("Sunflower", GrowMode.Work, 3_500, 0, 40, 0, 2, 0, 0, false, false, true));
        _addSeed(Seed("Block Broccoli", GrowMode.Blocks, 300, 0, 45, 0, 3, 0, 0, false, false, true));
        _addSeed(Seed("Nap Chamomile", GrowMode.Nap, 36, 300, 35, 0, 4, 0, 0, false, false, true));
        _addSeed(Seed("Pumpkin", GrowMode.Work, 10_000, 0, 150, 0, 5, 0, 0, false, false, true));
        _addSeed(Seed("Moon Melon", GrowMode.Work, 6_000, 0, 320, 150, 7, 0, 0, true, true, true));
        _addSeed(Seed("Golden Carrot", GrowMode.Work, 3_000, 0, 120, 0, 6, 100 * sqkUnit, 3, false, true, true));
        _addSeed(Seed("Hamster Berry", GrowMode.Work, 8_000, 0, 600, 0, 8, 500 * sqkUnit, 1, false, true, true));
    }

    function _addSeed(Seed memory s) private returns (uint32 seedId) {
        if (s.growAmount == 0) revert ZeroGrowAmount();
        _seeds.push(s);
        seedId = uint32(_seeds.length);
        emit SeedAdded(seedId, s.name, s.mode, s.growAmount, s.basePoints, s.price);
    }

    function _readings() private view returns (Readings memory) {
        return _toGarden(core.state());
    }

    /// @dev The current core's readings, or ok = false if it reverts, has no code or answers with data that does not
    ///      decode (a failed decode would otherwise revert here, outside any try/catch).
    function _tryReadings() private view returns (bool ok, Readings memory r) {
        bytes memory ret;
        (ok, ret) = address(core).staticcall(abi.encodeCall(ISqueekCore.state, ()));
        if (!ok || ret.length < 256) return (false, r); // CoreState is eight static words
        r = _toGarden(abi.decode(ret, (ISqueekCore.CoreState)));
    }

    function _switchCore(ISqueekCore core_, Readings memory carried) private {
        if (address(core_) == address(0)) revert ZeroAddress();
        ISqueekCore.CoreState memory fresh = core_.state(); // also checks the new address speaks SqueekCore
        _base = Readings(fresh.cumulativeWork, fresh.blockHeight, fresh.settledThroughRound);
        _carried = carried;
        core = core_;
        emit CoreSet(address(core_), carried.work, carried.blockHeight, carried.settledRound);
    }

    /// @dev A counter below its base (a reset on the same core) counts as no progress since the switch.
    function _toGarden(ISqueekCore.CoreState memory s) private view returns (Readings memory r) {
        Readings memory b = _base;
        Readings memory c = _carried;
        r.work = c.work + (s.cumulativeWork > b.work ? s.cumulativeWork - b.work : 0);
        r.blockHeight = c.blockHeight + (s.blockHeight > b.blockHeight ? s.blockHeight - b.blockHeight : 0);
        r.settledRound = c.settledRound + (s.settledThroughRound > b.settledRound ? s.settledThroughRound - b.settledRound : 0);
    }

    function _recentWork() private view returns (uint64) {
        uint64 through = core.state().settledThroughRound;
        uint64 afterRound = through > FRESH_RUN_ROUNDS ? through - FRESH_RUN_ROUNDS : 0;
        ISqueekCore.RoundPage memory page = core.roundPage(afterRound, through, 0);
        return page.end.cumulativeWork > page.start.cumulativeWork ? page.end.cumulativeWork - page.start.cumulativeWork : 0;
    }

    function _freshRun() private view returns (bool) {
        return _recentWork() > 0;
    }

    function _register(address player) private {
        if (isPlayer[player]) return;
        isPlayer[player] = true;
        _players.push(player);
    }

    function _releaseNickname(address player) private {
        bytes memory old = bytes(nicknameOf[player]);
        if (old.length == 0) return;
        delete nicknameOwner[keccak256(old)];
        delete nicknameOf[player];
    }

    function _plant(uint8 plot, uint32 seedId, Readings memory r) private {
        Plot storage p = _plotOf(msg.sender, plot);
        if (plot >= BASE_PLOTS && !hasSqueek(msg.sender)) revert NeedsSqueek(plot);
        if (p.seedId != 0) revert PlotOccupied(plot);
        Seed storage s = _seedOf(seedId);
        if (!s.active) revert SeedInactive(seedId);
        uint256 level = levelOf(msg.sender);
        if (level < s.level) revert LevelTooLow(seedId, s.level, level);
        if (pantrySnacks < s.unlockSnacks) revert SeedLocked(seedId, pantrySnacks, s.unlockSnacks);
        if (s.dailyLimit > 0) {
            uint32 day = uint32(block.timestamp / 1 days);
            if (_plantedOnDay[msg.sender][seedId][day] >= s.dailyLimit) revert SeedDailyLimit(seedId, s.dailyLimit);
            _plantedOnDay[msg.sender][seedId][day] += 1;
        }

        _gardens[msg.sender][plot] = Plot(seedId, r.work, r.blockHeight, r.settledRound, 0, 0, 0, 0);
        _register(msg.sender);

        if (s.price > 0) sqk.safeTransferFrom(msg.sender, treasury, s.price);
        emit Planted(msg.sender, plot, seedId, r.work, s.price);
    }

    function _water(uint8 plot) private {
        Plot storage p = _plotOf(msg.sender, plot);
        if (p.seedId == 0) revert PlotEmpty(plot);
        if (p.waterings >= MAX_WATERINGS) revert TooManyWaterings(plot);
        if (p.lastWateredAt != 0 && block.timestamp < p.lastWateredAt + WATER_COOLDOWN) {
            revert WaterCooldown(plot, p.lastWateredAt + WATER_COOLDOWN);
        }
        p.waterings += 1;
        p.lastWateredAt = uint64(block.timestamp);
        emit Watered(msg.sender, plot, p.waterings);
    }

    function _harvest(uint8 plot, Readings memory r) private {
        Plot storage p = _plotOf(msg.sender, plot);
        // Holder plots pay out only while the bound Squeek is still here; the crop waits until it is back.
        if (plot >= BASE_PLOTS && !hasSqueek(msg.sender)) revert NeedsSqueek(plot);
        uint32 seedId = p.seedId;
        if (seedId == 0) revert PlotEmpty(plot);
        Seed storage s = _seeds[seedId - 1];
        PlotStatus memory st = _status(s, p, r);
        if (st.wilted) revert Wilted(plot);
        if (!st.ripe) revert NotRipe(plot, st.progress, st.needed);
        if (s.needsFreshRun && !_freshRun()) revert NeedsFreshRun(plot); // only these harvests need SqueekCore.roundPage

        delete _gardens[msg.sender][plot];
        pantrySnacks += 1;
        PlayerStats storage ps = stats[msg.sender];
        ps.points += uint64(st.value);
        ps.harvests += 1;
        if (s.rare) ps.rareHarvests += 1;
        emit Harvested(msg.sender, plot, seedId, st.value, st.overripe, pantrySnacks);
        _payReferrer(uint64(st.value));
    }

    /// @dev The inviter gets REFERRAL_PCT of the harvest on top; fractions carry over so small crops still count.
    function _payReferrer(uint64 harvested) private {
        address ref = referrerOf[msg.sender];
        if (ref == address(0)) return;
        uint64 dust = _referralDust[ref] + harvested * REFERRAL_PCT;
        uint64 bonus = dust / 100;
        _referralDust[ref] = dust % 100;
        if (bonus == 0) return;
        PlayerStats storage rs = stats[ref];
        rs.points += bonus;
        rs.referralPoints += bonus;
        emit ReferralBonus(ref, msg.sender, bonus);
    }

    /// @dev Progress per grow mode. A Sepolia reinstall can reset counters below the planted values; that counts as no
    ///      progress. A crop left for another full grow amount after ripening is overripe and pays half.
    function _status(Seed storage s, Plot storage p, Readings memory r) private view returns (PlotStatus memory st) {
        uint64 workDone = r.work > p.plantedWork ? r.work - p.plantedWork : 0;
        if (s.mode == GrowMode.Work) {
            st.progress = workDone;
        } else if (s.mode == GrowMode.Blocks) {
            st.progress = r.blockHeight > p.plantedBlock ? r.blockHeight - p.plantedBlock : 0;
        } else {
            st.progress = r.settledRound > p.plantedRound ? r.settledRound - p.plantedRound : 0;
            st.wilted = workDone > s.napWorkLimit;
        }
        st.needed = s.growAmount;
        st.ripe = !st.wilted && st.progress >= st.needed;
        st.overripe = st.ripe && st.progress >= uint256(st.needed) * 2;
        if (st.ripe) {
            st.value = (uint256(s.basePoints) * (100 + WATER_BONUS_PCT * p.waterings + HELP_BONUS_PCT * p.helps)) / 100;
            if (st.overripe) st.value /= 2;
        }
    }

    function _plotOf(address player, uint8 plot) private view returns (Plot storage) {
        if (plot >= MAX_PLOTS) revert BadPlot(plot);
        return _gardens[player][plot];
    }

    function _seedOf(uint32 seedId) private view returns (Seed storage) {
        if (seedId == 0 || seedId > _seeds.length) revert UnknownSeed(seedId);
        return _seeds[seedId - 1];
    }
}
