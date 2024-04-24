import { AddressPrefix, privateKeyToAddress, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import {
  Collector,
  buildRgbppLockArgs,
  genBtcTransferCkbVirtualTx,
} from '@rgbpp-sdk/ckb';
import { sendRgbppUtxos, DataSource, ECPair, bitcoin, NetworkType } from '@rgbpp-sdk/btc';
import { BtcAssetsApi } from '@rgbpp-sdk/service';

// CKB SECP256K1 private key
// const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000009';
// BTC SECP256K1 private key
// const BTC_TEST_PRIVATE_KEY = '0000000000000000000000000000000000000000000000000000000000000001';

//tb1qp05v86s8877ncw4ck3jqmd7elqrxyu0jj2rver的私钥
// const BTC_TEST_PRIVATE_KEY = '41bf020676a1d94c82116b285fe8c15120dbb902d2ecaf88774aeca602960ae8';
//tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl的私钥
const BTC_TEST_PRIVATE_KEY = '20339278b0184ecf7c94818f8eac09d9a60155f2f7d3b8c94ed330f51239b723';

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
  // const fromLock = addressToScript(ckbAddress);

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

  const ckbVirtualTxResult = await genBtcTransferCkbVirtualTx({
    collector,
    rgbppLockArgsList,
    xudtTypeBytes: serializeScript(xudtType),
    transferAmount,
    isMainnet,
  });
  console.log('ckbVirtualTxResult =  ', JSON.stringify(ckbVirtualTxResult, null, 2));
  const { commitment, ckbRawTx } = ckbVirtualTxResult;

  // Send BTC tx
  const psbt = await sendRgbppUtxos({
    ckbVirtualTx: ckbRawTx,
    commitment,
    tos: [toBtcAddress],
    ckbCollector: collector,
    from: btcAddress!,
    source,
  });
  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();

  const btcTx = psbt.extractTransaction();
  const { txid: btcTxId } = await service.sendBtcTransaction(btcTx.toHex());

  // const btcTxId = "fc26caf918795dc09dfd0e344bf6ab760ec5a46a3fb90d40ad2d6b789bf63085"
  console.log('BTC TxId: ', btcTxId);

  try {
    ///queue相比于local，应该是把等待btc的交易确认成功后，替换wintines后发送ckb的交易和到了一起
    await service.sendRgbppCkbTransaction({ btc_txid: btcTxId, ckb_virtual_result: ckbVirtualTxResult });
    const interval = setInterval(async () => {
      const { state, failedReason } = await service.getRgbppTransactionState(btcTxId);
      console.log('state', state);
      if (state === 'completed' || state === 'failed') {
        clearInterval(interval)
        if (state === 'completed') {
          const { txhash: txHash } = await service.getRgbppTransactionHash(btcTxId);
          console.info(`Rgbpp asset has been transferred on BTC and the related CKB tx hash is ${txHash}`);
        } else {
          console.warn(`Rgbpp CKB transaction failed and the reason is ${failedReason} `);
        }
      }
    }, 30 * 1000)
  } catch (error) {
    console.error(error)
  }
};


// Use your real BTC UTXO information on the BTC Testnet
// rgbppLockArgs: outIndexU32 + btcTxId
transferRgbppOnBtc({
  rgbppLockArgsList: [buildRgbppLockArgs(2, 'fc26caf918795dc09dfd0e344bf6ab760ec5a46a3fb90d40ad2d6b789bf63085')],
  toBtcAddress: 'tb1pmmv2f6pytg3uf2kv2zj2l5pu8hshv0t58n529xfw7f83dset20kqd93kgu',
  // toBtcAddress: 'tb1qvt7p9g6mw70sealdewtfp0sekquxuru6j3gwmt',
  // To simplify, keep the transferAmount the same as 2-ckb-jump-btc
  transferAmount: BigInt(150_0000_0000),
});

