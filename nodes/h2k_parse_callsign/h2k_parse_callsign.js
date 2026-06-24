var callsigns = require('@ham2k/lib-callsigns');
var parseCallsign = callsigns.parseCallsign;
var mergeCallsignInfo = callsigns.mergeCallsignInfo;

module.exports = function (RED) {
    function ParseCallsignNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function (msg) {
            var payload = msg.payload;

            if (typeof payload === 'string') {
                msg.payload = parseCallsign(payload);

            } else if (payload && typeof payload === 'object') {
                if (typeof payload.call === 'string') {
                    msg.payload = mergeCallsignInfo(payload, parseCallsign(payload.call));

                } else if (payload.their || payload.our) {
                    if (payload.their && typeof payload.their.call === 'string') {
                        payload.their = mergeCallsignInfo(payload.their, parseCallsign(payload.their.call));
                    }
                    if (payload.our && typeof payload.our.call === 'string') {
                        payload.our = mergeCallsignInfo(payload.our, parseCallsign(payload.our.call));
                    }

                } else {
                    node.warn('h2k_parse_callsign: unrecognised payload shape');
                    return;
                }

            } else {
                node.warn('h2k_parse_callsign: payload must be a string or object');
                return;
            }

            node.send(msg);
        });
    }

    RED.nodes.registerType('h2k_parse_callsign', ParseCallsignNode);
};
