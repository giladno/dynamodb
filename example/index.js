'use strict';
const dynamodb = require('@giladno/dynamodb');
const AWS = require('aws-sdk');

AWS.config.update({endpoint: 'http://localhost:8000'});

(async () => {
    const {User} = dynamodb({AWS});
    User.define({
        attributes: {username: {type: 'S'}},
        throughput: 5,
    });

    await User.put({username: 'bob', age: 42});
    await User.put({username: 'alice', age: 38});

    console.log(await User.scan());
})();
