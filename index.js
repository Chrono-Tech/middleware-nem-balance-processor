/**
 * Middleware service for handling user balance.
 * Update balances for accounts, which addresses were specified
 * in received transactions from blockParser via amqp
 *
 * @module Chronobank/nem-balance-processor
 * @requires config
 * @requires models/accountModel
 */

const _ = require('lodash'),
  Promise = require('bluebird'),
  mongoose = require('mongoose'),
  bunyan = require('bunyan'),
  amqp = require('amqplib'),
  config = require('./config'),
  nem = require('nem-sdk').default,
  utils = require('./utils'),
  nis = require('./services/nisRequestService'),
  accountModel = require('./models/accountModel'),
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

  channel.prefetch(2);

  channel.consume(`${config.rabbit.serviceName}.balance_processor`, async (data) => {
    try {
      const tx = JSON.parse(data.content.toString()),
        addr = data.fields.routingKey.slice(TX_QUEUE.length + 1),
        accObj = await nis.getAccount(addr),
        balance = _.get(accObj, 'account.balance'),
        vestedBalance = _.get(accObj, 'account.vestedBalance');

      let unconfirmedTxs = await nis.getUnconfirmedTransactions(addr);
      let balanceDelta = _.chain(unconfirmedTxs.data)
        .transform((result, item) => {

          if (item.transaction.recipient === nem.model.address.toAddress(item.transaction.signer, config.nis.network)) //self transfer
            return;

          if (addr === item.transaction.recipient)
            result.val += item.transaction.amount;

          if (addr === nem.model.address.toAddress(item.transaction.signer, config.nis.network)) {
            result.val -= item.transaction.amount;
          }
          return result;
        }, {val: 0})
        .get('val')
        .value();

      let accUpdateObj = balance ? {
        balance: {
          confirmed: balance,
          unconfirmed: balanceDelta ? balance + balanceDelta : 0
        }
      } : {};

      let accMosaics = await nis.getMosaicsForAccount(addr);
      accMosaics = _.get(accMosaics, 'data', {});
      const commonKeys = utils.intersectByMosaic(_.get(tx, 'mosaics'), accMosaics);
      const flattenedMosaics = utils.flattenMosaics(accMosaics);

      let mosaicsUnconfirmed = _.chain(unconfirmedTxs.data)
        .filter(item=>_.has(item, 'transaction.mosaics'))
        .transform((result, item) => {

          if (item.transaction.recipient === nem.model.address.toAddress(item.transaction.signer, config.nis.network)) //self transfer
            return;

          if (addr === item.transaction.recipient) {
            item.transaction.mosaics.forEach(mosaic => {
              result[`${mosaic.mosaicId.namespaceId}:${mosaic.mosaicId.name}`] = (result[`${mosaic.mosaicId.namespaceId}:${mosaic.mosaicId.name}`] || 0) + mosaic.quantity
            });

          }

          if (addr === nem.model.address.toAddress(item.transaction.signer, config.nis.network)) {
            item.transaction.mosaics.forEach(mosaic => {
              result[`${mosaic.mosaicId.namespaceId}:${mosaic.mosaicId.name}`] = (result[`${mosaic.mosaicId.namespaceId}:${mosaic.mosaicId.name}`] || 0) - mosaic.quantity
            });
          }
          return result;
        }, {})
        .pick(commonKeys)
        .toPairs()
        .transform((result, pair) => {
          result[pair[0]] = (flattenedMosaics[pair[0]] || 0) + pair[1]
        }, {})
        .value();

      let mosaicsConfirmed = _.pick(utils.flattenMosaics(accMosaics), commonKeys);

      _.merge(accUpdateObj, _.chain(commonKeys)
        .map(key=> [
          [`mosaics.confirmed.${key}`, mosaicsConfirmed[key]],
          [`mosaics.unconfirmed.${key}`, mosaicsUnconfirmed[key] || 0]
        ])
        .flatten()
        .fromPairs()
        .value()
      );

      await accountModel.update({address: addr}, accUpdateObj);
      await channel.publish('events', `${config.rabbit.serviceName}_balance.${addr}`, new Buffer(JSON.stringify({
        address: addr,
        balance: accUpdateObj.balance,
        mosaics: accUpdateObj.mosaics,
        tx: tx
      })));

    } catch (e) {
      log.error(e);
    }
    channel.ack(data);
  });
};

module.exports = init();
