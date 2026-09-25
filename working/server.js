require('dotenv').config();
const express = require('express');
const path    = require('path');
const https   = require('https');
const app     = express();
const PORT    = process.env.PORT || 3000;

/* ══════════════════════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════════════════════ */
const BC_BASE  = process.env.API_BASE_URL;
const AUTH     = 'Basic ' + Buffer.from(
  process.env.API_USERNAME + ':' + process.env.API_PASSWORD
).toString('base64');

// Allow self-signed / internal certs
const agent = new https.Agent({ rejectUnauthorized: false });

/* ══════════════════════════════════════════════════════════════════
   CACHE
══════════════════════════════════════════════════════════════════ */
let cache = {
  openOrders:         [],
  shippedNotInvoiced: [],
  delayedOrders:      [],
  overdueInvoices:    [],
  linesMap:           {},
  shipmentMap:        {},
  customerList:       [],
  lastRefreshed:      null,
  refreshing:         false,
  error:              null
};

/* ══════════════════════════════════════════════════════════════════
   BC365 OData HELPERS
══════════════════════════════════════════════════════════════════ */
async function fetchOData(url) {
  const resp = await fetch(url, {
    headers: { 'Authorization': AUTH, 'Accept': 'application/json' },
    agent
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error('HTTP ' + resp.status + ': ' + txt.slice(0, 300));
  }
  return resp.json();
}

async function fetchAllPages(baseUrl, pageSize = 5000) {
  const all = [];
  let skip  = 0;
  while (true) {
    const data    = await fetchOData(baseUrl + '&$top=' + pageSize + '&$skip=' + skip);
    const records = data.value || [];
    all.push(...records);
    if (records.length < pageSize) break;
    skip += pageSize;
  }
  return all;
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/* ══════════════════════════════════════════════════════════════════
   DATA FETCHERS
══════════════════════════════════════════════════════════════════ */
async function fetchOpenOrders() {
  const filter = 'Completely_Shipped eq false';
  const select = 'No,Sell_to_Customer_No,Sell_to_Customer_Name,Document_Date,Requested_Delivery_Date,Status,Completely_Shipped,Operation_User_ID_AMX,Shortcut_Dimension_2_Code,Destination_Country_AMX,Currency_Code';
  const url = BC_BASE + '/Sales_Order_Excel?$filter=' + encodeURIComponent(filter) + '&$select=' + select;
  return fetchAllPages(url);
}

async function fetchShippedNotInvoiced() {
  const filter = 'Completely_Shipped eq true';
  const select = 'No,Sell_to_Customer_No,Sell_to_Customer_Name,Order_Date,Document_Date,Posting_Date,Operation_User_ID_AMX,Shortcut_Dimension_2_Code,Destination_Country_AMX,Currency_Code';
  const url = BC_BASE + '/Sales_Order_Excel?$filter=' + encodeURIComponent(filter) + '&$select=' + select;
  return fetchAllPages(url);
}

async function fetchDelayedOrders() {
  const today  = todayISO();
  const filter = 'Completely_Shipped eq false and Requested_Delivery_Date lt ' + today + ' and Requested_Delivery_Date gt 0001-01-01';
  const select = 'No,Sell_to_Customer_No,Sell_to_Customer_Name,Document_Date,Requested_Delivery_Date,Status,Operation_User_ID_AMX,Shortcut_Dimension_2_Code,Destination_Country_AMX,Currency_Code';
  const url = BC_BASE + '/Sales_Order_Excel?$filter=' + encodeURIComponent(filter) + '&$select=' + select;
  return fetchAllPages(url);
}

async function fetchOverdueInvoices() {
  const today  = todayISO();
  const filter = "Open eq true and Document_Type eq 'Invoice' and Due_Date lt " + today + " and Remaining_Amount gt 0";
  const select = 'Document_No,Customer_No,Customer_Name,Due_Date,Remaining_Amount,Original_Amount,User_ID,Global_Dimension_1_Code,Global_Dimension_2_Code,Salesperson_Code,Destination_Country_AMX,Currency_Code';
  const url = BC_BASE + '/Customer_Ledger_Entries_Excel?$filter=' + encodeURIComponent(filter) + '&$select=' + select;
  return fetchAllPages(url);
}

async function fetchSalesLines() {
  const filter = "Document_Type eq 'Order'";
  const select = 'Document_No,Quantity,Quantity_Invoiced,Line_Amount';
  const url = BC_BASE + '/Sales_Lines_Excel?$filter=' + encodeURIComponent(filter) + '&$select=' + select;
  return fetchAllPages(url);
}

function buildLinesMap(lines) {
  const map = {};
  for (const line of lines) {
    if (!map[line.Document_No]) map[line.Document_No] = { total: 0, uninvoiced: 0 };
    const amt    = line.Line_Amount       || 0;
    const qty    = line.Quantity          || 0;
    const qtyInv = line.Quantity_Invoiced || 0;
    map[line.Document_No].total += amt;
    map[line.Document_No].uninvoiced += qty > 0 ? amt * (qty - qtyInv) / qty : amt;
  }
  return map;
}

async function fetchShipmentMap(orderNos) {
  if (!orderNos.length) return {};
  const map   = {};
  const BATCH = 40;
  const batches = [];
  for (let i = 0; i < orderNos.length; i += BATCH) {
    batches.push(orderNos.slice(i, i + BATCH));
  }
  try {
    await Promise.all(batches.map(async batch => {
      const f   = batch.map(n => `Order_No eq '${n.replace(/'/g, "''")}'`).join(' or ');
      const url = BC_BASE + '/Posted_Sales_Shipments?$filter=' + encodeURIComponent(f)
        + '&$select=No,Order_No,Posting_Date&$top=5000';
      const data = await fetchOData(url);
      for (const sh of (data.value || [])) {
        if (!map[sh.Order_No]) map[sh.Order_No] = { nos: [], latestDate: null };
        map[sh.Order_No].nos.push(sh.No);
        if (sh.Posting_Date && !sh.Posting_Date.startsWith('0001')) {
          if (!map[sh.Order_No].latestDate || sh.Posting_Date > map[sh.Order_No].latestDate) {
            map[sh.Order_No].latestDate = sh.Posting_Date;
          }
        }
      }
    }));
  } catch (e) {
    console.warn('Posted_Sales_Shipments fetch failed:', e.message);
  }
  return map;
}

function buildCustomerList(orders) {
  const map = {};
  for (const r of orders) {
    if (r.Sell_to_Customer_No && r.Sell_to_Customer_Name) {
      map[r.Sell_to_Customer_No] = r.Sell_to_Customer_Name;
    }
  }
  return Object.entries(map)
    .map(([no, name]) => ({ no, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ══════════════════════════════════════════════════════════════════
   REFRESH CACHE
══════════════════════════════════════════════════════════════════ */
async function refreshCache() {
  if (cache.refreshing) {
    console.log('Refresh already in progress, skipping.');
    return;
  }
  cache.refreshing = true;
  cache.error      = null;
  const start = Date.now();
  console.log('[' + new Date().toISOString() + '] Refreshing data from BC365…');

  try {
    // Fetch main datasets in parallel
    const [openOrders, shippedNotInvoiced, delayedOrders, overdueInvoices, salesLines] =
      await Promise.all([
        fetchOpenOrders(),
        fetchShippedNotInvoiced(),
        fetchDelayedOrders(),
        fetchOverdueInvoices(),
        fetchSalesLines()
      ]);

    // Build lines map
    const linesMap = buildLinesMap(salesLines);

    // Build shipment map from all order numbers (open + shipped)
    const allOrderNos = [
      ...openOrders.map(r => r.No),
      ...shippedNotInvoiced.map(r => r.No)
    ];
    const uniqueNos   = [...new Set(allOrderNos)];
    const shipmentMap  = await fetchShipmentMap(uniqueNos);

    // Customer list
    const customerList = buildCustomerList([...openOrders, ...shippedNotInvoiced]);

    // Update cache
    cache.openOrders         = openOrders;
    cache.shippedNotInvoiced = shippedNotInvoiced;
    cache.delayedOrders      = delayedOrders;
    cache.overdueInvoices    = overdueInvoices;
    cache.linesMap           = linesMap;
    cache.shipmentMap        = shipmentMap;
    cache.customerList       = customerList;
    cache.lastRefreshed      = new Date().toISOString();

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[${cache.lastRefreshed}] Refresh complete in ${elapsed}s — ` +
      `${openOrders.length} open, ${shippedNotInvoiced.length} shipped, ` +
      `${delayedOrders.length} delayed, ${overdueInvoices.length} overdue, ` +
      `${salesLines.length} lines, ${Object.keys(shipmentMap).length} shipments, ` +
      `${customerList.length} customers`
    );
  } catch (e) {
    cache.error = e.message;
    console.error('[' + new Date().toISOString() + '] Refresh FAILED:', e.message);
  }

  cache.refreshing = false;
}

/* ══════════════════════════════════════════════════════════════════
   EXPRESS ROUTES
══════════════════════════════════════════════════════════════════ */
app.use(express.json());

// Serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard3.0.html'));
});

// Cached data
app.get('/api/data', (req, res) => {
  res.json({
    openOrders:         cache.openOrders,
    shippedNotInvoiced: cache.shippedNotInvoiced,
    delayedOrders:      cache.delayedOrders,
    overdueInvoices:    cache.overdueInvoices,
    linesMap:           cache.linesMap,
    shipmentMap:        cache.shipmentMap,
    customerList:       cache.customerList,
    lastRefreshed:      cache.lastRefreshed
  });
});

// Status
app.get('/api/status', (req, res) => {
  res.json({
    lastRefreshed: cache.lastRefreshed,
    refreshing:    cache.refreshing,
    error:         cache.error,
    counts: {
      openOrders:         cache.openOrders.length,
      shippedNotInvoiced: cache.shippedNotInvoiced.length,
      delayedOrders:      cache.delayedOrders.length,
      overdueInvoices:    cache.overdueInvoices.length,
      customers:          cache.customerList.length
    }
  });
});

// Manual refresh
app.post('/api/refresh', (req, res) => {
  if (cache.refreshing) {
    return res.json({ ok: false, message: 'Refresh already in progress' });
  }
  refreshCache(); // fire and forget
  res.json({ ok: true, message: 'Refresh started' });
});

/* ══════════════════════════════════════════════════════════════════
   START
══════════════════════════════════════════════════════════════════ */
app.listen(PORT, async () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
  console.log('Fetching initial data from BC365…');
  await refreshCache();
  // Auto-refresh every hour
  setInterval(refreshCache, 60 * 60 * 1000);
});
