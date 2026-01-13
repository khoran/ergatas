
Ergatas is a place to find and partner with missionaries raising support. Missionaries create profiles describing their ministries, others search to find missionaries whose ministries fit what they are passionate about.

Our goal is both to help missionaries get funded and into their fields, and to engage more Christians in missions through partnership.

Learn more at https://ergatas.org !


Steps to get running
-------------------
The docker/ergatas-nginx container requires a certificate, which needs to be created manually ( with Lets Encrypt or something). Then copy the private key and cert as .pem files into the container directory
before building.
- npm install
- webpack --config webpack.config.cjs
- docker build -t ergatas-web .
- cd docker/ergatas-nginx; docker build . ; cd ..
- docker-compose up 

Architecture
------------
Data is stored in PostgreSQL. All access to db is through PostgREST which provides a REST interface to the database. This can be accessed directly from the client, or from the server. JWT tokens are used
for authentication by PostgREST. 

The server is running Express on NodeJS. It sits behind an Nginx proxy. The proxy sends all /db requests to PostgREST and all others to NodeJS. An Authentication server called FusionAuth is used to handle
logins using OAuth2. It uses a subdomain name like auth.ergatas.org. The proxy also directs traffic for this domain to FusionAuth.

Production deployment is done on Kubernetes. There is another repo storing the yaml files. 

The client is a Progressive Web App and a Single Page App. So most things load up front and then use local data when moving between pages. Any database data is fetched as needed via XHR calls. The main
structure is provided by KnockoutJS which provides two way data binding between JS variables and HTML elements. Page elements are structured as KnockoutJS Components which allow for re-use. The following
libraries are also used:
 
- Google Maps for the map view and to allow users to set their location. Free for moderate usage.
- Transloadit is used for profile picture and document attachment uploading and re-scaling.  Free for moderate usage.
- ListMonk is used for mailing list sign ups and sending mass emails. 
- Google buckets for user uploads. Free for moderate usage
- MailGun for transactional emails. Free up to 6,000 emails/month.
- Bootstrap 5 for css
- FontAwesome 5 free icons
- Stripe for payment processing. Costs taken from each transaction.
- Google Analytics and TagManager
- Vanilla-Router for routing


Code Structure
-------------
The server starts with ./server.js. Supporting server code is in ./lib/server. Server.js mainly defines the API and does input/output processing. Most work is done by functions defined in ./lib/server/utils.js.
The server keeps no state. The server does some work to pre-populate the initial static page with data. Then the client fills in anything remaining for that page. 

The client starts with lib/page-templates/index.html. The client JS root is at ./lib/index.js. Webpack is used to bundle all JS code and put it in ./dist. The main starting point for the client JS is
./lib/client/main.js. The service worker is defined in ./lib/client/service-worker.js.

Most pages have an HTML template in ./lib/page-templates. These are used by KnockoutJS to bind data to and then display.  Smaller chunks of HTML are stored in ./lib/snippet-templates. Some of these are
also used to compose HTML transactional emails. KnockoutJS components are stored in ./lib/components. Each component has a .html and .js file with a common prefix name (e.g.: reports.html and reports.js).

SQL code is stored in ./sql. We define the base tables in 10-tables.sql. All base tables are restricted and accessed only through views defined in 20-views.sql. There are a few PostgreSQL rules used as well as
some triggers. The main search function that handles all the filters is a PGSQL function defined in 20-views.sql. Any DB changes between versions are defined by a file in ./sql/migrations.

Client Structure
--------
The Client class is defined in ./lib/client/main.js. Execution starts with the `start()` function. The main client components are:
 - DataAccess: interface to all database calls
 - Search: handles all the search functionality. This can both set filters and read what filters are set by user input. Constructs and makes the search call to the database. Handles loading additional
	results as user scrolls.
 - ServerAPI:  handles calls to server, including refreshing auth tokens as needed
 - Storage: interface to cloud storage (Google buckets)
 - Logger: replaces console.{log,error,warning,info,debug} with new functions that both log to console and send logs back to server to be logged in Loki (if its running)
 - AppState: holds any global state or data used in multiple places, for example, drop down lists or list of organizations. This class also holds a reference to all the above objects so that access to
	everything can be provided to a Component by just passing this one object. Though sometimes for simple components, only the required objects are passed directly. 

Once all these objects are setup, it defines the ViewModel which is what KnockoutJS uses to sync data between that object and the web page. Anything referenced in HTML must exist in the ViewModel. Then we
define the router which handles which page to load and whether to redirect for authentication first. The router uses information from ./lib/data/page\_info.json. This file defines one object for each page
by it's name. It provides details such as the title and description (for search engines). It also indicates other things like whether the page should be indexed or pre-processed by the server. 


page\_info.json parameters
--------
- title: page title
- description: page description, used in meta info
- sharing\_image:  absolute path to image to use in meta info
- indexed: default true. if false, include meta tag 'noindex', to stay out of search results
- prerender: default true. try to render this page on the server first
- pattern: regexp used to describe last part of URL. used on server to match URLs
- path: path from root to this page, not including this page. Should not start with a '/', but should end with '/'
- virtual: true if there is no html page or snippet for this page, it will use another pages html
- auth: default false. if true, un-authenticated users should be directed to login first for this page
- alias_for: use page info from page name given



Permissions
-------

search_filter JSON:
- organization_keys: array of organization_keys. matches any profile with this org key
- ro_profile_keys: array of missionary_profile_keys to grant view only access
- missionary_profile_keys: array of missionary_profile_keys to grant write access tok
