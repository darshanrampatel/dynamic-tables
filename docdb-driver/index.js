var Promise = require('bluebird');
var collection = require('./collection');
var database = require('./database');
var docops = require('./document');

var dbCache = {};

var createDatabase = Promise.promisify(database.createDatabase);
var findDatabaseById = Promise.promisify(database.findDatabaseById);

function ensureDatabaseExists(client, database) {
    if (database in dbCache) {
        return Promise.resolve(dbCache[database]);
    }

    return findDatabaseById(client, database).then((dbRef) => {
        if (dbRef == null) {
            return createDatabase(client, database).then((result) => {
                dbCache[database] = result;
                return result;
            });
        }
        dbCache[database] = dbRef;
        return dbRef;
    });
}

module.exports = {
    createCollection: Promise.promisify(collection.createCollection),
    listCollections: Promise.promisify(collection.listCollections),
    readCollection: Promise.promisify(collection.readCollection),
    readCollectionById: Promise.promisify(collection.readCollectionById),
    getOfferType: Promise.promisify(collection.getOfferType),
    changeOfferType: Promise.promisify(collection.changeOfferType),
    deleteCollection: Promise.promisify(collection.deleteCollection),

    createDatabase: createDatabase,
    deleteDatabase: Promise.promisify(database.deleteDatabase),
    ensureDatabaseExists: ensureDatabaseExists,
    findDatabaseById: findDatabaseById,
    listDatabases: Promise.promisify(database.listDatabases),
    readDatabase: Promise.promisify(database.readDatabase),
    readDatabases: Promise.promisify(database.readDatabases),

    createDocument: Promise.promisify(docops.createDocument)
};
