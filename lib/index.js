
//import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/js/dist/util.js";
import "bootstrap/js/dist/modal.js";
import "bootstrap/js/dist/tab.js";
import "bootstrap/js/dist/button.js";
import "bootstrap/js/dist/collapse.js";
import "bootstrap/js/dist/dropdown.js";
import "bootstrap/js/dist/carousel.js";

// fix a bug on some systems that complain that console.debug does not exist
console.debug=console.log; 


var ko = require('knockout');
window.ko=ko;
// Bundle knockout.mapping (removes a separate render-chain script request).
// Depending on how webpack wraps its UMD header it either attaches the API to
// module.exports (CJS branch) or directly to the global ko.mapping (browser
// branch) — cover both, and never clobber a populated ko.mapping.
{
    const mapping = require('../public/js/knockout.mapping-2.4.1.js');
    if(mapping && typeof mapping.fromJS === 'function')
        ko.mapping = mapping;
    if(!ko.mapping || typeof ko.mapping.fromJS !== 'function')
        console.error("knockout.mapping failed to initialize");
}
require('./client/ko-common.js');
//require("./clamp.js");


import alertify from 'alertifyjs';
import  'alertifyjs/build/css/alertify.min.css';
import  'alertifyjs/build/css/themes/default.css';
window.alertify=alertify;

import './scss/styles.scss';
import './scss/filter-side-panel.scss';
import './scss/loader.scss';
import './scss/css-circular-prog-bar.scss';

import ergatas from './client/main';

//export default  Client;

//console.warn("========================= JS STARTS ===========================", (new Date()) - window.performance.timing.navigationStart);

jQuery(function() {
    //console.warn("========================= DOCUMENT READY  ===========================", (new Date()) - window.performance.timing.navigationStart);

    const app= new ergatas.Client();
    if(process.env.NODE_ENV === "development")
        window.app = app;
    // yield to the event loop between construction and start(): together they
    // form one ~400ms main-thread task on mid-range phones; split, the browser
    // can paint/respond in between (start() is where ko.applyBindings runs).
    // Safe because start() still runs well before the constructor's async
    // session-refresh round trip triggers router.check().
    setTimeout(() => app.start(), 0);

});
