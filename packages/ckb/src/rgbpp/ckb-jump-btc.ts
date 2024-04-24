import { CkbBatchJumpBtcVirtualTxParams, CkbJumpBtcVirtualTxParams } from '../types/rgbpp';
import { blockchain } from '@ckb-lumos/base';
import { NoLiveCellError, NoXudtLiveCellError, TypeAssetNotSupportedError } from '../error';
import {
  append0x,
  calculateRgbppCellCapacity,
  calculateTransactionFee,
  calculateUdtCellCapacity,
  isTypeAssetSupported,
  u128ToLe,
} from '../utils';
import { genRgbppLockScript } from '../utils/rgbpp';
import { MAX_FEE, MIN_CAPACITY, RGBPP_TX_WITNESS_MAX_SIZE, getXudtDep } from '../constants';
import { addressToScript, getTransactionSize } from '@nervosnetwork/ckb-sdk-utils';

/**
 * Generate the virtual ckb transaction for the jumping tx from CKB to BTC
 * @param collector The collector that collects CKB live cells and transactions
 * @param xudtTypeBytes The serialized hex string of the XUDT type script
 * @param fromCkbAddress The from ckb address who will use his private key to sign the ckb tx
 * @param toRgbppLockArgs The receiver rgbpp lock script args whose data structure is: out_index | bitcoin_tx_id
 * @param transferAmount The XUDT amount to be transferred
 * @param witnessLockPlaceholderSize The WitnessArgs.lock placeholder bytes array size and the default value is 5000
 * @param ckbFeeRate The CKB transaction fee rate, default value is 1100
 * @param isMainnet
 */
export const genCkbJumpBtcVirtualTx = async ({
  collector,
  xudtTypeBytes,
  fromCkbAddress,
  //return `0x${u32ToLe(outIndex)}${remove0x(reverseHex(btcTxId))}`
  toRgbppLockArgs,
  transferAmount,
  witnessLockPlaceholderSize,
  ckbFeeRate,
}: CkbJumpBtcVirtualTxParams): Promise<CKBComponents.RawTransaction> => {
  const isMainnet = fromCkbAddress.startsWith('ckb');
  const xudtType = blockchain.Script.unpack(xudtTypeBytes) as CKBComponents.Script;
  if (!isTypeAssetSupported(xudtType, isMainnet)) {
    throw new TypeAssetNotSupportedError('The type script asset is not supported now');
  }

  const fromLock = addressToScript(fromCkbAddress);

  const xudtCells = await collector.getCells({ lock: fromLock, type: xudtType });
  if (!xudtCells || xudtCells.length === 0) {
    throw new NoXudtLiveCellError('No rgbpp cells found with the xudt type script and the rgbpp lock args');
  }

  let { inputs, sumInputsCapacity, sumAmount } = collector.collectUdtInputs({
    liveCells: xudtCells,
    needAmount: transferAmount,
  });

  const rpbppCellCapacity = calculateRgbppCellCapacity(xudtType);
  const outputsData = [append0x(u128ToLe(transferAmount))];

  const outputs: CKBComponents.CellOutput[] = [
    {
      //return `0x${u32ToLe(outIndex)}${remove0x(reverseHex(btcTxId))}84150a285b9b8d9083981e8bbdf89a25e95ab11801abc749b0d5f44ded20dbb0逆序 再加index = 0x02000000b0db20ed4df4d5b049c7ab0118b15ae9259af8bd8b1e9883908d9b5b280a1584`

      lock: genRgbppLockScript(toRgbppLockArgs, isMainnet),
      type: xudtType,
      capacity: append0x(rpbppCellCapacity.toString(16)),
    },
  ];

  let txFee = MAX_FEE;
  const xudtCellCapacity = calculateUdtCellCapacity(fromLock, xudtType);
  if (sumInputsCapacity < xudtCellCapacity + rpbppCellCapacity + MIN_CAPACITY + txFee) {
    const emptyCells = await collector.getCells({ lock: fromLock });
    if (!emptyCells || emptyCells.length === 0) {
      throw new NoLiveCellError('The address has no empty cells');
    }
    const { inputs: emptyInputs, sumInputsCapacity: sumEmptyCapacity } = collector.collectInputs(
      emptyCells,
      rpbppCellCapacity,
      txFee,
    );
    inputs = [...emptyInputs, ...inputs];
    sumInputsCapacity += sumEmptyCapacity;
  }

  let changeCapacity = sumInputsCapacity - rpbppCellCapacity - txFee;
  if (sumAmount > transferAmount) {
    outputs.push({
      lock: fromLock,
      type: xudtType,
      capacity: append0x(xudtCellCapacity.toString(16)),
    });
    outputsData.push(append0x(u128ToLe(sumAmount - transferAmount)));
    changeCapacity -= xudtCellCapacity;
  }
  outputs.push({
    lock: fromLock,
    capacity: append0x(changeCapacity.toString(16)),
  });
  outputsData.push('0x');

  const cellDeps = [getXudtDep(isMainnet)];
  const witnesses = inputs.map((_) => '0x');

  const ckbRawTx: CKBComponents.RawTransaction = {
    version: '0x0',
    cellDeps,
    headerDeps: [],
    inputs,
    outputs,
    outputsData,
    witnesses,
  };

  if (txFee === MAX_FEE) {
    const txSize = getTransactionSize(ckbRawTx) + (witnessLockPlaceholderSize ?? RGBPP_TX_WITNESS_MAX_SIZE);
    const estimatedTxFee = calculateTransactionFee(txSize, ckbFeeRate);
    const estimatedChangeCapacity = changeCapacity + (MAX_FEE - estimatedTxFee);
    ckbRawTx.outputs[ckbRawTx.outputs.length - 1].capacity = append0x(estimatedChangeCapacity.toString(16));
  }

  return ckbRawTx;
};

