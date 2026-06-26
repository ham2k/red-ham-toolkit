var dgram = require('dgram');

var MAGIC  = 0xadbccbda;
var SCHEMA = 2;

// ── Primitive readers ──────────────────────────────────────────────────────
// Each returns { value, next } where next is the offset after the read.

function readUInt8(buf, off)  { return { value: buf.readUInt8(off),           next: off + 1 }; }
function readBool(buf, off)   { return { value: buf.readUInt8(off) !== 0,     next: off + 1 }; }
function readUInt32(buf, off) { return { value: buf.readUInt32BE(off),        next: off + 4 }; }
function readInt32(buf, off)  { return { value: buf.readInt32BE(off),         next: off + 4 }; }
function readDouble(buf, off) { return { value: buf.readDoubleBE(off),        next: off + 8 }; }

function readUInt64(buf, off) {
    return { value: buf.readBigUInt64BE(off), next: off + 8 };
}

function readInt64(buf, off) {
    return { value: buf.readBigInt64BE(off), next: off + 8 };
}

function readString(buf, off) {
    var len = buf.readUInt32BE(off);
    off += 4;
    if (len === 0xFFFFFFFF) return { value: '', next: off };
    var value = buf.slice(off, off + len).toString('utf8');
    return { value: value, next: off + len };
}

// Qt QDateTime: int64 Julian Day + uint32 ms-since-midnight + uint8 time-spec
function readDateTime(buf, off) {
    var jd = buf.readBigInt64BE(off);
    off += 8;
    var ms = buf.readUInt32BE(off);
    off += 4;
    off += 1; // time spec byte
    // Julian Day 2440588 = 1970-01-01; JD starts at noon so subtract half-day
    var unixMs = (jd - 2440588n) * 86400000n - 43200000n + BigInt(ms);
    return { value: new Date(Number(unixMs)).toISOString(), next: off };
}

// uint32 ms since midnight UTC → "HH:MM:SS"
function readTimeOfDay(buf, off) {
    var ms = buf.readUInt32BE(off);
    var s  = Math.floor(ms / 1000);
    var hh = Math.floor(s / 3600);
    var mm = Math.floor((s % 3600) / 60);
    var ss = s % 60;
    var value = ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2) + ':' + ('0' + ss).slice(-2);
    return { value: value, next: off + 4 };
}

// ── Incoming message parsers ───────────────────────────────────────────────

function parseHeartbeat(id, buf, off) {
    var r;
    r = readUInt32(buf, off); var maxSchema = r.value; off = r.next;
    r = readString(buf, off); var version   = r.value; off = r.next;
    r = readString(buf, off); var revision  = r.value; off = r.next;
    return { topic: 'heartbeat', payload: { id: id, maxSchemaNumber: maxSchema, version: version, revision: revision } };
}

function parseStatus(id, buf, off) {
    var r;
    r = readUInt64(buf, off); var dialFrequency = Number(r.value); off = r.next;
    r = readString(buf, off); var mode          = r.value; off = r.next;
    r = readString(buf, off); var dxCall        = r.value; off = r.next;
    r = readString(buf, off); var report        = r.value; off = r.next;
    r = readString(buf, off); var txMode        = r.value; off = r.next;
    r = readBool(buf, off);   var txEnabled     = r.value; off = r.next;
    r = readBool(buf, off);   var transmitting  = r.value; off = r.next;
    r = readBool(buf, off);   var decoding      = r.value; off = r.next;
    r = readUInt32(buf, off); var rxDF          = r.value; off = r.next;
    r = readUInt32(buf, off); var txDF          = r.value; off = r.next;
    r = readString(buf, off); var deCall        = r.value; off = r.next;
    r = readString(buf, off); var deGrid        = r.value; off = r.next;
    r = readString(buf, off); var dxGrid        = r.value; off = r.next;
    r = readBool(buf, off);   var txWatchdog    = r.value; off = r.next;
    r = readString(buf, off); var subMode       = r.value; off = r.next;
    r = readBool(buf, off);   var fastMode      = r.value; off = r.next;
    r = readUInt8(buf, off);  var specialMode   = r.value; off = r.next;
    r = readUInt32(buf, off); var freqTolerance = r.value; off = r.next;
    r = readUInt32(buf, off); var trPeriod      = r.value; off = r.next;
    r = readString(buf, off); var configName    = r.value; off = r.next;
    r = readString(buf, off); var txMessage     = r.value; off = r.next;
    return { topic: 'status', payload: {
        id: id, dialFrequency: dialFrequency, mode: mode, dxCall: dxCall,
        report: report, txMode: txMode, txEnabled: txEnabled, transmitting: transmitting,
        decoding: decoding, rxDF: rxDF, txDF: txDF, deCall: deCall, deGrid: deGrid,
        dxGrid: dxGrid, txWatchdog: txWatchdog, subMode: subMode, fastMode: fastMode,
        specialMode: specialMode, freqTolerance: freqTolerance, trPeriod: trPeriod,
        configName: configName, txMessage: txMessage
    }};
}

