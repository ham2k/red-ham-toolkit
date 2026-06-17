var path = require('path');
var os   = require('os');

function loadDashboard(RED) {
    // Works when properly installed alongside node-red-dashboard
    try { return require('node-red-dashboard'); } catch (e) {}
    // Works when npm-linked for development: resolve from the Node-RED user dir
    var userDir = (RED.settings && RED.settings.userDir) ||
                  path.join(os.homedir(), '.node-red');
    try { return require(path.join(userDir, 'node_modules', 'node-red-dashboard')); } catch (e) {}
    return null;
}

module.exports = function (RED) {
    var dashboardModule = loadDashboard(RED);
    if (!dashboardModule) {
        RED.log.warn('node-red-contrib-rotator-widget: node-red-dashboard is required but could not be found');
        return;
    }
    var ui = dashboardModule(RED);

    function RotatorWidget(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // Sanitize config values for safe embedding in the Angular template
        var safeQth = (config.qth || 'JJ00')
            .replace(/[^A-Za-z0-9]/g, '')
            .substring(0, 6)
            .toUpperCase();
        var safeCurrent = isFinite(parseFloat(config.currentAzimuth)) ? parseFloat(config.currentAzimuth) : 0;
        var safeTarget  = isFinite(parseFloat(config.targetAzimuth))  ? parseFloat(config.targetAzimuth)  : 0;

        // Allow only #rrggbb hex colors to prevent injection via the ng-init string
        var HEX_RE = /^#[0-9a-fA-F]{6}$/;
        function safeColor(value, fallback) {
            return (value && HEX_RE.test(value)) ? value : fallback;
        }
        var colors = {
            ocean:   safeColor(config.colorOcean,   '#afd4ee'),
            land:    safeColor(config.colorLand,    '#8dbf6a'),
            current: safeColor(config.colorCurrent, '#1155cc'),
            target:  safeColor(config.colorTarget,  '#cc2200'),
            aligned: safeColor(config.colorAligned, '#111111')
        };
        // Serialise as a JS object literal embedded in the ng-init call
        var colorsJson = JSON.stringify(colors);

        var widgetCleanup = ui.addWidget({
            node: node,
            group:  config.group,
            width:  config.width,
            height: config.height,
            order:  config.order,
            disp:   config.disp,
            label:  config.label,

            format: '<div style="width:100%;height:100%;padding:0;margin:0;box-sizing:border-box;"' +
                    ' ng-init="init(\'' + safeQth + '\',' + safeCurrent + ',' + safeTarget + ',' + colorsJson + ')">' +
                    '<svg id="rotator-{{$id}}" style="display:block;width:100%;height:100%;overflow:visible;"></svg>' +
                    '</div>',

            templateScope: 'local',
            emitOnlyNewValues: false,
            forwardInputMessages: false,
            storeFrontEndInputAsState: false,

            beforeEmit: function (msg) {
                var out = {};
                // msg.payload is treated as current azimuth (common Node-RED convention)
                if (typeof msg.payload === 'number' && isFinite(msg.payload)) {
                    out.currentAzimuth = msg.payload;
                }
                if (msg.currentAzimuth !== undefined && isFinite(parseFloat(msg.currentAzimuth))) {
                    out.currentAzimuth = parseFloat(msg.currentAzimuth);
                }
                if (msg.targetAzimuth !== undefined && isFinite(parseFloat(msg.targetAzimuth))) {
                    out.targetAzimuth = parseFloat(msg.targetAzimuth);
                }
                return { msg: out };
            },

            beforeSend: function (msg, orig) {
                if (orig && orig.msg) return orig.msg;
            },

            // ----------------------------------------------------------------
            // initController runs in the BROWSER (Angular context).
            // It must be entirely self-contained – no server-side closures.
            // ----------------------------------------------------------------
            initController: function ($scope, events) {

                // ----------------------------------------------------------
                // Maidenhead grid locator → [lat, lon]
                // ----------------------------------------------------------
                function maidenheadToLatLon(grid) {
                    if (!grid || grid.length < 4) return [0, 0];
                    var g = grid.toUpperCase();
                    var lon = (g.charCodeAt(0) - 65) * 20 - 180;
                    var lat = (g.charCodeAt(1) - 65) * 10 - 90;
                    lon += parseInt(g[2]) * 2;
                    lat += parseInt(g[3]);
                    if (g.length >= 6) {
                        lon += (g.charCodeAt(4) - 65) * 5 / 60;
                        lat += (g.charCodeAt(5) - 65) * 2.5 / 60;
                        lon += 2.5 / 60;   // centre of subsquare
                        lat += 1.25 / 60;
                    } else {
                        lon += 1;    // centre of 2°×1° square
                        lat += 0.5;
                    }
                    return [lat, lon];
                }

                // ----------------------------------------------------------
                // Dynamic script loader – returns a Promise.
                // readyCheck() is called to decide whether loading is needed;
                // checking a specific function (not just the global) avoids the
                // case where an older/partial D3 build is already on the page.
                // ----------------------------------------------------------
                function loadScript(url, readyCheck) {
                    return new Promise(function (resolve, reject) {
                        if (readyCheck()) { resolve(); return; }
                        // Already injected but still loading
                        var existing = document.querySelector('script[src="' + url + '"]');
                        if (existing) {
                            existing.addEventListener('load', resolve);
                            existing.addEventListener('error', reject);
                            return;
                        }
                        var s = document.createElement('script');
                        s.src = url;
                        s.onload  = resolve;
                        s.onerror = function () { reject(new Error('Failed to load ' + url)); };
                        document.head.appendChild(s);
                    });
                }

                // ----------------------------------------------------------
                // Scope state
                // ----------------------------------------------------------
                $scope.worldData      = null;
                $scope.qth            = 'JJ00';
                $scope.currentAzimuth = 0;
                $scope.targetAzimuth  = 0;
                $scope.colors = {
                    ocean:   '#afd4ee',
                    land:    '#8dbf6a',
                    current: '#1155cc',
                    target:  '#cc2200',
                    aligned: '#111111'
                };

                // ----------------------------------------------------------
                // Called by ng-init with values from node config
                // ----------------------------------------------------------
                $scope.init = function (qth, currentAz, targetAz, colors) {
                    $scope.qth            = qth || 'JJ00';
                    $scope.currentAzimuth = parseFloat(currentAz) || 0;
                    $scope.targetAzimuth  = parseFloat(targetAz)  || 0;
                    if (colors && typeof colors === 'object') {
                        $scope.colors = colors;
                    }

                    Promise.all([
                        loadScript('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
                            function () { return typeof window.d3 !== 'undefined' && typeof window.d3.geoAzimuthalEquidistant === 'function'; }),
                        loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js',
                            function () { return typeof window.topojson !== 'undefined' && typeof window.topojson.feature === 'function'; })
                    ])
                    .then(function () {
                        return fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
                    })
                    .then(function (r) { return r.json(); })
                    .then(function (world) {
                        $scope.worldData = world;
                        // Defer slightly so the SVG has been laid out by the browser
                        setTimeout(function () { $scope.drawMap(); }, 120);
                    })
                    .catch(function (err) {
                        console.error('[rotator-widget] map load error:', err);
                    });
                };

                // ----------------------------------------------------------
                // Main draw routine
                // ----------------------------------------------------------
                $scope.drawMap = function () {
                    if (!$scope.worldData || typeof window.d3 === 'undefined') return;

                    var d3       = window.d3;
                    var topojson = window.topojson;

                    var svgEl = document.getElementById('rotator-' + $scope.$id);
                    if (!svgEl) return;

                    var rect = svgEl.getBoundingClientRect();
                    var W = rect.width;
                    var H = rect.height;
                    if (W < 10 || H < 10) { setTimeout(function () { $scope.drawMap(); }, 200); return; }

                    // Leave room around the circle for the compass labels
                    var LABEL_PAD = 26;
                    var radius = Math.min(W, H) / 2 - LABEL_PAD;
                    var cx = W / 2;
                    var cy = H / 2;

                    // ------ Projection (azimuthal equidistant, centred on QTH) ------
                    var latlon = maidenheadToLatLon($scope.qth);
                    var lat = latlon[0], lon = latlon[1];

                    var projection = d3.geoAzimuthalEquidistant()
                        .rotate([-lon, -lat])
                        .scale(radius / Math.PI)   // full globe fits in 'radius' pixels
                        .translate([cx, cy]);

                    var pathGen = d3.geoPath().projection(projection);

                    // ------ Build SVG ------
                    var svg = d3.select(svgEl);
                    svg.selectAll('*').remove();

                    // Defs: clip path + arrow markers
                    var defs   = svg.append('defs');
                    var clipId = 'globe-clip-' + $scope.$id;
                    defs.append('clipPath').attr('id', clipId)
                        .append('circle')
                        .attr('cx', cx).attr('cy', cy).attr('r', radius);

                    function arrowMarker(id, color) {
                        defs.append('marker')
                            .attr('id', id)
                            .attr('viewBox', '0 -4 8 8')
                            .attr('refX', 6).attr('refY', 0)
                            .attr('markerWidth', 5).attr('markerHeight', 5)
                            .attr('orient', 'auto')
                            .append('path')
                            .attr('d', 'M0,-4L8,0L0,4Z')
                            .attr('fill', color);
                    }

                    var C = $scope.colors;

                    // ------ Ocean background ------
                    svg.append('circle')
                        .attr('cx', cx).attr('cy', cy).attr('r', radius)
                        .attr('fill', C.ocean)
                        .attr('stroke', '#333')
                        .attr('stroke-width', 1.5);

                    var mapG = svg.append('g').attr('clip-path', 'url(#' + clipId + ')');

                    // Graticule (10° grid) – slightly lighter than ocean
                    mapG.append('path')
                        .datum(d3.geoGraticule()())
                        .attr('d', pathGen)
                        .attr('fill', 'none')
                        .attr('stroke', C.ocean)
                        .attr('stroke-opacity', 0.5)
                        .attr('stroke-width', 0.6);

                    // Land
                    mapG.append('path')
                        .datum(topojson.feature($scope.worldData, $scope.worldData.objects.land))
                        .attr('d', pathGen)
                        .attr('fill', C.land);

                    // Country borders – darker shade of land color
                    mapG.append('path')
                        .datum(topojson.mesh(
                            $scope.worldData,
                            $scope.worldData.objects.countries,
                            function (a, b) { return a !== b; }
                        ))
                        .attr('d', pathGen)
                        .attr('fill', 'none')
                        .attr('stroke', C.land)
                        .attr('stroke-opacity', 0.5)
                        .attr('stroke-width', 0.6);

                    // ------ Degree tick marks ------
                    for (var deg = 0; deg < 360; deg += 10) {
                        var isMajor   = (deg % 30 === 0);
                        var tickLen   = isMajor ? 9 : 5;
                        var rad       = deg * Math.PI / 180;
                        var innerR    = radius - tickLen;
                        svg.append('line')
                            .attr('x1', cx + innerR  * Math.sin(rad))
                            .attr('y1', cy - innerR  * Math.cos(rad))
                            .attr('x2', cx + radius  * Math.sin(rad))
                            .attr('y2', cy - radius  * Math.cos(rad))
                            .attr('stroke', '#333')
                            .attr('stroke-width', isMajor ? 1.5 : 0.8);
                    }

                    // ------ Cardinal compass labels ------
                    var cardinals = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
                    var labelR = radius + 16;
                    cardinals.forEach(function (c) {
                        var a = c[1] * Math.PI / 180;
                        svg.append('text')
                            .attr('x', cx + labelR * Math.sin(a))
                            .attr('y', cy - labelR * Math.cos(a))
                            .attr('text-anchor', 'middle')
                            .attr('dominant-baseline', 'middle')
                            .attr('font-size', '13px')
                            .attr('font-weight', 'bold')
                            .attr('font-family', 'sans-serif')
                            .attr('fill', '#111')
                            .text(c[0]);
                    });

                    // ------ Azimuth lines ------
                    // Angular difference between current and target (shortest arc)
                    var diff = Math.abs(
                        (($scope.currentAzimuth - $scope.targetAzimuth) % 360 + 540) % 360 - 180
                    );
                    var aligned = diff <= 5;

                    var lineR = radius - 6; // slightly short so arrow head is inside circle

                    if (!aligned) {
                        // Target azimuth
                        var tId  = 'arrow-tgt-' + $scope.$id;
                        arrowMarker(tId, C.target);
                        var trad = $scope.targetAzimuth * Math.PI / 180;
                        svg.append('line')
                            .attr('x1', cx).attr('y1', cy)
                            .attr('x2', cx + lineR * Math.sin(trad))
                            .attr('y2', cy - lineR * Math.cos(trad))
                            .attr('stroke', C.target)
                            .attr('stroke-width', 2)
                            .attr('marker-end', 'url(#' + tId + ')');
                    }

                    // Current azimuth
                    var curColor = aligned ? C.aligned : C.current;
                    var cId  = 'arrow-cur-' + $scope.$id;
                    arrowMarker(cId, curColor);
                    var crad = $scope.currentAzimuth * Math.PI / 180;
                    svg.append('line')
                        .attr('x1', cx).attr('y1', cy)
                        .attr('x2', cx + lineR * Math.sin(crad))
                        .attr('y2', cy - lineR * Math.cos(crad))
                        .attr('stroke', curColor)
                        .attr('stroke-width', 2.5)
                        .attr('marker-end', 'url(#' + cId + ')');

                    // Centre dot
                    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 5)
                        .attr('fill', '#222').attr('stroke', 'white').attr('stroke-width', 1.5);

                    // ------ HUD readout (top-left overlay) ------
                    var hudLines = aligned
                        ? [{ text: 'Az: ' + Math.round($scope.currentAzimuth) + '°', color: '#eee' }]
                        : [
                            { text: '▶ ' + Math.round($scope.currentAzimuth) + '°', color: '#7aadff' },
                            { text: '◆ ' + Math.round($scope.targetAzimuth)  + '°', color: '#ff6666' }
                          ];

                    var hudPad = 5, hudLineH = 17, hudW = 80;
                    var hudH2  = hudLines.length * hudLineH + hudPad * 2;
                    svg.append('rect')
                        .attr('x', 8).attr('y', 8)
                        .attr('width', hudW).attr('height', hudH2)
                        .attr('fill', 'rgba(0,0,0,0.55)')
                        .attr('rx', 4);
                    hudLines.forEach(function (l, i) {
                        svg.append('text')
                            .attr('x', 8 + hudPad)
                            .attr('y', 8 + hudPad + 12 + i * hudLineH)
                            .attr('font-size', '12px')
                            .attr('font-family', 'monospace')
                            .attr('fill', l.color)
                            .text(l.text);
                    });

                    // ------ Click to set target azimuth ------
                    svg.on('click', function (event) {
                        var coords = d3.pointer(event, svgEl);
                        var dx = coords[0] - cx;
                        var dy = coords[1] - cy;
                        if (Math.sqrt(dx * dx + dy * dy) > radius) return;
                        var az = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                        $scope.targetAzimuth = Math.round(az);
                        $scope.drawMap();
                        $scope.send({ payload: $scope.targetAzimuth, topic: 'targetAzimuth' });
                    });
                };

                // ----------------------------------------------------------
                // React to incoming messages
                // ----------------------------------------------------------
                $scope.$watch('msg', function (msg) {
                    if (!msg) return;
                    var changed = false;
                    if (msg.currentAzimuth !== undefined) {
                        $scope.currentAzimuth = parseFloat(msg.currentAzimuth);
                        changed = true;
                    }
                    if (msg.targetAzimuth !== undefined) {
                        $scope.targetAzimuth = parseFloat(msg.targetAzimuth);
                        changed = true;
                    }
                    if (changed) $scope.drawMap();
                });
            }
        });

        node.on('close', function (removed, done) {
            if (typeof widgetCleanup === 'function') { widgetCleanup(); }
            done();
        });
    }

    RED.nodes.registerType('rotator-widget', RotatorWidget);
};