/**
 * Generate a virtual ckb transaction to realize a batch jump of assets from CKB to BTC
 * @param collector The collector that collects CKB live cells and transactions
 * @param xudtTypeBytes The serialized hex string of the XUDT type script
 * @param fromCkbAddress The from ckb address who will use his private key to sign the ckb tx
 * @param rgbppReceivers The rgbpp receiver list which include toRgbppLockArgs and transferAmount
 * @param witnessLockPlaceholderSize The WitnessArgs.lock placeholder bytes array size and the default value is 5000
 * @param ckbFeeRate The CKB transaction fee rate, default value is 1100
 * @param isMainnet
 */
export const genCkbBatchJumpBtcVirtualTx = async ({
  collector,
  xudtTypeBytes,
  fromCkbAddress,
  rgbppReceivers,
  witnessLockPlaceholderSize,
  ckbFeeRate,
}: CkbBatchJumpBtcVirtualTxParams): Promise<CKBComponents.RawTransaction> => {
  const isMainnet = fromCkbAddress.startsWith('ckb');
  const xudtType = blockchain.Script.unpack(xudtTypeBytes) as CKBComponents.Script;
  if (!isTypeAssetSupported(xudtType, isMainnet)) {
    throw new TypeAssetNotSupportedError('The type script asset is not supported now');
  }

  const fromLock = addressToScript(fromCkbAddress);

  const xudtCells = await collector.getCells({ lock: fromLock, type: xudtType });
  if (!xudtCells || xudtCells.length === 0) {
    throw new NoXudtLiveCellError('No rgbpp cells found with the xudt type script and the rgbpp lock args');
  }

  const sumTransferAmount = rgbppReceivers
    .map((receiver) => receiver.transferAmount)
    .reduce((prev, current) => prev + current, BigInt(0));

  let { inputs, sumInputsCapacity, sumAmount } = collector.collectUdtInputs({
    liveCells: xudtCells,
    needAmount: sumTransferAmount,
  });

  const rpbppCellCapacity = calculateRgbppCellCapacity(xudtType);
  const sumRgbppCellCapacity = rpbppCellCapacity * BigInt(rgbppReceivers.length);
  const outputs: CKBComponents.CellOutput[] = rgbppReceivers.map((receiver) => ({
    lock: genRgbppLockScript(receiver.toRgbppLockArgs, isMainnet),
    type: xudtType,
    capacity: append0x(rpbppCellCapacity.toString(16)),
  }));
  const outputsData = rgbppReceivers.map((receiver) => append0x(u128ToLe(receiver.transferAmount)));

  let txFee = MAX_FEE;
  const xudtCellCapacity = calculateUdtCellCapacity(fromLock, xudtType);
  if (sumInputsCapacity < xudtCellCapacity + sumRgbppCellCapacity + MIN_CAPACITY + txFee) {
    const emptyCells = await collector.getCells({ lock: fromLock });
    if (!emptyCells || emptyCells.length === 0) {
      throw new NoLiveCellError('The address has no empty cells');
    }
    const { inputs: emptyInputs, sumInputsCapacity: sumEmptyCapacity } = collector.collectInputs(
      emptyCells,
      rpbppCellCapacity,
      txFee,
    );
    inputs = [...emptyInputs, ...inputs];
    sumInputsCapacity += sumEmptyCapacity;
  }

  let changeCapacity = sumInputsCapacity - sumRgbppCellCapacity - txFee;
  if (sumAmount > sumTransferAmount) {
    outputs.push({
      lock: fromLock,
      type: xudtType,
      capacity: append0x(xudtCellCapacity.toString(16)),
    });
    outputsData.push(append0x(u128ToLe(sumAmount - sumTransferAmount)));
    changeCapacity -= xudtCellCapacity;
  }
  outputs.push({
    lock: fromLock,
    capacity: append0x(changeCapacity.toString(16)),
  });
  outputsData.push('0x');

  const cellDeps = [getXudtDep(isMainnet)];
  const witnesses = inputs.map((_) => '0x');

  const ckbRawTx: CKBComponents.RawTransaction = {
    version: '0x0',
    cellDeps,
    headerDeps: [],
    inputs,
    outputs,
    outputsData,
    witnesses,
  };

  if (txFee === MAX_FEE) {
    const txSize = getTransactionSize(ckbRawTx) + (witnessLockPlaceholderSize ?? RGBPP_TX_WITNESS_MAX_SIZE);
    const estimatedTxFee = calculateTransactionFee(txSize, ckbFeeRate);
    const estimatedChangeCapacity = changeCapacity + (MAX_FEE - estimatedTxFee);
    ckbRawTx.outputs[ckbRawTx.outputs.length - 1].capacity = append0x(estimatedChangeCapacity.toString(16));
  }

  return ckbRawTx;
};