function parseDecode(id, buf, off) {
    var r;
    r = readBool(buf, off);      var isNew       = r.value; off = r.next;
    r = readTimeOfDay(buf, off); var time        = r.value; off = r.next;
    r = readInt32(buf, off);     var snr         = r.value; off = r.next;
    r = readDouble(buf, off);    var deltaTime   = r.value; off = r.next;
    r = readUInt32(buf, off);    var deltaFreq   = r.value; off = r.next;
    r = readString(buf, off);    var mode        = r.value; off = r.next;
    r = readString(buf, off);    var message     = r.value; off = r.next;
    r = readBool(buf, off);      var lowConf     = r.value; off = r.next;
    r = readBool(buf, off);      var offAir      = r.value; off = r.next;
    return { topic: 'decode', payload: {
        id: id, new: isNew, time: time, snr: snr, deltaTime: deltaTime,
        deltaFreq: deltaFreq, mode: mode, message: message,
        lowConfidence: lowConf, offAir: offAir
    }};
}

function parseClear(id, buf, off) {
    var window = (off < buf.length) ? buf.readUInt8(off) : 0;
    return { topic: 'clear', payload: { id: id, window: window } };
}

function parseQsoLogged(id, buf, off) {
    var r;
    r = readDateTime(buf, off); var timeOff      = r.value; off = r.next;
    r = readString(buf, off);   var dxCall       = r.value; off = r.next;
    r = readString(buf, off);   var dxGrid       = r.value; off = r.next;
    r = readUInt64(buf, off);   var txFrequency  = Number(r.value); off = r.next;
    r = readString(buf, off);   var mode         = r.value; off = r.next;
    r = readString(buf, off);   var reportSent   = r.value; off = r.next;
    r = readString(buf, off);   var reportRcvd   = r.value; off = r.next;
    r = readString(buf, off);   var txPower      = r.value; off = r.next;
    r = readString(buf, off);   var comments     = r.value; off = r.next;
    r = readString(buf, off);   var name         = r.value; off = r.next;
    r = readDateTime(buf, off); var timeOn       = r.value; off = r.next;
    r = readString(buf, off);   var operatorCall = r.value; off = r.next;
    r = readString(buf, off);   var myCall       = r.value; off = r.next;
    r = readString(buf, off);   var myGrid       = r.value; off = r.next;
    r = readString(buf, off);   var exchSent     = r.value; off = r.next;
    r = readString(buf, off);   var exchRcvd     = r.value; off = r.next;
    r = readString(buf, off);   var adifPropMode = r.value; off = r.next;
    return { topic: 'qso_logged', payload: {
        id: id, timeOff: timeOff, dxCall: dxCall, dxGrid: dxGrid,
        txFrequency: txFrequency, mode: mode, reportSent: reportSent,
        reportReceived: reportRcvd, txPower: txPower, comments: comments,
        name: name, timeOn: timeOn, operatorCall: operatorCall,
        myCall: myCall, myGrid: myGrid, exchangeSent: exchSent,
        exchangeReceived: exchRcvd, adifPropMode: adifPropMode
    }};
}

function parseWsprDecode(id, buf, off) {
    var r;
    r = readBool(buf, off);      var isNew     = r.value; off = r.next;
    r = readTimeOfDay(buf, off); var time      = r.value; off = r.next;
    r = readInt32(buf, off);     var snr       = r.value; off = r.next;
    r = readDouble(buf, off);    var deltaTime = r.value; off = r.next;
    r = readUInt64(buf, off);    var frequency = Number(r.value); off = r.next;
    r = readInt32(buf, off);     var drift     = r.value; off = r.next;
    r = readString(buf, off);    var callsign  = r.value; off = r.next;
    r = readString(buf, off);    var grid      = r.value; off = r.next;
    r = readInt32(buf, off);     var power     = r.value; off = r.next;
    r = readBool(buf, off);      var offAir    = r.value; off = r.next;
    return { topic: 'wspr_decode', payload: {
        id: id, new: isNew, time: time, snr: snr, deltaTime: deltaTime,
        frequency: frequency, drift: drift, callsign: callsign,
        grid: grid, power: power, offAir: offAir
    }};
}

function parseLoggedAdif(id, buf, off) {
    var r = readString(buf, off);
    return { topic: 'logged_adif', payload: { id: id, adif: r.value } };
}

