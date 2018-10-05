/** 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const config = require('../config'),
  nem = require('nem-sdk').default;


const sendTransactionTo =  async (addressTo, sum, privateKeyFrom ) => {
  // Create an NIS endpoint object
  const servArr = config.dev.httpForTransaction.split(/:/);
  const endpoint = nem.model.objects.create('endpoint')(
    servArr[0] + ':' + servArr[1], servArr[2]
  );
  const common = nem.model.objects.create('common')('',  privateKeyFrom);

  // Create an un-prepared transfer transaction object
  const transferTransaction = nem.model.objects.create('transferTransaction')(addressTo, sum, 'Hello');

  // Prepare the transfer transaction object
  const transactionEntity = nem.model.transactions.prepare('transferTransaction')(
    common, 
    transferTransaction, 
    config.node.network
  );

  // Serialize transfer transaction and announce
  const ll = await nem.model.transactions.send(common, transactionEntity, endpoint);
  ll.timeStamp = transactionEntity.timeStamp;
  return ll;
};

const sendTransaction = async (accounts, sum) => {
  let tx = await sendTransactionTo(accounts[1].address, sum, accounts[0].key);
  tx.sender = accounts[0].address;
  tx.recipient = accounts[1].address;
  if (tx.code === 5) {
    tx = await sendTransactionTo(accounts[0].address, sum, accounts[1].key);
    tx.sender = accounts[1].address;
    tx.recipient = accounts[0].address;
    if (tx.code === 5)
      throw new Error('Accounts from dev config has no balance for tests');
  }
  return tx;
};


module.exports = {
  sendTransaction,
  sendTransactionTo
};

