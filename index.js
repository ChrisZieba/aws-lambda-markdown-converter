exports.handler = function (event, context) {
    console.log('test');
    context.done(null, 'dodgercms-converter complete.');
};