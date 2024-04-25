import { AddressPrefix, privateKeyToAddress, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
    Collector,
    appendCkbTxWitnesses,
    buildRgbppLockArgs,
    genBtcBatchTransferCkbVirtualTx,
    genBtcTransferCkbVirtualTx,
    sendCkbTx,
    updateCkbTxWithRealBtcTxId,
    RgbppBtcAddressReceiver
} from '@rgbpp-sdk/ckb';
import {
    transactionToHex,
    sendRgbppUtxos, DataSource, ECPair, bitcoin, NetworkType
} from '@rgbpp-sdk/btc';
import { BtcAssetsApi, BtcAssetsApiError } from '@rgbpp-sdk/service';

// CKB SECP256K1 private key
const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000009';
const BTC_TEST_PRIVATE_KEY = '722de2d3fbcbb5e7970a19cd634397b67932a9e9b460ec00040506fab5b0768c';

///gat
const gatXudtType: CKBComponents.Script = {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    hashType: 'type',
    args: '0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1',
};


// API docs: https://btc-assets-api.testnet.mibao.pro/docs
const BTC_ASSETS_API_URL = 'https://btc-assets-api.testnet.mibao.pro';
// https://btc-assets-api.testnet.mibao.pro/docs/static/index.html#/Token/post_token_generate
const BTC_ASSETS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJteS1hcHAiLCJhdWQiOiJidGMtYXNzZXRzLWFwaS50ZXN0bmV0Lm1pYmFvLnBybyIsImp0aSI6IjVjOWE5YzUzLTRmZjQtNDEyYi1iZTU0LTZmYTMzMmNiZjk2YSIsImlhdCI6MTcxMzQyNzgyOH0.9awJlqeh2l6XuW4eJ1OA0zccAaTcHY4iVftofB068Qk';

const BTC_ASSETS_ORIGIN = 'https:btc-assets-api.testnet.mibao.pro';


