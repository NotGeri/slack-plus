import Utils from './utils.js';
import WebSocket from 'ws';
import {spawn} from 'child_process';

const config = {
    port: null, // Define a custom port here
    debug: false
};

// Attempt to get a free port to use for the debugger sockets
if (!config.port) {
    config.port = await Utils.getFreePort();
    if (!config.port) {
        console.error('Unable to find free port!');
        process.exit(1);
    }
}

// Get the Slack executable's path
const exePath = Utils.getSlackLocation();
if (!exePath) {
    console.error('Unable to locate Slack install!');
    process.exit(1);
}

// Get the content of all custom scripts we want to inject
const scripts = await Utils.readScripts('custom');

// Kill any already running Slack instances
await Utils.killProcess('slack');

// Start new Slack process with the remote debugging flag
const slackProcess = spawn(exePath, [`--remote-debugging-port=${config.port}`]);

// Forward process logs
slackProcess.stdout.on('data', data => {
    if (!config.debug) return;
    console.info(data.toString());
});

slackProcess.stderr.on('data', data => {
    if (!config.debug) return;
    console.error(data.toString());
});

// Stop if our Slack process does
slackProcess.on('close', code => {
    console.warn(`Child process exited with code ${code}`);
    process.exit(code);
});

// Get all remote Electron debugger sockets
const sockets = await Utils.getElectronSockets(config.port);

// Go through each of them and attempt to inject our custom scripts
for (const [id, uri] of Object.entries(sockets)) {
    const wss = new WebSocket(uri);

    // 'Handle' any socket errors
    wss.on('error', err => {
        if (!config.debug) return;
        console.error(`Socket for window ${id} returned error: ${err}`);
    });

    // Listen to when the socket is available
    wss.on('open', () => {
        if (config.debug) {
            console.log(`WS for page ${id} connected: ${uri}`);
        }

        // Go through all scripts and inject them one by one
        for (const [name, content] of Object.entries(scripts)) {
            console.info(`Injecting user script ${name}..`);

            try {
                wss.send(JSON.stringify({
                    'id': 1,
                    'method': 'Runtime.evaluate',
                    'params': {
                        'contextId': 1,
                        'doNotPauseOnExceptionsAndMuteConsole': false,
                        'expression': content,
                        'generatePreview': false,
                        'includeCommandLineAPI': true,
                        'objectGroup': 'console',
                        'returnByValue': false,
                        'userGesture': true
                    }
                }));

            } catch (err) {
                console.error(`Socket for window ${id} returned error: ${err}`);
            }
        }
    });
}