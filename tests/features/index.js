/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

require('dotenv/config');

const models = require('../../models'),
  config = require('../../config'),
  _ = require('lodash'),
  providerService = require('../../services/providerService'),
  waitTransaction = require('../utils/waitTransaction'),
  sender = require('../utils/sender'),
  spawn = require('child_process').spawn,
  expect = require('chai').expect,
  Promise = require('bluebird');

module.exports = (ctx) => {

  before (async () => {
    await models.accountModel.remove({});

    await ctx.amqp.channel.deleteQueue(`${config.rabbit.serviceName}.balance_processor`);
    ctx.balanceProcessorPid = spawn('node', ['index.js'], {env: _.merge({PROVIDERS: ctx.providers.join(',')}, process.env), stdio: 'ignore'});
    await Promise.delay(10000);

    await models.accountModel.create({
      address: ctx.accounts[0].address,
      balance: {
        confirmed: {
          value: 0,
          amount: 0
        },
        unconfirmed: {
          value: 0,
          amount: 0
        },
        vested: {
          value: 0,
          amount: 0
        }
      },
      isActive: true
    });
    await models.accountModel.create({
      address: ctx.accounts[1].address,
      balance: {
        confirmed: {
          value: 0,
          amount: 0
        },
        unconfirmed: {
          value: 0,
          amount: 0
        },
        vested: {
          value: 0,
          amount: 0
        }
      },
      isActive: true
    });

  });


   it('validate balance change on tx arrive', async () => {
     const instance = await providerService.get();


     let tx;
     let balance0;
     let balance1;
     await Promise.all([
       (async () => {
         tx = await waitTransaction(sender.sendTransaction.bind(sender, ctx.accounts, 0.000001));
         balance0 = (await instance.getAccount(ctx.accounts[0].address)).account.balance;
         balance1 = (await instance.getAccount(ctx.accounts[1].address)).account.balance;
         await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${ctx.accounts[0].address}`, new Buffer(JSON.stringify(tx)));
         await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${ctx.accounts[1].address}`, new Buffer(JSON.stringify(tx)));
       })(),
       (async () => {
         await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`, {autoDelete: true, durable: false});
         await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${ctx.accounts[1].address}`);
         await new Promise(res =>
           ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, 
             async data => {

               if (!data)
                 return;
               const message = JSON.parse(data.content.toString());
               expect(_.isEqual(JSON.parse(JSON.stringify(tx)), message.tx)).to.equal(true);
               expect(message.balance.confirmed.value).to.eq(balance1);
               expect(message.address).to.eq(ctx.accounts[1].address);
               await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
               res();
             }, {noAck: true})
         );

       })(),
       (async () => {
         await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features2.balance`, {autoDelete: true, durable: false});
         await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features2.balance`, 'events', `${config.rabbit.serviceName}_balance.${ctx.accounts[0].address}`);
         await new Promise(res =>
           ctx.amqp.channel.consume(
             `app_${config.rabbit.serviceName}_test_features2.balance`,
             async data => {

               if (!data)
                 return;

               const message = JSON.parse(data.content.toString());

               expect(message.balance.confirmed.value).to.eq(balance0);
               expect(message.address).to.eq(ctx.accounts[0].address);
               expect(_.isEqual(JSON.parse(JSON.stringify(tx)), message.tx)).to.equal(true);
               await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features2.balance`);
               res();
             }, {noAck: true})
         );

       })()
     ]);
   });


   it('validate balance on user registration', async () => {

     await models.accountModel.update({address: ctx.accounts[0].address}, {
       $set: {
         balance: {}
       }
     });

     const instance = await providerService.get();
     let balance = (await instance.getAccount(ctx.accounts[0].address))['account']['balance'];


     await Promise.all([
       (async () => {
         await Promise.delay(3000);
         await ctx.amqp.channel.publish('internal', `${config.rabbit.serviceName}_user.created`, new Buffer(JSON.stringify({address: ctx.accounts[0].address})));
       })(),
       (async () => {
         await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`, {autoDelete: true, durable: false});
         await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${ctx.accounts[0].address}`);
         await new Promise(res =>
           ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

             if (!data)
               return;

             const message = JSON.parse(data.content.toString());

             expect(message.balance.confirmed.value).to.eq(balance);
             expect(message.address).to.eq(ctx.accounts[0].address);
             expect(message.tx).to.undefined;

             await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
             res();
           }, {noAck: true})
         );

       })()
     ]);
   });

/*
  it('add new Mosaics', async () => {

    const instance = await providerService.get();
    const mosaicTx = await mosaicSender.sendTransaction(ctx.accounts, 'cb', 'minutes', 10);
    let balanceAccount11 = await instance.getMosaicsForAccount(ctx.accounts[1].address, 'cb', 'minutes');
    let balanceAccount10 = await instance.getMosaicsForAccount(ctx.accounts[0].address, 'cb', 'minutes');
    return;


    const tx = await waitTransaction(sendMosaic.bind(sender, 
      ctx.accounts[1].address, 'cb2.test', 'test', 0.00001, ctx.accounts[0].key
    ));

    let balanceAccount1 = await instance.getMosaicsForAccount(ctx.accounts[1].address, 'chronobank', 'test');

    await Promise.all([
      (async () => {
        await Promise.delay(3000);
        await ctx.amqp.channel.publish('events', `${config.rabbit.serviceName}_transaction.${ctx.accounts[1].address}`, new Buffer(JSON.stringify(
          tx
        )));
      })(),
      (async () => {
        await ctx.amqp.channel.assertQueue(`app_${config.rabbit.serviceName}_test_features.balance`, {autoDelete: true, durable: false});
        await ctx.amqp.channel.bindQueue(`app_${config.rabbit.serviceName}_test_features.balance`, 'events', `${config.rabbit.serviceName}_balance.${ctx.accounts[1].address}`);
        await new Promise(res =>
          ctx.amqp.channel.consume(`app_${config.rabbit.serviceName}_test_features.balance`, async data => {

            if (!data)
              return;

            const message = JSON.parse(data.content.toString());

            expect(_.isEqual(JSON.parse(JSON.stringify(tx)), message.tx)).to.equal(true);
            expect(message.mosaics['chronobank:test'].confirmed.value).to.eq(balanceAccount1);
            expect(message.address).to.eq(ctx.accounts[1].address);

            await ctx.amqp.channel.deleteQueue(`app_${config.rabbit.serviceName}_test_features.balance`);
            res();
          }, {noAck: true})
        );

      })()
    ]);
  });
*/

  after (() => {
    ctx.balanceProcessorPid.kill();
  });



};
