import { AddressPrefix, privateKeyToAddress, serializeScript } from '@nervosnetwork/ckb-sdk-utils';
import { genCkbJumpBtcVirtualTx, Collector, getSecp256k1CellDep, buildRgbppLockArgs } from '@rgbpp-sdk/ckb';

// CKB SECP256K1 private key
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
  console.log(`ckbRawTx = \n ${JSON.stringify(ckbRawTx, null, 2)}`);

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
// jumpFromCkbToBtc({
//   outIndex: 0,
//   btcTxId: 'bef3e7aef40fb620580fd7d693444e1fef3ffb1828931fa287c1ddc91f7c3cef',
// });




jumpFromCkbToBtc({
  outIndex: 1,
  btcTxId: '0da21986bfa46b38f903c3d9aac9bdb56a23e090369747d04abc7adcf505f760',
});

//已使用
// jumpFromCkbToBtc({
//   outIndex: 3,
//   btcTxId: 'f7946882866c29e6772497b2a44da99b67d13cce313a2719e6cc8889e85b6f4f',
// });
//已使用
// jumpFromCkbToBtc({
//   outIndex: 3,
//   btcTxId: '401c17aed89864341fb8f8745dce82e8d8587b77c5ecb42a5ed404a675a09fe2',
// });
//已使用
// jumpFromCkbToBtc({
//   outIndex: 0,
//   btcTxId: '7943fd61748cea7275cacc1f87bbe23594404860ffde5c3863f2f5e78647aa07',
// });
// //已使用
// jumpFromCkbToBtc({
//   outIndex: 1,
//   btcTxId: '1af8356d09ac67b6cb922dafee1074a39143d69c520034523538834e88354221',
// });
//已使用
// jumpFromCkbToBtc({
//   outIndex: 1,
//   btcTxId: '7adba17bc62a425cd0af306e6ee3cd7f3bb6c4a0fa5907f7a929496dbdb02549',
// });


// tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl
//bef3e7aef40fb620580fd7d693444e1fef3ffb1828931fa287c1ddc91f7c3cef  0 


//84150a285b9b8d9083981e8bbdf89a25e95ab11801abc749b0d5f44ded20dbb0是tb1qp05v86s8877ncw4ck3jqmd7elqrxyu0jj2rver的交易


// ckb address:  ckt1qyq8dmrgx20k9900fjzsjas3ts5jd5sss29suvrp5f
// Rgbpp asset has been jumped from CKB to BTC and tx hash is 0x88f538285763c8ba6768ebaf920861c8d24ff96cf32c347909abca765895eac3





// https://mempool.space/zh/testnet/address/tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl 底下的65ade开头交易index2绑定定了天天transfer 2-1 的150个币，fc开头交易就是btc-btc的交易，并完成了。 fc26交易index2 又2-1的币，对应的ckb交易是https://pudge.explorer.nervos.org/transaction/0x389dc1da0d679d08acea31e979d5cdc32808492543dab6410684e07471608435 ，地址是ckt1qpsu57j8j6jwkxw2fuxsvh9ekyxaeuqz7y8hewupp3cxed4mtseysqgzqqqqppfs76dhs6ed44qqmwfld2jv2rnk40mykdqwlkwuqhterruu5fhuvsc05k。 现在这个utxo被用掉了 ，这个对应的rgb++资产也就挂了



