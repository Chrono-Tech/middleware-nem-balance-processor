/** 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const _ = require('lodash'),
  providerService = require('../../services/providerService');

const getTx = (txs, tx) => _.chain(txs)
  .find(txFromArray => {
    return txFromArray.transaction.timeStamp === tx.timeStamp;
  })
  .value();

/**
 * @param {Function} sendTransaction
 */
module.exports = async (sendTransaction) => {
  const instance = await providerService.get();

  let tx; 
  await Promise.all([
    new Promise(res => {
      let intervalPid = setInterval(async () => {
        if (!tx) 
          return; 
        const txs = await instance.getTransactions(tx.sender);
        const firstTx = getTx(txs.data, tx);

        if (firstTx && firstTx.transaction.timeStamp === tx.timeStamp && firstTx.meta.height) {
          tx.hash = firstTx.meta.hash.data;
          clearInterval(intervalPid);
          res();
        }
      }, 1000);
    }),
    (async () => {
      tx = await sendTransaction();
    })()
  ]);
  return tx;
};
