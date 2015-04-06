var fs = require('fs');
var aws = require('aws-sdk');
var marked = require('marked');
var async = require('async');
var config = require('config');
var mustache = require('mustache');
var highlight = require('highlight.js');
var s3 = new aws.S3({apiVersion: '2006-03-01'});

exports.handler = function(event, context) {
   console.log('Received event:');
   console.log(JSON.stringify(event, null, '  '));

   // Get the object from the event and show its content type
    var bucket = event.Records[0].s3.bucket.name;
    var key = event.Records[0].s3.object.key;

    // ignore the .config folder
    // if (key.split('/')) {
    //     context.done(null, 'Nothing to do ...');
    // }

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
                    return highlight.highlightAuto(code).value;
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
                    callback(null);
                }
            });
        },
        // The navigatio needs to be updated
        function(callback) {
            console.log('navigation');
            // get the .menu file

            // get all the objects in the bucket
            var params = {
                Bucket: config.targetBucket,
                EncodingType: 'url',
                MaxKeys: 1000,
            };

            s3.listObjects(params, function(err, data) {
                if (err) {
                    callback(err);
                } else {
                    
                    callback(null, data);
                }
            });


        },

        // takes the files from the s3 bucket
        function(data, callback) {

            var contents = data.Contents;
            var keys = [];

            // get each object in parallel
            async.each(contents, function(object, cb) {
              // Perform operation on file here.
                s3.headObject({
                    Bucket: config.targetBucket, 
                    Key: object.Key
                }, function(err, data) {
                    if (err) {
                        cb(err);
                    } else {
                        // add the Key attribute
                        data.Key = object.Key
                        keys.push(data);
                        cb(null);
                    }
                });

            }, function(err) {
                // if any of the file processing produced an error
                if (err) {
                    callback(err);
                } else {
                    callback(null, keys);
                }
            });



        },

        // takes an array of keys adn builds a tree
        // ["key-name"]: {data}
        function(keys, callback) {
            var tree = [];


            function buildFromSegments(scope, pathSegments, isDir) {
                // Remove the first segment from the path
                var current = pathSegments.shift();

                // See if that segment already exists in the current scope
                var found = findInScope(scope, current);

                // If we did not find a match, create the new object for
                // this path segment
                if (! found) {
                    scope.push(found = {
                        label: current
                    });
                }

                // If there are still path segments left, we need to create
                // a children array (if we haven't already) and recurse further
                if (pathSegments.length) {
                    found.children = found.children || [ ];
                    buildFromSegments(found.children, pathSegments);
                }
            }

            // Attempts to find a ptah segment in the current scope
            function findInScope(scope, find) {
                for (var i = 0; i < scope.length; i++) {
                    if (scope[i].label === find) {
                        return scope[i];
                    }
                }
            }

            keys.forEach(function(data) {
                var key = data.Key;

                // if it ends with a slash its a directory
                var isDir = (key.substr(-1) === '/') ? true : false;
                var parts = data.Key.replace(/\/\s*$/, "").split('/');

                buildFromSegments(tree, parts, isDir);
            });


            console.log(JSON.stringify(tree, null, 4));
            callback(null);



        },

    ], function(err, result) {
        if (err) {
            context.done('error', err);
        } else {
            context.done(null, 'Successfull!');
        } 
    });
};