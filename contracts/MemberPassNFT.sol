// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract MemberPassNFT {
    string public name;
    string public symbol;
    address public owner;

    uint256 private nextTokenId = 1;
    string private baseTokenURI;
    mapping(uint256 => address) private owners;
    mapping(address => uint256) private balances;
    mapping(address => uint256) public passOf;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event PassMinted(address indexed to, uint256 indexed tokenId);
    event TransferBlocked(address indexed from, address indexed to, uint256 indexed tokenId);

    modifier onlyOwner() {
        require(msg.sender == owner, "owner only");
        _;
    }

    constructor(string memory tokenUri_) {
        name = "Community Member Pass";
        symbol = "CMPASS";
        owner = msg.sender;
        baseTokenURI = tokenUri_;
    }

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        require(to != address(0), "recipient required");
        require(balances[to] == 0, "member already has pass");

        tokenId = nextTokenId++;
        owners[tokenId] = to;
        balances[to] = 1;
        passOf[to] = tokenId;

        emit Transfer(address(0), to, tokenId);
        emit PassMinted(to, tokenId);
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "zero address");
        return balances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address tokenOwner = owners[tokenId];
        require(tokenOwner != address(0), "nonexistent token");
        return tokenOwner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return baseTokenURI;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        emit TransferBlocked(from, to, tokenId);
        revert("member pass is soulbound");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        emit TransferBlocked(from, to, tokenId);
        revert("member pass is soulbound");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata) external {
        emit TransferBlocked(from, to, tokenId);
        revert("member pass is soulbound");
    }
}
