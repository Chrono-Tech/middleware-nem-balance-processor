/** 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
require('dotenv').config();
const config = require('../../config'),
  nem = require('nem-sdk').default;

config.dev = {
  httpForTransaction: process.env.DEV_HTTP_FOR_TRANSACTION || 'http://192.3.61.243:7890',
  users: {
    Alice: {
      privateKey: process.env.PRIVATE_KEY || '',
      address: nem.model.address.toAddress(nem.crypto.keyPair.create(process.env.PRIVATE_KEY).publicKey.toString(), config.node.network)
    },
    Bob: {
      privateKey: process.env.PRIVATE_KEY_TWO || '',
      address: nem.model.address.toAddress(nem.crypto.keyPair.create(process.env.PRIVATE_KEY_TWO).publicKey.toString(), config.node.network)
    }
  }
};

module.exports =  config;
