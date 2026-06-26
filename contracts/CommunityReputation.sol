// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract CommunityReputation {
    enum EventType {
        WARNING,
        SPAM,
        SCAM_SUSPECTED,
        BAN,
        MUTE,
        APPEAL_ACCEPTED,
        POSITIVE_CONTRIBUTION
    }

    address public owner;
    mapping(address => bool) public authorizedReporters;
    mapping(address => int256) private scores;
    mapping(address => uint256) private eventCounts;

    event ReporterUpdated(address indexed reporter, bool authorized);
    event ReputationRecorded(
        address indexed wallet,
        bytes32 indexed eventHash,
        EventType eventType,
        int256 scoreDelta,
        address indexed reporter
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "owner only");
        _;
    }

    modifier onlyReporter() {
        require(authorizedReporters[msg.sender], "reporter only");
        _;
    }

    constructor(address initialReporter) {
        owner = msg.sender;
        authorizedReporters[msg.sender] = true;
        if (initialReporter != address(0)) {
            authorizedReporters[initialReporter] = true;
        }
    }

    function setReporter(address reporter, bool authorized) external onlyOwner {
        authorizedReporters[reporter] = authorized;
        emit ReporterUpdated(reporter, authorized);
    }

    function recordEvent(
        address wallet,
        bytes32 eventHash,
        EventType eventType,
        int256 scoreDelta
    ) external onlyReporter {
        _recordEvent(wallet, eventHash, eventType, scoreDelta);
    }

    function batchRecordEvents(
        address[] calldata wallets,
        bytes32[] calldata eventHashes,
        uint8[] calldata eventTypes,
        int256[] calldata scoreDeltas
    ) external onlyReporter {
        uint256 length = wallets.length;
        require(
            length == eventHashes.length &&
                length == eventTypes.length &&
                length == scoreDeltas.length,
            "array length mismatch"
        );

        for (uint256 i = 0; i < length; i++) {
            require(eventTypes[i] <= uint8(EventType.POSITIVE_CONTRIBUTION), "invalid type");
            _recordEvent(wallets[i], eventHashes[i], EventType(eventTypes[i]), scoreDeltas[i]);
        }
    }

    function getReputation(address wallet) external view returns (int256 score, uint256 eventCount) {
        return (scores[wallet], eventCounts[wallet]);
    }

    function _recordEvent(
        address wallet,
        bytes32 eventHash,
        EventType eventType,
        int256 scoreDelta
    ) private {
        require(wallet != address(0), "wallet required");
        require(uint8(eventType) <= uint8(EventType.POSITIVE_CONTRIBUTION), "invalid type");

        scores[wallet] += scoreDelta;
        eventCounts[wallet] += 1;

        emit ReputationRecorded(wallet, eventHash, eventType, scoreDelta, msg.sender);
    }
}