interface MutileTransferParams {
    rgbppLockArgsList: string[];
    fromAddressPrivate: string;
    rgbppBtcAddressReceivers: RgbppBtcAddressReceiver[];
    isMainnet: boolean;
    ckbPrivateKey: string;
    feeRate: number;
    xudtType: CKBComponents.Script;
}
const transferRgbppsToMutliAddressOnBtc = async ({ rgbppLockArgsList,
    rgbppBtcAddressReceivers,
    fromAddressPrivate = BTC_TEST_PRIVATE_KEY,
    isMainnet = false,
    ckbPrivateKey = CKB_TEST_PRIVATE_KEY,
    feeRate,
    xudtType }: MutileTransferParams) => {
    const collector = isMainnet ? new Collector({
        ckbNodeUrl: 'https://mainnet.ckb.dev/rpc',
        ckbIndexerUrl: 'https://mainnet.ckb.dev/indexer',
    }) : new Collector({
        ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
        ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
    });

    const ckbAddress = privateKeyToAddress(ckbPrivateKey, {
        prefix: isMainnet ? AddressPrefix.Mainnet : AddressPrefix.Testnet,
    });
    console.log('ckb address: ', ckbAddress);

    const network = isMainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    const keyPair = ECPair.fromPrivateKey(Buffer.from(fromAddressPrivate, 'hex'), { network });
    const { address: fromBtcAddress } = bitcoin.payments.p2wpkh({
        pubkey: keyPair.publicKey,
        network,
    });

    console.log(`from btcAddress = ${fromBtcAddress}`)
    console.log(`toBtcAddresses list = ${JSON.stringify(rgbppBtcAddressReceivers.map((receiver) => receiver.toBtcAddress), null, 2)}`)

    const networkType = isMainnet ? NetworkType.MAINNET : NetworkType.TESTNET;
    const service = BtcAssetsApi.fromToken(BTC_ASSETS_API_URL, BTC_ASSETS_TOKEN, BTC_ASSETS_ORIGIN);
    const source = new DataSource(service, networkType);

    const recommonandFee = source.getRecommendedFeeRates();
    console.log(`recommonandFee = ${JSON.stringify(recommonandFee, null, 2)}`)

    const ckbVirtualTxResult = await genBtcBatchTransferCkbVirtualTx({
        collector,
        rgbppLockArgsList,
        xudtTypeBytes: serializeScript(xudtType),
        rgbppReceivers: rgbppBtcAddressReceivers,
        isMainnet,
    });
    console.log(JSON.stringify(ckbVirtualTxResult, null, 2))


    const toBtcAddresses = rgbppBtcAddressReceivers.map((receiver) => receiver.toBtcAddress);
    const { commitment, ckbRawTx } = ckbVirtualTxResult;
    // Send BTC tx
    const psbt = await sendRgbppUtxos({
        ckbVirtualTx: ckbRawTx,
        commitment,
        tos: toBtcAddresses,
        ckbCollector: collector,
        from: fromBtcAddress!,
        source,
        feeRate: feeRate
    });
    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();

    const btcTx = psbt.extractTransaction();
    // Remove the witness from BTC tx for RGBPP unlock
    const btcTxBytes = transactionToHex(btcTx, false);
    const { txid: btcTxId } = await service.sendBtcTransaction(btcTx.toHex());

    console.log('BTC TxId: ', btcTxId);

    // const btcTxId = '401c17aed89864341fb8f8745dce82e8d8587b77c5ecb42a5ed404a675a09fe2'
    //fc26caf918795dc09dfd0e344bf6ab760ec5a46a3fb90d40ad2d6b789bf63085


    // Wait for BTC tx and proof to be ready, and then send isomorphic CKB transactions
    const interval = setInterval(async () => {
        try {
            console.log('Waiting for BTC tx and proof to be ready');
            const rgbppApiSpvProof = await service.getRgbppSpvProof(btcTxId, 0);
            console.log(`rgbppApiSpvProof ${JSON.stringify(rgbppApiSpvProof, null, 2)}`);
            clearInterval(interval);
            // Update CKB transaction with the real BTC txId
            const newCkbRawTx = updateCkbTxWithRealBtcTxId({ ckbRawTx, btcTxId, isMainnet });
            //将merkle prool 存在了 ckb交易的witnesses里， 在virtualckbtx里，填的还是export const RGBPP_WITNESS_PLACEHOLDER = '0xFF';
            const ckbTx = await appendCkbTxWitnesses({
                ckbRawTx: newCkbRawTx,
                btcTxBytes,
                rgbppApiSpvProof,
            });

            const txHash = await sendCkbTx({ collector, signedTx: ckbTx });
            console.info(`RGB++ Asset has been transferred on BTC and the CKB tx hash is ${txHash}`);
        } catch (error) {
            if (!(error instanceof BtcAssetsApiError)) {
                console.error(error);
            }
        }
    }, 30 * 1000);
};


const service = BtcAssetsApi.fromToken(BTC_ASSETS_API_URL, BTC_ASSETS_TOKEN, BTC_ASSETS_ORIGIN);






// transferRgbppsToMutliAddressOnBtc({

//     rgbppLockArgsList: [buildRgbppLockArgs(1, '3011ec7826527afb710e1199299b1349a28c3bfd079153428ed0d27e4824bbc7')],
//     fromAddressPrivate: BTC_TEST_PRIVATE_KEY,
//     //joyid 
//     rgbppBtcAddressReceivers: [{
//         toBtcAddress: 'tb1pmmv2f6pytg3uf2kv2zj2l5pu8hshv0t58n529xfw7f83dset20kqd93kgu',
//         transferAmount: BigInt(80_0000_0000)
//     }, {
//         toBtcAddress: 'ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqtka35r98mzjhh5epgfwcg4c2fx6ggg9zcz2f9mz',
//         transferAmount: BigInt(70_0000_0000)
//     }],
//     isMainnet: false,
//     ckbPrivateKey: CKB_TEST_PRIVATE_KEY,
//     feeRate: 80,
//     xudtType: gatXudtType
// });