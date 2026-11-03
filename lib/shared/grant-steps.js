// Canonical linear order of the grant-compliance step pages, used by
// grant-step-nav for previous/next navigation between steps.
// The overview (grants-overview.js) links to the organization-independent steps
// directly; board review and annual review (both on the grants-board page) are
// opened per organization from its pipeline list.
export const GRANT_STEP_PAGES = [
    { page: "grants-screening",     title: "OFAC & due-diligence screening" },
    { page: "grants-board",         title: "Board review & approval" },
    { page: "grants-agreements",    title: "Grant agreement" },
    { page: "grants-acceptance",    title: "Online acceptance" },
    { page: "grants-disbursements", title: "Monthly disbursement" },
    { page: "grants-reports",       title: "Salary-use report" },
];

// Handoff from the overview's pipeline list to the board-approval form: which
// review type to open in and which organization to select. Read without
// clearing, because opening a dashboard page can build the form more than once
// (the dashboard is rebuilt on navigation). The overview clears it whenever it
// is shown, and the form clears it once a decision is recorded.
let boardIntent = null;
export function setBoardIntent(intent){ boardIntent = intent || null; }
export function peekBoardIntent(){ return boardIntent; }
export function clearBoardIntent(){ boardIntent = null; }
