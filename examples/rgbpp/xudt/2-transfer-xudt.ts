import { AddressPrefix, addressToScript, getTransactionSize, privateKeyToAddress } from '@nervosnetwork/ckb-sdk-utils';
import { getSecp256k1CellDep, Collector, NoLiveCellError, calculateUdtCellCapacity, MAX_FEE, MIN_CAPACITY, append0x, u128ToLe, getXudtDep, getUniqueTypeDep, SECP256K1_WITNESS_LOCK_SIZE, calculateTransactionFee, NoXudtLiveCellError, RGBPPConfig, btcTxIdFromBtcTimeLockArgs } from '@rgbpp-sdk/ckb';
import { XUDT_TOKEN_INFO } from './0-token-info';

// CKB SECP256K1 private key
// const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
//对应地址是ckt1qyq8dmrgx20k9900fjzsjas3ts5jd5sss29suvrp5f
const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000009';


interface TransferParams {
  xudtType: CKBComponents.Script,
  receivers: {
    toAddress: string;
    transferAmount: bigint;
  }[];
}

/**
 * transferXudt can be used to mint xUDT assets or transfer xUDT assets.
 * @param: xudtType The xUDT type script that comes from 1-issue-xudt
 * @param: receivers The receiver includes toAddress and transferAmount
 */
const transferXudt = async ({ xudtType, receivers }: TransferParams) => {
  const collector = new Collector({
    ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
    ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
  });
  const isMainnet = false;
  const fromAddress = privateKeyToAddress(CKB_TEST_PRIVATE_KEY, {
    prefix: isMainnet ? AddressPrefix.Mainnet : AddressPrefix.Testnet,
  });
  console.log('ckb address: ', fromAddress);

  const fromLock = addressToScript(fromAddress);

  const xudtCells = await collector.getCells({
    lock: fromLock,
    type: xudtType,
  });
  console.log('xudtCells = ', JSON.stringify(xudtCells, null, 2));
  if (!xudtCells || xudtCells.length === 0) {
    throw new NoXudtLiveCellError('The address has no xudt cells');
  }
  const sumTransferAmount = receivers
    .map((receiver) => receiver.transferAmount)
    .reduce((prev, current) => prev + current, BigInt(0));

  let {
    inputs,
    sumInputsCapacity: sumXudtInputsCapacity,
    sumAmount,
  } = collector.collectUdtInputs({
    liveCells: xudtCells,
    needAmount: sumTransferAmount,
  });
  console.log(`inputs = ${JSON.stringify(inputs, null, 2)}',\n
   sumXudtInputsCapacityCKB = ${sumXudtInputsCapacity} \n
  sumAmountXUDT = ${sumAmount} \n`);
  let actualInputsCapacity = sumXudtInputsCapacity;
  //xudt的capacity = 143 .  input 这个 xudt的 capacity也是143
  const xudtCapacity = calculateUdtCellCapacity(fromLock);
  const sumTransXudtNeedCapacity = xudtCapacity * BigInt(receivers.length);
  console.log('xudtCapacity = ', xudtCapacity);
  console.log('sumTransXudtNeedCapacity = ', sumTransXudtNeedCapacity);
  const outputs: CKBComponents.CellOutput[] = receivers.map((receiver) => ({
    lock: addressToScript(receiver.toAddress),
    type: xudtType,
    capacity: append0x(xudtCapacity.toString(16)),
  }));
  const outputsData = receivers.map((receiver) => append0x(u128ToLe(receiver.transferAmount)));

  let txFee = MAX_FEE;
  //坑爹原先这里是 <号,有bug
  if (sumXudtInputsCapacity <= sumTransXudtNeedCapacity) {
    const emptyCells = await collector.getCells({
      lock: fromLock,
    });
    console.log('emptyCells = ', JSON.stringify(emptyCells, null, 2));
    if (!emptyCells || emptyCells.length === 0) {
      throw new NoLiveCellError('The address has no empty cells');
    }
    const needCapacity = sumTransXudtNeedCapacity - sumXudtInputsCapacity + xudtCapacity;
    const { inputs: emptyInputs, sumInputsCapacity: sumEmptyCapacity } = collector.collectInputs(
      emptyCells,
      needCapacity,
      txFee,
      { minCapacity: MIN_CAPACITY },
    );
    inputs = [...inputs, ...emptyInputs];
    actualInputsCapacity += sumEmptyCapacity;
    console.log('sumEmptyCapacity = ', sumEmptyCapacity);
    console.log('actualInputsCapacity = ', actualInputsCapacity);
  }
  console.log(`actualInputsCapacity = ${actualInputsCapacity} , sumTransXudtNeedCapacity = ${sumTransXudtNeedCapacity}`);
  let changeCapacity = actualInputsCapacity - sumTransXudtNeedCapacity;
  console.log('before changeCapacity = \n', changeCapacity);


  //找零output
  if (sumAmount > sumTransferAmount) {
    outputs.push({
      lock: fromLock,
      type: xudtType,
      capacity: append0x(xudtCapacity.toString(16)),
    });
    outputsData.push(append0x(u128ToLe(sumAmount - sumTransferAmount)));
    changeCapacity -= xudtCapacity;
  }
  console.log('changeCapacity = \n', append0x(changeCapacity.toString(16)));
  outputs.push({
    lock: fromLock,
    type: xudtType,
    capacity: append0x(changeCapacity.toString(16)),
  });
  outputsData.push('0x');

  const emptyWitness = { lock: '', inputType: '', outputType: '' };
  const witnesses = inputs.map((_, index) => (index === 0 ? emptyWitness : '0x'));

  const cellDeps = [getSecp256k1CellDep(isMainnet), getUniqueTypeDep(isMainnet), getXudtDep(isMainnet)];

  const unsignedTx = {
    version: '0x0',
    cellDeps,
    headerDeps: [],
    inputs,
    outputs,
    outputsData,
    witnesses,
  };
  console.log('unsignedTx = \n', JSON.stringify(unsignedTx, null, 2));
  if (txFee === MAX_FEE) {
    const txSize = getTransactionSize(unsignedTx) + SECP256K1_WITNESS_LOCK_SIZE;
    const estimatedTxFee = calculateTransactionFee(txSize);
    changeCapacity -= estimatedTxFee;
    unsignedTx.outputs[unsignedTx.outputs.length - 1].capacity = append0x(changeCapacity.toString(16));
  }

  const signedTx = collector.getCkb().signTransaction(CKB_TEST_PRIVATE_KEY)(unsignedTx);
  const txHash = await collector.getCkb().rpc.sendTransaction(signedTx, 'passthrough');

  console.info(`xUDT asset has been minted or transferred and tx hash is ${txHash}`);
};


