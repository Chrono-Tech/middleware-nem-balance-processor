/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

require('dotenv/config');
process.env.LOG_LEVEL = 'error';

const config = require('../config'),
  models = require('../models'),
  fuzzTests = require('./fuzz'),
  providerService = require('../services/providerService'),
  performanceTests = require('./performance'),
  featuresTests = require('./features'),
  blockTests = require('./blocks'),
  Promise = require('bluebird'),
  mongoose = require('mongoose'),
  amqp = require('amqplib'),
  Api = require('../utils/api/Api'),
  _ = require('lodash'),
  nodeUrls = require('nem-sdk').default.model.nodes.testnet,
  spawn = require('child_process').spawn,
  ctx = {};

mongoose.Promise = Promise;
mongoose.connect(config.mongo.accounts.uri, {useMongoClient: true});


describe('core/balanceProcessor', function () {

  before(async () => {
    models.init();
    ctx.accounts = [{
      key: config.dev.users.Alice.privateKey,
      address: config.dev.users.Alice.address
    }, {
      key: config.dev.users.Bob.privateKey,
      address: config.dev.users.Bob.address
    }];
    ctx.amqp = {};
    ctx.amqp.instance = await amqp.connect(config.rabbit.url);
    ctx.amqp.channel = await ctx.amqp.instance.createChannel();
    await ctx.amqp.channel.assertExchange('events', 'topic', {durable: false});
    await ctx.amqp.channel.assertExchange('internal', 'topic', {durable: false});
    await ctx.amqp.channel.assertQueue(`${config.rabbit.serviceName}_current_provider.get`, {
      durable: false,
      autoDelete: true
    });
    await ctx.amqp.channel.bindQueue(`${config.rabbit.serviceName}_current_provider.get`, 'internal', `${config.rabbit.serviceName}_current_provider.get`);

    ctx.providers = _.chain(nodeUrls)
      .reject(item => /localhost/.test(item.uri))
      .map(item => `${item.uri}:7890@${item.uri}:7778`)
      .value();

    config.node.providers = _.chain(nodeUrls)
      .reject(item => /localhost/.test(item.uri))
      .map(item => ({
        http: `${item.uri}:7890`,
        ws: `${item.uri}:7778`
      }))
      .value();

    const providerURIIndex = await Promise.any(config.node.providers.map(async providerURI => {

      const apiProvider = new Api(providerURI);

      try {
        await Promise.resolve(apiProvider.openWSProvider()).timeout(20000);
        apiProvider.wsProvider.disconnect();
      } catch (err) {
        apiProvider.wsProvider.disconnect();
        throw new Error(err);
      }

      await apiProvider.getBlockByNumber(1);
      return ctx.providers.indexOf(`${providerURI.http}@${providerURI.ws}`);
    })).catch(e => {
      console.log(e);
      process.exit(1);
    });

    ctx.amqp.channel.consume(`${config.rabbit.serviceName}_current_provider.get`, async (data) => {
      ctx.amqp.channel.publish('internal', `${config.rabbit.serviceName}_current_provider.set`, new Buffer(JSON.stringify({index: providerURIIndex})));
    }, {noAck: true, autoDelete: true});


    await providerService.setRabbitmqChannel(ctx.amqp.channel, config.rabbit.serviceName);

    ctx.checkerPid = spawn('node', ['tests/utils/proxyChecker.js'], {
      env: process.env, stdio: 'ignore'
    });
    await Promise.delay(3000);
  });

  after(async () => {
    mongoose.disconnect();
    providerService.connector.wsProvider.disconnect();
    await ctx.amqp.instance.close();
    await ctx.checkerPid.kill();
  });


  describe('block', () => blockTests(ctx));

  describe('performance', () => performanceTests(ctx));

  describe('fuzz', () => fuzzTests(ctx));

  describe('features', () => featuresTests(ctx));

});
