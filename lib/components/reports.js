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
            console.log("start of "+name);
            self.usersWithProfiles = ko.observable();
            self.usersWithoutProfiles = ko.observable();
            self.usersWithTx = ko.observable();
            self.withProfileMessage = ko.observable();
            self.noProfileMessage = ko.observable();
            self.withDonationsMessage = ko.observable();
            self.emailDisplay = ko.observable();

            self.userProfiles = ko.observable();
            self.donations = ko.observable();

            self.withProfiles = initReport();
            self.withNoProfiles = initReport();
            self.withDonations = initReport();

            setTimeout(async function(){
                const {default: datatables}  = await import(/* webpackChunkName: "datatables", webpackPrefetch: true*/ '../client/datatables');
            },1000);

            //self.loadUserInfo  = async function(){
            //    console.log("getting user keys");
            //    var users = await params.da.getAllUsers();
            //    var indexedUsers = {};

            //    users =users.filter(user => /[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}/.test(user.external_user_id));
            //    console.log("users: ",users);
            //    users.forEach(user => {indexedUsers[user.external_user_id] = user });

            //    console.log("getting emails)");
            //    var emailInfo = await params.server.authPostJson("/api/getUserEmails",{userIds:  users.map(user => user.external_user_id)});
            //    emailInfo.forEach(info=> {
            //        indexedUsers[info.external_user_id].email = info.email;
            //    });
            //    console.log("emails: ",emailInfo);
            //    self.withProfiles.users(users.filter(user => user.has_profile));
            //    self.withNoProfiles.users(users.filter(user =>  ! user.has_profile));

            //    var start = new Date();
            //    var end = new Date();
            //    const dayInMillies = 24*60*60*1000;
            //    //set to first of last month
            //    start.setDate(1); 
            //    start.setMonth(start.getMonth() - 1);

            //    end.setDate(1);
            //    end.setTime(end.getTime() - dayInMillies); //rollback on day to get last day of previous month
            //    self.withDonations.users(users.filter(user =>{
            //        var d;
            //        if(user.last_possible_tx_date == null)
            //            return false;
            //        else{
            //            d = new Date(user.last_possible_tx_date);
            //            return start <= d && d <= end;
            //        }
            //    } ));

            //    jQuery(".user_table").DataTable();
            //}
            self.loadProfileInfo  = async function(){
                //const {default: datatables}  = await import(/* webpackChunkName: "datatables", webpackPrefetch: true*/ '../client/datatables');
                const profiles = await params.da.getAllProfileSummaries();
                self.userProfiles(profiles);
                jQuery(".profile_table").DataTable({
                    data:profiles,
                    columns:[
                        {
                            title: "Missionary Profile Key",
                            data:'missionary_profile_key',
                            render:function(data,type,row){
                                 return `<a href='/profile-detail/${data}' target='_blank' rel='noopener'>${data}</a>`;
                            }
                        },
                        {
                            title:"User Key",
                            data:'user_key',
                        },
                        {
                            title:"Instructions",
                            data:'donate_instructions'
                        },
                        {
                            title:"Donation URL",
                            data:'donation_url',
                            render:function(data,type,row){
                                return `<a href='${data}' target='_blank' rel='noopener'>${data}</a>`;
                            }
                        },
                        {
                            title:"Created On",
                            data:'created_on'
                        },
                    ]
                });
            }
            self.loadTxInfo  = async function(){
                const txs = await params.da.getAllStripeTransactions();
                self.donations(txs);
                jQuery(".donation_table").DataTable({
                    data:txs,
                    columns:[
                        {
                            title:"Key",
                            data:"possible_transaction_key",
                        },
                        {
                            title:"Missionary Profile Key",
                            data:"missionary_profile_key"
                        },
                        {
                            title:"Email",
                            data:"external_user_id",
                            render:function(data,type,row){
                                if(data.indexOf('@') == -1) { //not an email address
                                    return `<span
                                        onclick="window.ergatas.idToEmail('${data}')">${data}</span>`;
                                }
                            }
                        },
                        {
                            title:"Name",
                            data:"name"
                        },
                        {
                            title:"Donation Link",
                            data:"donation_url",
                            render:function(data){
                                return `<a href="${data}" target="_blank">go</a>`
                            }
                        },
                        {
                            title: "Amount",
                            data:"amount",
                        },
                        {
                            title:"Type",
                            data:"donation_type",
                        },
                        {
                            title:"Created On",
                            data:"created_on",
                        },
                        {
                            title:"Stripe ID",
                            data:"stripe_id",
                            render:function(data,type,row){
                                return `<a href='https://dashboard.stripe.com/search?query=${data}' target='_blank' rel='noopener'>go</a>`;
                            }
                        },
                        {
                            title: "Paid",
                            data: "paid",
                            render: function(data,type,row){
                                if(data === true){
                                    return "paid";
                                }else{
                                    return `<button class='btn btn-primary btn-sm' 
                                            onclick="window.ergatas.markPaid(${row.possible_transaction_key},'${row.external_user_id}')">Mark Paid</button>`;
                                }
                            }
                        }
                    ]
                });

            }
            window.ergatas={};
            window.ergatas.markPaid= async function(possible_transaction_key,external_user_id){

                try{
                    await params.server.authPostJson("/api/markTxPaid",{
                        possible_transaction_key: possible_transaction_key,
                        external_user_id:external_user_id,
                    });
                    console.log("TX marked as paid");
                    var dt = jQuery(".donation_table").DataTable();
                    const txs = await params.da.getAllStripeTransactions();
                    //console.log("got dt: ",dt,txs);
                    dt.clear();
                    dt.rows.add(txs);
                    dt.draw();
                }catch(error){
                    console.error("failed to update paid status of tx "+possible_transaction_key,error);
                    alertify.error("failed to update paid status");
                }
            }
            window.ergatas.idToEmail = async function(external_user_id){
                const result = await params.server.authPostJson("/api/getUserEmails", {userIds: [external_user_id]});
                const email = result && result[0] && result[0].email;
                navigator.clipboard.writeText(email);
                self.emailDisplay(email)

            }


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
 