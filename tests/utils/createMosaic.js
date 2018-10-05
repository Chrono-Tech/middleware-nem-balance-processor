/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */
const config = require('../config'),
  nem = require('nem-sdk').default;

module.exports = async (namespaceId, name, privateKeyFrom) => {
  // Create an NIS endpoint object
  const servArr = config.dev.httpForTransaction.split(/:/);
  const endpoint = nem.model.objects.create('endpoint')(
    servArr[0] + ':' + servArr[1], servArr[2]
  );
  const common = nem.model.objects.create('common')('',  privateKeyFrom);

  // Get a MosaicDefinitionCreationTransaction object
  var tx = nem.model.objects.get('mosaicDefinitionTransaction');

  // Define the mosaic
  tx.mosaicName = name;
  tx.namespaceParent = {
    'fqn': namespaceId
  };
  tx.mosaicDescription = 'My mosaic';

  // Set properties (see https://nemproject.github.io/#mosaicProperties)
  tx.properties.initialSupply = 5000000;
  tx.properties.divisibility = 2;
  tx.properties.transferable = true;
  tx.properties.supplyMutable = true;

  // Prepare the transaction object
  var transactionEntity = nem.model.transactions.prepare('mosaicDefinitionTransaction')(
    common, tx, 
    config.node.network
  );


  // Serialize transaction and announce
  return await nem.model.transactions.send(common, transactionEntity, endpoint);
};
