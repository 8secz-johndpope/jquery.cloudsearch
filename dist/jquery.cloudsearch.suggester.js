
// AWS Suggester 

(function ($) {

    //Defaults - Local Settings
    var ls = {
        cloudSuggester: {
            url: '',
            key: ''       
        },
        searchParams: {
            q : '',
            suggester: '',
            size: 10            
        },           
        onResults: processResults,
        onLoad: function () { },
        debug: false
    }

    var local = {        
        binding: null,
        results: null,
        totalResults: 0,
        initialized: false
    }

    $.fn.cloudsearchSuggester = function(options) {                        

        if (options) {
            //Default options.
            if (options.cloudSuggester) 
                options.cloudSuggester = $.extend(ls.cloudSuggester, options.cloudSuggester);
            if (options.searchParams) 
                options.searchParams = $.extend(ls.searchParams, options.searchParams);      
            if (options.input) 
                options.input = $.extend(ls.input, options.input);            
                                    
            ls = $.extend(ls, options);
        }

        getSuggestions();
        
        local.initialized = true;

        // return
        return this;

    };
    

    function getSuggestions() {
             
        var settings = {
            "crossDomain": true,
            "url": ls.cloudSuggester.url,
            "method": "GET",
            "headers": {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Api-Key": ls.cloudSuggester.key,
                "Cache-Control": "no-cache",
            },
            "data": ls.searchParams
        };

        

        $.ajax(settings).done(function( data, textStatus, jqXHR ){
            local.totalResults = data.suggest.found > 0 ? data.suggest.found : -1;
            ls.onResults.call(data, local);
        });
    }

    function processResults() {
        var data = this;                       
        local.results = data;        
        ls.onLoad.call(data, local);
    }

    function debug(obj) {
        if (ls.debug && window.console && window.console.log) {
            window.console.log(obj);
        }
    };    

}(jQuery));