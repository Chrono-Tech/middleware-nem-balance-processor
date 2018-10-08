/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */

const models = require('../../models'),
  sender = require('../utils/sender'),
  getUpdatedBalance = require('../../utils/balance/getUpdatedBalance'),
  converters = require('../../utils/converters/converters'),
  waitTransaction = require('../utils/waitTransaction'),
  mosaics = require('../../utils/mosaics/mosaics'),
  expect = require('chai').expect;

module.exports = (ctx) => {

  before (async () => {
    await models.accountModel.remove({});

    await models.accountModel.create({
      address: ctx.accounts[0].address,
      balances: {
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

  it('validate after transaction getUpdatedBalance function', async () => {
    const balance  = await getUpdatedBalance(ctx.accounts[0].address);

    const tx = await waitTransaction(sender.sendTransaction.bind(sender, ctx.accounts, 0.00001));
    const newBalance = await getUpdatedBalance(ctx.accounts[0].address);


    if (tx.sender === ctx.accounts[0].address) 
      expect(newBalance.balance.confirmed).to.lessThan(balance.balance.confirmed);
    else 
      expect(newBalance.balance.confirmed).to.greaterThan(balance.balance.confirmed);


  });

  it('validate convertBalanceWithDivisibility function', async () => {
    const balance = converters.convertBalanceWithDivisibility({
      confirmed: 1000000,
      vested: 1,
      unconfirmed: 1000001
    });
    expect(balance).deep.equal({    
      confirmed: {
        value: 1000000,
        amount: '1.000000'
      },
      unconfirmed: {
        value: 1000001,
        amount: '1.000001'
      },
      vested: {
        value: 1,
        amount: '0.000001'
      }
    });


  });

  it('validate convertMosaicsWithDivisibility function', async () => {
    const balance = converters.convertMosaicsWithDivisibility({
      'nem:xem': {
        confirmed: 1000000,
        unconfirmed: 1000001,
        decimals: 10
      }
    });
    expect(balance).deep.equal({
      'nem:xem': {    
        confirmed: {
          value: 1000000,
          amount: 0.0001
        },
        unconfirmed: {
          value: 1000001,
          amount: 0.0001000001
        },
        decimals: 10
      }
    });

  });

  

  it('validate flattenMosaics function', async () => {
    const flatten = mosaics.flattenMosaics([{
      mosaicId: {namespaceId: 'nem', name: 'xem'},
      quantity: 10
    }]);
    expect(flatten).deep.equal({
      'nem:xem': 10
    });
  });

  it('validate intersectByMosaic function', async () => {
    const flatten = mosaics.intersectByMosaic([{
      mosaicId: {namespaceId: 'nem', name: 'xem'},
      quantity: 10
    }, {
      mosaicId: {namespaceId: 'nem', name: 'xem'},
      quantity: 10
    }]);
    expect(flatten).deep.equal(['nem:xem']);
  });

  it('validate getMosaicDivisibility function', async () => {
    const flatten = await mosaics.getMosaicDivisibility({'cb:minutes': 100000});
    expect(flatten).to.equal(2);
  });


};
