/// <reference path="../../definitions/vsts-task-lib.d.ts" />
/// <reference path="../../definitions/node.d.ts" />
/// <reference path="../../definitions/Q.d.ts" />


import fs = require('fs');
import os = require('os');
import path = require('path');
import tl = require('vsts-task-lib/task');
import url = require('url');


var win = os.type().match(/^Win/);
tl.debug('win: ' + win);

var repoRoot: string = tl.getVariable('build.sourcesDirectory');
function makeAbsolute(normalizedPath: string): string {
    tl.debug('makeAbsolute:' + normalizedPath);

    var result = normalizedPath;
    if (!path.isAbsolute(normalizedPath)) {
        result = path.join(repoRoot, normalizedPath);
        tl.debug('Relative file path: ' + normalizedPath + ' resolving to: ' + result);
    }
    return result;
}

function failTask(message: string) {
    tl.setResult(tl.TaskResult.Failed, message);
}

// server endpoint
var serverEndpoint = tl.getInput('serverEndpoint', true);
var serverEndpointUrl : url.Url = url.parse(tl.getEndpointUrl(serverEndpoint, false));

var serverEndpointAuth = tl.getEndpointAuthorization(serverEndpoint, false);
var username = serverEndpointAuth['parameters']['username'];
var password = serverEndpointAuth['parameters']['password'];

// the root location which will be uploaded from
var rootFolder: string = makeAbsolute(path.normalize(tl.getPathInput('rootFolder', true).trim()));
if (!tl.exist(rootFolder)) {
    failTask('The specified root folder: ' + rootFolder + ' does not exist.');
}

var clean: boolean = tl.getBoolInput('clean', true);
var overwrite: boolean = tl.getBoolInput('overwrite', true);
var flatten: boolean = tl.getBoolInput('flatten', true);

function findFiles(): string[] {
    tl.debug('Searching for files to upload');

    var rootFolderStats = tl.stats(rootFolder);
    if (rootFolderStats.isFile()) {
        var file = rootFolder;
        tl.debug(file + ' is a file. Ignoring all file patterns');
        var parent = path.normalize(path.dirname(file));
        return [parent, file];
    }

    var allFiles = tl.find(rootFolder);

    // filePatterns is a multiline input containing glob patterns
    var filePatterns: string[] = tl.getDelimitedInput('filePatterns', '\n', true);

    for (var i = 0; i < filePatterns.length; i++) {
        if (filePatterns[i] == '*') {
            tl.debug('* matching everything, total: ' + allFiles);
            return allFiles;
        }
    }

    tl.debug('using: ' + filePatterns.length + ' filePatterns: ' + filePatterns + ' to search for files.');

    // minimatch options
    var matchOptions = { matchBase: true };
    if (win) {
        matchOptions["nocase"] = true;
    }

    tl.debug('Candidates found for match: ' + allFiles.length);
    for (var i = 0; i < allFiles.length; i++) {
        tl.debug('file: ' + allFiles[i]);
    }

    // use a set to avoid duplicates
    var SortedSet = require('collections/sorted-set');
    var matchingFilesSet = new SortedSet();

    for (var i = 0; i < filePatterns.length; i++) {
        var normalizedPattern: string = path.join(rootFolder, path.normalize(filePatterns[i]));

        tl.debug('searching for files, pattern: ' + normalizedPattern);

        var matched = tl.match(allFiles, normalizedPattern, matchOptions);
        tl.debug('Found total matches: ' + matched.length);
        // ensure each result is only added once
        for (var j = 0; j < matched.length; j++) {
            var match = path.normalize(matched[j]);
            if (matchingFilesSet.add(match)) {
                var stats = tl.stats(match);
                tl.debug('adding ' + (stats.isFile() ? 'file:   ' : 'folder: ') + match);
                if (stats.isFile()) {
                    var parent = path.normalize(path.dirname(match));
                    if (matchingFilesSet.add(parent)) {
                        tl.debug('adding folder:' + parent);
                    }
                }
            }
        }
    }
    return matchingFilesSet.sorted();
}

var remotePath = tl.getInput('remotePath', true).trim();

var Client = require('ftp');
var c = new Client();

var files = findFiles();

