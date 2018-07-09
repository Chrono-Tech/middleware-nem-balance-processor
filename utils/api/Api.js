const EventEmitter = require('events'),
  Promise = require('bluebird'),
  request = require('request-promise'),
  URL = require('url').URL,
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
    const stompOver = Stomp.over ? Stomp.over : Stomp.default.over;
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

  async getMosaicsForAccount (addr) {
    return this._makeRequest(`/account/mosaic/owned?address=${addr}`);
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

}

module.exports = Api;