function parse(buf) {
    if (buf.length < 12) return null;
    if (buf.readUInt32BE(0) !== MAGIC) return null;
    var type = buf.readUInt32BE(8);
    var r = readString(buf, 12);
    var id = r.value;
    var off = r.next;
    try {
        switch (type) {
            case 0:  return parseHeartbeat(id, buf, off);
            case 1:  return parseStatus(id, buf, off);
            case 2:  return parseDecode(id, buf, off);
            case 3:  return parseClear(id, buf, off);
            case 5:  return parseQsoLogged(id, buf, off);
            case 6:  return { topic: 'close', payload: { id: id } };
            case 10: return parseWsprDecode(id, buf, off);
            case 12: return parseLoggedAdif(id, buf, off);
            default: return null;
        }
    } catch (e) {
        return null;
    }
}

// ── Outgoing command builders ──────────────────────────────────────────────

function wUInt8(v) {
    var b = Buffer.alloc(1); b.writeUInt8(v & 0xff, 0); return b;
}
function wBool(v) { return wUInt8(v ? 1 : 0); }
function wUInt32(v) {
    var b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0, 0); return b;
}
function wInt32(v) {
    var b = Buffer.alloc(4); b.writeInt32BE(v | 0, 0); return b;
}
function wUInt64(v) {
    var b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(v), 0); return b;
}
function wDouble(v) {
    var b = Buffer.alloc(8); b.writeDoubleBE(v, 0); return b;
}
function wString(s) {
    if (s === null || s === undefined || s === '') {
        return wUInt32(0xFFFFFFFF);
    }
    var bytes = Buffer.from(String(s), 'utf8');
    return Buffer.concat([wUInt32(bytes.length), bytes]);
}

function buildHeader(type, id) {
    return Buffer.concat([
        wUInt32(MAGIC),
        wUInt32(SCHEMA),
        wUInt32(type),
        wString(id)
    ]);
}

// Type 8 — Halt TX
function buildHaltTx(id, autoOnly) {
    return Buffer.concat([buildHeader(8, id), wBool(autoOnly)]);
}

// Type 4 — Reply (to a Decode payload)
// p must have: time (HH:MM:SS), snr, deltaTime, deltaFreq, mode, message, lowConfidence
function buildReply(id, p) {
    // Convert "HH:MM:SS" time back to ms since midnight
    var timeParts = (p.time || '00:00:00').split(':').map(Number);
    var timeMs = (timeParts[0] * 3600 + timeParts[1] * 60 + (timeParts[2] || 0)) * 1000;
    return Buffer.concat([
        buildHeader(4, id),
        wUInt32(timeMs),
        wInt32(p.snr || 0),
        wDouble(p.deltaTime || 0),
        wUInt32(p.deltaFreq || 0),
        wString(p.mode || ''),
        wString(p.message || ''),
        wBool(p.lowConfidence || false),
        wUInt8(0) // Modifiers (no modifier key)
    ]);
}

// Type 9 — Free Text
function buildFreeText(id, text, send) {
    return Buffer.concat([buildHeader(9, id), wString(text), wBool(send)]);
}

// Type 13 — Highlight Callsign
// p: { callsign, backgroundColor (CSS hex), foregroundColor (CSS hex), highlight (bool), reset (bool) }
function buildHighlightCallsign(id, callsign, p) {
    // WSJT-X uses QColor: 1 byte spec (1=RGB), 2 bytes alpha+R, G, B — or 0 for invalid (no color)
    function wColor(hex) {
        if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
            // invalid = no color
            return Buffer.concat([wUInt8(0)]);
        }
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        // QColor in DataStream: spec(1 byte) + alpha(2 bytes) + r + g + b (2 bytes each for 16-bit)
        var buf = Buffer.alloc(9);
        buf.writeUInt8(1, 0);           // spec: 1 = RGB
        buf.writeUInt16BE(0xffff, 1);   // alpha
        buf.writeUInt16BE(r * 257, 3);  // r (16-bit)
        buf.writeUInt16BE(g * 257, 5);  // g
        buf.writeUInt16BE(b * 257, 7);  // b
        return buf;
    }
    return Buffer.concat([
        buildHeader(13, id),
        wString(callsign),
        wColor(p.backgroundColor),
        wColor(p.foregroundColor),
        wBool(p.highlight !== false),
        wBool(!!p.reset)
    ]);
}

// ── Node-RED registration ──────────────────────────────────────────────────

