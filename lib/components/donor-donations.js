import {ensureFields} from '../shared/shared-utils';
// donor-donations component - donations the logged in user has MADE to workers.
// Data is fetched by the parent (donation-list) so it can decide how to lay both lists out;
// this component only renders it.
export function register(){
    const name = 'donor-donations';
    ko.components.register(name,{
        viewModel: function(params){
            const self = this;

            ensureFields(params,["appState","donations","subscriptions","receiptYears"]);

            self.appState = params.appState;
            self.server = self.appState && self.appState.server;
            self.donations = params.donations;
            self.subscriptions = params.subscriptions;
            self.receiptYears = params.receiptYears;

            self.formatDate = function(dateStr){
                return (new Date(dateStr)).toDateString();
            }
            //amounts carry their own currency, which needn't be USD
            self.formatAmount = function(amount,currency){
                if(amount == null) return "";
                try{
                    return (new Intl.NumberFormat('en-US',
                        { style: 'currency', currency: (currency || 'usd').toUpperCase() })).format(amount);
                }catch(error){
                    return amount+" "+(currency || "").toUpperCase();
                }
            }
            //unix seconds from stripe
            self.formatTimestamp = function(seconds){
                if(!seconds) return "";
                return (new Date(seconds * 1000)).toDateString();
            }

            //gifts can settle in more than one currency, so totals are kept per currency
            self.totals = ko.computed(() =>{
                const sums = {};
                (self.donations() || []).forEach( d =>{
                    const currency = (d.currency || 'usd').toLowerCase();
                    sums[currency] = (sums[currency] || 0) + (parseFloat(d.amount) || 0);
                });
                return Object.keys(sums).sort().map( currency => ({currency, amount: sums[currency]}));
            });

            self.sortedDonations = ko.computed(() =>{
                const data = self.donations() || [];
                return data.slice().sort((a,b) => new Date(b.created_on) - new Date(a.created_on));
            });

            // ---- inline amount editing. Stripe's billing portal can only offer a swap between
            // pre-registered prices, so the giving amount is changed here and applied to the
            // subscription's inline price by /api/updateDonorSubscription.
            self.editingId = ko.observable(null);
            self.editAmount = ko.observable("");
            self.savePending = ko.observable(false);
            self.saveError = ko.observable("");
            self.savedId = ko.observable(null);

            self.isEditing = function(sub){
                return self.editingId() === sub.id;
            }
            self.startEdit = function(sub){
                self.saveError("");
                self.savedId(null);
                self.editAmount(sub.amount != null ? sub.amount : "");
                self.editingId(sub.id);
            }
            self.cancelEdit = function(){
                self.editingId(null);
                self.saveError("");
            }
            self.saveAmount = function(sub){
                if(self.savePending()) return;
                const amount = parseFloat(self.editAmount());
                if(!isFinite(amount) || amount <= 0){
                    self.saveError("Please enter an amount greater than zero.");
                    return;
                }
                self.savePending(true);
                self.saveError("");
                self.server.authPostJson("/api/updateDonorSubscription",{
                    subscription_id: sub.id,
                    stripe_account: sub.stripe_account,
                    amount: amount,
                }).then( updated =>{
                    self.savePending(false);
                    if(updated == null || updated.id == null){
                        self.saveError("Sorry, we couldn't change that amount just now.");
                        return;
                    }
                    //swap the stale copy for what stripe now has
                    self.subscriptions(self.subscriptions().map( s => s.id === updated.id ? updated : s));
                    self.editingId(null);
                    self.savedId(updated.id);
                }).catch( err =>{
                    console.error("failed to update donation amount: ",err);
                    self.savePending(false);
                    self.saveError((err && err.responseJSON && err.responseJSON.message) ||
                                   "Sorry, we couldn't change that amount just now.");
                });
            }

            // ---- tax receipts: one per year with at least one Ergatas-receipted gift
            self.receiptPending = ko.observable(null);
            self.receiptError = ko.observable("");

            self.openReceipt = function(year){
                if(self.receiptPending() != null) return;
                self.receiptError("");
                self.receiptPending(year);
                //opened synchronously from the click so the popup blocker allows it; filled in
                //once the statement comes back
                const win = window.open("","_blank");
                self.server.authPostJson("/api/donationReceipt",{year: year}).then( result =>{
                    self.receiptPending(null);
                    if(result == null || result.html == null){
                        if(win) win.close();
                        self.receiptError("Sorry, we couldn't build that receipt just now.");
                        return;
                    }
                    if(win){
                        win.document.open();
                        win.document.write(result.html);
                        win.document.close();
                    }else{
                        //popup blocked - fall back to a download
                        const blob = new Blob([result.html],{type:'text/html;charset=utf-8'});
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `ergatas-tax-receipt-${year}.html`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }
                }).catch( err =>{
                    console.error("failed to build tax receipt: ",err);
                    if(win) win.close();
                    self.receiptPending(null);
                    self.receiptError("Sorry, we couldn't build that receipt just now.");
                });
            }

            self.portalPending = ko.observable(false);
            self.portalError = ko.observable("");

            //the portal link is a one-time stripe session, so it's minted on click rather than
            //up front (and would expire if it were).
            self.openPortal = function(sub){
                if(self.portalPending()) return;
                self.portalPending(true);
                self.portalError("");
                self.server.authPostJson("/api/donorPortalLink",{
                    customer_id: sub.customer_id,
                    stripe_account: sub.stripe_account,
                }).then( result =>{
                    self.portalPending(false);
                    if(result && result.url)
                        window.location.href = result.url;
                    else
                        self.portalError("Sorry, we couldn't open the subscription portal just now.");
                }).catch( err =>{
                    console.error("failed to get donor portal link: ",err);
                    self.portalPending(false);
                    self.portalError("Sorry, we couldn't open the subscription portal just now.");
                });
            }
        },
        template: require('./donor-donations.html')
    });
}
