# middleware-nem-balance-processor [![Build Status](https://travis-ci.org/ChronoBank/middleware-nem-balance-processor.svg?branch=master)](https://travis-ci.org/ChronoBank/middleware-nem-balance-processor)

Middleware service for handling user balance

### Installation

This module is a part of middleware services. You can install it in 2 ways:

1) through core middleware installer  [middleware installer](https://github.com/ChronoBank/middleware)
2) by hands: just clone the repo, do 'npm install', set your .env - and you are ready to go

##### About
This module is used for updating balances for the specified addresses (see a description of addresses manipulation in [rest module](https://github.com/ChronoBank/middleware-nem-rest)).

#### How does it work?

Block processor send message about transaction through rabbitmq to this middleware. Then middleware update balance and assets
for changed accounts. After middleware send message throught rabbitmq with the following format:

```
{ 
 address: 'TCUPVQC77TAMH7QKPFP5OT3TLUV4JYRPV6CEGJXW',
 balance: {
     vested: '1028000004446500',
     confirmed: '1028000004216500',
     unconfirmed: '1028000004216600'
 }
 assets: { 
    "nem:xem" : {
        "unconfirmed" : 6099957,
        "confirmed" : 6099957
    }
},
 tx: {
    blockNumber: 1494527,
    timeStamp: 100607022,
    amount: 1,
    hash: '7cca311d117c9e67c658513ac032219945115af437928552f99ed03d5d3accae',
    recipient: 'TAHZD4PLMR4OX3OLNMJCC726PNLXCJMCFWR2JI3D',
    fee: 100000,
    messagePayload: '48656c6c6f',
    messageType: 1,
    mosaics: null,
    sender: 'TAX7OUHMQSTDXOMYJIKHFILRKOLVYGECG47FPKGQ',
    address: 'TAHZD4PLMR4OX3OLNMJCC726PNLXCJMCFWR2JI3D' 
 }
}
```

### Update user balance, when created

When user is created new in database, while not get transaction with this account,
him balance not updated.
That fixed this problem, need to send message to rabbit mq after created user
in database

exchange name
```
internal
```

queue name
```
<config_rabbit_service_name>_user.created
```

message structure, where address is user address, that created in db
```
{address: <String>}
```


##### сonfigure your .env

To apply your configuration, create a .env file in root folder of repo (in case it's not present already).
Below is the expamle configuration:

```
MONGO_ACCOUNTS_URI=mongodb://localhost:27017/data
MONGO_ACCOUNTS_COLLECTION_PREFIX=nem
RABBIT_URI=amqp://localhost:5672
RABBIT_SERVICE_NAME=app_nem
NETWORK=development
NIS=http://localhost:7890
```

The options are presented below:

| name | description|
| ------ | ------ |
| MONGO_URI   | the URI string for mongo connection
| MONGO_COLLECTION_PREFIX   | the default prefix for all mongo collections. The default value is 'nem'
| MONGO_ACCOUNTS_URI   | the URI string for mongo connection, which holds users accounts (if not specified, then default MONGO_URI connection will be used)
| MONGO_ACCOUNTS_COLLECTION_PREFIX   | the collection prefix for accounts collection in mongo (If not specified, then the default MONGO_COLLECTION_PREFIX will be used)
| RABBIT_URI   | rabbitmq URI connection string
| RABBIT_SERVICE_NAME   | namespace for all rabbitmq queues, like 'app_nem_transaction'
| NETWORK   | network name (alias)- is used for connecting via ipc (see block processor section)
| NIS   | the path to node rest api for get balance for user
| SYSTEM_RABBIT_URI   | rabbitmq URI connection string for infrastructure
| SYSTEM_RABBIT_SERVICE_NAME   | rabbitmq service name for infrastructure
| SYSTEM_RABBIT_EXCHANGE   | rabbitmq exchange name for infrastructure
| CHECK_SYSTEM | check infrastructure or not (default = true)
| CHECK_WAIT_TIME | interval for wait respond from requirements

License
----
 [GNU AGPLv3](LICENSE)

Copyright
----
LaborX PTY
