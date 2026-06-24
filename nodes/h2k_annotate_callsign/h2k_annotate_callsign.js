var callsigns = require('@ham2k/lib-callsigns');
var parseCallsign = callsigns.parseCallsign;
var mergeCallsignInfo = callsigns.mergeCallsignInfo;

// lib-country-files and its dependency lib-cqmag-data are ESM-only packages.
// Dynamic import() is the correct way to load ESM from a CommonJS module.
var _annotateFromCountryFile = null;
var _initPromise = import('@ham2k/lib-country-files').then(function (m) {
    m.useBuiltinCountryFile();
    _annotateFromCountryFile = m.annotateFromCountryFile;
});

module.exports = function (RED) {
    function AnnotateCallsignNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        node.on('input', function (msg) {
            _initPromise.then(function () {
                var payload = msg.payload;

                function annotate(info) {
                    if (!info.baseCall) {
                        info = mergeCallsignInfo(info, parseCallsign(info.call));
                    }
                    return _annotateFromCountryFile(info);
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
            }).catch(function (err) {
                node.error('h2k_annotate_callsign: failed to load country file data: ' + err.message, msg);
            });
        });
    }

    RED.nodes.registerType('h2k_annotate_callsign', AnnotateCallsignNode);
};
