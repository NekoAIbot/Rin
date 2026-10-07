// Minimal Supabase REST client — no external URL imports.
// Implements the subset of @supabase/supabase-js used by Rin's webhook.
// Pure fetch()-based, no npm/node_modules, no esm.sh, no network at import time.

function encodeFilterValue(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  return String(v);
}

class QueryBuilder {
  constructor(baseUrl, key, table) {
    this.baseUrl = baseUrl;
    this.key = key;
    this.table = table;
    this._method = "SELECT";
    this._columns = "*";
    this._ops = [];
    this._returning = "minimal";
    this._limit = null;
    this._count = null;
    this._head = false;
    this._values = [];
    this._onConflict = "";
    this._rpcFn = "";
    this._rpcParams = {};
    this._single = false;
  }

  select(cols) {
    this._method = "SELECT";
    this._columns = Array.isArray(cols) ? cols.join(", ") : (cols ?? "*");
    return this;
  }

  insert(values, opts) {
    this._method = "INSERT";
    this._values = Array.isArray(values) ? values : [values];
    if (opts?.onConflict) this._onConflict = opts.onConflict;
    if (opts?.returning) this._returning = opts.returning;
    return this;
  }

  update(values) {
    this._method = "UPDATE";
    this._values = Array.isArray(values) ? values : [values];
    this._returning = "minimal";
    return this;
  }

  delete() {
    this._method = "DELETE";
    return this;
  }

  eq(column, value) { this._ops.push({ type: "eq", column, value }); return this; }
  gt(column, value) { this._ops.push({ type: "gt", column, value }); return this; }
  gte(column, value) { this._ops.push({ type: "gte", column, value }); return this; }
  lt(column, value) { this._ops.push({ type: "lt", column, value }); return this; }
  lte(column, value) { this._ops.push({ type: "lte", column, value }); return this; }
  neq(column, value) { this._ops.push({ type: "neq", column, value }); return this; }
  like(column, pattern) { this._ops.push({ type: "like", column, value: pattern }); return this; }
  ilike(column, pattern) { this._ops.push({ type: "ilike", column, value: pattern }); return this; }
  is(column, value) { this._ops.push({ type: "eq", column, value }); return this; }
  not(column, value) { this._ops.push({ type: "neq", column, value }); return this; }
  isNull(column) { this._ops.push({ type: "is_null", column }); return this; }
  isNotNull(column) { this._ops.push({ type: "is_not_null", column }); return this; }
  in(column, values) { this._ops.push({ type: "in", column, value: values }); return this; }
  notIn(column, values) { this._ops.push({ type: "not_in", column, value: values }); return this; }
  contains(column, value) { this._ops.push({ type: "contains", column, value }); return this; }
  containedBy(column, value) { this._ops.push({ type: "contained_by", column, value }); return this; }
  overlap(column, value) { this._ops.push({ type: "overlap", column, value }); return this; }
  rangeGt(column, range) { this._ops.push({ type: "range_gt", column, value: range }); return this; }
  rangeGte(column, range) { this._ops.push({ type: "range_gte", column, value: range }); return this; }
  rangeLt(column, range) { this._ops.push({ type: "range_lt", column, value: range }); return this; }
  rangeLte(column, range) { this._ops.push({ type: "range_lte", column, value: range }); return this; }
  rangeOverlap(column, range) { this._ops.push({ type: "range_overlap", column, value: range }); return this; }
  textSearch(column, query) { this._ops.push({ type: "text_search", column, value: query }); return this; }
  match(columns, query) {
    this._ops.push({ type: "match", columns: Array.isArray(columns) ? columns : [columns], value: query });
    return this;
  }
  or() { this._ops.push({ type: "or" }); return this; }
  and() { this._ops.push({ type: "and" }); return this; }
  filter(column, operator, value) { this._ops.push({ type: "filter", column, operator, value }); return this; }
  order(column, direction) { this._ops.push({ type: "order", column, direction: direction?.toUpperCase() ?? "ASC" }); return this; }
  limit(n) { this._limit = n; return this; }
  offset(n) { this._ops.push({ type: "offset", value: n }); return this; }
  count(mode) { this._count = mode ?? "exact"; return this; }
  head() { this._head = true; return this; }
  explain() { this._ops.push({ type: "explain" }); return this; }
  returning(cols) { this._returning = Array.isArray(cols) ? cols.join(", ") : (cols ?? "minimal"); return this; }
  rpc(fnName, params) {
    this._method = "RPC";
    this._rpcFn = fnName;
    this._rpcParams = params ?? {};
    return this;
  }
  single() { this._single = true; return this; }
  maybeSingle() { this._single = true; return this; }

