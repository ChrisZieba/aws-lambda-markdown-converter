exports.handler = function (event, context) {
    console.log(event.object);
    context.done(null, 'dodgercms-converter complete.');
};