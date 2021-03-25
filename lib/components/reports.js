/**
 * INPUT
 * ------
 *      - server: server api object
 *      - da: data access object  
 */

import alertify from "alertifyjs";


function initReport(){
    return {
        users: ko.observable(),
        subject: ko.observable(),
        message: ko.observable(),
    };
}

export function register(){
   const name="reports";
   ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            console.log("start of REPORTS");
            self.usersWithProfiles = ko.observable();
            self.usersWithoutProfiles = ko.observable();
            self.usersWithTx = ko.observable();
            self.withProfileMessage = ko.observable();
            self.noProfileMessage = ko.observable();
            self.withDonationsMessage = ko.observable();

            self.withProfiles = initReport();
            self.withNoProfiles = initReport();
            self.withDonations = initReport();

            setTimeout(async function(){
                console.log("getting user keys");
                var users = await params.da.getAllUsers();
                var indexedUsers = {};

                users =users.filter(user => /[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}/.test(user.external_user_id));
                console.log("users: ",users);
                users.forEach(user => {indexedUsers[user.external_user_id] = user });

                console.log("getting emails)");
                var emailInfo = await params.server.authPostJson("/api/getUserEmails",{userIds:  users.map(user => user.external_user_id)});
                emailInfo.forEach(info=> {
                    indexedUsers[info.external_user_id].email = info.email;
                });
                console.log("emails: ",emailInfo);
                self.withProfiles.users(users.filter(user => user.has_profile));
                self.withNoProfiles.users(users.filter(user =>  ! user.has_profile));

                var start = new Date();
                var end = new Date();
                const dayInMillies = 24*60*60*1000;
                //set to first of last month
                start.setDate(1); 
                start.setMonth(start.getMonth() - 1);

                end.setDate(1);
                end.setTime(end.getTime() - dayInMillies); //rollback on day to get last day of previous month
                self.withDonations.users(users.filter(user =>{
                    var d;
                    if(user.last_possible_tx_date == null)
                        return false;
                    else{
                        d = new Date(user.last_possible_tx_date);
                        return start <= d && d <= end;
                    }
                } ));

                const {default: datatables}  = await import(/* webpackChunkName: "datatables", webpackPrefetch: false*/ '../datatables');
                jQuery(".user_table").DataTable();


            },1000)// try to wait till auth finishes

            self.emailWithProfiles = function(){
            }

            self.sendMessage= async function(report){

                console.log("emailing report: ",report.subject(), report.message());
                var emails = report.users().map(x => x.email);
                await params.server.authPostJson("/api/contact/bulk",{
                        emails: emails,
                        message: report.message(),
                        subject: report.subject(),
                    });
                alertify.success("Message sent");
            }

        },
       template: require(`./${name}.html`),
    });
}
 