transferXudt({
  // The xudtType comes from 1-issue-xudt
  // xudtType: {
  //   codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
  //   hashType: 'type',
  //   args: '0x562e4e8a2f64a3e9c24beb4b7dd002d0ad3b842d0cc77924328e36ad114e3ebe',
  // },
  //cat不行
  // xudtType: {
  //   codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
  //   hashType: 'type',
  //   args: '0x378c9f798aa43c44759428bc4a3a9f83d3fbd9baf6c95b1e9d17dd13f68fc91c',
  // },
  // https://pudge.explorer.nervos.org/transaction/0xb1a6ea5143e8a677ed2eeb9552fcc24188ac58fafd616be2fe921aa112115276?page_of_outputs=0
  //0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1

  //gat
  xudtType: {
    codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
    hashType: 'type',
    args: '0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1',
  },
  //这个可以转出 llj
  // xudtType: {
  //   codeHash: '0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb',
  //   hashType: 'type',
  //   args: '0x0b1bae4beaf456349c63c3ce67491fc75a1276d7f9eedd7ea84d6a77f9f3f5f7',
  // },
  receivers: [
    // {
    //   toAddress: 'ckt1qyq8dmrgx20k9900fjzsjas3ts5jd5sss29suvrp5f',
    //   transferAmount: BigInt(10000) * BigInt(10 ** XUDT_TOKEN_INFO.decimal),
    // },
    {
      toAddress: 'ckt1qyq829u0x32fchlfe5dqc4awh5q70h0eyj0qh8ngj4',
      transferAmount: BigInt(1000) * BigInt(10 ** XUDT_TOKEN_INFO.decimal),
    },
    // {
    //   toAddress: 'ckt1qyq829u0x32fchlfe5dqc4awh5q70h0eyj0qh8ngj4',
    //   transferAmount: BigInt(2000) * BigInt(10 ** XUDT_TOKEN_INFO.decimal),
    // },

    // {
    //   toAddress: 'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqxz5wf8kuxhnmg33dy6eylg0n7xpkl6z7yjr3sff',
    //   transferAmount: BigInt(100000) * BigInt(10 ** XUDT_TOKEN_INFO.decimal),
    // },
  ],
});

