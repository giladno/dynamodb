# dynamodb

Simple DynamoDB wrapper for Node.js

> Note: This is still under active development

## Installation

Requires Node.js 8.6.0+.

```
$ npm install @giladno/dynamodb --save
```

## Usage

```js
const dynamodb = require('@giladno/dynamodb');
const {User} = dynamodb();

User.define({
    attributes: {username: {type: 'S'}},
    throughput: 5,
});

await User.put({username: 'bob', age: 42});
await User.put({username: 'alice', age: 38});

console.log(await User.scan());
```

## API

#### dynamodb([options])

Creates a database instance

-   `options`
    -   `AWS` AWS sdk to use. Defaults to `require('aws-sdk')`.
    -   `waitForActive` How long to wait for an `ACTIVE` state when creating a new table. Defaults to `180000` (3 minutes). Use `0` to disable waiting and `-1` to wait indefinitely.
-   returns: a database instance

#### database

The database instance will automatically create a table instance simply by accessing it:

```js
db.User.get(...);
db.Post.put(...);
```

> Names are case-sensitive. `db.user` and `db.User` will create **different** table names!

#### table.define(schema)

Defines a schema for that table

-   `schema` - `attributes` An object representing attributes/keys for table creation - `type` DynamoDB type (`S`, `N`, `B`) - `range` Set to `true` for `RANGE` key type (default to `HASH` type) - `throughput` Provisioned throughput. Can use a single number for both read/write capacity or an object with `read`/`write` keys. When `throughput` is not defined, this will set billing mode to `PAY_PER_REQUEST`. > `PAY_PER_REQUEST` is not supported when testing locally using **dynamodb-local** - `kms` Optional KMS master key to use.
    > This method is only required if you want to allow the database to create tables implicitly when required. It is not required if you create them yourself (using the CLI/CloudFormation or by calling `table.init`).

#### table.init(schema)

Creates a table in DynamoDB

-   `schema` Same as [table.define](#table.define)
    > This method will be called automatically when trying to access a table which does not exist.

#### table.scan()

Returns all items in the table

#### table.get(key, [options])

Finds a single item by key

#### table.put(data, [options])

Create/update a single item

#### table.update(key, data, [options])

Updates a single item

#### table.delete(data, [options])

Deletes a single item

#### table.destroy([options])

Deletes the table

## TODO

-   [ ] Finish documentation
-   [ ] Add query/filter/projection support

## Contributing

PR's are more than welcome! You can also drop me a line at gilad@novik.ca

## License

MIT
