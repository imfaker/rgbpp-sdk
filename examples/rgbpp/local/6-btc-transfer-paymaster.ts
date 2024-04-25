import { AddressPrefix, addressToScript, privateKeyToAddress, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
  Collector,
  appendCkbTxWitnesses,
  appendPaymasterCellAndSignCkbTx,
  buildRgbppLockArgs,
  genBtcTransferCkbVirtualTx,
  genRgbppLockScript,
  sendCkbTx,
  updateCkbTxWithRealBtcTxId,

} from '@rgbpp-sdk/ckb';
import {
  transactionToHex,
  sendRgbppUtxos, DataSource, ECPair, bitcoin, NetworkType
} from '@rgbpp-sdk/btc';
import { BtcAssetsApi, BtcAssetsApiError } from '@rgbpp-sdk/service';
import { json } from 'stream/consumers';

// CKB SECP256K1 private key
// const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000009';
// BTC SECP256K1 private key
// const BTC_TEST_PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';

//tb1qp05v86s8877ncw4ck3jqmd7elqrxyu0jj2rver的私钥
// const BTC_TEST_PRIVATE_KEY = '41bf020676a1d94c82116b285fe8c15120dbb902d2ecaf88774aeca602960ae8';
//tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl的私钥
const BTC_TEST_PRIVATE_KEY = '20339278b0184ecf7c94818f8eac09d9a60155f2f7d3b8c94ed330f51239b723';

// //tb1qwgjl7m2llzrvrplpt8tt2d5avj32rm3crhy5l4私钥
// const BTC_TEST_PRIVATE_KEY = '5b7cfc7050e83b125522ce637327f81d7f19114985d12c8bfb64206abe085d96';

// //tb1qcsyly4h8zj6w7pq4lyuwguczq08lr342dyya5f私钥
// const BTC_TEST_PRIVATE_KEY = '722de2d3fbcbb5e7970a19cd634397b67932a9e9b460ec00040506fab5b0768c';




// API docs: https://btc-assets-api.testnet.mibao.pro/docs
const BTC_ASSETS_API_URL = 'https://btc-assets-api.testnet.mibao.pro';
// https://btc-assets-api.testnet.mibao.pro/docs/static/index.html#/Token/post_token_generate
const BTC_ASSETS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJteS1hcHAiLCJhdWQiOiJidGMtYXNzZXRzLWFwaS50ZXN0bmV0Lm1pYmFvLnBybyIsImp0aSI6IjVjOWE5YzUzLTRmZjQtNDEyYi1iZTU0LTZmYTMzMmNiZjk2YSIsImlhdCI6MTcxMzQyNzgyOH0.9awJlqeh2l6XuW4eJ1OA0zccAaTcHY4iVftofB068Qk';

