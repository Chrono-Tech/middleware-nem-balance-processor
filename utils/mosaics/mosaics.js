const _ = require('lodash'),
  providerService = require('../../services/providerService');

const flattenMosaics = mosObj =>
  _.transform(mosObj, (acc, m) => {
    if (m.mosaicId && m.mosaicId.namespaceId)
      acc[`${m.mosaicId.namespaceId}:${m.mosaicId.name}`] = m.quantity;
  }, {});

const intersectByMosaic = (m1, m2) =>
  _.uniq([..._.keys(flattenMosaics(m1)), ..._.keys(flattenMosaics(m2))]);

const getMosaicDivisibility = async (mosaic) => {

  const provider = await providerService.get();

  mosaic = _.chain(mosaic)
    .toPairs()
    .head()
    .thru(pair => {
      let definition = pair[0].split(':');
      return {
        name: definition[1],
        namespaceId: definition[0],
        quantity: pair[1]
      };
    })
    .value();
  let definition = await provider.getMosaicsDefinition(mosaic.namespaceId);
  return _.chain(definition)
    .get('data')
    .find({mosaic: {id: {name: mosaic.name}}})
    .get('mosaic.properties')
    .find({name: 'divisibility'})
    .get('value', 0)
    .thru(val => parseInt(val))
    .value();

};

module.exports = {
  flattenMosaics,
  intersectByMosaic,
  getMosaicDivisibility
};
