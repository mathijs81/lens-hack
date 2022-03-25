pragma solidity 0.8.10;

import {ICollectModule} from '@lens/interfaces/ICollectModule.sol';
import {FeeModuleBase} from '@lens/core/modules/FeeModuleBase.sol';
import {FollowValidationModuleBase} from '@lens/core/modules/FollowValidationModuleBase.sol';
import {ModuleBase} from '@lens/core/modules/ModuleBase.sol';
import {ILensHub} from '@lens/interfaces/ILensHub.sol';
import {Errors} from '@lens/libraries/Errors.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

/**
 * LFGrow collect module: run an English auction for collecting your precious post.
 * An English auction collects bids that need to keep increasing until the time runs out.
 * This can't be done using the standard `processCollect` function because the lens code
 * already mints the NFT before calling that function.
 * Therefore, we need to collect the bids via an own function, and then after the time has
 * run out, the auction can be finished by one call to `processCollect`.
 *
 * To finish the auction, collect() needs to be called on the LensHub. The caller will get
 * the NFT. To prevent the highest bidder to be the only one that can finish the auction
 * and trigger payments (the post creator probably also wants to have the payment be done!)
 * we let the contract itself call LensHub.collect() and forward the NFT to the original bidder.
 */

/**
 * @notice A struct containing the data needed for the auction
 *
 * @param highestBid The current highest bid, initialized as the starting bid
 */
struct AuctionSettings {
    uint40 endTimestamp;
    address recipient;
    address currency;
    address highestBidder;
    uint256 highestBid;
    bool onlyFollowers;
}

contract EnglishAuctionCollectModule is ICollectModule, FeeModuleBase, FollowValidationModuleBase {
    using SafeERC20 for IERC20;
    error BidTooLow();
    error OnlyCallFinishAuction();
    event NewHighestBid(
        uint256 indexed profileId,
        uint256 indexed pubId,
        address bidder,
        uint256 amount,
        address currency
    );
    event AuctionEnded(
        uint256 indexed profileId,
        uint256 indexed pubId,
        address winningBidder,
        uint256 amount,
        address currency
    );

    // Force a minimum increase with each bid, otherwise bots potentially snipe
    // for (current bid + 1 wei) at the end of an auction.
    uint256 public constant MINIMUM_PERCENTAGE_INCREASE = 5;

    mapping(uint256 => mapping(uint256 => AuctionSettings)) internal _profilePubToSettingsMap;

    constructor(address hub, address moduleGlobals) FeeModuleBase(moduleGlobals) ModuleBase(hub) {}

    function getCurrentBid(uint256 profileId, uint256 pubId) public view returns (uint256 price) {
        AuctionSettings storage settings = _profilePubToSettingsMap[profileId][pubId];
        if (settings.highestBidder == address(0)) {
            return 0;
        }
        return settings.highestBid;
    }

    function getMinimumBid(uint256 profileId, uint256 pubId) public view returns (uint256 price) {
        AuctionSettings storage settings = _profilePubToSettingsMap[profileId][pubId];
        require(settings.highestBid > 0, 'Not initialized');
        if (settings.highestBidder == address(0)) {
            return settings.highestBid;
        } else {
            return ((100 + MINIMUM_PERCENTAGE_INCREASE) * settings.highestBid) / 100;
        }
    }

    function initializePublicationCollectModule(
        uint256 profileId,
        uint256 pubId,
        bytes calldata data
    ) external override onlyHub returns (bytes memory) {
        AuctionSettings memory decodedParams = abi.decode(data, (AuctionSettings));
        if (
            !_currencyWhitelisted(decodedParams.currency) ||
            decodedParams.recipient == address(0) ||
            decodedParams.highestBidder != address(0) ||
            decodedParams.highestBid == 0
        ) revert Errors.InitParamsInvalid();

        _profilePubToSettingsMap[profileId][pubId] = decodedParams;
        return data;
    }

    function makeBid(
        uint256 profileId,
        uint256 pubId,
        address currency,
        uint256 amount
    ) external {
        AuctionSettings storage settings = _profilePubToSettingsMap[profileId][pubId];
        if (settings.recipient == address(0)) {
            // This combination was never initialized
            revert Errors.CollectNotAllowed();
        }
        if (settings.onlyFollowers) {
            _checkFollowValidity(profileId, msg.sender);
        }
        if (block.timestamp > settings.endTimestamp) {
            revert Errors.CollectExpired();
        }
        if (currency != settings.currency) {
            revert Errors.ModuleDataMismatch();
        }
        if (amount < getMinimumBid(profileId, pubId)) {
            revert BidTooLow();
        }
        if (settings.highestBidder != address(0)) {
            // Refund to previous highest bidder
            IERC20(currency).safeTransfer(settings.highestBidder, settings.highestBid);
        }
        settings.highestBid = amount;
        settings.highestBidder = msg.sender;
        IERC20(currency).safeTransferFrom(msg.sender, address(this), amount);
        emit NewHighestBid(profileId, pubId, msg.sender, amount, currency);
    }

    function finishAuction(uint256 profileId, uint256 pubId) external {
        AuctionSettings storage settings = _profilePubToSettingsMap[profileId][pubId];
        if (settings.highestBidder == address(0)) {
            revert Errors.CollectNotAllowed();
        }
        ILensHub(HUB).collect(profileId, pubId, hex'');
    }

    function processCollect(
        uint256 referrerProfileId,
        address collector,
        uint256 profileId,
        uint256 pubId,
        bytes calldata data
    ) external override onlyHub {
        if (collector != address(this)) {
            revert OnlyCallFinishAuction();
        }
        AuctionSettings storage settings = _profilePubToSettingsMap[profileId][pubId];
        if (block.timestamp <= settings.endTimestamp || settings.highestBidder == address(0)) {
            revert Errors.ModuleDataMismatch();
        }

        address winner = settings.highestBidder;
        // Prevent multiple executions by removing bidder:
        settings.highestBidder = address(0);

        (address treasury, uint16 treasuryFee) = _treasuryData();
        uint256 treasuryAmount = (settings.highestBid * treasuryFee) / BPS_MAX;
        uint256 amount = settings.highestBid - treasuryAmount;

        IERC20(settings.currency).safeTransfer(settings.recipient, amount);
        IERC20(settings.currency).safeTransfer(treasury, treasuryAmount);

        // Move the just-minted NFT into this address to the winner
        IERC721(ILensHub(HUB).getCollectNFT(profileId, pubId)).transferFrom(
            address(this),
            winner,
            1
        );

        emit AuctionEnded(profileId, pubId, winner, settings.highestBid, settings.currency);
    }
}
