import { AddressPrefix, privateKeyToAddress, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
  Collector,
  genBtcJumpCkbVirtualTx,
  buildRgbppLockArgs,
  genBtcTimeLockScript,
  Script
} from '@rgbpp-sdk/ckb';
import {
  sendRgbppUtxos,
  DataSource,
  NetworkType,
  bitcoin,
  ECPair,
} from '@rgbpp-sdk/btc';
import { BtcAssetsApi } from '@rgbpp-sdk/service'
import { addressToScript, getTransactionSize } from '@nervosnetwork/ckb-sdk-utils';

// CKB SECP256K1 private key
// const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000009';
// BTC SECP256K1 private key
// const BTC_TEST_PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
// //tb1qp05v86s8877ncw4ck3jqmd7elqrxyu0jj2rver的私钥
// const BTC_TEST_PRIVATE_KEY = '41bf020676a1d94c82116b285fe8c15120dbb902d2ecaf88774aeca602960ae8';

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
const BTC_ASSETS_ORIGIN = 'https:btc-assets-api.testnet.mibao.pro';

interface Params {
  rgbppLockArgsList: string[];
  toCkbAddress: string;
  transferAmount: bigint;
}
const jumpFromBtcToCkb = async ({ rgbppLockArgsList, toCkbAddress, transferAmount }: Params) => {
  const collector = new Collector({
    ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
    ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
  });
  const isMainnet = false;
  const address = privateKeyToAddress(CKB_TEST_PRIVATE_KEY, {
    prefix: isMainnet ? AddressPrefix.Mainnet : AddressPrefix.Testnet,
  });
  console.log('ckb address: ', address);

  const network = isMainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const keyPair = ECPair.fromPrivateKey(Buffer.from(BTC_TEST_PRIVATE_KEY, 'hex'), { network });
  const { address: btcAddress } = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });
  console.log('btc address: ', btcAddress);

  const networkType = isMainnet ? NetworkType.MAINNET : NetworkType.TESTNET;
  const service = BtcAssetsApi.fromToken(BTC_ASSETS_API_URL, BTC_ASSETS_TOKEN, BTC_ASSETS_ORIGIN);
  const source = new DataSource(service, networkType);

  // const xudtType: CKBComponents.Script = {
  //   codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
  //   hashType: 'type',
  //   args: '0x1ba116c119d1cfd98a53e9d1a615cf2af2bb87d95515c9d217d367054cfc696b',
  // };
  // const toLock = addressToScript(toCkbAddress);
  // console.log(JSON.stringify(toLock, null, 2))
  // // const ss = genBtcTimeLockScript(toLock, isMainnet);
  // const stolock = serializeScript(toLock);
  // const sunpakctolock = Script.unpack(stolock);
  // console.log(JSON.stringify(stolock, null, 2))
  // console.log(JSON.stringify(sunpakctolock, null, 2))

  // const sunpakcxudtType = serializeScript(xudtType);
  // console.log(JSON.stringify(sunpakcxudtType, null, 2))

  const ckbVirtualTxResult = await genBtcJumpCkbVirtualTx({
    collector,
    rgbppLockArgsList,
    xudtTypeBytes: serializeScript(xudtType),
    transferAmount,
    toCkbAddress,
    isMainnet,
  });
  console.log(JSON.stringify(ckbVirtualTxResult, null, 2))
  const { commitment, ckbRawTx } = ckbVirtualTxResult;

  // Send BTC tx
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    commitment,
    tos: [btcAddress!],
    ckbCollector: collector,
    from: btcAddress!,
    source,
  });
  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();

  const btcTx = psbt.extractTransaction();
  const { txid: btcTxId } = await service.sendBtcTransaction(btcTx.toHex());

  console.log('BTC TxId: ', btcTxId);

  try {
    await service.sendRgbppCkbTransaction({ btc_txid: btcTxId, ckb_virtual_result: ckbVirtualTxResult });
    const interval = setInterval(async () => {
      const { state, failedReason } = await service.getRgbppTransactionState(btcTxId);
      console.log('state', state);
      if (state === 'completed' || state === 'failed') {
        clearInterval(interval);
        if (state === 'completed') {
          const { txhash: txHash } = await service.getRgbppTransactionHash(btcTxId);
          console.info(`Rgbpp asset has been jumped from BTC to CKB and the related CKB tx hash is ${txHash}`);
        } else {
          console.warn(`Rgbpp CKB transaction failed and the reason is ${failedReason} `);
        }
      }
    }, 30 * 1000);
  } catch (error) {
    console.error(error);
  }
};

// rgbppLockArgs: outIndexU32 + btcTxId
jumpFromBtcToCkb({
  // If the `3-btc-transfer.ts` has been executed, the BTC txId should be the new generated BTC txId by the `3-btc-transfer.ts`
  // Otherwise the BTC txId should be same as the the BTC txId of the `2-ckb-jump-btc.ts`
  rgbppLockArgsList: [buildRgbppLockArgs(2, '4d63f7e7ec3704bfa9a07395de274223c3c7b7b9a160406d10c1b4cbd565fd9f')],
  toCkbAddress: 'ckt1qyq8dmrgx20k9900fjzsjas3ts5jd5sss29suvrp5f',
  // To simplify, keep the transferAmount the same as 2-ckb-jump-btc
  transferAmount: BigInt(150_0000_0000),
});

