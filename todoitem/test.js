var OData = require('azure-query-js').Query.Providers.OData;
var formatSql = require('../odata-sql').format;
var moment = require('moment');

var req = {
    query: {
        '$filter': "updatedAt ge '2017-02-03T00:00:00.000'",
        '$select': "updatedAt,version,id,title,complete"
    }
};

var settings = {
    'table': 'todoitem'
};

// Code to replace updatedAt <something> '<date>' with the appropriate Code
if (req.query.$filter) {
    while (/updatedAt [a-z]+ '[^']+'/.test(req.query.$filter)) {
        var re = new RegExp(/updatedAt ([a-z]+) '([^']+)'/);
        var results = re.exec(req.query.$filter);
        var newDate = moment(results[2]).unix();
        var newString = `_ts ${results[1]} ${newDate}`;
        req.query.$filter = req.query.$filter.replace(results[0], newString);
    }
}
if (req.query.$select) {
    req.query.$select = req.query.$select.replace(/updatedAt/g, '_ts');
}

var query = OData.fromOData(
    settings.table,
    req.query.$filter,
    req.query.$orderby,
    undefined, //parseInt(req.query.$skip),
    undefined, //parseInt(req.query.$top),
    req.query.$select,
    req.query.$inlinecount === 'allpages',
    !!req.query.__includeDeleted);

var sql = formatSql(OData.toOData(query), {
    containerName: settings.table,
    flavor: 'documentdb'
});

console.log(JSON.stringify(sql, null, 2));