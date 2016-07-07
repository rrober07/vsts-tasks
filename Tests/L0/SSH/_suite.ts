/// <reference path="../../../definitions/mocha.d.ts"/>
/// <reference path="../../../definitions/node.d.ts"/>

import assert = require('assert');
import trm = require('../../lib/taskRunner');
import path = require('path');

function setResponseFile(name: string) {
    process.env['MOCK_RESPONSES'] = path.join(__dirname, name);
}

describe('SSH Suite', function() {
    this.timeout(20000);

    before((done) => {
        // init here
        done();
    });

    after(function () {

    });
    it('SSH with default inputs', (done) => {
        setResponseFile('responseEndpoint.json');

        var tr = new trm.TaskRunner('SSH', true, true);
        tr.setInput('sshEndpoint', 'IDValidKey');

        tr.run()
            .then(() => {
                assert(tr.invokedToolCount == 0, 'should not have run any tools');
                assert(tr.succeeded, 'task should have succeeded, connection should not attempted as no commands are set to run.');
                done();
            })
        .fail((err) => {
                done(err);
            });
    })
    it('Fails for missing endpoint', (done) => {
        setResponseFile('responseEndpoint.json');

        var tr = new trm.TaskRunner('SSH', true, true);

        tr.run()
            .then(() => {
                assert(tr.invokedToolCount == 0, 'should not have run any tools');
                assert(tr.resultWasSet, 'task should have set a result');
                assert(tr.stderr.length > 0, 'should have written to stderr');
                assert(tr.failed, 'task should have failed');
                assert(tr.stderr.indexOf('Input required: sshEndpoint') >= 0, 'wrong error message: "' + tr.stderr + '"');
                done();
            })
            .fail((err) => {
                done(err);
            });
    })
    it('Fails for invalid private key', (done) => {
        setResponseFile('responseEndpoint.json');
        var tr = new trm.TaskRunner('SSH', true, true);
        tr.setInput('sshEndpoint', 'IDInvalidKey');
        tr.setInput('commands', 'ls -l');

        tr.run()
            .then(() => {
                assert(tr.invokedToolCount == 0, 'should not have run any tools');
                assert(tr.resultWasSet, 'task should have set a result');
                assert(tr.stderr.length > 0, 'should have written to stderr');
                assert(tr.failed, 'task should have failed');
                assert(tr.stderr.indexOf('Failed to connect to remote machine. Verify the SSH endpoint details.') >= 0, 'wrong error message: "' + tr.stderr + '"');
                assert(tr.stderr.indexOf('Cannot parse privateKey: Unsupported key format') >= 0, 'wrong error message: "' + tr.stderr + '"');
                done();
            })
            .fail((err) => {
                done(err);
            });
    })
    it('Fails when user name is not provided in the endpoint', (done) => {
        setResponseFile('responseEndpoint.json');
        var tr = new trm.TaskRunner('SSH', true, true);
        tr.setInput('sshEndpoint', 'IDUserNameNotSet');
        tr.setInput('commands', 'ls -l');

        tr.run()
            .then(() => {
                assert(tr.invokedToolCount == 0, 'should not have run any tools');
                assert(tr.resultWasSet, 'task should have set a result');
                assert(tr.stderr.length > 0, 'should have written to stderr');
                assert(tr.failed, 'task should have failed');
                assert(tr.stderr.indexOf('Endpoint auth not present: IDUserNameNotSet') >= 0, 'wrong error message: "' + tr.stderr + '"');
                done();
            })
            .fail((err) => {
                done(err);
            });
    })
    it('Empty password/passphrase is valid in the endpoint', (done) => {
        setResponseFile('responseEndpoint.json');
        var tr = new trm.TaskRunner('SSH', true, true);
        tr.setInput('sshEndpoint', 'IDPasswordNotSet');

        tr.run()
            .then(() => {
                assert(tr.invokedToolCount == 0, 'should not have run any tools');
                assert(tr.succeeded, 'task should not have errors');
                done();
            })
            .fail((err) => {
                done(err);
            });
    })
    it('Fails when host is not provided in the endpoint', (done) => {
        setResponseFile('responseEndpoint.json');
        var tr = new trm.TaskRunner('SSH', true, true);
        tr.setInput('sshEndpoint', 'IDHostNotSet');
        tr.setInput('commands', 'ls -l');

        tr.run()
            .then(() => {
                assert(tr.invokedToolCount == 0, 'should not have run any tools');
                assert(tr.resultWasSet, 'task should have set a result');
                assert(tr.stderr.length > 0, 'should have written to stderr');
                assert(tr.failed, 'task should have failed');
                assert(tr.stderr.indexOf('Endpoint data not present: IDHostNotSet') >= 0, 'wrong error message: "' + tr.stderr + '"');
                done();
            })
            .fail((err) => {
                done(err);
            });
    })
    it('When port is not provided in the endpoint, 22 is used as default port number', (done) => {
        setResponseFile('responseEndpoint.json');
        var tr = new trm.TaskRunner('SSH', true, true);
        tr.setInput('sshEndpoint', 'IDPortNotSet');

        tr.run()
            .then(() => {
                assert(tr.invokedToolCount == 0, 'should not have run any tools');
                assert(tr.stdout.indexOf('Using port 22 which is the default for SSH since no port was specified.') >= 0, 'default port 22 was not used');
                done();
            })
            .fail((err) => {
                done(err);
            });
    })
    it('Fails when connection cannot be made with given details', (done) => {
        setResponseFile('responseEndpoint.json');
        var tr = new trm.TaskRunner('SSH', true, true);
        tr.setInput('sshEndpoint', 'IDValidKey');
        tr.setInput('commands', 'ls -l');

        tr.run()
            .then(() => {
                assert(tr.invokedToolCount == 0, 'should not have run any tools');
                assert(tr.resultWasSet, 'task should have set a result');
                assert(tr.stderr.length > 0, 'should have written to stderr');
                assert(tr.failed, 'task should have failed');
                assert(tr.stderr.indexOf('Failed to connect to remote machine. Verify the SSH endpoint details.') >= 0, 'wrong error message: "' + tr.stderr + '"');
                done();
            })
            .fail((err) => {
                done(err);
            });
    })
});