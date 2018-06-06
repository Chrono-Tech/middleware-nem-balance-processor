/**
 * Middleware service for handling user balance.
 * Update balances for accounts, which addresses were specified
 * in received transactions from blockParser via amqp
 *
 * @module Chronobank/nem-balance-processor
 * @requires config
 * @requires models/accountModel
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const _ = require('lodash'),
  Promise = require('bluebird'),
  mongoose = require('mongoose'),
  bunyan = require('bunyan'),
  amqp = require('amqplib'),
  config = require('./config'),
  nem = require('nem-sdk').default,
  utils = require('./utils'),
  requestsService = require('./services/nisRequestService'),
  accountModel = require('./models/accountModel'),
  ProviderService = require('./services/providerService'),
  log = bunyan.createLogger({name: 'nem-balance-processor'});

const TX_QUEUE = `${config.rabbit.serviceName}_transaction`;

mongoose.Promise = Promise;
mongoose.connect(config.mongo.accounts.uri, {useMongoClient: true});

mongoose.connection.on('disconnected', function () {
  log.error('Mongo disconnected!');
  process.exit(0);
});

const init = async () => {
  let conn = await amqp.connect(config.rabbit.url)
    .catch(() => {
      log.error('Rabbitmq is not available!');
      process.exit(0);
    });

  let channel = await conn.createChannel();

  channel.on('close', () => {
    log.error('Rabbitmq process has finished!');
    process.exit(0);
  });

  try {
    await channel.assertExchange('events', 'topic', {durable: false});
    await channel.assertQueue(`${config.rabbit.serviceName}.balance_processor`);
    await channel.bindQueue(`${config.rabbit.serviceName}.balance_processor`, 'events', `${TX_QUEUE}.*`);
  } catch (e) {
    log.error(e);
    channel = await conn.createChannel();
  }

  const providerService = new ProviderService(channel, config.node.providers, config.rabbit.serviceName);
  await providerService.start();
  await providerService.selectProvider();

  const nis = requestsService(providerService);
  channel.prefetch(2);

  channel.consume(`${config.rabbit.serviceName}.balance_processor`, async (data) => {
    try {
      const tx = JSON.parse(data.content.toString()),
        addr = data.fields.routingKey.slice(TX_QUEUE.length + 1),
        accObj = await nis.getAccount(addr),
        balance = _.get(accObj, 'account.balance'),
        vestedBalance = _.get(accObj, 'account.vestedBalance');

      let account = await accountModel.findOne({address: addr});

      if (!account)
        return channel.ack(data);

      let unconfirmedTxs = await nis.getUnconfirmedTransactions(addr);

      let balanceDelta = _.chain(unconfirmedTxs.data)
        .transform((result, item) => {

          const sender = nem.model.address.toAddress(item.transaction.signer, config.node.network);

          if (addr === item.transaction.recipient && !_.has(item, 'transaction.mosaics'))
            result.val += item.transaction.amount;

          if (addr === sender && !_.has(item, 'transaction.mosaics'))
            result.val -= item.transaction.amount;

          if (addr === sender)
            result.val -= item.transaction.fee;

          return result;
        }, {val: 0})
        .get('val')
        .value();

      let accUpdateObj = _.isNumber(balance) ? {
        balance: {
          confirmed: balance,
          vested: vestedBalance,
          unconfirmed: balance + balanceDelta
        }
      } : {};

      let accMosaics = await nis.getMosaicsForAccount(addr);
      accMosaics = _.get(accMosaics, 'data', {});
      const allKeys = utils.intersectByMosaic(_.get(tx, 'mosaics'), accMosaics);
      const flattenedMosaics = utils.flattenMosaics(accMosaics);

      let mosaicsUnconfirmed = _.chain(unconfirmedTxs.data)
        .filter(item => _.has(item, 'transaction.mosaics'))
        .transform((result, item) => {

          if (item.transaction.recipient === nem.model.address.toAddress(item.transaction.signer, config.node.network)) //self transfer
            return;

          if (addr === item.transaction.recipient)
            item.transaction.mosaics.forEach(mosaic => {
              result[`${mosaic.mosaicId.namespaceId}:${mosaic.mosaicId.name}`] = (result[`${mosaic.mosaicId.namespaceId}:${mosaic.mosaicId.name}`] || 0) + mosaic.quantity;
            });

          if (addr === nem.model.address.toAddress(item.transaction.signer, config.node.network))
            item.transaction.mosaics.forEach(mosaic => {
              result[`${mosaic.mosaicId.namespaceId}:${mosaic.mosaicId.name}`] = (result[`${mosaic.mosaicId.namespaceId}:${mosaic.mosaicId.name}`] || 0) - mosaic.quantity;
            });

          return result;
        }, {})
        .pick(allKeys)
        .toPairs()
        .transform((result, pair) => {
          result[pair[0]] = (flattenedMosaics[pair[0]] || 0) + pair[1];
        }, {})
        .value();

      let mosaicsConfirmed = utils.flattenMosaics(accMosaics);

      _.merge(accUpdateObj, {mosaics: account.mosaics}, {
        mosaics: _.chain(allKeys)
          .transform((result, key) => {
            result[key] = {
              confirmed: mosaicsConfirmed[key] || 0,
              unconfirmed: mosaicsUnconfirmed[key] || mosaicsConfirmed[key] || 0
            };
          }, {})
          .value()
      });

      account = await accountModel.findOneAndUpdate({address: addr}, {$set: accUpdateObj}, {new: true});

      let convertedBalance = utils.convertBalanceWithDivisibility(_.merge(account.balance, accUpdateObj.balance));
      let convertedMosaics = await utils.convertMosaicsWithDivisibility(_.merge(account.mosaics, accUpdateObj.mosaics), nis);

      await channel.publish('events', `${config.rabbit.serviceName}_balance.${addr}`, new Buffer(JSON.stringify({
        address: addr,
        balance: convertedBalance,
        mosaics: convertedMosaics,
        tx: tx
      })));

    } catch (e) {
      log.error(e);
      return channel.nack(data);
    }
    channel.ack(data);
  });
};

module.exports = init();
