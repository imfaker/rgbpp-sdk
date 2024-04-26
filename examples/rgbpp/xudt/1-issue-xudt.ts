import { AddressPrefix, addressToScript, getTransactionSize, privateKeyToAddress, scriptToHash } from '@nervosnetwork/ckb-sdk-utils';
import { getSecp256k1CellDep, Collector, NoLiveCellError, calculateUdtCellCapacity, MAX_FEE, MIN_CAPACITY, getXudtTypeScript, append0x, getUniqueTypeScript, u128ToLe, encodeRgbppTokenInfo, getXudtDep, getUniqueTypeDep, SECP256K1_WITNESS_LOCK_SIZE, calculateTransactionFee, generateUniqueTypeArgs } from '@rgbpp-sdk/ckb';
import { calculateXudtTokenInfoCellCapacity } from '@rgbpp-sdk/ckb/src/utils';
import { XUDT_TOKEN_INFO } from './0-token-info';

// CKB SECP256K1 private key
// const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
const CKB_TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000009';
//ckt1qyq8dmrgx20k9900fjzsjas3ts5jd5sss29suvrp5f

/**
 * issueXudt can be used to issue xUDT assets with unique cell as token info cell.
 * @param: xudtTotalAmount The xudtTotalAmount specifies the total amount of asset issuance
 */
const issueXudt = async ({ xudtTotalAmount }: { xudtTotalAmount: bigint }) => {
  const collector = new Collector({
    ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
    ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
  });
  const isMainnet = false;
  const issueAddress = privateKeyToAddress(CKB_TEST_PRIVATE_KEY, {
    prefix: isMainnet ? AddressPrefix.Mainnet : AddressPrefix.Testnet,
  });

  // const issueAddress = "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2t6cpnyydhvrmumnjema4txyeaxt9vjsg0xjyju"
  // const issueAddress = "ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqqxz5wf8kuxhnmg33dy6eylg0n7xpkl6z7yjr3sff"
  console.log('ckb address: ', issueAddress);

  const issueLock = addressToScript(issueAddress);

  const emptyCells = await collector.getCells({
    lock: issueLock,
  });
  if (!emptyCells || emptyCells.length === 0) {
    throw new NoLiveCellError('The address has no empty cells');
  }

  const xudtCapacity = calculateUdtCellCapacity(issueLock);
  const xudtInfoCapacity = calculateXudtTokenInfoCellCapacity(XUDT_TOKEN_INFO, issueLock);

  let txFee = MAX_FEE;
  const { inputs, sumInputsCapacity } = collector.collectInputs(
    emptyCells,
    xudtCapacity + xudtInfoCapacity,
    txFee,
    { minCapacity: MIN_CAPACITY },
  );

  //xudt的type args就是发行人的脚本hash
  const xudtType: CKBComponents.Script = {
    ...getXudtTypeScript(isMainnet),
    args: append0x(scriptToHash(issueLock))
  }
  console.log('issueLock', issueLock)
  console.log('xUDT type script', xudtType)

  let changeCapacity = sumInputsCapacity - xudtCapacity - xudtInfoCapacity;
  const outputs: CKBComponents.CellOutput[] = [
    {
      lock: issueLock,
      type: xudtType,
      capacity: append0x(xudtCapacity.toString(16)),
    },
    {
      lock: issueLock,
      type: {
        ...getUniqueTypeScript(isMainnet),
        args: generateUniqueTypeArgs(inputs[0], 1)
      },
      capacity: append0x(xudtInfoCapacity.toString(16)),
    },
    {
      lock: issueLock,
      capacity: append0x(changeCapacity.toString(16)),
    },
  ];
  const totalAmount = xudtTotalAmount * BigInt(10 ** XUDT_TOKEN_INFO.decimal);
  const outputsData = [append0x(u128ToLe(totalAmount)), encodeRgbppTokenInfo(XUDT_TOKEN_INFO), '0x'];

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
  // console.info(`unsignedTx is ${JSON.stringify(unsignedTx)}`);
  if (txFee === MAX_FEE) {
    const txSize = getTransactionSize(unsignedTx) + SECP256K1_WITNESS_LOCK_SIZE;
    const estimatedTxFee = calculateTransactionFee(txSize);
    changeCapacity -= estimatedTxFee;
    unsignedTx.outputs[unsignedTx.outputs.length - 1].capacity = append0x(changeCapacity.toString(16));
  }

  const signedTx = collector.getCkb().signTransaction(CKB_TEST_PRIVATE_KEY)(unsignedTx);
  const txHash = await collector.getCkb().rpc.sendTransaction(signedTx, 'passthrough');

  console.info(`xUDT asset has been issued and tx hash is ${txHash}`);
};

issueXudt({ xudtTotalAmount: BigInt(2100_0000) });


// {
//   "version": "0x0",
//     "cellDeps": [{ "outPoint": { "txHash": "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37", "index": "0x0" }, "depType": "depGroup" }, { "outPoint": { "txHash": "0xff91b063c78ed06f10a1ed436122bd7d671f9a72ef5f5fa28d05252c17cf4cef", "index": "0x0" }, "depType": "code" }, { "outPoint": { "txHash": "0xbf6fb538763efec2a70a6a3dcb7242787087e1030c4e7d86585bc63a9d337f5f", "index": "0x0" }, "depType": "code" }],
//     "headerDeps": [],
//     "inputs": [{ "previousOutput": { "txHash": "0x09ef570c20c924141edb7617951e038b8b77910334b4b6563bc985c14547c055", "index": "0x3" }, "since": "0x0" }],
//       "outputs": [{ "lock": { "codeHash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8", "hashType": "type", "args": "0x75178f34549c5fe9cd1a0c57aebd01e7ddf9249e" }, "type": { "codeHash": "0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb", "hashType": "type", "args": "0x0b1bae4beaf456349c63c3ce67491fc75a1276d7f9eedd7ea84d6a77f9f3f5f7" }, "capacity": "0x35458af00" }, {
//         "lock": { "codeHash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8", "hashType": "type", "args": "0x75178f34549c5fe9cd1a0c57aebd01e7ddf9249e" },
//     "type": { "codeHash": "0x8e341bcfec6393dcd41e635733ff2dca00a6af546949f70c57a706c0f344df8b", "hashType": "type", "args": "0x0bd8eaac6cc86f40770aff54dd4c0d097fef17c4" }, "capacity": "0x324a9a700"
//   }, { "lock": { "codeHash": "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8", "hashType": "type", "args": "0x75178f34549c5fe9cd1a0c57aebd01e7ddf9249e" }, "capacity": "0x1aff87f56987" }],
//     "outputsData": ["0x0040075af07507000000000000000000", "0x080f58554454205465737420546f6b656e03585454", "0x"],
//     "witnesses": [{ "lock": "", "inputType": "", "outputType": "" }]
// }
