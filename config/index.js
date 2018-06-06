/* 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const _ = require('lodash');

require('dotenv').config();

const getDefault = () => {
  return (
    (process.env.NIS || 'http://192.3.61.243:7890') + '@' +  
    (process.env.WEBSOCKET_NIS || 'http://192.3.61.243:7778')
  );
};

const createConfigProviders = (providers) => {
  return _.chain(providers)
    .split(',')
    .map(provider => {
      const data = provider.split('@');
      return {
        http: data[0].trim(),
        ws: data[1].trim()
      };
    })
    .value();
};

const config = {
  mongo: {
    accounts: {
      uri: process.env.MONGO_ACCOUNTS_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/data',
      collectionPrefix: process.env.MONGO_ACCOUNTS_COLLECTION_PREFIX || process.env.MONGO_COLLECTION_PREFIX || 'nem'
    }
  },
  node: {
    network: parseInt(process.env.NETWORK) || -104,
    networkName: process.env.NETWORK_NAME || 'testnet',
    providers: createConfigProviders(process.env.PROVIDERS || getDefault())
  },
  rabbit: {
    url: process.env.RABBIT_URI || 'amqp://localhost:5672',
    serviceName: process.env.RABBIT_SERVICE_NAME || 'app_nem'
  },
};

module.exports = config;
