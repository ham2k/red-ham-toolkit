var path = require('path');
var os = require('os');

function loadDashboard(RED) {
    // Prefer the Node-RED user dir install — this ensures we share the same
    // module instance as the dashboard's own nodes (same socket.io, same menu).
    var userDir = (RED.settings && RED.settings.userDir) ||
        path.join(os.homedir(), '.node-red');
    try { return require(path.join(userDir, 'node_modules', 'node-red-dashboard')); } catch (e) { }
    // Fall back to a co-installed copy (production install alongside node-red-dashboard)
    try { return require('node-red-dashboard'); } catch (e) { }
    return null;
}

module.exports = function (RED) {
    var dashboardModule = loadDashboard(RED);
    if (!dashboardModule) {
        RED.log.warn('@ham2k/red-ham-toolkit: node-red-dashboard is required but could not be found');
        return;
    }
    var ui = dashboardModule(RED);

    // Serve the Ham2K logo from the package directory
    RED.httpAdmin.get('/ui_h2k_rotator/ham2k-square.svg', function (req, res) {
        res.sendFile(path.join(__dirname, '../../assets/ham2k-square.svg'));
    });

    // ------------------------------------------------------------------
    // Server-side cache + proxy for the Natural Earth 50m admin-1 data.
    // The 110m dataset only has US states; 50m is global (~5 MB GeoJSON).
    // We fetch once from GitHub, cache in memory, serve to the browser.
    // ------------------------------------------------------------------
    var _admin1Cache = null;
    var _admin1Pending = null;

    RED.httpAdmin.get('/ui_h2k_rotator/admin1.geojson', function (req, res) {
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
        var safeTarget = isFinite(parseFloat(config.targetAzimuth)) ? parseFloat(config.targetAzimuth) : 0;
        var safeDxGrid = (config.dxGrid || '')
            .replace(/[^A-Za-z0-9]/g, '')
            .substring(0, 6)
            .toUpperCase();

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
            ocean: safeColor(config.colorOcean, '#76acd6'),
            land: safeColor(config.colorLand, '#9e7e3d'),
            landOutline: safeColor(config.colorLandOutline, '#5c402e'),
            landOutlineOpacity: safeOpacity(config.opacityLandOutline, 100),
            current: safeColor(config.colorCurrent, '#001ef9'),
            currentOpacity: safeOpacity(config.opacityCurrent, 100),
            target: safeColor(config.colorTarget, '#ff4400'),
            targetOpacity: safeOpacity(config.opacityTarget, 100),
            aligned: safeColor(config.colorAligned, '#000000'),
            alignedOpacity: safeOpacity(config.opacityAligned, 100),
            equator: safeColor(config.colorEquator, '#555555'),
            equatorOpacity: safeOpacity(config.opacityEquator, 70),
            polarCircles: safeColor(config.colorPolarCircles, '#555555'),
            polarCirclesOpacity: safeOpacity(config.opacityPolarCircles, 55),
            graticule: safeColor(config.colorGraticule, '#444444'),
            graticuleOpacity: safeOpacity(config.opacityGraticule, 40),
            dxDot: safeColor(config.colorDxDot, '#ff0000'),
            dxDotOpacity: safeOpacity(config.opacityDxDot, 100)
        };
        var latLineWidth = Math.max(0.2, Math.min(5, parseFloat(config.latLineWidth) || 0.4));
        var defaultZoom = Math.max(1.0, Math.min(20, parseFloat(config.defaultZoom) || 1.0));
        var beamWidth = Math.max(0, Math.min(180, parseFloat(config.beamWidth) || 30));
        var showGrayline = (config.showGrayline === undefined) ? true : !!config.showGrayline;
        var showAzimuthInMap = (config.showAzimuthInMap === undefined) ? true : !!config.showAzimuthInMap;
        // Comma-separated allowed azimuths; keep only safe chars for the ng-init string
        var safeAllowed = (config.allowedAzimuths || '').replace(/[^0-9.,\s-]/g, '').substring(0, 300);

        // Build a JS object literal using single quotes so it embeds safely inside
        // the double-quoted ng-init HTML attribute (JSON.stringify would break it).
        // Color strings are single-quoted; opacity values are plain numbers.
        var colorsLiteral = '{' +
            "ocean:'" + colors.ocean + "'," +
            "land:'" + colors.land + "'," +
            "landOutline:'" + colors.landOutline + "'," +
            "landOutlineOpacity:" + colors.landOutlineOpacity + "," +
            "current:'" + colors.current + "'," +
            "currentOpacity:" + colors.currentOpacity + "," +
            "target:'" + colors.target + "'," +
            "targetOpacity:" + colors.targetOpacity + "," +
            "aligned:'" + colors.aligned + "'," +
            "alignedOpacity:" + colors.alignedOpacity + "," +
            "equator:'" + colors.equator + "'," +
            "equatorOpacity:" + colors.equatorOpacity + "," +
            "polarCircles:'" + colors.polarCircles + "'," +
            "polarCirclesOpacity:" + colors.polarCirclesOpacity + "," +
            "graticule:'" + colors.graticule + "'," +
            "graticuleOpacity:" + colors.graticuleOpacity + "," +
            "dxDot:'" + colors.dxDot + "'," +
            "dxDotOpacity:" + colors.dxDotOpacity + "" +
            '}';

        var widgetCleanup = ui.addWidget({
            node: node,
            group: config.group,
            width: config.width,
            height: config.height,
            order: config.order,
            disp: config.disp,
            label: config.label,

            format: '<div style="width:100%;height:100%;padding:0;margin:0;box-sizing:border-box;"' +
                ' ng-init="init(\'' + safeQth + '\',' + safeCurrent + ',' + safeTarget + ',' + colorsLiteral + ',' + latLineWidth + ',' + defaultZoom + ',' + beamWidth + ',' + showGrayline + ',\'' + safeDxGrid + '\',\'' + safeAllowed + '\',' + showAzimuthInMap + ')">' +
                '<svg id="rotator-{{$id}}" style="display:block;width:100%;height:100%;overflow:visible;"></svg>' +
                '</div>',

            templateScope: 'local',
            emitOnlyNewValues: false,
            forwardInputMessages: false,
            storeFrontEndInputAsState: false,

            beforeEmit: function (msg) {
                var out = {};
                // Parse + normalise an angle to [0, 360); returns null if invalid
                function az(v) {
                    var n = parseFloat(v);
                    if (!isFinite(n)) return null;
                    return ((n % 360) + 360) % 360;
                }
                // Sanitise a Maidenhead grid string; '' clears the marker
                function grid(v) {
                    if (v == null) return null;
                    return String(v).replace(/[^A-Za-z0-9]/g, '').substring(0, 6).toUpperCase();
                }

                // --- Topic routing (single value per message): { topic, payload } ---
                // Mirrors the node's own output shape, so it composes with itself and
                // with MQTT/rig sources that emit { topic, payload }.
                if (msg.topic === 'currentAzimuth') {
                    var tc = az(msg.payload);
                    if (tc !== null) out.currentAzimuth = tc;
                } else if (msg.topic === 'targetAzimuth') {
                    var tt = az(msg.payload);
                    if (tt !== null) out.targetAzimuth = tt;
                } else if (msg.topic === 'dxGrid') {
                    var tg = grid(msg.payload);
                    if (tg !== null) out.dxGrid = tg;
                } else if (typeof msg.payload === 'number') {
                    // Bare-payload shorthand → current azimuth
                    var tp = az(msg.payload);
                    if (tp !== null) out.currentAzimuth = tp;
                }

                // --- Named properties always win and can set several at once ---
                var nc = az(msg.currentAzimuth);
                if (msg.currentAzimuth !== undefined && nc !== null) out.currentAzimuth = nc;
                var nt = az(msg.targetAzimuth);
                if (msg.targetAzimuth !== undefined && nt !== null) out.targetAzimuth = nt;
                if (msg.dxGrid !== undefined) out.dxGrid = grid(msg.dxGrid);

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
                        s.onload = resolve;
                        s.onerror = function () { reject(new Error('Failed to load ' + url)); };
                        document.head.appendChild(s);
                    });
                }

                // ----------------------------------------------------------
                // Scope state
                // ----------------------------------------------------------
                $scope.worldData = null;
                $scope.admin1Data = null;
                $scope.qth = 'JJ00';
                $scope.currentAzimuth = 0;
                $scope.targetAzimuth = 0;
                $scope.dxGrid = '';
                $scope.allowedAzimuths = [];   // optional list of permitted target angles

                // Snap an azimuth to the nearest allowed value (if any are configured)
                function snapAzimuth(az) {
                    var list = $scope.allowedAzimuths;
                    if (!list || !list.length) return az;
                    var best = list[0], bestD = Infinity;
                    for (var i = 0; i < list.length; i++) {
                        var d = Math.abs(((az - list[i]) % 360 + 540) % 360 - 180);
                        if (d < bestD) { bestD = d; best = list[i]; }
                    }
                    return best;
                }
                $scope.snapAzimuth = snapAzimuth;

                function contrastColor(hex) {
                    var h = (hex || '#000').replace('#', '');
                    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
                    var r = parseInt(h.substr(0,2),16)/255;
                    var g = parseInt(h.substr(2,2),16)/255;
                    var b = parseInt(h.substr(4,2),16)/255;
                    return (0.299*r + 0.587*g + 0.114*b) > 0.55 ? '#000' : '#fff';
                }

                $scope.zoom = 1.15;
                $scope.targetZoom = 1.15;
                $scope.defaultZoom = 1.15;
                $scope.panX = 0.5;  // view pan intent, fraction of width  (clamped by maxPanOff in drawMap)
                $scope.panY = 0.5;  // view pan intent, fraction of height (clamped by maxPanOff in drawMap)
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
                // Pan limits: the QTH may move up to 25% in from each edge.
                // ----------------------------------------------------------
                // Maximum pan offset from 0.5 as a function of zoom.
                // At scale z the map covers radius*z px; for a square widget the
                // far edge is at radius*(1+2*off). A 5% safety margin gives
                // off <= (0.95*z-1)/2 before the geographic 180° edge appears.
                function maxPanOff(z) {
                    return Math.max(0, Math.min(0.25, (0.95 * z - 1) / 2));
                }
                function clampPan(v, z) {
                    var off = maxPanOff(z || $scope.zoom);
                    return Math.max(0.5 - off, Math.min(0.5 + off, v));
                }

                // ----------------------------------------------------------
                // Drag state (lives here so window handlers are added once).
                // A drag that starts near the QTH marker pans the view; anywhere
                // else it zooms.
                // ----------------------------------------------------------
                var dragStart = null;  // { x, y, mode } in client coords
                var dragZoomBase = 1.0;
                var didDrag = false;
                var QTH_GRAB_RADIUS = 22;  // px around the marker that grabs to pan

                function onMouseMove(e) {
                    if (!dragStart) return;
                    var dx = e.clientX - dragStart.x;
                    var dy = e.clientY - dragStart.y;
                    if (!didDrag && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) { didDrag = true; }
                    if (!didDrag) return;

                    if (dragStart.mode === 'pan') {
                        var g = getSvgGeometry();
                        if (!g) return;
                        var fx = clampPan((e.clientX - g.rect.left) / g.rect.width, $scope.zoom);
                        var fy = clampPan((e.clientY - g.rect.top) / g.rect.height, $scope.zoom);
                        if (fx !== $scope.panX || fy !== $scope.panY) {
                            $scope.panX = fx;
                            $scope.panY = fy;
                            $scope.drawMap();
                        }
                    } else {
                        // Drag to zoom: right/up → in, left/down → out (gradual)
                        var delta = (dx - dy) / 260;
                        var nz = Math.max(1.0, Math.min(20, dragZoomBase * Math.pow(2, delta)));
                        $scope.zoom = nz;
                        $scope.targetZoom = nz;
                        if (zoomAnimFrame) { cancelAnimationFrame(zoomAnimFrame); zoomAnimFrame = null; }
                        $scope.drawMap();
                    }
                }

                // Mouse-up ends a drag, or — if no drag occurred and the press
                // began on our SVG — is treated as a click. We synthesize the
                // click here rather than relying on the DOM 'click' event,
                // because frequent drawMap() redraws (while the lines move)
                // replace the element under the cursor between mousedown and
                // mouseup, so the browser never fires a real 'click'.
                function onMouseUp(e) {
                    var wasDrag = didDrag;
                    var startedHere = dragStart && dragStart.onSvg;
                    dragStart = null;
                    didDrag = false;
                    if (wasDrag || !startedHere) return;
                    selectTargetAt(e.clientX, e.clientY);
                }

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);

                $scope.$on('$destroy', function () {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    if (zoomAnimFrame) { cancelAnimationFrame(zoomAnimFrame); }
                    if ($scope._graylineTimer) { clearInterval($scope._graylineTimer); }
                    var el = document.getElementById('rotator-' + $scope.$id);
                    if (el) {
                        el.removeEventListener('mousedown', onSvgMouseDown);
                        el.removeEventListener('wheel', onSvgWheel);
                    }
                });

                // ----------------------------------------------------------
                // Pointer handlers — registered ONCE on the DOM element so
                // frequent drawMap() calls (from incoming messages) can never
                // replace them mid-event and swallow a click.
                // ----------------------------------------------------------
                function getSvgGeometry() {
                    var el = document.getElementById('rotator-' + $scope.$id);
                    if (!el) return null;
                    var rect = el.getBoundingClientRect();
                    var W = rect.width, H = rect.height;
                    var LABEL_PAD = 0;
                    var radius = Math.min(W, H) / 2 - LABEL_PAD;
                    return { rect: rect, cx: W / 2, cy: H / 2, radius: radius };
                }

                // Convert client coords → SVG-local coords and act on the press:
                // the zoom-reset button takes priority, otherwise set the target.
                function selectTargetAt(clientX, clientY) {
                    var g = getSvgGeometry();
                    if (!g) return;
                    var localX = clientX - g.rect.left;
                    var localY = clientY - g.rect.top;

                    // Zoom reset button hit-test (if currently shown)
                    var b = $scope._zoomBtnRect;
                    if (b && localX >= b.x && localX <= b.x + b.w &&
                        localY >= b.y && localY <= b.y + b.h) {
                        $scope.panX = 0.5; $scope.panY = 0.5;
                        requestZoomTo($scope.defaultZoom);
                        return;
                    }

                    // Reject clicks outside the (possibly stretched) view polygon
                    var poly = $scope._clipPts;
                    if (poly && poly.length > 2) {
                        var inside = false;
                        for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                            var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
                            if (((yi > localY) !== (yj > localY)) &&
                                (localX < (xj - xi) * (localY - yi) / (yj - yi) + xi)) {
                                inside = !inside;
                            }
                        }
                        if (!inside) return;
                    }

                    // Azimuth is measured from the QTH screen position (the anchor)
                    var ox = ($scope._qx != null) ? $scope._qx : g.cx;
                    var oy = ($scope._qy != null) ? $scope._qy : g.cy;
                    var dx = localX - ox;
                    var dy = localY - oy;
                    var az = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                    $scope.targetAzimuth = $scope.allowedAzimuths.length ? snapAzimuth(az) : Math.round(az);
                    $scope.alignedSince = null;
                    $scope.drawMap();
                    $scope.send({ payload: $scope.targetAzimuth, topic: 'targetAzimuth' });
                }

                function onSvgMouseDown(event) {
                    // Pan if the press lands near the QTH marker; otherwise zoom.
                    var mode = 'zoom';
                    var g = getSvgGeometry();
                    if (g && $scope._qx != null) {
                        var lx = event.clientX - g.rect.left, ly = event.clientY - g.rect.top;
                        if (Math.hypot(lx - $scope._qx, ly - $scope._qy) <= QTH_GRAB_RADIUS) mode = 'pan';
                    }
                    dragStart = { x: event.clientX, y: event.clientY, onSvg: true, mode: mode };
                    dragZoomBase = $scope.zoom;
                    didDrag = false;
                }

                function onSvgWheel(event) {
                    event.preventDefault();
                    var factor = event.deltaY < 0 ? 1.04 : 1 / 1.04;
                    requestZoomTo($scope.targetZoom * factor);
                }

                // Attach once after the SVG element exists (init fires after ng-init)
                setTimeout(function () {
                    var el = document.getElementById('rotator-' + $scope.$id);
                    if (!el) return;
                    el.style.userSelect = 'none';
                    el.addEventListener('mousedown', onSvgMouseDown);
                    el.addEventListener('wheel', onSvgWheel, { passive: false });
                }, 0);
                $scope.colors = {
                    ocean: '#76acd6',
                    land: '#9e7e3d',
                    landOutline: '#5c402e',
                    landOutlineOpacity: 100,
                    current: '#001ef9',
                    currentOpacity: 100,
                    target: '#ff4400',
                    targetOpacity: 100,
                    aligned: '#000000',
                    alignedOpacity: 100,
                    equator: '#555555',
                    equatorOpacity: 70,
                    polarCircles: '#555555',
                    polarCirclesOpacity: 55,
                    graticule: '#444444',
                    graticuleOpacity: 40,
                    dxDot: '#ff0000',
                    dxDotOpacity: 100
                };
                $scope.latLineWidth = 0.4;
                $scope.beamWidth = 30;
                $scope.showGrayline = false;
                $scope.showAzimuthInMap = true;

                // ----------------------------------------------------------
                // Called by ng-init with values from node config
                // ----------------------------------------------------------
                $scope.init = function (qth, currentAz, targetAz, colors, latLineWidth, defaultZoom, beamWidth, showGrayline, dxGrid, allowedAzimuths, showAzimuthInMap) {
                    $scope.qth = qth || 'JJ00';
                    $scope.currentAzimuth = parseFloat(currentAz) || 0;
                    $scope.targetAzimuth = parseFloat(targetAz) || 0;
                    if (dxGrid != null) { $scope.dxGrid = String(dxGrid).toUpperCase(); }
                    if (allowedAzimuths != null) {
                        $scope.allowedAzimuths = String(allowedAzimuths).split(',')
                            .map(function (s) { return parseFloat(s); })
                            .filter(function (n) { return isFinite(n); })
                            .map(function (n) { return ((n % 360) + 360) % 360; })
                            .sort(function (a, b) { return a - b; });
                        // snap the initial/default target onto the list
                        $scope.targetAzimuth = snapAzimuth($scope.targetAzimuth);
                    }
                    if (colors && typeof colors === 'object') { $scope.colors = colors; }
                    if (latLineWidth) { $scope.latLineWidth = parseFloat(latLineWidth); }
                    if (defaultZoom) {
                        $scope.defaultZoom = parseFloat(defaultZoom);
                        $scope.zoom = $scope.defaultZoom;
                    }
                    if (beamWidth != null) { $scope.beamWidth = parseFloat(beamWidth); }
                    if (showGrayline != null) { $scope.showGrayline = !!showGrayline; }
                    if (showAzimuthInMap != null) { $scope.showAzimuthInMap = !!showAzimuthInMap; }

                    // Grayline terminator moves with time — redraw every minute while shown
                    if ($scope.showGrayline && !$scope._graylineTimer) {
                        $scope._graylineTimer = setInterval(function () {
                            if ($scope.showGrayline) { $scope.drawMap(); }
                        }, 60000);
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
                                fetch('/ui_h2k_rotator/admin1.geojson').then(function (r) { return r.json(); })
                            ]);
                        })
                        .then(function (results) {
                            $scope.worldData = results[0];
                            $scope.admin1Data = results[1];
                            // Defer slightly so the SVG has been laid out by the browser
                            setTimeout(function () { $scope.drawMap(); }, 120);
                        })
                        .catch(function (err) {
                            console.error('[ui_h2k_rotator] map load error:', err);
                        });
                };

                // ----------------------------------------------------------
                // Main draw routine
                // ----------------------------------------------------------
                $scope.drawMap = function () {
                    if (!$scope.worldData || typeof window.d3 === 'undefined') return;

                    var d3 = window.d3;
                    var topojson = window.topojson;

                    var svgEl = document.getElementById('rotator-' + $scope.$id);
                    if (!svgEl) return;

                    var rect = svgEl.getBoundingClientRect();
                    var W = rect.width;
                    var H = rect.height;
                    if (W < 10 || H < 10) { setTimeout(function () { $scope.drawMap(); }, 200); return; }

                    // Leave room around the circle for the compass labels
                    var LABEL_PAD = 0;
                    var radius = Math.min(W, H) / 2 - LABEL_PAD;
                    var cx = W / 2;   // widget centre (clip / ocean ellipse centre)
                    var cy = H / 2;

                    // ----- View pan: QTH (qx,qy) moves gradually toward an edge -----
                    // Panning only applies once zoomed in to at least 1.8×.
                    var panX = clampPan($scope.panX, $scope.zoom);
                    var panY = clampPan($scope.panY, $scope.zoom);
                    var qx = panX * W;   // QTH screen position = projection translate = rose centre
                    var qy = panY * H;

                    // ----- Outer border shape: rounded box -----
                    // The far side(s) keep the original circle radius R; the box
                    // stretches toward the QTH side(s) in proportion to the pan offset
                    // (0 at centre → 25% at the limit). Near corners shrink from R
                    // toward R/2 as the QTH moves away from the centre. Centred → a 2R
                    // square with radius R, i.e. the original circle.
                    var R = radius;
                    var offX = panX - 0.5, offY = panY - 0.5;   // each in [-0.25, 0.25]
                    var MARGIN = LABEL_PAD;
                    // Per-axis bounds: far edge fixed at centre±R, near edge interpolates
                    // toward the border as |off| grows to 0.25.
                    function axisBounds(off, c, dim) {
                        var t = Math.abs(off) / 0.25;
                        if (off > 0) return [c - R, (c + R) + t * ((dim - MARGIN) - (c + R))];
                        if (off < 0) return [(c - R) - t * ((c - R) - MARGIN), c + R];
                        return [c - R, c + R];
                    }
                    var xb = axisBounds(offX, cx, W), left = xb[0], right = xb[1];
                    var yb = axisBounds(offY, cy, H), top = yb[0], bottom = yb[1];
                    var halfW = (right - left) / 2, halfH = (bottom - top) / 2;
                    // Each corner's radius scales continuously with how aligned it is
                    // with the pan direction (dot product), from R (opposite/centre)
                    // down to R/2 (fully toward the QTH). Using the alignment rather
                    // than a per-axis boolean avoids a jump when one axis crosses centre.
                    function cornerR(sx, sy) {
                        var n = Math.max(0, Math.min(1, (sx * offX + sy * offY) / 0.25));
                        return Math.min(R * (1 - 0.5 * n), halfW, halfH);
                    }
                    var rTL = cornerR(-1, -1);
                    var rTR = cornerR(1, -1);
                    var rBR = cornerR(1, 1);
                    var rBL = cornerR(-1, 1);

                    // Build the border polygon (clip + ocean outline + rose reference)
                    var clipPts = [];
                    function arcPush(ox, oy, rr, a0, a1) {
                        var steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.05));
                        for (var i = 0; i <= steps; i++) {
                            var a = a0 + (a1 - a0) * i / steps;
                            clipPts.push([ox + rr * Math.cos(a), oy + rr * Math.sin(a)]);
                        }
                    }
                    arcPush(left + rTL, top + rTL, rTL, Math.PI, Math.PI * 1.5);
                    arcPush(right - rTR, top + rTR, rTR, Math.PI * 1.5, Math.PI * 2);
                    arcPush(right - rBR, bottom - rBR, rBR, 0, Math.PI * 0.5);
                    arcPush(left + rBL, bottom - rBL, rBL, Math.PI * 0.5, Math.PI);

                    function ptsToPath(pts) {
                        return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join('L') + 'Z';
                    }
                    var clipPath = ptsToPath(clipPts);

                    // Distance from the QTH (qx,qy) to the border polygon along a bearing
                    // (radians, 0 = up/north). Lays the compass rose + azimuth lines on
                    // the border, and sizes the projection clip so the map fills it.
                    function borderDist(ang) {
                        var dx = Math.sin(ang), dy = -Math.cos(ang), best = null;
                        for (var i = 0; i < clipPts.length; i++) {
                            var pA = clipPts[i], pB = clipPts[(i + 1) % clipPts.length];
                            var ex = pB[0] - pA[0], ey = pB[1] - pA[1];
                            var den = dx * ey - dy * ex;
                            if (Math.abs(den) < 1e-9) continue;
                            var t = ((pA[0] - qx) * ey - (pA[1] - qy) * ex) / den;
                            var s = ((pA[0] - qx) * dy - (pA[1] - qy) * dx) / den;
                            if (t >= 0 && s >= -1e-6 && s <= 1 + 1e-6 && (best === null || t < best)) best = t;
                        }
                        return best === null ? radius : best;
                    }
                    // Farthest border point from the QTH → sizes the projection clip angle
                    var maxBorderDist = radius;
                    for (var ci = 0; ci < clipPts.length; ci++) {
                        var dd = Math.hypot(clipPts[ci][0] - qx, clipPts[ci][1] - qy);
                        if (dd > maxBorderDist) maxBorderDist = dd;
                    }

                    // Expose geometry for click / hit-testing
                    $scope._qx = qx; $scope._qy = qy; $scope._radius = radius;
                    $scope._clipPts = clipPts;

                    // ------ Projection (azimuthal equidistant, centred on QTH) ------
                    var latlon = maidenheadToLatLon($scope.qth);
                    var lat = latlon[0], lon = latlon[1];

                    var scalePxPerDeg = (radius / Math.PI * $scope.zoom) * (Math.PI / 180);
                    var clipAngleDeg = Math.min(179.9, maxBorderDist / scalePxPerDeg);
                    var projection = d3.geoAzimuthalEquidistant()
                        .rotate([-lon, -lat])
                        .scale(radius / Math.PI * $scope.zoom)
                        .translate([qx, qy])
                        .clipAngle(clipAngleDeg);

                    var pathGen = d3.geoPath().projection(projection);

                    // ------ Build SVG ------
                    var svg = d3.select(svgEl);
                    svg.selectAll('*').remove();

                    // Defs: clip path + arrow markers
                    var defs = svg.append('defs');
                    var clipId = 'globe-clip-' + $scope.$id;
                    defs.append('clipPath').attr('id', clipId)
                        .append('path')
                        .attr('d', clipPath);

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

                    // Pill label at distance r from QTH along rad.
                    function drawAzLabel(rad, color, text, r) {
                        var lx = qx + r * Math.sin(rad);
                        var ly = qy - r * Math.cos(rad);
                        var PW = 40, PH = 18;
                        var g = svg.append('g');
                        g.append('rect')
                            .attr('x', lx - PW / 2).attr('y', ly - PH / 2)
                            .attr('width', PW).attr('height', PH)
                            .attr('rx', 4).attr('ry', 4)
                            .style('fill', color);
                        g.append('text')
                            .attr('x', lx).attr('y', ly)
                            .attr('text-anchor', 'middle')
                            .attr('dominant-baseline', 'middle')
                            .attr('font-size', '13px')
                            .attr('font-family', 'monospace')
                            .attr('font-weight', 'bold')
                            .style('fill', contrastColor(color))
                            .style('pointer-events', 'none')
                            .text(text);
                    }

                    var C = $scope.colors;

                    // NOTE: All fills and strokes on <path> elements use .style() not .attr()
                    // because the dashboard has a global CSS rule that sets a default fill on
                    // all SVG paths. Inline styles (.style) beat stylesheet rules; attributes
                    // (.attr) do not.

                    // ------ Ocean background ------
                    svg.append('path')
                        .attr('d', clipPath)
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

                    // ------ Grayline (night hemisphere) ------
                    // Shade the night side: a 90°-radius circle centred on the
                    // antipode of the sub-solar point, recomputed from UTC.
                    if ($scope.showGrayline) {
                        var now = new Date();
                        // Solar declination (deg) from day-of-year approximation
                        var yStart = Date.UTC(now.getUTCFullYear(), 0, 0);
                        var dayN = Math.floor((now - yStart) / 86400000);
                        var decl = -23.44 * Math.cos((2 * Math.PI / 365) * (dayN + 10));
                        // Sub-solar longitude (deg): solar noon ≈ 0° at 12:00 UTC
                        var utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
                        var lonSun = -15 * (utcH - 12);
                        // Night hemisphere = antipode of the sub-solar point
                        var nightCenter = [lonSun + 180, -decl];
                        var nightCircle = d3.geoCircle().center(nightCenter).radius(90)();
                        mapG.append('path')
                            .datum(nightCircle)
                            .attr('d', pathGen)
                            .style('fill', '#000000')
                            .style('fill-opacity', 0.2)
                            .style('stroke', 'none')
                            .style('pointer-events', 'none');
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
                        { lat: 0, color: C.equator, opacity: C.equatorOpacity / 100, width: lw * 1.2 },
                        { lat: 66.5, color: C.polarCircles, opacity: C.polarCirclesOpacity / 100, width: lw },
                        { lat: -66.5, color: C.polarCircles, opacity: C.polarCirclesOpacity / 100, width: lw }
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

                    // ------ Degree tick marks (laid on the outer border) ------
                    // Cardinals (0/90/180/270) are replaced by labelled badges below.
                    for (var deg = 0; deg < 360; deg += 10) {
                        if (deg % 90 === 0) continue;
                        var isMajor = (deg % 30 === 0);
                        var tickLen = isMajor ? 9 : 5;
                        var rad = deg * Math.PI / 180;
                        var bd = borderDist(rad);
                        var innerR = bd - tickLen;
                        svg.append('line')
                            .attr('x1', qx + innerR * Math.sin(rad))
                            .attr('y1', qy - innerR * Math.cos(rad))
                            .attr('x2', qx + bd * Math.sin(rad))
                            .attr('y2', qy - bd * Math.cos(rad))
                            .attr('stroke', '#333')
                            .attr('stroke-width', isMajor ? 1.5 : 0.8);
                    }

                    // ------ Allowed-azimuth markers (6× thicker, on the border) ------
                    $scope.allowedAzimuths.forEach(function (deg) {
                        var rad = deg * Math.PI / 180;
                        var bd = borderDist(rad);
                        var innerR = bd - 12;
                        svg.append('line')
                            .attr('x1', qx + innerR * Math.sin(rad))
                            .attr('y1', qy - innerR * Math.cos(rad))
                            .attr('x2', qx + bd * Math.sin(rad))
                            .attr('y2', qy - bd * Math.cos(rad))
                            .attr('stroke', '#333')
                            .attr('stroke-width', 9)
                            .attr('stroke-linecap', 'round');
                    });

                    // ------ DX grid marker ------
                    // A coloured dot at the DX station's grid square, clipped to the globe.
                    if ($scope.dxGrid && $scope.dxGrid.length >= 4) {
                        var dxLatLon = maidenheadToLatLon($scope.dxGrid);
                        if (dxLatLon && isFinite(dxLatLon[0]) && isFinite(dxLatLon[1])) {
                            var dxXY = projection([dxLatLon[1], dxLatLon[0]]);
                            // projection() returns null when the point is clipped (back of globe)
                            if (dxXY) {
                                var dxG = svg.append('g').attr('clip-path', 'url(#' + clipId + ')');
                                dxG.append('circle')
                                    .attr('cx', dxXY[0]).attr('cy', dxXY[1]).attr('r', 5)
                                    .style('fill', C.dxDot)
                                    .style('fill-opacity', (C.dxDotOpacity != null ? C.dxDotOpacity : 100) / 100)
                                    .style('stroke', '#000')
                                    .style('stroke-width', 1)
                                    .style('stroke-opacity', (C.dxDotOpacity != null ? C.dxDotOpacity : 100) / 100)
                                    .style('pointer-events', 'none')
                                    .append('title')
                                    .text('DX: ' + $scope.dxGrid);
                            }
                        }
                    }

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

                    // Azimuth-line length reaches the border (minus a little for the arrow head)

                    // ------ Beam width wedge ------
                    if ($scope.beamWidth > 0) {
                        var bw = $scope.beamWidth;
                        var beamColor = aligned ? C.aligned : C.current;
                        var beamBaseOpacity = aligned ? C.alignedOpacity / 100 : C.currentOpacity / 100;
                        var halfRad = (bw / 2) * Math.PI / 180;
                        var cRadBeam = $scope.currentAzimuth * Math.PI / 180;
                        var leftRad = cRadBeam - halfRad;
                        var rightRad = cRadBeam + halfRad;
                        var beamR = Math.max(W, H) * 2;  // extends well past the view; clip path trims it
                        var x1 = qx + beamR * Math.sin(leftRad), y1 = qy - beamR * Math.cos(leftRad);
                        var x2 = qx + beamR * Math.sin(rightRad), y2 = qy - beamR * Math.cos(rightRad);
                        var largeArc = bw >= 180 ? 1 : 0;

                        var beamG = svg.append('g').attr('clip-path', 'url(#' + clipId + ')');

                        // filled wedge
                        beamG.append('path')
                            .attr('d', 'M' + qx + ',' + qy +
                                ' L' + x1 + ',' + y1 +
                                ' A' + beamR + ',' + beamR + ' 0 ' + largeArc + ' 1 ' + x2 + ',' + y2 +
                                ' Z')
                            .style('fill', beamColor)
                            .style('fill-opacity', beamBaseOpacity * 0.2)
                            .style('stroke', 'none');

                        // left edge line
                        beamG.append('line')
                            .attr('x1', qx).attr('y1', qy)
                            .attr('x2', x1).attr('y2', y1)
                            .style('stroke', beamColor)
                            .style('stroke-opacity', beamBaseOpacity * 0.25)
                            .style('stroke-width', 1);

                        // right edge line
                        beamG.append('line')
                            .attr('x1', qx).attr('y1', qy)
                            .attr('x2', x2).attr('y2', y2)
                            .style('stroke', beamColor)
                            .style('stroke-opacity', beamBaseOpacity * 0.25)
                            .style('stroke-width', 1);
                    }

                    if (!aligned) {
                        // Target azimuth
                        var tId = 'arrow-tgt-' + $scope.$id;
                        arrowMarker(tId, C.target);
                        var trad = $scope.targetAzimuth * Math.PI / 180;
                        var tLineR = borderDist(trad) - 19;
                        svg.append('line')
                            .attr('x1', qx).attr('y1', qy)
                            .attr('x2', qx + tLineR * Math.sin(trad))
                            .attr('y2', qy - tLineR * Math.cos(trad))
                            .attr('stroke', C.target)
                            .attr('stroke-opacity', C.targetOpacity / 100)
                            .attr('stroke-width', 2)
                            .attr('marker-end', 'url(#' + tId + ')');
                        if ($scope.showAzimuthInMap) {
                            drawAzLabel(trad, C.target, Math.round($scope.targetAzimuth) + '°', 0.7 * tLineR);
                        }
                    }

                    // Current azimuth
                    var curColor = aligned ? C.aligned : C.current;
                    var curOpacity = aligned ? C.alignedOpacity / 100 : C.currentOpacity / 100;
                    var cId = 'arrow-cur-' + $scope.$id;
                    arrowMarker(cId, curColor);
                    var crad = $scope.currentAzimuth * Math.PI / 180;
                    var cLineR = borderDist(crad) - 19;
                    svg.append('line')
                        .attr('x1', qx).attr('y1', qy)
                        .attr('x2', qx + cLineR * Math.sin(crad))
                        .attr('y2', qy - cLineR * Math.cos(crad))
                        .attr('stroke', curColor)
                        .attr('stroke-opacity', curOpacity)
                        .attr('stroke-width', 2.5)
                        .attr('marker-end', 'url(#' + cId + ')');

                    if ($scope.showAzimuthInMap) {
                        // QTH pill — current azimuth (aligned color when matched)
                        var qthColor = aligned ? C.aligned : C.current;
                        var QW = 40, QH = 18;
                        svg.append('rect')
                            .attr('x', qx - QW / 2).attr('y', qy - QH / 2)
                            .attr('width', QW).attr('height', QH)
                            .attr('rx', 4).attr('ry', 4)
                            .style('fill', qthColor);
                        svg.append('text')
                            .attr('x', qx).attr('y', qy)
                            .attr('text-anchor', 'middle')
                            .attr('dominant-baseline', 'middle')
                            .attr('font-size', '13px')
                            .attr('font-family', 'monospace')
                            .attr('font-weight', 'bold')
                            .style('fill', contrastColor(qthColor))
                            .style('pointer-events', 'none')
                            .text(Math.round($scope.currentAzimuth) + '°');
                    } else {
                        // QTH dot
                        svg.append('circle').attr('cx', qx).attr('cy', qy).attr('r', 5)
                            .attr('fill', '#222').attr('stroke', 'white').attr('stroke-width', 1.5);

                        // HUD: current top-left, target top-right when unmatched
                        var hudY = 22;
                        svg.append('text')
                            .attr('x', 10).attr('y', hudY)
                            .attr('text-anchor', 'start')
                            .attr('font-size', '17px')
                            .attr('font-family', 'monospace')
                            .style('fill', aligned ? C.aligned : C.current)
                            .text(Math.round($scope.currentAzimuth) + '°');
                        if (!aligned) {
                            var tgtEl = svg.append('text')
                                .attr('x', W - 10).attr('y', hudY)
                                .attr('text-anchor', 'end')
                                .attr('font-size', '17px')
                                .attr('font-family', 'monospace');
                            tgtEl.append('tspan').style('fill', C.aligned).text('➜ ');
                            tgtEl.append('tspan').style('fill', C.target).text(Math.round($scope.targetAzimuth) + '°');
                        }
                    }

                    // ------ Cardinal labels (no background, black, above arrows) ------
                    var cardinals = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
                    cardinals.forEach(function (c) {
                        var a = c[1] * Math.PI / 180;
                        var bd = borderDist(a);
                        var labelR = bd - 11;   // center 11px from border
                        svg.append('text')
                            .attr('x', qx + labelR * Math.sin(a))
                            .attr('y', qy - labelR * Math.cos(a))
                            .attr('text-anchor', 'middle')
                            .attr('dominant-baseline', 'middle')
                            .attr('font-size', '17px')
                            .attr('font-weight', '900')
                            .attr('font-family', 'sans-serif')
                            .attr('fill', '#000')
                            .text(c[0]);
                    });

                    // ------ View reset button (bottom-right; only when zoomed/panned off default) ------
                    // Hit-testing is done in the document-level mouseup handler
                    // (see onMouseUp/selectTargetAt) so it keeps working while
                    // frequent redraws replace the SVG element under the cursor.
                    if (Math.abs($scope.zoom - $scope.defaultZoom) > 0.01) {
                        var btnSize = 40, btnX = W - btnSize - 8, btnY = H - btnSize - 8;
                        $scope._zoomBtnRect = { x: btnX, y: btnY, w: btnSize, h: btnSize };
                        var btnG = svg.append('g').style('cursor', 'pointer');
                        btnG.append('title')
                            .text('Zoom: ' + $scope.zoom.toFixed(2) + '× (click to reset to ' + $scope.defaultZoom.toFixed(2) + '×)');
                        btnG.append('text')
                            .attr('x', btnX + btnSize / 2).attr('y', btnY + btnSize / 2 + 1)
                            .attr('text-anchor', 'middle')
                            .attr('dominant-baseline', 'middle')
                            .attr('font-size', '28px')
                            .style('fill', C.aligned)
                            .style('pointer-events', 'none')
                            .text('↺');
                    } else {
                        $scope._zoomBtnRect = null;
                    }
                };

                // ----------------------------------------------------------
                // React to incoming messages
                // ----------------------------------------------------------
                $scope.$watch('msg', function (msg) {
                    if (!msg) return;
                    var changed = false;
                    var targetChanged = false;
                    if (msg.currentAzimuth !== undefined) {
                        $scope.currentAzimuth = parseFloat(msg.currentAzimuth);
                        changed = true;
                    }
                    if (msg.targetAzimuth !== undefined) {
                        var newTarget = snapAzimuth(parseFloat(msg.targetAzimuth));
                        if (newTarget !== $scope.targetAzimuth) { targetChanged = true; }
                        $scope.targetAzimuth = newTarget;
                        $scope.alignedSince = null;
                        changed = true;
                    }
                    if (msg.dxGrid !== undefined) {
                        $scope.dxGrid = (msg.dxGrid == null) ? '' : String(msg.dxGrid).toUpperCase();
                        changed = true;
                    }
                    if (changed) $scope.drawMap();
                    // Echo a target update on the output so downstream stays in sync.
                    // Only when the value actually changed — this also prevents loops
                    // if the output is wired back to the input.
                    if (targetChanged) {
                        $scope.send({ payload: $scope.targetAzimuth, topic: 'targetAzimuth' });
                    }
                });
            }
        });

        node.on('close', function (removed, done) {
            if (typeof widgetCleanup === 'function') { widgetCleanup(); }
            done();
        });
    }

    RED.nodes.registerType('ui_h2k_rotator', RotatorWidget);
};
