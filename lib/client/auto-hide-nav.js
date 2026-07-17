// Auto-hiding mobile header ("headroom" pattern): the fixed top bar slides out of
// view when the user scrolls down and slides back in when they scroll up, so it
// never permanently covers content but is always one small up-scroll away. The
// hiding transform (.nav-hidden) is defined only inside the mobile media query in
// styles.scss, so toggling the class on desktop is a harmless no-op — no need to
// gate this on viewport width.
export function initAutoHideNav(){
    const nav = document.querySelector('.navbar');
    if(!nav) return;

    let lastY = window.pageYOffset || 0;
    let currentY = lastY;
    let ticking = false;
    const REVEAL_AT_TOP = 10; // always show near the very top
    const DELTA = 6;          // ignore sub-pixel / jitter scrolls

    const update = () => {
        ticking = false;
        const y = currentY;
        if(Math.abs(y - lastY) < DELTA) return;

        if(y <= REVEAL_AT_TOP || y < lastY){
            nav.classList.remove('nav-hidden'); // at the top, or scrolling up -> show
        }else if(y > lastY && y > nav.offsetHeight){
            nav.classList.add('nav-hidden');    // scrolling down past the bar -> hide
        }
        lastY = y;
    };

    // Scroll events don't bubble, so a listener on window only sees page scroll —
    // not scrolling inside overlays that have their own scroll container (e.g. the
    // search filter panel, .cd-panel__content). A capture-phase document listener
    // sees those too; we act only on page scroll and the filter panel so unrelated
    // small scrollers (dropdowns, selectize lists) don't drive the header.
    document.addEventListener('scroll', (e) => {
        const t = e.target;
        const isWindow = (t === document || t === document.documentElement || t === document.body);
        const isPanel = !!(t && t.classList && t.classList.contains('cd-panel__content'));
        if(!isWindow && !isPanel) return;
        currentY = isWindow ? (window.pageYOffset || 0) : t.scrollTop;
        if(!ticking){
            window.requestAnimationFrame(update);
            ticking = true;
        }
    }, {capture:true, passive:true});
}