var filesUploaded: number = 0;
var filesSkipped: number = 0; // already exists and overwrite mode off
var directoriesCreated: number = 0;
var directoriesSkipped: number = 0; // already exists

function checkDone(): void {
    var total: number = filesUploaded + filesSkipped + directoriesCreated + directoriesSkipped;
    var remaining: number = files.length - total;
    tl.debug(
        'filesUploaded: ' + filesUploaded +
        ', filesSkipped: ' + filesUploaded +
        ', directoriesCreated: ' + directoriesCreated +
        ', directoriesSkipped: ' + directoriesSkipped +
        ', total: ' + total + ', remaining: ' + remaining);
    if (remaining == 0) {
        c.end();
        tl.setResult(tl.TaskResult.Succeeded,
            'Ftp upload successful' +
            '\nhost: ' + serverEndpointUrl.host +
            '\npath: ' + remotePath +
            '\n files uploaded: ' + filesUploaded +
            '\n files skipped: ' + filesSkipped +
            '\n directories created: ' + directoriesCreated +
            '\n directories skipped: ' + directoriesSkipped
        );
    }
}


function uploadFiles() {
    var Set = require('collections/set');
    var createdDirectories = new Set();

    tl.debug('connected to ftp host:' + serverEndpointUrl.host);
    tl.debug('files to process: ' + files.length);

    if (flatten) {
        //all directories are skipped, so only need to create the root.
        createRemoteDirectory(remotePath);
    }

    files.forEach((file) => {
        tl.debug('file: ' + file);
        var remoteFile: string = flatten ?
            path.join(remotePath, path.basename(file)) :
            path.join(remotePath, file.substring(rootFolder.length));
        tl.debug('remoteFile: ' + remoteFile);

        var stats = tl.stats(file);
        //ensure directory is created
        if (stats.isDirectory()) {
            if(!flatten){
                createRemoteDirectory(remoteFile);
            } else {
                tl.debug('skipping remote directory: ' + remoteFile);
                directoriesSkipped++;
                checkDone();
            }
        }
        if (stats.isFile()) { // upload files
            if (overwrite) {
                uploadFile(file, remoteFile);
            } else {
                //todo optimize directory reading so it is only done once
                var remoteDirname = path.normalize(path.dirname(remoteFile));
                var remoteBasename = path.basename(remoteFile);
                c.list(remoteDirname, function (err, list) {
                    for (var remote of list) {
                        if (remote.name == remoteBasename) {
                            tl.debug('skipping file: ' + file + ' remote: ' + remoteFile + ' because it already exists');
                            filesSkipped++;
                            checkDone();
                            return;
                        }
                    }
                    uploadFile(file, remoteFile);
                });
            }
        }
    });
}

function createRemoteDirectory(remoteDirectory: string) {
    tl.debug('creating remote directory: ' + remoteDirectory);
    c.mkdir(remoteDirectory, true, function (err) {
        if (err) {
            c.end();
            failTask('Unable to create remote directory: ' + remoteDirectory + ' due to error: ' + err);
        }
        tl.debug('remote directory successfully created: ' + remoteDirectory);
        if(!flatten){ //
            directoriesCreated++;
        }
        checkDone();
    });
}

function uploadFile(file: string, remoteFile) {
    tl.debug('uploading file: ' + file + ' remote: ' + remoteFile);
    c.put(file, remoteFile, function (err) {
        if (err) {
            c.end();
            failTask('upload failed: ' + remoteFile + ' due to error: ' + err);
        } else {
            tl.debug('successfully uploaded: ' + remoteFile);
            filesUploaded++;
            checkDone();
        }
    });
}

c.on('ready', function () {
    if (clean) {
        tl.debug('cleaning remote: ' + remotePath);
        c.rmdir(remotePath, true, function (err) {
            if (err) {
                c.destroy();
                failTask('Unable to clean remote folder: ' + remotePath + ' error: ' + err);
            }
            uploadFiles();
        });
    } else {
        tl.debug('skipping clean: ' + remotePath);
        uploadFiles();
    }
});

var secure = serverEndpointUrl.protocol == 'ftps:' ? true : false;
tl.debug('secure ftp=' + secure);

c.connect({ 'host': serverEndpointUrl.host, 'user': username, 'password': password, 'secure': secure });


