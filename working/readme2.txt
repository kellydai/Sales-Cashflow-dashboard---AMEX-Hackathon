SALES & CASHFLOW DASHBOARD v3.0
================================
AMEX Healthcare GmbH | Business Central 365 Integration
Last Updated: 2026-09-25

OVERVIEW
--------
A Node.js-powered dashboard with a backend cache layer that fetches all data
from Microsoft Business Central 365 once per hour (or on demand), eliminating
the need for browser-side authentication and providing instant page loads.

ARCHITECTURE
------------
  Browser (dashboard3.0.html)
     |
     |  GET /           -> serves the HTML dashboard
     |  GET /api/data   -> returns all cached BC365 data as JSON
     |  GET /api/status -> returns last refresh time + record counts
     |  POST /api/refresh -> triggers a manual data refresh
     |
  Node.js Server (server.js, port 3000)
     |
     |  HTTPS + Basic Auth (credentials from .env)
     |
  BC365 OData v4 API (bc365.amex-healthcare.com:7048)

HOW TO START
------------
  1. Open a terminal in the working/ folder
  2. Run: npm install     (first time only — installs express + dotenv)
  3. Run: npm start        (or: node server.js)
  4. Open http://localhost:3000 in your browser
  5. Dashboard loads instantly with cached data — no login required

The server fetches all data from BC365 on startup (~10 seconds), then
auto-refreshes every hour. Use the "Refresh Now" button in the header
for an on-demand refresh.

FILE STRUCTURE
--------------
working/
  server.js             - Node.js backend (Express, data fetching, caching)
  dashboard3.0.html     - Frontend dashboard (served by server.js)
  .env                  - BC365 API credentials (DO NOT COMMIT TO GIT)
  package.json          - npm project config and dependencies
  node_modules/         - Installed dependencies (auto-generated)
  readme2.txt           - This file

  (Not used by v3.0:)
  dashboard.html        - v1.0 (deprecated)
  dashboard2.0.html     - v2.x (live-fetch version, standalone)
  readme.txt            - v2.x documentation
  API_INTEGRATION.md    - Original API integration guide
  test-connection.html  - Connection test page

DEPENDENCIES
------------
  express  ^4.21.0  - HTTP server and routing
  dotenv   ^16.4.5  - Reads .env file for credentials

CREDENTIALS (.env)
------------------
  API_USERNAME=Developer
  API_PASSWORD=<password>
  API_BASE_URL=https://bc365.amex-healthcare.com:7048/AmexProd/ODataV4/Company(%27AMEX%20Healthcare%20GmbH%27)

  Note: API_USERNAME has a trailing space ("Developer ") which must be
  preserved exactly — BC365 requires it for authentication.

API ENDPOINTS (Business Central OData v4)
------------------------------------------
Base URL (from .env):
  https://bc365.amex-healthcare.com:7048/AmexProd/ODataV4/Company(%27AMEX%20Healthcare%20GmbH%27)

Endpoint 1 — Sales_Order_Excel:
  Used for: Open Sales Orders, Shipped But Not Invoiced, Delayed Deliveries
  Fetched by server.js on each refresh cycle.

  Open Orders:    $filter=Completely_Shipped eq false
  Shipped:        $filter=Completely_Shipped eq true
  Delayed:        $filter=Completely_Shipped eq false
                          and Requested_Delivery_Date lt <today>
                          and Requested_Delivery_Date gt 0001-01-01

Endpoint 2 — Customer_Ledger_Entries_Excel:
  Used for: Overdue Invoices
  Filter: Open eq true and Document_Type eq 'Invoice'
          and Due_Date lt <today> and Remaining_Amount gt 0

Endpoint 3 — Sales_Lines_Excel:
  Used for: Total Amt and Uninvoiced amount per order
  Filter: Document_Type eq 'Order'
  Aggregated into linesMap: { orderNo: { total, uninvoiced } }

Endpoint 4 — Posted_Sales_Shipments:
  Used for: Shipment document numbers and actual ship dates
  Note: Returns HTTP 404 in current BC instance (endpoint not published).
        Shipment data will show when the endpoint is published in BC.

PAGINATION
----------
BC365 caps OData responses at 5,000 rows without returning @odata.nextLink.
The server uses fetchAllPages() which loops with $top=5000 and $skip=N
until a short page is received, collecting all records across requests.
Current data volumes: ~7,900+ sales lines require 2 pages.

FIELD REFERENCE
----------------
Sales_Order_Excel:
  No                        - Order number (linked to BC web client)
  Sell_to_Customer_No       - Customer number
  Sell_to_Customer_Name     - Customer name
  Document_Date             - Order creation date
  Order_Date                - Order date
  Posting_Date              - Posting date
  Requested_Delivery_Date   - Requested delivery (0001-01-01 = not set)
  Status                    - Open / Released
  Completely_Shipped        - Boolean
  Operation_User_ID_AMX     - User ID e.g. AMEX\DMENDEZ
  Shortcut_Dimension_2_Code - Department code e.g. 10, 20
  Destination_Country_AMX   - Country name e.g. Bangladesh, Tanzania
  Currency_Code             - Document currency e.g. USD, GBP (blank = EUR)

Sales_Lines_Excel:
  Document_No               - Parent order number
  Quantity                  - Ordered quantity
  Quantity_Invoiced         - Invoiced quantity
  Line_Amount               - Line amount in document currency