const xudtType: CKBComponents.Script = {
  codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
  hashType: 'type',
  args: '0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1',
};
// const BTC_ASSETS_ORIGIN = 'https://btc-test.app';
const BTC_ASSETS_ORIGIN = 'https:btc-assets-api.testnet.mibao.pro';
interface Params {
  rgbppLockArgsList: string[];
  toBtcAddress: string;
  transferAmount: bigint;
}
const transferRgbppOnBtc = async ({ rgbppLockArgsList, toBtcAddress, transferAmount }: Params) => {
  const collector = new Collector({
    ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
    ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
  });
  const isMainnet = false;
  const ckbAddress = privateKeyToAddress(CKB_TEST_PRIVATE_KEY, {
    prefix: isMainnet ? AddressPrefix.Mainnet : AddressPrefix.Testnet,
  });
  console.log('ckb address: ', ckbAddress);

  const network = isMainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const keyPair = ECPair.fromPrivateKey(Buffer.from(BTC_TEST_PRIVATE_KEY, 'hex'), { network });
  const { address: btcAddress } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });

  console.log(`from btcAddress = ${btcAddress}`)
  console.log(`toBtcAddress = ${toBtcAddress}`)

  const networkType = isMainnet ? NetworkType.MAINNET : NetworkType.TESTNET;
  const service = BtcAssetsApi.fromToken(BTC_ASSETS_API_URL, BTC_ASSETS_TOKEN, BTC_ASSETS_ORIGIN);
  const source = new DataSource(service, networkType);

  const recommonandFee = source.getRecommendedFeeRates();
  // return
  const ckbVirtualTxResult = await genBtcTransferCkbVirtualTx({
    collector,
    rgbppLockArgsList,
    xudtTypeBytes: serializeScript(xudtType),
    transferAmount,
    isMainnet,
    ckbFeeRate: BigInt(1500)
  });
  console.log(JSON.stringify(ckbVirtualTxResult, null, 2))
  // return

  const { commitment, ckbRawTx, needPaymasterCell, sumInputsCapacity } = ckbVirtualTxResult;

  const paymasterInfo = needPaymasterCell ? await service.getRgbppPaymasterInfo() : null;
  const paymasterAddress = paymasterInfo?.btc_address ?? '';
  const paymaster = { address: paymasterAddress, value: paymasterInfo?.fee ?? 7000 }
  console.log(JSON.stringify(paymaster, null, 2))
  // return
  // Send BTC tx
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    paymaster: paymaster,
    commitment,
    tos: [toBtcAddress],
    ckbCollector: collector,
    from: btcAddress!,
    source,
    feeRate: 60,
    minUtxoSatoshi: 1200
  });
  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();
  console.log("psbt begin")
  const btcTx = psbt.extractTransaction();
  // Remove the witness from BTC tx for RGBPP unlock
  const btcTxBytes = transactionToHex(btcTx, false);
  const { txid: btcTxId } = await service.sendBtcTransaction(btcTx.toHex());




  // const btcTxId = "e12e03061ba3e13ba6400198c13c47ce193a0cfe2075e6a955403f95b6f73717"
  console.log('BTC TxId: ', btcTxId);

  // try {
  //   ///queue相比于local，应该是把等待btc的交易确认成功后，替换wintines后发送ckb的交易和到了一起
  //   await service.sendRgbppCkbTransaction({ btc_txid: btcTxId, ckb_virtual_result: ckbVirtualTxResult });
  //   const interval = setInterval(async () => {
  //     const { state, failedReason } = await service.getRgbppTransactionState(btcTxId);
  //     console.log('state', state);
  //     if (state === 'completed' || state === 'failed') {
  //       clearInterval(interval)
  //       if (state === 'completed') {
  //         const { txhash: txHash } = await service.getRgbppTransactionHash(btcTxId);
  //         console.info(`Rgbpp asset has been transferred on BTC and the related CKB tx hash is ${txHash}`);
  //       } else {
  //         console.warn(`Rgbpp CKB transaction failed and the reason is ${failedReason} `);
  //       }
  //     }
  //   }, 30 * 1000)
  // } catch (error) {
  //   console.error(error)
  // }

  // return
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
      // const ckbTx = await appendCkbTxWitnesses({
      //   ckbRawTx: newCkbRawTx,
      //   btcTxBytes,
      //   rgbppApiSpvProof,
      // });

      const payAddressScript = addressToScript("ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqtka35r98mzjhh5epgfwcg4c2fx6ggg9zcz2f9mz")
      console.log(`payAddressScript ${JSON.stringify(payAddressScript, null, 2)}`);
      const cells = await collector.getCells({ lock: payAddressScript });
      if (!cells || cells.length === 0) {
        throw new Error('No rgbpp cells found with the xudt type script and the rgbpp lock args');
      }
      console.log(`cells ${JSON.stringify(cells, null, 2)}`);
      const paymentCell = cells[0];
      console.log(`paymentCell ${JSON.stringify(paymentCell, null, 2)}`);
      const ckbTx1 = await appendCkbTxWitnesses({
        ckbRawTx: newCkbRawTx,
        btcTxBytes,
        rgbppApiSpvProof,
      });

      const ckbTx = await appendPaymasterCellAndSignCkbTx({
        secp256k1PrivateKey: CKB_TEST_PRIVATE_KEY,
        ckbRawTx: ckbTx1,
        sumInputsCapacity: sumInputsCapacity,
        paymasterCell: paymentCell,
        isMainnet
      });
      console.log(`ckbTx ${JSON.stringify(ckbTx, null, 2)}`);
      const txHash = await sendCkbTx({ collector, signedTx: ckbTx });
      console.info(`RGB++ Asset has been transferred on BTC and the CKB tx hash is ${txHash}`);
    } catch (error) {
      if (!(error instanceof BtcAssetsApiError)) {
        console.error(error);
      }
    }
  }, 30 * 1000);
};


// Use your real BTC UTXO information on the BTC Testnet
// rgbppLockArgs: outIndexU32 + btcTxId
// transferRgbppOnBtc({
//   rgbppLockArgsList: [buildRgbppLockArgs(1, '70b250e2a3cc7a33b47f7a4e94e41e1ee2501ce73b393d824db1dd4c872c5348')],
//   toBtcAddress: 'tb1qvt7p9g6mw70sealdewtfp0sekquxuru6j3gwmt',
//   // To simplify, keep the transferAmount the same as 2-ckb-jump-btc
//   transferAmount: BigInt(800_0000_0000),
// });
transferRgbppOnBtc({

  rgbppLockArgsList: [buildRgbppLockArgs(2, '50570ad922d21ac12c52b7348f28c12e289e8f073ab939f84a3a7da064ee4bd4')],

  //joyid 
  toBtcAddress: 'tb1pmmv2f6pytg3uf2kv2zj2l5pu8hshv0t58n529xfw7f83dset20kqd93kgu',

  // toBtcAddress: 'tb1q2cmznxp9a0z9jgc62l30x75uvk40swhd4nks2z',
  // To simplify, keep the transferAmount the same as 2-ckb-jump-btc
  transferAmount: BigInt(30_0000_0000),
});
