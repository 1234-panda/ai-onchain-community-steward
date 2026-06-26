const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CommunityReputation", function () {
  it("records one event type and updates reputation", async function () {
    const [owner, wallet] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CommunityReputation");
    const contract = await factory.deploy(owner.address);
    await contract.waitForDeployment();

    const hash = ethers.keccak256(ethers.toUtf8Bytes("spam-event"));
    await expect(contract.recordEvent(wallet.address, hash, 1, -30))
      .to.emit(contract, "ReputationRecorded")
      .withArgs(wallet.address, hash, 1, -30, owner.address);

    const [score, eventCount] = await contract.getReputation(wallet.address);
    expect(score).to.equal(-30);
    expect(eventCount).to.equal(1);
  });

  it("records a batch of events and updates reputation counts", async function () {
    const [owner, walletA, walletB] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CommunityReputation");
    const contract = await factory.deploy(owner.address);
    await contract.waitForDeployment();

    const hashes = [
      ethers.keccak256(ethers.toUtf8Bytes("spam-event")),
      ethers.keccak256(ethers.toUtf8Bytes("fud-event")),
      ethers.keccak256(ethers.toUtf8Bytes("positive-event"))
    ];

    await contract.batchRecordEvents(
      [walletA.address, walletA.address, walletB.address],
      hashes,
      [1, 0, 6],
      [-30, -5, 15]
    );

    const [scoreA, eventCountA] = await contract.getReputation(walletA.address);
    const [scoreB, eventCountB] = await contract.getReputation(walletB.address);
    expect(scoreA).to.equal(-35);
    expect(eventCountA).to.equal(2);
    expect(scoreB).to.equal(15);
    expect(eventCountB).to.equal(1);
  });

  it("rejects invalid batch payloads", async function () {
    const [owner, wallet] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CommunityReputation");
    const contract = await factory.deploy(owner.address);
    await contract.waitForDeployment();

    await expect(
      contract.batchRecordEvents([wallet.address], [], [1], [-30])
    ).to.be.revertedWith("array length mismatch");

    await expect(
      contract.batchRecordEvents([ethers.ZeroAddress], [ethers.ZeroHash], [1], [-30])
    ).to.be.revertedWith("wallet required");

    await expect(
      contract.batchRecordEvents([wallet.address], [ethers.ZeroHash], [99], [-30])
    ).to.be.revertedWith("invalid type");
  });

  it("rejects unauthorized reporters", async function () {
    const [owner, wallet, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CommunityReputation");
    const contract = await factory.deploy(owner.address);
    await contract.waitForDeployment();

    await expect(
      contract.connect(stranger).recordEvent(wallet.address, ethers.ZeroHash, 0, -1)
    ).to.be.revertedWith("reporter only");

    await expect(
      contract.connect(stranger).batchRecordEvents([wallet.address], [ethers.ZeroHash], [0], [-1])
    ).to.be.revertedWith("reporter only");
  });
});