// {
//   "version": "0x0",
//   "cellDeps": [
//     {
//       "outPoint": {
//         "txHash": "0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f",
//         "index": "0x0"
//       },
//       "depType": "code"
//     }
//   ],
//   "headerDeps": [],
//   "inputs": [
//     {
//       "previousOutput": {
//         "txHash": "0xea01cd5221612da1ee70aef6feab6b89d0fe37da83ee49a38df4c63219e50c40",
//         "index": "0x2"
//       },
//       "since": "0x0"
//     },
//     {
//       "previousOutput": {
//         "txHash": "0xea01cd5221612da1ee70aef6feab6b89d0fe37da83ee49a38df4c63219e50c40",
//         "index": "0x1"
//       },
//       "since": "0x0"
//     }
//   ],
//   "outputs": [
//     {
//       "lock": {
//         "codeHash": "0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248",
//         "hashType": "type",
//         "args": "0x02000000b0db20ed4df4d5b049c7ab0118b15ae9259af8bd8b1e9883908d9b5b280a1584"
//       },
//       "type": {
//         "codeHash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
//         "hashType": "type",
//         "args": "0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1"
//       },
//       "capacity": "0x5e9f53e00"
//     },
//     {
//       "lock": {
//         "codeHash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
//         "hashType": "type",
//         "args": "0x76ec68329f6295ef4c850976115c2926d210828b"
//       },
//       "type": {
//         "codeHash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb",
//         "hashType": "type",
//         "args": "0xedade1e77f5bfc97fe7c3db081850d363c7539e75242f1f883e7ed49d4cf5bc1"
//       },
//       "capacity": "0x35458af00"
//     },
//     {
//       "lock": {
//         "codeHash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
//         "hashType": "type",
//         "args": "0x76ec68329f6295ef4c850976115c2926d210828b"
//       },
//       "capacity": "0x4c22b7c9ee"
//     }
//   ],
//   "outputsData": [
//     "0x00aea68f020000000000000000000000",
//     "0x00782c141b7507000000000000000000",
//     "0x"
//   ],
//   "witnesses": [
//     "0x",
//     "0x"
//   ]
// }