Customer_Ledger_Entries_Excel:
  Document_No               - Invoice number e.g. INV26-02429
  Customer_No               - Customer number
  Customer_Name             - Customer name
  Due_Date                  - Payment due date
  Remaining_Amount          - Outstanding amount in original currency
  Original_Amount           - Original invoice amount
  User_ID                   - User ID e.g. AMEX\NTOMASEVIC
  Global_Dimension_1_Code   - AMEX Project No e.g. 20262372-AT
  Global_Dimension_2_Code   - Department code
  Destination_Country_AMX   - Country name
  Currency_Code             - Document currency (blank = EUR)

DASHBOARD FEATURES
-------------------
5 Tiles:
  1. Filter         - Filter by User, Department, Customer No., Customer Name,
                      Unassigned User, or No Delivery Date
  2. Open Orders    - Sales orders not yet shipped
  3. Delayed        - Orders past requested delivery date
  4. Shipped        - Shipped but not yet invoiced
  5. Overdue        - Open invoices past due date

Detail Tables (modal popup):
  - Click any KPI tile to open a full-screen modal with the detail table
  - All amounts shown in original document currency with Cur. column
  - Order/Invoice numbers are clickable links to BC365 web client
  - Incomplete records (missing user/delivery date) flagged with amber styling
  - Close via X button, clicking backdrop, or pressing Escape

BC Web Client Links:
  Base: https://bc365.amex-healthcare.com/AmexProd/
  Sales Order:     Page 42, filter on No.
  Ledger Entries:  Page 25, filter on Document No.

Excel-Style Column Filters:
  - Each column header has a dropdown button (triangle)
  - Click to open popup with Sort A-Z / Z-A and checkbox filter
  - Search within filter values, Select All / Deselect All
  - Active filters shown with red indicator on the column button
  - Multiple column filters combine (AND logic)

Global Search:
  - Search bar above table filters across all columns
  - Combines with column filters
  - Shows "X of Y shown" count

Export Excel:
  - Green "Export Excel" button exports current view as CSV
  - Respects all active filters (only visible rows exported)
  - UTF-8 BOM for proper Excel encoding
  - File named: <Table Title>_<YYYY-MM-DD>.csv

Frozen Header:
  - Modal toolbar (search + export) is pinned below the red header
  - Column headers are sticky — stay visible while scrolling rows
  - Only the data rows scroll

Client-Side Filtering:
  - All filtering done client-side on cached data (instant)
  - No API calls when switching filters — just array .filter()
  - Supports: User, Department, Customer No., Customer Name,
    Unassigned User, No Delivery Date

TABLE COLUMNS BY TILE
----------------------
Open Sales Orders:
  Order No. | Customer | Country | Dept | User | Order Date |
  Req. Delivery | Status | Days Open | Cur. | Total Amt | Uninvoiced

Delayed Deliveries:
  Order No. | Customer | Country | Dept | User | Order Date |
  Requested Delivery | Days Overdue | Cur. | Total Amt | Uninvoiced

Shipped But Not Invoiced:
  Order No. | Customer | Country | Dept | User | Order Date |
  Posting Date | Days Waiting | Cur. | Total Amt | Uninvoiced

Overdue Invoices:
  Invoice No. | Customer | User | Due Date | Days Overdue |
  Cur. | Outstanding | AMEX Project No | Country

SERVER CONFIGURATION
---------------------
  Port:            3000 (configurable via PORT env variable)
  Refresh interval: 1 hour (60 * 60 * 1000 ms)
  SSL:             Accepts self-signed certificates (rejectUnauthorized: false)
  Startup:         Fetches all data immediately, then starts the hourly timer

  To change the port:
    set PORT=8080 && node server.js        (Windows)
    PORT=8080 node server.js               (Linux/Mac)

SERVER API ENDPOINTS
---------------------
  GET  /              - Serves dashboard3.0.html
  GET  /api/data      - Returns all cached data as JSON
  GET  /api/status    - Returns { lastRefreshed, refreshing, error, counts }
  POST /api/refresh   - Triggers manual refresh (fire-and-forget)

KNOWN ISSUES
-------------
  - Posted_Sales_Shipments returns 404: endpoint not published in BC.
    Shipment numbers and actual ship dates will not appear until the
    BC admin publishes this webservice.
  - Currency_Code blank means EUR (local currency in BC). Displayed as "EUR".
  - Days Waiting (shipped table) falls back to Document_Date when no
    shipment posting date is available.

DEVELOPMENT LOG
----------------
2026-09-25  v3.0  Backend-cached architecture.
                  - Node.js Express server with hourly auto-refresh
                  - All BC365 data fetched server-side and cached in memory
                  - No browser-side authentication required
                  - Instant page loads — all filtering done client-side
                  - Manual refresh button in header
                  - Last refresh timestamp displayed

2026-09-25  v3.0  Feature additions carried from v2.x:
                  - 5 KPI tiles: Filter, Open Orders, Delayed, Shipped, Overdue
                  - Modal popup detail tables (replaced inline panels)
                  - Excel-style column filter/sort dropdowns on every column
                  - Global search bar + Export Excel (CSV with BOM)
                  - Frozen toolbar and sticky column headers in modal
                  - Currency Code column + amounts in original currency
                  - Destination Country column on all tables
                  - BC web client clickable links on order/invoice numbers
                  - Incomplete record flagging (amber styling + warnings)
                  - Customer Name dropdown filter (pre-loaded from cache)
                  - Unassigned User / No Delivery Date filter options
                  - AMEX Project No column on Overdue Invoices
                  - User ID column replaces Salesperson on Overdue Invoices
                  - Full OData pagination (fetchAllPages with $skip loop)
