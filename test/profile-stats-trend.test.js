import chai from 'chai';
const expect = chai.expect;

// The dashboard stats panel compares a recent window against the one before it
// and draws a daily series. Both the bucketing (server) and the sparkline
// geometry (client) are pure, so they are tested here without GA4 or a browser.
import {ga4DateKeys, bucketProfileTrend} from '../lib/server/utils.js';
import {sparklinePoints, statChange} from '../lib/client/stat-display.js';

//a GA4 row as runReport returns it, for the byDate report shape
function row(eventName,date,count){
    return {
        dimensionValues:[{value:eventName},{value:date}],
        metricValues:[{value:String(count)}],
    };
}

const today = new Date(2026,2,15); //March 15 2026, local

describe("ga4DateKeys",function(){
    it("returns the requested number of YYYYMMDD keys, newest first",function(){
        const keys = ga4DateKeys(3,today);
        expect(keys).to.deep.equal(["20260315","20260314","20260313"]);
    });
    it("steps back over a month boundary",function(){
        expect(ga4DateKeys(3,new Date(2026,2,1))).to.deep.equal(["20260301","20260228","20260227"]);
    });
    it("crosses a spring-forward DST change without dropping or repeating a day",function(){
        //US DST began 2026-03-08; stepping by 24h in local time would skip it
        const keys = ga4DateKeys(4,new Date(2026,2,9));
        expect(keys).to.deep.equal(["20260309","20260308","20260307","20260306"]);
    });
});

describe("bucketProfileTrend",function(){
    it("splits rows into the current and previous windows",function(){
        const rows = [
            row("page_view","20260315",5),   //current
            row("page_view","20260311",2),   //current
            row("page_view","20260310",7),   //previous (days 6-10 back)
            row("page_view","20260306",1),   //previous
            row("page_view","20260301",99),  //outside both windows
        ];
        const trend = bucketProfileTrend(rows,5,today);

        expect(trend.current.pageViews).to.equal(7);
        expect(trend.previous.pageViews).to.equal(8);
    });
    it("sums the donation click events together",function(){
        const rows = [
            row("donate-level-1","20260315",3),
            row("begin-checkout","20260315",2),
            row("prayed","20260314",4),
        ];
        const trend = bucketProfileTrend(rows,5,today);

        expect(trend.current.donationClicks).to.equal(5);
        expect(trend.current.prayers).to.equal(4);
    });
    it("returns one series point per day, oldest first, zero-filled",function(){
        const trend = bucketProfileTrend([row("page_view","20260314",4)],3,today);

        expect(trend.dates).to.deep.equal(["20260313","20260314","20260315"]);
        expect(trend.series.pageViews).to.deep.equal([0,4,0]);
        expect(trend.series.prayers).to.deep.equal([0,0,0]);
    });
    it("handles a report with no rows at all",function(){
        const trend = bucketProfileTrend([],7,today);

        expect(trend.current.pageViews).to.equal(0);
        expect(trend.previous.pageViews).to.equal(0);
        expect(trend.series.pageViews).to.have.lengthOf(7);
    });
});

describe("sparklinePoints",function(){
    it("spreads the series across the full width, oldest on the left",function(){
        const points = sparklinePoints([0,5,10],100,24).split(" ");

        expect(points).to.have.lengthOf(3);
        expect(points[0]).to.equal("0.0,24.0");   //lowest value sits on the baseline
        expect(points[2]).to.equal("100.0,0.0");  //the maximum reaches the top
    });
    it("draws an all-zero series flat on the baseline rather than dividing by zero",function(){
        expect(sparklinePoints([0,0,0],100,24)).to.equal("0.0,24.0 50.0,24.0 100.0,24.0");
    });
    it("returns nothing to draw for an empty series",function(){
        expect(sparklinePoints([])).to.equal("");
    });
});

describe("statChange",function(){
    it("reports a percentage against a non-zero previous window",function(){
        expect(statChange(150,100)).to.deep.equal({text:"+50%", direction:"up"});
        expect(statChange(50,100)).to.deep.equal({text:"-50%", direction:"down"});
    });
    it("reports a plain count when the previous window was zero",function(){
        expect(statChange(4,0)).to.deep.equal({text:"+4", direction:"up"});
    });
    it("reports no change when the two windows match",function(){
        expect(statChange(0,0).direction).to.equal("flat");
        expect(statChange(9,9).direction).to.equal("flat");
    });
});
