import { DataSource, NetworkType } from '@rgbpp-sdk/btc';
import { Collector } from '@rgbpp-sdk/ckb';
import { BtcAssetsApi, BtcAssetsApiError } from '@rgbpp-sdk/service';
import { Cell, blockchain } from '@ckb-lumos/base';
import { bytes } from '@ckb-lumos/';
// API docs: https://btc-assets-api.testnet.mibao.pro/docs
const BTC_ASSETS_API_URL = 'https://btc-assets-api.testnet.mibao.pro';
// https://btc-assets-api.testnet.mibao.pro/docs/static/index.html#/Token/post_token_generate
const BTC_ASSETS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJteS1hcHAiLCJhdWQiOiJidGMtYXNzZXRzLWFwaS50ZXN0bmV0Lm1pYmFvLnBybyIsImp0aSI6IjVjOWE5YzUzLTRmZjQtNDEyYi1iZTU0LTZmYTMzMmNiZjk2YSIsImlhdCI6MTcxMzQyNzgyOH0.9awJlqeh2l6XuW4eJ1OA0zccAaTcHY4iVftofB068Qk';

const BTC_ASSETS_ORIGIN = 'https:btc-assets-api.testnet.mibao.pro';


const service = BtcAssetsApi.fromToken(BTC_ASSETS_API_URL, BTC_ASSETS_TOKEN, BTC_ASSETS_ORIGIN);


//最老的开始
export const findSuitablUnspentUtxoForCKBJumpBTC = async (address: string) => {
    const utxos = await service.getBtcUtxos(address, {
        only_confirmed: true,
        min_satoshi: undefined
    })
    utxos.sort((a, b) => { return a.status.block_height > b.status.block_height ? 1 : -1 })
    console.log(`utxos = ${JSON.stringify(utxos, null, 2)}`)
    const minUtxos = utxos.filter((utxo) => utxo.value == 546)[0]
    const bestUtxo = minUtxos == undefined ? utxos[0] : minUtxos
    console.log(`bestUtxo = ${JSON.stringify(bestUtxo, null, 2)}`)
    return bestUtxo
}


export const collectAllRGBPlusPlusCell = async (btcAddress: string, type: CKBComponents.Script | undefined, isMainnet: Boolean) => {

    const networkType = isMainnet ? NetworkType.MAINNET : NetworkType.TESTNET;
    const service = BtcAssetsApi.fromToken(BTC_ASSETS_API_URL, BTC_ASSETS_TOKEN, BTC_ASSETS_ORIGIN);
    const source = new DataSource(service, networkType);

    const hexType = type != undefined ? bytes.hexify(blockchain.Script.pack(type)) : undefined
    const cells = await service.getRgbppAssetsByBtcAddress(btcAddress, hexType)
    console.log(`cells = ${JSON.stringify(cells, null, 2)}`)
    // const cells = await collector.getCells({  type: type });

}

collectAllRGBPlusPlusCell("tb1qphzk7ksyhayxk2assnl9mmh7f3fwmdgxssn0jl", undefined, false)
// let rgbppCells: IndexerCell[] = [];
// for await (const rgbppLock of rgbppLocks) {

//   if (!cells || cells.length === 0) {
//     throw new NoRgbppLiveCellError('No rgbpp cells found with the xudt type script and the rgbpp lock args');
//   }
//   rgbppCells = [...rgbppCells, ...cells];
// }

//最老的开始
export const findRGBPlusPlusUtxo = async (address: string) => {
    const collector = new Collector({
        ckbNodeUrl: 'https://testnet.ckb.dev/rpc',
        ckbIndexerUrl: 'https://testnet.ckb.dev/indexer',
    });

    collector.getCells
    const utxos = await service.getBtcUtxos(address, {
        only_confirmed: true,
        min_satoshi: undefined
    })
    utxos.sort((a, b) => { return a.status.block_height > b.status.block_height ? 1 : -1 })
    console.log(`utxos = ${JSON.stringify(utxos, null, 2)}`)
    const minUtxos = utxos.filter((utxo) => utxo.value == 546)[0]
    const bestUtxo = minUtxos == undefined ? utxos[0] : minUtxos
    console.log(`bestUtxo = ${JSON.stringify(bestUtxo, null, 2)}`)
    return bestUtxo
}


// async function test() {
//     const utxo = await findSuitablUnspentUtxoForCKBJumpBTC('tb1pmmv2f6pytg3uf2kv2zj2l5pu8hshv0t58n529xfw7f83dset20kqd93kgu')

// }

// test()