module.exports = {
    createDocument: function (client, collectionRef, docObject, callback) {
        client.createDocument(collectionRef._self, docObject, callback);
    },

    fetchDocument: function (client, collectionRef, docId, callback) {
        var querySpec = {
            query: 'SELECT * FROM root r WHERE r.id=@id',
            parameters: [{
                name: '@id',
                value: docId
            }]
        };

        client.queryDocuments(collectionRef._self, querySpec).current(callback);
    },

    readDocument: function (client, docLink, options, callback) {
        client.readDocument(docLink, options, callback);
    },

    replaceDocument: function(client, docLink, docObject, callback) {
        client.replaceDocument(docLink, docObject, callback);    
    }
};