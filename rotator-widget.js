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

    // ------------------------------------------------------------------
    // Server-side cache + proxy for the Natural Earth 50m admin-1 data.
    // The 110m dataset only has US states; 50m is global (~5 MB GeoJSON).
    // We fetch once from GitHub, cache in memory, serve to the browser.
    // ------------------------------------------------------------------
    var _admin1Cache = null;
    var _admin1Pending = null;

    RED.httpAdmin.get('/rotator-widget/admin1.geojson', function (req, res) {
        if (_admin1Cache) { return res.json(_admin1Cache); }
        if (!_admin1Pending) {
            var url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson';
            var KEEP = { USA: true, CAN: true, AUS: true };
            _admin1Pending = fetch(url)
                .then(function (r) { return r.json(); })
                .then(function (data) {
                    _admin1Cache = {
                        type: 'FeatureCollection',
                        features: data.features.filter(function (f) {
                            return KEEP[f.properties && f.properties.adm0_a3];
                        })
                    };
                    _admin1Pending = null;
                    return _admin1Cache;
                })
                .catch(function (err) { _admin1Pending = null; throw err; });
        }
        _admin1Pending
            .then(function (data) { res.json(data); })
            .catch(function (err) { res.status(500).json({ error: String(err) }); });
    });

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
        function safeOpacity(value, fallback) {
            var n = parseFloat(value);
            return (isFinite(n) && n >= 0 && n <= 100) ? Math.round(n) : fallback;
        }
        var colors = {
            ocean:               safeColor(config.colorOcean,        '#76acd6'),
            land:                safeColor(config.colorLand,         '#9e7e3d'),
            landOutline:         safeColor(config.colorLandOutline,  '#5c402e'),
            landOutlineOpacity:  safeOpacity(config.opacityLandOutline, 100),
            current:             safeColor(config.colorCurrent,      '#001ef9'),
            currentOpacity:      safeOpacity(config.opacityCurrent,  100),
            target:              safeColor(config.colorTarget,       '#ff4400'),
            targetOpacity:       safeOpacity(config.opacityTarget,   100),
            aligned:             safeColor(config.colorAligned,      '#000000'),
            alignedOpacity:      safeOpacity(config.opacityAligned,  100),
            equator:             safeColor(config.colorEquator,      '#555555'),
            equatorOpacity:      safeOpacity(config.opacityEquator,  70),
            polarCircles:        safeColor(config.colorPolarCircles, '#555555'),
            polarCirclesOpacity: safeOpacity(config.opacityPolarCircles, 55),
            graticule:           safeColor(config.colorGraticule,    '#444444'),
            graticuleOpacity:    safeOpacity(config.opacityGraticule, 40),
            hudBg:               safeColor(config.colorHudBg,         '#888888'),
            hudBgOpacity:        safeOpacity(config.opacityHudBg,      55)
        };
        var latLineWidth = Math.max(0.2, Math.min(5, parseFloat(config.latLineWidth) || 0.4));
        var defaultZoom  = Math.max(1.0, Math.min(20, parseFloat(config.defaultZoom)  || 1.0));

        // Build a JS object literal using single quotes so it embeds safely inside
        // the double-quoted ng-init HTML attribute (JSON.stringify would break it).
        // Color strings are single-quoted; opacity values are plain numbers.
        var colorsLiteral = '{' +
            "ocean:'"               + colors.ocean               + "'," +
            "land:'"                + colors.land                + "'," +
            "landOutline:'"         + colors.landOutline         + "'," +
            "landOutlineOpacity:"   + colors.landOutlineOpacity  + "," +
            "current:'"             + colors.current             + "'," +
            "currentOpacity:"       + colors.currentOpacity      + "," +
            "target:'"              + colors.target              + "'," +
            "targetOpacity:"        + colors.targetOpacity       + "," +
            "aligned:'"             + colors.aligned             + "'," +
            "alignedOpacity:"       + colors.alignedOpacity      + "," +
            "equator:'"             + colors.equator             + "'," +
            "equatorOpacity:"       + colors.equatorOpacity      + "," +
            "polarCircles:'"        + colors.polarCircles        + "'," +
            "polarCirclesOpacity:"  + colors.polarCirclesOpacity + "," +
            "graticule:'"           + colors.graticule           + "'," +
            "graticuleOpacity:"     + colors.graticuleOpacity    + "," +
            "hudBg:'"               + colors.hudBg               + "'," +
            "hudBgOpacity:"         + colors.hudBgOpacity        + "" +
        '}';

        var widgetCleanup = ui.addWidget({
            node: node,
            group:  config.group,
            width:  config.width,
            height: config.height,
            order:  config.order,
            disp:   config.disp,
            label:  config.label,

            format: '<div style="width:100%;height:100%;padding:0;margin:0;box-sizing:border-box;"' +
                    ' ng-init="init(\'' + safeQth + '\',' + safeCurrent + ',' + safeTarget + ',' + colorsLiteral + ',' + latLineWidth + ',' + defaultZoom + ')">' +
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
                $scope.admin1Data     = null;
                $scope.qth            = 'JJ00';
                $scope.currentAzimuth = 0;
                $scope.targetAzimuth  = 0;
                $scope.zoom        = 1.0;
                $scope.targetZoom  = 1.0;
                $scope.defaultZoom = 1.0;
                $scope.alignedSince = Date.now() - 5001;  // treat initial state as already aligned if within 3°

                // ----------------------------------------------------------
                // Smooth zoom – animate $scope.zoom toward $scope.targetZoom
                // ----------------------------------------------------------
                var zoomAnimFrame = null;

                function stepZoom() {
                    var diff = $scope.targetZoom - $scope.zoom;
                    if (Math.abs(diff) < 0.003) {
                        $scope.zoom = $scope.targetZoom;
                        $scope.drawMap();
                        zoomAnimFrame = null;
                        return;
                    }
                    $scope.zoom += diff * 0.18;
                    $scope.drawMap();
                    zoomAnimFrame = requestAnimationFrame(stepZoom);
                }

                function requestZoomTo(z) {
                    $scope.targetZoom = Math.max(1.0, Math.min(20, z));
                    if (!zoomAnimFrame) {
                        zoomAnimFrame = requestAnimationFrame(stepZoom);
                    }
                }

                // ----------------------------------------------------------
                // Drag-to-zoom state (lives here so window handlers are added once)
                // ----------------------------------------------------------
                var dragStart    = null;  // { x, y } in client coords
                var dragZoomBase = 1.0;
                var didDrag      = false;

                function onMouseMove(e) {
                    if (!dragStart) return;
                    var dx = e.clientX - dragStart.x;
                    var dy = e.clientY - dragStart.y;
                    if (!didDrag && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) { didDrag = true; }
                    if (!didDrag) return;
                    // right (+dx) or up (-dy) → zoom in; left or down → zoom out
                    var delta = (dx - dy) / 120;
                    var newZoom = Math.max(1.0, Math.min(20, dragZoomBase * Math.pow(2, delta)));
                    $scope.zoom       = newZoom;
                    $scope.targetZoom = newZoom;
                    if (zoomAnimFrame) { cancelAnimationFrame(zoomAnimFrame); zoomAnimFrame = null; }
                    $scope.drawMap();
                }

                function onMouseUp() { dragStart = null; }

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup',   onMouseUp);

                $scope.$on('$destroy', function () {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup',   onMouseUp);
                    if (zoomAnimFrame) { cancelAnimationFrame(zoomAnimFrame); }
                });
                $scope.colors = {
                    ocean:               '#76acd6',
                    land:                '#9e7e3d',
                    landOutline:         '#5c402e',
                    landOutlineOpacity:  100,
                    current:             '#001ef9',
                    currentOpacity:      100,
                    target:              '#ff4400',
                    targetOpacity:       100,
                    aligned:             '#000000',
                    alignedOpacity:      100,
                    equator:             '#555555',
                    equatorOpacity:      70,
                    polarCircles:        '#555555',
                    polarCirclesOpacity: 55,
                    graticule:           '#444444',
                    graticuleOpacity:    40
                };
                $scope.latLineWidth = 0.4;

                // ----------------------------------------------------------
                // Called by ng-init with values from node config
                // ----------------------------------------------------------
                $scope.init = function (qth, currentAz, targetAz, colors, latLineWidth, defaultZoom) {
                    $scope.qth            = qth || 'JJ00';
                    $scope.currentAzimuth = parseFloat(currentAz) || 0;
                    $scope.targetAzimuth  = parseFloat(targetAz)  || 0;
                    if (colors && typeof colors === 'object') { $scope.colors = colors; }
                    if (latLineWidth) { $scope.latLineWidth = parseFloat(latLineWidth); }
                    if (defaultZoom)  {
                        $scope.defaultZoom = parseFloat(defaultZoom);
                        $scope.zoom        = $scope.defaultZoom;
                    }

                    Promise.all([
                        loadScript('https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
                            function () { return typeof window.d3 !== 'undefined' && typeof window.d3.geoAzimuthalEquidistant === 'function'; }),
                        loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js',
                            function () { return typeof window.topojson !== 'undefined' && typeof window.topojson.feature === 'function'; })
                    ])
                    .then(function () {
                        return Promise.all([
                            fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(function (r) { return r.json(); }),
                            fetch('/rotator-widget/admin1.geojson').then(function (r) { return r.json(); })
                        ]);
                    })
                    .then(function (results) {
                        $scope.worldData  = results[0];
                        $scope.admin1Data = results[1];
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
                        .scale(radius / Math.PI * $scope.zoom)
                        .translate([cx, cy])
                        .clipAngle(Math.min(179.9, 180 / $scope.zoom));

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
                            .style('fill', color)
                            .style('stroke', 'none');
                    }

                    var C = $scope.colors;

                    // NOTE: All fills and strokes on <path> elements use .style() not .attr()
                    // because the dashboard has a global CSS rule that sets a default fill on
                    // all SVG paths. Inline styles (.style) beat stylesheet rules; attributes
                    // (.attr) do not.

                    // ------ Ocean background ------
                    svg.append('circle')
                        .attr('cx', cx).attr('cy', cy).attr('r', radius)
                        .style('fill', C.ocean)
                        .style('stroke', '#333')
                        .style('stroke-width', '1.5px');

                    var mapG = svg.append('g').attr('clip-path', 'url(#' + clipId + ')');

                    // Land fill – render each country individually to avoid SVG winding-rule
                    // issues that arise when using the merged objects.land MultiPolygon.
                    var countries = topojson.feature($scope.worldData, $scope.worldData.objects.countries);
                    mapG.selectAll('.country')
                        .data(countries.features)
                        .enter().append('path')
                        .attr('class', 'country')
                        .attr('d', pathGen)
                        .style('fill', C.land)
                        .style('stroke', C.landOutline)
                        .style('stroke-width', (0.2 + Math.max(0, $scope.zoom - 1) * 0.06).toFixed(2) + 'px')
                        .style('stroke-opacity', C.landOutlineOpacity / 100);

                    // Country borders (shared edges only) – fade in as zoom increases
                    var borderOpacity = Math.max(0, Math.min(1, ($scope.zoom - 2) / 1.0));
                    if (borderOpacity > 0.01) {
                        var borderWidth = (0.2 + ($scope.zoom - 2) * 0.15).toFixed(2);
                        mapG.append('path')
                            .datum(topojson.mesh(
                                $scope.worldData,
                                $scope.worldData.objects.countries,
                                function (a, b) { return a !== b; }
                            ))
                            .attr('d', pathGen)
                            .style('fill', 'none')
                            .style('stroke', C.landOutline)
                            .style('stroke-width', borderWidth + 'px')
                            .style('opacity', borderOpacity * C.landOutlineOpacity / 100);
                    }

                    // State / province borders for large federal countries – fade in after 3×
                    var stateOpacity = Math.max(0, Math.min(1, ($scope.zoom - 2.5) / 1.5));
                    if (stateOpacity > 0 && $scope.admin1Data) {
                        mapG.append('g')
                            .style('opacity', stateOpacity * C.landOutlineOpacity / 100)
                            .selectAll('path')
                            .data($scope.admin1Data.features)
                            .enter().append('path')
                            .attr('d', pathGen)
                            .style('fill', 'none')
                            .style('stroke', C.landOutline)
                            .style('stroke-width', '0.2px');
                    }

                    // Graticule (20° lat/lon grid) – drawn after land, configurable opacity
                    mapG.append('path')
                        .datum(d3.geoGraticule().step([20, 20])())
                        .attr('d', pathGen)
                        .style('fill', 'none')
                        .style('stroke', C.graticule)
                        .style('stroke-width', '0.3px')
                        .style('opacity', C.graticuleOpacity / 100);

                    // Significant latitude lines – drawn after land so they show on both ocean and land
                    var lw = $scope.latLineWidth;
                    var latLines = [
                        { lat:   0,    color: C.equator,      opacity: C.equatorOpacity / 100,      width: lw * 1.2 },
                        { lat:  66.5,  color: C.polarCircles, opacity: C.polarCirclesOpacity / 100, width: lw },
                        { lat: -66.5,  color: C.polarCircles, opacity: C.polarCirclesOpacity / 100, width: lw }
                    ];
                    latLines.forEach(function (l) {
                        var coords = [];
                        for (var lon = -180; lon <= 180; lon += 2) { coords.push([lon, l.lat]); }
                        mapG.append('path')
                            .datum({ type: 'LineString', coordinates: coords })
                            .attr('d', pathGen)
                            .style('fill', 'none')
                            .style('stroke', l.color)
                            .style('stroke-width', l.width + 'px')
                            .style('opacity', l.opacity);
                    });

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
                    var within3 = diff <= 3;
                    if (within3) {
                        if (!$scope.alignedSince) { $scope.alignedSince = Date.now(); }
                    } else {
                        $scope.alignedSince = null;
                    }
                    var aligned = within3 && (diff < 0.1 || (Date.now() - $scope.alignedSince >= 5000));
                    // Schedule a redraw to fire the transition once the 5s window elapses
                    if (within3 && !aligned) {
                        var msLeft = 5000 - (Date.now() - $scope.alignedSince);
                        setTimeout(function () { $scope.drawMap(); }, msLeft + 50);
                    }

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
                            .attr('stroke-opacity', C.targetOpacity / 100)
                            .attr('stroke-width', 2)
                            .attr('marker-end', 'url(#' + tId + ')');
                    }

                    // Current azimuth
                    var curColor   = aligned ? C.aligned : C.current;
                    var curOpacity = aligned ? C.alignedOpacity / 100 : C.currentOpacity / 100;
                    var cId  = 'arrow-cur-' + $scope.$id;
                    arrowMarker(cId, curColor);
                    var crad = $scope.currentAzimuth * Math.PI / 180;
                    svg.append('line')
                        .attr('x1', cx).attr('y1', cy)
                        .attr('x2', cx + lineR * Math.sin(crad))
                        .attr('y2', cy - lineR * Math.cos(crad))
                        .attr('stroke', curColor)
                        .attr('stroke-opacity', curOpacity)
                        .attr('stroke-width', 2.5)
                        .attr('marker-end', 'url(#' + cId + ')');

                    // Centre dot
                    svg.append('circle').attr('cx', cx).attr('cy', cy).attr('r', 5)
                        .attr('fill', '#222').attr('stroke', 'white').attr('stroke-width', 1.5);

                    // ------ HUD readout (top-left overlay) ------
                    var hudPad = 6, hudH = 30;
                    var hudBgColor = C.hudBg || '#000000';
                    var hudBgAlpha = (C.hudBgOpacity != null ? C.hudBgOpacity : 55) / 100;
                    // measure text width roughly: monospace ~9px per char at 15px
                    var hudText, hudW;
                    if (aligned) {
                        hudText = Math.round($scope.currentAzimuth) + '°';
                        hudW = hudText.length * 9 + hudPad * 2;
                    } else {
                        hudW = (String(Math.round($scope.currentAzimuth)).length + String(Math.round($scope.targetAzimuth)).length + 5) * 9 + hudPad * 2;
                    }
                    hudW = Math.max(hudW, 40);

                    // background rect — convert hex to rgba for SVG fill
                    var hr = parseInt(hudBgColor.slice(1,3),16);
                    var hg = parseInt(hudBgColor.slice(3,5),16);
                    var hb = parseInt(hudBgColor.slice(5,7),16);
                    svg.append('rect')
                        .attr('x', 8).attr('y', 8)
                        .attr('width', hudW).attr('height', hudH)
                        .style('fill', 'rgba(' + hr + ',' + hg + ',' + hb + ',' + hudBgAlpha + ')')
                        .attr('rx', 4);

                    var hudTextEl = svg.append('text')
                        .attr('x', 8 + hudPad)
                        .attr('y', 8 + hudPad + 13)
                        .attr('font-size', '15px')
                        .attr('font-family', 'monospace')
                        .attr('dominant-baseline', 'auto');

                    if (aligned) {
                        hudTextEl.append('tspan')
                            .style('fill', C.aligned)
                            .text(Math.round($scope.currentAzimuth) + '°');
                    } else {
                        hudTextEl.append('tspan')
                            .style('fill', C.current)
                            .text(Math.round($scope.currentAzimuth) + '°');
                        hudTextEl.append('tspan')
                            .style('fill', C.aligned)
                            .text(' ➜ ');
                        hudTextEl.append('tspan')
                            .style('fill', C.target)
                            .text(Math.round($scope.targetAzimuth) + '°');
                    }

                    // ------ Click to set target azimuth ------
                    svg.on('click', function (event) {
                        if (didDrag) return;
                        var coords = d3.pointer(event, svgEl);
                        var dx = coords[0] - cx;
                        var dy = coords[1] - cy;
                        if (Math.sqrt(dx * dx + dy * dy) > radius) return;
                        var az = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                        $scope.targetAzimuth = Math.round(az);
                        $scope.drawMap();
                        $scope.send({ payload: $scope.targetAzimuth, topic: 'targetAzimuth' });
                    });

                    // ------ Drag to zoom (mousedown tracked; move/up are on window) ------
                    svg.on('mousedown', function (event) {
                        event.preventDefault();
                        dragStart    = { x: event.clientX, y: event.clientY };
                        dragZoomBase = $scope.zoom;
                        didDrag      = false;
                    });

                    // ------ Scroll wheel zoom ------
                    svg.on('wheel', function (event) {
                        event.preventDefault();
                        var factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
                        requestZoomTo($scope.targetZoom * factor);
                    });

                    // ------ Zoom reset button (shown only when zoom != default) ------
                    if (Math.abs($scope.zoom - $scope.defaultZoom) > 0.01) {
                        var btnW = 90, btnH = 22, btnX = W - btnW - 6, btnY = H - btnH - 6;
                        var btnG = svg.append('g')
                            .style('cursor', 'pointer')
                            .on('click', function (event) {
                                event.stopPropagation();
                                requestZoomTo($scope.defaultZoom);
                            });
                        btnG.append('rect')
                            .attr('x', btnX).attr('y', btnY)
                            .attr('width', btnW).attr('height', btnH)
                            .attr('rx', 4)
                            .style('fill', 'rgba(0,0,0,0.55)');
                        btnG.append('text')
                            .attr('x', btnX + btnW / 2).attr('y', btnY + btnH / 2 + 1)
                            .attr('text-anchor', 'middle')
                            .attr('dominant-baseline', 'middle')
                            .attr('font-size', '11px')
                            .attr('font-family', 'sans-serif')
                            .style('fill', '#eee')
                            .style('pointer-events', 'none')
                            .text('↺ Reset zoom');
                    }
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
