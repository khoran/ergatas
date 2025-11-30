import {ensureFields} from '../shared/shared-utils';
// donation-list component - extracted from dashboard
export function register(){
    const name = 'donation-list';
    ko.components.register(name,{
        viewModel: function(params){
            const self = this;

            ensureFields(params,["appState"]);

            self.appState = params && params.appState;
            self.da = self.appState && self.appState.da;
            self.server = self.appState && self.appState.server;
            // singleProfile may be passed as an observable from parent (dashboard)
            self.singleProfile = params && params.singleProfile ? params.singleProfile : ko.observable(false);

            // currency formatter
            const USDollar = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

            // donations and helpers
            self.donations = ko.observableArray();
            self.loading = ko.observable(true);

            // fetch donations (same as previous dashboard behavior)
            self.da.getWorkerTransactions().then(data =>{
                // attach details observable to each tx
                data.forEach(d => d.details = ko.observable());
                self.donations(data);
                self.sortDir("asc");
                self.loading(false);
            }).catch(err => {
                console.error("failed to load worker tx: ",err);
                self.loading(false);
            });

            self.donationRowClick = async function(data){
                jQuery("#details_"+data.possible_transaction_key).collapse('toggle');
                if(data.details() == null){
                    try{
                        const info = await self.server.authPostJson("/api/txDetails",{possible_transaction_key: data.possible_transaction_key});
                        if(info && info.name && info.email)
                            data.details(info);
                    }catch(err){
                        console.error("failed to load tx details",err);
                    }
                }
            }

            self.paymentStatus = function(data){
                let result = {};
                if(data.on_site){
                    result = {
                        rtext: data.paid ? 'Transfer Complete' : 'Pending',
                        rclass: data.paid ? 'text-success' : 'text-ergatas-warning',
                    }
                }else{
                    result = {
                        rtext: data.confirmed ? 'Confirmed by Donor' : 'Not Confirmed',
                        rclass: data.confirmed ? 'text-success' : 'text-ergatas-warning',
                    }
                }
                return result;
            }

            self.formatDate = function(dateStr){
                return (new Date(dateStr)).toDateString();
            }

            self.formatMoney = function(amount){
               return USDollar.format(amount);
            }

            self.sortDir = ko.observable("desc");
            self.sortField = ko.observable('created_on');
            self.sortBy = ko.computed(() =>{
                const direction = self.sortDir() === "desc" ? 1 : -1;
                const field = self.sortField();
                // apply in-place sort to donations
                self.donations(self.donations.peek().slice().sort((a,b)=>{
                    if(a[field] < b[field]) return -1 * direction;
                    if(a[field] > b[field]) return 1 * direction;
                    return 0;
                }));
            });

            // paging
            self.pageSize = ko.observable(10);
            self.currentPage = ko.observable(1);
            self.pageSize.subscribe(() => self.currentPage(1));
            self.totalPages = ko.computed(() => Math.ceil(self.donations().length / self.pageSize()));
            self.visibleDonations = ko.computed(() => {
                const start = (self.currentPage() - 1) * self.pageSize();
                return self.donations().slice(start, start + self.pageSize());
            });

            self.downloadCSV = function() {
                const data = self.donations();
                if (!data.length) return;

                let csv = 'Name,Date,Amount,Type,On Site,Status\n';
                data.forEach(d => {
                    const status = self.paymentStatus(d).rtext;
                    const row = [
                        d.name || '',
                        self.formatDate(d.created_on),
                        d.amount,
                        d.donation_type,
                        d.on_site ? 'Yes' : 'No',
                        status
                    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
                    csv += row + '\n';
                });

                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'donations.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            };

        },
        template: require('./donation-list.html')
    });
}
