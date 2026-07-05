// Canonical linear order of the grant-compliance step pages, used by
// grant-step-nav for previous/next navigation between steps.
// Keep in sync with the lifecycle defined in grants-overview.js. (The overview
// lists "Annual review" as a 7th step that reuses the grants-board page; the
// linear nav chain below covers the six distinct step pages.)
export const GRANT_STEP_PAGES = [
    { page: "grants-screening",     title: "OFAC & due-diligence screening" },
    { page: "grants-board",         title: "Board review & approval" },
    { page: "grants-agreements",    title: "Grant agreement" },
    { page: "grants-acceptance",    title: "Online acceptance" },
    { page: "grants-disbursements", title: "Monthly disbursement" },
    { page: "grants-reports",       title: "Salary-use report" },
];
