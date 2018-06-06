/**
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const mongoose = require('mongoose'),
  Promise = require('bluebird'),
  config = require('./config');

mongoose.Promise = Promise; // Use custom Promises
mongoose.connect(config.mongo.accounts.uri, {useMongoClient: true});


const saveAccountForAddress = require('./helpers/saveAccountForAddress'),
  clearQueues = require('./helpers/clearQueues'),
  findProcess = require('find-process'),
  amqp = require('amqplib'),
  PROVIDER_CHECK_QUEUE = `${config.rabbit.serviceName}_provider_check`;

let amqpInstance,  accounts = config.dev.accounts;

describe('core/block processor -  change provider', function () {


  before (async () => {
    await saveAccountForAddress(accounts[0]);
    amqpInstance = await amqp.connect(config.rabbit.url);
    await clearQueues(amqpInstance, PROVIDER_CHECK_QUEUE);
  });

  after (async () => {
    await amqpInstance.close();
    await mongoose.disconnect();
  });

  afterEach(async () => {
    await clearQueues(amqpInstance, PROVIDER_CHECK_QUEUE);
  });


  it('send nem and check that operation through provider 8010 (get from rabbitmq message 8010 and 8011)', async () => {
    const channel = await amqpInstance.createChannel();      
    await channel.assertQueue(PROVIDER_CHECK_QUEUE, {autoDelete: true, durable: false});
    await channel.bindQueue(PROVIDER_CHECK_QUEUE, 'events', PROVIDER_CHECK_QUEUE);
    
    return await Promise.all([
      (async () => {
        await channel.publish('events', `${config.rabbit.serviceName}_transaction.${accounts[0]}`, new Buffer(JSON.stringify(Object.assign({
          transaction: 'transaction'
        }))));
      })(),
      (async () => {
        return new Promise(res => {
          channel.consume(PROVIDER_CHECK_QUEUE, async (message) => {
            const content = message.content.toString();
            if (content === '8010') {
              await channel.cancel(message.fields.consumerTag);
              res();
            }
          }, {noAck: true});
        });
      })()
    ]);
  });

  it('kill provider 8010 and check that provider 8020', async () => {
    const channel = await amqpInstance.createChannel();  
    await channel.assertQueue(PROVIDER_CHECK_QUEUE, {autoDelete: true, durable: false});
    await channel.bindQueue(PROVIDER_CHECK_QUEUE, 'events', PROVIDER_CHECK_QUEUE);
    return await Promise.all([
      (async () => {
        const processInfo = await findProcess('port', 8010);
        process.kill(processInfo[0].pid, 'SIGKILL');
        await Promise.delay(3000);
        await channel.publish('events', `${config.rabbit.serviceName}_transaction.${accounts[0]}`, new Buffer(JSON.stringify(Object.assign({
          transaction: 'transaction'
        }))));
      })(),
      (async () => {
        return new Promise(res => {
          channel.consume(PROVIDER_CHECK_QUEUE, async (message) => {
            const content = message.content.toString();
            if (content === '8020') {
              await channel.cancel(message.fields.consumerTag);
              res();
            }
          }, {noAck: true});
        });
      })()
    ]);
  });


});
