pragma solidity 0.8.10;

import {ICollectModule} from '@lens/interfaces/ICollectModule.sol';
import {FeeModuleBase} from '@lens/core/modules/FeeModuleBase.sol';
import {FollowValidationModuleBase} from '@lens/core/modules/FollowValidationModuleBase.sol';
import {ModuleBase} from '@lens/core/modules/ModuleBase.sol';
import {Errors} from '@lens/libraries/Errors.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {IERC721} from '@openzeppelin/contracts/token/ERC721/IERC721.sol';

/**
 * LFGrow collect module: run a Dutch auction for collecting your precious post.
 */

/**
 * @notice A struct containing the data needed to run the Dutch auction
 *
 * @param startAmount The cost at the start of the auction.
 * @param endAmount The cost at the end of the auction. Must be <= amountStart.
 * @param startTimestamp When the auction started.
 * @param endTimetamp When the auction will end (if nobody collects).
 * @param currency The currency to pay for collecting.
 * @param referralFee The fee that a referrer gets.
 */
struct DutchAuctionSettings {
    uint256 startAmount;
    uint256 endAmount;
    uint40 startTimestamp;
    uint40 endTimestamp;
    address recipient;
    address currency;
    uint16 referralFee;
    uint64 flags; // Bit 1: whether this auction is over. Bit 2: whether should check for follow
}

struct InitializeParams {
    uint256 startAmount;
    uint256 endAmount;
    uint40 runtimeSeconds;
    address recipient;
    address currency;
    uint16 referralFee;
    bool shouldFollow;
}

/**
 * @title DutchAuctionCollectModule
 * @author Mathijs Vogelzang
 *
 * @notice This is a Lens CollectModule implementation that runs a Dutch auction.
 * The price starts at a given amountStart and runs down to amountEnd over time, and the
 * first profile to collect it 'wins' it at that price.
 */
contract DutchAuctionCollectModule is ICollectModule, FeeModuleBase, FollowValidationModuleBase {
    using SafeERC20 for IERC20;
    error PaymentTooLow();

    mapping(uint256 => mapping(uint256 => DutchAuctionSettings)) internal _profilePubToSettingsMap;

    constructor(address hub, address moduleGlobals) FeeModuleBase(moduleGlobals) ModuleBase(hub) {}

    function getCurrentPrice(uint256 profileId, uint256 pubId) public view returns (uint256 price) {
        uint256 startTimestamp = _profilePubToSettingsMap[profileId][pubId].startTimestamp;
        uint256 endTimestamp = _profilePubToSettingsMap[profileId][pubId].endTimestamp;
        return
            _profilePubToSettingsMap[profileId][pubId].startAmount -
            ((block.timestamp - startTimestamp) *
                (_profilePubToSettingsMap[profileId][pubId].startAmount -
                    _profilePubToSettingsMap[profileId][pubId].endAmount)) /
            (endTimestamp - startTimestamp);
    }

    function initializePublicationCollectModule(
        uint256 profileId,
        uint256 pubId,
        bytes calldata data
    ) external override onlyHub returns (bytes memory) {
        InitializeParams memory decodedParams = abi.decode(data, (InitializeParams));
        if (
            !_currencyWhitelisted(decodedParams.currency) ||
            decodedParams.recipient == address(0) ||
            decodedParams.referralFee > BPS_MAX ||
            decodedParams.startAmount < decodedParams.endAmount
        ) revert Errors.InitParamsInvalid();

        uint40 startTimestamp = uint40(block.timestamp);
        uint40 endTimestamp = startTimestamp + decodedParams.runtimeSeconds;

        _profilePubToSettingsMap[profileId][pubId].startAmount = decodedParams.startAmount;
        _profilePubToSettingsMap[profileId][pubId].endAmount = decodedParams.endAmount;
        _profilePubToSettingsMap[profileId][pubId].startTimestamp = startTimestamp;
        _profilePubToSettingsMap[profileId][pubId].endTimestamp = endTimestamp;
        _profilePubToSettingsMap[profileId][pubId].recipient = decodedParams.recipient;
        _profilePubToSettingsMap[profileId][pubId].currency = decodedParams.currency;
        _profilePubToSettingsMap[profileId][pubId].referralFee = decodedParams.referralFee;
        if (decodedParams.shouldFollow) {
            _profilePubToSettingsMap[profileId][pubId].flags = 0x2;
        } else {
            _profilePubToSettingsMap[profileId][pubId].flags = 0;
        }

        return data;
    }

    function processCollect(
        uint256 referrerProfileId,
        address collector,
        uint256 profileId,
        uint256 pubId,
        bytes calldata data
    ) external override onlyHub {
        // This function is tricky to stay under the "Stack too deep, try removing local variables."
        // 16-slot limit
        if ((_profilePubToSettingsMap[profileId][pubId].flags & 0x2) == 0x2) {
            _checkFollowValidity(profileId, collector);
        }

        (address currency, uint256 amount) = abi.decode(data, (address, uint256));

        {
            if (block.timestamp > _profilePubToSettingsMap[profileId][pubId].endTimestamp)
                revert Errors.CollectExpired();
            if ((_profilePubToSettingsMap[profileId][pubId].flags & 0x1) == 0x1)
                revert Errors.MintLimitExceeded();

            uint256 expectedAmount = getCurrentPrice(profileId, pubId);
            address expectedCurrency = _profilePubToSettingsMap[profileId][pubId].currency;

            // Can't use _validateDataIsExpected because the actually paid amount is likely to be slightly
            // larger than the expected amount and _validateDataIsExpected checks for equality
            if (amount < expectedAmount || currency != expectedCurrency)
                revert Errors.ModuleDataMismatch();
        }

        _profilePubToSettingsMap[profileId][pubId].flags |= 0x1;

        (address treasury, uint16 treasuryFee) = _treasuryData();
        uint256 treasuryAmount = (amount * treasuryFee) / BPS_MAX;
        amount = amount - treasuryAmount;
        {
            if (referrerProfileId != profileId) {
                uint256 referralFee = _profilePubToSettingsMap[profileId][pubId].referralFee;
                if (referralFee != 0) {
                    uint256 referralAmount = (amount * referralFee) / BPS_MAX;
                    amount = amount - referralAmount;

                    address referralRecipient = IERC721(HUB).ownerOf(referrerProfileId);

                    IERC20(currency).safeTransferFrom(collector, referralRecipient, referralAmount);
                }
            }
        }
        address recipient = _profilePubToSettingsMap[profileId][pubId].recipient;

        IERC20(currency).safeTransferFrom(collector, recipient, amount);
        IERC20(currency).safeTransferFrom(collector, treasury, treasuryAmount);
    }
}
