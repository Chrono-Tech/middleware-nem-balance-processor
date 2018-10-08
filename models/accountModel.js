/**
 * Mongoose model. Accounts
 * @module models/accountModel
 * @returns {Object} Mongoose model
 * @requires factory/addressMessageFactory
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const mongoose = require('mongoose'),
  config = require('../config'),
  _ = require('lodash'),
  messages = require('middleware-common-components/factories/messages/addressMessageFactory');

require('mongoose-long')(mongoose);

const setMosaics = (mosaics) => {
  return _.chain(mosaics).toPairs()
    .map(pair => {
      pair[0] = pair[0].replace('.', '::');
      return pair;
    })
    .fromPairs()
    .value();
};

const getMosaics = (mosaics) => {
  return _.chain(mosaics).toPairs()
    .map(pair => {
      pair[0] = pair[0].replace('::', '.');
      return pair;
    })
    .fromPairs()
    .value();
};

const Account = new mongoose.Schema({
  address: {
    type: String,
    unique: true,
    required: true,
    validate: [a => /^[0-9A-Z]{40}$/.test(a), messages.wrongAddress]
  },
  balance: {
    confirmed: {type: mongoose.Schema.Types.Long, default: 0},
    unconfirmed: {type: mongoose.Schema.Types.Long, default: 0},
    vested: {type: mongoose.Schema.Types.Long, default: 0}
  },
  created: {type: Date, required: true, default: Date.now},
  isActive: {type: Boolean, required: true, default: true},
  mosaics: {type: mongoose.Schema.Types.Mixed, default: {}, set: setMosaics, get: getMosaics}
}, {
  toObject: {getters: true},
  toJSON: {getters: true}
});


module.exports = () => mongoose.model(`${config.mongo.accounts.collectionPrefix}Account`, Account);
