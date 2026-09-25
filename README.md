# Sales & Cashflow Dashboard v3.0

**AMEX Healthcare GmbH | Business Central 365 Integration**

A real-time sales and cashflow dashboard powered by a Node.js backend that connects to Microsoft Business Central 365 via OData v4. Data is cached server-side and auto-refreshed hourly, providing instant page loads with no browser-side authentication required.

---

## Dashboard Preview

### KPI Tiles
- **Open Sales Orders** - Active orders not yet shipped
- **Delayed Deliveries** - Orders past their requested delivery date
- **Shipped But Not Invoiced** - Shipped orders pending invoice
- **Overdue Invoices** - Open invoices past due date with outstanding amounts

### Key Features
- **Instant loading** - All data pre-cached on the server, no waiting for live API calls
- **Auto-refresh** - Data refreshed from BC365 every hour automatically
- **Manual refresh** - On-demand refresh button in the header
- **Searchable combo filters** - Filter by User, Department, Customer No., Customer Name with type-ahead search
- **Special filters** - Quick filters for Unassigned User and No Delivery Date
- **Modal detail tables** - Click any tile to open a full-screen table with all records
- **Excel-style column filters** - Dropdown filter/sort on every column header
- **Export to Excel** - Download any filtered table as CSV
- **BC365 links** - Click any order/invoice number to open it directly in Business Central
- **Currency support** - Amounts shown in original document currency with currency code column
- **Department names** - Codes mapped to readable names (with merged departments)
- **Frozen headers** - Table headers and toolbar stay pinned while scrolling
- **Incomplete record flagging** - Visual warnings for missing user or delivery date

---

## Architecture

```
Browser (dashboard3.0.html)
    |
    |  GET /            --> Serves the dashboard HTML
    |  GET /api/data    --> Returns all cached BC365 data as JSON
    |  GET /api/status  --> Returns last refresh time + record counts
    |  POST /api/refresh --> Triggers manual data refresh
    |
Node.js Server (server.js, port 3000)
    |
    |  HTTPS + Basic Auth (credentials from .env)
    |
BC365 OData v4 API (bc365.amex-healthcare.com:7048)
```

---

## Quick Start

### Prerequisites
- Node.js 18+ installed
- Access to the AMEX Healthcare BC365 OData API

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/kellydai/Sales-Cashflow-dashboard---AMEX-Hackathon.git
   cd Sales-Cashflow-dashboard---AMEX-Hackathon/working
   ```

2. **Create a `.env` file** in the `working/` folder
   ```env
   API_USERNAME=Developer 
   API_PASSWORD=your_password_here
   API_BASE_URL=https://bc365.amex-healthcare.com:7048/AmexProd/ODataV4/Company('AMEX Healthcare GmbH')
   ```
   > **Note:** The username may have a trailing space - preserve it exactly as required by BC365.

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the server**
   ```bash
   npm start
   ```

5. **Open the dashboard**
   ```
   http://localhost:3000
   ```
   The server fetches all data from BC365 on startup (~10 seconds), then the dashboard loads instantly.

---

## File Structure

```
working/
  server.js             - Node.js backend (Express, data fetching, caching)
  dashboard3.0.html     - Frontend dashboard (served by server.js)
  .env                  - BC365 API credentials (NOT committed)
  package.json          - npm project config and dependencies
  readme2.txt           - Detailed technical documentation
```

---

## API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `Sales_Order_Excel` | Open orders, shipped orders, delayed deliveries |
| `Customer_Ledger_Entries_Excel` | Overdue invoices |
| `Sales_Lines_Excel` | Order line amounts (total & uninvoiced) |
| `Posted_Sales_Shipments` | Shipment document numbers and dates |

All endpoints use OData v4 with HTTP Basic Authentication and server-side pagination (`$top=5000` + `$skip` loop).

---

## Server Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Port | `3000` | Set via `PORT` env variable |
| Refresh interval | 1 hour | Auto-refresh cycle |
| SSL | Accepts self-signed certs | For internal BC365 servers |

Change port: `PORT=8080 node server.js`

---

## Detail Table Columns

### Open Sales Orders
Order No. | Customer | Country | Dept | User | Order Date | Req. Delivery | Status | Days Open | Cur. | Total Amt | Uninvoiced

### Delayed Deliveries
Order No. | Customer | Country | Dept | User | Order Date | Requested Delivery | Days Overdue | Cur. | Total Amt | Uninvoiced

### Shipped But Not Invoiced
Order No. | Customer | Country | Dept | User | Order Date | Posting Date | Days Waiting | Cur. | Total Amt | Uninvoiced

### Overdue Invoices
Invoice No. | Days Overdue | Customer | Due Date | Cur. | Outstanding | AMEX Project No | User | Dept | Country

---

## Tech Stack

- **Frontend:** Single-file HTML/CSS/JS (no frameworks, no build step)
- **Backend:** Node.js + Express
- **Data source:** Microsoft Business Central 365 OData v4
- **Authentication:** HTTP Basic Auth (server-side only)

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.21.0 | HTTP server and routing |
| dotenv | ^16.4.5 | Environment variable loading |

---

## Security Notes

- `.env` file containing credentials is excluded from git via `.gitignore`
- No credentials are exposed to the browser - all BC365 communication is server-side
- SSL certificate validation is disabled for internal self-signed certificates

---

## Team

**AMEX Healthcare GmbH - Hackathon 2026**

Built with the assistance of Claude Code (Anthropic)
