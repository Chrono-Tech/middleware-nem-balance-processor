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
    providers: createConfigProviders(process.env.PROVIDERS || getDefault())
  },
  rabbit: {
    url: process.env.RABBIT_URI || 'amqp://localhost:5672',
    serviceName: process.env.RABBIT_SERVICE_NAME || 'app_nem'
  },
  systemRabbit: {
    url: process.env.SYSTEM_RABBIT_URI || process.env.RABBIT_URI || 'amqp://localhost:5672',
    exchange: process.env.SYSTEM_RABBIT_EXCHANGE || 'internal',
    serviceName: process.env.SYSTEM_RABBIT_SERVICE_NAME || 'system' 
  },
  system: {
    waitTime: process.env.SYSTEM_WAIT_TIME ? parseInt(process.env.SYSTEM_WAIT_TIME) : 10000    
  },
  checkSystem: process.env.CHECK_SYSTEM ? parseInt(process.env.CHECK_SYSTEM) : true,
  logs: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

module.exports = config;
