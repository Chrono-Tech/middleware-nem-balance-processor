/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */
const EventEmitter = require('events'),
  Promise = require('bluebird'),
  request = require('request-promise'),
  URL = require('url').URL,
  _ = require('lodash'),
  SockJS = require('sockjs-client'),
  Stomp = require('webstomp-client');

/**
 * @service
 * @param URI - the endpoint URI
 * @description http provider for nem node
 */

class Api {

  constructor (URI) {
    this.http = URI.http;
    this.ws = URI.ws;
    this.events = new EventEmitter();
  }

  /**
   * @function
   * @internal
   * @description build ws provider for the connector
   * @return {Client}
   */
  _buildWSProvider () {
    const ws = new SockJS(`${this.ws}/w/messages`);
    const client = Stomp.over(ws, {heartbeat: true, debug: false});
    ws.onclose = () => this.events.emit('disconnect');
    ws.onerror = () => this.events.emit('disconnect');
    return client;
  }

  /**
   * @function
   * @description open ws provider
   * @return {Promise<void>}
   */
  async openWSProvider (){
    if(!this.wsProvider)
      this.wsProvider = this._buildWSProvider();

    return await new Promise((res, rej)=>{
      this.wsProvider.connect({}, res, rej);
    });
  }

  /**
   * @function
   * @description internal method for making requests
   * @param url - endpoint url
   * @param method - the HTTP method
   * @param body - the body of the request
   * @return {Promise<*>}
   * @private
   */
  async _makeRequest (url, method = 'GET', body) {
    const options = {
      method: method,
      body: body,
      uri: new URL(url, this.http),
      json: true
    };
    return Promise.resolve(request(options)).timeout(10000);
  }

  /**
   * @function
   * @description get block by it's number
   * @param height
   * @return {Promise<{}>}
   */
  async getBlockByNumber (height) {
    return await this._makeRequest('block/at/public', 'POST', {height: height});
  }

  async getMosaicsForAccount (addr, namespaceId, name) {
    const balances =  await this._makeRequest(`/account/mosaic/owned?address=${addr}`);
    if (namespaceId && name) 
      return _.filter(balances.data, d => d.mosaicId['namespaceId'] === namespaceId && d.mosaicId['name'] === name);
    return balances;
  }

  async getMosaicsDefinition (id) {
    return this._makeRequest(`/namespace/mosaic/definition/page?namespace=${id}`);
  }

  async getAccount (addr) {
    return this._makeRequest(`/account/get?address=${addr}`);
  }

  async getUnconfirmedTransactions (addr) {
    return this._makeRequest(`/account/unconfirmedTransactions?address=${addr}`);
  }

  async getTransactions (addr, hash) {
    let url = `/account/transfers/outgoing?address=${addr}`;
    if (hash) 
      url += `&hash=${hash}`;
    return this._makeRequest(url);
  }


  /**
   * @function
   * @description get blockchain current height
   * @return {Promise<*>}
   */
  async getHeight () {
    const data = await this._makeRequest('chain/height');
    return data.height;
  }

}

module.exports = Api;
