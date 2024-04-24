import { AddressPrefix, privateKeyToAddress, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import { genCkbJumpBtcVirtualTx, Collector, getSecp256k1CellDep, buildRgbppLockArgs } from '@rgbpp-sdk/ckb';

// // CKB SECP256K1 private key
// const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
//ckt1qyq8dmrgx20k9900fjzsjas3ts5jd5sss29suvrp5f = ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqtka35r98mzjhh5epgfwcg4c2fx6ggg9zcz2f9mz
const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000009';

const jumpFromCkbToBtc = async ({ outIndex, btcTxId }: { outIndex: number; btcTxId: string }) => {
  const collector = new Collector({
    ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
    ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
  });
  const isMainnet = false;
  const address = privateKeyToAddress(CKB_TEST_PRIVATE_KEY, {
    prefix: isMainnet ? AddressPrefix.Mainnet : AddressPrefix.Testnet,
  });
  console.log('ckb address: ', address);

  const toRgbppLockArgs = buildRgbppLockArgs(outIndex, btcTxId);

  // const xudtType: CKBComponents.Script = {
  //   codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
  //   hashType: 'type',
  //   args: '0x1ba116c119d1cfd98a53e9d1a615cf2af2bb87d95515c9d217d367054cfc696b',
  // };

  //gat xudt
  const xudtType: CKBComponents.Script = {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    hashType: 'type',
    args: '0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1',
  };


  const ckbRawTx = await genCkbJumpBtcVirtualTx({
    collector,
    fromCkbAddress: address,
    toRgbppLockArgs,
    xudtTypeBytes: serializeScript(xudtType),
    transferAmount: BigInt(150_0000_0000),
    witnessLockPlaceholderSize: 1000
  });

  const emptyWitness = { lock: '', inputType: '', outputType: '' };
  let unsignedTx: CKBComponents.RawTransactionToSign = {
    ...ckbRawTx,
    cellDeps: [...ckbRawTx.cellDeps, getSecp256k1CellDep(false)],
    witnesses: [emptyWitness, ...ckbRawTx.witnesses.slice(1)],
  };

  const signedTx = collector.getCkb().signTransaction(CKB_TEST_PRIVATE_KEY)(unsignedTx);

  let txHash = await collector.getCkb().rpc.sendTransaction(signedTx, 'passthrough');
  console.info(`Rgbpp asset has been jumped from CKB to BTC and tx hash is ${txHash}`);
};

// Use your real BTC UTXO information on the BTC Testnet
jumpFromCkbToBtc({
  outIndex: 1,
  btcTxId: 'c55b6951583a852e91838d4f17e6e28a36fe889c77c2b3819d0d33ff47c0ae5d',
});

