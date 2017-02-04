var DocumentDb = require('documentdb');
var driver = require('../docdb-driver');
var moment = require('moment');
var OData = require('azure-query-js').Query.Providers.OData;
var formatSql = require('../odata-sql').format;

/**
 * Global Settings Object
 */
// default settings come from: 
//      1) The ../settings.local.json file, if it exists
//      2) The DocumentDb environment variable if it exists (overrides)
var defaultSettings = {
    host: null,
    accountKey: null
};
try {
    defaultSettings = require('../settings.local.json');
} catch(ex) { /* Swallow the error */ }
if (process.env.hasOwnProperty('DocumentDb')) {
    var sp = process.env.DocumentDb.split(';');
    sp.forEach((t) => {
        var tt = t.split('=');
        if (tt[0] === 'AccountEndpoint') defaultSettings.host = tt[1];
        if (tt[0] === 'AccountKey') defaultSettings.accountKey = tt[1];
    })

}

var settings = {
    host: process.env['DocumentDbHost'] || defaultSettings.host,
    accountKey: process.env['DocumentDbAccountKey'] || defaultSettings.accountKey,
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
    var id = req.params.id;

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
    driver.fetchDocument(refs.client, refs.table, id)
    .then((document) => {
        if (typeof document === 'undefined' || document.deleted === true)
            res.status(404).json({ 'error': 'Not Found' });
        else
            res.status(200).json(convertItem(document));
    })
    .catch((error) => {
        res.status(error.code).json(convertError(error));
    });
}

function getAllItems(req, res) {
    var query = OData.fromOData(
        settings.table,         // todoitem
        req.query.$filter,
        req.query.$orderby,
        parseInt(req.query.$skip),
        parseInt(req.query.$top),
        req.query.$select,
        req.query.$inlinecount === 'allpages',
        !!req.query.__includeDeleted);
    var tableConfig = {
        name: settings.table
    };
    var sql = formatSql(OData.toOData(query), tableConfig);
    
    res.status(200).json({ query: req.query, sql: sql, message: 'getAll' });
}

function insertItem(req, res) {
    var item = req.body;

    item.createdAt = moment().toISOString();
    delete item.updatedAt;
    delete item.version;
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
    driver.fetchDocument(refs.client, refs.table, id)
    .then((document) => {
        if (typeof document === 'undefined') {
            res.status(404).json({ 'error': 'Not Found' });
            return;
        }

        var item = req.body, version = new Buffer(document._etag).toString('base64')
        if (item.id !== id) {
            res.status(400).json({ 'error': 'Id does not match' });
            return;
        }

        if (req.headers.hasOwnProperty('if-match') && req.header['if-match'] !== version) {
            res.status(412).json(convertItem(document))
            return;
        }

        if (item.hasOwnProperty('version') && item.version !== version) {
            res.status(409).json(convertItem(document));
            return;
        }

        // Delete the version and updatedAt fields from the doc before submitting
        delete item.updatedAt;
        delete item.version;
        driver.replaceDocument(refs.client, document._self, item)
        .then((updatedDocument) => {
            res.status(200).json(convertItem(updatedDocument));
            return;
        });
    })
    .catch((error) => {
        res.status(error.code).json(convertError(error));
    });
}

function deleteItem(req, res, id) {
    driver.fetchDocument(refs.client, refs.table, id)
    .then((document) => {
        if (typeof document === 'undefined') {
            res.status(404).json({ 'error': 'Not Found' });
            return;
        }

        var item = convertItem(document);
        delete item.updatedAt;
        delete item.version;
        item.deleted = true;
        driver.replaceDocument(refs.client, document._self, item)
        .then((updatedDocument) => {
            res.status(200).json(convertItem(updatedDocument));
            return;
        });
    })
    .catch((error) => {
        res.status(error.code).json(convertError(error));
    });
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
    if (body.hasOwnProperty('message')) {
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
