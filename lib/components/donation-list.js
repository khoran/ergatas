import {ensureFields,writeQif} from '../shared/shared-utils';
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

            self.startDate = ko.observable();
            self.endDate = ko.observable();
            self.startDate.subscribe(() => self.currentPage(1));
            self.endDate.subscribe(() => self.currentPage(1));
            self.showDateFilterModal = ko.observable(false);
            // paging
            self.pageSize = ko.observable(10);
            self.currentPage = ko.observable(1);
            self.pageSize.subscribe(() => self.currentPage(1));
 

            self.server.authPostJson("/api/getWorkerDonations",{organization_key: 3}).then(data =>{
                self.donations(data);
                self.loading(false);
            }).catch(err => {
                console.error("failed to load worker tx: ",err);
                self.loading(false);
            });

            self.donorInfoLine = function(data){
                let line="";
                if(data){
                    line = data.donor_name
                    if(data.phone) line += `, ${data.phone}`
                    if(data.email) line += `, ${data.email}`
                    if(data.line1) line += `, ${data.line1}`
                    if(data.line2) line += `, ${data.line2}`
                    if(data.city) line += `, ${data.city}`
                    if(data.state) line += `, ${data.state}`
                    if(data.postal) line += `, ${data.postal}`
                    if(data.country) line += `, ${data.country}`
                }
                return line;
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

            self.sortOption = ko.observable('date_desc');

            // filtered donations
            self.filteredDonations = ko.computed(() => {
                let filtered = self.donations();
                const start = self.startDate();
                const end = self.endDate();
                if (start) {
                    const startDate = new Date(start);
                    filtered = filtered.filter(d => new Date(d.created_on) >= startDate);
                }
                if (end) {
                    const endDate = new Date(end);
                    endDate.setHours(23, 59, 59, 999);
                    filtered = filtered.filter(d => new Date(d.created_on) <= endDate);
                }
                return filtered;
            });



            self.sortedDonations = ko.computed(() => {
                const data = self.filteredDonations();
                const sortConfig = {
                    'date_asc': { field: 'created_on', dir: 'asc' },
                    'date_desc': { field: 'created_on', dir: 'desc' },
                    'amount_asc': { field: 'amount', dir: 'asc' },
                    'amount_desc': { field: 'amount', dir: 'desc' }
                };
                const config = sortConfig[self.sortOption()] || sortConfig['date_desc'];
                const direction = config.dir === "desc" ? 1 : -1;
                return data.slice().sort((a,b)=>{
                    if(a[config.field] < b[config.field]) return -1 * direction;
                    if(a[config.field] > b[config.field]) return 1 * direction;
                    return 0;
                });
            });

            self.totalPages = ko.computed(() => Math.ceil(self.sortedDonations().length / self.pageSize()));
            self.visibleDonations = ko.computed(() => {
                const start = (self.currentPage() - 1) * self.pageSize();
                return self.sortedDonations().slice(start, start + self.pageSize());
            });

            self.uniqueNames = ko.computed(() => {
                const names = new Set();
                self.filteredDonations().forEach(d => {
                    if (d.name) names.add(d.name);
                });
                return Array.from(names).sort();
            });

            self.downloadBlob = function(blob, filename) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            };

            self.downloadCSV = function() {
                const data = self.sortedDonations();
                if (!data.length) return;

                let csv = 'Worker Name,Date,Amount,Type,On Site,Status,Donor Name,Email,Phone,Address Line 1,Address Line 2,City,State,Postal Code,Country\n';
                data.forEach(d => {
                    const status = self.paymentStatus(d).rtext;
                    const row = [
                        d.name || '',
                        self.formatDate(d.created_on),
                        d.amount,
                        d.donation_type,
                        d.on_site ? 'Yes' : 'No',
                        status,
                        d.donor_name || '',
                        d.email || '',
                        d.phone || '',
                        d.line1 || '',
                        d.line2 || '',
                        d.city || '',
                        d.state || '',
                        d.postal || '',
                        d.country || ''
                    ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
                    csv += row + '\n';
                });

                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                self.downloadBlob(blob, 'donations.csv');
            };

            self.downloadQIFByName = function(name) {
                const data = self.sortedDonations().filter(d => d.name === name);
                if (!data.length) return;

                const transactions = data.map(d => ({
                    date: new Date(d.created_on),
                    amount: d.amount,
                    payee: d.donor_name || 'Unknown Donor',
                    memo: self.donorInfoLine(d),
                    category: 'Donation'
                }));

                let qifString="";
                writeQif(transactions,(input) => qifString += input);
                const blob = new Blob([qifString], { type: 'application/qif' });
                self.downloadBlob(blob, `donations-${name}.qif`);
            };


        },
        template: require('./donation-list.html')
    });
}
