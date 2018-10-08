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
  
  AmqpService = require('middleware_common_infrastructure/AmqpService'),
  InfrastructureInfo = require('middleware_common_infrastructure/InfrastructureInfo'),
  InfrastructureService = require('middleware_common_infrastructure/InfrastructureService'),
  
  config = require('./config'),
  getUpdatedBalance = require('./utils/balance/getUpdatedBalance'),
  converters = require('./utils/converters/converters'),
  models = require('./models'),
  providerService = require('./services/providerService'),
  log = bunyan.createLogger({name: 'core.balanceProcessor', level: config.logs.level});

const TX_QUEUE = `${config.rabbit.serviceName}_transaction`;

mongoose.Promise = Promise;
mongoose.connect(config.mongo.accounts.uri, {useMongoClient: true});


const runSystem = async function () {
  const rabbit = new AmqpService(
    config.systemRabbit.url, 
    config.systemRabbit.exchange,
    config.systemRabbit.serviceName
  );
  const info = new InfrastructureInfo(require('./package.json'), config.system.waitTime);
  const system = new InfrastructureService(info, rabbit, {checkInterval: 10000});
  await system.start();
  system.on(system.REQUIREMENT_ERROR, (requirement, version) => {
    log.error(`Not found requirement with name ${requirement.name} version=${requirement.version}.` +
        ` Last version of this middleware=${version}`);
    process.exit(1);
  });
  await system.checkRequirements();
  system.periodicallyCheck();
};


const init = async () => {
  if (config.checkSystem)
    await runSystem();


  mongoose.connection.on('disconnected', () => {
    throw new Error('mongo disconnected!');
  });

  models.init();


  let conn = await amqp.connect(config.rabbit.url);

  let channel = await conn.createChannel();

  channel.on('close', () => {
    throw new Error('rabbitmq process has finished!');
  });


  await channel.assertExchange('events', 'topic', {durable: false});
  await channel.assertExchange('internal', 'topic', {durable: false});

  await channel.assertQueue(`${config.rabbit.serviceName}.balance_processor`);
  await channel.bindQueue(`${config.rabbit.serviceName}.balance_processor`, 'events', `${TX_QUEUE}.*`);
  await channel.bindQueue(`${config.rabbit.serviceName}.balance_processor`, 'internal', `${config.rabbit.serviceName}_user.created`);

  await providerService.setRabbitmqChannel(channel, config.rabbit.serviceName);

  channel.prefetch(2);

  channel.consume(`${config.rabbit.serviceName}.balance_processor`, async (data) => {
    try {
      if (!data)
        return false;
      const parsedData = JSON.parse(data.content.toString());
      const addr = data.fields.routingKey.slice(TX_QUEUE.length + 1) || parsedData.address;

      let account = await models.accountModel.findOne({address: addr});

      if (!account)
        return channel.ack(data);

      const updatedBalance = await getUpdatedBalance(account.address, _.get(account, 'mosaics', {}), parsedData.hash ? data : null);

      if (updatedBalance.balance)
        account.balance = updatedBalance.balance;

      if (updatedBalance.mosaics)
        account.mosaics = updatedBalance.mosaics;

      account.markModified('mosaics');
      account.save();

      let convertedBalance = converters.convertBalanceWithDivisibility(updatedBalance.balance);
      let convertedMosaics = converters.convertMosaicsWithDivisibility(updatedBalance.mosaics);

      let message = {
        address: addr,
        balance: convertedBalance,
        mosaics: convertedMosaics
      };

      if (parsedData.hash)
        message.tx = parsedData;
      await channel.publish('events', `${config.rabbit.serviceName}_balance.${addr}`, new Buffer(JSON.stringify(message)));

    } catch (e) {
      log.error(e);
      return channel.nack(data);
    }
    channel.ack(data);
  });
};

module.exports = init().catch(err => {
  log.error(err);
  process.exit(0);
});
