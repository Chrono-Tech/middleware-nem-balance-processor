/* 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
require('dotenv/config');

const config = require('../config'),
  mongoose = require('mongoose'),
  _ = require('lodash'),
  Promise = require('bluebird');

mongoose.Promise = Promise;
mongoose.connect(config.mongo.accounts.uri, {useMongoClient: true});


const expect = require('chai').expect,
  Provider = require('../models/provider'),
  nis = require('../services/nisRequestService')({
    getProvider: () => {
      return new Provider(2, config.node.providers[2].ws, config.node.providers[2].http, 0); 
    }
  }),
  accountModel = require('../models/accountModel'),
  amqp = require('amqplib'),
  ctx = {};

let amqpInstance;

describe('core/balance processor', function () {
  before(async () => {
    await accountModel.remove();
  });

  after(async () => {
    return await mongoose.disconnect(); 
  });

  beforeEach(async () => {
    amqpInstance = await amqp.connect(config.rabbit.url);
  });

  afterEach(async () => {
    await amqpInstance.close();
  });




  it('find first block with transactions', async () => {

    let findBlock = async (height) => {
      let block = await nis.getBlock(height);
      if (block.transactions.length === 0)
        return await findBlock(height + 1);

      let data = await Promise.map(block.transactions, async tx => {
        let account = await nis.getAccount(tx.recipient);
        return {tx, account};
      });

      let tx = _.chain(data)
        .find(item => _.get(item, 'account.account.balance') > 0)
        .get('tx')
        .value();

      if (!tx)
        return await findBlock(height + 1);

      return tx;
    };

    ctx.tx = await findBlock(800);
    expect(ctx.tx).to.have.property('recipient');
  });


  it('add recipient from first tx of found block', async () => {
    await accountModel.update({address: ctx.tx.recipient}, {$set: {address: ctx.tx.recipient}}, {
      upsert: true,
      setDefaultsOnInsert: true
    });
  });

  it('send message about new account and check this balance', async () => {
    let account = await accountModel.findOne({address: ctx.tx.recipient});
    expect(account.balance.confirmed.toNumber()).to.be.equal(0);
    expect(account.balance.unconfirmed.toNumber()).to.be.equal(0);
    expect(account.balance.vested.toNumber()).to.be.equal(0);

    const channel = await amqpInstance.createChannel(); 
    await channel.assertExchange('internal', 'topic', {durable: false});
    await channel.publish('internal', `${config.rabbit.serviceName}_user.created`, 
      new Buffer(JSON.stringify({
        address: ctx.tx.recipient
      }))
    );
    await Promise.delay(4000);
    account = await accountModel.findOne({address: ctx.tx.recipient});

    expect(account.balance.confirmed.toNumber()).to.be.greaterThan(0);
    expect(account.balance.unconfirmed.toNumber()).to.be.greaterThan(0);
    expect(account.balance.vested.toNumber()).to.be.greaterThan(0);
    
  });



  it('validate notification via amqp about new tx', async () => {
    let channel = await amqpInstance.createChannel();


    await channel.assertExchange('events', 'topic', {durable: false});
    await channel.assertQueue(`${config.rabbit.serviceName}_test.balance`);
    await channel.bindQueue(`${config.rabbit.serviceName}_test.balance`, 'events', `${config.rabbit.serviceName}_balance.${ctx.tx.recipient}`);


    return Promise.all([
      (async () => {
        return await channel.publish('events', `${config.rabbit.serviceName}_transaction.${ctx.tx.recipient}`, new Buffer(JSON.stringify(ctx.tx)));
      })(),
      (async () => {
        return await new Promise(res => {
          channel.consume(`${config.rabbit.serviceName}_test.balance`, () => {
            res();
          }, {noAck: true});
        });
      })()
    ]);
  });


  it('validate balance changes', async () => {
    let account = await accountModel.findOne({address: ctx.tx.recipient});
    expect(account).to.have.property('balance');
    expect(account.balance.confirmed.toNumber()).to.be.above(0);
  });

});
