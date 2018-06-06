/** 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const request = require('request-promise'),
  {URL} = require('url');

const makeRequest = (url, method, body) => {
  const options = {
    method,
    body,
    uri: url,
    json: true
  };
  return request(options);
};

const createUrl = (providerUri, path) => {
  return new URL(path, providerUri);
};


/**
 * 
 * @param {ProviderService} providerService 
 * @return {Object with functions}
 */
module.exports = (providerService) => {
  
  const createProviderUrl = async (path) => {
    const provider = await providerService.getProvider();
    return createUrl(provider.getHttp(), path);
  };

  const post = async (path, body) => {
    const providerUrl = await createProviderUrl(path);
    return await makeRequest(providerUrl, 'POST', body);
  };

  const get = async (path) => {
    const providerUrl = await createProviderUrl(path);
    return await makeRequest(providerUrl, 'GET');
  };


  return {
    async getMosaicsForAccount (addr) { 
      return get(`/account/mosaic/owned?address=${addr}`);
    },
    async getMosaicsDefinition (id) {
      return get(`/namespace/mosaic/definition/page?namespace=${id}`);
    },
    async getAccount (addr) { 
      return get(`/account/get?address=${addr}`);
    },
    async getUnconfirmedTransactions (addr) {
      return get(`/account/unconfirmedTransactions?address=${addr}`);
    },

    async getBlock (blockHeight) {
      return post('/block/at/public', {height: blockHeight});
    }
    
  };
};
