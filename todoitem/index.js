var DocumentDb = require('documentdb');
var driver = require('../docdb-driver');
var moment = require('moment');

/**
 * Global Settings Object
 */
var settings = {
    host: process.env['DocumentDbHost'],
    accountKey: process.env['DocumentDbAccountKey'],
    database: 'AzureMobile',
    connectionPolicy: undefined,
    consistencyLevel: 'Session',
    pricingTier: 'S1',
    table: 'todoitem'
};

// Store any references we receive here as a cache
var refs = {
    initialized: false
};

/**
 * Routes the request to the table controller to the correct method.
 *
 * @param {Function.Context} context - the table controller context
 * @param {Express.Request} req - the actual request
 */
function tableRouter(context, req) {
    var res = context.res;
    var id = context.bindings.id;

    initialize(context).then(() => {
        switch (req.method) {
            case 'GET':
                if (id) {
                    getOneItem(req, res, id);
                } else {
                    getAllItems(req, res);
                }
                break;

            case 'POST':
                insertItem(req, res);
                break;

            case 'PUT':
                replaceItem(req, res, id);
                break;

            case 'DELETE':
                deleteItem(req, res, id);
                break;

            default:
                res.status(405).json({ error: 'Operation not supported', message: `Method ${req.method} not supported`})
        }
    });
}

/**
 * Initialize the DocumentDb Driver
 * @param {Function.Context} context - the table controller context
 * @param {function} context.log - used for logging
 * @returns {Promise}
 */
function initialize(context) {
    if (refs.initialized) {
        context.log('[initialize] Already initialized');
    }

    context.log(`[initialize] Creating DocumentDb client ${settings.host} # ${settings.accountKey}`);
    refs.client = new DocumentDb.DocumentClient(
        settings.host,
        { masterKey: settings.accountKey },
        settings.connectionPolicy,
        settings.consistencyLevel
    );

    context.log(`[initialize] EnsureDatabaseExists ${settings.database}`);
    return driver.ensureDatabaseExists(refs.client, settings.database)
        .then((dbRef) => {
            context.log(`[initialize] Initialized Database ${settings.database}`);
            refs.database = dbRef;

            return driver.listCollections(refs.client, refs.database);
        })
        .then((collections) => {
            context.log(`[initialize] Found ${collections.length} collections`);
            const collection = collections.find(c => { return (c.id === settings.table); });
            context.log(`[initialize] Collection = ${JSON.stringify(collection)}`);
            if (typeof collection !== 'undefined') return collection;
            context.log(`[initialize] Creating collection ${settings.table}`);
            return driver.createCollection(refs.client, settings.pricingTier, refs.database, settings.table);
        })
        .then((collectionRef) => {
            context.log(`[initialize] Found collection`);
            refs.table = collectionRef;
        });

    context.log('[initialize] Finished Initializing Driver');
}

function getOneItem(req, res, id) {
    res.status(200).json({ id: id, message: 'getOne' });
}

function getAllItems(req, res) {
    res.status(200).json({ query: req.query, message: 'getAll' });
}

function insertItem(req, res) {
    // req.body is the JSON object we need to process
    var item = req.body;

    // There are five 'special' fields in a record

    // The following are handled for us - don't do anything!
    //      id - if it is provided, it must not already exist in the database
    //      version - do not provide.  This is provided by the server - this is the _etag field
    //      updatedAt - do not provide.  This is provided by the server - this is the _ts field (converted)

    // The following are not handled for us, so we have to work at them
    //      createdAt - do not provide.  We do this for the user
    item.createdAt = moment().toISOString();
    //      deleted - set to false if it is not provided or is not boolean
    if (!item.hasOwnProperty('deleted')) item.deleted = false;

    driver.createDocument(refs.client, refs.table, item)
    .then((document) => {
        res.status(201).json(convertItem(document));
    })
    .catch((error) => {
        res.status(error.code).json(convertError(error));
    });
}

function replaceItem(req, res, id) {
    res.status(200).json({ body: req.body, id: id, message: 'replace' });
}

function deleteItem(req, res, id) {
    res.status(200).json({ id: id, message: 'delete' });
}

/**
 * Given an item from DocumentDB, convert it into something that the service can used
 * @param {object} item the original item
 * @return {object} the new item
 */
function convertItem(item) {
    if (item.hasOwnProperty('_ts')) {
        item.updatedAt = moment.unix(item._ts).toISOString();
        delete item._ts;
    } else {
        throw new Error('Invalid item - no _ts field');
    }

    if (item.hasOwnProperty('_etag')) {
        item.version = new Buffer(item._etag).toString('base64');
        delete item._etag;
    } else {
        throw new Error('Invalid item - no _etag field');
    }

    // Delete all the known fields from documentdb
    if (item.hasOwnProperty('_rid')) delete item._rid;
    if (item.hasOwnProperty('_self')) delete item._self;
    if (item.hasOwnProperty('_attachments')) delete item._attachments;

    return item;
}

/**
 * Convert a DocumentDB error into something intelligible
 * @param {Error} error the error object
 * @return {object} the intelligible error object
 */
function convertError(error) {
    var body = JSON.parse(error.body);
    if (body.hasOwnProperty("message")) {
        var msg = body.message.replace(/^Message:\s+/, '').split(/\r\n/);
        body.errors = JSON.parse(msg[0]).Errors;

        var addl = msg[1].split(/,\s*/);
        addl.forEach((t) => {
            var tt = t.split(/:\s*/);
            tt[0] = tt[0].replace(/\s/, '').toLowerCase();
            body[tt[0]] = tt[1];
        });

        delete body.message;
    }

    return body;
}

module.exports = tableRouter;
