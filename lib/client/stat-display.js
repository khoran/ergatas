// Pure display math for the dashboard's stats tiles. Kept apart from the
// component so it can be unit tested without a browser or a build step - the
// component's own imports resolve through webpack only.

//A <polyline points> string for a sparkline drawn in a 0..width by 0..height
//box, oldest value on the left. Scaled to the series' own maximum, so each
//tile shows its own shape rather than being flattened by whichever metric
//happens to be largest.
export function sparklinePoints(series,width = 100,height = 24){
    const values = (series || []).map( v => parseInt(v) || 0);

    if(values.length === 0)
        return "";
    if(values.length === 1)
        return "0,"+height+" "+width+","+height;

    const max = Math.max.apply(null,values);
    const step = width / (values.length - 1);

    return values.map( (value,i) =>{
        //an all-zero series sits flat on the baseline instead of dividing by zero
        const y = max === 0 ? height : height - (value / max) * height;
        return (i*step).toFixed(1)+","+y.toFixed(1);
    }).join(" ");
}
//The change between two windows, as something displayable. Growth from zero
//has no meaningful percentage, so it is reported as a plain count instead.
export function statChange(current,previous){
    current = parseInt(current) || 0;
    previous = parseInt(previous) || 0;
    const difference = current - previous;

    if(difference === 0)
        return {text: "no change", direction: "flat"};

    const direction = difference > 0 ? "up" : "down";
    const text = previous === 0
        ? (difference > 0 ? "+"+difference : ""+difference)
        : (difference > 0 ? "+" : "-")+Math.round(Math.abs(difference)/previous*100)+"%";

    return {text: text, direction: direction};
}
