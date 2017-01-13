module.exports = {
    createDocument: function (client, collectionRef, docObject, callback) {
        client.createDocument(collectionRef._self, docObject, callback);
    }
};