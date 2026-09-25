SALES & CASHFLOW DASHBOARD v2.2
================================
AMEX Healthcare GmbH | Business Central 365 Integration
Last Updated: 2026-09-24

OVERVIEW
--------
A browser-based dashboard providing real-time sales and cashflow KPIs
filtered by user or department, pulling live data from Microsoft Business
Central 365 via OData v4 with HTTP Basic Authentication.

CURRENT STATUS: LIVE DATA (v2.1 - 2026-09-24)
-----------------------------------------------
- All mock data removed; all 3 KPI tiles fetch from live BC365 API
- HTTP Basic Auth login banner (username + password, Enter key supported)
- Auth banner hides after successful connection; badge shows "Live - BC365"
- KPI tiles locked (greyed out) until connected; unlock on successful login
- Filter tile: free-text input for User or Department code
- User filter appends AMEX\ prefix automatically if not present
- Dept filter uses Shortcut_Dimension_2_Code (sales) / Global_Dimension_2_Code (ledger)
- $count=true used for server-side total counts; $top=1000 for detail rows
- Detail tables show real BC field names (stripped AMEX\ prefix from user IDs)
- Error messages shown inline if API call fails (CORS note below)
- Shimmer loader on every KPI refresh and detail table load

CORS NOTE
---------
If opening dashboard2.0.html as a local file:// URL, the browser will
block cross-origin requests to bc365.amex-healthcare.com (CORS policy).
To run with live data, open via a local web server:
  - VS Code: right-click dashboard2.0.html -> "Open with Live Server"
  - Command line: python -m http.server 8080 (then open localhost:8080)
The BC365 server may also need CORS headers configured server-side.

FILE STRUCTURE
--------------
working/
  dashboard2.0.html     - Main dashboard (current live version)
  dashboard.html        - Previous version (v1.0, deprecated)
  .env                  - API credentials (DO NOT COMMIT TO GIT)
  API_INTEGRATION.md    - OData endpoint documentation
  readme.txt            - This file

API ENDPOINTS (Business Central OData v4)
------------------------------------------
Base URL:
  https://bc365.amex-healthcare.com:7048/AmexProd/ODataV4/Company(%27AMEX%20Healthcare%20GmbH%27)

Endpoint 1 - Sales_Order_Excel:
  Used for:   Open Sales Orders, Shipped But Not Invoiced
  Auth:       HTTP Basic (Authorization: Basic base64(user:pass))
  Open:       $filter=Completely_Shipped eq false
  Shipped:    $filter=Completely_Shipped eq true
  + User:     and Operation_User_ID_AMX eq 'AMEX\<USERNAME>'
  + Dept:     and Shortcut_Dimension_2_Code eq '<CODE>'
  Options:    $count=true&$top=1000

Endpoint 2 - Customer_Ledger_Entries_Excel:
  Used for:   Overdue Invoices
  Auth:       HTTP Basic (same credentials)
  Filter:     Open eq true and Document_Type eq 'Invoice'
              and Due_Date lt <YYYY-MM-DD> and Remaining_Amount gt 0
  + User:     and User_ID eq 'AMEX\<USERNAME>'
  + Dept:     and Global_Dimension_2_Code eq '<CODE>'
  Options:    $count=true&$top=1000
  Amount:     Remaining_Amount field (EUR, not LCY)

FIELD REFERENCE (confirmed from live API)
------------------------------------------
Sales_Order_Excel:
  No                       - Order number
  Sell_to_Customer_Name    - Customer name
  Document_Date            - Order date
  Requested_Delivery_Date  - Requested delivery (0001-01-01 = not set)
  Shipment_Date            - Actual shipment date
  Status                   - Open / Released
  Completely_Shipped       - Boolean: true = shipped
  Operation_User_ID_AMX    - e.g. AMEX\DMENDEZ
  Shortcut_Dimension_2_Code- Department code e.g. 10, 20

Customer_Ledger_Entries_Excel:
  Document_No              - Invoice number (e.g. INV26-02429)
  Customer_Name            - Customer name
  Due_Date                 - Payment due date
  Remaining_Amount         - Outstanding amount (EUR)
  Original_Amount          - Original invoice amount
  Open                     - Boolean: true = still open
  Document_Type            - Invoice / Credit Memo / Payment
  User_ID                  - e.g. AMEX\NTOMASEVIC
  Salesperson_Code         - e.g. NT, DM, AT
  Global_Dimension_2_Code  - Department code

CREDENTIALS (stored in .env - not committed)
---------------------------------------------
API_USERNAME=Developer
API_BASE_URL=https://bc365.amex-healthcare.com:7048/AmexProd/ODataV4/Company(%27AMEX%20Healthcare%20GmbH%27)

