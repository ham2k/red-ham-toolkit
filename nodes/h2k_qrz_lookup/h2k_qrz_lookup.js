var callsigns = require('@ham2k/lib-callsigns');
var parseCallsign = callsigns.parseCallsign;

var QRZ_BASE = 'https://xmldata.qrz.com/xml/current/';
var QRZ_AGENT = 'ham2k-red-toolkit';
var QRZ_TIMEOUT = 5000;

// ── XML helpers ─────────────────────────────────────────────────────────────

function xmlTag(xml, tag) {
    var m = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
    return m ? decodeXmlEntities(m[1].trim()) : '';
}

function decodeXmlEntities(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'").replace(/&quot;/g, '"');
}

// ── Type casts ───────────────────────────────────────────────────────────────

function castString(v) {
    if (v === undefined || v === null) return '';
    return String(v);
}

function castNumber(v) {
    if (v === undefined || v === null || v === '') return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
}

function capitalize(str) {
    if (!str) return '';
    return str.replace(/\b[a-zA-Z]+/g, function (w) {
        // Don't downcase words that look like abbreviations (all-caps ≥ 2 chars)
        if (w.length > 1 && w === w.toUpperCase()) return w;
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

function fetchText(url) {
    return fetch(url, { signal: AbortSignal.timeout(QRZ_TIMEOUT) })
        .then(function (res) { return res.text(); });
}

function buildUrl(params) {
    var qs = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return QRZ_BASE + '?' + qs;
}

// ── Node ─────────────────────────────────────────────────────────────────────

module.exports = function (RED) {
    function QrzLookupNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        var login    = ((node.credentials && node.credentials.login)    || '').trim();
        var password = (node.credentials && node.credentials.password)  || '';
        var sessionKey = null;

        function authenticate() {
            return fetchText(buildUrl({ username: login, password: password, agent: QRZ_AGENT }))
                .then(function (body) {
                    var error = xmlTag(body, 'Error');
                    if (error) throw new Error('QRZ auth: ' + error);
                    var key = xmlTag(body, 'Key');
                    if (!key) throw new Error('QRZ auth: no session key in response');
                    sessionKey = key;
                });
        }

        function doLookup(call) {
            return fetchText(buildUrl({ s: sessionKey, callsign: call, agent: QRZ_AGENT }))
                .then(function (body) {
                    var error = xmlTag(body, 'Error');
                    if (error) {
                        if (/^(Invalid session|Session Timeout|Username \/ password)/i.test(error)) {
                            sessionKey = null;
                            return authenticate().then(function () { return doLookup(call); });
                        }
                        if (/^Not found/i.test(error)) return null;
                        throw new Error('QRZ: ' + error);
                    }

                    var fname    = xmlTag(body, 'fname');
                    var lname    = xmlTag(body, 'name');
                    var nickname = xmlTag(body, 'nickname');
                    var aliases  = xmlTag(body, 'aliases');
                    var xref     = xmlTag(body, 'xref');

                    var name = [
                        capitalize(fname),
                        nickname ? '"' + capitalize(nickname) + '"' : '',
                        capitalize(lname)
                    ].filter(function (x) { return x; }).join(' ');

                    var allCalls = [castString(xmlTag(body, 'call'))]
                        .concat(aliases ? aliases.split(',') : [])
                        .concat(xref ? [xref] : [])
                        .map(function (s) { return s.trim(); })
                        .filter(function (s) { return s; });

                    return {
                        call:       castString(xmlTag(body, 'call')),
                        name:       name,
                        firstName:  castString(fname),
                        lastName:   castString(lname),
                        allCalls:   allCalls,
                        tz:         castString(xmlTag(body, 'TimeZone')),
                        gmtOffset:  castNumber(xmlTag(body, 'GMTOffset')),
                        city:       capitalize(xmlTag(body, 'addr2')),
                        state:      castString(xmlTag(body, 'state')),
                        country:    capitalize(xmlTag(body, 'country')),
                        postal:     castString(xmlTag(body, 'zip')),
                        county:     capitalize(xmlTag(body, 'county')),
                        grid:       castString(xmlTag(body, 'grid')),
                        cqZone:     castNumber(xmlTag(body, 'cqzone')),
                        ituZone:    castNumber(xmlTag(body, 'ituzone')),
                        dxccCode:   castNumber(xmlTag(body, 'dxcc')),
                        lat:        castNumber(xmlTag(body, 'lat')),
                        lon:        castNumber(xmlTag(body, 'lon')),
                        image:      castString(xmlTag(body, 'image')),
                        imageInfo:  (xmlTag(body, 'imageinfo') || '').split(':').filter(function (s) { return s; })
                    };
                });
        }

        function lookupCall(call) {
            if (!sessionKey) {
                return authenticate().then(function () { return doLookup(call); });
            }
            return doLookup(call);
        }

        node.on('input', function (msg) {
            var inputCall;
            var parsedInfo = null;

            if (typeof msg.payload === 'string') {
                inputCall = msg.payload.trim().toUpperCase();
            } else if (msg.payload && typeof msg.payload.call === 'string') {
                inputCall = msg.payload.call.trim().toUpperCase();
            } else {
                node.warn('h2k_qrz_lookup: payload must be a callsign string or { call }');
                return;
            }

            if (!inputCall) {
                node.warn('h2k_qrz_lookup: empty callsign');
                return;
            }

            // Parse callsign if baseCall not already provided
            var baseCall = (msg.payload && msg.payload.baseCall) || null;
            if (!baseCall) {
                parsedInfo = parseCallsign(inputCall);
                baseCall = (parsedInfo && parsedInfo.baseCall) || inputCall;
            }

            if (!login || !password) {
                node.error('h2k_qrz_lookup: QRZ credentials not configured');
                node.status({ fill: 'red', shape: 'ring', text: 'no credentials' });
                return;
            }

            node.status({ fill: 'yellow', shape: 'ring', text: inputCall + '…' });

            lookupCall(inputCall)
                .then(function (data) {
                    // Fall back to baseCall if full call not found and baseCall differs
                    if (!data && baseCall && baseCall !== inputCall) {
                        node.status({ fill: 'yellow', shape: 'ring', text: baseCall + '…' });
                        return lookupCall(baseCall);
                    }
                    return data;
                })
                .then(function (data) {
                    if (!data) {
                        node.status({ fill: 'grey', shape: 'dot', text: inputCall + ' not found' });
                        node.send(null);
                        return;
                    }
                    node.status({ fill: 'green', shape: 'dot', text: inputCall + (data.name ? ' · ' + data.name : '') });
                    if (msg.payload && typeof msg.payload === 'object') {
                        if (parsedInfo) Object.assign(msg.payload, parsedInfo);
                        Object.assign(msg.payload, data);
                    } else {
                        msg.payload = Object.assign({}, parsedInfo || {}, data);
                    }
                    node.send(msg);
                })
                .catch(function (err) {
                    node.error(err.message, msg);
                    node.status({ fill: 'red', shape: 'ring', text: err.message });
                });
        });
    }

    RED.nodes.registerType('h2k_qrz_lookup', QrzLookupNode, {
        credentials: {
            login:    { type: 'text' },
            password: { type: 'password' }
        }
    });
};