  // Make QueryBuilder a thenable: `await qb.insert(...)` auto-executes.
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  async execute() {
    const url = new URL(`${this.baseUrl}/rest/v1/${encodeURIComponent(this.table)}`);
    const params = new URLSearchParams();

    if (this._method === "SELECT") {
      params.set("select", this._columns);
    } else {
      params.set("select", this._returning !== "minimal" ? this._returning : "");
    }

    if (this._limit !== null) params.set("limit", String(this._limit));
    if (this._count) params.set("count", this._count);
    if (this._head) params.set("head", "true");
    if (this._onConflict) params.set("on_conflict", this._onConflict);

    const filterParts = [];
    for (const op of this._ops) {
      const col = encodeURIComponent(String(op.column ?? ""));
      switch (op.type) {
        case "eq": filterParts.push(`${col}=eq.${encodeFilterValue(op.value)}`); break;
        case "neq": filterParts.push(`${col}=neq.${encodeFilterValue(op.value)}`); break;
        case "gt": filterParts.push(`${col}=gt.${encodeFilterValue(op.value)}`); break;
        case "gte": filterParts.push(`${col}=gte.${encodeFilterValue(op.value)}`); break;
        case "lt": filterParts.push(`${col}=lt.${encodeFilterValue(op.value)}`); break;
        case "lte": filterParts.push(`${col}=lte.${encodeFilterValue(op.value)}`); break;
        case "like": filterParts.push(`${col}=like.${encodeURIComponent(String(op.value ?? ""))}`); break;
        case "ilike": filterParts.push(`${col}=ilike.${encodeURIComponent(String(op.value ?? ""))}`); break;
        case "is_null": filterParts.push(`${col}=is.null`); break;
        case "is_not_null": filterParts.push(`${col}=is.not.null`); break;
        case "in": if (Array.isArray(op.value)) filterParts.push(`${col}=in.(${op.value.map(encodeFilterValue).join(",")})`); break;
        case "not_in": if (Array.isArray(op.value)) filterParts.push(`${col}=notin.(${op.value.map(encodeFilterValue).join(",")})`); break;
        case "contains": filterParts.push(`${col}=cs.${encodeFilterValue(op.value)}`); break;
        case "contained_by": filterParts.push(`${col}=cd.${encodeFilterValue(op.value)}`); break;
        case "overlap": filterParts.push(`${col}=ov.${encodeFilterValue(op.value)}`); break;
        case "range_gt": filterParts.push(`${col}=rgt.${encodeFilterValue(op.value)}`); break;
        case "range_gte": filterParts.push(`${col}=rgte.${encodeFilterValue(op.value)}`); break;
        case "range_lt": filterParts.push(`${col}=rlt.${encodeFilterValue(op.value)}`); break;
        case "range_lte": filterParts.push(`${col}=rlte.${encodeFilterValue(op.value)}`); break;
        case "range_overlap": filterParts.push(`${col}=rx.${encodeFilterValue(op.value)}`); break;
        case "text_search": filterParts.push(`${col}=fts.${encodeURIComponent(String(op.value ?? ""))}`); break;
        case "match":
          const cols = Array.isArray(op.columns) ? op.columns.join(",") : String(op.columns ?? "");
          filterParts.push(`${col}=match.${encodeURIComponent(JSON.stringify(op.value ?? {}))}`);
          break;
        case "offset": filterParts.push(`offset=${encodeURIComponent(String(op.value ?? 0))}`); break;
        case "order": filterParts.push(`order=${encodeURIComponent(String(op.column ?? ""))}.${String(op.direction ?? "ASC").toUpperCase()}`); break;
        case "single": filterParts.push("single=true"); break;
        case "maybe_single": filterParts.push("single=true"); break;
      }
    }
    const filterStr = filterParts.join("&");
    if (filterStr) params.set("filter", filterStr);

    url.search = params.toString();

    const methods = { SELECT: "GET", INSERT: "POST", UPDATE: "PATCH", DELETE: "DELETE", RPC: "POST" };
    const method = methods[this._method] ?? "GET";

    const headers = {
      "apikey": this.key,
      "Authorization": `Bearer ${this.key}`,
      "Content-Type": "application/json",
    };

    let body = null;
    if (this._method === "INSERT" || this._method === "UPDATE") {
      body = JSON.stringify(this._values);
    } else if (this._method === "RPC") {
      body = JSON.stringify({ [this._rpcFn]: this._rpcParams });
    }

    const pref = (this._method === "INSERT" || this._method === "UPDATE")
      ? "return=representation"
      : "return=minimal";
    headers["Prefer"] = pref;

    const res = await fetch(url.toString(), { method, headers, body });

    if (res.status === 406) return { data: [], error: null };

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { data: null, error: new Error(`${res.status}: ${text.slice(0, 300)}`) };
    }

    const ct = res.headers.get("content-type") ?? "";
    let data;
    if (ct.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => "");
      if (this._single && (!data || data === "")) data = null;
    }

    if (this._single && Array.isArray(data) && data.length > 0) data = data[0];

    return { data, error: null };
  }
}

function createClient(url, key) {
  const baseUrl = url?.replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Supabase URL not configured");

  return {
    url: baseUrl,
    key,
    auth: {
      getClaims: async function (token) {
        if (!token) return { data: null, error: "missing token" };
        const res = await fetch(`${baseUrl}/auth/v1/token?hop=access`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) return { data: null, error: res.statusText };
        try {
          return { data: await res.json(), error: null };
        } catch {
          return { data: null, error: "bad json" };
        }
      },
    },
    from: function (table) {
      if (!table) throw new Error("table name required");
      return new QueryBuilder(baseUrl, key, table);
    },
  };
}

export { createClient };
