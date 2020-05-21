
var viewModel;
jQuery(document).ready(function() { mainInit(); });

function mainInit(){
    var router;
    var base="/ergatas";
    var db;
    //TODO: move this to server, this is just for testing
    var token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiZXJnYXRhc193ZWIifQ.Kw_1TuPlZB6iAMdRQ2fMHr8BhSI_Wpx1psJCq-K9p78";

    //db= new PostgREST("http://localhost:3000");
    db= new PostgREST("https://localhost:8444");
    db.get("/users_view").auth(token).then(
        function(result){
            console.log("db test: ",result);
        }
    );

    viewModel = {
        query: ko.observable(),
        currentPage:ko.observable("home-template"),
        profiles: ko.observableArray(),
        userProfile: {
            firstName: ko.observable(),
            lastName: ko.observable(),
            organization: ko.observable(),
            location: ko.observable(),
            skills: ko.observable(),
        },
        filter: {
            name:ko.observable(),
            organization:ko.observable(),
            skills: ko.observable(),
            location:ko.observable(),
        },

        navigateFn: function(path){
            return function(){
                router.navigateTo(path);
            }
        },
        handleSearch: function(){
            var query=viewModel.query();
            console.log("query: ",query)
            jQuery.get("api/search/"+query).
                then(function(results){
                    console.log("search results:",results)
                    viewModel.profiles(results);
                    router.navigateTo("search");

                });
        },
        //search: function(){
        //},
        createProfile: function(){
            console.log("create Profile: ",viewModel.userProfile);

           // curl -i  http://localhost:3000/users_view -X POST \                                                                                              (05-20 15:33)
           //     -H "Authorization: Bearer $TOKEN"   \
           //     -H "Content-Type: application/json" \
           //     -d '{"username": "testuser2","password":"pass2","email":"testuser2@example.com"}'
            jQuery.post

        },
    };
    ko.computed(function(){
        var name, org, skills, location;
        name = viewModel.filter.name();
        org= viewModel.filter.organization();
        skills= viewModel.filter.skills();
        location= viewModel.filter.location();

        if(name != null || org != null || skills != null || location != null)
            jQuery.post("api/search",viewModel.filter).
                then(function(results){
                    console.log("filtered search results: ",results);
                    viewModel.profiles(results);
                });
    });
    ko.applyBindings(viewModel);

    router = new Router({
        root:base,
        page404: function (path) {
            console.log('"/' + path + '" Page not found');
            viewModel.currentPage("notfound-template");
        }
    });
     
    router.add('', function () {
        console.log('Home page');
        viewModel.currentPage("home-template");
    });
    router.add('search/', function () {
        console.log('search page');
        viewModel.currentPage("search-template");
    });
    router.add('profile/', function () {
        console.log('profile page');
        viewModel.currentPage("edit-profile-template");
    });
    router.add('about/', function () {
        console.log('page');
        viewModel.currentPage("about-template");
    });


    router.addUriListener();
    router.navigateTo(window.location.pathname.replace(base,""));
    
}