module.exports = function (RED) {
    function WsjtxListenerNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        var port    = parseInt(config.port, 10) || 2237;
        var host    = (config.host    || '127.0.0.1').trim();
        var ownId   = (config.wsjtxId || 'WSJT-X').trim();

        var firstOctet = parseInt(host.split('.')[0], 10);
        var isMulticast = firstOctet >= 224 && firstOctet <= 239;

        var socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        function sendBuf(buf) {
            socket.send(buf, 0, buf.length, port, host, function (err) {
                if (err) node.error('UDP send: ' + err.message);
            });
        }

        socket.on('error', function (err) {
            node.error('UDP socket error: ' + err.message);
            node.status({ fill: 'red', shape: 'ring', text: err.message });
        });

        var topicFilter = {
            'decode':      config.emitDecode      !== false,
            'status':      config.emitStatus      !== false,
            'qso_logged':  config.emitQsoLogged   !== false,
            'logged_adif': config.emitLoggedAdif  !== false,
            'wspr_decode': config.emitWsprDecode  !== false,
            'heartbeat':   config.emitHeartbeat   !== false,
            'clear':       config.emitClear       !== false,
            'close':       config.emitClose       !== false,
            'dxCall':      config.emitDxCall      !== false,
            'dxGrid':      config.emitDxGrid      !== false,
            'dxInfo':      config.emitDxInfo      !== false
        };

        // Grid cache: callsign → { grid, ts } for the last 5 minutes of decodes
        var GRID_TTL = 5 * 60 * 1000;
        var gridCache = {};
        var lastDxCall = null;

        function isGridToken(s) {
            return /^[A-R]{2}[0-9]{2}([A-X]{2})?$/i.test(s);
        }

        function updateGridCache(message) {
            // In FT8/FT4/JT65 the grid is always the last token when present,
            // and the callsign is always the second-to-last token.
            // e.g. "CQ KI2D FN20", "CQ DX KI2D FN20", "W1AW KI2D FN20"
            var parts = (message || '').trim().split(/\s+/);
            if (parts.length < 2) return;
            var last = parts[parts.length - 1];
            if (!isGridToken(last)) return;
            var call = parts[parts.length - 2].toUpperCase();
            gridCache[call] = { grid: last.toUpperCase(), ts: Date.now() };
            // Prune stale entries
            var cutoff = Date.now() - GRID_TTL;
            Object.keys(gridCache).forEach(function (k) {
                if (gridCache[k].ts < cutoff) delete gridCache[k];
            });
        }

        function lookupGrid(call) {
            var entry = call ? gridCache[call.toUpperCase()] : null;
            if (!entry || Date.now() - entry.ts > GRID_TTL) return '';
            return entry.grid;
        }

        socket.on('message', function (buf) {
            var result = parse(buf);
            if (!result) return;
            node.status({ fill: 'green', shape: 'dot',
                text: result.topic + (result.payload.id ? ' · ' + result.payload.id : '') });

            if (result.topic === 'decode') {
                updateGridCache(result.payload.message);
            }

            if (result.topic === 'status') {
                var newDxCall = result.payload.dxCall || '';
                if (newDxCall !== (lastDxCall || '')) {
                    lastDxCall = newDxCall || null;
                    if (newDxCall) {
                        var dxGrid = lookupGrid(newDxCall);
                        if (topicFilter['dxCall'] !== false)
                            node.send({ topic: 'dxCall', payload: newDxCall });
                        if (topicFilter['dxGrid'] !== false)
                            node.send({ topic: 'dxGrid', payload: dxGrid });
                        if (topicFilter['dxInfo'] !== false)
                            node.send({ topic: 'dxInfo', payload: { call: newDxCall, grid: dxGrid } });
                    }
                }
            }

            if (topicFilter[result.topic] === false) return;
            node.send({ topic: result.topic, payload: result.payload });
        });

        node.status({ fill: 'grey', shape: 'ring', text: 'initializing' });

        socket.bind(port, function () {
            socket.setBroadcast(true);
            if (isMulticast) {
                socket.addMembership(host);
            }
            node.status({ fill: 'yellow', shape: 'ring', text: 'listening :' + port });
        });

        node.on('input', function (msg) {
            var topic = (msg.topic || '').toLowerCase().trim();
            var p = msg.payload || {};
            switch (topic) {
                case 'halt_tx':
                    sendBuf(buildHaltTx(ownId, !!p.autoOnly));
                    break;
                case 'reply':
                    sendBuf(buildReply(ownId, p));
                    break;
                case 'free_text':
                    sendBuf(buildFreeText(ownId, p.text || '', !!p.send));
                    break;
                case 'highlight_callsign':
                    sendBuf(buildHighlightCallsign(ownId, p.callsign || p, p));
                    break;
                default:
                    node.warn('h2k_wsjtx_listener: unknown input topic "' + topic + '"');
            }
        });

        node.on('close', function (done) {
            try { socket.close(done); } catch (e) { done(); }
        });
    }

    RED.nodes.registerType('h2k_wsjtx_listener', WsjtxListenerNode);
};
