/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */
const config = require('../config'),
  nem = require('nem-sdk').default;

const sendTransactionTo = async (addressTo, namespaceId, name, amount, privateKeyFrom) => {
  // Create an NIS endpoint object
  const servArr = config.dev.httpForTransaction.split(/:/);
  const endpoint = nem.model.objects.create('endpoint')(
    servArr[0] + ':' + servArr[1], servArr[2]
  );
  const common = nem.model.objects.create('common')('',  privateKeyFrom);

  // Create variable to store our mosaic definitions, needed to calculate fees properly (already contains xem definition)
  var mosaicDefinitionMetaDataPair = nem.model.objects.get('mosaicDefinitionMetaDataPair');

  // Create an un-prepared mosaic transfer transaction object (use same object as transfer tansaction)
  var transferTransaction = nem.model.objects.create('transferTransaction')(
    addressTo, 1, 'Hello'
  );

  // Create a mosaic attachment object
  var mosaicAttachment = nem.model.objects.create('mosaicAttachment')(namespaceId, name, amount);

  // Push attachment into transaction mosaics
  transferTransaction.mosaics.push(mosaicAttachment);

  // Need mosaic definition of nw.fiat:eur to calculate adequate fees, so we get it from network.
  // Otherwise you can simply take the mosaic definition from api manually (http://bob.nem.ninja/docs/#retrieving-mosaic-definitions) 
  // and put it into mosaicDefinitionMetaDataPair model (objects.js) next to nem:xem (be careful to respect object structure)
  const res1 = await nem.com.requests.namespace.mosaicDefinitions(endpoint, 
    mosaicAttachment.mosaicId.namespaceId);
  // Look for the mosaic definition(s) we want in the request response (Could use ['eur', 'usd'] to return eur and usd mosaicDefinitionMetaDataPairs)
  var neededDefinition = nem.utils.helpers.searchMosaicDefinitionArray(res1.data, [name]);

  // Get full name of mosaic to use as object key
  var fullMosaicName  = nem.utils.format.mosaicIdToName(mosaicAttachment.mosaicId);

  // Check if the mosaic was found
  if(undefined === neededDefinition[fullMosaicName]) return console.error('Mosaic not found !');

  // Set eur mosaic definition into mosaicDefinitionMetaDataPair
  mosaicDefinitionMetaDataPair[fullMosaicName] = {};
  mosaicDefinitionMetaDataPair[fullMosaicName].mosaicDefinition = neededDefinition[fullMosaicName];

  // Prepare the transfer transaction object
  var transactionEntity = nem.model.transactions.prepare('mosaicTransferTransaction')(
    common, transferTransaction, mosaicDefinitionMetaDataPair, 
    nem.model.network.data.testnet.id);

  transactionEntity.fee = 1000000;

  // Serialize transfer transaction and announce
  return await nem.model.transactions.send(common, transactionEntity, endpoint)


  var mosaicDefinitionMetaDataPair = nem.model.objects.get(
    'mosaicDefinitionMetaDataPair'
  );

  // MOSAIC Tranfer use 1 XEM
  var transferTransaction = nem.model.objects.create('transferTransaction')(
    addressTo,
    1,
    'cb.minutes'
  );

  // Create a mosaic attachment object
  var mosaicAttachment = nem.model.objects.create('mosaicAttachment')(
    namespaceId, // namespace required
    name, // masaicName required
    amount
  );

  // Push attachment into transaction mosaics
  transferTransaction.mosaics.push(mosaicAttachment);

  const res = await nem.com.requests.namespace
    .mosaicDefinitions(endpoint, mosaicAttachment.mosaicId.namespaceId);
  var neededDefinition = nem.utils.helpers.searchMosaicDefinitionArray(res.data, [name]);
  // Get full name of mosaic to use as object key
  var fullMosaicName = nem.utils.format.mosaicIdToName(
    mosaicAttachment.mosaicId
  );

  // Check if the mosaic was found
  if (undefined === neededDefinition[fullMosaicName])
    return console.error('Mosaic not found !');

  // Set eur mosaic definition into mosaicDefinitionMetaDataPair
  mosaicDefinitionMetaDataPair[fullMosaicName] = {};
  mosaicDefinitionMetaDataPair[fullMosaicName].mosaicDefinition =
    neededDefinition[fullMosaicName];

  // Prepare the transfer transaction object
  var transactionEntity = nem.model.transactions.prepare(
    'mosaicTransferTransaction'
  )(
    common,
    transferTransaction,
    mosaicDefinitionMetaDataPair,
    nem.model.network.data.testnet.id
  );
  // Serialize transfer transaction and announce
  return await nem.model.transactions.send(common, transactionEntity, endpoint);
};


const sendTransaction = async (accounts, namespaceId, name, sum) => {
  let tx = await sendTransactionTo(accounts[1].address, namespaceId, name, sum, accounts[0].key);
  if (!tx)
    return tx;
  tx.sender = accounts[0].address;
  tx.recipient = accounts[1].address;
  if (tx.code === 5) {
    tx = await sendTransactionTo(accounts[0].address, namespaceId, name, sum, accounts[1].key);
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
