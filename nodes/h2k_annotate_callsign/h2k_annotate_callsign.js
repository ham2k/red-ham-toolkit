var callsigns = require('@ham2k/lib-callsigns');
var parseCallsign = callsigns.parseCallsign;
var mergeCallsignInfo = callsigns.mergeCallsignInfo;

var countryFiles = require('@ham2k/lib-country-files');
var annotateFromCountryFile = countryFiles.annotateFromCountryFile;
countryFiles.useBuiltinCountryFile();

module.exports = function (RED) {
    function AnnotateCallsignNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function (msg) {
            var payload = msg.payload;

            function annotate(info) {
                if (!info.baseCall) {
                    info = mergeCallsignInfo(info, parseCallsign(info.call));
                }
                return annotateFromCountryFile(info);
            }

            if (typeof payload === 'string') {
                msg.payload = annotate(parseCallsign(payload));

            } else if (payload && typeof payload === 'object') {
                if (typeof payload.call === 'string') {
                    msg.payload = annotate(payload);

                } else if (payload.their || payload.our) {
                    if (payload.their && typeof payload.their.call === 'string') {
                        annotate(payload.their);
                    }
                    if (payload.our && typeof payload.our.call === 'string') {
                        annotate(payload.our);
                    }

                } else {
                    node.warn('h2k_annotate_callsign: unrecognised payload shape');
                    return;
                }

            } else {
                node.warn('h2k_annotate_callsign: payload must be a string or object');
                return;
            }

            node.send(msg);
        });
    }

    RED.nodes.registerType('h2k_annotate_callsign', AnnotateCallsignNode);
};
