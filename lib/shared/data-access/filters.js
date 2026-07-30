// FilterAppender family. These classes are used only as type markers on the
// Filter objects constructed in client/search.js — the search path reads each
// filter's raw value (filter.obs()()) and hands it to the primary_search_v4 RPC.
// The old URL-building append()/FilterContext/UrlContext machinery is gone;
// the empty subclasses are retained because search.js still constructs them.
export class FilterAppender{
}

export class ILikeFilterAppender extends FilterAppender{
}
export class FTSFilterAppender extends FilterAppender{
}
export class ContainsFilterAppender extends FilterAppender{
}
export class OverlapsFilterAppender extends FilterAppender{
}
export class LessThanFilterAppender extends FilterAppender{
}
export class GreaterThanFilterAppender extends FilterAppender{
}
