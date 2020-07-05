
function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}

function initKOLoaders(){
    ko.components.loaders.unshift({
        loadTemplate: function(name, templateConfig, callback) {
            console.log("------------------ loading template ",name,templateConfig);
            if (templateConfig.fromUrl) {
                // Uses jQuery's ajax facility to load the markup from a file
                var fullUrl = '/component-templates/' + templateConfig.fromUrl+".html";
                jQuery.ajax(fullUrl, {cache:false}).then(function(markupString) {
                    // We need an array of DOM nodes, not a string.
                    // We can use the default loader to convert to the
                    // required format.
                    console.log("got template: ",markupString);
                    ko.components.defaultLoader.loadTemplate(name, markupString, callback);
                });
            } else {
                // Unrecognized config format. Let another loader handle it.
                callback(null);
            }
        }
    });
}

export {getURLParameter,initKOLoaders};