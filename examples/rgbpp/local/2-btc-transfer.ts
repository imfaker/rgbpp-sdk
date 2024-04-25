import { AddressPrefix, privateKeyToAddress, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
  Collector,
  appendCkbTxWitnesses,
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
// //tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl的私钥
// const BTC_TEST_PRIVATE_KEY = '20339278b0184ecf7c94818f8eac09d9a60155f2f7d3b8c94ed330f51239b723';

// //tb1qwgjl7m2llzrvrplpt8tt2d5avj32rm3crhy5l4私钥
// const BTC_TEST_PRIVATE_KEY = '5b7cfc7050e83b125522ce637327f81d7f19114985d12c8bfb64206abe085d96';

//tb1qcsyly4h8zj6w7pq4lyuwguczq08lr342dyya5f私钥
const BTC_TEST_PRIVATE_KEY = '722de2d3fbcbb5e7970a19cd634397b67932a9e9b460ec00040506fab5b0768c';




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
  console.log(`recommonandFee = ${JSON.stringify(recommonandFee, null, 2)}`)

  // const xudtType: CKBComponents.Script = {
  //   codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
  //   hashType: 'type',
  //   args: '0x1ba116c119d1cfd98a53e9d1a615cf2af2bb87d95515c9d217d367054cfc696b',
  // };
  // const rgbppLocks = rgbppLockArgsList.map((args) => genRgbppLockScript(args, isMainnet));
  // console.log(`rgbppLocks = ${JSON.stringify(rgbppLocks, null, 2)}`)
  // const cells = await collector.getCells({ lock: rgbppLocks[0], type: xudtType });
  // console.log(`cells = ${JSON.stringify(cells, null, 2)}`)

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

  const { commitment, ckbRawTx, needPaymasterCell } = ckbVirtualTxResult;

  // const paymasterInfo = needPaymasterCell ? await service.getRgbppPaymasterInfo() : null;
  // const paymasterAddress = paymasterInfo?.btc_address ?? '';
  // console.log(JSON.stringify(paymasterInfo, null, 2))
  // const paymaster = { address: paymasterAddress, value: paymasterInfo?.fee ?? 7000 }
  // console.log(JSON.stringify(paymaster, null, 2))
  // return
  // Send BTC tx
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    // paymaster: paymaster,
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

  const btcTx = psbt.extractTransaction();
  // Remove the witness from BTC tx for RGBPP unlock
  const btcTxBytes = transactionToHex(btcTx, false);
  // console.log(`btcTx = ${JSON.stringify(btcTx, null, 2)}`);
  // return
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


// Use your real BTC UTXO information on the BTC Testnet
// rgbppLockArgs: outIndexU32 + btcTxId
// transferRgbppOnBtc({
//   rgbppLockArgsList: [buildRgbppLockArgs(1, '70b250e2a3cc7a33b47f7a4e94e41e1ee2501ce73b393d824db1dd4c872c5348')],
//   toBtcAddress: 'tb1qvt7p9g6mw70sealdewtfp0sekquxuru6j3gwmt',
//   // To simplify, keep the transferAmount the same as 2-ckb-jump-btc
//   transferAmount: BigInt(800_0000_0000),
// });
transferRgbppOnBtc({


  //btc交易id 65ade8f84cc7ea6ed93619d613ef7e704eaab982d1ab25bbc589a689ff6eee5f
  // rgbppLockArgsList: [buildRgbppLockArgs(3, 'f7946882866c29e6772497b2a44da99b67d13cce313a2719e6cc8889e85b6f4f')],

  rgbppLockArgsList: [buildRgbppLockArgs(2, '36002640c7ed443fdec8af59172ed0b679928afdc72706e95ef473da13193864')],


  // rgbppLockArgsList: [buildRgbppLockArgs(1, '1af8356d09ac67b6cb922dafee1074a39143d69c520034523538834e88354221')],
  // rgbppLockArgsList: [buildRgbppLockArgs(1, '7adba17bc62a425cd0af306e6ee3cd7f3bb6c4a0fa5907f7a929496dbdb02549')],
  // rgbppLockArgsList: [buildRgbppLockArgs(2, '84150a285b9b8d9083981e8bbdf89a25e95ab11801abc749b0d5f44ded20dbb0')],
  // toBtcAddress: 'tb1qvt7p9g6mw70sealdewtfp0sekquxuru6j3gwmt',
  // toBtcAddress: 'tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl',
  // toBtcAddress: 'tb1qp05v86s8877ncw4ck3jqmd7elqrxyu0jj2rver',

  //joyid 
  toBtcAddress: 'tb1pmmv2f6pytg3uf2kv2zj2l5pu8hshv0t58n529xfw7f83dset20kqd93kgu',

  // toBtcAddress: 'tb1q2cmznxp9a0z9jgc62l30x75uvk40swhd4nks2z',
  // To simplify, keep the transferAmount the same as 2-ckb-jump-btc
  transferAmount: BigInt(30_0000_0000),
});

//私钥20339278b0184ecf7c94818f8eac09d9a60155f2f7d3b8c94ed330f51239b723
//tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl


// 正式网joy id 钱包 https://explorer.nervos.org/address/bc1pu809t47age63n6e2ucnfrdp5zaqnuxp3w7tnefeay77x2n0hpe0quy46pv
// 一笔RGB++资产发送，对应的ckb交易id是 0x4d0d6377d1a62c8f966d1f8f1ca79d307a581152a5c424aa9943ef87baf0ea3b，
// btc交易是f6f11104547596eb062c278096b75b0052aae5f71911efc700b4a67e9e6332ee 。
// 这btc交易中有一笔输入utxo流向了地址
// bc1pn9zhvxlcjnpne440w8ht8j3fajlcxanmyjq04x89mc2y73xm0vpqpwngtj，金额为0.00007000，同时同构的ckb交易也有一笔ckb的流转扣除。
// 1. 这个额外的utxo是joy id 钱包扣除的手续费，用来生成冲抵ckb的交易费用么？
// 而我在测试网上rgb - sdk代码发送一笔 btc的 rgb++交易，https://pudge.explorer.nervos.org/address/tb1qp05v86s8877ncw4ck3jqmd7elqrxyu0jj2rver ，交易id是0xe7aeb424d2a9e0e8e5ade73352b2cc61c52d50b0a2596b2104c7818b8f32771d，浏览器上面未显示这个ckb的费用是由谁提供，只显示了扣除了256。
// 2. 这个btc交易的 ckb同构交易的费用是否就是由tb1qp05v86s8877ncw4ck3jqmd7elqrxyu0jj2rver来支持？
// 3. 这个tb1qp05v86s8877ncw4ck3jqmd7elqrxyu0jj2rver的ckb来源是否是来自于我leapin时候的ckb交易也会同时转给 btc地址 254ckb。
// 那按照这个说法是否是说每笔rgb++资产转移的手续费基本就是256ckb，如果没有254就无法转出。 这样有个问题，我btc地址转出部分rgb++资产，那么
// 我btc地址的ckb余额就不够，就无法转出。 如果btc是不持有ckb，那么ckb交易的手续费由谁支出。 或者说整个1 - 2 ， 2 - 2，2 - 1的ckb交易的手续费都有由谁出


// 4.运行rgp - sdk btc transfer ，btc交易成功后， ckb交易会报错。请问原因是什么为啥会失败。
// 4.1
// npx ts - node examples / rgbpp / local / 2 - btc - transfer.ts
// ckb address: ckt1qyq8dmrgx20k9900fjzsjas3ts5jd5sss29suvrp5f
// btc address: tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl





// {
//   "ckbRawTx": {
//     "version": "0x0",
//       "cellDeps": [
//         {
//           "outPoint": {
//             "txHash": "0xf1de59e973b85791ec32debbba08dff80c63197e895eb95d67fc1e9f6b413e00",
//             "index": "0x0"
//           },
//           "depType": "code"
//         },
//         {
//           "outPoint": {
//             "txHash": "0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f",
//             "index": "0x0"
//           },
//           "depType": "code"
//         },
//         {
//           "outPoint": {
//             "txHash": "0xf1de59e973b85791ec32debbba08dff80c63197e895eb95d67fc1e9f6b413e00",
//             "index": "0x1"
//           },
//           "depType": "code"
//         },
//         {
//           "outPoint": {
//             "txHash": "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
//             "index": "0x0"
//           },
//           "depType": "depGroup"
//         }
//       ],
//         "headerDeps": [],
//           "inputs": [
//             {
//               "previousOutput": {
//                 "txHash": "0xac810f473b96bb233ed100266d8e090120161febfe243f9a19f53d62d7917d43",
//                 "index": "0x0"
//               },
//               "since": "0x0"
//             }
//           ],
//             "outputs": [
//               {
//                 "lock": {
//                   "codeHash": "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248",
//                   "hashType": "type",
//                   "args": "0x010000000000000000000000000000000000000000000000000000000000000000000000"
//                 },
//                 "type": {
//                   "codeHash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
//                   "hashType": "type",
//                   "args": "0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1"
//                 },
//                 "capacity": "0x5e9f53e00"
//               },
//               {
//                 "lock": {
//                   "codeHash": "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248",
//                   "hashType": "type",
//                   "args": "0x020000000000000000000000000000000000000000000000000000000000000000000000"
//                 },
//                 "type": {
//                   "codeHash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
//                   "hashType": "type",
//                   "args": "0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1"
//                 },
//                 "capacity": "0x5e9f53e00"
//               }
//             ],
//               "outputsData": [
//                 "0x00ab9041000000000000000000000000",
//                 "0x00974bc5020000000000000000000000"
//               ],
//                 "witnesses": [
//                   "0xFF"
//                 ]
//   },
//   "commitment": "d8895616f3e2898825d0e59657325178266149b6442818e5c869c63bf81337e6",
//     "needPaymasterCell": true,
//       "sumInputsCapacity": "0x5e9f53e00"
// }
// toBtcAddress = tb1pmmv2f6pytg3uf2kv2zj2l5pu8hshv0t58n529xfw7f83dset20kqd93kgu
// btcAddress = tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl
// Waiting for BTC tx and proof to be ready
// ResponseException[Error]: { "code": -301, "message": "TransactionFailedToResolve: Resolve failed Unknown(OutPoint(0x9d890db4c483b48884f10bcacdae58d26a9c164b154c66690e97b392fde5355302000000))", "data": "Resolve(Unknown(OutPoint(0x9d890db4c483b48884f10bcacdae58d26a9c164b154c66690e97b392fde5355302000000)))" }
// at / Users/**/Desktop / project / blockchain / ckb / rgbpp - sdk / node_modules /.pnpm / @nervosnetwork + ckb - sdk - rpc@0.109.1 / node_modules / @nervosnetwork / ckb - sdk - rpc / src / method.ts: 43: 15
//     at processTicksAndRejections(node: internal / process / task_queues: 95: 5) {
//   code: 204
// }

// 4.2 
// npx ts - node examples / rgbpp / local / 2 - btc - transfer.ts
// ckb address: ckt1qyq8dmrgx20k9900fjzsjas3ts5jd5sss29suvrp5f
// btc address: tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl
// {
//   "ckbRawTx": {
//     "version": "0x0",
//       "cellDeps": [
//         {
//           "outPoint": {
//             "txHash": "0xf1de59e973b85791ec32debbba08dff80c63197e895eb95d67fc1e9f6b413e00",
//             "index": "0x0"
//           },
//           "depType": "code"
//         },
//         {
//           "outPoint": {
//             "txHash": "0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f",
//             "index": "0x0"
//           },
//           "depType": "code"
//         },
//         {
//           "outPoint": {
//             "txHash": "0xf1de59e973b85791ec32debbba08dff80c63197e895eb95d67fc1e9f6b413e00",
//             "index": "0x1"
//           },
//           "depType": "code"
//         },
//         {
//           "outPoint": {
//             "txHash": "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
//             "index": "0x0"
//           },
//           "depType": "depGroup"
//         }
//       ],
//         "headerDeps": [],
//           "inputs": [
//             {
//               "previousOutput": {
//                 "txHash": "0x9fc189c2453109a056f0d59b0f86d0fa84ae16d1f37230e88c71a760987fc687",
//                 "index": "0x0"
//               },
//               "since": "0x0"
//             }
//           ],
//             "outputs": [
//               {
//                 "lock": {
//                   "codeHash": "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248",
//                   "hashType": "type",
//                   "args": "0x010000000000000000000000000000000000000000000000000000000000000000000000"
//                 },
//                 "type": {
//                   "codeHash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
//                   "hashType": "type",
//                   "args": "0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1"
//                 },
//                 "capacity": "0x5e9f53e00"
//               },
//               {
//                 "lock": {
//                   "codeHash": "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248",
//                   "hashType": "type",
//                   "args": "0x020000000000000000000000000000000000000000000000000000000000000000000000"
//                 },
//                 "type": {
//                   "codeHash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
//                   "hashType": "type",
//                   "args": "0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1"
//                 },
//                 "capacity": "0x5e9f53e00"
//               }
//             ],
//               "outputsData": [
//                 "0x00aea68f020000000000000000000000",
//                 "0x00943577000000000000000000000000"
//               ],
//                 "witnesses": [
//                   "0xFF"
//                 ]
//   },
//   "commitment": "5318bdb00f8f12bcaed9ad9d3bdc97dbb1474d7c3bd2325f83ab2291bd52f9b1",
//     "needPaymasterCell": true,
//       "sumInputsCapacity": "0x5e9f53e00"
// }




// toBtcAddress = tb1pmmv2f6pytg3uf2kv2zj2l5pu8hshv0t58n529xfw7f83dset20kqd93kgu
// btcAddress = tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl
// Waiting for BTC tx and proof to be ready
// rgbppApiSpvProof[object Object]
// ResponseException[Error]: { "code": -1108, "message": "PoolRejectedMalformedTransaction: Malformed Overflow transaction", "data": "Malformed(\"Overflow\", \"expect (outputs capacity) <= (inputs capacity)\")" }
// at / Users / zhangtao / Desktop / project / blockchain / ckb / rgbpp - sdk / node_modules /.pnpm / @nervosnetwork + ckb - sdk - rpc@0.109.1 / node_modules / @nervosnetwork / ckb - sdk - rpc / src / method.ts: 43: 15
//     at processTicksAndRejections(node: internal / process / task_queues: 95: 5) {
//   code: 204
// }

// 5.一笔leapin的交易成功后 ，btc持有了 RGB++资产。 这是 如果进行转账Rgb++资产，先发送了 btc交易成功了，但是 之后的ckb交易失败了，这时候原本绑定资产的utxo已经交易被销毁了，那么这时候是否说 ，这部分rgb资产就相当于被销毁了，因为utxo已经无法使用来解锁。
