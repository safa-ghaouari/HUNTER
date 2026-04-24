/* HUNTER API client — plain ES5-compatible JavaScript.
 * Exposes window.API with all backend methods.
 * Loaded before the JSX files so all components can use it.
 */
(function () {
  'use strict';

  var BASE = window.HUNTER_API_BASE || '/api';

  /* ── Token management ─────────────────────────────────────────────────── */
  function getToken()   { return localStorage.getItem('hunter-jwt-token') || ''; }
  function setToken(t)  { localStorage.setItem('hunter-jwt-token', t); }
  function clearToken() { localStorage.removeItem('hunter-jwt-token'); }

  /* ── Restore persisted user on startup ────────────────────────────────── */
  try {
    var stored = localStorage.getItem('hunter-user');
    if (stored) window.__hunterUser = JSON.parse(stored);
  } catch (_) {}

  /* ── Core request helper ──────────────────────────────────────────────── */
  async function req(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var tok = getToken();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;

    var init = { method: method, headers: headers };
    if (body !== undefined && body !== null) init.body = JSON.stringify(body);

    var res = await fetch(BASE + path, init);

    if (res.status === 401) {
      clearToken();
      localStorage.removeItem('hunter-user');
      delete window.__hunterUser;
      window.location.reload();
      throw new Error('Session expired — please log in again.');
    }

    if (res.status === 204) return null;

    var json = null;
    try { json = await res.json(); } catch (_) {}

    if (!res.ok) {
      var detail = json && (json.detail || json.message);
      if (!detail) detail = 'HTTP ' + res.status;
      if (Array.isArray(detail)) {
        detail = detail.map(function (d) { return d.msg || JSON.stringify(d); }).join('; ');
      }
      throw new Error(String(detail));
    }

    return json;
  }

  /* ── Query-string builder ─────────────────────────────────────────────── */
  function qs(params) {
    if (!params) return '';
    var p = new URLSearchParams();
    Object.keys(params).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) p.append(k, params[k]);
    });
    var s = p.toString();
    return s ? '?' + s : '';
  }

  /* ── Auth ─────────────────────────────────────────────────────────────── */
  async function login(email, password) {
    var data = await req('POST', '/auth/login', { email: email, password: password });
    setToken(data.access_token);
    var portal = data.role === 'admin_soc' ? 'admin' : 'client';
    var user = Object.assign({}, data.user, { portal: portal, role: data.role });
    window.__hunterUser = user;
    try { localStorage.setItem('hunter-user', JSON.stringify(user)); } catch (_) {}
    return { portal: portal, user: user };
  }

  function logout() {
    clearToken();
    localStorage.removeItem('hunter-user');
    localStorage.removeItem('hunter-page');
    localStorage.removeItem('hunter-portal');
    delete window.__hunterUser;
  }

  /* ── Clients ──────────────────────────────────────────────────────────── */
  function listClients(p)           { return req('GET',    '/admin/clients' + qs(p)); }
  function createClient(b)          { return req('POST',   '/admin/clients', b); }
  function getClient(id)            { return req('GET',    '/admin/clients/' + id); }
  function updateClient(id, b)      { return req('PATCH',  '/admin/clients/' + id, b); }
  function deleteClient(id)         { return req('DELETE', '/admin/clients/' + id); }
  function testClientConnection(id) { return req('POST',   '/admin/clients/' + id + '/test-connection'); }

  /* ── Sources ──────────────────────────────────────────────────────────── */
  function listSources(p)           { return req('GET',    '/admin/sources' + qs(p)); }
  function createSource(b)          { return req('POST',   '/admin/sources', b); }
  function updateSource(id, b)      { return req('PATCH',  '/admin/sources/' + id, b); }

  /* ── Collections ──────────────────────────────────────────────────────── */
  function listCollections(p)       { return req('GET',    '/admin/collections' + qs(p)); }
  function createCollection(b)      { return req('POST',   '/admin/collections', b); }

  /* ── Hunting jobs ─────────────────────────────────────────────────────── */
  function listJobs(p)              { return req('GET',    '/admin/hunting' + qs(p)); }
  function createJob(b)             { return req('POST',   '/admin/hunting', b); }
  function getJob(id)               { return req('GET',    '/admin/hunting/' + id); }
  function cancelJob(id)            { return req('PATCH',  '/admin/hunting/' + id, { status: 'cancelled' }); }

  /* ── IoCs ─────────────────────────────────────────────────────────────── */
  function listIocs(p)              { return req('GET',    '/admin/iocs' + qs(p)); }
  function getIoc(id)               { return req('GET',    '/admin/iocs/' + id); }
  function enrichIoc(id)            { return req('POST',   '/admin/iocs/' + id + '/enrich'); }

  /* ── Alerts (admin) ───────────────────────────────────────────────────── */
  function listAlerts(p)            { return req('GET',    '/admin/alerts' + qs(p)); }
  function getAlert(id)             { return req('GET',    '/admin/alerts/' + id); }
  function updateAlert(id, b)       { return req('PATCH',  '/admin/alerts/' + id, b); }

  /* ── Reports (admin) ──────────────────────────────────────────────────── */
  function listReports(p)           { return req('GET',    '/admin/reports' + qs(p)); }
  function getReport(id)            { return req('GET',    '/admin/reports/' + id); }
  function getReportDownload(id)    { return req('GET',    '/admin/reports/' + id + '/download'); }

  /* ── Client portal ────────────────────────────────────────────────────── */
  function listClientAlerts(p)         { return req('GET', '/client/alerts' + qs(p)); }
  function getClientAlert(id)          { return req('GET', '/client/alerts/' + id); }
  function listClientReports(p)        { return req('GET', '/client/reports' + qs(p)); }
  function getClientReport(id)         { return req('GET', '/client/reports/' + id); }
  function getClientReportDownload(id) { return req('GET', '/client/reports/' + id + '/download'); }

  /* ── Public surface ───────────────────────────────────────────────────── */
  window.API = {
    getToken: getToken, setToken: setToken, clearToken: clearToken,
    login: login, logout: logout,
    listClients: listClients, createClient: createClient, getClient: getClient,
    updateClient: updateClient, deleteClient: deleteClient,
    testClientConnection: testClientConnection,
    listSources: listSources, createSource: createSource, updateSource: updateSource,
    listCollections: listCollections, createCollection: createCollection,
    listJobs: listJobs, createJob: createJob, getJob: getJob, cancelJob: cancelJob,
    listIocs: listIocs, getIoc: getIoc, enrichIoc: enrichIoc,
    listAlerts: listAlerts, getAlert: getAlert, updateAlert: updateAlert,
    listReports: listReports, getReport: getReport, getReportDownload: getReportDownload,
    listClientAlerts: listClientAlerts, getClientAlert: getClientAlert,
    listClientReports: listClientReports, getClientReport: getClientReport,
    getClientReportDownload: getClientReportDownload,
  };
})();