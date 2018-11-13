(function ($) {

    //Defaults - Local Settings
    var ls = {
        cloudSearch: {
            url: "",
            key: ""
        },
        googleGeocodeApi: {
            key: null,
            url: "https://maps.googleapis.com/maps/api/geocode/json",
            language: 'en'
        },
        geoSearch: {
            lat: null,
            lng: null,
            fieldName: '_distance',
            cloudFieldName: null,
            unit: 'K',
            maxDistance: null
        },
        searchParms: {
            search: "*",
            facets: [],
            count: true,
            top: 50,
            skip: 0,
            filter: null,
            orderby: null
        },
        facets: {
            facet: '<a href=\"#\"/>',
            facetClass: 'facet',
            titleWrapper: "<h2/>",
            title: "<a href=\"#\"/>",
            titleClass: "",
            titleOnClick: function () { },
            titleWrapperClass: "facet-title",
            container: "#facets",
            wrapperContainer: "<ul/>",
            wrapperContainerClass: "facet-list",
            wrapper: "<li/>",
            wrapperClass: "facet-item",
            showCount: true,
            countWrapper: null,
            countWrapperClass: null,
            facetOnClick: defaultFacetClick,
            searchMode: 'and',
            onFacetSelect: defaultFacetSelect,
            groupWrapper: '<div/>',
            groupWrapperClass: 'group'
        },
        facetsApplied: {
            container: null,
            class: 'selected-facet',
            extraAttributes: {},
            ignoreFacets: [],
            onChange: function () { }
        },
        facetsDictionary: null,
        //Array containing facetname|facetvalue
        facetsSelected: [],
        results: {
            container: '#results',
            template: null,
            onCreate: function () { },
            alwaysClearContainer: false
        },
        urlParameters: {
            address: 'a',
            latitude: 'l',
            longitude: 'ln',
            latlong: null,
            search: 'q'
        },
        onResults: processResults,
        onLoad: function () { },
        debug: false
    };

    //Internal Parameters
    var local = {
        waitingLatLong: false,
        isGeoSearch: false,
        totalResults: 0,
        initialized: false
    }


    /**
     * jQuuery Plugin Definition
     */

    $.fn.cloudsearch = function (options, action) {

        if (!action)
            action = 'search';

        if (options) {
            //Default options.
            if (options.googleGeocodeApi) options.googleGeocodeApi = $.extend(ls.googleGeocodeApi, options.googleGeocodeApi);
            if (options.searchParms) options.searchParms = $.extend(ls.searchParms, options.searchParms);
            if (options.facets) options.facets = $.extend(ls.facets, options.facets);
            if (options.facetsApplied) options.facetsApplied = $.extend(ls.facetsApplied, options.facetsApplied);
            if (options.results) options.results = $.extend(ls.results, options.results);
            if (options.geoSearch) options.geoSearch = $.extend(ls.geoSearch, options.geoSearch);
            if (options.urlParameters) options.urlParameters = $.extend(ls.urlParameters, options.urlParameters);
            ls = $.extend(ls, options);

            checkUrlParameters();
        }

        if (!local.initialized) {
            //Check active facets
            $(ls.facetsSelected).each(function (i, v) {
                ls.facets.onFacetSelect.call([v]);
            });
        }

        switch (action) {
            case "search":
                search();
                break;
            case "resetFacets":
                ls.facetsSelected = [];
                ls.facets.onFacetSelect.call(ls.facetsSelected);
                search();
                break;
        }

        local.initialized = true;

        // return
        return this;

    };



    /**
     * Handlers
     */

    function processResults() {
        var data = this;

        loadFacets(data);
        loadResults(data);

        ls.onLoad.call(data, local);
    }

    //Default action when a facet receives a click
    function defaultFacetClick(e) {
        e.preventDefault();

        var value = $(this).data('cloudsearchFacetName') + '|' + $(this).data('cloudsearchFacetValue');

        if (ls.facetsSelected.indexOf(value) != -1)
            return;

        ls.facetsSelected.push(value);
        ls.facetsApplied.onChange.call(ls.facetsSelected.slice(0));
        ls.facets.onFacetSelect.call(ls.facetsSelected.slice(0));
        search();
    }

    //Default action when a facet is selected
    function defaultFacetSelect() {

        var sfs = ls.facetsApplied;

        if (!sfs.container)
            return;

        var lastFacet = this.pop();
        var c = $(sfs.container);

        var fs = lastFacet.split('|');

        //Ignore if necessary
        if (sfs.ignoreFacets.indexOf(fs[0]) != -1)
            return;

        $('<a/>').text(fs[1])
            .attr({ 'href': '#' })
            .attr(sfs.extraAttributes)
            .data('value', lastFacet)
            .addClass(sfs.class)
            .on('click', function () {
                ls.facetsSelected
                    .splice(
                        ls.facetsSelected.indexOf($(this).data('value')), 1
                    );
                ls.facetsApplied.onChange.call(ls.facetsSelected.slice(0));
                $(this).remove();
                search();
            })
            .appendTo(c);
    }

    function processAddress(data) {
        debug('Google Geocode return:');
        debug(data);

        var ret = null;

        if (data.status == "OK" && data.results.length > 0) {
            ls.geoSearch.lat = data.results[0].geometry.location.lat;
            ls.geoSearch.lng = data.results[0].geometry.location.lng;
        }

        local.waitingLatLong = false;
        search();
    }


    /**
     * Content Functions
     */

    //Display the results
    function loadResults(data) {
        var rs = ls.results;
        var c = $(rs.container);

        if (!c || !data["value"])
            return;

        //Clear the container if skip is 0 or if the clear is forced by setting
        if (rs.alwaysClearContainer || ls.searchParms.skip == 0)
            c.html('');

        $(data["value"]).each(function (i, v) {

            //Populate the results
            if (!rs.template) {
                //Without a template, just display all the fields with some content
                var l = $('<dl/>')
                $(Object.keys(v)).each(function (j, k) {
                    if (!v[k] || v[k] == '')
                        return true;
                    $('<dt/>').text(k).appendTo(l);
                    $('<dd/>').text(v[k]).appendTo(l);
                });
                l.appendTo(c);

                //Callback on create
                rs.onCreate.call(l);
            } else {
                //With template
                var t = $(rs.template);
                $(':not([data-cloudsearch-field=""])', t).each(function (y, z) {
                    var field = $(z).data('cloudsearchField');
                    var value = '';
                    if (field && v[field]) {
                        value = v[field];
                    } else if (field == ls.geoSearch.fieldName && local.isGeoSearch) {
                        if (v[ls.geoSearch.cloudFieldName]) {
                            var geo = v[ls.geoSearch.cloudFieldName];
                            value = distance(
                                ls.geoSearch.lat, ls.geoSearch.lng,
                                geo.coordinates[1], geo.coordinates[0],
                                ls.geoSearch.unit);
                        }
                    }

                    //Format the data using the provided Callback function
                    var format = $(z).data('cloudsearchValueFormat');
                    if (format && window[format])
                        value = window[format](value, v);

                    if (field)
                        $(z).html(value);

                });
                c.append(t);

                //Callback on create
                rs.onCreate.call(t);
            }
        });

    }

    //Load the facets according to the results
    function loadFacets(data) {
        var fs = ls.facets;
        var c = $(fs.container);

        //Check if the containers was defiend and if the facets were part of the results
        if (!c || !data["@search.facets"])
            return;

        c.html('');

        $(ls.searchParms.facets).each(function (i, v) {

            //Ignore the faceting options if any
            if (v.indexOf(',') != -1)
                v = v.split(',')[0];

            if (data["@search.facets"][v]) {

                //Facet's Title
                var tt = ls.facetsDictionary && ls.facetsDictionary[v] ?
                    ls.facetsDictionary[v] : v;

                var title = $(fs.title).addClass(fs.titleClass).text(tt);

                if (fs.titleWrapper) {
                    title = $(fs.titleWrapper).addClass(fs.titleWrapperClass).append(title);
                }

                c.append(title);
                title.on('click', fs.titleOnClick);

                //Facets container
                var w = $(fs.wrapperContainer).addClass(fs.wrapperContainerClass);
                c.append(w);

                var countFacets = 0;

                //Facets
                $(data["@search.facets"][v]).each(function (j, k) {

                    //Create the facet
                    var f = $(fs.facet)
                        .addClass(fs.facetClass)
                        .html(k.value)
                        .on('click', fs.facetOnClick)
                        .data('cloudsearchFacetName', v)
                        .data('cloudsearchFacetValue', k.value);

                    //Counter
                    if (fs.showCount && ls.facets.countWrapper) {
                        $(ls.facets.countWrapper)
                            .text("(" + k.count + ")")
                            .addClass(ls.facets.countWrapperClass)
                            .appendTo(f);
                    } else if (fs.showCount) {
                        f.append(" (" + k.count + ")");
                    }

                    //Do not display selected facets
                    if (ls.facetsSelected.indexOf(v + '|' + k.value) != -1)
                        return true;

                    if (fs.wrapper)
                        $(fs.wrapper).addClass(fs.wrapperClass).append(f).appendTo(w);
                    else
                        w.append(f);

                    countFacets++;
                });

                //Group Wrapper
                if (fs.groupWrapper) {
                    var gw = $(fs.groupWrapper).addClass(fs.groupWrapperClass);
                    c.append(gw);
                    title.appendTo(gw);
                    w.appendTo(gw);
                }

                if (countFacets == 0)
                    title.remove();

            }
        });
    }

    /**
     * External API Calls
     */

    //Execute the AJAX call to AWS Cloud Search
    function search() {

        // local.isGeoSearch = false;

        // if (local.waitingLatLong)
        //     return;

        // //Check if it's geo search
        // if (ls.geoSearch.lat && ls.geoSearch.lng) {
        //     debug('Geo searching...');
        //     debug(ls.geoSearch.lat);
        //     debug(ls.geoSearch.lng);
        //     local.isGeoSearch = true;
        //     if (!ls.searchParms.orderby || ls.searchParms.orderby.indexOf(ls.geoSearch.fieldName) == 0) {
        //         var orderby = "geo.distance(" + ls.geoSearch.cloudFieldName;
        //         orderby += ", geography'POINT(" + ls.geoSearch.lng + " " + ls.geoSearch.lat + ")')";
        //         if (ls.searchParms.orderby && ls.searchParms.orderby.indexOf(' desc') != -1) orderby += ' desc';
        //         ls.searchParms.orderby = orderby;
        //     }
        // }

        // var f = null;
        // //Save the current filter
        // var previousFilter = ls.searchParms.filter;

        // //Apply Facet Filters
        // if (ls.facetsSelected.length > 0) {
        //     var facetFilter = [];
        //     ls.facetsSelected.forEach(function (item, index) {
        //         var p = item.split('|');
        //         // apply filter and escape single quotes in value (')
        //         facetFilter.push(p[0] + '/any(m: m eq \'' + p[1].replace(/[']/gi,'\'\'') + '\')');
        //     });

        //     f = facetFilter.join(' ' + ls.facets.searchMode + ' ');

        //     if (previousFilter)
        //         f = ls.searchParms.filter + ' ' + ls.facets.searchMode + ' ' + f;

        // }

        // //Apply geo distance filter if configured
        // if (local.isGeoSearch && ls.geoSearch.maxDistance) {
        //     debug('Filter Geo searching by distance : ' + ls.geoSearch.maxDistance);
        //     var geoFilter = "geo.distance(" + ls.geoSearch.cloudFieldName + ", geography'POINT(" + ls.geoSearch.lng + " " + ls.geoSearch.lat + ")') le " + ls.geoSearch.maxDistance;
        //     if(f) {
        //         f += ' and ' + geoFilter
        //     } else {
        //         f = geoFilter;
        //     }
        // }
        
        // if (f)
        //     ls.searchParms.filter = f;

        console.log(ls.cloudSearch.url);

        var settings = {
            "crossDomain": true,
            "url": ls.cloudSearch.url,
            "method": "POST",
            "headers": {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "api-key": ls.cloudSearch.key,
                "Cache-Control": "no-cache",
            },
            // "data": JSON.stringify(ls.searchParms)
        }

        $.ajax(settings).done(function (response) {
            // local.totalResults = ls.searchParms.count && response['@odata.count']
            //     ? response['@odata.count'] : -1;
            // ls.onResults.call(response, local);
        });

        //Return the filter to the original state
        // ls.searchParms.filter = previousFilter;
    }



    function resolveAddress(address) {
        var s = ls.googleGeocodeApi;

        if (!s.key)
            return;

        local.waitingLatLong = true;

        //Key
        var url = s.url;
        url += url.indexOf('?') != -1 ? '&' : '?';
        url += 'key=' + s.key;
        url += '&address=' + address;
        url += '&language=' + s.language;

        $.getJSON(url, processAddress);
    }

    /**
     * Utility Functions
     */

    //Calculate the distance between two geo points
    function distance(lat1, lon1, lat2, lon2, unit) {

        var radlat1 = Math.PI * lat1 / 180
        var radlat2 = Math.PI * lat2 / 180
        var theta = lon1 - lon2
        var radtheta = Math.PI * theta / 180
        var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
        if (dist > 1) {
            dist = 1;
        }
        dist = Math.acos(dist)
        dist = dist * 180 / Math.PI
        dist = dist * 60 * 1.1515
        if (unit == "K") { dist = dist * 1.609344 }
        if (unit == "N") { dist = dist * 0.8684 }
        return dist;
    }

    function debug(obj) {
        if (ls.debug && window.console && window.console.log) {
            window.console.log(obj);
        }
    };

    //Get query string parameters
    function query(sParam) {

        if (!sParam)
            return null;

        var sPageURL = decodeURIComponent(window.location.search.substring(1)),
            sURLVariables = sPageURL.split('&'),
            sParameterName,
            i;

        for (i = 0; i < sURLVariables.length; i++) {
            sParameterName = sURLVariables[i].split('=');

            if (sParameterName[0] === sParam) {
                return sParameterName[1] === undefined ? true : sParameterName[1];
            }
        }
        return null;
    };

    function checkUrlParameters() {
        var s = ls.urlParameters;

        var address = query(s.address),
            latitude = query(s.latitude),
            longitude = query(s.longitude),
            latlong = query(s.latlong),
            search = query(s.search);

        //Split LatLong
        if (latlong && latlong.indexOf(',') != -1) {
            latitude = latlong.split(',')[0];
            longitude = latlong.split(',')[1];
        }

        //Apply Parameters
        if (search) ls.searchParms.search = search;
        if (latitude && longitude) {
            ls.geoSearch.lat = latitude;
            ls.geoSearch.lng = longitude;
        }

        //Check is is necessary to resolve the address
        if (address && !latitude && !longitude && !latlong) {
            var r = resolveAddress(address);
            if (r) {
                latitude = r[0];
                longitude = r[1];
            }
        }

    }

}(jQuery));