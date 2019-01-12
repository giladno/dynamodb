'use strict';

function initWrapper(fn) {
    return async function(...args) {
        try {
            return await fn.apply(this, args);
        } catch (err) {
            if (err.code != 'ResourceNotFoundException') throw err;
            await this.init(this.schema);
            return await fn.apply(this, args);
        }
    };
}

module.exports = ({AWS = require('aws-sdk'), waitForActive = 180000} = {}) => {
    const db = new AWS.DynamoDB();
    const client = new AWS.DynamoDB.DocumentClient();
    const tables = new Map();

    return new Proxy(function() {}, {
        get(target, TableName) {
            return (
                tables.get(TableName) ||
                (() => {
                    const table = new Function(`return class ${TableName} {}`)();

                    table.define = function(schema) {
                        this.schema = schema;
                    };

                    table.init = async function(schema) {
                        if (!schema) throw new Error(`Missing schema definition for ${this.name}`);
                        this.schema = schema;

                        await db
                            .createTable({
                                TableName,
                                ...Object.entries(schema.attributes).reduce(
                                    (
                                        {AttributeDefinitions = [], KeySchema = []},
                                        [AttributeName, {type: AttributeType, range}]
                                    ) => ({
                                        AttributeDefinitions: [...AttributeDefinitions, {AttributeName, AttributeType}],
                                        KeySchema: [...KeySchema, {AttributeName, KeyType: range ? 'RANGE' : 'HASH'}],
                                    }),
                                    {}
                                ),
                                BillingMode: schema.throughput ? 'PROVISIONED' : 'PAY_PER_REQUEST',
                                ProvisionedThroughput: schema.throughput && {
                                    ReadCapacityUnits:
                                        typeof schema.throughput == 'number'
                                            ? schema.throughput
                                            : schema.throughput.read,
                                    WriteCapacityUnits:
                                        typeof schema.throughput == 'number'
                                            ? schema.throughput
                                            : schema.throughput.write,
                                },
                                SSESpecification: schema.kms && {
                                    Enabled: true,
                                    SSEType: 'KMS',
                                    KMSMasterKeyId: schema.kms,
                                },
                            })
                            .promise();

                        for (
                            const start = Date.now();
                            waitForActive < 0 || Date.now() - start < waitForActive;
                            await new Promise(resolve => setTimeout(resolve, 500))
                        ) {
                            const {Table = {}} = await db.describeTable({TableName}).promise();
                            if (Table.TableStatus == 'ACTIVE') return true;
                        }
                        return false;
                    };

                    table.scan = initWrapper(async function() {
                        const {Items} = await client.scan({TableName}).promise();
                        return Items;
                    });

                    table.get = initWrapper(async function(
                        Key,
                        {
                            attribute: AttributesToGet,
                            consistent: ConsistentRead,
                            attributeNames: ExpressionAttributeNames,
                            projection: ProjectionExpression,
                            capacity: ReturnConsumedCapacity,
                        } = {}
                    ) {
                        const {Item} = await client
                            .get({
                                TableName,
                                Key,
                                AttributesToGet,
                                ConsistentRead,
                                ExpressionAttributeNames,
                                ProjectionExpression,
                                ReturnConsumedCapacity,
                            })
                            .promise();
                        return Item || null;
                    });

                    table.put = initWrapper(async function(Item, {returns: ReturnValues} = {}) {
                        const {Attributes} = await client
                            .put({
                                TableName,
                                Item,
                                ReturnValues,
                                ReturnConsumedCapacity: 'NONE',
                                ReturnItemCollectionMetrics: 'NONE',
                            })
                            .promise();
                        return Attributes;
                    });

                    table.update = initWrapper(async function(
                        Key,
                        {$unset = {}, $push = {}, $pop, ...data},
                        {returns: ReturnValues} = {}
                    ) {
                        const {Attributes} = await client
                            .update({
                                TableName,
                                Key,
                                AttributeUpdates: {
                                    ...Object.entries(data).reduce(
                                        (AttributeUpdates, [key, Value]) => ({
                                            ...AttributeUpdates,
                                            [key]: {Action: 'PUT', Value},
                                        }),
                                        {}
                                    ),
                                    ...Object.entries($push).reduce(
                                        (AttributeUpdates, [key, Value]) => ({
                                            ...AttributeUpdates,
                                            [key]: {Action: 'ADD', Value},
                                        }),
                                        {}
                                    ),
                                    ...Object.entries($pop).reduce(
                                        (AttributeUpdates, [key, Value]) => ({
                                            ...AttributeUpdates,
                                            [key]: {Action: 'DELETE', Value},
                                        }),
                                        {}
                                    ),
                                    ...Object.keys($unset).reduce(
                                        (AttributeUpdates, key) => ({
                                            ...AttributeUpdates,
                                            [key]: {Action: 'DELETE'},
                                        }),
                                        {}
                                    ),
                                },
                                ReturnValues,
                                ReturnConsumedCapacity: 'NONE',
                                ReturnItemCollectionMetrics: 'NONE',
                            })
                            .promise();
                        return Attributes;
                    });

                    table.delete = initWrapper(async function(Item, {returns: ReturnValues} = {}) {
                        const {Attributes} = await client
                            .delete({
                                TableName,
                                Item,
                                ReturnValues,
                                ReturnConsumedCapacity: 'NONE',
                                ReturnItemCollectionMetrics: 'NONE',
                            })
                            .promise();
                        return Attributes;
                    });

                    table.destroy = async function({wait = 0} = {}) {
                        try {
                            await db.deleteTable({TableName}).promise();
                            for (
                                const start = Date.now();
                                wait < 0 || Date.now() - start < wait;
                                await new Promise(resolve => setTimeout(resolve, 500))
                            ) {
                                await db.describeTable({TableName}).promise();
                            }
                            return false;
                        } catch (err) {
                            if (err.code == 'ResourceNotFoundException') return true;
                            throw err;
                        }
                    };

                    tables.set(TableName, table);
                    return table;
                })()
            );
        },
    });
};