NEXT STEPS (v2.3)
-----------------
[ ] Auto-refresh every 5 minutes when connected
[ ] Export detail table to CSV / Excel
[ ] Populate User/Dept dropdowns dynamically from API
[ ] Add date range filter (This Month / This Quarter)
[ ] Handle OData $skiptoken pagination for result sets > 1000
[ ] Add total EUR amount to Open Orders and Shipped tiles
    (requires Sales Line data or a BC report extension)
[ ] Mobile layout improvements

DEVELOPMENT LOG
---------------
2026-09-24  v2.0  Prototype created. Mock data, full UI, color scheme applied.
                  Tile filtering, detail tables, shimmer loader all working.

2026-09-24  v2.7  Fixed truncated records: full pagination via fetchAllPages().
                  - Root cause: Sales_Lines_Excel has 7,987 lines; BC server caps at 5,000
                    per request with no @odata.nextLink returned automatically
                  - fetchAllPages(baseUrl, pageSize=5000) loops with $skip until a short
                    page is received, collecting all records across multiple requests
                  - Applied to all 5 fetch functions (open orders, shipped, delayed,
                    overdue invoices, lines map) — no record will be silently dropped
                  - For current data: lines require 2 requests (5000 + 2987 = 7987 total)

2026-09-24  v2.6  Flagged and counted incomplete sales order records.
                  - Live data confirmed: 114/578 open orders missing user, 142/578 missing req. date
                  - isIncomplete(), isMissingUser(), isMissingDate() helpers added
                  - Tile warning badge (amber): shows "⚠ X unassigned user · Y no delivery date"
                    visible only when incomplete records exist; hidden when all complete
                  - Table rows: .row-incomplete class = amber left border + pale yellow background
                  - User cell: shows "⚠ Unassigned" in amber when Operation_User_ID_AMX is empty
                  - Delivery date cell: shows "⚠ Not set" in amber when date is 0001-01-01
                  - Delayed Deliveries: only flags missing user (date already filtered by query)

2026-09-24  v2.5  Customer Name filter changed to a dropdown menu.
                  - loadCustomerDropdown() fetches all customers from Sales_Order_Excel
                  - Deduplicates by Sell_to_Customer_No, sorts alphabetically by name
                  - Dropdown shows "Name  (No.)" for easy identification
                  - Result cached in customerListCache for the session
                  - OData contains() filter still applied server-side on selected name

2026-09-24  v2.4  Added Customer No. and Customer Name filter options.
                  - Customer No.: exact match on Sell_to_Customer_No (sales) / Customer_No (ledger)
                  - Customer Name: OData contains() partial match on Sell_to_Customer_Name / Customer_Name
                  - Apostrophes in customer names escaped (' -> '') to prevent OData injection
                  - Filter propagated to buildLinesMap() so amount columns are also scoped correctly

2026-09-24  v2.3  Added Total Amt (LCY) and Uninvoiced columns to Open Sales Orders
                  and Delayed Deliveries detail tables.
                  - New buildLinesMap() fetches Sales_Lines_Excel in parallel with headers
                  - Aggregates Line_Amount (total) per Document_No
                  - Uninvoiced = Line_Amount * (Qty - Qty_Invoiced) / Qty per line
                  - Grand totals shown in detail panel header bar
                  - Lines capped at $top=5000; filter by user/dept propagated to lines

2026-09-24  v2.2  Added 5th tile: Delayed Deliveries.
                  - fetchDelayedOrders() added to Sales_Order_Excel endpoint
                  - Filter: Completely_Shipped eq false AND Requested_Delivery_Date lt <today>
                            AND Requested_Delivery_Date gt 0001-01-01
                  - Detail table: Order No, Customer, Dept, User, Order Date,
                    Requested Delivery (red), Days Overdue (red)
                  - Grid updated to 5 columns; responsive breakpoint at 1100px
                  - All 4 KPI fetches run in parallel via Promise.allSettled

2026-09-24  v2.1  Live API integration complete.
                  - All mock data removed
                  - Basic Auth login banner added
                  - fetchOpenOrders(), fetchShippedNotInvoiced(), fetchOverdueInvoices()
                    all wired to live OData endpoints with correct field names
                  - Filter tile: free-text user/dept input with AMEX\ auto-prefix
                  - Error handling shown inline in detail panel
                  - $count=true for server-side totals
                  - Confirmed working: Customer_Ledger_Entries_Excel (200 OK)
                    and Sales_Order_Excel (200 OK) with Basic Auth
