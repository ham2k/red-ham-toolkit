var dgram = require('dgram');

module.exports = function (RED) {
    function PstRotatorUdp(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        var host = (config.host || '127.0.0.1').trim();
        var port = parseInt(config.port, 10) || 12000;
        var pollInterval = parseInt(config.pollInterval, 10);
        if (!isFinite(pollInterval) || pollInterval < 0) pollInterval = 1000;
        var pollElevation = !!config.pollElevation;

        var socket = null;
        var pollTimer = null;

        // Movement detection state
        var lastAz = null;
        var isMoving = false;
        var MOVE_THRESHOLD = 1.0; // degrees — changes smaller than this are ignored

        function onAzReceived(az) {
            node.status({ fill: 'green', shape: 'dot', text: 'AZ: ' + az.toFixed(1) + '°' });
            node.send({ topic: 'currentAzimuth', payload: az });

            if (lastAz !== null && Math.abs(az - lastAz) >= MOVE_THRESHOLD && !isMoving) {
                isMoving = true;
                sendCmd('<PST>TGA?</PST>');
            }

            // Detect when movement has stopped so the next change is treated as a new move
            if (lastAz !== null && Math.abs(az - lastAz) < MOVE_THRESHOLD) {
                isMoving = false;
            }

            lastAz = az;
        }

        function sendCmd(msg) {
            if (!socket) return;
            var buf = Buffer.from(msg, 'ascii');
            socket.send(buf, 0, buf.length, port, host, function (err) {
                if (err) node.error('UDP send error: ' + err.message);
            });
        }

        function poll() {
            sendCmd('<PST>AZ?</PST>');
            if (pollElevation) sendCmd('<PST>EL?</PST>');
        }

        node.status({ fill: 'grey', shape: 'ring', text: 'initializing' });

        socket = dgram.createSocket('udp4');

        socket.on('error', function (err) {
            node.error('UDP socket error: ' + err.message);
            node.status({ fill: 'red', shape: 'ring', text: err.message });
        });

        socket.on('message', function (msg) {
            var lines = msg.toString('ascii').replace(/\r/g, '\n').split('\n');
            lines.forEach(function (line) {
                line = line.trim();
                if (!line) return;

                var azMatch  = line.match(/^AZ:([\d.]+)/);
                var tgaMatch = line.match(/^TGA:([\d.]+)/);
                var elMatch  = line.match(/^EL:([\d.]+)/);
                var modeMatch = line.match(/^MODE:([01])/);
                var okMatch  = line.match(/^OK:(.+)/);

                if (azMatch) {
                    onAzReceived(parseFloat(azMatch[1]));
                } else if (tgaMatch) {
                    node.send({ topic: 'targetAzimuth', payload: parseFloat(tgaMatch[1]) });
                } else if (elMatch) {
                    node.send({ topic: 'currentElevation', payload: parseFloat(elMatch[1]) });
                } else if (modeMatch) {
                    node.send({ topic: 'mode', payload: modeMatch[1] === '1' ? 'tracking' : 'manual' });
                } else if (okMatch) {
                    node.send({ topic: 'ack', payload: okMatch[1].trim() });
                }
            });
        });

        socket.bind(port + 1, function () {
            socket.setBroadcast(true);
            node.status({ fill: 'yellow', shape: 'ring', text: 'listening on :' + (port + 1) });
            if (pollInterval > 0) {
                poll();
                pollTimer = setInterval(poll, pollInterval);
            }
        });

        node.on('input', function (msg) {
            var topic = (msg.topic || '').toLowerCase().trim();

            if (topic === 'azimuth') {
                var az = parseFloat(msg.payload);
                if (!isFinite(az) || az < 0 || az > 360) {
                    node.warn('Invalid azimuth value: ' + msg.payload);
                    return;
                }
                sendCmd('<PST><AZIMUTH>' + Math.round(az) + '</AZIMUTH></PST>');

            } else if (topic === 'elevation') {
                var el = parseFloat(msg.payload);
                if (!isFinite(el) || el < -90 || el > 90) {
                    node.warn('Invalid elevation value: ' + msg.payload);
                    return;
                }
                sendCmd('<PST><ELEVATION>' + Math.round(el) + '</ELEVATION></PST>');

            } else if (topic === 'stop') {
                sendCmd('<PST><STOP>1</STOP></PST>');

            } else if (topic === 'park') {
                sendCmd('<PST><PARK>1</PARK></PST>');

            } else if (topic === 'track') {
                var t = (msg.payload === true || msg.payload === 1 || msg.payload === '1') ? 1 : 0;
                sendCmd('<PST><TRACK>' + t + '</TRACK></PST>');

            } else if (topic === 'command') {
                if (typeof msg.payload === 'string' && msg.payload.indexOf('<PST>') === 0) {
                    sendCmd(msg.payload);
                } else {
                    node.warn('topic "command" payload must be a string starting with <PST>');
                }

            } else if (typeof msg.payload === 'number' && isFinite(msg.payload)) {
                var azNum = msg.payload;
                if (azNum >= 0 && azNum <= 360) {
                    sendCmd('<PST><AZIMUTH>' + Math.round(azNum) + '</AZIMUTH></PST>');
                } else {
                    node.warn('Bare numeric payload out of azimuth range (0–360): ' + azNum);
                }
            }
        });

        node.on('close', function (done) {
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            if (socket) {
                var s = socket;
                socket = null;
                try { s.close(done); } catch (e) { done(); }
            } else {
                done();
            }
        });
    }

    RED.nodes.registerType('h2k-pstrotator', PstRotatorUdp);
};
