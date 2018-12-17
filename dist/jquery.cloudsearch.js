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
        searchParams: {
            q: "matchall",
            return: "_all_fields",
            size: 10, // page size
            sort: "_score desc",
            start: 0, // offset starting result (pagination)
            "q.parser" : "structured",
        },
        dates: {
            hasDates: false,
            fields: {
                cloudSearchField: null,
                // event: 'change', // change, blur
                from: {
                    fieldId: null
                },
                to: {
                    fieldId: null
                }
            }
        },
        facets: {
            displayFacets: [ ],
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
            noResults: 'Sorry there are no results for your query',
            onCreate: function () { },
            pager: {
                container: null,
                loadMore: true,
                appendPager: false,
                pagerRangeIncrement: 5,
                enders: true,
                labels: {
                    prev: 'Previous',
                    next: 'Next',
                    first: 'First',
                    last: 'Last',
                    results: 'results for',
                    load: 'load more',
                    ada: {
                        current: 'You are on page',
                        item: 'Go to page',
                        prev: 'Go to the previous page of results',
                        next: 'Go to the next page of results',
                        first: 'Go to the first page of results',
                        last: 'Go to the last page of results',
                        load: 'Load more results'
                    }
                },
                onRender: function () { },
                onPageChange: function () { },
            },
        },
        urlParameters: {
            address: 'a',
            latitude: 'l',
            longitude: 'ln',
            latlong: null,
            search: 'q',
            page: 'p',
        },
        onResults: processResults,
        onLoad: function () { },
        debug: false
    };

    //Internal Parameters
    var local = {
        container: null,
        totalPages: 0,
        currentPage: 1,
        pagerRange: [],
        pagerRendered: false,
        waitingLatLong: false,
        isGeoSearch: false,
        totalResults: 0,
        initialized: false,
        rendered: false,
        fromDate: null,
        toDate: null,
    }

    /**
     * jQuuery Plugin Definition
     */

    $.fn.cloudsearch = function (options, action) {

        local.container = this;

        if (!action)
            action = 'search';

        if (options) {            
            ls = $.extend(true, ls, options);            
            checkUrlParameters();
        }

        if (!local.initialized) {
            //Check active facets
            $(ls.facetsSelected).each(function (i, v) {
                ls.facets.onFacetSelect.call([v]);
            });
        }

        if(ls.dates.hasDates) {
            setupDateFields();
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
        // render pager  
        if(data['hits']['found'] > ls.searchParams.size) {
            renderPager(data);
        }    
        ls.onLoad.call(data, local);
    }

    //Default action when a facet receives a click
    function defaultFacetClick(e) {
        e.preventDefault();

        var value = $(this).data('cloudsearchFacetName') + '||' + $(this).data('cloudsearchFacetValue');

        if (ls.facetsSelected.indexOf(value) != -1)
            return;
        ls.searchParams.start = 0;
        local.currentPage = 1;
        ls.facetsSelected.push(value);             
        ls.facetsApplied.onChange.call(ls.facetsSelected.slice(0));    
        ls.facets.onFacetSelect.call(ls.facetsSelected.slice(0));        
        /*    
        */
        search();
    }

    //Default action when a facet is selected
    function defaultFacetSelect() {

        var sfs = ls.facetsApplied;

        if (!sfs.container)
            return;

        var lastFacet = this.pop();
        var c = $(sfs.container);

        var fs = lastFacet.split('||');

        //Ignore if necessary
        if (sfs.ignoreFacets.indexOf(fs[0]) != -1)
            return;

        $('<a/>').text(fs[1])
            .attr({ 'href': '#' })
            .attr(sfs.extraAttributes)
            .data('value', lastFacet)
            .addClass(sfs.class)
            .on('click', function (e) {
                e.preventDefault();
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
        var c = $(rs.container) ? $(rs.container) : $(local.container);
        
        if (!c || !data["hits"]["hit"])
            return;
        //Clear the container if skip is 0 or if the clear is forced by setting
        if (!rs.pager.loadMore || ls.searchParams.skip == 0)
            c.html('');
        
        if(data["hits"]['found'] == 0) {
            $('<div/>').addClass('cloudsearch-no-results').text(rs.noResults).appendTo(c);
        }

        $(data["hits"]["hit"]).each(function (i, v) {

            var fields = v["fields"];
            //Populate the results
            if (!rs.template) {
                //Without a template, just display all the fields with some content
                var l = $('<ul/>')
                var hr = $('<hr/>');

                $(Object.keys(fields)).each(function (j, k) {
                    if (!fields[k] || fields[k] == '')
                        return true;
                    var item = $('<li/>').text(k + " : ").appendTo(l);
                    $('<strong/>').text(fields[k]).appendTo(item);
                });
                l.appendTo(c);
                hr.appendTo(c);

                //Callback on create
                rs.onCreate.call(l);
            } else {
                //With template
                var t = $(rs.template);
                $(':not([data-cloudsearch-field=""])', t).not().each(function (y, z) {

                    var field = $(z).data('cloudsearchField');
                    var value = '';

                    if (field && v["fields"][field]) {
                        value = v["fields"][field];
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

                    if (field) {                        
                        if(typeof $(z).data('cloudsearchValueFormatReplace') !== 'undefined') {
                            $(z).replaceWith(value);
                        } else {
                            $(z).html(value);
                        }
                    }
                });
                c.append(t);

                //Callback on create
                rs.onCreate.call(t);
            }
        });
        local.rendered = true;
    }

    /**
     * 
     * @param {*} data 
     */
    function renderPager(data) {
        
        var pg = ls.results.pager;
        
        if (pg.appendPager) {            
            $(pg.container).empty();
            if(!local.pagerRendered) {
                              

                local.pagerRange[0] = 1;
                local.pagerRange[1] = pg.pagerRangeIncrement 

                if(local.currentPage >= pg.pagerRangeIncrement) {
                    local.pagerRange[0] = Math.floor(local.currentPage/pg.pagerRangeIncrement) * pg.pagerRangeIncrement;
                    local.pagerRange[1] = (Math.floor(local.currentPage/pg.pagerRangeIncrement) + 1) * pg.pagerRangeIncrement;
                }

            }
            generatePagerLinks();            
            // generatePagerText();
            local.pagerRendered = true;
        }        
    }

    /**
     * 
     */
    function generatePagerLinks() {

        var pg = ls.results.pager;
        var c = $(pg.container);

        if (!c)
            return;

        if(pg.loadMore) {
            
            c.append(addPagerButton('load'));
            
        } else {         

            var items;
            if(pg.enders) {
                c.append(addPagerButton('first'));
            }
            c.append(addPagerButton('prev'));

            if(!local.pagerRendered) {
                items = $('<div/>').addClass('pager-nav-items');
            } else {
                items = $('.pager-nav-items').empty();
            }

            var i = local.pagerRange[0];
            while(i <= local.pagerRange[1] && i <= local.totalPages) {
                var pagerLink = $('<a href="#">').data('targetPage',i);
                if(i === local.currentPage) {
                    pagerLink = $('<span></span>');
                    pagerLink.attr('title', pg.labels.ada.current + ' ' + i);
                } else {
                    pagerLink.attr('title', pg.labels.ada.item + ' ' + i);
                }
                pagerLink.text(i);
                items.append(pagerLink);
                i++;
            }

            if( !c ) {                
                c.append(addPagerButton('next'));
                if(pg.enders) {
                    c.append(addPagerButton('last'));
                }
                $(local.container).after(c)
            } else {
                c.append(items);            
                c.append(addPagerButton('next'));
                if(pg.enders) {
                    c.append(addPagerButton('last'));
                }
            } 

        }

        if(!local.pagerRendered) {
            addPagerListeners();
        }

        // c;
    };

    /**
     * 
     * @param {*} type 
     */
    function addPagerButton(type) {

        var pg = ls.results.pager;
        var button = $('<a/>').text(pg.labels[type]).addClass('pager-navs').addClass('pager-' + type).attr('href','#').attr('title', pg.labels.ada[type]);

        if(type == 'first') {
            button.data('targetPage', 1);
        } else if (type == 'last') {
            button.data('targetPage', local.totalPages);
        }

        //button;
        if(local.pagerRendered) {
            button = $('.pager-navs.pager-' + type);
        }
        
        if (type == 'prev' || type == 'first') {
            if (local.currentPage > 1) {
                button.data('disabled', false).removeClass('disabled');
            } else {
                button.data('disabled', true).addClass('disabled');
            }
        } else {
            if(local.totalPages > local.currentPage) {
                button.data('disabled', false).removeClass('disabled');
            }  else {
                button.data('disabled', true).addClass('disabled');
            }        
        }

        return button;

    }

    /**
     * 
     */
    function addPagerListeners() {

        $('.pager-prev, .pager-next, .pager-load').on('click', function(e){
            e.preventDefault();
            if( !$(this).data('disabled') ) {
                handlePager($(this).hasClass('pager-prev'));
            }
        });

        $('.pager-last, .pager-first').on('click', function(e){
            e.preventDefault();
            if( !$(this).data('disabled') ) {                
                skipToPage($(this).data('targetPage'));
            }
        });

        $('.pager-nav-items a').on('click',function(e){
            e.preventDefault();
            skipToPage($(this).data('targetPage'));
        });
    }

    /**
     * 
     * @param {*} next 
     */
    function handlePager(next) {
        var pg = ls.results.pager; 

        if(ls.searchParams.size && local.currentPage && local.rendered) {        
            local.rendered = false;                
            // go to next page of results
            if(!next) {
                local.currentPage = local.currentPage + 1;
            } else {
                local.currentPage = local.currentPage - 1;
            }
            
            ls.searchParams.start = (local.currentPage - 1) * ls.searchParams.size;         
            search();
        }
    }

    /**
     * 
     * @param {*} num 
     */
    function skipToPage(num) {
        local.currentPage = num;
        ls.searchParams.start = (local.currentPage - 1) * ls.searchParams.size;       
        search();            
    }

    //Load the facets according to the results
    function loadFacets(data) {
        var fs = ls.facets;
        var c = $(fs.container);

        //Check if the containers was defiend and if the facets were part of the results
        if (!c || !data["facets"])
            return;

        c.html('');

        $(Object.keys(ls.facetsDictionary)).each(function (i, v) {

        //     //Ignore the faceting options if any
        //     if (v.indexOf(',') != -1)
        //         v = v.split(',')[0];

            if (data["facets"][v]) {

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
                $(data["facets"][v]['buckets']).each(function (j, k) {

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
                    if (ls.facetsSelected.indexOf(v + '||' + k.value) != -1) {
                        f.addClass('active-facet');
                    }

                    if (fs.wrapper)
                        $(fs.wrapper).addClass(fs.wrapperClass).append(f).appendTo(w);
                    else
                        w.append(f);

                    countFacets++;
                });

                //Group Wrapper
                if (fs.groupWrapper && countFacets > 0) {
                    var gw = $(fs.groupWrapper).addClass(fs.groupWrapperClass);
                    c.append(gw);
                    title.appendTo(gw);
                    w.appendTo(gw);
                }

                if (countFacets == 0) {
                    title.remove();
                    w.remove();
                }

            }
        });
    }

    /**
     * Setup Date fields to filter results
     * based on a date range
     */
    function setupDateFields() {
        
        var f = ls.dates.fields;
        
        if(!f.from.selector || !f.cloudSearchField)
            return;
        
        fields = f.from.selector;

        if(f.to.selector) {
            fields += ', ' + f.to.selector;
        }

        $(fields).on('change', function(e) {
            handleDateInput( $(this).val(), $(this).data('dateDir'));
        });

        function handleDateInput(val,dir) {
            local[dir] = null;
            if(val) {
                var dateObj = new Date(val);
                local[dir] = dateObj;
            } 
            if(local.fromDate || local.toDate) {
                local.dateSearch = true;
            } else {
                local.dateSearch = false;
            }
            ls.searchParams.start = 0;
            local.currentPage = 1;
            search();
        }
        
    }

    /**
     * External API Calls
     */

    //Execute the AJAX call to AWS Cloud Search
    function search() {
        local.isGeoSearch = false;

        // remove pager
        $(ls.results.pager.container).empty();
        local.pagerRendered = false;

        if (local.waitingLatLong)
            return;

        //Check if it's geo search
        if (ls.geoSearch.lat && ls.geoSearch.lng) {
            debug('Geo searching...');
            debug(ls.geoSearch.lat);
            debug(ls.geoSearch.lng);
            local.isGeoSearch = true;
            if (!ls.searchParams.orderby || ls.searchParams.orderby.indexOf(ls.geoSearch.fieldName) == 0) {
                var orderby = "geo.distance(" + ls.geoSearch.cloudFieldName;
                orderby += ", geography'POINT(" + ls.geoSearch.lng + " " + ls.geoSearch.lat + ")')";
                if (ls.searchParams.orderby && ls.searchParams.orderby.indexOf(' desc') != -1) orderby += ' desc';
                ls.searchParams.orderby = orderby;
            }
        }

        var f = null;
        //Save the current filter

        var previousFilter = ls.searchParams.fq;
        
        if( ls.facetsDictionary ) {
            $(Object.keys(ls.facetsDictionary)).each(function(k,v){
                ls.searchParams['facet.'+v] = '{}';                
            });
        }

        //Apply Facet Filters
        if (ls.facetsSelected.length > 0) {
            var facetFilter = [];
            ls.facetsSelected.forEach(function (item, index) {
                var p = item.split('||');
                // apply filter and escape single quotes in value (')
                facetFilter.push('' + p[0] + ': \'' + p[1].replace(/[']/gi, '\'\'') + '\'');
            });

            f = facetFilter.join(' ');
        }

        //Apply geo distance filter if configured
        // if (local.isGeoSearch && ls.geoSearch.maxDistance) {
        //     debug('Filter Geo searching by distance : ' + ls.geoSearch.maxDistance);
        //     var geoFilter = "geo.distance(" + ls.geoSearch.cloudFieldName + ", geography'POINT(" + ls.geoSearch.lng + " " + ls.geoSearch.lat + ")') le " + ls.geoSearch.maxDistance;
        //     if (f) {
        //         f += ' and ' + geoFilter
        //     } else {
        //         f = geoFilter;
        //     }
        // }

        var date_f = "";
        if(local.dateSearch) {
            if(local.fromDate) {
                date_f = ls.dates.fields.cloudSearchField + ": ['" + local.fromDate.toISOString() + "'";           
            } 

            if(local.toDate) {
                if(!local.fromDate) {
                    date_f += ls.dates.fields.cloudSearchField + ":{"; 
                }
                date_f += ",'" + local.toDate.toISOString() + "']";
            } else if(local.fromDate) {
                date_f += ",}"; 
            }
            
            if (f) {
                f += " " + date_f;
            } else {
                f = date_f;
            }
        }

        if (f) {
            if(previousFilter) {
                f = '(' + ls.facets.searchMode + ' ' + previousFilter + ' ' + f + ')';
            } else {
                f = '(' + ls.facets.searchMode + ' ' + f + ')'
            }
            ls.searchParams.fq = f;
        }


        var settings = {
            "crossDomain": true,
            "url": ls.cloudSearch.url,
            "method": "GET",
            "headers": {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Api-Key": ls.cloudSearch.key,
                "Cache-Control": "no-cache",
            },
            "data": ls.searchParams
        };

        $.ajax(settings).done(function (response) {
            if(response.hits) {
                local.totalResults = response.hits.found > 0 ? response.hits.found : -1;
                local.totalPages = Math.ceil(local.totalResults / ls.searchParams.size);
                ls.onResults.call(response, local);
            }
            else if(response.error) {
                debug(response.error);
            }
         });

        //Return the filter to the original state
        ls.searchParams.fq = previousFilter;
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
        if (search) {
            
            if(ls.searchParams['q.parser'] == 'structured') {
                ls.searchParams.q = '(or ';
                $(search.split(' ')).each(function(k,v){
                    ls.searchParams.q += '(term \''+v+'\')';
                    ls.searchParams.q += '(prefix \''+v+'\')';
                });
                ls.searchParams.q += ')';
            } else {
                ls.searchParams.q = search;
            }
        }
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

