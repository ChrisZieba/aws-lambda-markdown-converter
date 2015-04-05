console.log('Loading event');

var fs = require('fs');
var aws = require('aws-sdk');
var marked = require('marked');
var async = require('async');
var config = require('config');
var mustache = require('mustache');
var s3 = new aws.S3({apiVersion: '2006-03-01'});

exports.handler = function(event, context) {
   console.log('Received event:');
   console.log(JSON.stringify(event, null, '  '));

   // Get the object from the event and show its content type
    var bucket = event.Records[0].s3.bucket.name;
    var key = event.Records[0].s3.object.key;

    async.waterfall([
        function(callback) {
            var params = {
                Bucket: bucket, 
                Key: key
            };

            s3.getObject(params, function(err, data) {
                if (err) {
                    callback(err);
                } else {
                    callback(null, data);
                }
            });
        },
        function(data, callback) {
            
            var content = data.Body.toString();
            var options = {
                renderer: new marked.Renderer(),
                gfm: true,
                tables: true,
                breaks: false,
                pedantic: false,
                sanitize: true,
                smartLists: true,
                smartypants: true,
                highlight: function(code) {
                    return require('highlight.js').highlightAuto(code).value;
                }
            };

            marked(content, options, function(err, data) {
                if (err) {
                    callback(err);
                } else {
                    callback(null, data);
                }
            })
            
        },
        // Process the templates
        function(body, callback) {

            var view = {
                body: body
            };

            fs.readFile("./templates/entry.html", "utf8", function(err, data) {
                if (err) {
                    callback(err);
                } else {
                    var output = mustache.render(data.toString(), view);
                    callback(null, output);
                }
            });
        },
        function(html, callback) {
            var metadata = {
                "Content-Type": "text/html"
            };

            var keyNoExtension = key.substr(0, key.lastIndexOf('.')) || key;

            var params = {
                Bucket: config.targetBucket,
                Key: keyNoExtension,
                Body: html,
                ContentType: "text/html",
                Expires: 0,
                CacheControl: "public, max-age=0, no-cache"
            };
            s3.upload(params, function(err, data) {
                if (err) {
                    callback(err);
                } else {
                    console.log('upload successful');
                    callback(null, data);
                }
            });
        }
    ], function(err, result) {
        if (err) {
            context.done('error', err);
        } else {
            context.done(null, 'Successfull!');
        } 
    });
};