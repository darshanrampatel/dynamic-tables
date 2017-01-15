var DocumentDb = require('documentdb');
var driver = require('../docdb-driver');

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
                res.status(405).json({ error: "Operation not supported", message: `Method ${req.method} not supported`})
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
    res.status(200).json({ id: id, message: "getOne" });
}

function getAllItems(req, res) {
    res.status(200).json({ query: req.query, message: "getAll" });
}

function insertItem(req, res) {
    res.status(200).json({ body: req.body, message: "insert"});
}

function replaceItem(req, res, id) {
    res.status(200).json({ body: req.body, id: id, message: "replace" });
}

function deleteItem(req, res, id) {
    res.status(200).json({ id: id, message: "delete" });
}

module.exports = tableRouter;
