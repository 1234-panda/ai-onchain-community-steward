const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MemberPassNFT", function () {
  async function deployPass() {
    const [owner, member, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("MemberPassNFT");
    const pass = await factory.deploy("https://example.com/member-pass.json");
    await pass.waitForDeployment();
    return { pass, owner, member, stranger };
  }

  it("lets owner mint one soulbound pass", async function () {
    const { pass, member } = await deployPass();

    await expect(pass.mint(member.address))
      .to.emit(pass, "PassMinted")
      .withArgs(member.address, 1);

    expect(await pass.balanceOf(member.address)).to.equal(1);
    expect(await pass.ownerOf(1)).to.equal(member.address);
    expect(await pass.tokenURI(1)).to.equal("https://example.com/member-pass.json");
  });

  it("rejects non-owner minting", async function () {
    const { pass, member, stranger } = await deployPass();

    await expect(pass.connect(stranger).mint(member.address)).to.be.revertedWith("owner only");
  });

  it("rejects duplicate passes for the same wallet", async function () {
    const { pass, member } = await deployPass();

    await pass.mint(member.address);
    await expect(pass.mint(member.address)).to.be.revertedWith("member already has pass");
  });

  it("blocks transferFrom and safeTransferFrom", async function () {
    const { pass, member, stranger } = await deployPass();

    await pass.mint(member.address);
    await expect(pass.connect(member).transferFrom(member.address, stranger.address, 1)).to.be.revertedWith(
      "member pass is soulbound"
    );
    await expect(
      pass.connect(member)["safeTransferFrom(address,address,uint256)"](member.address, stranger.address, 1)
    ).to.be.revertedWith("member pass is soulbound");
  });
});
